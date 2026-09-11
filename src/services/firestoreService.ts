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
  writeBatch,
  type Unsubscribe,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatearRUT } from '../utils/rutUtils';
import { normalizarNombreProyecto } from '../utils/spellCorrector';
import { construirSeccionesBasesDesdeCero, CAMPOS_QUE_AFECTAN_BASES } from '../utils/basesGenerator';
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
  EvaluacionDesempeno,
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

export async function getProveedorPorId(id: string): Promise<Proveedor | null> {
  const snap = await getDoc(doc(db, 'proveedores', id));
  if (!snap.exists()) return null;
  const prov = { id: snap.id, ...(snap.data() as Omit<Proveedor, 'id'>) };
  return { ...prov, rut: formatearRUT(prov.rut) };
}

export async function getProveedorPorEmail(email: string): Promise<Proveedor | null> {
  const normalizado = email.trim().toLowerCase();
  if (!normalizado) return null;
  const snap = await getDocs(collection(db, 'proveedores'));
  const match = snap.docs.find(d => (d.data().email || '').trim().toLowerCase() === normalizado);
  if (!match) return null;
  const prov = { id: match.id, ...(match.data() as Omit<Proveedor, 'id'>) };
  return { ...prov, rut: formatearRUT(prov.rut) };
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
// EVALUACIÓN DE DESEMPEÑO POR PROVEEDOR (post-ejecución de obra)
// ═══════════════════════════════════════════════════════════════════

export async function addEvaluacionDesempeno(
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

export async function updateEvaluacionDesempeno(
  proveedorId: string,
  evaluacionId: string,
  data: Partial<Omit<EvaluacionDesempeno, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, 'proveedores', proveedorId, 'evaluacionesDesempeno', evaluacionId), {
    ...data,
    _updatedAt: serverTimestamp(),
  });
}

export async function deleteEvaluacionDesempeno(proveedorId: string, evaluacionId: string): Promise<void> {
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

/** Promedio ponderado de todas las evaluaciones de desempeño de un proveedor (1-5), o null si no tiene ninguna. */
export function calcularPromedioDesempeno(evaluaciones: EvaluacionDesempeno[]): number | null {
  if (!evaluaciones.length) return null;
  const suma = evaluaciones.reduce((acc, ev) => acc + ev.puntajeFinal, 0);
  return Math.round((suma / evaluaciones.length) * 10) / 10;
}

/** Promedio histórico por cada criterio de la pauta (calidad, plazo, seguridad, garantías, comunicación), o null si no hay evaluaciones. */
export function calcularPromediosPorCriterio(evaluaciones: EvaluacionDesempeno[]): Record<string, number> | null {
  if (!evaluaciones.length) return null;
  const sumas: Record<string, number> = {};
  const conteos: Record<string, number> = {};
  evaluaciones.forEach(ev => {
    ev.criterios.forEach(c => {
      sumas[c.id] = (sumas[c.id] || 0) + c.puntaje;
      conteos[c.id] = (conteos[c.id] || 0) + 1;
    });
  });
  const promedios: Record<string, number> = {};
  Object.keys(sumas).forEach(id => {
    promedios[id] = Math.round((sumas[id] / conteos[id]) * 10) / 10;
  });
  return promedios;
}

// ═══════════════════════════════════════════════════════════════════
// PROYECTOS MAESTROS
// ═══════════════════════════════════════════════════════════════════

export async function getAllProyectosMaestros(): Promise<ProyectoMaestro[]> {
  const snap = await getDocs(collection(db, 'proyectos'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ProyectoMaestro, 'id'>) }));
}

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
  let datosFinales = data;

  // Si el update toca un campo que el texto de las Bases ya generadas cita textualmente
  // (presupuesto, plazo, tipo de obra, garantías, etc.), las Bases quedan desactualizadas:
  // si siguen en Borrador se regeneran solas con los datos nuevos; si ya están en Revisión
  // Legal o Aprobadas (documento legal "cerrado") no se sobrescriben solas, solo se marcan
  // para que quien las gestiona decida si corresponde regenerarlas.
  // No aplica si quien llama YA viene actualizando `bases` explícitamente (ej. el propio
  // modal de Bases guardando su edición) — evita sobrescribirse a sí mismo.
  if (!('bases' in data) && CAMPOS_QUE_AFECTAN_BASES.some(campo => campo in data)) {
    const snap = await getDoc(doc(db, 'proyectos', id));
    if (snap.exists()) {
      const actual = { id, ...(snap.data() as Omit<ProyectoMaestro, 'id'>) } as ProyectoMaestro;
      if (actual.bases) {
        const dataIndexable = data as unknown as Record<string, unknown>;
        const actualIndexable = actual as unknown as Record<string, unknown>;
        const cambioReal = CAMPOS_QUE_AFECTAN_BASES.some(
          campo => campo in data && JSON.stringify(dataIndexable[campo]) !== JSON.stringify(actualIndexable[campo])
        );
        if (cambioReal) {
          const proyectoConCambios = { ...actual, ...data } as ProyectoMaestro;
          datosFinales = {
            ...data,
            bases: actual.bases.estado === 'Borrador'
              ? {
                  ...actual.bases,
                  version: actual.bases.version + 1,
                  secciones: construirSeccionesBasesDesdeCero(proyectoConCambios),
                  fechaActualizacion: new Date().toISOString(),
                  desactualizada: false,
                }
              : { ...actual.bases, desactualizada: true },
          };
        }
      }
    }
  }

  await updateDoc(doc(db, 'proyectos', id), {
    ...datosFinales,
    ...(datosFinales.nombre !== undefined ? { nombre: normalizarNombreProyecto(datosFinales.nombre) } : {}),
    _updatedAt: serverTimestamp(),
  });
}

