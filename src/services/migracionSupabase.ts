import { collection, getDocs, type DocumentData } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { supabase, SUPABASE_CONFIGURADO } from '../lib/supabase';
import { SYSTEM_ADMIN_EMAIL } from '../lib/adminSistema';

// ═══════════════════════════════════════════════════════════════════
// UNIFICACIÓN EN SUPABASE · ETAPA 1: COPIA COMPLETA Y VERIFICABLE
// Firestore sigue siendo la fuente. El administrador copia todo a las tablas de Supabase (migraciones 0011 y 0014):
// sola una vez al día al entrar, o a mano desde Configuración › Unificación, donde además se comparan los conteos.
// Es idempotente (upsert por id): repetirla no duplica nada.
// ═══════════════════════════════════════════════════════════════════

const CLAVE_MIGRACION_STORAGE = 'dgdc:migracion_firestore_supabase_v1';

/** Etapa 2 activa: proyectos, licitaciones, proveedores, cotizaciones e inscripciones ya viven en Supabase. */
export const SUPABASE_ES_FUENTE_ETAPA_2 = true;
const ahora = () => new Date().toISOString();

/**
 * Fecha en ISO a partir de lo que guarda Firestore (texto, Timestamp o milisegundos). Si no se puede leer, usa la de
 * hoy: una fecha rara no debe abortar toda la copia (`toISOString` de una fecha inválida lanza un error).
 */
function fechaIso(v: unknown): string {
  const t = v as { toDate?: () => Date } | null;
  const fecha = typeof t?.toDate === 'function' ? t.toDate() : typeof v === 'number' || typeof v === 'string' ? new Date(v) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : ahora();
}
const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);

export interface ConteoTabla { leidos: number; copiados: number; error?: string }
export interface ResumenMigracionSupabase {
  fecha: string;
  completa: boolean;
  /** Por tabla de Supabase: documentos leídos en Firestore y filas copiadas. */
  porTabla: Record<string, ConteoTabla>;
}

/** Sube filas en tandas y anota el resultado en el resumen. */
async function subir(resumen: ResumenMigracionSupabase, tabla: string, filas: Record<string, unknown>[], onConflict: string, opciones: { tanda?: number; soloNuevas?: boolean; clave?: string } = {}) {
  const clave = opciones.clave || tabla;
  const c = (resumen.porTabla[clave] ||= { leidos: 0, copiados: 0 });
  c.leidos += filas.length;
  const tanda = opciones.tanda || 400;
  for (let i = 0; i < filas.length; i += tanda) {
    const parte = filas.slice(i, i + tanda);
    const { error } = await supabase.from(tabla).upsert(parte, { onConflict, ignoreDuplicates: !!opciones.soloNuevas });
    if (error) c.error = error.message;
    else c.copiados += parte.length;
  }
}

const docs = async (...ruta: [string, ...string[]]) => (await getDocs(collection(db, ...ruta)).catch(() => null))?.docs || [];

/**
 * Copia Firestore → Supabase. Sin `forzar`, corre como mucho una vez al día y solo para el administrador del sistema;
 * con `forzar` (botón de Configuración) incluye además el historial de auditoría y las fotos del libro de obra.
 */
