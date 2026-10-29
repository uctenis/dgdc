// Regla del plano: los contornos de los recintos no se superponen. Al guardar un contorno (predibujado, dibujado a
// mano, editado o detectado con un clic) se le quita lo que ya ocupan los demás recintos de la misma lámina.
import polygonClipping from 'polygon-clipping';
import { areaPoligono, type Punto } from './geometriaPlano';

/** Restos de menos de esta fracción del contorno original (astillas que deja el recorte en los bordes) se descartan. */
const FRACCION_MINIMA = 0.02;

/**
 * El contorno sin lo que ocupan los `vecinos`. Si el recorte lo parte en pedazos, queda el más grande; si un vecino
 * queda encerrado dentro, el contorno lo rodea (los contornos no tienen huecos). Devuelve null si no queda nada.
 */
export function recortarContraVecinos(poligono: Punto[], vecinos: Punto[][]): Punto[] | null {
  const anillo = (p: Punto[]) => [...p, p[0]];
  const original = Math.abs(areaPoligono(poligono));
  const cruzan = vecinos.filter(v => v.length >= 3 && seTocan(poligono, v));
  if (!cruzan.length) return poligono;
  let resultado;
  try {
    resultado = polygonClipping.difference([anillo(poligono)], ...cruzan.map(v => [anillo(v)]));
  } catch {
    return poligono;   // geometría degenerada: se deja tal cual antes que perderla
  }
  const pedazos = resultado
    .map(([exterior]) => exterior.slice(0, -1) as Punto[])
    .filter(p => p.length >= 3 && Math.abs(areaPoligono(p)) >= original * FRACCION_MINIMA)
    .sort((a, b) => Math.abs(areaPoligono(b)) - Math.abs(areaPoligono(a)));
  return pedazos[0] || null;
}

/** Si los rectángulos que encierran a los dos contornos se cruzan (descarte rápido antes de recortar). */
function seTocan(a: Punto[], b: Punto[]): boolean {
  const caja = (p: Punto[]) => [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))];
  const [ax0, ay0, ax1, ay1] = caja(a), [bx0, by0, bx1, by1] = caja(b);
  return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
}
