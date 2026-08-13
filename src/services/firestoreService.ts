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
  arrayUnion,
  arrayRemove,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatearRUT } from '../utils/rutUtils';
import { normalizarNombreProyecto } from '../utils/spellCorrector';
import type {
  Proveedor,
  HistorialObra,
  ProyectoMaestro,
  LicitacionProyecto,
  InvitadoLicitacion,
  Cotizacion,
  Propuesta,
  EstadoPago,
  AumentoObra,
  HitoDesarrolloProyecto,
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
  const historialQuery = query(
    collection(db, 'proveedores', proveedorId, 'historialObras'),
    orderBy('fecha', 'desc')
  );
  const [historialSnap, licitacionesSnap, cotizacionesSnap] = await Promise.all([
    getDocs(historialQuery),
    getDocs(collection(db, 'licitaciones')),
    getDocs(query(collection(db, 'cotizaciones'), where('proveedorId', '==', proveedorId))),
  ]);

  const historialGuardado = historialSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<HistorialObra, 'id'>),
  }));
  const licitaciones = licitacionesSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<LicitacionProyecto, 'id'>),
  }));
  const cotizaciones = cotizacionesSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<Cotizacion, 'id'>),
  }));
  const historialPorLicitacion = new Map(historialGuardado.map(item => [item.licitacionId, item]));

  const relaciones = await Promise.all(licitaciones.map(async licitacion => {
    const [invitacionSnap, propuestaSnap] = await Promise.all([
      getDoc(doc(db, 'licitaciones', licitacion.id, 'invitados', proveedorId)).catch(() => null),
      getDoc(doc(db, 'licitaciones', licitacion.id, 'propuestas', proveedorId)).catch(() => null),
    ]);
    return {
      licitacion,
      invitacion: invitacionSnap?.exists() ? invitacionSnap.data() as InvitadoLicitacion : undefined,
      propuesta: propuestaSnap?.exists() ? propuestaSnap.data() as Propuesta : undefined,
    };
  }));

  const consolidado = new Map<string, HistorialObra>();
  relaciones.forEach(({ licitacion, invitacion, propuesta }) => {
    const cotizacion = cotizaciones.find(item => item.licitacionId === licitacion.id);
    const registroPrevio = historialPorLicitacion.get(licitacion.id);
    const fueInvitado = Boolean(invitacion)
      || Boolean(licitacion.proveedoresInvitadosIds?.includes(proveedorId));
    const participo = Boolean(cotizacion) || propuesta?.estado === 'Enviada';
    const esAdjudicado = proveedorId === (licitacion.proveedorAdjudicadoId || licitacion.proveedorGanadorId);
    if (!fueInvitado && !participo && !esAdjudicado && !registroPrevio) return;

    const procesoAbierto = licitacion.estado === 'Borrador' || licitacion.estado === 'En Evaluacion';
    const obraFinalizada = licitacion.estadoLifecycle === 'Finalizado' || licitacion.recepcionConforme?.aprobada === true;
    const activo = esAdjudicado ? !obraFinalizada : procesoAbierto;
    const estadoActual: HistorialObra['estadoActual'] = activo
      ? esAdjudicado && !procesoAbierto ? 'Obra activa' : 'Licitación activa'
      : obraFinalizada ? 'Finalizado' : 'Proceso cerrado';
    const resultado: HistorialObra['resultado'] = esAdjudicado
      ? 'Adjudicado'
      : participo ? (procesoAbierto ? 'Participando' : 'No Adjudicado') : 'Invitado';

    consolidado.set(licitacion.id, {
      id: registroPrevio?.id || `consolidado-${licitacion.id}`,
      licitacionId: licitacion.id,
      codigoCP: licitacion.codigoCP,
      codigoOP: licitacion.codigoOP,
      codigoOT: licitacion.codigoOT,
      codigoProyecto: licitacion.codigoProyecto,
      nombreProyecto: normalizarNombreProyecto(licitacion.nombreProyecto),
      montoTotal: cotizacion?.montoTotal || propuesta?.montoTotal || registroPrevio?.montoTotal || 0,
      plazoDias: cotizacion?.plazoDias || propuesta?.plazoDias || registroPrevio?.plazoDias || 0,
      resultado,
      fecha: registroPrevio?.fecha || cotizacion?.fechaCotizacion || propuesta?.fechaEnvio?.split('T')[0]
        || invitacion?.fechaInvitacion || licitacion.fechaCreacion || licitacion.fechaEvaluacion,
      puntajeObtenido: registroPrevio?.puntajeObtenido,
      estadoLicitacion: licitacion.estado,
      estadoLifecycle: licitacion.estadoLifecycle,
      estadoActual,
      activo,
    });
  });

  historialGuardado.forEach(item => {
    if (!consolidado.has(item.licitacionId)) consolidado.set(item.licitacionId, item);
  });

  return [...consolidado.values()].sort((a, b) => {
    if (Boolean(a.activo) !== Boolean(b.activo)) return a.activo ? -1 : 1;
    return (b.fecha || '').localeCompare(a.fecha || '');
  });
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
    callback(snap.docs.map(d => {
      const proyecto = { id: d.id, ...(d.data() as Omit<ProyectoMaestro, 'id'>) };
      return { ...proyecto, nombre: normalizarNombreProyecto(proyecto.nombre) };
    }));
  });
}

