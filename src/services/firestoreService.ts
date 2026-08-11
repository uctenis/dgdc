import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  increment,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatearRUT } from '../utils/rutUtils';
import type {
  Proveedor,
  HistorialObra,
  ProyectoMaestro,
  LicitacionProyecto,
  InvitadoLicitacion,
  Cotizacion,
  Propuesta,
  UserProfile,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
// PROVEEDORES
// ═══════════════════════════════════════════════════════════════════

export function subscribeToProveedores(
  callback: (proveedores: Proveedor[]) => void
): Unsubscribe {
  const q = query(collection(db, 'proveedores'), orderBy('fechaRegistro', 'desc'));
  return onSnapshot(q, snapshot => {
    callback(
      snapshot.docs.map(d => {
        const prov = { id: d.id, ...(d.data() as Omit<Proveedor, 'id'>) };
        return { ...prov, rut: formatearRUT(prov.rut) };
      })
    );
  });
}

export async function getProveedores(): Promise<Proveedor[]> {
  const q = query(collection(db, 'proveedores'), orderBy('fechaRegistro', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const prov = { id: d.id, ...(d.data() as Omit<Proveedor, 'id'>) };
    return { ...prov, rut: formatearRUT(prov.rut) };
  });
}

export async function addProveedor(data: Omit<Proveedor, 'id' | 'fechaRegistro'>): Promise<string> {
  const ref = await addDoc(collection(db, 'proveedores'), {
    ...data,
    rut: formatearRUT(data.rut),
    fechaRegistro: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProveedor(id: string, data: Partial<Proveedor>): Promise<void> {
  await updateDoc(doc(db, 'proveedores', id), { ...data, _updatedAt: serverTimestamp() });
}

export async function deleteProveedor(id: string): Promise<void> {
  await deleteDoc(doc(db, 'proveedores', id));
}

// ═══════════════════════════════════════════════════════════════════
// HISTORIAL DE OBRAS (subcolección de proveedor)
// ═══════════════════════════════════════════════════════════════════

export async function getHistorialObras(proveedorId: string): Promise<HistorialObra[]> {
  const q = query(
    collection(db, 'proveedores', proveedorId, 'historialObras'),
    orderBy('fecha', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<HistorialObra, 'id'>) }));
}

export async function addHistorialObra(
  proveedorId: string,
  data: Omit<HistorialObra, 'id'>
): Promise<void> {
  await addDoc(collection(db, 'proveedores', proveedorId, 'historialObras'), {
    ...data,
    _createdAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════════════
// PROYECTOS MAESTROS
// ═══════════════════════════════════════════════════════════════════

export function subscribeToProyectos(
  callback: (proyectos: ProyectoMaestro[]) => void
): Unsubscribe {
  const q = query(collection(db, 'proyectos'), orderBy('correlativo', 'asc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ProyectoMaestro, 'id'>) })));
  });
}

export async function addProyectoMaestro(
  data: Omit<ProyectoMaestro, 'id' | 'correlativo'>
): Promise<string> {
  // Usar counter para asignar correlativo único
  const counterRef = doc(db, '_counters', 'proyectos');
  let correlativo = 1;

  await runTransaction(db, async tx => {
    const counterSnap = await tx.get(counterRef);
    if (counterSnap.exists()) {
      correlativo = (counterSnap.data().last as number) + 1;
      tx.update(counterRef, { last: increment(1) });
    } else {
      tx.set(counterRef, { last: 1 });
    }
  });

  const ref = await addDoc(collection(db, 'proyectos'), {
    ...data,
    correlativo,
    fechaCreacion: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProyectoMaestro(
  id: string,
  data: Partial<ProyectoMaestro>
): Promise<void> {
  await updateDoc(doc(db, 'proyectos', id), { ...data, _updatedAt: serverTimestamp() });
}

export async function deleteProyectoMaestro(id: string): Promise<void> {
  await deleteDoc(doc(db, 'proyectos', id));
}

// ═══════════════════════════════════════════════════════════════════
// LICITACIONES (migrado a Firestore)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToLicitaciones(
  callback: (licitaciones: LicitacionProyecto[]) => void
): Unsubscribe {
  const q = query(collection(db, 'licitaciones'), orderBy('_createdAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<LicitacionProyecto, 'id'>) })));
  });
}

export async function addLicitacion(
  data: Omit<LicitacionProyecto, 'id'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'licitaciones'), {
    ...data,
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLicitacion(
  id: string,
  data: Partial<LicitacionProyecto>
): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', id), { ...data, _updatedAt: serverTimestamp() });
}

export async function deleteLicitacion(id: string): Promise<void> {
  await deleteDoc(doc(db, 'licitaciones', id));
}

// ═══════════════════════════════════════════════════════════════════
// INVITADOS A LICITACIÓN (subcolección)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToInvitados(
  licitacionId: string,
  callback: (invitados: InvitadoLicitacion[]) => void
): Unsubscribe {
  const q = collection(db, 'licitaciones', licitacionId, 'invitados');
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InvitadoLicitacion, 'id'>) })));
  });
}

export async function addInvitado(
  licitacionId: string,
  data: Omit<InvitadoLicitacion, 'id'>
): Promise<void> {
  const ref = doc(db, 'licitaciones', licitacionId, 'invitados', data.proveedorId);
  await setDoc(ref, { ...data, _createdAt: serverTimestamp() });
}

export async function removeInvitado(licitacionId: string, proveedorId: string): Promise<void> {
  await deleteDoc(doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId));
}

export async function updateInvitadoEstado(
  licitacionId: string,
  proveedorId: string,
  estado: InvitadoLicitacion['estadoPropuesta']
): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId), { estadoPropuesta: estado });
}

