import * as XLSX from 'xlsx';
import { formatearRUT, validarRUT, desformatearNumero, sinTildes } from './rutUtils';
import type { ItemCotizacion } from '../types';

export interface ParsedCotizacionData {
  montoNeto?: number;
  montoIva?: number;
  montoTotal?: number;
  plazoDias?: number;
  rutProveedor?: string;
  razonSocialProveedor?: string;
  observaciones?: string;
  fechaCotizacion?: string;
  itemizado?: ItemCotizacion[];
  textoExtraido?: string;
  detallesLeidos: string[];
}

/**
 * Lee y extrae datos de planillas Excel sin confundir el RUT del proveedor con los montos de la oferta.
 */
export async function parseCotizacionExcel(file: File): Promise<ParsedCotizacionData> {
  const detallesLeidos: string[] = [];
  let montoNeto: number | undefined = undefined;
  let plazoDias: number | undefined = undefined;
  let rutProveedor: string | undefined = undefined;
  let razonSocialProveedor: string | undefined = undefined;
  let fechaCotizacion: string | undefined = undefined;
  const itemizado: ItemCotizacion[] = [];
  let textoExtraido = '';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    textoExtraido = workbook.SheetNames
      .map(nombre => XLSX.utils.sheet_to_csv(workbook.Sheets[nombre]))
      .join('\n');

    const rutBodiesSet = new Set<number>();

    // PASO 1: Recorrer el documento para extraer y registrar TODOS los RUTs primero
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const headerIndex = rows.findIndex(row => {
        const joined = (row || []).map(v => String(v).toLowerCase()).join(' ');
        return joined.includes('item') && joined.includes('descrip') && joined.includes('cantidad') && joined.includes('precio');
      });
      if (headerIndex >= 0) {
        const headers = rows[headerIndex].map(v => String(v).toLowerCase().trim());
        const idxItem = headers.findIndex(h => h.includes('item'));
        const idxDesc = headers.findIndex(h => h.includes('descrip'));
        const idxUnidad = headers.findIndex(h => h === 'un' || h.includes('unidad'));
        const idxCantidad = headers.findIndex(h => h.includes('cantidad'));
        const idxUnitario = headers.findIndex(h => h.includes('unitario'));
        const idxTotal = headers.findIndex(h => h === 'total' || h.includes('precio total'));

        for (const row of rows.slice(headerIndex + 1)) {
          const item = String(row?.[idxItem] ?? '').trim();
          const descripcion = String(row?.[idxDesc] ?? '').trim();
          const cantidad = Number(row?.[idxCantidad]) || 0;
          const precioUnitario = Number(row?.[idxUnitario]) || 0;
          const precioTotal = Number(row?.[idxTotal]) || cantidad * precioUnitario;
          if (!item || !descripcion || !cantidad || !precioUnitario) continue;
          itemizado.push({
            id: `item-${item}-${itemizado.length + 1}`,
            item,
            descripcion,
            unidad: String(row?.[idxUnidad] ?? 'Un').trim(),
            cantidad,
            precioUnitario,
            precioTotal,
          });
        }
      }

      for (const row of rows) {
        if (!row || !Array.isArray(row)) continue;
        for (const val of row) {
          if (val === undefined || val === null) continue;
          const strVal = String(val).trim();
          const rutMatches = strVal.match(/\b(\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[\-\s]?[0-9kK])\b/g);
          if (rutMatches) {
            for (const rMatch of rutMatches) {
              const formattedRUT = formatearRUT(rMatch);
              if (formattedRUT) {
                const bodyDigits = Number(formattedRUT.split('-')[0].replace(/[^0-9]/g, ''));
                if (bodyDigits > 0) rutBodiesSet.add(bodyDigits);
                if (!rutProveedor && validarRUT(formattedRUT).esValido) {
                  rutProveedor = formattedRUT;
                  detallesLeidos.push(`RUT de Proveedor detectado en Excel: ${formattedRUT}`);
                }
              }
            }
          }
        }
      }
    }

    // PASO 2: Extraer Montos y Plazos excluyendo deliberadamente cualquier número que coincida con los RUTs
    const montosNetosCandidatos: number[] = [];
    const montosTotalesCandidatos: number[] = [];
    const montosGeneralesCandidatos: number[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;

        for (let c = 0; c < row.length; c++) {
          const val = row[c];
          if (val === undefined || val === null) continue;

          const strVal = String(val).trim();
          const textVal = strVal.toLowerCase();

          if (!fechaCotizacion && textVal.includes('fecha')) {
            const nextVal = row[c + 1];
            if (nextVal && /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(String(nextVal))) {
              const [dia, mes, anioRaw] = String(nextVal).split(/[/-]/);
              const anio = anioRaw.length === 2 ? `20${anioRaw}` : anioRaw;
              fechaCotizacion = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            }
          }

          // Detección de Razón Social
          if (!razonSocialProveedor && (textVal.includes('razon social') || textVal.includes('razón social') || textVal.includes('empresa') || textVal.includes('proveedor'))) {
            const nextVal = row[c + 1] || row[c + 2];
            if (nextVal && String(nextVal).trim().length > 3) {
              razonSocialProveedor = String(nextVal).trim();
              detallesLeidos.push(`Razón Social detectada: ${razonSocialProveedor}`);
            }
          }

          // Detección explícita de NETO
          if (textVal.includes('neto') || textVal.includes('subtotal')) {
            for (let offset = 1; offset <= 4; offset++) {
              const nextVal = row[c + offset];
              const numVal = typeof nextVal === 'number' ? nextVal : Number(String(nextVal || '').replace(/[^0-9]/g, ''));
              if (numVal >= 100000 && !rutBodiesSet.has(numVal)) {
                montosNetosCandidatos.push(numVal);
                break;
              }
            }
          }

          // Detección explícita de TOTAL
          if (textVal.includes('total') || textVal.includes('monto') || textVal.includes('oferta') || textVal.includes('precio')) {
            for (let offset = 1; offset <= 4; offset++) {
              const nextVal = row[c + offset];
              const numVal = typeof nextVal === 'number' ? nextVal : Number(String(nextVal || '').replace(/[^0-9]/g, ''));
              if (numVal >= 100000 && !rutBodiesSet.has(numVal)) {
                montosTotalesCandidatos.push(numVal);
                break;
              }
            }
          }

          // Detección de Plazo (días)
          if (!plazoDias && (textVal.includes('plazo') || textVal.includes('dias') || textVal.includes('días') || textVal.includes('duracion') || textVal.includes('ejecucion'))) {
            for (let offset = 1; offset <= 3; offset++) {
              const nextVal = row[c + offset];
              const numVal = typeof nextVal === 'number' ? nextVal : Number(String(nextVal || '').replace(/[^0-9]/g, ''));
              if (numVal > 0 && numVal <= 365) {
                plazoDias = numVal;
                detallesLeidos.push(`Plazo de ejecución detectado en Excel: ${numVal} días`);
                break;
              }
            }
          }

          // Si es un número bruto grande y no es un RUT registrado
          if (typeof val === 'number' && val >= 100000 && val <= 500000000 && !rutBodiesSet.has(val)) {
            montosGeneralesCandidatos.push(val);
          }
        }
      }
    }

    // Selección Final del Monto Neto
    if (montosNetosCandidatos.length > 0) {
      montoNeto = Math.max(...montosNetosCandidatos);
      detallesLeidos.push(`Monto Neto detectado en Excel: $${montoNeto.toLocaleString('es-CL')}`);
    } else if (montosTotalesCandidatos.length > 0) {
      const maxTotal = Math.max(...montosTotalesCandidatos);
      montoNeto = maxTotal;
      detallesLeidos.push(`Monto Oferta detectado en Excel: $${montoNeto.toLocaleString('es-CL')}`);
    } else if (montosGeneralesCandidatos.length > 0) {
      montoNeto = Math.max(...montosGeneralesCandidatos);
      detallesLeidos.push(`Monto detectado desde la planilla: $${montoNeto.toLocaleString('es-CL')}`);
    }

    if (itemizado.length > 0) {
      montoNeto = itemizado.reduce((total, item) => total + item.precioTotal, 0);
      detallesLeidos.push(`${itemizado.length} partidas del itemizado detectadas en Excel.`);
    }

  } catch (err) {
    console.error('Error al procesar planilla Excel:', err);
  }

  return {
    montoNeto,
    montoIva: montoNeto ? Math.round(montoNeto * 0.19) : undefined,
    montoTotal: montoNeto ? montoNeto + Math.round(montoNeto * 0.19) : undefined,
    plazoDias,
    rutProveedor,
    razonSocialProveedor,
    fechaCotizacion,
    itemizado,
    textoExtraido,
    detallesLeidos,
  };
}

