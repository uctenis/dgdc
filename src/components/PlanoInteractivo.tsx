import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2, Upload, FileText, ExternalLink, AlertTriangle } from 'lucide-react';
import type { DocumentoEdificio, Recinto } from '../types/recintos';
import { subirLaminaVisor } from '../services/recintos';

// El visor (con el lector de PDF) se carga solo cuando se abre un plano.
const VisorPlano = lazy(() => import('./VisorPlano').then(m => ({ default: m.VisorPlano })));

interface Props {
  documentos: DocumentoEdificio[];
  recintos: Recinto[];
  destacado?: string | null;
  onEditarRecinto: (r: Recinto) => void;
  onRecargar: () => Promise<void> | void;
}

/** Pestaña «Plano interactivo»: elige la lámina vigente del edificio y la muestra con sus recintos ubicados. */
export function PlanoInteractivo({ documentos, recintos, destacado, onEditarRecinto, onRecargar }: Props) {
  const laminas = documentos.filter(d => d.vigente && d.tipo === 'Plano');
  const [elegida, setElegida] = useState(laminas.find(d => d.archivo_visor)?.id || laminas[0]?.id || '');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const entrada = useRef<HTMLInputElement>(null);
  const lamina = laminas.find(d => d.id === elegida);

  useEffect(() => {
    if (!laminas.some(d => d.id === elegida)) setElegida(laminas.find(d => d.archivo_visor)?.id || laminas[0]?.id || '');
  }, [documentos]); // eslint-disable-line react-hooks/exhaustive-deps

  const subir = async (archivo?: File) => {
    if (!archivo || !lamina) return;
    setSubiendo(true); setError('');
    try {
      await subirLaminaVisor(lamina, archivo);
      await onRecargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  if (!laminas.length) {
    return (
      <p className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">
        Este edificio aún no tiene planos registrados. Regístrelo en «Planos y documentos» (con su enlace de Drive) y luego suba aquí la lámina en PDF.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-bold text-slate-700 flex items-center gap-2">Lámina
          <select value={elegida} onChange={e => setElegida(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded-lg font-normal min-w-[260px]">
            {laminas.map(d => <option key={d.id} value={d.id}>{[d.codigo_lamina, d.titulo, d.especialidad].filter(Boolean).join(' · ')}{d.archivo_visor ? '' : ' (sin copia para el visor)'}</option>)}
          </select>
        </label>
        {lamina?.drive_url && <a href={lamina.drive_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-700 font-bold hover:underline"><ExternalLink className="w-3.5 h-3.5" /> Original en Drive</a>}
        {lamina?.archivo_visor && (
          <button type="button" disabled={subiendo} onClick={() => entrada.current?.click()} className="ml-auto flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-600 hover:bg-slate-50">
            {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Reemplazar PDF
          </button>
        )}
        <input ref={entrada} type="file" accept="application/pdf" className="hidden" onChange={e => void subir(e.target.files?.[0])} />
      </div>

      {error && <p className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800"><AlertTriangle className="w-4 h-4" /> {error}</p>}

      {lamina && !lamina.archivo_visor && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); void subir(e.dataTransfer.files?.[0]); }}
          className="bg-white border-2 border-dashed border-teal-300 rounded-2xl p-8 text-center space-y-3">
          <FileText className="w-10 h-10 mx-auto text-teal-600" />
          <p className="font-bold text-slate-800">Suba la lámina en PDF para verla en el sistema</p>
          <p className="text-slate-500 max-w-lg mx-auto">
            Descárguela de Drive{lamina.drive_url ? ' (enlace «Original en Drive»)' : ''} y arrástrela aquí. Se guarda una copia privada, solo para personal UCT;
            el original sigue en Drive. Use el PDF tal como sale del plotter, a tamaño real, para que el sistema pueda medir superficies.
          </p>
          <button type="button" disabled={subiendo} onClick={() => entrada.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold disabled:opacity-50">
            {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Elegir PDF
          </button>
        </div>
      )}

      {lamina?.archivo_visor && (
        <Suspense fallback={<div className="h-[60vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-teal-700" /></div>}>
          <VisorPlano key={lamina.id + lamina.archivo_visor} documento={lamina} recintos={recintos} destacado={destacado}
            onEditarRecinto={onEditarRecinto} onEscalaGuardada={() => void onRecargar()} />
        </Suspense>
      )}
    </div>
  );
}
