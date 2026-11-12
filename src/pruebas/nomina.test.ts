import { describe, expect, it } from 'vitest';
import { buscarEnNomina, claveNombre, type Funcionario } from '../services/nomina';

const f = (nombre: string): Funcionario => ({ clave: claveNombre(nombre), nombre, tipo_contrato: 'INDEFINIDO', telefono: null, campus: null, edificio_codigo: null, edificio: null, unidad: null, nomina: '2026-11-09' });
const nomina = new Map([f('PEREZ  SOTO, ANA MARIA'), f('BELTRAN FUENTES, CAMILA JESUS'), f('MUÑOZ ROJAS, JUAN')].map(x => [x.clave, x]));

describe('nómina de funcionarios', () => {
  it('normaliza tildes, espacios y comas', () => {
    expect(claveNombre('Pérez  Soto ,Ana María')).toBe('PEREZ SOTO, ANA MARIA');
  });
  it('reconoce al vigente, al escrito distinto y al que no figura', () => {
    expect(buscarEnNomina(nomina, 'Muñoz Rojas, Juan').estado).toBe('vigente');
    expect(buscarEnNomina(nomina, 'Beltran Fuenets, Camila Jesus').estado).toBe('parecido');
    expect(buscarEnNomina(nomina, 'Pérez Soto, Ana').estado).toBe('parecido');
    expect(buscarEnNomina(nomina, 'González Lagos, Pedro Pablo').estado).toBe('no-figura');
  });
  it('no evalúa unidades ni textos genéricos', () => {
    expect(buscarEnNomina(nomina, 'Centro de Estudiantes').estado).toBe('no-aplica');
    expect(buscarEnNomina(new Map(), 'Muñoz Rojas, Juan').estado).toBe('no-aplica');
  });
});
