import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { createUserProfile, getUserProfile, verificarInvitacionLicitacion } from '../services/firestoreService';
import type { UserProfile } from '../types';
import { getInternalAccess, SYSTEM_ADMIN_EMAIL } from '../services/internalAccessService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isInternalUser: boolean;
  isProveedor: boolean;
  /** Secretaría (mbustos@uct.cl): solo gestiona la bandeja de Solicitudes de OP. */
  isSecretaria: boolean;
  loginInternalWithGoogle: () => Promise<void>;
  loginDevBypass?: () => void;
  /** SOLO servidor local (import.meta.env.DEV): ver el portal como un proveedor, sin invitación real. */
  loginPortalDevBypass?: (datos: { proveedorId: string; email: string; nombre: string }) => void;
  loginAdmin: (email: string, password: string) => Promise<void>;
  /** Ingreso de proveedores: siempre asociado a una licitación (enlace de invitación). */
  loginProveedorPorInvitacion: (licitacionId: string, token: string) => Promise<void>;
  enviarEnlaceIngresoInvitacion: (email: string, licitacionId: string, token: string) => Promise<void>;
  esEnlaceDeIngreso: () => boolean;
  completarLoginConEnlace: (licitacionId: string, token: string, emailOverride?: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const EMAIL_ENLACE_STORAGE_KEY = 'dgdc.portal.emailEnlaceIngreso';

const AuthContext = createContext<AuthContextType | null>(null);

/** Mensaje cuando se entra con una cuenta que no está en la nómina: dice CON QUÉ cuenta se intentó,
 * porque lo típico es que el navegador tenga abierta otra cuenta (un Gmail personal). */
function mensajeCuentaNoAutorizada(email?: string | null): string {
  const cuenta = email || 'esa cuenta';
  return (email || '').toLowerCase().endsWith('@uct.cl')
    ? `La cuenta ${cuenta} no está en la nómina autorizada del sistema. Pida al administrador (${SYSTEM_ADMIN_EMAIL}) que la agregue.`
    : `Intentó ingresar con ${cuenta}, que no es una cuenta institucional. Vuelva a hacer clic en "Continuar con Google" y elija su cuenta @uct.cl (si no aparece en la lista, use "Usar otra cuenta").`;
}

// Email del administrador (sin login propio — acceso directo si no hay user)
// Si quieres proteger también al admin, agrega su email aquí:
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devBypass, setDevBypass] = useState(false);
  const [devProveedor, setDevProveedor] = useState<{ proveedorId: string; email: string; nombre: string } | null>(null);
  // Mientras un proveedor completa su ingreso con Google (aún sin perfil), no debe aplicarse el rechazo del sistema interno.
  const proveedorLoginEnCurso = useRef(false);

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
        if (usesGoogle && !access && !proveedorLoginEnCurso.current) {
          // Un proveedor con perfil ya vinculado sí puede tener sesión Google (portal de proveedores).
          const perfilPrevio = await getUserProfile(firebaseUser.uid).catch(() => null);
          if (perfilPrevio?.role !== 'proveedor') {
            setError(mensajeCuentaNoAutorizada(firebaseUser.email));
            await signOut(auth);
            setUser(null);
            setProfile(null);
            return;
          }
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
            firmaImagenURL: storedProfile?.firmaImagenURL,
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

  const effectiveUser = devBypass
    ? ({ email: 'dsilva@uct.cl', uid: 'dev-123', displayName: 'Admin Local' } as User)
    : devProveedor
    ? ({ email: devProveedor.email, uid: 'dev-proveedor', displayName: devProveedor.nombre } as User)
    : user;
  const effectiveProfile = !devBypass && devProveedor
    ? ({ role: 'proveedor', email: devProveedor.email, displayName: devProveedor.nombre, uid: 'dev-proveedor', proveedorId: devProveedor.proveedorId, fechaRegistro: new Date().toISOString(), verificado: true } as UserProfile)
    : devBypass ? ({ role: 'admin', email: 'dsilva@uct.cl', displayName: 'Admin Local', uid: 'dev-123', fechaRegistro: new Date().toISOString(), verificado: true, puedeFirmarActas: true } as UserProfile) : profile;

  const internalAccess = getInternalAccess(effectiveUser?.email);
  const isInternalUser = Boolean(effectiveUser && internalAccess);
  const isAdmin = Boolean(effectiveUser && effectiveUser.email?.toLowerCase() === SYSTEM_ADMIN_EMAIL);
  const isProveedor = !!effectiveUser && effectiveProfile?.role === 'proveedor';
  const isSecretaria = internalAccess?.role === 'secretaria';

  const loginPortalDevBypass = (datos: { proveedorId: string; email: string; nombre: string }) => {
    if (!import.meta.env.DEV) return;
    setDevProveedor(datos);
    setError(null);
  };

  const loginDevBypass = () => {
    setDevBypass(true);
    setError(null);
  };

  const loginInternalWithGoogle = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    // select_account: Google SIEMPRE pregunta con qué cuenta entrar, aunque el navegador ya tenga
    // otra sesión abierta (ej. un Gmail personal). hd: sugiere las cuentas @uct.cl primero.
    provider.setCustomParameters({ hd: 'uct.cl', prompt: 'select_account' });
    try {
      const credential = await signInWithPopup(auth, provider);
      if (!getInternalAccess(credential.user.email)) {
        await signOut(auth);
        setError(mensajeCuentaNoAutorizada(credential.user.email));
        throw new Error('INTERNAL_ACCESS_DENIED');
      }
    } catch (loginError) {
      if ((loginError as Error).message === 'INTERNAL_ACCESS_DENIED') throw loginError;
      const code = (loginError as { code?: string }).code;
      // Si el navegador bloquea la ventana emergente, se hace el mismo ingreso en la misma pestaña
      // (redirección a Google y vuelta); al volver, onAuthStateChanged valida la nómina igual.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return;
      }
      setError(
        code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
          ? 'Se cerró la ventana de Google antes de elegir la cuenta. Vuelva a intentarlo.'
          : code === 'auth/unauthorized-domain'
          ? `Este sitio (${window.location.hostname}) aún no está habilitado para iniciar sesión. Avise al administrador del sistema (${SYSTEM_ADMIN_EMAIL}).`
          : code === 'auth/network-request-failed'
          ? 'No hay conexión con Google. Revise su conexión a internet e intente nuevamente.'
          : `No se pudo iniciar sesión con Google (${code || 'error desconocido'}). Intente nuevamente o avise a ${SYSTEM_ADMIN_EMAIL}.`
      );
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

  // Ingreso de proveedores con Google, SIEMPRE dentro de una licitación: solo entra quien esté
  // invitado a ella (por su cuenta ya vinculada o por el correo con el que se le invitó). No hay
  // registro libre ni lista de empresas.
  const loginProveedorPorInvitacion = async (licitacionId: string, token: string) => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    proveedorLoginEnCurso.current = true;
    try {
      const credential = await signInWithPopup(auth, provider);
      const cuenta = credential.user;

      const storedProfile = await getUserProfile(cuenta.uid);
      if (storedProfile && storedProfile.role !== 'proveedor') {
        await signOut(auth);
        setError('Esta cuenta de Google no corresponde a un perfil de proveedor.');
        throw new Error('INVALID_ROLE');
      }

      const invitacion = await verificarInvitacionLicitacion(licitacionId, {
        proveedorId: storedProfile?.proveedorId,
        email: cuenta.email,
        token,
      });
      if (!invitacion) {
        await signOut(auth);
        setError(`La cuenta ${cuenta.email || ''} no figura entre las empresas invitadas a esta licitación. Ingrese con el correo al que llegó la invitación.`);
        throw new Error('NO_INVITADO');
      }

      if (storedProfile) {
        setUser(cuenta);
        setProfile(storedProfile);
        return;
      }
      const perfil: UserProfile = {
        uid: cuenta.uid,
        email: cuenta.email || '',
        role: 'proveedor',
        displayName: invitacion.proveedorNombre || cuenta.displayName || cuenta.email?.split('@')[0] || 'Proveedor',
        proveedorId: invitacion.proveedorId,
        tokenInvitacion: token,
        fechaRegistro: new Date().toISOString(),
        verificado: true,
      };
      await createUserProfile(cuenta.uid, perfil);
      setUser(cuenta);
      setProfile(perfil);
    } catch (e: unknown) {
      const msg = (e as { message?: string, code?: string });
      if (msg.message !== 'INVALID_ROLE' && msg.message !== 'NO_INVITADO') {
        setError(msg.code === 'auth/popup-closed-by-user'
          ? 'El inicio de sesión fue cancelado.'
          : `Error de Google (${msg.code || 'Desconocido'}): no se pudo completar el ingreso.`);
      }
      throw e;
    } finally {
      proveedorLoginEnCurso.current = false;
    }
  };

  // Ingreso sin contraseña por enlace de correo — alternativa a Google para
  // proveedores cuyo correo registrado no es una cuenta Google (Outlook, hosting
  // propio, etc.). Firebase envía el enlace a la casilla exacta ya registrada en
  // la ficha del Proveedor; al hacer clic queda autenticado sin necesidad de elegir
  // su empresa de una lista, porque el correo ya prueba a quién pertenece.
  const enviarEnlaceIngresoInvitacion = async (email: string, licitacionId: string, token: string) => {
    setError(null);
    const emailNormalizado = email.trim().toLowerCase();
    // Solo se envía el enlace si ese correo figura entre los invitados de la licitación. Si la
    // lectura previa no es posible sin sesión, se envía igual: el acceso se valida de nuevo al entrar.
    try {
      const invitacion = await verificarInvitacionLicitacion(licitacionId, { email: emailNormalizado, token });
      if (!invitacion) {
        setError('Ese correo no figura entre las empresas invitadas a esta licitación. Use el correo al que llegó la invitación.');
        throw new Error('NO_INVITADO');
      }
    } catch (checkError) {
      if ((checkError as Error).message === 'NO_INVITADO') throw checkError;
    }
    try {
      await sendSignInLinkToEmail(auth, emailNormalizado, {
        url: `${window.location.origin}${import.meta.env.BASE_URL}portal/licitacion/${licitacionId}?t=${encodeURIComponent(token)}`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_ENLACE_STORAGE_KEY, emailNormalizado);
    } catch (linkError) {
      setError('No se pudo enviar el enlace de ingreso. Intente nuevamente en unos minutos.');
      throw linkError;
    }
  };

  const esEnlaceDeIngreso = () => isSignInWithEmailLink(auth, window.location.href);

  const completarLoginConEnlace = async (licitacionId: string, token: string, emailOverride?: string) => {
    setError(null);
    const email = (emailOverride || window.localStorage.getItem(EMAIL_ENLACE_STORAGE_KEY) || '').trim().toLowerCase();
    if (!email) {
      setError('Ingrese el correo al que le enviamos el enlace para confirmar su identidad.');
      throw new Error('EMAIL_REQUERIDO');
    }
    proveedorLoginEnCurso.current = true;
    try {
      const credential = await signInWithEmailLink(auth, email, window.location.href);
      window.localStorage.removeItem(EMAIL_ENLACE_STORAGE_KEY);
      const user = credential.user;

      const storedProfile = await getUserProfile(user.uid);
      if (storedProfile && storedProfile.role !== 'proveedor') {
        await signOut(auth);
        setError('Esta cuenta no corresponde a un perfil de proveedor.');
        throw new Error('INVALID_ROLE');
      }

      // La cuenta se vincula SOLO a la empresa de la invitación (enlace personal + correo invitado).
      const invitacion = await verificarInvitacionLicitacion(licitacionId, { proveedorId: storedProfile?.proveedorId, email, token });
      if (!invitacion) {
        await signOut(auth);
        setError('Este correo no figura entre las empresas invitadas a esta licitación.');
        throw new Error('NO_INVITADO');
      }

      if (storedProfile) {
        setUser(user);
        setProfile(storedProfile);
        return;
      }
      const nuevoPerfil: UserProfile = {
        uid: user.uid,
        email: user.email || email,
        role: 'proveedor',
        displayName: invitacion.proveedorNombre,
        proveedorId: invitacion.proveedorId,
        tokenInvitacion: token,
        fechaRegistro: new Date().toISOString(),
        verificado: true,
      };
      await createUserProfile(user.uid, nuevoPerfil);
      setUser(user);
      setProfile(nuevoPerfil);
    } catch (e: unknown) {
      const msg = (e as { message?: string, code?: string });
      if (msg.message !== 'INVALID_ROLE' && msg.message !== 'NO_INVITADO' && msg.message !== 'EMAIL_REQUERIDO') {
        setError('El enlace no es válido o ya expiró. Solicite uno nuevo.');
      }
      throw e;
    } finally {
      proveedorLoginEnCurso.current = false;
    }
  };

  const logout = async () => {
    setDevProveedor(null);
    await signOut(auth);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        profile: effectiveProfile,
        loading: devBypass || devProveedor ? false : loading,
        isAdmin,
        isInternalUser,
        isProveedor,
        isSecretaria,
        loginInternalWithGoogle,
        loginDevBypass,
        loginPortalDevBypass: import.meta.env.DEV ? loginPortalDevBypass : undefined,
        loginAdmin,
        loginProveedorPorInvitacion,
        enviarEnlaceIngresoInvitacion,
        esEnlaceDeIngreso,
        completarLoginConEnlace,
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
