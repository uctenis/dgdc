import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2, Scan, Pencil, Trash2, MapPin, CheckCircle2, Circle, X, Undo2, Check, AlertTriangle,
} from 'lucide-react';
import type { DocumentoEdificio, Recinto, ZonaRecinto } from '../types/recintos';
import { descargarLamina, eliminarZona, guardarEscalaDocumento, guardarZona, listarZonas } from '../services/recintos';
import { areaRealM2, centroide, colorDeCategoria, limites, puntoEnPoligono, type Punto } from '../utils/geometriaPlano';

// Worker local, igual que en el resto del sistema (no depende de descargas externas).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

type ModoColor = 'uso' | 'estado' | 'unidad';
const COLOR_ESTADO: Record<string, string> = {
  Operativo: 'hsl(152 60% 40%)', 'En obra': 'hsl(38 92% 50%)', 'Fuera de servicio': 'hsl(0 72% 51%)', Eliminado: 'hsl(215 16% 62%)',
};
const m2 = (n?: number | null) => (n || n === 0 ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m²` : '—');

interface Props {
  documento: DocumentoEdificio;
  recintos: Recinto[];
  /** Recinto a destacar al abrir (por ejemplo, el que se encontró con el buscador). */
  destacado?: string | null;
  onEditarRecinto: (r: Recinto) => void;
  onEscalaGuardada?: () => void;
}

/**
 * Visor de una lámina: el plano en alta resolución con zoom y desplazamiento, y encima el contorno de cada recinto,
 * coloreado por uso, estado o unidad. Permite dibujar el contorno de un recinto (clic en cada vértice) y compara el
 * área medida en el plano con la superficie registrada.
 */
export function VisorPlano({ documento, recintos, destacado, onEditarRecinto, onEscalaGuardada }: Props) {
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
  const [cursor, setCursor] = useState<Punto | null>(null);
  const [modoColor, setModoColor] = useState<ModoColor>('uso');
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [escala, setEscala] = useState(documento.escala || '');
  const [guardando, setGuardando] = useState(false);
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number; movio: boolean } | null>(null);

  const recintoPorId = useMemo(() => new Map(recintos.map(r => [r.id, r])), [recintos]);
  const zonasPagina = useMemo(() => zonas.filter(z => z.pagina === pagina && recintoPorId.has(z.recinto_id)), [zonas, pagina, recintoPorId]);
  const zonaDe = useMemo(() => new Map(zonas.map(z => [z.recinto_id, z])), [zonas]);

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

  const alPresionar = (e: React.PointerEvent) => {
    arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, movio: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const alMover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (a) {
      const dx = e.clientX - a.x, dy = e.clientY - a.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) a.movio = true;
      if (a.movio) { setVista(v => ({ ...v, x: a.vx + dx, y: a.vy + dy })); return; }
    }
    const p = aPagina(e.clientX, e.clientY);
    if (!p) return;
    if (dibujando) { setCursor(p); return; }
    const z = zonaEn(p);
    const r = marco.current!.getBoundingClientRect();
    setEncima(z ? { id: z.recinto_id, x: e.clientX - r.left, y: e.clientY - r.top } : null);
  };
  const alSoltar = (e: React.PointerEvent) => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.movio) return;
    const p = aPagina(e.clientX, e.clientY);
    if (!p) return;
    if (dibujando) { setDibujando(d => d && { ...d, puntos: [...d.puntos, p] }); return; }
    setSeleccion(zonaEn(p)?.recinto_id || null);
  };

  const terminarDibujo = useCallback(async () => {
    // El doble clic para terminar también marca puntos: se descartan los que caen sobre el anterior.
    const puntos = dibujando?.puntos.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-4) || [];
    if (!dibujando || puntos.length < 3) return;
    setGuardando(true);
    try {
      const z = await guardarZona({ documento_id: documento.id, recinto_id: dibujando.recintoId, pagina, poligono: puntos });
      setZonas(prev => [...prev.filter(x => x.recinto_id !== z.recinto_id), z]);
      setSeleccion(z.recinto_id);
      setDibujando(null); setCursor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }, [dibujando, documento.id, pagina]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') { if (dibujando) { setDibujando(null); setCursor(null); } else if (pantallaCompleta) setPantallaCompleta(false); else setSeleccion(null); }
      if (dibujando && e.key === 'Enter') void terminarDibujo();
      if (dibujando && (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); setDibujando(d => d && { ...d, puntos: d.puntos.slice(0, -1) }); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [dibujando, pantallaCompleta, terminarDibujo]);

  const quitarDelPlano = async (recintoId: string) => {
    const z = zonaDe.get(recintoId);
    if (!z || !confirm('¿Quitar este recinto del plano? Su ficha no se modifica.')) return;
    try { await eliminarZona(z.id); setZonas(prev => prev.filter(x => x.id !== z.id)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const colorDe = (r?: Recinto) => {
    if (!r) return colorDeCategoria(null);
    if (modoColor === 'estado') return COLOR_ESTADO[r.estado] || colorDeCategoria(r.estado);
    return colorDeCategoria(modoColor === 'uso' ? r.uso || r.nombre : r.unidad_usuaria);
  };
  const categoria = (r: Recinto) => (modoColor === 'estado' ? r.estado : modoColor === 'uso' ? r.uso || r.nombre : r.unidad_usuaria || 'Sin unidad');
  const leyenda = useMemo(() => {
    const vistas = new Map<string, { color: string; n: number }>();
    zonasPagina.forEach(z => { const r = recintoPorId.get(z.recinto_id); if (!r) return; const c = categoria(r); vistas.set(c, { color: colorDe(r), n: (vistas.get(c)?.n || 0) + 1 }); });
    return [...vistas.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [zonasPagina, recintoPorId, modoColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const medida = (recintoId: string) => {
    const z = zonaDe.get(recintoId);
    return z && tam ? areaRealM2(z.poligono, tam.w, tam.h, escala) : null;
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
          <input value={escala} onChange={e => setEscala(e.target.value)} placeholder="1:100"
            onBlur={() => { if (escala !== (documento.escala || '')) guardarEscalaDocumento(documento.id, escala).then(onEscalaGuardada).catch(err => setError(String(err?.message || err))); }}
            className="w-20 px-2 py-1 border border-slate-300 rounded-lg" />
        </label>
        <label className="flex items-center gap-1 text-slate-600">Color por
          <select value={modoColor} onChange={e => setModoColor(e.target.value as ModoColor)} className="px-2 py-1 border border-slate-300 rounded-lg">
            <option value="uso">Uso</option><option value="estado">Estado</option><option value="unidad">Unidad usuaria</option>
          </select>
        </label>
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

      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800">
          <AlertTriangle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className={`flex gap-2 ${pantallaCompleta ? 'flex-1 min-h-0' : 'h-[70vh] min-h-[480px]'}`}>
        {/* Plano */}
        <div ref={marco}
          className={`relative flex-1 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] [background-size:18px_18px] bg-slate-50 select-none touch-none ${dibujando ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
          onPointerDown={alPresionar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerLeave={() => setEncima(null)}
          onDoubleClick={() => dibujando && void terminarDibujo()}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.k})`, width: tam?.w, height: tam?.h }}>
            <canvas ref={lienzo} className="block bg-white shadow-xl" style={{ width: tam?.w, height: tam?.h }} />
            {tam && (
              <svg className="absolute inset-0 overflow-visible" width={tam.w} height={tam.h} viewBox={`0 0 ${tam.w} ${tam.h}`}>
                {zonasPagina.map(z => {
                  const r = recintoPorId.get(z.recinto_id);
                  const activo = z.recinto_id === seleccion, sobre = encima?.id === z.recinto_id;
                  const color = colorDe(r);
                  const pts = z.poligono.map(([x, y]) => `${x * tam.w},${y * tam.h}`).join(' ');
                  const [cx, cy] = centroide(z.poligono);
                  return (
                    <g key={z.id}>
                      <polygon points={pts} fill={color} fillOpacity={activo ? 0.5 : sobre ? 0.42 : 0.26}
                        stroke={activo ? '#f59e0b' : color} strokeWidth={activo ? grosor * 2.2 : grosor} strokeLinejoin="round" />
                      <text x={cx * tam.w} y={cy * tam.h} textAnchor="middle" dominantBaseline="middle" fontSize={letra} fontWeight={700}
                        fill="#0f172a" stroke="white" strokeWidth={letra * 0.25} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                        {r?.codigo.replace(`${r.edificio_codigo}_`, '') || ''}
                      </text>
                    </g>
                  );
                })}
                {dibujando && dibujando.puntos.length > 0 && (
                  <g style={{ pointerEvents: 'none' }}>
                    <polyline points={[...dibujando.puntos, ...(cursor ? [cursor] : [])].map(([x, y]) => `${x * tam.w},${y * tam.h}`).join(' ')}
                      fill="rgba(13,148,136,0.18)" stroke="#0d9488" strokeWidth={grosor * 1.5} strokeDasharray={`${4 / vista.k} ${3 / vista.k}`} />
                    {dibujando.puntos.map(([x, y], i) => (
                      <circle key={i} cx={x * tam.w} cy={y * tam.h} r={(i === 0 ? 5 : 3.5) / vista.k} fill={i === 0 ? '#0d9488' : 'white'} stroke="#0d9488" strokeWidth={grosor} />
                    ))}
                  </g>
                )}
              </svg>
            )}
          </div>

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
                <p className="text-slate-300">Registrado {m2(r.superficie_m2)}{med != null ? ` · medido ${m2(Math.round(med * 100) / 100)}` : ''}</p>
              </div>
            );
          })()}

          {dibujando && (
            <div className="absolute left-1/2 -translate-x-1/2 top-3 flex items-center gap-2 bg-teal-900 text-white rounded-xl px-3 py-2 shadow-xl">
              <Pencil className="w-4 h-4" />
              <span>Dibujando <strong>{recintoPorId.get(dibujando.recintoId)?.codigo}</strong>: clic en cada esquina · {dibujando.puntos.length} punto(s)</span>
              <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => setDibujando(d => d && { ...d, puntos: d.puntos.slice(0, -1) })} title="Deshacer último punto (Retroceso)" className="p-1 rounded hover:bg-white/15"><Undo2 className="w-4 h-4" /></button>
              <button type="button" onPointerDown={e => e.stopPropagation()} disabled={dibujando.puntos.length < 3 || guardando} onClick={() => void terminarDibujo()} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white text-teal-900 font-bold disabled:opacity-40">
                {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Terminar (Enter)
              </button>
              <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => { setDibujando(null); setCursor(null); }} title="Cancelar (Esc)" className="p-1 rounded hover:bg-white/15"><X className="w-4 h-4" /></button>
            </div>
          )}

          {leyenda.length > 0 && (
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
              {zonaDe.has(sel.id) && medida(sel.id) == null && <p className="text-[11px] text-slate-500">Indique la escala de la lámina para medir su superficie en el plano.</p>}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button type="button" onClick={() => onEditarRecinto(sel)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /> Ficha</button>
                <button type="button" onClick={() => setDibujando({ recintoId: sel.id, puntos: [] })} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-teal-300 font-bold text-teal-800 hover:bg-teal-50">
                  <MapPin className="w-3.5 h-3.5" /> {zonaDe.has(sel.id) ? 'Redibujar' : 'Ubicar en plano'}
                </button>
                {zonaDe.has(sel.id) && <button type="button" title="Quitar del plano" onClick={() => void quitarDelPlano(sel.id)} className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
          ) : (
            <p className="bg-white border border-dashed border-slate-300 rounded-xl p-3 text-slate-500">
              Haga clic en un recinto del plano o de la lista. Para ubicar uno, elíjalo en la lista y marque sus esquinas en el plano.
            </p>
          )}
          <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col">
            <p className="px-3 py-2 border-b border-slate-100 font-bold text-slate-700">Recintos <span className="font-normal text-slate-400">· {ubicados} de {recintos.length} en el plano</span></p>
            <ul className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {recintos.map(r => {
                const ubicado = zonaDe.has(r.id);
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => { setSeleccion(r.id); if (ubicado) enfocar(r.id); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 ${r.id === seleccion ? 'bg-amber-50' : ''}`}>
                      {ubicado ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                      <span className="font-mono font-bold text-[11px]">{r.codigo}</span>
                      <span className="truncate text-slate-600">{r.nombre}</span>
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
