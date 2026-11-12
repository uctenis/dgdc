// Personas: buscar a cualquier funcionario u ocupante, ver su unidad y sus recintos, y cambiarle la unidad o el
// recinto (de inmediato o como parte de una propuesta). Todo queda en el historial.
import { useMemo, useState } from 'react';
import { ArrowRightLeft, Building, ExternalLink, Loader2, Search, UserRound } from 'lucide-react';
import type { Funcionario } from '../../services/nomina';
import { agregarMovimientos, moverAhora, type Propuesta } from '../../services/asignacion';
import type { Ocupante } from '../../types/recintos';
import { clavePersona } from '../../utils/analisisEspacios';
import type { RecintoAsignable } from '../../utils/asignacion';
import { comoTitulo } from '../../utils/texto';
import { BuscadorRecinto, RecintoElegido, campoClase, enlaceRecinto, nombreEdificio, normalizar, useAsignacion } from './comun';

interface FichaPersona {
  clave: string;
  nombre: string;
  ocupaciones: { recinto: RecintoAsignable; ocupante: Ocupante }[];
  funcionario?: Funcionario;
}

export function Personas({ nomina, propuestas, onIrAPropuesta }: {
  nomina: Map<string, Funcionario>; propuestas: Propuesta[]; onIrAPropuesta: (id: string) => void;
}) {
  const { recintos, codigos, nombresEdificio, usuario, recargar, avisar } = useAsignacion();
  const [busqueda, setBusqueda] = useState('');
  const [elegida, setElegida] = useState<string | null>(null);

  // Todas las personas: las que ocupan recintos y las de la nómina (aunque no tengan recinto).
  const personas = useMemo(() => {
    const m = new Map<string, FichaPersona>();
    for (const r of recintos) for (const o of r.ocupantes || []) {
      if (!o.nombre?.trim() || !/,/.test(o.nombre)) continue;
      const k = clavePersona(o.nombre);
      const p = m.get(k) || { clave: k, nombre: comoTitulo(o.nombre), ocupaciones: [] };
      p.ocupaciones.push({ recinto: r, ocupante: o });
      m.set(k, p);
    }
    for (const f of nomina.values()) {
      const k = clavePersona(f.nombre);
      const p = m.get(k) || { clave: k, nombre: comoTitulo(f.nombre), ocupaciones: [] };
      p.funcionario = f;
      m.set(k, p);
    }
    return m;
  }, [recintos, nomina]);
  const resultados = useMemo(() => {
    const q = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (!q.length) return [];
    return [...personas.values()].filter(p => q.every(w => normalizar([p.nombre, ...p.ocupaciones.map(o => o.ocupante.unidad || ''), p.funcionario?.unidad || ''].join(' ')).includes(w)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).slice(0, 60);
  }, [busqueda, personas]);
  const persona = elegida ? personas.get(elegida) : undefined;

  return (
    <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-4 items-start">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar persona (nombre o unidad)…" className={`${campoClase} pl-9`} />
        </div>
        {!busqueda.trim() && <p className="text-sm text-slate-500 px-1">Escriba un nombre para ver su unidad y sus recintos, y cambiarle la unidad o el recinto.</p>}
        {busqueda.trim() && !resultados.length && <p className="text-sm text-slate-400 px-1">Nadie coincide.</p>}
        <ul className="max-h-[65vh] overflow-y-auto space-y-1">
          {resultados.map(p => (
            <li key={p.clave}>
              <button type="button" onClick={() => setElegida(p.clave)}
                className={`w-full text-left rounded-xl px-3 py-2 border ${p.clave === elegida ? 'border-violet-400 bg-violet-50' : 'border-transparent hover:bg-slate-50'}`}>
                <span className="block font-semibold text-sm text-slate-800">{p.nombre}</span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {[...new Set(p.ocupaciones.map(o => o.ocupante.unidad && comoTitulo(o.ocupante.unidad)).filter(Boolean))].join(' / ') || (p.funcionario?.unidad ? comoTitulo(p.funcionario.unidad) : 'Sin unidad')}
                  {' · '}{p.ocupaciones.length ? p.ocupaciones.map(o => o.recinto.codigo).join(', ') : 'sin recinto'}
                  {!p.funcionario && <span className="text-amber-700"> · no figura en la nómina</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {persona ? <DetallePersona key={persona.clave} p={persona} propuestas={propuestas} onIrAPropuesta={onIrAPropuesta}
        onListo={async () => { await recargar(); }} codigos={codigos} nombresEdificio={nombresEdificio} usuario={usuario} avisar={avisar} />
        : <div className="hidden lg:grid place-items-center min-h-[300px] rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-sm">Elija una persona.</div>}
    </div>
  );
}

function DetallePersona({ p, propuestas, onIrAPropuesta, onListo, codigos, nombresEdificio, usuario, avisar }: {
  p: FichaPersona; propuestas: Propuesta[]; onIrAPropuesta: (id: string) => void; onListo: () => Promise<void>;
  codigos: Map<string, string>; nombresEdificio: Record<string, string>; usuario: string; avisar: (t: string, tipo?: 'ok' | 'error') => void;
}) {
  const { recintos } = useAsignacion();
  const unidadActual = p.ocupaciones[0]?.ocupante.unidad || p.funcionario?.unidad || '';
  const [unidad, setUnidad] = useState(comoTitulo(unidadActual));
  const [desde, setDesde] = useState(p.ocupaciones[0]?.recinto.id || '');
  const [destino, setDestino] = useState<RecintoAsignable | null>(null);
  const [propuestaId, setPropuestaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const borradores = propuestas.filter(x => x.estado === 'Borrador');
  const unidades = useMemo(() => {
    const s = new Set<string>();
    for (const r of recintos) for (const o of r.ocupantes || []) if (o.unidad?.trim()) s.add(comoTitulo(o.unidad.trim()));
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  }, [recintos]);
  const cambiaUnidad = !!unidad.trim() && normalizar(unidad) !== normalizar(unidadActual);
  const ocupante: Ocupante = p.ocupaciones.find(o => o.recinto.id === desde)?.ocupante
    || { nombre: p.nombre, cargo: null, unidad: p.funcionario?.unidad ? comoTitulo(p.funcionario.unidad) : null };

  const guardar = async (movs: Parameters<typeof moverAhora>[0], texto: string) => {
    setGuardando(true);
    try {
      if (propuestaId) {
        await agregarMovimientos(propuestaId, movs, codigos, Date.now() % 1e9);
        avisar('Agregado a la propuesta.');
        onIrAPropuesta(propuestaId);
      } else {
        await moverAhora(movs, codigos, usuario);
        avisar(texto);
        await onListo();
      }
      setDestino(null);
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setGuardando(false); }
  };
  // Cambio de unidad sin cambio de recinto: un movimiento por cada recinto que ocupa (mismo origen y destino).
  const cambiarUnidad = () => {
    if (!cambiaUnidad || !p.ocupaciones.length) return;
    void guardar(p.ocupaciones.map(o => ({ persona: o.ocupante, desde_id: o.recinto.id, hacia_id: o.recinto.id, unidad_nueva: unidad.trim() })),
      `${p.nombre} ahora es de ${unidad.trim()}.`);
  };
  const cambiarRecinto = () => {
    if (!destino) return;
    void guardar([{ persona: ocupante, desde_id: desde || null, hacia_id: destino.id, unidad_nueva: cambiaUnidad ? unidad.trim() : null }],
      `${p.nombre} pasó a ${destino.codigo}${cambiaUnidad ? ` y a la unidad ${unidad.trim()}` : ''}.`);
  };

  return (
    <section className="space-y-4 min-w-0">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-full bg-violet-100 text-violet-800"><UserRound className="w-5 h-5" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-900">{p.nombre}</h2>
            <p className="text-sm text-slate-600">{[p.ocupaciones[0]?.ocupante.cargo && comoTitulo(p.ocupaciones[0].ocupante.cargo), unidadActual && comoTitulo(unidadActual)].filter(Boolean).join(' · ') || 'Sin cargo ni unidad'}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {p.funcionario ? <>Nómina: {[p.funcionario.unidad && comoTitulo(p.funcionario.unidad), p.funcionario.tipo_contrato && comoTitulo(p.funcionario.tipo_contrato), p.funcionario.telefono && `Fono ${p.funcionario.telefono}`].filter(Boolean).join(' · ')}</>
                : <span className="text-amber-700">No figura en la nómina vigente</span>}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.ocupaciones.length ? p.ocupaciones.map(o => (
            <a key={o.recinto.id} href={enlaceRecinto(o.recinto)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-xs hover:border-violet-300">
              <span className="font-mono font-bold text-violet-800">{o.recinto.codigo}</span> {comoTitulo(o.recinto.nombre)} <span className="text-slate-400">{nombreEdificio(nombresEdificio, o.recinto.edificio_codigo)}</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          )) : <span className="text-sm text-slate-500">Sin recinto asignado (puede ubicarla abajo o en «Por ubicar»).</span>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <label className="block text-xs font-extrabold uppercase tracking-wide text-slate-500">Unidad
          <input list="unidades-persona" value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="Unidad a la que pertenece" className={`mt-1 ${campoClase} normal-case font-normal text-sm tracking-normal`} />
          <datalist id="unidades-persona">{unidades.map(u => <option key={u} value={u} />)}</datalist>
        </label>
        {cambiaUnidad && <p className="text-xs text-violet-800">Cambia de <b>{comoTitulo(unidadActual) || 'sin unidad'}</b> a <b>{unidad.trim()}</b>.</p>}
        <label className="block text-xs font-bold text-slate-700">Cómo
          <select value={propuestaId} onChange={e => setPropuestaId(e.target.value)} className={`mt-1 ${campoClase} font-normal`}>
            <option value="">Aplicar ahora (queda en el historial)</option>
            {borradores.map(x => <option key={x.id} value={x.id}>Agregar a la propuesta «{x.nombre}»</option>)}
          </select>
        </label>
        {p.ocupaciones.length > 0 && (
          <button type="button" onClick={cambiarUnidad} disabled={!cambiaUnidad || guardando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm disabled:opacity-40">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building className="w-4 h-4" />} Cambiar solo la unidad (mismo recinto)
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <h3 className="flex items-center gap-2 font-extrabold text-slate-900"><ArrowRightLeft className="w-5 h-5 text-violet-700" /> Cambiar de recinto</h3>
        {p.ocupaciones.length > 1 && (
          <label className="block text-xs font-bold text-slate-700">Deja el recinto
            <select value={desde} onChange={e => setDesde(e.target.value)} className={`mt-1 ${campoClase} font-normal`}>
              {p.ocupaciones.map(o => <option key={o.recinto.id} value={o.recinto.id}>{o.recinto.codigo} · {comoTitulo(o.recinto.nombre)}</option>)}
            </select>
          </label>
        )}
        {destino ? <RecintoElegido r={destino} agregar={1} onCambiar={() => setDestino(null)} />
          : <BuscadorRecinto onElegir={setDestino} agregar={1} excluir={new Set(desde ? [desde] : [])} edificioPlano={p.ocupaciones[0]?.recinto.edificio_codigo || p.funcionario?.edificio_codigo} />}
        {destino && (
          <button type="button" onClick={cambiarRecinto} disabled={guardando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm disabled:opacity-40">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {propuestaId ? 'Agregar a la propuesta' : `Mover a ${destino.codigo}`}{cambiaUnidad ? ' con la unidad nueva' : ''}
          </button>
        )}
      </div>
    </section>
  );
}
