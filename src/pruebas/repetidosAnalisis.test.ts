import { describe, expect, it } from 'vitest';
import { buscarRepetidos, type FilaAnalisis } from '../utils/analisisEspacios';

const fila = (codigo: string, extra: Partial<FilaAnalisis> = {}): FilaAnalisis => ({
  id: codigo, campus: 'CJP', campusNombre: 'Campus', edificio: 'CJP08', edificioNombre: 'Edificio 8', piso: 'Piso 3', pisoOrden: 3,
  codigo, tipo: 'OFICINA', uso: '', unidades: [], clase: 'Útil', estado: 'Operativo', util: 10, oguc: 11, capacidad: 0, ocupantes: [], ...extra,
});

describe('duplicados en el análisis', () => {
  const filas = [
    fila('CJP08_301', { ocupantes: [{ nombre: 'PÉREZ SOTO, JUAN', cargo: 'DIRECTOR' }] }),
    fila('CJP08_302', { util: 15, ocupantes: [{ nombre: 'Juan Perez Soto' }, { nombre: 'Ana Rojas' }] }),
    fila('CJP08_303', { ocupantes: [{ nombre: 'Ana Rojas' }] }),
    fila('CJP08_304', { ocupantes: [{ nombre: 'Luis Díaz' }] }),
    fila('CJP08_304', { id: 'otro', ocupantes: [] }),
  ];

  it('reconoce a una persona en varios recintos aunque su nombre esté escrito distinto', () => {
    const r = buscarRepetidos(filas, 'persona');
    expect(r.map(x => [x.recintos.map(f => f.codigo), x.util])).toEqual([
      [['CJP08_302', 'CJP08_303'], 25],
      [['CJP08_301', 'CJP08_302'], 25],
    ]);
    expect(r.find(x => x.recintos.some(f => f.codigo === 'CJP08_301'))!.detalles).toEqual(['DIRECTOR']);
  });

  it('encuentra códigos de recinto repetidos', () => {
    expect(buscarRepetidos(filas, 'codigo').map(x => [x.clave, x.recintos.length])).toEqual([['CJP08_304', 2]]);
  });
});

describe('personas', () => {
  it('lista a cada persona una vez, con sus edificios y recintos', async () => {
    const { listarPersonas } = await import('../utils/analisisEspacios');
    const p = listarPersonas([
      fila('CJP08_301', { ocupantes: [{ nombre: 'Pérez Soto, Juan', cargo: 'Director' }] }),
      fila('CJP01_101', { edificio: 'CJP01', ocupantes: [{ nombre: 'JUAN PEREZ SOTO' }, { nombre: 'Ana Rojas' }] }),
    ]);
    expect(p.map(x => [x.nombre, x.recintos.length, x.edificios])).toEqual([['Ana Rojas', 1, ['CJP01']], ['Pérez Soto, Juan', 2, ['CJP01', 'CJP08']]]);
    expect(p[1].cargos).toEqual(['Director']);
  });

  it('filtra duplicados solo en oficinas y detecta nombres incompletos o similares', () => {
    const mixtas = [
      fila('CJP08_101', { tipo: 'SALA CATEDRA', ocupantes: [{ nombre: 'Molina Valenzuela, Brigida del Pilar' }] }),
      fila('CJP08_201', { tipo: 'OFICINA', ocupantes: [{ nombre: 'Molina Valenzuela, Brigida del Pilar' }, { nombre: 'Luis Caro' }] }),
      fila('CJP08_202', { tipo: 'OFICINA', ocupantes: [{ nombre: 'Caro Saldivia, Luis Alberto' }] }),
    ];
    expect(buscarRepetidos(mixtas, 'oficina')).toEqual([]);
    expect(buscarRepetidos(mixtas, 'persona').map(x => x.clave)).toEqual(['Molina Valenzuela, Brigida del Pilar']);
    expect(buscarRepetidos(mixtas, 'similar').map(x => [x.clave, x.recintos.map(r => r.codigo)])).toEqual([
      ['Luis Caro ↔ Caro Saldivia, Luis Alberto', ['CJP08_201', 'CJP08_202']],
    ]);
  });
});
