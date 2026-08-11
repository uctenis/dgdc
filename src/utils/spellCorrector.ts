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
 * Atributos HTML estándar para activar la corrección nativa del navegador en español chileno.
 */
export const ATRIBUTOS_ORTOGRAFIA_ES = {
  spellCheck: true,
  lang: 'es-CL',
  autoCorrect: 'on',
  autoCapitalize: 'sentences',
};
