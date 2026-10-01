// ─── PROVEEDOR DE IA (Gemini u OpenAI) ─────────────────────────────────────
// Todas las funciones de IA de la app llaman a través de este único despachador.
// Con VITE_IA_SERVIDOR=true (producción) Gemini se consulta a través de la función
// `consultarIA` de Firebase: la clave vive solo en el servidor y exige sesión
// @uct.cl. Sin eso (pruebas locales) se usa la clave VITE_GEMINI_API_KEY directo
// desde el navegador —queda visible en el bundle— y, si no hay, OpenAI.

import { FASES_ITEMIZADO } from '../types';
import { auth } from '../lib/firebase';

type ProveedorIA = 'gemini' | 'openai';

const IA_POR_SERVIDOR = import.meta.env.VITE_IA_SERVIDOR === 'true';
const IA_ENDPOINT = (import.meta.env.VITE_IA_SERVIDOR_URL as string | undefined)
  || 'https://us-central1-dgdc-c848d.cloudfunctions.net/consultarIA';

function proveedorActivo(): ProveedorIA | null {
  if (IA_POR_SERVIDOR) return 'gemini';
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
function fetchConTimeout(url: string, opciones: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opciones, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Si el modelo configurado está saturado (503/429) o no responde a tiempo, se reintenta con estos
// modelos alternativos. En el nivel gratuito Google devuelve 503 "high demand" con frecuencia y de
// forma intermitente (el mismo modelo falla y a los segundos responde), así que se hacen varias
// rondas por todos los modelos con pausas crecientes antes de rendirse.
const MODELOS_GEMINI_RESPALDO = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const PAUSAS_ENTRE_RONDAS_MS = [3000, 8000, 15000];
// Tiempo máximo total de reintentos: pasado esto se informa el error en vez de dejar esperando.
const PRESUPUESTO_REINTENTOS_MS = 150000;

// Los modelos Gemini 3.x "piensan" antes de responder y ese razonamiento consume maxOutputTokens:
// con el límite justo, la respuesta llegaba cortada (finishReason MAX_TOKENS). Se suma este margen.
const MARGEN_TOKENS_RAZONAMIENTO = 6000;

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

async function llamarGemini(prompt: string, maxOutputTokens: number, timeoutMs?: number): Promise<string> {
  const principal = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.6-flash';
  let modelos = [principal, ...MODELOS_GEMINI_RESPALDO.filter(m => m !== principal)];
  const inicio = Date.now();
  let ultimoError: unknown;
  for (let ronda = 0; ronda <= PAUSAS_ENTRE_RONDAS_MS.length; ronda++) {
    if (ronda > 0) {
      if (Date.now() - inicio > PRESUPUESTO_REINTENTOS_MS) break;
      await esperar(PAUSAS_ENTRE_RONDAS_MS[ronda - 1]);
    }
    for (const model of [...modelos]) {
      if (Date.now() - inicio > PRESUPUESTO_REINTENTOS_MS) break;
      try {
        return await llamarGeminiModelo(model, prompt, maxOutputTokens + MARGEN_TOKENS_RAZONAMIENTO, timeoutMs);
      } catch (err) {
        ultimoError = err;
        const msg = err instanceof Error ? err.message : '';
        // Modelo inexistente para esta clave: se saca de la rotación.
        if (/AI_REQUEST_FAILED: 404/.test(msg)) { modelos = modelos.filter(m => m !== model); continue; }
        const reintentable = msg.includes('AI_TIMEOUT') || msg.includes('AI_EMPTY_RESPONSE') || /AI_REQUEST_FAILED: (503|429|500|502|504)/.test(msg);
        if (!reintentable) throw err;
        console.warn(`Gemini ${model} no disponible (ronda ${ronda + 1}), probando otro:`, msg.slice(0, 120));
      }
    }
    if (!modelos.length) break;
  }
  throw ultimoError;
}

/** Mensaje claro para el usuario según el error de IA (mismo texto en todas las pantallas). */
export function mensajeErrorIA(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  if (msg.includes('AI_AUTH_REQUIRED') || msg.includes('IA_AUTH')) return 'Su sesión expiró. Vuelva a iniciar sesión para usar la IA.';
  if (msg.includes('IA_NO_AUTORIZADO')) return 'Solo el personal de la UCT puede usar la IA.';
  if (msg.includes('AI_API_KEY_NOT_CONFIGURED')) return 'La IA no está configurada en este ambiente (falta la clave de Gemini).';
  if (/AI_REQUEST_FAILED: (503|500|502|504)/.test(msg) || msg.includes('AI_TIMEOUT'))
    return 'Los servidores de IA de Google están saturados en este momento (el sistema reintentó varias veces con distintos modelos). Intente nuevamente en unos minutos.';
  if (/AI_REQUEST_FAILED: 429/.test(msg)) return 'Se alcanzó el límite de uso gratuito de la IA por ahora. Espere unos minutos (o hasta mañana si es el límite diario) e intente nuevamente.';
  if (/AI_REQUEST_FAILED: (400|401|403)/.test(msg)) return 'La clave de IA no es válida o no tiene permiso. Avise al administrador del sistema.';
  if (msg.includes('AI_NETWORK_ERROR')) return 'No se pudo conectar con la IA. Revise su conexión a internet (o un firewall/proxy que bloquee la llamada).';
  if (msg.includes('AI_INVALID_JSON')) return 'La IA respondió en un formato inesperado. Intente nuevamente.';
  return 'No se pudo obtener la respuesta de la IA. Intente nuevamente.';
}

// Dos formas de acceder a Gemini con una API key: AI Studio (generativelanguage.googleapis.com) o
// Vertex AI en modo express (aiplatform.googleapis.com, claves creadas desde Google Cloud con una
// "Bound account"). Mismo formato de petición y respuesta; solo cambia la URL.
function urlGemini(model: string, key: string): string {
  return import.meta.env.VITE_GEMINI_PROVEEDOR === 'vertex'
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${key}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

async function llamarGeminiModelo(model: string, prompt: string, maxOutputTokens: number, timeoutMs?: number): Promise<string> {
  let resp: Response;
  try {
    if (IA_POR_SERVIDOR) {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('AI_AUTH_REQUIRED');
      resp = await fetchConTimeout(
        IA_ENDPOINT,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ model, prompt, maxOutputTokens }),
        },
        timeoutMs
      );
    } else {
      const key = import.meta.env.VITE_GEMINI_API_KEY;
      resp = await fetchConTimeout(
        urlGemini(model, key),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens, temperature: 0.3 },
          }),
        },
        timeoutMs
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'AI_AUTH_REQUIRED') throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('AI_TIMEOUT');
    throw new Error(`AI_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`AI_REQUEST_FAILED: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  const partes: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts || [];
  const texto = partes.filter(p => !p.thought && p.text).map(p => p.text).join('');
  if (!texto) throw new Error(`AI_EMPTY_RESPONSE: ${JSON.stringify(data).slice(0, 300)}`);
  return texto.trim();
}

