import { describe, expect, it } from 'vitest';
import { detectarRecintos, distanciaATrazos, lineasDeCierre, ortogonalizar, simplificar, type MapaTrazos } from '../utils/deteccionRecintos';
import { areaPoligono, type Punto } from '../utils/geometriaPlano';

/** Plano de prueba de 200×100 px: dos recintos separados por un tabique con una puerta de 10 px y un mesón en el primero. */
function planoDePrueba(): MapaTrazos {
  const ancho = 200, alto = 100;
  const trazo = new Uint8Array(ancho * alto);
  const linea = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) trazo[y * ancho + x] = 1;
  };
  linea(10, 10, 190, 15); linea(10, 85, 190, 90); linea(10, 10, 15, 90); linea(185, 10, 190, 90);   // muros exteriores
  linea(99, 10, 101, 45); linea(99, 56, 101, 90);                                                    // muro con puerta
  linea(20, 16, 21, 30); linea(20, 30, 50, 30); linea(50, 16, 50, 30);                               // mesón (línea fina)
  return { ancho, alto, trazo, distancia: distanciaATrazos(trazo, ancho, alto) };
}

describe('detección de recintos en la lámina', () => {
  it('cierra la puerta entre recintos y suma el mobiliario al recinto que lo rodea', () => {
    const mapa = planoDePrueba();
    const [a, b] = detectarRecintos(mapa, [[60, 60], [150, 60]], { radios: [1, 3, 6], tolerancia: 1, anchoMinimoAnexo: 6, grosorLinea: 3 });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Interior de cada recinto: unos 83×69 px. Con el mesón sumado, el primero no pierde su superficie.
    expect(areaPoligono(a!)).toBeGreaterThan(83 * 69 * 0.95);
    expect(areaPoligono(b!)).toBeGreaterThan(83 * 69 * 0.95);
    // En la puerta, el contorno puede asomarse unos píxeles, pero no invade el otro recinto.
    expect(Math.max(...a!.map(p => p[0]))).toBeLessThan(110);
    expect(areaPoligono(a!)).toBeLessThan(83 * 69 * 1.1);
    expect(Math.min(...b!.map(p => p[0]))).toBeGreaterThan(90);
  });

  it('no inventa un recinto si el rótulo está fuera de un espacio cerrado', () => {
    const [fuera] = detectarRecintos(planoDePrueba(), [[5, 5]], { radios: [1, 3], tolerancia: 1, anchoMinimoAnexo: 6, grosorLinea: 3 });
    expect(fuera).toBeNull();
  });

  it('no suma al recinto un espacio que también da a otro recinto (un vestíbulo)', () => {
    const ancho = 200, alto = 100;
    const trazo = new Uint8Array(ancho * alto);
    const linea = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) trazo[y * ancho + x] = 1;
    };
    linea(10, 10, 190, 11); linea(10, 89, 190, 90); linea(10, 10, 11, 90); linea(189, 10, 190, 90);
    linea(80, 10, 81, 90); linea(120, 10, 121, 90);                    // vestíbulo entre los dos recintos
    linea(80, 50, 81, 50);
    const mapa = { ancho, alto, trazo, distancia: distanciaATrazos(trazo, ancho, alto) };
    const [a, b] = detectarRecintos(mapa, [[40, 50], [160, 50]], { radios: [1], tolerancia: 1, anchoMinimoAnexo: 6, grosorLinea: 3 });
    expect(Math.max(...a!.map(p => p[0]))).toBeLessThan(85);
    expect(Math.min(...b!.map(p => p[0]))).toBeGreaterThan(115);
  });

  it('cierra en línea recta el vano entre dos puntas de muro', () => {
    // Un muro con una puerta de 30 px entre x = 50 y x = 80.
    const cierres = lineasDeCierre([[0, 0, 50, 0], [80, 0, 150, 0]], 3, 40);
    expect(cierres).toContainEqual([50, 0, 80, 0]);
    expect(lineasDeCierre([[0, 0, 50, 0], [120, 0, 150, 0]], 3, 40)).toHaveLength(0);
  });

  it('deja rectos los bordes casi horizontales o verticales', () => {
    const casi: Punto[] = [[0, 0], [100, 2], [101, 50], [1, 49]];
    const recto = ortogonalizar(casi);
    expect(recto).toHaveLength(4);
    expect(recto[0][1]).toBe(recto[1][1]);
    expect(recto[1][0]).toBe(recto[2][0]);
  });

  it('simplifica un contorno quitando los puntos alineados', () => {
    const borde: Punto[] = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]];
    expect(simplificar(borde, 0.5)).toHaveLength(4);
  });
});
