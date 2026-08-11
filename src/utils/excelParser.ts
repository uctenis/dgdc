import * as XLSX from 'xlsx';
import { formatearRUT, validarRUT } from './rutUtils';
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
