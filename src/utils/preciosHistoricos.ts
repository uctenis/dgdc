import type { Cotizacion } from '../types';

/** Mínimo de precios reales similares para que la referencia histórica pese en la estimación. */
export const MIN_PRECIOS_HISTORICOS = 3;

export interface PrecioHistorico {
  unidad: string;
  tokens: Set<string>;
  precioUnitario: number;
}

const PALABRAS_VACIAS = new Set([
  'para', 'segun', 'incluye', 'incluido', 'tipo', 'otros', 'desde', 'hasta', 'sobre', 'bajo', 'entre', 'cada',
  'con', 'sin', 'del', 'las', 'los', 'una', 'uno', 'todo', 'toda', 'esto', 'este', 'esta', 'partida', 'item',
]);

const quitarTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function normalizarUnidad(unidad: string): string {
  const u = quitarTildes(unidad || '').toLowerCase().replace(/[.\s]/g, '').replace('²', '2').replace('³', '3');
  if (['m2', 'mt2', 'mts2', 'metro2', 'metroscuadrados'].includes(u)) return 'm2';
  if (['m3', 'mt3', 'mts3', 'metroscubicos'].includes(u)) return 'm3';
  if (['ml', 'm', 'mt', 'mts', 'metrolineal', 'metroslineales'].includes(u)) return 'ml';
  if (['gl', 'glb', 'global', 'gbl'].includes(u)) return 'gl';
  if (['un', 'u', 'und', 'unid', 'unidad', 'c/u', 'cu', 'n'].includes(u)) return 'un';
  return u;
}

export function tokensDescripcion(descripcion: string): Set<string> {
  return new Set(
    quitarTildes(descripcion || '').toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 4 && !PALABRAS_VACIAS.has(t))
      // Plural simple: "ventanas" y "ventana" cuentan como la misma palabra.
      .map(t => t.replace(/(es|s)$/, ''))
  );
}

/** Precios unitarios reales de las ofertas recibidas (partidas con cantidad y precio). */
export function preciosDesdeCotizaciones(cotizaciones: Cotizacion[]): PrecioHistorico[] {
  return cotizaciones.flatMap(c => (c.itemizado || [])
    .filter(it => it.precioUnitario > 0 && it.descripcion)
    .map(it => ({ unidad: normalizarUnidad(it.unidad), tokens: tokensDescripcion(it.descripcion), precioUnitario: it.precioUnitario })));
}

function similitud(a: Set<string>, b: Set<string>): { jaccard: number; comunes: number } {
  let comunes = 0;
  a.forEach(t => { if (b.has(t)) comunes++; });
  const union = a.size + b.size - comunes;
  return { jaccard: union ? comunes / union : 0, comunes };
}

const mediana = (valores: number[]) => {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Mediana de los precios reales ofertados en partidas parecidas (misma unidad y descripción similar).
 * La mediana ignora por sí sola las ofertas muy altas o muy bajas.
 */
export function referenciaHistorica(
  descripcion: string,
  unidad: string,
  historicos: PrecioHistorico[]
): { mediana: number; cantidad: number } | null {
  const tokens = tokensDescripcion(descripcion);
  if (tokens.size === 0) return null;
  const u = normalizarUnidad(unidad);
  const precios = historicos
    .filter(h => h.unidad === u)
    .filter(h => {
      const { jaccard, comunes } = similitud(tokens, h.tokens);
      return comunes >= Math.min(2, tokens.size) && jaccard >= 0.4;
    })
    .map(h => h.precioUnitario);
  if (!precios.length) return null;
  return { mediana: Math.round(mediana(precios)), cantidad: precios.length };
}
