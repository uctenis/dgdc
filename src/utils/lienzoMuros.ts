// Lienzo que dibuja solo los muros de una lámina. Se le pasa al lector de PDF en lugar del lienzo real: deja pasar
// los trazos rectos largos o dibujados con grosor de muro y omite las curvas (arcos de puertas, artefactos sanitarios),
// los textos y los tramos cortos o finos (hojas de puertas, muebles, camas, entablados de terrazas), que son los que
// estorban al detectar el contorno de los recintos. El grosor de muro se reconoce en cada lámina (ver grosorDeMuro).

type Ctx = CanvasRenderingContext2D;
type Operacion = [nombre: string, args: number[], transformacion: DOMMatrix];

const DE_TRAZADO = ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'closePath'];

/** Segmento de muro en píxeles de la imagen: [x1, y1, x2, y2]. */
export type Segmento = [number, number, number, number];

/**
 * Envuelve un contexto 2D para que sus líneas omitan curvas, textos y segmentos de menos de `largoMinimo` píxeles o
 * más delgados que `grosorMinimo` píxeles. Los rellenos (muros pintados) y los recortes usan el trazado completo. Anota
 * en `segmentos` cada tramo recto que deja pasar, con su grosor, en píxeles de la imagen.
 */
export function contextoSoloMuros(ctx: Ctx, largoMinimo: number, grosorMinimo = 0): { ctx: Ctx; segmentos: Segmento[]; grosores: number[] } {
  const segmentos: Segmento[] = [];
  const grosores: number[] = [];   // grosor de línea de cada segmento, en píxeles de la imagen
  let operaciones: Operacion[] = [];
  let actual: [number, number] | null = null;   // punto actual del trazo, en coordenadas del dibujo
  let inicio: [number, number] | null = null;   // inicio del subtrazo (para closePath)

  const largo = (a: [number, number], b: [number, number]) => {
    const m = ctx.getTransform();
    return Math.hypot(m.a * (b[0] - a[0]) + m.c * (b[1] - a[1]), m.b * (b[0] - a[0]) + m.d * (b[1] - a[1]));
  };
  const tramo = (x: number, y: number) => {
    const m = ctx.getTransform();
    const grosor = ctx.lineWidth * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    if (actual && largo(actual, [x, y]) >= largoMinimo && grosor >= grosorMinimo) {
      ctx.lineTo(x, y);
      segmentos.push([m.a * actual[0] + m.c * actual[1] + m.e, m.b * actual[0] + m.d * actual[1] + m.f, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
      grosores.push(grosor);
    } else ctx.moveTo(x, y);
    actual = [x, y];
  };
  /** Dibuja en el contexto la versión filtrada de una operación de trazado. */
  const filtrada = (nombre: string, a: number[]) => {
    switch (nombre) {
      case 'moveTo': actual = inicio = [a[0], a[1]]; ctx.moveTo(a[0], a[1]); break;
      case 'lineTo': tramo(a[0], a[1]); break;
      case 'bezierCurveTo': actual = [a[4], a[5]]; ctx.moveTo(a[4], a[5]); break;
      case 'quadraticCurveTo': actual = [a[2], a[3]]; ctx.moveTo(a[2], a[3]); break;
      case 'closePath': if (inicio) tramo(inicio[0], inicio[1]); break;
      case 'rect': {
        const [x, y, w, h] = a;
        actual = inicio = [x, y]; ctx.moveTo(x, y);
        tramo(x + w, y); tramo(x + w, y + h); tramo(x, y + h); tramo(x, y);
        break;
      }
      default: break;   // arcos y elipses: se omiten
    }
  };
  /**
   * Rehace el trazado completo, aplica `fn` (relleno o recorte) y deja de nuevo el trazado filtrado. Cada operación se
   * repite con la transformación que tenía (los textos, por ejemplo, cambian de transformación en cada letra).
   */
  const conTrazadoCompleto = (fn: () => void) => {
    const final = ctx.getTransform();
    ctx.beginPath();
    for (const [nombre, a, m] of operaciones) { ctx.setTransform(m); (ctx[nombre as keyof Ctx] as (...x: number[]) => void)(...a); }
    ctx.setTransform(final);
    fn();
    ctx.beginPath();
    actual = inicio = null;
    const anotados = segmentos.length;
    for (const [nombre, a, m] of operaciones) { ctx.setTransform(m); filtrada(nombre, a); }
    segmentos.length = anotados; grosores.length = anotados;   // al rehacer el trazado no se vuelven a anotar
    ctx.setTransform(final);
  };

  const propios: Record<string, unknown> = {
    beginPath: () => { operaciones = []; actual = inicio = null; ctx.beginPath(); },
    fill: (...args: unknown[]) => {
      if (args[0] && typeof args[0] === 'object') return ctx.fill(...(args as [Path2D, CanvasFillRule?]));
      conTrazadoCompleto(() => ctx.fill(args[0] as CanvasFillRule | undefined));
    },
    clip: (...args: unknown[]) => {
      if (args[0] && typeof args[0] === 'object') return ctx.clip(...(args as [Path2D, CanvasFillRule?]));
      conTrazadoCompleto(() => ctx.clip(args[0] as CanvasFillRule | undefined));
    },
    fillText: () => {}, strokeText: () => {},
  };
  for (const nombre of DE_TRAZADO) {
    propios[nombre] = (...a: number[]) => { operaciones.push([nombre, a, ctx.getTransform()]); filtrada(nombre, a); };
  }

  const envuelto = new Proxy(ctx, {
    get(objetivo, prop) {
      if (typeof prop === 'string' && prop in propios) return propios[prop];
      const valor = Reflect.get(objetivo, prop, objetivo);
      return typeof valor === 'function' ? valor.bind(objetivo) : valor;
    },
    set(objetivo, prop, valor) {
      return Reflect.set(objetivo, prop, valor, objetivo);
    },
  });
  return { ctx: envuelto, segmentos, grosores };
}

/**
 * Grosor con que la lámina dibuja los muros: el más grueso de los grosores frecuentes. Frecuente = suma al menos el
 * 15 % del largo del grosor más usado (sin contar líneas que cruzan media lámina, como el marco). Así no lo confunden
 * los entablados de terrazas ni los muebles (muchos metros de línea fina) ni una flecha gruesa suelta (pocos metros).
 */
export function grosorDeMuro(segmentos: Segmento[], grosores: number[], ancho: number, alto: number): number {
  const limite = Math.max(ancho, alto) / 2;
  const porGrosor = new Map<number, number>();
  segmentos.forEach((s, i) => {
    const largo = Math.hypot(s[2] - s[0], s[3] - s[1]);
    if (largo >= limite) return;
    const g = Math.round(grosores[i] * 10) / 10;
    porGrosor.set(g, (porGrosor.get(g) || 0) + largo);
  });
  const maximo = Math.max(0, ...porGrosor.values());
  return Math.max(0, ...[...porGrosor].filter(([, largo]) => largo >= maximo * 0.15).map(([g]) => g));
}

/** Fracción del grosor de muro desde la que una línea cuenta como muro (los muros finos de fachada también entran). */
export const FRACCION_GROSOR_MURO = 0.35;

/**
 * Fracción más exigente, para cuando se aceptan también los trazos cortos: deja fuera los contornos de muebles y
 * artefactos, que van a menos de la mitad del grosor del muro. Las fachadas y ventanas finas se cierran aparte (ver
 * puentesDeVanos y ventanasEntreMuros).
 */
export const FRACCION_GROSOR_MURO_ESTRICTA = 0.5;

/**
 * Parte de las líneas con grosor de muro (al menos FRACCION_GROSOR_MURO) que no llega a FRACCION_GROSOR_MURO_ESTRICTA,
 * medida en largo. Si es alta, la lámina dibuja los muebles con trazo grueso (como las cabañas) y conviene reconocer
 * los muros con la fracción estricta.
 */
export function proporcionTrazoIntermedio(segmentos: Segmento[], grosores: number[], ancho: number, alto: number): number {
  const limite = Math.max(ancho, alto) / 2;
  const grosor = grosorDeMuro(segmentos, grosores, ancho, alto);
  let intermedio = 0, muro = 0;
  segmentos.forEach((s, i) => {
    const largo = Math.hypot(s[2] - s[0], s[3] - s[1]);
    if (largo >= limite || grosores[i] < grosor * FRACCION_GROSOR_MURO) return;
    if (grosores[i] < grosor * FRACCION_GROSOR_MURO_ESTRICTA) intermedio += largo; else muro += largo;
  });
  return muro ? intermedio / muro : 0;
}
