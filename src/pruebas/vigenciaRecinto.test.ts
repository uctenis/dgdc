import { describe, expect, it } from 'vitest';
import { porVenir, resumenSuperficie, textoVigencia, vigenteEn } from '../utils/vigenciaRecinto';
import type { Recinto } from '../types/recintos';

const r = (extra: Partial<Recinto>) => ({ estado: 'Operativo' as Recinto['estado'], superficie_m2: 10, superficie_oguc_m2: 12, tenencia: 'Propia' as const, fecha_alta: null, fecha_baja: null, ...extra });

describe('vigencia de recintos', () => {
  it('sin fechas existe siempre; eliminado sin fecha de baja no cuenta', () => {
    expect(vigenteEn(r({}), '2020-01-01')).toBe(true);
    expect(vigenteEn(r({ estado: 'Eliminado' }), '2020-01-01')).toBe(false);
  });

  it('arriendo terminado: cuenta antes de la baja y no después (NSL, mayo 2025)', () => {
    const nsl = r({ estado: 'Eliminado', tenencia: 'Arrendada', fecha_baja: '2025-05-31' });
    expect(vigenteEn(nsl, '2025-05-30')).toBe(true);
    expect(vigenteEn(nsl, '2025-05-31')).toBe(false);
    expect(textoVigencia(nsl, '2026-11-04')).toMatch(/^de baja desde/);
  });

  it('obra por entregar: no suma hoy, sí desde su fecha (CRC11, marzo 2027)', () => {
    const casino = r({ estado: 'En obra', fecha_alta: '2027-03-01', superficie_m2: 316.14 });
    expect(vigenteEn(casino, '2026-11-04')).toBe(false);
    expect(porVenir(casino, '2026-11-04')).toBe(true);
    expect(vigenteEn(casino, '2027-03-01')).toBe(true);
  });

  it('resume la superficie vigente, la no propia y la por venir', () => {
    const lista = [r({}), r({ tenencia: 'Arrendada', superficie_m2: 5 }), r({ fecha_alta: '2027-03-01', superficie_m2: 100 }), r({ estado: 'Eliminado', superficie_m2: 50 })];
    const hoy = resumenSuperficie(lista, '2026-11-04');
    expect(hoy).toMatchObject({ recintos: 2, util: 15, oguc: 24, noPropia: { recintos: 1, util: 5 }, porVenir: { recintos: 1, util: 100, desde: '2027-03-01' } });
    expect(resumenSuperficie(lista, '2027-06-01').util).toBe(115);
  });
});
