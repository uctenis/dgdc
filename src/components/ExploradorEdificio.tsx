import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2, ChevronDown, ChevronRight, DoorOpen, ExternalLink, FileText, Layers, Loader2, Map as IconoMapa, Pencil, Ruler, Search, Users, X,
  AlertTriangle, Clock, FileImage, History, PanelLeftClose, PanelLeftOpen, Download,
} from 'lucide-react';
import type { DocumentoEdificio, Piso, Recinto } from '../types/recintos';
import { colorDeCategoria } from '../utils/geometriaPlano';
import { tipoConfigurado } from '../data/espaciosConfig';
import { alertasRecinto } from '../utils/alertasRecinto';
import { formatoFecha } from '../utils/fechas';
import { comoTitulo } from '../utils/texto';
import { resumenSuperficie, textoVigencia, vigenteEn } from '../utils/vigenciaRecinto';
import { PlanoInteractivo } from './PlanoInteractivo';
import { abrirArchivoDocumento } from '../services/recintos';

// El visor (con el lector de PDF) se carga solo cuando hay una lámina que mostrar.
const VisorPlano = lazy(() => import('./VisorPlano').then(m => ({ default: m.VisorPlano })));

const m2 = (n?: number | null) => (n || n === 0 ? `${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 })} m²` : '—');
const COLOR_ESTADO: Record<string, string> = {
  Operativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'En obra': 'bg-amber-50 text-amber-800 border-amber-200',
  'Fuera de servicio': 'bg-rose-50 text-rose-700 border-rose-200',
  Eliminado: 'bg-slate-100 text-slate-500 border-slate-200',
};
const colorTipo = (r: Recinto) => tipoConfigurado(r.nombre)?.color || colorDeCategoria(r.nombre);
const sinPrefijo = (r: Recinto) => r.codigo.replace(`${r.edificio_codigo}_`, '');

interface Props {
  edificioCodigo: string;
  nombreEdificio: string;
  pisos: Piso[];
  /** Recintos vigentes del edificio (sin los eliminados). */
  recintos: Recinto[];
  documentos: DocumentoEdificio[];
  /** Todos los recintos, también los dados de baja: para mostrar un plano anterior con los que existían entonces. */
  todosLosRecintos?: Recinto[];
  /** Recinto a destacar al entrar (por ejemplo, el que se encontró con el buscador). */
  destacado?: string | null;
  /** Otros edificios del campus, para saltar a ellos desde el árbol. */
  edificiosCampus: { codigo: string; etiqueta: string }[];
  onIrEdificio: (codigo: string) => void;
  onVerFicha: (r: Recinto) => void;
  onEditarRecinto: (r: Recinto) => void;
  onVerDocumentos: () => void;
  onRecargar: () => Promise<void> | void;
  /** Herramientas de dibujo abiertas (va en la dirección de la página, ?vista=plano, para que «atrás» las cierre). */
  editando: boolean;
  /** Abre la lista de personas del edificio (Análisis, tarjeta «Personas»). */
  onVerPersonas?: () => void;
  onEditar: (abrir: boolean) => void;
}

/**
 * Vista general de un edificio: a la izquierda el árbol de pisos y recintos; al centro el plano del piso elegido, con
 * cada recinto coloreado por tipo y rotulado con su código y superficie; a la derecha la ficha resumida del recinto
 * elegido (en el plano o en el árbol) y los planos y documentos vigentes. «Editar contornos» abre las herramientas
 * completas del plano interactivo.
 */
