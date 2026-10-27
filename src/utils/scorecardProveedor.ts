import type { EvaluacionDesempeno } from '../types';
import type { CargaProveedor } from './cargaProveedores';

// Ficha de puntaje del proveedor, con el esquema de la "Supplier Scorecard" de ERPNext adaptado a la UCT:
// el puntaje da más peso a lo reciente, cae en un nivel con nombre y cada nivel trae una consecuencia al invitar.
// La UCT elige a sus proveedores, así que ningún nivel bloquea: los bajos solo piden confirmar.

/** Las evaluaciones más antiguas que esto pesan PESO_EVALUACION_ANTIGUA en el promedio. */
export const MESES_EVALUACION_VIGENTE = 24;
const PESO_EVALUACION_ANTIGUA = 0.5;

type AccionNivel = 'preferir' | 'ninguna' | 'no-sugerir' | 'confirmar';

export interface NivelDesempeno {
  id: 'excelente' | 'aceptable' | 'deficiente' | 'critico';
  etiqueta: string;
  /** Puntaje mínimo (1 a 5) para estar en el nivel. */
  desde: number;
  accion: AccionNivel;
  consecuencia: string;
  clases: { caja: string; texto: string; etiqueta: string };
}

/** De mayor a menor. Los cortes 4 y 3 son los del semáforo que ya usaba la pauta de evaluación. */
export const NIVELES_DESEMPENO: NivelDesempeno[] = [
  {
    id: 'excelente', etiqueta: 'Excelente', desde: 4, accion: 'preferir',
    consecuencia: 'Se prioriza al sugerir a quién invitar.',
    clases: { caja: 'bg-emerald-50 border-emerald-200', texto: 'text-emerald-700', etiqueta: 'bg-emerald-100 text-emerald-800' },
  },
  {
    id: 'aceptable', etiqueta: 'Aceptable', desde: 3, accion: 'ninguna',
    consecuencia: 'Se invita con normalidad.',
    clases: { caja: 'bg-amber-50 border-amber-200', texto: 'text-amber-700', etiqueta: 'bg-amber-100 text-amber-800' },
  },
  {
    id: 'deficiente', etiqueta: 'Deficiente', desde: 2, accion: 'no-sugerir',
    consecuencia: 'No se sugiere automáticamente y se pide confirmar al invitarlo.',
    clases: { caja: 'bg-rose-50 border-rose-200', texto: 'text-rose-700', etiqueta: 'bg-rose-100 text-rose-700' },
  },
  {
    id: 'critico', etiqueta: 'Crítico', desde: 0, accion: 'confirmar',
    consecuencia: 'No se sugiere automáticamente y se pide confirmar al invitarlo, dejando a la vista sus evaluaciones.',
    clases: { caja: 'bg-red-50 border-red-300', texto: 'text-red-800', etiqueta: 'bg-red-200 text-red-900' },
  },
];

/** Nivel que corresponde a un puntaje, o null si el proveedor aún no tiene evaluaciones. */
export function nivelDesempeno(promedio: number | null): NivelDesempeno | null {
  if (promedio === null) return null;
  return NIVELES_DESEMPENO.find(n => promedio >= n.desde) || NIVELES_DESEMPENO[NIVELES_DESEMPENO.length - 1];
}

/** true si el nivel deja al proveedor fuera de la sugerencia automática de invitados. */
export const nivelBajoUmbral = (nivel: NivelDesempeno | null) => nivel?.accion === 'no-sugerir' || nivel?.accion === 'confirmar';

/** Peso de una evaluación según su antigüedad. Sin fecha legible (dato antiguo o importado) pesa completo. */
function pesoPorAntiguedad(fechaEvaluacion: unknown, hoy: Date = new Date()): number {
  const limite = new Date(hoy);
  limite.setMonth(limite.getMonth() - MESES_EVALUACION_VIGENTE);
  const conToDate = fechaEvaluacion as { toDate?: () => Date } | null | undefined;
  const fecha = typeof fechaEvaluacion === 'string' ? new Date(`${fechaEvaluacion.slice(0, 10)}T00:00:00`)
    : typeof conToDate?.toDate === 'function' ? conToDate.toDate() // Timestamp de Firestore
    : null;
  return !fecha || Number.isNaN(fecha.getTime()) || fecha >= limite ? 1 : PESO_EVALUACION_ANTIGUA;
}

