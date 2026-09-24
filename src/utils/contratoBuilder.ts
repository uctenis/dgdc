import type { ProyectoMaestro, LicitacionProyecto, Cotizacion, DatosContratista } from '../types';
import { aplicarDatosAPlantilla, type ModalidadContrato } from '../data/basesTemplateData';
import {
  getPlantillaContratoObraCivil,
  resolverNotaModalidadPrecio,
  resolverTextosGarantias,
  PARAMETROS_CONTRATO,
  REPRESENTANTE_UNIVERSIDAD,
  type SeccionContrato,
} from '../data/contratoTemplateData';
import { montoEnPalabras, numeroEnPalabras } from './numeroEnPalabras';
import { textoRepresentantes, faltantesDatosContratista } from './datosContratista';
import { formatoMonedaCLP } from '../services/evaluationEngine';

export interface EntradaContrato {
  proyecto: ProyectoMaestro;
  licitacion?: LicitacionProyecto;
  cotizacion?: Cotizacion;
  proveedorNombre: string;
  proveedorRut: string;
  datosContratista?: DatosContratista | null;
  /** AAAA-MM-DD */
  fechaContrato: string;
  /** AAAA-MM-DD ('' si aún no se define) */
  fechaInicioObra: string;
  modalidad: ModalidadContrato;
}

/** Suma días corridos a una fecha (YYYY-MM-DD) sin desfases de zona horaria. */
export function sumarDiasCorridos(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, (m || 1) - 1, d || 1);
  fecha.setDate(fecha.getDate() + dias);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

