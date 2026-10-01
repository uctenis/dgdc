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
  collectionGroup,
  type Unsubscribe,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { diferencias, registrarCambio } from './auditoriaService';
import { REQUISITOS_INSCRIPCION } from '../data/inscripcionProveedores';
import { renombrarSiglaEdificio } from '../data/campusData';
import { ANIO_CARTERA_INICIAL, anioDeCartera, compararConBaseAjuste, decisionDeCartera, partidasParaComparar, type DecisionCartera } from '../utils/carteraAnual';
import { formatearRUT } from '../utils/rutUtils';
import { normalizarNombreProyecto } from '../utils/spellCorrector';
import { plazoOfertasVencido, fechaLimiteOfertas, textoLimiteOfertas } from '../utils/plazoOfertas';
import { construirSeccionesBasesDesdeCero, CAMPOS_QUE_AFECTAN_BASES } from '../utils/basesGenerator';
import type {
  Proveedor,
  HistorialObra,
  ProyectoMaestro,
  RevisionCarteraEntrada,
  LicitacionProyecto,
  InvitadoLicitacion,
  Cotizacion,
  Propuesta,
  EstadoPago,
  AumentoObra,
  HitoDesarrolloProyecto,
  UserProfile,
  EvaluacionDesempeno, EnvioInvitacion, InvitacionAcceso, ConsultaLicitacion, ConsultaPublicada, GarantiaLicitacion, RegistroAperturaOfertas,
  EntradaLibroObra, FotoLibroObra, MultaObra, AclaracionLicitacion, InscripcionProveedor, DocumentoProveedor,
} from '../types';

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

async function addProveedorSinRegistro(data: Omit<Proveedor, 'id' | 'fechaRegistro'>): Promise<string> {
  const ref = await addDoc(collection(db, 'proveedores'), {
    ...data,
    rut: formatearRUT(data.rut),
    fechaRegistro: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

async function updateProveedorSinRegistro(id: string, data: Partial<Proveedor>): Promise<void> {
  await updateDoc(doc(db, 'proveedores', id), { ...data, _updatedAt: serverTimestamp() });
}

async function deleteProveedorSinRegistro(id: string): Promise<void> {
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

async function addEvaluacionDesempenoSinRegistro(
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

async function updateEvaluacionDesempenoSinRegistro(
  proveedorId: string,
  evaluacionId: string,
  data: Partial<Omit<EvaluacionDesempeno, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, 'proveedores', proveedorId, 'evaluacionesDesempeno', evaluacionId), {
    ...data,
    _updatedAt: serverTimestamp(),
  });
}

async function deleteEvaluacionDesempenoSinRegistro(proveedorId: string, evaluacionId: string): Promise<void> {
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
  callback: (proyectos: ProyectoMaestro[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'proyectos'), orderBy('correlativo', 'asc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => {
      const proyecto = { id: d.id, ...(d.data() as Omit<ProyectoMaestro, 'id'>) };
      return { ...proyecto, nombre: normalizarNombreProyecto(proyecto.nombre) };
    }));
  }, err => onError?.(err));
}

