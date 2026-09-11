// ─── AVANCE FINANCIERO DE LA CARTERA (Presupuesto Proyectado vs Real Ejecutado) ───────────
//
// Metodología (acordada con el usuario):
// 1. Solo los proyectos con `presupuesto.aprobado === true` comprometen el Presupuesto
//    Anual Proyectado (gate explícito, distinto de la prioridad que es solo un criterio
//    de apoyo para decidir la aprobación).
// 2. El monto de cada proyecto aprobado se distribuye mes a mes entre [fechaInicio,
//    fechaTermino] siguiendo una Curva S (arranque y cierre lentos, pico intermedio) —
//    el patrón real de gasto en obras civiles, más fiel que una distribución lineal.
// 3. El avance Real solo existe para proyectos licitados y adjudicados: se construye
//    sumando los Estados de Pago en estado 'Aprobado' o 'Pagado' (avance de obra ya
//    certificado, aunque el pago administrativo esté pendiente) agrupados por el mes
//    de su fecha.

import type { EstadoPago, LicitacionProyecto, ProyectoMaestro } from '../types';

const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface FlujoCajaMes {
  mes: string; // 'YYYY-MM'
  mesLabel: string;
  proyectado: number;
  real: number;
  proyectadoAcum: number;
  realAcum: number;
}

export type SemaforoAvance = 'Adelantado' | 'En línea' | 'Atrasado' | 'Sin programar';

export interface ResumenFinancieroProyecto {
  proyecto: ProyectoMaestro;
  licitacion?: LicitacionProyecto;
  montoProyectado: number;
  fechaInicio?: string;
  fechaTermino?: string;
  estadoLicitacion?: string;
  montoAdjudicado?: number;
  ejecutadoReal: number;
  pctAvanceReal: number;
  pctEsperadoAFecha: number;
  desviacionPct: number;
  semaforo: SemaforoAvance;
}

/** Pesos mensuales de una Curva S (smoothstep) que suman 1 — arranque y cierre lentos, pico al centro. */
export function pesosCurvaS(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  const f = (x: number) => 3 * x * x - 2 * x * x * x; // smoothstep, F(0)=0, F(1)=1
  const pesos: number[] = [];
  for (let i = 0; i < n; i++) {
    pesos.push(f((i + 1) / n) - f(i / n));
  }
  return pesos;
}

function toYearMonth(fecha?: string): string | undefined {
  if (!fecha) return undefined;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Lista de 'YYYY-MM' entre fechaInicio y fechaFin, ambos inclusive. */
export function mesesEntreFechas(fechaInicio: string, fechaFin: string): string[] {
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return [];
  const meses: string[] = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(fin.getFullYear(), fin.getMonth(), 1);
  while (cursor <= limite) {
    meses.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return meses;
}

/** Fecha de término efectiva: la declarada, o fechaInicio + plazo como respaldo — primero el plazo
 * REAL del contrato adjudicado (`plazoEjecucionDias`), y si el proyecto aún no se licita, la
 * duración aproximada estimada al crearlo (`duracionEstimadaDias`). */
export function calcularFechaTerminoEfectiva(proyecto: ProyectoMaestro): string | undefined {
  if (proyecto.fechaTermino) return proyecto.fechaTermino;
  const plazoDias = proyecto.plazoEjecucionDias || proyecto.duracionEstimadaDias;
  if (proyecto.fechaInicio && plazoDias) {
    const d = new Date(proyecto.fechaInicio);
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + plazoDias);
      return d.toISOString();
    }
  }
  return undefined;
}

/** Distribuye `monto` entre los meses [fechaInicio, fechaFin] siguiendo una Curva S. */
export function distribuirMontoEnMeses(
  monto: number,
  fechaInicio?: string,
  fechaFin?: string
): Record<string, number> {
  if (!monto || !fechaInicio || !fechaFin) return {};
  const meses = mesesEntreFechas(fechaInicio, fechaFin);
  if (meses.length === 0) return {};
  const pesos = pesosCurvaS(meses.length);
  const resultado: Record<string, number> = {};
  meses.forEach((mes, i) => {
    resultado[mes] = monto * pesos[i];
  });
  return resultado;
}

/** Suma los Estados de Pago 'Aprobado' o 'Pagado' agrupados por el mes de su fecha. */
export function agregarEstadosPagoPorMes(estadosPago: EstadoPago[]): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const ep of estadosPago) {
    if (ep.estado !== 'Aprobado' && ep.estado !== 'Pagado') continue;
    const mes = toYearMonth(ep.fecha);
    if (!mes) continue;
    resultado[mes] = (resultado[mes] || 0) + (ep.montoTotal || 0);
  }
  return resultado;
}

function licitacionDeProyecto(
  proyecto: ProyectoMaestro,
  licitaciones: LicitacionProyecto[]
): LicitacionProyecto | undefined {
  return (
    licitaciones.find(l => l.proyectoMaestroId === proyecto.id) ||
    licitaciones.find(l => !l.proyectoMaestroId && l.codigoProyecto === proyecto.codigoProyecto)
  );
}

