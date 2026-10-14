import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, onSnapshot, serverTimestamp, query, orderBy, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { normalizarNombreProyecto } from '../../utils/spellCorrector';
import { fechaLimiteOfertas } from '../../utils/plazoOfertas';
import { type LicitacionProyecto, type EstadoPago } from '../../types';

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

export async function addLicitacionSinRegistro(
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

export async function updateLicitacionSinRegistro(
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

export async function deleteLicitacionSinRegistro(id: string): Promise<void> {
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
