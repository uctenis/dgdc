import { desformatearNumero, sinTildes } from './rutUtils';
import type { ItemPresupuestoImportado } from './excelParser';

// ─── PRESUPUESTO ESTIMATIVO EN PDF — reconstrucción de la tabla desde el texto posicionado ────
// Un PDF no tiene celdas: hay que reconstruir la tabla a partir de la POSICIÓN (x, y) de cada
// fragmento de texto. Este módulo no depende de pdf.js (recibe los fragmentos ya extraídos), para
// poder probarlo con archivos reales fuera del navegador.
//
// Hay dos lectores y se usa el que reconoce más partidas:
//  · por COLUMNAS: ubica las columnas por los títulos del encabezado (formato del sistema).
//  · por CONTENIDO: reconoce cada fila porque termina en unidad, cantidad, precio unitario y total
//    que calzan entre sí. Sirve para presupuestos armados fuera del sistema (ej. con otra IA), que
//    cambian los títulos ("Un.", "Cant.", "Ítem / descripción") o alinean los números a la derecha.

export interface TextoPosicionado { str: string; x: number; y: number; }

export interface PresupuestoLeido {
  items: ItemPresupuestoImportado[];
  gastosGeneralesDetectados?: number;
  utilidadDetectada?: number;
  totalConIvaDetectado?: number;
  /** Filas con cantidad, precio y total que no traían la descripción en la misma línea: no se importan. */
  filasSinDescripcion?: number;
}

/** Agrupa fragmentos de texto en líneas visuales (misma altura ~y), de arriba hacia abajo; dentro
 * de cada línea, de izquierda a derecha. Así se puede volver a leer la página como filas de tabla. */
function agruparEnLineas(items: TextoPosicionado[], tolerancia = 2.5): TextoPosicionado[][] {
  const ordenados = [...items].sort((a, b) => b.y - a.y); // el eje Y del PDF crece hacia arriba
  const lineas: { y: number; items: TextoPosicionado[] }[] = [];
  for (const it of ordenados) {
    const linea = lineas.find(l => Math.abs(l.y - it.y) <= tolerancia);
    if (linea) linea.items.push(it);
    else lineas.push({ y: it.y, items: [it] });
  }
  return lineas.map(l => l.items.sort((a, b) => a.x - b.x));
}

// ─── Números y montos ─────────────────────────────────────────────────────────────────────────

const RE_NUMERO = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$|^\d+(?:[.,]\d+)?$/;

/** Número en formato chileno (1.444,85); un punto que no separa miles se toma como decimal (0.60). */
function numeroCL(texto: string): number {
  const limpio = texto.replace(/^\$/, '');
  if (!RE_NUMERO.test(limpio)) return NaN;
  if (/^\d+\.\d+$/.test(limpio) && !/^\d{1,3}(?:\.\d{3})+$/.test(limpio)) return Number(limpio);
  return Number(limpio.replace(/\./g, '').replace(',', '.'));
}

/** Palabras de la línea, con el signo peso pegado a su número ("$ 850.000" -> "$850.000"). */
function palabrasDeLinea(textoLinea: string): string[] {
  const palabras: string[] = [];
  for (const p of textoLinea.split(/\s+/).filter(Boolean)) {
    if (palabras[palabras.length - 1] === '$') palabras[palabras.length - 1] = `$${p}`;
    else palabras.push(p);
  }
  return palabras;
}

/** Monto con que termina una línea de resumen ("Gastos generales · 10% del costo directo $3.625.640"). */
function montoFinalDeLinea(textoLinea: string): number | undefined {
  const ultima = palabrasDeLinea(textoLinea).pop() || '';
  const monto = numeroCL(ultima);
  // Sin signo peso se exige un monto de al menos cuatro cifras, para no tomar un "10%" o un número de página.
  if (Number.isNaN(monto) || monto <= 0 || (!ultima.startsWith('$') && monto < 1000)) return undefined;
  return monto;
}

// ─── Lector por COLUMNAS (formato del sistema) ────────────────────────────────────────────────

