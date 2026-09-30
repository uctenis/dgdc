import type { EntradaLibroObra, EstadoPago, LicitacionProyecto } from '../types';

/** Fracción de una Curva S (smoothstep) para t entre 0 y 1: arranque y cierre lentos. */
const curvaS = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return 3 * x * x - 2 * x * x * x;
};

const DIA_MS = 86_400_000;
/** Puntos de diferencia bajo lo programado desde los que se considera la obra atrasada. */
export const UMBRAL_ATRASO_PTS = 10;

export interface PuntoAvance { fecha: string; pct: number; origen: 'libro' | 'estado-pago' }

export interface AvanceObra {
  inicio?: Date;
  termino?: Date;
  plazoDias?: number;
  /** % programado a hoy según una Curva S entre inicio y término. */
  programadoHoy?: number;
  /** Último avance real informado (libro de obra o estado de pago, el más reciente). */
  realHoy?: PuntoAvance;
  reales: PuntoAvance[];
  diferenciaPts?: number;
  estado: 'sin-programa' | 'al-dia' | 'atrasada' | 'adelantada';
}

export function plazoObraDias(lic: Pick<LicitacionProyecto, 'plazoAdjudicadoDias' | 'fechaInicioObra' | 'fechaTerminoProgramada'>): number | undefined {
  if (lic.plazoAdjudicadoDias) return lic.plazoAdjudicadoDias;
  if (lic.fechaInicioObra && lic.fechaTerminoProgramada) {
    const d = Math.round((new Date(lic.fechaTerminoProgramada).getTime() - new Date(lic.fechaInicioObra).getTime()) / DIA_MS);
    return d > 0 ? d : undefined;
  }
  return undefined;
}

export function programadoEn(inicio: Date, plazoDias: number, fecha: Date): number {
  return Math.round(curvaS((fecha.getTime() - inicio.getTime()) / (plazoDias * DIA_MS)) * 100);
}

/** Avance programado vs real de una obra (Curva S por obra). */
export function calcularAvanceObra(
  lic: Pick<LicitacionProyecto, 'plazoAdjudicadoDias' | 'fechaInicioObra' | 'fechaTerminoProgramada'>,
  entradas: EntradaLibroObra[],
  estadosPago: Pick<EstadoPago, 'fecha' | 'porcentajeAvanceGlobal' | 'estado'>[],
  hoy = new Date()
): AvanceObra {
  const reales: PuntoAvance[] = [
    ...entradas.filter(e => typeof e.avanceFisicoPct === 'number').map(e => ({ fecha: e.fecha, pct: e.avanceFisicoPct as number, origen: 'libro' as const })),
    ...estadosPago.filter(ep => ep.estado !== 'Borrador' && ep.porcentajeAvanceGlobal > 0).map(ep => ({ fecha: ep.fecha, pct: ep.porcentajeAvanceGlobal, origen: 'estado-pago' as const })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const realHoy = reales[reales.length - 1];
  const plazoDias = plazoObraDias(lic);
  if (!lic.fechaInicioObra || !plazoDias) return { reales, realHoy, estado: 'sin-programa' };
  const inicio = new Date(`${lic.fechaInicioObra.slice(0, 10)}T00:00:00`);
  const termino = new Date(inicio.getTime() + plazoDias * DIA_MS);
  const programadoHoy = programadoEn(inicio, plazoDias, hoy);
  const diferenciaPts = realHoy ? realHoy.pct - programadoHoy : undefined;
  const estado = diferenciaPts === undefined ? 'al-dia'
    : diferenciaPts <= -UMBRAL_ATRASO_PTS ? 'atrasada'
    : diferenciaPts >= UMBRAL_ATRASO_PTS ? 'adelantada' : 'al-dia';
  return { inicio, termino, plazoDias, programadoHoy, realHoy, reales, diferenciaPts, estado };
}
