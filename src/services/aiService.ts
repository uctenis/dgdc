// ─── PROVEEDOR DE IA (Gemini u OpenAI) ─────────────────────────────────────
// Ambas funciones de IA de la app (reescritura de texto y sugerencia de
// itemizado) llaman a través de este único despachador: si hay una API key de
// Gemini configurada se usa esa (tiene nivel gratuito real, sin tarjeta de
// crédito); si no, cae a OpenAI. Ambas llamadas se hacen directo desde el
// navegador — la key queda visible en el bundle del cliente (ver .env.example).

import { FASES_ITEMIZADO } from '../types';

type ProveedorIA = 'gemini' | 'openai';

function proveedorActivo(): ProveedorIA | null {
  if (import.meta.env.VITE_GEMINI_API_KEY) return 'gemini';
  if (import.meta.env.VITE_OPENAI_API_KEY) return 'openai';
  return null;
}

export function isAIConfigured(): boolean {
  return proveedorActivo() !== null;
}

export function proveedorIAActivo(): ProveedorIA | null {
  return proveedorActivo();
}

const TIMEOUT_MS = 60000;

/** fetch con límite de tiempo — sin esto, una IA que no responde deja el botón "Pensando…" para siempre. */
function fetchConTimeout(url: string, opciones: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...opciones, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function llamarGemini(prompt: string, maxOutputTokens: number): Promise<string> {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  const model = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.6-flash';

  let resp: Response;
  try {
    resp = await fetchConTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens, temperature: 0.3 },
        }),
      }
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('AI_TIMEOUT');
    throw new Error(`AI_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`AI_REQUEST_FAILED: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error(`AI_EMPTY_RESPONSE: ${JSON.stringify(data).slice(0, 300)}`);
  return texto.trim();
}

async function llamarOpenAI(prompt: string, maxTokens: number): Promise<string> {
  const key = import.meta.env.VITE_OPENAI_API_KEY;
  const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';

  let resp: Response;
  try {
    resp = await fetchConTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('AI_TIMEOUT');
    throw new Error(`AI_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`AI_REQUEST_FAILED: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`AI_EMPTY_RESPONSE: ${JSON.stringify(data).slice(0, 300)}`);
  return content.trim();
}

/** Envía `prompt` al proveedor de IA configurado (Gemini primero, luego OpenAI) y retorna el texto de respuesta. */
async function llamarIA(prompt: string, maxTokens: number): Promise<string> {
  const proveedor = proveedorActivo();
  if (!proveedor) throw new Error('AI_API_KEY_NOT_CONFIGURED');
  return proveedor === 'gemini' ? llamarGemini(prompt, maxTokens) : llamarOpenAI(prompt, maxTokens);
}

export async function rewriteTextWithAI(text: string, style = 'técnico y conciso'): Promise<string> {
  const prompt = `Reescribe el siguiente texto en un lenguaje ${style}, corrige ortografía y gramática, conserva la información técnica y mejora la redacción (responde solo con el texto reescrito):\n\n${text}`;
  return llamarIA(prompt, 800);
}

export interface ItemItemizadoSugeridoIA {
  item: string;
  descripcion: string;
  unidad: string;
  fase: string;
}

/** Empareja el texto de fase que devuelve la IA contra el catálogo estándar (sin distinguir
 * mayúsculas/tildes) — si no calza con ninguna, se deja tal cual llegó para no perder el dato. */
const RANGO_DIACRITICOS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function normalizarFase(valor: string): string {
  const sinTildes = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(RANGO_DIACRITICOS, '');
  const plano = sinTildes(valor);
  const encontrada = FASES_ITEMIZADO.find(f => sinTildes(f) === plano);
  return encontrada || valor.trim();
}

/** Extrae objetos planos {..} completos de a uno — sirve de último respaldo cuando la respuesta
 * viene cortada a mitad de camino (se pierde el último objeto incompleto, pero se recuperan
 * todos los anteriores en vez de fallar por completo). */
function extraerObjetosCompletos(texto: string): Record<string, unknown>[] {
  const objetos: Record<string, unknown>[] = [];
  for (const match of texto.matchAll(/\{[^{}]*\}/g)) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && typeof obj === 'object') objetos.push(obj);
    } catch {
      // objeto incompleto o roto — se descarta y se sigue con el resto
    }
  }
  return objetos;
}

/** Interpreta la respuesta de texto de la IA como un array JSON, con dos respaldos progresivos
 * para cuando no responde exactamente lo pedido: (1) extraer el primer "[...]" si vino con texto
 * alrededor, (2) rescatar los objetos completos sueltos si la respuesta se cortó a mitad de camino. */
function parsearArregloJsonDeIA(content: string): unknown[] {
  const limpio = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const directo = JSON.parse(limpio);
    if (Array.isArray(directo)) return directo;
  } catch {
    // sigue a los respaldos de abajo
  }
  const match = limpio.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const extraido = JSON.parse(match[0]);
      if (Array.isArray(extraido)) return extraido;
    } catch {
      // sigue al respaldo 2
    }
  }
  const rescatados = extraerObjetosCompletos(limpio);
  if (rescatados.length > 0) return rescatados;
  throw new Error(`AI_INVALID_JSON: ${limpio.slice(0, 500)}`);
}

