import { parseCotizacionPdf } from './pdfParser';
import { parseCotizacionExcel } from './excelParser';

export interface FacturaParseResult {
  numeroFactura: string | null;
  montoFactura: number | null;
  glosaEncontrada: string | null;
  textoExtraido: string;
}

/**
 * Parsea un archivo de factura (PDF, Excel, XML, etc.) y extrae
 * automáticamente el N° de Factura, el monto a pagar y la glosa.
 */
export async function parseFactura(file: File): Promise<FacturaParseResult> {
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
    console.warn('Error leyendo archivo de factura:', e);
  }

  const numeroFactura = extraerNumeroFactura(text, file.name);
  const montoFactura = extraerMontoFactura(text);
  const glosaEncontrada = extraerGlosa(text);

  return {
    numeroFactura,
    montoFactura,
    glosaEncontrada,
    textoExtraido: text,
  };
}

function extraerNumeroFactura(text: string, fileName: string): string | null {
  const cleanText = text.replace(/\s+/g, ' ');

  const patronesFactura = [
    /(?:Factura|FAC|Fct|F\/?A|N[°ºo]|Nro|Num|N°|#)\s*(?:Electrónica|Exenta|Afecta)?\s*(?:N[°ºo]|Nro|Num|N°|#)?\s*[:.]?\s*([A-Z0-9\-_]{3,20})/i,
    /\b(FAC[-_]?\d{3,10})\b/i,
    /\bF[-_](\d{3,10})\b/i,
  ];

  for (const regex of patronesFactura) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      const cand = match[1].trim().toUpperCase();
      if (cand.length >= 3 && !cand.includes('RUT') && !cand.includes('FECHA') && !cand.includes('PAGO')) {
        return cand.startsWith('FAC') || cand.startsWith('F-') ? cand : `FAC-${cand}`;
      }
    }
  }

  const matchFile = fileName.match(/(?:Factura|FAC)[-_]?(\d{3,10})/i);
  if (matchFile && matchFile[1]) {
    return `FAC-${matchFile[1]}`;
  }

  return null;
}

function extraerMontoFactura(text: string): number | null {
  const cleanText = text.replace(/\s+/g, ' ');

  const patronesMonto = [
    /(?:Total|Total\s*a\s*Pagar|Monto\s*Total|Valor\s*Total|Total\s*Factura)\s*[:.]?\s*\$?\s*([\d.]{4,14})/i,
    /\$\s*([\d.]{5,14})/,
  ];

  for (const regex of patronesMonto) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      const numStr = match[1].replace(/\./g, '').replace(/,/g, '');
      const val = parseInt(numStr, 10);
      if (!isNaN(val) && val > 1000) {
        return val;
      }
    }
  }

  return null;
}

function extraerGlosa(text: string): string | null {
  const cleanText = text.replace(/\s+/g, ' ');
  const match = cleanText.match(/(?:Glosa|Detalle|Descripción|Concepto)\s*[:.]?\s*([^.\n]{10,120})/i);
  return match ? match[1].trim() : null;
}
