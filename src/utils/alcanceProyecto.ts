// Alcance de un proyecto en el Gestor de Espacios: los pisos (o recintos puntuales) que interviene, con sus superficies
// oficiales. Lo usa la ficha del proyecto para mostrarlo y el presupuesto con IA para cubicar.
import type { Piso, Recinto } from '../types/recintos';
import { vigenteEn, hoyISO } from './vigenciaRecinto';

export interface AlcanceEspacios {
  /** Pisos completos que interviene el proyecto (id del piso). */
  pisos: string[];
  /** Recintos puntuales (id), además de los pisos completos. */
  recintos: string[];
}

export interface ResumenAlcance {
  recintos: Recinto[];
  util: number;
  oguc: number;
  porTipo: { tipo: string; n: number; util: number }[];
  pisos: string[];
}

/** Recintos vigentes que cubre el alcance (los de los pisos elegidos más los elegidos uno a uno), con sus totales. */
export function resumirAlcance(alcance: AlcanceEspacios | undefined, pisos: Piso[], recintos: Recinto[]): ResumenAlcance {
  const hoy = hoyISO();
  const enPisos = new Set(alcance?.pisos || []);
  const sueltos = new Set(alcance?.recintos || []);
  const lista = recintos.filter(r => r.estado !== 'Eliminado' && vigenteEn(r, hoy) && (enPisos.has(r.piso_id) || sueltos.has(r.id)));
  const tipos = new Map<string, { n: number; util: number }>();
  for (const r of lista) {
    const t = tipos.get(r.nombre) || { n: 0, util: 0 };
    t.n++; t.util += Number(r.superficie_m2) || 0;
    tipos.set(r.nombre, t);
  }
  const nombresPiso = pisos.filter(p => enPisos.has(p.id) || lista.some(r => r.piso_id === p.id))
    .sort((a, b) => a.orden - b.orden).map(p => p.nombre || p.codigo);
  return {
    recintos: lista,
    util: lista.reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0),
    oguc: lista.reduce((s, r) => s + (Number(r.superficie_oguc_m2) || 0), 0),
    porTipo: [...tipos.entries()].map(([tipo, x]) => ({ tipo, ...x })).sort((a, b) => b.util - a.util),
    pisos: nombresPiso,
  };
}

const m2 = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m²`;

/**
 * El alcance en palabras para la IA del presupuesto: superficies oficiales del Gestor de Espacios, por tipo de recinto,
 * y el detalle de cada recinto (código, tipo y m²) para que pueda cubicar pisos, cielos, pintura, etc.
 */
export function textoAlcanceParaIA(edificio: string, r: ResumenAlcance): string {
  if (!r.recintos.length) return '';
  const tipos = r.porTipo.map(t => `${t.tipo} (${t.n}, ${m2(t.util)})`).join('; ');
  const detalle = r.recintos.slice(0, 120).map(x => `${x.codigo} ${x.nombre} ${m2(Number(x.superficie_m2) || 0)}`).join('; ');
  return `Intervención en ${edificio}, ${r.pisos.join(', ') || 'recintos puntuales'}: ${r.recintos.length} recintos, `
    + `${m2(r.util)} útiles (${m2(r.oguc)} OGUC, a eje de muros). Por tipo: ${tipos}. `
    + `Detalle de recintos: ${detalle}${r.recintos.length > 120 ? ` y ${r.recintos.length - 120} más` : ''}.`;
}