export async function addProyectoMaestro(
  data: Omit<ProyectoMaestro, 'id' | 'correlativo' | 'codigoProyecto'>
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

  const year = new Date().getFullYear();
  const codigoProyecto = `${year}_${String(correlativo).padStart(3, '0')}`;

  const ref = await addDoc(collection(db, 'proyectos'), {
    ...data,
    nombre: normalizarNombreProyecto(data.nombre),
    correlativo,
    codigoProyecto,
    fechaCreacion: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProyectoMaestro(
  id: string,
  data: Partial<ProyectoMaestro>
): Promise<void> {
  await updateDoc(doc(db, 'proyectos', id), {
    ...data,
    ...(data.nombre !== undefined ? { nombre: normalizarNombreProyecto(data.nombre) } : {}),
    _updatedAt: serverTimestamp(),
  });
}

export async function deleteProyectoMaestro(id: string): Promise<void> {
  await deleteDoc(doc(db, 'proyectos', id));
}

export async function syncOCToProyectoMaestro(
  licitacion: Partial<LicitacionProyecto> & { id: string },
  datosOC: {
    ordenCompraNumero: string;
    codigoOC?: string;
    codigoOP?: string;
    codigoOT?: string;
    archivoOCNombre?: string;
    archivoOCURL?: string;
    archivoOCDriveId?: string;
    fechaCargaOC?: string;
  }
): Promise<void> {
  const ocVal = datosOC.ordenCompraNumero || datosOC.codigoOC || '';
  if (!ocVal) return;

  const updateFields: Record<string, any> = {
    ordenCompraNumero: ocVal,
    codigoOC: ocVal,
    _updatedAt: serverTimestamp(),
  };

  if (datosOC.codigoOP) updateFields.codigoOP = datosOC.codigoOP;
  if (datosOC.codigoOT) updateFields.codigoOT = datosOC.codigoOT;
  if (datosOC.archivoOCNombre) updateFields.archivoOCNombre = datosOC.archivoOCNombre;
  if (datosOC.archivoOCURL) updateFields.archivoOCURL = datosOC.archivoOCURL;
  if (datosOC.archivoOCDriveId) updateFields.archivoOCDriveId = datosOC.archivoOCDriveId;
  if (datosOC.fechaCargaOC) updateFields.fechaCargaOC = datosOC.fechaCargaOC;

  // 1. Si la licitación tiene proyectoMaestroId explícito
  if (licitacion.proyectoMaestroId) {
    try {
      await updateDoc(doc(db, 'proyectos', licitacion.proyectoMaestroId), updateFields);
    } catch (e) {
      console.warn('Error actualizando por proyectoMaestroId:', e);
    }
  }

  // 2. Buscar por codigoProyecto o por codigoCP en la colección 'proyectos'
  try {
    const proyectosRef = collection(db, 'proyectos');
    let snap: any = null;

    if (licitacion.codigoProyecto) {
      const q = query(proyectosRef, where('codigoProyecto', '==', licitacion.codigoProyecto));
      snap = await getDocs(q);
    }

    if ((!snap || snap.empty) && licitacion.codigoCP) {
      const q = query(proyectosRef, where('codigoCP', '==', licitacion.codigoCP));
      snap = await getDocs(q);
    }

    if (snap && !snap.empty) {
      for (const docProy of snap.docs) {
        await updateDoc(docProy.ref, updateFields);
      }
    }
  } catch (err) {
    console.error('Error al sincronizar OC con Proyecto Maestro:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════
// LICITACIONES (migrado a Firestore)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToLicitaciones(
  callback: (licitaciones: LicitacionProyecto[]) => void
): Unsubscribe {
  const q = query(collection(db, 'licitaciones'), orderBy('_createdAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => {
      const licitacion = { id: d.id, ...(d.data() as Omit<LicitacionProyecto, 'id'>) };
      return { ...licitacion, nombreProyecto: normalizarNombreProyecto(licitacion.nombreProyecto) };
    }));
  });
}

export async function getAllLicitaciones(): Promise<LicitacionProyecto[]> {
  const q = query(collection(db, 'licitaciones'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<LicitacionProyecto, 'id'>) }));
}

