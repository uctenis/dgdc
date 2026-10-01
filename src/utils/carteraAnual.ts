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
