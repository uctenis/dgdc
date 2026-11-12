import { describe, expect, it } from 'vitest';
import { interpretarLocal } from '../utils/interpreteLocal';
import { ejecutarPlan } from '../utils/consultaIA';
import type { FilaAnalisis } from '../utils/analisisEspacios';

const fila = (codigo: string, tipo: string, util: number, extra: Partial<FilaAnalisis> = {}): FilaAnalisis => ({
  id: codigo, campus: codigo.slice(0, 3), campusNombre: '', edificio: codigo.split('_')[0], edificioNombre: '', piso: 'Piso 3', pisoOrden: 3,
  codigo, tipo, uso: '', unidades: [], clase: '', estado: 'Operativo', vigente: true, util, oguc: 0, capacidad: 0, ocupantes: [], ...extra,
});
const filas = [
  fila('CSF16_301', 'Oficina', 12), fila('CSF16_302', 'Oficina', 10.5), fila('CSF16_303', 'Oficina doble', 9), fila('CSF16_201', 'Baño', 4, { piso: 'Piso 2' }),
  fila('CJP01_101', 'Sala de clases', 60, { piso: 'Piso 1' }), fila('CJP01_102', 'Sala de clases', 55, { piso: 'Piso 1' }),
  fila('CRC08_101', 'Oficina', 15, { unidades: ['Dirección de Desarrollo de Personas'] }),
];
const campus = { CSF: 'Campus San Francisco', CJP: 'Campus San Juan Pablo II', CRC: 'Campus Doctor Luis Rivas Del Canto' };
const responder = (p: string) => { const plan = interpretarLocal(p, filas, campus); return plan && ejecutarPlan(filas, plan); };

describe('intérprete local (sin IA)', () => {
  it('oficinas por número dentro de un edificio', () => {
    const r = responder('¿Cuántos m² tienen las oficinas 301, 302 y 303 del CSF16?');
    expect(r?.totales.util).toBe(31.5);
  });
  it('siglas de unidad y edificio', () => {
    expect(responder('superficie de la DDPER en CRC08')?.totales.util).toBe(15);
  });
  it('tipo en plural, agrupado por campus, contando recintos', () => {
    const r = responder('¿Cuántas salas de clases hay en cada campus?');
    expect(r?.plan.medida).toBe('recintos');
    expect(r?.plan.agrupar).toBe('campus');
    expect(r?.totales.recintos).toBe(2);
  });
  it('campus por nombre y piso', () => {
    expect(responder('superficie del piso 2 del campus San Francisco')?.totales.util).toBe(4);
  });
  it('un tipo de una palabra incluye sus variantes', () => {
    expect(responder('oficinas del CSF16')?.totales.recintos).toBe(3);
  });
  it('deja a la IA lo que no entiende y las preguntas encadenadas', () => {
    expect(interpretarLocal('¿cuánto costó remodelar el CSF16?', filas, campus)).toBeNull();
    expect(interpretarLocal('¿y en el piso 2?', filas, campus)).toBeNull();
    expect(interpretarLocal('hola', filas, campus)).toBeNull();
  });
});
