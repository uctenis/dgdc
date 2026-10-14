import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc, onSnapshot, serverTimestamp, increment, arrayUnion, arrayRemove, collectionGroup, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type LicitacionProyecto, type InvitadoLicitacion, type EnvioInvitacion, type InvitacionAcceso } from '../../types';
import { getAllLicitaciones } from './licitaciones';

// ═══════════════════════════════════════════════════════════════════
// INVITADOS A LICITACIÓN (subcolección)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToInvitados(
  licitacionId: string,
  callback: (invitados: InvitadoLicitacion[]) => void
): Unsubscribe {
  const q = collection(db, 'licitaciones', licitacionId, 'invitados');
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InvitadoLicitacion, 'id'>) })));
  });
}

/** Código aleatorio (128 bits) del enlace personal de una invitación. */
export function generarTokenAcceso(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Publica el código en `invitaciones/{código}`: es lo que consulta el proveedor al entrar (solo se puede leer
 * conociendo el código; no se puede listar), así el proveedor nunca necesita leer la lista de invitados.
 */
async function publicarInvitacionPorToken(
  token: string,
  licitacionId: string,
  inv: { proveedorId: string; proveedorEmail: string; proveedorNombre: string }
): Promise<void> {
  await setDoc(doc(db, 'invitaciones', token), {
    licitacionId,
    proveedorId: inv.proveedorId,
    proveedorEmail: inv.proveedorEmail,
    proveedorNombre: inv.proveedorNombre,
  });
}

/** Garantiza que cada invitado tenga su enlace personal (los invitados anteriores a esta función no lo tenían). */
export async function asegurarTokensInvitados(licitacionId: string, invitados: InvitadoLicitacion[]): Promise<InvitadoLicitacion[]> {
  return Promise.all(invitados.map(async inv => {
    if (inv.tokenAcceso) {
      await publicarInvitacionPorToken(inv.tokenAcceso, licitacionId, inv);
      return inv;
    }
    const tokenAcceso = generarTokenAcceso();
    await updateDoc(doc(db, 'licitaciones', licitacionId, 'invitados', inv.proveedorId), { tokenAcceso });
    await publicarInvitacionPorToken(tokenAcceso, licitacionId, inv);
    return { ...inv, tokenAcceso };
  }));
}

export async function addInvitadoSinRegistro(
  licitacionId: string,
  data: Omit<InvitadoLicitacion, 'id'>
): Promise<void> {
  const ref = doc(db, 'licitaciones', licitacionId, 'invitados', data.proveedorId);
  const tokenAcceso = data.tokenAcceso || generarTokenAcceso();
  await Promise.all([
    setDoc(ref, { ...data, tokenAcceso, _createdAt: serverTimestamp() }),
    publicarInvitacionPorToken(tokenAcceso, licitacionId, data),
    updateDoc(doc(db, 'licitaciones', licitacionId), {
      proveedoresInvitadosIds: arrayUnion(data.proveedorId),
      _updatedAt: serverTimestamp(),
    }),
  ]);
}

export async function addEnvioInvitacion(
  licitacionId: string,
  data: Omit<EnvioInvitacion, 'id'>
): Promise<void> {
  await addDoc(collection(db, 'licitaciones', licitacionId, 'envios'), { ...data, _createdAt: serverTimestamp() });
}

export function subscribeToEnviosInvitaciones(
  licitacionId: string,
  callback: (envios: EnvioInvitacion[]) => void
): Unsubscribe {
  const q = collection(db, 'licitaciones', licitacionId, 'envios');
  return onSnapshot(q, snap => {
    const envios = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EnvioInvitacion, 'id'>) }));
    callback(envios.sort((a, b) => b.fecha.localeCompare(a.fecha)));
  });
}

export async function getInvitadosLicitacion(licitacionId: string): Promise<InvitadoLicitacion[]> {
  const snap = await getDocs(collection(db, 'licitaciones', licitacionId, 'invitados'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InvitadoLicitacion, 'id'>) }));
}

