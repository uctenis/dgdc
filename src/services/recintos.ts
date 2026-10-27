// Acceso a datos del módulo de recintos y planos (Postgres en Supabase). Las pantallas no hablan con la base
// directamente: todo pasa por aquí.
import { supabase } from '../lib/supabase';
import type { CambioRecinto, DocumentoEdificio, Piso, Recinto } from '../types/recintos';

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
 * Carga recintos desde una planilla: crea los pisos que falten y, por cada recinto, lo crea o actualiza según su
 * código dentro del edificio (no duplica). Devuelve cuántos se crearon y actualizaron.
 */
export async function importarRecintos(
  edificioCodigo: string,
  filas: { piso: string; recinto: Omit<Recinto, 'id' | 'piso_id' | 'edificio_codigo' | 'estado' | 'origen'> & { estado?: Recinto['estado'] } }[],
): Promise<{ creados: number; actualizados: number; pisosNuevos: number }> {
  const pisos = await listarPisos(edificioCodigo);
  const porCodigo = new Map(pisos.map(p => [p.codigo.toUpperCase(), p]));
  let pisosNuevos = 0;
  let orden = pisos.reduce((m, p) => Math.max(m, p.orden), 0);
  for (const codigo of [...new Set(filas.map(f => f.piso.trim().toUpperCase()))]) {
    if (!codigo || porCodigo.has(codigo)) continue;
    porCodigo.set(codigo, await guardarPiso({ edificio_codigo: edificioCodigo, codigo, nombre: `Piso ${codigo}`, orden: ++orden }));
    pisosNuevos++;
  }
  const existentes = new Set((await listarRecintos(edificioCodigo)).map(r => r.codigo.toUpperCase()));
  const registros = filas.map(f => ({
    ...f.recinto,
    estado: f.recinto.estado || 'Operativo',
    edificio_codigo: edificioCodigo,
    piso_id: porCodigo.get(f.piso.trim().toUpperCase())!.id,
    origen: 'Planilla' as const,
  }));
  const { error } = await supabase.from('recintos').upsert(registros, { onConflict: 'edificio_codigo,codigo' });
  if (error) throw errorDe(error, 'No se pudo importar la planilla');
  const actualizados = registros.filter(r => existentes.has(r.codigo.toUpperCase())).length;
  return { creados: registros.length - actualizados, actualizados, pisosNuevos };
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