// ─── PRESUPUESTO ESTIMATIVO (ItemizadoProyectoPanel) — Excel externo cargado como referencia ──

/** Una partida leída de la planilla, lista para que la pantalla le asigne id/origen y la agregue. */
export interface ItemPresupuestoImportado {
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  fase?: string;
}

export interface ParsedPresupuestoImportado {
  items: ItemPresupuestoImportado[];
  /** "Gastos generales" del resumen final, si la planilla los trae como línea aparte (no se
   * importan como partida — no tienen unidad/cantidad — pero se avisan para no perderlos de vista). */
  gastosGeneralesDetectados?: number;
  /** "Utilidad" del resumen final, con la misma lógica que gastos generales. */
  utilidadDetectada?: number;
  /** "TOTAL CON IVA" que trae la propia planilla, para comparar contra lo que el sistema recalcule. */
  totalConIvaDetectado?: number;
  advertencias: string[];
}

/** Texto de la primera celda no vacía de una fila (ignorando columnas posteriores). */
const primerTexto = (row: (string | number)[]): string => {
  for (const val of row) {
    const texto = String(val ?? '').trim();
    if (texto) return texto;
  }
  return '';
};

/** Primer número > 0 que aparezca en cualquier celda de la fila (para leer el monto de una fila
 * de resumen como "Gastos generales" o "TOTAL CON IVA", sin depender de en qué columna cayó). */