/**
 * Puntaje histórico del proveedor (1 a 5), o null si no tiene evaluaciones. Las evaluaciones de los últimos
 * MESES_EVALUACION_VIGENTE meses pesan completo y las anteriores la mitad: así un proveedor puede
 * recuperarse de una mala obra antigua, y una buena obra antigua no tapa un mal desempeño reciente.
 */
export function promedioDesempenoPonderado(evaluaciones: EvaluacionDesempeno[], hoy: Date = new Date()): number | null {
  if (!evaluaciones.length) return null;
  let suma = 0;
  let pesos = 0;
  evaluaciones.forEach(ev => {
    const peso = pesoPorAntiguedad(ev.fecha, hoy);
    suma += ev.puntajeFinal * peso;
    pesos += peso;
  });
  return Math.round((suma / pesos) * 10) / 10;
}

/** Promedio histórico por criterio de la pauta, con el mismo peso por antigüedad que el puntaje general. */
export function promediosPorCriterioPonderados(evaluaciones: EvaluacionDesempeno[], hoy: Date = new Date()): Record<string, number> | null {
  if (!evaluaciones.length) return null;
  const sumas: Record<string, number> = {};
  const pesos: Record<string, number> = {};
  evaluaciones.forEach(ev => {
    const peso = pesoPorAntiguedad(ev.fecha, hoy);
    (ev.criterios || []).forEach(c => {
      sumas[c.id] = (sumas[c.id] || 0) + c.puntaje * peso;
      pesos[c.id] = (pesos[c.id] || 0) + peso;
    });
  });
  return Object.fromEntries(Object.keys(sumas).map(id => [id, Math.round((sumas[id] / pesos[id]) * 10) / 10]));
}

export interface ScorecardProveedor {
  promedio: number | null;
  nivel: NivelDesempeno | null;
  cantidadEvaluaciones: number;
  /** Evaluaciones que ya pesan la mitad por antigüedad. */
  evaluacionesAntiguas: number;
  /** Procesos ya cerrados en que presentó oferta, sobre aquellos a los que se le invitó (dato del sistema, no
   * de la pauta). No cuenta las licitaciones aún abiertas, donde todavía puede ofertar. */
  respuesta: { invitaciones: number; ofertas: number; pct: number | null };
  adjudicaciones: number;
}

/** Reúne el puntaje de la pauta con los datos objetivos que el sistema ya registra del proveedor. */
export function calcularScorecard(
  evaluaciones: EvaluacionDesempeno[],
  carga?: CargaProveedor,
  hoy: Date = new Date()
): ScorecardProveedor {
  const promedio = promedioDesempenoPonderado(evaluaciones, hoy);
  const invitaciones = carga?.invitacionesCerradas || 0;
  const ofertas = carga?.ofertasEnCerradas || 0;
  return {
    promedio,
    nivel: nivelDesempeno(promedio),
    cantidadEvaluaciones: evaluaciones.length,
    evaluacionesAntiguas: evaluaciones.filter(ev => pesoPorAntiguedad(ev.fecha, hoy) < 1).length,
    respuesta: { invitaciones, ofertas, pct: invitaciones ? Math.round((ofertas / invitaciones) * 100) : null },
    adjudicaciones: carga?.adjudicacionesTotal || 0,
  };
}

/** Texto para confirmar la invitación de un proveedor de nivel bajo. Vacío si no hay nada que advertir. */
export function advertenciaDesempeno(nombre: string, promedio: number | null, cantidadEvaluaciones: number): string {
  const nivel = nivelDesempeno(promedio);
  if (!nivel || !nivelBajoUmbral(nivel)) return '';
  return `${nombre}\nDesempeño: ${nivel.etiqueta.toUpperCase()} (${promedio}/5 en ${cantidadEvaluaciones} evaluación(es) de obras anteriores).\n`
    + 'Revise sus evaluaciones en el historial del proveedor antes de invitarlo.';
}
