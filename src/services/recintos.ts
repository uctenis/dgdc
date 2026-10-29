// Acceso a datos del módulo de recintos y planos (Postgres en Supabase). Las pantallas no hablan con la base
// directamente: todo pasa por aquí.
import { supabase } from '../lib/supabase';
import type { CambioRecinto, DocumentoEdificio, FichaEdificio, Piso, Recinto, ZonaRecinto } from '../types/recintos';
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

/**
 * Edificios con ficha o con pisos en la base, estén o no en la configuración de campus: sus códigos y, para los que
 * tienen ficha, el nombre y la categoría que les da el catastro (1 edificio, 2 construcción menor, 3 espacio común).
 */
export async function listarEdificiosConDatos(): Promise<{ codigos: string[]; nombres: Record<string, string>; categorias: Record<string, string> }> {
  const [p, e] = await Promise.all([supabase.from('pisos').select('edificio_codigo'), supabase.from('edificios').select('codigo, nombre, categoria')]);
  if (p.error || e.error) throw errorDe(p.error || e.error, 'No se pudieron leer los edificios');
  const fichas = e.data as { codigo: string; nombre: string | null; categoria: string | null }[];
  return {
    codigos: [...new Set([...(p.data as { edificio_codigo: string }[]).map(x => x.edificio_codigo), ...fichas.map(x => x.codigo)])],
    nombres: Object.fromEntries(fichas.filter(x => x.nombre?.trim()).map(x => [x.codigo, x.nombre!.trim()])),
    categorias: Object.fromEntries(fichas.filter(x => x.categoria?.trim()).map(x => [x.codigo, x.categoria!.trim()])),
  };
}

// ── Búsqueda ──

export interface ResultadoBusqueda {
  tipo: 'edificio' | 'recinto';
  edificio_codigo: string;
  codigo: string;
  nombre: string;
  detalle: string;
  recintoId?: string;
  /** Ocupante que coincide con lo buscado («Pérez, Ana · Secretaria»), si la búsqueda fue por persona. */
  ocupante?: string;
}

/** Texto en minúsculas y sin tildes, igual que la columna «busqueda» de la base. */
export const normalizarBusqueda = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * Busca en todos los campus edificios (código, nombre, dirección) y recintos (código, nombre, uso, unidad y nombre,
 * cargo o unidad de sus ocupantes). Con varias palabras, el recinto debe tenerlas todas, en cualquier orden: «Ana
 * Pérez» encuentra a «PÉREZ SOTO, ANA MARÍA».
 */
