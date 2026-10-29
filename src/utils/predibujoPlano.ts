// Predibujo de recintos en una lámina: busca en el texto del PDF el código de cada recinto y detecta el espacio
// cerrado por los muros que lo rodea (ver lienzoMuros.ts y deteccionRecintos.ts). Devuelve contornos con puntos de
// 0 a 1, como los de zonas_recinto.
import type * as pdfjsLib from 'pdfjs-dist';
import type { Recinto } from '../types/recintos';
import { COLOR_CIERRE, detectarRecintos, lineasDeCierre, mapaDeTrazos, mejorSemilla } from './deteccionRecintos';
import { contextoSoloMuros, segmentosDeMuro } from './lienzoMuros';
import { getConfigEspacios } from '../data/espaciosConfig';
import { denominadorEscala, type Punto } from './geometriaPlano';

const LADO_MAYOR_PX = 2500;   // resolución de trabajo: suficiente para ver los muros sin hacer lenta la detección

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
    const recinto = exacto || porSufijo.get(s);
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
  const ancho = Math.round(viewport.width), alto = Math.round(viewport.height);
  const cajas = rotulos.map(r => r.caja);

  // Los tamaños se piensan en metros reales; sin escala, se usa la escala por defecto de la configuración.
  const parametros = getConfigEspacios().parametros;
  const metrosPorPx = ((0.0254 / 72) * (denominadorEscala(escala) || denominadorEscala(parametros.escalaPorDefecto) || 100)) / factor;
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

  // 1. Solo los muros: trazos rectos de al menos 1 m, con los vanos de hasta 1,2 m cerrados.
  let segmentos: ReturnType<typeof contextoSoloMuros>['segmentos'] = [], grosores: number[] = [];
  const datosMuros = await dibujar(page, viewport, ctx => {
    const envuelto = contextoSoloMuros(ctx, m(parametros.largoMinimoMuroM));
    segmentos = envuelto.segmentos; grosores = envuelto.grosores;
    return envuelto.ctx;
  }, ctx => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = COLOR_CIERRE; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of lineasDeCierre(segmentosDeMuro(segmentos, grosores, ancho, alto), 3, m(parametros.vanoMaximoM), 6)) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
  });
  const muros = mapaDeTrazos(datosMuros, ancho, alto, cajas);
  const contornos = detectarRecintos(muros, cajas.map(c => mejorSemilla(muros, c)), { ...opciones, radios: [0.02, 0.05, 0.1, 0.2, 0.3].map(m) });

  // 2. Los que no se cerraron, sobre la lámina completa (los arcos de puertas cierran los vanos).
  if (contornos.some(c => !c)) {
    const completo = mapaDeTrazos(await dibujar(page, viewport), ancho, alto, cajas);
    const otros = detectarRecintos(completo, cajas.map(c => mejorSemilla(completo, c)), { ...opciones, radios: [1, 3, 6, 10, 15, 22].map(pt => pt * factor) });
    contornos.forEach((c, i) => { if (!c) contornos[i] = otros[i]; });
  }

  return rotulos.flatMap((r, i) => {
    const c = contornos[i];
    return c ? [{ recinto_id: r.recinto.id, poligono: c.map(([x, y]) => [x / ancho, y / alto] as Punto) }] : [];
  });
}
