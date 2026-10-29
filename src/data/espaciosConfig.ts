// Configuración del Gestor de Espacios: listas oficiales de tipos de recinto, usos y unidades usuarias, y parámetros
// de las alertas y del visor de planos. Se comparte en Firebase como los demás catálogos (solo el administrador la
// cambia; el resto la lee) y se lee de forma síncrona desde el localStorage, igual que campusData.
import { guardarConfigCompartida } from '../services/configCompartida';

export const CLAVE_CONFIG_ESPACIOS = 'infra_app_espacios_config_v1';

/** Si un tipo de recinto cuenta como superficie útil (oficinas, salas) o común (pasillos, baños, escaleras). */
export type ClaseSuperficie = 'Útil' | 'Común';

export interface TipoRecintoConfig {
  nombre: string;
  /** Color en el plano interactivo («#0f766e»); sin color, el visor asigna uno estable. */
  color?: string;
  clase?: ClaseSuperficie | null;
}

export interface ParametrosEspacios {
  /** La OGUC se marca «muy superior» a la útil si la supera en este factor… */
  factorOguc: number;
  /** …y además por más de estos m² (para no alertar recintos chicos). */
  diferenciaOgucM2: number;
  /** Escala que se supone para una lámina que no la indica («1:100»). */
  escalaPorDefecto: string;
  /** Predibujo: largo mínimo (m) de un trazo para tomarlo como muro; los más cortos son muebles u hojas de puerta. */
  largoMinimoMuroM: number;
  /** Predibujo: ancho máximo (m) de un vano que se cierra en línea recta (puertas). */
  vanoMaximoM: number;
}

export interface ConfigEspacios {
  tipos: TipoRecintoConfig[];
  usos: string[];
  unidades: string[];
  parametros: ParametrosEspacios;
}

export const PARAMETROS_POR_DEFECTO: ParametrosEspacios = {
  factorOguc: 1.6,
  diferenciaOgucM2: 3,
  escalaPorDefecto: '1:100',
  largoMinimoMuroM: 1,
  vanoMaximoM: 1.2,
};

const VACIA: ConfigEspacios = { tipos: [], usos: [], unidades: [], parametros: PARAMETROS_POR_DEFECTO };

export function getConfigEspacios(): ConfigEspacios {
  try {
    const raw = localStorage.getItem(CLAVE_CONFIG_ESPACIOS);
    if (!raw) return VACIA;
    const c = JSON.parse(raw) as Partial<ConfigEspacios>;
    return {
      tipos: Array.isArray(c.tipos) ? c.tipos : [],
      usos: Array.isArray(c.usos) ? c.usos : [],
      unidades: Array.isArray(c.unidades) ? c.unidades : [],
      parametros: { ...PARAMETROS_POR_DEFECTO, ...(c.parametros || {}) },
    };
  } catch {
    return VACIA;
  }
}

export function saveConfigEspacios(config: ConfigEspacios): void {
  guardarConfigCompartida(CLAVE_CONFIG_ESPACIOS, config);
}

const clave = (s?: string | null) => (s || '').trim().toUpperCase();

/** Tipo oficial que corresponde a un nombre de recinto (sin distinguir mayúsculas). */
export function tipoConfigurado(nombre?: string | null): TipoRecintoConfig | undefined {
  const k = clave(nombre);
  return k ? getConfigEspacios().tipos.find(t => clave(t.nombre) === k) : undefined;
}
