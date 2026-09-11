/**
 * Utilidad de corrección ortográfica y tipográfica para español (Chile).
 * Corrige tildes comunes en el ámbito de infraestructura, construcción y compras institucionales,
 * e impone mayúscula inicial en oraciones.
 */

// Pares [forma sin tilde, forma correcta] — reemplazo exacto de palabra completa,
// sin ambigüedad (a diferencia de la corrección por distancia de edición de más abajo,
// esto nunca puede "adivinar mal": son errores 1 a 1 conocidos de antemano).
const PARES_ORTOGRAFICOS: [string, string][] = [
  // Términos de proceso de licitación / gestión de proyectos
  ['instalacion', 'instalación'], ['iluminacion', 'iluminación'],
  ['construccion', 'construcción'], ['remodelacion', 'remodelación'],
  ['ampliacion', 'ampliación'], ['mantencion', 'mantención'],
  ['climatizacion', 'climatización'], ['especificacion', 'especificación'],
  ['especificaciones', 'especificaciones'], ['tecnica', 'técnica'], ['tecnico', 'técnico'],
  ['tecnicas', 'técnicas'], ['tecnicos', 'técnicos'], ['recepcion', 'recepción'],
  ['evaluacion', 'evaluación'], ['adjudicacion', 'adjudicación'], ['cotizacion', 'cotización'],
  ['cotizaciones', 'cotizaciones'], ['ubicacion', 'ubicación'], ['direccion', 'dirección'],
  ['observacion', 'observación'], ['observaciones', 'observaciones'], ['licitacion', 'licitación'],
  ['licitaciones', 'licitaciones'], ['descripcion', 'descripción'], ['garantia', 'garantía'],
  ['garantias', 'garantías'], ['dias', 'días'], ['tambien', 'también'], ['segun', 'según'],
  ['ademas', 'además'], ['numero', 'número'], ['numeros', 'números'], ['codigo', 'código'],
  ['codigos', 'códigos'], ['requisito', 'requisito'], ['requisitos', 'requisitos'],
  ['presupuesto', 'presupuesto'], ['ejecucion', 'ejecución'], ['inspeccion', 'inspección'],
  ['fiscalizacion', 'fiscalización'], ['supervision', 'supervisión'], ['certificacion', 'certificación'],
  ['habilitacion', 'habilitación'], ['autorizacion', 'autorización'], ['demolicion', 'demolición'],
  ['excavacion', 'excavación'], ['fundacion', 'fundación'], ['fundaciones', 'fundaciones'],
  ['pavimentacion', 'pavimentación'], ['senaletica', 'señalética'], ['sustitucion', 'sustitución'],
  ['reparacion', 'reparación'], ['reparaciones', 'reparaciones'], ['filtracion', 'filtración'],
  ['filtraciones', 'filtraciones'], ['verificacion', 'verificación'], ['notificacion', 'notificación'],
  ['modificacion', 'modificación'], ['clasificacion', 'clasificación'], ['planificacion', 'planificación'],
  ['organizacion', 'organización'], ['administracion', 'administración'], ['coordinacion', 'coordinación'],
  ['distribucion', 'distribución'], ['produccion', 'producción'], ['reduccion', 'reducción'],
  ['ampliaciones', 'ampliaciones'], ['renovacion', 'renovación'], ['adecuacion', 'adecuación'],
  ['habilitaciones', 'habilitaciones'], ['perforacion', 'perforación'], ['demoliciones', 'demoliciones'],
  ['proyeccion', 'proyección'], ['inversion', 'inversión'], ['gestion', 'gestión'],
  // Adjetivos / sustantivos comunes con tilde
  ['electrica', 'eléctrica'], ['electrico', 'eléctrico'], ['electricas', 'eléctricas'],
  ['electricos', 'eléctricos'], ['hormigon', 'hormigón'], ['pabellon', 'pabellón'],
  ['pabellones', 'pabellones'], ['academico', 'académico'], ['academica', 'académica'],
  ['academicos', 'académicos'], ['academicas', 'académicas'], ['publico', 'público'],
  ['publica', 'pública'], ['publicos', 'públicos'], ['publicas', 'públicas'],
  ['atencion', 'atención'], ['informacion', 'información'], ['situacion', 'situación'],
  ['condicion', 'condición'], ['condiciones', 'condiciones'], ['relacion', 'relación'],
  ['articulo', 'artículo'], ['articulos', 'artículos'], ['capitulo', 'capítulo'],
  ['ultimo', 'último'], ['ultima', 'última'], ['ultimos', 'últimos'], ['ultimas', 'últimas'],
  ['unico', 'único'], ['unica', 'única'], ['unicos', 'únicos'], ['unicas', 'únicas'],
  ['maximo', 'máximo'], ['maxima', 'máxima'], ['maximos', 'máximos'], ['maximas', 'máximas'],
  ['minimo', 'mínimo'], ['minima', 'mínima'], ['minimos', 'mínimos'], ['minimas', 'mínimas'],
  ['rapido', 'rápido'], ['rapida', 'rápida'], ['practico', 'práctico'], ['practica', 'práctica'],
  ['basico', 'básico'], ['basica', 'básica'], ['basicos', 'básicos'], ['basicas', 'básicas'],
  ['sistematico', 'sistemático'], ['automatico', 'automático'], ['periodico', 'periódico'],
  ['deposito', 'depósito'], ['depositos', 'depósitos'], ['proposito', 'propósito'],
  ['facil', 'fácil'], ['dificil', 'difícil'], ['util', 'útil'], ['utiles', 'útiles'],
  ['perdida', 'pérdida'], ['perdidas', 'pérdidas'], ['debil', 'débil'], ['debiles', 'débiles'],
  ['jovenes', 'jóvenes'], ['examen', 'examen'], ['origen', 'origen'], ['volumen', 'volumen'],
  ['metrica', 'métrica'], ['metricas', 'métricas'], ['fisico', 'físico'], ['fisica', 'física'],
  ['quimico', 'químico'], ['quimica', 'química'], ['logico', 'lógico'], ['logica', 'lógica'],
  ['critico', 'crítico'], ['critica', 'crítica'], ['practicamente', 'prácticamente'],
  ['especificamente', 'específicamente'], ['tecnicamente', 'técnicamente'],
  ['economico', 'económico'], ['economica', 'económica'], ['economicos', 'económicos'],
  ['economicas', 'económicas'], ['periodo', 'período'], ['periodos', 'períodos'],
];

