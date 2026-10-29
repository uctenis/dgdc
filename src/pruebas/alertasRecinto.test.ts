import { describe, expect, it } from 'vitest';
import { alertasRecinto, notasPorRevisar, observacionesSinNotas } from '../utils/alertasRecinto';

const base = { codigo: 'CSF01_106', edificio_codigo: 'CSF01', nombre: 'OFICINA', estado: 'Operativo' as const, observaciones: null };

describe('alertas de calidad de un recinto', () => {
  it('detecta superficies faltantes o imposibles', () => {
    expect(alertasRecinto({ ...base, superficie_m2: null, superficie_oguc_m2: null })).toEqual(['sin superficies']);
    expect(alertasRecinto({ ...base, superficie_m2: 0, superficie_oguc_m2: 12 })[0]).toMatch(/sin superficie útil/);
    expect(alertasRecinto({ ...base, superficie_m2: 52.04, superficie_oguc_m2: 27.95 })[0]).toMatch(/mayor que la OGUC/);
    expect(alertasRecinto({ ...base, superficie_m2: 3.1, superficie_oguc_m2: 33.67 })[0]).toMatch(/muy superior/);
    expect(alertasRecinto({ ...base, superficie_m2: 10.21, superficie_oguc_m2: 11.24 })).toEqual([]);
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
