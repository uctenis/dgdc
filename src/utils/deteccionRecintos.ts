// Detección automática del contorno de los recintos en una lámina. La lámina se dibuja en una imagen y se dejan solo
// los muros (los trazos gruesos): el mobiliario, los artefactos y los arcos de puertas son líneas finas y no cuentan.
// Cada código de recinto escrito en el plano (por ejemplo «CSN17_101») sirve de semilla para rellenar el espacio
// cerrado por los muros que lo rodea, como el balde de pintura de un programa de dibujo. Si el relleno se escapa por
// una puerta, se engruesan los muros de a poco hasta cerrarla, y el contorno cruza el vano en línea recta. Las
// divisiones interiores delgadas (tabiques de cubículos) se tapan, y los bordes casi rectos se dejan rectos.
import type { Punto } from './geometriaPlano';

/**
 * Imagen de la lámina reducida a trazos y fondo (0), con la distancia de cada píxel al trazo más cercano. Los trazos
 * son 1, o 2 si son líneas de cierre de vanos (dibujadas en rojo, ver COLOR_CIERRE).
 */
export interface MapaTrazos {
  ancho: number;
  alto: number;
  trazo: Uint8Array;
  distancia: Float32Array;
}

/** Color con que se dibujan las líneas de cierre de vanos, para reconocerlas en la imagen. */
export const COLOR_CIERRE = 'rgb(255, 0, 0)';

/** Marca como trazo cada píxel oscuro de una imagen RGBA. Los rectángulos de `borrar` (los rótulos) quedan como fondo. */
export function mapaDeTrazos(rgba: Uint8ClampedArray, ancho: number, alto: number, borrar: [number, number, number, number][] = [], umbral = 200): MapaTrazos {
  const trazo = new Uint8Array(ancho * alto);
  for (let i = 0; i < trazo.length; i++) {
    const o = i * 4;
    const luz = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
    const rojo = rgba[o] - rgba[o + 1] > 100 && rgba[o] - rgba[o + 2] > 100;
    trazo[i] = rgba[o + 3] > 0 && (luz < umbral || rojo) ? (rojo ? 2 : 1) : 0;
  }
  for (const [x0, y0, x1, y1] of borrar) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(alto, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(ancho, Math.ceil(x1)); x++) trazo[y * ancho + x] = 0;
    }
  }
  return { ancho, alto, trazo, distancia: distanciaATrazos(trazo, ancho, alto) };
}

