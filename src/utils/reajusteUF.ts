/**
 * Valores diarios de la UF (fuente pública mindicador.cl) para llevar precios de distintas fechas a pesos de hoy.
 * Cada año se descarga una sola vez y se guarda en el navegador; el año en curso se refresca a diario.
 * Si no hay conexión, los precios se muestran sin reajustar (nunca se inventa un valor).
 */

type SerieUF = Record<string, number>; // YYYY-MM-DD → valor

const memoria = new Map<number, Promise<SerieUF | null>>();
const claveCache = (anio: number) => `uf-serie-${anio}`;

async function descargarAnio(anio: number): Promise<SerieUF | null> {
  const hoy = new Date().toISOString().slice(0, 10);
  const esAnioActual = anio === new Date().getFullYear();
  try {
    const guardado = JSON.parse(localStorage.getItem(claveCache(anio)) || 'null') as { serie: SerieUF; fecha: string } | null;
    if (guardado && (!esAnioActual || guardado.fecha === hoy)) return guardado.serie;
  } catch { /* sin almacenamiento local: se descarga */ }
  try {
    const resp = await fetch(`https://mindicador.cl/api/uf/${anio}`);
    if (!resp.ok) return null;
    const data = await resp.json() as { serie?: { fecha: string; valor: number }[] };
    const serie: SerieUF = {};
    // La fecha viene como medianoche de Chile expresada en UTC (ej. 2025-12-31T03:00:00Z): el día es el prefijo.
    (data.serie || []).forEach(p => { serie[p.fecha.slice(0, 10)] = p.valor; });
    if (!Object.keys(serie).length) return null;
    try { localStorage.setItem(claveCache(anio), JSON.stringify({ serie, fecha: hoy })); } catch { /* sin almacenamiento */ }
    return serie;
  } catch {
    return null;
  }
}

function serieDe(anio: number): Promise<SerieUF | null> {
  if (!memoria.has(anio)) memoria.set(anio, descargarAnio(anio));
  return memoria.get(anio) as Promise<SerieUF | null>;
}

/** UF del día indicado, o la última publicada antes de esa fecha (hasta 10 días atrás). */
export async function valorUF(fechaISO: string): Promise<number | null> {
  const anio = Number(fechaISO.slice(0, 4));
  if (!anio) return null;
  const serie = await serieDe(anio);
  const d = new Date(`${fechaISO.slice(0, 10)}T12:00:00`);
  for (let i = 0; i <= 10; i++) {
    const clave = d.toISOString().slice(0, 10);
    const s = clave.slice(0, 4) === String(anio) ? serie : await serieDe(Number(clave.slice(0, 4)));
    if (s?.[clave]) return s[clave];
    d.setDate(d.getDate() - 1);
  }
  return null;
}

/** Factor para llevar un monto de `fechaISO` a pesos de hoy (1 si no se pudo obtener la UF). */
export async function factorReajuste(fechaISO: string): Promise<{ factor: number; reajustado: boolean }> {
  const [antes, hoy] = await Promise.all([valorUF(fechaISO), valorUF(new Date().toISOString().slice(0, 10))]);
  if (!antes || !hoy) return { factor: 1, reajustado: false };
  return { factor: hoy / antes, reajustado: true };
}
