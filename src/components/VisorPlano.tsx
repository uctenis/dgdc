import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2, Scan, Pencil, Trash2, MapPin, CheckCircle2, Circle, X, Undo2, Check, AlertTriangle, Wand2, Tag, BoxSelect, Square,
} from 'lucide-react';
import type { DocumentoEdificio, Piso, Recinto, ZonaRecinto } from '../types/recintos';
import { descargarLamina, eliminarZona, guardarEscalaDocumento, guardarZona, listarZonas } from '../services/recintos';
import { areaRealM2, centroide, colorDeCategoria, limites, puntoEnPoligono, type Punto } from '../utils/geometriaPlano';
import { predibujarRecintos } from '../utils/predibujoPlano';
import { comoTitulo } from '../utils/texto';
import { getConfigEspacios, tipoConfigurado } from '../data/espaciosConfig';

// Worker local, igual que en el resto del sistema (no depende de descargas externas).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

type ModoColor = 'tipo' | 'uso' | 'estado' | 'unidad';
const COLOR_ESTADO: Record<string, string> = {
  Operativo: 'hsl(152 60% 40%)', 'En obra': 'hsl(38 92% 50%)', 'Fuera de servicio': 'hsl(0 72% 51%)', Eliminado: 'hsl(215 16% 62%)',
};
const m2 = (n?: number | null) => (n || n === 0 ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m²` : '—');

interface Props {
  documento: DocumentoEdificio;
  pisos?: Piso[];
  recintos: Recinto[];
  /** Recinto a destacar al abrir (por ejemplo, el que se encontró con el buscador). */
  destacado?: string | null;
  onEditarRecinto: (r: Recinto) => void;
  onEscalaGuardada?: () => void;
}

/**
 * Visor de una lámina: el plano en alta resolución con zoom y desplazamiento, y encima el contorno de cada recinto,
 * coloreado por uso, estado o unidad. Al abrir una lámina sin recintos ubicados, los predibuja a partir de los códigos
 * escritos en el plano. Cada contorno se corrige arrastrando sus vértices o se redibuja (clic en cada esquina), y el
 * área medida en el plano se compara con la superficie registrada.
 */
export function VisorPlano({ documento, pisos = [], recintos, destacado, onEditarRecinto, onEscalaGuardada }: Props) {
  const [pisoLista, setPisoLista] = useState<string>(documento.piso_id || '');
  const [estadoLista, setEstadoLista] = useState<'todos' | 'pendientes' | 'ubicados'>('todos');
  const [filtroRecinto, setFiltroRecinto] = useState('');
  useEffect(() => { setPisoLista(documento.piso_id || ''); }, [documento.piso_id]);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pagina, setPagina] = useState(1);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);   // tamaño de la página en puntos PDF
  const [vista, setVista] = useState({ k: 1, x: 0, y: 0 });                 // zoom y desplazamiento
  const [zonas, setZonas] = useState<ZonaRecinto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState<string | null>(destacado || null);
  const [encima, setEncima] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dibujando, setDibujando] = useState<{ recintoId: string; puntos: Punto[] } | null>(null);
  const [formaDibujo, setFormaDibujo] = useState<'rectangulo' | 'poligono'>('rectangulo');
  const [continuarSiguiente, setContinuarSiguiente] = useState(true);
  const [cursor, setCursor] = useState<Punto | null>(null);
  const [modoColor, setModoColor] = useState<ModoColor>('tipo');
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [escala, setEscala] = useState(documento.escala || '');
  const [guardando, setGuardando] = useState(false);
  const [mostrarRotulos, setMostrarRotulos] = useState(false);
  const [editandoContorno, setEditandoContorno] = useState(false);   // muestra los vértices del recinto elegido
  // «Seleccionar varios»: se arrastra un rectángulo (o se hace clic en cada recinto) para sumar sus superficies.
  const [modoVarios, setModoVarios] = useState(false);
  const [varios, setVarios] = useState<Set<string>>(new Set());
  const [rectangulo, setRectangulo] = useState<{ a: Punto; b: Punto } | null>(null);
  const [predibujando, setPredibujando] = useState(false);
  const [aviso, setAviso] = useState('');
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number; movio: boolean } | null>(null);
  // Vértice que se arrastra; `nuevo` si se acaba de agregar desde el punto medio de un borde.
  const arrastreVertice = useRef<{ zona: ZonaRecinto; indice: number; poligono: Punto[]; x: number; y: number; movio: boolean; nuevo: boolean } | null>(null);
  // Polígono completo que se arrastra al editar contorno.
  const arrastrePoligono = useRef<{ zona: ZonaRecinto; origen: Punto; inicial: Punto[]; poligono: Punto[]; x: number; y: number; movio: boolean } | null>(null);
  const [verticeMarcado, setVerticeMarcado] = useState<number | null>(null);   // esquina elegida para quitarla
  const predibujoAutomatico = useRef(false);

  const recintoPorId = useMemo(() => new Map(recintos.map(r => [r.id, r])), [recintos]);
  const zonasPagina = useMemo(() => zonas.filter(z => z.pagina === pagina && recintoPorId.has(z.recinto_id)), [zonas, pagina, recintoPorId]);
  const zonaDe = useMemo(() => new Map(zonas.map(z => [z.recinto_id, z])), [zonas]);
  const recintosFiltrados = useMemo(() => recintos
    .filter(r => !pisoLista || r.piso_id === pisoLista)
    .filter(r => estadoLista === 'todos' ? true : estadoLista === 'ubicados' ? zonaDe.has(r.id) : !zonaDe.has(r.id))
    .filter(r => {
      const q = filtroRecinto.trim().toLowerCase();
      if (!q) return true;
      return r.codigo.toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q) || (r.uso || '').toLowerCase().includes(q);
    }), [recintos, pisoLista, estadoLista, filtroRecinto, zonaDe]);

  // Abre la lámina y sus contornos.
  useEffect(() => {
    let vigente = true;
    setCargando(true); setError(''); setPdf(null); setTam(null);
    (async () => {
      try {
        if (!documento.archivo_visor) throw new Error('Esta lámina aún no tiene su copia en PDF para el visor.');
        const [datos, z] = await Promise.all([descargarLamina(documento.archivo_visor), listarZonas(documento.id)]);
        const doc = await pdfjsLib.getDocument({ data: datos, isEvalSupported: false }).promise;
        if (!vigente) return;
        setPdf(doc); setZonas(z); setPagina(1);
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [documento.id, documento.archivo_visor]);

  // Dibuja la página en alta resolución (el zoom posterior es solo visual).
  useEffect(() => {
    if (!pdf || !lienzo.current) return;
    let tarea: { cancel: () => void } | null = null;
    let vigente = true;
    (async () => {
      const page = await pdf.getPage(pagina);
      const base = page.getViewport({ scale: 1 });
      const factor = Math.min(4, 5000 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale: factor });
      const c = lienzo.current;
      if (!vigente || !c) return;
      c.width = Math.round(viewport.width); c.height = Math.round(viewport.height);
      const render = page.render({ canvasContext: c.getContext('2d')!, viewport });
      tarea = render;
      await render.promise.catch(() => {});
      if (vigente) setTam({ w: base.width, h: base.height });
    })();
    return () => { vigente = false; tarea?.cancel(); };
  }, [pdf, pagina]);

  const ajustar = useCallback(() => {
    const m = marco.current;
    if (!m || !tam) return;
    const k = Math.min(m.clientWidth / tam.w, m.clientHeight / tam.h) * 0.96;
    setVista({ k, x: (m.clientWidth - tam.w * k) / 2, y: (m.clientHeight - tam.h * k) / 2 });
  }, [tam]);
  useEffect(() => { ajustar(); }, [ajustar, pantallaCompleta]);

  // Acerca la vista a un recinto ya ubicado.
  const enfocar = useCallback((recintoId: string) => {
    const z = zonaDe.get(recintoId);
    const m = marco.current;
    if (!z || !m || !tam) return;
    if (z.pagina !== pagina) setPagina(z.pagina);
    const [x0, y0, x1, y1] = limites(z.poligono);
    const w = (x1 - x0) * tam.w, h = (y1 - y0) * tam.h;
    const k = Math.min(m.clientWidth / Math.max(w, 1), m.clientHeight / Math.max(h, 1)) * 0.45;
    const kk = Math.min(Math.max(k, vista.k), 40);
    const cx = ((x0 + x1) / 2) * tam.w, cy = ((y0 + y1) / 2) * tam.h;
    setVista({ k: kk, x: m.clientWidth / 2 - cx * kk, y: m.clientHeight / 2 - cy * kk });
  }, [zonaDe, tam, pagina, vista.k]);

  useEffect(() => { if (destacado && tam) { setSeleccion(destacado); enfocar(destacado); } }, [destacado, tam]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Detecta y guarda el contorno de los recintos cuyo código aparece escrito en la lámina: los aún no ubicados o, con
   * `todos`, también los ya ubicados (se reemplaza su contorno).
   */
  const predibujar = useCallback(async (automatico: boolean, todos = false) => {
    if (!pdf) return;
    const pendientes = todos ? recintos : recintos.filter(r => !zonaDe.has(r.id));
    if (!pendientes.length) return;
    setPredibujando(true); setAviso('');
    try {
      const nuevas: ZonaRecinto[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const faltan = pendientes.filter(r => !nuevas.some(z => z.recinto_id === r.id));
        if (!faltan.length) break;
        const detectados = await predibujarRecintos(await pdf.getPage(p), faltan, escala);
        for (const d of detectados) nuevas.push(await guardarZona({ documento_id: documento.id, recinto_id: d.recinto_id, pagina: p, poligono: d.poligono }));
      }
      setZonas(prev => [...prev.filter(z => !nuevas.some(n => n.recinto_id === z.recinto_id)), ...nuevas]);
      if (nuevas.length) setAviso(`Se predibujaron ${nuevas.length} recinto(s) a partir de los códigos del plano. Revíselos: arrastre los vértices para corregir un contorno.`);
      else if (!automatico) setAviso('No se encontraron en la lámina los códigos de los recintos que faltan ubicar. Puede dibujarlos a mano con «Ubicar en plano».');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPredibujando(false);
    }
  }, [pdf, recintos, zonaDe, escala, documento.id]);

  // Al cambiar de recinto, sus vértices vuelven a quedar ocultos.
  useEffect(() => { setEditandoContorno(false); }, [seleccion]);
  useEffect(() => { setVerticeMarcado(null); }, [seleccion, editandoContorno]);

  // La primera vez que se abre una lámina sin recintos ubicados, se predibujan solos.
  useEffect(() => {
    if (!pdf || cargando || zonas.length || predibujoAutomatico.current) return;
    predibujoAutomatico.current = true;
    void predibujar(true);
  }, [pdf, cargando, zonas.length, predibujar]);

  // Zoom con la rueda del mouse, centrado en el puntero.
  useEffect(() => {
    const m = marco.current;
    if (!m) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const r = m.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      setVista(v => {
        const k = Math.min(Math.max(v.k * Math.exp(-e.deltaY * 0.0015), 0.05), 60);
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    m.addEventListener('wheel', rueda, { passive: false });
    return () => m.removeEventListener('wheel', rueda);
  }, []);

  const zoom = (f: number) => {
    const m = marco.current;
    if (!m) return;
    const px = m.clientWidth / 2, py = m.clientHeight / 2;
    setVista(v => { const k = Math.min(Math.max(v.k * f, 0.05), 60); return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }; });
  };

  /** Punto de la página (0 a 1) bajo el puntero. */
  const aPagina = (clientX: number, clientY: number): Punto | null => {
    const m = marco.current;
    if (!m || !tam) return null;
    const r = m.getBoundingClientRect();
    return [(clientX - r.left - vista.x) / vista.k / tam.w, (clientY - r.top - vista.y) / vista.k / tam.h];
  };
  const zonaEn = (p: Punto) => [...zonasPagina].reverse().find(z => puntoEnPoligono(p, z.poligono));

  const guardarPoligonoDibujado = useCallback(async (recintoId: string, puntos: Punto[]) => {
    if (puntos.length < 3) return;
    setGuardando(true);
    try {
      const z = await guardarZona({ documento_id: documento.id, recinto_id: recintoId, pagina, poligono: puntos });
      setZonas(prev => [...prev.filter(x => x.recinto_id !== z.recinto_id), z]);
      const idxActual = recintosFiltrados.findIndex(r => r.id === recintoId);
      const siguiente = continuarSiguiente
        ? (recintosFiltrados.slice(idxActual + 1).find(r => r.id !== recintoId && !zonaDe.has(r.id))
          || recintosFiltrados.find(r => r.id !== recintoId && !zonaDe.has(r.id)))
        : undefined;
      if (siguiente) {
        setSeleccion(siguiente.id);
        setDibujando({ recintoId: siguiente.id, puntos: [] });
        setCursor(null);
      } else {
        setSeleccion(z.recinto_id);
        setDibujando(null);
        setCursor(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }, [documento.id, pagina, recintosFiltrados, continuarSiguiente, zonaDe]);

  const rectanguloAPoligono = (a: Punto, b: Punto): Punto[] => {
    const x0 = Math.min(Math.max(Math.min(a[0], b[0]), 0), 1);
    const x1 = Math.min(Math.max(Math.max(a[0], b[0]), 0), 1);
    const y0 = Math.min(Math.max(Math.min(a[1], b[1]), 0), 1);
    const y1 = Math.min(Math.max(Math.max(a[1], b[1]), 0), 1);
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  };

  const alPresionar = (e: React.PointerEvent) => {
    const vertice = (e.target as Element).getAttribute?.('data-vertice');
    const medio = (e.target as Element).getAttribute?.('data-medio');
    const poliActivo = (e.target as Element).getAttribute?.('data-poligono-activo');
    const zona = seleccion ? zonaDe.get(seleccion) : undefined;
    if ((vertice != null || medio != null) && zona && editandoContorno && !dibujando) {
      const base = { zona, x: e.clientX, y: e.clientY, movio: false };
      if (vertice != null) {
        arrastreVertice.current = { ...base, indice: Number(vertice), poligono: zona.poligono, nuevo: false };
      } else {
        // Punto medio de un borde: se agrega ahí una esquina nueva, que se puede arrastrar de inmediato.
        const i = Number(medio), a = zona.poligono[i], b = zona.poligono[(i + 1) % zona.poligono.length];
        const poligono = [...zona.poligono.slice(0, i + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Punto, ...zona.poligono.slice(i + 1)];
        arrastreVertice.current = { ...base, indice: i + 1, poligono, nuevo: true };
        setZonas(prev => prev.map(z => (z.id === zona.id ? { ...z, poligono } : z)));
      }
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (poliActivo && zona && editandoContorno && !dibujando && !e.altKey) {
      const p = aPagina(e.clientX, e.clientY);
      if (p) {
        arrastrePoligono.current = { zona, origen: p, inicial: zona.poligono, poligono: zona.poligono, x: e.clientX, y: e.clientY, movio: false };
        (e.target as Element).setPointerCapture?.(e.pointerId);
        return;
      }
    }
    arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, movio: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (modoVarios && !e.altKey) { const p = aPagina(e.clientX, e.clientY); if (p) setRectangulo({ a: p, b: p }); }
    if (dibujando && formaDibujo === 'rectangulo' && !e.altKey && dibujando.puntos.length === 0) {
      const p = aPagina(e.clientX, e.clientY);
      if (p) { setDibujando(d => d && { ...d, puntos: [p] }); setCursor(p); }
    }
  };
  const alMover = (e: React.PointerEvent) => {
    const av = arrastreVertice.current;
    if (av) {
      if (!av.movio && Math.abs(e.clientX - av.x) + Math.abs(e.clientY - av.y) <= 3) return;   // aún es un clic
      av.movio = true;
      const p = aPagina(e.clientX, e.clientY);
      if (!p) return;
      const punto: Punto = [Math.min(Math.max(p[0], 0), 1), Math.min(Math.max(p[1], 0), 1)];
      av.poligono = av.poligono.map((q, i) => (i === av.indice ? punto : q));
      setZonas(prev => prev.map(z => (z.id === av.zona.id ? { ...z, poligono: av.poligono } : z)));
      return;
    }
    const ap = arrastrePoligono.current;
    if (ap) {
      if (!ap.movio && Math.abs(e.clientX - ap.x) + Math.abs(e.clientY - ap.y) <= 3) return;
      ap.movio = true;
      const p = aPagina(e.clientX, e.clientY);
      if (!p) return;
      const dx = p[0] - ap.origen[0], dy = p[1] - ap.origen[1];
      ap.poligono = ap.inicial.map(([qx, qy]) => [Math.min(Math.max(qx + dx, 0), 1), Math.min(Math.max(qy + dy, 0), 1)] as Punto);
      setZonas(prev => prev.map(z => (z.id === ap.zona.id ? { ...z, poligono: ap.poligono } : z)));
      return;
    }
    const a = arrastre.current;
    if (a) {
      const dx = e.clientX - a.x, dy = e.clientY - a.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) a.movio = true;
      if (a.movio && rectangulo) { const p = aPagina(e.clientX, e.clientY); if (p) setRectangulo(r => r && { ...r, b: p }); return; }
      if (a.movio && dibujando && formaDibujo === 'rectangulo' && !e.altKey) {
        const p = aPagina(e.clientX, e.clientY);
        if (p) setCursor(p);
        return;
      }
      if (a.movio) { setVista(v => ({ ...v, x: a.vx + dx, y: a.vy + dy })); return; }
    }
    const p = aPagina(e.clientX, e.clientY);
    if (!p) return;
    if (dibujando) { setCursor(p); return; }
    const z = zonaEn(p);
    const r = marco.current!.getBoundingClientRect();
    setEncima(z ? { id: z.recinto_id, x: e.clientX - r.left, y: e.clientY - r.top } : null);
  };
  /** Guarda el contorno corregido; si falla, lo devuelve a como estaba. */
  const guardarContorno = async (zona: ZonaRecinto, poligono: Punto[]) => {
    setZonas(prev => prev.map(z => (z.id === zona.id ? { ...z, poligono } : z)));
    try {
      await guardarZona({ documento_id: zona.documento_id, recinto_id: zona.recinto_id, pagina: zona.pagina, poligono });
    } catch (e) {
      setZonas(prev => prev.map(z => (z.id === zona.id ? zona : z)));
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const alSoltar = (e: React.PointerEvent) => {
    const av = arrastreVertice.current;
    if (av) {
      arrastreVertice.current = null;
      if (av.movio || av.nuevo) { void guardarContorno(av.zona, av.poligono); setVerticeMarcado(null); }
      else setVerticeMarcado(m => (m === av.indice ? null : av.indice));   // clic en una esquina: la marca para quitarla
      return;
    }
    const ap = arrastrePoligono.current;
    if (ap) {
      arrastrePoligono.current = null;
      if (ap.movio) void guardarContorno(ap.zona, ap.poligono);
      else setVerticeMarcado(null);
      return;
    }
    const a = arrastre.current;
    arrastre.current = null;
    const rect = rectangulo;
    setRectangulo(null);
    if (a?.movio && rect && modoVarios) {
      // Suma al grupo los recintos cuyo centro queda dentro del rectángulo.
      const [x0, x1] = [Math.min(rect.a[0], rect.b[0]), Math.max(rect.a[0], rect.b[0])];
      const [y0, y1] = [Math.min(rect.a[1], rect.b[1]), Math.max(rect.a[1], rect.b[1])];
      const dentro = zonasPagina.filter(z => { const [cx, cy] = centroide(z.poligono); return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1; });
      setVarios(prev => new Set([...prev, ...dentro.map(z => z.recinto_id)]));
      return;
    }
    const p = aPagina(e.clientX, e.clientY);
    if (dibujando && formaDibujo === 'rectangulo' && !e.altKey && p && dibujando.puntos.length >= 1) {
      const esquinaA = dibujando.puntos[0];
      if (Math.abs(p[0] - esquinaA[0]) > 0.002 && Math.abs(p[1] - esquinaA[1]) > 0.002) {
        void guardarPoligonoDibujado(dibujando.recintoId, rectanguloAPoligono(esquinaA, p));
        return;
      }
      // Si fue solo el primer clic sin arrastrar, espera el segundo clic en la esquina opuesta.
      return;
    }
    if (!a || a.movio || !p) return;
    if (modoVarios) {
      const z = zonaEn(p);
      if (z) setVarios(prev => { const n = new Set(prev); if (n.has(z.recinto_id)) n.delete(z.recinto_id); else n.add(z.recinto_id); return n; });
      return;
    }
    if (dibujando) { setDibujando(d => d && { ...d, puntos: [...d.puntos, p] }); return; }
    if (editandoContorno) { setVerticeMarcado(null); return; }   // mientras se edita, un clic no cambia de recinto
    setSeleccion(zonaEn(p)?.recinto_id || null);
  };

  const terminarDibujo = useCallback(async () => {
    // El doble clic para terminar también marca puntos: se descartan los que caen sobre el anterior.
    const puntos = dibujando?.puntos.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-4) || [];
    if (!dibujando || puntos.length < 3) return;
    await guardarPoligonoDibujado(dibujando.recintoId, puntos);
  }, [dibujando, guardarPoligonoDibujado]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') { if (dibujando) { setDibujando(null); setCursor(null); } else if (pantallaCompleta) setPantallaCompleta(false); else setSeleccion(null); }
      if (dibujando && e.key === 'Enter') void terminarDibujo();
      if (!dibujando && verticeMarcado != null && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); quitarVerticeMarcado(); }
      if (dibujando && (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); setDibujando(d => d && { ...d, puntos: d.puntos.slice(0, -1) }); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [dibujando, pantallaCompleta, terminarDibujo, verticeMarcado]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Quita la esquina marcada del recinto elegido (un contorno necesita al menos tres). */
  function quitarVerticeMarcado() {
    const zona = seleccion ? zonaDe.get(seleccion) : undefined;
    if (!zona || verticeMarcado == null || zona.poligono.length <= 3) return;
    void guardarContorno(zona, zona.poligono.filter((_, i) => i !== verticeMarcado));
    setVerticeMarcado(null);
  }

  /** Doble clic sobre un vértice del recinto elegido lo quita; sobre un borde, agrega uno nuevo ahí. */
  const editarVertice = (e: React.MouseEvent) => {
    const zona = seleccion ? zonaDe.get(seleccion) : undefined;
    const p = aPagina(e.clientX, e.clientY);
    if (!editandoContorno || !zona || !p || !tam || zona.pagina !== pagina) return;
    const vertice = (e.target as Element).getAttribute?.('data-vertice');
    if (vertice != null) {
      if (zona.poligono.length > 3) void guardarContorno(zona, zona.poligono.filter((_, i) => i !== Number(vertice)));
      return;
    }
    // Borde más cercano, medido en pantalla.
    const enPantalla = ([x, y]: Punto): Punto => [x * tam.w * vista.k, y * tam.h * vista.k];
    const [px, py] = enPantalla(p);
    let mejor = -1, distMin = 10;
    zona.poligono.forEach((a, i) => {
      const [ax, ay] = enPantalla(a), [bx, by] = enPantalla(zona.poligono[(i + 1) % zona.poligono.length]);
      const largo2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.min(Math.max(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / largo2, 0), 1);
      const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
      if (d < distMin) { distMin = d; mejor = i; }
    });
    if (mejor >= 0) void guardarContorno(zona, [...zona.poligono.slice(0, mejor + 1), p, ...zona.poligono.slice(mejor + 1)]);
  };

  const quitarDelPlano = async (recintoId: string) => {
    const z = zonaDe.get(recintoId);
    if (!z || !confirm('¿Quitar este recinto del plano? Su ficha no se modifica.')) return;
    try { await eliminarZona(z.id); setZonas(prev => prev.filter(x => x.id !== z.id)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const colorDe = (r?: Recinto) => {
    if (!r) return colorDeCategoria(null);
    if (modoColor === 'estado') return COLOR_ESTADO[r.estado] || colorDeCategoria(r.estado);
    if (modoColor === 'tipo') return tipoConfigurado(r.nombre)?.color || colorDeCategoria(r.nombre);
    return colorDeCategoria(modoColor === 'uso' ? r.uso || r.nombre : r.unidad_usuaria);
  };
  const categoria = (r: Recinto) => (modoColor === 'estado' ? r.estado : modoColor === 'tipo' ? r.nombre : modoColor === 'uso' ? r.uso || r.nombre : r.unidad_usuaria || 'Sin unidad');
  const leyenda = useMemo(() => {
    const vistas = new Map<string, { color: string; n: number }>();
    zonasPagina.forEach(z => { const r = recintoPorId.get(z.recinto_id); if (!r) return; const c = categoria(r); vistas.set(c, { color: colorDe(r), n: (vistas.get(c)?.n || 0) + 1 }); });
    return [...vistas.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [zonasPagina, recintoPorId, modoColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const medida = (recintoId: string) => {
    const z = zonaDe.get(recintoId);
    return z && tam ? areaRealM2(z.poligono, tam.w, tam.h, escala || getConfigEspacios().parametros.escalaPorDefecto) : null;
  };
  const sel = seleccion ? recintoPorId.get(seleccion) : undefined;
  const ubicados = recintos.filter(r => zonaDe.has(r.id)).length;
  const grosor = 1.6 / vista.k;
  const letra = Math.max(11 / vista.k, 0.5);

  return (
    <div className={pantallaCompleta ? 'fixed inset-0 z-[70] bg-slate-100 p-3 flex flex-col gap-2' : 'flex flex-col gap-2'}>
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
        <span className="font-bold text-slate-800">{documento.codigo_lamina || 'Lámina'} · {documento.titulo}</span>
        <span className="text-slate-400">v{documento.version}</span>
        {pdf && pdf.numPages > 1 && (
          <select value={pagina} onChange={e => setPagina(Number(e.target.value))} className="px-2 py-1 border border-slate-300 rounded-lg">
            {Array.from({ length: pdf.numPages }, (_, i) => <option key={i} value={i + 1}>Página {i + 1}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1 text-slate-600">Escala
          <input value={escala} onChange={e => setEscala(e.target.value)} placeholder={getConfigEspacios().parametros.escalaPorDefecto}
            onBlur={() => { if (escala !== (documento.escala || '')) guardarEscalaDocumento(documento.id, escala).then(onEscalaGuardada).catch(err => setError(String(err?.message || err))); }}
            className="w-20 px-2 py-1 border border-slate-300 rounded-lg" />
        </label>
        <label className="flex items-center gap-1 text-slate-600">Color por
          <select value={modoColor} onChange={e => setModoColor(e.target.value as ModoColor)} className="px-2 py-1 border border-slate-300 rounded-lg">
            <option value="tipo">Tipo</option><option value="uso">Uso</option><option value="estado">Estado</option><option value="unidad">Unidad usuaria</option>
          </select>
        </label>
        <button type="button" disabled={predibujando || !pdf || !recintos.length}
          onClick={() => {
            if (ubicados < recintos.length) void predibujar(false);
            else if (confirm('Todos los recintos ya están ubicados. ¿Volver a predibujarlos? Se reemplazarán los contornos de los que se encuentren en la lámina.')) void predibujar(false, true);
          }}
          title="Ubica los recintos buscando su código escrito en la lámina (si ya están todos, los vuelve a dibujar)"
          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-teal-300 font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-40">
          {predibujando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Predibujar recintos
        </button>
        <button type="button" onClick={() => { setModoVarios(m => !m); setVarios(new Set()); setSeleccion(null); }}
          title="Arrastre un rectángulo sobre el plano (por ejemplo, un ala) o haga clic en cada recinto para sumar sus superficies. Alt + arrastrar mueve el plano."
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold ${modoVarios ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
          <BoxSelect className="w-3.5 h-3.5" /> Seleccionar varios
        </button>
        <button type="button" onClick={() => setMostrarRotulos(m => !m)} title="Mostrar u ocultar los códigos y la leyenda de colores sobre el plano"
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold ${mostrarRotulos ? 'bg-slate-700 border-slate-700 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
          <Tag className="w-3.5 h-3.5" /> Rótulos
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" title="Alejar" onClick={() => zoom(1 / 1.4)} className="p-1.5 rounded-lg hover:bg-slate-100"><ZoomOut className="w-4 h-4" /></button>
          <span className="w-12 text-center text-slate-500 tabular-nums">{tam ? Math.round(vista.k * 100) : 0}%</span>
          <button type="button" title="Acercar" onClick={() => zoom(1.4)} className="p-1.5 rounded-lg hover:bg-slate-100"><ZoomIn className="w-4 h-4" /></button>
          <button type="button" title="Ver la lámina completa" onClick={ajustar} className="p-1.5 rounded-lg hover:bg-slate-100"><Scan className="w-4 h-4" /></button>
          <button type="button" title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={() => setPantallaCompleta(p => !p)} className="p-1.5 rounded-lg hover:bg-slate-100">
            {pantallaCompleta ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {aviso && (
        <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-lg p-2.5 text-teal-900">
          <Wand2 className="w-4 h-4 shrink-0" /><span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800">
          <AlertTriangle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className={`flex gap-2 ${pantallaCompleta ? 'flex-1 min-h-0' : 'h-[70vh] min-h-[480px]'}`}>
        {/* Plano */}
        <div ref={marco}
          className={`relative flex-1 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] [background-size:18px_18px] bg-slate-50 select-none touch-none ${dibujando || modoVarios ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
          onPointerDown={alPresionar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerLeave={() => setEncima(null)}
          onDoubleClick={e => (dibujando ? void terminarDibujo() : editarVertice(e))}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.k})`, width: tam?.w, height: tam?.h }}>
            <canvas ref={lienzo} className="block bg-white shadow-xl" style={{ width: tam?.w, height: tam?.h }} />
            {tam && (
              <svg className="absolute inset-0 overflow-visible" width={tam.w} height={tam.h} viewBox={`0 0 ${tam.w} ${tam.h}`}>
                {zonasPagina.map(z => {
                  const r = recintoPorId.get(z.recinto_id);
                  const enGrupo = modoVarios && varios.has(z.recinto_id);
                  const activo = (!modoVarios && z.recinto_id === seleccion) || enGrupo, sobre = encima?.id === z.recinto_id;
                  const color = colorDe(r);
                  const pts = z.poligono.map(([x, y]) => `${x * tam.w},${y * tam.h}`).join(' ');
                  const [cx, cy] = centroide(z.poligono);
                  return (
                    <g key={z.id}>
                      <polygon points={pts} fill={color} fillOpacity={activo ? 0.5 : sobre ? 0.42 : 0.26}
                        data-poligono-activo={activo && editandoContorno && !dibujando ? '1' : undefined}
                        className={activo && editandoContorno && !dibujando ? 'cursor-move' : undefined}
                        stroke={enGrupo ? '#0f172a' : activo ? '#f59e0b' : color} strokeWidth={activo ? grosor * 2.2 : grosor} strokeLinejoin="round" />
                      {mostrarRotulos && <text x={cx * tam.w} y={cy * tam.h} textAnchor="middle" dominantBaseline="middle" fontSize={letra} fontWeight={700}
                        fill="#0f172a" stroke="white" strokeWidth={letra * 0.25} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                        {r?.codigo.replace(`${r.edificio_codigo}_`, '') || ''}
                      </text>}
                      {activo && editandoContorno && !dibujando && z.poligono.map(([x, y], i) => {
                        const [sx, sy] = z.poligono[(i + 1) % z.poligono.length];
                        return (
                          <circle key={`m${i}`} data-medio={i} cx={((x + sx) / 2) * tam.w} cy={((y + sy) / 2) * tam.h} r={3.5 / vista.k}
                            fill="#f59e0b" fillOpacity={0.55} stroke="white" strokeWidth={grosor} className="cursor-copy">
                            <title>Arrastre o haga clic para agregar una esquina aquí</title>
                          </circle>
                        );
                      })}
                      {activo && editandoContorno && !dibujando && z.poligono.map(([x, y], i) => (
                        <circle key={i} data-vertice={i} cx={x * tam.w} cy={y * tam.h} r={(i === verticeMarcado ? 6.5 : 5) / vista.k}
                          fill={i === verticeMarcado ? '#e11d48' : 'white'} stroke={i === verticeMarcado ? 'white' : '#f59e0b'} strokeWidth={grosor * 1.4}
                          className="cursor-move">
                          <title>Arrastre para mover; clic para marcarla y quitarla</title>
                        </circle>
                      ))}
                    </g>
                  );
                })}
                {dibujando && dibujando.puntos.length > 0 && (
                  <g style={{ pointerEvents: 'none' }}>
                    {formaDibujo === 'rectangulo' && cursor ? (
                      <polygon
                        points={rectanguloAPoligono(dibujando.puntos[0], cursor).map(([x, y]) => `${x * tam.w},${y * tam.h}`).join(' ')}
                        fill="rgba(13,148,136,0.22)" stroke="#0d9488" strokeWidth={grosor * 1.8} strokeDasharray={`${4 / vista.k} ${3 / vista.k}`}
                      />
                    ) : (
                      <>
                        <polyline points={[...dibujando.puntos, ...(cursor ? [cursor] : [])].map(([x, y]) => `${x * tam.w},${y * tam.h}`).join(' ')}
                          fill="rgba(13,148,136,0.18)" stroke="#0d9488" strokeWidth={grosor * 1.5} strokeDasharray={`${4 / vista.k} ${3 / vista.k}`} />
                        {dibujando.puntos.map(([x, y], i) => (
                          <circle key={i} cx={x * tam.w} cy={y * tam.h} r={(i === 0 ? 5 : 3.5) / vista.k} fill={i === 0 ? '#0d9488' : 'white'} stroke="#0d9488" strokeWidth={grosor} />
                        ))}
                      </>
                    )}
                  </g>
                )}
              </svg>
            )}
          </div>

          {predibujando && (
            <div className="absolute left-1/2 -translate-x-1/2 top-3 flex items-center gap-2 bg-teal-900 text-white rounded-xl px-3 py-2 shadow-xl">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando los recintos en la lámina…
            </div>
          )}

          {cargando && <div className="absolute inset-0 grid place-items-center bg-white/60"><Loader2 className="w-6 h-6 animate-spin text-teal-700" /></div>}

          {encima && !dibujando && (() => {
            const r = recintoPorId.get(encima.id);
            if (!r) return null;
            const med = medida(r.id);
            return (
              <div className="absolute pointer-events-none bg-slate-900/95 text-white rounded-lg px-2.5 py-1.5 shadow-xl text-[11px] max-w-[240px]" style={{ left: encima.x + 14, top: encima.y + 14 }}>
                <p className="font-mono font-bold">{r.codigo}</p>
                <p>{r.nombre}</p>
                <p className="text-slate-300">{[r.uso, r.estado !== 'Operativo' ? r.estado : ''].filter(Boolean).join(' · ')}</p>
                {!!r.ocupantes?.length && <p className="text-slate-300">{r.ocupantes.slice(0, 3).map(o => comoTitulo(o.nombre)).join(', ')}{r.ocupantes.length > 3 ? ` y ${r.ocupantes.length - 3} más` : ''}</p>}
                <p className="text-slate-300">Registrado {m2(r.superficie_m2)}{med != null ? ` · medido ${m2(Math.round(med * 100) / 100)}` : ''}</p>
              </div>
            );
          })()}

          {rectangulo && tam && (() => {
            const x = Math.min(rectangulo.a[0], rectangulo.b[0]) * tam.w * vista.k + vista.x, y = Math.min(rectangulo.a[1], rectangulo.b[1]) * tam.h * vista.k + vista.y;
            const w = Math.abs(rectangulo.b[0] - rectangulo.a[0]) * tam.w * vista.k, h = Math.abs(rectangulo.b[1] - rectangulo.a[1]) * tam.h * vista.k;
            return <div className="absolute pointer-events-none border-2 border-dashed border-slate-900 bg-slate-900/10 rounded" style={{ left: x, top: y, width: w, height: h }} />;
          })()}

          {modoVarios && (() => {
            const elegidos = recintos.filter(r => varios.has(r.id));
            const suma = (k: 'superficie_m2' | 'superficie_oguc_m2') => elegidos.reduce((s, r) => s + (Number(r[k]) || 0), 0);
            const medidos = elegidos.map(r => medida(r.id)).filter((v): v is number => v != null);
            return (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-900 text-white rounded-xl px-4 py-2.5 shadow-xl text-xs" onPointerDown={e => e.stopPropagation()}>
                {elegidos.length ? (<>
                  <span className="font-bold">{elegidos.length} recinto(s)</span>
                  <span>Útil <strong className="text-sm tabular-nums">{m2(Math.round(suma('superficie_m2') * 100) / 100)}</strong></span>
                  <span>OGUC <strong className="text-sm tabular-nums">{m2(Math.round(suma('superficie_oguc_m2') * 100) / 100)}</strong></span>
                  {medidos.length > 0 && <span title="Suma de las áreas dibujadas en el plano, según la escala">Medido en plano <strong className="tabular-nums">{m2(Math.round(medidos.reduce((s, v) => s + v, 0) * 100) / 100)}</strong></span>}
                  <button type="button" onClick={() => setVarios(new Set())} className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 font-bold">Limpiar</button>
                </>) : <span>Arrastre un rectángulo sobre el área (p. ej. un ala) o haga clic en los recintos. Alt + arrastrar mueve el plano.</span>}
                <button type="button" onClick={() => { setModoVarios(false); setVarios(new Set()); }} className="p-0.5 rounded hover:bg-white/15" title="Salir"><X className="w-4 h-4" /></button>
              </div>
            );
          })()}

          {dibujando && (
            <div className="absolute left-1/2 -translate-x-1/2 top-3 flex flex-wrap items-center gap-2 bg-teal-900 text-white rounded-xl px-3 py-2 shadow-xl max-w-[94%]" onPointerDown={e => e.stopPropagation()}>
              <div className="flex rounded-lg bg-teal-950/60 p-0.5">
                <button type="button" onClick={() => setFormaDibujo('rectangulo')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] ${formaDibujo === 'rectangulo' ? 'bg-white text-teal-950' : 'text-teal-200 hover:text-white'}`}>
                  <Square className="w-3 h-3" /> Rectángulo
                </button>
                <button type="button" onClick={() => setFormaDibujo('poligono')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] ${formaDibujo === 'poligono' ? 'bg-white text-teal-950' : 'text-teal-200 hover:text-white'}`}>
                  <Pencil className="w-3 h-3" /> Polígono
                </button>
              </div>
              <span>
                <strong>{recintoPorId.get(dibujando.recintoId)?.codigo}</strong> ({recintoPorId.get(dibujando.recintoId)?.nombre}) ·{' '}
                {formaDibujo === 'rectangulo'
                  ? 'arrastre de esquina a esquina (o 2 clics)'
                  : `clic en cada esquina (${dibujando.puntos.length})`}
              </span>
              {formaDibujo === 'poligono' && (
                <>
                  <button type="button" onClick={() => setDibujando(d => d && { ...d, puntos: d.puntos.slice(0, -1) })} title="Deshacer último punto (Retroceso)" className="p-1 rounded hover:bg-white/15"><Undo2 className="w-4 h-4" /></button>
                  <button type="button" disabled={dibujando.puntos.length < 3 || guardando} onClick={() => void terminarDibujo()} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white text-teal-900 font-bold disabled:opacity-40">
                    {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Terminar (Enter)
                  </button>
                </>
              )}
              <label className="flex items-center gap-1 text-[11px] text-teal-100 cursor-pointer">
                <input type="checkbox" checked={continuarSiguiente} onChange={e => setContinuarSiguiente(e.target.checked)} className="accent-amber-400" />
                Seguir con el próximo
              </label>
              <button type="button" onClick={() => { setDibujando(null); setCursor(null); }} title="Cancelar (Esc)" className="p-1 rounded hover:bg-white/15"><X className="w-4 h-4" /></button>
            </div>
          )}

          {mostrarRotulos && leyenda.length > 0 && (
            <div className="absolute left-3 bottom-3 bg-white/95 border border-slate-200 rounded-lg px-2.5 py-2 shadow max-h-[40%] overflow-y-auto" onPointerDown={e => e.stopPropagation()}>
              {leyenda.map(([nombre, { color, n }]) => (
                <p key={nombre} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />{nombre} <span className="text-slate-400">({n})</span>
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Panel lateral: recinto elegido y lista de recintos */}
        <aside className="w-72 shrink-0 flex flex-col gap-2 min-h-0">
          {sel ? (
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2">
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 mt-1 rounded-sm shrink-0" style={{ background: colorDe(sel) }} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-extrabold text-slate-900">{sel.codigo}</p>
                  <p className="font-semibold text-slate-700">{sel.nombre}</p>
                </div>
                <button type="button" onClick={() => setSeleccion(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
              </div>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                <dt className="text-slate-400">Uso</dt><dd>{sel.uso || '—'}</dd>
                <dt className="text-slate-400">Estado</dt><dd>{sel.estado}</dd>
                <dt className="text-slate-400">Unidad</dt><dd>{sel.unidad_usuaria || '—'}</dd>
                {!!sel.ocupantes?.length && (<>
                  <dt className="text-slate-400 col-span-2 pt-1">Ocupantes ({sel.ocupantes.length})</dt>
                  <dd className="col-span-2 space-y-0.5">
                    {sel.ocupantes.map((o, i) => (
                      <p key={i}><span className="font-semibold">{comoTitulo(o.nombre)}</span>{o.cargo && <span className="text-slate-500"> · {o.cargo}</span>}</p>
                    ))}
                  </dd>
                </>)}
                <dt className="text-slate-400">m² registrado</dt><dd className="font-bold">{m2(sel.superficie_m2)}</dd>
                <dt className="text-slate-400">m² OGUC</dt><dd>{m2(sel.superficie_oguc_m2)}</dd>
                {(() => {
                  const med = medida(sel.id);
                  if (med == null) return null;
                  const reg = Number(sel.superficie_m2) || 0;
                  const dif = reg ? (med - reg) / reg : null;
                  return (<>
                    <dt className="text-slate-400">m² medido en plano</dt>
                    <dd className={`font-bold ${dif != null && Math.abs(dif) > 0.1 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {m2(Math.round(med * 100) / 100)}{dif != null && <span className="font-normal"> ({dif > 0 ? '+' : ''}{Math.round(dif * 100)}%)</span>}
                    </dd>
                  </>);
                })()}
              </dl>
              {zonaDe.has(sel.id) && editandoContorno && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-500">
                    Arrastre el recinto completo o sus esquinas (puntos blancos) para moverlas. Para <strong>agregar</strong> una esquina, arrastre el punto naranjo del medio de un borde.
                    Para <strong>quitar</strong> una, haga clic en ella y pulse Supr o «Quitar esquina».
                  </p>
                  {verticeMarcado != null && (
                    <button type="button" onClick={quitarVerticeMarcado} disabled={(zonaDe.get(sel.id)?.poligono.length || 0) <= 3}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-300 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40">
                      <Trash2 className="w-3.5 h-3.5" /> Quitar esquina
                    </button>
                  )}
                </div>
              )}
              {zonaDe.has(sel.id) && medida(sel.id) == null && <p className="text-[11px] text-slate-500">Indique la escala de la lámina para medir su superficie en el plano.</p>}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button type="button" onClick={() => onEditarRecinto(sel)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /> Ficha</button>
                {zonaDe.has(sel.id) && (
                  <button type="button" onClick={() => setEditandoContorno(e => !e)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold ${editandoContorno ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-300 text-amber-800 hover:bg-amber-50'}`}>
                    {editandoContorno ? <><Check className="w-3.5 h-3.5" /> Listo</> : <><Pencil className="w-3.5 h-3.5" /> Editar contorno</>}
                  </button>
                )}
                <button type="button" onClick={() => setDibujando({ recintoId: sel.id, puntos: [] })} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-teal-300 font-bold text-teal-800 hover:bg-teal-50">
                  <MapPin className="w-3.5 h-3.5" /> {zonaDe.has(sel.id) ? 'Redibujar' : 'Ubicar en plano'}
                </button>
                {zonaDe.has(sel.id) && <button type="button" title="Quitar del plano" onClick={() => void quitarDelPlano(sel.id)} className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
          ) : (
            <p className="bg-white border border-dashed border-slate-300 rounded-xl p-3 text-slate-500">
              Haga clic en un recinto del plano o de la lista. Para ubicar uno rápido, pulse el ícono 📍 al lado del recinto y arrastre un rectángulo en el plano.
            </p>
          )}
          <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col">
            <div className="p-2.5 border-b border-slate-100 space-y-1.5">
              <p className="font-bold text-slate-700">Recintos <span className="font-normal text-slate-400">· {ubicados} de {recintos.length} en el plano</span></p>
              <div className="flex gap-1">
                {pisos.length > 1 && (
                  <select value={pisoLista} onChange={e => setPisoLista(e.target.value)} className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded-lg text-[11px]">
                    <option value="">Todos los pisos ({recintos.length})</option>
                    {pisos.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
                  </select>
                )}
                <select value={estadoLista} onChange={e => setEstadoLista(e.target.value as 'todos' | 'pendientes' | 'ubicados')} className="px-2 py-1 border border-slate-300 rounded-lg text-[11px]">
                  <option value="todos">Todos</option>
                  <option value="pendientes">Pendientes ({recintos.length - ubicados})</option>
                  <option value="ubicados">Ubicados ({ubicados})</option>
                </select>
              </div>
              <input value={filtroRecinto} onChange={e => setFiltroRecinto(e.target.value)} placeholder="Buscar código o nombre…"
                className="w-full px-2 py-1 border border-slate-300 rounded-lg text-[11px]" />
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {recintosFiltrados.map(r => {
                const ubicado = zonaDe.has(r.id);
                const enDibujo = dibujando?.recintoId === r.id;
                return (
                  <li key={r.id} className={`flex items-center hover:bg-slate-50 ${r.id === seleccion ? 'bg-amber-50' : ''}`}>
                    <button type="button" onClick={() => { setSeleccion(r.id); if (ubicado) enfocar(r.id); }}
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 text-left">
                      {ubicado ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                      <span className="font-mono font-bold text-[11px]">{r.codigo}</span>
                      <span className="truncate text-slate-600">{r.nombre}</span>
                    </button>
                    <button type="button"
                      title={ubicado ? 'Redibujar en el plano' : 'Ubicar en el plano'}
                      onClick={() => { setSeleccion(r.id); setDibujando({ recintoId: r.id, puntos: [] }); }}
                      className={`mr-2 p-1 rounded-md shrink-0 ${enDibujo ? 'bg-teal-700 text-white' : ubicado ? 'text-slate-400 hover:text-teal-700 hover:bg-teal-50' : 'text-teal-700 hover:bg-teal-50'}`}>
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
