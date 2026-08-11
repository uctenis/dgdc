import * as pdfjsLib from 'pdfjs-dist';
import { formatearRUT, validarRUT } from './rutUtils';

// Configurar worker dinámico de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export interface ParsedPdfData {
  montoNeto?: number;
  plazoDias?: number;
  rutProveedor?: string;
  razonSocialProveedor?: string;
  detallesLeidos: string[];
}

/**
 * Extrae texto y valores clave (RUT, Monto Neto y Plazo) de un archivo PDF de cotización sin confundir RUTs con montos.
 */
export async function parseCotizacionPdf(file: File): Promise<ParsedPdfData> {
  const detallesLeidos: string[] = [];
  let montoNeto: number | undefined = undefined;
  let plazoDias: number | undefined = undefined;
  let rutProveedor: string | undefined = undefined;

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
  if (montosConEtiquetaNeto.length > 0) {
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
    plazoDias,
    rutProveedor,
    detallesLeidos,
  };
}
