// ─── CARTERA ANUAL ───────────────────────────────────────────────────────────
// La cartera de proyectos y su presupuesto son anuales. Cada proyecto pertenece a UNA cartera
// (`anioPresupuesto`) y puede pasar a la del año siguiente si no se aprobó, conservando su código
// (el año del código es el de origen; el de la cartera puede ser posterior).

import type { ConfiguracionFirmas, ProyectoMaestro } from '../types';

/** Año de la cartera con que partió el sistema: los proyectos sin año explícito ni año en el código son de este. */
export const ANIO_CARTERA_INICIAL = 2026;

const CLAVE_ANIO_ELEGIDO = 'dgdc_cartera_anio';

/** Cartera (año presupuestario) a la que pertenece el proyecto. */
export function anioDeCartera(p: Pick<ProyectoMaestro, 'anioPresupuesto' | 'codigoProyecto'>): number {
  if (p.anioPresupuesto) return p.anioPresupuesto;
  const enCodigo = /^(20\d\d)_/.exec(p.codigoProyecto || '');
  return enCodigo ? Number(enCodigo[1]) : ANIO_CARTERA_INICIAL;
}

/** Años entre los que se puede elegir: los que tienen proyectos, el actual y el siguiente (cartera en preparación). */
export function aniosDeCartera(proyectos: Pick<ProyectoMaestro, 'anioPresupuesto' | 'codigoProyecto'>[]): number[] {
  const actual = new Date().getFullYear();
  const anios = new Set<number>([actual, actual + 1, ...proyectos.map(anioDeCartera)]);
  return Array.from(anios).sort((a, b) => a - b);
}

/** Techo institucional del año. El monto único anterior (`presupuestoAnualAprobado`) corresponde a la cartera inicial. */
export function presupuestoDelAnio(config: ConfiguracionFirmas | undefined, anio: number): number {
  const porAnio = config?.presupuestosAnuales?.[String(anio)];
  if (porAnio !== undefined) return porAnio || 0;
  return anio === ANIO_CARTERA_INICIAL ? config?.presupuestoAnualAprobado || 0 : 0;
}

export type DecisionCartera = 'aprobado' | 'rechazado' | 'observado' | 'pendiente';

/** Resultado de la revisión de cartera para un proyecto. */
export function decisionDeCartera(p: Pick<ProyectoMaestro, 'presupuesto'>): DecisionCartera {
  if (p.presupuesto?.aprobado) return 'aprobado';
  if (p.presupuesto?.rechazado) return 'rechazado';
  return p.presupuesto?.observado ? 'observado' : 'pendiente';
}

type PartidaBase = { id: string; descripcion: string; precioTotal: number };

/** Itemizado reducido a lo que se compara en la revisión (se guarda al observar el proyecto). */
export function partidasParaComparar(p: Pick<ProyectoMaestro, 'itemizado'>): PartidaBase[] {
  return (p.itemizado || []).map(i => ({ id: i.id, descripcion: i.descripcion || i.item || 'Partida sin nombre', precioTotal: i.precioTotal || 0 }));
}

/** Qué cambió en el proyecto respecto de lo presentado a revisión: valor y partidas eliminadas, agregadas o con otro monto. */
export function compararConBaseAjuste(p: Pick<ProyectoMaestro, 'presupuesto' | 'valorAprox' | 'itemizado'>) {
  const base = p.presupuesto?.baseAjuste;
  if (!base) return undefined;
  const actuales = partidasParaComparar(p);
  const porId = new Map(actuales.map(a => [a.id, a]));
  const idsBase = new Set(base.partidas.map(b => b.id));
  const eliminadas = base.partidas.filter(b => !porId.has(b.id)).map(b => b.descripcion);
  const agregadas = actuales.filter(a => !idsBase.has(a.id)).map(a => a.descripcion);
  const modificadas = base.partidas.filter(b => porId.has(b.id) && porId.get(b.id)!.precioTotal !== b.precioTotal).map(b => b.descripcion);
  const valor = p.valorAprox || 0;
  return {
    valorAnterior: base.valor,
    valor,
    diferencia: valor - base.valor,
    eliminadas,
    agregadas,
    modificadas,
    hayCambios: valor !== base.valor || eliminadas.length + agregadas.length + modificadas.length > 0,
  };
}

/** Totales de la revisión: cuánto se propuso y cuánto quedó aprobado, rechazado y por revisar (montos estimados). */
export function resumenRevisionCartera(proyectos: Pick<ProyectoMaestro, 'presupuesto' | 'valorAprox'>[]) {
  const grupo = (d: DecisionCartera) => {
    const lista = proyectos.filter(p => decisionDeCartera(p) === d);
    return { cantidad: lista.length, monto: lista.reduce((s, p) => s + (p.valorAprox || 0), 0) };
  };
  return {
    propuesto: { cantidad: proyectos.length, monto: proyectos.reduce((s, p) => s + (p.valorAprox || 0), 0) },
    aprobado: grupo('aprobado'),
    observado: grupo('observado'),
    rechazado: grupo('rechazado'),
    pendiente: grupo('pendiente'),
  };
}

/** Cartera que el usuario estaba viendo (se recuerda en su navegador); por defecto, la del año en curso. */
export function leerAnioCarteraElegido(): number {
  try {
    const guardado = Number(localStorage.getItem(CLAVE_ANIO_ELEGIDO));
    if (guardado >= 2000 && guardado <= 2100) return guardado;
  } catch { /* sin almacenamiento */ }
  return new Date().getFullYear();
}

export function guardarAnioCarteraElegido(anio: number): void {
  try {
    localStorage.setItem(CLAVE_ANIO_ELEGIDO, String(anio));
  } catch { /* sin almacenamiento */ }
}
