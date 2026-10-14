import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, runTransaction, collectionGroup, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type GarantiaLicitacion, type RegistroAperturaOfertas } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// GARANTÍAS (licitaciones/{id}/garantias)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToGarantias(
  licitacionId: string,
  callback: (garantias: GarantiaLicitacion[]) => void
): Unsubscribe {
  return onSnapshot(collection(db, 'licitaciones', licitacionId, 'garantias'), snap => {
    callback(snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<GarantiaLicitacion, 'id'>) }))
      .sort((a, b) => (a.fechaVencimiento || '').localeCompare(b.fechaVencimiento || '')));
  }, err => console.warn('No se pudieron leer las garantías:', err));
}

/** Garantías vigentes de todas las licitaciones (alerta de vencimientos del personal interno). */
export function subscribeToGarantiasVigentes(
  callback: (garantias: (GarantiaLicitacion & { licitacionId: string })[]) => void
): Unsubscribe {
  // Sin filtro en la consulta (un filtro sobre un grupo de colecciones exige un índice): se filtra aquí.
  return onSnapshot(collectionGroup(db, 'garantias'), snap => {
    callback(snap.docs
      .map(d => ({ id: d.id, licitacionId: d.ref.parent.parent?.id || '', ...(d.data() as Omit<GarantiaLicitacion, 'id'>) }))
      .filter(g => g.estado === 'Vigente' && g.licitacionId));
  }, err => console.warn('No se pudieron leer las garantías vigentes:', err));
}

export async function addGarantiaSinRegistro(licitacionId: string, data: Omit<GarantiaLicitacion, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'licitaciones', licitacionId, 'garantias'), { ...data, _createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateGarantiaSinRegistro(licitacionId: string, garantiaId: string, data: Partial<GarantiaLicitacion>): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'garantias', garantiaId), { ...data, _updatedAt: serverTimestamp() });
}

export async function deleteGarantiaSinRegistro(licitacionId: string, garantiaId: string): Promise<void> {
  await deleteDoc(doc(db, 'licitaciones', licitacionId, 'garantias', garantiaId));
}

/** Fija el registro de apertura una sola vez (si dos personas abren la licitación a la vez, vale el primero). */
export async function registrarAperturaOfertas(licitacionId: string, registro: RegistroAperturaOfertas): Promise<boolean> {
  const ref = doc(db, 'licitaciones', licitacionId);
  return runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists() || snap.data().aperturaOfertas) return false;
    transaction.update(ref, { aperturaOfertas: registro, _updatedAt: serverTimestamp() });
    return true;
  });
}
