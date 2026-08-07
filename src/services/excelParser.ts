import * as XLSX from 'xlsx';
import type { Cotizacion, ItemCotizacion } from '../types';

export interface ParseResult {
  exito: boolean;
  cotizacionParcial?: Partial<Cotizacion>;
  items?: ItemCotizacion[];
  mensaje?: string;
}

export async function parsearCotizacionExcel(file: File, licitacionId: string): Promise<ParseResult> {
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });

    // Tomar la primera hoja
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convertir hoja a matriz de celdas
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    let proveedorRut = '';
    let proveedorNombre = '';
    let montoNeto = 0;
    let montoIva = 0;
    let montoTotal = 0;
    let plazoDias = 0;
    let ajustaRequerimientos = true;
    let cuentaExperiencia = true;
    let cumplePlazoRequerido = true;
    let declaraSustentabilidad = true;
    let tipoEvidenciaSustentable = 'Carta Compromiso';
    let observaciones = '';

    const items: ItemCotizacion[] = [];

    // Recorrer filas buscando etiquetas conocidas de la plantilla oficial o cotizaciones estándar
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const col0 = String(row[0] || '').trim().toLowerCase();
      const col1 = String(row[1] || '').trim();

      if (col0.includes('rut') || col0.includes('rut empresa')) {
        proveedorRut = col1;
      } else if (col0.includes('razón social') || col0.includes('razon social') || col0.includes('nombre proveedor')) {
        proveedorNombre = col1;
      } else if (col0.includes('monto oferta neto') || col0.includes('neto')) {
        montoNeto = Number(row[1]) || 0;
      } else if (col0.includes('iva 19%') || col0.includes('iva')) {
        montoIva = Number(row[1]) || 0;
      } else if (col0.includes('monto oferta total') || col0.includes('total con iva') || col0.includes('total')) {
        montoTotal = Number(row[1]) || 0;
      } else if (col0.includes('plazo de ejecución') || col0.includes('plazo (días)') || col0.includes('plazo')) {
        plazoDias = Number(row[1]) || 0;
      } else if (col0.includes('requerimientos')) {
        ajustaRequerimientos = String(row[1]).toUpperCase() !== 'NO';
      } else if (col0.includes('experiencia')) {
        cuentaExperiencia = String(row[1]).toUpperCase() !== 'NO';
      } else if (col0.includes('cumplir el servicio dentro del plazo') || col0.includes('cumple plazo')) {
        cumplePlazoRequerido = String(row[1]).toUpperCase() !== 'NO';
      } else if (col0.includes('certificación/política sustentable') || col0.includes('sustentable')) {
        declaraSustentabilidad = String(row[1]).toUpperCase() !== 'NO';
      } else if (col0.includes('tipo de evidencia sustentable')) {
        tipoEvidenciaSustentable = col1 || 'Carta Compromiso Sustentable';
      } else if (col0.includes('observaciones')) {
        observaciones = col1;
      }
    }

    // Si no se calculó IVA o Total, calcularlos automáticamente
    if (montoNeto > 0 && montoTotal === 0) {
      montoIva = Math.round(montoNeto * 0.19);
      montoTotal = montoNeto + montoIva;
    } else if (montoTotal > 0 && montoNeto === 0) {
      montoNeto = Math.round(montoTotal / 1.19);
      montoIva = montoTotal - montoNeto;
    }

    return {
      exito: true,
      cotizacionParcial: {
        licitacionId,
        proveedorRut,
        proveedorNombre,
        montoNeto,
        montoIva,
        montoTotal,
        plazoDias,
        ajustaRequerimientos,
        cuentaExperiencia,
        cumplePlazoRequerido,
        declaraSustentabilidad,
        tipoEvidenciaSustentable,
        documentoCotizacionNombre: file.name,
        observaciones,
      },
      items,
      mensaje: `Lectura exitosa del archivo ${file.name}`,
    };
  } catch (error: any) {
    return {
      exito: false,
      mensaje: `Error al leer el archivo Excel: ${error.message}`,
    };
  }
}
