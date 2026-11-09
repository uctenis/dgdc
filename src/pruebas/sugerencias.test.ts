import { describe, expect, it } from 'vitest';
import { catalogoPersonas, catalogoUnidades, filtrarOpciones, unidadSugerida } from '../utils/sugerencias';
import type { Recinto } from '../types/recintos';

const r = (id: string, piso: string, unidad: string, extra: Partial<Recinto> = {}) =>
  ({ id, piso_id: piso, unidad_usuaria: unidad, estado: 'Operativo', ...extra } as Recinto);

describe('autocompletado y sugerencias del recinto', () => {
  it('encuentra unidades sin tildes y con palabras sueltas, separando las compartidas', () => {
    const cat = catalogoUnidades([r('1', 'p', 'Carrera de Medicina Veterinaria / Decanato'), r('2', 'p', 'Carrera de Medicina Veterinaria')]);
    expect(filtrarOpciones(cat, 'vete').map(o => [o.texto, o.usos])).toEqual([['Carrera de Medicina Veterinaria', 2]]);
    expect(filtrarOpciones(cat, 'decan').map(o => o.texto)).toEqual(['Decanato']);
  });

  it('sugiere la unidad que usa la mayoría del piso', () => {
    const recintos = [r('1', 'p1', 'Veterinaria'), r('2', 'p1', 'Veterinaria'), r('3', 'p1', 'Agronomía'), r('4', 'p2', 'Rectoría')];
    expect(unidadSugerida({ id: 'nuevo', piso_id: 'p1' }, recintos)).toEqual({ unidad: 'Veterinaria', usan: 2, de: 3, donde: 'piso' });
  });

  it('lista cada persona una vez con su cargo, aunque esté escrita distinto', () => {
    const p = catalogoPersonas([{ ocupantes: [{ nombre: 'Pérez Soto, Juan', cargo: 'Director' }] }, { ocupantes: [{ nombre: 'JUAN PEREZ SOTO' }] }]);
    expect(p).toEqual([{ texto: 'Pérez Soto, Juan', usos: 2, cargo: 'Director', unidad: null }]);
  });
});
