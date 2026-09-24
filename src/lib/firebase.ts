import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
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
export const db = (() => {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(app);
  }
})();
export const auth = getAuth(app);
export const storage = getStorage(app);