/** Distancia aproximada (chaflán 3-4) de cada píxel al trazo más cercano, en píxeles. */
export function distanciaATrazos(trazo: Uint8Array, ancho: number, alto: number): Float32Array {
  const d = new Float32Array(ancho * alto);
  const INF = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = trazo[i] ? 0 : INF;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - ancho] + 3);
        if (x > 0) v = Math.min(v, d[i - ancho - 1] + 4);
        if (x < ancho - 1) v = Math.min(v, d[i - ancho + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = alto - 1; y >= 0; y--) {
    for (let x = ancho - 1; x >= 0; x--) {
      const i = y * ancho + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < ancho - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < alto - 1) {
        v = Math.min(v, d[i + ancho] + 3);
        if (x < ancho - 1) v = Math.min(v, d[i + ancho + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + ancho - 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/**
 * Relleno desde la semilla por los píxeles a más de `radio` de un trazo (así los vanos de menos de 2·radio quedan
 * cerrados). Se detiene apenas toca el borde de la imagen o pasa de `limite` píxeles (se escapó). Null si la semilla
 * cae sobre un trazo.
 */
export function rellenar(mapa: MapaTrazos, semilla: Punto, radio: number, limite = Infinity): { region: Uint8Array; pixeles: number; escapa: boolean } | null {
  const { ancho, alto, distancia } = mapa;
  const sx = Math.round(semilla[0]), sy = Math.round(semilla[1]);
  if (sx < 0 || sy < 0 || sx >= ancho || sy >= alto || distancia[sy * ancho + sx] <= radio) return null;
  const region = new Uint8Array(ancho * alto);
  const cola = new Int32Array(ancho * alto);
  let ini = 0, fin = 0;
  region[sy * ancho + sx] = 1; cola[fin++] = sy * ancho + sx;
  while (ini < fin) {
    const i = cola[ini++];
    const x = i % ancho, y = (i - x) / ancho;
    if (x === 0 || y === 0 || x === ancho - 1 || y === alto - 1 || fin > limite) return { region, pixeles: fin, escapa: true };
    for (const j of [i - 1, i + 1, i - ancho, i + ancho]) {
      if (!region[j] && distancia[j] > radio) { region[j] = 1; cola[fin++] = j; }
    }
  }
  return { region, pixeles: fin, escapa: false };
}

/**
 * Deja solo los trazos de al menos `grosor` píxeles de ancho (los muros), quitando las líneas finas del mobiliario,
 * los artefactos, los arcos de puertas y los textos.
 */
export function soloMuros(mapa: MapaTrazos, grosor: number): MapaTrazos {
  const { ancho, alto, trazo } = mapa;
  const fondo = new Uint8Array(trazo.length);
  for (let i = 0; i < trazo.length; i++) fondo[i] = trazo[i] ? 0 : 1;
  const alFondo = distanciaATrazos(fondo, ancho, alto);   // dentro de un trazo: distancia a su borde
  const nucleo = new Uint8Array(trazo.length);
  for (let i = 0; i < trazo.length; i++) nucleo[i] = alFondo[i] >= grosor / 2 ? 1 : 0;
  const alNucleo = distanciaATrazos(nucleo, ancho, alto);
  const muro = new Uint8Array(trazo.length);
  for (let i = 0; i < trazo.length; i++) muro[i] = trazo[i] && alNucleo[i] <= grosor / 2 + 1 ? 1 : 0;
  return { ancho, alto, trazo: muro, distancia: distanciaATrazos(muro, ancho, alto) };
}

/** Largo del tramo libre (sin trazos) que pasa por cada píxel, en horizontal y en vertical. */
export function tramosLibres(mapa: MapaTrazos): { horizontal: Int32Array; vertical: Int32Array } {
  const { ancho, alto, trazo } = mapa;
  const horizontal = new Int32Array(ancho * alto), vertical = new Int32Array(ancho * alto);
  for (let y = 0; y < alto; y++) {
    let x = 0;
    while (x < ancho) {
      if (trazo[y * ancho + x]) { x++; continue; }
      let fin = x;
      while (fin < ancho && !trazo[y * ancho + fin]) fin++;
      for (let k = x; k < fin; k++) horizontal[y * ancho + k] = fin - x;
      x = fin;
    }
  }
  for (let x = 0; x < ancho; x++) {
    let y = 0;
    while (y < alto) {
      if (trazo[y * ancho + x]) { y++; continue; }
      let fin = y;
      while (fin < alto && !trazo[fin * ancho + x]) fin++;
      for (let k = y; k < fin; k++) vertical[k * ancho + x] = fin - y;
      y = fin;
    }
  }
  return { horizontal, vertical };
}

/**
 * Devuelve la región hasta la cara de los trazos: la extiende `pasos` píxeles sin atravesarlos. Con `vano`, tampoco
 * entra a los pasos más angostos que eso (el vano de una puerta), así el contorno cruza la puerta en línea recta.
 */
export function extenderHastaMuros(mapa: MapaTrazos, region: Uint8Array, pasos: number, vano?: { ancho: number; tramos: ReturnType<typeof tramosLibres> }): Uint8Array {
  const { ancho, trazo } = mapa;
  const salida = region.slice();
  let frente: number[] = [];
  for (let i = 0; i < salida.length; i++) if (salida[i]) frente.push(i);
  for (let p = 0; p < pasos && frente.length; p++) {
    const nuevo: number[] = [];
    for (const i of frente) {
      const x = i % ancho;
      const vecinos = [x > 0 ? i - 1 : -1, x < ancho - 1 ? i + 1 : -1, i - ancho, i + ancho];
      for (const j of vecinos) {
        if (j < 0 || j >= salida.length || salida[j] || trazo[j]) continue;
        if (vano && (vano.tramos.horizontal[j] <= vano.ancho || vano.tramos.vertical[j] <= vano.ancho)) continue;
        salida[j] = 1; nuevo.push(j);
      }
    }
    frente = nuevo;
  }
  return salida;
}

/** Cierre morfológico (engrosar y luego adelgazar `radio` píxeles): tapa las rendijas finas dentro de la región. */
export function cerrar(region: Uint8Array, ancho: number, alto: number, radio: number): Uint8Array {
  const fuera = new Uint8Array(region.length);
  for (let i = 0; i < region.length; i++) fuera[i] = region[i] ? 1 : 0;
  const dRegion = distanciaATrazos(fuera, ancho, alto);
  const engrosada = new Uint8Array(region.length);
  for (let i = 0; i < region.length; i++) engrosada[i] = dRegion[i] <= radio ? 0 : 1; // 1 = fuera de la región engrosada
  const dFuera = distanciaATrazos(engrosada, ancho, alto);
  const salida = new Uint8Array(region.length);
  for (let i = 0; i < region.length; i++) salida[i] = region[i] || dFuera[i] > radio ? 1 : 0;
  return salida;
}

/** Contorno exterior de una región (seguimiento de borde de Moore), en coordenadas de píxel. */
export function contornoExterior(region: Uint8Array, ancho: number, alto: number): Punto[] {
  let inicio = -1;
  for (let i = 0; i < region.length; i++) if (region[i]) { inicio = i; break; }
  if (inicio < 0) return [];
  const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < ancho && y < alto && region[y * ancho + x] === 1;
  // Vecinos en sentido horario partiendo del oeste.
  const dx = [-1, -1, 0, 1, 1, 1, 0, -1], dy = [0, -1, -1, -1, 0, 1, 1, 1];
  const x0 = inicio % ancho, y0 = (inicio - x0) / ancho;
  const puntos: Punto[] = [[x0, y0]];
  let x = x0, y = y0, dir = 0; // se llegó desde el oeste (fuera, por ser el primer píxel de su fila)
  for (let pasos = 0; pasos < region.length * 4; pasos++) {
    let hallado = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + k) % 8;
      const nx = x + dx[d], ny = y + dy[d];
      if (dentro(nx, ny)) {
        x = nx; y = ny;
        dir = (d + 6) % 8; // vuelve a revisar desde el vecino anterior al de llegada
        hallado = true;
        break;
      }
    }
    if (!hallado || (x === x0 && y === y0)) break;
    puntos.push([x, y]);
  }
  return puntos;
}

/** Simplifica un polígono cerrado (Douglas-Peucker): quita los vértices a menos de `tolerancia` de la línea. */
export function simplificar(puntos: Punto[], tolerancia: number): Punto[] {
  if (puntos.length < 4) return puntos;
  // Corta el anillo en el vértice más lejano al primero para tener dos tramos abiertos.
  let lejos = 0, max = -1;
  puntos.forEach((p, i) => { const d = Math.hypot(p[0] - puntos[0][0], p[1] - puntos[0][1]); if (d > max) { max = d; lejos = i; } });
  const tramo = (pts: Punto[]): Punto[] => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let idx = 0, dmax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / largo;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax <= tolerancia) return [a, b];
    return [...tramo(pts.slice(0, idx + 1)).slice(0, -1), ...tramo(pts.slice(idx))];
  };
  const ida = tramo(puntos.slice(0, lejos + 1));
  const vuelta = tramo([...puntos.slice(lejos), puntos[0]]);
  return [...ida.slice(0, -1), ...vuelta.slice(0, -1)];
}

/**
 * Deja horizontales o verticales los bordes que casi lo son (hasta `grados` de diferencia) y quita los vértices que
 * quedan alineados o repetidos.
 */
export function ortogonalizar(puntos: Punto[], grados = 8): Punto[] {
  const p = puntos.map(q => [q[0], q[1]] as Punto);
  const limite = Math.tan((grados * Math.PI) / 180);
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    if (dy <= dx * limite) { const y = (a[1] + b[1]) / 2; a[1] = y; b[1] = y; }
    else if (dx <= dy * limite) { const x = (a[0] + b[0]) / 2; a[0] = x; b[0] = x; }
  }
  // Quita vértices repetidos y los que quedan en medio de un tramo recto.
  let salida = p;
  for (let cambio = true; cambio && salida.length > 3;) {
    cambio = false;
    for (let i = 0; i < salida.length; i++) {
      const a = salida[(i - 1 + salida.length) % salida.length], b = salida[i], c = salida[(i + 1) % salida.length];
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const cruz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (ab < 0.5 || Math.abs(cruz) < ab * bc * 0.02) {   // repetido, o en línea (menos de ~1° de quiebre)
        salida = salida.filter((_, k) => k !== i);
        cambio = true;
        break;
      }
    }
  }
  return salida;
}

