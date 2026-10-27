import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, onSnapshot, serverTimestamp, query, orderBy, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatearRUT } from '../../utils/rutUtils';
import { normalizarNombreProyecto } from '../../utils/spellCorrector';
import { type Proveedor, type HistorialObra, type LicitacionProyecto, type InvitadoLicitacion, type Cotizacion, type Propuesta, type EvaluacionDesempeno } from '../../types';
import { promedioDesempenoPonderado, promediosPorCriterioPonderados } from '../../utils/scorecardProveedor';

// ═══════════════════════════════════════════════════════════════════
// PROVEEDORES
// ═══════════════════════════════════════════════════════════════════

export function subscribeToProveedores(
  callback: (proveedores: Proveedor[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'proveedores'), orderBy('fechaRegistro', 'desc'));
  return onSnapshot(q, snapshot => {
    callback(
      snapshot.docs.map(d => {
        const prov = { id: d.id, ...(d.data() as Omit<Proveedor, 'id'>) };
        return { ...prov, rut: formatearRUT(prov.rut) };
      })
    );
  }, err => onError?.(err));
}

export async function getProveedorPorId(id: string): Promise<Proveedor | null> {
  const snap = await getDoc(doc(db, 'proveedores', id));
  if (!snap.exists()) return null;
  const prov = { id: snap.id, ...(snap.data() as Omit<Proveedor, 'id'>) };
  return { ...prov, rut: formatearRUT(prov.rut) };
}

export async function addProveedorSinRegistro(data: Omit<Proveedor, 'id' | 'fechaRegistro'>): Promise<string> {
  const ref = await addDoc(collection(db, 'proveedores'), {
    ...data,
    rut: formatearRUT(data.rut),
    fechaRegistro: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProveedorSinRegistro(id: string, data: Partial<Proveedor>): Promise<void> {
  await updateDoc(doc(db, 'proveedores', id), { ...data, _updatedAt: serverTimestamp() });
}

export async function deleteProveedorSinRegistro(id: string): Promise<void> {
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

// ═══════════════════════════════════════════════════════════════════
// EVALUACIÓN DE DESEMPEÑO POR PROVEEDOR (post-ejecución de obra)
// ═══════════════════════════════════════════════════════════════════

export async function addEvaluacionDesempenoSinRegistro(
  proveedorId: string,
  data: Omit<EvaluacionDesempeno, 'id'>
): Promise<void> {
  await addDoc(collection(db, 'proveedores', proveedorId, 'evaluacionesDesempeno'), {
    ...data,
    _createdAt: serverTimestamp(),
  });
}

export async function getEvaluacionesDesempeno(proveedorId: string): Promise<EvaluacionDesempeno[]> {
  const q = query(collection(db, 'proveedores', proveedorId, 'evaluacionesDesempeno'), orderBy('fecha', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EvaluacionDesempeno, 'id'>) }));
}

export async function updateEvaluacionDesempenoSinRegistro(
  proveedorId: string,
  evaluacionId: string,
  data: Partial<Omit<EvaluacionDesempeno, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, 'proveedores', proveedorId, 'evaluacionesDesempeno', evaluacionId), {
    ...data,
    _updatedAt: serverTimestamp(),
  });
}

export async function deleteEvaluacionDesempenoSinRegistro(proveedorId: string, evaluacionId: string): Promise<void> {
  await deleteDoc(doc(db, 'proveedores', proveedorId, 'evaluacionesDesempeno', evaluacionId));
}

/** Trae las evaluaciones de desempeño de varios proveedores de una sola vez (para un ranking consolidado). */
export async function getEvaluacionesDesempenoDeProveedores(
  proveedorIds: string[]
): Promise<Record<string, EvaluacionDesempeno[]>> {
  const entradas = await Promise.all(
    proveedorIds.map(async id => [id, await getEvaluacionesDesempeno(id)] as const)
  );
  return Object.fromEntries(entradas);
}

/** Puntaje histórico de un proveedor (1-5), dando más peso a las evaluaciones recientes; null si no tiene ninguna. */
export function calcularPromedioDesempeno(evaluaciones: EvaluacionDesempeno[]): number | null {
  return promedioDesempenoPonderado(evaluaciones);
}

/** Promedio histórico por cada criterio de la pauta (calidad, plazo, seguridad, garantías, comunicación), con el mismo peso por antigüedad que el puntaje general; null si no hay evaluaciones. */
export function calcularPromediosPorCriterio(evaluaciones: EvaluacionDesempeno[]): Record<string, number> | null {
  return promediosPorCriterioPonderados(evaluaciones);
}
