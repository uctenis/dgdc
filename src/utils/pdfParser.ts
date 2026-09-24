import * as pdfjsLib from 'pdfjs-dist';
import { formatearRUT, validarRUT, desformatearNumero, sinTildes } from './rutUtils';
import type { ItemCotizacion } from '../types';
import type { ItemPresupuestoImportado, ParsedPresupuestoImportado } from './excelParser';

// Worker local: evita que la lectura quede esperando una descarga externa.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

export interface ParsedPdfData {
  montoNeto?: number;
  montoIva?: number;
  montoTotal?: number;
  plazoDias?: number;
  rutProveedor?: string;
  razonSocialProveedor?: string;
  fechaCotizacion?: string;
  itemizado?: ItemCotizacion[];
  textoExtraido?: string;
  detallesLeidos: string[];
}

const numeroDocumento = (valor: string): number => {
  const limpio = valor.trim().replace(/\s/g, '');
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(limpio)) {
    return Number(limpio.replace(/[.,]/g, ''));
  }
  return Number(limpio.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
};

export function extraerItemizadoDesdeTexto(texto: string): ItemCotizacion[] {
  const textoLimpio = texto.replace(/\s+/g, ' ').trim();
  const patron = /(?:^|\s)(\d{1,3})\s+(.+?)\s+(m2|m²|ml|m3|m³|un|und|gl|kg|lt|hr|d[ií]a)\s+([\d.,]+)\s+([\d.,]+)\s*\$\s+([\d.,]+)\s*\$/giu;
  const items: ItemCotizacion[] = [];
  let match: RegExpExecArray | null;

  while ((match = patron.exec(textoLimpio)) !== null) {
    const cantidad = numeroDocumento(match[4]);
    const precioUnitario = numeroDocumento(match[5]);
    const precioTotal = numeroDocumento(match[6]);
    if (!cantidad || !precioUnitario || !precioTotal) continue;
    items.push({
      id: `item-${match[1]}-${items.length + 1}`,
      item: match[1],
      descripcion: match[2].replace(/\s+/g, ' ').trim(),
      unidad: match[3],
      cantidad,
      precioUnitario,
      precioTotal,
    });
  }

  return items;
}

/**
 * Extrae texto y valores clave (RUT, Monto Neto y Plazo) de un archivo PDF de cotización sin confundir RUTs con montos.
 */
