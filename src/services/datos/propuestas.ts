import { collection, doc, updateDoc, getDocs, getDoc, onSnapshot, serverTimestamp, query, where, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type Proveedor, type ProyectoMaestro, type LicitacionProyecto, type Cotizacion, type Propuesta } from '../../types';
import { addCotizacion } from './conRegistro';
import { getProveedorPorId } from './proveedores';
import { validarPlazoEntregaVigente, validarRecepcionOfertasAbierta } from './cotizacionesYObra';

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
