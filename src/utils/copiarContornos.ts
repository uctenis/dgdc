// Copia los contornos de los recintos de una lámina a otra lámina igual (por ejemplo, cabañas del mismo modelo). Cada
// recinto se empareja con el de igual número en el otro edificio («CSN16_103» → «CSN15_103») y, si no hay, con el de
// igual nombre. Como el dibujo puede estar en otra posición de la hoja, antes se busca el desplazamiento que hace
// calzar los trazos de las dos láminas.
import type * as pdfjsLib from 'pdfjs-dist';
import type { Recinto } from '../types/recintos';
import { limites, type Punto } from './geometriaPlano';

/** Píxeles por punto PDF al comparar las láminas: las dos se dibujan con el mismo, así sus medidas coinciden. */
export const PX_POR_PUNTO = 1.5;

export interface ImagenTrazos { ancho: number; alto: number; oscuro: Uint8Array }

const numeroDe = (codigo: string) => codigo.toUpperCase().split('_').slice(1).join('_');
const nombreDe = (r: Recinto) => (r.nombre || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Recinto del destino que corresponde a cada recinto del origen: mismo número; si no, mismo nombre (único). */
export function emparejarRecintos(origen: Recinto[], destino: Recinto[]): Map<string, Recinto> {
  const pares = new Map<string, Recinto>();
  const usados = new Set<string>();
  const porNumero = new Map(destino.filter(r => numeroDe(r.codigo)).map(r => [numeroDe(r.codigo), r]));
  for (const r of origen) {
    const d = porNumero.get(numeroDe(r.codigo));
    if (d && numeroDe(r.codigo) && !usados.has(d.id)) { pares.set(r.id, d); usados.add(d.id); }
  }
  const cuenta = (lista: Recinto[], n: string) => lista.filter(r => nombreDe(r) === n).length;
  for (const r of origen) {
    const n = nombreDe(r);
    if (pares.has(r.id) || !n || cuenta(origen, n) !== 1 || cuenta(destino, n) !== 1) continue;
    const d = destino.find(x => nombreDe(x) === n)!;
    if (!usados.has(d.id)) { pares.set(r.id, d); usados.add(d.id); }
  }
  return pares;
}

/** Dibuja la página a PX_POR_PUNTO y marca sus píxeles oscuros. */
export async function imagenDeTrazos(page: pdfjsLib.PDFPageProxy): Promise<ImagenTrazos> {
  const viewport = page.getViewport({ scale: PX_POR_PUNTO });
  const ancho = Math.round(viewport.width), alto = Math.round(viewport.height);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, ancho, alto);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const rgba = ctx.getImageData(0, 0, ancho, alto).data;
  lienzo.width = lienzo.height = 0;
  const oscuro = new Uint8Array(ancho * alto);
  for (let i = 0; i < oscuro.length; i++) oscuro[i] = rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2] < 480 ? 1 : 0;
  return { ancho, alto, oscuro };
}

/** Reduce la imagen `f` veces: un píxel reducido es oscuro si alguno de los suyos lo es. */
function reducir(img: ImagenTrazos, f: number): ImagenTrazos {
  const ancho = Math.ceil(img.ancho / f), alto = Math.ceil(img.alto / f);
  const oscuro = new Uint8Array(ancho * alto);
  for (let y = 0; y < img.alto; y++) for (let x = 0; x < img.ancho; x++) {
    if (img.oscuro[y * img.ancho + x]) oscuro[Math.floor(y / f) * ancho + Math.floor(x / f)] = 1;
  }
  return { ancho, alto, oscuro };
}

/** Puntos oscuros de `img` dentro de la caja (en píxeles), a lo más `maximo` repartidos parejo. */
function puntosEnCaja(img: ImagenTrazos, [x0, y0, x1, y1]: number[], maximo: number): Punto[] {
  const puntos: Punto[] = [];
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.alto, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.ancho, Math.ceil(x1)); x++) if (img.oscuro[y * img.ancho + x]) puntos.push([x, y]);
  }
  const paso = Math.max(1, Math.ceil(puntos.length / maximo));
  return puntos.filter((_, i) => i % paso === 0);
}

/** Parte de los puntos que cae sobre un trazo de `img` al desplazarlos en (dx, dy). */
function coincidencia(img: ImagenTrazos, puntos: Punto[], dx: number, dy: number): number {
  let n = 0;
  for (const [x, y] of puntos) {
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < img.ancho && Y < img.alto && img.oscuro[Y * img.ancho + X]) n++;
  }
  return puntos.length ? n / puntos.length : 0;
}

/**
 * Desplazamiento (en píxeles) que lleva el dibujo de `origen` dentro de `caja` (la zona de los recintos, en píxeles)
 * sobre el mismo dibujo en `destino`. Solo se mira esa zona, para que el rótulo de la lámina (igual en todas) no
 * engañe. Devuelve null si ninguna posición calza al menos la mitad de los trazos: las láminas no son iguales.
 */
export function alinearLaminas(origen: ImagenTrazos, destino: ImagenTrazos, caja: [number, number, number, number]): { dx: number; dy: number; calce: number } | null {
  const F = 4;
  const o = reducir(origen, F), d = reducir(destino, F);
  const puntos = puntosEnCaja(o, caja.map(v => v / F), 3000);
  if (puntos.length < 20) return null;
  // 1. Búsqueda gruesa en la imagen reducida, hasta un tercio de la hoja en cada dirección.
  const rx = Math.round(d.ancho / 3), ry = Math.round(d.alto / 3);
  let mejor = { dx: 0, dy: 0, calce: -1 };
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    const c = coincidencia(d, puntos, dx, dy);
    if (c > mejor.calce) mejor = { dx, dy, calce: c };
  }
  // 2. Ajuste fino en la imagen completa alrededor del mejor.
  const finos = puntosEnCaja(origen, caja, 6000);
  let fino = { dx: mejor.dx * F, dy: mejor.dy * F, calce: -1 };
  for (let dy = mejor.dy * F - F; dy <= mejor.dy * F + F; dy++) for (let dx = mejor.dx * F - F; dx <= mejor.dx * F + F; dx++) {
    const c = coincidencia(destino, finos, dx, dy);
    if (c > fino.calce) fino = { dx, dy, calce: c };
  }
  return fino.calce >= 0.5 ? fino : null;
}

/** Caja (en píxeles de `img`) que encierra los contornos, con un margen del 5 % de su lado mayor. */
export function cajaDeContornos(poligonos: Punto[][], img: ImagenTrazos): [number, number, number, number] {
  const [x0, y0, x1, y1] = limites(poligonos.flat());
  const margen = 0.05 * Math.max((x1 - x0) * img.ancho, (y1 - y0) * img.alto);
  return [x0 * img.ancho - margen, y0 * img.alto - margen, x1 * img.ancho + margen, y1 * img.alto + margen];
}

/** Lleva un contorno (0 a 1 en la lámina de origen) a la lámina de destino con el desplazamiento hallado. */
export function trasladarContorno(poligono: Punto[], origen: ImagenTrazos, destino: ImagenTrazos, dx: number, dy: number): Punto[] {
  return poligono.map(([x, y]) => [(x * origen.ancho + dx) / destino.ancho, (y * origen.alto + dy) / destino.alto]);
}
