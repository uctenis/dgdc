// Alertas de calidad de un recinto, calculadas con sus datos actuales: al corregir el dato, la alerta desaparece sola.
// Lo que no se puede calcular (p. ej. un código que no calza con su edificio) queda como nota «Por revisar:» en sus
// observaciones y también se muestra como alerta.
import type { Recinto } from '../types/recintos';
import { getConfigEspacios, type ParametrosEspacios } from '../data/espaciosConfig';

export const PREFIJO_POR_REVISAR = 'Por revisar:';

const m2 = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m²`;

/** Notas «Por revisar» escritas en las observaciones del recinto. */
export function notasPorRevisar(observaciones?: string | null): string[] {
  return (observaciones || '').split('\n').map(l => l.trim()).filter(l => l.startsWith(PREFIJO_POR_REVISAR))
    .map(l => l.slice(PREFIJO_POR_REVISAR.length).trim().replace(/\.$/, ''));
}

/** Observaciones sin las notas «Por revisar». */
export function observacionesSinNotas(observaciones?: string | null): string[] {
  return (observaciones || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(PREFIJO_POR_REVISAR));
}

type DatosAlerta = Pick<Recinto, 'codigo' | 'edificio_codigo' | 'nombre' | 'estado' | 'superficie_m2' | 'superficie_oguc_m2' | 'observaciones'> & {
  piso_codigo?: string | null;
};

/** Código histórico del recinto (en planos o catastros anteriores), si existe y es distinto del código actual. */
export function codigoAnteriorRecinto(r: Pick<Recinto, 'codigo' | 'edificio_codigo' | 'atributos'>): string | null {
  const atr = r.atributos || {};
  const raw = String(atr['CÓDIGO ANTIGUO'] ?? atr['Código anterior'] ?? atr['codigo_antiguo'] ?? '').trim();
  if (!raw || raw === '-' || raw === '—' || /^s\/i$/i.test(raw)) return null;
  const actual = (r.codigo || '').trim().toUpperCase();
  const corto = actual.replace(`${(r.edificio_codigo || '').trim().toUpperCase()}_`, '');
  const cand = raw.toUpperCase();
  if (cand === actual || cand === corto) return null;
  return raw;
}

/**
 * Problemas del recinto que conviene revisar. Los recintos eliminados no se revisan. Los umbrales salen de la
 * configuración del Gestor (Parámetros).
 */
export function alertasRecinto(r: DatosAlerta, p: Pick<ParametrosEspacios, 'factorOguc' | 'diferenciaOgucM2'> = getConfigEspacios().parametros): string[] {
  if (r.estado === 'Eliminado') return [];
  const alertas: string[] = [];
  const util = Number(r.superficie_m2) || 0;
  const oguc = Number(r.superficie_oguc_m2) || 0;
  if (!util && !oguc) alertas.push('sin superficies');
  else if (!util) alertas.push(`sin superficie útil (OGUC ${m2(oguc)})`);
  else if (oguc && util > oguc + 0.01) alertas.push(`la superficie útil (${m2(util)}) es mayor que la OGUC (${m2(oguc)})`);
  else if (oguc > util * p.factorOguc && oguc - util > p.diferenciaOgucM2) alertas.push(`la OGUC (${m2(oguc)}) es muy superior a la útil (${m2(util)})`);
  if (!r.nombre?.trim() || /^(\?|sin tipo)/i.test(r.nombre.trim())) alertas.push('sin tipo de recinto');
  const sufijo = r.codigo?.includes('_') ? r.codigo.split('_')[1] : '';
  const mPiso = /^([1-9])\d{2}[A-Za-z]?$/.exec(sufijo);
  const pisoCod = (r.piso_codigo || '').trim().toUpperCase();
  if (mPiso && /^[1-9]$/.test(pisoCod) && mPiso[1] !== pisoCod) {
    alertas.push(`el código (${sufijo}) sugiere piso ${mPiso[1]}, pero está en el piso ${pisoCod}`);
  }
  return [...alertas, ...notasPorRevisar(r.observaciones)];
}
