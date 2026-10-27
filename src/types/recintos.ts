// Módulo de control documental: pisos, recintos y el índice de planos de cada edificio (tablas de Postgres,
// ver supabase/migrations/0001_control_documental.sql). Los nombres de campo son los de la base.

export const ESTADOS_RECINTO = ['Operativo', 'En obra', 'Fuera de servicio', 'Eliminado'] as const;
export type EstadoRecinto = typeof ESTADOS_RECINTO[number];

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
  unidad_usuaria?: string | null;
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
  creado_en?: string;
  creado_por?: string;
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