const REEMPLAZOS_ORTOGRAFICOS: [RegExp, string][] = PARES_ORTOGRAFICOS
  .filter(([mal, bien]) => mal !== bien)
  .map(([mal, bien]) => [new RegExp(`\\b${mal}\\b`, 'gi'), bien]);

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
 * respetando siglas institucionales (UCT, VRAE, DGDC, CP, OT, OP, etc.) y preposiciones en minúscula.
 */
export function formatearNombreTitulo(texto: string): string {
  if (!texto) return '';

  const corregido = corregirOrtografiaEspanol(texto.trim());
  const minusculas = new Set(['de', 'del', 'en', 'y', 'e', 'a', 'al', 'con', 'para', 'por', 'las', 'los', 'la', 'el', 'un', 'una', 'unos', 'unas']);
  const siglas = new Set(['UCT', 'VRAE', 'DGDC', 'CP', 'OP', 'OT', 'HVAC', 'LED', 'EETT', 'CJPII', 'CJP', 'CSF', 'CRC', 'CLL', 'RUA', 'CC']);

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

// ═══════════════════════════════════════════════════════════════════
// CORRECTOR INTELIGENTE (distancia de edición, estilo Norvig)
// Para texto libre extenso (ej. descripción del proyecto), donde además de
// tildes de dominio hay errores de tipeo reales (letra de más/menos, letras
// trocadas, tecla vecina). El diccionario fijo de arriba no detecta eso —
// esto sí, comparando cada palabra desconocida contra un vocabulario base
// mediante ediciones de 1 y 2 pasos (inserción, borrado, sustitución,
// transposición), igual que un corrector ortográfico real, sin depender de
// ningún servicio externo.
// ═══════════════════════════════════════════════════════════════════

// Vocabulario base ordenado aproximadamente por frecuencia de uso (las primeras
// entradas ganan el desempate entre varias correcciones igualmente válidas).
const VOCABULARIO_BASE: string[] = [
  // Palabras funcionales de altísima frecuencia
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'se', 'del', 'las', 'un', 'por', 'con',
  'no', 'una', 'su', 'para', 'es', 'al', 'lo', 'como', 'más', 'o', 'pero', 'sus', 'le',
  'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre',
  'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante',
  'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e',
  'esto', 'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él',
  'tanto', 'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella',
  'estar', 'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tú', 'te', 'ti', 'tu',
  'tus', 'ellas', 'nosotras', 'vosotros', 'vosotras', 'os', 'mío', 'mía', 'míos', 'mías',
  'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya', 'suyos', 'suyas', 'nuestro', 'nuestra',
  'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras', 'esos', 'esas',
  // Verbos comunes (formas base y conjugaciones frecuentes)
  'ser', 'haber', 'tener', 'hacer', 'poder', 'decir', 'ir', 'ver', 'dar', 'saber', 'querer',
  'llegar', 'pasar', 'deber', 'poner', 'parecer', 'quedar', 'creer', 'hablar', 'llevar',
  'dejar', 'seguir', 'encontrar', 'llamar', 'venir', 'pensar', 'salir', 'volver', 'tomar',
  'conocer', 'vivir', 'sentir', 'tratar', 'mirar', 'contar', 'empezar', 'esperar', 'buscar',
  'existir', 'entrar', 'trabajar', 'escribir', 'perder', 'producir', 'ocurrir', 'entender',
  'pedir', 'recibir', 'recordar', 'terminar', 'permitir', 'aparecer', 'conseguir', 'comenzar',
  'servir', 'sacar', 'necesitar', 'mantener', 'resultar', 'leer', 'caer', 'cambiar',
  'presentar', 'crear', 'abrir', 'considerar', 'oír', 'acabar', 'convertir', 'ganar',
  'formar', 'traer', 'partir', 'morir', 'aceptar', 'realizar', 'suponer', 'comprender',
  'lograr', 'explicar', 'preguntar', 'tocar', 'reconocer', 'estudiar', 'alcanzar', 'nacer',
  'dirigir', 'correr', 'utilizar', 'pagar', 'ayudar', 'gustar', 'jugar', 'escuchar',
  'cumplir', 'ofrecer', 'descubrir', 'levantar', 'intentar', 'usar', 'decidir', 'repetir',
  'enseñar', 'mostrar', 'señalar', 'continuar', 'es', 'son', 'fue', 'fueron', 'era', 'eran',
  'está', 'están', 'estaba', 'estuvo', 'tiene', 'tienen', 'tenía', 'hace', 'hacen', 'hizo',
  'puede', 'pueden', 'pudo', 'debe', 'deben', 'debía', 'va', 'van', 'iba', 'fue', 'sea',
  'sean', 'sería', 'serían', 'habrá', 'habría', 'hubo', 'había', 'dice', 'dicen', 'dijo',
  // Adjetivos y sustantivos generales frecuentes
  'bien', 'mal', 'bueno', 'buena', 'buenos', 'buenas', 'malo', 'mala', 'malos', 'malas',
  'grande', 'grandes', 'pequeño', 'pequeña', 'pequeños', 'pequeñas', 'nuevo', 'nueva',
  'nuevos', 'nuevas', 'mismo', 'misma', 'mismos', 'mismas', 'cada', 'todo', 'toda', 'todas',
  'general', 'principal', 'importante', 'posible', 'necesario', 'necesaria', 'actual',
  'público', 'pública', 'públicos', 'públicas', 'social', 'nacional', 'especial', 'total',
  'parte', 'forma', 'caso', 'vez', 'veces', 'lugar', 'lugares', 'tiempo', 'tiempos', 'año',
  'años', 'día', 'días', 'mes', 'meses', 'semana', 'semanas', 'hora', 'horas', 'manera',
  'tipo', 'tipos', 'cosa', 'cosas', 'trabajo', 'trabajos', 'persona', 'personas', 'sistema',
  'gobierno', 'estado', 'mundo', 'país', 'países', 'ciudad', 'ciudades', 'vida', 'grupo',
  'grupos', 'nivel', 'niveles', 'número', 'números', 'proceso', 'procesos', 'servicio',
  'servicios', 'área', 'áreas', 'agua', 'aguas', 'situación', 'situaciones', 'momento',
  'momentos', 'punto', 'puntos', 'problema', 'problemas', 'información', 'informaciones',
  'relación', 'relaciones', 'condición', 'condiciones', 'resultado', 'resultados', 'razón',
  'razones', 'hecho', 'hechos', 'medio', 'medios', 'precio', 'precios', 'mano', 'manos',
  'pesar', 'aquí', 'allí', 'ahí', 'así', 'entonces', 'luego', 'después', 'antes', 'siempre',
  'nunca', 'ahora', 'hoy', 'ayer', 'mañana', 'todavía', 'aún', 'apenas', 'casi', 'solo',
  'sólo', 'sola', 'solos', 'solas', 'incluso', 'además', 'aunque', 'mientras', 'cuando',
  'si', 'no', 'sino', 'pues', 'aunque', 'aún', 'según', 'mediante', 'dentro', 'fuera',
  'arriba', 'abajo', 'delante', 'detrás', 'encima', 'debajo', 'cerca', 'lejos', 'junto',
  'igual', 'menos', 'mucho', 'poco', 'demasiado', 'bastante', 'todo', 'nada', 'algo',
  'alguien', 'nadie', 'cualquier', 'cualquiera', 'varios', 'varias', 'ambos', 'ambas',
  // Vocabulario institucional / infraestructura / licitaciones (con tildes correctas)
  'tabiquería', 'instalación', 'instalaciones', 'iluminación', 'construcción',
  'remodelación', 'ampliación', 'mantención', 'mantenimiento', 'climatización',
  'especificación', 'especificaciones', 'técnica', 'técnico', 'técnicas', 'técnicos',
  'recepción', 'evaluación', 'adjudicación', 'cotización', 'cotizaciones', 'ubicación',
  'dirección', 'observación', 'observaciones', 'licitación', 'licitaciones', 'descripción',
  'garantía', 'garantías', 'código', 'habitabilidad', 'acondicionamiento', 'requisito',
  'requisitos', 'presupuesto', 'edificio', 'edificios', 'obra', 'obras', 'proyecto',
  'proyectos', 'contrato', 'contratos', 'contratista', 'contratistas', 'proveedor',
  'proveedores', 'oferta', 'ofertas', 'propuesta', 'propuestas', 'ejecución', 'inspección',
  'fiscalización', 'supervisión', 'certificación', 'habilitación', 'autorización',
  'financiero', 'financiera', 'económico', 'económica', 'arquitectura', 'ingeniería',
  'estructural', 'sanitario', 'sanitaria', 'eléctrico', 'eléctrica', 'gasfitería',
  'pintura', 'terminación', 'terminaciones', 'entrega', 'plazo', 'plazos', 'vigencia',
  'póliza', 'pólizas', 'boleta', 'boletas', 'factura', 'facturas', 'pago', 'pagos',
  'saldo', 'avance', 'avances', 'cronograma', 'itemizado', 'memoria', 'croquis', 'plano',
  'planos', 'permiso', 'permisos', 'certificado', 'certificados', 'resolución',
  'resoluciones', 'decreto', 'normativa', 'normativas', 'reglamento', 'campus', 'campo',
  'universidad', 'universitaria', 'infraestructura', 'ventana', 'ventanas', 'puerta',
  'puertas', 'muro', 'muros', 'piso', 'pisos', 'techo', 'techos', 'cubierta', 'cubiertas',
  'baño', 'baños', 'cocina', 'cocinas', 'oficina', 'oficinas', 'sala', 'salas', 'pasillo',
  'pasillos', 'estacionamiento', 'estacionamientos', 'jardín', 'jardines', 'aseo',
  'seguridad', 'incendio', 'incendios', 'alarma', 'alarmas', 'demolición', 'excavación',
  'fundación', 'fundaciones', 'hormigón', 'acero', 'madera', 'aluminio', 'vidrio',
  'pavimento', 'pavimentos', 'señalética', 'mobiliario', 'equipamiento',
];

const PALABRAS_CONOCIDAS = new Set(VOCABULARIO_BASE.map(w => w.toLowerCase()));
const INDICE_FRECUENCIA = new Map(VOCABULARIO_BASE.map((w, i) => [w.toLowerCase(), i]));
const ALFABETO_ES = 'abcdefghijklmnñopqrstuvwxyzáéíóúü'.split('');

function generarEdiciones(palabra: string): Set<string> {
  const splits: [string, string][] = [];
  for (let i = 0; i <= palabra.length; i++) splits.push([palabra.slice(0, i), palabra.slice(i)]);

  const resultado = new Set<string>();
  for (const [izq, der] of splits) {
    if (der) resultado.add(izq + der.slice(1)); // borrado
    if (der.length > 1) resultado.add(izq + der[1] + der[0] + der.slice(2)); // transposición
    if (der) for (const c of ALFABETO_ES) resultado.add(izq + c + der.slice(1)); // sustitución
    for (const c of ALFABETO_ES) resultado.add(izq + c + der); // inserción
  }
  return resultado;
}

function palabrasConocidasEntre(candidatas: Iterable<string>): string[] {
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const c of candidatas) {
    if (!vistas.has(c) && PALABRAS_CONOCIDAS.has(c)) {
      vistas.add(c);
      resultado.push(c);
    }
  }
  return resultado;
}