export interface OpcionesDeteccion {
  /** Radios de cierre a probar, de menor a mayor, en píxeles. */
  radios: number[];
  /** Tolerancia para simplificar el contorno, en píxeles. */
  tolerancia: number;
  /** Máximo de píxeles aceptable para cada recinto (según su superficie registrada); sin dato, una fracción de la lámina. */
  maxPixeles?: (number | undefined)[];
  /**
   * Ancho mínimo (en píxeles) de un espacio sin rótulo para sumarlo a un recinto; los más delgados son el hueco de un
   * muro. Sin valor, no se suma ninguno (cuando la imagen ya trae solo los muros, no hay mobiliario que sumar).
   */
  anchoMinimoAnexo?: number;
  /** Grosor máximo (en píxeles) de la línea que separa un espacio sin rótulo del recinto al que se suma. */
  grosorLinea: number;
  /** Ancho (en píxeles) de las divisiones interiores que se tapan, como los tabiques de cubículos. */
  cierre?: number;
  /**
   * Superficie máxima (en píxeles) del hueco delgado que queda dentro del muro en el vano de una puerta (el umbral),
   * cerrado por líneas de cierre.
   * Un espacio que por un umbral da a otro recinto es circulación (un vestíbulo) y no se suma a ninguno.
   */
  areaUmbral?: number;
}

