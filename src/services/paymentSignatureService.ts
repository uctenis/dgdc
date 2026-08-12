import type { User } from 'firebase/auth';

const SIGN_ENDPOINT = (import.meta.env.VITE_PAYMENT_SIGNATURE_URL as string | undefined)
  || 'https://us-central1-dgdc-c848d.cloudfunctions.net/firmarEstadoPago';

export async function firmarEstadoPagoSeguro(
  user: User,
  licitacionId: string,
  estadoPagoId: string,
  sha256: string,
): Promise<void> {
  const response = await fetch(SIGN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ licitacionId, estadoPagoId, sha256 }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `No fue posible firmar el estado de pago (HTTP ${response.status}).`);
  }
}
