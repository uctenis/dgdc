import type { EvaluacionDesempeno, LicitacionProyecto, ProyectoMaestro } from '../types';

const DIA_MS = 86_400_000;
const hoyISO = () => new Date().toISOString().slice(0, 10);
const dias = (desde: string, hasta: string) => Math.round((new Date(hasta.slice(0, 10)).getTime() - new Date(desde.slice(0, 10)).getTime()) / DIA_MS);

export const adjudicada = (l: LicitacionProyecto) => Boolean(l.proveedorAdjudicadoId || l.proveedorGanadorId);
const recepcionAprobada = (l: LicitacionProyecto) => l.recepcionConforme?.aprobada === true || l.estadoLifecycle === 'Finalizado';
const enEjecucion = (l: LicitacionProyecto) => adjudicada(l) && !recepcionAprobada(l) && l.estado !== 'Cerrado';

export interface RepartoProveedor { nombre: string; obras: number; monto: number; pct: number; promedioDesempeno: number | null }

export interface IndicadoresGestion {
  proceso: { promedioDias: number | null; n: number; sinFecha: number };
  ahorro: { estimado: number; adjudicado: number; ahorro: number; pct: number | null; n: number };
  obras: { enEjecucion: number; atrasadas: number; finalizadas: number; pctAtrasadas: number | null };
  reparto: RepartoProveedor[];
  /** % del monto adjudicado que se lleva el mayor proveedor (concentración). */
  concentracionMayor: number | null;
  desempeno: { promedio: number | null; evaluaciones: number };
}

/** Indicadores de gestión de la cartera de licitaciones y obras. */
export function calcularIndicadores(
  licitaciones: LicitacionProyecto[],
  evaluacionesPorProveedor: Record<string, EvaluacionDesempeno[]>,
): IndicadoresGestion {
  const adjudicadas = licitaciones.filter(adjudicada);

  // Días desde que se crea la licitación hasta su adjudicación.
  const conFechas = adjudicadas.filter(l => l.fechaCreacion && l.fechaAdjudicacion);
  const duraciones = conFechas.map(l => dias(l.fechaCreacion as string, l.fechaAdjudicacion as string)).filter(d => d >= 0);
  const proceso = {
    promedioDias: duraciones.length ? Math.round(duraciones.reduce((s, d) => s + d, 0) / duraciones.length) : null,
    n: duraciones.length,
    sinFecha: adjudicadas.length - duraciones.length,
  };

  // Ahorro: monto estimado de la licitación contra lo adjudicado (solo donde existen ambos).
  const comparables = adjudicadas.filter(l => (l.montoEstimado || 0) > 0 && (l.montoAdjudicadoTotal || 0) > 0);
  const estimado = comparables.reduce((s, l) => s + l.montoEstimado, 0);
  const adjudicado = comparables.reduce((s, l) => s + (l.montoAdjudicadoTotal || 0), 0);
  const ahorro = { estimado, adjudicado, ahorro: estimado - adjudicado, pct: estimado ? Math.round(((estimado - adjudicado) / estimado) * 1000) / 10 : null, n: comparables.length };

  // Obras: en ejecución, atrasadas (pasaron su término sin recepción) y finalizadas.
  const ejecucion = licitaciones.filter(enEjecucion);
  const atrasadas = ejecucion.filter(l => l.fechaTerminoProgramada && l.fechaTerminoProgramada.slice(0, 10) < hoyISO() && !l.recepcionConforme?.solicitada);
  const obras = {
    enEjecucion: ejecucion.length,
    atrasadas: atrasadas.length,
    finalizadas: licitaciones.filter(l => adjudicada(l) && recepcionAprobada(l)).length,
    pctAtrasadas: ejecucion.length ? Math.round((atrasadas.length / ejecucion.length) * 100) : null,
  };

  // Reparto de adjudicaciones por proveedor (rotación).
  const porProveedor = new Map<string, { nombre: string; obras: number; monto: number }>();
  for (const l of adjudicadas) {
    const id = l.proveedorAdjudicadoId || l.proveedorGanadorId || '';
    const actual = porProveedor.get(id) || { nombre: l.proveedorAdjudicadoNombre || 'Sin nombre', obras: 0, monto: 0 };
    actual.obras += 1;
    actual.monto += l.montoAdjudicadoTotal || 0;
    porProveedor.set(id, actual);
  }
  const totalAdjudicado = [...porProveedor.values()].reduce((s, p) => s + p.monto, 0);
  const promedio = (evs: EvaluacionDesempeno[] = []) => (evs.length ? Math.round((evs.reduce((s, e) => s + e.puntajeFinal, 0) / evs.length) * 10) / 10 : null);
  const reparto = [...porProveedor.entries()]
    .map(([id, p]) => ({ ...p, pct: totalAdjudicado ? Math.round((p.monto / totalAdjudicado) * 1000) / 10 : 0, promedioDesempeno: promedio(evaluacionesPorProveedor[id]) }))
    .sort((a, b) => b.monto - a.monto);

  const todas = Object.values(evaluacionesPorProveedor).flat();
  return {
    proceso,
    ahorro,
    obras,
    reparto,
    concentracionMayor: reparto.length ? reparto[0].pct : null,
    desempeno: { promedio: promedio(todas), evaluaciones: todas.length },
  };
}

