import type { Cotizacion, EvaluacionResultado } from '../types';

export interface CotizacionOrdenada {
  cotizacion: Cotizacion;
  puntaje: number;
  rankingPuntaje: number;
  esAdjudicada: boolean;
}

export function evaluarCotizaciones(cotizaciones: Cotizacion[]): EvaluacionResultado[] {
  if (!cotizaciones || cotizaciones.length === 0) {
    return [];
  }

  // 1. Encontrar el precio total con IVA más bajo
  const preciosValidos = cotizaciones.map(c => c.montoTotal).filter(p => p > 0);
  const precioMinimo = preciosValidos.length > 0 ? Math.min(...preciosValidos) : 0;

  // 2. Calcular puntajes para cada cotización
  const resultados: EvaluacionResultado[] = cotizaciones.map(cotizacion => {
    // --- EVALUACIÓN ECONÓMICA (55%) ---
    let puntajeEconomico = 0;
    if (precioMinimo > 0 && cotizacion.montoTotal > 0) {
      if (cotizacion.montoTotal === precioMinimo) {
        puntajeEconomico = 100;
      } else {
        puntajeEconomico = Number(((precioMinimo / cotizacion.montoTotal) * 100).toFixed(2));
      }
    }

    // --- EVALUACIÓN TÉCNICA (35%) ---
    let aspectosCumplidos = 0;
    if (cotizacion.ajustaRequerimientos) aspectosCumplidos++;
    if (cotizacion.cuentaExperiencia) aspectosCumplidos++;
    if (cotizacion.cumplePlazoRequerido) aspectosCumplidos++;

    let puntajeTecnico = 0;
    if (aspectosCumplidos === 3) puntajeTecnico = 100;
    else if (aspectosCumplidos === 2) puntajeTecnico = 60;
    else if (aspectosCumplidos === 1) puntajeTecnico = 40;
    else puntajeTecnico = 0;

    // --- EVALUACIÓN SUSTENTABILIDAD (10%) ---
    const puntajeSustentabilidad = cotizacion.declaraSustentabilidad ? 100 : 0;

    // --- CÁLCULO DE PUNTAJES PONDERADOS ---
    const puntajeEconomicoPonderado = Number((puntajeEconomico * 0.55).toFixed(2));
    const puntajeTecnicoPonderado = Number((puntajeTecnico * 0.35).toFixed(2));
    const puntajeSustentabilidadPonderado = Number((puntajeSustentabilidad * 0.10).toFixed(2));

    const puntajeTotalPonderado = Number(
      (puntajeEconomicoPonderado + puntajeTecnicoPonderado + puntajeSustentabilidadPonderado).toFixed(2)
    );

    return {
      cotizacionId: cotizacion.id,
      proveedorId: cotizacion.proveedorId,
      proveedorNombre: cotizacion.proveedorNombre,
      proveedorRut: cotizacion.proveedorRut,
      montoTotal: cotizacion.montoTotal,
      montoNeto: cotizacion.montoNeto,
      plazoDias: cotizacion.plazoDias,

      puntajeEconomico,
      puntajeTecnico,
      puntajeSustentabilidad,

      puntajeEconomicoPonderado,
      puntajeTecnicoPonderado,
      puntajeSustentabilidadPonderado,
      puntajeTotalPonderado,

      ranking: 0,
      esPropuestaAdjudicada: false,
    };
  });

  // 3. Ordenar por Puntaje Total Ponderado (Mayor a Menor) y asignar Ranking
  resultados.sort((a, b) => {
    if (b.puntajeTotalPonderado !== a.puntajeTotalPonderado) {
      return b.puntajeTotalPonderado - a.puntajeTotalPonderado;
    }
    // En caso de empate en puntaje, desempatar por menor precio total
    return a.montoTotal - b.montoTotal;
  });

  // Asignar ranking y marcar ganador
  resultados.forEach((res, index) => {
    res.ranking = index + 1;
    res.esPropuestaAdjudicada = index === 0;
  });

  return resultados;
}

export function ordenarCotizacionesPorResultado(
  cotizaciones: Cotizacion[],
  adjudicacion?: { cotizacionAdjudicadaId?: string; proveedorAdjudicadoId?: string; proveedorGanadorId?: string },
): CotizacionOrdenada[] {
  const evaluaciones = evaluarCotizaciones(cotizaciones);
  const porCotizacion = new Map(evaluaciones.map(evaluacion => [evaluacion.cotizacionId, evaluacion]));
  const proveedorGanadorId = adjudicacion?.proveedorAdjudicadoId || adjudicacion?.proveedorGanadorId;

  return cotizaciones
    .map(cotizacion => {
      const evaluacion = porCotizacion.get(cotizacion.id);
      return {
        cotizacion,
        puntaje: evaluacion?.puntajeTotalPonderado ?? 0,
        rankingPuntaje: evaluacion?.ranking ?? cotizaciones.length,
        esAdjudicada: cotizacion.id === adjudicacion?.cotizacionAdjudicadaId
          || Boolean(proveedorGanadorId && cotizacion.proveedorId === proveedorGanadorId),
      };
    })
    .sort((a, b) => {
      if (a.esAdjudicada !== b.esAdjudicada) return a.esAdjudicada ? -1 : 1;
      if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
      if (a.cotizacion.montoTotal !== b.cotizacion.montoTotal) return a.cotizacion.montoTotal - b.cotizacion.montoTotal;
      if (a.cotizacion.plazoDias !== b.cotizacion.plazoDias) return a.cotizacion.plazoDias - b.cotizacion.plazoDias;
      return a.cotizacion.proveedorNombre.localeCompare(b.cotizacion.proveedorNombre, 'es-CL');
    });
}

export function formatoMonedaCLP(monto: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto);
}
