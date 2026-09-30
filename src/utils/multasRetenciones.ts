import { PARAMETROS_CONTRATO } from '../data/contratoTemplateData';
import { sugerirPoliticaGarantias, type PoliticaGarantias } from '../data/basesTemplateData';
import type { EstadoPago, MultaObra } from '../types';

const DIA_MS = 86_400_000;
/** Multa diaria como fracción del contrato (PARAMETROS_CONTRATO.multaDiariaPct viene como texto, ej. "0,02" %). */
export const MULTA_DIARIA = Number(String(PARAMETROS_CONTRATO.multaDiariaPct).replace(',', '.')) / 100;
export const TOPE_MULTAS = PARAMETROS_CONTRATO.topeMultasPct / 100;

/** % de retención de cada estado de pago según la política de garantías (0 si el contrato no la exige). */
export function retencionPctSegunPolitica(politica: PoliticaGarantias | undefined, montoContrato: number): number {
  const efectiva = politica || sugerirPoliticaGarantias(montoContrato);
  return efectiva === 'Sin Garantías' ? 0 : PARAMETROS_CONTRATO.retencionPct;
}

const aFecha = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface AtrasoObra {
  /** Días corridos de atraso a la fecha de corte (0 si va en plazo). */
  dias: number;
  /** Primer día de atraso (el día siguiente al término contractual). */
  desde?: string;
  /** Fecha de corte: hoy, o la solicitud de recepción si la obra ya se entregó. */
  hasta: string;
  /** Días de atraso que aún no cubre ninguna multa registrada (aplicada o exenta). */
  diasSinRegistrar: number;
  desdeSinRegistrar?: string;
  /** Multa que correspondería por esos días. */
  multaSugerida: number;
  /** Total aplicado hasta ahora y tope del contrato. */
  multasAplicadas: number;
  tope: number;
  /** El atraso ya permite terminar el contrato (cláusula 6.2). */
  superaDiasResolucion: boolean;
  alcanzaTope: boolean;
}

/**
 * Atraso de la obra respecto del término contractual (incluye ampliaciones de plazo aprobadas) y multa que
 * corresponde según el contrato. `fechaTermino` es el último día del plazo (YYYY-MM-DD).
 */
export function calcularAtraso(params: {
  fechaTermino?: string;
  montoContrato: number;
  multas: MultaObra[];
  fechaEntrega?: string;
  hoy?: Date;
}): AtrasoObra {
  const { fechaTermino, montoContrato, multas } = params;
  const corte = params.fechaEntrega ? aFecha(params.fechaEntrega) : aFecha(iso(params.hoy || new Date()));
  const tope = Math.round(montoContrato * TOPE_MULTAS);
  const vigentes = multas.filter(m => m.estado !== 'Anulada');
  const multasAplicadas = vigentes.filter(m => m.estado === 'Aplicada').reduce((s, m) => s + m.monto, 0);
  const base = { hasta: iso(corte), multasAplicadas, tope, alcanzaTope: multasAplicadas >= tope && tope > 0 };
  if (!fechaTermino) return { ...base, dias: 0, diasSinRegistrar: 0, multaSugerida: 0, superaDiasResolucion: false };

  const primerDiaAtraso = new Date(aFecha(fechaTermino).getTime() + DIA_MS);
  const dias = Math.max(0, Math.round((corte.getTime() - primerDiaAtraso.getTime()) / DIA_MS) + 1);
  if (dias === 0) return { ...base, dias: 0, diasSinRegistrar: 0, multaSugerida: 0, superaDiasResolucion: false };

  // Lo ya registrado (aplicado o eximido) no se vuelve a cobrar: se continúa desde el último día cubierto.
  const ultimoCubierto = vigentes.reduce<Date | null>((max, m) => {
    const h = aFecha(m.hasta);
    return !max || h > max ? h : max;
  }, null);
  const inicioPendiente = ultimoCubierto && ultimoCubierto >= primerDiaAtraso ? new Date(ultimoCubierto.getTime() + DIA_MS) : primerDiaAtraso;
  const diasSinRegistrar = Math.max(0, Math.round((corte.getTime() - inicioPendiente.getTime()) / DIA_MS) + 1);
  const bruta = Math.round(montoContrato * MULTA_DIARIA * diasSinRegistrar);
  const multaSugerida = Math.max(0, Math.min(bruta, tope - multasAplicadas));

  return {
    ...base,
    dias,
    desde: iso(primerDiaAtraso),
    diasSinRegistrar,
    ...(diasSinRegistrar > 0 ? { desdeSinRegistrar: iso(inicioPendiente) } : {}),
    multaSugerida,
    superaDiasResolucion: dias > PARAMETROS_CONTRATO.diasResolucionPorAtraso,
  };
}

/** Totales de retenciones de los estados de pago del contrato. */
export function totalesRetenciones(estados: Pick<EstadoPago, 'montoRetencion'>[]) {
  return { retenido: estados.reduce((s, e) => s + (e.montoRetencion || 0), 0) };
}
