import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { createUserProfile, getUserProfile } from '../services/firestoreService';
import type { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isProveedor: boolean;
  loginAdmin: (email: string, password: string) => Promise<void>;
  registerProveedor: (email: string, password: string, displayName: string, proveedorId: string) => Promise<void>;
  loginProveedor: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Email del administrador (sin login propio — acceso directo si no hay user)
// Si quieres proteger también al admin, agrega su email aquí:
const ADMIN_EMAILS = ['admin@uct.cl', 'david.silva@uct.cl', 'dgdc@uct.cl'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const prof = await getUserProfile(firebaseUser.uid);
        setProfile(prof);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const isAdmin = !user || (profile?.role === 'admin') || ADMIN_EMAILS.includes(user?.email ?? '');
  const isProveedor = !!user && profile?.role === 'proveedor';

  const loginAdmin = async (email: string, password: string) => {
    try {
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Credenciales incorrectas. Verifique su email y contraseña.');
      throw new Error('Login failed');
    }
  };

  const registerProveedor = async (
    email: string,
    password: string,
    displayName: string,
    proveedorId: string
  ) => {
    try {
      setError(null);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await createUserProfile(credential.user.uid, {
        email,
        role: 'proveedor',
        displayName,
        proveedorId,
        fechaRegistro: new Date().toISOString(),
        verificado: true,
      });
    } catch (e: unknown) {
      const msg = (e as { code?: string }).code;
      if (msg === 'auth/email-already-in-use') {
        setError('Este email ya tiene una cuenta registrada. Use la opción de inicio de sesión.');
      } else {
        setError('Error al crear la cuenta. Intente nuevamente.');
      }
      throw e;
    }
  };

  const loginProveedor = async (email: string, password: string) => {
    try {
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Email o contraseña incorrectos.');
      throw new Error('Login failed');
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin,
        isProveedor,
        loginAdmin,
        registerProveedor,
        loginProveedor,
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
