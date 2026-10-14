// Intermediario de IA (Supabase Edge Function). Las claves y la elección de proveedor y modelo viven solo
// aquí, como secretos del proyecto Supabase: el sitio no sabe qué IA hay detrás. Cambiar de modelo o de
// proveedor es cambiar un secreto, sin tocar ni republicar el sitio.
//
// Pedido:   { prompt, maxOutputTokens, intento }   (intento = 0, 1, 2… para rotar modelos si uno está saturado)
// Respuesta: { texto, modelo }   o, si falla, { error } con el mismo código de estado del proveedor (429, 503…),
//            para que el sitio decida si reintenta (aiService.ts).
//
// Solo atiende a personal con sesión Google @uct.cl verificada: la sesión es la de Firebase del sitio, y
// aquí se comprueba su firma contra las claves públicas de Google.
//
// Secretos (supabase secrets set NOMBRE=valor):
//   IA_PROVEEDOR      gemini (por defecto) u openai (sirve para cualquier servicio compatible con la API de OpenAI)
//   IA_MODELOS        modelos en orden de preferencia, separados por coma (por defecto, los Gemini de abajo)
//   GEMINI_API_KEY    clave de Google AI Studio
//   OPENAI_API_KEY    clave del proveedor compatible con OpenAI
//   IA_OPENAI_URL     dirección del servicio compatible (por defecto, la de OpenAI)
//
// Desplegar:  supabase functions deploy consultar-ia --no-verify-jwt
// (--no-verify-jwt: la sesión que llega es de Firebase, no de Supabase; se valida abajo.)

import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const PROYECTO_FIREBASE = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'dgdc-c848d';
const ORIGENES = ['https://uctenis.github.io', /^http:\/\/localhost:\d+$/];
const MAX_PROMPT_CHARS = 400_000;
const MODELOS_GEMINI = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
// Los modelos Gemini 3.x "piensan" antes de responder y ese razonamiento consume tokens de salida: sin este
// margen la respuesta llegaba cortada.
const MARGEN_RAZONAMIENTO_GEMINI = 6000;

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

interface Resultado { estado: number; texto?: string; error?: string }

async function consultarGemini(modelo: string, prompt: string, maxTokens: number, clave: string): Promise<Resultado> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens + MARGEN_RAZONAMIENTO_GEMINI, temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(110_000),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) return { estado: r.status, error: datos?.error?.message ?? `Error ${r.status}` };
  const partes: { text?: string; thought?: boolean }[] = datos?.candidates?.[0]?.content?.parts ?? [];
  return { estado: 200, texto: partes.filter(p => !p.thought && p.text).map(p => p.text).join('').trim() };
}

async function consultarCompatibleOpenAI(modelo: string, prompt: string, maxTokens: number, clave: string): Promise<Resultado> {
  const r = await fetch(Deno.env.get('IA_OPENAI_URL') ?? 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(110_000),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) return { estado: r.status, error: datos?.error?.message ?? `Error ${r.status}` };
  return { estado: 200, texto: String(datos?.choices?.[0]?.message?.content ?? '').trim() };
}

Deno.serve(async req => {
  const cors = cabecerasCors(req.headers.get('origin'));
  const responder = (estado: number, cuerpo: unknown) =>
    new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: estado, headers: { ...cors, 'Content-Type': 'application/json' } });
  const error = (estado: number, mensaje: string) => responder(estado, { error: mensaje });

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
  let cuerpo: { model?: unknown; prompt?: unknown; maxOutputTokens?: unknown; intento?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return error(400, 'Solicitud de IA inválida.');
  }
  const prompt = cuerpo.prompt;
  const maxTokens = Number(cuerpo.maxOutputTokens ?? 0);
  if (typeof prompt !== 'string' || !prompt || prompt.length > MAX_PROMPT_CHARS || !Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 65536) {
    return error(400, 'Solicitud de IA inválida.');
  }

  const proveedor = (Deno.env.get('IA_PROVEEDOR') ?? 'gemini').toLowerCase();
  const clave = Deno.env.get(proveedor === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY');
  if (!clave) return error(500, 'AI_API_KEY_NOT_CONFIGURED: falta la clave del proveedor de IA.');
  const modelos = (Deno.env.get('IA_MODELOS') ?? '').split(',').map(m => m.trim()).filter(Boolean);
  const lista = modelos.length ? modelos : MODELOS_GEMINI;

  // Versión anterior del sitio (aún en la caché de algún navegador): mandaba el modelo y esperaba la respuesta de Google tal cual.
  if (typeof cuerpo.model === 'string' && cuerpo.intento === undefined) {
    if (!/^gemini-[a-z0-9.-]+$/i.test(cuerpo.model) || proveedor !== 'gemini') return error(400, 'Solicitud de IA inválida.');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cuerpo.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } }),
      signal: AbortSignal.timeout(110_000),
    }).catch(() => null);
    return r ? responder(r.status, await r.text()) : error(502, 'No se pudo conectar con la IA.');
  }

  // 3. Un intento con el modelo que toca según el número de intento (rotación ante saturación).
  const intento = Math.max(0, Math.floor(Number(cuerpo.intento) || 0));
  const modelo = lista[intento % lista.length];
  try {
    const r = proveedor === 'openai'
      ? await consultarCompatibleOpenAI(modelo, prompt, maxTokens, clave)
      : await consultarGemini(modelo, prompt, maxTokens, clave);
    if (r.estado !== 200) return error(r.estado, r.error ?? 'Error del proveedor de IA.');
    if (!r.texto) return error(502, 'AI_EMPTY_RESPONSE: la IA no devolvió texto.');
    return responder(200, { texto: r.texto, modelo });
  } catch (e) {
    console.error('Error llamando a la IA', proveedor, modelo, email, e);
    const sinRespuesta = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return error(sinRespuesta ? 504 : 502, sinRespuesta ? 'La IA no respondió a tiempo.' : 'No se pudo conectar con la IA.');
  }
});