// Aprobación explícita para el Presupuesto Anual Proyectado (distinta de la prioridad,
// que solo es un criterio de apoyo). Queda trazable quién y cuándo aprobó/retiró el proyecto.
export async function setAprobacionPresupuesto(
  id: string,
  aprobado: boolean,
  usuario: { nombre?: string | null; email?: string | null }
): Promise<void> {
  await updateDoc(doc(db, 'proyectos', id), {
    presupuesto: aprobado
      ? {
          aprobado: true,
          fecha: new Date().toISOString(),
          aprobadoPorNombre: usuario.nombre || undefined,
          aprobadoPorEmail: usuario.email || undefined,
        }
      : { aprobado: false },
    _updatedAt: serverTimestamp(),
  });
}

// Trae los Estados de Pago de varias licitaciones (subcolección por licitación) en paralelo.
// Se usa para construir el Avance Financiero real de la Cartera sin depender de una
// collection group query (evita depender de reglas de Firestore específicas para eso).
export async function getEstadosPagoDeLicitaciones(
  licitacionIds: string[]
): Promise<EstadoPago[]> {
  const resultados = await Promise.all(
    licitacionIds.map(async id => {
      const snap = await getDocs(collection(db, 'licitaciones', id, 'estadosPago'));
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EstadoPago, 'id'>), licitacionId: id }));
    })
  );
  return resultados.flat();
}

export async function deleteProyectoMaestro(id: string): Promise<void> {
  // Resguardo: no permitir borrar un proyecto de la Cartera que ya registra
  // gasto efectivo (pagos realmente cursados) — evita perder la trazabilidad
  // de dinero público ya ejecutado con un solo clic de confirmación.
  const snap = await getDoc(doc(db, 'proyectos', id));
  const gastoEfectivo = snap.exists() ? (snap.data() as ProyectoMaestro).gastoEfectivo || 0 : 0;
  if (gastoEfectivo > 0) {
    throw new Error('No se puede eliminar: este proyecto ya registra gasto efectivo (pagos cursados). Contacte al administrador si necesita anularlo.');
  }
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

  // 2. Buscar por codigoProyecto en la colección 'proyectos'.
  // NO se usa codigoCP como respaldo: no es único (muchos proyectos comparten el valor
  // por defecto "409-1722"), lo que sobrescribiría OC/OT/OP de proyectos ajenos.
  try {
    if (licitacion.codigoProyecto) {
      const proyectosRef = collection(db, 'proyectos');
      const snap = await getDocs(query(proyectosRef, where('codigoProyecto', '==', licitacion.codigoProyecto)));
      if (!snap.empty) {
        for (const docProy of snap.docs) {
          await updateDoc(docProy.ref, updateFields);
        }
      }
    }
  } catch (err) {
    console.error('Error al sincronizar OC con Proyecto Maestro:', err);
  }
}

