import * as pdfjsLib from 'pdfjs-dist';
import { formatearRUT, validarRUT } from './rutUtils';
import type { ItemCotizacion } from '../types';

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
