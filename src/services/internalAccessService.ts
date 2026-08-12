import { INITIAL_CONFIG_FIRMAS } from '../data/initialData';
import { getResponsablesList } from '../data/responsablesData';
import { storageService } from './storageService';

export const SYSTEM_ADMIN_EMAIL = 'dsilva@uct.cl';

export type InternalRole = 'admin' | 'director' | 'subdirector' | 'responsable';

export interface InternalAccess {
  email: string;
  nombre: string;
  cargo: string;
  role: InternalRole;
}

const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase();

export function getInternalAccess(email?: string | null): InternalAccess | null {
  const normalized = normalizeEmail(email);
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