// ═══════════════════════════════════════════════════════════════════
// COTIZACIONES (Firestore)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToCotizaciones(
  licitacionId: string,
  callback: (cotizaciones: Cotizacion[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'cotizaciones'),
    where('licitacionId', '==', licitacionId),
    orderBy('fechaCarga', 'asc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Cotizacion, 'id'>) })));
  });
}

export async function getAllCotizaciones(): Promise<Cotizacion[]> {
  const snap = await getDocs(collection(db, 'cotizaciones'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Cotizacion, 'id'>) }));
}

export async function addCotizacion(data: Omit<Cotizacion, 'id' | 'fechaCarga'>): Promise<string> {
  const ref = await addDoc(collection(db, 'cotizaciones'), {
    ...data,
    fechaCarga: new Date().toISOString().split('T')[0],
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteCotizacion(id: string): Promise<void> {
  await deleteDoc(doc(db, 'cotizaciones', id));
}

// ═══════════════════════════════════════════════════════════════════
// PROPUESTAS DEL PROVEEDOR (subcolección de licitación)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToPropuestas(
  licitacionId: string,
  callback: (propuestas: Propuesta[]) => void
): Unsubscribe {
  const q = collection(db, 'licitaciones', licitacionId, 'propuestas');
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Propuesta, 'id'>) })));
  });
}

export async function savePropuesta(
  licitacionId: string,
  proveedorId: string,
  data: Omit<Propuesta, 'id'>
): Promise<void> {
  const ref = doc(db, 'licitaciones', licitacionId, 'propuestas', proveedorId);
  await setDoc(ref, { ...data, _updatedAt: serverTimestamp() }, { merge: true });
}

export async function getPropuesta(
  licitacionId: string,
  proveedorId: string
): Promise<Propuesta | null> {
  const snap = await getDoc(doc(db, 'licitaciones', licitacionId, 'propuestas', proveedorId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Propuesta, 'id'>) };
}

// Convierte una propuesta enviada en cotización oficial para la evaluación admin
export async function convertirPropuestaACotizacion(
  propuesta: Propuesta
): Promise<string> {
  const cotizacion: Omit<Cotizacion, 'id' | 'fechaCarga'> = {
    licitacionId: propuesta.licitacionId,
    proveedorId: propuesta.proveedorId,
    proveedorRut: propuesta.proveedorRut,
    proveedorNombre: propuesta.proveedorNombre,
    montoNeto: propuesta.montoNeto,
    montoIva: propuesta.montoIva,
    montoTotal: propuesta.montoTotal,
    plazoDias: propuesta.plazoDias,
    ajustaRequerimientos: propuesta.ajustaRequerimientos,
    cuentaExperiencia: propuesta.cuentaExperiencia,
    cumplePlazoRequerido: propuesta.cumplePlazoRequerido,
    declaraSustentabilidad: propuesta.declaraSustentabilidad,
    tipoEvidenciaSustentable: propuesta.tipoEvidenciaSustentable,
    documentoCotizacionNombre: propuesta.archivoNombre,
    observaciones: propuesta.observaciones,
    origenPropuestaId: propuesta.id,
  };
  return addCotizacion(cotizacion);
}

// ═══════════════════════════════════════════════════════════════════
// USUARIOS / PERFILES AUTH
// ═══════════════════════════════════════════════════════════════════

export async function createUserProfile(uid: string, data: Omit<UserProfile, 'uid'>): Promise<void> {
  await setDoc(doc(db, 'usuarios', uid), {
    ...data,
    uid,
    fechaRegistro: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(db, 'usuarios', uid), { ...data, _updatedAt: serverTimestamp() });
}

// ═══════════════════════════════════════════════════════════════════
// ADJUDICACIÓN + HISTORIAL (acción compuesta)
// ═══════════════════════════════════════════════════════════════════

/**
 * Adjudica una licitación y registra el historial en todos los proveedores participantes.
 * - Ganador → resultado: 'Adjudicado'
 * - Resto   → resultado: 'No Adjudicado'
 */
export async function adjudicarLicitacion(params: {
  licitacionId: string;
  proveedorGanadorId: string;
  justificacion: string;
  cotizaciones: Cotizacion[];
  puntajes: Record<string, number>; // proveedorId → puntajeTotalPonderado
  codigoCP: string;
  codigoOP: string;
  nombreProyecto: string;
}): Promise<void> {
  const { licitacionId, proveedorGanadorId, justificacion, cotizaciones, puntajes, codigoCP, codigoOP, nombreProyecto } = params;

  // 1. Actualizar estado de licitación
  await updateLicitacion(licitacionId, {
    estado: 'Adjudicado',
    proveedorAdjudicadoId: proveedorGanadorId,
    justificacionAdjudicacion: justificacion,
  });

  // 2. Actualizar estado de invitados
  for (const cot of cotizaciones) {
    const estadoInvitado = cot.proveedorId === proveedorGanadorId ? 'Presentada' : 'Presentada';
    await updateInvitadoEstado(licitacionId, cot.proveedorId, estadoInvitado);
  }

  // 3. Registrar historial en cada proveedor participante
  const fecha = new Date().toISOString().split('T')[0];
  for (const cot of cotizaciones) {
    const resultado: HistorialObra['resultado'] =
      cot.proveedorId === proveedorGanadorId ? 'Adjudicado' : 'No Adjudicado';

    await addHistorialObra(cot.proveedorId, {
      licitacionId,
      codigoCP,
      codigoOP,
      nombreProyecto,
      montoTotal: cot.montoTotal,
      plazoDias: cot.plazoDias,
      resultado,
      fecha,
      puntajeObtenido: puntajes[cot.proveedorId],
    });
  }
}
