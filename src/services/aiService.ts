export async function rewriteTextWithAI(text: string, style = 'técnico y conciso'): Promise<string> {
  const key = import.meta.env.VITE_OPENAI_API_KEY;
  const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';
  if (!key) throw new Error('AI_API_KEY_NOT_CONFIGURED');

  const prompt = `Reescribe el siguiente texto en un lenguaje ${style}, corrige ortografía y gramática, conserva la información técnica y mejora la redacción (responde solo con el texto reescrito):\n\n${text}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`AI_REQUEST_FAILED: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI_EMPTY_RESPONSE');
  return content.trim();
}

export function isAIConfigured() {
  return Boolean(import.meta.env.VITE_OPENAI_API_KEY);
}

export interface ItemItemizadoSugeridoIA {
  item: string;
  descripcion: string;
  unidad: string;
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
  const key = import.meta.env.VITE_OPENAI_API_KEY;
  const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';
  if (!key) throw new Error('AI_API_KEY_NOT_CONFIGURED');

  const contexto = [
    `Nombre del proyecto: "${params.nombre}"`,
    params.tipoObra ? `Tipo de obra: ${params.tipoObra}` : '',
    params.rubro ? `Rubro: ${params.rubro}` : '',
    params.uso ? `Uso del espacio: ${params.uso}` : '',
    params.descripcion ? `Descripción: ${params.descripcion}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `Eres un presupuestista experto en obras civiles y de infraestructura en Chile, trabajando para la Subdirección de Infraestructura de una universidad. Dado este proyecto:

${contexto}

Propone entre 6 y 14 partidas TÍPICAS y RECURRENTES de itemizado (Bill of Quantities) para este tipo de proyecto, en el orden lógico de ejecución de la obra (ej: instalación de faenas primero, aseo/entrega al final). NO inventes cantidades ni precios unitarios — el responsable del proyecto los completará manualmente. Responde EXCLUSIVAMENTE con un array JSON válido, sin texto adicional ni markdown, con este formato exacto:
[{"item":"1.1","descripcion":"...","unidad":"m2"}, ...]
Usa unidades reales de construcción chilena (m2, m3, ml, un, gl, kg, hh, etc).`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1200,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`AI_REQUEST_FAILED: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  const content: string = data?.choices?.[0]?.message?.content || '';
  const limpio = content.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(limpio);
  } catch {
    throw new Error('AI_INVALID_JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('AI_INVALID_JSON');

  return parsed
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x, i) => ({
      item: String(x.item ?? i + 1),
      descripcion: String(x.descripcion ?? '').trim(),
      unidad: String(x.unidad ?? 'un').trim(),
    }))
    .filter(x => x.descripcion.length > 0);
}
