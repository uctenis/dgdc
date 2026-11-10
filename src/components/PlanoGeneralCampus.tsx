import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ArrowRight, Building2, Check, ChevronRight, ExternalLink, Loader2, Map as IconoMapa, MapPin, Search, Trees, Upload, X } from 'lucide-react';
import {
  guardarMarcadoresCampus, obtenerMarcadoresCampus, obtenerPlanoGeneralCampus, subirPlanoGeneralCampus,
  type MarcadorCampus, type PlanoGeneralCampus as Plano,
} from '../services/recintos';
import { sinTildes } from '../utils/sugerencias';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

export interface EdificioDelCampus { codigo: string; nombre: string; conDatos: boolean; esComun: boolean }

/** Número corto del edificio, como aparece en la ilustración: «CJP08» → «08». */
const numeroDe = (codigo: string, sigla: string) => codigo.startsWith(sigla) ? codigo.slice(sigla.length).replace(/^_/, '') || codigo : codigo;

/**
 * Plano general (ilustración) del campus con sus edificios, en vistas coordinadas: la ilustración a un lado y las
 * tarjetas al otro (en el celular, una sobre otra). Pasar el mouse por una tarjeta ilumina ese edificio en la
 * ilustración y pasar por un número resalta su tarjeta; un clic en cualquiera de los dos abre el edificio.
 * Si el campus no tiene ilustración queda solo el recuadro para subirla y la página muestra las tarjetas de siempre.
 */