async function llamarOpenAI(prompt: string, maxTokens: number, timeoutMs?: number): Promise<string> {
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
    }, timeoutMs);
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
async function llamarIA(prompt: string, maxTokens: number, timeoutMs?: number): Promise<string> {
  const proveedor = proveedorActivo();
  if (!proveedor) throw new Error('AI_API_KEY_NOT_CONFIGURED');
  return proveedor === 'gemini' ? llamarGemini(prompt, maxTokens, timeoutMs) : llamarOpenAI(prompt, maxTokens, timeoutMs);
}

export async function rewriteTextWithAI(text: string, style = 'técnico y conciso'): Promise<string> {
  const prompt = `Reescribe el siguiente texto en un lenguaje ${style}, corrige ortografía y gramática, conserva la información técnica y mejora la redacción (responde solo con el texto reescrito):\n\n${text}`;
  return llamarIA(prompt, 800);
}

/**
 * Mejora la Descripción del Requerimiento de un proyecto con fundamento técnico: precisa el alcance,
 * los trabajos, materiales/sistemas y normativa chilena aplicable, a partir de lo que escribió el
 * usuario y los datos del proyecto. No inventa cifras (m2, montos, plazos) que el usuario no dio.
 * Si el proyecto tiene presupuesto estimativo, sus partidas son la fuente del alcance.
 */