type NombreColumna = 'item' | 'partida' | 'descripcion' | 'unidad' | 'cantidad' | 'unitario' | 'subtotal';

/** Ubica, en la línea de encabezado, la columna X de cada título conocido (Ítem, Partida,
 * Descripción, Unidad, Cantidad, P. Unitario, Subtotal/Total) y arma un clasificador que, dado un
 * X cualquiera, dice a qué columna pertenece (por cercanía al título más próximo por la izquierda). */
function detectarBandasColumnas(lineaEncabezado: TextoPosicionado[]): ((x: number) => NombreColumna) | null {
  const buscar = (pred: (t: string) => boolean) => lineaEncabezado.find(it => pred(sinTildes(it.str)));
  const anclas: { nombre: NombreColumna; x: number }[] = [];
  const agregar = (nombre: NombreColumna, item?: TextoPosicionado) => { if (item) anclas.push({ nombre, x: item.x }); };

  agregar('item', buscar(t => t.includes('item')));
  agregar('partida', buscar(t => t.includes('partida')));
  agregar('descripcion', buscar(t => t.includes('descrip')));
  agregar('unidad', buscar(t => t.includes('unidad')));
  agregar('cantidad', buscar(t => t.includes('cantidad')));
  agregar('unitario', buscar(t => t.includes('unitario')));
  agregar('subtotal', buscar(t => t.includes('subtotal') || t === 'total'));

  const requeridas: NombreColumna[] = ['item', 'descripcion', 'cantidad', 'unitario'];
  if (!requeridas.every(r => anclas.some(a => a.nombre === r))) return null;

  const ordenadas = anclas.sort((a, b) => a.x - b.x);
  const limites = ordenadas.map((a, i) => (i === 0 ? -Infinity : (ordenadas[i - 1].x + a.x) / 2));
  return (x: number) => {
    let idx = 0;
    for (let i = 0; i < limites.length; i++) if (x >= limites[i]) idx = i;
    return ordenadas[idx].nombre;
  };
}

const numeroDeTexto = (str: string): number => desformatearNumero(str.replace(/^\$\s*/, ''));

/** Partida "en construcción" mientras se van absorbiendo sus posibles líneas de descripción
 * envueltas, hasta que aparece el siguiente código de ítem, sección o fila de resumen. */
interface ItemAbierto {
  item: string;
  descripcionPartes: string[];
  unidad?: string;
  cantidad?: number;
  precioUnitario?: number;
  fase?: string;
}

const RE_CODIGO_ITEM = /^\d+(?:\.\d+)+$/;
const RE_TITULO_SECCION = /^\d+[.)]\s*([A-Za-zÀ-ÿÑñ].*)$/;