export async function addLicitacion(
  data: Omit<LicitacionProyecto, 'id'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'licitaciones'), {
    ...data,
    nombreProyecto: normalizarNombreProyecto(data.nombreProyecto),
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLicitacion(
  id: string,
  data: Partial<LicitacionProyecto>
): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', id), {
    ...data,
    ...(data.nombreProyecto !== undefined ? { nombreProyecto: normalizarNombreProyecto(data.nombreProyecto) } : {}),
    _updatedAt: serverTimestamp(),
  });
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
  await Promise.all([
    setDoc(ref, { ...data, _createdAt: serverTimestamp() }),
    updateDoc(doc(db, 'licitaciones', licitacionId), {
      proveedoresInvitadosIds: arrayUnion(data.proveedorId),
      _updatedAt: serverTimestamp(),
    }),
  ]);
}

export async function removeInvitado(licitacionId: string, proveedorId: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId)),
    updateDoc(doc(db, 'licitaciones', licitacionId), {
      proveedoresInvitadosIds: arrayRemove(proveedorId),
      _updatedAt: serverTimestamp(),
    }),
  ]);
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

function licitacionCerradaParaOfertas(data: Partial<LicitacionProyecto>): boolean {
  return data.estado === 'Adjudicado'
    || data.estado === 'Cerrado'
    || Boolean(data.proveedorAdjudicadoId)
    || Boolean(data.proveedorGanadorId);
}

function validarRecepcionOfertasAbierta(
  licitacionSnap: { exists: () => boolean; data: () => unknown }
): void {
  if (!licitacionSnap.exists()) {
    throw new Error('La licitacion asociada no existe.');
  }
  if (licitacionCerradaParaOfertas(licitacionSnap.data() as Partial<LicitacionProyecto>)) {
    throw new Error('PROCESO_CERRADO: La licitacion ya fue adjudicada y no acepta nuevas ofertas ni modificaciones.');
  }
}