async function addProyectoMaestroSinRegistro(
  data: Omit<ProyectoMaestro, 'id' | 'correlativo' | 'codigoProyecto'>
): Promise<string> {
  // Usar counter para asignar correlativo único
  const counterRef = doc(db, '_counters', 'proyectos');
  let correlativo = 1;
  // El código lleva el año de la CARTERA (no el de la fecha de creación) y un número que parte de 1 cada año.
  // La cartera inicial sigue numerándose con el correlativo general, como hasta ahora.
  const anio = data.anioPresupuesto || new Date().getFullYear();
  let numeroEnAnio = 1;

  await runTransaction(db, async tx => {
    const counterSnap = await tx.get(counterRef);
    const previo = counterSnap.exists() ? counterSnap.data() : undefined;
    correlativo = ((previo?.last as number) || 0) + 1;
    numeroEnAnio = anio === ANIO_CARTERA_INICIAL ? correlativo : (((previo?.porAnio as Record<string, number> | undefined)?.[anio]) || 0) + 1;
    const porAnio = anio === ANIO_CARTERA_INICIAL ? {} : { porAnio: { [anio]: numeroEnAnio } };
    tx.set(counterRef, { last: correlativo, ...porAnio }, { merge: true });
  });

  const codigoProyecto = `${anio}_${String(numeroEnAnio).padStart(3, '0')}`;

  const ref = await addDoc(collection(db, 'proyectos'), {
    ...data,
    nombre: normalizarNombreProyecto(data.nombre),
    correlativo,
    codigoProyecto,
    anioPresupuesto: anio,
    fechaCreacion: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

async function updateProyectoMaestroSinRegistro(
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

  // Si cambió el itemizado, las licitaciones del proyecto actualizan el formato de presupuesto del portal.
  if ('itemizado' in datosFinales) {
    try {
      const licitaciones = await getDocs(query(collection(db, 'licitaciones'), where('proyectoMaestroId', '==', id)));
      const formato = construirFormatoPresupuesto(datosFinales.itemizado || []);
      await Promise.all(licitaciones.docs.map(l => updateDoc(l.ref, { formatoPresupuesto: formato, _updatedAt: serverTimestamp() })));
    } catch (err) {
      console.warn('No se pudo actualizar el formato de presupuesto de las licitaciones:', err);
    }
  }
}

/** Partidas sin cantidades ni precios: lo único que se le muestra al proveedor del presupuesto del proyecto. */
function construirFormatoPresupuesto(itemizado: NonNullable<ProyectoMaestro['itemizado']>): NonNullable<LicitacionProyecto['formatoPresupuesto']> {
  return itemizado.map(p => ({
    item: p.item,
    ...(p.fase ? { fase: String(p.fase) } : {}),
    descripcion: p.descripcion,
    unidad: p.unidad,
  }));
}

/** Copia las partidas (sin precios) del proyecto a la licitación, para el formato de presupuesto del portal. */
export async function sincronizarFormatoPresupuesto(licitacionId: string, proyectoMaestroId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'proyectos', proyectoMaestroId));
  if (!snap.exists()) return;
  const proyecto = snap.data() as ProyectoMaestro;
  await updateDoc(doc(db, 'licitaciones', licitacionId), {
    formatoPresupuesto: construirFormatoPresupuesto(proyecto.itemizado || []),
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

const ETIQUETA_DECISION = { aprobado: 'Aprobado', rechazado: 'Rechazado', observado: 'Observado', pendiente: 'Por revisar' } as const;

/**
 * Decisión de la revisión de cartera sobre un proyecto. Cada decisión queda en el historial del proyecto con el
 * valor de ese momento; al observarlo se guarda además con qué valor e itemizado llegó, para mostrar después
 * qué se ajustó (partidas eliminadas, montos rebajados).
 */
export async function setDecisionPresupuesto(
  id: string,
  decision: DecisionCartera,
  usuario: { nombre?: string | null; email?: string | null },
  observacion?: string
): Promise<void> {
  const snap = await getDoc(doc(db, 'proyectos', id));
  if (!snap.exists()) throw new Error('PROYECTO_NO_EXISTE');
  const proyecto = { id, ...(snap.data() as Omit<ProyectoMaestro, 'id'>) };
  const previa = decisionDeCartera(proyecto);
  const ajuste = compararConBaseAjuste(proyecto);
  const nota = observacion?.trim() || undefined;
  // La base del ajuste se conserva mientras el proyecto siga en revisión; se suelta al aprobar o rechazar.
  const baseAjuste = decision === 'observado'
    ? proyecto.presupuesto?.baseAjuste || { valor: proyecto.valorAprox || 0, partidas: partidasParaComparar(proyecto) }
    : decision === 'pendiente' ? proyecto.presupuesto?.baseAjuste : undefined;
  const presupuesto: NonNullable<ProyectoMaestro['presupuesto']> = decision === 'pendiente'
    ? { aprobado: false, baseAjuste }
    : {
        aprobado: decision === 'aprobado',
        rechazado: decision === 'rechazado',
        observado: decision === 'observado',
        baseAjuste,
        observacion: nota,
        fecha: new Date().toISOString(),
        aprobadoPorNombre: usuario.nombre || undefined,
        aprobadoPorEmail: usuario.email || undefined,
      };
  const entrada: RevisionCarteraEntrada = {
    fecha: new Date().toISOString(),
    anio: anioDeCartera(proyecto),
    decision,
    usuario: usuario.email || usuario.nombre || undefined,
    observacion: nota,
    valor: proyecto.valorAprox || 0,
    ...(ajuste?.hayCambios && decision !== 'observado' ? cambiosDelAjuste(ajuste) : {}),
  };
  await updateDoc(doc(db, 'proyectos', id), {
    presupuesto,
    historialRevision: [...(proyecto.historialRevision || []), entrada],
    _updatedAt: serverTimestamp(),
  });
  registrarCambio({
    accion: 'Modificó', entidad: 'Proyecto', entidadId: id, nombre: proyecto.nombre,
    cambios: { 'revisión de cartera': { antes: ETIQUETA_DECISION[previa], despues: ETIQUETA_DECISION[decision] } },
    detalle: nota,
  });
}

const cambiosDelAjuste = (ajuste: NonNullable<ReturnType<typeof compararConBaseAjuste>>) => ({
  ...(ajuste.diferencia !== 0 ? { valorAnterior: ajuste.valorAnterior } : {}),
  ...(ajuste.eliminadas.length ? { partidasEliminadas: ajuste.eliminadas } : {}),
  ...(ajuste.agregadas.length ? { partidasAgregadas: ajuste.agregadas } : {}),
  ...(ajuste.modificadas.length ? { partidasModificadas: ajuste.modificadas } : {}),
});

/**
 * Pasa proyectos a la cartera de otro año (los que no se aprobaron quedan como candidatos del siguiente). El
 * proyecto es el mismo: conserva código, ficha, itemizado y documentos; vuelve a quedar por revisar y el traspaso
 * se anota en su historial.
 */
export async function traspasarProyectosDeCartera(ids: string[], anioDestino: number, usuario: { email?: string | null }): Promise<number> {
  let traspasados = 0;
  for (const id of ids) {
    const snap = await getDoc(doc(db, 'proyectos', id));
    if (!snap.exists()) continue;
    const proyecto = { id, ...(snap.data() as Omit<ProyectoMaestro, 'id'>) };
    const anioOrigen = anioDeCartera(proyecto);
    if (anioOrigen === anioDestino) continue;
    const entrada: RevisionCarteraEntrada = {
      fecha: new Date().toISOString(),
      anio: anioDestino,
      decision: 'traspaso',
      usuario: usuario.email || undefined,
      observacion: `Pasa de la Cartera ${anioOrigen} (${ETIQUETA_DECISION[decisionDeCartera(proyecto)].toLowerCase()}) a la Cartera ${anioDestino}.`,
      valor: proyecto.valorAprox || 0,
    };
    await updateDoc(doc(db, 'proyectos', id), {
      anioPresupuesto: anioDestino,
      presupuesto: { aprobado: false },
      historialRevision: [...(proyecto.historialRevision || []), entrada],
      _updatedAt: serverTimestamp(),
    });
    registrarCambio({
      accion: 'Modificó', entidad: 'Proyecto', entidadId: id, nombre: proyecto.nombre,
      cambios: { cartera: { antes: String(anioOrigen), despues: String(anioDestino) } },
    });
    traspasados++;
  }
  return traspasados;
}

/**
 * El responsable ajustó un proyecto observado (itemizado, valor) y lo reenvía a revisión: el ajuste queda en el
 * historial con lo que cambió respecto de lo presentado, y el proyecto vuelve a esperar una decisión.
 */
export async function reenviarProyectoAjustado(id: string, usuario: { email?: string | null }, nota?: string): Promise<void> {
  const snap = await getDoc(doc(db, 'proyectos', id));
  if (!snap.exists()) throw new Error('PROYECTO_NO_EXISTE');
  const proyecto = { id, ...(snap.data() as Omit<ProyectoMaestro, 'id'>) };
  const ajuste = compararConBaseAjuste(proyecto);
  const entrada: RevisionCarteraEntrada = {
    fecha: new Date().toISOString(),
    anio: anioDeCartera(proyecto),
    decision: 'ajuste',
    usuario: usuario.email || undefined,
    observacion: nota?.trim() || undefined,
    valor: proyecto.valorAprox || 0,
    ...(ajuste?.hayCambios ? cambiosDelAjuste(ajuste) : {}),
  };
  await updateDoc(doc(db, 'proyectos', id), {
    presupuesto: { ...(proyecto.presupuesto || {}), aprobado: false, rechazado: false, observado: false, ajustado: true },
    historialRevision: [...(proyecto.historialRevision || []), entrada],
    _updatedAt: serverTimestamp(),
  });
  registrarCambio({
    accion: 'Modificó', entidad: 'Proyecto', entidadId: id, nombre: proyecto.nombre,
    cambios: { 'revisión de cartera': { antes: 'Observado', despues: 'Ajustado, por revisar' } },
    detalle: nota?.trim() || undefined,
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

async function deleteProyectoMaestroSinRegistro(id: string): Promise<void> {
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
  callback: (licitaciones: LicitacionProyecto[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'licitaciones'), orderBy('_createdAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => {
      const licitacion = { id: d.id, ...(d.data() as Omit<LicitacionProyecto, 'id'>) };
      return { ...licitacion, nombreProyecto: normalizarNombreProyecto(licitacion.nombreProyecto) };
    }));
  }, err => onError?.(err));
}

/** Suscripción a UNA licitación (el portal de proveedores nunca descarga la colección completa). */
export function subscribeToLicitacion(
  licitacionId: string,
  callback: (licitacion: LicitacionProyecto | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'licitaciones', licitacionId), snap => {
    if (!snap.exists()) { callback(null); return; }
    const licitacion = { id: snap.id, ...(snap.data() as Omit<LicitacionProyecto, 'id'>) };
    callback({ ...licitacion, nombreProyecto: normalizarNombreProyecto(licitacion.nombreProyecto) });
  }, err => onError?.(err));
}

export async function getAllLicitaciones(): Promise<LicitacionProyecto[]> {
  const q = query(collection(db, 'licitaciones'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<LicitacionProyecto, 'id'>) }));
}

/** Instante exacto del cierre de ofertas (ms): las reglas de Firebase lo usan para cerrar el portal a la hora. */
function limiteOfertasMsDe(data: Partial<LicitacionProyecto>): { limiteOfertasMs?: number } {
  const limite = fechaLimiteOfertas(data);
  return limite ? { limiteOfertasMs: limite.getTime() } : {};
}

/** Deja al día el instante de cierre de una licitación anterior a este campo. */
export async function asegurarLimiteOfertas(lic: LicitacionProyecto): Promise<void> {
  const limite = fechaLimiteOfertas(lic);
  if (!limite || lic.limiteOfertasMs === limite.getTime()) return;
  await updateDoc(doc(db, 'licitaciones', lic.id), { limiteOfertasMs: limite.getTime() });
}

async function addLicitacionSinRegistro(
  data: Omit<LicitacionProyecto, 'id'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'licitaciones'), {
    ...data,
    ...limiteOfertasMsDe(data),
    nombreProyecto: normalizarNombreProyecto(data.nombreProyecto),
    _createdAt: serverTimestamp(),
  });
  return ref.id;
}

