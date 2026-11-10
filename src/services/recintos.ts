// Acceso a datos del módulo de recintos y planos (Postgres en Supabase). Las pantallas no hablan con la base
// directamente: todo pasa por aquí.
import { fechaDeNombre } from '../utils/emparejarLaminas';
import { supabase } from '../lib/supabase';
import type { CambioRecinto, DocumentoEdificio, FichaEdificio, Ocupante, Piso, Recinto, ZonaRecinto } from '../types/recintos';
import { datosDePiso } from '../utils/importacionRecintos';
import { comoTitulo } from '../utils/texto';
import { corregirTildes } from '../utils/formatoNombres';
import { clavePersona } from '../utils/analisisEspacios';

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
type EdificioBuscable = { codigo: string; nombre: string | null; direccion: string | null; uso_principal: string | null; campus_nombre: string | null };
let cacheEdificios: { cuando: number; lista: EdificioBuscable[] } | null = null;
/** Todos los edificios (código, nombre, dirección, uso y campus), guardados 10 minutos para buscar sin consultar cada tecla. */
async function edificiosParaBuscar(): Promise<EdificioBuscable[]> {
  if (cacheEdificios && Date.now() - cacheEdificios.cuando < 600000) return cacheEdificios.lista;
  const { data, error } = await supabase.from('edificios').select('codigo, nombre, direccion, uso_principal, campus_nombre').order('codigo');
  if (error) throw errorDe(error, 'No se pudo buscar');
  cacheEdificios = { cuando: Date.now(), lista: data as EdificioBuscable[] };
  return cacheEdificios.lista;
}

let cacheValores: { cuando: number; filas: Pick<Recinto, 'unidad_usuaria' | 'ocupantes'>[] } | null = null;
/** Unidad y ocupantes de todos los recintos vigentes: base del autocompletado de unidades y personas. */
export async function valoresParaAutocompletar(): Promise<Pick<Recinto, 'unidad_usuaria' | 'ocupantes'>[]> {
  if (cacheValores && Date.now() - cacheValores.cuando < 600000) return cacheValores.filas;
  const { data, error } = await supabase.from('recintos').select('unidad_usuaria, ocupantes').neq('estado', 'Eliminado');
  if (error) throw errorDe(error, 'No se pudieron leer las unidades');
  cacheValores = { cuando: Date.now(), filas: data as Pick<Recinto, 'unidad_usuaria' | 'ocupantes'>[] };
  return cacheValores.filas;
}

