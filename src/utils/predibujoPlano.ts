// Predibujo de recintos en una lámina: busca en el texto del PDF el código de cada recinto y detecta el espacio
// cerrado por los muros que lo rodea (ver lienzoMuros.ts y deteccionRecintos.ts). Devuelve contornos con puntos de
// 0 a 1, como los de zonas_recinto.
import type * as pdfjsLib from 'pdfjs-dist';
import type { Recinto } from '../types/recintos';
import { COLOR_CIERRE, detectarRecintos, lineasDeCierre, mapaDeTrazos, mejorSemilla, puentesDeVanos, ventanasEntreMuros, type MapaTrazos } from './deteccionRecintos';
import { contextoSoloMuros, FRACCION_GROSOR_MURO, FRACCION_GROSOR_MURO_ESTRICTA, grosorDeMuro, proporcionTrazoIntermedio, type Segmento } from './lienzoMuros';
import { getConfigEspacios } from '../data/espaciosConfig';
import { centroide, denominadorEscala, type Punto } from './geometriaPlano';

const LADO_MAYOR_PX = 2500;   // resolución de trabajo: suficiente para ver los muros sin hacer lenta la detección
/** Ver proporcionTrazoIntermedio: en los baños CSN17 (solo la fachada) es 0,09; en la cabaña CSN15 (camas, sillón), 0,19. */
const PROPORCION_MUEBLES_GRUESOS = 0.13;

export interface ContornoDetectado {
  recinto_id: string;
  poligono: Punto[];
}

const normalizar = (s: string) => s.toUpperCase().replace(/\s+/g, '');

/** Rótulos de recintos en la página: el recinto y el rectángulo (en píxeles del viewport) que ocupa su código. */
async function rotulosEnPagina(page: pdfjsLib.PDFPageProxy, viewport: pdfjsLib.PageViewport, recintos: Recinto[]) {
  const texto = await page.getTextContent();
  const porCodigo = new Map(recintos.map(r => [normalizar(r.codigo), r]));
  // Si el plano rotula solo con el número («101»), se acepta cuando ese número es de un único recinto.
  const porSufijo = new Map<string, Recinto | null>();
  recintos.forEach(r => {
    const sufijo = normalizar(r.codigo).split('_').pop() || '';
    if (sufijo && sufijo !== normalizar(r.codigo)) porSufijo.set(sufijo, porSufijo.has(sufijo) ? null : r);
  });
  const hallados = new Map<string, { recinto: Recinto; caja: [number, number, number, number]; exacto: boolean }>();
  for (const item of texto.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const s = normalizar(item.str);
    const exacto = porCodigo.get(s);
    const recinto = exacto || porSufijo.get(s.replace(/^[_-]+/, ''));
    if (!recinto || (hallados.get(recinto.id)?.exacto && !exacto)) continue;
    // Esquinas del texto en el espacio del PDF (puede venir rotado) llevadas a la imagen.
    const [a, b, c, d, e, f] = item.transform;
    const na = Math.hypot(a, b) || 1, nc = Math.hypot(c, d) || 1;
    const u = [(a / na) * item.width, (b / na) * item.width], v = [(c / nc) * item.height, (d / nc) * item.height];
    const esquinas = [[e, f], [e + u[0], f + u[1]], [e + v[0], f + v[1]], [e + u[0] + v[0], f + u[1] + v[1]]]
      .map(([x, y]) => viewport.convertToViewportPoint(x, y));
    const xs = esquinas.map(p => p[0]), ys = esquinas.map(p => p[1]);
    const margen = 3;
    hallados.set(recinto.id, { recinto, exacto: !!exacto, caja: [Math.min(...xs) - margen, Math.min(...ys) - margen, Math.max(...xs) + margen, Math.max(...ys) + margen] });
  }
  return [...hallados.values()];
}

/** Recintos cuyo código aparece escrito en la página (consulta rápida, sin dibujar la lámina). */
export async function recintosRotulados(page: pdfjsLib.PDFPageProxy, recintos: Recinto[]): Promise<number> {
  return (await rotulosEnPagina(page, page.getViewport({ scale: 1 }), recintos)).length;
}

/** Dibuja la página en un lienzo nuevo (opcionalmente envuelto) y devuelve sus píxeles. */
async function dibujar(page: pdfjsLib.PDFPageProxy, viewport: pdfjsLib.PageViewport, envolver?: (ctx: CanvasRenderingContext2D) => CanvasRenderingContext2D, despues?: (ctx: CanvasRenderingContext2D) => void) {
  const ancho = Math.round(viewport.width), alto = Math.round(viewport.height);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, ancho, alto);
  await page.render({ canvasContext: envolver ? envolver(ctx) : ctx, viewport }).promise;
  despues?.(ctx);
  const datos = ctx.getImageData(0, 0, ancho, alto).data;
  lienzo.width = lienzo.height = 0;
  return datos;
}

