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
