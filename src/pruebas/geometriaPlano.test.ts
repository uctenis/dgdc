import { describe, expect, it } from 'vitest';
import { ajustarPuntoOrtogonal, areaPoligono, areaRealM2, centroide, colorDeCategoria, denominadorEscala, estimarEscala, puntoEnPoligono, type Punto } from '../utils/geometriaPlano';

const cuadrado: Punto[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

describe('geometría del visor de planos', () => {
  it('calcula áreas y centros de polígonos', () => {
    expect(areaPoligono(cuadrado)).toBe(1);
    expect(areaPoligono([[0, 0], [4, 0], [4, 3]])).toBe(6);
    expect(centroide(cuadrado)).toEqual([0.5, 0.5]);
  });

  it('lee la escala del plano', () => {
    expect([denominadorEscala('1:65'), denominadorEscala('1/250'), denominadorEscala(' 1 : 100 '), denominadorEscala('50'), denominadorEscala('sin escala'), denominadorEscala(null)])
      .toEqual([65, 250, 100, 50, null, null]);
  });

  it('pasa un contorno dibujado a m² reales según la escala', () => {
    // Página de 1000 × 1000 pt a escala 1:100: un cuadrado de 72 pt de lado es 1 pulgada en papel = 2,54 m reales.
    const lado = 72 / 1000;
    const recinto: Punto[] = [[0, 0], [lado, 0], [lado, lado], [0, lado]];
    expect(areaRealM2(recinto, 1000, 1000, '1:100')).toBeCloseTo(2.54 * 2.54, 6);
    expect(areaRealM2(recinto, 1000, 1000, '')).toBeNull();
  });

  it('sabe si un punto cae dentro de un recinto', () => {
    expect(puntoEnPoligono([0.5, 0.5], cuadrado)).toBe(true);
    expect(puntoEnPoligono([1.5, 0.5], cuadrado)).toBe(false);
    expect(puntoEnPoligono([0.2, 0.9], [[0, 0], [1, 0], [0, 1]])).toBe(false);
  });

  it('da siempre el mismo color a la misma categoría', () => {
    expect(colorDeCategoria('OFICINA')).toBe(colorDeCategoria('oficina'));
    expect(colorDeCategoria('OFICINA')).not.toBe(colorDeCategoria('BAÑO'));
  });

  it('alinea magnéticamente en horizontal y vertical al mover una esquina, pero permite diagonal libre', () => {
    const origen: Punto = [0.5, 0.2];
    const vecinos: Punto[] = [[0.2, 0.2], [0.5, 0.6]];
    // Desplazamiento horizontal con leve desvío vertical (5 px en 1000 px): mantiene Y = 0.2
    const horiz = ajustarPuntoOrtogonal([0.65, 0.205], origen, vecinos, 1000, 1000);
    expect(horiz.punto).toEqual([0.65, 0.2]);
    expect(horiz.guiaY).toBe(0.2);
    // Desplazamiento vertical con leve desvío horizontal (4 px en 1000 px): mantiene X = 0.5
    const vert = ajustarPuntoOrtogonal([0.504, 0.35], origen, vecinos, 1000, 1000);
    expect(vert.punto).toEqual([0.5, 0.35]);
    expect(vert.guiaX).toBe(0.5);
    // Desplazamiento claramente diagonal (50 px en X y 50 px en Y, lejos de vecinos): queda libre
    const diag = ajustarPuntoOrtogonal([0.55, 0.25], origen, vecinos, 1000, 1000);
    expect(diag.punto).toEqual([0.55, 0.25]);
  });

  it('estima automáticamente la escala de la lámina a partir de los recintos ubicados', () => {
    const lado = 72 / 1000; // 1 pulgada en página de 1000 pt -> a escala 1:50 mide 1,27 m de lado = 1,6129 m²
    const poligono: Punto[] = [[0, 0], [lado, 0], [lado, lado], [0, lado]];
    expect(estimarEscala([{ poligono, superficieM2: 1.27 * 1.27 }], 1000, 1000)).toBe('1:50');
  });
});