interface CachePagina {
  claveEscala: string;
  ancho: number;
  alto: number;
  factor: number;
  metrosPorPx: number;
  datosMuros: Uint8ClampedArray;
  /** La lámina dibuja los muebles con trazo casi tan grueso como los muros: se intenta primero con murosConVanos. */
  vanosPrimero: boolean;
  /** Segundo intento (ver murosConVanos). */
  datosMurosVanos?: Uint8ClampedArray;
  datosCompleto?: Uint8ClampedArray;
  murosSinCajas?: MapaTrazos;
  murosVanosSinCajas?: MapaTrazos;
  completoSinCajas?: MapaTrazos;
}

const cachePorPagina = new WeakMap<pdfjsLib.PDFPageProxy, CachePagina>();

async function obtenerCachePagina(page: pdfjsLib.PDFPageProxy, escala?: string | null): Promise<CachePagina> {
  const parametros = getConfigEspacios().parametros;
  const den = denominadorEscala(escala) || denominadorEscala(parametros.escalaPorDefecto) || 100;
  const claveEscala = `${den}|${parametros.vanoMaximoM}|${parametros.ventanaMaximaM}`;
  const existente = cachePorPagina.get(page);
  if (existente && existente.claveEscala === claveEscala) return existente;

  const base = page.getViewport({ scale: 1 });
  const factor = LADO_MAYOR_PX / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale: factor });
  const ancho = Math.round(viewport.width), alto = Math.round(viewport.height);
  const metrosPorPx = ((0.0254 / 72) * den) / factor;
  const m = (metros: number) => metros / metrosPorPx;

  // Muros: trazos rectos de al menos 1 m; los vanos entre los que tienen grosor de muro se cierran en línea recta.
  let segmentos: Segmento[] = [], grosores: number[] = [];
  let vanosPrimero = false;
  const datosMuros = await dibujar(page, viewport, ctx => {
    const envuelto = contextoSoloMuros(ctx, m(1));
    segmentos = envuelto.segmentos; grosores = envuelto.grosores;
    return envuelto.ctx;
  }, ctx => {
    const minimo = grosorDeMuro(segmentos, grosores, ancho, alto) * FRACCION_GROSOR_MURO;
    vanosPrimero = proporcionTrazoIntermedio(segmentos, grosores, ancho, alto) > PROPORCION_MUEBLES_GRUESOS;
    trazarCierres(ctx, lineasDeCierre(segmentos.filter((s, i) => grosores[i] >= minimo && dentroDeLamina(s, ancho, alto)), 3, m(parametros.vanoMaximoM), 6));
  });

  const nuevo: CachePagina = { claveEscala, ancho, alto, factor, metrosPorPx, datosMuros, vanosPrimero };
  cachePorPagina.set(page, nuevo);
  return nuevo;
}

/** Las líneas que cruzan media lámina son el marco o el rótulo, no muros. */
const dentroDeLamina = (s: Segmento, ancho: number, alto: number) => Math.hypot(s[2] - s[0], s[3] - s[1]) < Math.max(ancho, alto) / 2;

function trazarCierres(ctx: CanvasRenderingContext2D, lineas: Segmento[]) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = COLOR_CIERRE; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of lineas) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
}

/**
 * Segundo intento, para los recintos que no cierran con los muros de al menos 1 m: muros cortos (closets, jambas)
 * reconocidos solo por su grosor, muros dibujados con contorno doble (sus extremos son esquinas, no puntas) y
 * fachadas con ventanas, como en las cabañas a escala 1:50. Se dibuja solo cuando hace falta.
 */