/** Todas las licitaciones con sus invitados: base para medir la carga de trabajo y la rotación de proveedores. */
export async function getLicitacionesConInvitados(): Promise<{
  licitaciones: LicitacionProyecto[];
  invitadosPorLicitacion: Record<string, InvitadoLicitacion[]>;
}> {
  const licitaciones = await getAllLicitaciones();
  // Una sola consulta por todos los invitados (grupo de colecciones) en vez de una por licitación.
  try {
    const snap = await getDocs(collectionGroup(db, 'invitados'));
    const invitadosPorLicitacion: Record<string, InvitadoLicitacion[]> = Object.fromEntries(licitaciones.map(l => [l.id, []]));
    snap.docs.forEach(d => {
      const licId = d.ref.parent.parent?.id;
      if (licId && invitadosPorLicitacion[licId]) {
        invitadosPorLicitacion[licId].push({ id: d.id, ...(d.data() as Omit<InvitadoLicitacion, 'id'>) });
      }
    });
    return { licitaciones, invitadosPorLicitacion };
  } catch (err) {
    // Reglas de Firebase sin permiso para el grupo de colecciones: se lee licitación por licitación.
    console.warn('Lectura agrupada de invitados no permitida; se lee por licitación:', err);
    const entradas = await Promise.all(licitaciones.map(async l =>
      [l.id, await getInvitadosLicitacion(l.id).catch(() => [])] as const
    ));
    return { licitaciones, invitadosPorLicitacion: Object.fromEntries(entradas) };
  }
}

/**
 * Valida el acceso al portal: el enlace personal (código) debe corresponder a la invitación de ESA licitación Y la
 * cuenta que entra debe ser de ese mismo proveedor (por su cuenta ya vinculada o por el correo con el que se le
 * invitó). Sin enlace personal no hay acceso. Solo lee `invitaciones/{código}`: el proveedor nunca lista invitados.
 */
export async function verificarInvitacionLicitacion(
  licitacionId: string,
  quien: { proveedorId?: string | null; email?: string | null; token?: string | null }
): Promise<InvitacionAcceso | null> {
  if (!licitacionId || !quien.token) return null;
  const snap = await getDoc(doc(db, 'invitaciones', quien.token));
  if (!snap.exists()) return null;
  const invitacion = snap.data() as InvitacionAcceso;
  if (invitacion.licitacionId !== licitacionId) return null;
  if (quien.proveedorId) return invitacion.proveedorId === quien.proveedorId ? invitacion : null;
  const email = (quien.email || '').trim().toLowerCase();
  return email && (invitacion.proveedorEmail || '').trim().toLowerCase() === email ? invitacion : null;
}

export async function removeInvitado(licitacionId: string, proveedorId: string): Promise<void> {
  const previo = await getDoc(doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId));
  const token = previo.exists() ? (previo.data() as InvitadoLicitacion).tokenAcceso : undefined;
  if (token) await deleteDoc(doc(db, 'invitaciones', token)).catch(() => { /* ya no existía */ });
  await Promise.all([
    deleteDoc(doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId)),
    updateDoc(doc(db, 'licitaciones', licitacionId), {
      proveedoresInvitadosIds: arrayRemove(proveedorId),
      _updatedAt: serverTimestamp(),
    }),
  ]);
}

/** Deja constancia de que el proveedor ingresó al portal con su enlace (primera vez, última vez y n° de sesiones). */
export async function registrarAccesoPortal(licitacionId: string, proveedorId: string): Promise<void> {
  const ref = doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId);
  const previo = await getDoc(ref);
  if (!previo.exists()) return;
  const ahora = new Date().toISOString();
  await updateDoc(ref, {
    ...((previo.data() as InvitadoLicitacion).primerAcceso ? {} : { primerAcceso: ahora }),
    ultimoAcceso: ahora,
    cantidadAccesos: increment(1),
  });
}
