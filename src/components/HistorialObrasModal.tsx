import React, { useEffect, useState } from 'react';
import { Activity, History, X, Trophy, Clock, FileText, Star, ShieldAlert, Edit3, Trash2, Loader2, ClipboardList } from 'lucide-react';
import {
  getHistorialObras,
  getEvaluacionesDesempeno,
  calcularPromedioDesempeno,
  calcularPromediosPorCriterio,
  updateEvaluacionDesempeno,
  deleteEvaluacionDesempeno,
} from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { useAuth } from '../context/AuthContext';
import type { Proveedor, HistorialObra, EvaluacionDesempeno, CriterioDesempeno } from '../types';

const ETIQUETA_CRITERIO: Record<CriterioDesempeno['id'], string> = {
  calidad: 'Calidad de la obra',
  plazo: 'Cumplimiento de plazo',
  seguridad: 'Seguridad en obra',
  garantias: 'Garantías y post-venta',
  comunicacion: 'Comunicación',
};

const ORDEN_CRITERIOS: CriterioDesempeno['id'][] = ['calidad', 'plazo', 'seguridad', 'garantias', 'comunicacion'];

interface HistorialObrasModalProps {
  proveedor: Proveedor;
  onClose: () => void;
}

export const HistorialObrasModal: React.FC<HistorialObrasModalProps> = ({ proveedor, onClose }) => {
  const { isAdmin } = useAuth();
  const [historial, setHistorial] = useState<HistorialObra[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<EvaluacionDesempeno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicionPuntajes, setEdicionPuntajes] = useState<Record<CriterioDesempeno['id'], number>>({
    calidad: 4, plazo: 4, seguridad: 4, garantias: 4, comunicacion: 4,
  });
  const [edicionObservaciones, setEdicionObservaciones] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const recargarEvaluaciones = () => {
    getEvaluacionesDesempeno(proveedor.id)
      .then(setEvaluaciones)
      .catch(errorCarga => console.error('Error cargando evaluaciones de desempeño:', errorCarga));
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    getHistorialObras(proveedor.id)
      .then(setHistorial)
      .catch(errorCarga => {
        console.error('Error cargando historial consolidado:', errorCarga);
        setError('No fue posible consultar el historial. Revise los permisos de lectura de licitaciones y vuelva a intentar.');
      })
      .finally(() => setLoading(false));
    recargarEvaluaciones();
  }, [proveedor.id]);

  const promedioDesempeno = calcularPromedioDesempeno(evaluaciones);
  const promediosPorCriterio = calcularPromediosPorCriterio(evaluaciones);
  const bajoUmbral = promedioDesempeno !== null && promedioDesempeno < 3;

  const iniciarEdicion = (ev: EvaluacionDesempeno) => {
    const puntajesEv: Record<CriterioDesempeno['id'], number> = {
      calidad: 4, plazo: 4, seguridad: 4, garantias: 4, comunicacion: 4,
    };
    ev.criterios.forEach(c => { puntajesEv[c.id] = c.puntaje; });
    setEdicionPuntajes(puntajesEv);
    setEdicionObservaciones(ev.observaciones || '');
    setEditandoId(ev.id);
  };

  const cancelarEdicion = () => setEditandoId(null);

  const guardarEdicion = async (ev: EvaluacionDesempeno) => {
    setGuardandoEdicion(true);
    try {
      const criterios: CriterioDesempeno[] = ev.criterios.map(c => ({ ...c, puntaje: edicionPuntajes[c.id] }));
      const puntajeFinal = Math.round(criterios.reduce((sum, c) => sum + c.puntaje * c.ponderacion, 0) * 10) / 10;
      await updateEvaluacionDesempeno(proveedor.id, ev.id, {
        criterios,
        puntajeFinal,
        observaciones: edicionObservaciones.trim() || undefined,
      });
      setEditandoId(null);
      recargarEvaluaciones();
    } catch (errorGuardar) {
      console.error('Error editando evaluación de desempeño:', errorGuardar);
      alert('No se pudo guardar la edición. Intente nuevamente.');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const eliminarEvaluacion = async (ev: EvaluacionDesempeno) => {
    if (!confirm(`¿Eliminar la evaluación de desempeño del proyecto "${ev.nombreProyecto}"? Esta acción no se puede deshacer.`)) return;
    setEliminandoId(ev.id);
    try {
      await deleteEvaluacionDesempeno(proveedor.id, ev.id);
      recargarEvaluaciones();
    } catch (errorEliminar) {
      console.error('Error eliminando evaluación de desempeño:', errorEliminar);
      alert('No se pudo eliminar la evaluación. Intente nuevamente.');
    } finally {
      setEliminandoId(null);
    }
  };

  const totalAdjudicado = historial
    .filter(h => h.resultado === 'Adjudicado')
    .reduce((sum, h) => sum + h.montoTotal, 0);

  const totalObras = historial.filter(h => h.resultado === 'Adjudicado').length;
  const totalActivos = historial.filter(h => h.activo).length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
              RUT: {proveedor.rut}
            </span>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mt-1">
              <History className="w-5 h-5 text-sky-600" />
              Historial de Participaciones — {proveedor.razonSocial}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 bg-slate-50 border-b border-slate-100">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <span className="text-[10px] font-semibold text-slate-400 block uppercase">Participaciones</span>
            <span className="text-xl font-bold text-slate-800">{historial.length}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-200">
            <span className="text-[10px] font-semibold text-emerald-600 block uppercase">Obras Adjudicadas</span>
            <span className="text-xl font-bold text-emerald-700">{totalObras}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-sky-200">
            <span className="text-[10px] font-semibold text-sky-600 block uppercase">Monto Total Adjudicado</span>
            <span className="text-sm font-extrabold text-sky-800">{formatoMonedaCLP(totalAdjudicado)}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200">
            <span className="text-[10px] font-semibold text-amber-700 block uppercase">Actualmente activos</span>
            <span className="text-xl font-bold text-amber-800">{totalActivos}</span>
          </div>
        </div>

        {/* Scorecard de Desempeño (Fase D — evaluación post-ejecución) */}
        <div className="px-6 pt-5">
          <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
            promedioDesempeno === null ? 'bg-slate-50 border-slate-200' :
            bajoUmbral ? 'bg-rose-50 border-rose-200' :
            promedioDesempeno < 4 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
          }`}>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" /> Desempeño Post-Ejecución
              </span>
              <p className="text-xs text-slate-600 mt-0.5">
                {evaluaciones.length === 0
                  ? 'Sin evaluaciones registradas aún. Se generan al aprobar la Recepción Conforme de una obra.'
                  : `Promedio de ${evaluaciones.length} evaluación(es) registrada(s).`}
              </p>
              {bajoUmbral && (
                <p className="text-[10px] text-rose-700 font-bold flex items-center gap-1 mt-1">
                  <ShieldAlert className="w-3 h-3" /> Bajo el umbral recomendado — revisar antes de próximas invitaciones.
                </p>
              )}
            </div>
            {promedioDesempeno !== null && (
              <span className={`text-2xl font-black shrink-0 ${bajoUmbral ? 'text-rose-700' : promedioDesempeno < 4 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {promedioDesempeno}<span className="text-sm text-slate-400">/5</span>
              </span>
            )}
          </div>

          {promediosPorCriterio && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 bg-white border border-slate-200 rounded-xl p-4">
              {ORDEN_CRITERIOS.map(id => {
                const valor = promediosPorCriterio[id] ?? 0;
                return (
                  <div key={id} className="flex items-center gap-2 text-[11px]">
                    <span className="w-32 shrink-0 font-semibold text-slate-600">{ETIQUETA_CRITERIO[id]}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${valor >= 4 ? 'bg-emerald-500' : valor >= 3 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${(valor / 5) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-bold text-slate-700">{valor}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {evaluaciones.length > 0 && (
            <div className="mb-6 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase">
                <ClipboardList className="w-4 h-4 text-purple-600" /> Evaluaciones de Desempeño Registradas
              </h4>
              {evaluaciones.map(ev => {
                const enEdicion = editandoId === ev.id;
                return (
                  <div key={ev.id} className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/40 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{ev.nombreProyecto}</p>
                        <p className="text-[10px] text-slate-500">
                          {ev.codigoProyecto ? `${ev.codigoProyecto} · ` : ''}{ev.fecha} · Evaluado por {ev.evaluadorNombre}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-black px-2 py-0.5 rounded ${
                          ev.puntajeFinal >= 4 ? 'text-emerald-700 bg-emerald-100' : ev.puntajeFinal >= 3 ? 'text-amber-700 bg-amber-100' : 'text-rose-700 bg-rose-100'
                        }`}>
                          {ev.puntajeFinal}/5
                        </span>
                        {isAdmin && !enEdicion && (
                          <>
                            <button onClick={() => iniciarEdicion(ev)} className="p-1 text-slate-400 hover:text-sky-600 hover:bg-white rounded transition" title="Editar evaluación">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => eliminarEvaluacion(ev)}
                              disabled={eliminandoId === ev.id}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded transition disabled:opacity-50"
                              title="Eliminar evaluación"
                            >
                              {eliminandoId === ev.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {enEdicion ? (
                      <div className="space-y-2.5 pt-2 border-t border-purple-200">
                        {ev.criterios.map(c => (
                          <div key={c.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-semibold text-slate-600">{ETIQUETA_CRITERIO[c.id]}</span>
                              <span className="text-[9px] text-slate-400">Ponderación {Math.round(c.ponderacion * 100)}%</span>
                            </div>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(valor => (
                                <button
                                  key={valor}
                                  type="button"
                                  onClick={() => setEdicionPuntajes(prev => ({ ...prev, [c.id]: valor }))}
                                  className={`flex-1 py-1.5 rounded border text-[10px] font-bold flex items-center justify-center transition ${
                                    edicionPuntajes[c.id] >= valor
                                      ? 'bg-amber-400 border-amber-500 text-white'
                                      : 'bg-white border-slate-200 text-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <Star className="w-3 h-3" fill={edicionPuntajes[c.id] >= valor ? 'currentColor' : 'none'} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <textarea
                          value={edicionObservaciones}
                          onChange={e => setEdicionObservaciones(e.target.value)}
                          rows={2}
                          placeholder="Observaciones..."
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-purple-400"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={cancelarEdicion} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-[10px] font-bold">Cancelar</button>
                          <button
                            onClick={() => guardarEdicion(ev)}
                            disabled={guardandoEdicion}
                            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5"
                          >
                            {guardandoEdicion && <Loader2 className="w-3 h-3 animate-spin" />} Guardar cambios
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                          {ev.criterios.map(c => (
                            <span key={c.id} className="text-[10px] text-slate-600">
                              {ETIQUETA_CRITERIO[c.id]}: <strong className="text-slate-800">{c.puntaje}/5</strong>
                            </span>
                          ))}
                        </div>
                        {ev.observaciones && (
                          <p className="text-[11px] text-slate-600 italic border-t border-purple-200 pt-1.5">"{ev.observaciones}"</p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-slate-400 text-center py-8">Cargando historial...</p>
          ) : error ? (
            <div className="text-center py-10 bg-red-50 border border-red-200 rounded-xl px-4">
              <p className="text-sm text-red-800 font-bold">No se pudo cargar el historial</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          ) : historial.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 font-medium">Sin invitaciones ni participaciones registradas.</p>
              <p className="text-xs text-slate-400 mt-1">El historial se actualiza automáticamente al invitar, recibir una oferta o adjudicar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historial.map(obra => {
                const isGanador = obra.resultado === 'Adjudicado';
                const isActivo = Boolean(obra.activo);
                return (
                  <div
                    key={obra.id}
                    className={`p-4 rounded-xl border transition ${
                      isGanador
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : isActivo ? 'bg-sky-50/60 border-sky-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                            CP: {obra.codigoCP}
                          </span>
                          {obra.codigoOP && (
                            <span className="text-[10px] font-medium text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">
                              OP: {obra.codigoOP}
                            </span>
                          )}
                          <span className="text-xs text-slate-400">{obra.fecha}</span>
                          {isActivo && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                              <Activity className="w-3 h-3" /> Actualmente activo
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 leading-snug">{obra.nombreProyecto.toLocaleUpperCase('es-CL')}</h4>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase shrink-0 ${
                          isGanador
                            ? 'bg-emerald-600 text-white'
                            : obra.resultado === 'Participando' ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isGanador ? <Trophy className="w-3 h-3 text-amber-300" /> : <Clock className="w-3 h-3" />}
                        {obra.resultado}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-200/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Monto oferta</span>
                        <span className="font-bold text-slate-700">{obra.montoTotal > 0 ? formatoMonedaCLP(obra.montoTotal) : 'Sin oferta'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Plazo oferta</span>
                        <span className="font-semibold text-slate-700">{obra.plazoDias > 0 ? `${obra.plazoDias} días` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Estado actual</span>
                        <span className={`font-semibold ${isActivo ? 'text-amber-700' : 'text-slate-600'}`}>{obra.estadoActual || 'Registro histórico'}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-slate-500">
                      {obra.codigoProyecto && <span>Cód. proyecto: <strong>{obra.codigoProyecto}</strong></span>}
                      {obra.codigoOT && <span>OT: <strong>{obra.codigoOT}</strong></span>}
                      {obra.puntajeObtenido !== undefined && <span>Puntaje: <strong>{obra.puntajeObtenido} pts</strong></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
