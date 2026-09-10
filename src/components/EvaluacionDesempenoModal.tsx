import { useState } from 'react';
import { X, Star, ClipboardCheck, Loader2 } from 'lucide-react';
import type { LicitacionProyecto, CriterioDesempeno } from '../types';
import { addEvaluacionDesempeno } from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';

interface EvaluacionDesempenoModalProps {
  proveedorId: string;
  proveedorNombre: string;
  licitacion: LicitacionProyecto;
  onClose: () => void;
  onGuardada?: () => void;
}

const CRITERIOS_BASE: Omit<CriterioDesempeno, 'puntaje'>[] = [
  { id: 'calidad', etiqueta: 'Calidad de la obra ejecutada', ponderacion: 0.30 },
  { id: 'plazo', etiqueta: 'Cumplimiento del plazo contractual', ponderacion: 0.25 },
  { id: 'seguridad', etiqueta: 'Seguridad y prevención de riesgos en obra', ponderacion: 0.20 },
  { id: 'garantias', etiqueta: 'Gestión de garantías y respuesta post-venta', ponderacion: 0.15 },
  { id: 'comunicacion', etiqueta: 'Comunicación y coordinación durante la obra', ponderacion: 0.10 },
];

export function EvaluacionDesempenoModal({ proveedorId, proveedorNombre, licitacion, onClose, onGuardada }: EvaluacionDesempenoModalProps) {
  const { user, profile } = useAuth();
  const [puntajes, setPuntajes] = useState<Record<CriterioDesempeno['id'], number>>({
    calidad: 4, plazo: 4, seguridad: 4, garantias: 4, comunicacion: 4,
  });
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);

  const puntajeFinal = Math.round(
    CRITERIOS_BASE.reduce((sum, c) => sum + puntajes[c.id] * c.ponderacion, 0) * 10
  ) / 10;

  const clasesSemaforo = puntajeFinal >= 4
    ? { caja: 'bg-emerald-50 border-emerald-200', texto: 'text-emerald-700' }
    : puntajeFinal >= 3
    ? { caja: 'bg-amber-50 border-amber-200', texto: 'text-amber-700' }
    : { caja: 'bg-rose-50 border-rose-200', texto: 'text-rose-700' };

  const guardar = async () => {
    if (!user) return alert('Debe iniciar sesión para registrar una evaluación.');
    if (!confirm(`¿Confirma registrar la evaluación de desempeño de ${proveedorNombre} (puntaje final: ${puntajeFinal}/5)?`)) return;
    setGuardando(true);
    try {
      const criterios: CriterioDesempeno[] = CRITERIOS_BASE.map(c => ({ ...c, puntaje: puntajes[c.id] }));
      await addEvaluacionDesempeno(proveedorId, {
        licitacionId: licitacion.id,
        codigoProyecto: licitacion.codigoProyecto,
        nombreProyecto: licitacion.nombreProyecto,
        fecha: new Date().toISOString().split('T')[0],
        evaluadorEmail: user.email || '',
        evaluadorNombre: profile?.displayName || user.displayName || user.email || '',
        criterios,
        puntajeFinal,
        observaciones: observaciones.trim() || undefined,
      });
      alert('Evaluación de desempeño registrada.');
      onGuardada?.();
      onClose();
    } catch (error) {
      console.error('Error registrando evaluación de desempeño:', error);
      alert('No se pudo registrar la evaluación. Intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded">
              Evaluación de Desempeño Post-Ejecución
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1">{proveedorNombre}</h3>
            <p className="text-xs text-slate-500">{licitacion.codigoProyecto} — {licitacion.nombreProyecto}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {CRITERIOS_BASE.map(c => (
            <div key={c.id}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">{c.etiqueta}</label>
                <span className="text-[10px] text-slate-400">Ponderación {Math.round(c.ponderacion * 100)}%</span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(valor => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setPuntajes(prev => ({ ...prev, [c.id]: valor }))}
                    className={`flex-1 py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition ${
                      puntajes[c.id] >= valor
                        ? 'bg-amber-400 border-amber-500 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100'
                    }`}
                    title={`${valor}/5`}
                  >
                    <Star className="w-3.5 h-3.5" fill={puntajes[c.id] >= valor ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              rows={3}
              placeholder="Detalles relevantes de la ejecución, incidentes, méritos destacables..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div className={`rounded-xl p-4 border flex items-center justify-between ${clasesSemaforo.caja}`}>
            <span className="text-xs font-bold text-slate-700">Puntaje final ponderado</span>
            <span className={`text-2xl font-black ${clasesSemaforo.texto}`}>{puntajeFinal}<span className="text-sm text-slate-400">/5</span></span>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-xs">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="px-5 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-lg font-semibold text-xs flex items-center gap-2"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            Guardar evaluación
          </button>
        </div>
      </div>
    </div>
  );
}
