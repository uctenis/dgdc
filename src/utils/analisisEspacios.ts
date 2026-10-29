// Cruces de información del Gestor de Espacios: filtros combinables (campus, edificio, piso, tipo, uso, unidad…),
// totales, agrupaciones, cruces de dos dimensiones y una frase que responde la consulta en palabras. Funciones puras:
// la pantalla les pasa las filas ya leídas de la base.
import type { Ocupante } from '../types/recintos';

export interface FilaAnalisis {
  id: string;
  campus: string;
  campusNombre: string;
  edificio: string;
  edificioNombre: string;
  /** Nombre del piso («Piso 3», «Subterráneo 1»): permite cruzar el mismo piso de varios edificios. */
  piso: string;
  pisoOrden: number;
  codigo: string;
  tipo: string;
  uso: string;
  unidades: string[];
  clase: string;
  estado: string;
  util: number;
  oguc: number;
  capacidad: number;
  ocupantes: Ocupante[];
}

export type Dimension = 'campus' | 'edificio' | 'piso' | 'tipo' | 'uso' | 'unidad' | 'clase' | 'estado';
export type Medida = 'util' | 'oguc' | 'recintos' | 'capacidad' | 'ocupantes';

export const DIMENSIONES: { id: Dimension; nombre: string; plural: string }[] = [
  { id: 'campus', nombre: 'Campus', plural: 'campus' },
  { id: 'edificio', nombre: 'Edificio', plural: 'edificios' },
  { id: 'piso', nombre: 'Piso', plural: 'pisos' },
  { id: 'tipo', nombre: 'Tipo de recinto', plural: 'tipos' },
  { id: 'uso', nombre: 'Uso', plural: 'usos' },
  { id: 'unidad', nombre: 'Unidad usuaria', plural: 'unidades' },
  { id: 'clase', nombre: 'Superficie útil / común', plural: 'clases' },
  { id: 'estado', nombre: 'Estado', plural: 'estados' },
];
export const MEDIDAS: { id: Medida; nombre: string; corto: string }[] = [
  { id: 'util', nombre: 'Superficie útil', corto: 'm² útil' },
  { id: 'oguc', nombre: 'Superficie OGUC', corto: 'm² OGUC' },
  { id: 'recintos', nombre: 'Cantidad de recintos', corto: 'recintos' },
  { id: 'capacidad', nombre: 'Capacidad (personas)', corto: 'personas' },
  { id: 'ocupantes', nombre: 'Ocupantes registrados', corto: 'ocupantes' },
];

export type Filtros = Partial<Record<Dimension, string[]>> & { texto?: string };

export const SIN_DATO = 'Sin dato';

/** Valores de una fila para una dimensión (la unidad puede tener varios: un recinto compartido). */
export function valoresDe(f: FilaAnalisis, d: Dimension): string[] {
  switch (d) {
    case 'campus': return [f.campus];
    case 'edificio': return [f.edificio];
    case 'piso': return [f.piso || SIN_DATO];
    case 'tipo': return [f.tipo || SIN_DATO];
    case 'uso': return [f.uso || SIN_DATO];
    case 'unidad': return f.unidades.length ? f.unidades : [SIN_DATO];
    case 'clase': return [f.clase || SIN_DATO];
    case 'estado': return [f.estado];
  }
}

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Filas que cumplen todos los filtros (dentro de cada dimensión basta con uno de los valores elegidos). */
export function filtrar(filas: FilaAnalisis[], filtros: Filtros, ignorar?: Dimension): FilaAnalisis[] {
  const palabras = sinTildes(filtros.texto || '').split(/\s+/).filter(Boolean);
  const activos = DIMENSIONES.map(d => d.id).filter(d => d !== ignorar && filtros[d]?.length);
  return filas.filter(f => {
    for (const d of activos) {
      const elegidos = filtros[d]!;
      if (!valoresDe(f, d).some(v => elegidos.includes(v))) return false;
    }
    if (palabras.length) {
      const texto = sinTildes([f.codigo, f.tipo, f.uso, f.edificioNombre, ...f.unidades, ...f.ocupantes.map(o => `${o.nombre} ${o.cargo || ''}`)].join(' '));
      if (!palabras.every(p => texto.includes(p))) return false;
    }
    return true;
  });
}

export interface Totales { recintos: number; util: number; oguc: number; capacidad: number; ocupantes: number; edificios: number; pisos: number }

export function totales(filas: FilaAnalisis[]): Totales {
  return {
    recintos: filas.length,
    util: filas.reduce((s, f) => s + f.util, 0),
    oguc: filas.reduce((s, f) => s + f.oguc, 0),
    capacidad: filas.reduce((s, f) => s + f.capacidad, 0),
    ocupantes: filas.reduce((s, f) => s + f.ocupantes.length, 0),
    edificios: new Set(filas.map(f => f.edificio)).size,
    pisos: new Set(filas.map(f => `${f.edificio}|${f.piso}`)).size,
  };
}

export const valorMedida = (t: Pick<Totales, 'recintos' | 'util' | 'oguc' | 'capacidad' | 'ocupantes'>, m: Medida) => t[m];

export interface Grupo extends Omit<Totales, 'edificios' | 'pisos'> { clave: string }

/**
 * Agrupa por una dimensión. Un recinto con varias unidades cuenta entero en cada una (así cada unidad ve todo lo que
 * ocupa); por eso, al agrupar por unidad, la suma de los grupos puede superar el total.
 */
