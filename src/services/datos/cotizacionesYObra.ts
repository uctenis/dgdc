import { collection, doc, addDoc, updateDoc, getDocs, getDoc, onSnapshot, serverTimestamp, query, orderBy, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { plazoOfertasVencido, textoLimiteOfertas } from '../../utils/plazoOfertas';
import { type LicitacionProyecto, type Cotizacion, type EstadoPago, type AumentoObra, type HitoDesarrolloProyecto } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// COTIZACIONES (Firestore)
// ═══════════════════════════════════════════════════════════════════

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

export function validarRecepcionOfertasAbierta(
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
function plazoEntregaVencido(data: Pick<LicitacionProyecto, 'fechaEntregaPropuestas' | 'fechaEvaluacion' | 'horaLimiteOfertas'>): boolean {
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
export function validarPlazoEntregaVigente(
  licitacionSnap: { exists: () => boolean; data: () => unknown }
): void {
  const data = licitacionSnap.data() as Partial<LicitacionProyecto>;
  const campos = data as Pick<LicitacionProyecto, 'fechaEntregaPropuestas' | 'fechaEvaluacion' | 'horaLimiteOfertas'>;
  if (plazoEntregaVencido(campos)) {
    throw new Error(`PLAZO_VENCIDO: La recepción de ofertas se cerró el ${textoLimiteOfertas(campos)}. No se pueden enviar ni modificar propuestas después del cierre.`);
  }
}

export async function addCotizacionSinRegistro(data: Omit<Cotizacion, 'id' | 'fechaCarga'>): Promise<string> {
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

export async function deleteCotizacionSinRegistro(id: string): Promise<void> {
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

export async function addEstadoPagoSinRegistro(
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

export async function updateEstadoPagoSinRegistro(
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

export async function addAumentoObraSinRegistro(
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

export async function updateAumentoObraEstadoSinRegistro(
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
