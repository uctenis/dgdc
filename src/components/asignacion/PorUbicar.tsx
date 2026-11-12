// Funcionarios vigentes (nómina de Personas) que aún no tienen recinto: se eligen y se ubican en uno, de inmediato o
// como parte de una propuesta.
import { useMemo, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronRight, Loader2, MapPinned, Square, UserPlus, X } from 'lucide-react';
import type { Funcionario } from '../../services/nomina';
import { agregarMovimientos, moverAhora, type Propuesta } from '../../services/asignacion';
import type { Ocupante } from '../../types/recintos';
import { clavePersona } from '../../utils/analisisEspacios';
import { personasConRecinto, type RecintoAsignable } from '../../utils/asignacion';
import { comoTitulo } from '../../utils/texto';
import { BuscadorRecinto, RecintoElegido, campoClase, normalizar, useAsignacion } from './comun';

const SIN_UNIDAD = 'Sin unidad en la nómina';
export const comoOcupante = (f: Funcionario): Ocupante => ({ nombre: comoTitulo(f.nombre), cargo: null, unidad: f.unidad ? comoTitulo(f.unidad) : null });

export function PorUbicar({ nomina, propuestas, onIrAPropuesta }: {
  nomina: Map<string, Funcionario>; propuestas: Propuesta[]; onIrAPropuesta: (id: string) => void;
}) {
  const { recintos, codigos, usuario, recargar, avisar } = useAsignacion();
  const [busqueda, setBusqueda] = useState('');
  const [campus, setCampus] = useState('');
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<RecintoAsignable | null>(null);
  const [propuestaId, setPropuestaId] = useState('');
  const [guardando, setGuardando] = useState(false);

  const conRecinto = useMemo(() => personasConRecinto(recintos), [recintos]);
  const pendientes = useMemo(() => [...nomina.values()].filter(f => !conRecinto.has(clavePersona(f.nombre))), [nomina, conRecinto]);
  const campusNomina = useMemo(() => [...new Set(pendientes.map(f => f.campus || '').filter(Boolean))].sort(), [pendientes]);
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda).split(/\s+/).filter(Boolean);
    return pendientes.filter(f => (!campus || f.campus === campus)
      && q.every(p => normalizar([f.nombre, f.unidad, f.edificio, f.tipo_contrato].join(' ')).includes(p)));
  }, [pendientes, busqueda, campus]);
  const grupos = useMemo(() => {
    const m = new Map<string, Funcionario[]>();
    for (const f of filtrados) {
      const u = f.unidad ? comoTitulo(f.unidad) : SIN_UNIDAD;
      m.set(u, [...(m.get(u) || []), f]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'));
  }, [filtrados]);
  const seleccion = pendientes.filter(f => elegidos.has(f.clave));

  // Sugerencias: recintos donde ya trabaja gente de la misma unidad, y recintos del edificio que indica la nómina.
  const sugeridos = useMemo(() => {
    if (!seleccion.length) return [];
    const unidades = new Set(seleccion.map(f => normalizar(f.unidad || '')).filter(Boolean));
    const edificios = new Set(seleccion.map(f => f.edificio_codigo).filter(Boolean));
    const puntaje = new Map<string, { r: RecintoAsignable; p: number; motivo: string }>();
    for (const r of recintos) {
      const colegas = (r.ocupantes || []).filter(o => unidades.has(normalizar(o.unidad || ''))).length
        + (unidades.has(normalizar(r.unidad_usuaria || '')) ? 1 : 0);
      const mismoEdificio = edificios.has(r.edificio_codigo) && /oficina|box|estaci|despacho/i.test(r.nombre);
      if (!colegas && !mismoEdificio) continue;
      puntaje.set(r.id, { r, p: colegas * 3 + (mismoEdificio ? 2 : 0), motivo: colegas ? `${colegas} de su unidad` : 'Edificio según la nómina' });
    }
    return [...puntaje.values()].sort((a, b) => b.p - a.p).slice(0, 12).map(x => ({ recinto: x.r, motivo: x.motivo }));
  }, [seleccion, recintos]);

  const alternar = (clave: string) => setElegidos(prev => { const s = new Set(prev); if (s.has(clave)) s.delete(clave); else s.add(clave); return s; });
  const alternarGrupo = (fs: Funcionario[]) => setElegidos(prev => {
    const s = new Set(prev);
    const todos = fs.every(f => s.has(f.clave));
    for (const f of fs) if (todos) s.delete(f.clave); else s.add(f.clave);
    return s;
  });
  const borradores = propuestas.filter(p => p.estado === 'Borrador');

  const ubicar = async () => {
    if (!destino || !seleccion.length) return;
    const movimientos = seleccion.map(f => ({ persona: comoOcupante(f), desde_id: null, hacia_id: destino.id }));
    setGuardando(true);
    try {
      if (propuestaId) {
        await agregarMovimientos(propuestaId, movimientos, codigos, Date.now() % 1e9);
        avisar(`${seleccion.length} persona(s) agregadas a la propuesta.`);
        onIrAPropuesta(propuestaId);
      } else {
        if (!confirm(`¿Ubicar ahora a ${seleccion.length} persona(s) en ${destino.codigo} (${comoTitulo(destino.nombre)})?`)) return;
        await moverAhora(movimientos, codigos, usuario);
        avisar(`${seleccion.length} persona(s) ubicadas en ${destino.codigo}.`);
        await recargar();
      }
      setElegidos(new Set()); setDestino(null);
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setGuardando(false); }
  };

  if (!nomina.size) return <p className="text-sm text-slate-500 bg-white rounded-2xl border border-slate-200 p-6">No hay nómina de funcionarios cargada (migración 0020 y carga de la planilla DDPER).</p>;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-wrap gap-2 items-center">
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar persona, unidad o edificio…" className={`${campoClase} flex-1 min-w-[200px]`} />
          <select value={campus} onChange={e => setCampus(e.target.value)} className={`${campoClase} w-auto`}>
            <option value="">Todos los campus (según nómina)</option>
            {campusNomina.map(c => <option key={c} value={c}>{comoTitulo(c)}</option>)}
          </select>
          <span className="text-xs text-slate-500"><b className="text-slate-800">{filtrados.length}</b> de {pendientes.length} por ubicar</span>
        </div>
        {!grupos.length && <p className="p-6 text-center text-slate-400">{pendientes.length ? 'Nadie coincide con la búsqueda.' : '¡Todos los funcionarios vigentes tienen recinto!'}</p>}
        <ul className="divide-y divide-slate-100">
          {grupos.map(([unidad, fs]) => {
            const abierta = abiertas.has(unidad) || !!busqueda.trim();
            const todos = fs.every(f => elegidos.has(f.clave));
            return (
              <li key={unidad}>
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 hover:bg-slate-50">
                  <button type="button" onClick={() => alternarGrupo(fs)} title={todos ? 'Quitar a todos' : 'Elegir a todos'} className="text-violet-700">
                    {todos ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={() => setAbiertas(prev => { const s = new Set(prev); if (s.has(unidad)) s.delete(unidad); else s.add(unidad); return s; })}
                    className="flex-1 flex items-center gap-2 text-left min-w-0">
                    {abierta ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span className="font-bold text-slate-800 text-sm truncate">{unidad}</span>
                    <span className="ml-auto shrink-0 px-2 rounded-full bg-violet-100 text-violet-800 text-xs font-bold">{fs.length}</span>
                  </button>
                </div>
                {abierta && (
                  <ul className="pb-2">
                    {fs.map(f => (
                      <li key={f.clave}>
                        <label className={`flex items-center gap-3 pl-10 pr-4 py-1.5 cursor-pointer text-sm ${elegidos.has(f.clave) ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={elegidos.has(f.clave)} onChange={() => alternar(f.clave)} className="accent-violet-700" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-slate-800 truncate">{comoTitulo(f.nombre)}</span>
                            <span className="block text-[11px] text-slate-500 truncate">
                              {[f.tipo_contrato && comoTitulo(f.tipo_contrato), f.edificio && `Nómina: ${comoTitulo(f.edificio)}`, f.telefono && `Fono ${f.telefono}`].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="lg:sticky lg:top-24 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <h3 className="flex items-center gap-2 font-extrabold text-slate-900"><MapPinned className="w-5 h-5 text-violet-700" /> Ubicar en un recinto</h3>
        {!seleccion.length ? (
          <p className="text-sm text-slate-500">Marque una o varias personas de la lista (o una unidad completa) y elija aquí su recinto.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {seleccion.slice(0, 12).map(f => (
                <span key={f.clave} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-violet-100 text-violet-900 text-xs font-semibold">
                  {comoTitulo(f.nombre).split(',')[0]}
                  <button type="button" onClick={() => alternar(f.clave)} className="p-0.5 rounded-full hover:bg-violet-200"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {seleccion.length > 12 && <span className="text-xs text-slate-500 self-center">y {seleccion.length - 12} más</span>}
            </div>
            {destino ? <RecintoElegido r={destino} agregar={seleccion.length} onCambiar={() => setDestino(null)} />
              : <BuscadorRecinto onElegir={setDestino} agregar={seleccion.length} sugeridos={sugeridos} />}
            {destino && (
              <>
                <label className="block text-xs font-bold text-slate-700">Cómo
                  <select value={propuestaId} onChange={e => setPropuestaId(e.target.value)} className={`mt-1 ${campoClase} font-normal`}>
                    <option value="">Ubicar ahora (queda en el historial)</option>
                    {borradores.map(p => <option key={p.id} value={p.id}>Agregar a la propuesta «{p.nombre}»</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => void ubicar()} disabled={guardando}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold disabled:opacity-50">
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {propuestaId ? 'Agregar a la propuesta' : `Ubicar ${seleccion.length === 1 ? 'a la persona' : `a las ${seleccion.length} personas`}`}
                </button>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