/** Contorno de cada recinto a partir de su rótulo (en el mismo orden que las semillas); null donde no se pudo. */
export function detectarRecintos(mapa: MapaTrazos, semillas: Punto[], op: OpcionesDeteccion): (Punto[] | null)[] {
  const { ancho, alto, trazo, distancia } = mapa;
  const total = ancho * alto;
  const dueño = new Int32Array(total);   // 0 = nadie; i + 1 = recinto i
  const pixeles = new Array<number>(semillas.length).fill(0);
  const tramos = tramosLibres(mapa);

  // 1. Relleno de cada recinto desde su rótulo, con el menor radio que no se escape.
  semillas.forEach((semilla, n) => {
    const maximo = op.maxPixeles?.[n] ?? total * 0.25;
    for (const radio of op.radios) {
      const r = rellenar(mapa, semilla, radio, maximo);
      if (!r || r.escapa) continue;
      if (semillas.some(([x, y], m) => m !== n && r.region[Math.round(y) * ancho + Math.round(x)] === 1)) continue;
      const region = extenderHastaMuros(mapa, r.region, Math.ceil(radio) + 1, { ancho: Math.ceil(2 * radio) + 2, tramos });
      for (let i = 0; i < total; i++) if (region[i] && !dueño[i]) { dueño[i] = n + 1; pixeles[n]++; }
      return;
    }
  });

  // 2. Espacios cerrados sin rótulo (cubículos, muebles, vestíbulos): se numeran después de los recintos.
  const N = semillas.length;
  const etiqueta = new Int32Array(total);
  for (let i = 0; i < total; i++) if (dueño[i]) etiqueta[i] = dueño[i];
  // fraccionCierre: parte de su borde que son líneas de cierre (alta en el umbral de una puerta).
  const espacios: { pixeles: number; anchoMax: number; tocaBorde: boolean; tocaRecintos: Set<number>; fraccionCierre: number }[] = [];
  const cola = new Int32Array(total);
  for (let s = 0; s < total; s++) {
    if (trazo[s] || etiqueta[s]) continue;
    const id = N + 1 + espacios.length;
    let ini = 0, fin = 0, tocaBorde = false, anchoMax = 0;
    const tocaRecintos = new Set<number>();   // recintos con los que limita sin línea de por medio
    let borde = 0, deCierre = 0;
    etiqueta[s] = id; cola[fin++] = s;
    while (ini < fin) {
      const i = cola[ini++];
      const x = i % ancho, y = (i - x) / ancho;
      if (distancia[i] > anchoMax) anchoMax = distancia[i];
      if (x === 0 || y === 0 || x === ancho - 1 || y === alto - 1) { tocaBorde = true; continue; }
      for (const j of [i - 1, i + 1, i - ancho, i + ancho]) {
        if (etiqueta[j] && etiqueta[j] <= N) tocaRecintos.add(etiqueta[j]);
        if (trazo[j]) { borde++; if (trazo[j] === 2) deCierre++; continue; }
        if (etiqueta[j]) continue;
        etiqueta[j] = id; cola[fin++] = j;
      }
    }
    espacios.push({ pixeles: fin, anchoMax, tocaBorde, tocaRecintos, fraccionCierre: borde ? deCierre / borde : 0 });
  }

  // 3. Qué espacios limitan entre sí a través de una línea fina (hasta `grosorLinea` de ancho).
  const vecinos = new Map<number, Set<number>>();
  const unir = (a: number, b: number) => {
    if (!vecinos.has(a)) vecinos.set(a, new Set());
    if (!vecinos.has(b)) vecinos.set(b, new Set());
    vecinos.get(a)!.add(b); vecinos.get(b)!.add(a);
  };
  if (op.anchoMinimoAnexo) {
    const via = new Int32Array(total);
    let frente: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!etiqueta[i]) continue;
      const x = i % ancho;
      if ((x > 0 && trazo[i - 1]) || (x < ancho - 1 && trazo[i + 1]) || trazo[i - ancho] || trazo[i + ancho]) frente.push(i);
    }
    // Cada lado avanza la mitad: se encuentran solo a través de líneas de hasta `grosorLinea`.
    for (let p = 0; p < Math.ceil(op.grosorLinea / 2) && frente.length; p++) {
      const nuevo: number[] = [];
      for (const i of frente) {
        const propia = etiqueta[i] || via[i];
        const x = i % ancho;
        for (const j of [x > 0 ? i - 1 : -1, x < ancho - 1 ? i + 1 : -1, i - ancho, i + ancho]) {
          if (j < 0 || j >= total || !trazo[j]) continue;
          if (!via[j]) { via[j] = propia; nuevo.push(j); }
          else if (via[j] !== propia) unir(via[j], propia);
        }
      }
      frente = nuevo;
    }
  }

  // 4. Un espacio amplio se suma a un recinto cuando limita solo con ese recinto (y con huecos delgados de muros):
  // así entran los cubículos y los muebles, pero no un vestíbulo que también da a otro espacio o al exterior. Se
  // repite para alcanzar lo que está dentro de lo anexado.
  const anexadoA = new Map<number, number>();
  // Los restos pequeños que tocan un solo recinto sin línea de por medio (esquinas que el relleno no alcanzó) son de
  // ese recinto.
  espacios.forEach((e, k) => {
    const [r] = e.tocaRecintos;
    if (!e.tocaBorde && e.tocaRecintos.size === 1 && e.pixeles <= pixeles[r - 1] * 0.015) anexadoA.set(N + 1 + k, r);
  });
  const recintoDe = (id: number) => (id <= N ? id : anexadoA.get(id));
  const amplio = (id: number) => espacios[id - N - 1].anchoMax * 2 >= (op.anchoMinimoAnexo || 0);
  for (let vuelta = 0; vuelta < (op.anchoMinimoAnexo ? 3 : 0); vuelta++) {
    let anexados = 0;
    espacios.forEach((e, k) => {
      const id = N + 1 + k;
      // Un espacio cerrado sobre todo por líneas de cierre (y no por muros o tabiques) es un trozo de pasillo o de
      // exterior entre vanos, no un cubículo ni un mueble.
      if (anexadoA.has(id) || e.tocaBorde || !amplio(id) || e.fraccionCierre >= 0.4) return;
      const recintos = new Set<number>();
      let otro = false;
      for (const v of vecinos.get(id) || []) {
        const r = recintoDe(v);
        if (r) recintos.add(r);
        else if (espacios[v - N - 1].tocaBorde || amplio(v)) otro = true;
        else if (espacios[v - N - 1].pixeles <= (op.areaUmbral || 0) && espacios[v - N - 1].fraccionCierre >= 0.5) {
          // Umbral de una puerta (hueco chico limitado sobre todo por líneas de cierre): cuentan los recintos que
          // hay al otro lado.
          for (const w of vecinos.get(v) || []) { const rw = w !== id && recintoDe(w); if (rw) recintos.add(rw); }
        }
      }
      if (otro || recintos.size !== 1) return;
      const [r] = recintos;
      if (e.pixeles > pixeles[r - 1]) return;   // un espacio mayor que el recinto no es su mobiliario
      anexadoA.set(id, r);
      anexados++;
    });
    if (!anexados) break;
  }
  for (let i = 0; i < total; i++) if (etiqueta[i] > N && anexadoA.has(etiqueta[i])) dueño[i] = -anexadoA.get(etiqueta[i])!;

  // 5. Contorno de cada recinto con sus anexos; las líneas y los tabiques delgados entre ellos se tapan con un cierre.
  return semillas.map((_, n) => {
    if (!pixeles[n]) return null;
    const region = new Uint8Array(total);
    for (let i = 0; i < total; i++) if (Math.abs(dueño[i]) === n + 1) region[i] = 1;
    const cerrada = cerrar(region, ancho, alto, Math.max(op.grosorLinea, op.cierre || 0));
    const contorno = ortogonalizar(simplificar(contornoExterior(cerrada, ancho, alto), op.tolerancia));
    return contorno.length >= 3 ? contorno : null;
  });
}

