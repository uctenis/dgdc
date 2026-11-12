import { beforeEach, describe, expect, it } from 'vitest';
import { getCampusList, guardarSuperficieCampus, ordenarCampus, ordenarSiglasCampus } from '../data/campusData';

describe('orden de los campus', () => {
  beforeEach(() => localStorage.clear());

  it('pone primero a Menchaca Lira (Rectoría) y luego de mayor a menor superficie', () => {
    guardarSuperficieCampus({ CJP: 36000, CSF: 32000, CRC: 16000, CML: 3000, CSN: 400 });
    const orden = ordenarCampus([{ sigla: 'CSN' }, { sigla: 'CRC' }, { sigla: 'CML' }, { sigla: 'CSF' }, { sigla: 'CJP' }, { sigla: 'CLE' }]).map(c => c.sigla);
    expect(orden).toEqual(['CML', 'CJP', 'CSF', 'CRC', 'CSN', 'CLE']);
    expect(ordenarSiglasCampus(['CSN', 'CRC', 'CML', 'CSF', 'CJP', 'CLE'])).toEqual(['CML', 'CJP', 'CSF', 'CRC', 'CSN', 'CLE']);
  });

  it('sin datos guardados usa el orden de respaldo en todo el catálogo', () => {
    expect(ordenarCampus([{ sigla: 'CSD' }, { sigla: 'CSF' }, { sigla: 'CML' }, { sigla: 'CJP' }]).map(c => c.sigla)).toEqual(['CML', 'CJP', 'CSF', 'CSD']);
    const lista = getCampusList().map(c => c.sigla);
    expect(lista.slice(0, 5)).toEqual(['CML', 'CJP', 'CSF', 'CRC', 'CSL']);
  });
});
