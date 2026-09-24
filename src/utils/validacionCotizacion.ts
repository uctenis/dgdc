import type { Cotizacion, LicitacionProyecto } from '../types';
import { fechaLimiteOfertas, textoLimiteOfertas, formatoFechaHoraChile } from './plazoOfertas';

export interface ObservacionCotizacion {
  /** error = la oferta NO es admisible; aviso = a revisar, no impide evaluarla. */
  severidad: 'error' | 'aviso';
  mensaje: string;
}

export interface ResultadoValidacion {
  admisible: boolean;
  observaciones: ObservacionCotizacion[];
}

const TOLERANCIA = 1; // $1 por redondeos
const clp = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

/**
 * Valida una cotización antes de evaluarla: información completa y consistente, y recibida dentro del plazo
 * (fecha y hora de cierre de la licitación). Toda oferta con al menos un error queda NO admisible.
 */
export function validarCotizacion(cot: Cotizacion, lic: LicitacionProyecto): ResultadoValidacion {
  const observaciones: ObservacionCotizacion[] = [];
  const error = (mensaje: string) => observaciones.push({ severidad: 'error', mensaje });
  const aviso = (mensaje: string) => observaciones.push({ severidad: 'aviso', mensaje });

  // Oferente
  if (!cot.proveedorNombre?.trim() || !cot.proveedorRut?.trim()) error('Faltan los datos del oferente (razón social o RUT).');

  // Montos
  if (!(cot.montoNeto > 0)) {
    error('El monto neto es cero o no fue informado.');
  } else {
    const ivaEsperado = Math.round(cot.montoNeto * 0.19);
    if (Math.abs((cot.montoIva || 0) - ivaEsperado) > TOLERANCIA) error(`El IVA (${clp(cot.montoIva)}) no corresponde al 19% del neto (${clp(ivaEsperado)}).`);
    if (Math.abs((cot.montoTotal || 0) - (cot.montoNeto + (cot.montoIva || 0))) > TOLERANCIA) error('El total con IVA no coincide con neto + IVA.');
  }
  if (!(cot.plazoDias > 0)) error('No se informó el plazo de ejecución.');

  // Itemizado
  const partidas = cot.itemizado || [];
  if (partidas.length === 0) {
    error('Falta el itemizado de la oferta.');
  } else {
    const incompletas = partidas.filter(p => !p.descripcion?.trim() || !(p.cantidad > 0) || !(p.precioUnitario > 0)).length;
    if (incompletas > 0) error(`${incompletas} partida(s) sin descripción, cantidad o precio unitario.`);
    const suma = partidas.reduce((total, p) => total + (p.precioTotal || 0), 0);
    if (cot.montoNeto > 0 && Math.abs(suma - cot.montoNeto) > Math.max(TOLERANCIA, Math.round(cot.montoNeto * 0.001))) {
      error(`La suma de las partidas (${clp(suma)}) no coincide con el monto neto (${clp(cot.montoNeto)}).`);
    }
    const esperadas = lic.formatoPresupuesto?.length || 0;
    if (esperadas > 0 && partidas.length < esperadas) aviso(`Cotizó ${partidas.length} de las ${esperadas} partidas del formato de presupuesto.`);
  }

  // Documentos
  if (!cot.documentoCotizacionNombre) error('Falta el archivo de la oferta económica.');
  if (!cot.ofertaTecnicaNombre) {
    if (cot.origenPropuestaId) error('Falta la oferta técnica.');
    else aviso('No se adjuntó la oferta técnica.');
  }

  // Plazo: recibida antes del cierre (fecha y hora)
  const limite = fechaLimiteOfertas(lic);
  if (!cot.fechaRecepcion) {
    aviso('No se registró la fecha y hora de recepción: no se puede verificar el plazo.');
  } else if (limite && new Date(cot.fechaRecepcion).getTime() > limite.getTime()) {
    error(`Recibida fuera de plazo (${formatoFechaHoraChile(cot.fechaRecepcion)}); el cierre fue el ${textoLimiteOfertas(lic)}.`);
  }

  return { admisible: !observaciones.some(o => o.severidad === 'error'), observaciones };
}
