import type { User } from 'firebase/auth';

const API_URL = (import.meta.env.VITE_ADOBE_SIGN_API_URL as string | undefined)?.replace(/\/$/, '');

export type AdobeAgreementStatus =
  | 'DRAFT'
  | 'AUTHORING'
  | 'OUT_FOR_SIGNATURE'
  | 'SIGNED'
  | 'APPROVED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'ARCHIVED'
  | 'UNKNOWN';

export interface AdobeSignerInput {
  email: string;
  nombre: string;
  cargo: string;
  rolFirma: 'director' | 'subdirector' | 'responsable' | 'vrae';
}

export interface AdobeAgreementResponse {
  agreementId: string;
  status: AdobeAgreementStatus;
  signingUrl?: string;
}

export function esEstadoAdobeFirmado(status: AdobeAgreementStatus): boolean {
  return status === 'SIGNED' || status === 'APPROVED';
}

function requireApiUrl(): string {
  if (!API_URL) {
    throw new Error('Falta configurar VITE_ADOBE_SIGN_API_URL para conectar Acrobat Sign.');
  }
  return API_URL;
}

async function authenticatedFetch(user: User, path: string, init?: RequestInit): Promise<Response> {
  const token = await user.getIdToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${requireApiUrl()}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Acrobat Sign respondió con HTTP ${response.status}.`);
  }
  return response;
}

export async function crearAcuerdoAdobeSign(
  user: User,
  file: File,
  nombre: string,
  signers: AdobeSignerInput[],
  projectId: string,
): Promise<AdobeAgreementResponse> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('name', nombre);
  form.append('signers', JSON.stringify(signers));
  form.append('projectId', projectId);
  const response = await authenticatedFetch(user, '/agreements', { method: 'POST', body: form });
  return response.json() as Promise<AdobeAgreementResponse>;
}

export async function obtenerEstadoAcuerdoAdobeSign(user: User, agreementId: string): Promise<AdobeAgreementResponse> {
  const response = await authenticatedFetch(user, `/agreements/${encodeURIComponent(agreementId)}`);
  return response.json() as Promise<AdobeAgreementResponse>;
}

export async function obtenerUrlFirmaAdobeSign(user: User, agreementId: string): Promise<string> {
  const response = await authenticatedFetch(user, `/agreements/${encodeURIComponent(agreementId)}/signing-url`);
  const payload = await response.json() as { signingUrl: string };
  return payload.signingUrl;
}

export async function descargarDocumentoFirmadoAdobeSign(user: User, agreementId: string): Promise<Blob> {
  const response = await authenticatedFetch(user, `/agreements/${encodeURIComponent(agreementId)}/document`);
  return response.blob();
}

export function adobeSignConfigurado(): boolean {
  return Boolean(API_URL);
}
