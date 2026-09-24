import type { Proveedor } from '../types';
import { validarRUT } from './rutUtils';

/**
 * Datos esenciales de un proveedor que faltan para poder invitarlo, adjudicarle y pagarle:
 * identificación (RUT, razón social), contacto (correo), rubro y cuenta bancaria para los pagos.
 * Lista vacía = ficha completa.
 */
export function datosEsencialesFaltantes(p: Proveedor): string[] {
  const faltan: string[] = [];
  const rut = (p.rut || '').replace(/[^0-9kK]/g, '');
  if (rut.length < 7) faltan.push('RUT');
  else if (!validarRUT(p.rut)) faltan.push('RUT válido (dígito verificador incorrecto)');
  if (!(p.razonSocial || '').trim()) faltan.push('razón social');
  if (!(p.email || '').includes('@')) faltan.push('correo');
  if (!(p.rubro || '').trim()) faltan.push('rubro');
  const banco = p.datosContrato?.datosBancarios;
  if (!banco?.banco?.trim() || !banco?.numeroCuenta?.trim()) faltan.push('cuenta bancaria');
  return faltan;
}
