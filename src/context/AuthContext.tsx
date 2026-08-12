import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { createUserProfile, getUserProfile } from '../services/firestoreService';
import type { UserProfile } from '../types';
import { getInternalAccess, SYSTEM_ADMIN_EMAIL } from '../services/internalAccessService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isInternalUser: boolean;
  isProveedor: boolean;
  loginInternalWithGoogle: () => Promise<void>;
  loginDevBypass?: () => void;
  loginAdmin: (email: string, password: string) => Promise<void>;
  loginProveedorWithGoogle: (proveedorId?: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Email del administrador (sin login propio — acceso directo si no hay user)
// Si quieres proteger también al admin, agrega su email aquí:
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devBypass, setDevBypass] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setProfile(null);
          return;
        }

        const access = getInternalAccess(firebaseUser.email);
        const usesGoogle = firebaseUser.providerData.some(provider => provider.providerId === 'google.com');
        if (usesGoogle && !access) {
          setError('Este correo Google no está autorizado para ingresar al sistema interno.');
          await signOut(auth);
          setUser(null);
          setProfile(null);
          return;
        }

        setUser(firebaseUser);
        const storedProfile = await getUserProfile(firebaseUser.uid);
        if (access) {
          const internalProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: access.email,
            role: access.role === 'admin' ? 'admin' : 'responsable',
            displayName: firebaseUser.displayName || access.nombre,
            fechaRegistro: storedProfile?.fechaRegistro || new Date().toISOString(),
            verificado: true,
            puedeFirmarActas: true,
            cargoFirma: access.cargo,
          };
          setProfile(internalProfile);
          if (!storedProfile || storedProfile.email !== internalProfile.email || storedProfile.role !== internalProfile.role) {
            try {
              await createUserProfile(firebaseUser.uid, internalProfile);
            } catch (profileError) {
              console.warn('No se pudo sincronizar el perfil interno; se mantiene la sesión validada.', profileError);
            }
          }
        } else {
          setProfile(storedProfile);
        }
      } catch (authError) {
        console.error('Error resolviendo la sesión:', authError);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const effectiveUser = devBypass ? ({ email: 'dsilva@uct.cl', uid: 'dev-123', displayName: 'Admin Local' } as User) : user;
  const effectiveProfile = devBypass ? ({ role: 'admin', email: 'dsilva@uct.cl', displayName: 'Admin Local', uid: 'dev-123', fechaRegistro: new Date().toISOString(), verificado: true, puedeFirmarActas: true } as UserProfile) : profile;

  const internalAccess = getInternalAccess(effectiveUser?.email);
  const isInternalUser = Boolean(effectiveUser && internalAccess);
  const isAdmin = Boolean(effectiveUser && effectiveUser.email?.toLowerCase() === SYSTEM_ADMIN_EMAIL);
  const isProveedor = !!effectiveUser && effectiveProfile?.role === 'proveedor';

  const loginDevBypass = () => {
    setDevBypass(true);
    setError(null);
  };

  const loginInternalWithGoogle = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'uct.cl', prompt: 'select_account' });
    try {
      const credential = await signInWithPopup(auth, provider);
      if (!getInternalAccess(credential.user.email)) {
        await signOut(auth);
        setError('Acceso denegado: el correo no pertenece a la nómina autorizada del sistema.');
        throw new Error('INTERNAL_ACCESS_DENIED');
      }
    } catch (loginError) {
      if ((loginError as Error).message !== 'INTERNAL_ACCESS_DENIED') {
        const code = (loginError as { code?: string }).code;
        setError(code === 'auth/popup-closed-by-user'
          ? 'El inicio de sesión fue cancelado.'
          : 'No fue posible iniciar sesión con Google. Verifique que Google esté habilitado en Firebase.');
      }
      throw loginError;
    }
  };

  const loginAdmin = async (email: string, password: string) => {
    try {
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Credenciales incorrectas. Verifique su email y contraseña.');
      throw new Error('Login failed');
    }
  };

  const loginProveedorWithGoogle = async (proveedorId?: string) => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const credential = await signInWithPopup(auth, provider);
      const user = credential.user;
      
      const storedProfile = await getUserProfile(user.uid);
      if (storedProfile) {
        if (storedProfile.role !== 'proveedor') {
          await signOut(auth);
          setError('Esta cuenta de Google no corresponde a un perfil de proveedor.');
          throw new Error('INVALID_ROLE');
        }
        // Success: user logged in.
      } else {
        // No profile exists -> requires registration
        if (!proveedorId) {
          await signOut(auth);
          setError('Cuenta no registrada. Por favor, seleccione su empresa para crear una cuenta nueva.');
          throw new Error('NO_PROFILE');
        }
        
        await createUserProfile(user.uid, {
          email: user.email || '',
          role: 'proveedor',
          displayName: user.displayName || user.email?.split('@')[0] || 'Proveedor',
          proveedorId,
          fechaRegistro: new Date().toISOString(),
          verificado: true,
        });
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string, code?: string });
      if (msg.message !== 'INVALID_ROLE' && msg.message !== 'NO_PROFILE') {
        if (msg.code === 'auth/popup-closed-by-user') {
          setError('El inicio de sesión fue cancelado.');
        } else {
          setError('Error al iniciar sesión con Google. Intente nuevamente.');
        }
      }
      throw e;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        profile: effectiveProfile,
        loading: devBypass ? false : loading,
        isAdmin,
        isInternalUser,
        isProveedor,
        loginInternalWithGoogle,
        loginDevBypass,
        loginAdmin,
        loginProveedorWithGoogle,
        logout,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
