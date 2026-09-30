/**
 * Días hábiles y feriados legales nacionales de Chile (sin feriados regionales ni elecciones: esos días se deben
 * revisar a mano). Los feriados trasladables siguen las leyes 19.668, 20.299, 20.215 y 20.983.
 */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fecha = (a: number, m: number, d: number) => new Date(a, m - 1, d);
const masDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
function pascua(a: number): Date {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4;
  const g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
  const i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4;
  const m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
  const mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1;
  return fecha(a, mes, dia);
}

/** Ley 19.668: martes, miércoles o jueves → lunes de esa semana; viernes → lunes siguiente. */
function trasladarALunes(d: Date): Date {
  const dow = d.getDay();
  if (dow >= 2 && dow <= 4) return masDias(d, 1 - dow);
  if (dow === 5) return masDias(d, 3);
  return d;
}

/** Día Nacional de los Pueblos Indígenas: solsticio de invierno (hora de Chile). */
const SOLSTICIO: Record<number, number> = { 2025: 20, 2026: 21, 2027: 21, 2028: 20, 2029: 20, 2030: 21, 2031: 21, 2032: 20 };

const cache = new Map<number, Map<string, string>>();

/** Feriados nacionales del año: fecha (YYYY-MM-DD) → nombre. */
export function feriadosChile(a: number): Map<string, string> {
  const guardado = cache.get(a);
  if (guardado) return guardado;
  const f = new Map<string, string>();
  const add = (d: Date, nombre: string) => f.set(iso(d), nombre);

  add(fecha(a, 1, 1), 'Año Nuevo');
  const p = pascua(a);
  add(masDias(p, -2), 'Viernes Santo');
  add(masDias(p, -1), 'Sábado Santo');
  add(fecha(a, 5, 1), 'Día del Trabajo');
  add(fecha(a, 5, 21), 'Día de las Glorias Navales');
  add(fecha(a, 6, SOLSTICIO[a] ?? 21), 'Día de los Pueblos Indígenas');
  add(trasladarALunes(fecha(a, 6, 29)), 'San Pedro y San Pablo');
  add(fecha(a, 7, 16), 'Virgen del Carmen');
  add(fecha(a, 8, 15), 'Asunción de la Virgen');
  const dieciocho = fecha(a, 9, 18);
  if (dieciocho.getDay() === 2) add(fecha(a, 9, 17), 'Fiestas Patrias');
  add(dieciocho, 'Independencia Nacional');
  add(fecha(a, 9, 19), 'Glorias del Ejército');
  if (fecha(a, 9, 20).getDay() === 5) add(fecha(a, 9, 20), 'Fiestas Patrias');
  add(trasladarALunes(fecha(a, 10, 12)), 'Encuentro de Dos Mundos');
  // Ley 20.299: si el 31 de octubre es martes, se celebra el viernes 27; si es miércoles, el viernes 2 de noviembre.
  const evangelicas = fecha(a, 10, 31);
  add(evangelicas.getDay() === 2 ? fecha(a, 10, 27) : evangelicas.getDay() === 3 ? fecha(a, 11, 2) : evangelicas, 'Día de las Iglesias Evangélicas');
  add(fecha(a, 11, 1), 'Todos los Santos');
  add(fecha(a, 12, 8), 'Inmaculada Concepción');
  add(fecha(a, 12, 25), 'Navidad');

  cache.set(a, f);
  return f;
}

/** Nombre del feriado, o undefined si la fecha (YYYY-MM-DD) no es feriado. */
export function feriado(fechaISO: string): string | undefined {
  return feriadosChile(Number(fechaISO.slice(0, 4))).get(fechaISO.slice(0, 10));
}

const aFecha = (fechaISO: string) => {
  const [a, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
  return fecha(a, m, d);
};

/** Motivo por el que la fecha no es hábil ("sábado", "domingo" o el feriado), o undefined si es hábil. */
export function motivoNoHabil(fechaISO: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}/.test(fechaISO)) return undefined;
  const dow = aFecha(fechaISO).getDay();
  if (dow === 6) return 'sábado';
  if (dow === 0) return 'domingo';
  const nombre = feriado(fechaISO);
  return nombre ? `feriado: ${nombre}` : undefined;
}

export const esDiaHabil = (fechaISO: string) => !motivoNoHabil(fechaISO);

/** Suma `n` días hábiles a la fecha (n ≥ 1). */
export function sumarDiasHabiles(fechaISO: string, n: number): string {
  let d = aFecha(fechaISO);
  let restantes = n;
  while (restantes > 0) {
    d = masDias(d, 1);
    if (esDiaHabil(iso(d))) restantes--;
  }
  return iso(d);
}

/** Plazos del calendario tipo, en días hábiles, contados desde el hito anterior. */
export const PLAZOS_CALENDARIO = { visitaTerreno: 3, recepcionConsultas: 3, respuestaConsultas: 2, entregaPropuestas: 4 } as const;

/** Calendario de licitación en días hábiles a partir de la fecha de invitación. */
export function proponerCalendario(desdeISO: string) {
  const visita = sumarDiasHabiles(desdeISO, PLAZOS_CALENDARIO.visitaTerreno);
  const consultas = sumarDiasHabiles(visita, PLAZOS_CALENDARIO.recepcionConsultas);
  const respuestas = sumarDiasHabiles(consultas, PLAZOS_CALENDARIO.respuestaConsultas);
  const entrega = sumarDiasHabiles(respuestas, PLAZOS_CALENDARIO.entregaPropuestas);
  return { visita, consultas, respuestas, entrega };
}
