import { describe, expect, it } from 'vitest';
import { cubicarEdificio, perimetroDe } from '../utils/cubicacion';
import type { Piso, Recinto } from '../types/recintos';

const piso = (id: string, orden: number, altura?: number): Piso => ({ id, edificio_codigo: 'X', codigo: String(orden), nombre: `Piso ${orden}`, orden, altura_m: altura, altura_origen: altura ? 'CAD (cotas de nivel)' : null } as Piso);
const recinto = (id: string, pisoId: string, util: number, perimetro?: number): Recinto =>
  ({ id, edificio_codigo: 'X', piso_id: pisoId, codigo: id, nombre: 'Oficina', superficie_m2: util, superficie_oguc_m2: util, estado: 'Operativo', perimetro_m: perimetro } as Recinto);

describe('cubicación base', () => {
  it('usa el perímetro medido o, sin contorno, el de un cuadrado de igual superficie', () => {
    expect(perimetroDe(recinto('a', 'p', 16, 18))).toEqual({ m: 18, estimado: false });
    expect(perimetroDe(recinto('b', 'p', 16))).toEqual({ m: 16, estimado: true });
  });

  it('muros = perímetro × altura del piso (la del CAD o la por defecto)', () => {
    const { porPiso, total } = cubicarEdificio([piso('p1', 1, 3), piso('p2', 2)], [recinto('a', 'p1', 20, 18), recinto('b', 'p2', 16)]);
    expect(porPiso[0]).toMatchObject({ altura: 3, muros: 54, util: 20, alturaOrigen: 'CAD (cotas de nivel)' });
    expect(porPiso[1]).toMatchObject({ altura: 2.6, perimetrosEstimados: 1 });
    expect(Math.round(total.muros * 10) / 10).toBe(54 + 41.6);
  });
});