export function agrupar(filas: FilaAnalisis[], d: Dimension, m: Medida = 'util'): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const f of filas) for (const clave of valoresDe(f, d)) {
    const g = mapa.get(clave) || { clave, recintos: 0, util: 0, oguc: 0, capacidad: 0, ocupantes: 0 };
    g.recintos++; g.util += f.util; g.oguc += f.oguc; g.capacidad += f.capacidad; g.ocupantes += f.ocupantes.length;
    mapa.set(clave, g);
  }
  const grupos = [...mapa.values()];
  // Los pisos se ordenan de abajo hacia arriba; lo demás, de mayor a menor según la medida.
  if (d === 'piso') {
    const orden = new Map(filas.map(f => [f.piso, f.pisoOrden]));
    return grupos.sort((a, b) => (orden.get(a.clave) ?? 999) - (orden.get(b.clave) ?? 999));
  }
  return grupos.sort((a, b) => valorMedida(b, m) - valorMedida(a, m) || a.clave.localeCompare(b.clave, 'es'));
}

export interface Cruce { filas: string[]; columnas: string[]; celdas: Map<string, Grupo>; totalFila: Map<string, Grupo>; totalColumna: Map<string, Grupo> }

/** Cruce de dos dimensiones (p. ej. piso × tipo). Más de `maxColumnas` columnas se juntan en «Otros». */
export function cruzar(filas: FilaAnalisis[], df: Dimension, dc: Dimension, m: Medida = 'util', maxColumnas = 10): Cruce {
  const columnasTodas = agrupar(filas, dc, m).map(g => g.clave);
  const visibles = new Set(columnasTodas.slice(0, maxColumnas));
  const columna = (v: string) => (visibles.has(v) ? v : 'Otros');
  const celdas = new Map<string, Grupo>();
  const sumar = (mapa: Map<string, Grupo>, clave: string, f: FilaAnalisis) => {
    const g = mapa.get(clave) || { clave, recintos: 0, util: 0, oguc: 0, capacidad: 0, ocupantes: 0 };
    g.recintos++; g.util += f.util; g.oguc += f.oguc; g.capacidad += f.capacidad; g.ocupantes += f.ocupantes.length;
    mapa.set(clave, g);
  };
  const totalFila = new Map<string, Grupo>(), totalColumna = new Map<string, Grupo>();
  for (const f of filas) for (const vf of valoresDe(f, df)) {
    sumar(totalFila, vf, f);
    for (const vc of new Set(valoresDe(f, dc).map(columna))) { sumar(celdas, `${vf}\u0000${vc}`, f); sumar(totalColumna, vc, f); }
  }
  const columnas = [...columnasTodas.slice(0, maxColumnas), ...(columnasTodas.length > maxColumnas ? ['Otros'] : [])];
  return { filas: agrupar(filas, df, m).map(g => g.clave), columnas, celdas, totalFila, totalColumna };
}

const numero = (n: number, decimales = 0) => n.toLocaleString('es-CL', { maximumFractionDigits: decimales });
export const formatoM2 = (n: number) => `${numero(n, n < 100 ? 1 : 0)} m²`;
export function formatoMedida(n: number, m: Medida): string {
  if (m === 'util' || m === 'oguc') return formatoM2(n);
  return `${numero(n)} ${MEDIDAS.find(x => x.id === m)!.corto}`;
}

/** La consulta y su resultado en una frase: «En CJP08 · Piso 3 hay 24 recintos de tipo SALA CÁTEDRA que suman…». */
export function fraseRespuesta(filtros: Filtros, t: Totales, nombres: { edificio: (c: string) => string; campus: (c: string) => string }): string {
  const lista = (v: string[], f: (x: string) => string = x => x) => (v.length <= 3 ? v.map(f).join(', ') : `${v.slice(0, 2).map(f).join(', ')} y ${v.length - 2} más`);
  const donde = [
    filtros.edificio?.length ? lista(filtros.edificio, nombres.edificio) : filtros.campus?.length ? lista(filtros.campus, nombres.campus) : 'todos los campus',
    filtros.piso?.length ? lista(filtros.piso) : '',
  ].filter(Boolean).join(' · ');
  const que = [
    filtros.tipo?.length ? `de tipo ${lista(filtros.tipo)}` : '',
    filtros.uso?.length ? `de uso ${lista(filtros.uso)}` : '',
    filtros.unidad?.length ? `de ${lista(filtros.unidad)}` : '',
    filtros.clase?.length ? `de superficie ${lista(filtros.clase).toLowerCase()}` : '',
    filtros.estado?.length ? `en estado ${lista(filtros.estado).toLowerCase()}` : '',
    filtros.texto?.trim() ? `que coinciden con «${filtros.texto.trim()}»` : '',
  ].filter(Boolean).join(', ');
  if (!t.recintos) return `En ${donde} no hay recintos${que ? ` ${que}` : ''}.`;
  return `En ${donde} hay ${numero(t.recintos)} recinto${t.recintos === 1 ? '' : 's'}${que ? ` ${que}` : ''}, que suman ${formatoM2(t.util)} útiles (${formatoM2(t.oguc)} OGUC)`
    + `${t.edificios > 1 ? `, en ${t.edificios} edificios` : ''}${t.capacidad ? ` y capacidad para ${numero(t.capacidad)} personas` : ''}.`;
}
