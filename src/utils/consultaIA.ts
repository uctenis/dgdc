// Asistente de consultas de espacios: la IA solo traduce la pregunta a una consulta (filtros, agrupación y medida);
// las cifras las calcula el sistema con los datos reales, así la IA no puede inventar números.
import { agrupar, filtrar, totales, type Dimension, type FilaAnalisis, type Filtros, type Grupo, type Medida, type Totales } from './analisisEspacios';

const DIMS: Dimension[] = ['campus', 'edificio', 'piso', 'tipo', 'uso', 'unidad', 'clase', 'estado', 'tenencia'];
const MEDIDAS_VALIDAS: Medida[] = ['util', 'oguc', 'recintos', 'capacidad', 'ocupantes'];

export interface PlanConsulta {
  /** Cómo entendió la pregunta, en una frase. */
  interpretacion: string;
  filtros: Partial<Record<Dimension, string[]>> & { codigos?: string[]; texto?: string };
  agrupar?: Dimension | null;
  medida: Medida;
  listar?: boolean;
  /** Si la pregunta no se puede responder con estos datos, la razón (y no se calcula nada). */
  noAplica?: string | null;
}

export interface ResultadoConsulta {
  plan: PlanConsulta;
  filas: FilaAnalisis[];
  totales: Totales;
  grupos: Grupo[];
  /** Valores que la IA nombró y no existen en los datos (para avisar). */
  sinCoincidencia: string[];
  /** Filtros con los valores reales (para abrir la misma consulta en Análisis). */
  filtrosAplicados: Filtros;
  /** Si no hubo resultados: qué pasa al quitar cada filtro (para orientar: «la unidad está en CJP02 y CRC09»). */
  sinFiltro?: { dimension: Dimension; recintos: number; donde: { clave: string; recintos: number }[] }[];
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'al', 'para', 'por', 'con']);

/**
 * ¿Es `sigla` la sigla de `nombre`? Cada palabra importante aporta el comienzo de sí misma, en orden:
 * DDPER = Dirección de Desarrollo de PERsonas, DGDC = Dirección de Gestión y Desarrollo de Campus, VRA = VicerRectoría Académica.
 */
export function esSiglaDe(sigla: string, nombre: string): boolean {
  const s = norm(sigla).replace(/[^a-z]/g, '');
  const palabras = norm(nombre).split(/[^a-z]+/).filter(p => p && !MENORES.has(p));
  if (s.length < 2 || s.length > 10 || palabras.length < 2 || norm(sigla).includes(' ')) return false;
  if (sigla !== sigla.toUpperCase() && s.length > 6) return false;   // una palabra común larga no es sigla
  const probar = (i: number, j: number): boolean => {
    if (i === s.length) return j === palabras.length;
    if (j === palabras.length) return false;
    const p = palabras[j];
    // «Vicerrectoría» puede aportar «V» o «VR» (vice + rectoría).
    for (let k = 1; k <= Math.min(p.length, s.length - i); k++) {
      const trozo = s.slice(i, i + k);
      if (!(p.startsWith(trozo) || (p.startsWith('vicerrector') && 'vr'.startsWith(trozo)))) break;
      if (probar(i + k, j + 1)) return true;
    }
    return false;
  };
  return probar(0, 0);
}

/**
 * Catálogo de valores existentes (para que la IA use nombres reales). Con `pregunta`, se recorta a lo que la pregunta
 * menciona más los valores frecuentes: una instrucción más corta hace que la IA responda bastante más rápido.
 */
