import { describe, expect, it } from 'vitest';
import { agrupar, cruzar, filtrar, fraseRespuesta, totales, type FilaAnalisis } from '../utils/analisisEspacios';

const fila = (codigo: string, extra: Partial<FilaAnalisis>): FilaAnalisis => ({
  id: codigo, campus: 'CJP', campusNombre: 'Campus San Juan Pablo II', edificio: 'CJP08', edificioNombre: 'Edificio 8', piso: 'Piso 3', pisoOrden: 3,
  codigo, tipo: 'SALA CATEDRA', uso: 'SALA', unidades: [], clase: 'Útil', estado: 'Operativo', util: 50, oguc: 55, capacidad: 40, ocupantes: [], ...extra,
});

const FILAS = [
  fila('CJP08_301', {}),
  fila('CJP08_302', { util: 60, oguc: 66 }),
  fila('CJP08_310', { tipo: 'OFICINA', capacidad: 0, util: 12, oguc: 13, unidades: ['CARRERA DE DERECHO', 'DECANATO'], ocupantes: [{ nombre: 'PÉREZ, ANA', cargo: 'SECRETARIA' }] }),
  fila('CJP08_201', { piso: 'Piso 2', pisoOrden: 2, tipo: 'OFICINA', util: 20, oguc: 22, capacidad: 0, unidades: ['CARRERA DE DERECHO'] }),
  fila('CJP01_101', { edificio: 'CJP01', piso: 'Piso 1', pisoOrden: 1, util: 70, oguc: 77 }),
];

describe('cruces de información del Gestor de Espacios', () => {
  it('suma lo que cumple todos los filtros: salas del piso 3 de CJP08', () => {
    const r = filtrar(FILAS, { edificio: ['CJP08'], piso: ['Piso 3'], tipo: ['SALA CATEDRA'] });
    expect(totales(r)).toMatchObject({ recintos: 2, util: 110, oguc: 121, capacidad: 80, edificios: 1, pisos: 1 });
  });

  it('busca por persona o unidad sin importar tildes ni orden', () => {
    expect(filtrar(FILAS, { texto: 'ana perez' }).map(f => f.codigo)).toEqual(['CJP08_310']);
    expect(filtrar(FILAS, { unidad: ['CARRERA DE DERECHO'] })).toHaveLength(2);
  });

  it('agrupa por tipo de mayor a menor, y los pisos de abajo hacia arriba', () => {
    expect(agrupar(FILAS, 'tipo').map(g => [g.clave, g.util])).toEqual([['SALA CATEDRA', 180], ['OFICINA', 32]]);
    expect(agrupar(FILAS, 'piso').map(g => g.clave)).toEqual(['Piso 1', 'Piso 2', 'Piso 3']);
    // Un recinto compartido cuenta entero en cada unidad.
    expect(agrupar(FILAS, 'unidad').find(g => g.clave === 'CARRERA DE DERECHO')?.util).toBe(32);
  });

  it('cruza piso × tipo y junta en «Otros» las columnas que sobran', () => {
    const c = cruzar(FILAS, 'piso', 'tipo', 'util', 1);
    expect(c.columnas).toEqual(['SALA CATEDRA', 'Otros']);
    expect(c.celdas.get('Piso 3\u0000SALA CATEDRA')?.util).toBe(110);
    expect(c.celdas.get('Piso 3\u0000Otros')?.util).toBe(12);
    expect(c.totalFila.get('Piso 3')?.util).toBe(122);
  });

  it('responde la consulta en una frase', () => {
    const filtros = { edificio: ['CJP08'], piso: ['Piso 3'], tipo: ['SALA CATEDRA'] };
    const frase = fraseRespuesta(filtros, totales(filtrar(FILAS, filtros)), { edificio: c => `${c} Edificio 8`, campus: c => c });
    expect(frase).toBe('En CJP08 Edificio 8 · Piso 3 hay 2 recintos de tipo SALA CATEDRA, que suman 110 m² útiles (121 m² OGUC) y capacidad para 80 personas.');
    expect(fraseRespuesta({ tipo: ['GIMNASIO'] }, totales([]), { edificio: c => c, campus: c => c })).toBe('En todos los campus no hay recintos de tipo GIMNASIO.');
  });
});