/**
 * Propone partidas TÍPICAS/RECURRENTES de itemizado (Bill of Quantities) para un proyecto de obra,
 * a partir de su rubro, tipo de obra y nombre/descripción. Deliberadamente no propone cantidades ni
 * precios unitarios (serían una alucinación de precios de mercado chileno) — el usuario los completa.
 */
export async function sugerirItemizadoConIA(params: {
  nombre: string;
  descripcion?: string;
  tipoObra?: string;
  rubro?: string;
  uso?: string;
}): Promise<ItemItemizadoSugeridoIA[]> {
  const contexto = [
    `Nombre del proyecto: "${params.nombre}"`,
    params.tipoObra ? `Tipo de obra: ${params.tipoObra}` : '',
    params.rubro ? `Rubro: ${params.rubro}` : '',
    params.uso ? `Uso del espacio: ${params.uso}` : '',
    params.descripcion ? `Descripción: ${params.descripcion}` : '',
  ].filter(Boolean).join('\n');

  const catalogoFases = FASES_ITEMIZADO.map(f => `"${f}"`).join(', ');

  const prompt = `Eres un presupuestista experto en obras civiles y de infraestructura en Chile, trabajando para la Subdirección de Infraestructura de una universidad. Dado este proyecto:

${contexto}

Primero determina qué tipo de proyecto es y cuál es la lógica de ejecución más adecuada para él. Luego propone entre 6 y 14 partidas TÍPICAS y RECURRENTES de itemizado (Bill of Quantities), en el orden lógico de ejecución de la obra. Cada partida debe clasificarse en EXACTAMENTE una de estas fases (usa el texto tal cual, sin inventar otras): ${catalogoFases}. No todas las fases son obligatorias — usa solo las que apliquen a este proyecto en particular. NO inventes cantidades ni precios unitarios — el responsable del proyecto los completará manualmente. Responde EXCLUSIVAMENTE con un array JSON válido, sin texto adicional ni markdown, con este formato exacto:
[{"item":"1.1","fase":"Instalación de Faenas","descripcion":"...","unidad":"m2"}, ...]
Usa unidades reales de construcción chilena (m2, m3, ml, un, gl, kg, hh, etc).`;

  const content = await llamarIA(prompt, 4000);
  const parsed = parsearArregloJsonDeIA(content);

  return parsed
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x, i) => ({
      item: String(x.item ?? i + 1),
      descripcion: String(x.descripcion ?? '').trim(),
      unidad: String(x.unidad ?? 'un').trim(),
      fase: normalizarFase(String(x.fase ?? '')),
    }))
    .filter(x => x.descripcion.length > 0);
}

export interface FaseSugeridaIA {
  fase: string;
  inicioPct: number;
  duracionPct: number;
}

/**
 * Propone, para cada fase del itemizado, en qué % del plazo total inicia y qué % del plazo total
 * dura, siguiendo la lógica de secuencia y traslapes típica de una obra (ej. Instalaciones puede
 * comenzar antes de que termine Obra Gruesa). Es la base del Programa de Trabajo / Carta Gantt
 * referencial — la IA decide SOLO la lógica de secuencia, las fechas reales se calculan en el
 * código a partir de la fecha de inicio y duración total real del proyecto.
 */
export async function sugerirProgramaTrabajoConIA(params: {
  tipoObra?: string;
  duracionTotalDias: number;
  fases: { fase: string; pesoPresupuestario: number }[];
}): Promise<FaseSugeridaIA[]> {
  const listaFases = params.fases
    .map(f => `- ${f.fase} (${f.pesoPresupuestario}% del presupuesto)`)
    .join('\n');

  const prompt = `Eres un experto en planificación y programación de obras (Carta Gantt) en Chile. Un proyecto${params.tipoObra ? ` de tipo "${params.tipoObra}"` : ''} tiene una duración total estimada de ${params.duracionTotalDias} días corridos, y su presupuesto se distribuye en estas fases (en orden de ejecución):

${listaFases}

Determina, según la lógica constructiva secuencial NORMAL de una obra (incluyendo los traslapes típicos entre fases consecutivas — ej. Instalaciones puede iniciar antes de que termine Obra Gruesa, Terminaciones antes de que termine Instalaciones), en qué porcentaje del plazo total inicia cada fase y qué porcentaje del plazo total dura. La primera fase debe iniciar en 0%, y la suma del inicio + duración de la última fase debe llegar a 100%. Responde EXCLUSIVAMENTE con un array JSON válido, sin texto adicional ni markdown, con este formato exacto (mismo orden y mismos nombres de fase recibidos):
[{"fase":"...","inicioPct":0,"duracionPct":15}, ...]`;

  const content = await llamarIA(prompt, 1500);
  const parsed = parsearArregloJsonDeIA(content);

  return parsed
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map(x => ({
      fase: normalizarFase(String(x.fase ?? '')),
      inicioPct: Math.max(0, Math.min(100, Number(x.inicioPct ?? 0))),
      duracionPct: Math.max(0, Math.min(100, Number(x.duracionPct ?? 0))),
    }))
    .filter(x => x.fase.length > 0);
}
