import { describe, expect, it } from 'vitest';
import { alinearLaminas, emparejarRecintos, trasladarContorno, type ImagenTrazos } from '../utils/copiarContornos';
import type { Recinto } from '../types/recintos';

const recinto = (id: string, codigo: string, nombre: string) => ({ id, codigo, nombre, edificio_codigo: codigo.split('_')[0], piso_id: 'p' }) as Recinto;

describe('copiar contornos entre láminas iguales', () => {
  it('empareja por número y, si falta, por nombre único', () => {
    const origen = [recinto('a', 'CSN16_103', 'Dormitorio'), recinto('b', 'CSN16_105', 'Closet'), recinto('c', 'CSN16_109', 'Baño')];
    const destino = [recinto('x', 'CSN15_103', 'Dormitorio'), recinto('y', 'CSN15_107', 'Closet'), recinto('z', 'CSN15_104', 'Bodega')];
    const pares = emparejarRecintos(origen, destino);
    expect(pares.get('a')?.id).toBe('x');
    expect(pares.get('b')?.id).toBe('y');
    expect(pares.has('c')).toBe(false);
  });

  it('halla el desplazamiento del dibujo y rechaza un dibujo distinto', () => {
    const ancho = 400, alto = 300;
    const dibujo = (dx: number, dy: number, forma: 'L' | 'cruz'): ImagenTrazos => {
      const oscuro = new Uint8Array(ancho * alto);
      const marcar = (x: number, y: number) => { oscuro[(y + dy) * ancho + x + dx] = 1; };
      for (let i = 0; i < 120; i++) {
        if (forma === 'L') { marcar(100 + i, 200); marcar(100, 80 + i); marcar(100 + i, 140); }
        else { marcar(100 + i, 140); marcar(160, 80 + i); }
      }
      return { ancho, alto, oscuro };
    };
    const origen = dibujo(0, 0, 'L');
    const calce = alinearLaminas(origen, dibujo(23, -11, 'L'), [90, 70, 230, 210]);
    expect(calce).toMatchObject({ dx: 23, dy: -11 });
    expect(alinearLaminas(origen, dibujo(0, 0, 'cruz'), [90, 70, 230, 210])).toBeNull();
    expect(trasladarContorno([[0.25, 0.5]], origen, origen, 40, -30)).toEqual([[0.35, 0.4]]);
  });
});