export function PlanoGeneralCampus({ sigla, nombre, edificios, onElegir, filtro, onFiltro, onCargado }: {
  sigla: string; nombre: string; edificios: EdificioDelCampus[]; onElegir: (edificio: string) => void;
  filtro: string; onFiltro: (texto: string) => void;
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
  const [aUbicar, setAUbicar] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Edificio iluminado: por el mouse (sobre la tarjeta o el número) o, en pantallas táctiles, por un toque.
  const [activo, setActivo] = useState<{ codigo: string; desde: 'mapa' | 'lista' } | null>(null);
  const [elegidoTactil, setElegidoTactil] = useState<string | null>(null);
  const [anchoImagen, setAnchoImagen] = useState(0);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const capa = useRef<HTMLDivElement>(null);
  const selector = useRef<HTMLInputElement>(null);
  const tarjetas = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    setUbicando(false);
    setElegidoTactil(null);
    Promise.all([obtenerPlanoGeneralCampus(sigla), obtenerMarcadoresCampus(sigla)])
      .then(([p, m]) => { if (vigente) { setPlano(p); setMarcadores(m); onCargado?.(!!p); } })
      .catch(e => { if (vigente) { setPlano(null); onCargado?.(false); setError(e instanceof Error ? e.message : String(e)); } })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [sigla, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ancho real de la imagen (el foco de luz se mide en píxeles).
  useEffect(() => {
    const c = capa.current;
    if (!c) return;
    const obs = new ResizeObserver(() => setAnchoImagen(c.clientWidth));
    obs.observe(c);
    return () => obs.disconnect();
  }, [plano, cargando]);

  // Un PDF se dibuja (primera página) en un lienzo.
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
        const vista = pagina.getViewport({ scale: (1600 * Math.min(window.devicePixelRatio || 1, 2)) / base.width });
        c.width = vista.width;
        c.height = vista.height;
        await pagina.render({ canvasContext: c.getContext('2d')!, viewport: vista }).promise;
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [plano, cargando]);

  // Al iluminar un edificio desde la ilustración, su tarjeta se desplaza a la vista (sin mover la página).
  useEffect(() => {
    if (activo?.desde !== 'mapa') return;
    // En el celular la lista va debajo de la ilustración: ahí no se mueve (no hay mouse que la pida).
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    tarjetas.current.get(activo.codigo)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activo]);

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

  const guardar = async (lista: MarcadorCampus[]) => {
    setMarcadores(lista);
    setGuardando(true);
    try { await guardarMarcadoresCampus(sigla, lista); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setGuardando(false); }
  };
  const alClicImagen = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ubicando) { setElegidoTactil(null); return; }
    if (!aUbicar) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 10000) / 10000;
    const y = Math.round(((e.clientY - r.top) / r.height) * 10000) / 10000;
    const lista = [...marcadores.filter(m => m.edificio !== aUbicar), { edificio: aUbicar, x, y }];
    void guardar(lista);
    const siguiente = edificios.find(ed => ed.codigo !== aUbicar && !lista.some(m => m.edificio === ed.codigo));
    setAUbicar(siguiente?.codigo || '');
  };

  const marcadorDe = useMemo(() => new Map(marcadores.map(m => [m.edificio, m])), [marcadores]);
  // Tarjetas: los edificios y construcciones, más los espacios comunes que estén ubicados en la ilustración. Primero
  // los ubicados, en el orden de su número.
  const lista = useMemo(() => {
    const q = sinTildes(filtro);
    return edificios
      .filter(e => !e.esComun || marcadorDe.has(e.codigo))
      .filter(e => !q || q.split(' ').every(p => sinTildes(`${e.codigo} ${e.nombre}`).includes(p)))
      .sort((a, b) => Number(marcadorDe.has(b.codigo)) - Number(marcadorDe.has(a.codigo)) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }, [edificios, marcadorDe, filtro]);
  const nombreDe = (codigo: string) => edificios.find(e => e.codigo === codigo)?.nombre || '';
  const iluminado = ubicando ? null : (activo?.codigo || elegidoTactil);
  const focoDe = iluminado ? marcadorDe.get(iluminado) : undefined;
  const radio = Math.max(46, anchoImagen * 0.075);

  const cabecera = (
    <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-100">
      <h3 className="flex items-center gap-1.5 font-extrabold text-slate-800"><IconoMapa className="w-4 h-4 text-teal-700" /> Plano general · {nombre}</h3>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {plano && edificios.length > 0 && (
          <button type="button" onClick={() => { setUbicando(u => !u); setAUbicar(edificios.find(ed => !marcadorDe.has(ed.codigo))?.codigo || edificios[0].codigo); }}
            title="Marque sobre la ilustración dónde está cada edificio, para abrirlo con un clic"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-bold ${ubicando ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            {ubicando ? <Check className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />} {ubicando ? 'Listo' : 'Ubicar edificios'}
          </button>
        )}
        {plano && (
          <a href={plano.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50">
            <ExternalLink className="w-3.5 h-3.5" /> Ver en grande
          </a>
        )}
        <button type="button" disabled={subiendo} onClick={() => selector.current?.click()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-300 font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-50">
          {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {plano ? 'Reemplazar' : 'Subir plano o ilustración'}
        </button>
        <input ref={selector} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => void subir(e.target.files?.[0])} />
      </div>
    </div>
  );

  if (cargando) {
    return <div className="flex items-center justify-center gap-2 h-40 bg-white border border-slate-200 rounded-2xl text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando plano general…</div>;
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

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {cabecera}
      {ubicando && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-900">
          <MapPin className="w-4 h-4" />
          <span>Elija el edificio y haga clic sobre él en la ilustración:</span>
          <select value={aUbicar} onChange={e => setAUbicar(e.target.value)} className="px-2 py-1 border border-amber-300 rounded-lg bg-white">
            {edificios.map(ed => <option key={ed.codigo} value={ed.codigo}>{ed.codigo} · {ed.nombre}{marcadorDe.has(ed.codigo) ? ' ✓' : ''}</option>)}
          </select>
          {marcadorDe.has(aUbicar) && (
            <button type="button" onClick={() => void guardar(marcadores.filter(m => m.edificio !== aUbicar))} className="flex items-center gap-1 text-rose-700 hover:underline">
              <X className="w-3.5 h-3.5" /> Quitar su ubicación
            </button>
          )}
          <span className="ml-auto text-amber-700">{marcadores.length} de {edificios.length} ubicados{guardando ? ' · guardando…' : ''}</span>
        </div>
      )}
      {error && <p className="px-4 py-2 bg-rose-50 text-rose-800 border-b border-rose-100">{error}</p>}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(300px,28vw,400px)]">
        {/* Ilustración */}
        <div className="bg-slate-100 flex items-start justify-center lg:border-r border-slate-100">
          <div ref={capa} className={`relative w-full lg:w-auto select-none ${ubicando ? 'cursor-crosshair' : ''}`} onClick={alClicImagen}
            onMouseLeave={() => setActivo(a => (a?.desde === 'mapa' ? null : a))}>
            {plano.esPdf
              ? <canvas ref={lienzo} className="block w-full h-auto lg:w-auto lg:max-w-full lg:max-h-[78vh]" />
              : <img src={plano.url} alt={`Ilustración del campus ${nombre}`} draggable={false} className="block w-full h-auto lg:w-auto lg:max-w-full lg:max-h-[78vh]" />}
            {/* Foco de luz: todo se oscurece salvo un círculo sobre el edificio iluminado. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-slate-950/50 transition-opacity duration-300"
              style={{
                opacity: focoDe ? 1 : 0,
                ...(focoDe ? {
                  maskImage: `radial-gradient(circle ${radio}px at ${focoDe.x * 100}% ${focoDe.y * 100}%, transparent 0, transparent 70%, black 100%)`,
                  WebkitMaskImage: `radial-gradient(circle ${radio}px at ${focoDe.x * 100}% ${focoDe.y * 100}%, transparent 0, transparent 70%, black 100%)`,
                } : {}),
              }} />
            {marcadores.map(m => {
              const encendido = iluminado === m.edificio;
              const enUbicar = ubicando && m.edificio === aUbicar;
              return (
                <button key={m.edificio} type="button" aria-label={`Abrir ${m.edificio} ${nombreDe(m.edificio)}`}
                  onMouseEnter={() => !ubicando && setActivo({ codigo: m.edificio, desde: 'mapa' })}
                  onFocus={() => !ubicando && setActivo({ codigo: m.edificio, desde: 'mapa' })}
                  onBlur={() => setActivo(null)}
                  onClick={e => {
                    e.stopPropagation();
                    if (ubicando) { setAUbicar(m.edificio); return; }
                    // En pantallas táctiles el primer toque ilumina y muestra la ficha; el botón «Entrar» abre.
                    if (window.matchMedia('(hover: none)').matches && elegidoTactil !== m.edificio) { setElegidoTactil(m.edificio); return; }
                    onElegir(m.edificio);
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-[2.6%] min-w-7 aspect-square rounded-full transition
                    ${enUbicar ? 'bg-amber-400/70 ring-4 ring-amber-500' : ubicando ? 'bg-teal-500/40 ring-2 ring-white' : encendido ? 'ring-4 ring-amber-300 shadow-[0_0_24px_6px_rgba(252,211,77,0.75)]' : 'hover:ring-4 hover:ring-amber-300/80'}`}
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
                  {encendido && !ubicando && (
                    <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900/95 px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
                      <span className="font-mono text-amber-300">{m.edificio}</span> · {nombreDe(m.edificio)}
                    </span>
                  )}
                </button>
              );
            })}
            {/* Celular: ficha del edificio tocado, con el botón para entrar. */}
            {tactil && !ubicando && (
              <div className="absolute left-2 right-2 bottom-2 flex items-center gap-3 rounded-xl bg-white/95 backdrop-blur px-3 py-2 shadow-xl" onClick={e => e.stopPropagation()}>
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
              {lista.map(e => {
                const ubicado = marcadorDe.has(e.codigo);
                const encendido = iluminado === e.codigo;
                const Icono = e.esComun ? Trees : Building2;
                return (
                  <button key={e.codigo} type="button" ref={el => { if (el) tarjetas.current.set(e.codigo, el); else tarjetas.current.delete(e.codigo); }}
                    onMouseEnter={() => setActivo({ codigo: e.codigo, desde: 'lista' })} onMouseLeave={() => setActivo(null)}
                    onFocus={() => setActivo({ codigo: e.codigo, desde: 'lista' })} onBlur={() => setActivo(null)}
                    onClick={() => onElegir(e.codigo)}
                    className={`group w-full flex items-center gap-3 text-left rounded-xl border px-2.5 py-2 transition
                      ${encendido ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}>
                    {ubicado
                      ? <span className={`grid place-items-center w-9 h-9 rounded-full font-extrabold text-sm shrink-0 transition ${encendido ? 'bg-amber-400 text-slate-900' : 'bg-blue-600 text-white'}`}>{numeroDe(e.codigo, sigla)}</span>
                      : <span className="grid place-items-center w-9 h-9 rounded-full bg-slate-100 text-slate-400 shrink-0"><Icono className="w-4 h-4" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] font-bold text-teal-800">{e.codigo}</span>
                      <span className="block font-bold text-slate-800 leading-tight truncate">{e.nombre || 'Sin nombre'}</span>
                      <span className={`block text-[10px] ${e.conDatos ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {e.conDatos ? 'Con datos del catastro' : 'Sin datos aún'}{!ubicado ? ' · sin ubicar en la ilustración' : ''}
                      </span>
                    </span>
                    <ChevronRight className={`w-4 h-4 shrink-0 transition ${encendido ? 'text-teal-700 translate-x-0.5' : 'text-slate-300 group-hover:text-slate-500'}`} />
                  </button>
                );
              })}
              {!lista.length && <p className="p-3 text-slate-500">Ningún edificio coincide con «{filtro}».</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
