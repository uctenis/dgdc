import { describe, expect, it } from 'vitest';
import { areaPoligono, areaRealM2, centroide, colorDeCategoria, denominadorEscala, puntoEnPoligono, type Punto } from '../utils/geometriaPlano';

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
});
