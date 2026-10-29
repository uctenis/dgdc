import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3, Loader2, X, Link2, Download, RefreshCw, Search, ChevronDown, Check, Sparkles, LayoutGrid, Table2, ExternalLink, AlertTriangle, PieChart,
} from 'lucide-react';
import { cargarDatosAnalisis } from '../services/analisisEspacios';
import {
  agrupar, cruzar, DIMENSIONES, filtrar, formatoM2, formatoMedida, fraseRespuesta, MEDIDAS, SIN_DATO, totales, valorMedida,
  type Dimension, type FilaAnalisis, type Filtros, type Grupo, type Medida,
} from '../utils/analisisEspacios';
import { comoTitulo } from '../utils/texto';

// Paleta categórica en orden fijo (validada para daltonismo); «Otros» en gris. Un solo azul para barras y la escala del
// cruce. Los textos van siempre en tinta (slate), nunca en el color de la serie.
const CATEGORICOS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const GRIS_OTROS = '#a3a29c';
const AZUL = '#2a78d6';
const ESCALA = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

interface Consulta { f: Filtros; g: Dimension; m: Medida; cf: Dimension; cc: Dimension }
const CONSULTA_INICIAL: Consulta = { f: {}, g: 'tipo', m: 'util', cf: 'piso', cc: 'tipo' };

const leerConsulta = (texto: string | null): Consulta => {
  try { return texto ? { ...CONSULTA_INICIAL, ...JSON.parse(texto) } : CONSULTA_INICIAL; } catch { return CONSULTA_INICIAL; }
};
const pct = (parte: number, total: number) => (total ? `${(parte / total * 100).toLocaleString('es-CL', { maximumFractionDigits: parte / total < 0.1 ? 1 : 0 })} %` : '—');

interface Props {
  onAbrirRecinto: (edificio: string, recintoId: string) => void;
  onCerrar: () => void;
}

/**
 * Consultas y análisis: cruza recintos por campus, edificio, piso, tipo, uso, unidad y clase de superficie, y responde
 * con una frase, cifras, un ranking, la composición, un cruce de dos dimensiones y el detalle de los recintos. La
 * consulta queda en la dirección de la página: se puede compartir o volver a ella con «atrás».
 */
