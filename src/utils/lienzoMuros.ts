// Lienzo que dibuja solo los muros de una lámina. Se le pasa al lector de PDF en lugar del lienzo real: deja pasar
// los trazos rectos largos y omite las curvas (arcos de puertas, artefactos sanitarios), los textos y los tramos cortos
// (hojas de puertas, bordes de muebles), que son los que estorban al detectar el contorno de los recintos.

type Ctx = CanvasRenderingContext2D;
type Operacion = [nombre: string, args: number[], transformacion: DOMMatrix];

const DE_TRAZADO = ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'closePath'];

/** Segmento de muro en píxeles de la imagen: [x1, y1, x2, y2]. */
export type Segmento = [number, number, number, number];

/**
 * Envuelve un contexto 2D para que sus líneas omitan curvas, textos y segmentos de menos de `largoMinimo` píxeles en
 * pantalla. Los rellenos (muros pintados) y los recortes usan el trazado completo. Anota en `segmentos` cada tramo
 * recto que deja pasar, en píxeles de la imagen.
 */
export function contextoSoloMuros(ctx: Ctx, largoMinimo: number): { ctx: Ctx; segmentos: Segmento[]; grosores: number[] } {
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
    if (actual && largo(actual, [x, y]) >= largoMinimo) {
      ctx.lineTo(x, y);
      const m = ctx.getTransform();
      segmentos.push([m.a * actual[0] + m.c * actual[1] + m.e, m.b * actual[0] + m.d * actual[1] + m.f, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
      grosores.push(ctx.lineWidth * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)));
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
 * Segmentos dibujados con grosor de muro. El grosor de muro es el que suma más largo entre los segmentos (sin contar
 * los que cruzan media lámina, que son el marco y el rótulo); se aceptan los de al menos un tercio de ese grosor.
 */
export function segmentosDeMuro(segmentos: Segmento[], grosores: number[], ancho: number, alto: number): Segmento[] {
  const largoDe = ([x1, y1, x2, y2]: Segmento) => Math.hypot(x2 - x1, y2 - y1);
  const limite = Math.max(ancho, alto) / 2;
  const porGrosor = new Map<number, number>();
  segmentos.forEach((s, i) => {
    const largo = largoDe(s);
    if (largo >= limite) return;
    const g = Math.round(grosores[i] * 10) / 10;
    porGrosor.set(g, (porGrosor.get(g) || 0) + largo);
  });
  const [grosorMuro] = [...porGrosor.entries()].sort((a, b) => b[1] - a[1])[0] || [0];
  return segmentos.filter((s, i) => grosores[i] >= grosorMuro / 3 && largoDe(s) < limite);
}
