import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBRcvt7iWJIUiNNVE87ZA_3MhdATJbicFc",
  authDomain: "dgdc-c848d.firebaseapp.com",
  projectId: "dgdc-c848d",
  storageBucket: "dgdc-c848d.firebasestorage.app",
  messagingSenderId: "614609890960",
  appId: "1:614609890960:web:4359cfc6beb11fdf13b215",
  measurementId: "G-JF6NPHYP6L"
};

const app = initializeApp(firebaseConfig);
// Los campos opcionales sin valor (undefined) se omiten al guardar; sin esto Firestore rechaza el documento entero
// (p. ej. una propuesta sin observaciones). Si el módulo se vuelve a evaluar (recarga en caliente), se reutiliza la instancia.
// Copia local de los datos (IndexedDB) para el sistema interno: las pantallas abren al instante con lo último
// descargado y se sincronizan después; sirve varias pestañas a la vez. En el portal de proveedores (equipos
// ajenos, a veces compartidos) ni en la inscripción de proveedores se deja copia en el equipo: solo memoria.
const esPortalProveedores = typeof window !== 'undefined'
  && ['/portal/', '/proveedores/inscripcion', '/archivo/'].some(r => window.location.pathname.includes(r));

/**
 * SOLO pruebas locales: con VITE_EMULADORES=true la app usa los emuladores de Firebase (base de datos e ingreso de
 * prueba en este computador, con las reglas de reglas-sugeridas/) en vez del proyecto real.
 */
const usarEmuladores = import.meta.env.DEV && import.meta.env.VITE_EMULADORES === 'true';

export const db = (() => {
  try {
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: esPortalProveedores || usarEmuladores
        ? memoryLocalCache()
        : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
})();
export const auth = getAuth(app);

if (usarEmuladores) {
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* ya conectados (recarga en caliente) */ }
  // Ingreso de prueba sin ventana de Google: el emulador acepta una credencial de Google simulada.
  (window as unknown as { __ingresoPrueba: (email: string) => Promise<unknown> }).__ingresoPrueba = email =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
}
