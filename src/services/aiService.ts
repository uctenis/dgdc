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