async function updateLicitacionSinRegistro(
  id: string,
  data: Partial<LicitacionProyecto>
): Promise<void> {
  let cierre: { limiteOfertasMs?: number } = {};
  if ('fechaEntregaPropuestas' in data || 'fechaEvaluacion' in data || 'horaLimiteOfertas' in data) {
    const actual = await getDoc(doc(db, 'licitaciones', id));
    cierre = limiteOfertasMsDe({ ...(actual.exists() ? (actual.data() as Partial<LicitacionProyecto>) : {}), ...data });
  }
  await updateDoc(doc(db, 'licitaciones', id), {
    ...data,
    ...cierre,
    ...(data.nombreProyecto !== undefined ? { nombreProyecto: normalizarNombreProyecto(data.nombreProyecto) } : {}),
    _updatedAt: serverTimestamp(),
  });
}

async function deleteLicitacionSinRegistro(id: string): Promise<void> {
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

/** Código aleatorio (128 bits) del enlace personal de una invitación. */
function generarTokenAcceso(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Publica el código en `invitaciones/{código}`: es lo que consulta el proveedor al entrar (solo se puede leer
 * conociendo el código; no se puede listar), así el proveedor nunca necesita leer la lista de invitados.
 */
async function publicarInvitacionPorToken(
  token: string,
  licitacionId: string,
  inv: { proveedorId: string; proveedorEmail: string; proveedorNombre: string }
): Promise<void> {
  await setDoc(doc(db, 'invitaciones', token), {
    licitacionId,
    proveedorId: inv.proveedorId,
    proveedorEmail: inv.proveedorEmail,
    proveedorNombre: inv.proveedorNombre,
  });
}

/** Garantiza que cada invitado tenga su enlace personal (los invitados anteriores a esta función no lo tenían). */
export async function asegurarTokensInvitados(licitacionId: string, invitados: InvitadoLicitacion[]): Promise<InvitadoLicitacion[]> {
  return Promise.all(invitados.map(async inv => {
    if (inv.tokenAcceso) {
      await publicarInvitacionPorToken(inv.tokenAcceso, licitacionId, inv);
      return inv;
    }
    const tokenAcceso = generarTokenAcceso();
    await updateDoc(doc(db, 'licitaciones', licitacionId, 'invitados', inv.proveedorId), { tokenAcceso });
    await publicarInvitacionPorToken(tokenAcceso, licitacionId, inv);
    return { ...inv, tokenAcceso };
  }));
}

async function addInvitadoSinRegistro(
  licitacionId: string,
  data: Omit<InvitadoLicitacion, 'id'>
): Promise<void> {
  const ref = doc(db, 'licitaciones', licitacionId, 'invitados', data.proveedorId);
  const tokenAcceso = data.tokenAcceso || generarTokenAcceso();
  await Promise.all([
    setDoc(ref, { ...data, tokenAcceso, _createdAt: serverTimestamp() }),
    publicarInvitacionPorToken(tokenAcceso, licitacionId, data),
    updateDoc(doc(db, 'licitaciones', licitacionId), {
      proveedoresInvitadosIds: arrayUnion(data.proveedorId),
      _updatedAt: serverTimestamp(),
    }),
  ]);
}

export async function addEnvioInvitacion(
  licitacionId: string,
  data: Omit<EnvioInvitacion, 'id'>
): Promise<void> {
  await addDoc(collection(db, 'licitaciones', licitacionId, 'envios'), { ...data, _createdAt: serverTimestamp() });
}

export function subscribeToEnviosInvitaciones(
  licitacionId: string,
  callback: (envios: EnvioInvitacion[]) => void
): Unsubscribe {
  const q = collection(db, 'licitaciones', licitacionId, 'envios');
  return onSnapshot(q, snap => {
    const envios = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EnvioInvitacion, 'id'>) }));
    callback(envios.sort((a, b) => b.fecha.localeCompare(a.fecha)));
  });
}

export async function getInvitadosLicitacion(licitacionId: string): Promise<InvitadoLicitacion[]> {
  const snap = await getDocs(collection(db, 'licitaciones', licitacionId, 'invitados'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InvitadoLicitacion, 'id'>) }));
}

