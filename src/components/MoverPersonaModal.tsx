import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, Search, X, UserRoundCog, AlertTriangle } from 'lucide-react';
import { buscarEspacios, moverOcupante, type ResultadoBusqueda } from '../services/recintos';
import type { Ocupante, Recinto } from '../types/recintos';
import { comoTitulo } from '../utils/texto';

interface Props {
  origen: Pick<Recinto, 'id' | 'codigo' | 'nombre'>;
  ocupante: Ocupante;
  onClose: () => void;
  /** Se llama después del cambio, con el código del recinto de destino. */
  onListo: (destino: string) => void;
}

/**
 * Cambio de recinto de una persona en 3 pasos: buscar el destino (código, nombre o una persona que ya esté ahí), elegir
 * si deja el recinto actual o lo conserva (segunda oficina, oficina compartida) y confirmar. Ambos recintos registran el
 * cambio en su historial.
 */
export function MoverPersonaModal({ origen, ocupante, onClose, onListo }: Props) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [destino, setDestino] = useState<ResultadoBusqueda | null>(null);
  const [conservar, setConservar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (texto.trim().length < 2) { setResultados([]); return; }
    let vigente = true;
    setBuscando(true);
    const espera = setTimeout(() => {
      buscarEspacios(texto)
        .then(r => { if (vigente) setResultados(r.filter(x => x.tipo === 'recinto' && x.recintoId !== origen.id).slice(0, 12)); })
        .catch(e => { if (vigente) setError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (vigente) setBuscando(false); });
    }, 250);
    return () => { vigente = false; clearTimeout(espera); };
  }, [texto, origen.id]);

  const confirmar = async () => {
    if (!destino?.recintoId) return;
    setGuardando(true); setError('');
    try {
      await moverOcupante(origen.id, ocupante, destino.recintoId, conservar);
      onListo(destino.codigo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const persona = comoTitulo(ocupante.nombre);
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[90] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200 text-xs">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <UserRoundCog className="w-4 h-4 text-teal-700" />
          <h3 className="font-extrabold text-slate-900 flex-1">Cambiar de recinto a {persona}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase text-slate-400">Desde</p>
              <p className="font-mono font-bold text-slate-900">{origen.codigo}</p>
              <p className="text-slate-500 truncate">{comoTitulo(origen.nombre)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mx-2" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase text-slate-400">Hacia</p>
              {destino ? <>
                <p className="font-mono font-bold text-teal-800">{destino.codigo}</p>
                <p className="text-slate-500 truncate">{comoTitulo(destino.nombre)}</p>
              </> : <p className="text-slate-400">Elija el recinto abajo</p>}
            </div>
          </div>

          <label className="flex items-center gap-1.5 px-2.5 py-2 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-teal-400">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder="Código (CSF16_331), tipo de recinto o una persona que ya esté ahí…" className="flex-1 outline-none" />
            {buscando && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </label>
          {resultados.length > 0 && (
            <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {resultados.map(r => (
                <li key={r.recintoId}>
                  <button type="button" onClick={() => setDestino(r)}
                    className={`w-full text-left px-3 py-1.5 hover:bg-teal-50 ${destino?.recintoId === r.recintoId ? 'bg-teal-50' : ''}`}>
                    <span className="font-mono font-bold text-slate-900">{r.codigo}</span>
                    <span className="text-slate-700"> · {comoTitulo(r.nombre)}</span>
                    <span className="block text-slate-500 truncate">{r.ocupante ? `Ahí está ${r.ocupante}` : r.detalle}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {texto.trim().length >= 2 && !buscando && !resultados.length && <p className="text-slate-500">Sin recintos que coincidan.</p>}

          <fieldset className="space-y-1.5">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" checked={!conservar} onChange={() => setConservar(false)} className="mt-0.5 accent-teal-700" />
              <span><strong>Cambio de recinto:</strong> deja {origen.codigo}.</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" checked={conservar} onChange={() => setConservar(true)} className="mt-0.5 accent-teal-700" />
              <span><strong>Agregar sin quitar:</strong> queda en ambos (segunda oficina o recinto compartido).</span>
            </label>
          </fieldset>

          {error && <p className="flex items-start gap-1.5 text-rose-700"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-white">Cancelar</button>
          <button type="button" disabled={!destino || guardando} onClick={() => void confirmar()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 font-bold text-white disabled:opacity-50">
            {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {conservar ? 'Agregar' : 'Confirmar cambio'}
          </button>
        </div>
      </div>
    </div>
  );
}