const primerMontoDeFila = (row: (string | number)[]): number => {
  for (const val of row) {
    const n = typeof val === 'number' ? val : desformatearNumero(val as string);
    if (n > 0) return n;
  }
  return 0;
};

/**
 * Lee una planilla Excel con el formato del "Presupuesto Estimativo" del sistema (Ítem, [Partida],
 * Descripción, Unidad, Cantidad, P. Unitario, Subtotal — organizado en secciones numeradas con fila
 * de subtotal, y un resumen final de Gastos Generales/Utilidad/IVA/Total). Sirve para dejar como
 * referencia un presupuesto ya armado fuera del sistema (ej. por otra IA, o por un tercero), en vez
 * de volver a tipear cada partida a mano.
 *
 * Solo importa las partidas reales (con Descripción, Cantidad y P. Unitario); las filas de sección,
 * "Subtotal ..." y el resumen final (Costo Directo, Gastos Generales, Utilidad, IVA, Total) NO se
 * importan como partidas — el sistema recalcula sus propios subtotales e IVA a partir de las
 * partidas. Gastos Generales y Utilidad, si la planilla los trae, se devuelven aparte para avisar
 * que no quedaron incluidos (no son partidas con unidad/cantidad propias).
 */
export async function parsePresupuestoExcel(file: File): Promise<ParsedPresupuestoImportado> {
  const items: ItemPresupuestoImportado[] = [];
  const advertencias: string[] = [];
  let gastosGeneralesDetectados: number | undefined;
  let utilidadDetectada: number | undefined;
  let totalConIvaDetectado: number | undefined;

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const headerIndex = rows.findIndex(row => {
      const joined = sinTildes((row || []).map(v => String(v)).join(' '));
      return joined.includes('item') && joined.includes('descrip') && joined.includes('cantidad') && joined.includes('unitario');
    });
    if (headerIndex < 0) continue; // esta hoja no tiene el formato esperado — se prueba con la siguiente

    const headers = rows[headerIndex].map(v => sinTildes(String(v)));
    const idxItem = headers.findIndex(h => h.includes('item'));
    const idxDesc = headers.findIndex(h => h.includes('descrip'));
    const idxUnidad = headers.findIndex(h => h === 'un' || h.includes('unidad'));
    const idxCantidad = headers.findIndex(h => h.includes('cantidad'));
    const idxUnitario = headers.findIndex(h => h.includes('unitario'));

    let faseActual: string | undefined;
    const partidasIncompletas: string[] = [];

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      const descripcion = String(row[idxDesc] ?? '').trim();

      // Sin descripción real = no es una partida: puede ser encabezado de sección, "Subtotal ..."
      // o una línea del resumen final (Costo Directo, Gastos Generales, Utilidad, IVA, Total...).
      if (!descripcion) {
        const texto = primerTexto(row);
        const textoPlano = sinTildes(texto);
        if (!texto || textoPlano.startsWith('subtotal')) continue; // fila vacía o subtotal de sección: se ignora

        const tituloSeccion = texto.match(/^\d+[.)]\s*(.+)/); // ej: "3. ESTRUCTURA METALCON" -> "ESTRUCTURA METALCON"
        if (tituloSeccion) {
          faseActual = tituloSeccion[1].trim();
          continue;
        }

        if (textoPlano.includes('gastos general')) {
          gastosGeneralesDetectados = primerMontoDeFila(row);
        } else if (/(^|\s)utilidad(\s|$)/.test(textoPlano)) {
          utilidadDetectada = primerMontoDeFila(row);
        } else if (textoPlano.includes('total con iva')) {
          totalConIvaDetectado = primerMontoDeFila(row);
        }
        continue;
      }

      const cantidad = typeof row[idxCantidad] === 'number' ? row[idxCantidad] as number : desformatearNumero(row[idxCantidad] as string);
      const precioUnitario = typeof row[idxUnitario] === 'number' ? row[idxUnitario] as number : desformatearNumero(row[idxUnitario] as string);
      if (!(cantidad > 0) || !(precioUnitario > 0)) {
        // La partida existe (tiene descripción) pero le falta Cantidad o P. Unitario: puede estar
        // vacía en el archivo (ej. pensada para completarse con una fórmula que nunca se escribió)
        // o ser una fórmula que el archivo guardó sin calcular — la librería que lee el Excel no
        // evalúa fórmulas, solo el valor que ya haya quedado guardado.
        partidasIncompletas.push(`${String(row[idxItem] ?? '').trim() || '(sin código)'} — ${descripcion}`);
        continue;
      }

      items.push({
        item: String(row[idxItem] ?? items.length + 1).trim(),
        descripcion,
        unidad: String(row[idxUnidad] ?? 'un').trim() || 'un',
        cantidad,
        precioUnitario,
        fase: faseActual,
      });
    }

    if (partidasIncompletas.length > 0) {
      advertencias.push(
        `${partidasIncompletas.length} partida(s) no se importaron porque en el archivo les falta la Cantidad o el Precio Unitario (vacía, o una fórmula que el archivo guardó sin calcular): ${partidasIncompletas.join('; ')}. Complete esos valores en el archivo (a mano, o dejando que la planilla recalcule y guardando de nuevo con Ctrl+S) y vuelva a subirlo — o cargue el PDF si ya tiene esos valores calculados.`
      );
    }
    if (items.length > 0) break; // ya se encontró y leyó una hoja válida
  }

  if (items.length === 0) {
    advertencias.push('No se encontraron partidas reconocibles en el archivo. Verifique que tenga columnas de Ítem, Descripción, Unidad, Cantidad y Precio Unitario.');
  }
  if (gastosGeneralesDetectados || utilidadDetectada) {
    const partes = [
      gastosGeneralesDetectados ? `Gastos Generales (${gastosGeneralesDetectados.toLocaleString('es-CL')})` : null,
      utilidadDetectada ? `Utilidad (${utilidadDetectada.toLocaleString('es-CL')})` : null,
    ].filter(Boolean).join(' y ');
    advertencias.push(`La planilla incluye ${partes} en su resumen final — no se importan como partidas (no tienen unidad/cantidad propias), así que el total que calcule el sistema a partir de las partidas quedará más bajo que el "Total con IVA" de la planilla original. Agréguelos como una partida manual si quiere que queden incluidos.`);
  }

  return { items, gastosGeneralesDetectados, utilidadDetectada, totalConIvaDetectado, advertencias };
}