export function ExploradorEdificio({
  edificioCodigo, nombreEdificio, pisos, recintos, documentos, todosLosRecintos, destacado, edificiosCampus, onIrEdificio, onVerFicha, onEditarRecinto, onVerDocumentos, onRecargar, editando, onEditar, onVerPersonas,
}: Props) {
  const pisosOrdenados = useMemo(() => [...pisos].sort((a, b) => a.orden - b.orden), [pisos]);
  // Láminas con copia para el visor: la vigente de cada piso y sus versiones anteriores (la historia del piso).
  const laminas = useMemo(() => documentos.filter(d => d.tipo === 'Plano' && d.archivo_visor)
    .sort((a, b) => Number(b.vigente) - Number(a.vigente) || (b.fecha_documento || '').localeCompare(a.fecha_documento || '')), [documentos]);
  /** Láminas de un piso (la vigente primero); si el edificio tiene un solo piso, también las que no tienen piso. */
  const laminasDe = (pisoId: string, soloVigentes = false) => laminas.filter(d => (!soloVigentes || d.vigente) && (d.piso_id === pisoId || (!d.piso_id && pisos.length === 1)));

  const pisoInicial = () => {
    const delDestacado = recintos.find(r => r.id === destacado)?.piso_id;
    return delDestacado || pisosOrdenados.find(p => laminasDe(p.id, true).length)?.id || pisosOrdenados[0]?.id || '';
  };
  const [pisoId, setPisoId] = useState(pisoInicial);
  const [seleccion, setSeleccion] = useState<string | null>(destacado || null);
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set([pisoInicial()]));
  const [filtro, setFiltro] = useState('');
  const [laminaElegida, setLaminaElegida] = useState('');
  // Árbol de pisos y recintos: abierto en pantallas grandes; en el celular parte cerrado para dejar el plano a la vista.
  const [verArbol, setVerArbol] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);

  // Al cambiar de edificio (o llegar sus datos), vuelve al piso inicial.
  useEffect(() => {
    if (!pisos.some(p => p.id === pisoId)) { const p = pisoInicial(); setPisoId(p); setAbiertos(new Set([p])); }
  }, [edificioCodigo, pisos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!destacado) return;
    const r = recintos.find(x => x.id === destacado);
    if (r) { setPisoId(r.piso_id); setSeleccion(r.id); setAbiertos(a => new Set(a).add(r.piso_id)); }
  }, [destacado, recintos]);

  const piso = pisos.find(p => p.id === pisoId);
  const delPiso = useMemo(() => recintos.filter(r => r.piso_id === pisoId), [recintos, pisoId]);
  const laminasPiso = laminasDe(pisoId);
  const lamina = laminasPiso.find(d => d.id === laminaElegida) || laminasPiso[0];
  // Plano anterior: se muestran los recintos que existían en su fecha (según su alta y baja registradas).
  const todos = todosLosRecintos || recintos;
  const fechaPlano = lamina && !lamina.vigente ? lamina.fecha_documento || null : null;
  const recintosPlano = useMemo(() => (fechaPlano ? todos.filter(r => vigenteEn(r, fechaPlano)) : recintos), [fechaPlano, todos, recintos]);
  const cambiosDesde = useMemo(() => {
    if (!fechaPlano) return null;
    const delP = todos.filter(r => r.piso_id === pisoId);
    return {
      nuevos: delP.filter(r => r.fecha_alta && r.fecha_alta > fechaPlano && r.estado !== 'Eliminado'),
      bajas: delP.filter(r => r.fecha_baja && r.fecha_baja > fechaPlano),
    };
  }, [fechaPlano, todos, pisoId]);
  const sel = seleccion ? todos.find(r => r.id === seleccion) : undefined;
  const cad = documentos.find(d => d.vigente && d.formato === 'DWG' && d.archivo);

  const porPiso = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const mapa = new Map<string, Recinto[]>();
    recintos
      .filter(r => !q || r.codigo.toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q) || (r.unidad_usuaria || '').toLowerCase().includes(q)
        || (r.ocupantes || []).some(o => o.nombre.toLowerCase().includes(q)))
      .forEach(r => mapa.set(r.piso_id, [...(mapa.get(r.piso_id) || []), r]));
    mapa.forEach(l => l.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })));
    return mapa;
  }, [recintos, filtro]);

  const elegirRecinto = (r: Recinto) => { setPisoId(r.piso_id); setSeleccion(r.id); };
  const elegirPiso = (id: string) => {
    setPisoId(id); setSeleccion(null); setLaminaElegida('');
    setAbiertos(a => { const n = new Set(a); if (n.has(id) && id === pisoId) n.delete(id); else n.add(id); return n; });
  };

  // Indicadores del edificio.
  const hoy = resumenSuperficie(recintos);
  const pisosConPlano = pisos.filter(p => laminasDe(p.id, true).length).length;
  const listaPorRevisar = useMemo(() => recintos.filter(r => alertasRecinto(r).length)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })), [recintos]);
  const porRevisar = listaPorRevisar.length;
  const [verPorRevisar, setVerPorRevisar] = useState(false);

  // Documentos: primero los del piso elegido, después los del edificio completo.
  const docs = useMemo(() => documentos.filter(d => d.vigente)
    .sort((a, b) => Number(b.piso_id === pisoId) - Number(a.piso_id === pisoId) || (b.fecha_documento || '').localeCompare(a.fecha_documento || '')),
  [documentos, pisoId]);

  // Resumen del piso por tipo, para cuando no hay recinto elegido.
  const tiposPiso = useMemo(() => {
    const m = new Map<string, { n: number; sup: number; color: string }>();
    delPiso.forEach(r => { const x = m.get(r.nombre) || { n: 0, sup: 0, color: colorTipo(r) }; x.n++; x.sup += Number(r.superficie_m2) || 0; m.set(r.nombre, x); });
    return [...m.entries()].sort((a, b) => b[1].sup - a[1].sup);
  }, [delPiso]);
  const supPiso = resumenSuperficie(delPiso).util;

  if (editando) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onEditar(false)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold">
            <X className="w-3.5 h-3.5" /> Volver a la vista general
          </button>
          <span className="text-slate-500">
            {fechaPlano ? `Contornos del plano anterior del ${formatoFecha(fechaPlano)} (cada versión guarda los suyos).` : 'Herramientas de dibujo: predibujar, ubicar con 1 clic, editar contornos, escala y subida de láminas.'}
          </span>
        </div>
        {fechaPlano && lamina ? (
          <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin text-teal-700" />}>
            <VisorPlano key={lamina.id} documento={lamina} pisos={pisos} recintos={recintosPlano} destacado={seleccion} onEditarRecinto={onEditarRecinto} />
          </Suspense>
        ) : (
          <PlanoInteractivo edificioCodigo={edificioCodigo} pisos={pisos} documentos={documentos} recintos={recintos} destacado={seleccion}
            onEditarRecinto={onEditarRecinto} onRecargar={onRecargar} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Indicadores */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-3 xl:grid-cols-6 sm:overflow-visible">
        <Indicador icono={DoorOpen} titulo="Recintos vigentes" valor={hoy.recintos.toLocaleString('es-CL')} detalle={`${pisos.length} piso(s)`} />
        <Indicador icono={Ruler} titulo="Superficie útil hoy" valor={m2(hoy.util)} detalle={`OGUC ${m2(hoy.oguc)}`} />
        {hoy.porVenir.recintos > 0
          ? <Indicador icono={Clock} titulo="Por venir (en obra)" valor={m2(hoy.porVenir.util)} detalle={`${hoy.porVenir.recintos} recinto(s)${hoy.porVenir.desde ? ` · ${textoVigencia({ fecha_alta: hoy.porVenir.desde, fecha_baja: null })}` : ''}`} tono="aviso" />
          : <Indicador icono={Building2} titulo="Arrendada u otra" valor={m2(hoy.noPropia.util)} detalle={`${hoy.noPropia.recintos} recinto(s) no propios`} />}
        <Indicador icono={IconoMapa} titulo="Pisos con plano" valor={`${pisosConPlano} de ${pisos.length}`} detalle="láminas en el visor" tono={pisosConPlano < pisos.length ? 'aviso' : 'ok'} />
        {hoy.porVenir.recintos > 0 && <Indicador icono={Building2} titulo="Arrendada u otra" valor={m2(hoy.noPropia.util)} detalle={`${hoy.noPropia.recintos} recinto(s) no propios`} />}
        {!hoy.porVenir.recintos && <Indicador icono={Users} titulo="Ocupantes" valor={recintos.reduce((s, r) => s + (r.ocupantes?.length || 0), 0).toLocaleString('es-CL')} detalle={onVerPersonas ? 'clic para ver quiénes' : 'personas o unidades'} onClick={onVerPersonas} />}
        <Indicador icono={AlertTriangle} titulo="Por revisar" valor={porRevisar.toLocaleString('es-CL')} detalle={porRevisar ? (verPorRevisar ? 'clic para ocultar la lista' : 'clic para ver cuáles') : 'sin pendientes'} tono={porRevisar ? 'aviso' : 'ok'}
          onClick={porRevisar ? () => setVerPorRevisar(v => !v) : undefined} activo={verPorRevisar} />
      </div>

      {/* Lista de lo que hay que revisar: cada recinto lleva su motivo; al elegirlo se marca en el árbol y en el plano. */}
      {verPorRevisar && porRevisar > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="font-extrabold text-amber-900 flex items-center gap-1.5 mr-auto"><AlertTriangle className="w-4 h-4" /> {porRevisar} recinto(s) por revisar</p>
            <button type="button" onClick={() => setVerPorRevisar(false)} className="text-amber-700 hover:text-amber-900" title="Cerrar"><X className="w-4 h-4" /></button>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {listaPorRevisar.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => elegirRecinto(r)}
                  className={`w-full text-left bg-white border rounded-xl px-3 py-2 hover:border-amber-400 ${r.id === seleccion ? 'border-amber-500 ring-2 ring-amber-300' : 'border-amber-200'}`}>
                  <span className="font-mono font-bold text-slate-900">{sinPrefijo(r)}</span>
                  <span className="text-slate-600"> · {comoTitulo(r.nombre)}</span>
                  <span className="text-slate-400"> · {pisos.find(p => p.id === r.piso_id)?.nombre || ''}</span>
                  {alertasRecinto(r).map(a => <span key={a} className="block text-amber-800">• {a}</span>)}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-amber-800">Al elegir uno se marca en el plano y su ficha muestra el detalle; corríjalo con «Editar datos».</p>
        </div>
      )}

      <div className={`grid gap-3 ${verArbol ? 'lg:grid-cols-[240px_minmax(0,1fr)]' : ''} ${sel ? (verArbol ? 'xl:grid-cols-[240px_minmax(0,1fr)_300px]' : 'xl:grid-cols-[minmax(0,1fr)_300px]') : ''}`}>
        {/* Árbol de pisos y recintos */}
        <aside className={`${verArbol ? 'flex' : 'hidden'} bg-white border border-slate-200 rounded-2xl shadow-sm flex-col min-h-0 max-h-[60vh] lg:max-h-[calc(100vh-150px)]`}>
          <div className="p-3 border-b border-slate-100 space-y-2">
            <p className="font-extrabold text-slate-800">Estructura del edificio</p>
            <label className="flex items-center gap-1.5 px-2 py-1.5 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-teal-400">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar recinto, unidad o persona…" className="flex-1 min-w-0 outline-none" />
              {filtro && <button type="button" onClick={() => setFiltro('')}><X className="w-3.5 h-3.5 text-slate-400" /></button>}
            </label>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 text-[12px]">
            <p className="flex items-center gap-1.5 px-2 py-1 font-bold text-slate-800"><Building2 className="w-4 h-4 text-teal-700" /> {edificioCodigo} · {nombreEdificio || 'Sin nombre'}</p>
            {pisosOrdenados.map(p => {
              const lista = porPiso.get(p.id) || [];
              if (filtro && !lista.length) return null;
              const abierto = abiertos.has(p.id) || !!filtro;
              const conPlano = laminasDe(p.id).length > 0;
              return (
                <div key={p.id} className="ml-2">
                  <button type="button" onClick={() => elegirPiso(p.id)}
                    className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left ${p.id === pisoId ? 'bg-teal-50 text-teal-900 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}>
                    {abierto ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 truncate">{p.nombre || p.codigo}</span>
                    {conPlano && <span title="Tiene plano en el visor"><FileImage className="w-3.5 h-3.5 text-teal-600" /></span>}
                    <span className="text-[10px] text-slate-400 tabular-nums">{lista.length}</span>
                  </button>
                  {abierto && (
                    <ul className="ml-5 border-l border-slate-100">
                      {lista.map(r => (
                        <li key={r.id}>
                          <button type="button" onClick={() => elegirRecinto(r)}
                            className={`w-full flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-md text-left ${r.id === seleccion ? 'bg-amber-100 text-slate-900' : 'hover:bg-slate-50 text-slate-600'}`}>
                            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorTipo(r) }} />
                            <span className="font-mono font-bold text-[11px] shrink-0">{sinPrefijo(r)}</span>
                            <span className="truncate">{comoTitulo(r.nombre)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {!pisos.length && <p className="px-2 py-3 text-slate-400">Este edificio aún no tiene pisos.</p>}
            {edificiosCampus.length > 1 && !filtro && (
              <div className="mt-3 pt-2 border-t border-slate-100">
                <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Otros edificios del campus</p>
                {edificiosCampus.filter(e => e.codigo !== edificioCodigo).map(e => (
                  <button key={e.codigo} type="button" onClick={() => onIrEdificio(e.codigo)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left text-slate-600 hover:bg-slate-50">
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" /><Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{e.etiqueta}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Plano del piso */}
        <section className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
            <button type="button" onClick={() => setVerArbol(v => !v)} title={verArbol ? 'Ocultar la estructura del edificio y ampliar el plano' : 'Ver la estructura del edificio (pisos y recintos)'}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold ${verArbol ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {verArbol ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />} <span className="hidden sm:inline">Estructura</span>
            </button>
            <span className="font-extrabold text-slate-800">{piso ? piso.nombre || piso.codigo : 'Sin piso'}</span>
            <span className="text-slate-500">{delPiso.length} recinto(s) · útil <strong className="text-slate-700">{m2(Math.round(supPiso * 100) / 100)}</strong></span>
            {pisosOrdenados.length > 1 && (
              <select value={pisoId} onChange={e => elegirPiso(e.target.value)} className="px-2 py-1 border border-slate-300 rounded-lg">
                {pisosOrdenados.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
              </select>
            )}
            {laminasPiso.length > 1 && (
              <label className="flex items-center gap-1 text-slate-600" title="Versiones del plano de este piso: la vigente y las anteriores">
                <History className="w-3.5 h-3.5" />
                <select value={lamina?.id} onChange={e => { setLaminaElegida(e.target.value); setSeleccion(null); }}
                  className={`px-2 py-1 border rounded-lg ${fechaPlano ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold' : 'border-slate-300'}`}>
                  {laminasPiso.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.vigente ? 'Vigente' : 'Anterior'}{d.fecha_documento ? ` · ${formatoFecha(d.fecha_documento)}` : ''}{d.codigo_lamina ? ` · ${d.codigo_lamina}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {lamina?.archivo_visor && (
                <button type="button" onClick={() => void abrirArchivoDocumento(lamina).catch(() => {})} title="Abrir el PDF de esta lámina"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50">
                  <FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Ver </span>PDF
                </button>
              )}
              {cad && (
                <button type="button" onClick={() => void abrirArchivoDocumento(cad, true).catch(() => {})} title="Descargar el CAD (DWG) vigente del edificio"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 font-bold text-emerald-800 hover:bg-emerald-50">
                  <Download className="w-3.5 h-3.5" /> DWG
                </button>
              )}
              <button type="button" onClick={() => onEditar(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 font-bold text-amber-800 hover:bg-amber-50">
                <Pencil className="w-3.5 h-3.5" /> {lamina ? 'Editar contornos' : 'Subir o vincular lámina'}
              </button>
            </div>
          </div>

          {fechaPlano && cambiosDesde && (
            <div className="flex flex-wrap items-start gap-x-4 gap-y-1 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 text-amber-900">
              <p className="basis-full font-bold flex items-center gap-1.5"><History className="w-4 h-4" /> Plano anterior, del {formatoFecha(fechaPlano)}</p>
              <p className="basis-full text-amber-800">
                Se muestran los recintos que existían en esa fecha según su alta y baja registradas. Los contornos son propios de esta versión: si no
                aparecen, use «Editar contornos» para predibujarlos.
              </p>
              {cambiosDesde.nuevos.length > 0 && <p><strong>Nuevos desde entonces:</strong> {cambiosDesde.nuevos.map(sinPrefijo).join(', ')}</p>}
              {cambiosDesde.bajas.length > 0 && <p><strong>Dados de baja desde entonces:</strong> {cambiosDesde.bajas.map(sinPrefijo).join(', ')}</p>}
              <button type="button" onClick={() => setLaminaElegida('')} className="ml-auto font-bold underline">Volver al plano vigente</button>
            </div>
          )}

          {lamina ? (
            <Suspense fallback={<div className="h-[60vh] grid place-items-center bg-white border border-slate-200 rounded-2xl"><Loader2 className="w-6 h-6 animate-spin text-teal-700" /></div>}>
              <VisorPlano key={lamina.id} documento={lamina} pisos={pisos} recintos={recintosPlano} destacado={seleccion} modo="consulta"
                onSeleccionar={setSeleccion} onEditarRecinto={onEditarRecinto} />
            </Suspense>
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-4 space-y-3">
              <p className="text-slate-500">
                Este piso aún no tiene su lámina en el visor. Use <strong>Subir o vincular lámina</strong> para cargar el PDF; mientras tanto, estos son sus recintos:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                {delPiso.map(r => (
                  <button key={r.id} type="button" onClick={() => setSeleccion(r.id)}
                    className={`text-left rounded-xl border p-2 ${r.id === seleccion ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-teal-400'}`}
                    style={{ borderLeft: `4px solid ${colorTipo(r)}` }}>
                    <span className="block font-mono font-bold text-[11px]">{sinPrefijo(r)}</span>
                    <span className="block truncate text-slate-700">{comoTitulo(r.nombre)}</span>
                    <span className="block text-slate-500 tabular-nums">{m2(r.superficie_m2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Ficha del recinto elegido: a la derecha del plano en pantallas anchas, debajo en las demás. */}
        {sel && (
        <aside className={`content-start ${verArbol ? 'lg:col-span-2 xl:col-span-1' : ''}`}>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 space-y-2.5 xl:sticky xl:top-20">
              <>
                <div className="flex items-start gap-2">
                  {sel.foto_url
                    ? <img src={sel.foto_url} alt="" className="w-20 h-16 object-cover rounded-lg border border-slate-200" />
                    : <span className="w-20 h-16 rounded-lg grid place-items-center shrink-0" style={{ background: `${colorTipo(sel)}33` }}><DoorOpen className="w-6 h-6 text-slate-500" /></span>}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-extrabold text-lg text-slate-900 leading-tight">{sinPrefijo(sel)}</p>
                    <p className="font-semibold text-slate-700">{comoTitulo(sel.nombre)}</p>
                    <p className="text-slate-500">{edificioCodigo} · {pisos.find(p => p.id === sel.piso_id)?.nombre}</p>
                  </div>
                  <button type="button" onClick={() => setSeleccion(null)} className="text-slate-400 hover:text-slate-700" title="Cerrar"><X className="w-4 h-4" /></button>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2">
                  <Dato nombre="Código" valor={<span className="font-mono">{sel.codigo}</span>} />
                  <Dato nombre="Superficie útil" valor={<strong>{m2(sel.superficie_m2)}</strong>} />
                  <Dato nombre="Superficie OGUC" valor={m2(sel.superficie_oguc_m2)} />
                  <Dato nombre="Uso" valor={sel.uso || '—'} />
                  {sel.capacidad != null && <Dato nombre="Capacidad" valor={`${sel.capacidad} personas`} />}
                  <Dato nombre="Estado" valor={<span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${COLOR_ESTADO[sel.estado] || COLOR_ESTADO.Eliminado}`}>{sel.estado}</span>} />
                  <Dato nombre="Unidad" valor={sel.unidad_usuaria || '—'} />
                  {sel.tenencia && sel.tenencia !== 'Propia' && <Dato nombre="Tenencia" valor={sel.tenencia} />}
                  {sel.fecha_alta && <Dato nombre="Opera desde" valor={`${formatoFecha(sel.fecha_alta)}${sel.motivo_alta ? ` · ${sel.motivo_alta}` : ''}`} />}
                  {sel.fecha_baja && <Dato nombre="De baja desde" valor={`${formatoFecha(sel.fecha_baja)}${sel.motivo_baja ? ` · ${sel.motivo_baja}` : ''}`} />}
                  {!!sel.ocupantes?.length && (
                    <Dato nombre={`Ocupantes (${sel.ocupantes.length})`} valor={
                      <span className="space-y-0.5 block">
                        {sel.ocupantes.slice(0, 4).map((o, i) => <span key={i} className="block">{comoTitulo(o.nombre)}{o.cargo && <span className="text-slate-500"> · {o.cargo}</span>}</span>)}
                        {sel.ocupantes.length > 4 && <span className="text-slate-500">y {sel.ocupantes.length - 4} más</span>}
                      </span>
                    } />
                  )}
                  {sel.modificado_en && <Dato nombre="Actualizado" valor={<span>{formatoFecha(sel.modificado_en)}{sel.modificado_por && <span className="block text-slate-500">{sel.modificado_por}</span>}</span>} />}
                </dl>
                {alertasRecinto(sel).length > 0 && (
                  <ul className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900 text-[11px] space-y-0.5">
                    {alertasRecinto(sel).map(a => <li key={a} className="flex gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{a}</li>)}
                  </ul>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => onVerFicha(sel)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 font-bold text-white">
                    <FileText className="w-3.5 h-3.5" /> Ficha completa
                  </button>
                  <button type="button" onClick={() => onEditarRecinto(sel)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50">
                    <Pencil className="w-3.5 h-3.5" /> Editar datos
                  </button>
                </div>
              </>
          </div>
        </aside>
        )}
      </div>

      {/* Bajo el plano: resumen del piso por tipo y los planos y documentos del edificio. */}
      <div className="grid gap-3 md:grid-cols-2">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 space-y-2.5">
              <>
                <p className="font-extrabold text-slate-800">Resumen del piso{piso ? ` · ${piso.nombre || piso.codigo}` : ''}</p>
                <p className="text-slate-500">Haga clic en un recinto del plano o del árbol para ver sus datos.</p>
                <ul className="space-y-1">
                  {tiposPiso.slice(0, 8).map(([tipo, x]) => (
                    <li key={tipo} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: x.color }} />
                      <span className="flex-1 truncate text-slate-700">{comoTitulo(tipo)} <span className="text-slate-400">({x.n})</span></span>
                      <span className="tabular-nums text-slate-600">{m2(Math.round(x.sup * 100) / 100)}</span>
                    </li>
                  ))}
                  {tiposPiso.length > 8 && <li className="text-slate-400">y {tiposPiso.length - 8} tipo(s) más</li>}
                </ul>
              </>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-extrabold text-slate-800">Planos y documentos</p>
              <button type="button" onClick={onVerDocumentos} className="font-bold text-teal-700 hover:underline">Ver todos</button>
            </div>
            {!docs.length && <p className="text-slate-400">Sin documentos vigentes registrados.</p>}
            <ul className="divide-y divide-slate-100">
              {docs.slice(0, 6).map(d => (
                <li key={d.id} className="flex items-center gap-2 py-1.5">
                  <FileText className={`w-4 h-4 shrink-0 ${d.tipo === 'Plano' ? 'text-rose-500' : 'text-teal-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-semibold text-slate-700" title={d.titulo}>{d.codigo_lamina ? `${d.codigo_lamina} · ` : ''}{d.titulo}</p>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      v{d.version}{d.fecha_documento && <><Clock className="w-2.5 h-2.5" />{formatoFecha(d.fecha_documento)}</>}{d.formato && ` · ${d.formato}`}
                      {d.piso_id === pisoId && <span className="px-1.5 rounded-full bg-teal-50 text-teal-700 font-bold">este piso</span>}
                    </p>
                  </div>
                  {d.drive_url && <a href={d.drive_url} target="_blank" rel="noreferrer" title="Abrir en Drive" className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50"><ExternalLink className="w-3.5 h-3.5" /></a>}
                </li>
              ))}
            </ul>
          </div>
      </div>
    </div>
  );
}

function Indicador({ icono: Icono, titulo, valor, detalle, tono, onClick, activo }: {
  icono: typeof Building2; titulo: string; valor: string; detalle: string; tono?: 'ok' | 'aviso'; onClick?: () => void; activo?: boolean;
}) {
  const Caja = onClick ? 'button' : 'div';
  return (
    <Caja {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`min-w-[150px] sm:min-w-0 bg-white border rounded-2xl shadow-sm p-2.5 flex items-center gap-2.5 text-left ${onClick ? 'cursor-pointer hover:border-amber-400 hover:shadow-md transition' : ''} ${activo ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200'}`}>
      <span className={`w-8 h-8 rounded-xl grid place-items-center shrink-0 ${tono === 'aviso' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}><Icono className="w-5 h-5" /></span>
      <div className="min-w-0">
        <p className="text-slate-500 truncate">{titulo}</p>
        <p className="text-lg font-extrabold text-slate-900 leading-tight tabular-nums truncate">{valor}</p>
        <p className="text-[10px] text-slate-400 truncate">{detalle}</p>
      </div>
    </Caja>
  );
}

function Dato({ nombre, valor }: { nombre: string; valor: ReactNode }) {
  return (<><dt className="text-slate-400">{nombre}</dt><dd className="text-slate-800 min-w-0">{valor}</dd></>);
}