export function formatearFechaLarga(fechaISO: string): string {
  if (!fechaISO) return '[por definir]';
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatearFechaCorta(fechaISO: string): string {
  if (!fechaISO) return '[por definir]';
  const [y, m, d] = fechaISO.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** Fecha (AAAA-MM-DD) en que quedó firmada el acta de adjudicación, si ya lo está. */
export function fechaActaAdjudicacion(lic?: LicitacionProyecto): string {
  const acta = lic?.actaFirmaDigital;
  if (!acta || acta.estado !== 'Firmada') return '';
  const ultima = acta.firmas.map(f => f.fecha).filter(Boolean).sort().pop();
  return ultima ? ultima.slice(0, 10) : '';
}

const plazoDe = (e: EntradaContrato) =>
  e.proyecto.plazoEjecucionDias || e.licitacion?.plazoAdjudicadoDias || e.proyecto.duracionEstimadaDias || 0;

const montoDe = (e: EntradaContrato) =>
  e.licitacion?.montoAdjudicadoTotal || e.cotizacion?.montoTotal || e.proyecto.montoAdjudicado || 0;

function textoProgramaObra(e: EntradaContrato): string {
  const programa = e.proyecto.programaTrabajo;
  if (!programa || programa.fases.length === 0) {
    return '[Adjunte el Programa de Obra con Ruta Crítica e identificación de Hitos: aún no hay un Programa de Trabajo generado para este proyecto.]';
  }
  const inicio = e.fechaInicioObra;
  const fecha = (dias: number) => (inicio ? formatearFechaCorta(sumarDiasCorridos(inicio, dias)) : '');
  const lineas = programa.fases.map(f =>
    `${f.fase} — día ${f.diaInicio} al día ${f.diaTermino}${inicio ? ` (${fecha(f.diaInicio)} al ${fecha(f.diaTermino)})` : ''}`);
  return `Plazo total: ${programa.duracionTotalDias} días corridos${inicio ? `, desde el ${formatearFechaCorta(inicio)}` : ''}.\n\n${lineas.join('\n')}\n\nPrograma referencial de la Universidad; el Programa de Obra con Ruta Crítica del PRESTADOR (Carta Gantt) se adjunta como parte integral de este Anexo.`;
}

function tablaPresupuestoOficial(c?: Cotizacion): string[][] | undefined {
  if (!c?.itemizado || c.itemizado.length === 0) return undefined;
  const n = (v: number) => new Intl.NumberFormat('es-CL').format(v);
  const filas = c.itemizado.map(p => [p.item, p.descripcion, p.unidad, n(p.cantidad), `$ ${n(p.precioUnitario)}`, `$ ${n(p.precioTotal)}`]);
  return [
    ['Item', 'Descripción', 'Un', 'Cantidad', 'P. Unitario', 'Total'],
    ...filas,
    ['', '', '', '', 'NETO', `$ ${n(c.montoNeto)}`],
    ['', '', '', '', 'IVA', `$ ${n(c.montoIva)}`],
    ['', '', '', '', 'TOTAL', `$ ${n(c.montoTotal)}`],
  ];
}

/** Arma el borrador completo (comparecencia, 21 cláusulas y Anexos 1 a 4) con los datos de la adjudicación. */
export function construirContrato(e: EntradaContrato): SeccionContrato[] {
  const p = PARAMETROS_CONTRATO;
  const monto = montoDe(e);
  const plazo = plazoDe(e);
  const garantias = resolverTextosGarantias(e.proyecto.politicaGarantias, monto);
  const reps = e.datosContratista;
  const repsValidos = (reps?.representantes || []).filter(r => r.nombre.trim() && r.rut.trim());
  const fechaAdj = fechaActaAdjudicacion(e.licitacion);
  const nombreProyecto = e.proyecto.nombre || '';
  const modalidadMinus = e.modalidad.toLowerCase();

  const personeriaContratista = repsValidos.length
    ? `La personería de ${textoRepresentantes(reps)} para firmar en representación de ${e.proveedorNombre.toUpperCase()}, ${reps?.personeria?.trim() || '[personería: complete los datos del contratista]'}`
    : '[La personería de los representantes del PRESTADOR: complete los datos del contratista.]';

  const datos: Record<string, string> = {
    fechaContrato: formatearFechaLarga(e.fechaContrato).replace(/ de (\d{4})$/, ' del $1'),
    fechaContratoCorta: formatearFechaCorta(e.fechaContrato),
    fechaInicioCorta: e.fechaInicioObra ? formatearFechaCorta(e.fechaInicioObra) : '[por definir]',
    fechaAdjudicacion: fechaAdj ? formatearFechaCorta(fechaAdj) : '[fecha de adjudicación]',
    referenciaActa: fechaAdj ? ` de fecha ${formatearFechaLarga(fechaAdj)}` : '',
    rectoraTratamiento: REPRESENTANTE_UNIVERSIDAD.tratamiento,
    rectoraNombre: REPRESENTANTE_UNIVERSIDAD.nombre,
    rectoraNombreMayus: REPRESENTANTE_UNIVERSIDAD.nombre.toUpperCase(),
    rectoraRut: REPRESENTANTE_UNIVERSIDAD.rut,
    rectoraPersoneria: REPRESENTANTE_UNIVERSIDAD.personeria,
    proveedorNombre: e.proveedorNombre,
    proveedorNombreMayus: (e.proveedorNombre || '[Razón social del proveedor]').toUpperCase(),
    proveedorRut: e.proveedorRut || '[RUT del proveedor]',
    proveedorRepresentantes: textoRepresentantes(reps),
    proveedorDomicilio: reps?.domicilioLegal?.trim() || '[domicilio legal del proveedor]',
    personeriaContratista,
    modalidadMinus,
    nombreProyecto,
    nombreProyectoMayus: nombreProyecto.toUpperCase(),
    descripcionProyecto: e.proyecto.descripcion?.trim() || 'Sin detalle adicional declarado en la Cartera de Proyectos.',
    montoAdjudicado: formatoMonedaCLP(monto),
    montoEnPalabras: monto > 0 ? montoEnPalabras(monto) : '[monto en palabras]',
    notaModalidadPrecio: resolverNotaModalidadPrecio(e.modalidad),
    plazoDias: plazo ? String(plazo) : '[definir]',
    multaDiariaPct: p.multaDiariaPct,
    topeMultasPct: String(p.topeMultasPct),
    topeMultasTexto: numeroEnPalabras(p.topeMultasPct),
    diasResolucionPorAtraso: String(p.diasResolucionPorAtraso),
    diasResolucionTexto: numeroEnPalabras(p.diasResolucionPorAtraso),
    diasHabilesMedicion: String(p.diasHabilesMedicion),
    diasFacturacionTexto: numeroEnPalabras(p.diasFacturacion).toUpperCase(),
    diasRevisionEstadoPago: String(p.diasRevisionEstadoPago),
    anticipoPct: String(p.anticipoPct),
    restoPct: String(100 - p.anticipoPct),
    garantias91: garantias.garantias91,
    texto92: garantias.texto92,
    caucionPostVenta: garantias.caucionPostVenta,
    texto104: garantias.texto104,
    postVentaDias: String(p.postVentaDias),
    diasInspeccionRecepcion: String(p.diasInspeccionRecepcion),
    diasSubsanacion: String(p.diasSubsanacion),
    recargoEjecucionDirectaPct: String(p.recargoEjecucionDirectaPct),
    atrasoParcialPct: String(p.atrasoParcialPct),
    programaObra: textoProgramaObra(e),
    notaAnexo1: e.cotizacion
      ? `Presupuesto de la oferta adjudicada de ${e.proveedorNombre}${e.cotizacion.fechaCotizacion ? ` (cotización del ${formatearFechaCorta(e.cotizacion.fechaCotizacion)})` : ''}, reconocido como Presupuesto Oficial a partir de la firma de este contrato.`
      : '[Adjunte el Presupuesto Oficial: no se encontró la cotización adjudicada de este proyecto.]',
  };

  const tabla = tablaPresupuestoOficial(e.cotizacion);
  return getPlantillaContratoObraCivil().map(s => ({
    ...s,
    contenido: aplicarDatosAPlantilla(s.contenido, datos),
    ...(s.id === 'anexo1' && tabla ? { tabla } : {}),
  }));
}

/** Lo que aún falta para que el borrador quede completo (se muestra al administrador). */
export function faltantesContrato(e: EntradaContrato): string[] {
  const faltan = faltantesDatosContratista(e.datosContratista).map(f => `Contratista: ${f}`);
  if (!e.fechaInicioObra) faltan.push('Fecha de inicio de obra');
  if (!plazoDe(e)) faltan.push('Plazo de ejecución');
  if (!montoDe(e)) faltan.push('Monto adjudicado');
  if (!e.cotizacion?.itemizado?.length) faltan.push('Presupuesto Oficial (Anexo 1): no se encontró la oferta adjudicada con su itemizado');
  if (!e.proyecto.programaTrabajo?.fases?.length) faltan.push('Programa de Obra (Anexo 2): genere el Programa de Trabajo o adjunte la Carta Gantt del prestador');
  if (!fechaActaAdjudicacion(e.licitacion)) faltan.push('Acta de adjudicación firmada (fecha de adjudicación)');
  return faltan;
}