export async function buscarEspacios(texto: string): Promise<ResultadoBusqueda[]> {
  // Se quitan los caracteres que tienen significado en el filtro de la base.
  const t = texto.replace(/[,()%*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 2) return [];
  const p = `"%${t}%"`;
  const palabras = normalizarBusqueda(t).split(' ').filter(Boolean);
  const columnas = 'id, edificio_codigo, codigo, nombre, uso, unidad_usuaria, superficie_m2, estado, ocupantes';
  let consultaRecintos = supabase.from('recintos').select(columnas);
  for (const palabra of palabras) consultaRecintos = consultaRecintos.ilike('busqueda', `%${palabra}%`);
  // Los edificios son pocos: se leen una vez y se filtran aquí, sin tildes y con las palabras en cualquier orden
  // («duran» encuentra «TERESA DURÁN»; «clotario csf» encuentra «CSF16 · Clotario Blest»).
  const [todos, r0] = await Promise.all([edificiosParaBuscar(), consultaRecintos.order('codigo').limit(60)]);
  let r = r0;
  const e = { error: null as null | { message: string }, data: todos.filter(x => {
    const texto = normalizarBusqueda([x.codigo, x.nombre, x.direccion, x.uso_principal, x.campus_nombre].filter(Boolean).join(' '));
    return palabras.every(w => texto.includes(w));
  }).slice(0, 12) };
  // Si la base aún no tiene la columna de búsqueda (migración 0006 pendiente), se busca como antes: sin ocupantes.
  if (r.error && /busqueda/.test(r.error.message)) {
    r = await supabase.from('recintos').select(columnas)
      .or(`codigo.ilike.${p},nombre.ilike.${p},uso.ilike.${p},unidad_usuaria.ilike.${p}`).order('codigo').limit(60) as typeof r0;
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

/** Columnas del recinto que se pueden escribir. Las demás las pone la base (fechas, autor y la columna de búsqueda). */
const COLUMNAS_EDITABLES = [
  'edificio_codigo', 'piso_id', 'codigo', 'nombre', 'uso', 'superficie_m2', 'superficie_oguc_m2', 'capacidad', 'estado',
  'unidad_usuaria', 'ocupantes', 'foto_url', 'observaciones', 'atributos', 'origen',
  'fecha_alta', 'motivo_alta', 'fecha_baja', 'motivo_baja', 'tenencia',
] as const;

/** Lo que se envía a la base al guardar un recinto: solo columnas editables y sin ocupantes vacíos. */
export function datosParaGuardar(recinto: Partial<Recinto>): Partial<Recinto> {
  const datos: Record<string, unknown> = {};
  for (const c of COLUMNAS_EDITABLES) if (recinto[c] !== undefined) datos[c] = recinto[c];
  // Las tildes que faltan se corrigen siempre («Rectoria» → «Rectoría»), sin tocar las mayúsculas.
  for (const c of ['nombre', 'uso', 'unidad_usuaria'] as const) if (typeof datos[c] === 'string') datos[c] = corregirTildes(datos[c] as string);
  if (Array.isArray(recinto.ocupantes)) {
    datos.ocupantes = recinto.ocupantes
      // Los nombres de personas se guardan siempre en formato título («María de la Luz Pérez»).
      .map(o => ({ nombre: comoTitulo(o.nombre || ''), cargo: o.cargo?.trim() || null, unidad: o.unidad?.trim() || null }))
      .filter(o => o.nombre);
  }
  return datos as Partial<Recinto>;
}

export async function guardarRecinto(recinto: Omit<Recinto, 'id'> & { id?: string }): Promise<Recinto> {
  const id = recinto.id;
  const datos = datosParaGuardar(recinto);
  const consulta = id
    ? supabase.from('recintos').update(datos).eq('id', id).select().single()
    : supabase.from('recintos').insert(datos).select().single();
  const { data, error } = await consulta;
  if (error) throw errorDe(error, 'No se pudo guardar el recinto');
  return data as Recinto;
}

/**
 * Cambia a una persona de recinto (por ejemplo, de oficina): la agrega al destino y, salvo que se pida conservarla
 * (oficina compartida o segunda oficina), la quita del origen. Ambos cambios quedan en el historial de cada recinto.
 * Si la persona ya figuraba en el destino, no se duplica.
 */
export async function moverOcupante(origenId: string, ocupante: Ocupante, destinoId: string, conservarEnOrigen = false): Promise<void> {
  if (origenId === destinoId) throw new Error('El recinto de destino es el mismo de origen.');
  const leer = async (id: string) => {
    const { data, error } = await supabase.from('recintos').select('id, codigo, ocupantes').eq('id', id).single();
    if (error) throw errorDe(error, 'No se pudo leer el recinto');
    return data as Pick<Recinto, 'id' | 'codigo' | 'ocupantes'>;
  };
  const [origen, destino] = await Promise.all([leer(origenId), leer(destinoId)]);
  const clave = clavePersona(ocupante.nombre);
  const enDestino = (destino.ocupantes || []).some(o => clavePersona(o.nombre) === clave);
  if (!enDestino) {
    const { error } = await supabase.from('recintos').update(datosParaGuardar({ ocupantes: [...(destino.ocupantes || []), ocupante] })).eq('id', destinoId);
    if (error) throw errorDe(error, `No se pudo agregar a la persona en ${destino.codigo}`);
  }
  if (!conservarEnOrigen) {
    const restantes = (origen.ocupantes || []).filter(o => clavePersona(o.nombre) !== clave);
    const { error } = await supabase.from('recintos').update(datosParaGuardar({ ocupantes: restantes })).eq('id', origenId);
    if (error) throw errorDe(error, `Se agregó en ${destino.codigo}, pero no se pudo quitar de ${origen.codigo}`);
  }
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
      nombre: corregirTildes(f.recinto.nombre), uso: corregirTildes(f.recinto.uso), unidad_usuaria: corregirTildes(f.recinto.unidad_usuaria),
      ...(f.recinto.ocupantes ? { ocupantes: f.recinto.ocupantes.map(o => ({ ...o, nombre: comoTitulo(o.nombre) })) } : {}),
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

/** Registra un documento. Con `reemplaza_a`, es una nueva versión, la anterior deja de estar vigente y conserva sus zonas demarcadas. */
export async function registrarDocumento(documento: Omit<DocumentoEdificio, 'id' | 'vigente' | 'creado_en' | 'creado_por'>, vigente = true): Promise<DocumentoEdificio> {
  let escala = documento.escala ?? null;
  if (documento.reemplaza_a && !escala) {
    const ant = await supabase.from('documentos').select('escala').eq('id', documento.reemplaza_a).maybeSingle();
    escala = (ant.data as { escala?: string | null } | null)?.escala || null;
  }
  const { data, error } = await supabase.from('documentos').insert({ ...documento, escala, vigente }).select().single();
  if (error) throw errorDe(error, 'No se pudo registrar el documento');
  const creado = data as DocumentoEdificio;
  if (documento.reemplaza_a) {
    await copiarZonasEntreLaminas(documento.reemplaza_a, creado.id).catch(() => {});
  }
  return creado;
}

/** Crea el registro del plano y sube su PDF al visor en un solo paso. */
export async function crearYSubirLamina(params: {
  edificio_codigo: string;
  archivo: File;
  piso_id?: string | null;
  codigo_lamina?: string | null;
  titulo?: string;
  especialidad?: DocumentoEdificio['especialidad'];
  drive_url?: string;
  /** Fecha del plano; si no se indica, la que trae el nombre del archivo («… 260713.pdf») o la de hoy. */
  fecha_documento?: string | null;
  /** false para una versión anterior (histórica): queda en el registro y en el visor, pero no como lámina vigente. */
  vigente?: boolean;
}): Promise<DocumentoEdificio> {
  const sinExt = params.archivo.name.replace(/\.pdf$/i, '').trim();
  const mLamina = /\b(L\d+|A-\d+|P\d+)\b/i.exec(sinExt);
  const codigoAuto = params.codigo_lamina?.trim() || (mLamina ? mLamina[1].toUpperCase() : null);
  const tituloAuto = params.titulo?.trim() || sinExt || 'Plano de planta';

  const doc = await registrarDocumento({
    edificio_codigo: params.edificio_codigo,
    piso_id: params.piso_id || null,
    titulo: tituloAuto,
    tipo: 'Plano',
    especialidad: params.especialidad || 'Arquitectura',
    formato: 'PDF',
    codigo_lamina: codigoAuto,
    version: params.vigente === false ? (params.fecha_documento || fechaDeNombre(sinExt) || 'anterior') : '1',
    fecha_documento: params.fecha_documento || fechaDeNombre(sinExt) || new Date().toISOString().slice(0, 10),
    reemplaza_a: null,
    drive_url: params.drive_url?.trim() || '',
    proyecto_codigo: null,
    observaciones: `Archivo en Drive: ${params.archivo.name}`,
    archivo_visor: null,
    escala: null,
  }, params.vigente !== false);

  const ruta = await subirLaminaVisor(doc, params.archivo);
  return { ...doc, archivo_visor: ruta };
}

/** Asocia una lámina a un piso del edificio (o la desasocia si pisoId es null). */
export async function asignarPisoALamina(documentoId: string, pisoId: string | null): Promise<void> {
  const { error } = await supabase.from('documentos').update({ piso_id: pisoId }).eq('id', documentoId);
  if (error) throw errorDe(error, 'No se pudo asociar el piso a la lámina');
}

/** Deja una lámina como no vigente para quitarla del visor sin perder su historial. */
export async function archivarLamina(documentoId: string): Promise<void> {
  const { error } = await supabase.from('documentos').update({ vigente: false }).eq('id', documentoId);
  if (error) throw errorDe(error, 'No se pudo quitar la lámina');
}

/** Copia las zonas dibujadas de una lámina anterior a su nueva versión. */
export async function copiarZonasEntreLaminas(origenId: string, destinoId: string): Promise<void> {
  const zonas = await listarZonas(origenId);
  if (!zonas.length) return;
  const nuevas = zonas.map(z => ({
    documento_id: destinoId,
    recinto_id: z.recinto_id,
    pagina: z.pagina,
    poligono: z.poligono,
  }));
  const { error } = await supabase.from('zonas_recinto').upsert(nuevas, { onConflict: 'documento_id,recinto_id' });
  if (error) throw errorDe(error, 'No se pudieron transferir las zonas a la nueva versión');
}

// ── Visor de planos ──

/** Guarda (o reemplaza) la copia en PDF de una lámina para mostrarla en el visor. */
export async function subirLaminaVisor(documento: DocumentoEdificio, archivo: File): Promise<string> {
  if (archivo.type && archivo.type !== 'application/pdf') throw new Error('La lámina debe ser un archivo PDF.');
  // Cada subida va a un archivo con nombre nuevo: el almacenamiento guarda en caché las descargas (hasta una hora), así
  // que reemplazar el PDF con el mismo nombre seguía mostrando la lámina anterior en el visor.
  const ruta = `${documento.edificio_codigo}/${documento.id}-${Date.now()}.pdf`;
  const subida = await supabase.storage.from('laminas').upload(ruta, archivo, { upsert: true, contentType: 'application/pdf' });
  if (subida.error) throw errorDe({ message: subida.error.message }, 'No se pudo subir la lámina');
  const { error } = await supabase.from('documentos').update({ archivo_visor: ruta }).eq('id', documento.id);
  if (error) throw errorDe(error, 'La lámina se subió, pero no se pudo asociar al documento');
  // La copia anterior ya no se usa: se borra (si falla, solo queda un archivo de más).
  if (documento.archivo_visor && documento.archivo_visor !== ruta) {
    await supabase.storage.from('laminas').remove([documento.archivo_visor]).catch(() => {});
  }
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
export async function listarLaminasDeCampus(siglaCampus: string, incluirAnteriores = false): Promise<DocumentoEdificio[]> {
  let consulta = supabase.from('documentos').select('*').like('edificio_codigo', `${siglaCampus}%`).eq('tipo', 'Plano');
  if (!incluirAnteriores) consulta = consulta.eq('vigente', true);
  const { data, error } = await consulta;
  if (error) throw errorDe(error, 'No se pudieron leer las láminas del campus');
  return data as DocumentoEdificio[];
}

/**
 * Sube el CAD (DWG) vigente de un edificio: queda registrado como documento «Plano · DWG» con su archivo en el
 * almacenamiento «cad», y el DWG anterior pasa a versión reemplazada (sigue descargable en su historial).
 */
export async function subirCadEdificio(edificio: string, archivo: File): Promise<DocumentoEdificio> {
  const { data: previos } = await supabase.from('documentos').select('id').eq('edificio_codigo', edificio)
    .eq('tipo', 'Plano').eq('formato', 'DWG').eq('vigente', true);
  const sinExt = archivo.name.replace(/\.dwg$/i, '').trim();
  const fecha = fechaDeNombre(sinExt);
  const doc = await registrarDocumento({
    edificio_codigo: edificio, piso_id: null, titulo: `CAD del edificio · ${archivo.name}`, tipo: 'Plano', especialidad: 'Arquitectura',
    formato: 'DWG', codigo_lamina: null, version: fecha || '1', fecha_documento: fecha || new Date().toISOString().slice(0, 10),
    reemplaza_a: null, drive_url: '', proyecto_codigo: null, observaciones: `Archivo: ${archivo.name}`, archivo_visor: null, escala: null,
  });
  const ruta = `${edificio}/${doc.id}-${Date.now()}.dwg`;
  const subida = await supabase.storage.from('cad').upload(ruta, archivo, { upsert: true, contentType: 'application/octet-stream' });
  if (subida.error) {
    await supabase.from('documentos').delete().eq('id', doc.id);
    throw errorDe({ message: subida.error.message }, `No se pudo subir el CAD de ${edificio} (¿falta ejecutar la migración 0008?)`);
  }
  const { error } = await supabase.from('documentos').update({ archivo: ruta }).eq('id', doc.id);
  if (error) throw errorDe(error, 'No se pudo registrar el CAD');
  const anteriores = (previos || []).map(p => (p as { id: string }).id);
  if (anteriores.length) await supabase.from('documentos').update({ vigente: false }).in('id', anteriores);
  return { ...doc, archivo: ruta };
}

/** Abre (PDF) o descarga (DWG) el archivo guardado de un documento, con un enlace temporal. */
export async function abrirArchivoDocumento(d: Pick<DocumentoEdificio, 'archivo' | 'archivo_visor' | 'titulo' | 'edificio_codigo' | 'codigo_lamina'>, cad = false): Promise<void> {
  const ruta = cad ? d.archivo : d.archivo_visor;
  if (!ruta) throw new Error('Este documento no tiene archivo guardado en el sistema.');
  const nombre = cad ? (d.titulo.replace(/^CAD del edificio · /, '') || `${d.edificio_codigo}.dwg`) : `${d.edificio_codigo} ${d.codigo_lamina || ''}.pdf`.replace(/\s+\.pdf$/, '.pdf');
  const { data, error } = await supabase.storage.from(cad ? 'cad' : 'laminas').createSignedUrl(ruta, 120, cad ? { download: nombre } : undefined);
  if (error || !data) throw errorDe({ message: error?.message }, 'No se pudo abrir el archivo');
  window.open(data.signedUrl, '_blank', 'noopener');
}

// ── Planta vectorial por capas de una lámina (migración 0016) ──

export interface CapaVectorial { id: string; nombre: string; d: string; relleno?: string }
export interface PlantaVectorial {
  version: number; edificio?: string; lamina?: string; W: number; H: number; calce?: string;
  capas: CapaVectorial[];
  textos: { capa: string; x: number; y: number; t: string; h: number; r: number }[];
}

/** Planta vectorial de la lámina, o null si aún no tiene (o la tabla no existe todavía). */
export async function obtenerPlantaVectorial(documentoId: string): Promise<PlantaVectorial | null> {
  const { data, error } = await supabase.from('laminas_vectoriales').select('datos').eq('documento_id', documentoId).maybeSingle();
  if (error) return null;
  return (data as { datos: PlantaVectorial } | null)?.datos ?? null;
}

/** Revisa que un archivo de planta vectorial tenga la forma esperada antes de guardarlo. */
export function validarPlantaVectorial(v: unknown): PlantaVectorial {
  const p = v as PlantaVectorial;
  if (!p || typeof p !== 'object' || !(p.W > 0) || !(p.H > 0) || !Array.isArray(p.capas) || !Array.isArray(p.textos)
    || p.capas.some(c => typeof c?.id !== 'string' || typeof c?.d !== 'string')) {
    throw new Error('El archivo no es una planta vectorial válida (debe venir de planta_vectorial.py).');
  }
  return p;
}

/**
 * Motivo por el que una planta no corresponde a la lámina (otra lámina u otro edificio), o null si corresponde. Las
 * plantas vienen con el edificio y la lámina con que se generaron.
 */
export function plantaAjena(planta: PlantaVectorial, documento: Pick<DocumentoEdificio, 'edificio_codigo' | 'codigo_lamina'>): string | null {
  if (planta.edificio && planta.edificio !== documento.edificio_codigo) return `es del edificio ${planta.edificio} y esta lámina es de ${documento.edificio_codigo}`;
  if (planta.lamina && documento.codigo_lamina && planta.lamina !== documento.codigo_lamina) return `es de la lámina ${planta.lamina} y esta es la ${documento.codigo_lamina}`;
  return null;
}

export async function eliminarPlantaVectorial(documentoId: string): Promise<void> {
  const { error } = await supabase.from('laminas_vectoriales').delete().eq('documento_id', documentoId);
  if (error) throw errorDe(error, 'No se pudo quitar la planta vectorial');
}

export async function guardarPlantaVectorial(documentoId: string, planta: PlantaVectorial): Promise<void> {
  const { error } = await supabase.from('laminas_vectoriales').upsert({ documento_id: documentoId, datos: planta, generado_en: new Date().toISOString() });
  if (error) throw errorDe(error, 'No se pudo guardar la planta vectorial (¿falta ejecutar la migración 0016?)');
}

// ── Plano general (o ilustración) de cada campus ──
// Un solo archivo vigente por campus en «laminas/campus/<SIGLA>/», PDF o imagen. Cada subida usa un nombre nuevo (por
// la caché del almacenamiento) y borra las anteriores.

export interface PlanoGeneralCampus { ruta: string; esPdf: boolean; url: string }

const TIPOS_PLANO_CAMPUS: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Plano general vigente del campus (con un enlace temporal para mostrarlo), o null si aún no tiene. */
export async function obtenerPlanoGeneralCampus(sigla: string): Promise<PlanoGeneralCampus | null> {
  const carpeta = `campus/${sigla}`;
  const { data, error } = await supabase.storage.from('laminas').list(carpeta, { sortBy: { column: 'name', order: 'desc' }, limit: 20 });
  if (error) throw errorDe({ message: error.message }, 'No se pudo leer el plano general del campus');
  const archivo = (data || []).find(f => /\.(pdf|png|jpe?g|webp)$/i.test(f.name));
  if (!archivo) return null;
  const ruta = `${carpeta}/${archivo.name}`;
  const firmado = await supabase.storage.from('laminas').createSignedUrl(ruta, 3600);
  if (firmado.error || !firmado.data) throw errorDe({ message: firmado.error?.message }, 'No se pudo abrir el plano general del campus');
  return { ruta, esPdf: /\.pdf$/i.test(archivo.name), url: firmado.data.signedUrl };
}

/** Sube (o reemplaza) el plano general o la ilustración del campus: PDF, PNG, JPG o WebP. */
export async function subirPlanoGeneralCampus(sigla: string, archivo: File): Promise<void> {
  const ext = (archivo.name.split('.').pop() || '').toLowerCase();
  const tipo = TIPOS_PLANO_CAMPUS[ext];
  if (!tipo) throw new Error('El plano general debe ser un PDF o una imagen (PNG, JPG o WebP).');
  const carpeta = `campus/${sigla}`;
  const { data: anteriores } = await supabase.storage.from('laminas').list(carpeta, { limit: 100 });
  const ruta = `${carpeta}/general-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const subida = await supabase.storage.from('laminas').upload(ruta, archivo, { upsert: true, contentType: tipo });
  if (subida.error) {
    const sinPermisoTipo = /mime|not supported|tipo/i.test(subida.error.message) && tipo !== 'application/pdf';
    throw errorDe({ message: subida.error.message }, sinPermisoTipo
      ? 'El almacenamiento aún no acepta imágenes: falta ejecutar la migración 0012 (o suba el plano en PDF)'
      : 'No se pudo subir el plano general del campus');
  }
  const viejos = (anteriores || []).map(f => `${carpeta}/${f.name}`).filter(r => r !== ruta);
  if (viejos.length) await supabase.storage.from('laminas').remove(viejos).catch(() => {});
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
  const { data, error } = await supabase.from('recintos').select('id, unidad_usuaria').ilike('unidad_usuaria', `%${de.replace(/[%_]/g, '\\$&')}%`);
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

/**
 * Aplica de una vez varios cambios de nombre (formato, tildes, unificar duplicados) en todos los recintos. `mapa`
 * va de valor actual a valor nuevo; en unidades, un valor nuevo vacío quita esa unidad (no era una unidad). En las
 * unidades también se corrige la unidad de cada ocupante. Devuelve cuántos recintos cambiaron.
 */
export async function aplicarRenombres(campo: 'nombre' | 'uso' | 'unidad', mapa: Record<string, string>, alAvanzar?: (hechos: number, total: number) => void): Promise<number> {
  const pares = Object.entries(mapa).filter(([de, a]) => de !== a);
  if (campo !== 'unidad') {
    let cambiados = 0;
    for (let i = 0; i < pares.length; i += 5) {
      const tanda = await Promise.all(pares.slice(i, i + 5).map(([de, a]) => supabase.from('recintos').update({ [campo]: a }).eq(campo, de).select('id')));
      const fallo = tanda.find(t => t.error);
      if (fallo?.error) throw errorDe(fallo.error, 'No se pudieron aplicar los cambios');
      cambiados += tanda.reduce((s, t) => s + (t.data?.length || 0), 0);
      alAvanzar?.(Math.min(i + 5, pares.length), pares.length);
    }
    return cambiados;
  }
  // Unidades: se leen todos los recintos con unidad u ocupantes y se reescriben los que cambian.
  type Fila = { id: string; unidad_usuaria: string | null; ocupantes: Ocupante[] | null };
  const filas: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('recintos').select('id, unidad_usuaria, ocupantes').order('id').range(desde, desde + 999);
    if (error) throw errorDe(error, 'No se pudieron leer los recintos');
    filas.push(...(data as Fila[]));
    if (data.length < 1000) break;
  }
  const nuevo = (u: string) => (u in mapa ? mapa[u] : u);
  const cambios = filas.flatMap(r => {
    const unidades = [...new Set(separarUnidades(r.unidad_usuaria).map(nuevo).filter(Boolean))].join(' / ') || null;
    const ocupantes = (r.ocupantes || []).map(o => (o.unidad && o.unidad in mapa ? { ...o, unidad: mapa[o.unidad] || null } : o));
    const cambio = unidades !== (r.unidad_usuaria || null) || JSON.stringify(ocupantes) !== JSON.stringify(r.ocupantes || []);
    return cambio ? [{ id: r.id, unidad_usuaria: unidades, ocupantes }] : [];
  });
  for (let i = 0; i < cambios.length; i += 20) {
    const tanda = await Promise.all(cambios.slice(i, i + 20).map(({ id, ...datos }) => supabase.from('recintos').update(datos).eq('id', id)));
    const fallo = tanda.find(t => t.error);
    if (fallo?.error) throw errorDe(fallo.error, 'No se pudieron aplicar los cambios');
    alAvanzar?.(Math.min(i + 20, cambios.length), cambios.length);
  }
  return cambios.length;
}
