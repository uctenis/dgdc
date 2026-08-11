import React, { useEffect, useState } from 'react';
import { Activity, History, X, Trophy, Clock, FileText } from 'lucide-react';
import { getHistorialObras } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import type { Proveedor, HistorialObra } from '../types';

interface HistorialObrasModalProps {
  proveedor: Proveedor;
  onClose: () => void;
}

export const HistorialObrasModal: React.FC<HistorialObrasModalProps> = ({ proveedor, onClose }) => {
  const [historial, setHistorial] = useState<HistorialObra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  }, [proveedor.id]);

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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
