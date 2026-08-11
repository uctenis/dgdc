export interface EstadoProyectoInfo {
  id: string;
  nombre: string;
  colorBadge: string;
  descripcion?: string;
  estado: 'Activo' | 'Inactivo';
}

export const INITIAL_ESTADOS_PROYECTO: EstadoProyectoInfo[] = [
  { id: 'est-1', nombre: 'PROYECTO', colorBadge: 'bg-blue-100 text-blue-900 border-blue-300', estado: 'Activo', descripcion: 'Iniciativa en fase de diseño o formulación preliminar' },
  { id: 'est-2', nombre: 'COTIZACION', colorBadge: 'bg-sky-100 text-sky-900 border-sky-300', estado: 'Activo', descripcion: 'En proceso de recepción y evaluación de ofertas de proveedores' },
  { id: 'est-3', nombre: 'EN EJECUCION', colorBadge: 'bg-amber-100 text-amber-900 border-amber-300', estado: 'Activo', descripcion: 'Obra adjudicada e inicio de ejecución física en terreno' },
  { id: 'est-4', nombre: 'TERMINADO', colorBadge: 'bg-emerald-100 text-emerald-900 border-emerald-300', estado: 'Activo', descripcion: 'Obra finalizada con recepción conforme efectuada' },
  { id: 'est-5', nombre: 'POSTERGADO', colorBadge: 'bg-purple-100 text-purple-900 border-purple-300', estado: 'Activo', descripcion: 'Iniciativa diferida o pausada temporalmente' },
  { id: 'est-6', nombre: 'ELIMINADO', colorBadge: 'bg-rose-100 text-rose-900 border-rose-300', estado: 'Activo', descripcion: 'Proyecto descartado o cancelado oficialmente' },
  { id: 'est-7', nombre: 'AJUSTADO', colorBadge: 'bg-orange-100 text-orange-900 border-orange-300', estado: 'Activo', descripcion: 'En revisión por ajustes presupuestarios o de alcance' },
  { id: 'est-8', nombre: 'EN CARPETA', colorBadge: 'bg-slate-100 text-slate-900 border-slate-300', estado: 'Activo', descripcion: 'Banco de proyectos en reserva o cartera prioritaria' },
];

const STORAGE_KEY = 'infra_app_estados_proyecto_v1';

export function getEstadosProyectoList(): EstadoProyectoInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_ESTADOS_PROYECTO));
      return INITIAL_ESTADOS_PROYECTO;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_ESTADOS_PROYECTO;
  }
}

export function saveEstadosProyectoList(list: EstadoProyectoInfo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Error al guardar estados de proyecto:', e);
  }
}

export function getEstadosProyectoNombres(): string[] {
  return getEstadosProyectoList()
    .filter(e => e.estado === 'Activo')
    .map(e => e.nombre);
}

export function obtenerBadgeEstiloEstado(nombreEstado: string): string {
  const list = getEstadosProyectoList();
  const clean = (nombreEstado || '').trim().toUpperCase();
  const found = list.find(e => e.nombre.toUpperCase() === clean);
  return found?.colorBadge || 'bg-slate-100 text-slate-800 border-slate-300';
}