export async function mejorarDescripcionProyectoConIA(params: {
  descripcion: string;
  nombre?: string;
  tipoObra?: string;
  rubro?: string;
  uso?: string;
  ubicacion?: string;
  /** Partidas del presupuesto estimativo, SIN precios (ver resumenPartidasParaIA): la descripción va a las Bases. */
  partidas?: string;
}): Promise<string> {
  const contexto = [
    params.nombre ? `Título del proyecto (define QUÉ se va a hacer): "${params.nombre}"` : '',
    params.ubicacion ? `Lugar donde se ejecuta (define DÓNDE): ${params.ubicacion}` : '',
    params.uso ? `Uso del espacio intervenido: ${params.uso}` : '',
    params.tipoObra ? `Tipo de obra: ${params.tipoObra}` : '',
    params.rubro ? `Rubro: ${params.rubro}` : '',
  ].filter(Boolean).join('\n');

  const descripcionUsuario = params.descripcion.trim();
  const partidas = params.partidas?.trim();

  const prompt = `Eres un profesional de la Subdirección de Infraestructura de una universidad chilena (Universidad Católica de Temuco), experto en obras civiles, instalaciones y mantención de edificios. Debes ${descripcionUsuario ? 'mejorar' : 'redactar'} la "Descripción del Requerimiento Institucional" de un proyecto, que luego se usará en las Bases de licitación.

Datos del proyecto:
${contexto}

${descripcionUsuario ? `Descripción escrita por el usuario:
"""
${descripcionUsuario}
"""` : `El usuario aún no escribió una descripción: redáctala a partir ${partidas ? 'del presupuesto estimativo, el título y el lugar' : 'del título y el lugar'}.`}
${partidas ? `
Presupuesto estimativo del proyecto (partidas con su cantidad; es la fuente más precisa de lo que se va a ejecutar):
"""
${partidas}
"""
` : ''}
Usa el título y el lugar como referencia principal: interpreta qué solución indica el título, en qué tipo de recinto y ciudad se ejecuta (clima de la zona, condiciones de uso del recinto, si es un edificio universitario en funcionamiento) y ajusta las consideraciones técnicas a ese contexto concreto. Nombra el recinto y el campus en la descripción.

Redacta una descripción ${descripcionUsuario ? 'mejorada ' : ''}que:
- ${descripcionUsuario ? 'Conserve TODA la información que dio el usuario y su intención; no cambies el alcance.' : partidas ? 'Se limite al alcance que muestran las partidas del presupuesto; no agregues trabajos que no estén en ellas.' : 'Se limite al alcance que indica el título; no agregues trabajos ajenos a él.'}
${partidas ? '- Resuma los trabajos del presupuesto agrupándolos por tipo de trabajo, sin enumerar las partidas una a una. Puede citar las cantidades del presupuesto (superficies, metros, unidades) cuando ayuden a dimensionar la obra. NO mencione precios ni montos.\n' : ''}- Precise el alcance con fundamento técnico: trabajos a ejecutar, materiales o sistemas típicos para este tipo de solución, y consideraciones técnicas relevantes (seguridad, compatibilidad con lo existente, mantención, eficiencia).
- Mencione normativa chilena aplicable solo si corresponde con certeza (ej. OGUC, NCh, normas SEC), sin inventar números de norma dudosos.
- Incluya una breve justificación de la necesidad institucional.
- NO inventes cifras que ${partidas ? 'no estén en la descripción del usuario ni en el presupuesto' : 'el usuario no dio'} (superficies, cantidades, montos, plazos, marcas); si son relevantes, indícalas como "a definir" o "según levantamiento en terreno".
- Use lenguaje técnico, formal e impersonal, en español de Chile, en 1 a 3 párrafos (máximo ~180 palabras), sin títulos, viñetas ni markdown.

Responde solo con el texto de la descripción mejorada.`;

  const texto = await llamarIA(prompt, 1200);
  return texto.replace(/^["“]|["”]$/g, '').trim();
}

/**
 * Redacta el Fundamento con que un proyecto se defiende en la revisión de la cartera anual, a partir de su
 * descripción y de los argumentos que escribió el usuario. No inventa cifras ni hechos que no estén en los datos.
 */
