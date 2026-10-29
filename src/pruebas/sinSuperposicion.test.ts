import { describe, expect, it } from 'vitest';
import { recortarContraVecinos } from '../utils/sinSuperposicion';
import { puentesDeVanos, ventanasEntreMuros } from '../utils/deteccionRecintos';
import { areaPoligono, type Punto } from '../utils/geometriaPlano';

const rect = (x0: number, y0: number, x1: number, y1: number): Punto[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe('contornos sin superposición', () => {
  it('quita al contorno lo que ocupa el vecino', () => {
    const r = recortarContraVecinos(rect(0, 0, 0.4, 0.2), [rect(0.3, 0, 0.6, 0.2)]);
    expect(Math.abs(areaPoligono(r!))).toBeCloseTo(0.3 * 0.2, 6);
  });
  it('deja igual un contorno que no toca a nadie', () => {
    const p = rect(0, 0, 0.1, 0.1);
    expect(recortarContraVecinos(p, [rect(0.5, 0.5, 0.6, 0.6)])).toBe(p);
  });
  it('no queda nada si el contorno está dentro de otro', () => {
    expect(recortarContraVecinos(rect(0.1, 0.1, 0.2, 0.2), [rect(0, 0, 0.5, 0.5)])).toBeNull();
  });
  it('si el recorte lo parte, queda el pedazo más grande', () => {
    const r = recortarContraVecinos(rect(0, 0, 1, 0.1), [rect(0.6, 0, 0.7, 0.1)]);
    expect(Math.abs(areaPoligono(r!))).toBeCloseTo(0.6 * 0.1, 6);
  });
});

describe('cierre de vanos', () => {
  it('prolonga un muro de contorno doble hasta el muro siguiente (puerta)', () => {
    // Dos muros en línea, dibujados como rectángulos huecos, con 80 px de puerta entre ellos.
    const muro = (x0: number, x1: number): [number, number, number, number][] => [[x0, 0, x1, 0], [x1, 0, x1, 10], [x1, 10, x0, 10], [x0, 10, x0, 0]];
    const puentes = puentesDeVanos([...muro(0, 200), ...muro(280, 480)], { minimo: 3, maximo: 100, largoMinimo: 20 });
    expect(puentes).toContainEqual([200, 0, 280, 0]);
    expect(puentes).toContainEqual([200, 10, 280, 10]);
  });
  it('no cierra un vano más ancho que una puerta sin ventana', () => {
    expect(puentesDeVanos([[0, 0, 200, 0], [400, 0, 600, 0]], { minimo: 3, maximo: 100, largoMinimo: 20, maximoVentana: 400 })).toEqual([]);
  });
  it('cierra un ventanal largo dibujado con líneas finas', () => {
    const finas: [number, number, number, number][] = [[200, 2, 400, 2], [200, 6, 400, 6]];
    expect(puentesDeVanos([[0, 0, 200, 0], [400, 0, 600, 0]], { minimo: 3, maximo: 100, largoMinimo: 20, maximoVentana: 400, lineas: finas })).toContainEqual([200, 0, 400, 0]);
  });
  it('reconoce una ventana entre dos muros y no un mueble suelto', () => {
    const muros: [number, number, number, number][] = [[0, 0, 300, 0], [0, 300, 300, 300]];
    const ventana: [number, number, number, number][] = [[50, 0, 50, 300], [56, 0, 56, 300]];
    const mueble: [number, number, number, number][] = [[150, 100, 150, 200], [156, 100, 156, 200]];
    expect(ventanasEntreMuros(muros, [...ventana, ...mueble], 50, 20)).toEqual(ventana);
  });
});
