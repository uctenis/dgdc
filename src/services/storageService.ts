import { guardarConfigCompartida } from './configCompartida';
import { borrarArchivo, subirArchivo, type AccesoArchivo } from './archivosService';
import type { Proveedor, LicitacionProyecto, Cotizacion, ConfiguracionFirmas } from '../types';
import { INITIAL_PROVEEDORES, INITIAL_LICITACIONES, INITIAL_COTIZACIONES, INITIAL_CONFIG_FIRMAS } from '../data/initialData';
import { formatearRUT } from '../utils/rutUtils';

const KEYS = {
  PROVEEDORES: 'infra_app_proveedores_v3',
  LICITACIONES: 'infra_app_licitaciones_v2',
  COTIZACIONES: 'infra_app_cotizaciones_v2',
  CONFIG_FIRMAS: 'infra_app_config_firmas_v2',
};

export const storageService = {
  // PROVEEDORES
  getProveedores(): Proveedor[] {
    const data = localStorage.getItem(KEYS.PROVEEDORES);
    let provs: Proveedor[];
    if (!data) {
      provs = INITIAL_PROVEEDORES;
    } else {
      provs = JSON.parse(data);
    }
    // Formatear RUTs siempre
    const formatted = provs.map(p => ({ ...p, rut: formatearRUT(p.rut) }));
    this.saveProveedores(formatted);
    return formatted;
  },

  saveProveedores(proveedores: Proveedor[]): void {
    localStorage.setItem(KEYS.PROVEEDORES, JSON.stringify(proveedores));
  },

  // LICITACIONES
  getLicitaciones(): LicitacionProyecto[] {
    const data = localStorage.getItem(KEYS.LICITACIONES);
    if (!data) {
      this.saveLicitaciones(INITIAL_LICITACIONES);
      return INITIAL_LICITACIONES;
    }
    return JSON.parse(data);
  },

  saveLicitaciones(licitaciones: LicitacionProyecto[]): void {
    localStorage.setItem(KEYS.LICITACIONES, JSON.stringify(licitaciones));
  },

  // COTIZACIONES
  getCotizaciones(): Cotizacion[] {
    const data = localStorage.getItem(KEYS.COTIZACIONES);
    if (!data) {
      this.saveCotizaciones(INITIAL_COTIZACIONES);
      return INITIAL_COTIZACIONES;
    }
    return JSON.parse(data);
  },

  saveCotizaciones(cotizaciones: Cotizacion[]): void {
    localStorage.setItem(KEYS.COTIZACIONES, JSON.stringify(cotizaciones));
  },

  // CONFIGURACIÓN FIRMAS
  getConfigFirmas(): ConfiguracionFirmas {
    const data = localStorage.getItem(KEYS.CONFIG_FIRMAS);
    if (!data) {
      this.saveConfigFirmas(INITIAL_CONFIG_FIRMAS);
      return INITIAL_CONFIG_FIRMAS;
    }
    return JSON.parse(data);
  },

  saveConfigFirmas(config: ConfiguracionFirmas): void {
    guardarConfigCompartida(KEYS.CONFIG_FIRMAS, config);
  },

  resetAllData(): void {
    localStorage.clear();
  },
};

// ── Archivos ─────────────────────────────────────────────────────────────
// Firebase Storage exige plan de pago, así que los archivos se guardan en Firestore (ver archivosService.ts).
// Estas funciones mantienen su forma de siempre: reciben el archivo y devuelven el enlace para abrirlo.

/** Oferta de un proveedor (la ven la UCT y ese proveedor). */
export function uploadPropuesta(
  licitacionId: string,
  proveedorId: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  return subirArchivo(file, { tipo: 'oferta', licitacionId, proveedorId }, onProgress);
}

/**
 * Firma manuscrita enrolada por un usuario: imagen liviana (PNG, máx. 600 px) que se guarda directamente en su
 * perfil como data URL, así se estampa en las actas sin depender de otro almacenamiento.
 */
export async function uploadFirmaImagen(_uid: string, file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo leer la imagen de la firma.'));
      i.src = url;
    });
    const escala = Math.min(1, 600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Documento o antecedente de la Ficha de Proyecto (solo personal UCT). */
export function uploadProyectoDocumento(
  _proyectoId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  return subirArchivo(file, { tipo: 'interno' }, onProgress);
}

/**
 * Documento de una licitación. Los antecedentes (bases, planos, aclaraciones) los ven todos los invitados; las
 * ofertas, solo la UCT y el proveedor de la subcarpeta; el resto, solo la UCT.
 */
export function uploadLicitacionDocument(
  licitacionId: string,
  categoria: 'ofertas' | 'ordenes-compra' | 'estados-pago' | 'antecedentes' | 'garantias',
  file: File,
  onProgress?: (pct: number) => void,
  /** Subcarpeta (ej. el id del proveedor): así cada proveedor solo escribe en la suya. */
  subcarpeta?: string
): Promise<string> {
  const acceso: AccesoArchivo = categoria === 'antecedentes'
    ? { tipo: 'invitados', licitacionId }
    : categoria === 'ofertas' && subcarpeta
      ? { tipo: 'oferta', licitacionId, proveedorId: subcarpeta }
      : { tipo: 'interno' };
  return subirArchivo(file, acceso, onProgress);
}

/** Documentos de la carpeta del proveedor (F30, vigencia, seguros...): solo personal UCT. */
export function uploadDocumentoProveedor(_proveedorId: string, file: File, onProgress?: (pct: number) => void): Promise<string> {
  return subirArchivo(file, { tipo: 'interno' }, onProgress);
}

/** Requisitos de la inscripción de un proveedor (se suben sin sesión, con el código del enlace). */
export function uploadDocumentoInscripcion(codigo: string, _requisito: string, file: File, onProgress?: (pct: number) => void): Promise<string> {
  return subirArchivo(file, { tipo: 'inscripcion', codigo }, onProgress);
}

/** Elimina un archivo dado su enlace (silencioso si no existe). */
export async function deletePropuestaFile(url: string): Promise<void> {
  try {
    await borrarArchivo(url);
  } catch {
    // Silencioso si el archivo no existe
  }
}
