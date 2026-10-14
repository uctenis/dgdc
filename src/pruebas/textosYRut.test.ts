import { describe, expect, it } from 'vitest';
import { montoEnPalabras, numeroEnPalabras } from '../utils/numeroEnPalabras';
import { calcularDV, formatearRUT, validarRUT } from '../utils/rutUtils';

describe('monto en palabras (contratos y actas)', () => {
  it('escribe los montos como se leen', () => {
    expect(numeroEnPalabras(0)).toBe('cero');
    expect(numeroEnPalabras(100)).toBe('cien');
    expect(numeroEnPalabras(101)).toBe('ciento uno');
    expect(numeroEnPalabras(1000)).toBe('mil');
    expect(numeroEnPalabras(21_000)).toBe('veintiún mil');
    expect(numeroEnPalabras(1_000_000)).toBe('un millón');
    expect(numeroEnPalabras(2_000_000)).toBe('dos millones');
    expect(numeroEnPalabras(44_864_047)).toBe('cuarenta y cuatro millones ochocientos sesenta y cuatro mil cuarenta y siete');
  });

  it('agrega "pesos" y mayúscula inicial', () => {
    expect(montoEnPalabras(1500)).toBe('Mil quinientos pesos');
  });
});

describe('RUT chileno', () => {
  it('calcula el dígito verificador (módulo 11)', () => {
    expect(calcularDV('12345678')).toBe('5');
    expect(calcularDV('11111111')).toBe('1');
    expect(calcularDV('6')).toBe('K');
    expect(calcularDV('14')).toBe('0');
  });

  it('valida un RUT con su dígito verificador', () => {
    expect(validarRUT('12.345.678-5').esValido).toBe(true);
    const malo = validarRUT('12.345.678-9');
    expect(malo.esValido).toBe(false);
    expect(malo.dvEsperado).toBe('5');
  });

  it('da formato con puntos y guion', () => {
    expect(formatearRUT('123456785')).toBe('12.345.678-5');
    expect(formatearRUT('12.345.678-5')).toBe('12.345.678-5');
    expect(formatearRUT('76892410K')).toBe('76.892.410-K');
  });
});
