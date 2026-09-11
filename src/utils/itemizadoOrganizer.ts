// ─── ORGANIZACIÓN DEL ITEMIZADO POR FASE ──────────────────────────────────
// Agrupa y renumera las partidas del Itemizado del Proyecto según su fase
// (Instalación de Faenas, Obra Gruesa, etc.) — usado tanto por el panel de
// edición (ItemizadoProyectoPanel) como por el exportador a Excel, para que
// ambos muestren exactamente el mismo orden y numeración.

import { FASES_ITEMIZADO } from '../types';
import type { ItemItemizadoProyecto } from '../types';

export const SIN_FASE = 'Sin fase asignada';

/**
 * Compara códigos de partida jerárquicos tipo "1", "1.2", "2.10" en orden numérico real por
 * segmento (no alfabético — si no, "2.10" quedaría antes que "2.9"). Un código más corto que
 * comparte el mismo prefijo va primero (ej. "2" antes que "2.1"), igual que en un itemizado real.
 */
export function compararCodigoItem(a: string, b: string): number {
  const segmentosA = String(a || '').split('.');
  const segmentosB = String(b || '').split('.');
  const largo = Math.max(segmentosA.length, segmentosB.length);
  for (let i = 0; i < largo; i++) {
    const segA = segmentosA[i];
    const segB = segmentosB[i];
    if (segA === undefined) return -1;
    if (segB === undefined) return 1;
    const numA = Number(segA);
    const numB = Number(segB);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
    if (segA !== segB) return segA.localeCompare(segB);
  }
  return 0;
}

/** Orden de agrupación: catálogo estándar primero (en su orden de ejecución), luego cualquier
 * fase "extra" no catalogada en el orden en que aparezca, y "Sin fase asignada" siempre al final. */
function ordenarClavesFase(claves: string[]): string[] {
  const set = new Set(claves);
  const catalogo = FASES_ITEMIZADO.filter(f => set.has(f));
  const extra = claves.filter(k => k !== SIN_FASE && !(FASES_ITEMIZADO as readonly string[]).includes(k));
  return [...catalogo, ...extra, ...(set.has(SIN_FASE) ? [SIN_FASE] : [])];
}

export function agruparPorFase(items: ItemItemizadoProyecto[]): { fase: string; items: ItemItemizadoProyecto[] }[] {
  const mapa = new Map<string, ItemItemizadoProyecto[]>();
  for (const it of items) {
    const clave = it.fase || SIN_FASE;
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave)!.push(it);
  }
  return ordenarClavesFase(Array.from(mapa.keys())).map(fase => ({ fase, items: mapa.get(fase)! }));
}

/**
 * Renumera TODAS las partidas de forma correlativa por fase — agrupa por la fase asignada a cada
 * partida (Instalación de Faenas, Obra Gruesa, etc.), en el orden estándar de ejecución, y asigna
 * el código de fase (1, 2, 3...) más subnumeración (1.1, 1.2...) dentro de cada una. Así, partidas
 * agregadas a mano quedan agrupadas junto a las que trajo la IA según la fase que se les asigne,
 * en vez de numerarse sueltas o chocar con una fase existente.
 */
export function renumerarPartidasCorrelativas(items: ItemItemizadoProyecto[]): ItemItemizadoProyecto[] {
  return agruparPorFase(items).flatMap((grupo, i) => {
    const numeroFase = i + 1;
    const ordenados = [...grupo.items].sort((a, b) => compararCodigoItem(a.item, b.item));
    return ordenados.length === 1
      ? [{ ...ordenados[0], item: String(numeroFase) }]
      : ordenados.map((it, j) => ({ ...it, item: `${numeroFase}.${j + 1}` }));
  });
}
