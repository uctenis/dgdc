import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X, ChevronRight } from 'lucide-react';
import { listarRecintosDeCampus } from '../services/recintos';
import { alertasRecinto } from '../utils/alertasRecinto';
import type { Recinto } from '../types/recintos';

interface Props {
  /** Sigla del campus («CSF»); vacío revisa todos los campus. */
  prefijo: string;
  titulo: string;
  nombres: Record<string, string>;
  onAbrir: (edificio: string, recintoId: string) => void;
  onClose: () => void;
}

/**
 * Recintos con algo por revisar (superficies faltantes o imposibles, sin tipo, notas «Por revisar»), agrupados por
 * edificio. Las alertas se calculan con los datos actuales: al corregir el recinto, sale de la lista.
 */
export function RevisionCampus({ prefijo, titulo, nombres, onAbrir, onClose }: Props) {
  const [recintos, setRecintos] = useState<Recinto[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listarRecintosDeCampus(prefijo).then(setRecintos).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [prefijo]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { recinto: Recinto; alertas: string[] }[]>();
    for (const r of recintos || []) {
      const alertas = alertasRecinto(r);
      if (alertas.length) mapa.set(r.edificio_codigo, [...(mapa.get(r.edificio_codigo) || []), { recinto: r, alertas }]);
    }
    return [...mapa].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
  }, [recintos]);
  const total = grupos.reduce((s, [, l]) => s + l.length, 0);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200 text-xs">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Por revisar · {titulo}</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-slate-700">
          {error && <p className="text-rose-700">{error}</p>}
          {!recintos && !error && <p className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Revisando los recintos…</p>}
          {recintos && (
            <p className="text-slate-600">
              {total ? <><strong>{total}</strong> de {recintos.filter(r => r.estado !== 'Eliminado').length} recintos tienen algo por revisar, en {grupos.length} edificio(s). Haga clic en uno para abrir su ficha y corregirlo; al guardarlo, sale de esta lista.</>
                : 'No hay recintos por revisar. 🎉'}
            </p>
          )}
          {grupos.map(([edificio, lista]) => (
            <section key={edificio}>
              <h4 className="font-bold text-slate-800 mb-1">{edificio}{nombres[edificio] ? ` · ${nombres[edificio]}` : ''} <span className="font-normal text-slate-400">({lista.length})</span></h4>
              <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {lista.map(({ recinto: r, alertas }) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => onAbrir(edificio, r.id)} className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-amber-50">
                      <span className="font-mono font-bold text-slate-900 w-32 shrink-0">{r.codigo}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-slate-700">{r.nombre}</span>
                        {alertas.map((a, i) => <span key={i} className="block text-amber-800">• {a}</span>)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
