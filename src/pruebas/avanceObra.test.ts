import { describe, expect, it } from 'vitest';
import { calcularAvanceObra, programadoEn } from '../utils/avanceObra';
import type { EntradaLibroObra, EstadoPago } from '../types';

const libro = (fecha: string, avanceFisicoPct: number) =>
  ({ id: fecha, tipo: 'Avance', texto: '', fecha, autorEmail: '', autorNombre: '', avanceFisicoPct }) as unknown as EntradaLibroObra;
const pago = (fecha: string, porcentajeAvanceGlobal: number, estado: EstadoPago['estado']) =>
  ({ fecha, porcentajeAvanceGlobal, estado }) as Pick<EstadoPago, 'fecha' | 'porcentajeAvanceGlobal' | 'estado'>;

describe('avance programado y real de una obra', () => {
  const inicio = new Date('2026-03-01T00:00:00');
  const obra = { fechaInicioObra: '2026-03-01', plazoAdjudicadoDias: 100 };
  const mitadDelPlazo = new Date('2026-04-10T00:00:00'); // día 40 de 100… se ajusta abajo con el valor real de la curva

  it('la curva programada parte en 0, sube lento al inicio, rápido al medio y termina en 100', () => {
    expect(programadoEn(inicio, 100, inicio)).toBe(0);
    expect(programadoEn(inicio, 100, new Date(inicio.getTime() + 50 * 86_400_000))).toBe(50);
    expect(programadoEn(inicio, 100, new Date(inicio.getTime() + 10 * 86_400_000))).toBeLessThan(10);
    expect(programadoEn(inicio, 100, new Date(inicio.getTime() + 100 * 86_400_000))).toBe(100);
    expect(programadoEn(inicio, 100, new Date('2027-01-01T00:00:00'))).toBe(100);
  });

  it('sin fecha de inicio o sin plazo no hay programa', () => {
    expect(calcularAvanceObra({ plazoAdjudicadoDias: 100 }, [], []).estado).toBe('sin-programa');
    expect(calcularAvanceObra({ fechaInicioObra: '2026-03-01' }, [], []).estado).toBe('sin-programa');
  });

  it('marca atrasada la obra que va 10 puntos o más bajo lo programado, y adelantada la que va 10 o más sobre', () => {
    const programado = programadoEn(inicio, 100, mitadDelPlazo);
    const con = (real: number) => calcularAvanceObra(obra, [libro('2026-04-09', real)], [], mitadDelPlazo);
    expect(con(programado - 10).estado).toBe('atrasada');
    expect(con(programado - 9).estado).toBe('al-dia');
    expect(con(programado + 9).estado).toBe('al-dia');
    expect(con(programado + 10).estado).toBe('adelantada');
  });

  it('usa el avance más reciente entre libro de obra y estados de pago, sin contar borradores', () => {
    const avance = calcularAvanceObra(obra, [libro('2026-04-01', 20)], [
      pago('2026-04-05', 40, 'Aprobado'),
      pago('2026-04-08', 90, 'Borrador'),
    ], mitadDelPlazo);
    expect(avance.realHoy?.pct).toBe(40);
    expect(avance.realHoy?.origen).toBe('estado-pago');
  });
});
