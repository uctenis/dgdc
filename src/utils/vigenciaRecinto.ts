// Vigencia de los recintos en el tiempo: qué existía (y cuánta superficie sumaba) en una fecha dada. Es la base de
// los totales de hoy y de la evolución de la infraestructura.
import type { Recinto } from '../types/recintos';

type ConVigencia = Pick<Recinto, 'estado' | 'fecha_alta' | 'fecha_baja'>;

/** Fecha de hoy como «AAAA-MM-DD» (hora local), el mismo formato de las fechas de la base. */
export const hoyISO = (ahora = new Date()) =>
  `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

/**
 * ¿El recinto existía (y estaba a cargo de la UCT) en esa fecha? Sin fecha de alta se entiende que existe desde antes
 * del registro. La fecha de baja ya no cuenta (el día de baja ya no está). Un recinto «Eliminado» sin fecha de baja se
 * da por dado de baja, porque no se sabe desde cuándo.
 */
export function vigenteEn(r: ConVigencia, fecha: string): boolean {
  if (r.fecha_alta && r.fecha_alta > fecha) return false;
  if (r.fecha_baja && r.fecha_baja <= fecha) return false;
  if (r.estado === 'Eliminado' && !r.fecha_baja) return false;
  return true;
}

/** Recinto que aún no existe pero ya está registrado (una obra en curso con fecha de entrega futura). */
export const porVenir = (r: ConVigencia, fecha: string) => !!r.fecha_alta && r.fecha_alta > fecha && r.estado !== 'Eliminado';

export interface ResumenSuperficie {
  recintos: number;
  util: number;
  oguc: number;
  /** De lo vigente, lo que no es propio (arrendado, comodato o concesión). */
  noPropia: { recintos: number; util: number };
  /** Lo que se suma más adelante: obras con fecha de entrega posterior. */
  porVenir: { recintos: number; util: number; desde: string | null };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Totales de superficie en una fecha (por defecto, hoy). */
export function resumenSuperficie(recintos: (ConVigencia & Pick<Recinto, 'superficie_m2' | 'superficie_oguc_m2' | 'tenencia'>)[], fecha = hoyISO()): ResumenSuperficie {
  const r: ResumenSuperficie = { recintos: 0, util: 0, oguc: 0, noPropia: { recintos: 0, util: 0 }, porVenir: { recintos: 0, util: 0, desde: null } };
  for (const x of recintos) {
    const util = Number(x.superficie_m2) || 0;
    if (vigenteEn(x, fecha)) {
      r.recintos++; r.util += util; r.oguc += Number(x.superficie_oguc_m2) || 0;
      if (x.tenencia && x.tenencia !== 'Propia') { r.noPropia.recintos++; r.noPropia.util += util; }
    } else if (porVenir(x, fecha)) {
      r.porVenir.recintos++; r.porVenir.util += util;
      if (!r.porVenir.desde || x.fecha_alta! < r.porVenir.desde) r.porVenir.desde = x.fecha_alta!;
    }
  }
  r.util = redondear(r.util); r.oguc = redondear(r.oguc);
  r.noPropia.util = redondear(r.noPropia.util); r.porVenir.util = redondear(r.porVenir.util);
  return r;
}

/** Texto corto de la vigencia para mostrar junto al recinto («desde mar. 2027», «hasta may. 2025»), o vacío. */
export function textoVigencia(r: Pick<Recinto, 'fecha_alta' | 'fecha_baja'>, fecha = hoyISO()): string {
  const mes = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' });
  if (r.fecha_baja && r.fecha_baja <= fecha) return `de baja desde ${mes(r.fecha_baja)}`;
  if (r.fecha_alta && r.fecha_alta > fecha) return `opera desde ${mes(r.fecha_alta)}`;
  if (r.fecha_baja) return `hasta ${mes(r.fecha_baja)}`;
  return '';
}
