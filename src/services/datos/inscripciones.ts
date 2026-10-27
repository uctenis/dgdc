import { collection, doc, updateDoc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { registrarCambio } from '../auditoriaService';
import { REQUISITOS_INSCRIPCION } from '../../data/inscripcionProveedores';
import { type InscripcionProveedor, type DocumentoProveedor } from '../../types';
import { addProveedor, updateProveedor } from './conRegistro';
import { generarTokenAcceso } from './invitados';

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
