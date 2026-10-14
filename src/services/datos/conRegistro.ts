import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { diferencias, registrarCambio } from '../auditoriaService';
import { type Proveedor, type ProyectoMaestro, type LicitacionProyecto, type InvitadoLicitacion, type Cotizacion, type EstadoPago, type AumentoObra, type EvaluacionDesempeno, type ConsultaLicitacion, type GarantiaLicitacion, type MultaObra, type AclaracionLicitacion } from '../../types';
import { addAumentoObraSinRegistro, addCotizacionSinRegistro, addEstadoPagoSinRegistro, deleteCotizacionSinRegistro, updateAumentoObraEstadoSinRegistro, updateEstadoPagoSinRegistro } from './cotizacionesYObra';
import { addEvaluacionDesempenoSinRegistro, addProveedorSinRegistro, deleteEvaluacionDesempenoSinRegistro, deleteProveedorSinRegistro, updateEvaluacionDesempenoSinRegistro, updateProveedorSinRegistro } from './proveedores';
import { addGarantiaSinRegistro, deleteGarantiaSinRegistro, updateGarantiaSinRegistro } from './garantias';
import { addInvitadoSinRegistro } from './invitados';
import { addLicitacionSinRegistro, deleteLicitacionSinRegistro, updateLicitacionSinRegistro } from './licitaciones';
import { addMultaSinRegistro, updateMultaSinRegistro } from './multas';
import { addProyectoMaestroSinRegistro, deleteProyectoMaestroSinRegistro, updateProyectoMaestroSinRegistro } from './proyectos';
import { adjudicarLicitacionSinRegistro } from './adjudicacion';
import { publicarAclaracionSinRegistro } from './aclaraciones';
import { responderConsultaSinRegistro } from './consultas';

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