export async function parseCotizacionPdf(file: File): Promise<ParsedPdfData> {
  const detallesLeidos: string[] = [];
  let montoNeto: number | undefined = undefined;
  let plazoDias: number | undefined = undefined;
  let rutProveedor: string | undefined = undefined;
  let razonSocialProveedor: string | undefined = undefined;
  let fechaCotizacion: string | undefined = undefined;
  let montoIva: number | undefined = undefined;
  let montoTotal: number | undefined = undefined;

  let fullText = '';

  // 1. Extracción de texto del PDF
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += ' ' + pageText;
    }
  } catch (err) {
    console.warn('PDF.js fallback a decodificación directa de texto:', err);
  }

  // Fallback para PDFs sin capa de texto estructurada
  if (!fullText || fullText.trim().length < 20) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const textDecoder = new TextDecoder('latin1');
      const binText = textDecoder.decode(arrayBuffer);
      const cleanMatches = binText.match(/[A-Za-z0-9\.\,\$\-\:\;\ \n\r\t]{3,}/g);
      if (cleanMatches) {
        fullText = cleanMatches.join(' ');
      }
    } catch (binErr) {
      console.error('Error al decodificar flujo binario PDF:', binErr);
    }
  }

  const cleanText = fullText.replace(/\s+/g, ' ');

  const itemizado = extraerItemizadoDesdeTexto(cleanText);
  if (itemizado.length > 0) {
    detallesLeidos.push(`${itemizado.length} partidas del itemizado detectadas.`);
  }

  const fechaMatch = cleanText.match(/(?:fecha\s*)?(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
  if (fechaMatch) {
    const [dia, mes, anio] = fechaMatch[1].split(/[/-]/);
    fechaCotizacion = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    detallesLeidos.push(`Fecha de cotización detectada: ${fechaMatch[1]}`);
  }

  const razonPatterns = [
    /\b([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.&-]{3,}?(?:LTDA\.?|SPA|S\.A\.?|EIRL))\b/g,
    /(?:raz[oó]n\s+social|empresa|proveedor)\s*[:;-]?\s*([^\n]{3,80})/i,
  ];
  for (const patron of razonPatterns) {
    const coincidencias = [...cleanText.matchAll(patron)];
    const candidata = coincidencias.at(-1)?.[1]?.replace(/\s+/g, ' ').trim();
    if (candidata) {
      razonSocialProveedor = candidata;
      detallesLeidos.push(`Razón social detectada: ${candidata}`);
      break;
    }
  }

  // 2. Extracción y Registro de Todos los RUTs del Documento
  // Guardamos los cuerpos numéricos de los RUTs para NUNCA confundirlos con montos dinero.
  const rutBodiesSet = new Set<number>();

  const rutPatterns = [
    /rut\s*[:;$]?\s*([\d\.\-kK]{7,12})/gi,
    /\b(\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[\-\s]?[0-9kK])\b/gi,
  ];

  for (const regex of rutPatterns) {
    let match;
    while ((match = regex.exec(cleanText)) !== null) {
      const rawCandidate = match[1] || match[0];
      const formatted = formatearRUT(rawCandidate);
      if (formatted) {
        const bodyDigits = Number(formatted.split('-')[0].replace(/[^0-9]/g, ''));
        if (bodyDigits > 0) {
          rutBodiesSet.add(bodyDigits);
        }
        if (!rutProveedor && validarRUT(formatted).esValido) {
          rutProveedor = formatted;
          detallesLeidos.push(`RUT de Proveedor identificado en PDF: ${formatted}`);
        }
      }
    }
  }

  // 3. Extracción Discrecional de Monto Monetario (EVITANDO CONFLICTO CON RUTs)
  const montosConEtiquetaNeto: number[] = [];
  const montosConEtiquetaTotal: number[] = [];
  const montosConSimboloPesos: number[] = [];

  // 3.1. Buscar patrones explícitos de NETO (ej: "Neto: $15.000.000", "Subtotal: 15000000")
  const regexNeto = /(?:neto|subtotal|monto\s+neto|valor\s+neto)\s*[:;$]?\s*\$?\s*([\d\.\,]{5,15})/gi;
  let mNeto;
  while ((mNeto = regexNeto.exec(cleanText)) !== null) {
    const cleanNum = Number(mNeto[1].replace(/[^0-9]/g, ''));
    if (cleanNum >= 100000 && !rutBodiesSet.has(cleanNum)) {
      montosConEtiquetaNeto.push(cleanNum);
    }
  }

  // 3.2. Buscar patrones explícitos de TOTAL (ej: "Total: $17.850.000", "Monto Total: 17850000")
  const regexTotal = /(?:total|monto\s+total|valor\s+total|presupuesto\s+total)\s*[:;$]?\s*\$?\s*([\d\.\,]{5,15})/gi;
  let mTotal;
  while ((mTotal = regexTotal.exec(cleanText)) !== null) {
    const cleanNum = Number(mTotal[1].replace(/[^0-9]/g, ''));
    if (cleanNum >= 100000 && !rutBodiesSet.has(cleanNum)) {
      montosConEtiquetaTotal.push(cleanNum);
    }
  }

  // 3.3. Buscar valores precedidos por el signo $ (ej: "$ 15.000.000")
  const regexPesos = /\$\s*([\d\.]{5,12})/g;
  let mPesos;
  while ((mPesos = regexPesos.exec(cleanText)) !== null) {
    const cleanNum = Number(mPesos[1].replace(/[^0-9]/g, ''));
    if (cleanNum >= 100000 && !rutBodiesSet.has(cleanNum)) {
      montosConSimboloPesos.push(cleanNum);
    }
  }

  // Decisión Final del Monto Neto:
  if (itemizado.length > 0) {
    montoNeto = itemizado.reduce((total, item) => total + item.precioTotal, 0);
    montoIva = Math.round(montoNeto * 0.19);
    montoTotal = montoNeto + montoIva;
    detallesLeidos.push(`Monto Neto calculado desde el itemizado: $${montoNeto.toLocaleString('es-CL')}`);
  } else if (montosConEtiquetaNeto.length > 0) {
    montoNeto = Math.max(...montosConEtiquetaNeto);
    detallesLeidos.push(`Monto Neto (etiqueta directa) detectado en PDF: $${montoNeto.toLocaleString('es-CL')}`);
  } else if (montosConEtiquetaTotal.length > 0) {
    const totalConIva = Math.max(...montosConEtiquetaTotal);
    montoNeto = Math.round(totalConIva / 1.19);
    detallesLeidos.push(`Monto Total detectado ($${totalConIva.toLocaleString('es-CL')}) → Calculado Neto: $${montoNeto.toLocaleString('es-CL')}`);
  } else if (montosConSimboloPesos.length > 0) {
    montoNeto = Math.max(...montosConSimboloPesos);
    detallesLeidos.push(`Monto detectado con signo $: $${montoNeto.toLocaleString('es-CL')}`);
  }

  if (montoNeto && !montoIva) {
    montoIva = Math.round(montoNeto * 0.19);
    montoTotal = montoNeto + montoIva;
  }

  // 4. Extracción de Plazo de Ejecución
  const plazoPatterns = [
    /(?:plazo|duraci[oó]n|ejecuci[oó]n|tiempo)\s*(?:de\s*ejecuci[oó]n)?\s*[:;$]?\s*(\d{1,3})\s*(?:d[ií]as|semanas)/gi,
    /(\d{1,3})\s*d[ií]as\s*(?:corridos|h[aá]biles)?/gi
  ];

  for (const regex of plazoPatterns) {
    const match = regex.exec(cleanText);
    if (match) {
      let dias = Number(match[1]);
      if (cleanText.toLowerCase().includes('semana') && dias < 50) dias = dias * 7;
      if (dias > 0 && dias <= 365) {
        plazoDias = dias;
        detallesLeidos.push(`Plazo de ejecución detectado en PDF: ${dias} días corridos`);
        break;
      }
    }
  }

  if (!rutProveedor && !montoNeto && !plazoDias) {
    detallesLeidos.push('Documento PDF procesado correctamente.');
  }

  return {
    montoNeto,
    montoIva,
    montoTotal,
    plazoDias,
    rutProveedor,
    razonSocialProveedor,
    fechaCotizacion,
    itemizado,
    textoExtraido: cleanText,
    detallesLeidos,
  };
}

// ─── PRESUPUESTO ESTIMATIVO (ItemizadoProyectoPanel) — PDF externo cargado como referencia ────
// Un PDF no tiene celdas: hay que reconstruir la tabla a partir de la POSICIÓN (x, y) de cada
// fragmento de texto — agrupar por línea visual, ubicar las columnas por los títulos del
// encabezado, y unir las líneas de una descripción que se corta en dos renglones dentro de la
// misma partida. Por eso es menos confiable que el Excel (celdas reales): si el PDF viene de una
// imagen escaneada (sin capa de texto) no hay nada que leer, y hay que revisar el resultado antes
// de aceptarlo — a diferencia de la carga desde Excel, esta NO se agrega sola al itemizado.

interface TextoPosicionado { str: string; x: number; y: number; }

async function extraerTextoPosicionadoPorPagina(file: File): Promise<TextoPosicionado[][]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const paginas: TextoPosicionado[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    paginas.push(
      textContent.items
        .map((it: any) => ({ str: String(it.str ?? '').trim(), x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0 }))
        .filter(it => it.str.length > 0)
    );
  }
  return paginas;
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

/**
 * Lee un PDF con el formato del "Presupuesto Estimativo" del sistema (Ítem, [Partida],
 * Descripción, Unidad, Cantidad, P. Unitario, Subtotal — en secciones numeradas con subtotal
 * por sección y un resumen final). Es la versión en PDF de `parsePresupuestoExcel`: mismo
 * resultado, para dejar como referencia un presupuesto armado fuera del sistema (ej. con otra IA)
 * cuando solo se cuenta con el PDF y no con el Excel original.
 */
export async function parsePresupuestoPdf(file: File): Promise<ParsedPresupuestoImportado> {
  const items: ItemPresupuestoImportado[] = [];
  const advertencias: string[] = [];
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

  try {
    const paginas = await extraerTextoPosicionadoPorPagina(file);
    let bandaDe: ((x: number) => NombreColumna) | null = null;
    let faseActual: string | undefined;

    for (const pagina of paginas) {
      const lineas = agruparEnLineas(pagina);

      for (const linea of lineas) {
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
          gastosGeneralesDetectados = numeroDeTexto(textoLinea.replace(/gastos generales?/i, '')) || gastosGeneralesDetectados;
          continue;
        }
        if (/(^|\s)utilidad(\s|$)/.test(textoPlano)) {
          cerrarItemAbierto();
          utilidadDetectada = numeroDeTexto(textoLinea.replace(/utilidad/i, '')) || utilidadDetectada;
          continue;
        }
        if (textoPlano.includes('total con iva')) {
          cerrarItemAbierto();
          totalConIvaDetectado = numeroDeTexto(textoLinea.replace(/total con iva/i, '')) || totalConIvaDetectado;
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
  } catch (err) {
    console.error('Error al procesar PDF de presupuesto:', err);
    advertencias.push('No se pudo leer el archivo PDF. Verifique que no sea una imagen escaneada (sin texto seleccionable) — en ese caso, use el Excel original o ingrese las partidas a mano.');
  }

  if (items.length === 0 && advertencias.length === 0) {
    advertencias.push('No se reconoció el formato de tabla del Presupuesto Estimativo en este PDF (o no tiene texto seleccionable). Pruebe subiendo el Excel original, o ingrese las partidas a mano.');
  }
  if (gastosGeneralesDetectados || utilidadDetectada) {
    const partes = [
      gastosGeneralesDetectados ? `Gastos Generales (${gastosGeneralesDetectados.toLocaleString('es-CL')})` : null,
      utilidadDetectada ? `Utilidad (${utilidadDetectada.toLocaleString('es-CL')})` : null,
    ].filter(Boolean).join(' y ');
    advertencias.push(`El PDF incluye ${partes} en su resumen final — no se importan como partidas (no tienen unidad/cantidad propias), así que el total que calcule el sistema a partir de las partidas quedará más bajo que el "Total con IVA" del documento original. Agréguelos como una partida manual si quiere que queden incluidos.`);
  }
  if (items.length > 0) {
    advertencias.unshift('La lectura desde PDF es menos exacta que desde Excel (no hay celdas, se reconstruye por posición del texto) — revise cada partida antes de guardar.');
  }

  return { items, gastosGeneralesDetectados, utilidadDetectada, totalConIvaDetectado, advertencias };
}