function mejorCandidata(candidatas: string[]): string {
  return candidatas.reduce((mejor, actual) => {
    const rangoMejor = INDICE_FRECUENCIA.get(mejor) ?? Infinity;
    const rangoActual = INDICE_FRECUENCIA.get(actual) ?? Infinity;
    return rangoActual < rangoMejor ? actual : mejor;
  });
}

function preservarCapitalizacion(original: string, corregida: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return corregida.toUpperCase();
  if (original.charAt(0) === original.charAt(0).toUpperCase()) {
    return corregida.charAt(0).toUpperCase() + corregida.slice(1);
  }
  return corregida;
}

/**
 * Corrige una palabra suelta contra el vocabulario base, probando ediciones de 1 paso
 * (borrado, inserción, sustitución, transposición de una letra).
 *
 * Deliberadamente NO se aplica a palabras cortas (menos de 6 letras): con tan poco
 * vocabulario base cubierto (no existe forma manual de listar todas las conjugaciones
 * del español), una palabra corta desconocida tiene casi siempre varios vecinos válidos
 * a distancia 1 — y sin contexto no hay forma confiable de saber cuál es la intención
 * real. Probado en la práctica: permitir palabras cortas producía falsos positivos serios
 * (p. ej. "pone" → "poner", "ba" → "la" en vez de "va"). Tampoco se usan ediciones de 2
 * pasos por el mismo motivo: cuantas más ediciones se permiten, más ambigüedad y más
 * probable "corregir" algo que ya estaba bien. Esta es la razón por la que, para una
 * corrección realmente inteligente y con contexto, conviene el botón "Mejorar con IA"
 * (rewriteTextWithAI en aiService.ts) cuando haya una clave de IA configurada.
 */