function leerPorColumnas(paginas: TextoPosicionado[][]): PresupuestoLeido {
  const items: ItemPresupuestoImportado[] = [];
  let gastosGeneralesDetectados: number | undefined;
  let utilidadDetectada: number | undefined;
  let totalConIvaDetectado: number | undefined;

  let itemAbierto: ItemAbierto | null = null;
  const cerrarItemAbierto = () => {
    if (!itemAbierto) return;
    const descripcion = itemAbierto.descripcionPartes.join(' ').replace(/\s+/g, ' ').trim();
    if (descripcion && (itemAbierto.cantidad || 0) > 0 && (itemAbierto.precioUnitario || 0) > 0) {
      items.push({
        item: itemAbierto.item,
        descripcion,
        unidad: itemAbierto.unidad || 'un',
        cantidad: itemAbierto.cantidad!,
        precioUnitario: itemAbierto.precioUnitario!,
        fase: itemAbierto.fase,
      });
    }
    itemAbierto = null;
  };

  let bandaDe: ((x: number) => NombreColumna) | null = null;
  let faseActual: string | undefined;

  for (const pagina of paginas) {
    for (const linea of agruparEnLineas(pagina)) {
      const textoLinea = linea.map(it => it.str).join(' ').trim();
      const textoPlano = sinTildes(textoLinea);

      // El encabezado puede repetirse en cada página (o venir solo en la primera).
      if (textoPlano.includes('item')) {
        const posibleBanda = detectarBandasColumnas(linea);
        if (posibleBanda) { bandaDe = posibleBanda; continue; }
      }
      if (!bandaDe) continue; // aún no se encuentra el encabezado: no hay cómo ubicar columnas

      // Clasifica cada fragmento de la línea según la columna en la que cae su X.
      const porColumna = new Map<NombreColumna, TextoPosicionado[]>();
      for (const frag of linea) {
        const col = bandaDe(frag.x);
        if (!porColumna.has(col)) porColumna.set(col, []);
        porColumna.get(col)!.push(frag);
      }
      const textoItemCol = (porColumna.get('item') || []).map(f => f.str).join(' ').trim();

      if (RE_CODIGO_ITEM.test(textoItemCol)) {
        cerrarItemAbierto();
        const desc = (porColumna.get('descripcion') || []).map(f => f.str).join(' ').trim();
        const cantidadTxt = (porColumna.get('cantidad') || [])[0]?.str;
        const unitarioTxt = (porColumna.get('unitario') || [])[0]?.str;
        itemAbierto = {
          item: textoItemCol,
          descripcionPartes: desc ? [desc] : [],
          unidad: (porColumna.get('unidad') || [])[0]?.str,
          cantidad: cantidadTxt ? numeroDeTexto(cantidadTxt) || undefined : undefined,
          precioUnitario: unitarioTxt ? numeroDeTexto(unitarioTxt) || undefined : undefined,
          fase: faseActual,
        };
        continue;
      }

      const tituloSeccion = RE_TITULO_SECCION.exec(textoItemCol);
      if (tituloSeccion) {
        cerrarItemAbierto();
        faseActual = tituloSeccion[1].trim();
        continue;
      }

      if (textoPlano.startsWith('subtotal')) {
        cerrarItemAbierto();
        continue;
      }

      if (textoPlano.includes('gastos general')) {
        cerrarItemAbierto();
        gastosGeneralesDetectados = montoFinalDeLinea(textoLinea) || gastosGeneralesDetectados;
        continue;
      }
      if (/(^|\s)utilidad(\s|$)/.test(textoPlano)) {
        cerrarItemAbierto();
        utilidadDetectada = montoFinalDeLinea(textoLinea) || utilidadDetectada;
        continue;
      }
      if (textoPlano.includes('total con iva')) {
        cerrarItemAbierto();
        totalConIvaDetectado = montoFinalDeLinea(textoLinea) || totalConIvaDetectado;
        continue;
      }
      if (textoPlano.includes('costo directo') || /^iva\b/.test(textoPlano) || textoPlano.includes('total neto') || textoPlano.includes('costo referencial')) {
        cerrarItemAbierto();
        continue;
      }

      // Cualquier otra línea sin código de ítem: si hay una partida en construcción, es la
      // continuación (envuelta) de su descripción; si no, se ignora (títulos, notas, pie de página).
      if (itemAbierto) {
        const desc = (porColumna.get('descripcion') || []).map(f => f.str).join(' ').trim();
        if (desc) itemAbierto.descripcionPartes.push(desc);
        if (!itemAbierto.unidad) itemAbierto.unidad = (porColumna.get('unidad') || [])[0]?.str;
        if (!itemAbierto.cantidad) {
          const t = (porColumna.get('cantidad') || [])[0]?.str;
          if (t) itemAbierto.cantidad = numeroDeTexto(t) || undefined;
        }
        if (!itemAbierto.precioUnitario) {
          const t = (porColumna.get('unitario') || [])[0]?.str;
          if (t) itemAbierto.precioUnitario = numeroDeTexto(t) || undefined;
        }
      }
    }
  }
  cerrarItemAbierto();

  return { items, gastosGeneralesDetectados, utilidadDetectada, totalConIvaDetectado };
}

// ─── Lector por CONTENIDO (presupuestos armados fuera del sistema) ────────────────────────────

