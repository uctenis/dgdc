export interface CentroCosto {
  codigoCP: string;
  nombre: string;
  estado: 'Activo' | 'Inactivo';
  descripcion?: string;
}

export const INITIAL_CENTROS_COSTO: CentroCosto[] = [
  { codigoCP: '409-1722', nombre: 'REMODELACIONES-OBRAS', estado: 'Activo', descripcion: 'Obras de remodelación y mantención de infraestructura' },
  { codigoCP: '409-5243', nombre: 'INSTITUTO TECNOLOGICO', estado: 'Activo', descripcion: 'Iniciativas y habilitaciones del Instituto Tecnológico' },
  { codigoCP: '409-5503', nombre: 'PROYECTO TÚNEL SALIDA Y CALLE PROLONGACIÓN CJPII', estado: 'Activo', descripcion: 'Obras viales y conexión Campus San Juan Pablo II' },
  { codigoCP: '409-5506', nombre: 'CASINO VRAE', estado: 'Activo', descripcion: 'Construcción y mejoras Casino Vicerrectoría VRAE' },
  { codigoCP: '409-6293', nombre: 'CENTRO RECREACIONAL SAN NICOLAS', estado: 'Activo', descripcion: 'Habilitación y obras del Centro Recreacional San Nicolás' },
];

const STORAGE_KEY = 'infra_app_centros_costo_v1';

export function getCentrosCostoList(): CentroCosto[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_CENTROS_COSTO));
      return INITIAL_CENTROS_COSTO;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_CENTROS_COSTO;
  }
}

export function saveCentrosCostoList(list: CentroCosto[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Error al guardar centros de costo:', e);
  }
}
