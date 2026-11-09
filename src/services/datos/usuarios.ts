import { doc, updateDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { supabase, SUPABASE_CONFIGURADO } from '../../lib/supabase';
import { type UserProfile } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// USUARIOS / PERFILES AUTH (Supabase + respaldo Firestore)
// ═══════════════════════════════════════════════════════════════════

export async function createUserProfile(uid: string, data: Omit<UserProfile, 'uid'>): Promise<void> {
  const fechaRegistro = data.fechaRegistro || new Date().toISOString();
  if (SUPABASE_CONFIGURADO) {
    await supabase.from('usuarios').upsert({
      uid,
      email: data.email,
      role: data.role,
      display_name: data.displayName || null,
      proveedor_id: data.proveedorId || null,
      token_invitacion: data.tokenInvitacion || null,
      fecha_registro: fechaRegistro,
      verificado: data.verificado ?? true,
      datos: { ...data, uid, fechaRegistro },
      actualizado_en: new Date().toISOString(),
    }, { onConflict: 'uid' });
  }
  await setDoc(doc(db, 'usuarios', uid), {
    ...data,
    uid,
    fechaRegistro,
    _createdAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (SUPABASE_CONFIGURADO) {
    const { data, error } = await supabase.from('usuarios').select('datos').eq('uid', uid).maybeSingle();
    if (!error && data?.datos) {
      return data.datos as UserProfile;
    }
  }
  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (!snap.exists()) return null;
  const perfil = snap.data() as UserProfile;
  if (SUPABASE_CONFIGURADO) {
    void supabase.from('usuarios').upsert({
      uid,
      email: perfil.email,
      role: perfil.role,
      display_name: perfil.displayName || null,
      proveedor_id: perfil.proveedorId || null,
      token_invitacion: perfil.tokenInvitacion || null,
      datos: perfil,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: 'uid' });
  }
  return perfil;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  if (SUPABASE_CONFIGURADO) {
    const previo = await getUserProfile(uid);
    if (previo) {
      const combinado = { ...previo, ...data, uid };
      await supabase.from('usuarios').upsert({
        uid,
        email: combinado.email,
        role: combinado.role,
        display_name: combinado.displayName || null,
        proveedor_id: combinado.proveedorId || null,
        token_invitacion: combinado.tokenInvitacion || null,
        datos: combinado,
        actualizado_en: new Date().toISOString(),
      }, { onConflict: 'uid' });
    }
  }
  await updateDoc(doc(db, 'usuarios', uid), { ...data, _updatedAt: serverTimestamp() });
}