export function catalogo(filas: FilaAnalisis[], nombresCampus: Record<string, string>, pregunta?: string) {
  const palabras = pregunta ? norm(pregunta).split(/[^a-z0-9_]+/).filter(p => p.length >= 4 || /\d/.test(p)) : [];
  const siglas = pregunta ? pregunta.split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/).filter(w => w.length >= 2 && w.length <= 10) : [];
  const menciona = (v: string) => {
    const n = norm(v);
    return palabras.some(p => n.includes(p) || (p.length >= 5 && p.includes(n) && n.length >= 4)) || siglas.some(sg => esSiglaDe(sg, v));
  };
  const recortar = (valores: string[], frecuentes: number) => (pregunta ? valores.filter((v, i) => i < frecuentes || menciona(v)) : valores);
  const contar = (valores: string[]) => {
    const m = new Map<string, number>();
    for (const v of valores) if (v) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const edificios = new Map<string, string>();
  for (const f of filas) if (!edificios.has(f.edificio)) edificios.set(f.edificio, f.edificioNombre);
  return {
    campus: Object.entries(nombresCampus),
    // Todos los edificios van con su código; el nombre, solo los que la pregunta menciona (o todos, sin pregunta).
    edificios: [...edificios.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
      .map(([c, n]): [string, string] => [c, !pregunta || menciona(`${c} ${n}`) ? n : '']),
    pisos: contar(filas.map(f => f.piso)).map(([v]) => v),
    tipos: recortar(contar(filas.map(f => f.tipo)).slice(0, 200).map(([v]) => v), 45),
    usos: recortar(contar(filas.map(f => f.uso)).slice(0, 80).map(([v]) => v), 30),
    unidades: recortar(contar(filas.flatMap(f => f.unidades)).slice(0, 400).map(([v]) => v), 25),
    clases: contar(filas.map(f => f.clase)).map(([v]) => v),
    ejemplosCodigo: filas.slice(0, 2000).filter((_, i) => i % 400 === 0).map(f => f.codigo),
  };
}

/** Instrucción para la IA: el catálogo, la conversación previa y la pregunta. Debe responder solo un JSON. */
export function armarPrompt(pregunta: string, cat: ReturnType<typeof catalogo>, previas: { pregunta: string; plan: PlanConsulta }[] = []): string {
  return `Eres el asistente del Gestor de Espacios de la Universidad Católica de Temuco. Traduce la pregunta del usuario
a una CONSULTA sobre la tabla de recintos (salas, oficinas, baños, etc.). NO calcules cifras: el sistema las calcula.

Cada recinto tiene: campus, edificio (código), piso (nombre), código del recinto, tipo (su nombre: Oficina, Sala de clases…),
uso, unidad(es) usuaria(s), clase de superficie (útil / común), estado, tenencia, superficie útil (m²), superficie OGUC (m²),
capacidad (personas) y ocupantes (personas con nombre, cargo y unidad).

Responde SOLO un objeto JSON, sin texto alrededor, con esta forma:
{"interpretacion": "frase corta en español con lo que se va a calcular",
 "filtros": {"campus": [], "edificio": [], "piso": [], "tipo": [], "uso": [], "unidad": [], "clase": [], "estado": [], "tenencia": [],
             "codigos": [], "texto": ""},
 "agrupar": null, "medida": "util", "listar": true, "noAplica": null}

Reglas:
- Usa valores del catálogo de abajo (copia el texto exacto); el catálogo puede estar resumido: si el usuario nombra una unidad o tipo que no aparece, escríbelo tal como lo dijo. Omite los filtros que no se piden.
- "campus": siglas (CJP, CSF…). "edificio": códigos (CSF16, CJP01…). Si nombran un edificio por su nombre, usa su código.
- "codigos": códigos de recintos puntuales que el usuario nombre (ej. "CSF16_301"). Si da solo el número y el edificio, escribe el número ("301") y pon el edificio en "edificio".
- Las unidades suelen nombrarse por su sigla (DDPER = Dirección de Desarrollo de Personas, DGDC = Dirección de Gestión y Desarrollo de Campus). Si usan una sigla, pon en "unidad" la sigla Y el nombre completo que le corresponda del catálogo.
- "texto": palabras para buscar en código, tipo, uso, unidad u ocupantes (ej. el nombre de una persona). Úsalo solo si nada más sirve.
- "medida": util (m² útiles, por defecto para superficies), oguc (m² OGUC), recintos (cantidad), capacidad, ocupantes (personas).
- "agrupar": una de campus, edificio, piso, tipo, uso, unidad, clase, estado, tenencia, cuando pidan un desglose o comparación ("por piso", "cada edificio"), si no null.
- "listar": true si piden ver los recintos o son pocos; false para totales de muchos recintos.
- Si la pregunta sigue a una anterior ("¿y en el piso 2?", "de esas…"), parte de los filtros de la consulta previa.
- Si no se puede responder con estos datos (p. ej. costos, fechas de obras), pon la razón en "noAplica".

Catálogo:
CAMPUS: ${cat.campus.map(([s, n]) => `${s}=${n}`).join('; ')}
EDIFICIOS: ${cat.edificios.map(([c, n]) => (n ? `${c}=${n}` : c)).join('; ')}
PISOS: ${cat.pisos.join('; ')}
TIPOS: ${cat.tipos.join('; ')}
USOS: ${cat.usos.join('; ')}
UNIDADES: ${cat.unidades.join('; ')}
CLASES: ${cat.clases.join('; ')}
ESTADOS: Operativo; En obra; Fuera de servicio; Eliminado
Ejemplos de código de recinto: ${cat.ejemplosCodigo.join(', ')}
${previas.length ? `\nConversación previa (de la más antigua a la más reciente):\n${previas.map(p => `- Pregunta: ${p.pregunta}\n  Consulta: ${JSON.stringify({ filtros: p.plan.filtros, agrupar: p.plan.agrupar, medida: p.plan.medida })}`).join('\n')}\n` : ''}
Pregunta: ${pregunta}`;
}

/** Lee el JSON que respondió la IA y lo deja dentro de lo permitido. */
export function leerPlan(texto: string): PlanConsulta {
  const limpio = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const bruto = JSON.parse(limpio.match(/\{[\s\S]*\}/)?.[0] || limpio) as Record<string, unknown>;
  const f = (bruto.filtros || {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : typeof v === 'string' && v.trim() ? [v.trim()] : []);
  const filtros: PlanConsulta['filtros'] = {};
  for (const d of DIMS) { const v = lista(f[d]); if (v.length) filtros[d] = v; }
  const codigos = lista(f.codigos);
  if (codigos.length) filtros.codigos = codigos;
  if (typeof f.texto === 'string' && f.texto.trim()) filtros.texto = f.texto.trim();
  const g = String(bruto.agrupar || '');
  const m = String(bruto.medida || 'util');
  return {
    interpretacion: String(bruto.interpretacion || '').trim(),
    filtros,
    agrupar: DIMS.includes(g as Dimension) ? (g as Dimension) : null,
    medida: MEDIDAS_VALIDAS.includes(m as Medida) ? (m as Medida) : 'util',
    listar: bruto.listar !== false,
    noAplica: typeof bruto.noAplica === 'string' && bruto.noAplica.trim() ? bruto.noAplica.trim() : null,
  };
}

/** Valores reales que corresponden a lo que nombró la IA (sin importar mayúsculas ni tildes; si no, por contenido). */
function emparejar(pedidos: string[], existentes: string[], sinCoincidencia: string[], conSiglas = false): string[] {
  const porNorma = new Map(existentes.map(v => [norm(v), v]));
  const salida = new Set<string>();
  for (const p of pedidos) {
    const n = norm(p);
    const exacto = porNorma.get(n);
    // Una sigla también trae los nombres completos que le corresponden (DDPER → Dirección de Desarrollo de Personas).
    const expandidos = conSiglas ? existentes.filter(v => esSiglaDe(p, v)) : [];
    expandidos.forEach(v => salida.add(v));
    if (exacto) { salida.add(exacto); continue; }
    if (expandidos.length) continue;
    const parecidos = existentes.filter(v => norm(v).includes(n) || (n.length > 4 && n.includes(norm(v))));
    if (parecidos.length) parecidos.forEach(v => salida.add(v)); else sinCoincidencia.push(p);
  }
  return [...salida];
}

/** Ejecuta la consulta sobre los recintos (vigentes, salvo que se filtre por estado). */
export function ejecutarPlan(todas: FilaAnalisis[], plan: PlanConsulta): ResultadoConsulta {
  const sinCoincidencia: string[] = [];
  const base = todas.filter(f => plan.filtros.estado?.length || (f.vigente ?? f.estado !== 'Eliminado'));
  const filtros: Filtros = {};
  for (const d of DIMS) {
    const pedidos = plan.filtros[d];
    if (!pedidos?.length) continue;
    const existentes = [...new Set(base.flatMap(f => (d === 'unidad' ? f.unidades : [String(f[d as keyof FilaAnalisis] ?? '')])))].filter(Boolean);
    const valores = emparejar(pedidos, existentes, sinCoincidencia, d === 'unidad');
    filtros[d] = valores.length ? valores : ['__ninguno__'];
  }
  if (plan.filtros.texto) filtros.texto = plan.filtros.texto;
  let filas = filtrar(base, filtros);
  const codigos = plan.filtros.codigos?.map(norm) || [];
  if (codigos.length) {
    filas = filas.filter(f => {
      const c = norm(f.codigo);
      return codigos.some(x => c === x || c.endsWith(`_${x}`) || c.endsWith(`-${x}`) || (x.length >= 3 && c.endsWith(x)));
    });
    for (const x of plan.filtros.codigos || []) if (!filas.some(f => norm(f.codigo).endsWith(norm(x)))) sinCoincidencia.push(x);
  }
  // Sin resultados: se prueba quitando cada filtro, para decir dónde sí hay (p. ej. la unidad está en otro edificio).
  let sinFiltro: ResultadoConsulta['sinFiltro'];
  const activos = DIMS.filter(d => filtros[d]?.length);
  if (!filas.length && activos.length >= 2) {
    sinFiltro = activos.map(d => {
      const resto = filtrar(base, { ...filtros, [d]: undefined });
      return { dimension: d, recintos: resto.length, donde: agrupar(resto, d, 'recintos').slice(0, 6).map(g => ({ clave: g.clave, recintos: g.recintos })) };
    }).filter(x => x.recintos > 0);
  }
  return { plan, filas, totales: totales(filas), grupos: plan.agrupar ? agrupar(filas, plan.agrupar, plan.medida) : [], sinCoincidencia, filtrosAplicados: filtros, sinFiltro };
}