export async function redactarFundamentoProyectoConIA(params: {
  nombre: string;
  descripcion?: string;
  /** Argumentos o ideas sueltas que el usuario quiere incorporar (puede ser el fundamento ya escrito). */
  argumentos?: string;
  tipoObra?: string;
  uso?: string;
  ubicacion?: string;
  prioridad?: string;
  valorEstimado?: number;
  anio?: number;
  /** Partidas del presupuesto estimativo con sus montos (ver resumenPartidasParaIA): el fundamento es interno. */
  partidas?: string;
}): Promise<string> {
  const partidas = params.partidas?.trim();
  const contexto = [
    `Proyecto: "${params.nombre}"`,
    params.ubicacion ? `Ubicación: ${params.ubicacion}` : '',
    params.tipoObra ? `Tipo de obra: ${params.tipoObra}` : '',
    params.uso ? `Uso del espacio: ${params.uso}` : '',
    params.prioridad ? `Prioridad asignada: ${params.prioridad}` : '',
    params.valorEstimado ? `Presupuesto estimado: $${Math.round(params.valorEstimado).toLocaleString('es-CL')} (IVA incluido)` : '',
  ].filter(Boolean).join('\n');
  const argumentos = params.argumentos?.trim();

  const prompt = `Eres un profesional de la Subdirección de Infraestructura de la Universidad Católica de Temuco. Debes redactar el FUNDAMENTO con que este proyecto se defenderá ante quienes aprueban la cartera de inversiones${params.anio ? ` ${params.anio}` : ''} y su presupuesto.

Datos del proyecto:
${contexto}

${params.descripcion?.trim() ? `Descripción del requerimiento:
"""
${params.descripcion.trim()}
"""` : `El proyecto aún no tiene descripción: básate en ${partidas ? 'el presupuesto estimativo, el nombre y la ubicación' : 'el nombre y la ubicación'}.`}
${partidas ? `
Presupuesto estimativo del proyecto (partidas con su cantidad y monto neto; muestra en qué se gasta el dinero):
"""
${partidas}
"""
` : ''}
${argumentos ? `Argumentos que el responsable quiere incorporar (son la base del fundamento; consérvalos todos):
"""
${argumentos}
"""` : `El responsable no entregó argumentos propios: dedúcelos solo de la descripción${partidas ? ' y del presupuesto' : ''}.`}

Redacta un fundamento que:
- Explique la necesidad que resuelve y a quiénes beneficia (estudiantes, académicos, funcionarios, comunidad).
- Indique por qué corresponde hacerlo en este período y qué riesgo o costo tiene postergarlo (seguridad, continuidad de la docencia, deterioro, normativa), solo si se desprende de los datos.
- Relacione el monto con el beneficio, sin repetir la descripción técnica.${partidas ? '\n- Indique en qué se concentra la inversión según el presupuesto (los trabajos de mayor peso), sin listar partidas ni detallar precios unitarios.' : ''}
- NO invente cifras, cantidades de usuarios, fechas, incidentes ni exigencias normativas que no estén en los datos; si un dato sería útil y falta, no lo menciones.
- Use lenguaje formal, directo y persuasivo, en español de Chile, en un solo párrafo de 60 a 110 palabras, sin títulos, viñetas ni markdown.

Responde solo con el texto del fundamento.`;

  const texto = await llamarIA(prompt, 800);
  return texto.replace(/^["“]|["”]$/g, '').trim();
}

// ─── RUBRO DE PROVEEDORES (reclasificación asistida) ─────────────────────────

/**
 * Sugiere el rubro de cada proveedor según su razón social (y su rubro actual como pista débil).
 * Devuelve clave → nombre de rubro EXACTO del catálogo; si la razón social no permite deducirlo, la
 * IA omite ese proveedor (mejor sin sugerencia que una inventada).
 */
