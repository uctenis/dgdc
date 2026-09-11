import type { LicitacionProyecto } from '../types';

/** Los 4 hitos obligatorios del calendario de licitación, en orden cronológico. */
export const HITOS_LICITACION: { campo: 'fechaVisitaTerreno' | 'fechaRecepcionConsultas' | 'fechaRespuestaConsultas' | 'fechaEntregaPropuestas'; corto: string; label: string }[] = [
  { campo: 'fechaVisitaTerreno', corto: 'Visita', label: 'Visita a Terreno' },
  { campo: 'fechaRecepcionConsultas', corto: 'Consultas', label: 'Recepción de Consultas' },
  { campo: 'fechaRespuestaConsultas', corto: 'Respuestas', label: 'Respuesta de Consultas' },
  { campo: 'fechaEntregaPropuestas', corto: 'Entrega', label: 'Entrega de Propuestas' },
];

export type EstadoHito = 'cumplido' | 'proximo' | 'pendiente' | 'sin-fecha';

/**
 * Clasifica cada fecha de una secuencia de hitos según hoy: 'cumplido' (ya pasó),
 * 'proximo' (el primer hito futuro/sin cumplir de la lista) o 'pendiente' (futuro,
 * pero no el inmediato). Asume que las fechas ya vienen en orden cronológico.
 */
export function calcularEstadosHitos(fechas: (string | undefined)[]): EstadoHito[] {
  const hoy = new Date().toISOString().split('T')[0];
  let yaAsignoProximo = false;
  return fechas.map(fecha => {
    if (!fecha) return 'sin-fecha' as const;
    if (fecha < hoy) return 'cumplido' as const;
    if (!yaAsignoProximo) {
      yaAsignoProximo = true;
      return 'proximo' as const;
    }
    return 'pendiente' as const;
  });
}

/** Obtiene las 4 fechas de hitos de una licitación, en el mismo orden que HITOS_LICITACION. */
export function obtenerFechasHitos(lic: Pick<LicitacionProyecto, 'fechaVisitaTerreno' | 'fechaRecepcionConsultas' | 'fechaRespuestaConsultas' | 'fechaEntregaPropuestas'>): (string | undefined)[] {
  return HITOS_LICITACION.map(h => lic[h.campo]);
}

export function formatearFechaCorta(fecha?: string): string {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return '—';
  const [, mes, dia] = fecha.split('-');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(dia)} ${MESES[Number(mes) - 1]}`;
}

export const ESTADO_HITO_DOT: Record<EstadoHito, string> = {
  cumplido: 'bg-emerald-500',
  proximo: 'bg-amber-500 ring-2 ring-amber-200',
  pendiente: 'bg-slate-300',
  'sin-fecha': 'bg-slate-200',
};

export const ESTADO_HITO_TEXT: Record<EstadoHito, string> = {
  cumplido: 'text-emerald-700',
  proximo: 'text-amber-700',
  pendiente: 'text-slate-500',
  'sin-fecha': 'text-slate-300 italic',
};

/** Etiquetas en español de cada etapa del ciclo de vida (`estadoLifecycle`). */
export const LIFECYCLE_LABEL: Record<string, string> = {
  Bases: 'Bases', Invitando: 'Invitando', Evaluando: 'Evaluando',
  Adjudicado: 'Adjudicado', OT_Emitida: 'OT Emitida', OP_Emitida: 'OP Emitida',
  OC_Emitida: 'OC Emitida', En_Ejecucion: 'En Ejecución',
  Recepcion_Solicitada: 'Recepción', Finalizado: 'Finalizado',
};

/** Colores por etapa del ciclo de vida completo de la licitación (Bases → Finalizado). */
export const LIFECYCLE_COLOR: Record<string, string> = {
  Bases: 'bg-slate-100 text-slate-700 border-slate-200',
  Invitando: 'bg-sky-100 text-sky-800 border-sky-200',
  Evaluando: 'bg-amber-100 text-amber-800 border-amber-200',
  Adjudicado: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  OT_Emitida: 'bg-violet-100 text-violet-800 border-violet-200',
  OP_Emitida: 'bg-violet-100 text-violet-800 border-violet-200',
  OC_Emitida: 'bg-purple-100 text-purple-800 border-purple-200',
  En_Ejecucion: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Recepcion_Solicitada: 'bg-orange-100 text-orange-800 border-orange-200',
  Finalizado: 'bg-emerald-700 text-white border-emerald-800',
};
