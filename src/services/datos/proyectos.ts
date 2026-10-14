import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, onSnapshot, serverTimestamp, query, orderBy, where, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { registrarCambio } from '../auditoriaService';
import { ANIO_CARTERA_INICIAL, anioDeCartera, compararConBaseAjuste, decisionDeCartera, partidasParaComparar, type DecisionCartera } from '../../utils/carteraAnual';
import { normalizarNombreProyecto } from '../../utils/spellCorrector';
import { construirSeccionesBasesDesdeCero, CAMPOS_QUE_AFECTAN_BASES } from '../../utils/basesGenerator';
import { type ProyectoMaestro, type RevisionCarteraEntrada, type LicitacionProyecto, type EstadoPago } from '../../types';

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

export async function addProyectoMaestroSinRegistro(
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

export async function updateProyectoMaestroSinRegistro(
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

export async function deleteProyectoMaestroSinRegistro(id: string): Promise<void> {
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