async function murosConVanos(page: pdfjsLib.PDFPageProxy, cache: CachePagina): Promise<Uint8ClampedArray> {
  if (cache.datosMurosVanos) return cache.datosMurosVanos;
  const parametros = getConfigEspacios().parametros;
  const { ancho, alto, factor, metrosPorPx } = cache;
  const viewport = page.getViewport({ scale: factor });
  const m = (metros: number) => metros / metrosPorPx;

  // Todas las líneas rectas, para reconocer con qué grosor dibuja los muros esta lámina.
  let todas: Segmento[] = [], grosores: number[] = [];
  await dibujar(page, viewport, ctx => {
    const envuelto = contextoSoloMuros(ctx, m(0.05));
    todas = envuelto.segmentos; grosores = envuelto.grosores;
    return envuelto.ctx;
  });
  const minimoMuro = grosorDeMuro(todas, grosores, ancho, alto) * FRACCION_GROSOR_MURO_ESTRICTA;
  const finas = todas.filter((s, i) => grosores[i] < minimoMuro && dentroDeLamina(s, ancho, alto));

  let segmentos: Segmento[] = [];
  cache.datosMurosVanos = await dibujar(page, viewport, ctx => {
    const envuelto = contextoSoloMuros(ctx, m(0.05), minimoMuro);
    segmentos = envuelto.segmentos;
    return envuelto.ctx;
  }, ctx => {
    const muros = segmentos.filter(s => dentroDeLamina(s, ancho, alto));
    trazarCierres(ctx, [
      ...lineasDeCierre(muros, 3, m(parametros.vanoMaximoM), 6),
      ...puentesDeVanos(muros, { minimo: 3, maximo: m(parametros.vanoMaximoM), maximoVentana: m(parametros.ventanaMaximaM), largoMinimo: m(0.25), lineas: finas }),
      ...ventanasEntreMuros(muros, finas, m(0.5), m(0.25)),
    ]);
  });
  return cache.datosMurosVanos;
}

/**
 * Detecta el contorno de los recintos rotulados en la página. Primero sobre los muros solos (sin muebles, artefactos
 * ni arcos de puertas, y con los vanos cerrados en línea recta); los que así no se cierran, sobre la lámina completa.
 * Los que tampoco se logran cerrar quedan fuera.
 */
export async function predibujarRecintos(page: pdfjsLib.PDFPageProxy, recintos: Recinto[], escala?: string | null): Promise<ContornoDetectado[]> {
  const base = page.getViewport({ scale: 1 });
  const factor = LADO_MAYOR_PX / Math.max(base.width, base.height);   // píxeles por punto PDF
  const viewport = page.getViewport({ scale: factor });
  const rotulos = await rotulosEnPagina(page, viewport, recintos);
  if (!rotulos.length) return [];
  const cajas = rotulos.map(r => r.caja);

  const cache = await obtenerCachePagina(page, escala);
  const { ancho, alto, metrosPorPx, datosMuros } = cache;
  const m = (metros: number) => metros / metrosPorPx;
  const opciones = {
    tolerancia: m(0.05),
    grosorLinea: Math.max(2, Math.round(factor * 1.5)),
    anchoMinimoAnexo: m(0.2),
    cierre: m(0.15),
    areaUmbral: m(0.6) * m(0.6),
    // Un relleno de más del triple de la superficie registrada se escapó por una puerta.
    maxPixeles: rotulos.map(r => (r.recinto.superficie_m2 ? (r.recinto.superficie_m2 * 3) / metrosPorPx ** 2 : undefined)),
  };

  // 1 y 2. Solo los muros (trazos rectos de al menos 1 m, con los vanos de puertas cerrados) y, para los que así no
  // cierran, además con las ventanas cerradas y los muros prolongados sobre los vanos (ver murosConVanos). Si la
  // lámina dibuja los muebles con trazo grueso, en el orden inverso.
  const radiosMuros = [0.02, 0.05, 0.1, 0.2, 0.3].map(m);
  const contornos: (Punto[] | null)[] = rotulos.map(() => null);
  const fuentes = [async () => datosMuros, () => murosConVanos(page, cache)];
  if (cache.vanosPrimero) fuentes.reverse();
  for (const fuente of fuentes) {
    if (contornos.every(c => c)) break;
    const mapa = mapaDeTrazos(await fuente(), ancho, alto, cajas);
    const otros = detectarRecintos(mapa, cajas.map(c => mejorSemilla(mapa, c)), { ...opciones, radios: radiosMuros });
    contornos.forEach((c, i) => { if (!c) contornos[i] = otros[i]; });
  }

  // 3. Los que aún no se cerraron, sobre la lámina completa (los arcos de puertas cierran los vanos).
  if (contornos.some(c => !c)) {
    if (!cache.datosCompleto) cache.datosCompleto = await dibujar(page, viewport);
    const completo = mapaDeTrazos(cache.datosCompleto, ancho, alto, cajas);
    const otros = detectarRecintos(completo, cajas.map(c => mejorSemilla(completo, c)), { ...opciones, radios: [1, 3, 6, 10, 15, 22].map(pt => pt * factor) });
    contornos.forEach((c, i) => { if (!c) contornos[i] = otros[i]; });
  }

  return rotulos.flatMap((r, i) => {
    const c = contornos[i];
    return c ? [{ recinto_id: r.recinto.id, poligono: c.map(([x, y]) => [x / ancho, y / alto] as Punto) }] : [];
  });
}

