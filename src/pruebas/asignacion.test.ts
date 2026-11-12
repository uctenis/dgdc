import { describe, expect, it } from 'vitest';
import { avisoOcupacion, m2PorPersona, personasConRecinto, simularMovimientos, type RecintoAsignable } from '../utils/asignacion';

const r = (id: string, ocupantes: string[], superficie = 20, capacidad?: number): RecintoAsignable =>
  ({ id, codigo: id, nombre: 'Oficina', edificio_codigo: 'CJP01', superficie_m2: superficie, capacidad, ocupantes: ocupantes.map(nombre => ({ nombre })) });
const mapa = (...rs: RecintoAsignable[]) => new Map(rs.map(x => [x.id, x]));

describe('asignación de espacios', () => {
  it('simula un traslado: sale del origen y entra al destino', () => {
    const s = simularMovimientos(mapa(r('A', ['Pérez Soto, Ana', 'Rojas, Luis']), r('B', [])), [{ persona: { nombre: 'Perez Soto, Ana' }, desde_id: 'A', hacia_id: 'B' }]);
    expect(s.find(x => x.recinto.id === 'A')!.despues.map(o => o.nombre)).toEqual(['Rojas, Luis']);
    expect(s.find(x => x.recinto.id === 'B')!.despues.map(o => o.nombre)).toEqual(['Perez Soto, Ana']);
  });
  it('intercambia dos recintos sin perder a nadie', () => {
    const s = simularMovimientos(mapa(r('A', ['Uno, A']), r('B', ['Dos, B'])), [
      { persona: { nombre: 'Uno, A' }, desde_id: 'A', hacia_id: 'B' },
      { persona: { nombre: 'Dos, B' }, desde_id: 'B', hacia_id: 'A' },
    ]);
    expect(s.map(x => [x.recinto.id, x.despues.map(o => o.nombre)])).toEqual([['A', ['Dos, B']], ['B', ['Uno, A']]]);
  });
  it('ubica a alguien sin recinto, conserva origen si se pide y no duplica', () => {
    const s = simularMovimientos(mapa(r('A', ['Uno, A']), r('B', ['Uno, A'])), [
      { persona: { nombre: 'Nuevo, N' }, desde_id: null, hacia_id: 'A' },
      { persona: { nombre: 'Uno, A' }, desde_id: 'A', hacia_id: 'B', conservar_origen: true },
    ]);
    expect(s.find(x => x.recinto.id === 'A')!.despues).toHaveLength(2);
    expect(s.find(x => x.recinto.id === 'B')!.despues).toHaveLength(1);
  });
  it('calcula m² por persona y avisa del hacinamiento', () => {
    expect(m2PorPersona(20, 4)).toBe(5);
    expect(avisoOcupacion(r('A', [], 20), 4)).toMatch(/m² por persona/);
    expect(avisoOcupacion(r('A', [], 40, 2), 3)).toMatch(/capacidad/);
    expect(avisoOcupacion(r('A', [], 40), 2)).toBeNull();
    expect(personasConRecinto([r('A', ['Pérez Soto, Ana'])]).has('ANA PEREZ SOTO')).toBe(true);
  });
  it('cambia de unidad sin cambiar de recinto (mismo origen y destino)', () => {
    const s = simularMovimientos(mapa(r('A', ['Uno, A', 'Dos, B'])), [{ persona: { nombre: 'Uno, A', unidad: 'Unidad Nueva' }, desde_id: 'A', hacia_id: 'A' }]);
    expect(s[0].despues).toHaveLength(2);
    expect(s[0].despues.find(o => o.nombre === 'Uno, A')?.unidad).toBe('Unidad Nueva');
  });
});
