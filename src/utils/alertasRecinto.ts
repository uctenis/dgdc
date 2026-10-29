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

type DatosAlerta = Pick<Recinto, 'codigo' | 'edificio_codigo' | 'nombre' | 'estado' | 'superficie_m2' | 'superficie_oguc_m2' | 'observaciones'>;

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
  return [...alertas, ...notasPorRevisar(r.observaciones)];
}
