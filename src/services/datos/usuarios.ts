import { doc, updateDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { supabase, SUPABASE_CONFIGURADO } from '../../lib/supabase';
import { type UserProfile } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// USUARIOS / PERFILES AUTH
// Personal UCT: Firestore es la fuente del perfil mientras dure la migración y Supabase guarda una copia.
// Proveedores: su perfil vive solo en Supabase y lo crea la base al validar su invitación (portal_vincular, 0023).
// ═══════════════════════════════════════════════════════════════════

function copiarASupabase(perfil: UserProfile): void {
  if (!SUPABASE_CONFIGURADO) return;
  void supabase.from('usuarios').upsert({
    uid: perfil.uid,
    email: perfil.email,
    role: perfil.role,
    display_name: perfil.displayName || null,
    proveedor_id: perfil.proveedorId || null,
    token_invitacion: perfil.tokenInvitacion || null,
    ...(perfil.fechaRegistro ? { fecha_registro: perfil.fechaRegistro } : {}),
    verificado: perfil.verificado ?? true,
    datos: perfil,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'uid' }).then(({ error }) => { if (error) console.debug('Copia del perfil en Supabase omitida:', error.message); });
}

export async function createUserProfile(uid: string, data: Omit<UserProfile, 'uid'>): Promise<void> {
  const fechaRegistro = data.fechaRegistro || new Date().toISOString();
  await setDoc(doc(db, 'usuarios', uid), {
    ...data,
    uid,
    fechaRegistro,
    _createdAt: serverTimestamp(),
  });
  copiarASupabase({ ...data, uid, fechaRegistro } as UserProfile);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'usuarios', uid)).catch(() => null);
  if (snap?.exists()) {
    const perfil = snap.data() as UserProfile;
    copiarASupabase({ ...perfil, uid });
    return perfil;
  }
  // Los proveedores tienen su perfil solo en Supabase (lo crea vincularPerfilProveedor).
  return getPerfilProveedorSupabase(uid);
}

async function getPerfilProveedorSupabase(uid: string): Promise<UserProfile | null> {
  if (!SUPABASE_CONFIGURADO) return null;
  const { data } = await supabase.from('usuarios').select('datos, role, proveedor_id, email').eq('uid', uid).maybeSingle();
  if (!data || data.role !== 'proveedor') return null;
  return { ...(data.datos as UserProfile), uid, role: 'proveedor', proveedorId: data.proveedor_id, email: data.email };
}

/**
 * Vincula la cuenta de la sesión a la empresa de una invitación y devuelve su perfil de proveedor. La base comprueba
 * el código del enlace y el correo verificado de la sesión (migración 0023); el proveedor no escribe su perfil.
 */
export async function vincularPerfilProveedor(licitacionId: string, token: string): Promise<UserProfile> {
  const { data, error } = await supabase.rpc('portal_vincular', { p_lic: licitacionId, p_token: token });
  if (error) {
    const codigo = ['NO_INVITADO', 'INVALID_ROLE', 'CUENTA_INTERNA', 'SIN_SESION'].find(c => error.message.includes(c));
    throw new Error(codigo || error.message);
  }
  return data as UserProfile;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(db, 'usuarios', uid), { ...data, _updatedAt: serverTimestamp() });
  if (SUPABASE_CONFIGURADO) {
    const snap = await getDoc(doc(db, 'usuarios', uid)).catch(() => null);
    if (snap?.exists()) copiarASupabase({ ...(snap.data() as UserProfile), uid });
  }
}
