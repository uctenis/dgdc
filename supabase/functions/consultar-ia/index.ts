// Intermediario de IA (Supabase Edge Function). La clave de Gemini vive solo aquí, como secreto del
// proyecto Supabase (GEMINI_API_KEY): el sitio ya no la lleva en su código.
//
// Recibe lo mismo que la función `consultarIA` de Firebase ({ model, prompt, maxOutputTokens }) y devuelve
// la respuesta de Google tal cual, con su mismo código de estado: los reintentos y la rotación de modelos
// siguen en el navegador (aiService.ts). Solo atiende a personal con sesión Google @uct.cl verificada:
// la sesión es la de Firebase del sitio, y aquí se comprueba su firma contra las claves públicas de Google.
//
// Desplegar:  supabase functions deploy consultar-ia --no-verify-jwt
// Secreto:    supabase secrets set GEMINI_API_KEY=...
// (--no-verify-jwt: la sesión que llega es de Firebase, no de Supabase; se valida abajo.)

import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const PROYECTO_FIREBASE = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'dgdc-c848d';
const ORIGENES = ['https://uctenis.github.io', /^http:\/\/localhost:\d+$/];
const MAX_PROMPT_CHARS = 400_000;

// Claves públicas con que Google firma las sesiones de Firebase (se renuevan solas; jose las guarda en memoria).
const CLAVES_GOOGLE = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

function cabecerasCors(origen: string | null): Record<string, string> {
  const permitido = origen && ORIGENES.some(o => (typeof o === 'string' ? o === origen : o.test(origen)));
  return {
    ...(permitido ? { 'Access-Control-Allow-Origin': origen as string } : {}),
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async req => {
  const cors = cabecerasCors(req.headers.get('origin'));
  const responder = (estado: number, cuerpo: string) =>
    new Response(cuerpo, { status: estado, headers: { ...cors, 'Content-Type': 'application/json' } });
  const error = (estado: number, mensaje: string) => responder(estado, JSON.stringify({ error: mensaje }));

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return error(405, 'Método no permitido.');

  // 1. Sesión: debe ser una sesión de Firebase de este proyecto, vigente y de una cuenta @uct.cl verificada.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  let email = '';
  try {
    const { payload } = await jwtVerify(token, CLAVES_GOOGLE, {
      issuer: `https://securetoken.google.com/${PROYECTO_FIREBASE}`,
      audience: PROYECTO_FIREBASE,
    });
    if (!payload.sub) throw new Error('sin usuario');
    email = String(payload.email ?? '').toLowerCase();
    if (payload.email_verified !== true || !email.endsWith('@uct.cl')) {
      return error(403, 'IA_NO_AUTORIZADO: solo personal de la UCT puede usar la IA.');
    }
  } catch {
    return error(401, 'IA_AUTH: debe iniciar sesión.');
  }

  // 2. Solicitud.
  let cuerpo: { model?: unknown; prompt?: unknown; maxOutputTokens?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return error(400, 'Solicitud de IA inválida.');
  }
  const model = String(cuerpo.model ?? '');
  const prompt = cuerpo.prompt;
  const maxOutputTokens = Number(cuerpo.maxOutputTokens ?? 0);
  if (!/^gemini-[a-z0-9.-]+$/i.test(model) || typeof prompt !== 'string' || !prompt || prompt.length > MAX_PROMPT_CHARS
    || !Number.isFinite(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 65536) {
    return error(400, 'Solicitud de IA inválida.');
  }

  const clave = Deno.env.get('GEMINI_API_KEY');
  if (!clave) return error(500, 'AI_API_KEY_NOT_CONFIGURED: falta el secreto GEMINI_API_KEY.');

  // 3. Llamada a Google: una sola, devolviendo su mismo código para que el navegador decida si reintenta.
  try {
    const respuesta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(110_000),
    });
    return responder(respuesta.status, await respuesta.text());
  } catch (e) {
    console.error('Error llamando a Gemini', email, e);
    const sinRespuesta = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return error(sinRespuesta ? 504 : 502, sinRespuesta ? 'La IA no respondió a tiempo.' : 'No se pudo conectar con la IA.');
  }
});
