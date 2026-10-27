// Fechas para mostrar. Un día sin hora ("2026-03-10") que se lee con new Date() queda en la medianoche UTC,
// que en Chile es el día anterior a las 21:00: se mostraba un día antes. Aquí un día sin hora se lee al
// mediodía local, y un instante con hora (ISO completo) se respeta tal cual.

/** Día sin hora: "2026-03-10", o una medianoche UTC exacta ("2026-03-10T00:00:00.000Z"), que es como queda un día al pasar por toISOString(). */
const SOLO_DIA = /^(\d{4}-\d{2}-\d{2})(?:T00:00(?::00(?:\.0+)?)?Z?)?$/;

/** Fecha lista para mostrar en hora de Chile, o null si el texto no es una fecha. */
function fechaLocal(valor?: string | null): Date | null {
  if (!valor) return null;
  const dia = SOLO_DIA.exec(valor.trim());
  const fecha = new Date(dia ? `${dia[1]}T12:00:00` : valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** "10-03-2026" (o con las opciones de formato que se pidan); `siVacia` si no hay fecha válida. */
export function formatoFecha(valor?: string | null, opciones?: Intl.DateTimeFormatOptions, siVacia = '—'): string {
  const fecha = fechaLocal(valor);
  return fecha ? fecha.toLocaleDateString('es-CL', opciones) : siVacia;
}