function corregirPalabraPorDistancia(original: string): string {
  const palabra = original.toLowerCase();

  if (palabra.length < 6 || palabra.length > 18 || /\d/.test(palabra)) return original;
  if (original === original.toUpperCase()) return original; // posible sigla/código institucional
  if (PALABRAS_CONOCIDAS.has(palabra)) return original;

  const candidatas = palabrasConocidasEntre(generarEdiciones(palabra));
  if (!candidatas.length) return original;
  return preservarCapitalizacion(original, mejorCandidata(candidatas));
}

/**
 * Corrector inteligente para texto libre extenso (ej. descripción del proyecto):
 * aplica primero el diccionario fijo de tildes de dominio y luego, palabra por
 * palabra, la corrección por distancia de edición contra el vocabulario base —
 * detecta errores de tipeo reales (letra de más/menos/trocada), no solo tildes.
 */
export function corregirTextoAvanzado(texto: string): string {
  if (!texto) return '';

  const conTildesDeDominio = corregirOrtografiaEspanol(texto);

  const tokens = conTildesDeDominio.split(/(\s+|[.,;:!?()"'«»¿¡\-—/]+)/);
  const corregido = tokens
    .map(token => (/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+$/.test(token) ? corregirPalabraPorDistancia(token) : token))
    .join('');

  return corregido.replace(/(^\s*|[.!?]\s+)([a-záéíóúñ])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}
