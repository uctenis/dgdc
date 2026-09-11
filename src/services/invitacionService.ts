import type { User } from 'firebase/auth';

const INVITACIONES_ENDPOINT = (import.meta.env.VITE_INVITACIONES_LICITACION_URL as string | undefined)
  || 'https://us-central1-dgdc-c848d.cloudfunctions.net/enviarInvitacionesLicitacion';

export interface ResultadoInvitacion {
  proveedorId: string;
  email: string;
  enviado: boolean;
  error?: string;
}

/**
 * Envía la invitación oficial de la licitación a cada proveedor invitado (correo
 * individual y personalizado, no un solo BCC), con copia al responsable del proyecto
 * y a quien se indique en `ccExtra` (ej. el subdirector), vía la Cloud Function
 * `enviarInvitacionesLicitacion` (Gmail/Workspace institucional server-side).
 */
export async function enviarInvitacionesLicitacion(
  user: User,
  licitacionId: string,
  portalUrl: string,
  ccExtra: string[] = [],
): Promise<ResultadoInvitacion[]> {
  const response = await fetch(INVITACIONES_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ licitacionId, portalUrl, ccExtra }),
  });
  const payload = await response.json().catch(() => ({})) as { resultados?: ResultadoInvitacion[]; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `No fue posible enviar las invitaciones (HTTP ${response.status}).`);
  }
  return payload.resultados || [];
}