export async function addCotizacion(data: Omit<Cotizacion, 'id' | 'fechaCarga'>): Promise<string> {
  const licitacionRef = doc(db, 'licitaciones', data.licitacionId);
  const cotizacionRef = doc(collection(db, 'cotizaciones'));
  await runTransaction(db, async transaction => {
    const licitacionSnap = await transaction.get(licitacionRef);
    validarRecepcionOfertasAbierta(licitacionSnap);
    transaction.set(cotizacionRef, {
      ...data,
      fechaCarga: new Date().toISOString().split('T')[0],
      _createdAt: serverTimestamp(),
    });
  });
  return cotizacionRef.id;
}

export async function deleteCotizacion(id: string): Promise<void> {
  const cotizacionRef = doc(db, 'cotizaciones', id);
  await runTransaction(db, async transaction => {
    const cotizacionSnap = await transaction.get(cotizacionRef);
    if (!cotizacionSnap.exists()) return;
    const cotizacion = cotizacionSnap.data() as Omit<Cotizacion, 'id'>;
    const licitacionSnap = await transaction.get(doc(db, 'licitaciones', cotizacion.licitacionId));
    validarRecepcionOfertasAbierta(licitacionSnap);
    transaction.delete(cotizacionRef);
  });
}

export function subscribeToEstadosPago(
  licitacionId: string,
  callback: (estados: EstadoPago[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'licitaciones', licitacionId, 'estadosPago'),
    orderBy('numero', 'asc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EstadoPago, 'id'>) })));
  });
}

export async function addEstadoPago(
  licitacionId: string,
  data: Omit<EstadoPago, 'id' | 'licitacionId'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'licitaciones', licitacionId, 'estadosPago'), {
    ...data,
    licitacionId,
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEstadoPago(
  licitacionId: string,
  estadoPagoId: string,
  data: Partial<EstadoPago>
): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'estadosPago', estadoPagoId), {
    ...data,
    _updatedAt: serverTimestamp(),
  });
}

export function subscribeToAumentosObra(
  licitacionId: string,
  callback: (aumentos: AumentoObra[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'licitaciones', licitacionId, 'aumentosObra'),
    orderBy('numero', 'asc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AumentoObra, 'id'>) })));
  });
}

export async function addAumentoObra(
  licitacionId: string,
  data: Omit<AumentoObra, 'id' | 'licitacionId' | 'numero'>
): Promise<string> {
  const counterRef = doc(db, 'licitaciones', licitacionId, 'control', 'aumentosObra');
  const aumentoRef = doc(collection(db, 'licitaciones', licitacionId, 'aumentosObra'));
  await runTransaction(db, async transaction => {
    const counter = await transaction.get(counterRef);
    const numero = Number(counter.data()?.ultimoNumero || 0) + 1;
    transaction.set(counterRef, { ultimoNumero: numero, _updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(aumentoRef, {
      ...data,
      licitacionId,
      numero,
      _createdAt: serverTimestamp(),
    });
  });
  return aumentoRef.id;
}

export async function updateAumentoObraEstado(
  licitacionId: string,
  aumentoId: string,
  estado: AumentoObra['estado'],
  aprobadoPor?: string
): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'aumentosObra', aumentoId), {
    estado,
    ...(estado === 'Aprobado' ? {
      aprobadoPor: aprobadoPor || '',
      fechaAprobacion: new Date().toISOString(),
    } : {}),
    _updatedAt: serverTimestamp(),
  });
}

export function subscribeToBitacoraProyecto(
  coleccionProyecto: 'licitaciones' | 'proyectos',
  proyectoId: string,
  callback: (hitos: HitoDesarrolloProyecto[]) => void
): Unsubscribe {
  const q = query(
    collection(db, coleccionProyecto, proyectoId, 'bitacoraDesarrollo'),
    orderBy('fecha', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<HitoDesarrolloProyecto, 'id'>) })));
  });
}

