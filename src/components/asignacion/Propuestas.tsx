// Propuestas de cambio: se arman movimientos (personas, una unidad completa o dos recintos que se intercambian), se
// revisa cómo queda cada recinto antes y después, y se aplican todos juntos (o se descartan).
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, Building, CheckCircle2, ClipboardList, FilePlus2, Loader2, Play, Trash2, Undo2, Users, X } from 'lucide-react';
import {
  actualizarPropuesta, agregarMovimientos, aplicarPropuesta, crearPropuesta, eliminarPropuesta, listarMovimientosDePropuesta, quitarMovimiento,
  type Movimiento, type Propuesta, type ResumenPropuesta,
} from '../../services/asignacion';
import type { Ocupante } from '../../types/recintos';
import { clavePersona } from '../../utils/analisisEspacios';
import { simularMovimientos, type RecintoAsignable } from '../../utils/asignacion';
import { comoTitulo } from '../../utils/texto';
import { formatoFecha } from '../../utils/fechas';
import { BuscadorRecinto, Ocupacion, RecintoElegido, campoClase, m2, nombreEdificio, normalizar, textoPersona, useAsignacion } from './comun';

const COLOR_ESTADO: Record<Propuesta['estado'], string> = {
  Borrador: 'bg-amber-100 text-amber-800', Aplicada: 'bg-emerald-100 text-emerald-800', Descartada: 'bg-slate-200 text-slate-600',
};