export interface AvanceMeta {
  logrados: number;
  total: number;
  pct: number | null;
  detalle: string;
  pendiente?: string;
}

const meta = (logrados: number, total: number, detalle: string, pendiente?: string): AvanceMeta => ({
  logrados, total, pct: total ? Math.round((logrados / total) * 100) : null, detalle, ...(pendiente ? { pendiente } : {}),
});

/** Avance de las 3 metas de desempeño del departamento, medido con los datos del sistema. */
export function calcularMetas(
  licitaciones: LicitacionProyecto[],
  proyectos: ProyectoMaestro[],
  evaluacionesPorProveedor: Record<string, EvaluacionDesempeno[]>,
) {
  // Meta 1: actas de recepción emitidas con firma digital (interna o Acrobat Sign) sobre las obras recibidas.
  const recibidas = licitaciones.filter(l => adjudicada(l) && recepcionAprobada(l));
  const actasFirmadas = recibidas.filter(l =>
    l.actaRecepcionFirmaInterna?.estado === 'Firmada'
    || l.actaRecepcionAdobe?.status === 'SIGNED' || l.actaRecepcionAdobe?.status === 'APPROVED');
  const meta1 = meta(actasFirmadas.length, recibidas.length,
    `${actasFirmadas.length} de ${recibidas.length} obras recibidas con acta firmada digitalmente`,
    'Falta el estudio de factibilidad técnica y legal de la firma digital avanzada (documento).');

  // Meta 2: bases estandarizadas — proyectos licitados con bases generadas desde la plantilla, y aprobadas.
  const licitados = proyectos.filter(p => licitaciones.some(l => l.proyectoMaestroId === p.id || (p.codigoProyecto && l.codigoProyecto === p.codigoProyecto)));
  const conBases = licitados.filter(p => p.bases);
  const basesAprobadas = licitados.filter(p => p.bases?.estado === 'Aprobada');
  const meta2 = meta(conBases.length, licitados.length,
    `${conBases.length} de ${licitados.length} proyectos licitados usan la plantilla de bases (${basesAprobadas.length} ${basesAprobadas.length === 1 ? 'aprobada' : 'aprobadas'})`,
    'Validación legal del contenido de la plantilla (garantías, multas, requisitos) y plantillas para Serie de Precios y Administración Directa.');

  // Meta 3: evaluación de desempeño de proveedores en las obras terminadas.
  const licitacionesEvaluadas = new Set(Object.values(evaluacionesPorProveedor).flat().map(e => e.licitacionId));
  const evaluadas = recibidas.filter(l => licitacionesEvaluadas.has(l.id));
  const meta3 = meta(evaluadas.length, recibidas.length, `${evaluadas.length} de ${recibidas.length} obras recibidas con evaluación del contratista`);

  return [
    { id: 1, titulo: 'Actas de recepción con firma digital', ...meta1 },
    { id: 2, titulo: 'Bases estandarizadas (Suma Alzada)', ...meta2 },
    { id: 3, titulo: 'Evaluación de desempeño de proveedores', ...meta3 },
  ];
}
