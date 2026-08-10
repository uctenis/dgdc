import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Proveedor } from '../types';

const PROVEEDORES_COLLECTION = 'proveedores';

// ─── READ: Suscripción en tiempo real ───────────────────────────────────────
export function subscribeToProveedores(
  callback: (proveedores: Proveedor[]) => void
): Unsubscribe {
  const q = query(
    collection(db, PROVEEDORES_COLLECTION),
    orderBy('fechaRegistro', 'desc')
  );

  return onSnapshot(q, snapshot => {
    const proveedores: Proveedor[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Proveedor, 'id'>),
    }));
    callback(proveedores);
  });
}

// ─── READ: Carga única ────────────────────────────────────────────────────
export async function getProveedores(): Promise<Proveedor[]> {
  const q = query(
    collection(db, PROVEEDORES_COLLECTION),
    orderBy('fechaRegistro', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Proveedor, 'id'>),
  }));
}

// ─── CREATE ───────────────────────────────────────────────────────────────
export async function addProveedor(
  data: Omit<Proveedor, 'id' | 'fechaRegistro'>
): Promise<string> {
  const docRef = await addDoc(collection(db, PROVEEDORES_COLLECTION), {
    ...data,
    fechaRegistro: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ─── UPDATE ───────────────────────────────────────────────────────────────
export async function updateProveedor(
  id: string,
  data: Partial<Proveedor>
): Promise<void> {
  const ref = doc(db, PROVEEDORES_COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    _updatedAt: serverTimestamp(),
  });
}

// ─── DELETE ───────────────────────────────────────────────────────────────
export async function deleteProveedor(id: string): Promise<void> {
  const ref = doc(db, PROVEEDORES_COLLECTION, id);
  await deleteDoc(ref);
}