interface FilaPartida {
  item?: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
}

const RE_UNIDAD = /^[A-Za-zÀ-ÿ²³º°/%]{1,8}[23]?\.?$/;
const RE_CODIGO_FILA = /^\d{1,3}(?:\.\d{1,3})*\.?$/;

/**
 * Reconoce una fila de partida por cómo termina: … unidad, cantidad, precio unitario, total. Se acepta solo
 * si cantidad × precio unitario calza con el total, que es lo que distingue una partida de cualquier otra
 * línea con números (notas, cubicaciones, resúmenes).
 */
function leerFilaPartida(textoLinea: string): FilaPartida | 'sin-descripcion' | null {
  const palabras = palabrasDeLinea(textoLinea);
  if (palabras.length < 4) return null;

  const [unidadTxt, cantidadTxt, unitarioTxt, totalTxt] = palabras.slice(-4);
  const total = numeroCL(totalTxt);
  const precioUnitario = numeroCL(unitarioTxt);
  // Una cantidad provisional viene marcada con asterisco ("60*").
  const cantidad = numeroCL(cantidadTxt.replace(/\*+$/, ''));
  if ([total, precioUnitario, cantidad].some(Number.isNaN) || cantidad <= 0) return null;
  if (!RE_UNIDAD.test(unidadTxt) || RE_NUMERO.test(unidadTxt)) return null;
  if (Math.abs(cantidad * precioUnitario - total) > Math.max(2, total * 0.01)) return null;
  // Una partida a costo cero (ej. equipo aportado por el mandante) solo se acepta si viene con signo peso.
  if (total === 0 && !totalTxt.startsWith('$')) return null;

  const resto = palabras.slice(0, -4);
  const conCodigo = resto.length > 1 && RE_CODIGO_FILA.test(resto[0]);
  const descripcion = (conCodigo ? resto.slice(1) : resto).join(' ').trim();
  // Sin texto en la línea (solo el número del ítem): la descripción viene en otros renglones y no se puede atribuir.
  if (!/\p{L}{3}/u.test(descripcion)) return 'sin-descripcion';

  return {
    item: conCodigo ? resto[0].replace(/\.$/, '') : undefined,
    descripcion,
    unidad: unidadTxt.replace(/\.$/, ''),
    cantidad,
    precioUnitario,
  };
}

const esEncabezadoDeTabla = (textoPlano: string) =>
  (textoPlano.includes('unitario') || textoPlano.includes('p. unit')) && textoPlano.includes('cant');

// Líneas que cierran la partida en curso y nunca son la continuación de su descripción.
const RE_LINEA_DE_CIERRE = /^(subtotal|costo directo|gastos general|utilidad|iva\b|total|presupuesto neto|reserva|monto|resumen|fondo|disponibilidad|nota)/;

// Separación máxima (en puntos) entre una fila y el renglón siguiente de su descripción.
const SALTO_MAXIMO_RENGLON = 20;
const DESVIO_MAXIMO_SANGRIA = 12;

