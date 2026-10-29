// Datos para los cruces de información: todos los recintos con su campus, edificio, piso y clase de superficie. Se
// leen una vez por sesión (unos miles de filas) y los cruces se calculan en el navegador.
import { getCampusList } from '../data/campusData';
import { getConfigEspacios } from '../data/espaciosConfig';
import { comoTitulo } from '../utils/texto';
import type { FilaAnalisis } from '../utils/analisisEspacios';
import { listarEdificiosConDatos, listarRecintosDeCampus, separarUnidades } from './recintos';

let cache: { filas: FilaAnalisis[]; nombresEdificio: Record<string, string>; leidoEn: Date } | null = null;

export async function cargarDatosAnalisis(forzar = false): Promise<NonNullable<typeof cache>> {
  if (cache && !forzar) return cache;
  const [recintos, edificios] = await Promise.all([listarRecintosDeCampus(''), listarEdificiosConDatos()]);
  const campusList = getCampusList();
  const campusDe = (edificio: string) => campusList.find(c => c.edificios.includes(edificio)) || campusList.find(c => edificio.startsWith(c.sigla));
  const nombresEdificio: Record<string, string> = {};
  const nombre = (e: string) => (nombresEdificio[e] ??= edificios.nombres[e] || campusDe(e)?.edificiosInfo?.[e]?.nombre || '');
  const tipos = new Map(getConfigEspacios().tipos.map(t => [t.nombre.trim().toUpperCase(), t]));
  const filas: FilaAnalisis[] = recintos.map(r => {
    const campus = campusDe(r.edificio_codigo);
    return {
      id: r.id,
      campus: campus?.sigla || r.edificio_codigo.slice(0, 3),
      campusNombre: comoTitulo(campus?.nombre) || r.edificio_codigo.slice(0, 3),
      edificio: r.edificio_codigo,
      edificioNombre: nombre(r.edificio_codigo),
      piso: r.piso?.nombre || 'Sin piso',
      pisoOrden: Number.isFinite(Number(r.piso?.codigo)) ? Number(r.piso?.codigo) : 100,
      codigo: r.codigo,
      tipo: (r.nombre || '').trim(),
      uso: (r.uso || '').trim(),
      unidades: separarUnidades(r.unidad_usuaria),
      clase: tipos.get((r.nombre || '').trim().toUpperCase())?.clase || '',
      estado: r.estado,
      util: Number(r.superficie_m2) || 0,
      oguc: Number(r.superficie_oguc_m2) || 0,
      capacidad: Number(r.capacidad) || 0,
      ocupantes: r.ocupantes || [],
    };
  });
  cache = { filas, nombresEdificio, leidoEn: new Date() };
  return cache;
}