export async function buscarEspacios(texto: string): Promise<ResultadoBusqueda[]> {
  // Se quitan los caracteres que tienen significado en el filtro de la base.
  const t = texto.replace(/[,()%*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 2) return [];
  const p = `"%${t}%"`;
  const palabras = normalizarBusqueda(t).split(' ').filter(Boolean);
  const columnas = 'id, edificio_codigo, codigo, nombre, uso, unidad_usuaria, superficie_m2, estado, ocupantes';
  let consultaRecintos = supabase.from('recintos').select(columnas);
  for (const palabra of palabras) consultaRecintos = consultaRecintos.ilike('busqueda', `%${palabra}%`);
  let [e, r] = await Promise.all([
    supabase.from('edificios').select('codigo, nombre, direccion, uso_principal')
      .or(`codigo.ilike.${p},nombre.ilike.${p},direccion.ilike.${p}`).order('codigo').limit(10),
    consultaRecintos.order('codigo').limit(60),
  ]);
  // Si la base aún no tiene la columna de búsqueda (migración 0006 pendiente), se busca como antes: sin ocupantes.
  if (r.error && /busqueda/.test(r.error.message)) {
    r = await supabase.from('recintos').select(columnas)
      .or(`codigo.ilike.${p},nombre.ilike.${p},uso.ilike.${p},unidad_usuaria.ilike.${p}`).order('codigo').limit(60);
  }
  if (e.error || r.error) throw errorDe(e.error || r.error, 'No se pudo buscar');
  type FilaEdificio = { codigo: string; nombre: string | null; direccion: string | null; uso_principal: string | null };
  type FilaRecinto = Pick<Recinto, 'id' | 'edificio_codigo' | 'codigo' | 'nombre' | 'uso' | 'unidad_usuaria' | 'superficie_m2' | 'estado' | 'ocupantes'>;
  const coincide = (texto: string) => palabras.every(w => normalizarBusqueda(texto).includes(w));
  return [
    ...(e.data as FilaEdificio[]).map(x => ({
      tipo: 'edificio' as const, edificio_codigo: x.codigo, codigo: x.codigo, nombre: x.nombre || 'Sin nombre',
      detalle: [x.uso_principal, x.direccion].filter(Boolean).join(' · '),
    })),
    ...(r.data as FilaRecinto[]).map(x => {
      // Si no calza por los datos del recinto, es por uno de sus ocupantes: se muestra cuál.
      const porRecinto = coincide([x.codigo, x.nombre, x.uso, x.unidad_usuaria].filter(Boolean).join(' '));
      const ocupante = porRecinto ? undefined : (x.ocupantes || []).find(o => coincide([o.nombre, o.cargo, o.unidad].filter(Boolean).join(' ')));
      return {
        tipo: 'recinto' as const, edificio_codigo: x.edificio_codigo, codigo: x.codigo, nombre: x.nombre, recintoId: x.id,
        ocupante: ocupante ? [ocupante.nombre, ocupante.cargo].filter(Boolean).join(' · ') : undefined,
        detalle: [x.uso, x.unidad_usuaria, x.superficie_m2 ? `${x.superficie_m2} m²` : '', x.estado !== 'Operativo' ? x.estado : ''].filter(Boolean).join(' · '),
      };
    }),
  ];
}

// ── Ficha del edificio ──

export async function obtenerFichaEdificio(codigo: string): Promise<FichaEdificio | null> {
  const { data, error } = await supabase.from('edificios').select('*').eq('codigo', codigo).maybeSingle();
  if (error) throw errorDe(error, 'No se pudo leer la ficha del edificio');
  return data as FichaEdificio | null;
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

/** Usos ya registrados en la base (los del catastro y los que se agreguen), en orden alfabético, para elegir de una lista. */
export async function listarUsos(): Promise<string[]> {
  const { data, error } = await supabase.from('recintos').select('uso').not('uso', 'is', null);
  if (error) throw errorDe(error, 'No se pudieron leer los usos');
  return [...new Set((data as { uso: string }[]).map(r => r.uso.trim().toUpperCase()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es'));
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

// ── Visor de planos ──

/** Guarda (o reemplaza) la copia en PDF de una lámina para mostrarla en el visor. */
export async function subirLaminaVisor(documento: DocumentoEdificio, archivo: File): Promise<string> {
  if (archivo.type && archivo.type !== 'application/pdf') throw new Error('La lámina debe ser un archivo PDF.');
  const ruta = `${documento.edificio_codigo}/${documento.id}.pdf`;
  const subida = await supabase.storage.from('laminas').upload(ruta, archivo, { upsert: true, contentType: 'application/pdf' });
  if (subida.error) throw errorDe({ message: subida.error.message }, 'No se pudo subir la lámina');
  const { error } = await supabase.from('documentos').update({ archivo_visor: ruta }).eq('id', documento.id);
  if (error) throw errorDe(error, 'La lámina se subió, pero no se pudo asociar al documento');
  return ruta;
}

/**
 * Recintos de todos los edificios cuyo código empieza con `prefijo` (un campus: «CSF»; vacío: todos), con el código y
 * nombre de su piso. Se leen en tandas porque la base entrega como máximo 1.000 filas por consulta.
 */
export async function listarRecintosDeCampus(prefijo: string): Promise<(Recinto & { piso: Pick<Piso, 'codigo' | 'nombre'> | null })[]> {
  const todos: (Recinto & { piso: Pick<Piso, 'codigo' | 'nombre'> | null })[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('recintos').select('*, piso:pisos(codigo, nombre)')
      .like('edificio_codigo', `${prefijo}%`).order('edificio_codigo').order('codigo').range(desde, desde + 999);
    if (error) throw errorDe(error, 'No se pudieron leer los recintos');
    todos.push(...(data as typeof todos));
    if (data.length < 1000) return todos;
  }
}

/** Láminas vigentes de todos los edificios de un campus (su código empieza con la sigla del campus). */
export async function listarLaminasDeCampus(siglaCampus: string): Promise<DocumentoEdificio[]> {
  const { data, error } = await supabase.from('documentos').select('*').like('edificio_codigo', `${siglaCampus}%`).eq('tipo', 'Plano').eq('vigente', true);
  if (error) throw errorDe(error, 'No se pudieron leer las láminas del campus');
  return data as DocumentoEdificio[];
}

export async function descargarLamina(ruta: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from('laminas').download(ruta);
  if (error || !data) throw errorDe({ message: error?.message }, 'No se pudo abrir la lámina');
  return data.arrayBuffer();
}

export async function guardarEscalaDocumento(documentoId: string, escala: string): Promise<void> {
  const { error } = await supabase.from('documentos').update({ escala: escala || null }).eq('id', documentoId);
  if (error) throw errorDe(error, 'No se pudo guardar la escala');
}

export async function listarZonas(documentoId: string): Promise<ZonaRecinto[]> {
  const { data, error } = await supabase.from('zonas_recinto').select('id, documento_id, recinto_id, pagina, poligono').eq('documento_id', documentoId);
  if (error) throw errorDe(error, 'No se pudieron leer los recintos ubicados en el plano');
  return data as ZonaRecinto[];
}

/** Guarda el contorno de un recinto en una lámina (si ya tenía uno, lo reemplaza). */
export async function guardarZona(zona: Omit<ZonaRecinto, 'id'>): Promise<ZonaRecinto> {
  const { data, error } = await supabase.from('zonas_recinto').upsert(zona, { onConflict: 'documento_id,recinto_id' }).select('id, documento_id, recinto_id, pagina, poligono').single();
  if (error) throw errorDe(error, 'No se pudo guardar el contorno del recinto');
  return data as ZonaRecinto;
}

export async function eliminarZona(id: string): Promise<void> {
  const { error } = await supabase.from('zonas_recinto').delete().eq('id', id);
  if (error) throw errorDe(error, 'No se pudo quitar el recinto del plano');
}

// ── Configuración del Gestor: valores en uso, unificar y fichas de edificios ──

export interface ValorEnUso { valor: string; recintos: number; m2: number }

/**
 * Tipos (nombre), usos y unidades usuarias que tienen hoy los recintos vigentes, con cuántos recintos y m² útiles
 * suma cada uno. Una unidad escrita «A / B» cuenta para A y para B. Se lee en tandas (la base entrega 1.000 por vez).
 */
export async function resumenValores(): Promise<{ tipos: ValorEnUso[]; usos: ValorEnUso[]; unidades: ValorEnUso[] }> {
  type Fila = { nombre: string; uso: string | null; unidad_usuaria: string | null; superficie_m2: number | null };
  const filas: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('recintos').select('nombre, uso, unidad_usuaria, superficie_m2')
      .neq('estado', 'Eliminado').order('id').range(desde, desde + 999);
    if (error) throw errorDe(error, 'No se pudieron leer los recintos');
    filas.push(...(data as Fila[]));
    if (data.length < 1000) break;
  }
  const contar = (valores: (r: Fila) => string[]) => {
    const mapa = new Map<string, ValorEnUso>();
    for (const r of filas) for (const v of valores(r)) {
      const x = mapa.get(v) || { valor: v, recintos: 0, m2: 0 };
      x.recintos++; x.m2 += Number(r.superficie_m2) || 0;
      mapa.set(v, x);
    }
    return [...mapa.values()].sort((a, b) => b.recintos - a.recintos || a.valor.localeCompare(b.valor, 'es'));
  };
  return {
    tipos: contar(r => (r.nombre?.trim() ? [r.nombre.trim()] : [])),
    usos: contar(r => (r.uso?.trim() ? [r.uso.trim()] : [])),
    unidades: contar(r => separarUnidades(r.unidad_usuaria)),
  };
}

/** Unidades de un recinto: la columna puede traer varias separadas por « / ». */
export const separarUnidades = (texto?: string | null) => (texto || '').split(' / ').map(u => u.trim()).filter(Boolean);

/**
 * Cambia un tipo (nombre) o un uso en todos los recintos que lo tienen: para renombrarlo o para unificar variantes
 * escritas distinto. Devuelve cuántos recintos cambió.
 */
export async function renombrarEnRecintos(campo: 'nombre' | 'uso', de: string, a: string): Promise<number> {
  const { data, error } = await supabase.from('recintos').update({ [campo]: a }).eq(campo, de).select('id');
  if (error) throw errorDe(error, 'No se pudo cambiar el valor en los recintos');
  return data.length;
}

/** Cambia una unidad usuaria en todos los recintos que la tienen (sola o junto a otras). Devuelve cuántos cambió. */
export async function renombrarUnidad(de: string, a: string): Promise<number> {
  const { data, error } = await supabase.from('recintos').select('id, unidad_usuaria').ilike('unidad_usuaria', `%${de.replace(/[%_]/g, '\$&')}%`);
  if (error) throw errorDe(error, 'No se pudieron leer los recintos de la unidad');
  const cambios = (data as { id: string; unidad_usuaria: string }[])
    .filter(r => separarUnidades(r.unidad_usuaria).includes(de))
    .map(r => ({ id: r.id, unidad: [...new Set(separarUnidades(r.unidad_usuaria).map(u => (u === de ? a : u)))].join(' / ') }));
  for (let i = 0; i < cambios.length; i += 20) {
    const tanda = await Promise.all(cambios.slice(i, i + 20).map(c => supabase.from('recintos').update({ unidad_usuaria: c.unidad }).eq('id', c.id)));
    const fallo = tanda.find(t => t.error);
    if (fallo?.error) throw errorDe(fallo.error, 'No se pudo cambiar la unidad');
  }
  return cambios.length;
}

/** Fichas de los edificios de un campus (código, nombre y categoría) para la configuración. */
export async function listarFichasDeCampus(siglaCampus: string): Promise<Pick<FichaEdificio, 'codigo' | 'nombre' | 'categoria'>[]> {
  const { data, error } = await supabase.from('edificios').select('codigo, nombre, categoria').like('codigo', `${siglaCampus}%`).order('codigo');
  if (error) throw errorDe(error, 'No se pudieron leer los edificios');
  return data as Pick<FichaEdificio, 'codigo' | 'nombre' | 'categoria'>[];
}

/** Crea o actualiza el nombre y la categoría de un edificio (el resto de su ficha no cambia). */
export async function guardarDatosEdificio(codigo: string, datos: { nombre: string; categoria: string | null; campus_nombre?: string }): Promise<void> {
  const { error } = await supabase.from('edificios').upsert({ codigo, ...datos }, { onConflict: 'codigo' });
  if (error) throw errorDe(error, `No se pudo guardar el edificio ${codigo}`);
}
