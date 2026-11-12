// Módulo de Asignación de Espacios: propuestas de cambio y movimientos de personas entre recintos (migración 0021).
import { supabase } from '../lib/supabase';
import type { Ocupante } from '../types/recintos';
import type { EstadoRecinto, RecintoAsignable } from '../utils/asignacion';

export interface Propuesta {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: 'Borrador' | 'Aplicada' | 'Descartada';
  resumen: ResumenPropuesta | null;
  creado_por: string | null;
  creado_en: string;
  aplicado_por: string | null;
  aplicado_en: string | null;
}

/** Antes y después de cada recinto, guardado al aplicar una propuesta. */
export type ResumenPropuesta = { codigo: string; nombre: string; edificio_codigo: string; superficie_m2: number | null; antes: Ocupante[]; despues: Ocupante[] }[];

export interface Movimiento {
  id: string;
  propuesta_id: string | null;
  persona: Ocupante;
  desde_id: string | null;
  desde_codigo: string | null;
  hacia_id: string | null;
  hacia_codigo: string | null;
  conservar_origen: boolean;
  /** Cambio de unidad (migración 0022): la que tenía y la que pasa a tener. */
  unidad_anterior?: string | null;
  unidad_nueva?: string | null;
  estado: 'Propuesto' | 'Aplicado';
  orden: number;
  realizado_por: string | null;
  realizado_en: string | null;
  creado_en: string;
}

const fallo = (error: { message: string } | null, texto: string) => {
  if (!error) return;
  const sinTabla = /asignacion_|aplicar_movimientos|does not exist|schema cache/i.test(error.message);
  throw new Error(`${texto}${sinTabla ? ' (¿falta ejecutar la migración 0021?)' : `: ${error.message}`}`);
};

