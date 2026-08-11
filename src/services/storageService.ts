import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../lib/firebase';
import type { Proveedor, LicitacionProyecto, Cotizacion, ConfiguracionFirmas } from '../types';
import { INITIAL_PROVEEDORES, INITIAL_LICITACIONES, INITIAL_COTIZACIONES, INITIAL_CONFIG_FIRMAS } from '../data/initialData';
import { formatearRUT } from '../utils/rutUtils';

const KEYS = {
  PROVEEDORES: 'infra_app_proveedores_v3',
  LICITACIONES: 'infra_app_licitaciones_v2',
  COTIZACIONES: 'infra_app_cotizaciones_v2',
  CONFIG_FIRMAS: 'infra_app_config_firmas_v1',
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
    localStorage.setItem(KEYS.CONFIG_FIRMAS, JSON.stringify(config));
  },

  resetAllData(): void {
    localStorage.clear();
  },
};

/**
 * Sube un archivo de propuesta y retorna la URL de descarga.
 * Ruta: propuestas/{licitacionId}/{proveedorId}/{filename}
 */
export function uploadPropuesta(
  licitacionId: string,
  proveedorId: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop();
    const filename = `propuesta_${Date.now()}.${ext}`;
    const storageRef = ref(storage, `propuestas/${licitacionId}/${proveedorId}/${filename}`);

    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      snapshot => {
        onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      error => reject(error),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}

/**
 * Elimina un archivo de Storage dado su URL completa.
 */
export async function deletePropuestaFile(url: string): Promise<void> {
  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
  } catch {
    // Silencioso si el archivo no existe
  }
}
