import { describe, expect, it } from 'vitest';
import { evaluarCotizaciones } from '../services/evaluationEngine';
import type { Cotizacion } from '../types';

const oferta = (id: string, montoTotal: number, aspectosTecnicos: number, sustentable: boolean): Cotizacion => ({
  id, licitacionId: 'lic', proveedorId: id, proveedorRut: '', proveedorNombre: id,
  montoNeto: Math.round(montoTotal / 1.19), montoIva: montoTotal - Math.round(montoTotal / 1.19), montoTotal, plazoDias: 30,
  ajustaRequerimientos: aspectosTecnicos >= 1, cuentaExperiencia: aspectosTecnicos >= 2, cumplePlazoRequerido: aspectosTecnicos >= 3,
  declaraSustentabilidad: sustentable, fechaCarga: '2026-01-01',
});

describe('evaluación de ofertas (55 % económico, 35 % técnico, 10 % sustentabilidad)', () => {
  it('sin ofertas no hay resultado', () => {
    expect(evaluarCotizaciones([])).toEqual([]);
  });

  it('la oferta más barata saca 100 en lo económico y las demás en proporción', () => {
    const [a, b] = evaluarCotizaciones([oferta('barata', 80_000_000, 3, true), oferta('cara', 100_000_000, 3, true)]);
    expect(a.proveedorId).toBe('barata');
    expect(a.puntajeEconomico).toBe(100);
    expect(b.puntajeEconomico).toBe(80);
    expect(a.puntajeTotalPonderado).toBe(100);
    expect(b.puntajeTotalPonderado).toBe(89); // 80×0,55 + 100×0,35 + 100×0,10
  });

  it('una oferta más cara puede ganar por lo técnico y la sustentabilidad', () => {
    const resultado = evaluarCotizaciones([oferta('barata', 80_000_000, 2, false), oferta('completa', 100_000_000, 3, true)]);
    const completa = resultado.find(r => r.proveedorId === 'completa')!;
    const barata = resultado.find(r => r.proveedorId === 'barata')!;
    expect(barata.puntajeTecnico).toBe(60);
    expect(barata.puntajeTotalPonderado).toBe(76); // 100×0,55 + 60×0,35 + 0
    expect(completa.puntajeTotalPonderado).toBe(89); // 80×0,55 + 100×0,35 + 100×0,10
    expect(completa.ranking).toBe(1);
    expect(completa.esPropuestaAdjudicada).toBe(true);
    expect(barata.esPropuestaAdjudicada).toBe(false);
  });

  it('el puntaje técnico es 100, 60, 40 o 0 según cuántos de los 3 aspectos cumple', () => {
    const puntajes = [3, 2, 1, 0].map(n => evaluarCotizaciones([oferta('x', 1_000_000, n, false)])[0].puntajeTecnico);
    expect(puntajes).toEqual([100, 60, 40, 0]);
  });

  it('en empate de puntaje queda primero la de menor precio, y solo una se marca adjudicada', () => {
    // Dos ofertas idénticas empatan en puntaje.
    const resultado = evaluarCotizaciones([oferta('segunda', 100_000_000, 3, false), oferta('primera', 100_000_000, 3, false)]);
    expect(resultado[0].puntajeTotalPonderado).toBe(resultado[1].puntajeTotalPonderado);
    expect(resultado.map(r => r.ranking)).toEqual([1, 2]);
    expect(resultado.filter(r => r.esPropuestaAdjudicada)).toHaveLength(1);
  });

  it('una oferta sin monto no recibe puntaje económico ni cuenta como la más barata', () => {
    const resultado = evaluarCotizaciones([oferta('sinMonto', 0, 3, true), oferta('real', 50_000_000, 3, true)]);
    expect(resultado.find(r => r.proveedorId === 'sinMonto')!.puntajeEconomico).toBe(0);
    expect(resultado.find(r => r.proveedorId === 'real')!.puntajeEconomico).toBe(100);
  });
});