export async function sugerirRubrosProveedoresConIA(
  proveedores: { clave: string; razonSocial: string }[],
  rubros: { nombre: string; descripcion?: string }[]
): Promise<Record<string, string>> {
  const catalogo = rubros.map(r => `- "${r.nombre}"${r.descripcion ? `: ${r.descripcion}` : ''}`).join('\n');
  const lista = proveedores.map(p => `- [${p.clave}] ${p.razonSocial}`).join('\n');
  const prompt = `Eres analista de abastecimiento de la Subdirección de Infraestructura de una universidad chilena. Clasifica cada proveedor en UNO de estos rubros (usa el nombre exacto, entre comillas):
${catalogo}

Proveedores (razón social):
${lista}

Reglas: deduce el rubro solo por la razón social (ej. "Eléctrica", "Climatización", "Pinturas", "Paisajismo", "Áridos", "Techos"). Si la razón social es genérica (ej. solo un apellido, "Constructora X", "Inversiones Y") y no permite distinguir la especialidad, usa "Obras Civiles y Estructuras" solo si dice "Constructora"/"Construcciones"; si no, OMITE ese proveedor. No inventes rubros fuera del catálogo.

Responde EXCLUSIVAMENTE con un array JSON: [{"clave":"P1","rubro":"Instalaciones Eléctricas"}]`;

  const content = await llamarIA(prompt, 60 * proveedores.length + 400);
  const nombres = new Set(rubros.map(r => r.nombre));
  const resultado: Record<string, string> = {};
  for (const x of parsearArregloJsonDeIA(content)) {
    if (typeof x !== 'object' || x === null) continue;
    const obj = x as Record<string, unknown>;
    const clave = String(obj.clave ?? '').replace(/[[\]]/g, '').trim();
    const rubro = String(obj.rubro ?? '').trim();
    if (clave && nombres.has(rubro)) resultado[clave] = rubro;
  }
  return resultado;
}

// ─── ESPECIFICACIONES TÉCNICAS (EETT) desde el itemizado ─────────────────────

export interface ContextoProyectoEETT {
  nombre: string;
  descripcion?: string;
  ubicacion?: string;
  tipoObra?: string;
  rubro?: string;
  uso?: string;
}

function contextoEETT(p: ContextoProyectoEETT): string {
  return [
    `Proyecto: "${p.nombre}"`,
    p.ubicacion ? `Ubicación: ${p.ubicacion}` : '',
    p.tipoObra ? `Tipo de obra: ${p.tipoObra}` : '',
    p.rubro ? `Rubro: ${p.rubro}` : '',
    p.uso ? `Uso del espacio: ${p.uso}` : '',
    p.descripcion ? `Descripción del requerimiento: ${p.descripcion}` : '',
  ].filter(Boolean).join('\n');
}

const ROL_EETT = 'Eres un arquitecto/ingeniero especificador de la Subdirección de Infraestructura de la Universidad Católica de Temuco (Chile), experto en redactar Especificaciones Técnicas (EETT) para licitaciones de obras.';

/** Generalidades de las EETT (alcance, normativa, materiales, faena, seguridad, aseo y recepción). */
export async function generarGeneralidadesEETTConIA(proyecto: ContextoProyectoEETT, fases: string[]): Promise<string> {
  const prompt = `${ROL_EETT}

${contextoEETT(proyecto)}
Fases de la obra según el presupuesto: ${fases.join(', ')}

Redacta la sección "GENERALIDADES" de las Especificaciones Técnicas de este proyecto. Debe cubrir, en párrafos breves con un subtítulo en MAYÚSCULAS al inicio de cada uno (ej. "ALCANCE:"): alcance de la obra; normativa aplicable (OGUC, NCh pertinentes, normas SEC si hay instalaciones, Ley 16.744 y DS 594 para seguridad); calidad de materiales (nuevos, de primera calidad; cuando se nombre una marca se entiende "o equivalente técnico" aprobado por la ITO); instalación de faenas y trabajo en un recinto universitario en funcionamiento; prevención de riesgos; aseo y retiro de escombros a botadero autorizado; y recepción de la obra por la ITO. NO inventes cifras (superficies, cantidades, plazos, montos). Español de Chile, lenguaje técnico e impersonal, sin markdown ni viñetas con asteriscos, máximo ~350 palabras. Responde solo con el texto.`;
  const texto = await llamarIA(prompt, 2000, 120000);
  return texto.replace(/\*\*/g, '').trim();
}

/**
 * Especificación técnica de cada partida recibida (se llama por lotes, p. ej. una fase a la vez,
 * para que la respuesta no se corte). Retorna un mapa clave → especificación (la clave es única por
 * partida; el número de ítem no sirve porque puede repetirse antes de renumerar el itemizado).
 */