/** Punto más despejado (más lejos de los trazos) dentro del rectángulo del rótulo: la mejor semilla para el relleno. */
export function mejorSemilla(mapa: MapaTrazos, [x0, y0, x1, y1]: [number, number, number, number]): Punto {
  let mejor: Punto = [(x0 + x1) / 2, (y0 + y1) / 2], max = -1;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(mapa.alto, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(mapa.ancho, Math.ceil(x1)); x++) {
      const d = mapa.distancia[y * mapa.ancho + x];
      if (d > max) { max = d; mejor = [x, y]; }
    }
  }
  return mejor;
}

/**
 * Líneas que cierran los vanos entre muros: une cada punta suelta de muro con los `vecinos` extremos más cercanos
 * (puntas o esquinas de otro segmento) que estén a más de `minimo` y a menos de `maximo` píxeles. Así el vano de una
 * puerta queda cortado en línea recta, y los muros huecos dibujados con dos líneas quedan tapados en sus puntas.
 */
export function lineasDeCierre(segmentos: [number, number, number, number][], minimo: number, maximo: number, vecinos = 3): [number, number, number, number][] {
  const extremos: { x: number; y: number; s: number }[] = [];
  segmentos.forEach(([x1, y1, x2, y2], s) => { extremos.push({ x: x1, y: y1, s }, { x: x2, y: y2, s }); });
  // Grilla de celdas del tamaño del máximo, para no comparar todos con todos.
  const celdas = new Map<string, number[]>();
  const clave = (x: number, y: number) => `${Math.floor(x / maximo)},${Math.floor(y / maximo)}`;
  extremos.forEach((e, i) => { const k = clave(e.x, e.y); celdas.set(k, [...(celdas.get(k) || []), i]); });
  // Extremos que coinciden con otro (una esquina o la unión de dos tramos) no son la punta de un muro.
  const esPunta = extremos.map((e, i) => {
    const cx = Math.floor(e.x / maximo), cy = Math.floor(e.y / maximo);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of celdas.get(`${cx + dx},${cy + dy}`) || []) {
        if (j !== i && extremos[j].s !== e.s && Math.hypot(extremos[j].x - e.x, extremos[j].y - e.y) < minimo) return false;
      }
    }
    return true;
  });
  const lineas: [number, number, number, number][] = [];
  const hechas = new Set<string>();
  extremos.forEach((e, i) => {
    if (!esPunta[i]) return;
    const cx = Math.floor(e.x / maximo), cy = Math.floor(e.y / maximo);
    const cerca: { j: number; d: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of celdas.get(`${cx + dx},${cy + dy}`) || []) {
        if (j === i || extremos[j].s === e.s) continue;
        const d = Math.hypot(extremos[j].x - e.x, extremos[j].y - e.y);
        if (d >= minimo && d <= maximo) cerca.push({ j, d });
      }
    }
    cerca.sort((a, b) => a.d - b.d).slice(0, vecinos).forEach(({ j }) => {
      const k = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (hechas.has(k)) return;
      hechas.add(k);
      lineas.push([e.x, e.y, extremos[j].x, extremos[j].y]);
    });
  });
  return lineas;
}
