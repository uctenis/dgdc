import { parseCotizacionPdf } from './pdfParser';
import { parseCotizacionExcel } from './excelParser';

export interface OCParseResult {
  numeroOC: string | null;
  numeroOT: string | null;
  numeroOP: string | null;
  textoExtraido: string;
}

/**
 * Lee un archivo de Orden de Compra (PDF o Excel) y extrae automáticamente
 * el número de OC.
 */
export async function parseOrdenDeCompra(file: File): Promise<OCParseResult> {
  let text = file.name;
  const extension = file.name.split('.').pop()?.toLowerCase();

  try {
    if (extension === 'pdf') {
      const pdfRes = await parseCotizacionPdf(file);
      text += ' ' + (pdfRes.textoExtraido || pdfRes.detallesLeidos.join(' '));
    } else if (['xlsx', 'xls', 'csv'].includes(extension || '')) {
      const excelRes = await parseCotizacionExcel(file);
      text += ' ' + (excelRes.textoExtraido || excelRes.detallesLeidos.join(' '));
    } else {
      text += ' ' + (await file.text());
    }
  } catch (e) {
    console.warn('Error leyendo archivo de OC:', e);
  }

  const numeroOC = extraerNumeroOC(text, file.name);
  const numeroOT = extraerNumeroDocumento(text, 'OT', ['Orden de Trabajo', 'Orden Trabajo']);
  const numeroOP = extraerNumeroDocumento(text, 'OP', ['Orden de Pedido', 'Orden Pedido']);

  return {
    numeroOC,
    numeroOT,
    numeroOP,
    textoExtraido: text,
  };
}

function extraerNumeroDocumento(text: string, prefijo: 'OT' | 'OP', etiquetas: string[]): string | null {
  const cleanText = text.replace(/\s+/g, ' ');
  const etiqueta = etiquetas.map(valor => valor.replace(/\s+/g, '\\s*')).join('|');
  const patrones = [
    new RegExp(`(?:${etiqueta})\\s*(?:N[°ºo]|Nro|Num|N°|#|Código)?\\s*[:.]?\\s*(${prefijo}[-_\\s]?[A-Z0-9][A-Z0-9._/-]{1,24}|[A-Z0-9][A-Z0-9._/-]{2,24})`, 'i'),
    new RegExp(`\\b(${prefijo}[-_\\s]?[A-Z0-9][A-Z0-9._/-]{2,24})\\b`, 'i'),
  ];

  for (const patron of patrones) {
    const candidato = cleanText.match(patron)?.[1]?.trim().replace(/\s+/g, '-').toUpperCase();
    if (!candidato) continue;
    return candidato.startsWith(prefijo) ? candidato : `${prefijo}-${candidato}`;
  }
  return null;
}

/**
 * Expresiones regulares para detectar el número de Orden de Compra.
 */
function extraerNumeroOC(text: string, fileName: string): string | null {
  const cleanText = text.replace(/\s+/g, ' ');

  // 1. Patrones explícitos en el contenido del documento
  const patronesOC = [
    /(?:Orden\s*de\s*Compra|Orden\s*Compra)\s*(?:N[°ºo]|Nro|Num|N°|#)?\s*[:.]?\s*([A-Z0-9\-_]{4,25})/i,
    /(?:O\.?C\.?|OC)\s*(?:N[°ºo]|Nro|Num|N°|#)?\s*[:.]?\s*([A-Z0-9\-_]{4,25})/i,
    /(?:Purchase\s*Order|P\.?O\.?)\s*(?:N[°ºo]|Nro|Num|N°|#)?\s*[:.]?\s*([A-Z0-9\-_]{4,25})/i,
    /\b(45\d{8,10})\b/, // Patrón estándar SAP UCT / MercadoPúblico: 4500XXXXXX
    /\b(OC[-_]\d{4}[-_]\d{3,6})\b/i, // Patrón OC-2026-XXXX
  ];

  for (const regex of patronesOC) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      const candidato = match[1].trim().toUpperCase();
      // Descartar palabras comunes o RUTs
      if (candidato.length >= 3 && !candidato.includes('RUT') && !candidato.includes('FECHA')) {
        return candidato.startsWith('OC') ? candidato : `OC-${candidato}`;
      }
    }
  }

  // 2. Fallback: buscar patrones en el nombre del archivo (ej: OC_4500128.pdf)
  const matchFile = fileName.match(/(?:OC|Orden)[-_]?(\d{4,12})/i);
  if (matchFile && matchFile[1]) {
    return `OC-${matchFile[1]}`;
  }

  // 3. Fallback genérico: Si hay un número correlativo largo
  const matchNum = cleanText.match(/\b(\d{7,10})\b/);
  if (matchNum) {
    return `OC-${matchNum[1]}`;
  }

  return null;
}
