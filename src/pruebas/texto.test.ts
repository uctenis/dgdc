import { describe, expect, it } from 'vitest';
import { comoTitulo } from '../utils/texto';

describe('textos como título', () => {
  it('escribe nombres de campus con mayúscula inicial y preposiciones en minúscula', () => {
    expect(comoTitulo('PARQUE INDUSTRIAL LAUTARO')).toBe('Parque Industrial Lautaro');
    expect(comoTitulo('Campus Doctor Luis Rivas Del Canto')).toBe('Campus Doctor Luis Rivas del Canto');
    expect(comoTitulo('campus san nicolás (curacautín)')).toBe('Campus San Nicolás (Curacautín)');
    expect(comoTitulo('Campus San Juan Pablo II')).toBe('Campus San Juan Pablo II');
  });

  it('formatea nombres de personas del catastro', () => {
    expect(comoTitulo('AGUAYO DE LA PEÑA, ANA MARIA')).toBe('Aguayo de la Peña, Ana Maria');
    expect(comoTitulo('NN FUTURA CONTRATACIÓN')).toBe('NN Futura Contratación');
    expect(comoTitulo('  ')).toBe('');
    expect(comoTitulo(null)).toBe('');
  });
});
