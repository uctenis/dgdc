import type { User } from 'firebase/auth';
import type { LicitacionProyecto, EnvioInvitacion } from '../types';
import { construirInvitacionCorreo } from '../utils/invitacionCorreo';

const INVITACIONES_ENDPOINT = (import.meta.env.VITE_INVITACIONES_LICITACION_URL as string | undefined)
  || 'https://us-central1-dgdc-c848d.cloudfunctions.net/enviarInvitacionesLicitacion';

/**
 * Seguridad en pruebas: por defecto NO se envía ningún correo real a proveedores. El envío real
 * solo se activa al lanzar el sistema, con VITE_ENVIO_CORREOS_REAL=true en el ambiente de producción.
 */
export const ENVIO_CORREOS_REAL = import.meta.env.VITE_ENVIO_CORREOS_REAL === 'true';

export type ResultadoEnvioInvitaciones = Omit<EnvioInvitacion, 'id' | 'enviadoPorEmail' | 'fecha'>;

/**
 * Envía la invitación oficial de la licitación a cada proveedor invitado (correo
 * individual y personalizado, no un solo BCC), con copia al responsable del proyecto
 * y a quien se indique en `ccExtra` (ej. el subdirector), vía la Cloud Function
 * `enviarInvitacionesLicitacion` (Gmail/Workspace institucional server-side).
 * Devuelve el detalle de lo enviado (asunto, copias, mensaje por destinatario) para el historial.
 */
export async function enviarInvitacionesLicitacion(
  user: User,
  licitacion: LicitacionProyecto,
  portalUrl: string,
  ccExtra: string[] = [],
  destinatarios: { proveedorId: string; proveedorEmail: string; proveedorNombre: string; tokenAcceso?: string }[] = [],
): Promise<ResultadoEnvioInvitaciones> {
  if (!ENVIO_CORREOS_REAL) {
    console.info('[MODO PRUEBA] Envío de invitaciones simulado: no se envió ningún correo.', { licitacionId: licitacion.id, portalUrl, ccExtra });
    const cc = [licitacion.responsableEmail, ...ccExtra].filter((e): e is string => Boolean(e));
    let asunto = '';
    const detalle = destinatarios.map(d => {
      // Cada proveedor recibe SU enlace personal (con su código secreto).
      const enlacePersonal = d.tokenAcceso ? `${portalUrl}?t=${d.tokenAcceso}` : portalUrl;
      const correo = construirInvitacionCorreo(licitacion, enlacePersonal, d.proveedorNombre);
      asunto = correo.asunto;
      return { proveedorId: d.proveedorId, proveedorNombre: d.proveedorNombre, email: d.proveedorEmail, enviado: true, html: correo.html };
    });
    return { modo: 'prueba', asunto, cc, portalUrl, destinatarios: detalle };
  }

  const response = await fetch(INVITACIONES_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ licitacionId: licitacion.id, portalUrl, ccExtra }),
  });
  const payload = await response.json().catch(() => ({})) as {
    resultados?: { proveedorId: string; proveedorNombre?: string; email: string; enviado: boolean; error?: string; html?: string }[];
    asunto?: string;
    cc?: string[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || `No fue posible enviar las invitaciones (HTTP ${response.status}).`);
  }
  return {
    modo: 'real',
    asunto: payload.asunto || '',
    cc: payload.cc || [],
    portalUrl,
    destinatarios: (payload.resultados || []).map(r => ({
      proveedorId: r.proveedorId,
      proveedorNombre: r.proveedorNombre || '',
      email: r.email,
      enviado: r.enviado,
      ...(r.error ? { error: r.error } : {}),
      html: r.html || '',
    })),
  };
}
