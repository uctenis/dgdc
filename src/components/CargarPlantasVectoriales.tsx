import { useRef, useState } from 'react';
import { CheckCircle2, Layers, Loader2, X, AlertTriangle } from 'lucide-react';
import { cargarPlantasVectoriales } from '../services/recintos';

/**
 * Carga por lote de plantas vectoriales (archivos .json de planta_vectorial.py). Cada archivo sabe de qué edificio y
 * lámina es, así que se pueden elegir todos a la vez, aunque sean de varios campus.
 */
export function CargarPlantasVectoriales() {
  const entrada = useRef<HTMLInputElement>(null);
  const [avance, setAvance] = useState<string | null>(null);
  const [resultados, setResultados] = useState<{ archivo: string; ok: boolean; detalle: string }[] | null>(null);
  const [error, setError] = useState('');

  const cargar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setError('');
    setResultados(null);
    setAvance('Leyendo…');
    try {
      setResultados(await cargarPlantasVectoriales([...lista], (h, t) => setAvance(`Cargando ${h} de ${t}…`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAvance(null);
      if (entrada.current) entrada.current.value = '';
    }
  };
  const fallidos = resultados?.filter(r => !r.ok) || [];

  return (
    <>
      <button type="button" disabled={!!avance} onClick={() => entrada.current?.click()}
        title="Elija los archivos …_vectorial.json (de dgdc-datos/planos_cad/planta_vectorial); cada uno se guarda en su lámina"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {avance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
        {avance || 'Cargar plantas vectoriales'}
      </button>
      <input ref={entrada} type="file" multiple accept=".json,application/json" className="hidden" onChange={e => void cargar(e.target.files)} />
      {(resultados || error) && (
        <div className="w-full bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            {error ? <AlertTriangle className="w-4 h-4 text-rose-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            <span className="font-bold text-slate-800">
              {error || `${resultados!.length - fallidos.length} planta(s) cargadas${fallidos.length ? ` · ${fallidos.length} sin cargar` : ''}`}
            </span>
            <button type="button" onClick={() => { setResultados(null); setError(''); }} className="ml-auto text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          {fallidos.length > 0 && (
            <ul className="max-h-48 overflow-y-auto text-[11px] text-rose-800 space-y-0.5">
              {fallidos.map(r => <li key={r.archivo}><span className="font-mono">{r.archivo}</span>: {r.detalle}</li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
