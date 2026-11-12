import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ArrowRight, Building2, Check, ChevronRight, ExternalLink, Loader2, Map as IconoMapa, MapPin, Maximize2, Minimize2, PenLine, Scan, Search, Trash2, Trees, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  guardarMarcadoresCampus, obtenerMarcadoresCampus, obtenerPlanoGeneralCampus, subirPlanoGeneralCampus,
  type MarcadorCampus, type PlanoGeneralCampus as Plano,
} from '../services/recintos';
import { ajustarPuntoOrtogonal } from '../utils/geometriaPlano';
import { sinTildes } from '../utils/sugerencias';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

export interface EdificioDelCampus { codigo: string; nombre: string; conDatos: boolean; esComun: boolean }
type Punto = [number, number];

/** Número corto del edificio, como aparece en la ilustración: «CJP08» → «08». */
const numeroDe = (codigo: string, sigla: string) => codigo.startsWith(sigla) ? codigo.slice(sigla.length).replace(/^_/, '') || codigo : codigo;
const redondear = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;

/**
 * Vista del campus (su ilustración) con sus edificios, en vistas coordinadas: la ilustración a un lado y las
 * tarjetas al otro (en el celular, una sobre otra). Pasar el mouse por una tarjeta o por un edificio ilumina su
 * contorno en la ilustración y resalta su tarjeta; un clic en cualquiera de los dos abre el edificio.
 * «Ubicar edificios» permite poner el número de cada uno y dibujar o corregir su contorno.
 */
