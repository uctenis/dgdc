import React, { useEffect, useState } from 'react';
import { History, X, Trophy, Clock, FileText } from 'lucide-react';
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

  useEffect(() => {
    getHistorialObras(proveedor.id).then(data => {
      setHistorial(data);
      setLoading(false);
    });
  }, [proveedor.id]);

  const totalAdjudicado = historial
    .filter(h => h.resultado === 'Adjudicado')
    .reduce((sum, h) => sum + h.montoTotal, 0);

  const totalObras = historial.filter(h => h.resultado === 'Adjudicado').length;

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
              Historial de Obras — {proveedor.razonSocial}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 border-b border-slate-100">
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-xs text-slate-400 text-center py-8">Cargando historial...</p>
          ) : historial.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 font-medium">Sin registro de obras en licitaciones.</p>
              <p className="text-xs text-slate-400 mt-1">El historial se actualiza automáticamente al adjudicar procesos.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historial.map(obra => {
                const isGanador = obra.resultado === 'Adjudicado';
                return (
                  <div
                    key={obra.id}
                    className={`p-4 rounded-xl border transition ${
                      isGanador
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
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
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 leading-snug">{obra.nombreProyecto}</h4>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase shrink-0 ${
                          isGanador
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isGanador ? <Trophy className="w-3 h-3 text-amber-300" /> : <Clock className="w-3 h-3" />}
                        {obra.resultado}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-200/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Monto Oferta</span>
                        <span className="font-bold text-slate-700">{formatoMonedaCLP(obra.montoTotal)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Plazo Oferta</span>
                        <span className="font-semibold text-slate-700">{obra.plazoDias} días</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Puntaje Final</span>
                        <span className="font-semibold text-sky-700">
                          {obra.puntajeObtenido !== undefined ? `${obra.puntajeObtenido} pts` : '—'}
                        </span>
                      </div>
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