function leerPorContenido(paginas: TextoPosicionado[][]): PresupuestoLeido {
  const items: ItemPresupuestoImportado[] = [];
  const sinCodigo = new Set<ItemPresupuestoImportado>();
  const codigosVistos = new Set<string>();
  let filasSinDescripcion = 0;
  let gastosGeneralesDetectados: number | undefined;
  let utilidadDetectada: number | undefined;
  let totalConIvaDetectado: number | undefined;
  let faseActual: string | undefined;

  for (const pagina of paginas) {
    // Partida cuya descripción puede seguir en los renglones de abajo: dónde empieza su texto y a qué altura va.
    let abierta: { partida: ItemPresupuestoImportado; sangrias: number[]; y: number } | null = null;

    for (const linea of agruparEnLineas(pagina)) {
      const textoLinea = linea.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
      const textoPlano = sinTildes(textoLinea);
      const y = linea[0].y;

      if (esEncabezadoDeTabla(textoPlano)) { abierta = null; continue; }

      const fila = leerFilaPartida(textoLinea);
      if (fila === 'sin-descripcion') { abierta = null; filasSinDescripcion++; continue; }
      if (fila) {
        abierta = null;
        // Un informe puede repetir la tabla (ej. resumen y detalle): la misma partida se toma una sola vez.
        if (fila.item && codigosVistos.has(fila.item)) continue;
        if (fila.item) codigosVistos.add(fila.item);
        const partida: ItemPresupuestoImportado = {
          item: fila.item || String(items.length + 1),
          descripcion: fila.descripcion,
          unidad: fila.unidad,
          cantidad: fila.cantidad,
          precioUnitario: fila.precioUnitario,
          fase: faseActual,
        };
        items.push(partida);
        if (!fila.item) sinCodigo.add(partida);
        // El código puede venir en un fragmento aparte o pegado a la descripción: el renglón siguiente
        // puede partir alineado con cualquiera de los dos.
        abierta = { partida, sangrias: linea.slice(0, 2).map(f => f.x), y };
        continue;
      }

      if (RE_LINEA_DE_CIERRE.test(textoPlano)) {
        abierta = null;
        const monto = montoFinalDeLinea(textoLinea);
        if (monto) {
          if (textoPlano.startsWith('gastos general')) gastosGeneralesDetectados ??= monto;
          else if (textoPlano.startsWith('utilidad')) utilidadDetectada ??= monto;
          else if (textoPlano.startsWith('total') && !textoPlano.includes('neto') && !textoPlano.includes('sin iva')) totalConIvaDetectado ??= monto;
        }
        continue;
      }

      const tituloSeccion = RE_TITULO_SECCION.exec(textoLinea);
      if (tituloSeccion && textoLinea.length <= 90 && !montoFinalDeLinea(textoLinea)) {
        abierta = null;
        // "1. Presupuesto por partidas" o "2. Resumen" titulan el documento, no un capítulo de la obra.
        if (!/presupuesto|resumen/.test(textoPlano)) faseActual = tituloSeccion[1].trim();
        continue;
      }

      // Un renglón con un monto es una nota de precios, no la continuación de la descripción.
      if (abierta
        && !/\$\s?\d/.test(textoLinea)
        && abierta.y - y <= SALTO_MAXIMO_RENGLON
        && abierta.sangrias.some(x => Math.abs(x - linea[0].x) <= DESVIO_MAXIMO_SANGRIA)) {
        abierta.partida.descripcion = `${abierta.partida.descripcion} ${textoLinea}`;
        abierta.y = y;
      } else {
        abierta = null;
      }
    }
  }

  // Si el presupuesto numera sus partidas, las filas sin número son de otras tablas del documento (análisis de
  // precios unitarios, comparaciones de alternativas) y no forman parte del itemizado.
  const numeradas = items.filter(it => !sinCodigo.has(it));
  const partidas = numeradas.length >= 3 && numeradas.length >= sinCodigo.size / 2 ? numeradas : items;

  return { items: partidas, gastosGeneralesDetectados, utilidadDetectada, totalConIvaDetectado, filasSinDescripcion };
}

/** Lee el presupuesto con los dos lectores y se queda con el que reconoce más partidas. */
export function presupuestoDesdePaginas(paginas: TextoPosicionado[][]): PresupuestoLeido {
  const porColumnas = leerPorColumnas(paginas);
  const porContenido = leerPorContenido(paginas);
  const [elegido, otro] = porContenido.items.length > porColumnas.items.length ? [porContenido, porColumnas] : [porColumnas, porContenido];
  return {
    items: elegido.items,
    gastosGeneralesDetectados: elegido.gastosGeneralesDetectados ?? otro.gastosGeneralesDetectados,
    utilidadDetectada: elegido.utilidadDetectada ?? otro.utilidadDetectada,
    totalConIvaDetectado: elegido.totalConIvaDetectado ?? otro.totalConIvaDetectado,
    filasSinDescripcion: porContenido.filasSinDescripcion,
  };
}