/** Todas las licitaciones con sus invitados: base para medir la carga de trabajo y la rotación de proveedores. */
export async function getLicitacionesConInvitados(): Promise<{
  licitaciones: LicitacionProyecto[];
  invitadosPorLicitacion: Record<string, InvitadoLicitacion[]>;
}> {
  const licitaciones = await getAllLicitaciones();
  // Una sola consulta por todos los invitados (grupo de colecciones) en vez de una por licitación.
  try {
    const snap = await getDocs(collectionGroup(db, 'invitados'));
    const invitadosPorLicitacion: Record<string, InvitadoLicitacion[]> = Object.fromEntries(licitaciones.map(l => [l.id, []]));
    snap.docs.forEach(d => {
      const licId = d.ref.parent.parent?.id;
      if (licId && invitadosPorLicitacion[licId]) {
        invitadosPorLicitacion[licId].push({ id: d.id, ...(d.data() as Omit<InvitadoLicitacion, 'id'>) });
      }
    });
    return { licitaciones, invitadosPorLicitacion };
  } catch (err) {
    // Reglas de Firebase sin permiso para el grupo de colecciones: se lee licitación por licitación.
    console.warn('Lectura agrupada de invitados no permitida; se lee por licitación:', err);
    const entradas = await Promise.all(licitaciones.map(async l =>
      [l.id, await getInvitadosLicitacion(l.id).catch(() => [])] as const
    ));
    return { licitaciones, invitadosPorLicitacion: Object.fromEntries(entradas) };
  }
}

/**
 * Valida el acceso al portal: el enlace personal (código) debe corresponder a la invitación de ESA licitación Y la
 * cuenta que entra debe ser de ese mismo proveedor (por su cuenta ya vinculada o por el correo con el que se le
 * invitó). Sin enlace personal no hay acceso. Solo lee `invitaciones/{código}`: el proveedor nunca lista invitados.
 */
export async function verificarInvitacionLicitacion(
  licitacionId: string,
  quien: { proveedorId?: string | null; email?: string | null; token?: string | null }
): Promise<InvitacionAcceso | null> {
  if (!licitacionId || !quien.token) return null;
  const snap = await getDoc(doc(db, 'invitaciones', quien.token));
  if (!snap.exists()) return null;
  const invitacion = snap.data() as InvitacionAcceso;
  if (invitacion.licitacionId !== licitacionId) return null;
  if (quien.proveedorId) return invitacion.proveedorId === quien.proveedorId ? invitacion : null;
  const email = (quien.email || '').trim().toLowerCase();
  return email && (invitacion.proveedorEmail || '').trim().toLowerCase() === email ? invitacion : null;
}

export async function removeInvitado(licitacionId: string, proveedorId: string): Promise<void> {
  const previo = await getDoc(doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId));
  const token = previo.exists() ? (previo.data() as InvitadoLicitacion).tokenAcceso : undefined;
  if (token) await deleteDoc(doc(db, 'invitaciones', token)).catch(() => { /* ya no existía */ });
  await Promise.all([
    deleteDoc(doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId)),
    updateDoc(doc(db, 'licitaciones', licitacionId), {
      proveedoresInvitadosIds: arrayRemove(proveedorId),
      _updatedAt: serverTimestamp(),
    }),
  ]);
}

/** Deja constancia de que el proveedor ingresó al portal con su enlace (primera vez, última vez y n° de sesiones). */
export async function registrarAccesoPortal(licitacionId: string, proveedorId: string): Promise<void> {
  const ref = doc(db, 'licitaciones', licitacionId, 'invitados', proveedorId);
  const previo = await getDoc(ref);
  if (!previo.exists()) return;
  const ahora = new Date().toISOString();
  await updateDoc(ref, {
    ...((previo.data() as InvitadoLicitacion).primerAcceso ? {} : { primerAcceso: ahora }),
    ultimoAcceso: ahora,
    cantidadAccesos: increment(1),
  });
}

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
async function responderConsultaSinRegistro(
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

/** Todas las ofertas, en vivo: con la copia local solo se descargan los cambios, no la colección completa cada vez. */
export function subscribeToAllCotizaciones(
  callback: (cotizaciones: Cotizacion[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(collection(db, 'cotizaciones'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Cotizacion, 'id'>) })));
  }, err => onError?.(err));
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

/** true si ya pasó el cierre (fecha Y hora) de la recepción de ofertas de la licitación. */
export function plazoEntregaVencido(data: Pick<LicitacionProyecto, 'fechaEntregaPropuestas' | 'fechaEvaluacion' | 'horaLimiteOfertas'>): boolean {
  return plazoOfertasVencido(data);
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
  const campos = data as Pick<LicitacionProyecto, 'fechaEntregaPropuestas' | 'fechaEvaluacion' | 'horaLimiteOfertas'>;
  if (plazoEntregaVencido(campos)) {
    throw new Error(`PLAZO_VENCIDO: La recepción de ofertas se cerró el ${textoLimiteOfertas(campos)}. No se pueden enviar ni modificar propuestas después del cierre.`);
  }
}

async function addCotizacionSinRegistro(data: Omit<Cotizacion, 'id' | 'fechaCarga'>): Promise<string> {
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

async function deleteCotizacionSinRegistro(id: string): Promise<void> {
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

async function addEstadoPagoSinRegistro(
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

async function updateEstadoPagoSinRegistro(
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

async function addAumentoObraSinRegistro(
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

async function updateAumentoObraEstadoSinRegistro(
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

/**
 * Reúne lo que el contrato toma de la adjudicación: la licitación del proyecto, la oferta ganadora (su
 * itemizado es el Presupuesto Oficial, Anexo N°1), la propuesta del proveedor (datos de su representación
 * legal) y su ficha.
 */
export async function cargarAntecedentesContrato(proyecto: ProyectoMaestro): Promise<{
  licitacion?: LicitacionProyecto;
  cotizacion?: Cotizacion;
  propuesta?: Propuesta | null;
  proveedor?: Proveedor | null;
}> {
  let licSnap = await getDocs(query(collection(db, 'licitaciones'), where('proyectoMaestroId', '==', proyecto.id)));
  if (licSnap.empty && proyecto.codigoProyecto) {
    licSnap = await getDocs(query(collection(db, 'licitaciones'), where('codigoProyecto', '==', proyecto.codigoProyecto)));
  }
  if (licSnap.empty) return {};
  const licitacion = { id: licSnap.docs[0].id, ...(licSnap.docs[0].data() as Omit<LicitacionProyecto, 'id'>) } as LicitacionProyecto;
  const proveedorId = licitacion.proveedorAdjudicadoId || licitacion.proveedorGanadorId;

  const cotSnap = await getDocs(query(collection(db, 'cotizaciones'), where('licitacionId', '==', licitacion.id)));
  const cotizaciones = cotSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Cotizacion, 'id'>) })) as Cotizacion[];
  const cotizacion = cotizaciones.find(c => c.id === licitacion.cotizacionAdjudicadaId)
    || cotizaciones.find(c => proveedorId && c.proveedorId === proveedorId);

  const [propuesta, proveedor] = await Promise.all([
    proveedorId ? getPropuesta(licitacion.id, proveedorId).catch(() => null) : Promise.resolve(null),
    proveedorId ? getProveedorPorId(proveedorId).catch(() => null) : Promise.resolve(null),
  ]);
  return { licitacion, cotizacion, propuesta, proveedor };
}

/** Deja constancia en la propuesta de la confirmación por correo enviada (o simulada) al proveedor. */
export async function registrarConfirmacionPropuesta(
  licitacionId: string,
  proveedorId: string,
  confirmacion: NonNullable<Propuesta['confirmacionCorreo']>
): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'propuestas', proveedorId), { confirmacionCorreo: confirmacion });
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
    fechaRecepcion: propuesta.fechaEnvio,
    ...(propuesta.archivoTecnicoNombre ? { ofertaTecnicaNombre: propuesta.archivoTecnicoNombre } : {}),
    ...(propuesta.archivoTecnicoURL ? { ofertaTecnicaURL: propuesta.archivoTecnicoURL } : {}),
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
async function adjudicarLicitacionSinRegistro(params: {
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
      fechaAdjudicacion: fecha,
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

async function addGarantiaSinRegistro(licitacionId: string, data: Omit<GarantiaLicitacion, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'licitaciones', licitacionId, 'garantias'), { ...data, _createdAt: serverTimestamp() });
  return ref.id;
}