/** Recintos vigentes con lo que necesita la asignación (código, superficie, capacidad y ocupantes). */
export async function listarRecintosAsignables(): Promise<RecintoAsignable[]> {
  const filas: RecintoAsignable[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('recintos')
      .select('id, codigo, nombre, edificio_codigo, superficie_m2, capacidad, unidad_usuaria, ocupantes')
      .neq('estado', 'Eliminado').order('codigo').range(desde, desde + 999);
    fallo(error, 'No se pudieron leer los recintos');
    filas.push(...(data as RecintoAsignable[]));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

export async function listarPropuestas(): Promise<Propuesta[]> {
  const { data, error } = await supabase.from('asignacion_propuestas').select('*').order('creado_en', { ascending: false });
  fallo(error, 'No se pudieron leer las propuestas');
  return data as Propuesta[];
}

export async function crearPropuesta(nombre: string, descripcion: string, usuario: string): Promise<Propuesta> {
  const { data, error } = await supabase.from('asignacion_propuestas').insert({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, creado_por: usuario }).select().single();
  fallo(error, 'No se pudo crear la propuesta');
  return data as Propuesta;
}

export async function actualizarPropuesta(id: string, cambios: Partial<Pick<Propuesta, 'nombre' | 'descripcion' | 'estado'>>): Promise<void> {
  const { error } = await supabase.from('asignacion_propuestas').update(cambios).eq('id', id);
  fallo(error, 'No se pudo guardar la propuesta');
}

export async function eliminarPropuesta(id: string): Promise<void> {
  const { error } = await supabase.from('asignacion_propuestas').delete().eq('id', id);
  fallo(error, 'No se pudo eliminar la propuesta');
}

export async function listarMovimientosDePropuesta(propuestaId: string): Promise<Movimiento[]> {
  const { data, error } = await supabase.from('asignacion_movimientos').select('*').eq('propuesta_id', propuestaId).order('orden').order('creado_en');
  fallo(error, 'No se pudieron leer los movimientos');
  return data as Movimiento[];
}

/** Movimientos ya aplicados (el historial), del más reciente al más antiguo. */
export async function listarHistorial(limite = 500): Promise<Movimiento[]> {
  const { data, error } = await supabase.from('asignacion_movimientos').select('*').eq('estado', 'Aplicado')
    .order('realizado_en', { ascending: false }).limit(limite);
  fallo(error, 'No se pudo leer el historial');
  return data as Movimiento[];
}

/** Salidas ya aplicadas (personas que dejaron un recinto sin pasar a otro, p. ej. porque ya no están en la nómina). */
export async function listarSalidas(): Promise<Movimiento[]> {
  const { data, error } = await supabase.from('asignacion_movimientos').select('*').eq('estado', 'Aplicado')
    .is('hacia_id', null).not('desde_id', 'is', null).order('realizado_en', { ascending: false }).limit(2000);
  fallo(error, 'No se pudieron leer las salidas');
  return data as Movimiento[];
}

type NuevoMovimiento = Pick<Movimiento, 'persona' | 'desde_id' | 'hacia_id'> & { conservar_origen?: boolean; unidad_nueva?: string | null };

/** Guarda movimientos (de una propuesta, o sueltos si propuestaId es null) con el código de cada recinto. */
export async function agregarMovimientos(propuestaId: string | null, movimientos: NuevoMovimiento[], codigos: Map<string, string>, ordenInicial = 0): Promise<Movimiento[]> {
  if (!movimientos.length) return [];
  const filas = movimientos.map((m, i) => ({
    propuesta_id: propuestaId,
    // Con unidad nueva, la persona llega al destino con esa unidad; la anterior queda para el historial.
    persona: { nombre: m.persona.nombre, cargo: m.persona.cargo || null, unidad: (m.unidad_nueva?.trim() || m.persona.unidad) || null },
    ...(m.unidad_nueva?.trim() && m.unidad_nueva.trim() !== (m.persona.unidad || '') ? { unidad_anterior: m.persona.unidad || null, unidad_nueva: m.unidad_nueva.trim() } : {}),
    desde_id: m.desde_id, desde_codigo: m.desde_id ? codigos.get(m.desde_id) || null : null,
    hacia_id: m.hacia_id, hacia_codigo: m.hacia_id ? codigos.get(m.hacia_id) || null : null,
    conservar_origen: !!m.conservar_origen,
    orden: ordenInicial + i,
  }));
  const { data, error } = await supabase.from('asignacion_movimientos').insert(filas).select();
  fallo(error, 'No se pudieron guardar los movimientos');
  return data as Movimiento[];
}

export async function quitarMovimiento(id: string): Promise<void> {
  const { error } = await supabase.from('asignacion_movimientos').delete().eq('id', id).eq('estado', 'Propuesto');
  fallo(error, 'No se pudo quitar el movimiento');
}

/** Aplica movimientos en los recintos, todos o ninguno (función aplicar_movimientos de la base). */
export async function aplicarMovimientos(ids: string[], usuario: string): Promise<number> {
  const { data, error } = await supabase.rpc('aplicar_movimientos', { p_ids: ids, p_usuario: usuario });
  fallo(error, 'No se pudieron aplicar los cambios');
  return data as number;
}

/** Mueve o ubica personas de inmediato (sin propuesta): quedan en el historial. */
export async function moverAhora(movimientos: NuevoMovimiento[], codigos: Map<string, string>, usuario: string): Promise<number> {
  const guardados = await agregarMovimientos(null, movimientos, codigos);
  return aplicarMovimientos(guardados.map(m => m.id), usuario);
}

/** Aplica una propuesta: guarda su antes y después, aplica sus movimientos y la deja como «Aplicada». */
export async function aplicarPropuesta(propuesta: Propuesta, movimientos: Movimiento[], simulacion: EstadoRecinto[], usuario: string): Promise<void> {
  const resumen: ResumenPropuesta = simulacion.map(s => ({
    codigo: s.recinto.codigo, nombre: s.recinto.nombre, edificio_codigo: s.recinto.edificio_codigo, superficie_m2: s.recinto.superficie_m2 ?? null,
    antes: s.antes, despues: s.despues,
  }));
  await aplicarMovimientos(movimientos.filter(m => m.estado === 'Propuesto').map(m => m.id), usuario);
  const { error } = await supabase.from('asignacion_propuestas').update({ estado: 'Aplicada', resumen, aplicado_por: usuario, aplicado_en: new Date().toISOString() }).eq('id', propuesta.id);
  fallo(error, 'Los cambios se aplicaron, pero no se pudo marcar la propuesta como aplicada');
}
