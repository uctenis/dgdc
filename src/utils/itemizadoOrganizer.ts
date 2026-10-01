// ─── ORGANIZACIÓN DEL ITEMIZADO POR FASE ──────────────────────────────────
// Agrupa y renumera las partidas del Itemizado del Proyecto según su fase
// (Instalación de Faenas, Obra Gruesa, etc.) — usado tanto por el panel de
// edición (ItemizadoProyectoPanel) como por el exportador a Excel, para que
// ambos muestren exactamente el mismo orden y numeración.

import { FASES_ITEMIZADO } from '../types';
import type { ItemItemizadoProyecto } from '../types';

export const SIN_FASE = 'Sin fase asignada';

/**
 * Compara códigos de partida jerárquicos tipo "1", "1.2", "2.10" en orden numérico real por
 * segmento (no alfabético — si no, "2.10" quedaría antes que "2.9"). Un código más corto que
 * comparte el mismo prefijo va primero (ej. "2" antes que "2.1"), igual que en un itemizado real.
 */
export function compararCodigoItem(a: string, b: string): number {
  const segmentosA = String(a || '').split('.');
  const segmentosB = String(b || '').split('.');
  const largo = Math.max(segmentosA.length, segmentosB.length);
  for (let i = 0; i < largo; i++) {
    const segA = segmentosA[i];
    const segB = segmentosB[i];
    if (segA === undefined) return -1;
    if (segB === undefined) return 1;
    const numA = Number(segA);
    const numB = Number(segB);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
    if (segA !== segB) return segA.localeCompare(segB);
  }
  return 0;
}

/** Orden de agrupación: catálogo estándar primero (en su orden de ejecución), luego cualquier
 * fase "extra" no catalogada en el orden en que aparezca, y "Sin fase asignada" siempre al final. */
function ordenarClavesFase(claves: string[]): string[] {
  const set = new Set(claves);
  const catalogo = FASES_ITEMIZADO.filter(f => set.has(f));
  const extra = claves.filter(k => k !== SIN_FASE && !(FASES_ITEMIZADO as readonly string[]).includes(k));
  return [...catalogo, ...extra, ...(set.has(SIN_FASE) ? [SIN_FASE] : [])];
}

export function agruparPorFase(items: ItemItemizadoProyecto[]): { fase: string; items: ItemItemizadoProyecto[] }[] {
  const mapa = new Map<string, ItemItemizadoProyecto[]>();
  for (const it of items) {
    const clave = it.fase || SIN_FASE;
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave)!.push(it);
  }
  return ordenarClavesFase(Array.from(mapa.keys())).map(fase => ({ fase, items: mapa.get(fase)! }));
}

/**
 * Renumera TODAS las partidas de forma correlativa por fase — agrupa por la fase asignada a cada
 * partida (Instalación de Faenas, Obra Gruesa, etc.), en el orden estándar de ejecución, y asigna
 * el código de fase (1, 2, 3...) más subnumeración (1.1, 1.2...) dentro de cada una. Así, partidas
 * agregadas a mano quedan agrupadas junto a las que trajo la IA según la fase que se les asigne,
 * en vez de numerarse sueltas o chocar con una fase existente.
 */
export function renumerarPartidasCorrelativas(items: ItemItemizadoProyecto[]): ItemItemizadoProyecto[] {
  return agruparPorFase(items).flatMap((grupo, i) => {
    const numeroFase = i + 1;
    const ordenados = [...grupo.items].sort((a, b) => compararCodigoItem(a.item, b.item));
    return ordenados.length === 1
      ? [{ ...ordenados[0], item: String(numeroFase) }]
      : ordenados.map((it, j) => ({ ...it, item: `${numeroFase}.${j + 1}` }));
  });
}

// ─── FASE SUGERIDA PARA UNA PARTIDA ───────────────────────────────────────
// Un presupuesto armado fuera del sistema trae sus propios capítulos ("Obras preliminares", "Ventanas"…) o
// ninguno. Para no reasignar cada partida a mano, se le sugiere la fase estándar según lo que dice su
// descripción. Manda la palabra que aparece PRIMERO, porque una partida se nombra por lo principal
// ("Membrana hidrófuga… y sellos" es la membrana, no los sellos); si dos reglas calzan en el mismo lugar,
// gana la que está antes en esta lista.

type Fase = typeof FASES_ITEMIZADO[number];

