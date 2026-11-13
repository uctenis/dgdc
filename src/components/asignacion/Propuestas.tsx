// Propuestas de cambio: se arman movimientos (personas, una unidad completa o dos recintos que se intercambian), se
// revisa cómo queda cada recinto antes y después, y pasan por el control de cambios (0025): Borrador → En revisión →
// Aprobada → Aplicada, con bitácora y exportación a Excel para analizarlas.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, ArrowRight, BadgeCheck, Building, CheckCircle2, ClipboardList, FileDown, FilePlus2, History, Loader2, Play, Send, Trash2, Undo2, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { exportarPropuestaExcel, indicadoresPropuesta } from '../../services/exportarPropuesta';
import {
  agregarMovimientos, aplicarPropuesta, cambiarEstadoPropuesta, crearPropuesta, eliminarPropuesta, listarEventosPropuesta, listarMovimientosDePropuesta,
  quitarMovimiento, resumenDeSimulacion, type EventoPropuesta, type Movimiento, type Propuesta, type ResumenPropuesta,
} from '../../services/asignacion';
import type { Ocupante } from '../../types/recintos';
import { clavePersona } from '../../utils/analisisEspacios';
import { simularMovimientos, type RecintoAsignable } from '../../utils/asignacion';
import { comoTitulo } from '../../utils/texto';
import { formatoFecha } from '../../utils/fechas';
import { BuscadorRecinto, Ocupacion, RecintoElegido, campoClase, m2, nombreEdificio, normalizar, textoPersona, useAsignacion } from './comun';

const COLOR_ESTADO: Record<Propuesta['estado'], string> = {
  Borrador: 'bg-amber-100 text-amber-800', 'En revisión': 'bg-sky-100 text-sky-800', Aprobada: 'bg-violet-100 text-violet-800',
  Aplicada: 'bg-emerald-100 text-emerald-800', Descartada: 'bg-slate-200 text-slate-600',
};

