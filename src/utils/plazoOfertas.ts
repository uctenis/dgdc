import type { LicitacionProyecto } from '../types';

type CampoPlazo = Partial<Pick<LicitacionProyecto, 'fechaEntregaPropuestas' | 'fechaEvaluacion' | 'horaLimiteOfertas'>>;

/** Si la licitación no indica hora, el portal cierra al terminar el día indicado. */
export const HORA_LIMITE_POR_DEFECTO = '23:59';
const ZONA = 'America/Santiago';

/** Instante exacto de una fecha (AAAA-MM-DD) y hora (HH:MM) expresadas en hora de Chile. */
export function fechaHoraChile(fecha: string, hora: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const supuestoUtc = Date.UTC(y, m - 1, d, hh, mm);
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(supuestoUtc)).map(p => [p.type, p.value]),
  );
  const comoChile = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute));
  return new Date(supuestoUtc - (comoChile - supuestoUtc));
}

export function horaLimite(lic: Pick<LicitacionProyecto, 'horaLimiteOfertas'>): string {
  return /^\d{2}:\d{2}$/.test(lic.horaLimiteOfertas || '') ? (lic.horaLimiteOfertas as string) : HORA_LIMITE_POR_DEFECTO;
}

/** Momento exacto en que se cierra la recepción de ofertas (fecha de entrega + hora, hora de Chile). */
export function fechaLimiteOfertas(lic: CampoPlazo): Date | null {
  const fecha = lic.fechaEntregaPropuestas || lic.fechaEvaluacion;
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  return fechaHoraChile(fecha, horaLimite(lic));
}

export function plazoOfertasVencido(lic: CampoPlazo, ahora: Date = new Date()): boolean {
  const limite = fechaLimiteOfertas(lic);
  return Boolean(limite) && ahora.getTime() > (limite as Date).getTime();
}

/**
 * Ofertas selladas: mientras la recepción está abierta nadie de la UCT ve el contenido de las ofertas (montos ni
 * archivos), solo quién ya presentó. Sin fecha límite definida no hay sello.
 */
export function ofertasSelladas(lic: CampoPlazo, ahora: Date = new Date()): boolean {
  const limite = fechaLimiteOfertas(lic);
  return Boolean(limite) && ahora.getTime() <= (limite as Date).getTime();
}

const dos = (n: string | number) => String(n).padStart(2, '0');

/** Fecha y hora de Chile de un instante, ej. "04-10-2026 17:00". */
export function formatoFechaHoraChile(fecha: Date | string): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(fecha)).map(p => [p.type, p.value]),
  );
  return `${dos(partes.day)}-${dos(partes.month)}-${partes.year} ${dos(partes.hour)}:${dos(partes.minute)}`;
}

/** Ej. "04-10-2026 17:00 hrs (hora de Chile)". */
export function textoLimiteOfertas(lic: CampoPlazo): string {
  const limite = fechaLimiteOfertas(lic);
  return limite ? `${formatoFechaHoraChile(limite)} hrs (hora de Chile)` : 'sin fecha definida';
}

/** Cuenta regresiva hasta el cierre: "2 días 3 h", "5 h 20 min", "12 min". */
export function tiempoRestanteOfertas(lic: CampoPlazo, ahora: Date = new Date()): string | null {
  const limite = fechaLimiteOfertas(lic);
  if (!limite || ahora.getTime() > limite.getTime()) return null;
  const minutos = Math.floor((limite.getTime() - ahora.getTime()) / 60000);
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const min = minutos % 60;
  if (dias > 0) return `${dias} ${dias === 1 ? 'día' : 'días'} ${horas} h`;
  if (horas > 0) return `${horas} h ${min} min`;
  return `${Math.max(min, 1)} min`;
}

/** Valor para un <input type="datetime-local"> con la hora local actual. */
export function ahoraParaInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Fin del período de consultas: el día de fechaRecepcionConsultas a las 23:59 (hora de Chile). */
export function fechaLimiteConsultas(lic: Pick<LicitacionProyecto, 'fechaRecepcionConsultas'>): Date | null {
  const f = lic.fechaRecepcionConsultas;
  return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? fechaHoraChile(f, HORA_LIMITE_POR_DEFECTO) : null;
}

/** Plazo para que la universidad publique las respuestas: el día de fechaRespuestaConsultas a las 23:59 (hora de Chile). */
export function fechaLimiteRespuestas(lic: Pick<LicitacionProyecto, 'fechaRespuestaConsultas'>): Date | null {
  const f = lic.fechaRespuestaConsultas;
  return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? fechaHoraChile(f, HORA_LIMITE_POR_DEFECTO) : null;
}

/** Días completos que faltan hasta una fecha (negativo = vencida). */
export function diasHasta(limite: Date, ahora: Date = new Date()): number {
  return Math.floor((limite.getTime() - ahora.getTime()) / 86400000);
}
