/**
 * Utilidad de corrección ortográfica y tipográfica para español (Chile).
 * Corrige tildes comunes en el ámbito de infraestructura, construcción y compras institucionales,
 * e impone mayúscula inicial en oraciones.
 */

const REEMPLAZOS_ORTOGRAFICOS: [RegExp, string][] = [
  [/\btabiqueria\b/gi, 'tabiquería'],
  [/\binstalacion\b/gi, 'instalación'],
  [/\binstalaciones\b/gi, 'instalaciones'],
  [/\biluminacion\b/gi, 'iluminación'],
  [/\bconstruccion\b/gi, 'construcción'],
  [/\bremodelacion\b/gi, 'remodelación'],
  [/\bampliacion\b/gi, 'ampliación'],
  [/\bmantencion\b/gi, 'mantención'],
  [/\bclimatizacion\b/gi, 'climatización'],
  [/\bespecificacion\b/gi, 'especificación'],
  [/\bespecificaciones\b/gi, 'especificaciones'],
  [/\btecnica\b/gi, 'técnica'],
  [/\btecnico\b/gi, 'técnico'],
  [/\btecnicas\b/gi, 'técnicas'],
  [/\btecnicos\b/gi, 'técnicos'],
  [/\brecepcion\b/gi, 'recepción'],
  [/\bevaluacion\b/gi, 'evaluación'],
  [/\badjudicacion\b/gi, 'adjudicación'],
  [/\bcotizacion\b/gi, 'cotización'],
  [/\bcotizaciones\b/gi, 'cotizaciones'],
  [/\bubicacion\b/gi, 'ubicación'],
  [/\bdireccion\b/gi, 'dirección'],
  [/\bobservacion\b/gi, 'observación'],
  [/\bobservaciones\b/gi, 'observaciones'],
  [/\blicitacion\b/gi, 'licitación'],
  [/\blicitaciones\b/gi, 'licitaciones'],
  [/\bdescripcion\b/gi, 'descripción'],
  [/\bgarantia\b/gi, 'garantía'],
  [/\bdias\b/gi, 'días'],
  [/\btambien\b/gi, 'también'],
  [/\bsegun\b/gi, 'según'],
  [/\bademas\b/gi, 'además'],
  [/\bnumero\b/gi, 'número'],
  [/\bcodigo\b/gi, 'código'],
  [/\bhabitabilidad\b/gi, 'habitabilidad'],
  [/\bacondicionamiento\b/gi, 'acondicionamiento'],
  [/\brequisito\b/gi, 'requisito'],
  [/\brequisitos\b/gi, 'requisitos'],
  [/\bpresupuesto\b/gi, 'presupuesto'],
];

/**
 * Aplica corrección ortográfica automática de tildes y mayúsculas de inicio de oración.
 */
export function corregirOrtografiaEspanol(texto: string): string {
  if (!texto) return '';

  let corregido = texto;

  // 1. Aplicar lista de tildes de infraestructura
  for (const [patron, reemplazo] of REEMPLAZOS_ORTOGRAFICOS) {
    corregido = corregido.replace(patron, match => {
      // Preservar Mayúscula Inicial si el original la tenía
      const esMayusculaInicial = match.charAt(0) === match.charAt(0).toUpperCase();
      if (esMayusculaInicial) {
        return reemplazo.charAt(0).toUpperCase() + reemplazo.slice(1);
      }
      return reemplazo;
    });
  }

  // 2. Mayúscula inicial tras punto y al inicio
  corregido = corregido.replace(/(^\s*|[.!?]\s+)([a-záéíóúñ])/g, (_, p1, p2) => p1 + p2.toUpperCase());

  return corregido;
}

/**
 * Convierte un nombre de proyecto o título a Formato Título (Title Case),
 * respetando siglas institucionales (UCT, VRAE, SGC, DGDC, CP, OT, OP, etc.) y preposiciones en minúscula.
 */
export function formatearNombreTitulo(texto: string): string {
  if (!texto) return '';

  const corregido = corregirOrtografiaEspanol(texto.trim());
  const minusculas = new Set(['de', 'del', 'en', 'y', 'e', 'a', 'al', 'con', 'para', 'por', 'las', 'los', 'la', 'el', 'un', 'una', 'unos', 'unas']);
  const siglas = new Set(['UCT', 'VRAE', 'DGDC', 'SGC', 'CP', 'OP', 'OT', 'HVAC', 'LED', 'EETT', 'CJPII', 'CJP', 'CSF', 'CRC', 'CLL', 'RUA', 'CC']);

  const palabras = corregido.split(/\s+/);
  const resultado = palabras.map((palabra, index) => {
    if (palabra.includes('-')) {
      return palabra
        .split('-')
        .map(sub => formatearNombreTitulo(sub))
        .join('-');
    }

    const limpia = palabra.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9]/g, '');
    const upper = limpia.toUpperCase();

    if (siglas.has(upper)) {
      return palabra.toUpperCase();
    }

    const lower = limpia.toLowerCase();
    if (index > 0 && minusculas.has(lower)) {
      return palabra.toLowerCase();
    }

    return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
  });

  return resultado.join(' ');
}

/** Regla institucional: los nombres de proyectos se almacenan y presentan siempre en mayúsculas. */
export function normalizarNombreProyecto(texto: string): string {
  if (!texto) return '';
  return corregirOrtografiaEspanol(texto)
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('es-CL');
}

/**
 * Atributos HTML estándar para activar la corrección nativa del navegador en español chileno.
 */
export const ATRIBUTOS_ORTOGRAFIA_ES = {
  spellCheck: true,
  lang: 'es-CL',
  autoCorrect: 'on',
  autoCapitalize: 'sentences',
};
