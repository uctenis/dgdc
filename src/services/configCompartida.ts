// ─── CONFIGURACIÓN COMPARTIDA (Firebase) ─────────────────────────────────────
// Los catálogos editables en Configuración (campus y edificios, nómina de responsables, tipos de
// obra, rubros, plantillas de Bases, firmas, etc.) se guardaban solo en el localStorage de cada
// navegador: lo que el administrador cambiaba en su equipo no llegaba a nadie más (ej. un colega
// agregado a la nómina no podía entrar). Ahora cada catálogo es un documento de la colección
// `configuracion` en Firestore y el localStorage queda como caché local:
//   - al iniciar sesión se descarga todo ANTES de validar la nómina (ver AuthContext);
//   - una suscripción en vivo trae los cambios que haga el administrador en otro equipo;
//   - cada guardado del administrador se publica (los demás usuarios solo leen).
// Los módulos de datos siguen leyendo localStorage de forma síncrona, sin cambios.

import { collection, doc, getDocs, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { SYSTEM_ADMIN_EMAIL } from '../lib/adminSistema';

const COLECCION = 'configuracion';

/** Claves de localStorage que se comparten (id del documento = la misma clave). */
export const CLAVES_CONFIG_COMPARTIDA = [
  'infra_app_campus_v1',
  'infra_app_centros_costo_v1',
  'infra_app_estados_proyecto_v1',
  'infra_app_responsables_v3',
  'infra_app_rubros_v3',
  'infra_app_tipos_obra_v2',
  'infra_app_config_firmas_v2',
  'infra_app_plantilla_contrato_v3_obra-civil',
  'infra_app_plantilla_bases_v4_obra-civil',
  'infra_app_plantilla_bases_v4_obra-menor',
  'infra_app_plantilla_bases_v4_diseno',
  'infra_app_plantilla_bases_v4_suministro',
  'infra_app_plantilla_bases_v4_otros',
] as const;

const CLAVES = new Set<string>(CLAVES_CONFIG_COMPARTIDA);

/** Evento de ventana que se emite cuando llega configuración nueva desde Firebase. */
export const EVENTO_CONFIG_ACTUALIZADA = 'dgdc:config-compartida-actualizada';

export interface EstadoConfigCompartida {
  sincronizado: boolean;
  error?: string;
  ultimaSincronizacion?: string;
}
let estado: EstadoConfigCompartida = { sincronizado: false };
// No se publica nada hasta haber descargado la versión de Firebase: si no, un navegador con una copia
// vieja (ej. el administrador en un equipo nuevo) podría pisar la configuración vigente.
let cargaInicialLista = false;
export const obtenerEstadoConfigCompartida = () => estado;

const esAdmin = () => (auth.currentUser?.email || '').toLowerCase() === SYSTEM_ADMIN_EMAIL;

function escribirLocal(clave: string, valor: string): boolean {
  try {
    if (localStorage.getItem(clave) === valor) return false;
    localStorage.setItem(clave, valor);
    return true;
  } catch {
    return false;
  }
}

/**
 * Descarga toda la configuración compartida al localStorage. Si quien entra es el administrador y
 * un catálogo aún no existe en Firebase, sube el que tiene en su navegador (primera migración).
 */
export async function cargarConfigCompartida(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, COLECCION));
    const enFirebase = new Set<string>();
    let cambio = false;
    snap.forEach(d => {
      if (!CLAVES.has(d.id)) return;
      enFirebase.add(d.id);
      const valor = d.data().valor;
      if (typeof valor === 'string' && escribirLocal(d.id, valor)) cambio = true;
    });
    if (esAdmin()) {
      for (const clave of CLAVES_CONFIG_COMPARTIDA) {
        if (enFirebase.has(clave)) continue;
        const local = localStorage.getItem(clave);
        if (local) await escribirEnFirebase(clave, local);
      }
    }
    estado = { sincronizado: true, ultimaSincronizacion: new Date().toISOString() };
    cargaInicialLista = true;
    if (cambio) window.dispatchEvent(new Event(EVENTO_CONFIG_ACTUALIZADA));
  } catch (err) {
    console.warn('No se pudo descargar la configuración compartida; se usa la copia local.', err);
    estado = { sincronizado: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Escucha en vivo los cambios de configuración (los que publique el administrador desde otro equipo). */
export function suscribirConfigCompartida(): () => void {
  return onSnapshot(
    collection(db, COLECCION),
    snap => {
      let cambio = false;
      snap.docChanges().forEach(ch => {
        if (ch.type === 'removed' || !CLAVES.has(ch.doc.id)) return;
        const valor = ch.doc.data().valor;
        if (typeof valor === 'string' && escribirLocal(ch.doc.id, valor)) cambio = true;
      });
      estado = { sincronizado: true, ultimaSincronizacion: new Date().toISOString() };
      if (cambio) window.dispatchEvent(new Event(EVENTO_CONFIG_ACTUALIZADA));
    },
    err => {
      console.warn('Se perdió la sincronización en vivo de la configuración:', err);
      estado = { ...estado, sincronizado: false, error: err.message };
    }
  );
}

/**
 * Publica un catálogo en Firebase. Solo lo hace el administrador: para el resto de los usuarios lo
 * que guarden queda solo en su navegador (y será reemplazado por la versión oficial al sincronizar).
 */
export async function publicarConfigCompartida(clave: string, valor: string): Promise<void> {
  if (!CLAVES.has(clave) || !esAdmin() || !cargaInicialLista) return;
  await escribirEnFirebase(clave, valor);
}

async function escribirEnFirebase(clave: string, valor: string): Promise<void> {
  try {
    await setDoc(doc(db, COLECCION, clave), {
      valor,
      actualizadoPor: auth.currentUser?.email || null,
      fechaActualizacion: serverTimestamp(),
    });
  } catch (err) {
    console.warn(`No se pudo publicar la configuración "${clave}" en Firebase:`, err);
    estado = { ...estado, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Atajo para los módulos de datos: guarda en localStorage y publica. */
export function guardarConfigCompartida(clave: string, datos: unknown): void {
  const valor = JSON.stringify(datos);
  localStorage.setItem(clave, valor);
  void publicarConfigCompartida(clave, valor);
}