export async function sincronizarFirestoreASupabase(forzar = false, onAvance?: (texto: string) => void): Promise<ResumenMigracionSupabase | null> {
  if (!SUPABASE_CONFIGURADO) return null;
  const email = (auth.currentUser?.email || '').toLowerCase();
  if (email !== SYSTEM_ADMIN_EMAIL) return null;

  if (!forzar) {
    try {
      const previo = localStorage.getItem(CLAVE_MIGRACION_STORAGE);
      const datos = previo ? (JSON.parse(previo) as { fecha?: string }) : null;
      // Una vez al día basta (las escrituras en vivo mantienen la copia entre medio): cada pasada lee todas las
      // colecciones de Firestore y hacerlo seguido puede agotar la cuota diaria de lecturas.
      if (datos?.fecha && Date.now() - new Date(datos.fecha).getTime() < 24 * 3600_000) return null;
    } catch { /* continuar */ }
  }

  // Sin las tablas de la migración 0011 no hay dónde copiar.
  const { error: probeError } = await supabase.from('configuracion').select('id').limit(1);
  if (probeError) return null;

  const resumen: ResumenMigracionSupabase = { fecha: ahora(), completa: forzar, porTabla: {} };
  const avance = (t: string) => onAvance?.(t);

  try {
    // 1. Configuración compartida
    avance('Configuración…');
    await subir(resumen, 'configuracion', (await docs('configuracion')).map(d => ({
      id: d.id, valor: String(d.data().valor ?? ''), actualizado_por: texto(d.data().actualizadoPor) || email, fecha_actualizacion: ahora(),
    })), 'id');

    // 2. Usuarios (perfiles y roles)
    avance('Usuarios…');
    await subir(resumen, 'usuarios', (await docs('usuarios')).map(d => {
      const u = d.data();
      return {
        uid: d.id, email: String(u.email || ''), role: ['admin', 'responsable', 'proveedor'].includes(u.role) ? u.role : 'responsable',
        display_name: texto(u.displayName), proveedor_id: texto(u.proveedorId), token_invitacion: texto(u.tokenInvitacion),
        fecha_registro: fechaIso(u.fechaRegistro), verificado: u.verificado ?? true, datos: { ...u, uid: d.id }, actualizado_en: ahora(),
      };
    }), 'uid');

    // 3 a 8: desde la etapa 2 Supabase es la FUENTE de proveedores, proyectos, contadores, licitaciones,
    // cotizaciones e inscripciones: copiarlos desde Firestore pisaría los datos nuevos con los antiguos.
    if (!SUPABASE_ES_FUENTE_ETAPA_2) {
      // 3. Proveedores, evaluaciones de desempeño e historial de obras
      avance('Proveedores…');
      const proveedores = await docs('proveedores');
      await subir(resumen, 'proveedores', proveedores.map(d => {
        const p = d.data();
        return {
          id: d.id, rut: String(p.rut || ''), razon_social: String(p.razonSocial || ''), email: texto(p.email),
          estado: String(p.estado || 'Activo'), fecha_registro: fechaIso(p.fechaRegistro), datos: p, actualizado_en: ahora(),
        };
      }), 'id');
      const evaluaciones: Record<string, unknown>[] = [];
      const historial: Record<string, unknown>[] = [];
      for (const p of proveedores) {
        const [ev, hi] = await Promise.all([docs('proveedores', p.id, 'evaluacionesDesempeno'), docs('proveedores', p.id, 'historialObras')]);
        ev.forEach(e => evaluaciones.push({
          id: e.id, proveedor_id: p.id, licitacion_id: texto(e.data().licitacionId), fecha: String(e.data().fecha || ''),
          puntaje_final: Number(e.data().puntajeFinal || 0), datos: e.data(), actualizado_en: ahora(),
        }));
        hi.forEach(h => historial.push({
          id: h.id, proveedor_id: p.id, licitacion_id: String(h.data().licitacionId || h.id), fecha: texto(h.data().fecha), datos: h.data(),
        }));
      }
      await subir(resumen, 'evaluaciones_desempeno', evaluaciones, 'id');
      await subir(resumen, 'historial_obras_proveedor', historial, 'proveedor_id,id');

      // 4. Proyectos de la Cartera y su bitácora
      avance('Proyectos…');
      const proyectos = await docs('proyectos');
      await subir(resumen, 'proyectos', proyectos.map(d => {
        const p = d.data();
        return {
          id: d.id, correlativo: Number(p.correlativo || 1), codigo_proyecto: String(p.codigoProyecto || d.id), nombre: String(p.nombre || ''),
          anio_presupuesto: p.anioPresupuesto ? Number(p.anioPresupuesto) : null, campus_sigla: texto(p.campusSigla),
          edificio_sigla: texto(p.edificioSigla), estado: texto(p.estado), gasto_efectivo: Number(p.gastoEfectivo || 0), datos: p, actualizado_en: ahora(),
        };
      }), 'id');
      const bitacoras: Record<string, unknown>[] = [];
      for (const p of proyectos) {
        (await docs('proyectos', p.id, 'bitacoraDesarrollo')).forEach(b => bitacoras.push({
          proyecto_id: p.id, tipo: 'bitacoraDesarrollo', id: b.id, fecha: texto(b.data().fecha), estado: texto(b.data().estado), datos: b.data(), actualizado_en: ahora(),
        }));
      }
      await subir(resumen, 'proyecto_subcolecciones', bitacoras, 'proyecto_id,tipo,id');

      // 5. Contadores de correlativos
      await subir(resumen, 'contadores', (await docs('_counters')).map(d => ({ id: d.id, datos: d.data(), actualizado_en: ahora() })), 'id');

      // 6. Licitaciones y todo lo que cuelga de ellas
      avance('Licitaciones…');
      const licitaciones = await docs('licitaciones');
      await subir(resumen, 'licitaciones', licitaciones.map(d => {
        const l = d.data();
        return {
          id: d.id, proyecto_maestro_id: texto(l.proyectoMaestroId), codigo_proyecto: texto(l.codigoProyecto), nombre_proyecto: String(l.nombreProyecto || ''),
          estado: String(l.estado || 'Borrador'), proveedor_ganador_id: texto(l.proveedorAdjudicadoId) || texto(l.proveedorGanadorId),
          limite_ofertas_ms: l.limiteOfertasMs ? Number(l.limiteOfertasMs) : null, datos: l, actualizado_en: ahora(),
        };
      }), 'id');
      const invitados: Record<string, unknown>[] = [];
      const tokens: Record<string, unknown>[] = [];
      const propuestas: Record<string, unknown>[] = [];
      const subcolecciones: Record<string, unknown>[] = [];
      const fotos: Record<string, unknown>[] = [];
      const TIPOS = ['estadosPago', 'aumentosObra', 'garantias', 'multas', 'aclaraciones', 'consultas', 'consultasPublicadas', 'envios', 'libroObra', 'bitacoraDesarrollo', 'control'] as const;
      let n = 0;
      for (const l of licitaciones) {
        avance(`Licitaciones… ${++n} de ${licitaciones.length}`);
        (await docs('licitaciones', l.id, 'invitados')).forEach(i => {
          const v = i.data();
          invitados.push({
            licitacion_id: l.id, proveedor_id: i.id, proveedor_email: texto(v.proveedorEmail), proveedor_nombre: texto(v.proveedorNombre),
            token_acceso: texto(v.tokenAcceso), estado_propuesta: texto(v.estadoPropuesta), datos: v, actualizado_en: ahora(),
          });
          // Firestore no deja listar «invitaciones» (los tokens): se reconstruyen desde cada invitado.
          if (texto(v.tokenAcceso)) {
            tokens.push({
              token: v.tokenAcceso, licitacion_id: l.id, proveedor_id: i.id,
              proveedor_email: String(v.proveedorEmail || ''), proveedor_nombre: String(v.proveedorNombre || ''),
            });
          }
        });
        (await docs('licitaciones', l.id, 'propuestas')).forEach(p => propuestas.push({
          licitacion_id: l.id, proveedor_id: p.id, estado: texto(p.data().estado), datos: p.data(), actualizado_en: ahora(),
        }));
        for (const tipo of TIPOS) {
          const lista = await docs('licitaciones', l.id, tipo);
          lista.forEach(s => {
            const v: DocumentData = s.data();
            subcolecciones.push({
              id: s.id, licitacion_id: l.id, tipo, proveedor_id: texto(v.proveedorId),
              numero: typeof v.numero === 'number' ? v.numero : v.numero !== undefined && !Number.isNaN(Number(v.numero)) ? Number(v.numero) : null,
              fecha: texto(v.fecha) || texto(v.fechaPregunta), estado: texto(v.estado), datos: v, actualizado_en: ahora(),
            });
          });
          // Las fotos del libro de obra cuelgan de cada anotación (pesadas: solo en la copia completa).
          if (tipo === 'libroObra' && forzar) {
            for (const entrada of lista) {
              (await docs('licitaciones', l.id, 'libroObra', entrada.id, 'fotos')).forEach(f => fotos.push({
                id: `${entrada.id}/${f.id}`, licitacion_id: l.id, tipo: 'libroObraFotos', fecha: texto(f.data().fecha), datos: { ...f.data(), entradaId: entrada.id }, actualizado_en: ahora(),
              }));
            }
          }
        }
      }
      await subir(resumen, 'licitacion_invitados', invitados, 'licitacion_id,proveedor_id');
      await subir(resumen, 'invitaciones_acceso', tokens, 'token');
      await subir(resumen, 'licitacion_propuestas', propuestas, 'licitacion_id,proveedor_id');
      await subir(resumen, 'licitacion_subcolecciones', subcolecciones, 'licitacion_id,tipo,id');
      if (forzar) await subir(resumen, 'licitacion_subcolecciones', fotos, 'licitacion_id,tipo,id', { tanda: 20, clave: 'licitacion_subcolecciones:libroObraFotos' });

      // 7. Cotizaciones
      avance('Cotizaciones…');
      await subir(resumen, 'cotizaciones', (await docs('cotizaciones')).map(d => {
        const c = d.data();
        return {
          id: d.id, licitacion_id: String(c.licitacionId || ''), proveedor_id: String(c.proveedorId || ''), monto_total: Number(c.montoTotal || 0),
          fecha_carga: texto(c.fechaCarga), datos: c, actualizado_en: ahora(),
        };
      }), 'id');

      // 8. Inscripciones de proveedores
      await subir(resumen, 'inscripciones_proveedores', (await docs('inscripcionesProveedores')).map(d => ({
        codigo: d.id, estado: String(d.data().estado || 'Invitada'), datos: d.data(), actualizado_en: ahora(),
      })), 'codigo');
    }

    // 9. Registro de archivos (el contenido se copia aparte, con copiarContenidoArchivos). No se envía «ruta», para no
    //    borrar la de los archivos ya copiados.
    avance('Archivos…');
    await subir(resumen, 'archivos', (await docs('archivos')).map(d => {
      const a = d.data();
      return {
        id: d.id, nombre: String(a.nombre || d.id), tipo: texto(a.tipo), tamano: Number(a.tamano || 0),
        acceso: ['interno', 'invitados', 'oferta', 'inscripcion'].includes(a.acceso) ? a.acceso : 'interno',
        licitacion_id: texto(a.licitacionId), proveedor_id: texto(a.proveedorId), inscripcion: texto(a.inscripcion),
        subido_por: texto(a.subidoPor), fecha: texto(a.fecha), datos: a,
      };
    }), 'id');

    // 10. Historial de auditoría (solo en la copia completa: puede ser largo)
    if (forzar) {
      avance('Historial de auditoría…');
      await subir(resumen, 'auditoria', (await docs('auditoria')).map(d => {
        const a = d.data();
        return {
          origen_id: d.id, fecha: fechaIso(a.fecha), usuario: String(a.usuario || 'desconocido'), accion: String(a.accion || ''),
          entidad: String(a.entidad || ''), entidad_id: String(a.entidadId || ''), nombre: texto(a.nombre), licitacion_id: texto(a.licitacionId),
          cambios: a.cambios ?? null, detalle: texto(a.detalle),
        };
      }), 'origen_id', { soloNuevas: true });
    }

    localStorage.setItem(CLAVE_MIGRACION_STORAGE, JSON.stringify(resumen));
    avance('Listo');
    return resumen;
  } catch (err) {
    console.warn('Error parcial sincronizando Firestore hacia Supabase:', err);
    resumen.porTabla['(error general)'] = { leidos: 0, copiados: 0, error: err instanceof Error ? err.message : String(err) };
    return resumen;
  }
}

