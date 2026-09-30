import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

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
  && (window.location.pathname.includes('/portal/') || window.location.pathname.includes('/proveedores/inscripcion'));
export const db = (() => {
  try {
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: esPortalProveedores
        ? memoryLocalCache()
        : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
})();
export const auth = getAuth(app);
export const storage = getStorage(app);