export async function addHitoDesarrolloProyecto(
  coleccionProyecto: 'licitaciones' | 'proyectos',
  proyectoId: string,
  data: Omit<HitoDesarrolloProyecto, 'id' | 'proyectoId'>
): Promise<string> {
  const ref = await addDoc(collection(db, coleccionProyecto, proyectoId, 'bitacoraDesarrollo'), {
    ...data,
    proyectoId,
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateHitoDesarrolloEstado(
  coleccionProyecto: 'licitaciones' | 'proyectos',
  proyectoId: string,
  hitoId: string,
  estado: HitoDesarrolloProyecto['estado']
): Promise<void> {
  await updateDoc(doc(db, coleccionProyecto, proyectoId, 'bitacoraDesarrollo', hitoId), {
    estado,
    _updatedAt: serverTimestamp(),
  });
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
  const licitacionRef = doc(db, 'licitaciones', licitacionId);
  const ref = doc(db, 'licitaciones', licitacionId, 'propuestas', proveedorId);
  await runTransaction(db, async transaction => {
    const licitacionSnap = await transaction.get(licitacionRef);
    validarRecepcionOfertasAbierta(licitacionSnap);
    transaction.set(ref, { ...data, _updatedAt: serverTimestamp() }, { merge: true });
  });
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
    itemizado: propuesta.itemizado,
    fechaCotizacion: propuesta.fechaCotizacion,
    ajustaRequerimientos: propuesta.ajustaRequerimientos,
    cuentaExperiencia: propuesta.cuentaExperiencia,
    cumplePlazoRequerido: propuesta.cumplePlazoRequerido,
    declaraSustentabilidad: propuesta.declaraSustentabilidad,
    tipoEvidenciaSustentable: propuesta.tipoEvidenciaSustentable,
    documentoCotizacionNombre: propuesta.archivoNombre,
    documentoCotizacionURL: propuesta.archivoURL,
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
    proveedorGanadorId,
    justificacionAdjudicacion: justificacion,
    cotizacionAdjudicadaId: cotizaciones.find(c => c.proveedorId === proveedorGanadorId)?.id,
    proveedorAdjudicadoNombre: cotizaciones.find(c => c.proveedorId === proveedorGanadorId)?.proveedorNombre,
    proveedorAdjudicadoRut: cotizaciones.find(c => c.proveedorId === proveedorGanadorId)?.proveedorRut,
    montoAdjudicadoNeto: cotizaciones.find(c => c.proveedorId === proveedorGanadorId)?.montoNeto,
    montoAdjudicadoIva: cotizaciones.find(c => c.proveedorId === proveedorGanadorId)?.montoIva,
    montoAdjudicadoTotal: cotizaciones.find(c => c.proveedorId === proveedorGanadorId)?.montoTotal,
    plazoAdjudicadoDias: cotizaciones.find(c => c.proveedorId === proveedorGanadorId)?.plazoDias,
    estadoLifecycle: 'Adjudicado',
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
      nombreProyecto: normalizarNombreProyecto(nombreProyecto),
      montoTotal: cot.montoTotal,
      plazoDias: cot.plazoDias,
      resultado,
      fecha,
      puntajeObtenido: puntajes[cot.proveedorId],
    });
  }

  // 4. Actualizar estado del Proyecto Maestro correspondiente en la Cartera
  try {
    const proyectosRef = collection(db, 'proyectos');
    const qProy = query(proyectosRef, where('codigoCP', '==', codigoCP));
    const querySnapshot = await getDocs(qProy);
    
    if (!querySnapshot.empty) {
      const docProy = querySnapshot.docs[0];
      const proyData = docProy.data();
      const cotGanadora = cotizaciones.find(c => c.proveedorId === proveedorGanadorId);
      
      await updateDoc(docProy.ref, {
        estado: 'En Proceso',
        montoAdjudicado: cotGanadora?.montoTotal || proyData.montoAdjudicado || 0,
        plazoAdjudicadoDias: cotGanadora?.plazoDias || proyData.plazoAdjudicadoDias || 0,
        fechaInicioObra: fecha,
        _updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('Error al actualizar Proyecto Maestro durante la adjudicación:', err);
  }
}
