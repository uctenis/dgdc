import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Settings, Shapes, Tag, Users, SlidersHorizontal, Building2, Loader2, AlertTriangle, CheckCircle2, Search, Plus, Lock, X, Save, Wand2 } from 'lucide-react';
import { RevisionFormato } from './RevisionFormato';
import { useAuth } from '../context/AuthContext';
import {
  getConfigEspacios, saveConfigEspacios, PARAMETROS_POR_DEFECTO, type ConfigEspacios, type TipoRecintoConfig, type ClaseSuperficie,
} from '../data/espaciosConfig';
import { getCampusList, saveCampusList, obtenerEdificiosDeCampus } from '../data/campusData';
import { EVENTO_CONFIG_ACTUALIZADA } from '../services/configCompartida';
import {
  resumenValores, renombrarEnRecintos, renombrarUnidad, listarFichasDeCampus, guardarDatosEdificio, type ValorEnUso,
} from '../services/recintos';
import { colorDeCategoria } from '../utils/geometriaPlano';

type Pestana = 'tipos' | 'usos' | 'unidades' | 'parametros' | 'campus';
const PESTANAS: { id: Pestana; nombre: string; icono: typeof Shapes; ayuda: string }[] = [
  { id: 'tipos', nombre: 'Tipos de recinto', icono: Shapes, ayuda: 'El nombre de cada recinto (Oficina, Sala cátedra, Baño…). Los oficiales aparecen como sugerencia al editar un recinto; su color se usa en el plano.' },
  { id: 'usos', nombre: 'Usos', icono: Tag, ayuda: 'El uso de cada recinto (la lista desplegable al editarlo). Si hay usos oficiales, solo esos se ofrecen.' },
  { id: 'unidades', nombre: 'Unidades usuarias', icono: Users, ayuda: 'Facultades, direcciones y carreras que ocupan los recintos. Las oficiales aparecen como sugerencia al editar un recinto.' },
  { id: 'parametros', nombre: 'Parámetros', icono: SlidersHorizontal, ayuda: 'Umbrales de las alertas «Por revisar» y ajustes del plano interactivo.' },
  { id: 'campus', nombre: 'Campus y edificios', icono: Building2, ayuda: 'Nombre de cada campus y, por edificio, su nombre y categoría. El nombre se usa en todo el sistema (también en proyectos y licitaciones).' },
];
const campo = 'px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50 disabled:text-slate-500';
const m2 = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m²`;

/** Configuración del Gestor de Espacios: listas oficiales, parámetros y campus. Solo el administrador la cambia. */
export function ConfigEspacios({ onCerrar }: { onCerrar: () => void }) {
  const { isAdmin } = useAuth();
  const [pestana, setPestana] = useState<Pestana>('tipos');
  const [config, setConfig] = useState<ConfigEspacios>(getConfigEspacios);
  const [resumen, setResumen] = useState<Awaited<ReturnType<typeof resumenValores>> | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [revisandoFormato, setRevisandoFormato] = useState(false);

  const cargarResumen = useCallback(() => {
    resumenValores().then(setResumen).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { cargarResumen(); }, [cargarResumen]);
  // Si el administrador la cambia desde otro equipo, llega sola.
  useEffect(() => {
    const recargar = () => setConfig(getConfigEspacios());
    window.addEventListener(EVENTO_CONFIG_ACTUALIZADA, recargar);
    return () => window.removeEventListener(EVENTO_CONFIG_ACTUALIZADA, recargar);
  }, []);

  const guardar = (nueva: ConfigEspacios, mensaje = 'Cambios guardados.') => {
    setConfig(nueva); saveConfigEspacios(nueva); setAviso(mensaje);
  };
  const unificar = async (campoRecinto: 'nombre' | 'uso' | 'unidad', de: string, a: string) => {
    setError(''); setAviso('');
    try {
      const n = campoRecinto === 'unidad' ? await renombrarUnidad(de, a) : await renombrarEnRecintos(campoRecinto, de, a);
      setAviso(`«${de}» pasó a «${a}» en ${n} recinto(s).`);
      cargarResumen();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const actual = PESTANAS.find(p => p.id === pestana)!;

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><Settings className="w-5 h-5 text-teal-700" /> Configuración del Gestor de Espacios</h2>
          <p className="text-slate-500">Listas oficiales, parámetros y campus. {isAdmin ? 'Los cambios se comparten con todo el equipo.' : 'Solo el administrador puede cambiarla.'}</p>
        </div>
        {!isAdmin && <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold"><Lock className="w-3.5 h-3.5" /> Solo lectura</span>}
        <button type="button" onClick={onCerrar} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"><X className="w-3.5 h-3.5" /> Volver al Gestor</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PESTANAS.map(p => (
          <button key={p.id} type="button" onClick={() => { setPestana(p.id); setAviso(''); setError(''); setRevisandoFormato(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold border ${pestana === p.id ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            <p.icono className="w-3.5 h-3.5" /> {p.nombre}
          </button>
        ))}
      </div>
      <p className="text-slate-500">{actual.ayuda}</p>

      {error && <Mensaje tipo="error" texto={error} onCerrar={() => setError('')} />}
      {aviso && <Mensaje tipo="ok" texto={aviso} onCerrar={() => setAviso('')} />}

      {(pestana === 'tipos' || pestana === 'usos' || pestana === 'unidades') && resumen && revisandoFormato && (
        <RevisionFormato
          key={pestana}
          campo={pestana === 'tipos' ? 'nombre' : pestana === 'usos' ? 'uso' : 'unidad'}
          enUso={pestana === 'tipos' ? resumen.tipos : pestana === 'usos' ? resumen.usos : resumen.unidades}
          tipos={resumen.tipos.map(v => v.valor)}
          onCerrar={() => setRevisandoFormato(false)}
          onAplicado={(mapa, n) => {
            // Las listas oficiales siguen a los nombres nuevos.
            const renombrar = (lista: string[]) => [...new Set(lista.map(v => (v in mapa ? mapa[v] : v)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
            if (pestana === 'tipos') {
              const tipos = config.tipos.map(t => ({ ...t, nombre: t.nombre in mapa ? mapa[t.nombre] : t.nombre })).filter(t => t.nombre);
              guardar({ ...config, tipos: tipos.filter((t, i) => tipos.findIndex(x => x.nombre === t.nombre) === i) });
            } else if (pestana === 'usos') guardar({ ...config, usos: renombrar(config.usos) });
            else guardar({ ...config, unidades: renombrar(config.unidades) });
            setAviso(`Formato aplicado: ${Object.keys(mapa).length} nombre(s) corregidos en ${n} recinto(s).`);
            setRevisandoFormato(false);
            cargarResumen();
          }}
        />
      )}

      {(pestana === 'tipos' || pestana === 'usos' || pestana === 'unidades') && !revisandoFormato && (
        !resumen ? <Cargando /> : (
          <ListaOficial
            onRevisarFormato={isAdmin ? () => setRevisandoFormato(true) : undefined}
            key={pestana}
            enUso={pestana === 'tipos' ? resumen.tipos : pestana === 'usos' ? resumen.usos : resumen.unidades}
            oficiales={pestana === 'tipos' ? config.tipos.map(t => t.nombre) : pestana === 'usos' ? config.usos : config.unidades}
            editable={isAdmin}
            onOficiales={lista => guardar(
              pestana === 'tipos'
                ? { ...config, tipos: lista.map(n => config.tipos.find(t => t.nombre === n) || { nombre: n }) }
                : pestana === 'usos' ? { ...config, usos: lista } : { ...config, unidades: lista },
            )}
            onUnificar={(de, a) => unificar(pestana === 'tipos' ? 'nombre' : pestana === 'usos' ? 'uso' : 'unidad', de, a)}
            columnasExtra={pestana === 'tipos' ? {
              titulos: ['Color en el plano', 'Superficie'],
              celdas: (valor: string) => {
                const tipo = config.tipos.find(t => t.nombre === valor);
                if (!tipo) return [<span key="c" className="text-slate-300">—</span>, <span key="s" className="text-slate-300">—</span>];
                const cambiar = (cambio: Partial<TipoRecintoConfig>) => guardar({ ...config, tipos: config.tipos.map(t => (t.nombre === valor ? { ...t, ...cambio } : t)) });
                return [
                  <input key="c" type="color" disabled={!isAdmin} value={tipo.color || aHex(colorDeCategoria(valor))} onChange={e => cambiar({ color: e.target.value })}
                    className="w-10 h-6 rounded border border-slate-300 cursor-pointer disabled:cursor-default" title="Color en el plano interactivo" />,
                  <select key="s" disabled={!isAdmin} value={tipo.clase || ''} onChange={e => cambiar({ clase: (e.target.value || null) as ClaseSuperficie | null })} className={`${campo} py-1`}>
                    <option value="">—</option><option value="Útil">Útil</option><option value="Común">Común</option>
                  </select>,
                ];
              },
            } : undefined}
          />
        )
      )}

      {pestana === 'parametros' && <Parametros config={config} editable={isAdmin} onGuardar={p => guardar({ ...config, parametros: p }, 'Parámetros guardados.')} />}
      {pestana === 'campus' && <CampusYEdificios editable={isAdmin} onAviso={setAviso} onError={setError} />}
    </div>
  );
}

// ── Listas oficiales (tipos, usos, unidades) ──

function ListaOficial({ enUso, oficiales, editable, onOficiales, onUnificar, columnasExtra, onRevisarFormato }: {
  onRevisarFormato?: () => void;
  enUso: ValorEnUso[];
  oficiales: string[];
  editable: boolean;
  onOficiales: (lista: string[]) => void;
  onUnificar: (de: string, a: string) => Promise<void>;
  columnasExtra?: { titulos: string[]; celdas: (valor: string) => ReactNode[] };
}) {
  const [filtro, setFiltro] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [unificando, setUnificando] = useState<{ de: string; a: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const esOficial = useMemo(() => new Set(oficiales), [oficiales]);
  // Los valores en uso más los oficiales que hoy no tiene ningún recinto.
  const filas = useMemo(() => {
    const todos = [...enUso, ...oficiales.filter(o => !enUso.some(v => v.valor === o)).map(valor => ({ valor, recintos: 0, m2: 0 }))];
    const f = filtro.trim().toLowerCase();
    return f ? todos.filter(v => v.valor.toLowerCase().includes(f)) : todos;
  }, [enUso, oficiales, filtro]);
  const noOficiales = enUso.filter(v => !esOficial.has(v.valor)).length;

  const alternar = (valor: string) => onOficiales(esOficial.has(valor) ? oficiales.filter(o => o !== valor) : [...oficiales, valor].sort((a, b) => a.localeCompare(b, 'es')));
  const agregar = () => {
    const v = nuevo.trim().toUpperCase();
    if (!v || esOficial.has(v)) return;
    onOficiales([...oficiales, v].sort((a, b) => a.localeCompare(b, 'es')));
    setNuevo('');
  };
  const confirmarUnificar = async () => {
    if (!unificando || !unificando.a.trim() || unificando.a.trim() === unificando.de) return;
    const n = enUso.find(v => v.valor === unificando.de)?.recintos || 0;
    if (!confirm(`¿Cambiar «${unificando.de}» por «${unificando.a.trim()}» en ${n} recinto(s)? Queda en el historial de cada recinto.`)) return;
    setTrabajando(true);
    try {
      await onUnificar(unificando.de, unificando.a.trim());
      if (esOficial.has(unificando.de)) onOficiales([...new Set(oficiales.map(o => (o === unificando.de ? unificando.a.trim() : o)))]);
      setUnificando(null);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <span className="font-bold text-slate-800">{oficiales.length} oficiales · {enUso.length} en uso</span>
        {noOficiales > 0 && <span className="text-amber-700">· {noOficiales} en uso sin marcar como oficiales</span>}
        <label className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg">
          <Search className="w-3.5 h-3.5 text-slate-400" /><input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar" className="outline-none w-40" />
        </label>
        {onRevisarFormato && (
          <button type="button" onClick={onRevisarFormato} title="Propone el formato correcto (tildes, mayúsculas, abreviaturas, duplicados) para todos los valores; usted revisa y aplica"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 font-bold text-white">
            <Wand2 className="w-3.5 h-3.5" /> Revisar formato
          </button>
        )}
        {editable && noOficiales > 0 && (
          <button type="button" onClick={() => onOficiales([...new Set([...oficiales, ...enUso.map(v => v.valor)])].sort((a, b) => a.localeCompare(b, 'es')))}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-300 bg-white font-bold text-teal-800 hover:bg-teal-50">
            <CheckCircle2 className="w-3.5 h-3.5" /> Marcar todos como oficiales
          </button>
        )}
      </div>
      {editable && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
          <input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()} placeholder="Agregar uno nuevo a la lista oficial" className={`${campo} flex-1 max-w-md`} />
          <button type="button" onClick={agregar} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold"><Plus className="w-3.5 h-3.5" /> Agregar</button>
        </div>
      )}
      <div className="overflow-x-auto max-h-[62vh]">
        <table className="w-full min-w-[760px] table-fixed">
          <colgroup>
            <col className="w-20" /><col /><col className="w-24" /><col className="w-28" />
            {columnasExtra?.titulos.map(t => <col key={t} className="w-32" />)}
            <col className="w-[22rem]" />
          </colgroup>
          <thead className="sticky top-0 bg-white text-slate-500 text-[10px] uppercase tracking-wide border-b border-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">Oficial</th><th className="px-3 py-2 text-left">Valor</th>
              <th className="px-3 py-2 text-right">Recintos</th><th className="px-3 py-2 text-right">m² útil</th>
              {columnasExtra?.titulos.map(t => <th key={t} className="px-3 py-2 text-left">{t}</th>)}
              <th className="px-3 py-2 text-left">Unificar o renombrar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map(v => (
              <tr key={v.valor} className={esOficial.has(v.valor) ? '' : 'bg-amber-50/40'}>
                <td className="px-3 py-1.5"><input type="checkbox" disabled={!editable} checked={esOficial.has(v.valor)} onChange={() => alternar(v.valor)} className="accent-teal-700" /></td>
                <td className="px-3 py-1.5 truncate font-semibold text-slate-800" title={v.valor}>{v.valor}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{v.recintos}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{v.m2 ? m2(v.m2) : '—'}</td>
                {columnasExtra?.celdas(v.valor).map((c, i) => <td key={i} className="px-3 py-1.5">{c}</td>)}
                <td className="px-3 py-1.5">
                  {!editable || v.recintos === 0 ? <span className="text-slate-300">—</span> : unificando?.de === v.valor ? (
                    <span className="flex items-center gap-1">
                      <input list="valores-unificar" autoFocus value={unificando.a} onChange={e => setUnificando({ ...unificando, a: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') void confirmarUnificar(); if (e.key === 'Escape') setUnificando(null); }}
                        placeholder="Nuevo valor u otro de la lista" className={`${campo} py-1 flex-1 min-w-0`} />
                      <button type="button" disabled={trabajando} onClick={() => void confirmarUnificar()} className="px-2 py-1 rounded-lg bg-teal-700 text-white font-bold disabled:opacity-50">
                        {trabajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aplicar'}
                      </button>
                      <button type="button" onClick={() => setUnificando(null)} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setUnificando({ de: v.valor, a: '' })} className="text-teal-800 font-bold hover:underline">Cambiar por…</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="valores-unificar">{[...new Set([...oficiales, ...enUso.map(v => v.valor)])].map(o => <option key={o} value={o} />)}</datalist>
        {!filas.length && <p className="p-4 text-slate-500">Sin resultados.</p>}
      </div>
    </div>
  );
}

// ── Parámetros ──

function Parametros({ config, editable, onGuardar }: { config: ConfigEspacios; editable: boolean; onGuardar: (p: ConfigEspacios['parametros']) => void }) {
  const [p, setP] = useState(config.parametros);
  useEffect(() => { setP(config.parametros); }, [config.parametros]);
  const numero = (clave: keyof typeof p, etiqueta: string, ayuda: string, paso = 0.1) => (
    <label className="block space-y-1">
      <span className="font-bold text-slate-700">{etiqueta}</span>
      <input type="number" step={paso} min={0} disabled={!editable} value={p[clave] as number} onChange={e => setP({ ...p, [clave]: Number(e.target.value) })} className={`${campo} w-32`} />
      <span className="block text-slate-500">{ayuda}</span>
    </label>
  );
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <h3 className="font-extrabold text-slate-800">Alertas «Por revisar»</h3>
        {numero('factorOguc', 'Factor máximo OGUC / útil', 'Se alerta si la superficie OGUC supera a la útil en más que este factor (1,6 = 60 % más).')}
        {numero('diferenciaOgucM2', 'Diferencia mínima (m²)', 'Y además la diferencia supera estos m², para no alertar recintos chicos.', 0.5)}
        <p className="text-slate-500">Siempre se alerta un recinto sin superficies, sin tipo o con la superficie útil mayor que la OGUC.</p>
      </section>
      <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <h3 className="font-extrabold text-slate-800">Plano interactivo</h3>
        <label className="block space-y-1">
          <span className="font-bold text-slate-700">Escala por defecto</span>
          <input disabled={!editable} value={p.escalaPorDefecto} onChange={e => setP({ ...p, escalaPorDefecto: e.target.value })} placeholder="1:100" className={`${campo} w-32`} />
          <span className="block text-slate-500">Se usa para medir y predibujar cuando la lámina no indica su escala.</span>
        </label>
        {numero('largoMinimoMuroM', 'Largo mínimo de muro (m)', 'Al predibujar, los trazos más cortos se ignoran (muebles, hojas de puerta).')}
        {numero('vanoMaximoM', 'Ancho máximo de puerta (m)', 'Al predibujar, los vanos de hasta este ancho se cierran en línea recta.')}
      </section>
      {editable && (
        <div className="md:col-span-2 flex justify-end gap-2">
          <button type="button" onClick={() => setP(PARAMETROS_POR_DEFECTO)} className="px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50">Valores por defecto</button>
          <button type="button" onClick={() => onGuardar(p)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold"><Save className="w-3.5 h-3.5" /> Guardar parámetros</button>
        </div>
      )}
    </div>
  );
}

// ── Campus y edificios ──

const CATEGORIAS = [{ valor: '1', nombre: 'Edificio' }, { valor: '2', nombre: 'Construcción menor' }, { valor: '3', nombre: 'Espacio común' }];

function CampusYEdificios({ editable, onAviso, onError }: { editable: boolean; onAviso: (s: string) => void; onError: (s: string) => void }) {
  const [lista, setLista] = useState(getCampusList);
  const [sigla, setSigla] = useState(lista[0]?.sigla || '');
  const [fichas, setFichas] = useState<Record<string, { nombre: string; categoria: string }>>({});
  const [editados, setEditados] = useState<Record<string, { nombre: string; categoria: string }>>({});
  const [nombreCampus, setNombreCampus] = useState('');
  const [nuevo, setNuevo] = useState({ codigo: '', nombre: '', categoria: '1' });
  const [guardando, setGuardando] = useState(false);
  const campusActual = lista.find(c => c.sigla === sigla);

  useEffect(() => {
    if (!sigla) return;
    setEditados({}); setNombreCampus(campusActual?.nombre || '');
    listarFichasDeCampus(sigla)
      .then(f => setFichas(Object.fromEntries(f.map(x => [x.codigo, { nombre: x.nombre || '', categoria: x.categoria || '' }]))))
      .catch(e => onError(e instanceof Error ? e.message : String(e)));
  }, [sigla]); // eslint-disable-line react-hooks/exhaustive-deps

  const codigos = [...new Set([...obtenerEdificiosDeCampus(sigla).filter(e => !/-[A-Z]{2}$/.test(e)), ...Object.keys(fichas)])]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const valor = (e: string) => editados[e] || fichas[e] || { nombre: campusActual?.edificiosInfo?.[e]?.nombre || '', categoria: '' };
  const cambiar = (e: string, cambio: Partial<{ nombre: string; categoria: string }>) => setEditados(prev => ({ ...prev, [e]: { ...valor(e), ...cambio } }));

  /** Guarda en la base (ficha del edificio) y en la configuración compartida (nombre y lista del campus). */
  const guardarTodo = async (extra?: { codigo: string; nombre: string; categoria: string }) => {
    if (!campusActual) return;
    const cambios = { ...editados, ...(extra ? { [extra.codigo]: { nombre: extra.nombre, categoria: extra.categoria } } : {}) };
    setGuardando(true);
    try {
      for (const [codigo, d] of Object.entries(cambios)) {
        await guardarDatosEdificio(codigo, { nombre: d.nombre.trim(), categoria: d.categoria || null, campus_nombre: nombreCampus.trim() || campusActual.nombre });
      }
      const nueva = lista.map(c => c.sigla !== sigla ? c : {
        ...c,
        nombre: nombreCampus.trim() || c.nombre,
        edificios: extra && !c.edificios.includes(extra.codigo) ? [...c.edificios, extra.codigo] : c.edificios,
        edificiosInfo: Object.fromEntries([
          ...Object.entries(c.edificiosInfo || {}),
          ...Object.entries(cambios).map(([codigo, d]) => [codigo, { ...(c.edificiosInfo?.[codigo] || {}), nombre: d.nombre.trim() }]),
        ]),
      });
      saveCampusList(nueva);
      setLista(nueva);
      setFichas(prev => ({ ...prev, ...cambios }));
      setEditados({});
      onAviso(`Campus ${sigla} guardado${Object.keys(cambios).length ? ` (${Object.keys(cambios).length} edificio(s))` : ''}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };
  const agregar = () => {
    const codigo = nuevo.codigo.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,12}$/.test(codigo)) return onError('El código del edificio debe tener entre 2 y 12 letras, números, «_» o «-».');
    if (!codigo.startsWith(sigla)) return onError(`El código debe empezar con la sigla del campus (${sigla}).`);
    if (codigos.includes(codigo)) return onError(`El edificio ${codigo} ya existe.`);
    void guardarTodo({ codigo, nombre: nuevo.nombre, categoria: nuevo.categoria });
    setNuevo({ codigo: '', nombre: '', categoria: '1' });
  };
  const hayCambios = Object.keys(editados).length > 0 || (!!campusActual && nombreCampus.trim() !== campusActual.nombre);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <label className="font-bold text-slate-700">Campus
          <select value={sigla} onChange={e => setSigla(e.target.value)} className={`block mt-1 ${campo} min-w-[240px] font-normal`}>
            {lista.map(c => <option key={c.sigla} value={c.sigla}>{c.sigla} — {c.nombre}</option>)}
          </select>
        </label>
        <label className="font-bold text-slate-700 flex-1 min-w-[260px]">Nombre del campus
          <input disabled={!editable} value={nombreCampus} onChange={e => setNombreCampus(e.target.value)} className={`block mt-1 ${campo} w-full font-normal`} />
        </label>
        {editable && (
          <button type="button" disabled={!hayCambios || guardando} onClick={() => void guardarTodo()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold disabled:opacity-40">
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar cambios
          </button>
        )}
      </div>
      <div className="overflow-x-auto max-h-[58vh]">
        <table className="w-full min-w-[640px] table-fixed">
          <colgroup><col className="w-32" /><col /><col className="w-48" /></colgroup>
          <thead className="sticky top-0 bg-white text-slate-500 text-[10px] uppercase tracking-wide border-b border-slate-100">
            <tr><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">Categoría</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {codigos.map(e => (
              <tr key={e} className={editados[e] ? 'bg-teal-50/50' : ''}>
                <td className="px-3 py-1.5 font-mono font-bold text-slate-900">{e}</td>
                <td className="px-3 py-1.5"><input disabled={!editable} value={valor(e).nombre} onChange={x => cambiar(e, { nombre: x.target.value })} placeholder="Sin nombre" className={`${campo} py-1 w-full`} /></td>
                <td className="px-3 py-1.5">
                  <select disabled={!editable} value={valor(e).categoria} onChange={x => cambiar(e, { categoria: x.target.value })} className={`${campo} py-1 w-full`}>
                    <option value="">—</option>{CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.nombre}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          <span className="font-bold text-slate-700">Agregar edificio</span>
          <input value={nuevo.codigo} onChange={e => setNuevo({ ...nuevo, codigo: e.target.value })} placeholder={`${sigla}25`} className={`${campo} w-28 font-mono`} />
          <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre" className={`${campo} flex-1 min-w-[200px]`} />
          <select value={nuevo.categoria} onChange={e => setNuevo({ ...nuevo, categoria: e.target.value })} className={campo}>
            {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.nombre}</option>)}
          </select>
          <button type="button" disabled={guardando} onClick={agregar} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Agregar</button>
        </div>
      )}
    </div>
  );
}

// ── Piezas ──

function Mensaje({ tipo, texto, onCerrar }: { tipo: 'ok' | 'error'; texto: string; onCerrar: () => void }) {
  const Icono = tipo === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 rounded-lg p-2.5 border ${tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
      <Icono className="w-4 h-4 shrink-0" /><span className="flex-1">{texto}</span>
      <button type="button" onClick={onCerrar}><X className="w-4 h-4" /></button>
    </div>
  );
}

const Cargando = () => <p className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo los recintos…</p>;

/** Convierte un color «hsl(h s% l%)» a «#rrggbb» para el selector de color. */
function aHex(color: string): string {
  const m = /hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/.exec(color);
  if (!m) return color.startsWith('#') ? color : '#94a3b8';
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
