import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Check, ExternalLink, Loader2, Map as IconoMapa, MapPin, Upload, X } from 'lucide-react';
import {
  guardarMarcadoresCampus, obtenerMarcadoresCampus, obtenerPlanoGeneralCampus, subirPlanoGeneralCampus,
  type MarcadorCampus, type PlanoGeneralCampus as Plano,
} from '../services/recintos';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

/**
 * Plano general o ilustración del campus, arriba de la lista de edificios. Acepta PDF (se muestra su primera página)
 * o imagen. Cada edificio ubicado sobre la ilustración se abre con un clic; «Ubicar edificios» permite marcarlos.
 */
export function PlanoGeneralCampus({ sigla, nombre, edificios = [], onElegir }: {
  sigla: string; nombre: string; edificios?: { codigo: string; nombre: string }[]; onElegir?: (edificio: string) => void;
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
  const lienzo = useRef<HTMLCanvasElement>(null);
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    setUbicando(false);
    Promise.all([obtenerPlanoGeneralCampus(sigla), obtenerMarcadoresCampus(sigla)])
      .then(([p, m]) => { if (vigente) { setPlano(p); setMarcadores(m); } })
      .catch(e => { if (vigente) { setPlano(null); setError(e instanceof Error ? e.message : String(e)); } })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [sigla, version]);

  // Un PDF se dibuja (primera página) en un lienzo del ancho del recuadro.
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
        const ancho = (c.parentElement?.parentElement?.clientWidth || 1200) * Math.min(window.devicePixelRatio || 1, 2);
        const vista = pagina.getViewport({ scale: ancho / base.width });
        c.width = vista.width;
        c.height = vista.height;
        await pagina.render({ canvasContext: c.getContext('2d')!, viewport: vista }).promise;
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [plano, cargando]);

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
  // En modo ubicar: un clic sobre la imagen pone (o mueve) el edificio elegido y pasa al siguiente sin ubicar.
  const alClicImagen = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ubicando || !aUbicar) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 10000) / 10000;
    const y = Math.round(((e.clientY - r.top) / r.height) * 10000) / 10000;
    const lista = [...marcadores.filter(m => m.edificio !== aUbicar), { edificio: aUbicar, x, y }];
    void guardar(lista);
    const siguiente = edificios.find(ed => ed.codigo !== aUbicar && !lista.some(m => m.edificio === ed.codigo));
    setAUbicar(siguiente?.codigo || '');
  };
  const nombreDe = (codigo: string) => edificios.find(e => e.codigo === codigo)?.nombre || '';

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-100">
        <h3 className="flex items-center gap-1.5 font-extrabold text-slate-800"><IconoMapa className="w-4 h-4 text-teal-700" /> Plano general · {nombre}</h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {plano && edificios.length > 0 && (
            <button type="button" onClick={() => { setUbicando(u => !u); setAUbicar(edificios.find(ed => !marcadores.some(m => m.edificio === ed.codigo))?.codigo || edificios[0].codigo); }}
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
      {ubicando && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-900">
          <MapPin className="w-4 h-4" />
          <span>Elija el edificio y haga clic sobre él en la ilustración:</span>
          <select value={aUbicar} onChange={e => setAUbicar(e.target.value)} className="px-2 py-1 border border-amber-300 rounded-lg bg-white">
            {edificios.map(ed => (
              <option key={ed.codigo} value={ed.codigo}>{ed.codigo} · {ed.nombre}{marcadores.some(m => m.edificio === ed.codigo) ? ' ✓' : ''}</option>
            ))}
          </select>
          {marcadores.some(m => m.edificio === aUbicar) && (
            <button type="button" onClick={() => void guardar(marcadores.filter(m => m.edificio !== aUbicar))} className="flex items-center gap-1 text-rose-700 hover:underline">
              <X className="w-3.5 h-3.5" /> Quitar su ubicación
            </button>
          )}
          <span className="ml-auto text-amber-700">{marcadores.length} de {edificios.length} ubicados{guardando ? ' · guardando…' : ''}</span>
        </div>
      )}
      {error && <p className="px-4 py-2 bg-rose-50 text-rose-800 border-b border-rose-100">{error}</p>}
      {cargando ? (
        <div className="flex items-center justify-center gap-2 h-40 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando plano general…</div>
      ) : plano ? (
        <div className="bg-slate-50 flex justify-center">
          {/* La capa de marcadores mide lo mismo que la imagen: los puntos van en % de su ancho y alto. */}
          <div className={`relative inline-block max-w-full ${ubicando ? 'cursor-crosshair' : ''}`} onClick={alClicImagen}>
            {plano.esPdf
              ? <canvas ref={lienzo} className="block w-auto h-auto max-w-full max-h-[75vh]" />
              : <img src={plano.url} alt={`Plano general del campus ${nombre}`} className="block w-auto h-auto max-w-full max-h-[75vh]" draggable={false} />}
            {marcadores.map(m => {
              const nombreEd = nombreDe(m.edificio);
              const marcado = ubicando && m.edificio === aUbicar;
              return (
                <button key={m.edificio} type="button" aria-label={`Abrir ${m.edificio} ${nombreEd}`}
                  onClick={e => { if (ubicando) { e.stopPropagation(); setAUbicar(m.edificio); return; } onElegir?.(m.edificio); }}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 w-[2.6%] min-w-6 aspect-square rounded-full transition
                    ${ubicando ? (marcado ? 'bg-amber-400/70 ring-4 ring-amber-500' : 'bg-teal-500/40 ring-2 ring-white') : 'hover:ring-4 hover:ring-teal-400/80 hover:bg-white/20'}`}
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
                  <span className="pointer-events-none absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900/90 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="font-mono">{m.edificio}</span>{nombreEd ? ` · ${nombreEd}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => selector.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-1 h-40 sm:h-52 border-2 border-dashed border-slate-200 m-0 text-slate-500 hover:bg-slate-50 hover:text-teal-800">
          <IconoMapa className="w-7 h-7 text-slate-300" />
          <span className="font-bold">Aún no hay plano general ni ilustración de este campus</span>
          <span>Súbalo en PDF o como imagen (PNG, JPG o WebP)</span>
        </button>
      )}
      {plano && marcadores.length > 0 && !ubicando && (
        <p className="px-4 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Haga clic en el número de un edificio para abrirlo.</p>
      )}
    </section>
  );
}
