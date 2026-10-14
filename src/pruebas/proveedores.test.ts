import { describe, expect, it } from 'vitest';
import { advertenciaDesempeno, calcularScorecard, nivelDesempeno, promedioDesempenoPonderado, promediosPorCriterioPonderados } from '../utils/scorecardProveedor';
import { calcularCargaProveedores } from '../utils/cargaProveedores';
import type { EvaluacionDesempeno, InvitadoLicitacion, LicitacionProyecto } from '../types';

const HOY = new Date('2026-10-13T12:00:00');
const evaluacion = (fecha: unknown, puntajeFinal: number): EvaluacionDesempeno => ({
  id: String(fecha), licitacionId: 'lic', nombreProyecto: 'Obra', fecha: fecha as string, evaluadorEmail: '', evaluadorNombre: '',
  criterios: [{ id: 'calidad', etiqueta: 'Calidad', puntaje: puntajeFinal, ponderacion: 1 }], puntajeFinal,
});

describe('puntaje de desempeño de un proveedor', () => {
  it('sin evaluaciones no hay puntaje', () => {
    expect(promedioDesempenoPonderado([], HOY)).toBeNull();
    expect(nivelDesempeno(null)).toBeNull();
  });

  it('las evaluaciones de los últimos 24 meses pesan lo mismo', () => {
    expect(promedioDesempenoPonderado([evaluacion('2026-05-01', 5), evaluacion('2025-01-10', 3)], HOY)).toBe(4);
  });

  it('una evaluación de más de 24 meses pesa la mitad, también en el promedio por criterio', () => {
    // (5×0,5 + 2×1) / 1,5 = 3
    const lista = [evaluacion('2023-01-01', 5), evaluacion('2026-06-01', 2)];
    expect(promedioDesempenoPonderado(lista, HOY)).toBe(3);
    expect(promediosPorCriterioPonderados(lista, HOY)).toEqual({ calidad: 3 });
  });

  it('una evaluación sin fecha legible no rompe el cálculo y pesa completo', () => {
    const lista = [evaluacion(undefined, 4), evaluacion(12345, 2), evaluacion({ toDate: () => new Date('2026-01-01') }, 3)];
    expect(promedioDesempenoPonderado(lista, HOY)).toBe(3);
  });

  it('clasifica en Excelente, Aceptable, Deficiente y Crítico', () => {
    expect([4.5, 4, 3.9, 3, 2.9, 2, 1.9].map(n => nivelDesempeno(n)?.etiqueta))
      .toEqual(['Excelente', 'Excelente', 'Aceptable', 'Aceptable', 'Deficiente', 'Deficiente', 'Crítico']);
  });

  it('solo advierte al invitar a un proveedor Deficiente o Crítico', () => {
    expect(advertenciaDesempeno('ACME', 3.5, 2)).toBe('');
    expect(advertenciaDesempeno('ACME', null, 0)).toBe('');
    expect(advertenciaDesempeno('ACME', 2.5, 2)).toContain('DEFICIENTE');
    expect(advertenciaDesempeno('ACME', 1.5, 1)).toContain('CRÍTICO');
  });
});

describe('carga de trabajo y tasa de respuesta', () => {
  const licitacion = (id: string, estado: LicitacionProyecto['estado'], extra: Partial<LicitacionProyecto> = {}) =>
    ({ id, estado, nombreProyecto: id, montoEstimado: 1_000_000, proveedoresInvitadosIds: ['p1'], ...extra }) as LicitacionProyecto;
  const invitado = (estadoPropuesta: InvitadoLicitacion['estadoPropuesta']) =>
    [{ id: 'i', proveedorId: 'p1', estadoPropuesta, fechaInvitacion: '2026-09-01' }] as InvitadoLicitacion[];

  it('la tasa de respuesta solo cuenta procesos cerrados con invitación registrada', () => {
    const cargas = calcularCargaProveedores(
      [licitacion('cerrada', 'Cerrado'), licitacion('abierta', 'En Evaluacion'), licitacion('borrador', 'Borrador'), licitacion('sinRegistro', 'Adjudicado')],
      { cerrada: invitado('Presentada'), abierta: invitado('Pendiente'), borrador: invitado('Pendiente') },
      undefined, HOY,
    );
    expect(cargas.p1.invitacionesTotal).toBe(4);
    expect(cargas.p1.licitacionesAbiertas).toHaveLength(2);
    expect(calcularScorecard([], cargas.p1, HOY).respuesta).toEqual({ invitaciones: 1, ofertas: 1, pct: 100 });
  });

  it('una obra adjudicada sin recepción cuenta como obra en ejecución', () => {
    const cargas = calcularCargaProveedores(
      [
        licitacion('obra', 'Adjudicado', { proveedorAdjudicadoId: 'p1', montoAdjudicadoTotal: 5_000_000 }),
        licitacion('terminada', 'Adjudicado', { proveedorAdjudicadoId: 'p1', recepcionConforme: { solicitada: true, aprobada: true } }),
      ],
      {}, undefined, HOY,
    );
    expect(cargas.p1.adjudicacionesTotal).toBe(2);
    expect(cargas.p1.obrasEnEjecucion.map(o => o.licitacionId)).toEqual(['obra']);
    expect(cargas.p1.montoEnEjecucion).toBe(5_000_000);
    expect(cargas.p1.nivel).toBe('Media'); // una obra en ejecución pesa 2 puntos
  });
});
