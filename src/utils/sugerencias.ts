// Autocompletado y sugerencias al editar un recinto: unidades y personas que ya existen en la base (para escribirlas
// igual y no crear variantes) y la unidad más probable según los recintos vecinos.
import type { Ocupante, Recinto } from '../types/recintos';
import { clavePersona } from './analisisEspacios';

export const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

/** Separa «Unidad A / Unidad B» en sus unidades. */
export const unidadesDe = (texto?: string | null) => (texto || '').split(/\s*\/\s*/).map(u => u.trim()).filter(Boolean);

/**
 * Opciones que calzan con lo escrito, sin tildes ni mayúsculas y con las palabras en cualquier orden: «vete» encuentra
 * «Carrera de Medicina Veterinaria». Primero las que empiezan igual, después por cuántas veces se usan.
 */
export function filtrarOpciones<T extends { texto: string; usos?: number }>(opciones: T[], escrito: string, max = 8): T[] {
  const palabras = sinTildes(escrito).split(' ').filter(Boolean);
  if (!palabras.length) return [];
  const q = sinTildes(escrito);
  return opciones
    .filter(o => { const t = sinTildes(o.texto); return palabras.every(p => t.includes(p)) && t !== q; })
    .sort((a, b) => Number(sinTildes(b.texto).startsWith(q)) - Number(sinTildes(a.texto).startsWith(q)) || (b.usos || 0) - (a.usos || 0) || a.texto.localeCompare(b.texto, 'es'))
    .slice(0, max);
}

/** Unidades existentes (separando las compartidas), con cuántos recintos usan cada una. */
export function catalogoUnidades(filas: { unidad_usuaria?: string | null }[], oficiales: string[] = []) {
  const usos = new Map<string, { texto: string; usos: number }>();
  for (const u of oficiales) usos.set(sinTildes(u), { texto: u, usos: 0 });
  for (const f of filas) for (const u of unidadesDe(f.unidad_usuaria)) {
    const k = sinTildes(u);
    const x = usos.get(k) || { texto: u, usos: 0 };
    x.usos++;
    usos.set(k, x);
  }
  return [...usos.values()];
}

export interface PersonaConocida { texto: string; usos: number; cargo?: string | null; unidad?: string | null }

/** Personas registradas como ocupantes (una vez cada una), con su cargo y unidad más usados. */
export function catalogoPersonas(filas: { ocupantes?: Ocupante[] | null }[]): PersonaConocida[] {
  const mapa = new Map<string, PersonaConocida & { nombres: Map<string, number> }>();
  for (const f of filas) for (const o of f.ocupantes || []) {
    const k = clavePersona(o.nombre || '');
    if (!k) continue;
    const x = mapa.get(k) || { texto: o.nombre.trim(), usos: 0, nombres: new Map(), cargo: null, unidad: null };
    x.usos++;
    x.nombres.set(o.nombre.trim(), (x.nombres.get(o.nombre.trim()) || 0) + 1);
    x.cargo = x.cargo || o.cargo || null;
    x.unidad = x.unidad || o.unidad || null;
    mapa.set(k, x);
  }
  return [...mapa.values()].map(({ nombres, ...p }) => ({ ...p, texto: [...nombres.entries()].sort((a, b) => b[1] - a[1])[0][0] }));
}

/**
 * Unidad sugerida para un recinto: la que más se repite entre los recintos de su mismo piso (y, si el piso no tiene,
 * del edificio). Solo se sugiere si la usa al menos la mitad de los recintos con unidad.
 */
export function unidadSugerida(recinto: Pick<Recinto, 'id' | 'piso_id'> & { id?: string }, recintos: Recinto[]): { unidad: string; usan: number; de: number; donde: 'piso' | 'edificio' } | null {
  for (const donde of ['piso', 'edificio'] as const) {
    const vecinos = recintos.filter(r => r.id !== recinto.id && r.estado !== 'Eliminado' && (donde === 'edificio' || r.piso_id === recinto.piso_id));
    const conUnidad = vecinos.filter(r => unidadesDe(r.unidad_usuaria).length);
    if (conUnidad.length < 2) continue;
    const cuenta = new Map<string, { texto: string; n: number }>();
    for (const r of conUnidad) for (const u of unidadesDe(r.unidad_usuaria)) {
      const k = sinTildes(u);
      const x = cuenta.get(k) || { texto: u, n: 0 };
      x.n++;
      cuenta.set(k, x);
    }
    const mejor = [...cuenta.values()].sort((a, b) => b.n - a.n)[0];
    if (mejor && mejor.n >= conUnidad.length / 2) return { unidad: mejor.texto, usan: mejor.n, de: conUnidad.length, donde };
  }
  return null;
}