const REGLAS_FASE: { fase: Fase; calza: RegExp; salvo?: RegExp }[] = [
  { fase: 'Aseo y Entrega', calza: /aseo|limpieza (final|integral|general)|retiro final|entrega|recepcion|puesta en (marcha|servicio)|prueba|medicion|balance de caudales|conforme a obra|as built|capacitacion|termografia/ },
  { fase: 'Instalación de Faenas', calza: /faena|andamio|linea(s)? de vida|medios auxiliares|plataforma|izaje|maniobra|cierre(s)? provisorio|cierros|senalizacion|segregacion|proteccion(es)? (de|del|contra|colectiva|basica)|proteccion(es)?,|levantamiento|replanteo|trazado|coordinacion|flete|transporte de materiales|movilizacion|acarreo/ },
  // "Retiro e instalación de ventanas" es la partida de la ventana, no un desarme.
  { fase: 'Desarme y Retiro', calza: /desarme|demolicion|desmontaje|desmantel|retiro|disposicion (autorizada|final)|escombro|residuos/, salvo: /suministro|instalacion|reposicion/ },
  { fase: 'Instalaciones', calza: /instalaciones|electric|circuito|trifasic|tablero de (fuerza|control|distribucion)|luminaria|iluminacion|enchufe|ducto|rejilla|templador|fan ?coil|bomba|chiller|caneria|tuberia|\bppr\b|condensado|hidraulic|hidronic|valvula|drenaje|sanitari|agua potable|alcantarillado|\bgas\b|climatiz|aire acondicionado|extractor|recuperador|\brc\d?\b|termostato|control (horario|inalambrico|motorizado|central)|uniones flexibles|tomas y descargas|estanque|colector|purga|refrigerante|red(es)? (de|hidraulica|principal)|montante|montaje (y conexion|mecanico)|puesta a tierra|corrientes debiles|aislacion de (ductos|red|caneria|tuberia)/ },
  { fase: 'Terminaciones', calza: /pintura|ventana|puerta|mampara|cielo|revestimiento|pisos?\b(?! \d)|pavimento|sello|burlete|remate|hojalater|terminacion|retoque|eifs|acabado|ceramic|porcelanato|guardapolvo|vidri|dvh|termopanel|quincalleria|canaleta|canal(es)?\b|bajada|cumbrera|forro|goteron|babeta|embud|registro|proteccion solar|tapajunta|velux|moldura|alfombra|papel mural/ },
  { fase: 'Obra Gruesa', calza: /obras civiles|estructura|hormigon|metalcon|cercha|perfil|osb|terciado|tablero|cubierta|plancha|pv\d|zinc|membrana|aislacion|aislad|lana|eps\b|poliestireno|poliuretano|anclaje|acero|radier|fundacion|albanileria|tabique|losa|barrera|lucarna|costanera|correa|emballetad|anticorrosiv|excavacion|zanja|moldaje|enfierradura|estuco|impermeabiliz|vapor|reparacion|entrada(s)?\/salida(s)? de aire/ },
];

const sinTildesMinusculas = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const faseSegunTexto = (texto: string): Fase | undefined => {
  const plano = sinTildesMinusculas(texto);
  let mejor: { fase: Fase; posicion: number } | undefined;
  for (const regla of REGLAS_FASE) {
    const posicion = plano.search(regla.calza);
    if (posicion < 0 || regla.salvo?.test(plano)) continue;
    if (!mejor || posicion < mejor.posicion) mejor = { fase: regla.fase, posicion };
  }
  return mejor?.fase;
};

/** Fase estándar que corresponde a una partida según su descripción; si no dice nada reconocible, según el
 * capítulo en que venía. `undefined` = no se pudo deducir. */
export function sugerirFasePartida(descripcion: string, capitulo?: string): Fase | undefined {
  const estandar = FASES_ITEMIZADO.find(f => sinTildesMinusculas(f) === sinTildesMinusculas(capitulo || '').trim());
  return estandar ?? faseSegunTexto(descripcion) ?? (capitulo ? faseSegunTexto(capitulo) : undefined);
}

/**
 * Asigna la fase estándar a las partidas que no tienen una (sin fase, o con un capítulo propio del archivo).
 * Las pocas que no se pueden deducir quedan en la fase más repetida del presupuesto, para que ninguna quede
 * suelta: en un proyecto de ventilación, lo que no se reconoce es casi siempre parte de las instalaciones.
 */
export function asignarFasesEstandar(items: ItemItemizadoProyecto[]): ItemItemizadoProyecto[] {
  const esEstandar = (fase?: string) => Boolean(fase && (FASES_ITEMIZADO as readonly string[]).includes(fase));
  const sugeridas = items.map(it => (esEstandar(it.fase) ? (it.fase as Fase) : sugerirFasePartida(it.descripcion, it.fase)));

  const conteo = new Map<Fase, number>();
  for (const fase of sugeridas) if (fase) conteo.set(fase, (conteo.get(fase) || 0) + 1);
  const masRepetida = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return items.map((it, i) => {
    const fase = sugeridas[i] ?? masRepetida;
    return fase && fase !== it.fase ? { ...it, fase } : it;
  });
}
