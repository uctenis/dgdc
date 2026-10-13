import { useEffect, useState } from 'react';
import { X, Trophy, Loader2, ShieldAlert, Star } from 'lucide-react';
import type { Proveedor, EvaluacionDesempeno } from '../types';
import { getEvaluacionesDesempenoDeProveedores } from '../services/firestoreService';
import type { CargaProveedor } from '../utils/cargaProveedores';
import { calcularScorecard, nivelBajoUmbral, NIVELES_DESEMPENO, MESES_EVALUACION_VIGENTE, type ScorecardProveedor } from '../utils/scorecardProveedor';

interface RankingDesempenoModalProps {
  proveedores: Proveedor[];
  /** Invitaciones y ofertas de cada proveedor, para mostrar cuánto responde cuando se le invita. */
  cargas?: Record<string, CargaProveedor>;
  onClose: () => void;
}

interface FilaRanking extends ScorecardProveedor {
  proveedor: Proveedor;
}

export function RankingDesempenoModal({ proveedores, cargas = {}, onClose }: RankingDesempenoModalProps) {
  const [cargando, setCargando] = useState(true);
  const [mapaEvaluaciones, setMapaEvaluaciones] = useState<Record<string, EvaluacionDesempeno[]>>({});
  const [soloConEvaluaciones, setSoloConEvaluaciones] = useState(true);

  useEffect(() => {
    setCargando(true);
    getEvaluacionesDesempenoDeProveedores(proveedores.map(p => p.id))
      .then(setMapaEvaluaciones)
      .catch(error => console.error('Error cargando ranking de desempeño:', error))
      .finally(() => setCargando(false));
  }, [proveedores]);

  const filas: FilaRanking[] = proveedores
    .map(proveedor => {
      const evaluaciones = mapaEvaluaciones[proveedor.id] || [];
      return { proveedor, ...calcularScorecard(evaluaciones, cargas[proveedor.id]) };
    })
    .filter(fila => !soloConEvaluaciones || fila.cantidadEvaluaciones > 0)
    .sort((a, b) => {
      if (a.promedio === null && b.promedio === null) return 0;
      if (a.promedio === null) return 1;
      if (b.promedio === null) return -1;
      return b.promedio - a.promedio;
    });

  const totalEvaluados = proveedores.filter(p => (mapaEvaluaciones[p.id] || []).length > 0).length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
              Pauta de Evaluación de Desempeño
            </span>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mt-1">
              <Trophy className="w-5 h-5 text-amber-500" />
              Ranking de Desempeño de Proveedores
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {totalEvaluados} de {proveedores.length} proveedores tienen al menos una evaluación registrada.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={soloConEvaluaciones}
              onChange={e => setSoloConEvaluaciones(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-purple-600"
            />
            Mostrar solo proveedores con evaluaciones registradas
          </label>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {NIVELES_DESEMPENO.map((n, i) => (
              <span key={n.id} title={n.consecuencia} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${n.clases.etiqueta}`}>
                {n.etiqueta} {i === 0 ? `${n.desde} o más` : `${n.desde} a ${NIVELES_DESEMPENO[i - 1].desde}`}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Las evaluaciones de los últimos {MESES_EVALUACION_VIGENTE} meses pesan completo en el puntaje; las anteriores, la mitad.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-3">
          {cargando ? (
            <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">Calculando desempeño de {proveedores.length} proveedores...</p>
            </div>
          ) : filas.length === 0 ? (
            <div className="text-center py-14">
              <Star className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 font-medium">Aún no hay evaluaciones de desempeño registradas.</p>
              <p className="text-xs text-slate-400 mt-1">Se generan al aprobar la Recepción Conforme de una obra adjudicada.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filas.map((fila, index) => {
                const bajoUmbral = nivelBajoUmbral(fila.nivel);
                return (
                  <div
                    key={fila.proveedor.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      bajoUmbral ? 'bg-rose-50/60 border-rose-200' : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black ${
                      index === 0 ? 'bg-amber-400 text-white' : index === 1 ? 'bg-slate-300 text-white' : index === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{fila.proveedor.razonSocial}</p>
                      <p className="text-[10px] text-slate-500 truncate">{fila.proveedor.rubro} · RUT {fila.proveedor.rut}</p>
                      {fila.respuesta.invitaciones > 0 && (
                        <p className="text-[10px] text-slate-400 truncate">
                          Ofertó en {fila.respuesta.ofertas} de {fila.respuesta.invitaciones} procesos cerrados ({fila.respuesta.pct}%) · {fila.adjudicaciones} adjudicación(es)
                        </p>
                      )}
                    </div>
                    {fila.nivel && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 ${fila.nivel.clases.etiqueta}`} title={fila.nivel.consecuencia}>
                        {bajoUmbral && <ShieldAlert className="w-3 h-3" />} {fila.nivel.etiqueta}
                      </span>
                    )}
                    <div className="text-right shrink-0">
                      {fila.promedio !== null ? (
                        <>
                          <span className={`text-lg font-black ${fila.nivel?.clases.texto}`}>
                            {fila.promedio}<span className="text-xs text-slate-400">/5</span>
                          </span>
                          <p className="text-[9px] text-slate-400">
                            {fila.cantidadEvaluaciones} evaluación(es){fila.evaluacionesAntiguas > 0 ? ` · ${fila.evaluacionesAntiguas} antigua(s)` : ''}
                          </p>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Sin evaluar</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