export function Propuestas({ propuestas, abiertaId, onAbrir, onCambio }: {
  propuestas: Propuesta[]; abiertaId: string | null; onAbrir: (id: string | null) => void; onCambio: () => Promise<void>;
}) {
  const { usuario, avisar } = useAsignacion();
  const [nueva, setNueva] = useState<{ nombre: string; descripcion: string } | null>(null);
  const abierta = propuestas.find(p => p.id === abiertaId) || null;

  const crear = async () => {
    if (!nueva?.nombre.trim()) return;
    try {
      const p = await crearPropuesta(nueva.nombre, nueva.descripcion, usuario);
      setNueva(null); await onCambio(); onAbrir(p.id);
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
  };

  return (
    <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
      <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2">
        <button type="button" onClick={() => setNueva({ nombre: '', descripcion: '' })}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm">
          <FilePlus2 className="w-4 h-4" /> Nueva propuesta
        </button>
        {nueva && (
          <form onSubmit={e => { e.preventDefault(); void crear(); }} className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
            <input autoFocus value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre (ej. Traslado Facultad de Ingeniería a CJP08)" className={campoClase} />
            <textarea rows={2} value={nueva.descripcion} onChange={e => setNueva({ ...nueva, descripcion: e.target.value })} placeholder="Motivo o detalle (opcional)" className={campoClase} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNueva(null)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button type="submit" disabled={!nueva.nombre.trim()} className="px-3 py-1.5 rounded-lg text-sm bg-violet-700 text-white font-bold disabled:opacity-50">Crear</button>
            </div>
          </form>
        )}
        {!propuestas.length && !nueva && <p className="text-sm text-slate-500 p-2">Aún no hay propuestas. Una propuesta reúne varios cambios de recinto para revisarlos (antes y después) y aplicarlos juntos.</p>}
        <ul className="space-y-1">
          {propuestas.map(p => (
            <li key={p.id}>
              <button type="button" onClick={() => onAbrir(p.id)}
                className={`w-full text-left rounded-xl px-3 py-2 border transition ${p.id === abiertaId ? 'border-violet-400 bg-violet-50' : 'border-transparent hover:bg-slate-50'}`}>
                <span className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-800 truncate">{p.nombre}</span>
                  <span className={`ml-auto shrink-0 px-2 rounded-full text-[10px] font-bold ${COLOR_ESTADO[p.estado]}`}>{p.estado}</span>
                </span>
                <span className="block text-[11px] text-slate-500">{formatoFecha(p.aplicado_en || p.creado_en)} · {(p.aplicado_por || p.creado_por || '').split('@')[0]}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {abierta ? <DetallePropuesta key={abierta.id} propuesta={abierta} onCambio={onCambio} onCerrar={() => onAbrir(null)} />
        : <div className="hidden lg:grid place-items-center min-h-[300px] rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-sm">Elija o cree una propuesta.</div>}
    </div>
  );
}

type Herramienta = 'personas' | 'unidad' | 'intercambio';

function DetallePropuesta({ propuesta, onCambio, onCerrar }: { propuesta: Propuesta; onCambio: () => Promise<void>; onCerrar: () => void }) {
  const { porId, codigos, usuario, recargar, avisar } = useAsignacion();
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [herramienta, setHerramienta] = useState<Herramienta>('personas');
  const [aplicando, setAplicando] = useState(false);
  const editable = propuesta.estado === 'Borrador';

  const cargar = async () => {
    try { setMovimientos(await listarMovimientosDePropuesta(propuesta.id)); }
    catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setCargando(false); }
  };
  useEffect(() => { void cargar(); }, [propuesta.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const simulacion = useMemo(() => simularMovimientos(porId, movimientos), [porId, movimientos]);
  const agregar = async (nuevos: { persona: Ocupante; desde_id: string | null; hacia_id: string | null; conservar_origen?: boolean }[]) => {
    try {
      const guardados = await agregarMovimientos(propuesta.id, nuevos, codigos, movimientos.length);
      setMovimientos(m => [...m, ...guardados]);
      avisar(`${guardados.length} cambio(s) agregados a la propuesta.`);
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const quitar = async (id: string) => {
    try { await quitarMovimiento(id); setMovimientos(m => m.filter(x => x.id !== id)); }
    catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const aplicar = async () => {
    if (!movimientos.length) return;
    if (!confirm(`¿Aplicar la propuesta «${propuesta.nombre}»?\n\nSe harán ${movimientos.length} cambio(s) en ${simulacion.length} recinto(s). Quedará en el historial.`)) return;
    setAplicando(true);
    try {
      await aplicarPropuesta(propuesta, movimientos, simulacion, usuario);
      await Promise.all([recargar(), onCambio()]);
      avisar('Propuesta aplicada: los recintos ya muestran a sus nuevos ocupantes.');
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setAplicando(false); }
  };
  const cambiarEstado = async (estado: Propuesta['estado']) => {
    try { await actualizarPropuesta(propuesta.id, { estado }); await onCambio(); }
    catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const borrar = async () => {
    if (!confirm(`¿Eliminar la propuesta «${propuesta.nombre}» y sus ${movimientos.length} cambio(s)? No afecta a los recintos.`)) return;
    try { await eliminarPropuesta(propuesta.id); onCerrar(); await onCambio(); }
    catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
  };

  return (
    <section className="space-y-4 min-w-0">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-900">{propuesta.nombre}</h2>
            {propuesta.descripcion && <p className="text-sm text-slate-600 mt-0.5">{propuesta.descripcion}</p>}
            <p className="text-[11px] text-slate-500 mt-1">
              Creada el {formatoFecha(propuesta.creado_en)} por {propuesta.creado_por || '—'}
              {propuesta.aplicado_en && <> · aplicada el {formatoFecha(propuesta.aplicado_en)} por {propuesta.aplicado_por}</>}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${COLOR_ESTADO[propuesta.estado]}`}>{propuesta.estado}</span>
        </div>
        {editable && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void aplicar()} disabled={!movimientos.length || aplicando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50">
              {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Aplicar propuesta
            </button>
            <button type="button" onClick={() => void cambiarEstado('Descartada')} className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Descartar</button>
            <button type="button" onClick={() => void borrar()} className="ml-auto flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="w-4 h-4" /> Eliminar</button>
          </div>
        )}
        {propuesta.estado === 'Descartada' && (
          <button type="button" onClick={() => void cambiarEstado('Borrador')} className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <Undo2 className="w-4 h-4" /> Volver a borrador</button>
        )}
      </div>

      {editable && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <nav className="flex flex-wrap gap-1 p-2 border-b border-slate-100">
            {([['personas', 'Mover personas', Users], ['unidad', 'Mover una unidad', Building], ['intercambio', 'Intercambiar recintos', ArrowLeftRight]] as const).map(([id, texto, Icono]) => (
              <button key={id} type="button" onClick={() => setHerramienta(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${herramienta === id ? 'bg-violet-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icono className="w-4 h-4" /> {texto}
              </button>
            ))}
            <span className="self-center ml-auto text-[11px] text-slate-500 px-2">Para ubicar a quienes no tienen recinto, use la pestaña «Por ubicar».</span>
          </nav>
          <div className="p-4">
            {herramienta === 'personas' && <MoverPersonas onAgregar={agregar} />}
            {herramienta === 'unidad' && <MoverUnidad onAgregar={agregar} />}
            {herramienta === 'intercambio' && <Intercambiar onAgregar={agregar} />}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 font-extrabold text-slate-900"><ClipboardList className="w-5 h-5 text-violet-700" /> Cambios ({movimientos.length})</h3>
        {cargando ? <p className="p-4 text-slate-400 text-sm">Cargando…</p> : !movimientos.length ? <p className="p-4 text-slate-400 text-sm">Aún no hay cambios. Agréguelos con las herramientas de arriba.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {movimientos.map(m => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-800 truncate">{comoTitulo(m.persona.nombre)}</span>
                  {textoPersona(m.persona) && <span className="block text-[11px] text-slate-500 truncate">{textoPersona(m.persona)}</span>}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-xs shrink-0">
                  <span className={m.desde_codigo ? 'text-slate-700' : 'text-slate-400 font-sans italic'}>{m.desde_codigo || 'sin recinto'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-violet-600" />
                  <span className={m.hacia_codigo ? 'text-violet-800 font-bold' : 'text-slate-400 font-sans italic'}>{m.hacia_codigo || 'sale'}</span>
                  {m.conservar_origen && <span className="font-sans text-[10px] px-1.5 rounded-full bg-sky-100 text-sky-800">conserva su recinto</span>}
                </span>
                {editable && <button type="button" onClick={() => void quitar(m.id)} title="Quitar este cambio" className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"><X className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AntesDespues filas={propuesta.estado === 'Aplicada' && propuesta.resumen ? propuesta.resumen
        : simulacion.map(s => ({ codigo: s.recinto.codigo, nombre: s.recinto.nombre, edificio_codigo: s.recinto.edificio_codigo, superficie_m2: s.recinto.superficie_m2 ?? null, antes: s.antes, despues: s.despues, recinto: s.recinto }))}
        guardado={propuesta.estado === 'Aplicada'} />
    </section>
  );
}

/** Antes y después de cada recinto afectado: personas, m² por persona y quién entra o sale. */
function AntesDespues({ filas, guardado }: { filas: (ResumenPropuesta[number] & { recinto?: RecintoAsignable })[]; guardado: boolean }) {
  const { nombresEdificio } = useAsignacion();
  if (!filas.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="px-4 py-3 border-b border-slate-100 font-extrabold text-slate-900">
        Antes y después <span className="font-normal text-sm text-slate-500">· {filas.length} recinto(s){guardado ? ' · como quedó al aplicarla' : ''}</span>
      </h3>
      <div className="grid md:grid-cols-2 gap-3 p-4">
        {filas.map(f => {
          const r: RecintoAsignable = f.recinto || { id: f.codigo, codigo: f.codigo, nombre: f.nombre, edificio_codigo: f.edificio_codigo, superficie_m2: f.superficie_m2 };
          const antes = new Set(f.antes.map(o => clavePersona(o.nombre)));
          const despues = new Set(f.despues.map(o => clavePersona(o.nombre)));
          const salen = f.antes.filter(o => !despues.has(clavePersona(o.nombre)));
          const entran = f.despues.filter(o => !antes.has(clavePersona(o.nombre)));
          const quedan = f.despues.filter(o => antes.has(clavePersona(o.nombre)));
          return (
            <div key={f.codigo} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-bold text-violet-800">{f.codigo}</span>
                <span className="font-bold text-slate-800 truncate">{comoTitulo(f.nombre)}</span>
                <span className="ml-auto text-[11px] text-slate-500 shrink-0">{m2(f.superficie_m2)}</span>
              </div>
              <p className="text-[11px] text-slate-500">{nombreEdificio(nombresEdificio, f.edificio_codigo)}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5"><p className="text-[10px] font-extrabold uppercase text-slate-400">Antes</p><Ocupacion r={r} personas={f.antes.length} compacto /></div>
                <div className="rounded-lg bg-violet-50 px-2.5 py-1.5"><p className="text-[10px] font-extrabold uppercase text-violet-500">Después</p><Ocupacion r={r} personas={f.despues.length} compacto /></div>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs">
                {entran.map(o => <li key={'e' + o.nombre} className="text-emerald-700"><b>+</b> {comoTitulo(o.nombre)} {o.unidad && <span className="text-slate-400">· {comoTitulo(o.unidad)}</span>}</li>)}
                {salen.map(o => <li key={'s' + o.nombre} className="text-rose-700 line-through decoration-rose-300"><b className="no-underline">−</b> {comoTitulo(o.nombre)}</li>)}
                {quedan.length > 0 && <li className="text-slate-500">Siguen: {quedan.map(o => comoTitulo(o.nombre).split(',')[0]).join(', ')}</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Agregar = (m: { persona: Ocupante; desde_id: string | null; hacia_id: string | null; conservar_origen?: boolean }[]) => Promise<void>;

function MoverPersonas({ onAgregar }: { onAgregar: Agregar }) {
  const [origen, setOrigen] = useState<RecintoAsignable | null>(null);
  const [destino, setDestino] = useState<RecintoAsignable | null>(null);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [conservar, setConservar] = useState(false);
  const personas = origen?.ocupantes || [];
  const listo = origen && destino && elegidas.size > 0;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">1 · Desde</p>
        {origen ? <RecintoElegido r={origen} quitar={conservar ? 0 : elegidas.size} onCambiar={() => { setOrigen(null); setElegidas(new Set()); }} />
          : <BuscadorRecinto onElegir={r => { setOrigen(r); setElegidas(new Set((r.ocupantes || []).map((_, i) => i))); }} placeholder="Recinto de origen…" />}
        {origen && (
          <ul className="space-y-0.5">
            {personas.map((o, i) => (
              <li key={i}><label className="flex items-center gap-2 text-sm px-1 py-0.5 rounded hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="accent-violet-700" checked={elegidas.has(i)} onChange={() => setElegidas(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; })} />
                <span className="truncate">{comoTitulo(o.nombre)} <span className="text-slate-400 text-xs">{textoPersona(o)}</span></span>
              </label></li>
            ))}
            {!personas.length && <li className="text-sm text-slate-400">Este recinto no tiene ocupantes.</li>}
          </ul>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">2 · Hacia</p>
        {destino ? <RecintoElegido r={destino} agregar={elegidas.size} onCambiar={() => setDestino(null)} />
          : <BuscadorRecinto onElegir={setDestino} agregar={elegidas.size} excluir={new Set(origen ? [origen.id] : [])} placeholder="Recinto de destino…" />}
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" className="accent-violet-700" checked={conservar} onChange={e => setConservar(e.target.checked)} /> Conservar también su recinto actual (segunda oficina)</label>
        <button type="button" disabled={!listo} onClick={() => { if (!listo) return; void onAgregar(personas.filter((_, i) => elegidas.has(i)).map(p => ({ persona: p, desde_id: origen.id, hacia_id: destino.id, conservar_origen: conservar }))).then(() => { setOrigen(null); setDestino(null); setElegidas(new Set()); }); }}
          className="w-full px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm disabled:opacity-40">Agregar {elegidas.size || ''} cambio(s) a la propuesta</button>
      </div>
    </div>
  );
}

function MoverUnidad({ onAgregar }: { onAgregar: Agregar }) {
  const { recintos } = useAsignacion();
  const [unidad, setUnidad] = useState('');
  const [destino, setDestino] = useState<RecintoAsignable | null>(null);
  const unidades = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recintos) for (const o of r.ocupantes || []) if (o.unidad?.trim()) m.set(comoTitulo(o.unidad.trim()), (m.get(comoTitulo(o.unidad.trim())) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [recintos]);
  // Personas de la unidad elegida, con su recinto actual.
  const miembros = useMemo(() => {
    const u = normalizar(unidad.trim());
    if (!u) return [];
    return recintos.flatMap(r => (r.ocupantes || []).filter(o => normalizar(o.unidad || '') === u).map(o => ({ persona: o, recinto: r })));
  }, [unidad, recintos]);
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  useEffect(() => setFuera(new Set()), [unidad]);
  const elegidos = miembros.filter(m => !fuera.has(m.recinto.id + m.persona.nombre));
  const porRecinto = useMemo(() => {
    const g = new Map<string, typeof miembros>();
    for (const m of miembros) g.set(m.recinto.codigo, [...(g.get(m.recinto.codigo) || []), m]);
    return [...g.entries()];
  }, [miembros]);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">1 · Unidad</p>
        <input list="unidades-asignacion" value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="Escriba la unidad (facultad, dirección, departamento…)" className={campoClase} />
        <datalist id="unidades-asignacion">{unidades.map(([u, n]) => <option key={u} value={u}>{n} persona(s)</option>)}</datalist>
        {unidad.trim() && !miembros.length && <p className="text-sm text-slate-400">Nadie de esa unidad tiene recinto aún.</p>}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {porRecinto.map(([codigo, ms]) => (
            <div key={codigo} className="rounded-lg border border-slate-200 p-2">
              <p className="text-xs"><span className="font-mono font-bold text-violet-800">{codigo}</span> <span className="text-slate-500">{comoTitulo(ms[0].recinto.nombre)}</span></p>
              {ms.map(m => {
                const k = m.recinto.id + m.persona.nombre;
                return (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="accent-violet-700" checked={!fuera.has(k)} onChange={() => setFuera(prev => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s; })} />
                    <span className="truncate">{comoTitulo(m.persona.nombre)}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">2 · Hacia</p>
        {destino ? <RecintoElegido r={destino} agregar={elegidos.filter(m => m.recinto.id !== destino.id).length} onCambiar={() => setDestino(null)} />
          : <BuscadorRecinto onElegir={setDestino} agregar={elegidos.length} placeholder="Recinto de destino para la unidad…" />}
        <p className="text-[11px] text-slate-500">Si la unidad se reparte en varios recintos, agregue un grupo de personas por vez: desmarque a quienes van a otro recinto.</p>
        <button type="button" disabled={!destino || !elegidos.length}
          onClick={() => { if (!destino) return; void onAgregar(elegidos.filter(m => m.recinto.id !== destino.id).map(m => ({ persona: m.persona, desde_id: m.recinto.id, hacia_id: destino.id }))).then(() => setDestino(null)); }}
          className="w-full px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm disabled:opacity-40">Agregar {elegidos.length || ''} cambio(s) a la propuesta</button>
      </div>
    </div>
  );
}

function Intercambiar({ onAgregar }: { onAgregar: Agregar }) {
  const [a, setA] = useState<RecintoAsignable | null>(null);
  const [b, setB] = useState<RecintoAsignable | null>(null);
  const na = a?.ocupantes?.length || 0;
  const nb = b?.ocupantes?.length || 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Quienes ocupan el recinto A pasan al B, y quienes ocupan el B pasan al A.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Recinto A</p>
          {a ? <RecintoElegido r={a} agregar={nb} quitar={na} onCambiar={() => setA(null)} /> : <BuscadorRecinto onElegir={setA} excluir={new Set(b ? [b.id] : [])} />}</div>
        <div className="space-y-2"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Recinto B</p>
          {b ? <RecintoElegido r={b} agregar={na} quitar={nb} onCambiar={() => setB(null)} /> : <BuscadorRecinto onElegir={setB} excluir={new Set(a ? [a.id] : [])} />}</div>
      </div>
      <button type="button" disabled={!a || !b || (!na && !nb)}
        onClick={() => { if (!a || !b) return; void onAgregar([
          ...(a.ocupantes || []).map(p => ({ persona: p, desde_id: a.id, hacia_id: b.id })),
          ...(b.ocupantes || []).map(p => ({ persona: p, desde_id: b.id, hacia_id: a.id })),
        ]).then(() => { setA(null); setB(null); }); }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm disabled:opacity-40">
        <CheckCircle2 className="w-4 h-4" /> Agregar intercambio ({na + nb} cambio(s))
      </button>
    </div>
  );
}
