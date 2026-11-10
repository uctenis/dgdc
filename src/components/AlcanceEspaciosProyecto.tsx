import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Loader2, Plus } from 'lucide-react';
import { listarPisos, listarRecintos } from '../services/recintos';
import { SUPABASE_CONFIGURADO } from '../lib/supabase';
import type { Piso, Recinto } from '../types/recintos';
import { resumirAlcance, type AlcanceEspacios } from '../utils/alcanceProyecto';
import { comoTitulo } from '../utils/texto';

const m2 = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m²`;

// Colores para la ficha (fondo oscuro) y para el formulario de proyecto nuevo (fondo claro).
const TEMAS = {
  oscuro: { titulo: 'text-slate-300', texto: 'text-slate-200', suave: 'text-slate-400', enlace: 'text-sky-300 hover:text-sky-200', caja: 'bg-teal-900/40 border-teal-700/60 text-teal-50', cajaSuave: 'text-teal-200', cajaNota: 'text-teal-300' },
  claro: { titulo: 'text-slate-700', texto: 'text-slate-800', suave: 'text-slate-500', enlace: 'text-teal-700 hover:text-teal-900', caja: 'bg-teal-50 border-teal-200 text-teal-900', cajaSuave: 'text-teal-800', cajaNota: 'text-teal-700' },
};

/**
 * Pisos o recintos que interviene el proyecto, con su superficie oficial del Gestor de Espacios (el presupuesto con
 * IA la usa para cubicar). Es opcional —los proyectos son muy variados—, así que parte plegado: si ya hay pisos o
 * recintos elegidos se ve el resumen, y si no, solo un enlace para indicarlos.
 */
export function AlcanceEspaciosProyecto({ edificio, alcance, onCambiar, tema = 'oscuro' }: {
  edificio: string; alcance?: AlcanceEspacios; onCambiar: (a: AlcanceEspacios) => void; tema?: keyof typeof TEMAS;
}) {
  const c = TEMAS[tema];
  const a: AlcanceEspacios = { pisos: alcance?.pisos || [], recintos: alcance?.recintos || [] };
  const hayEleccion = a.pisos.length + a.recintos.length > 0;
  const [desplegado, setDesplegado] = useState(false);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [recintos, setRecintos] = useState<Recinto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const necesitaDatos = desplegado || hayEleccion;

  useEffect(() => { setDesplegado(false); }, [edificio]);
  useEffect(() => {
    if (!edificio || !SUPABASE_CONFIGURADO || !necesitaDatos) return;
    let vigente = true;
    setCargando(true);
    Promise.all([listarPisos(edificio), listarRecintos(edificio)])
      .then(([p, r]) => { if (vigente) { setPisos([...p].sort((x, y) => x.orden - y.orden)); setRecintos(r); } })
      .catch(() => {})
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [edificio, necesitaDatos]);

  const resumen = useMemo(() => resumirAlcance(a, pisos, recintos), [a.pisos.join(), a.recintos.join(), pisos, recintos]); // eslint-disable-line react-hooks/exhaustive-deps
  const activos = (pisoId: string) => recintos.filter(r => r.piso_id === pisoId && r.estado !== 'Eliminado');
  const alternarPiso = (id: string) => onCambiar({
    pisos: a.pisos.includes(id) ? a.pisos.filter(x => x !== id) : [...a.pisos, id],
    // Al tomar el piso completo, los recintos sueltos de ese piso sobran.
    recintos: a.recintos.filter(rid => recintos.find(r => r.id === rid)?.piso_id !== id),
  });
  const alternarRecinto = (id: string) => onCambiar({ ...a, recintos: a.recintos.includes(id) ? a.recintos.filter(x => x !== id) : [...a.recintos, id] });

  if (!edificio || !SUPABASE_CONFIGURADO) return null;

  // Plegado y sin nada elegido: solo el enlace.
  if (!desplegado && !hayEleccion) {
    return (
      <button type="button" onClick={() => setDesplegado(true)} className={`pt-1 flex items-center gap-1 text-[10px] font-semibold ${c.enlace}`}>
        <Plus className="w-3 h-3" /> Indicar pisos o recintos que interviene (opcional)
      </button>
    );
  }

  const cajaResumen = resumen.recintos.length > 0 && (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] space-y-0.5 ${c.caja}`}>
      <p><strong className="text-[11px]">{m2(resumen.util)}</strong> útiles · {m2(resumen.oguc)} OGUC · {resumen.recintos.length} recintos</p>
      <p className={c.cajaSuave}>{resumen.porTipo.slice(0, 4).map(t => `${comoTitulo(t.tipo)} ${m2(t.util)}`).join(' · ')}{resumen.porTipo.length > 4 ? '…' : ''}</p>
      <p className={c.cajaNota}>El presupuesto con IA usa estas superficies.</p>
    </div>
  );

  return (
    <div className="pt-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <p className={`text-[10px] font-extrabold uppercase flex items-center gap-1 ${c.titulo}`}><Layers className="w-3 h-3" /> Pisos o recintos que interviene</p>
        <button type="button" onClick={() => setDesplegado(v => !v)} className={`ml-auto text-[10px] font-semibold ${c.enlace}`}>
          {desplegado ? 'Listo' : 'Editar'}
        </button>
      </div>
      {cargando ? (
        <p className={`text-[10px] flex items-center gap-1 ${c.suave}`}><Loader2 className="w-3 h-3 animate-spin" /> Leyendo pisos y recintos…</p>
      ) : !pisos.length ? (
        <p className={`text-[10px] ${c.suave}`}>El edificio aún no tiene pisos ni recintos en el Gestor de Espacios.</p>
      ) : desplegado ? (
        <>
          <ul className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
            {pisos.map(p => {
              const lista = activos(p.id);
              const completo = a.pisos.includes(p.id);
              const sueltos = lista.filter(r => a.recintos.includes(r.id)).length;
              const supPiso = lista.reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0);
              return (
                <li key={p.id}>
                  <div className={`flex items-center gap-1 text-[11px] ${c.texto}`}>
                    <button type="button" onClick={() => setAbierto(x => (x === p.id ? null : p.id))} className={c.suave} title="Elegir recintos de este piso">
                      {abierto === p.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    <label className="flex items-center gap-1.5 flex-1 cursor-pointer">
                      <input type="checkbox" checked={completo} ref={el => { if (el) el.indeterminate = !completo && sueltos > 0; }} onChange={() => alternarPiso(p.id)} className="accent-teal-500" />
                      <span className="flex-1 truncate">{p.nombre || p.codigo}</span>
                      <span className={`tabular-nums ${c.suave}`}>{m2(supPiso)}</span>
                    </label>
                  </div>
                  {abierto === p.id && !completo && (
                    <ul className="ml-6 my-0.5 space-y-0.5">
                      {lista.map(r => (
                        <li key={r.id}>
                          <label className={`flex items-center gap-1.5 text-[10px] cursor-pointer ${c.texto}`}>
                            <input type="checkbox" checked={a.recintos.includes(r.id)} onChange={() => alternarRecinto(r.id)} className="accent-teal-500" />
                            <span className="font-mono">{r.codigo.replace(`${r.edificio_codigo}_`, '')}</span>
                            <span className="flex-1 truncate">{comoTitulo(r.nombre)}</span>
                            <span className={`tabular-nums ${c.suave}`}>{m2(Number(r.superficie_m2) || 0)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {cajaResumen || <p className={`text-[10px] ${c.suave}`}>Marque los pisos (o despliegue uno para elegir recintos) y el presupuesto usará su superficie.</p>}
        </>
      ) : cajaResumen}
    </div>
  );
}
