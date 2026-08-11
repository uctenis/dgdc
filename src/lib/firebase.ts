import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
