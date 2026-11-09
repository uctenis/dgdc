import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Loader2 } from 'lucide-react';
import { listarPisos, listarRecintos } from '../services/recintos';
import { SUPABASE_CONFIGURADO } from '../lib/supabase';
import type { Piso, Recinto } from '../types/recintos';
import { resumirAlcance, type AlcanceEspacios } from '../utils/alcanceProyecto';
import { comoTitulo } from '../utils/texto';

const m2 = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m²`;

/**
 * Alcance del proyecto en el Gestor de Espacios: los pisos completos o los recintos que interviene, con su superficie
 * oficial. Queda guardado en el proyecto y el presupuesto con IA lo usa para cubicar.
 */
export function AlcanceEspaciosProyecto({ edificio, alcance, onCambiar }: {
  edificio: string; alcance?: AlcanceEspacios; onCambiar: (a: AlcanceEspacios) => void;
}) {
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [recintos, setRecintos] = useState<Recinto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  useEffect(() => {
    if (!edificio || !SUPABASE_CONFIGURADO) return;
    let vigente = true;
    setCargando(true);
    Promise.all([listarPisos(edificio), listarRecintos(edificio)])
      .then(([p, r]) => { if (vigente) { setPisos([...p].sort((a, b) => a.orden - b.orden)); setRecintos(r); } })
      .catch(() => {})
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [edificio]);

  const a: AlcanceEspacios = { pisos: alcance?.pisos || [], recintos: alcance?.recintos || [] };
  const resumen = useMemo(() => resumirAlcance(a, pisos, recintos), [a.pisos.join(), a.recintos.join(), pisos, recintos]); // eslint-disable-line react-hooks/exhaustive-deps
  const activos = (pisoId: string) => recintos.filter(r => r.piso_id === pisoId && r.estado !== 'Eliminado');
  const alternarPiso = (id: string) => onCambiar({
    pisos: a.pisos.includes(id) ? a.pisos.filter(x => x !== id) : [...a.pisos, id],
    // Al tomar el piso completo, los recintos sueltos de ese piso sobran.
    recintos: a.recintos.filter(rid => recintos.find(r => r.id === rid)?.piso_id !== id),
  });
  const alternarRecinto = (id: string) => onCambiar({ ...a, recintos: a.recintos.includes(id) ? a.recintos.filter(x => x !== id) : [...a.recintos, id] });

  if (!edificio) return null;
  if (cargando) return <p className="text-[10px] text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Leyendo pisos y recintos…</p>;
  if (!pisos.length) return <p className="text-[10px] text-slate-400">El edificio aún no tiene pisos ni recintos en el Gestor de Espacios.</p>;
  return (
    <div className="pt-1.5 space-y-1">
      <p className="text-slate-300 text-[10px] font-extrabold uppercase flex items-center gap-1"><Layers className="w-3 h-3" /> Pisos o recintos que interviene</p>
      <ul className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
        {pisos.map(p => {
          const lista = activos(p.id);
          const completo = a.pisos.includes(p.id);
          const sueltos = lista.filter(r => a.recintos.includes(r.id)).length;
          const supPiso = lista.reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0);
          return (
            <li key={p.id}>
              <div className="flex items-center gap-1 text-[11px] text-slate-200">
                <button type="button" onClick={() => setAbierto(x => (x === p.id ? null : p.id))} className="text-slate-400 hover:text-white" title="Elegir recintos de este piso">
                  {abierto === p.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                <label className="flex items-center gap-1.5 flex-1 cursor-pointer">
                  <input type="checkbox" checked={completo} ref={el => { if (el) el.indeterminate = !completo && sueltos > 0; }} onChange={() => alternarPiso(p.id)} className="accent-teal-500" />
                  <span className="flex-1 truncate">{p.nombre || p.codigo}</span>
                  <span className="text-slate-400 tabular-nums">{m2(supPiso)}</span>
                </label>
              </div>
              {abierto === p.id && !completo && (
                <ul className="ml-6 my-0.5 space-y-0.5">
                  {lista.map(r => (
                    <li key={r.id}>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={a.recintos.includes(r.id)} onChange={() => alternarRecinto(r.id)} className="accent-teal-500" />
                        <span className="font-mono">{r.codigo.replace(`${r.edificio_codigo}_`, '')}</span>
                        <span className="flex-1 truncate">{comoTitulo(r.nombre)}</span>
                        <span className="text-slate-400 tabular-nums">{m2(Number(r.superficie_m2) || 0)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {resumen.recintos.length > 0 ? (
        <div className="rounded-lg bg-teal-900/40 border border-teal-700/60 px-2 py-1.5 text-[10px] text-teal-50 space-y-0.5">
          <p><strong className="text-[11px]">{m2(resumen.util)}</strong> útiles · {m2(resumen.oguc)} OGUC · {resumen.recintos.length} recintos</p>
          <p className="text-teal-200">{resumen.porTipo.slice(0, 4).map(t => `${comoTitulo(t.tipo)} ${m2(t.util)}`).join(' · ')}{resumen.porTipo.length > 4 ? '…' : ''}</p>
          <p className="text-teal-300">El presupuesto con IA usa estas superficies.</p>
        </div>
      ) : <p className="text-[10px] text-slate-400">Marque los pisos (o despliegue uno para elegir recintos) y el presupuesto usará su superficie.</p>}
    </div>
  );
}