/** Clave de comparación de un antes/después: qué personas hay en cada recinto. */
const huella = (filas: ResumenPropuesta) => JSON.stringify(filas.map(f => [f.codigo, f.antes.map(o => clavePersona(o.nombre)).sort()]).sort());

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
  const { porId, codigos, usuario, recargar, avisar, nombresEdificio } = useAsignacion();
  const { isAdmin } = useAuth();
  const [eventos, setEventos] = useState<EventoPropuesta[]>([]);
  const [exportando, setExportando] = useState(false);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [herramienta, setHerramienta] = useState<Herramienta>('personas');
  const [aplicando, setAplicando] = useState(false);
  const editable = propuesta.estado === 'Borrador';

  const cargar = async () => {
    void listarEventosPropuesta(propuesta.id).then(setEventos);
    try { setMovimientos(await listarMovimientosDePropuesta(propuesta.id)); }
    catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setCargando(false); }
  };
  useEffect(() => { void cargar(); }, [propuesta.id, propuesta.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const simulacion = useMemo(() => simularMovimientos(porId, movimientos), [porId, movimientos]);
  const filasActuales = useMemo(() => resumenDeSimulacion(simulacion), [simulacion]);
  // Si después de aprobarla alguien cambió los recintos, el «antes» ya no es el que se aprobó.
  const cambioDesdeAprobacion = propuesta.estado === 'Aprobada' && !!propuesta.resumen_aprobado && huella(propuesta.resumen_aprobado) !== huella(filasActuales);
  const indicadores = indicadoresPropuesta(propuesta.estado === 'Aplicada' && propuesta.resumen ? propuesta.resumen : filasActuales);
  const agregar = async (nuevos: { persona: Ocupante; desde_id: string | null; hacia_id: string | null; conservar_origen?: boolean; unidad_nueva?: string | null }[]) => {
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
    const aviso = cambioDesdeAprobacion ? '\n\n¡Atención! Los recintos cambiaron después de la aprobación: revise el antes y después.' : '';
    if (!confirm(`¿Aplicar la propuesta aprobada «${propuesta.nombre}»?\n\nSe harán ${movimientos.length} cambio(s) en ${simulacion.length} recinto(s). Quedará en el historial.${aviso}`)) return;
    setAplicando(true);
    try {
      await aplicarPropuesta(propuesta, movimientos, simulacion, usuario);
      await Promise.all([recargar(), onCambio()]);
      avisar('Propuesta aplicada: los recintos ya muestran a sus nuevos ocupantes.');
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setAplicando(false); }
  };
  const cambiarEstado = async (estado: Propuesta['estado'], pedirComentario?: string, obligatorio = false) => {
    let comentario = '';
    if (pedirComentario) {
      const r = prompt(pedirComentario);
      if (r === null) return;
      comentario = r.trim();
      if (obligatorio && !comentario) { avisar('Escriba un comentario para continuar.', 'error'); return; }
    }
    try {
      await cambiarEstadoPropuesta(propuesta.id, estado, comentario, estado === 'Aprobada' ? filasActuales : undefined);
      await onCambio();
      avisar(`Propuesta: ${estado}.`);
    } catch (e) { avisar(e instanceof Error ? e.message.replace(/^.*?: /, '') : String(e), 'error'); }
  };
  const exportar = async () => {
    setExportando(true);
    try {
      await exportarPropuestaExcel({ propuesta, movimientos, eventos, nombresEdificio,
        filas: propuesta.estado === 'Aplicada' && propuesta.resumen ? propuesta.resumen : filasActuales });
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setExportando(false); }
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
        {/* Pasos del control de cambios */}
        <ol className="mt-3 flex flex-wrap items-center gap-1 text-[11px] font-bold">
          {(['Borrador', 'En revisión', 'Aprobada', 'Aplicada'] as const).map((e, i, todos) => {
            const actual = todos.indexOf(propuesta.estado as typeof todos[number]);
            return (
              <li key={e} className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded-full ${e === propuesta.estado ? COLOR_ESTADO[e] + ' ring-1 ring-current' : i < actual ? 'text-slate-500' : 'text-slate-300'}`}>{i + 1}. {e}</span>
                {i < todos.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
              </li>
            );
          })}
        </ol>

        {cambioDesdeAprobacion && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Los recintos de esta propuesta cambiaron después de aprobarla: el «antes» ya no es el aprobado. Revise el antes y después antes de aplicar (o vuelva a borrador para ajustarla).
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {propuesta.estado === 'Borrador' && (<>
            <button type="button" onClick={() => void cambiarEstado('En revisión', 'Comentario para quien revisa (opcional):')} disabled={!movimientos.length}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-sm disabled:opacity-50">
              <Send className="w-4 h-4" /> Enviar a revisión
            </button>
            <button type="button" onClick={() => void cambiarEstado('Descartada', 'Motivo del descarte (opcional):')} className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Descartar</button>
          </>)}
          {propuesta.estado === 'En revisión' && (isAdmin ? (<>
            <button type="button" onClick={() => void cambiarEstado('Aprobada', 'Comentario de la aprobación (opcional):')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm">
              <BadgeCheck className="w-4 h-4" /> Aprobar
            </button>
            <button type="button" onClick={() => void cambiarEstado('Borrador', '¿Qué debe corregirse?', true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Undo2 className="w-4 h-4" /> Devolver con observaciones
            </button>
          </>) : <span className="self-center text-sm text-slate-500">Esperando la aprobación del administrador del sistema.</span>)}
          {propuesta.estado === 'Aprobada' && (<>
            <button type="button" onClick={() => void aplicar()} disabled={!movimientos.length || aplicando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50">
              {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Aplicar en los recintos
            </button>
            <button type="button" onClick={() => void cambiarEstado('Borrador', 'Motivo para volver a borrador:', true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Undo2 className="w-4 h-4" /> Volver a borrador
            </button>
          </>)}
          {propuesta.estado === 'Descartada' && (
            <button type="button" onClick={() => void cambiarEstado('Borrador')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Undo2 className="w-4 h-4" /> Volver a borrador</button>
          )}
          <button type="button" onClick={() => void exportar()} disabled={exportando || !movimientos.length} title="Resumen, cambios, recintos antes y después, efecto por unidad y bitácora"
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 text-sm font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
            {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Exportar a Excel
          </button>
          {editable && <button type="button" onClick={() => void borrar()} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="w-4 h-4" /> Eliminar</button>}
        </div>

        {/* Indicadores de los recintos afectados */}
        {indicadores.recintos > 0 && (
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              ['Recintos afectados', String(indicadores.recintos)],
              ['Personas (antes → después)', `${indicadores.personasAntes} → ${indicadores.personasDespues}`],
              ['m²/persona (antes → después)', `${indicadores.m2PersonaAntes ?? '—'} → ${indicadores.m2PersonaDespues ?? '—'}`],
              ['Quedan vacíos · pasan a ocuparse', `${indicadores.recintosVacios} · ${indicadores.recintosNuevos}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[10px] font-bold uppercase text-slate-400">{k}</dt><dd className="font-black text-slate-800 text-sm">{v}</dd></div>
            ))}
          </dl>
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
                  {m.unidad_nueva && <span className="font-sans text-[10px] px-1.5 rounded-full bg-violet-100 text-violet-800" title={`Antes: ${comoTitulo(m.unidad_anterior || 'sin unidad')}`}>unidad → {comoTitulo(m.unidad_nueva)}</span>}
                </span>
                {editable && <button type="button" onClick={() => void quitar(m.id)} title="Quitar este cambio" className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"><X className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {eventos.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 font-extrabold text-slate-900"><History className="w-5 h-5 text-violet-700" /> Bitácora</h3>
          <ol className="divide-y divide-slate-100 text-sm">
            {eventos.map(e => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
                <span className="text-[11px] text-slate-400 w-36 shrink-0">{new Date(e.en).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="font-bold text-slate-800">{e.estado_anterior ? `${e.estado_anterior} → ` : ''}{e.estado_nuevo}</span>
                <span className="text-xs text-slate-500">{(e.por || '').split('@')[0]}</span>
                {e.comentario && <span className="basis-full sm:basis-auto text-xs text-slate-600 italic">«{e.comentario}»</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

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
                {quedan.filter(o => (f.antes.find(a => clavePersona(a.nombre) === clavePersona(o.nombre))?.unidad || '') !== (o.unidad || '')).map(o => (
                  <li key={'u' + o.nombre} className="text-violet-700">↺ {comoTitulo(o.nombre)}: unidad → {comoTitulo(o.unidad || 'sin unidad')}</li>
                ))}
                {quedan.length > 0 && <li className="text-slate-500">Siguen: {quedan.map(o => comoTitulo(o.nombre).split(',')[0]).join(', ')}</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Agregar = (m: { persona: Ocupante; desde_id: string | null; hacia_id: string | null; conservar_origen?: boolean; unidad_nueva?: string | null }[]) => Promise<void>;

function MoverPersonas({ onAgregar }: { onAgregar: Agregar }) {
  const [origen, setOrigen] = useState<RecintoAsignable | null>(null);
  const [destino, setDestino] = useState<RecintoAsignable | null>(null);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [conservar, setConservar] = useState(false);
  const [unidadNueva, setUnidadNueva] = useState('');
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
        <CampoUnidadNueva valor={unidadNueva} onCambiar={setUnidadNueva} />
        <button type="button" disabled={!listo} onClick={() => { if (!listo) return; void onAgregar(personas.filter((_, i) => elegidas.has(i)).map(p => ({ persona: p, desde_id: origen.id, hacia_id: destino.id, conservar_origen: conservar, unidad_nueva: unidadNueva.trim() || null }))).then(() => { setOrigen(null); setDestino(null); setElegidas(new Set()); setUnidadNueva(''); }); }}
          className="w-full px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm disabled:opacity-40">Agregar {elegidas.size || ''} cambio(s) a la propuesta</button>
      </div>
    </div>
  );
}

function MoverUnidad({ onAgregar }: { onAgregar: Agregar }) {
  const { recintos } = useAsignacion();
  const [unidad, setUnidad] = useState('');
  const [destino, setDestino] = useState<RecintoAsignable | null>(null);
  const [unidadNueva, setUnidadNueva] = useState('');
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
        <CampoUnidadNueva valor={unidadNueva} onCambiar={setUnidadNueva} />
        <button type="button" disabled={!destino || !elegidos.length}
          onClick={() => { if (!destino) return; const u = unidadNueva.trim() || null; void onAgregar(elegidos.filter(m => m.recinto.id !== destino.id || u).map(m => ({ persona: m.persona, desde_id: m.recinto.id, hacia_id: destino.id, unidad_nueva: u }))).then(() => { setDestino(null); setUnidadNueva(''); }); }}
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

/** Unidad nueva opcional al mover personas (reestructuraciones: pasan a otra unidad además de otro recinto). */
function CampoUnidadNueva({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  const { recintos } = useAsignacion();
  const unidades = useMemo(() => {
    const s = new Set<string>();
    for (const r of recintos) for (const o of r.ocupantes || []) if (o.unidad?.trim()) s.add(comoTitulo(o.unidad.trim()));
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  }, [recintos]);
  return (
    <label className="block text-xs font-bold text-slate-700">Nueva unidad <span className="font-normal text-slate-500">(opcional: si además cambian de unidad)</span>
      <input list="unidades-nuevas" value={valor} onChange={e => onCambiar(e.target.value)} placeholder="Dejar vacío si siguen en su unidad" className={`mt-1 ${campoClase} font-normal`} />
      <datalist id="unidades-nuevas">{unidades.map(u => <option key={u} value={u} />)}</datalist>
    </label>
  );
}