async function updateGarantiaSinRegistro(licitacionId: string, garantiaId: string, data: Partial<GarantiaLicitacion>): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'garantias', garantiaId), { ...data, _updatedAt: serverTimestamp() });
}

async function deleteGarantiaSinRegistro(licitacionId: string, garantiaId: string): Promise<void> {
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

// ═══════════════════════════════════════════════════════════════════
// MULTAS POR ATRASO (licitaciones/{id}/multas)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToMultas(licitacionId: string, callback: (multas: MultaObra[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'licitaciones', licitacionId, 'multas'), snap => {
    callback(snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<MultaObra, 'id'>) }))
      .sort((a, b) => a.desde.localeCompare(b.desde)));
  }, err => console.warn('No se pudieron leer las multas:', err));
}

async function addMultaSinRegistro(licitacionId: string, data: Omit<MultaObra, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'licitaciones', licitacionId, 'multas'), { ...data, _createdAt: serverTimestamp() });
  return ref.id;
}

async function updateMultaSinRegistro(licitacionId: string, multaId: string, data: Partial<MultaObra>): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'multas', multaId), { ...data, _updatedAt: serverTimestamp() });
}

/** Marca las multas como descontadas en un estado de pago. */
export async function marcarMultasDescontadas(licitacionId: string, multasIds: string[], estadoPagoId: string, estadoPagoNumero: number): Promise<void> {
  if (!multasIds.length) return;
  const batch = writeBatch(db);
  multasIds.forEach(id => batch.update(doc(db, 'licitaciones', licitacionId, 'multas', id), { estadoPagoId, estadoPagoNumero, _updatedAt: serverTimestamp() }));
  await batch.commit();
}

/**
 * Lleva a los proyectos y licitaciones el cambio de sigla o de nombre de un campus (ej. CHS → CSL): campus, nombre
 * del campus y edificio. El catálogo se cambia aparte (renombrarSiglaCampus en campusData).
 */
