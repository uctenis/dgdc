import { describe, expect, it } from 'vitest';
import { alertasRecinto, codigoAnteriorRecinto, notasPorRevisar, observacionesSinNotas } from '../utils/alertasRecinto';

const base = { codigo: 'CSF01_106', edificio_codigo: 'CSF01', nombre: 'OFICINA', estado: 'Operativo' as const, observaciones: null };

describe('alertas de calidad de un recinto', () => {
  it('detecta superficies faltantes o imposibles', () => {
    expect(alertasRecinto({ ...base, superficie_m2: null, superficie_oguc_m2: null })).toEqual(['sin superficies']);
    expect(alertasRecinto({ ...base, superficie_m2: 0, superficie_oguc_m2: 12 })[0]).toMatch(/sin superficie útil/);
    expect(alertasRecinto({ ...base, superficie_m2: 52.04, superficie_oguc_m2: 27.95 })[0]).toMatch(/mayor que la OGUC/);
    expect(alertasRecinto({ ...base, superficie_m2: 3.1, superficie_oguc_m2: 33.67 })[0]).toMatch(/muy superior/);
    expect(alertasRecinto({ ...base, superficie_m2: 10.21, superficie_oguc_m2: 11.24 })).toEqual([]);
  });

  it('detecta cuando un código numérico de 3 dígitos no calza con el piso asignado', () => {
    expect(alertasRecinto({ ...base, codigo: 'CRC09_116', edificio_codigo: 'CRC09', superficie_m2: 12, superficie_oguc_m2: 13, piso_codigo: '3' }))
      .toEqual(['el código (116) sugiere piso 1, pero está en el piso 3']);
    expect(alertasRecinto({ ...base, codigo: 'CRC09_316', edificio_codigo: 'CRC09', superficie_m2: 12, superficie_oguc_m2: 13, piso_codigo: '3' }))
      .toEqual([]);
  });

  it('extrae el código anterior solo cuando difiere del actual', () => {
    expect(codigoAnteriorRecinto({ codigo: 'CJP01_101', edificio_codigo: 'CJP01', atributos: { 'CÓDIGO ANTIGUO': 'FAAD-101' } })).toBe('FAAD-101');
    expect(codigoAnteriorRecinto({ codigo: 'CJP01_101', edificio_codigo: 'CJP01', atributos: { 'CÓDIGO ANTIGUO': 'CJP01_101' } })).toBeNull();
    expect(codigoAnteriorRecinto({ codigo: 'CJP01_101', edificio_codigo: 'CJP01', atributos: { 'CÓDIGO ANTIGUO': '101' } })).toBeNull();
  });

  it('suma las notas «Por revisar» y no revisa recintos eliminados', () => {
    const obs = 'Instalado en 2024.\nPor revisar: el código no corresponde a su edificio (CJP107).';
    expect(notasPorRevisar(obs)).toEqual(['el código no corresponde a su edificio (CJP107)']);
    expect(observacionesSinNotas(obs)).toEqual(['Instalado en 2024.']);
    expect(alertasRecinto({ ...base, superficie_m2: 10, superficie_oguc_m2: 11, observaciones: obs })).toHaveLength(1);
    expect(alertasRecinto({ ...base, estado: 'Eliminado', superficie_m2: null, superficie_oguc_m2: null })).toEqual([]);
    expect(alertasRecinto({ ...base, nombre: '?', superficie_m2: 10, superficie_oguc_m2: 11 })).toEqual(['sin tipo de recinto']);
  });
});
