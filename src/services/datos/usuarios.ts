import { doc, updateDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { supabase, SUPABASE_CONFIGURADO } from '../../lib/supabase';
import { type UserProfile } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// USUARIOS / PERFILES AUTH
// Firestore es la fuente del perfil (y del rol) mientras dure la migración: Supabase guarda solo una COPIA, que se
// escribe después de Firestore y nunca se lee para decidir permisos. Las reglas de Supabase (migración 0013) solo
// dejan escribir esa copia al personal UCT, así que para los proveedores la copia simplemente no se actualiza.
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
  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (!snap.exists()) return null;
  const perfil = snap.data() as UserProfile;
  copiarASupabase({ ...perfil, uid });
  return perfil;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(db, 'usuarios', uid), { ...data, _updatedAt: serverTimestamp() });
  if (SUPABASE_CONFIGURADO) {
    const snap = await getDoc(doc(db, 'usuarios', uid)).catch(() => null);
    if (snap?.exists()) copiarASupabase({ ...(snap.data() as UserProfile), uid });
  }
}
