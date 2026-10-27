import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2, Layers, Plus, Pencil, Trash2, History, FileSpreadsheet, FileText, Loader2, AlertTriangle, X, ExternalLink, Copy, DoorOpen,
} from 'lucide-react';
import { getCampusList, obtenerEdificiosDeCampus, etiquetaEdificio } from '../data/campusData';
import { SUPABASE_CONFIGURADO } from '../lib/supabase';
import {
  listarPisos, guardarPiso, eliminarPiso, listarRecintos, guardarRecinto, eliminarRecinto, historialRecinto,
  listarDocumentos, registrarDocumento,
} from '../services/recintos';
import {
  ESTADOS_RECINTO, TIPOS_DOCUMENTO, ESPECIALIDADES, FORMATOS_DOCUMENTO,
  type Piso, type Recinto, type DocumentoEdificio, type CambioRecinto,
} from '../types/recintos';
import { ImportarRecintosModal } from './ImportarRecintosModal';
import { formatoFecha } from '../utils/fechas';

const m2 = (n?: number | null) => (n ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m²` : '—');
const campo = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-400';

type RecintoEditable = Omit<Recinto, 'id'> & { id?: string };
type DocumentoNuevo = Omit<DocumentoEdificio, 'id' | 'vigente' | 'creado_en' | 'creado_por'>;

/** Módulo de control documental: pisos y recintos de cada edificio, y el índice de sus planos (los archivos siguen en Drive). */
export function RecintosPage() {
  const campus = getCampusList();
  const [campusSigla, setCampusSigla] = useState(campus[0]?.sigla || '');
  const edificios = obtenerEdificiosDeCampus(campusSigla);
  const [edificio, setEdificio] = useState('');
  const [vista, setVista] = useState<'recintos' | 'documentos'>('recintos');
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [recintos, setRecintos] = useState<Recinto[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoEdificio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [pisoEditando, setPisoEditando] = useState<(Omit<Piso, 'id'> & { id?: string }) | null>(null);
  const [recintoEditando, setRecintoEditando] = useState<RecintoEditable | null>(null);
  const [historial, setHistorial] = useState<{ recinto: Recinto; cambios: CambioRecinto[] } | null>(null);
  const [documentoNuevo, setDocumentoNuevo] = useState<DocumentoNuevo | null>(null);
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [importando, setImportando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setEdificio(prev => (edificios.includes(prev) ? prev : edificios[0] || '')); }, [campusSigla]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    if (!edificio || !SUPABASE_CONFIGURADO) return;
    setCargando(true);
    setError('');
    try {
      const [p, r, d] = await Promise.all([listarPisos(edificio), listarRecintos(edificio), listarDocumentos(edificio)]);
      setPisos(p); setRecintos(r); setDocumentos(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [edificio]);
  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (fn: () => Promise<unknown>, alTerminar?: () => void) => {
    setGuardando(true);
    setError('');
    try {
      await fn();
      alTerminar?.();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const recintosPorPiso = useMemo(() => {
    const mapa = new Map<string, Recinto[]>();
    recintos.forEach(r => mapa.set(r.piso_id, [...(mapa.get(r.piso_id) || []), r]));
    return mapa;
  }, [recintos]);
  const activos = recintos.filter(r => r.estado !== 'Eliminado');
  const superficieTotal = activos.reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0);
  const documentosVisibles = documentos.filter(d => verAnteriores || d.vigente);
  const porEspecialidad = ESPECIALIDADES.map(e => ({ especialidad: e, lista: documentosVisibles.filter(d => d.especialidad === e) })).filter(g => g.lista.length);

  const nuevoRecinto = (pisoId: string): RecintoEditable => ({
    edificio_codigo: edificio, piso_id: pisoId, codigo: '', nombre: '', uso: '', superficie_m2: null, capacidad: null,
    estado: 'Operativo', unidad_usuaria: '', foto_url: '', observaciones: '', atributos: {}, origen: 'Manual',
  });
  const nuevoDocumento = (base?: DocumentoEdificio): DocumentoNuevo => base
    ? { ...base, version: siguienteVersion(base.version), fecha_documento: null, drive_url: '', reemplaza_a: base.id, observaciones: '' }
    : { edificio_codigo: edificio, piso_id: null, titulo: '', tipo: 'Plano', especialidad: 'Arquitectura', formato: 'PDF', codigo_lamina: '', version: '1', fecha_documento: null, reemplaza_a: null, drive_url: '', proyecto_codigo: '', observaciones: '' };

  if (!SUPABASE_CONFIGURADO) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-900 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>El módulo de recintos y planos aún no está conectado a su base de datos en este ambiente. Avise al administrador del sistema.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-indigo-600" /> Recintos y planos</h2>
          <p className="text-slate-500">Pisos y recintos de cada edificio, con el índice de sus planos vigentes. Los archivos siguen en Drive.</p>
        </div>
        <label className="font-bold text-slate-700">Campus
          <select value={campusSigla} onChange={e => setCampusSigla(e.target.value)} className={`block mt-1 ${campo} min-w-[200px] font-normal`}>
            {campus.map(c => <option key={c.sigla} value={c.sigla}>{c.sigla} — {c.nombre}</option>)}
          </select>
        </label>
        <label className="font-bold text-slate-700">Edificio o zona
          <select value={edificio} onChange={e => setEdificio(e.target.value)} className={`block mt-1 ${campo} min-w-[220px] font-normal`}>
            {edificios.map(e => <option key={e} value={e}>{etiquetaEdificio(e)}</option>)}
          </select>
        </label>
      </div>

      {edificio && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(['recintos', 'documentos'] as const).map(v => (
              <button key={v} type="button" onClick={() => setVista(v)}
                className={`px-3 py-1.5 rounded-lg font-bold border ${vista === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {v === 'recintos' ? `Recintos (${activos.length})` : `Planos y documentos (${documentos.filter(d => d.vigente).length} vigentes)`}
              </button>
            ))}
            <span className="ml-auto text-slate-500">{pisos.length} piso(s) · superficie registrada <strong className="text-slate-800">{m2(superficieTotal)}</strong></span>
            {cargando && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0" /> <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError('')}><X className="w-4 h-4" /></button>
            </div>
          )}

          {vista === 'recintos' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPisoEditando({ edificio_codigo: edificio, codigo: '', nombre: '', orden: (pisos.at(-1)?.orden ?? 0) + 1, observaciones: '' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"><Layers className="w-3.5 h-3.5" /> Agregar piso</button>
                <button type="button" onClick={() => setImportando(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"><FileSpreadsheet className="w-3.5 h-3.5" /> Importar planilla</button>
              </div>
              {!cargando && !pisos.length && (
                <p className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">
                  Este edificio aún no tiene pisos ni recintos. Agréguelos a mano o importe la planilla del edificio.
                </p>
              )}
              {pisos.map(piso => {
                const lista = recintosPorPiso.get(piso.id) || [];
                const sup = lista.filter(r => r.estado !== 'Eliminado').reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0);
                return (
                  <div key={piso.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                      <span className="font-mono font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">{piso.codigo}</span>
                      <span className="font-bold text-slate-800">{piso.nombre}</span>
                      <span className="text-slate-500">· {lista.length} recinto(s) · {m2(sup)}</span>
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => setRecintoEditando(nuevoRecinto(piso.id))} className="flex items-center gap-1 px-2 py-1 text-indigo-700 hover:bg-indigo-50 rounded-md font-bold"><Plus className="w-3.5 h-3.5" /> Recinto</button>
                        <button type="button" title="Editar piso" onClick={() => setPisoEditando(piso)} className="p-1.5 text-slate-500 hover:bg-slate-200 rounded-md"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" title="Eliminar piso (debe estar vacío)" onClick={() => confirm(`¿Eliminar el piso ${piso.codigo}? Solo se puede si no tiene recintos.`) && accion(() => eliminarPiso(piso.id))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {lista.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px]">
                          <thead className="text-slate-500 text-[10px] uppercase">
                            <tr><th className="p-2 text-left">Código</th><th className="p-2 text-left">Nombre</th><th className="p-2 text-left">Uso</th><th className="p-2 text-right">Superficie</th><th className="p-2 text-right">Capacidad</th><th className="p-2 text-left">Estado</th><th className="p-2 text-left">Unidad</th><th className="p-2 w-24"></th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {lista.map(r => (
                              <tr key={r.id} className={r.estado === 'Eliminado' ? 'text-slate-400 line-through' : ''}>
                                <td className="p-2 font-mono font-bold">{r.codigo}</td>
                                <td className="p-2">{r.nombre}{r.foto_url && <a href={r.foto_url} target="_blank" rel="noreferrer" className="ml-1.5 text-sky-700 no-underline" title="Ver foto">📷</a>}</td>
                                <td className="p-2">{r.uso || '—'}</td>
                                <td className="p-2 text-right">{m2(r.superficie_m2)}</td>
                                <td className="p-2 text-right">{r.capacidad ?? '—'}</td>
                                <td className="p-2">{r.estado}</td>
                                <td className="p-2">{r.unidad_usuaria || '—'}</td>
                                <td className="p-2 text-right whitespace-nowrap">
                                  <button type="button" title="Editar" onClick={() => setRecintoEditando(r)} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button type="button" title="Historial de cambios" onClick={async () => { try { setHistorial({ recinto: r, cambios: await historialRecinto(r.id) }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><History className="w-3.5 h-3.5" /></button>
                                  <button type="button" title="Eliminar" onClick={() => confirm(`¿Eliminar el recinto ${r.codigo}? Si dejó de existir por una obra, es mejor cambiar su estado a "Eliminado" para conservar su historia.`) && accion(() => eliminarRecinto(r.id))} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {vista === 'documentos' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setDocumentoNuevo(nuevoDocumento())} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold"><Plus className="w-3.5 h-3.5" /> Registrar plano o documento</button>
                <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={verAnteriores} onChange={e => setVerAnteriores(e.target.checked)} /> Mostrar versiones anteriores</label>
              </div>
              {!cargando && !porEspecialidad.length && (
                <p className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">
                  Sin planos registrados para este edificio. Registre cada lámina con el enlace a su archivo en Drive.
                </p>
              )}
              {porEspecialidad.map(g => (
                <div key={g.especialidad} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <h3 className="px-4 py-2 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-800">{g.especialidad}</h3>
                  <div className="divide-y divide-slate-100">
                    {g.lista.map(d => (
                      <div key={d.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 ${d.vigente ? '' : 'bg-slate-50 text-slate-400'}`}>
                        <FileText className="w-4 h-4 shrink-0 text-slate-400" />
                        {d.codigo_lamina && <span className="font-mono font-bold">{d.codigo_lamina}</span>}
                        <span className="font-semibold">{d.titulo}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">v{d.version}</span>
                        {d.formato && <span className="text-[10px] text-slate-500">{d.formato}</span>}
                        {d.piso_id && <span className="text-[10px] text-slate-500">· piso {pisos.find(p => p.id === d.piso_id)?.codigo}</span>}
                        {d.fecha_documento && <span className="text-[10px] text-slate-500">· {formatoFecha(d.fecha_documento)}</span>}
                        <span className={`text-[10px] font-bold ${d.vigente ? 'text-emerald-700' : 'text-slate-400'}`}>{d.vigente ? 'Vigente' : 'Reemplazado'}</span>
                        <div className="ml-auto flex items-center gap-1">
                          <a href={d.drive_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 text-sky-700 hover:bg-sky-50 rounded-md font-bold"><ExternalLink className="w-3.5 h-3.5" /> Abrir</a>
                          {d.vigente && <button type="button" onClick={() => setDocumentoNuevo(nuevoDocumento(d))} className="flex items-center gap-1 px-2 py-1 text-indigo-700 hover:bg-indigo-50 rounded-md font-bold" title="Registrar una versión nueva de este plano: la actual queda como reemplazada"><Copy className="w-3.5 h-3.5" /> Nueva versión</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {pisoEditando && (
        <Ventana titulo={pisoEditando.id ? `Editar piso ${pisoEditando.codigo}` : 'Agregar piso'} onClose={() => { setPisoEditando(null); setError(''); }} guardando={guardando} error={error}
          onGuardar={() => {
            if (!pisoEditando.codigo.trim() || !pisoEditando.nombre.trim()) return setError('El piso necesita código y nombre.');
            accion(() => guardarPiso({ ...pisoEditando, codigo: pisoEditando.codigo.trim().toUpperCase() }), () => setPisoEditando(null));
          }}>
          <div className="grid grid-cols-3 gap-2">
            <label className="font-bold">Código *<input value={pisoEditando.codigo} onChange={e => setPisoEditando({ ...pisoEditando, codigo: e.target.value })} placeholder="P1, S1…" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold col-span-2">Nombre *<input value={pisoEditando.nombre} onChange={e => setPisoEditando({ ...pisoEditando, nombre: e.target.value })} placeholder="Primer piso" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Orden<input type="number" value={pisoEditando.orden} onChange={e => setPisoEditando({ ...pisoEditando, orden: Number(e.target.value) || 0 })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold col-span-2">Observaciones<input value={pisoEditando.observaciones || ''} onChange={e => setPisoEditando({ ...pisoEditando, observaciones: e.target.value })} className={`mt-1 ${campo} font-normal`} /></label>
          </div>
          <p className="text-slate-500 mt-2">El orden define cómo se listan los pisos, de abajo hacia arriba (subterráneo -1, primer piso 1…).</p>
        </Ventana>
      )}

      {recintoEditando && (
        <Ventana titulo={recintoEditando.id ? `Editar recinto ${recintoEditando.codigo}` : 'Agregar recinto'} onClose={() => { setRecintoEditando(null); setError(''); }} guardando={guardando} error={error}
          onGuardar={() => {
            if (!recintoEditando.codigo.trim() || !recintoEditando.nombre.trim()) return setError('El recinto necesita código y nombre.');
            accion(() => guardarRecinto({ ...recintoEditando, codigo: recintoEditando.codigo.trim().toUpperCase() }), () => setRecintoEditando(null));
          }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="font-bold">Código *<input value={recintoEditando.codigo} onChange={e => setRecintoEditando({ ...recintoEditando, codigo: e.target.value })} placeholder="A102" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold sm:col-span-2">Nombre *<input value={recintoEditando.nombre} onChange={e => setRecintoEditando({ ...recintoEditando, nombre: e.target.value })} placeholder="Sala de clases" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Piso
              <select value={recintoEditando.piso_id} onChange={e => setRecintoEditando({ ...recintoEditando, piso_id: e.target.value })} className={`mt-1 ${campo} font-normal`}>
                {pisos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
              </select>
            </label>
            <label className="font-bold">Uso<input value={recintoEditando.uso || ''} onChange={e => setRecintoEditando({ ...recintoEditando, uso: e.target.value })} placeholder="Docencia" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Estado
              <select value={recintoEditando.estado} onChange={e => setRecintoEditando({ ...recintoEditando, estado: e.target.value as Recinto['estado'] })} className={`mt-1 ${campo} font-normal`}>
                {ESTADOS_RECINTO.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="font-bold">Superficie (m²)<input type="number" min={0} step="0.01" value={recintoEditando.superficie_m2 ?? ''} onChange={e => setRecintoEditando({ ...recintoEditando, superficie_m2: e.target.value === '' ? null : Number(e.target.value) })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Capacidad (personas)<input type="number" min={0} value={recintoEditando.capacidad ?? ''} onChange={e => setRecintoEditando({ ...recintoEditando, capacidad: e.target.value === '' ? null : Number(e.target.value) })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Unidad usuaria<input value={recintoEditando.unidad_usuaria || ''} onChange={e => setRecintoEditando({ ...recintoEditando, unidad_usuaria: e.target.value })} placeholder="Fac. de Ingeniería" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold sm:col-span-3">Foto de referencia (enlace de Drive)<input value={recintoEditando.foto_url || ''} onChange={e => setRecintoEditando({ ...recintoEditando, foto_url: e.target.value.trim() })} placeholder="https://drive.google.com/…" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold sm:col-span-3">Observaciones<textarea rows={2} value={recintoEditando.observaciones || ''} onChange={e => setRecintoEditando({ ...recintoEditando, observaciones: e.target.value })} className={`mt-1 ${campo} font-normal`} /></label>
          </div>
          {Object.keys(recintoEditando.atributos || {}).length > 0 && (
            <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              <p className="font-bold text-slate-700 mb-1">Datos adicionales de la planilla</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {Object.entries(recintoEditando.atributos).map(([k, v]) => <div key={k} className="flex gap-1.5"><dt className="text-slate-500">{k}:</dt><dd>{v}</dd></div>)}
              </dl>
            </div>
          )}
        </Ventana>
      )}

      {documentoNuevo && (
        <Ventana titulo={documentoNuevo.reemplaza_a ? `Nueva versión de ${documentoNuevo.codigo_lamina || documentoNuevo.titulo}` : 'Registrar plano o documento'} onClose={() => { setDocumentoNuevo(null); setError(''); }} guardando={guardando} error={error}
          onGuardar={() => {
            if (!documentoNuevo.titulo.trim()) return setError('El documento necesita un título.');
            if (!/^https:\/\//.test(documentoNuevo.drive_url.trim())) return setError('Pegue el enlace al archivo en Drive (debe empezar con https://).');
            accion(() => registrarDocumento({ ...documentoNuevo, drive_url: documentoNuevo.drive_url.trim() }), () => setDocumentoNuevo(null));
          }}>
          {documentoNuevo.reemplaza_a && <p className="mb-2 text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg p-2">Al guardar, la versión actual queda como reemplazada y esta pasa a ser la vigente.</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="font-bold sm:col-span-2">Título *<input value={documentoNuevo.titulo} onChange={e => setDocumentoNuevo({ ...documentoNuevo, titulo: e.target.value })} placeholder="Planta arquitectura primer piso" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Lámina<input value={documentoNuevo.codigo_lamina || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, codigo_lamina: e.target.value })} placeholder="A-02" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Tipo<select value={documentoNuevo.tipo} onChange={e => setDocumentoNuevo({ ...documentoNuevo, tipo: e.target.value as DocumentoNuevo['tipo'] })} className={`mt-1 ${campo} font-normal`}>{TIPOS_DOCUMENTO.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="font-bold">Especialidad<select value={documentoNuevo.especialidad} onChange={e => setDocumentoNuevo({ ...documentoNuevo, especialidad: e.target.value as DocumentoNuevo['especialidad'] })} className={`mt-1 ${campo} font-normal`}>{ESPECIALIDADES.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="font-bold">Formato<select value={documentoNuevo.formato || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, formato: (e.target.value || null) as DocumentoNuevo['formato'] })} className={`mt-1 ${campo} font-normal`}>{FORMATOS_DOCUMENTO.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="font-bold">Versión<input value={documentoNuevo.version} onChange={e => setDocumentoNuevo({ ...documentoNuevo, version: e.target.value })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Fecha del plano<input type="date" value={documentoNuevo.fecha_documento || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, fecha_documento: e.target.value || null })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Piso<select value={documentoNuevo.piso_id || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, piso_id: e.target.value || null })} className={`mt-1 ${campo} font-normal`}><option value="">Todo el edificio</option>{pisos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}</select></label>
            <label className="font-bold sm:col-span-3">Enlace al archivo en Drive *<input value={documentoNuevo.drive_url} onChange={e => setDocumentoNuevo({ ...documentoNuevo, drive_url: e.target.value })} placeholder="https://drive.google.com/file/d/…" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Proyecto que lo generó<input value={documentoNuevo.proyecto_codigo || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, proyecto_codigo: e.target.value })} placeholder="2026_017" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold sm:col-span-2">Observaciones<input value={documentoNuevo.observaciones || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, observaciones: e.target.value })} className={`mt-1 ${campo} font-normal`} /></label>
          </div>
        </Ventana>
      )}

      {historial && (
        <Ventana titulo={`Historial de ${historial.recinto.codigo} — ${historial.recinto.nombre}`} onClose={() => setHistorial(null)}>
          {!historial.cambios.length ? <p className="text-slate-500">Sin cambios registrados.</p> : (
            <ul className="space-y-2">
              {historial.cambios.map(c => (
                <li key={c.id} className="border border-slate-200 rounded-lg p-2.5">
                  <p className="font-bold text-slate-700">{c.accion} · {formatoFecha(c.fecha, { dateStyle: 'medium' })} · {c.usuario}</p>
                  {c.accion === 'Modificó' && <p className="text-slate-600 mt-0.5">{diferencias(c.antes, c.despues) || 'Sin cambios en los datos visibles.'}</p>}
                </li>
              ))}
            </ul>
          )}
        </Ventana>
      )}

      {importando && (
        <ImportarRecintosModal edificioCodigo={edificio} etiquetaEdificio={etiquetaEdificio(edificio)} onClose={() => setImportando(false)} onImportado={cargar} />
      )}
    </div>
  );
}

/** "2" → "3"; "B" → "C"; cualquier otra cosa se deja para que la escriban. */
function siguienteVersion(v: string): string {
  if (/^\d+$/.test(v)) return String(Number(v) + 1);
  if (/^[A-Ya-y]$/.test(v)) return String.fromCharCode(v.charCodeAt(0) + 1);
  return v;
}

const ETIQUETAS: Partial<Record<keyof Recinto, string>> = {
  codigo: 'código', nombre: 'nombre', uso: 'uso', superficie_m2: 'superficie', capacidad: 'capacidad', estado: 'estado',
  unidad_usuaria: 'unidad', piso_id: 'piso', foto_url: 'foto', observaciones: 'observaciones',
};
function diferencias(antes?: Partial<Recinto> | null, despues?: Partial<Recinto> | null): string {
  if (!antes || !despues) return '';
  return (Object.keys(ETIQUETAS) as (keyof Recinto)[])
    .filter(k => String(antes[k] ?? '') !== String(despues[k] ?? ''))
    .map(k => `${ETIQUETAS[k]}: ${String(antes[k] ?? '—')} → ${String(despues[k] ?? '—')}`)
    .join(' · ');
}

function Ventana({ titulo, children, onClose, onGuardar, guardando, error }: { titulo: string; children: ReactNode; onClose: () => void; onGuardar?: () => void; guardando?: boolean; error?: string }) {
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200 text-xs">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><DoorOpen className="w-4 h-4 text-indigo-600" /> {titulo}</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 text-slate-700">{children}</div>
        {error && <p className="mx-5 mb-2 flex items-start gap-2 text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</p>}
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">{onGuardar ? 'Cancelar' : 'Cerrar'}</button>
          {onGuardar && (
            <button type="button" onClick={onGuardar} disabled={guardando} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