/**
 * Detecta automáticamente el contorno de un recinto haciendo un solo clic dentro de él en el plano (igual que el
 * predibujo del baño de Curacautín: filtra muebles y artefactos, cierra puertas y suma cubículos interiores).
 */
export async function detectarRecintoEnPunto(
  page: pdfjsLib.PDFPageProxy,
  punto: Punto,
  recinto?: Recinto,
  poligonosVecinos: Punto[][] = [],
  escala?: string | null,
): Promise<Punto[] | null> {
  const cache = await obtenerCachePagina(page, escala);
  const { ancho, alto, factor, metrosPorPx } = cache;
  const m = (metros: number) => metros / metrosPorPx;

  const px = Math.round(punto[0] * ancho);
  const py = Math.round(punto[1] * alto);
  const margenSemilla = Math.max(4, Math.round(m(0.25)));
  const cajaClic: [number, number, number, number] = [px - margenSemilla, py - margenSemilla, px + margenSemilla, py + margenSemilla];

  // Se incluyen los centros de los recintos ya ubicados como semillas vecinas para que el relleno no invada otro recinto.
  const semillasVecinas: Punto[] = poligonosVecinos
    .map(pol => centroide(pol))
    .filter(([cx, cy]) => Math.hypot((cx - punto[0]) * ancho, (cy - punto[1]) * alto) > m(0.5))
    .map(([cx, cy]) => [Math.round(cx * ancho), Math.round(cy * alto)] as Punto);

  const maxPx = recinto?.superficie_m2 ? (recinto.superficie_m2 * 3.5) / metrosPorPx ** 2 : undefined;
  const opciones = {
    tolerancia: m(0.05),
    grosorLinea: Math.max(2, Math.round(factor * 1.5)),
    anchoMinimoAnexo: m(0.2),
    cierre: m(0.15),
    areaUmbral: m(0.6) * m(0.6),
    maxPixeles: [maxPx, ...semillasVecinas.map(() => undefined)],
  };

  const radiosMuros = [0.02, 0.05, 0.1, 0.2, 0.3].map(m);
  const enMuros = () => {
    if (!cache.murosSinCajas) cache.murosSinCajas = mapaDeTrazos(cache.datosMuros, ancho, alto, [cajaClic]);
    const muros = cache.murosSinCajas;
    const semillas = [mejorSemilla(muros, cajaClic), ...semillasVecinas];
    const [c] = detectarRecintos(muros, semillas, { ...opciones, radios: radiosMuros });
    // Si con la restricción de superficie máxima no cerró (por ejemplo, si la superficie en la ficha era muy chica),
    // se intenta sin tope de superficie.
    return c || (maxPx ? detectarRecintos(muros, semillas, { ...opciones, maxPixeles: undefined, radios: radiosMuros })[0] : null);
  };
  // Con las ventanas cerradas y los muros prolongados sobre los vanos (ver murosConVanos).
  const enMurosConVanos = async () => {
    if (!cache.murosVanosSinCajas) cache.murosVanosSinCajas = mapaDeTrazos(await murosConVanos(page, cache), ancho, alto, [cajaClic]);
    const vanos = cache.murosVanosSinCajas;
    return detectarRecintos(vanos, [mejorSemilla(vanos, cajaClic), ...semillasVecinas], { ...opciones, maxPixeles: undefined, radios: radiosMuros })[0];
  };
  let contorno = cache.vanosPrimero ? (await enMurosConVanos()) || enMuros() : enMuros() || (await enMurosConVanos());

  if (!contorno) {
    if (!cache.datosCompleto) {
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: LADO_MAYOR_PX / Math.max(base.width, base.height) });
      cache.datosCompleto = await dibujar(page, viewport);
    }
    if (!cache.completoSinCajas) {
      cache.completoSinCajas = mapaDeTrazos(cache.datosCompleto, ancho, alto, [cajaClic]);
    }
    const completo = cache.completoSinCajas;
    const semCompleta = mejorSemilla(completo, cajaClic);
    [contorno] = detectarRecintos(completo, [semCompleta, ...semillasVecinas], {
      ...opciones,
      maxPixeles: undefined,
      radios: [1, 3, 6, 10, 15, 22].map(pt => pt * factor),
    });
  }

  return contorno ? contorno.map(([x, y]) => [x / ancho, y / alto] as Punto) : null;
}
