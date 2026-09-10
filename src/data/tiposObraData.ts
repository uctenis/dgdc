export interface TipoObraInfo {
  id: string;
  nombre: string;
  descripcion?: string;
  estado: 'Activo' | 'Inactivo';
}

export const INITIAL_TIPOS_OBRA: TipoObraInfo[] = [
  { id: 'tipo-1', nombre: 'OBRA NUEVA', estado: 'Activo', descripcion: 'Construcciones y edificaciones nuevas desde cimientos' },
  { id: 'tipo-2', nombre: 'AUMENTO DE OBRA', estado: 'Activo', descripcion: 'Obras adicionales o aumentos de contrato sobre un proyecto ya adjudicado' },
  { id: 'tipo-3', nombre: 'AMPLIACION', estado: 'Activo', descripcion: 'Ampliación de superficie o dependencias existentes' },
  { id: 'tipo-4', nombre: 'REMODELACION', estado: 'Activo', descripcion: 'Remodelaciones y redistribución de recintos' },
  { id: 'tipo-5', nombre: 'AREAS VERDES', estado: 'Activo', descripcion: 'Paisajismo, jardines, riegos y áreas exteriores' },
  { id: 'tipo-6', nombre: 'ALHAJAMIENTO', estado: 'Activo', descripcion: 'Mobiliario y equipamiento de espacios ya construidos (instalación incluida)' },
  { id: 'tipo-7', nombre: 'REGULARIZACION', estado: 'Activo', descripcion: 'Regularización ante Dirección de Obras Municipales' },
  { id: 'tipo-8', nombre: 'COMPRA ELEMENTOS', estado: 'Activo', descripcion: 'Adquisición directa de materiales o insumos, sin obra de instalación asociada' },
  { id: 'tipo-9', nombre: 'DEMOLICION', estado: 'Activo', descripcion: 'Desarme y demolición de estructuras' },
  { id: 'tipo-10', nombre: 'INSTALACIONES', estado: 'Activo', descripcion: 'Obras eléctricas, sanitarias, climatización y redes' },
  { id: 'tipo-11', nombre: 'DISEÑO', estado: 'Activo', descripcion: 'Diseño arquitectónico, de ingeniería, eléctrico u otras especialidades (etapa de proyecto, sin ejecución de obra)' },
  { id: 'tipo-12', nombre: 'OTROS', estado: 'Activo', descripcion: 'Obras especiales y requerimientos generales' },
];

const STORAGE_KEY = 'infra_app_tipos_obra_v2';

export function getTiposObraList(): TipoObraInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TIPOS_OBRA));
      return INITIAL_TIPOS_OBRA;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_TIPOS_OBRA;
  }
}

export function saveTiposObraList(list: TipoObraInfo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Error al guardar tipos de obra:', e);
  }
}

export function getTiposObraNombres(): string[] {
  return getTiposObraList()
    .filter(t => t.estado === 'Activo')
    .map(t => t.nombre);
}
