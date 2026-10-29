// Cálculos sobre los contornos de recintos dibujados en una lámina. Los puntos van de 0 a 1 respecto del ancho y el
// alto de la página; el tamaño real de la página (en puntos PDF, 1/72 de pulgada) y la escala del plano permiten
// pasar a metros.

export type Punto = [number, number];

/** Área de un polígono por la fórmula del lazo (en las mismas unidades al cuadrado que sus puntos). */
export function areaPoligono(puntos: Punto[]): number {
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const [x1, y1] = puntos[i];
    const [x2, y2] = puntos[(i + 1) % puntos.length];
    suma += x1 * y2 - x2 * y1;
  }
  return Math.abs(suma) / 2;
}

/** Denominador de una escala escrita como "1:65", "1/250" o "65". Sin escala válida, null. */
export function denominadorEscala(escala?: string | null): number | null {
  const m = String(escala || '').replace(/\s/g, '').match(/^(?:1[:/])?(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n > 0 ? n : null;
}

/**
 * Superficie real (m²) de un contorno dibujado sobre la lámina. Supone que el PDF está a tamaño de impresión
 * (como sale del plotter): 1 punto PDF = 0,3528 mm en el papel, y cada mm del papel son `escala` mm reales.
 */
export function areaRealM2(poligono: Punto[], anchoPaginaPt: number, altoPaginaPt: number, escala?: string | null): number | null {
  const n = denominadorEscala(escala);
  if (!n || poligono.length < 3) return null;
  const metrosPorPunto = (0.0254 / 72) * n;
  const enMetros = poligono.map(([x, y]) => [x * anchoPaginaPt * metrosPorPunto, y * altoPaginaPt * metrosPorPunto] as Punto);
  return areaPoligono(enMetros);
}

/** Centro de masa del polígono (para poner la etiqueta). Si el área es casi nula, el promedio de los vértices. */
export function centroide(puntos: Punto[]): Punto {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < puntos.length; i++) {
    const [x1, y1] = puntos[i];
    const [x2, y2] = puntos[(i + 1) % puntos.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-12) {
    return [puntos.reduce((s, p) => s + p[0], 0) / puntos.length, puntos.reduce((s, p) => s + p[1], 0) / puntos.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Si un punto está dentro del polígono (algoritmo de cruce de rayos). */
export function puntoEnPoligono([x, y]: Punto, poligono: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Rectángulo que contiene al polígono: [xMin, yMin, xMax, yMax]. */
export function limites(puntos: Punto[]): [number, number, number, number] {
  const xs = puntos.map(p => p[0]), ys = puntos.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Color estable para una categoría (el mismo texto da siempre el mismo color). */
export function colorDeCategoria(texto?: string | null): string {
  if (!texto) return 'hsl(215 16% 62%)';
  let h = 0;
  for (const c of texto.toUpperCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // Ángulo áureo: categorías parecidas quedan con colores bien distintos.
  return `hsl(${Math.round((h * 137.508) % 360)} 70% 48%)`;
}

export interface AjusteOrtogonal {
  punto: Punto;
  guiaX?: number;
  guiaY?: number;
}

/**
 * Ajusta magnéticamente un punto (al arrastrar una esquina o dibujar un polígono) para facilitar desplazamientos
 * horizontales y verticales, permitiendo movimiento libre cuando el puntero se aparta de los ejes ortogonales.
 */
export function ajustarPuntoOrtogonal(
  crudo: Punto,
  origen: Punto | null,
  vecinos: Punto[],
  anchoPx: number,
  altoPx: number,
  umbralPx = 14,
): AjusteOrtogonal {
  const cx = Math.min(Math.max(crudo[0], 0), 1);
  const cy = Math.min(Math.max(crudo[1], 0), 1);
  const w = Math.max(anchoPx, 1);
  const h = Math.max(altoPx, 1);
  let x = cx, y = cy;
  let guiaX: number | undefined;
  let guiaY: number | undefined;

  const dxPx = origen ? Math.abs(cx - origen[0]) * w : 0;
  const dyPx = origen ? Math.abs(cy - origen[1]) * h : 0;

  // 1. Riel horizontal o vertical respecto del punto de partida (si el desplazamiento va casi recto en X o en Y).
  if (origen) {
    if (dxPx >= dyPx) {
      if (dyPx <= umbralPx || (dyPx <= dxPx * 0.28 && dyPx <= umbralPx * 2.2)) {
        y = origen[1];
        guiaY = origen[1];
      }
    } else if (dxPx <= umbralPx || (dxPx <= dyPx * 0.28 && dxPx <= umbralPx * 2.2)) {
      x = origen[0];
      guiaX = origen[0];
    }
  }

  // 2. Imán a las coordenadas X e Y de las esquinas vecinas (para dejar muros a 90° sin esfuerzo).
  let mejorDx = umbralPx;
  let mejorDy = umbralPx;
  for (const [vx, vy] of vecinos) {
    const mismoOrigenX = origen && Math.abs(vx - origen[0]) * w < 2;
    const mismoOrigenY = origen && Math.abs(vy - origen[1]) * h < 2;
    // Si el usuario se está desplazando en X para alejarse de esa misma línea vertical, no lo frena.
    if (!(mismoOrigenX && dxPx > dyPx && dxPx > 3)) {
      const distPx = Math.abs(cx - vx) * w;
      if (distPx <= mejorDx) {
        mejorDx = distPx;
        x = vx;
        guiaX = vx;
      }
    }
    if (!(mismoOrigenY && dyPx > dxPx && dyPx > 3)) {
      const distPy = Math.abs(cy - vy) * h;
      if (distPy <= mejorDy) {
        mejorDy = distPy;
        y = vy;
        guiaY = vy;
      }
    }
  }

  return { punto: [x, y], guiaX, guiaY };
}