export function PlanoGeneralCampus({ sigla, nombre, direccion, edificios, onElegir, filtro, onFiltro, onCargado, resaltar, onResaltado }: {
  sigla: string; nombre: string; direccion?: string; edificios: EdificioDelCampus[]; onElegir: (edificio: string) => void;
  filtro: string; onFiltro: (texto: string) => void;
  /** Edificio que se ilumina al abrir (al volver desde su miniatura); `onResaltado` avisa que ya se usó. */
  resaltar?: string | null; onResaltado?: () => void;
  /** Avisa si el campus tiene ilustración (la página deja de mostrar la grilla de edificios). */
  onCargado?: (tieneIlustracion: boolean) => void;
}) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [marcadores, setMarcadores] = useState<MarcadorCampus[]>([]);
  const [ubicando, setUbicando] = useState(false);
  const [herramienta, setHerramienta] = useState<'numero' | 'contorno'>('numero');
  const [aUbicar, setAUbicar] = useState('');
  const [dibujo, setDibujo] = useState<Punto[] | null>(null);           // contorno en curso (redibujar)
  const [cursor, setCursor] = useState<Punto | null>(null);             // posición actual al dibujar contorno
  const [guias, setGuias] = useState<{ x?: number; y?: number } | null>(null);
  const [arrastre, setArrastre] = useState<{ indice: number; origen: Punto; inicial: Punto[]; puntos: Punto[] } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [activo, setActivo] = useState<{ codigo: string; desde: 'mapa' | 'lista' } | null>(null);
  const [elegidoTactil, setElegidoTactil] = useState<string | null>(null);
  const [verOtros, setVerOtros] = useState(false);
  const [vista, setVista] = useState({ k: 1, x: 0, y: 0 });
  const [ampliado, setAmpliado] = useState(false);
  const [mapaActivo, setMapaActivo] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const capa = useRef<HTMLDivElement>(null);
  const selector = useRef<HTMLInputElement>(null);
  const tarjetas = useRef(new Map<string, HTMLButtonElement>());
  const paneo = useRef<{ x: number; y: number; vx: number; vy: number; movio: boolean } | null>(null);
  const suprimirClic = useRef(false);

  const restablecerVista = useCallback(() => setVista({ k: 1, x: 0, y: 0 }), []);

  const zoom = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const c = capa.current;
    const m = marco.current;
    if (!c || !m) return;
    const r = c.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const px = clientX ?? (mr.left + mr.width / 2);
    const py = clientY ?? (mr.top + mr.height / 2);
    setVista(v => {
      const k = Math.min(Math.max(v.k * factor, 1), 8);
      if (k === 1) return { k: 1, x: 0, y: 0 };
      return {
        k,
        x: v.x + (px - r.left) * (1 - k / v.k),
        y: v.y + (py - r.top) * (1 - k / v.k),
      };
    });
  }, []);

  const acercarAEdificio = useCallback((codigo: string, kObjetivo = 3.2) => {
    const c = capa.current;
    const m = marco.current;
    const marcador = ultimos.current.find(x => x.edificio === codigo);
    if (!c || !m || !marcador) return;
    const pts = marcador.contorno?.length ? marcador.contorno : [[marcador.x, marcador.y] as Punto];
    const bx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const by = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const r = c.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    setVista(v => {
      const w0 = r.width / v.k;
      const h0 = r.height / v.k;
      const left0 = r.left - v.x;
      const top0 = r.top - v.y;
      const k = Math.min(Math.max(v.k, kObjetivo), 8);
      return {
        k,
        x: (mr.left + mr.width / 2) - left0 - bx * w0 * k,
        y: (mr.top + mr.height / 2) - top0 - by * h0 * k,
      };
    });
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    setUbicando(false);
    setElegidoTactil(null);
    setVista({ k: 1, x: 0, y: 0 });
    Promise.all([obtenerPlanoGeneralCampus(sigla), obtenerMarcadoresCampus(sigla)])
      .then(([p, m]) => { if (vigente) { setPlano(p); setMarcadores(m); onCargado?.(!!p); } })
      .catch(e => { if (vigente) { setPlano(null); onCargado?.(false); setError(e instanceof Error ? e.message : String(e)); } })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [sigla, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un PDF se dibuja (primera página) en un lienzo con resolución suficiente para acercarse con nitidez.
  useEffect(() => {
    if (!plano?.esPdf || cargando) return;
    let cancelado = false;
    (async () => {
      try {
        const datos = await (await fetch(plano.url)).arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: datos, isEvalSupported: false }).promise;
        const pagina = await doc.getPage(1);
        const c = lienzo.current;
        if (cancelado || !c) return;
        const base = pagina.getViewport({ scale: 1 });
        const vistaPdf = pagina.getViewport({ scale: (2400 * Math.min(window.devicePixelRatio || 1, 2)) / base.width });
        c.width = vistaPdf.width;
        c.height = vistaPdf.height;
        await pagina.render({ canvasContext: c.getContext('2d')!, viewport: vistaPdf }).promise;
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [plano, cargando]);

  // Zoom con la rueda sobre la ilustración cuando se está ubicando, en vista ampliada, con zoom > 100 %, tras hacer clic en el mapa o con Ctrl.
  const zoomRuedaActivo = ubicando || ampliado || vista.k > 1 || mapaActivo;
  const zoomRuedaRef = useRef(zoomRuedaActivo);
  zoomRuedaRef.current = zoomRuedaActivo;
  useEffect(() => {
    const m = marco.current;
    if (!m) return;
    const alGirarRueda = (e: WheelEvent) => {
      if (!zoomRuedaRef.current && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0018);
      zoom(factor, e.clientX, e.clientY);
    };
    m.addEventListener('wheel', alGirarRueda, { passive: false });
    return () => m.removeEventListener('wheel', alGirarRueda);
  }, [zoom, cargando, plano]);

  // Al iluminar un edificio desde la ilustración, su tarjeta se desplaza a la vista (solo en pantalla ancha).
  useEffect(() => {
    if (activo?.desde !== 'mapa' || !window.matchMedia('(min-width: 1024px)').matches) return;
    tarjetas.current.get(activo.codigo)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activo]);

  // Al volver desde la miniatura de un edificio: se ilumina unos segundos y su tarjeta queda a la vista.
  useEffect(() => {
    if (!resaltar || cargando || !marcadores.length) return;
    const codigo = resaltar;
    setActivo({ codigo, desde: 'mapa' });
    onResaltado?.();   // vuelve `resaltar` a null: el apagado no se cancela con ese cambio
    setTimeout(() => setActivo(a => (a?.codigo === codigo ? null : a)), 3500);
  }, [resaltar, cargando, marcadores.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc cancela el contorno en curso o cierra la vista ampliada; Enter termina el contorno.
  useEffect(() => {
    if (!dibujo && !ampliado) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dibujo) { setDibujo(null); setCursor(null); setGuias(null); }
        else if (ampliado) setAmpliado(false);
      }
      if (dibujo && e.key === 'Enter') terminarDibujo();
      // Retroceso deshace el último punto (sin borrar texto de un campo, si lo hubiera con foco).
      if (dibujo && e.key === 'Backspace' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setDibujo(d => d && d.slice(0, -1)); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const subir = async (archivo?: File) => {
    if (!archivo) return;
    setSubiendo(true);
    setError('');
    try {
      await subirPlanoGeneralCampus(sigla, archivo);
      setVersion(v => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
      if (selector.current) selector.current.value = '';
    }
  };

  // Cada cambio parte de lo último guardado (no de una copia vieja del estado: dos cambios seguidos se pisaban).
  const ultimos = useRef<MarcadorCampus[]>([]);
  ultimos.current = marcadores;
  const guardar = async (lista: MarcadorCampus[]) => {
    ultimos.current = lista;
    setMarcadores(lista);
    setGuardando(true);
    try { await guardarMarcadoresCampus(sigla, lista); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setGuardando(false); }
  };
  const cambiarEdificio = (codigo: string, cambio: Partial<MarcadorCampus> | null) => {
    const actuales = ultimos.current;
    const previo = actuales.find(m => m.edificio === codigo);
    if (cambio === null) { void guardar(actuales.filter(m => m.edificio !== codigo)); return; }
    // Un edificio sin número (recién agregado con su contorno) lo recibe en el centro de su contorno, nunca en el
    // centro de la imagen.
    const contorno = cambio.contorno || previo?.contorno;
    const centro: Punto = contorno?.length
      ? [redondear(contorno.reduce((s, p) => s + p[0], 0) / contorno.length), redondear(contorno.reduce((s, p) => s + p[1], 0) / contorno.length)]
      : [0.5, 0.5];
    const nuevo: MarcadorCampus = { edificio: codigo, x: previo?.x ?? centro[0], y: previo?.y ?? centro[1], ...(previo?.contorno ? { contorno: previo.contorno } : {}), ...cambio };
    if (!nuevo.contorno) delete nuevo.contorno;
    void guardar([...actuales.filter(m => m.edificio !== codigo), nuevo]);
  };
  const puntoEn = (e: { clientX: number; clientY: number }): Punto => {
    const r = capa.current!.getBoundingClientRect();
    return [redondear((e.clientX - r.left) / r.width), redondear((e.clientY - r.top) / r.height)];
  };
  const terminarDibujo = () => {
    // El doble clic que termina también cuenta como clics: se quitan los puntos repetidos (o casi) seguidos.
    const limpio = (dibujo || []).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.002);
    if (limpio.length >= 3 && aUbicar) cambiarEdificio(aUbicar, { contorno: limpio });
    setDibujo(null);
    setCursor(null);
    setGuias(null);
  };
  const alClicImagen = (e: React.MouseEvent<HTMLDivElement>) => {
    setMapaActivo(true);
    if (suprimirClic.current) { suprimirClic.current = false; return; }
    if (!ubicando) { setElegidoTactil(null); return; }
    if (!aUbicar) return;
    const crudo = puntoEn(e);
    if (herramienta === 'contorno') {
      if (dibujo) {
        const r = capa.current?.getBoundingClientRect();
        // Si ya hay al menos 3 puntos y se hace clic cerca del primer vértice, se cierra y guarda el contorno.
        if (dibujo.length >= 3 && r) {
          const d0 = Math.hypot((crudo[0] - dibujo[0][0]) * r.width, (crudo[1] - dibujo[0][1]) * r.height);
          if (d0 <= 12) { terminarDibujo(); return; }
        }
        const p = (dibujo.length > 0 && r && !e.shiftKey)
          ? ajustarPuntoOrtogonal(crudo, dibujo[dibujo.length - 1], dibujo, r.width, r.height).punto
          : crudo;
        setDibujo([...dibujo, [redondear(p[0]), redondear(p[1])]]);
      }
      return;
    }
    // Número: se pone (o mueve) y se pasa al siguiente sin ubicar.
    cambiarEdificio(aUbicar, { x: crudo[0], y: crudo[1] });
    const siguiente = principales.find(ed => ed.codigo !== aUbicar && !ultimos.current.some(m => m.edificio === ed.codigo));
    if (siguiente) setAUbicar(siguiente.codigo);
  };
  const alPresionarMapa = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || arrastre) return;
    setMapaActivo(true);
    paneo.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, movio: false };
  };
  // Arrastre de una esquina del contorno, paneo del mapa con zoom o vista previa al dibujar.
  const alMover = (e: React.PointerEvent) => {
    if (arrastre) {
      const crudo = puntoEn(e);
      const r = capa.current?.getBoundingClientRect();
      const n = arrastre.inicial.length;
      const vecinos = [
        arrastre.inicial[(arrastre.indice - 1 + n) % n],
        arrastre.inicial[(arrastre.indice + 1) % n],
        ...arrastre.inicial.filter((_, i) => i !== arrastre.indice && i !== (arrastre.indice - 1 + n) % n && i !== (arrastre.indice + 1) % n),
      ];
      const ajuste = (!e.shiftKey && r)
        ? ajustarPuntoOrtogonal(crudo, arrastre.origen, vecinos, r.width, r.height)
        : { punto: crudo };
      const p: Punto = [redondear(ajuste.punto[0]), redondear(ajuste.punto[1])];
      setGuias(ajuste.guiaX != null || ajuste.guiaY != null ? { x: ajuste.guiaX, y: ajuste.guiaY } : null);
      setArrastre(a => a && { ...a, puntos: a.puntos.map((q, i) => (i === a.indice ? p : q)) });
      return;
    }
    const pPan = paneo.current;
    if (pPan && (vista.k > 1 || ubicando || ampliado)) {
      const dx = e.clientX - pPan.x;
      const dy = e.clientY - pPan.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) pPan.movio = true;
      if (pPan.movio) {
        setVista(v => ({ ...v, x: pPan.vx + dx, y: pPan.vy + dy }));
        return;
      }
    }
    if (ubicando && herramienta === 'contorno' && dibujo && capa.current) {
      const crudo = puntoEn(e);
      const r = capa.current.getBoundingClientRect();
      if (dibujo.length > 0 && !e.shiftKey) {
        const ajuste = ajustarPuntoOrtogonal(crudo, dibujo[dibujo.length - 1], dibujo, r.width, r.height);
        setGuias(ajuste.guiaX != null || ajuste.guiaY != null ? { x: ajuste.guiaX, y: ajuste.guiaY } : null);
        setCursor([redondear(ajuste.punto[0]), redondear(ajuste.punto[1])]);
      } else {
        setGuias(null);
        setCursor(crudo);
      }
    }
  };
  const alSoltar = () => {
    if (paneo.current) {
      if (paneo.current.movio) suprimirClic.current = true;
      paneo.current = null;
    }
    if (!arrastre) return;
    setGuias(null);
    cambiarEdificio(aUbicar, { contorno: arrastre.puntos });
    setArrastre(null);
  };
  /** Borra una esquina del contorno del edificio elegido (siempre quedan al menos 3). */
  const borrarEsquina = (i: number) => {
    const c = ultimos.current.find(m => m.edificio === aUbicar)?.contorno;
    if (!c || c.length <= 3) return;
    cambiarEdificio(aUbicar, { contorno: c.filter((_, k) => k !== i) });
  };

  const marcadorDe = useMemo(() => new Map(marcadores.map(m => [m.edificio, m])), [marcadores]);
  const lista = useMemo(() => {
    const q = sinTildes(filtro);
    return edificios
      .filter(e => !e.esComun || marcadorDe.has(e.codigo))
      .filter(e => !q || q.split(' ').every(p => sinTildes(`${e.codigo} ${e.nombre}`).includes(p)))
      .sort((a, b) => Number(marcadorDe.has(b.codigo)) - Number(marcadorDe.has(a.codigo)) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }, [edificios, marcadorDe, filtro]);
  // Edificios secundarios (garitas, bodegas…: número de tres dígitos, como CJP101) no suelen estar en la ilustración:
  // van al final al ubicar y en las tarjetas quedan en «Otros edificios del campus», plegado.
  const esSecundario = (codigo: string) => numeroDe(codigo, sigla).replace(/\D/g, '').length >= 3;
  const principales = edificios.filter(e => !e.esComun && !esSecundario(e.codigo));
  const ordenUbicar = [...principales, ...edificios.filter(e => !e.esComun && esSecundario(e.codigo)), ...edificios.filter(e => e.esComun)];
  const enMapa = lista.filter(e => marcadorDe.has(e.codigo));
  const otros = lista.filter(e => !marcadorDe.has(e.codigo));
  const nombreDe = (codigo: string) => edificios.find(e => e.codigo === codigo)?.nombre || '';
  const iluminado = ubicando ? null : (activo?.codigo || elegidoTactil);
  const enfocar = (codigo: string) => !ubicando && setActivo({ codigo, desde: 'mapa' });
  const abrir = (codigo: string) => {
    if (suprimirClic.current) { suprimirClic.current = false; return; }
    if (window.matchMedia('(hover: none)').matches && elegidoTactil !== codigo) { setElegidoTactil(codigo); return; }
    onElegir(codigo);
  };
  const elegido = ubicando ? marcadorDe.get(aUbicar) : undefined;
  const contornoEditable: Punto[] | undefined = arrastre?.puntos || elegido?.contorno;

  const cabecera = (
    <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-100">
      <h3 className="flex items-center gap-1.5 font-extrabold text-slate-800"><IconoMapa className="w-4 h-4 text-teal-700" /> Vista del campus · {nombre}</h3>
      {direccion && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`} target="_blank" rel="noreferrer"
          title="Ver en Google Maps" className="flex items-center gap-1 text-xs text-slate-500 hover:text-teal-700 hover:underline">
          <MapPin className="w-3.5 h-3.5" /> {direccion}
        </a>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {plano && (
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-1 py-0.5">
            <button type="button" title="Alejar mapa" onClick={() => zoom(1 / 1.35)} disabled={vista.k <= 1}
              className="p-1 rounded hover:bg-white text-slate-700 disabled:opacity-35"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="w-11 text-center text-xs font-bold text-slate-600 tabular-nums">{Math.round(vista.k * 100)}%</span>
            <button type="button" title="Acercar mapa" onClick={() => zoom(1.35)} disabled={vista.k >= 8}
              className="p-1 rounded hover:bg-white text-slate-700 disabled:opacity-35"><ZoomIn className="w-3.5 h-3.5" /></button>
            {vista.k > 1 && (
              <button type="button" title="Ver el campus completo (100%)" onClick={restablecerVista}
                className="p-1 rounded hover:bg-white text-slate-700"><Scan className="w-3.5 h-3.5" /></button>
            )}
          </div>
        )}
        {plano && (
          <button type="button" onClick={() => setAmpliado(a => !a)}
            title={ampliado ? 'Salir de pantalla completa (Esc)' : 'Ampliar mapa del campus a pantalla completa'}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-bold ${ampliado ? 'bg-teal-700 border-teal-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            {ampliado ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />} {ampliado ? 'Reducir' : 'Ampliar'}
          </button>
        )}
        {plano && edificios.length > 0 && (
          <button type="button" onClick={() => {
            const nuevo = !ubicando;
            setUbicando(nuevo);
            setDibujo(null); setCursor(null); setGuias(null);
            if (!nuevo) restablecerVista();
            setAUbicar(a => a || principales.find(ed => !marcadorDe.has(ed.codigo))?.codigo || ordenUbicar[0]?.codigo || '');
          }}
            title="Ponga el número de cada edificio y dibuje o corrija su contorno sobre la ilustración"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-bold ${ubicando ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            {ubicando ? <Check className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />} {ubicando ? 'Listo' : 'Ubicar edificios'}
          </button>
        )}
        {plano && (
          <a href={plano.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir original
          </a>
        )}
        <button type="button" disabled={subiendo} onClick={() => selector.current?.click()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-300 font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-50">
          {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {plano ? 'Reemplazar ilustración' : 'Subir ilustración'}
        </button>
        <input ref={selector} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => void subir(e.target.files?.[0])} />
      </div>
    </div>
  );

  if (cargando) {
    return <div className="flex items-center justify-center gap-2 h-40 bg-white border border-slate-200 rounded-2xl text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando la vista del campus…</div>;
  }

  if (!plano) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {cabecera}
        {error && <p className="px-4 py-2 bg-rose-50 text-rose-800 border-b border-rose-100">{error}</p>}
        <button type="button" onClick={() => selector.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-1 h-32 text-slate-500 hover:bg-slate-50 hover:text-teal-800">
          <IconoMapa className="w-7 h-7 text-slate-300" />
          <span className="font-bold">Aún no hay ilustración de este campus</span>
          <span>Súbala como imagen (3600 × 2700 px, JPG) o PDF; luego se ubican los edificios para abrirlos con un clic.</span>
        </button>
      </section>
    );
  }

  const tactil = elegidoTactil ? edificios.find(e => e.codigo === elegidoTactil) : undefined;
  const botonHerramienta = (h: typeof herramienta, texto: string) => (
    <button type="button" onClick={() => {
      setHerramienta(h);
      setDibujo(null); setCursor(null); setGuias(null);
      if (h === 'contorno' && aUbicar && marcadorDe.has(aUbicar) && vista.k < 2.2) acercarAEdificio(aUbicar, 3);
    }}
      className={`px-2.5 py-1 font-bold ${herramienta === h ? 'bg-amber-600 text-white' : 'text-amber-900 hover:bg-amber-100'}`}>{texto}</button>
  );

  return (
    <section className={ampliado
      ? 'fixed inset-0 z-[70] bg-white flex flex-col overflow-hidden'
      : 'bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden'}>
      {cabecera}
      {ubicando && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-900">
          <select value={aUbicar} onChange={e => {
            const cod = e.target.value;
            setAUbicar(cod);
            setDibujo(null); setCursor(null); setGuias(null);
            if (herramienta === 'contorno' && marcadorDe.has(cod) && vista.k >= 1.5) acercarAEdificio(cod, Math.max(vista.k, 2.8));
          }} className="px-2 py-1 border border-amber-300 rounded-lg bg-white font-bold">
            {ordenUbicar.map(ed => {
              const m = marcadorDe.get(ed.codigo);
              return <option key={ed.codigo} value={ed.codigo}>{ed.codigo} · {ed.nombre}{m ? (m.contorno ? ' ✓ número y contorno' : ' ✓ número') : ''}</option>;
            })}
          </select>
          <div className="flex rounded-lg border border-amber-300 overflow-hidden bg-white">
            {botonHerramienta('numero', 'Número')}
            {botonHerramienta('contorno', 'Contorno')}
          </div>
          {marcadorDe.has(aUbicar) && (
            <button type="button" onClick={() => acercarAEdificio(aUbicar, Math.max(vista.k * 1.4, 3.2))}
              title="Acerca y centra el mapa en este edificio para delimitarlo con precisión"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 bg-white font-bold text-amber-900 hover:bg-amber-100">
              <ZoomIn className="w-3.5 h-3.5" /> Acercar al edificio
            </button>
          )}
          {vista.k > 1 && (
            <button type="button" onClick={restablecerVista}
              title="Volver a ver todo el campus (100%)"
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-300 bg-white font-bold text-amber-900 hover:bg-amber-100">
              <Scan className="w-3.5 h-3.5" /> Ver todo
            </button>
          )}
          {herramienta === 'numero' ? (
            <span>Haga clic sobre el edificio para poner (o mover) su número. Use la rueda o arrastre para moverse.</span>
          ) : dibujo ? (
            <>
              <span>Haga clic en cada esquina ({dibujo.length} pts; se alinea en 90°, o <strong>Shift</strong> libre). Clic en el 1.er punto, doble clic o «Terminar» guarda; arrastre para mover el mapa.</span>
              <button type="button" disabled={dibujo.length < 3} onClick={terminarDibujo} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold disabled:opacity-40">Terminar (Enter)</button>
              <button type="button" disabled={!dibujo.length} onClick={() => setDibujo(d => d && d.slice(0, -1))} className="px-2 py-1 rounded-lg hover:bg-amber-100 disabled:opacity-40">Deshacer punto</button>
              <button type="button" onClick={() => { setDibujo(null); setCursor(null); setGuias(null); }} className="px-2 py-1 rounded-lg hover:bg-amber-100">Cancelar</button>
            </>
          ) : (
            <>
              <span>{elegido?.contorno
                ? 'Arrastre una esquina para ajustarla (Shift = libre); doble clic o clic derecho la borra; arrastre un punto medio para agregar una.'
                : 'Este edificio aún no tiene contorno.'}</span>
              <button type="button" onClick={() => {
                setDibujo([]); setCursor(null); setGuias(null);
                if (marcadorDe.has(aUbicar) && vista.k < 2.5) acercarAEdificio(aUbicar, 3.2);
              }} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold">
                <PenLine className="w-3.5 h-3.5" /> {elegido?.contorno ? 'Redibujar' : 'Dibujar contorno'}
              </button>
              {elegido?.contorno && (
                <button type="button" onClick={() => cambiarEdificio(aUbicar, { contorno: undefined })} className="flex items-center gap-1 text-rose-700 hover:underline">
                  <Trash2 className="w-3.5 h-3.5" /> Borrar contorno
                </button>
              )}
            </>
          )}
          {herramienta === 'numero' && marcadorDe.has(aUbicar) && (
            <button type="button" onClick={() => cambiarEdificio(aUbicar, null)} className="flex items-center gap-1 text-rose-700 hover:underline">
              <X className="w-3.5 h-3.5" /> Quitar de la ilustración
            </button>
          )}
          <span className="ml-auto text-amber-700">{principales.filter(e => marcadorDe.has(e.codigo)).length} de {principales.length} edificios principales ubicados · {marcadores.filter(m => m.contorno).length} con contorno{guardando ? ' · guardando…' : ''}</span>
        </div>
      )}
      {error && <p className="px-4 py-2 bg-rose-50 text-rose-800 border-b border-rose-100">{error}</p>}

      <div className={`lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(300px,28vw,400px)] ${ampliado ? 'flex-1 min-h-0' : ''}`}>
        {/* Ilustración */}
        <div ref={marco}
          onPointerDown={alPresionarMapa}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={() => { paneo.current = null; }}
          onMouseLeave={() => { setActivo(a => (a?.desde === 'mapa' ? null : a)); if (!paneo.current && !arrastre && !ubicando) setMapaActivo(false); }}
          className={`relative bg-slate-100 flex items-center justify-center overflow-hidden lg:border-r border-slate-100 select-none ${
            ubicando ? 'cursor-crosshair' : vista.k > 1 ? 'cursor-grab active:cursor-grabbing' : ''
          }`}>
          <div ref={capa}
            style={{
              transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.k})`,
              transformOrigin: '0 0',
            }}
            className="relative w-full lg:w-auto select-none"
            onClick={alClicImagen} onDoubleClick={() => dibujo && terminarDibujo()}>
            {plano.esPdf
              ? <canvas ref={lienzo} className={`block w-full h-auto lg:w-auto lg:max-w-full ${ampliado ? 'lg:max-h-[calc(100vh-110px)]' : 'lg:max-h-[78vh]'}`} />
              : <img src={plano.url} alt={`Ilustración del campus ${nombre}`} draggable={false} className={`block w-full h-auto lg:w-auto lg:max-w-full ${ampliado ? 'lg:max-h-[calc(100vh-110px)]' : 'lg:max-h-[78vh]'}`} />}

            {/* Contornos: invisibles hasta que se ilumina el edificio; también se puede entrar haciendo clic en él. */}
            <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
              {!ubicando && marcadores.filter(m => m.contorno && m.contorno.length >= 3).map(m => {
                const encendido = iluminado === m.edificio;
                return (
                  <polygon key={m.edificio} points={m.contorno!.map(p => p.join(',')).join(' ')}
                    // Iluminación sutil: el edificio se aclara (mezcla «screen») con un borde fino y suave.
                    className="cursor-pointer transition-all duration-300"
                    style={{ mixBlendMode: 'screen' }}
                    fill={encendido ? 'rgba(255, 236, 179, 0.55)' : 'transparent'}
                    stroke={encendido ? 'rgba(255, 244, 214, 0.9)' : 'transparent'} strokeWidth={1.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round"
                    onMouseEnter={() => enfocar(m.edificio)}
                    onClick={e => { e.stopPropagation(); abrir(m.edificio); }} />
                );
              })}
              {/* En modo edición se muestran tenues los contornos ya guardados de los demás edificios como referencia. */}
              {ubicando && marcadores.filter(m => m.edificio !== aUbicar && m.contorno && m.contorno.length >= 3).map(m => (
                <polygon key={m.edificio} points={m.contorno!.map(p => p.join(',')).join(' ')}
                  fill="rgba(20, 184, 166, 0.12)" stroke="rgba(13, 148, 136, 0.55)" strokeWidth={1.2} vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }} />
              ))}
              {/* Guías ortogonales al dibujar o arrastrar esquinas. */}
              {ubicando && guias && (
                <g style={{ pointerEvents: 'none' }}>
                  {guias.x != null && <line x1={guias.x} y1={0} x2={guias.x} y2={1} stroke="#0284c7" strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                  {guias.y != null && <line x1={0} y1={guias.y} x2={1} y2={guias.y} stroke="#0284c7" strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                </g>
              )}
              {/* Edición: el contorno del edificio elegido, o el que se está dibujando (con línea elástica al cursor). */}
              {ubicando && herramienta === 'contorno' && !dibujo && contornoEditable && (
                <polygon points={contornoEditable.map(p => p.join(',')).join(' ')} fill="rgba(252, 211, 77, 0.25)" stroke="#d97706" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              )}
              {ubicando && herramienta === 'contorno' && dibujo && dibujo.length > 0 && (
                <polygon
                  points={[...dibujo, ...(cursor ? [cursor] : [])].map(p => p.join(',')).join(' ')}
                  fill="rgba(252, 211, 77, 0.22)" stroke="#d97706" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </svg>

            {/* Puntos medios de cada lado: al arrastrarlos se agrega una esquina nueva ahí. */}
            {ubicando && herramienta === 'contorno' && !dibujo && !arrastre && contornoEditable?.map((p, i) => {
              const q = contornoEditable[(i + 1) % contornoEditable.length];
              const medio: Punto = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
              return (
                <span key={`m${i}`} role="presentation" title="Arrastre para agregar una esquina aquí"
                  onPointerDown={e => {
                    e.stopPropagation();
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    const puntos = [...contornoEditable.slice(0, i + 1), medio, ...contornoEditable.slice(i + 1)];
                    setArrastre({ indice: i + 1, origen: medio, inicial: puntos, puntos });
                  }}
                  onClick={e => e.stopPropagation()}
                  className="absolute w-2.5 h-2.5 rounded-full bg-amber-500/75 border border-white cursor-copy hover:bg-amber-500"
                  style={{ left: `${medio[0] * 100}%`, top: `${medio[1] * 100}%`, transform: `translate(-50%, -50%) scale(${1 / vista.k})` }} />
              );
            })}
            {/* Esquinas del contorno: arrastrar para mover; doble clic o clic derecho para borrar. */}
            {ubicando && herramienta === 'contorno' && !dibujo && contornoEditable?.map((p, i) => (
              <span key={i} role="presentation" title="Arrastre para moverla (Shift = libre) · doble clic o clic derecho para borrarla"
                onPointerDown={e => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  setArrastre({ indice: i, origen: contornoEditable[i], inicial: contornoEditable, puntos: contornoEditable });
                }}
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => { e.stopPropagation(); borrarEsquina(i); }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); borrarEsquina(i); }}
                className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-amber-600 shadow cursor-move hover:bg-rose-100 hover:border-rose-600"
                style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%`, transform: `translate(-50%, -50%) scale(${1 / vista.k})` }} />
            ))}
            {ubicando && dibujo?.map((p, i) => (
              <span key={i}
                title={i === 0 && dibujo.length >= 3 ? 'Haga clic aquí para cerrar y guardar el contorno' : undefined}
                onClick={i === 0 && dibujo.length >= 3 ? e => { e.stopPropagation(); terminarDibujo(); } : undefined}
                className={`absolute rounded-full ${
                  i === 0 && dibujo.length >= 3
                    ? 'w-4 h-4 bg-emerald-500 border-2 border-white shadow cursor-pointer hover:scale-125'
                    : 'pointer-events-none w-2.5 h-2.5 bg-amber-600 border border-white'
                }`}
                style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%`, transform: `translate(-50%, -50%) scale(${1 / vista.k})` }} />
            ))}

            {marcadores.map(m => {
              const encendido = iluminado === m.edificio;
              const enUbicar = ubicando && m.edificio === aUbicar;
              return (
                <button key={m.edificio} type="button" aria-label={`Abrir ${m.edificio} ${nombreDe(m.edificio)}`}
                  onMouseEnter={() => enfocar(m.edificio)} onFocus={() => enfocar(m.edificio)} onBlur={() => setActivo(null)}
                  onClick={e => {
                    e.stopPropagation();
                    if (suprimirClic.current) { suprimirClic.current = false; return; }
                    if (ubicando) { if (!dibujo) setAUbicar(m.edificio); return; }
                    abrir(m.edificio);
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-[2.6%] min-w-7 aspect-square rounded-full transition
                    ${enUbicar ? 'bg-amber-400/70 ring-4 ring-amber-500' : ubicando ? 'bg-teal-500/40 ring-2 ring-white' : ''}
                    ${ubicando && herramienta === 'contorno' ? 'pointer-events-none' : ''}`}
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
                  {encendido && !ubicando && (
                    <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 whitespace-nowrap rounded-lg bg-slate-900/95 px-2.5 py-1 text-xs font-semibold text-white shadow-lg"
                      style={{ transform: `translateX(-50%) scale(${1 / vista.k})`, transformOrigin: 'bottom center' }}>
                      <span className="font-mono text-amber-300">{m.edificio}</span> · {nombreDe(m.edificio)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Controles flotantes de zoom sobre el mapa */}
          <div className="absolute right-2.5 bottom-2.5 z-10 flex items-center gap-0.5 rounded-xl bg-white/95 backdrop-blur border border-slate-200 px-1.5 py-1 shadow-md"
            onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <button type="button" title="Alejar" onClick={() => zoom(1 / 1.35)} disabled={vista.k <= 1}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-700 disabled:opacity-35"><ZoomOut className="w-4 h-4" /></button>
            <button type="button" title="Restablecer al 100%" onClick={restablecerVista}
              className="px-1.5 text-xs font-bold text-slate-700 tabular-nums hover:text-teal-700">{Math.round(vista.k * 100)}%</button>
            <button type="button" title="Acercar" onClick={() => zoom(1.35)} disabled={vista.k >= 8}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-700 disabled:opacity-35"><ZoomIn className="w-4 h-4" /></button>
            <button type="button" title={ampliado ? 'Reducir vista' : 'Ampliar mapa a pantalla completa'} onClick={() => setAmpliado(a => !a)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-700">
              {ampliado ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Celular: ficha del edificio tocado, con el botón para entrar. */}
          {tactil && !ubicando && (
            <div className="absolute left-2 right-2 bottom-2 z-20 flex items-center gap-3 rounded-xl bg-white/95 backdrop-blur px-3 py-2 shadow-xl" onClick={e => e.stopPropagation()}>
              <span className="grid place-items-center w-9 h-9 rounded-full bg-blue-600 text-white font-extrabold text-sm shrink-0">{numeroDe(tactil.codigo, sigla)}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] font-bold text-teal-800">{tactil.codigo}</span>
                <span className="block font-bold text-slate-800 truncate">{tactil.nombre || 'Sin nombre'}</span>
              </span>
              <button type="button" onClick={() => onElegir(tactil.codigo)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-700 text-white font-bold">
                Entrar <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Tarjetas de los edificios */}
        <div className="lg:relative border-t lg:border-t-0 border-slate-100">
          <div className="lg:absolute lg:inset-0 flex flex-col">
            <div className="p-2.5 border-b border-slate-100">
              <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-teal-400">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input value={filtro} onChange={e => onFiltro(e.target.value)} placeholder={`Buscar entre ${edificios.filter(e => !e.esComun).length} edificios…`} className="flex-1 min-w-0 bg-transparent outline-none" />
                {filtro && <button type="button" onClick={() => onFiltro('')}><X className="w-3.5 h-3.5 text-slate-400" /></button>}
              </label>
            </div>
            <div className="flex-1 min-h-0 max-h-[60vh] lg:max-h-none overflow-y-auto p-2 space-y-1">
              {(() => {
                const tarjeta = (e: EdificioDelCampus) => {
                const ubicado = marcadorDe.has(e.codigo);
                const encendido = iluminado === e.codigo;
                const Icono = e.esComun ? Trees : Building2;
                return (
                  <button key={e.codigo} type="button" ref={el => { if (el) tarjetas.current.set(e.codigo, el); else tarjetas.current.delete(e.codigo); }}
                    onMouseEnter={() => setActivo({ codigo: e.codigo, desde: 'lista' })} onMouseLeave={() => setActivo(null)}
                    onFocus={() => setActivo({ codigo: e.codigo, desde: 'lista' })} onBlur={() => setActivo(null)}
                    onClick={() => onElegir(e.codigo)}
                    className={`group w-full flex items-center gap-3 text-left rounded-xl border px-2.5 py-2 transition
                      ${encendido ? 'border-amber-300 bg-amber-50 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}>
                    {ubicado
                      ? <span className={`grid place-items-center w-9 h-9 rounded-full font-extrabold text-sm shrink-0 transition ${encendido ? 'bg-amber-400 text-slate-900' : 'bg-blue-600 text-white'}`}>{numeroDe(e.codigo, sigla)}</span>
                      : <span className="grid place-items-center w-9 h-9 rounded-full bg-slate-100 text-slate-400 shrink-0"><Icono className="w-4 h-4" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] font-bold text-teal-800">{e.codigo}</span>
                      <span className="block font-bold text-slate-800 leading-tight truncate">{e.nombre || 'Sin nombre'}</span>
                      <span className={`block text-[10px] ${e.conDatos ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {e.conDatos ? 'Con datos del catastro' : 'Sin datos aún'}
                      </span>
                    </span>
                    <ChevronRight className={`w-4 h-4 shrink-0 transition ${encendido ? 'text-amber-600 translate-x-0.5' : 'text-slate-300 group-hover:text-slate-500'}`} />
                  </button>
                );
              };
                return (
                  <>
                    {enMapa.map(tarjeta)}
                    {otros.length > 0 && (
                      <div className={enMapa.length ? 'pt-2 mt-1 border-t border-slate-100' : ''}>
                        {enMapa.length > 0 && (
                          <button type="button" onClick={() => setVerOtros(v => !v)}
                            className="w-full flex items-center gap-1 px-1.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-500 hover:text-slate-700">
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${verOtros || filtro ? 'rotate-90' : ''}`} />
                            Otros edificios del campus ({otros.length})
                            <span className="ml-auto normal-case font-normal tracking-normal">no están en la ilustración</span>
                          </button>
                        )}
                        {(verOtros || !!filtro || !enMapa.length) && <div className="space-y-1 mt-1">{otros.map(tarjeta)}</div>}
                      </div>
                    )}
                  </>
                );
              })()}
              {!lista.length && <p className="p-3 text-slate-500">Ningún edificio coincide con «{filtro}».</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
