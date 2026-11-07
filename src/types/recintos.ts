// Módulo de control documental: pisos, recintos y el índice de planos de cada edificio (tablas de Postgres,
// ver supabase/migrations/0001_control_documental.sql). Los nombres de campo son los de la base.

export const ESTADOS_RECINTO = ['Operativo', 'En obra', 'Fuera de servicio', 'Eliminado'] as const;
export type EstadoRecinto = typeof ESTADOS_RECINTO[number];
export const TENENCIAS = ['Propia', 'Arrendada', 'Comodato', 'Concesión'] as const;
export type Tenencia = typeof TENENCIAS[number];
/** Motivos sugeridos al dar de alta o de baja un recinto (se puede escribir otro). */
export const MOTIVOS_ALTA = ['Construcción', 'Ampliación', 'Remodelación', 'Habilitación', 'Inicio de arriendo', 'Compra', 'División de un recinto'] as const;
export const MOTIVOS_BAJA = ['Demolición', 'Remodelación', 'Fin de arriendo', 'Venta', 'Fusión con otro recinto', 'Cambio de destino'] as const;

export const TIPOS_DOCUMENTO = ['Plano', 'Especificación técnica', 'Memoria de cálculo', 'Informe', 'Certificado', 'Otro'] as const;
export const ESPECIALIDADES = [
  'Arquitectura', 'Estructuras', 'Eléctrica', 'Sanitaria', 'Climatización', 'Gas',
  'Corrientes débiles', 'Red contra incendio', 'Paisajismo', 'Topografía', 'Otra',
] as const;
export const FORMATOS_DOCUMENTO = ['DWG', 'PDF', 'Otro'] as const;

/** Ficha de un edificio según el catastro (tabla edificios, supabase/migrations/0003_ficha_edificios.sql). */
export interface FichaEdificio {
  codigo: string;
  campus_nombre?: string | null;
  nombre?: string | null;
  nombre_anterior?: string | null;
  categoria?: string | null;
  uso_principal?: string | null;
  direccion?: string | null;
  rol?: string | null;
  superficie_terreno_m2?: number | null;
  /** Superficie interior útil del edificio completo, según el catastro. */
  superficie_m2?: number | null;
  superficie_oguc_m2?: number | null;
  anio_construccion?: number | null;
  anio_ascensor?: string | null;
  rampa?: string | null;
  /** Permisos de edificación y recepciones: { "PERM EDIF": { valor, fecha } }. */
  regularizacion: Record<string, { valor: string | null; fecha: string | null }>;
  comentarios?: string | null;
  atributos: Record<string, unknown>;
}

export interface Piso {
  id: string;
  edificio_codigo: string;
  codigo: string;
  nombre: string;
  orden: number;
  observaciones?: string | null;
}

/** Persona o unidad que ocupa un recinto, según el catastro (sin RUT ni datos de contrato). */
export interface Ocupante {
  nombre: string;
  cargo?: string | null;
  unidad?: string | null;
}

export interface Recinto {
  id: string;
  edificio_codigo: string;
  piso_id: string;
  codigo: string;
  nombre: string;
  uso?: string | null;
  /** Superficie interior útil. */
  superficie_m2?: number | null;
  /** Superficie según OGUC (incluye muros). */
  superficie_oguc_m2?: number | null;
  capacidad?: number | null;
  estado: EstadoRecinto;
  /** Desde cuándo existe u opera («AAAA-MM-DD»); vacía = desde antes del registro. Futura = obra por entregar. */
  fecha_alta?: string | null;
  motivo_alta?: string | null;
  /** Desde cuándo dejó de existir o de estar a cargo de la UCT. */
  fecha_baja?: string | null;
  motivo_baja?: string | null;
  tenencia?: Tenencia;
  unidad_usuaria?: string | null;
  /** Personas o unidades que lo ocupan (una por fila del catastro). */
  ocupantes?: Ocupante[];
  foto_url?: string | null;
  observaciones?: string | null;
  /** Columnas propias de cada planilla que no calzan en las fijas. */
  atributos: Record<string, string>;
  origen: 'Planilla' | 'Plano' | 'Manual';
  modificado_en?: string;
  modificado_por?: string;
}

export interface DocumentoEdificio {
  id: string;
  edificio_codigo: string;
  piso_id?: string | null;
  titulo: string;
  tipo: typeof TIPOS_DOCUMENTO[number];
  especialidad: typeof ESPECIALIDADES[number];
  formato?: typeof FORMATOS_DOCUMENTO[number] | null;
  codigo_lamina?: string | null;
  version: string;
  fecha_documento?: string | null;
  vigente: boolean;
  reemplaza_a?: string | null;
  drive_url: string;
  proyecto_codigo?: string | null;
  observaciones?: string | null;
  /** Copia de la lámina en el almacenamiento privado "laminas", para el visor (el original sigue en Drive). */
  archivo_visor?: string | null;
  /** DWG del edificio guardado en el almacenamiento «cad» (migración 0008). */
  archivo?: string | null;
  /** Escala de la lámina impresa ("1:65"), para medir superficies sobre el plano. */
  escala?: string | null;
  creado_en?: string;
  creado_por?: string;
}

/** Contorno de un recinto sobre una lámina; puntos entre 0 y 1 respecto del ancho y alto de la página. */
export interface ZonaRecinto {
  id: string;
  documento_id: string;
  recinto_id: string;
  pagina: number;
  poligono: [number, number][];
}

export interface CambioRecinto {
  id: number;
  recinto_id: string;
  accion: 'Creó' | 'Modificó' | 'Eliminó';
  antes?: Partial<Recinto> | null;
  despues?: Partial<Recinto> | null;
  fecha: string;
  usuario: string;
}
