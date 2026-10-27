import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Building2, DoorOpen, X } from 'lucide-react';
import { getCampusList, etiquetaEdificio } from '../data/campusData';
import { buscarEspacios, type ResultadoBusqueda } from '../services/recintos';

/**
 * Buscador universal del Gestor de Espacios: encuentra edificios y recintos de todos los campus por código, nombre,
 * uso, unidad o dirección. Al elegir un resultado se abre su edificio (y se marca el recinto).
 */
export function BuscadorEspacios({ onElegir }: { onElegir: (edificio: string, recintoId?: string) => void }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) { setResultados([]); return; }
    let vigente = true;
    setBuscando(true);
    // Espera a que se deje de escribir para no consultar la base en cada tecla.
    const espera = setTimeout(async () => {
      try {
        const remotos = await buscarEspacios(t);
        // Edificios de la configuración cuyo nombre coincide aunque aún no tengan ficha en la base.
        const n = t.toLowerCase();
        const yaEstan = new Set(remotos.filter(r => r.tipo === 'edificio').map(r => r.codigo));
        const locales: ResultadoBusqueda[] = getCampusList().flatMap(c => c.edificios)
          .filter(e => !yaEstan.has(e) && etiquetaEdificio(e).toLowerCase().includes(n))
          .slice(0, 8)
          .map(e => ({ tipo: 'edificio', edificio_codigo: e, codigo: e, nombre: etiquetaEdificio(e).replace(/^\S+\s*·\s*/, ''), detalle: 'configuración' }));
        if (vigente) { setResultados([...remotos.filter(r => r.tipo === 'edificio'), ...locales, ...remotos.filter(r => r.tipo === 'recinto')]); setError(''); }
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (vigente) setBuscando(false);
      }
    }, 300);
    return () => { vigente = false; clearTimeout(espera); };
  }, [texto]);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  const elegir = (r: ResultadoBusqueda) => { setAbierto(false); onElegir(r.edificio_codigo, r.recintoId); };

  return (
    <div ref={caja} className="relative w-full">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-teal-400">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          value={texto}
          onChange={e => { setTexto(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={e => { if (e.key === 'Enter' && resultados[0]) elegir(resultados[0]); if (e.key === 'Escape') setAbierto(false); }}
          placeholder="Buscar en todos los campus: código (CSF12, CJP01_201), nombre, uso, unidad o dirección…"
          className="flex-1 min-w-0 outline-none text-sm bg-transparent"
        />
        {buscando && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        {texto && <button type="button" title="Limpiar" onClick={() => { setTexto(''); setResultados([]); }} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>}
      </div>
      {abierto && texto.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 max-h-[60vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl z-40">
          {error && <p className="p-3 text-rose-700">{error}</p>}
          {!buscando && !error && !resultados.length && <p className="p-3 text-slate-500">Sin resultados para «{texto.trim()}».</p>}
          {resultados.map(r => (
            <button key={`${r.tipo}-${r.recintoId || r.codigo}`} type="button" onClick={() => elegir(r)}
              className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-teal-50 border-b border-slate-50 last:border-0">
              {r.tipo === 'edificio'
                ? <Building2 className="w-4 h-4 mt-0.5 text-teal-700 shrink-0" />
                : <DoorOpen className="w-4 h-4 mt-0.5 text-indigo-600 shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className="block"><span className="font-mono font-bold text-slate-900">{r.codigo}</span> <span className="text-slate-700">{r.nombre}</span></span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {r.tipo === 'recinto' ? `${r.edificio_codigo}${r.detalle ? ' · ' + r.detalle : ''}` : r.detalle || 'Edificio'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
