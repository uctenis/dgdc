import { useMemo, useRef, useState } from 'react';
import { filtrarOpciones, unidadesDe } from '../utils/sugerencias';

export interface OpcionAutocompletar { texto: string; usos?: number; detalle?: string }

/**
 * Campo de texto con sugerencias de lo que ya existe en la base (sin tildes, palabras en cualquier orden). Con
 * `varias`, el valor es una lista «A / B» y se autocompleta la última parte (unidades compartidas).
 */
export function CampoAutocompletar({ valor, opciones, onCambiar, onElegir, placeholder, className, varias = false }: {
  valor: string; opciones: OpcionAutocompletar[]; onCambiar: (v: string) => void; onElegir?: (o: OpcionAutocompletar) => void;
  placeholder?: string; className?: string; varias?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [marcada, setMarcada] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const partes = varias ? valor.split('/') : [valor];
  const escrito = partes[partes.length - 1].trim();
  const yaElegidas = varias ? unidadesDe(partes.slice(0, -1).join('/')) : [];
  const lista = useMemo(() => filtrarOpciones(opciones.filter(o => !yaElegidas.includes(o.texto)), escrito), [opciones, escrito, yaElegidas.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const elegir = (o: OpcionAutocompletar) => {
    onCambiar(varias ? [...yaElegidas, o.texto].join(' / ') : o.texto);
    onElegir?.(o);
    setAbierto(false);
  };
  return (
    <div ref={caja} className="relative" onBlur={e => { if (!caja.current?.contains(e.relatedTarget as Node)) setAbierto(false); }}>
      <input value={valor} placeholder={placeholder} className={className}
        onChange={e => { onCambiar(e.target.value); setAbierto(true); setMarcada(0); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={e => {
          if (!abierto || !lista.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setMarcada(m => Math.min(m + 1, lista.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setMarcada(m => Math.max(m - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); elegir(lista[marcada]); }
          if (e.key === 'Escape') setAbierto(false);
        }} />
      {abierto && lista.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto py-1 font-normal">
          {lista.map((o, i) => (
            <li key={o.texto}>
              <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); elegir(o); }}
                className={`w-full text-left px-3 py-1.5 ${i === marcada ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                <span className="text-slate-800">{o.texto}</span>
                {(o.detalle || o.usos) && <span className="block text-[10px] text-slate-500">{[o.detalle, o.usos ? `${o.usos} recinto(s)` : ''].filter(Boolean).join(' · ')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
