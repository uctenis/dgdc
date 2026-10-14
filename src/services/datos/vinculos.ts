import { collection, doc, getDoc, getDocs, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { LicitacionProyecto, ProyectoMaestro } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// VÍNCULO ENTRE UN PROYECTO DE LA CARTERA Y SU LICITACIÓN
// ═══════════════════════════════════════════════════════════════════
// El vínculo explícito es `proyectoMaestroId` en la licitación; `codigoProyecto` queda de respaldo.
// NO se usa `codigoCP`: no es único (muchos proyectos comparten el valor por defecto "409-1722"),
// lo que enlazaba proyectos nuevos con licitaciones ajenas.

/** Licitación asociada a un proyecto de la cartera, o null si aún no tiene. */
export async function buscarLicitacionDeProyecto(proyectoId: string, codigoProyecto?: string): Promise<LicitacionProyecto | null> {
  const licitaciones = collection(db, 'licitaciones');
  let snap = await getDocs(query(licitaciones, where('proyectoMaestroId', '==', proyectoId)));
  if (snap.empty && codigoProyecto) {
    snap = await getDocs(query(licitaciones, where('codigoProyecto', '==', codigoProyecto)));
  }
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<LicitacionProyecto, 'id'>) };
}

/** Proyecto de la cartera asociado a una licitación, o null si no se encuentra. */
export async function buscarProyectoDeLicitacion(proyectoMaestroId?: string, codigoProyecto?: string): Promise<ProyectoMaestro | null> {
  if (proyectoMaestroId) {
    const directo = await getDoc(doc(db, 'proyectos', proyectoMaestroId));
    if (directo.exists()) return { id: directo.id, ...(directo.data() as Omit<ProyectoMaestro, 'id'>) };
  }
  if (codigoProyecto) {
    const snap = await getDocs(query(collection(db, 'proyectos'), where('codigoProyecto', '==', codigoProyecto)));
    if (!snap.empty) return { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<ProyectoMaestro, 'id'>) };
  }
  return null;
}

/** Cambios en vivo de una licitación, tal como está guardada. No avisa si el documento no existe. */
export function subscribeToDocumentoLicitacion(licitacionId: string, callback: (licitacion: LicitacionProyecto) => void): Unsubscribe {
  return onSnapshot(doc(db, 'licitaciones', licitacionId), snap => {
    if (snap.exists()) callback({ id: snap.id, ...(snap.data() as Omit<LicitacionProyecto, 'id'>) });
  });
}

/** Cambios en vivo de un proyecto de la cartera, tal como está guardado. No avisa si el documento no existe. */
export function subscribeToDocumentoProyecto(proyectoId: string, callback: (proyecto: ProyectoMaestro) => void): Unsubscribe {
  return onSnapshot(doc(db, 'proyectos', proyectoId), snap => {
    if (snap.exists()) callback({ id: snap.id, ...(snap.data() as Omit<ProyectoMaestro, 'id'>) });
  });
}