export async function syncGastoEfectivoToProyectoMaestro(
  licitacionId: string,
  nuevoGastoEfectivo: number
): Promise<void> {
  try {
    const licSnap = await getDoc(doc(db, 'licitaciones', licitacionId));
    if (!licSnap.exists()) return;
    const licData = licSnap.data() as LicitacionProyecto;

    const updateFields = {
      gastoEfectivo: nuevoGastoEfectivo,
      _updatedAt: serverTimestamp(),
    };

    if (licData.proyectoMaestroId) {
      try {
        await updateDoc(doc(db, 'proyectos', licData.proyectoMaestroId), updateFields);
      } catch (e) {
        console.warn('Error sincronizando gastoEfectivo por proyectoMaestroId:', e);
      }
    }

    // NO se usa codigoCP como respaldo: no es único (muchos proyectos comparten el valor
    // por defecto "409-1722"), lo que sobrescribiría el gasto efectivo de proyectos ajenos.
    if (licData.codigoProyecto) {
      const proyectosRef = collection(db, 'proyectos');
      const snap = await getDocs(query(proyectosRef, where('codigoProyecto', '==', licData.codigoProyecto)));
      if (!snap.empty) {
        for (const docProy of snap.docs) {
          await updateDoc(docProy.ref, updateFields);
        }
      }
    }
  } catch (err) {
    console.error('Error al sincronizar Gasto Efectivo con Proyecto Maestro:', err);
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
  // Resguardo: no permitir borrar una licitación con Estados de Pago ya
  // firmados por el responsable — son registros financieros aprobados y
  // borrar el documento padre los dejaría huérfanos en vez de eliminados,
  // sin ninguna advertencia visible para quien hace clic en "Eliminar".
  const estadosSnap = await getDocs(collection(db, 'licitaciones', id, 'estadosPago'));
  const tieneEstadoFirmado = estadosSnap.docs.some(d => Boolean((d.data() as EstadoPago).firmaResponsable));
  if (tieneEstadoFirmado) {
    throw new Error('No se puede eliminar: esta licitación tiene Estados de Pago firmados por el responsable. Contacte al administrador si necesita anularla.');
  }
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

/**
 * Regla única de "proceso cerrado": una vez adjudicada (o marcada Cerrada tras
 * la recepción conforme) ya no se pueden cargar, importar ni modificar ofertas.
 * Toda pantalla que necesite este chequeo debe importar esta función en vez de
 * reimplementar la condición.
 */
export function licitacionCerradaParaOfertas(data: Partial<LicitacionProyecto>): boolean {
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

/** true si ya pasó la fecha límite de entrega de propuestas de la licitación. */
export function plazoEntregaVencido(data: Pick<LicitacionProyecto, 'fechaEntregaPropuestas' | 'fechaEvaluacion'>): boolean {
  const fechaLimite = data.fechaEntregaPropuestas || data.fechaEvaluacion;
  return Boolean(fechaLimite) && new Date() > new Date(fechaLimite as string);
}

/**
 * Bloqueo real (no solo de interfaz) del plazo de entrega: se aplica al guardado
 * de la propuesta en el portal de proveedores, que es el único punto donde la
 * fecha del sistema equivale a la fecha real de recepción de la oferta. No se
 * aplica a la carga administrativa de cotizaciones (addCotizacion), porque ahí
 * la fecha de ingreso al sistema no necesariamente coincide con la fecha real
 * en que la oferta llegó por otros medios (correo, papel).
 */
function validarPlazoEntregaVigente(
  licitacionSnap: { exists: () => boolean; data: () => unknown }
): void {
  const data = licitacionSnap.data() as Partial<LicitacionProyecto>;
  if (plazoEntregaVencido(data as Pick<LicitacionProyecto, 'fechaEntregaPropuestas' | 'fechaEvaluacion'>)) {
    const fechaLimite = data.fechaEntregaPropuestas || data.fechaEvaluacion;
    throw new Error(`PLAZO_VENCIDO: El plazo de entrega de propuestas venció el ${fechaLimite}. No se pueden enviar ni modificar propuestas después de esa fecha.`);
  }
}

export async function addCotizacion(data: Omit<Cotizacion, 'id' | 'fechaCarga'>): Promise<string> {
  const licitacionRef = doc(db, 'licitaciones', data.licitacionId);
  // ID determinístico (licitación + proveedor) en vez de un ID aleatorio: así la
  // propia transacción de Firestore impide, de forma atómica, que un mismo
  // proveedor quede con dos cotizaciones activas para la misma licitación —
  // sin esto, dos envíos (doble clic, dos pestañas) podían duplicar su oferta
  // y distorsionar el cuadro comparativo y el conteo de quórum de ofertas.
  const cotizacionId = `${data.licitacionId}_${data.proveedorId}`;
  const cotizacionRef = doc(db, 'cotizaciones', cotizacionId);
  await runTransaction(db, async transaction => {
    const [licitacionSnap, cotizacionSnap] = await Promise.all([
      transaction.get(licitacionRef),
      transaction.get(cotizacionRef),
    ]);
    validarRecepcionOfertasAbierta(licitacionSnap);
    if (cotizacionSnap.exists()) {
      throw new Error('COTIZACION_DUPLICADA: Este proveedor ya tiene una cotización registrada para esta licitación. Elimínela primero si desea reemplazarla.');
    }
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
  data: Omit<EstadoPago, 'id' | 'licitacionId' | 'numero'>
): Promise<{ id: string; numero: number }> {
  // Numeración correlativa asignada dentro de una transacción (mismo patrón que
  // addAumentoObra) para evitar que dos envíos casi simultáneos generen dos
  // Estados de Pago con el mismo número correlativo.
  const counterRef = doc(db, 'licitaciones', licitacionId, 'control', 'estadosPago');
  const estadoRef = doc(collection(db, 'licitaciones', licitacionId, 'estadosPago'));
  const numero = await runTransaction(db, async transaction => {
    const counter = await transaction.get(counterRef);
    const siguienteNumero = Number(counter.data()?.ultimoNumero || 0) + 1;
    transaction.set(counterRef, { ultimoNumero: siguienteNumero, _updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(estadoRef, {
      ...data,
      licitacionId,
      numero: siguienteNumero,
      _createdAt: serverTimestamp(),
    });
    return siguienteNumero;
  });
  return { id: estadoRef.id, numero };
}

const CAMPOS_FINANCIEROS_ESTADO_PAGO: (keyof EstadoPago)[] = ['montoNeto', 'montoIva', 'montoTotal', 'items', 'porcentajeAvanceGlobal', 'numero', 'proveedorId'];

export async function updateEstadoPago(
  licitacionId: string,
  estadoPagoId: string,
  data: Partial<EstadoPago>
): Promise<void> {
  const ref = doc(db, 'licitaciones', licitacionId, 'estadosPago', estadoPagoId);
  const tocaCampoFinanciero = CAMPOS_FINANCIEROS_ESTADO_PAGO.some(campo => campo in data);
  if (tocaCampoFinanciero) {
    const snap = await getDoc(ref);
    if (snap.exists() && (snap.data() as EstadoPago).firmaResponsable) {
      throw new Error('Este Estado de Pago ya fue firmado por el responsable; sus montos e ítems no pueden modificarse.');
    }
  }
  await updateDoc(ref, {
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
    validarPlazoEntregaVigente(licitacionSnap);
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
  codigoProyecto?: string;
  proyectoMaestroId?: string;
}): Promise<void> {
  const { licitacionId, proveedorGanadorId, justificacion, cotizaciones, puntajes, codigoCP, codigoOP, nombreProyecto, codigoProyecto, proyectoMaestroId } = params;
  const fecha = new Date().toISOString().split('T')[0];
  const cotGanadora = cotizaciones.find(c => c.proveedorId === proveedorGanadorId);

  // Resolución (solo lectura) del Proyecto Maestro vinculado, ANTES de la transacción —
  // las transacciones de Firestore no admiten queries con `where`, solo lecturas de
  // documentos puntuales. IMPORTANTE: codigoCP no es único entre proyectos (varios
  // comparten el valor por defecto '409-1722'), por lo que NO se usa como filtro de
  // respaldo — ni siquiera cuando da un único resultado, porque esa coincidencia puede
  // seguir siendo el proyecto equivocado. Solo se sincroniza vía proyectoMaestroId
  // (vínculo exacto) o codigoProyecto (correlativo, único). Si ninguno coincide, se
  // omite la sincronización automática.
  let proyectoRef: DocumentReference | null = null;
  if (proyectoMaestroId) {
    const docProy = await getDoc(doc(db, 'proyectos', proyectoMaestroId));
    if (docProy.exists()) proyectoRef = docProy.ref;
  }
  if (!proyectoRef && codigoProyecto) {
    const snap = await getDocs(query(collection(db, 'proyectos'), where('codigoProyecto', '==', codigoProyecto)));
    if (snap.size === 1) {
      proyectoRef = snap.docs[0].ref;
    } else if (snap.size > 1) {
      console.warn(`adjudicarLicitacion: codigoProyecto "${codigoProyecto}" coincide con ${snap.size} proyectos; se omite la sincronización automática para evitar ambigüedad.`);
    }
  }

  // Toda la escritura (licitación + invitados + historial de cada proveedor + Proyecto
  // Maestro vinculado) ocurre dentro de UNA sola transacción: o se aplica todo, o no se
  // aplica nada. La comprobación de `estado` dentro de la transacción también evita que
  // dos clics/pestañas concurrentes dupliquen el historial o se pisen entre sí — si la
  // licitación ya quedó adjudicada, la transacción falla con un error claro en vez de
  // reprocesar todo silenciosamente.
  await runTransaction(db, async tx => {
    const licRef = doc(db, 'licitaciones', licitacionId);
    const licSnap = await tx.get(licRef);
    if (!licSnap.exists()) throw new Error('La licitación ya no existe.');
    const licData = licSnap.data() as LicitacionProyecto;
    if (licData.estado === 'Adjudicado' || licData.estado === 'Cerrado') {
      throw new Error('PROCESO_CERRADO: Esta licitación ya fue adjudicada previamente.');
    }

    const proyData = proyectoRef ? (await tx.get(proyectoRef)).data() : undefined;

    // 1. Estado de la licitación
    tx.update(licRef, {
      estado: 'Adjudicado',
      proveedorAdjudicadoId: proveedorGanadorId,
      proveedorGanadorId,
      justificacionAdjudicacion: justificacion,
      cotizacionAdjudicadaId: cotGanadora?.id,
      proveedorAdjudicadoNombre: cotGanadora?.proveedorNombre,
      proveedorAdjudicadoRut: cotGanadora?.proveedorRut,
      montoAdjudicadoNeto: cotGanadora?.montoNeto,
      montoAdjudicadoIva: cotGanadora?.montoIva,
      montoAdjudicadoTotal: cotGanadora?.montoTotal,
      plazoAdjudicadoDias: cotGanadora?.plazoDias,
      estadoLifecycle: 'Adjudicado',
      nombreProyecto: normalizarNombreProyecto(licData.nombreProyecto),
      _updatedAt: serverTimestamp(),
    });

    // 2. Estado de invitados (todos los que cotizaron quedan "Presentada", ganador o no) +
    //    3. Historial en cada proveedor participante — ID determinístico (licitacionId) para
    //    que un reintento de la transacción no duplique entradas.
    for (const cot of cotizaciones) {
      tx.set(
        doc(db, 'licitaciones', licitacionId, 'invitados', cot.proveedorId),
        { estadoPropuesta: 'Presentada' },
        { merge: true }
      );

      const resultado: HistorialObra['resultado'] = cot.proveedorId === proveedorGanadorId ? 'Adjudicado' : 'No Adjudicado';
      tx.set(doc(db, 'proveedores', cot.proveedorId, 'historialObras', licitacionId), {
        licitacionId,
        codigoCP,
        codigoOP,
        nombreProyecto: normalizarNombreProyecto(nombreProyecto),
        montoTotal: cot.montoTotal,
        plazoDias: cot.plazoDias,
        resultado,
        fecha,
        puntajeObtenido: puntajes[cot.proveedorId],
        _createdAt: serverTimestamp(),
      });
    }

    // 4. Proyecto Maestro vinculado en la Cartera (si se pudo resolver sin ambigüedad)
    if (proyectoRef) {
      tx.update(proyectoRef, {
        estado: 'En Proceso',
        plazoAdjudicadoDias: cotGanadora?.plazoDias || 0,
        fechaInicioObra: fecha,
        montoAdjudicado: cotGanadora?.montoTotal || proyData?.montoAdjudicado || 0,
        _updatedAt: serverTimestamp(),
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// RESET DE CARTERA Y LICITACIONES (herramienta administrativa)
// Borra proyectos, licitaciones y sus subcolecciones (estados de pago,
// aumentos de obra, invitados, propuestas, contadores) y las cotizaciones
// asociadas. NO toca proveedores, configuración de firmas, responsables
// ni usuarios — para eso existe storageService.resetAllData().
// ═══════════════════════════════════════════════════════════════════

const SUBCOLECCIONES_LICITACION = ['estadosPago', 'aumentosObra', 'invitados', 'propuestas', 'control'];

export interface ProyectoConGastoEfectivo {
  id: string;
  nombre: string;
  codigoProyecto: string;
  gastoEfectivo: number;
}

export async function contarCarteraYLicitaciones(): Promise<{
  proyectos: number;
  licitaciones: number;
  cotizaciones: number;
  proyectosConGastoEfectivo: ProyectoConGastoEfectivo[];
}> {
  const [proyectosSnap, licitacionesSnap, cotizacionesSnap] = await Promise.all([
    getDocs(collection(db, 'proyectos')),
    getDocs(collection(db, 'licitaciones')),
    getDocs(collection(db, 'cotizaciones')),
  ]);
  const proyectosConGastoEfectivo = proyectosSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as Omit<ProyectoMaestro, 'id'>) }))
    .filter(p => (p.gastoEfectivo || 0) > 0)
    .map(p => ({ id: p.id, nombre: p.nombre, codigoProyecto: p.codigoProyecto, gastoEfectivo: p.gastoEfectivo || 0 }));
  return {
    proyectos: proyectosSnap.size,
    licitaciones: licitacionesSnap.size,
    cotizaciones: cotizacionesSnap.size,
    proyectosConGastoEfectivo,
  };
}

async function borrarRefsEnLotes(refs: DocumentReference[]): Promise<void> {
  const TAMANO_LOTE = 450; // margen bajo el límite de 500 operaciones por batch de Firestore
  for (let i = 0; i < refs.length; i += TAMANO_LOTE) {
    const batch = writeBatch(db);
    refs.slice(i, i + TAMANO_LOTE).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

export async function resetCarteraYLicitaciones(): Promise<{
  proyectos: number;
  licitaciones: number;
  cotizaciones: number;
}> {
  // Resguardo: nunca borrar proyectos con gasto efectivo (pagos reales ya cursados),
  // aunque quien llame a esta función se salte el modal de confirmación.
  const { proyectosConGastoEfectivo } = await contarCarteraYLicitaciones();
  if (proyectosConGastoEfectivo.length > 0) {
    const detalle = proyectosConGastoEfectivo.map(p => `${p.codigoProyecto} — ${p.nombre}`).join(', ');
    throw new Error(`No se puede borrar: ${proyectosConGastoEfectivo.length} proyecto(s) ya registran Gasto Efectivo (pagos cursados): ${detalle}. Contacte al administrador si de todas formas necesita anularlos.`);
  }

  const licitacionesSnap = await getDocs(collection(db, 'licitaciones'));

  for (const licDoc of licitacionesSnap.docs) {
    for (const sub of SUBCOLECCIONES_LICITACION) {
      const subSnap = await getDocs(collection(db, 'licitaciones', licDoc.id, sub));
      await borrarRefsEnLotes(subSnap.docs.map(d => d.ref));
    }
  }
  await borrarRefsEnLotes(licitacionesSnap.docs.map(d => d.ref));

  const proyectosSnap = await getDocs(collection(db, 'proyectos'));
  await borrarRefsEnLotes(proyectosSnap.docs.map(d => d.ref));

  const cotizacionesSnap = await getDocs(collection(db, 'cotizaciones'));
  await borrarRefsEnLotes(cotizacionesSnap.docs.map(d => d.ref));

  return {
    proyectos: proyectosSnap.size,
    licitaciones: licitacionesSnap.size,
    cotizaciones: cotizacionesSnap.size,
  };
}
