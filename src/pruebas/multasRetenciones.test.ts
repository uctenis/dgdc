import { describe, expect, it } from 'vitest';
import { calcularAtraso, retencionPctSegunPolitica } from '../utils/multasRetenciones';
import type { MultaObra } from '../types';

const CONTRATO = 100_000_000;
const dia = (iso: string) => new Date(`${iso}T12:00:00`);
const multa = (desde: string, hasta: string, monto: number, estado: MultaObra['estado'] = 'Aplicada'): MultaObra => ({
  id: `${desde}-${estado}`, desde, hasta, dias: 0, monto, motivo: 'Atraso', estado, fechaRegistro: desde, registradaPor: 'prueba',
});

describe('atraso y multas de una obra', () => {
  it('sin fecha de término no hay atraso', () => {
    const a = calcularAtraso({ montoContrato: CONTRATO, multas: [], hoy: dia('2026-03-15') });
    expect(a.dias).toBe(0);
    expect(a.multaSugerida).toBe(0);
  });

  it('el último día del plazo todavía está en plazo', () => {
    const a = calcularAtraso({ fechaTermino: '2026-03-10', montoContrato: CONTRATO, multas: [], hoy: dia('2026-03-10') });
    expect(a.dias).toBe(0);
  });

  it('cobra 0,02 % del contrato por cada día corrido de atraso', () => {
    const a = calcularAtraso({ fechaTermino: '2026-03-10', montoContrato: CONTRATO, multas: [], hoy: dia('2026-03-15') });
    expect(a.dias).toBe(5);
    expect(a.desde).toBe('2026-03-11');
    expect(a.multaSugerida).toBe(100_000); // 100.000.000 × 0,0002 × 5
    expect(a.tope).toBe(15_000_000); // 15 % del contrato
  });

  it('no vuelve a cobrar los días ya cubiertos por una multa registrada', () => {
    const a = calcularAtraso({
      fechaTermino: '2026-03-10', montoContrato: CONTRATO, hoy: dia('2026-03-15'),
      multas: [multa('2026-03-11', '2026-03-13', 60_000)],
    });
    expect(a.dias).toBe(5);
    expect(a.diasSinRegistrar).toBe(2);
    expect(a.desdeSinRegistrar).toBe('2026-03-14');
    expect(a.multaSugerida).toBe(40_000);
    expect(a.multasAplicadas).toBe(60_000);
  });

  it('una multa exenta cubre sus días pero no suma al total aplicado; una anulada no cuenta', () => {
    const exenta = calcularAtraso({
      fechaTermino: '2026-03-10', montoContrato: CONTRATO, hoy: dia('2026-03-15'),
      multas: [multa('2026-03-11', '2026-03-13', 60_000, 'Exenta')],
    });
    expect(exenta.diasSinRegistrar).toBe(2);
    expect(exenta.multasAplicadas).toBe(0);

    const anulada = calcularAtraso({
      fechaTermino: '2026-03-10', montoContrato: CONTRATO, hoy: dia('2026-03-15'),
      multas: [multa('2026-03-11', '2026-03-13', 60_000, 'Anulada')],
    });
    expect(anulada.diasSinRegistrar).toBe(5);
    expect(anulada.multasAplicadas).toBe(0);
  });

  it('la multa nunca supera el tope del 15 % del contrato', () => {
    const a = calcularAtraso({
      fechaTermino: '2020-01-01', montoContrato: CONTRATO, hoy: dia('2026-03-15'),
      multas: [multa('2020-01-02', '2020-01-31', 14_000_000)],
    });
    expect(a.multaSugerida).toBe(1_000_000); // lo que falta para llegar a 15.000.000
    expect(a.multasAplicadas + a.multaSugerida).toBe(a.tope);
  });

  it('avisa cuando el atraso permite terminar el contrato (más de 30 días)', () => {
    const justo = calcularAtraso({ fechaTermino: '2026-03-01', montoContrato: CONTRATO, multas: [], hoy: dia('2026-03-31') });
    expect(justo.dias).toBe(30);
    expect(justo.superaDiasResolucion).toBe(false);
    const pasado = calcularAtraso({ fechaTermino: '2026-03-01', montoContrato: CONTRATO, multas: [], hoy: dia('2026-04-01') });
    expect(pasado.superaDiasResolucion).toBe(true);
  });

  it('si la obra ya se entregó, el atraso se corta en la fecha de entrega', () => {
    const a = calcularAtraso({ fechaTermino: '2026-03-10', montoContrato: CONTRATO, multas: [], fechaEntrega: '2026-03-12', hoy: dia('2026-06-01') });
    expect(a.dias).toBe(2);
    expect(a.hasta).toBe('2026-03-12');
  });
});

describe('retención sobre estados de pago', () => {
  it('sin garantías no retiene; con garantías retiene 5 %', () => {
    expect(retencionPctSegunPolitica('Sin Garantías', 50_000_000)).toBe(0);
    expect(retencionPctSegunPolitica('Retención sobre Estados de Pago', 2_000_000)).toBe(5);
    expect(retencionPctSegunPolitica('Boletas de Garantía Completas', 50_000_000)).toBe(5);
  });

  it('sin política definida la deduce del monto del contrato', () => {
    expect(retencionPctSegunPolitica(undefined, 800_000)).toBe(0);
    expect(retencionPctSegunPolitica(undefined, 800_001)).toBe(5);
  });
});
