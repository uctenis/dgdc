import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ExternalLink, Loader2, Map as IconoMapa, Upload } from 'lucide-react';
import { obtenerPlanoGeneralCampus, subirPlanoGeneralCampus, type PlanoGeneralCampus as Plano } from '../services/recintos';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

/**
 * Plano general o ilustración del campus, arriba de la lista de edificios. Acepta PDF (se muestra su primera página)
 * o imagen; si el campus aún no tiene, queda el espacio con el botón para subirlo.
 */
export function PlanoGeneralCampus({ sigla, nombre }: { sigla: string; nombre: string }) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    obtenerPlanoGeneralCampus(sigla)
      .then(p => { if (vigente) setPlano(p); })
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
        const ancho = (c.parentElement?.clientWidth || 1200) * Math.min(window.devicePixelRatio || 1, 2);
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

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-100">
        <h3 className="flex items-center gap-1.5 font-extrabold text-slate-800"><IconoMapa className="w-4 h-4 text-teal-700" /> Plano general · {nombre}</h3>
        <div className="ml-auto flex items-center gap-2">
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
      {error && <p className="px-4 py-2 bg-rose-50 text-rose-800 border-b border-rose-100">{error}</p>}
      {cargando ? (
        <div className="flex items-center justify-center gap-2 h-40 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando plano general…</div>
      ) : plano ? (
        <div className="bg-slate-50 flex justify-center">
          {plano.esPdf
            ? <canvas ref={lienzo} className="block w-auto h-auto max-w-full max-h-[70vh]" />
            : <img src={plano.url} alt={`Plano general del campus ${nombre}`} className="block w-auto h-auto max-w-full max-h-[70vh]" />}
        </div>
      ) : (
        <button type="button" onClick={() => selector.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-1 h-40 sm:h-52 border-2 border-dashed border-slate-200 m-0 text-slate-500 hover:bg-slate-50 hover:text-teal-800">
          <IconoMapa className="w-7 h-7 text-slate-300" />
          <span className="font-bold">Aún no hay plano general ni ilustración de este campus</span>
          <span>Súbalo en PDF o como imagen (PNG, JPG o WebP)</span>
        </button>
      )}
    </section>
  );
}