export async function generarEspecificacionesPartidasConIA(
  proyecto: ContextoProyectoEETT,
  partidas: { clave: string; item: string; descripcion: string; unidad: string; cantidad?: number; fase?: string }[]
): Promise<Record<string, string>> {
  const lista = partidas
    .map(p => `- [${p.clave}] Ítem ${p.item}${p.fase ? ` [${p.fase}]` : ''}: ${p.descripcion} (unidad: ${p.unidad}${p.cantidad ? `, cantidad: ${p.cantidad}` : ''})`)
    .join('\n');

  const prompt = `${ROL_EETT}

${contextoEETT(proyecto)}

Partidas del presupuesto aprobado a especificar:
${lista}

Para CADA partida redacta su especificación técnica (80 a 160 palabras), coherente con la descripción y unidad de la partida y con el contexto del proyecto. Cada especificación debe indicar, en este orden y en texto corrido: alcance de la partida; materiales y su calidad mínima (marcas solo como referencia, "o equivalente técnico"); procedimiento de ejecución; normativa o control de calidad si aplica; y forma de medición y pago según la unidad de la partida. NO inventes cifras que no estén en los datos (cantidades, dimensiones, montos); si hacen falta, indica "según planos" o "según levantamiento en terreno". Español de Chile, técnico e impersonal, sin markdown.

Responde EXCLUSIVAMENTE con un array JSON válido, sin texto adicional, con un objeto por partida y la clave (lo que va entre corchetes) exactamente igual a la recibida:
[{"clave":"P1","especificacion":"..."}]`;

  // Especificar varias partidas con razonamiento toma ~40 s: se da el doble del límite general.
  const content = await llamarIA(prompt, 700 * partidas.length + 500, 120000);
  const parsed = parsearArregloJsonDeIA(content);
  const resultado: Record<string, string> = {};
  for (const x of parsed) {
    if (typeof x !== 'object' || x === null) continue;
    const obj = x as Record<string, unknown>;
    const clave = String(obj.clave ?? '').replace(/[[\]]/g, '').trim();
    const esp = String(obj.especificacion ?? '').replace(/\*\*/g, '').trim();
    if (clave && esp) resultado[clave] = esp;
  }
  return resultado;
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

Primero determina qué tipo de proyecto es y cuál es la lógica de ejecución más adecuada para él. Luego propone entre 6 y 14 partidas TÍPICAS y RECURRENTES de itemizado (Bill of Quantities), en el orden lógico de ejecución de la obra. Cada partida debe clasificarse en EXACTAMENTE una de estas fases (usa el texto tal cual, sin inventar otras): ${catalogoFases}. No todas las fases son obligatorias — usa solo las que apliquen a este proyecto en particular. Las partidas son SOLO de COSTO DIRECTO (materiales, mano de obra, equipos y subcontratos de cada trabajo). NO incluyas como partidas los Gastos Generales ni la Utilidad — el profesional residente, el prevencionista de riesgos, garantías, seguros, gastos financieros, consumos mensuales, aseo final y gastos de oficina se calculan aparte como Gastos Generales según el plazo de la obra. NO inventes cantidades ni precios unitarios — el responsable del proyecto los completará manualmente. Responde EXCLUSIVAMENTE con un array JSON válido, sin texto adicional ni markdown, con este formato exacto:
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

// ─── PRESUPUESTO PRECISO (preguntas técnicas dinámicas + itemizado con cantidades y precio referencial) ──

export interface PreguntaTecnicaIA {
  id: string;
  pregunta: string;
  tipo: 'numero' | 'texto' | 'seleccion';
  /** Solo si tipo === 'numero' (ej. "m2", "ml", "un"). */
  unidad?: string;
  /** Solo si tipo === 'seleccion'. */
  opciones?: string[];
}

/**
 * Analiza el proyecto y propone entre 3 y 6 preguntas técnicas ESPECÍFICAS para ESTE caso
 * particular (ej. para "cambio de cubierta": m2 de techumbre, tipo de estructura, si lleva
 * aislación y de qué tipo) — son la base para calcular cantidades reales en
 * `sugerirItemizadoPrecisoConIA`, en vez de dejar todo en cantidad 0.
 */
export async function sugerirPreguntasTecnicasConIA(params: {
  nombre: string;
  descripcion?: string;
  tipoObra?: string;
  rubro?: string;
  uso?: string;
}): Promise<PreguntaTecnicaIA[]> {
  const contexto = [
    `Nombre del proyecto: "${params.nombre}"`,
    params.tipoObra ? `Tipo de obra: ${params.tipoObra}` : '',
    params.rubro ? `Rubro: ${params.rubro}` : '',
    params.uso ? `Uso del espacio: ${params.uso}` : '',
    params.descripcion ? `Descripción: ${params.descripcion}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `Eres un presupuestista experto en obras civiles y de infraestructura en Chile. Dado este proyecto:

${contexto}

Determina qué datos técnicos específicos necesitas conocer de ESTE proyecto en particular para poder calcular cantidades de obra reales (metros cuadrados, metros lineales, tipo de estructura, tipo de materialidad, si lleva o no ciertas partidas opcionales, etc.), en vez de asumirlos. Propone entre 3 y 6 preguntas, las mínimas e imprescindibles para dimensionar el presupuesto — no preguntes nada que no cambie una cantidad o partida del itemizado. Responde EXCLUSIVAMENTE con un array JSON válido, sin texto adicional ni markdown, con este formato exacto:
[{"id":"m2_techumbre","pregunta":"¿Cuántos m2 tiene la techumbre a intervenir?","tipo":"numero","unidad":"m2"}, {"id":"tipo_estructura","pregunta":"¿La estructura de soporte es metálica o de madera?","tipo":"seleccion","opciones":["Metálica","Madera","No sé / a definir en terreno"]}, {"id":"lleva_aislacion","pregunta":"¿Lleva aislación térmica? ¿De qué tipo?","tipo":"texto"}]
"tipo" debe ser exactamente "numero", "texto" o "seleccion". Usa "numero" con su "unidad" (m2, ml, m3, un, etc.) siempre que la respuesta sea una cantidad medible; usa "seleccion" con "opciones" (incluyendo una opción tipo "No sé / a definir en terreno") cuando haya alternativas típicas conocidas; usa "texto" solo si no calza en las anteriores.`;

  const content = await llamarIA(prompt, 1500);
  const parsed = parsearArregloJsonDeIA(content);

  return parsed
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x, i) => ({
      id: String(x.id ?? `pregunta-${i + 1}`),
      pregunta: String(x.pregunta ?? '').trim(),
      tipo: (x.tipo === 'numero' || x.tipo === 'seleccion' ? x.tipo : 'texto') as PreguntaTecnicaIA['tipo'],
      unidad: x.unidad ? String(x.unidad).trim() : undefined,
      opciones: Array.isArray(x.opciones) ? x.opciones.map(o => String(o)) : undefined,
    }))
    .filter(x => x.pregunta.length > 0);
}

export interface ItemItemizadoPrecisoSugeridoIA {
  item: string;
  descripcion: string;
  unidad: string;
  fase: string;
  cantidad: number;
  /** Estimación de mercado chileno propuesta por la IA — NO es una cotización real, se marca
   * como referencial en la UI y el usuario debe validarla o reemplazarla. */
  precioUnitarioReferencial: number;
  /** Rango de mercado regional que la IA considera razonable (del contratista más económico al más caro). */
  precioMinimo?: number;
  precioMaximo?: number;
  /** Mediana de precios unitarios reales ofertados a la universidad en partidas similares, si las hay. */
  precioHistorico?: { mediana: number; cantidad: number };
}

/** Promedio de mínimo, típico y máximo: deja el precio en la media del rango, sin irse a los extremos. */
function precioEnLaMedia(minimo: number, tipico: number, maximo: number): number {
  const valores = [minimo, tipico, maximo].filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!valores.length) return 0;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  return Math.round(media);
}

/**
 * Igual que `sugerirItemizadoConIA`, pero a partir de las respuestas técnicas del usuario
 * (ver `sugerirPreguntasTecnicasConIA`) calcula además la CANTIDAD real de cada partida y
 * propone un precio unitario referencial de mercado chileno. A diferencia de la sugerencia
 * simple, aquí sí se le pide a la IA estimar precios — quedan marcados como no vinculantes
 * (`precioReferencial: true` en el itemizado) para que el usuario los valide antes de usarlos
 * como Presupuesto Estimado oficial.
 */
export async function sugerirItemizadoPrecisoConIA(params: {
  nombre: string;
  descripcion?: string;
  tipoObra?: string;
  rubro?: string;
  uso?: string;
  respuestas: { pregunta: string; respuesta: string }[];
}): Promise<ItemItemizadoPrecisoSugeridoIA[]> {
  const contexto = [
    `Nombre del proyecto: "${params.nombre}"`,
    params.tipoObra ? `Tipo de obra: ${params.tipoObra}` : '',
    params.rubro ? `Rubro: ${params.rubro}` : '',
    params.uso ? `Uso del espacio: ${params.uso}` : '',
    params.descripcion ? `Descripción: ${params.descripcion}` : '',
  ].filter(Boolean).join('\n');

  const listaRespuestas = params.respuestas
    .filter(r => r.respuesta.trim().length > 0)
    .map(r => `- ${r.pregunta}: ${r.respuesta}`)
    .join('\n') || '(sin datos adicionales — estime con criterio conservador)';

  const catalogoFases = FASES_ITEMIZADO.map(f => `"${f}"`).join(', ');

  const prompt = `Eres un presupuestista experto en obras civiles y de infraestructura en Chile, trabajando para la Subdirección de Infraestructura de una universidad. Proyecto:

${contexto}

Datos técnicos entregados por el responsable del proyecto:
${listaRespuestas}

Con esos datos, propone entre 6 y 14 partidas de itemizado (Bill of Quantities), en el orden lógico de ejecución de la obra. Para cada partida:
- Clasifícala en EXACTAMENTE una de estas fases (texto tal cual, sin inventar otras): ${catalogoFases}.
- Calcula una CANTIDAD real (no 0) a partir de los datos entregados — si un dato no fue precisado, estímalo con criterio profesional conservador a partir del resto del contexto (ej. metros lineales de cumbrera o canaletas a partir del m2 y la geometría típica de una techumbre) y dilo implícito en la cantidad, sin inventar partidas que no correspondan al alcance.
- Estima el precio unitario en pesos chilenos (CLP, sin IVA) a COSTO DIRECTO: solo materiales, mano de obra (con leyes sociales), equipos y pérdidas de esa partida, SIN Gastos Generales ni Utilidad del contratista (se suman después sobre el total). Es una estimación orientativa, no una cotización real.
- Calcula cada precio como un análisis de precio unitario: materiales a precio de distribuidor/ferretería mayorista, mano de obra con rendimientos normales (HH por unidad) y tarifas de contratistas pequeños y medianos de REGIÓN (Temuco, La Araucanía). Las partidas globales (gl) deben ser acotadas al alcance real (ej. la instalación de faenas de una obra menor es un monto acotado).
- Entrega TRES valores por partida: "precioMinimo" (lo que cobraría un contratista económico pero serio), "precioMaximo" (un contratista caro pero razonable, sin sobreprecios anómalos) y "precioUnitarioReferencial" (el precio TÍPICO, en la MEDIA del mercado). El precio típico debe quedar al centro del rango: ni el más barato ni el más caro, sin márgenes de seguridad ni recortes.
No todas las fases son obligatorias — usa solo las que apliquen. Las partidas son SOLO de COSTO DIRECTO (materiales, mano de obra, equipos y subcontratos de cada trabajo). NO incluyas como partidas los Gastos Generales ni la Utilidad — el profesional residente, el prevencionista de riesgos, garantías, seguros, gastos financieros, consumos mensuales, aseo final y gastos de oficina se calculan aparte como Gastos Generales según el plazo de la obra. Responde EXCLUSIVAMENTE con un array JSON válido, sin texto adicional ni markdown, con este formato exacto:
[{"item":"1.1","fase":"Obra Gruesa","descripcion":"...","unidad":"m2","cantidad":120,"precioMinimo":15000,"precioUnitarioReferencial":18000,"precioMaximo":21000}, ...]
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
      cantidad: Math.max(0, Number(x.cantidad ?? 0)),
      ...(() => {
        const tipico = Math.max(0, Number(x.precioUnitarioReferencial ?? 0));
        const minimo = Math.max(0, Number(x.precioMinimo ?? tipico));
        const maximo = Math.max(0, Number(x.precioMaximo ?? tipico));
        return {
          precioUnitarioReferencial: precioEnLaMedia(minimo, tipico, maximo),
          precioMinimo: Math.min(minimo, maximo) || undefined,
          precioMaximo: Math.max(minimo, maximo) || undefined,
        };
      })(),
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
