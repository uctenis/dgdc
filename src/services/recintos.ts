// Acceso a datos del módulo de recintos y planos (Postgres en Supabase). Las pantallas no hablan con la base
// directamente: todo pasa por aquí.
import { supabase } from '../lib/supabase';
import type { CambioRecinto, DocumentoEdificio, Piso, Recinto } from '../types/recintos';
import { datosDePiso } from '../utils/importacionRecintos';

/** Convierte el error de la base en un mensaje entendible. */
function errorDe(error: { message?: string; code?: string } | null, accion: string): Error {
  const m = error?.message || '';
  if (error?.code === '23505' || /duplicate key/i.test(m)) return new Error(`${accion}: ya existe otro registro con ese código en este edificio.`);
  if (error?.code === '23503' || /foreign key/i.test(m)) return new Error(`${accion}: está en uso por otros registros (por ejemplo, un piso con recintos).`);
  if (error?.code === '42501' || /row-level security|permission denied/i.test(m)) return new Error(`${accion}: su sesión no tiene permiso (debe ingresar con su cuenta @uct.cl).`);
  if (/JWT|token/i.test(m)) return new Error(`${accion}: la sesión expiró o no es válida. Vuelva a iniciar sesión.`);
  return new Error(`${accion}: ${m || 'error desconocido'}`);
}

// ── Pisos ──
export async function listarPisos(edificioCodigo: string): Promise<Piso[]> {
  const { data, error } = await supabase.from('pisos').select('*').eq('edificio_codigo', edificioCodigo).order('orden');
  if (error) throw errorDe(error, 'No se pudieron leer los pisos');
  return data as Piso[];
}

/** Códigos de todos los edificios que tienen pisos en la base, estén o no en la configuración de campus. */
export async function listarEdificiosConDatos(): Promise<string[]> {
  const { data, error } = await supabase.from('pisos').select('edificio_codigo');
  if (error) throw errorDe(error, 'No se pudieron leer los edificios');
  return [...new Set((data as { edificio_codigo: string }[]).map(p => p.edificio_codigo))];
}

export async function guardarPiso(piso: Omit<Piso, 'id'> & { id?: string }): Promise<Piso> {
  const { id, ...datos } = piso;
  const consulta = id
    ? supabase.from('pisos').update(datos).eq('id', id).select().single()
    : supabase.from('pisos').insert(datos).select().single();
  const { data, error } = await consulta;
  if (error) throw errorDe(error, 'No se pudo guardar el piso');
  return data as Piso;
}

export async function eliminarPiso(id: string): Promise<void> {
  const { error } = await supabase.from('pisos').delete().eq('id', id);
  if (error) throw errorDe(error, 'No se pudo eliminar el piso');
}

// ── Recintos ──
export async function listarRecintos(edificioCodigo: string): Promise<Recinto[]> {
  const { data, error } = await supabase.from('recintos').select('*').eq('edificio_codigo', edificioCodigo).order('codigo');
  if (error) throw errorDe(error, 'No se pudieron leer los recintos');
  return data as Recinto[];
}

export async function guardarRecinto(recinto: Omit<Recinto, 'id'> & { id?: string }): Promise<Recinto> {
  const { id, modificado_en: _modificadoEn, modificado_por: _modificadoPor, ...datos } = recinto;
  const consulta = id
    ? supabase.from('recintos').update(datos).eq('id', id).select().single()
    : supabase.from('recintos').insert(datos).select().single();
  const { data, error } = await consulta;
  if (error) throw errorDe(error, 'No se pudo guardar el recinto');
  return data as Recinto;
}

export async function eliminarRecinto(id: string): Promise<void> {
  const { error } = await supabase.from('recintos').delete().eq('id', id);
  if (error) throw errorDe(error, 'No se pudo eliminar el recinto');
}

/** Cambios de un recinto, del más reciente al más antiguo. */
export async function historialRecinto(id: string): Promise<CambioRecinto[]> {
  const { data, error } = await supabase.from('historial_recintos').select('*').eq('recinto_id', id).order('fecha', { ascending: false }).limit(50);
  if (error) throw errorDe(error, 'No se pudo leer el historial');
  return data as CambioRecinto[];
}

/**
 * Carga recintos desde una planilla (de uno o de varios edificios): crea los pisos que falten y, por cada recinto,
 * lo crea o actualiza según su código dentro de su edificio (no duplica). `alAvanzar` informa el edificio en curso.
 */
export async function importarRecintos(
  filas: { edificio: string; piso: string; recinto: Omit<Recinto, 'id' | 'piso_id' | 'edificio_codigo' | 'origen'> }[],
  alAvanzar?: (hechos: number, total: number, edificio: string) => void,
): Promise<{ creados: number; actualizados: number; pisosNuevos: number; edificios: number }> {
  const porEdificio = new Map<string, typeof filas>();
  filas.forEach(f => porEdificio.set(f.edificio, [...(porEdificio.get(f.edificio) || []), f]));
  let creados = 0;
  let actualizados = 0;
  let pisosNuevos = 0;
  let hechos = 0;
  for (const [edificio, lista] of porEdificio) {
    alAvanzar?.(hechos, porEdificio.size, edificio);
    const pisos = await listarPisos(edificio);
    const porCodigo = new Map(pisos.map(p => [p.codigo.toUpperCase(), p]));
    for (const codigo of [...new Set(lista.map(f => f.piso.trim().toUpperCase()))]) {
      if (!codigo || porCodigo.has(codigo)) continue;
      porCodigo.set(codigo, await guardarPiso({ edificio_codigo: edificio, codigo, ...datosDePiso(codigo) }));
      pisosNuevos++;
    }
    const existentes = new Set((await listarRecintos(edificio)).map(r => r.codigo.toUpperCase()));
    const registros = lista.map(f => ({
      ...f.recinto,
      edificio_codigo: edificio,
      piso_id: porCodigo.get(f.piso.trim().toUpperCase())!.id,
      origen: 'Planilla' as const,
    }));
    // En tandas, para no enviar miles de filas en una sola solicitud.
    for (let i = 0; i < registros.length; i += 400) {
      const { error } = await supabase.from('recintos').upsert(registros.slice(i, i + 400), { onConflict: 'edificio_codigo,codigo' });
      if (error) throw errorDe(error, `No se pudo importar el edificio ${edificio}`);
    }
    const yaEstaban = registros.filter(r => existentes.has(r.codigo.toUpperCase())).length;
    actualizados += yaEstaban;
    creados += registros.length - yaEstaban;
    hechos++;
  }
  alAvanzar?.(hechos, porEdificio.size, '');
  return { creados, actualizados, pisosNuevos, edificios: porEdificio.size };
}

// ── Documentos y planos ──
export async function listarDocumentos(edificioCodigo: string): Promise<DocumentoEdificio[]> {
  const { data, error } = await supabase.from('documentos').select('*').eq('edificio_codigo', edificioCodigo)
    .order('especialidad').order('codigo_lamina').order('creado_en', { ascending: false });
  if (error) throw errorDe(error, 'No se pudieron leer los documentos');
  return data as DocumentoEdificio[];
}

/** Registra un documento. Con `reemplaza_a`, es una nueva versión y la anterior deja de estar vigente. */
export async function registrarDocumento(documento: Omit<DocumentoEdificio, 'id' | 'vigente' | 'creado_en' | 'creado_por'>): Promise<DocumentoEdificio> {
  const { data, error } = await supabase.from('documentos').insert({ ...documento, vigente: true }).select().single();
  if (error) throw errorDe(error, 'No se pudo registrar el documento');
  return data as DocumentoEdificio;
}