export function AnalisisEspacios({ onAbrirRecinto, onCerrar }: Props) {
  const [parametros, setParametros] = useSearchParams();
  const consulta = useMemo(() => leerConsulta(parametros.get('consulta')), [parametros]);
  const cambiar = (c: Partial<Consulta>) => {
    const nuevo = new URLSearchParams(parametros);
    nuevo.set('consulta', JSON.stringify({ ...consulta, ...c }));
    setParametros(nuevo, { replace: true });
  };
  const ponerFiltros = (f: Filtros) => cambiar({ f });

  const [datos, setDatos] = useState<Awaited<ReturnType<typeof cargarDatosAnalisis>> | null>(null);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const cargar = (forzar = false) => {
    setError('');
    if (forzar) setDatos(null);
    cargarDatosAnalisis(forzar).then(setDatos).catch(e => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Los recintos eliminados no cuentan, salvo que se pidan con el filtro de estado.
  const base = useMemo(() => (datos?.filas || []).filter(f => f.estado !== 'Eliminado' || consulta.f.estado?.includes('Eliminado')), [datos, consulta.f.estado]);
  const resultado = useMemo(() => filtrar(base, consulta.f), [base, consulta.f]);
  const t = useMemo(() => totales(resultado), [resultado]);
  const nombreEdificio = (c: string) => (datos?.nombresEdificio[c] ? `${c} ${comoTitulo(datos.nombresEdificio[c])}` : c);
  const nombreCampus = (c: string) => datos?.filas.find(f => f.campus === c)?.campusNombre || c;
  const etiqueta = (d: Dimension, v: string) => (d === 'edificio' ? nombreEdificio(v) : d === 'campus' ? `${v} · ${nombreCampus(v)}` : v);
  const frase = fraseRespuesta(consulta.f, t, { edificio: nombreEdificio, campus: nombreCampus });
  const hayFiltros = DIMENSIONES.some(d => consulta.f[d.id]?.length) || !!consulta.f.texto?.trim();

  const copiarEnlace = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ }
  };
  const descargar = async () => {
    if (!datos) return;
    setDescargando(true);
    try {
      const [{ exportarRecintosExcel }, { listarRecintosDeCampus }] = await Promise.all([import('../utils/exportarRecintos'), import('../services/recintos')]);
      const ids = new Set(resultado.map(f => f.id));
      const prefijo = consulta.f.campus?.length === 1 ? consulta.f.campus[0] : '';
      const recintos = (await listarRecintosDeCampus(prefijo)).filter(r => ids.has(r.id));
      await exportarRecintosExcel(recintos, datos.nombresEdificio, 'consulta');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDescargando(false);
    }
  };

  if (!datos) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3 text-xs">
        {error ? <p className="text-rose-700 flex items-center justify-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>
          : <p className="text-slate-500 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-teal-700" /> Leyendo todos los recintos…</p>}
        <button type="button" onClick={onCerrar} className="text-teal-800 font-bold hover:underline">Volver al Gestor</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {/* Encabezado */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-teal-700" /> Consultas y análisis</h2>
          <p className="text-slate-500">Combine filtros para responder preguntas sobre superficies, recintos y unidades de todos los campus.</p>
        </div>
        <button type="button" onClick={() => void copiarEnlace()} title="Copiar el enlace de esta consulta para compartirla"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50">
          {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />} {copiado ? 'Enlace copiado' : 'Copiar enlace'}
        </button>
        <button type="button" disabled={descargando || !resultado.length} onClick={() => void descargar()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {descargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Excel
        </button>
        <button type="button" onClick={() => cargar(true)} title={`Datos leídos a las ${datos.leidoEn.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}. Volver a leer.`}
          className="p-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={onCerrar} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"><X className="w-3.5 h-3.5" /> Volver al Gestor</button>
      </div>

      <PreguntasFrecuentes filas={base} filtros={consulta.f} nombreEdificio={nombreEdificio} nombreCampus={nombreCampus} onElegir={c => cambiar(c)} />

      {/* Filtros: una fila, sobre todo lo demás */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-2">
        {DIMENSIONES.map(d => {
          const opciones = agrupar(filtrar(base, consulta.f, d.id), d.id, 'recintos').map(g => ({ valor: g.clave, etiqueta: etiqueta(d.id, g.clave), n: g.recintos }));
          // Un filtro que hoy no distingue nada (todo «Sin dato», como útil/común antes de clasificar los tipos) no se muestra.
          if (!consulta.f[d.id]?.length && opciones.every(o => o.valor === SIN_DATO)) return null;
          return (
            <FiltroMultiple key={d.id} titulo={d.nombre} elegidos={consulta.f[d.id] || []} opciones={opciones}
              ordenAlfabetico={d.id !== 'piso'}
              onCambiar={v => ponerFiltros({ ...consulta.f, [d.id]: v })} />
          );
        })}
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-teal-400">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <CampoTexto valor={consulta.f.texto || ''} onCambiar={texto => ponerFiltros({ ...consulta.f, texto })} />
        </label>
        {hayFiltros && <button type="button" onClick={() => ponerFiltros({})} className="ml-auto px-2.5 py-1.5 rounded-lg text-rose-700 font-bold hover:bg-rose-50">Limpiar filtros</button>}
      </div>

      {/* La respuesta */}
      <div className="bg-gradient-to-br from-teal-50 to-white border border-teal-200 rounded-2xl p-4 shadow-sm space-y-3">
        <p className="text-sm text-slate-800 leading-relaxed"><Sparkles className="inline w-4 h-4 text-teal-700 mr-1 -mt-0.5" />{frase}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Cifra titulo="Recintos" valor={t.recintos.toLocaleString('es-CL')} detalle={`${t.edificios} edificio(s) · ${t.pisos} piso(s)`} />
          <Cifra titulo="Superficie útil" valor={formatoM2(t.util)} detalle={t.recintos ? `promedio ${formatoM2(t.util / t.recintos)}` : ''} />
          <Cifra titulo="Superficie OGUC" valor={formatoM2(t.oguc)} detalle={t.util ? `${pct(t.oguc - t.util, t.util)} sobre la útil` : ''} />
          <Cifra titulo="Capacidad" valor={t.capacidad ? `${t.capacidad.toLocaleString('es-CL')} personas` : '—'} detalle={t.capacidad && t.util ? `${(t.util / t.capacidad).toLocaleString('es-CL', { maximumFractionDigits: 1 })} m² por persona` : 'sin capacidad registrada'} />
          <Cifra titulo="Ocupantes" valor={t.ocupantes.toLocaleString('es-CL')} detalle={`en ${resultado.filter(f => f.ocupantes.length).length} recinto(s)`} />
        </div>
      </div>

      {resultado.length > 0 && (<>
        <div className="grid lg:grid-cols-5 gap-4">
          <Tarjeta className="lg:col-span-3" icono={<BarChart3 className="w-4 h-4 text-teal-700" />} titulo={`${MEDIDAS.find(m => m.id === consulta.m)!.nombre} por ${DIMENSIONES.find(d => d.id === consulta.g)!.nombre.toLowerCase()}`}
            acciones={<>
              <Selector valor={consulta.g} opciones={DIMENSIONES.map(d => ({ valor: d.id, nombre: `Por ${d.nombre.toLowerCase()}` }))} onCambiar={g => cambiar({ g: g as Dimension })} />
              <Selector valor={consulta.m} opciones={MEDIDAS.map(m => ({ valor: m.id, nombre: m.nombre }))} onCambiar={m => cambiar({ m: m as Medida })} />
            </>}>
            <Ranking grupos={agrupar(resultado, consulta.g, consulta.m)} medida={consulta.m} total={valorMedida(t, consulta.m)} etiqueta={v => etiqueta(consulta.g, v)}
              compartido={consulta.g === 'unidad'}
              onElegir={v => ponerFiltros({ ...consulta.f, [consulta.g]: [v] })} />
          </Tarjeta>
          <Tarjeta className="lg:col-span-2" icono={<PieChart className="w-4 h-4 text-teal-700" />} titulo="Cómo se reparte">
            <Composicion grupos={agrupar(resultado, consulta.g, consulta.m)} medida={consulta.m} etiqueta={v => etiqueta(consulta.g, v)}
              colorDe={colorEstable(base, consulta.g, consulta.m)} />
          </Tarjeta>
        </div>

        <Tarjeta icono={<LayoutGrid className="w-4 h-4 text-teal-700" />} titulo="Cruce"
          acciones={<>
            <Selector valor={consulta.cf} opciones={DIMENSIONES.map(d => ({ valor: d.id, nombre: `Filas: ${d.nombre.toLowerCase()}` }))} onCambiar={v => cambiar({ cf: v as Dimension })} />
            <span className="text-slate-400">×</span>
            <Selector valor={consulta.cc} opciones={DIMENSIONES.filter(d => d.id !== consulta.cf).map(d => ({ valor: d.id, nombre: `Columnas: ${d.nombre.toLowerCase()}` }))} onCambiar={v => cambiar({ cc: v as Dimension })} />
          </>}>
          <MatrizCruce filas={resultado} df={consulta.cf} dc={consulta.cc === consulta.cf ? (consulta.cf === 'tipo' ? 'piso' : 'tipo') : consulta.cc} medida={consulta.m}
            etiqueta={etiqueta} onElegir={(vf, vc, df, dc) => ponerFiltros({ ...consulta.f, [df]: [vf], ...(vc !== 'Otros' ? { [dc]: [vc] } : {}) })} />
        </Tarjeta>

        <Tarjeta icono={<Table2 className="w-4 h-4 text-teal-700" />} titulo={`Recintos (${resultado.length.toLocaleString('es-CL')})`}>
          <Detalle filas={resultado} nombreEdificio={nombreEdificio} onAbrir={onAbrirRecinto} />
        </Tarjeta>
      </>)}
    </div>
  );
}

// ── Preguntas frecuentes: consultas armadas con un clic, según el campus o edificio en que se esté ──

function PreguntasFrecuentes({ filas, filtros, nombreEdificio, nombreCampus, onElegir }: {
  filas: FilaAnalisis[]; filtros: Filtros; nombreEdificio: (c: string) => string; nombreCampus: (c: string) => string; onElegir: (c: Partial<Consulta>) => void;
}) {
  const masFrecuente = (d: Dimension, lista = filas) => agrupar(lista, d, 'recintos')[0]?.clave;
  const campus = filtros.campus?.[0] || (filtros.edificio?.[0] ? filas.find(f => f.edificio === filtros.edificio![0])?.campus : undefined) || masFrecuente('campus') || '';
  const delCampus = filas.filter(f => f.campus === campus);
  const edificio = filtros.edificio?.[0] || masFrecuente('edificio', delCampus) || '';
  const tiposCon = (texto: RegExp) => [...new Set(filas.map(f => f.tipo).filter(t => texto.test(t)))];
  const salas = tiposCon(/^SALA(?! (DE )?(BOMBA|ELE|SERVIDOR|MAQUINA|ESPERA|REUNION|LAVADO))/i);
  const oficinas = tiposCon(/^OFICINA/i);
  const todas: { texto: string; consulta: Partial<Consulta> }[] = [
    { texto: `¿Cuántas salas tiene ${nombreCampus(campus)}?`, consulta: { f: { campus: [campus], tipo: salas }, g: 'edificio', m: 'recintos' } },
    { texto: `¿Qué superficie total de salas tiene ${nombreEdificio(edificio)}?`, consulta: { f: { edificio: [edificio], tipo: salas }, g: 'piso', m: 'util' } },
    { texto: `¿Cómo se reparten oficinas y salas en ${nombreEdificio(edificio)}?`, consulta: { f: { edificio: [edificio], tipo: [...oficinas, ...salas] }, g: 'tipo', m: 'util' } },
    { texto: `¿Cuántos m² ocupa cada unidad en ${nombreCampus(campus)}?`, consulta: { f: { campus: [campus] }, g: 'unidad', m: 'util' } },
    { texto: `¿Cuánta superficie tiene cada piso de ${nombreEdificio(edificio)}?`, consulta: { f: { edificio: [edificio] }, g: 'piso', m: 'util', cf: 'piso', cc: 'tipo' } },
    { texto: '¿Qué campus tiene más superficie?', consulta: { f: {}, g: 'campus', m: 'util' } },
  ];
  const preguntas = todas.filter(p => !p.texto.includes('undefined'));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-bold text-slate-500">Preguntas frecuentes:</span>
      {preguntas.map(p => (
        <button key={p.texto} type="button" onClick={() => onElegir(p.consulta)}
          className="px-3 py-1.5 rounded-full border border-teal-200 bg-white text-teal-900 hover:bg-teal-50 hover:border-teal-400 transition">{p.texto}</button>
      ))}
    </div>
  );
}

// ── Piezas ──

/**
 * Búsqueda por texto que no pierde letras: lo escrito queda en el campo al instante y la consulta (que va en la
 * dirección de la página y recalcula todo) se actualiza cuando se deja de escribir.
 */
function CampoTexto({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const enviado = useRef(valor);
  // Si la consulta cambia desde afuera (limpiar filtros, preguntas frecuentes), el campo la sigue.
  useEffect(() => { if (valor !== enviado.current) { enviado.current = valor; setTexto(valor); } }, [valor]);
  useEffect(() => {
    if (texto === enviado.current) return;
    const espera = setTimeout(() => { enviado.current = texto; onCambiar(texto); }, 250);
    return () => clearTimeout(espera);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Persona, código o texto" className="outline-none w-44" />;
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="text-xl font-extrabold text-slate-900 tabular-nums leading-tight mt-0.5">{valor}</p>
      {detalle && <p className="text-[11px] text-slate-500 mt-0.5">{detalle}</p>}
    </div>
  );
}

function Tarjeta({ titulo, icono, acciones, children, className = '' }: { titulo: string; icono: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100">
        <h3 className="font-extrabold text-slate-800 flex items-center gap-1.5 mr-auto">{icono} {titulo}</h3>
        {acciones}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Selector({ valor, opciones, onCambiar }: { valor: string; opciones: { valor: string; nombre: string }[]; onCambiar: (v: string) => void }) {
  return (
    <select value={valor} onChange={e => onCambiar(e.target.value)} className="px-2 py-1 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700">
      {opciones.map(o => <option key={o.valor} value={o.valor}>{o.nombre}</option>)}
    </select>
  );
}

/** Filtro de varios valores con buscador y, junto a cada opción, cuántos recintos quedarían. */
function FiltroMultiple({ titulo, opciones, elegidos, onCambiar, ordenAlfabetico }: {
  titulo: string; opciones: { valor: string; etiqueta: string; n: number }[]; elegidos: string[]; onCambiar: (v: string[]) => void; ordenAlfabetico: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);
  const lista = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    const todas = [...opciones, ...elegidos.filter(e => !opciones.some(o => o.valor === e)).map(valor => ({ valor, etiqueta: valor, n: 0 }))];
    const filtradas = b ? todas.filter(o => o.etiqueta.toLowerCase().includes(b)) : todas;
    return ordenAlfabetico ? [...filtradas].sort((a, x) => a.etiqueta.localeCompare(x.etiqueta, 'es', { numeric: true })) : filtradas;
  }, [opciones, elegidos, buscar, ordenAlfabetico]);
  const alternar = (v: string) => onCambiar(elegidos.includes(v) ? elegidos.filter(x => x !== v) : [...elegidos, v]);
  const resumen = elegidos.length === 0 ? titulo : elegidos.length === 1 ? (opciones.find(o => o.valor === elegidos[0])?.etiqueta || elegidos[0]) : `${titulo} (${elegidos.length})`;
  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto(a => !a)}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-semibold max-w-[240px] ${elegidos.length ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
        <span className="truncate">{resumen}</span><ChevronDown className="w-3.5 h-3.5 shrink-0" />
      </button>
      {abierto && (
        <div className="absolute left-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl z-40">
          {/* El buscador solo aparece cuando hay muchas opciones; con pocas basta la lista. */}
          {opciones.length > 8 ? (
            <div className="p-2 border-b border-slate-100 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input autoFocus value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={`Buscar ${titulo.toLowerCase()}`} className="flex-1 outline-none" />
              {elegidos.length > 0 && <button type="button" onClick={() => onCambiar([])} className="text-rose-700 font-bold">Quitar</button>}
            </div>
          ) : elegidos.length > 0 && (
            <div className="px-3 py-1.5 border-b border-slate-100 text-right">
              <button type="button" onClick={() => onCambiar([])} className="text-rose-700 font-bold">Quitar filtro</button>
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto py-1">
            {lista.map(o => (
              <li key={o.valor}>
                <button type="button" onClick={() => alternar(o.valor)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-teal-50">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${elegidos.includes(o.valor) ? 'bg-teal-700 border-teal-700' : 'border-slate-300'}`}>
                    {elegidos.includes(o.valor) && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="flex-1 truncate text-slate-700" title={o.etiqueta}>{o.etiqueta}</span>
                  <span className="text-slate-400 tabular-nums">{o.n}</span>
                </button>
              </li>
            ))}
            {!lista.length && <li className="px-3 py-2 text-slate-400">Sin opciones.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Ranking en barras horizontales: un solo color, valor al final, porcentaje; clic para filtrar por ese valor. */
function Ranking({ grupos, medida, total, etiqueta, onElegir, compartido }: {
  grupos: Grupo[]; medida: Medida; total: number; etiqueta: (v: string) => string; onElegir: (v: string) => void; compartido: boolean;
}) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? grupos : grupos.slice(0, 12);
  const maximo = Math.max(...grupos.map(g => valorMedida(g, medida)), 0) || 1;
  return (
    <div className="space-y-1">
      {visibles.map(g => {
        const v = valorMedida(g, medida);
        return (
          <button key={g.clave} type="button" onClick={() => onElegir(g.clave)}
            title={`${etiqueta(g.clave)}\n${g.recintos} recinto(s) · ${formatoM2(g.util)} útil · ${formatoM2(g.oguc)} OGUC${g.capacidad ? ` · ${g.capacidad} personas` : ''}\nClic para filtrar por este valor`}
            className="group w-full grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 px-2 py-1 rounded-lg hover:bg-slate-50 text-left">
            <span className="truncate text-slate-700 group-hover:text-slate-900 font-semibold">{etiqueta(g.clave)}</span>
            <span className="h-3.5 bg-slate-100 rounded-r">
              <span className="block h-full rounded-r transition-[width] duration-300" style={{ width: `${Math.max(v / maximo * 100, 0.5)}%`, background: AZUL }} />
            </span>
            <span className="tabular-nums text-right text-slate-800 font-semibold w-32">
              {formatoMedida(v, medida)} <span className="text-slate-400 font-normal">{compartido ? '' : pct(v, total)}</span>
            </span>
          </button>
        );
      })}
      {grupos.length > 12 && (
        <button type="button" onClick={() => setTodos(x => !x)} className="px-2 pt-1 text-teal-800 font-bold hover:underline">
          {todos ? 'Ver solo los primeros 12' : `Ver los ${grupos.length}`}
        </button>
      )}
      {compartido && <p className="px-2 pt-2 text-slate-500">Un recinto compartido por varias unidades cuenta entero en cada una, por eso no se muestran porcentajes.</p>}
    </div>
  );
}

/** Colores que siguen a cada valor (no a su posición): los 7 mayores del conjunto completo, en orden fijo. */
function colorEstable(filas: FilaAnalisis[], d: Dimension, m: Medida): (v: string) => string {
  const orden = agrupar(filas, d, m).slice(0, CATEGORICOS.length).map(g => g.clave);
  return v => { const i = orden.indexOf(v); return i >= 0 ? CATEGORICOS[i] : GRIS_OTROS; };
}

/** Parte de un todo: una barra al 100 % con los 7 mayores y «Otros», con leyenda, valor y porcentaje. */
function Composicion({ grupos, medida, etiqueta, colorDe }: { grupos: Grupo[]; medida: Medida; etiqueta: (v: string) => string; colorDe: (v: string) => string }) {
  const [encima, setEncima] = useState<string | null>(null);
  const principales = grupos.filter(g => colorDe(g.clave) !== GRIS_OTROS).slice(0, CATEGORICOS.length);
  const resto = grupos.filter(g => !principales.includes(g));
  const segmentos = [
    ...principales.map(g => ({ clave: g.clave, nombre: etiqueta(g.clave), valor: valorMedida(g, medida), color: colorDe(g.clave) })),
    ...(resto.length ? [{ clave: '__otros', nombre: `Otros (${resto.length})`, valor: resto.reduce((s, g) => s + valorMedida(g, medida), 0), color: GRIS_OTROS }] : []),
  ].filter(s => s.valor > 0);
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  if (!total) return <p className="text-slate-500">Sin valores para repartir.</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-7 gap-0.5 rounded-md overflow-hidden" role="img" aria-label="Composición">
        {segmentos.map(s => (
          <span key={s.clave} onMouseEnter={() => setEncima(s.clave)} onMouseLeave={() => setEncima(null)}
            title={`${s.nombre}: ${formatoMedida(s.valor, medida)} (${pct(s.valor, total)})`}
            className="h-full transition-opacity" style={{ width: `${s.valor / total * 100}%`, background: s.color, opacity: encima && encima !== s.clave ? 0.35 : 1 }} />
        ))}
      </div>
      <ul className="space-y-1">
        {segmentos.map(s => (
          <li key={s.clave} onMouseEnter={() => setEncima(s.clave)} onMouseLeave={() => setEncima(null)}
            className={`flex items-center gap-2 px-1.5 py-0.5 rounded ${encima === s.clave ? 'bg-slate-50' : ''}`}>
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="flex-1 truncate text-slate-700" title={s.nombre}>{s.nombre}</span>
            <span className="tabular-nums text-slate-800 font-semibold">{formatoMedida(s.valor, medida)}</span>
            <span className="tabular-nums text-slate-500 w-12 text-right">{pct(s.valor, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Cruce de dos dimensiones como tabla de calor (un solo azul, de claro a oscuro). Clic en una celda para filtrar. */
function MatrizCruce({ filas, df, dc, medida, etiqueta, onElegir }: {
  filas: FilaAnalisis[]; df: Dimension; dc: Dimension; medida: Medida; etiqueta: (d: Dimension, v: string) => string;
  onElegir: (vf: string, vc: string, df: Dimension, dc: Dimension) => void;
}) {
  const c = useMemo(() => cruzar(filas, df, dc, medida, 10), [filas, df, dc, medida]);
  const filasVisibles = c.filas.slice(0, 40);
  const maximo = Math.max(...[...c.celdas.values()].map(g => valorMedida(g, medida)), 0) || 1;
  const celda = (v: number) => {
    if (!v) return { background: 'transparent', color: '#94a3b8' };
    const i = Math.min(ESCALA.length - 1, Math.floor(v / maximo * (ESCALA.length - 1)));
    return { background: ESCALA[i], color: i >= 7 ? '#ffffff' : '#0f172a' };
  };
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white px-2 py-1 text-left text-slate-500 font-bold">{DIMENSIONES.find(d => d.id === df)!.nombre} \ {DIMENSIONES.find(d => d.id === dc)!.nombre}</th>
            {c.columnas.map(col => <th key={col} className="px-2 py-1 text-slate-600 font-bold max-w-[7rem] truncate" title={etiqueta(dc, col)}>{etiqueta(dc, col)}</th>)}
            <th className="px-2 py-1 text-slate-800 font-extrabold">Total</th>
          </tr>
        </thead>
        <tbody>
          {filasVisibles.map(vf => (
            <tr key={vf}>
              <th className="sticky left-0 bg-white px-2 py-1 text-left text-slate-700 font-semibold max-w-[14rem] truncate" title={etiqueta(df, vf)}>{etiqueta(df, vf)}</th>
              {c.columnas.map(vc => {
                const g = c.celdas.get(`${vf}\u0000${vc}`);
                const v = g ? valorMedida(g, medida) : 0;
                return (
                  <td key={vc} className="p-0">
                    <button type="button" disabled={!v} onClick={() => onElegir(vf, vc, df, dc)}
                      title={g ? `${etiqueta(df, vf)} · ${etiqueta(dc, vc)}\n${g.recintos} recinto(s) · ${formatoM2(g.util)} útil · ${formatoM2(g.oguc)} OGUC` : ''}
                      className="w-full min-w-[4.5rem] px-2 py-1.5 rounded tabular-nums text-right font-semibold hover:ring-2 hover:ring-slate-900/40 disabled:cursor-default" style={celda(v)}>
                      {v ? formatoMedida(v, medida).replace(/ (m²|recintos|personas|ocupantes)$/, '') : '·'}
                    </button>
                  </td>
                );
              })}
              <td className="px-2 py-1 text-right tabular-nums font-extrabold text-slate-800">{formatoMedida(valorMedida(c.totalFila.get(vf)!, medida), medida)}</td>
            </tr>
          ))}
          <tr>
            <th className="sticky left-0 bg-white px-2 py-1 text-left text-slate-800 font-extrabold">Total</th>
            {c.columnas.map(vc => <td key={vc} className="px-2 py-1 text-right tabular-nums font-extrabold text-slate-800">{c.totalColumna.get(vc) ? formatoMedida(valorMedida(c.totalColumna.get(vc)!, medida), medida).replace(/ (m²|recintos|personas|ocupantes)$/, '') : '·'}</td>)}
            <td />
          </tr>
        </tbody>
      </table>
      {c.filas.length > filasVisibles.length && <p className="pt-2 text-slate-500">Se muestran las primeras {filasVisibles.length} de {c.filas.length} filas: filtre para acotar.</p>}
      <p className="pt-2 text-slate-500">Valores en {MEDIDAS.find(m => m.id === medida)!.corto}. Más oscuro = más {medida === 'recintos' ? 'recintos' : 'superficie'}. Clic en una celda para filtrar por esa combinación.</p>
    </div>
  );
}

/** Lista de los recintos de la consulta, ordenable, con acceso a su ficha. */
function Detalle({ filas, nombreEdificio, onAbrir }: { filas: FilaAnalisis[]; nombreEdificio: (c: string) => string; onAbrir: (edificio: string, id: string) => void }) {
  const [orden, setOrden] = useState<{ campo: 'codigo' | 'util' | 'oguc' | 'capacidad'; asc: boolean }>({ campo: 'codigo', asc: true });
  const [limite, setLimite] = useState(30);
  const ordenadas = useMemo(() => [...filas].sort((a, b) => {
    const r = orden.campo === 'codigo' ? a.codigo.localeCompare(b.codigo, 'es', { numeric: true }) : a[orden.campo] - b[orden.campo];
    return orden.asc ? r : -r;
  }), [filas, orden]);
  const cabecera = (campo: typeof orden.campo, texto: string, derecha = false) => (
    <th className={`px-3 py-2 ${derecha ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => setOrden(o => ({ campo, asc: o.campo === campo ? !o.asc : campo === 'codigo' }))} className="font-bold uppercase tracking-wide hover:text-slate-800">
        {texto}{orden.campo === campo ? (orden.asc ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed">
        <colgroup><col className="w-32" /><col className="w-[18%]" /><col className="w-24" /><col /><col className="w-24" /><col className="w-24" /><col className="w-20" /><col className="w-[18%]" /><col className="w-16" /></colgroup>
        <thead className="text-slate-500 text-[10px] border-b border-slate-100">
          <tr>{cabecera('codigo', 'Código')}<th className="px-3 py-2 text-left font-bold uppercase tracking-wide">Edificio</th><th className="px-3 py-2 text-left font-bold uppercase tracking-wide">Piso</th>
            <th className="px-3 py-2 text-left font-bold uppercase tracking-wide">Tipo</th>{cabecera('util', 'm² útil', true)}{cabecera('oguc', 'm² OGUC', true)}{cabecera('capacidad', 'Capac.', true)}
            <th className="px-3 py-2 text-left font-bold uppercase tracking-wide">Unidad / ocupantes</th><th /></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ordenadas.slice(0, limite).map(f => (
            <tr key={f.id} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 font-mono font-bold text-slate-900 truncate">{f.codigo}</td>
              <td className="px-3 py-1.5 truncate text-slate-600" title={nombreEdificio(f.edificio)}>{nombreEdificio(f.edificio)}</td>
              <td className="px-3 py-1.5 text-slate-600">{f.piso}</td>
              <td className="px-3 py-1.5 truncate text-slate-800" title={f.tipo}>{f.tipo}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{f.util ? f.util.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{f.oguc ? f.oguc.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{f.capacidad || '—'}</td>
              <td className="px-3 py-1.5 truncate text-slate-600" title={[...f.unidades, ...f.ocupantes.map(o => comoTitulo(o.nombre))].join('\n')}>
                {f.ocupantes.length ? comoTitulo(f.ocupantes[0].nombre) + (f.ocupantes.length > 1 ? ` +${f.ocupantes.length - 1}` : '') : f.unidades.join(' / ') || '—'}
              </td>
              <td className="px-3 py-1.5 text-right">
                <button type="button" onClick={() => onAbrir(f.edificio, f.id)} title="Abrir la ficha del recinto" className="p-1 rounded text-teal-800 hover:bg-teal-50"><ExternalLink className="w-3.5 h-3.5" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ordenadas.length > limite && (
        <button type="button" onClick={() => setLimite(l => l + 100)} className="mt-2 text-teal-800 font-bold hover:underline">Mostrar 100 más (quedan {ordenadas.length - limite})</button>
      )}
    </div>
  );
}

