import { collection, doc, getDocs, onSnapshot, serverTimestamp, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type EntradaLibroObra, type FotoLibroObra } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// LIBRO DE OBRA (licitaciones/{id}/libroObra) — funciona sin señal
// ═══════════════════════════════════════════════════════════════════

/** Anotaciones del libro, de la más antigua a la más nueva. `pendientes` = ids aún no sincronizados con el servidor. */
export function subscribeToLibroObra(
  licitacionId: string,
  callback: (entradas: EntradaLibroObra[], pendientes: Set<string>) => void
): Unsubscribe {
  return onSnapshot(collection(db, 'licitaciones', licitacionId, 'libroObra'), { includeMetadataChanges: true }, snap => {
    const pendientes = new Set(snap.docs.filter(d => d.metadata.hasPendingWrites).map(d => d.id));
    callback(
      snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<EntradaLibroObra, 'id'>) }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
      pendientes
    );
  }, err => console.warn('No se pudo leer el libro de obra:', err));
}

export async function getFotosLibroObra(licitacionId: string, entradaId: string): Promise<FotoLibroObra[]> {
  const snap = await getDocs(collection(db, 'licitaciones', licitacionId, 'libroObra', entradaId, 'fotos'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FotoLibroObra, 'id'>) })).sort((a, b) => a.orden - b.orden);
}

/**
 * Guarda una anotación con sus fotos en un solo lote. NO espera al servidor: sin señal queda guardada en el
 * teléfono y se sube sola al volver la conexión (la pantalla la muestra al instante como "pendiente").
 */
export function addEntradaLibroObra(
  licitacionId: string,
  entrada: Omit<EntradaLibroObra, 'id'>,
  fotos: Omit<FotoLibroObra, 'id'>[]
): { id: string; sincronizado: Promise<void> } {
  const entradaRef = doc(collection(db, 'licitaciones', licitacionId, 'libroObra'));
  const batch = writeBatch(db);
  batch.set(entradaRef, { ...entrada, _createdAt: serverTimestamp() });
  fotos.forEach((f, i) => batch.set(doc(entradaRef, 'fotos', String(i + 1)), f));
  return { id: entradaRef.id, sincronizado: batch.commit() };
}
