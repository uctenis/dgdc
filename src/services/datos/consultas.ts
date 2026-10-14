import { collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp, query, where, writeBatch, collectionGroup, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type InvitadoLicitacion, type ConsultaLicitacion, type ConsultaPublicada } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// CONSULTAS DE PROVEEDORES (período de consultas)
// `consultas`: cada pregunta con su autor (solo personal interno y el propio proveedor).
// `consultasPublicadas`: pregunta + respuesta, SIN identificar al proveedor, visibles para todos los invitados.
// ═══════════════════════════════════════════════════════════════════

export async function addConsulta(
  licitacionId: string,
  data: Pick<ConsultaLicitacion, 'proveedorId' | 'proveedorNombre' | 'proveedorUid' | 'pregunta'>
): Promise<void> {
  await addDoc(collection(db, 'licitaciones', licitacionId, 'consultas'), {
    ...data,
    fechaPregunta: new Date().toISOString(),
    estado: 'Pendiente',
    _createdAt: serverTimestamp(),
  });
}

const ordenarPorFecha = <T extends { fechaPregunta: string }>(lista: T[]) =>
  lista.sort((a, b) => a.fechaPregunta.localeCompare(b.fechaPregunta));

/** Todas las consultas de una licitación (personal interno). */
export function subscribeToConsultas(licitacionId: string, callback: (c: ConsultaLicitacion[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'licitaciones', licitacionId, 'consultas'), snap => {
    callback(ordenarPorFecha(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ConsultaLicitacion, 'id'>) }))));
  });
}

/** Las consultas que hizo un proveedor (portal): solo las suyas. */
export function subscribeToMisConsultas(
  licitacionId: string,
  proveedorId: string,
  callback: (c: ConsultaLicitacion[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const q = query(collection(db, 'licitaciones', licitacionId, 'consultas'), where('proveedorId', '==', proveedorId));
  return onSnapshot(q, snap => {
    callback(ordenarPorFecha(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ConsultaLicitacion, 'id'>) }))));
  }, onError);
}

/** Preguntas y respuestas publicadas (anónimas), visibles para todos los invitados. */
export function subscribeToConsultasPublicadas(
  licitacionId: string,
  callback: (c: ConsultaPublicada[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(collection(db, 'licitaciones', licitacionId, 'consultasPublicadas'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ConsultaPublicada, 'id'>) })).sort((a, b) => a.numero - b.numero));
  }, onError);
}

/**
 * Responde una consulta y la publica en el portal sin identificar al proveedor. Si ya estaba publicada,
 * corrige la respuesta manteniendo su número.
 */
export async function responderConsultaSinRegistro(
  licitacionId: string,
  consulta: ConsultaLicitacion,
  respuesta: string,
  numeroNuevo: number,
  respondidaPorEmail: string
): Promise<void> {
  const numero = consulta.numero ?? numeroNuevo;
  const fechaRespuesta = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(doc(db, 'licitaciones', licitacionId, 'consultas', consulta.id), {
    estado: 'Respondida', respuesta, fechaRespuesta, respondidaPorEmail, numero,
  });
  batch.set(doc(db, 'licitaciones', licitacionId, 'consultasPublicadas', consulta.id), {
    numero, pregunta: consulta.pregunta, respuesta, fechaPregunta: consulta.fechaPregunta, fechaRespuesta,
  });
  await batch.commit();
}

/** Consultas pendientes de todas las licitaciones (alerta del personal interno). */
export function subscribeToConsultasPendientes(
  callback: (pendientes: (ConsultaLicitacion & { licitacionId: string })[]) => void
): Unsubscribe {
  // Sin filtro en la consulta (un filtro sobre un grupo de colecciones exige un índice): se filtra aquí.
  return onSnapshot(collectionGroup(db, 'consultas'), snap => {
    callback(snap.docs
      .map(d => ({ id: d.id, licitacionId: d.ref.parent.parent?.id || '', ...(d.data() as Omit<ConsultaLicitacion, 'id'>) }))
      .filter(c => c.estado === 'Pendiente' && c.licitacionId));
  }, err => console.warn('No se pudieron leer las consultas pendientes:', err));
}

export async function updateInvitadoEstado(
  licitacionId: string,
  proveedorId: string,
  estado: InvitadoLicitacion['estadoPropuesta']
): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId), {
    estadoPropuesta: estado,
    ...(estado === 'Presentada' ? { fechaPresentacion: new Date().toISOString() } : {}),
  });
}
