import { INITIAL_CONFIG_FIRMAS } from '../data/initialData';
import { getResponsablesList, ALIAS_CORREOS_INSTITUCIONALES } from '../data/responsablesData';
import { storageService } from './storageService';

export { SYSTEM_ADMIN_EMAIL } from '../lib/adminSistema';
import { SYSTEM_ADMIN_EMAIL } from '../lib/adminSistema';

export type InternalRole = 'admin' | 'director' | 'subdirector' | 'responsable' | 'secretaria';

/**
 * Secretaría de la Dirección: toma las actas de adjudicación firmadas, las ingresa en Kellun
 * (sistema institucional, fuera de este) y registra aquí el N° de Orden de Pedido (OP) que Kellun
 * le entrega. Solo ve la bandeja de Solicitudes de OP; no tiene permisos de administración.
 */
export const SECRETARIA_OP = {
  email: 'mbustos@uct.cl',
  nombre: 'Marioly Bustos',
  cargo: 'Secretaria · Dirección de Gestión y Desarrollo de Campus',
};

export interface InternalAccess {
  email: string;
  nombre: string;
  cargo: string;
  role: InternalRole;
}

const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase();

export function getInternalAccess(email?: string | null): InternalAccess | null {
  const correoCuenta = normalizeEmail(email);
  const normalized = ALIAS_CORREOS_INSTITUCIONALES[correoCuenta] || correoCuenta;
  if (!normalized || !normalized.endsWith('@uct.cl')) return null;

  const configured = (() => {
    try { return storageService.getConfigFirmas(); } catch { return INITIAL_CONFIG_FIRMAS; }
  })();

  if (normalized === SYSTEM_ADMIN_EMAIL) {
    return {
      email: normalized,
      nombre: configured.subdirectorInfraestructura.nombre || 'David Silva Roco',
      cargo: 'Administrador del sistema',
      role: 'admin',
    };
  }

  if (normalized === SECRETARIA_OP.email) {
    return { email: normalized, nombre: SECRETARIA_OP.nombre, cargo: SECRETARIA_OP.cargo, role: 'secretaria' };
  }

  const director = configured.directorGestionCampus;
  if (normalizeEmail(director.email) === normalized) {
    return { email: normalized, nombre: director.nombre, cargo: director.cargo, role: 'director' };
  }

  const subdirector = configured.subdirectorInfraestructura;
  if (normalizeEmail(subdirector.email) === normalized) {
    return { email: normalized, nombre: subdirector.nombre, cargo: subdirector.cargo, role: 'subdirector' };
  }

  const responsable = getResponsablesList().find(item =>
    item.estado !== 'Inactivo' && normalizeEmail(item.email) === normalized
  );
  if (responsable) {
    return {
      email: normalized,
      nombre: responsable.nombre,
      cargo: responsable.cargo || 'Responsable de proyecto',
      role: 'responsable',
    };
  }

  const responsableGeneral = configured.responsableDesarrollo;
  if (normalizeEmail(responsableGeneral.email) === normalized) {
    return {
      email: normalized,
      nombre: responsableGeneral.nombre,
      cargo: responsableGeneral.cargo,
      role: 'responsable',
    };
  }

  // Fallback para entorno local/desarrollo: permitir cualquier @uct.cl como admin
  if (import.meta.env.DEV) {
    return {
      email: normalized,
      nombre: 'Usuario Local (Desarrollo)',
      cargo: 'Administrador Local',
      role: 'admin',
    };
  }

  return null;
}

export function isProjectResponsible(email: string | null | undefined, responsibleEmail?: string): boolean {
  return Boolean(normalizeEmail(email) && normalizeEmail(email) === normalizeEmail(responsibleEmail));
}
