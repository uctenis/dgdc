// Cálculos del módulo de Asignación de Espacios (sin base de datos, para poder probarlos): quiénes no tienen recinto,
// y cómo queda cada recinto si se aplican unos movimientos (el antes y el después de una propuesta).
import type { Ocupante } from '../types/recintos';
import { clavePersona } from './analisisEspacios';

/** Lo mínimo de un recinto que usa la asignación. */
export interface RecintoAsignable {
  id: string;
  codigo: string;
  nombre: string;
  edificio_codigo: string;
  superficie_m2?: number | null;
  capacidad?: number | null;
  unidad_usuaria?: string | null;
  ocupantes?: Ocupante[];
}

/** Un movimiento: persona que pasa de un recinto a otro (sin origen = se ubica por primera vez; sin destino = sale). */
export interface MovimientoPlan {
  persona: Ocupante;
  desde_id: string | null;
  hacia_id: string | null;
  conservar_origen?: boolean;
}

export interface EstadoRecinto {
  recinto: RecintoAsignable;
  antes: Ocupante[];
  despues: Ocupante[];
}

/** Estado de los recintos afectados después de aplicar los movimientos en orden (sin duplicar personas). */
export function simularMovimientos(recintos: Map<string, RecintoAsignable>, movimientos: MovimientoPlan[]): EstadoRecinto[] {
  const estado = new Map<string, Ocupante[]>();
  const leer = (id: string) => estado.get(id) ?? [...(recintos.get(id)?.ocupantes || [])];
  for (const m of movimientos) {
    const clave = clavePersona(m.persona.nombre);
    if (m.desde_id && !m.conservar_origen && recintos.has(m.desde_id)) {
      estado.set(m.desde_id, leer(m.desde_id).filter(o => clavePersona(o.nombre) !== clave));
    }
    if (m.hacia_id && recintos.has(m.hacia_id)) {
      const destino = leer(m.hacia_id);
      estado.set(m.hacia_id, destino.some(o => clavePersona(o.nombre) === clave) ? destino : [...destino, m.persona]);
    }
  }
  return [...estado.entries()].map(([id, despues]) => ({ recinto: recintos.get(id)!, antes: recintos.get(id)!.ocupantes || [], despues }))
    .sort((a, b) => a.recinto.codigo.localeCompare(b.recinto.codigo, 'es', { numeric: true }));
}

/** Superficie por persona (m²), o null si no hay personas o superficie. */
export function m2PorPersona(superficie: number | null | undefined, personas: number): number | null {
  return superficie && personas > 0 ? Math.round((superficie / personas) * 10) / 10 : null;
}

/** Aviso de hacinamiento: más personas que la capacidad, o menos de 6 m² por persona en un recinto con gente. */
export function avisoOcupacion(r: RecintoAsignable, personas: number): string | null {
  if (r.capacidad && personas > r.capacidad) return `Supera su capacidad (${r.capacidad})`;
  const m2 = m2PorPersona(r.superficie_m2, personas);
  if (m2 !== null && m2 < 6) return `Solo ${m2.toLocaleString('es-CL')} m² por persona`;
  return null;
}

/** Claves de todas las personas que ya ocupan algún recinto. */
export function personasConRecinto(recintos: Iterable<RecintoAsignable>): Set<string> {
  const claves = new Set<string>();
  for (const r of recintos) for (const o of r.ocupantes || []) if (o.nombre?.trim()) claves.add(clavePersona(o.nombre));
  return claves;
}