/** Construye el Flujo de Caja mensual (Ene-Dic) de `anio`: proyección Curva S vs real ejecutado. */
export function construirFlujoCajaAnual(params: {
  proyectos: ProyectoMaestro[];
  licitaciones: LicitacionProyecto[];
  estadosPago: EstadoPago[];
  anio: number;
}): FlujoCajaMes[] {
  const { proyectos, licitaciones, estadosPago, anio } = params;

  const proyectosAprobados = proyectos.filter(p => p.presupuesto?.aprobado);
  const proyectadoPorMes: Record<string, number> = {};
  for (const p of proyectosAprobados) {
    const fin = calcularFechaTerminoEfectiva(p);
    if (!p.fechaInicio || !fin) continue;
    const monto = p.montoAdjudicado || p.valorAprox || 0;
    const dist = distribuirMontoEnMeses(monto, p.fechaInicio, fin);
    for (const [mes, val] of Object.entries(dist)) {
      proyectadoPorMes[mes] = (proyectadoPorMes[mes] || 0) + val;
    }
  }

  const proyectoDeLicitacion = new Map<string, ProyectoMaestro>();
  for (const p of proyectos) {
    const lic = licitacionDeProyecto(p, licitaciones);
    if (lic) proyectoDeLicitacion.set(lic.id, p);
  }
  // Solo cuenta como Real el gasto de licitaciones cuyo proyecto maestro está aprobado en Presupuesto.
  const estadosPagoDeAprobados = estadosPago.filter(ep => {
    const proy = proyectoDeLicitacion.get(ep.licitacionId);
    return proy?.presupuesto?.aprobado;
  });
  const realPorMes = agregarEstadosPagoPorMes(estadosPagoDeAprobados);

  let acumProyectado = 0;
  let acumReal = 0;
  const meses: FlujoCajaMes[] = [];
  for (let m = 0; m < 12; m++) {
    const mesKey = `${anio}-${String(m + 1).padStart(2, '0')}`;
    const proyectado = proyectadoPorMes[mesKey] || 0;
    const real = realPorMes[mesKey] || 0;
    acumProyectado += proyectado;
    acumReal += real;
    meses.push({
      mes: mesKey,
      mesLabel: MESES_LABEL[m],
      proyectado,
      real,
      proyectadoAcum: acumProyectado,
      realAcum: acumReal,
    });
  }
  return meses;
}

/** Construye el resumen financiero por proyecto (fila de la tabla comparativa Proyectado vs Real). */
export function construirResumenPorProyecto(params: {
  proyectos: ProyectoMaestro[];
  licitaciones: LicitacionProyecto[];
  estadosPago: EstadoPago[];
  hoy?: Date;
}): ResumenFinancieroProyecto[] {
  const { proyectos, licitaciones, estadosPago, hoy = new Date() } = params;

  return proyectos
    .filter(p => p.presupuesto?.aprobado)
    .map(p => {
      const licitacion = licitacionDeProyecto(p, licitaciones);
      const montoProyectado = p.montoAdjudicado || p.valorAprox || 0;
      const fechaTermino = calcularFechaTerminoEfectiva(p);
      const ejecutadoReal = licitacion
        ? estadosPago
            .filter(ep => ep.licitacionId === licitacion.id && (ep.estado === 'Aprobado' || ep.estado === 'Pagado'))
            .reduce((sum, ep) => sum + (ep.montoTotal || 0), 0)
        : 0;

      const dist = distribuirMontoEnMeses(montoProyectado, p.fechaInicio, fechaTermino);
      const hoyKey = toYearMonth(hoy.toISOString());
      let pctEsperadoAFecha = 0;
      if (Object.keys(dist).length > 0 && hoyKey) {
        const acumEsperado = Object.entries(dist)
          .filter(([mes]) => mes <= hoyKey)
          .reduce((sum, [, val]) => sum + val, 0);
        pctEsperadoAFecha = montoProyectado > 0 ? Math.round((acumEsperado / montoProyectado) * 100) : 0;
        // Si ya pasó la fecha de término, lo esperado a la fecha es el 100%.
        const mesesProyecto = Object.keys(dist);
        const ultimoMes = mesesProyecto[mesesProyecto.length - 1];
        if (ultimoMes && ultimoMes < hoyKey) pctEsperadoAFecha = 100;
      }

      const pctAvanceReal = montoProyectado > 0 ? Math.round((ejecutadoReal / montoProyectado) * 100) : 0;
      const desviacionPct = pctAvanceReal - pctEsperadoAFecha;

      let semaforo: SemaforoAvance = 'Sin programar';
      if (!p.fechaInicio || !fechaTermino) {
        semaforo = 'Sin programar';
      } else if (!licitacion) {
        semaforo = 'En línea'; // aprobado pero aún no licitado: no hay ejecución que evaluar todavía
      } else if (desviacionPct >= 3) {
        semaforo = 'Adelantado';
      } else if (desviacionPct <= -10) {
        semaforo = 'Atrasado';
      } else {
        semaforo = 'En línea';
      }

      return {
        proyecto: p,
        licitacion,
        montoProyectado,
        fechaInicio: p.fechaInicio,
        fechaTermino,
        estadoLicitacion: licitacion?.estadoLifecycle || licitacion?.estado,
        montoAdjudicado: p.montoAdjudicado,
        ejecutadoReal,
        pctAvanceReal,
        pctEsperadoAFecha,
        desviacionPct,
        semaforo,
      };
    });
}