/** Último resumen de copia guardado en este navegador (para mostrarlo en Configuración). */
export function ultimoResumenCopia(): ResumenMigracionSupabase | null {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE_MIGRACION_STORAGE) || 'null') as ResumenMigracionSupabase | null;
    return r?.porTabla ? r : null;
  } catch { return null; }
}

/** Registros por tabla en Supabase (función conteo_unificacion de la migración 0014: solo números). */
export async function conteoSupabase(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('conteo_unificacion');
  if (error) throw new Error(`No se pudieron contar los registros en Supabase (¿falta ejecutar la migración 0014?): ${error.message}`);
  return Object.fromEntries((data as { tabla: string; registros: number }[]).map(f => [f.tabla, Number(f.registros)]));
}

/**
 * Copia el contenido de los archivos guardados en Firestore (pedazos en base64) al almacenamiento «archivos-sistema»
 * de Supabase, con el mismo id, y anota la ruta. Solo los que aún no tienen ruta: se puede interrumpir y retomar.
 */
export async function copiarContenidoArchivos(onAvance?: (hechos: number, total: number, nombre: string) => void): Promise<{ copiados: number; errores: string[] }> {
  const { data, error } = await supabase.from('archivos').select('id, nombre, tipo').is('ruta', null);
  if (error) throw new Error(`No se pudo leer el registro de archivos: ${error.message}`);
  const pendientes = data as { id: string; nombre: string; tipo: string | null }[];
  const errores: string[] = [];
  let copiados = 0;
  for (const [i, a] of pendientes.entries()) {
    onAvance?.(i, pendientes.length, a.nombre);
    try {
      const partes = (await docs('archivos', a.id, 'partes')).map(p => p.data() as { n: number; datos: string }).sort((x, y) => x.n - y.n);
      if (!partes.length) throw new Error('sin contenido en Firestore');
      const bytes = partes.map(p => Uint8Array.from(atob(p.datos), ch => ch.charCodeAt(0)));
      const blob = new Blob(bytes, { type: a.tipo || 'application/octet-stream' });
      const subida = await supabase.storage.from('archivos-sistema').upload(a.id, blob, { upsert: true, contentType: a.tipo || 'application/octet-stream' });
      if (subida.error) throw new Error(subida.error.message);
      const { error: e2 } = await supabase.from('archivos').update({ ruta: a.id }).eq('id', a.id);
      if (e2) throw new Error(e2.message);
      copiados++;
    } catch (e) {
      errores.push(`${a.nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  onAvance?.(pendientes.length, pendientes.length, '');
  return { copiados, errores };
}
