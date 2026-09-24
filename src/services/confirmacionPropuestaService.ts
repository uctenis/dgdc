import type { User } from 'firebase/auth';
import type { LicitacionProyecto, Propuesta } from '../types';
import { ENVIO_CORREOS_REAL } from './invitacionService';
import { construirConfirmacionPropuesta } from '../utils/confirmacionPropuesta';

const CONFIRMACION_ENDPOINT = (import.meta.env.VITE_CONFIRMACION_PROPUESTA_URL as string | undefined)
  || 'https://us-central1-dgdc-c848d.cloudfunctions.net/confirmarPropuestaEnviada';

export interface ResultadoConfirmacion {
  modo: 'real' | 'prueba';
  fecha: string;
  email: string;
  asunto: string;
  html?: string;
}

/**
 * Confirma por correo al proveedor que su oferta fue recibida. Respeta el modo prueba: sin
 * VITE_ENVIO_CORREOS_REAL=true no se envía ningún correo real; se devuelve lo que se habría enviado.
 */
export async function enviarConfirmacionPropuesta(
  user: User,
  licitacion: LicitacionProyecto,
  propuesta: Partial<Propuesta>,
  proveedorNombre: string,
  emailDestino: string,
): Promise<ResultadoConfirmacion> {
  if (!ENVIO_CORREOS_REAL) {
    const { asunto, html } = construirConfirmacionPropuesta(licitacion, propuesta, proveedorNombre);
    console.info('[MODO PRUEBA] Confirmación de oferta simulada: no se envió ningún correo.', { emailDestino, asunto });
    return { modo: 'prueba', fecha: new Date().toISOString(), email: emailDestino, asunto, html };
  }

  const response = await fetch(CONFIRMACION_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ licitacionId: licitacion.id }),
  });
  const payload = await response.json().catch(() => ({})) as { email?: string; asunto?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || `No fue posible enviar la confirmación (HTTP ${response.status}).`);
  return { modo: 'real', fecha: new Date().toISOString(), email: payload.email || emailDestino, asunto: payload.asunto || '' };
}
