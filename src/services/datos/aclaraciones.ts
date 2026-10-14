import { collection, doc, updateDoc, onSnapshot, serverTimestamp, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type AclaracionLicitacion } from '../../types';
import { updateLicitacion } from './conRegistro';

// ═══════════════════════════════════════════════════════════════════
// ACLARACIONES Y MODIFICACIONES A LAS BASES (licitaciones/{id}/aclaraciones)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToAclaraciones(licitacionId: string, callback: (aclaraciones: AclaracionLicitacion[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'licitaciones', licitacionId, 'aclaraciones'), snap => {
    callback(snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<AclaracionLicitacion, 'id'>) }))
      .sort((a, b) => a.numero - b.numero));
  }, err => console.warn('No se pudieron leer las aclaraciones:', err));
}

/** Publica una aclaración con número correlativo; si trae cambio de cierre, actualiza la fecha de la licitación. */
export async function publicarAclaracionSinRegistro(
  licitacionId: string,
  data: Omit<AclaracionLicitacion, 'id' | 'numero'>
): Promise<number> {
  const counterRef = doc(db, 'licitaciones', licitacionId, 'control', 'aclaraciones');
  const ref = doc(collection(db, 'licitaciones', licitacionId, 'aclaraciones'));
  const numero = await runTransaction(db, async tx => {
    const counter = await tx.get(counterRef);
    const siguiente = Number(counter.data()?.ultimoNumero || 0) + 1;
    tx.set(counterRef, { ultimoNumero: siguiente, _updatedAt: serverTimestamp() }, { merge: true });
    tx.set(ref, { ...data, numero: siguiente, _createdAt: serverTimestamp() });
    return siguiente;
  });
  if (data.cambioCierre) {
    await updateLicitacion(licitacionId, {
      fechaEntregaPropuestas: data.cambioCierre.fechaNueva,
      fechaEvaluacion: data.cambioCierre.fechaNueva,
      ...(data.cambioCierre.horaNueva ? { horaLimiteOfertas: data.cambioCierre.horaNueva } : {}),
    });
  }
  return numero;
}

/** El proveedor dejó constancia de haber visto estas aclaraciones en el portal. */
export async function marcarAclaracionesVistas(licitacionId: string, proveedorId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const ahora = new Date().toISOString();
  await updateDoc(
    doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId),
    Object.fromEntries(ids.map(id => [`aclaracionesVistas.${id}`, ahora]))
  );
}