export async function migrarSiglaCampus(antigua: string, nueva: string, nombreCampus: string): Promise<{ proyectos: number; licitaciones: number }> {
  const conteo = { proyectos: 0, licitaciones: 0 };
  for (const coleccion of ['proyectos', 'licitaciones'] as const) {
    const snap = await getDocs(query(collection(db, coleccion), where('campusSigla', '==', antigua)));
    // Los lotes de Firestore admiten hasta 500 escrituras.
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach(d => {
        const edificio = d.data().edificioSigla;
        batch.update(d.ref, {
          campusSigla: nueva,
          campusNombre: nombreCampus,
          ...(typeof edificio === 'string' && edificio ? { edificioSigla: renombrarSiglaEdificio(edificio, antigua, nueva) } : {}),
          _updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
    conteo[coleccion] = snap.docs.length;
  }
  registrarCambio({
    accion: 'Modificó', entidad: 'Configuración', entidadId: `campus-${antigua}`, nombre: `Campus ${antigua}`,
    cambios: { campus: { antes: antigua, despues: `${nueva} · ${nombreCampus}` } },
    detalle: `${conteo.proyectos} proyecto(s) y ${conteo.licitaciones} licitación(es) actualizados`,
  });
  return conteo;
}

/** Política de garantías definida en el proyecto de la Cartera (si la licitación está vinculada a uno). */
export async function getPoliticaGarantiasProyecto(proyectoMaestroId?: string): Promise<ProyectoMaestro['politicaGarantias']> {
  if (!proyectoMaestroId) return undefined;
  const snap = await getDoc(doc(db, 'proyectos', proyectoMaestroId));
  return snap.exists() ? (snap.data() as ProyectoMaestro).politicaGarantias : undefined;
}

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
async function publicarAclaracionSinRegistro(
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

// ═══════════════════════════════════════════════════════════════════
// REGISTRO DE CAMBIOS: cada operación de arriba se envuelve para dejar constancia en `auditoria`
// (quién, cuándo, qué y valores antes/después). El registro nunca bloquea ni hace fallar la operación.
// ═══════════════════════════════════════════════════════════════════

async function leerDatos(...ruta: [string, ...string[]]): Promise<Record<string, unknown> | undefined> {
  try {
    const snap = await getDoc(doc(db, ...ruta));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const pesos = (v: unknown) => `$${Math.round(Number(v) || 0).toLocaleString('es-CL')}`;

export async function addProveedor(data: Omit<Proveedor, 'id' | 'fechaRegistro'>): Promise<string> {
  const id = await addProveedorSinRegistro(data);
  registrarCambio({ accion: 'Creó', entidad: 'Proveedor', entidadId: id, nombre: data.razonSocial, detalle: `RUT ${data.rut}` });
  return id;
}
export async function updateProveedor(id: string, data: Partial<Proveedor>): Promise<void> {
  const antes = await leerDatos('proveedores', id);
  await updateProveedorSinRegistro(id, data);
  registrarCambio({ accion: 'Modificó', entidad: 'Proveedor', entidadId: id, nombre: texto(antes?.razonSocial) || data.razonSocial, cambios: diferencias(antes, data as Record<string, unknown>) });
}
export async function deleteProveedor(id: string): Promise<void> {
  const antes = await leerDatos('proveedores', id);
  await deleteProveedorSinRegistro(id);
  registrarCambio({ accion: 'Eliminó', entidad: 'Proveedor', entidadId: id, nombre: texto(antes?.razonSocial), detalle: texto(antes?.rut) && `RUT ${antes?.rut}` });
}

export async function addEvaluacionDesempeno(proveedorId: string, data: Omit<EvaluacionDesempeno, 'id'>): Promise<void> {
  await addEvaluacionDesempenoSinRegistro(proveedorId, data);
  registrarCambio({ accion: 'Creó', entidad: 'Evaluación de desempeño', entidadId: proveedorId, nombre: data.nombreProyecto, licitacionId: data.licitacionId, detalle: `Puntaje ${data.puntajeFinal}` });
}
export async function updateEvaluacionDesempeno(proveedorId: string, evaluacionId: string, data: Partial<Omit<EvaluacionDesempeno, 'id'>>): Promise<void> {
  const antes = await leerDatos('proveedores', proveedorId, 'evaluacionesDesempeno', evaluacionId);
  await updateEvaluacionDesempenoSinRegistro(proveedorId, evaluacionId, data);
  registrarCambio({ accion: 'Modificó', entidad: 'Evaluación de desempeño', entidadId: evaluacionId, nombre: texto(antes?.nombreProyecto), cambios: diferencias(antes, data as Record<string, unknown>) });
}
export async function deleteEvaluacionDesempeno(proveedorId: string, evaluacionId: string): Promise<void> {
  const antes = await leerDatos('proveedores', proveedorId, 'evaluacionesDesempeno', evaluacionId);
  await deleteEvaluacionDesempenoSinRegistro(proveedorId, evaluacionId);
  registrarCambio({ accion: 'Eliminó', entidad: 'Evaluación de desempeño', entidadId: evaluacionId, nombre: texto(antes?.nombreProyecto), detalle: `Puntaje ${antes?.puntajeFinal ?? '—'}` });
}

export async function addProyectoMaestro(data: Omit<ProyectoMaestro, 'id' | 'correlativo' | 'codigoProyecto'>): Promise<string> {
  const id = await addProyectoMaestroSinRegistro(data);
  registrarCambio({ accion: 'Creó', entidad: 'Proyecto', entidadId: id, nombre: data.nombre });
  return id;
}
export async function updateProyectoMaestro(id: string, data: Partial<ProyectoMaestro>): Promise<void> {
  const antes = await leerDatos('proyectos', id);
  await updateProyectoMaestroSinRegistro(id, data);
  registrarCambio({ accion: 'Modificó', entidad: 'Proyecto', entidadId: id, nombre: texto(antes?.nombre) || data.nombre, cambios: diferencias(antes, data as Record<string, unknown>) });
}
export async function deleteProyectoMaestro(id: string): Promise<void> {
  const antes = await leerDatos('proyectos', id);
  await deleteProyectoMaestroSinRegistro(id);
  registrarCambio({ accion: 'Eliminó', entidad: 'Proyecto', entidadId: id, nombre: texto(antes?.nombre), detalle: texto(antes?.codigoProyecto) });
}

export async function addLicitacion(data: Omit<LicitacionProyecto, 'id'>): Promise<string> {
  const id = await addLicitacionSinRegistro(data);
  registrarCambio({ accion: 'Creó', entidad: 'Licitación', entidadId: id, licitacionId: id, nombre: data.nombreProyecto, detalle: data.codigoProyecto });
  return id;
}
export async function updateLicitacion(id: string, data: Partial<LicitacionProyecto>): Promise<void> {
  const antes = await leerDatos('licitaciones', id);
  await updateLicitacionSinRegistro(id, data);
  registrarCambio({ accion: 'Modificó', entidad: 'Licitación', entidadId: id, licitacionId: id, nombre: texto(antes?.nombreProyecto) || data.nombreProyecto, cambios: diferencias(antes, data as Record<string, unknown>) });
}
export async function deleteLicitacion(id: string): Promise<void> {
  const antes = await leerDatos('licitaciones', id);
  await deleteLicitacionSinRegistro(id);
  registrarCambio({ accion: 'Eliminó', entidad: 'Licitación', entidadId: id, licitacionId: id, nombre: texto(antes?.nombreProyecto), detalle: texto(antes?.codigoProyecto) });
}

export async function addInvitado(licitacionId: string, data: Omit<InvitadoLicitacion, 'id'>): Promise<void> {
  await addInvitadoSinRegistro(licitacionId, data);
  registrarCambio({ accion: 'Invitó', entidad: 'Invitado', entidadId: data.proveedorId, licitacionId, nombre: data.proveedorNombre });
}

export async function responderConsulta(licitacionId: string, consulta: ConsultaLicitacion, respuesta: string, numeroNuevo: number, respondidaPorEmail: string): Promise<void> {
  await responderConsultaSinRegistro(licitacionId, consulta, respuesta, numeroNuevo, respondidaPorEmail);
  registrarCambio({ accion: 'Respondió', entidad: 'Consulta', entidadId: consulta.id, licitacionId, nombre: `Consulta de ${consulta.proveedorNombre}`, cambios: { respuesta: { despues: respuesta.slice(0, 160) } } });
}

export async function addCotizacion(data: Omit<Cotizacion, 'id' | 'fechaCarga'>): Promise<string> {
  const id = await addCotizacionSinRegistro(data);
  registrarCambio({ accion: 'Creó', entidad: 'Cotización', entidadId: id, licitacionId: data.licitacionId, nombre: data.proveedorNombre, detalle: `Total ${pesos(data.montoTotal)} · ${data.plazoDias} días` });
  return id;
}
export async function deleteCotizacion(id: string): Promise<void> {
  const antes = await leerDatos('cotizaciones', id);
  await deleteCotizacionSinRegistro(id);
  registrarCambio({ accion: 'Eliminó', entidad: 'Cotización', entidadId: id, licitacionId: texto(antes?.licitacionId), nombre: texto(antes?.proveedorNombre), detalle: antes ? `Total ${pesos(antes.montoTotal)}` : undefined });
}

export async function addEstadoPago(licitacionId: string, data: Omit<EstadoPago, 'id' | 'licitacionId' | 'numero'>): Promise<{ id: string; numero: number }> {
  const res = await addEstadoPagoSinRegistro(licitacionId, data);
  registrarCambio({ accion: 'Creó', entidad: 'Estado de pago', entidadId: res.id, licitacionId, nombre: `EP N° ${res.numero} · ${data.proveedorNombre}`, detalle: `Total ${pesos(data.montoTotal)} · avance ${data.porcentajeAvanceGlobal}%` });
  return res;
}
export async function updateEstadoPago(licitacionId: string, estadoPagoId: string, data: Partial<EstadoPago>): Promise<void> {
  const antes = await leerDatos('licitaciones', licitacionId, 'estadosPago', estadoPagoId);
  await updateEstadoPagoSinRegistro(licitacionId, estadoPagoId, data);
  registrarCambio({ accion: 'Modificó', entidad: 'Estado de pago', entidadId: estadoPagoId, licitacionId, nombre: antes ? `EP N° ${antes.numero}` : undefined, cambios: diferencias(antes, data as Record<string, unknown>) });
}
export async function addAumentoObra(licitacionId: string, data: Omit<AumentoObra, 'id' | 'licitacionId' | 'numero'>): Promise<string> {
  const id = await addAumentoObraSinRegistro(licitacionId, data);
  registrarCambio({ accion: 'Creó', entidad: 'Aumento de obra', entidadId: id, licitacionId, nombre: data.titulo, detalle: `Total ${pesos(data.montoTotal)} · +${data.ampliacionPlazoDias} días` });
  return id;
}
export async function updateAumentoObraEstado(licitacionId: string, aumentoId: string, estado: AumentoObra['estado'], aprobadoPor?: string): Promise<void> {
  const antes = await leerDatos('licitaciones', licitacionId, 'aumentosObra', aumentoId);
  await updateAumentoObraEstadoSinRegistro(licitacionId, aumentoId, estado, aprobadoPor);
  registrarCambio({ accion: 'Modificó', entidad: 'Aumento de obra', entidadId: aumentoId, licitacionId, nombre: texto(antes?.titulo), cambios: { estado: { antes: texto(antes?.estado), despues: estado } } });
}

export async function adjudicarLicitacion(params: Parameters<typeof adjudicarLicitacionSinRegistro>[0]): Promise<void> {
  await adjudicarLicitacionSinRegistro(params);
  const ganadora = params.cotizaciones.find(c => c.proveedorId === params.proveedorGanadorId);
  registrarCambio({
    accion: 'Adjudicó', entidad: 'Licitación', entidadId: params.licitacionId, licitacionId: params.licitacionId, nombre: params.nombreProyecto,
    detalle: `A ${ganadora?.proveedorNombre || params.proveedorGanadorId}${ganadora ? ` por ${pesos(ganadora.montoTotal)}` : ''}. Justificación: ${params.justificacion.slice(0, 200)}`,
  });
}

export async function addGarantia(licitacionId: string, data: Omit<GarantiaLicitacion, 'id'>): Promise<string> {
  const id = await addGarantiaSinRegistro(licitacionId, data);
  registrarCambio({ accion: 'Creó', entidad: 'Garantía', entidadId: id, licitacionId, nombre: `${data.instrumento} N° ${data.numero}`, detalle: `${data.tipo} · ${data.moneda === 'UF' ? `UF ${data.monto}` : pesos(data.monto)} · vence ${data.fechaVencimiento}` });
  return id;
}
export async function updateGarantia(licitacionId: string, garantiaId: string, data: Partial<GarantiaLicitacion>): Promise<void> {
  const antes = await leerDatos('licitaciones', licitacionId, 'garantias', garantiaId);
  await updateGarantiaSinRegistro(licitacionId, garantiaId, data);
  registrarCambio({ accion: 'Modificó', entidad: 'Garantía', entidadId: garantiaId, licitacionId, nombre: antes ? `${antes.instrumento} N° ${antes.numero}` : undefined, cambios: diferencias(antes, data as Record<string, unknown>) });
}
export async function deleteGarantia(licitacionId: string, garantiaId: string): Promise<void> {
  const antes = await leerDatos('licitaciones', licitacionId, 'garantias', garantiaId);
  await deleteGarantiaSinRegistro(licitacionId, garantiaId);
  registrarCambio({ accion: 'Eliminó', entidad: 'Garantía', entidadId: garantiaId, licitacionId, nombre: antes ? `${antes.instrumento} N° ${antes.numero}` : undefined, detalle: antes ? `${antes.moneda === 'UF' ? `UF ${antes.monto}` : pesos(antes.monto)} · vence ${antes.fechaVencimiento}` : undefined });
}

export async function addMulta(licitacionId: string, data: Omit<MultaObra, 'id'>): Promise<string> {
  const id = await addMultaSinRegistro(licitacionId, data);
  registrarCambio({ accion: 'Creó', entidad: 'Multa', entidadId: id, licitacionId, nombre: `${data.estado}: ${data.dias} días`, detalle: data.estado === 'Aplicada' ? `Monto ${pesos(data.monto)}` : data.justificacion });
  return id;
}
export async function updateMulta(licitacionId: string, multaId: string, data: Partial<MultaObra>): Promise<void> {
  const antes = await leerDatos('licitaciones', licitacionId, 'multas', multaId);
  await updateMultaSinRegistro(licitacionId, multaId, data);
  registrarCambio({ accion: 'Modificó', entidad: 'Multa', entidadId: multaId, licitacionId, nombre: antes ? `Multa ${antes.desde} al ${antes.hasta}` : undefined, cambios: diferencias(antes, data as Record<string, unknown>) });
}

export async function publicarAclaracion(licitacionId: string, data: Omit<AclaracionLicitacion, 'id' | 'numero'>): Promise<number> {
  const numero = await publicarAclaracionSinRegistro(licitacionId, data);
  registrarCambio({ accion: 'Publicó', entidad: 'Aclaración', entidadId: `${licitacionId}-${numero}`, licitacionId, nombre: `Aclaración N° ${numero}: ${data.titulo}`, detalle: data.cambioCierre ? `Cierre ${data.cambioCierre.fechaAnterior} → ${data.cambioCierre.fechaNueva}` : undefined });
  return numero;
}

// ═══════════════════════════════════════════════════════════════════
// INSCRIPCIÓN DE PROVEEDORES POR INVITACIÓN (inscripcionesProveedores/{código})
// El código del enlace personal es el id del documento: sin él no se puede leer ni completar la inscripción.
// ═══════════════════════════════════════════════════════════════════

export async function crearInvitacionInscripcion(razonSocial: string, email: string, invitadaPor: string): Promise<string> {
  const codigo = generarTokenAcceso();
  await setDoc(doc(db, 'inscripcionesProveedores', codigo), {
    razonSocialInvitada: razonSocial.trim(),
    emailInvitado: email.trim().toLowerCase(),
    invitadaPor,
    fechaInvitacion: new Date().toISOString(),
    estado: 'Invitada',
  });
  registrarCambio({ accion: 'Invitó', entidad: 'Proveedor', entidadId: codigo, nombre: razonSocial.trim(), detalle: `Invitación a inscribirse para ${email.trim()}` });
  return codigo;
}

/** Página de inscripción (sin sesión): lee solo SU inscripción, por el código del enlace. */
export async function getInscripcion(codigo: string): Promise<InscripcionProveedor | null> {
  const snap = await getDoc(doc(db, 'inscripcionesProveedores', codigo));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<InscripcionProveedor, 'id'>) } : null;
}

/** La empresa guarda su avance, o lo envía a revisión con `enviar`. */
export async function guardarInscripcion(
  codigo: string,
  data: Pick<InscripcionProveedor, 'datos' | 'documentos' | 'sustentabilidad'>,
  enviar: boolean
): Promise<void> {
  await updateDoc(doc(db, 'inscripcionesProveedores', codigo), {
    ...data,
    ...(enviar ? { estado: 'Enviada', fechaEnvio: new Date().toISOString() } : {}),
  });
}

export function subscribeToInscripciones(callback: (inscripciones: InscripcionProveedor[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'inscripcionesProveedores'), snap => {
    callback(snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<InscripcionProveedor, 'id'>) }))
      .sort((a, b) => (b.fechaEnvio || b.fechaInvitacion).localeCompare(a.fechaEnvio || a.fechaInvitacion)));
  }, err => console.warn('No se pudieron leer las inscripciones de proveedores:', err));
}

async function cambiarEstadoInscripcion(ins: InscripcionProveedor, cambios: Partial<InscripcionProveedor>, detalle: string): Promise<void> {
  await updateDoc(doc(db, 'inscripcionesProveedores', ins.id), cambios);
  registrarCambio({
    accion: 'Modificó', entidad: 'Proveedor', entidadId: ins.id, nombre: ins.datos?.razonSocial || ins.razonSocialInvitada, detalle,
    cambios: { inscripcion: { antes: ins.estado, despues: cambios.estado || ins.estado } },
  });
}

export const observarInscripcion = (ins: InscripcionProveedor, observaciones: string, por: string) =>
  cambiarEstadoInscripcion(ins, { estado: 'Observada', observaciones, revisadaPor: por, fechaRevision: new Date().toISOString() }, `Correcciones solicitadas: ${observaciones}`);

export const rechazarInscripcion = (ins: InscripcionProveedor, observaciones: string, por: string) =>
  cambiarEstadoInscripcion(ins, { estado: 'Rechazada', observaciones, revisadaPor: por, fechaRevision: new Date().toISOString() }, `Inscripción rechazada: ${observaciones}`);

export const marcarSolicitadaAdquisiciones = (ins: InscripcionProveedor, por: string) =>
  cambiarEstadoInscripcion(ins, { estado: 'Solicitada a Adquisiciones', solicitudAdquisiciones: { fecha: new Date().toISOString(), por } }, 'Solicitud de registro enviada a Adquisiciones');

export const marcarRegistradaUCT = (ins: InscripcionProveedor) =>
  cambiarEstadoInscripcion(ins, { estado: 'Registrada', fechaRegistroOficial: new Date().toISOString().slice(0, 10) }, 'Registrado en el registro oficial de proveedores de la UCT');

/** Requisitos con vigencia de 30 días: al aprobar, su vencimiento queda en la carpeta del proveedor. */
const REQUISITOS_CON_VIGENCIA = new Set(REQUISITOS_INSCRIPCION.filter(r => r.vigenciaDias).map(r => r.id));

/**
 * Adquisiciones confirmó el registro oficial: crea el proveedor en el sistema (o completa el existente con el mismo
 * RUT) con sus datos, cuenta bancaria y documentos con vencimiento, y deja la inscripción como Registrada.
 */
export async function aprobarInscripcion(ins: InscripcionProveedor, por: string, proveedorExistenteId?: string): Promise<string> {
  const d = ins.datos;
  if (!d) throw new Error('La inscripción no tiene datos.');
  const hoy = new Date().toISOString();
  const documentos: DocumentoProveedor[] = Object.entries(ins.documentos || {}).map(([req, archivo]) => {
    const requisito = REQUISITOS_INSCRIPCION.find(r => r.id === req);
    const vigencia = requisito?.vigenciaDias;
    const vence = archivo.fechaEmision && vigencia && REQUISITOS_CON_VIGENCIA.has(req)
      ? new Date(new Date(`${archivo.fechaEmision}T12:00:00`).getTime() + vigencia * 86_400_000).toISOString().slice(0, 10)
      : undefined;
    const esF30 = req === 'f30';
    return {
      id: `insc-${req}`,
      tipo: esF30 ? 'Certificado F30 (Antecedentes Laborales y Previsionales)' : 'Otro',
      ...(esF30 ? {} : { descripcion: requisito?.nombre || req }),
      ...(archivo.fechaEmision ? { fechaEmision: archivo.fechaEmision } : {}),
      ...(vence ? { fechaVencimiento: vence } : {}),
      archivoNombre: archivo.nombre,
      archivoURL: archivo.url,
      fechaCarga: archivo.fechaCarga || hoy,
      cargadoPor: `Inscripción (${d.email})`,
    };
  });
  const datosProveedor = {
    rut: d.rut, razonSocial: d.razonSocial, nombreContacto: d.nombreContacto, email: d.email, telefono: d.telefono,
    rubro: d.rubro, direccion: d.direccion, ciudad: d.ciudad,
    cuentaSustentabilidad: Boolean(ins.sustentabilidad?.declara),
    datosContrato: {
      representantes: d.representanteLegal ? [{ tratamiento: 'don' as const, nombre: d.representanteLegal, rut: d.rutRepresentante }] : [],
      domicilioLegal: [d.direccion, d.ciudad].filter(Boolean).join(', '),
      personeria: '',
      datosBancarios: d.datosBancarios,
    },
    documentos,
  };
  let proveedorId = proveedorExistenteId;
  if (proveedorId) await updateProveedor(proveedorId, datosProveedor);
  else proveedorId = await addProveedor({ ...datosProveedor, estado: 'Activo' });
  await cambiarEstadoInscripcion(ins, { estado: 'Registrada', proveedorId, revisadaPor: por, fechaRevision: hoy, fechaRegistroOficial: hoy.slice(0, 10) }, 'Adquisiciones confirmó el registro; proveedor agregado al sistema');
  return proveedorId;
}
