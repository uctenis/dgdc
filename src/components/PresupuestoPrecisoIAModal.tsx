import { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, AlertTriangle, ArrowLeft, PlusCircle } from 'lucide-react';
import {
  sugerirPreguntasTecnicasConIA, sugerirItemizadoPrecisoConIA,
  type PreguntaTecnicaIA, type ItemItemizadoPrecisoSugeridoIA, mensajeErrorIA } from '../services/aiService';
import { formatoMonedaCLP } from '../services/evaluationEngine';

interface Props {
  proyecto: { nombre: string; descripcion?: string; tipoObra?: string; rubro?: string; uso?: string };
  onClose: () => void;
  onAgregarPartidas: (items: ItemItemizadoPrecisoSugeridoIA[]) => void;
}

type Fase = 'cargando_preguntas' | 'formulario' | 'generando' | 'resultado';

const mensajeError = mensajeErrorIA;

export function PresupuestoPrecisoIAModal({ proyecto, onClose, onAgregarPartidas }: Props) {
  const [fase, setFase] = useState<Fase>('cargando_preguntas');
  const [preguntas, setPreguntas] = useState<PreguntaTecnicaIA[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ItemItemizadoPrecisoSugeridoIA[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarPreguntas = async () => {
    setFase('cargando_preguntas');
    setError(null);
    try {
      const sugeridas = await sugerirPreguntasTecnicasConIA(proyecto);
      if (!sugeridas.length) {
        setError('La IA no propuso preguntas técnicas para este proyecto. Puede continuar agregando el itemizado manualmente.');
        return;
      }
      setPreguntas(sugeridas);
      setFase('formulario');
    } catch (err) {
      console.error('Error obteniendo preguntas técnicas con IA:', err);
      setError(mensajeError(err));
    }
  };

  useEffect(() => {
    cargarPreguntas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generarItemizado = async () => {
    setFase('generando');
    setError(null);
    try {
      const items = await sugerirItemizadoPrecisoConIA({
        ...proyecto,
        respuestas: preguntas.map(p => ({ pregunta: p.pregunta, respuesta: respuestas[p.id] || '' })),
      });
      if (!items.length) {
        setError('La IA no devolvió partidas con estos datos. Intente nuevamente o complete el itemizado manualmente.');
        setFase('formulario');
        return;
      }
      setResultado(items);
      setFase('resultado');
    } catch (err) {
      console.error('Error generando presupuesto preciso con IA:', err);
      setError(mensajeError(err));
      setFase('formulario');
    }
  };

  const totalReferencial = resultado.reduce((sum, it) => sum + it.cantidad * it.precioUnitarioReferencial, 0);

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between border-b pb-3.5 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-violet-100 text-violet-800 px-2.5 py-0.5 rounded flex items-center gap-1 w-fit">
              <Sparkles className="w-3 h-3" /> Presupuesto Preciso con IA
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1.5">{proyecto.nombre.toLocaleUpperCase('es-CL')}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {fase === 'cargando_preguntas' && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-sm font-bold text-slate-700">Analizando el proyecto para saber qué preguntar…</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={fase === 'formulario' ? generarItemizado : cargarPreguntas}
                  className="block font-bold text-violet-700 hover:text-violet-900 underline underline-offset-2"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {fase === 'formulario' && !error && preguntas.length > 0 && (
            <>
              <p className="text-slate-500">
                Responda lo que sepa — lo que deje en blanco, la IA lo estimará con criterio conservador. Estas respuestas se usan para calcular cantidades reales del itemizado (no solo listar partidas).
              </p>
              <div className="space-y-3">
                {preguntas.map(p => (
                  <div key={p.id}>
                    <label className="block font-semibold text-slate-700 mb-1">{p.pregunta}</label>
                    {p.tipo === 'seleccion' ? (
                      <select
                        value={respuestas[p.id] || ''}
                        onChange={e => setRespuestas(r => ({ ...r, [p.id]: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                      >
                        <option value="">-- Sin responder --</option>
                        {(p.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : p.tipo === 'numero' ? (
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={respuestas[p.id] || ''}
                          onChange={e => setRespuestas(r => ({ ...r, [p.id]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                          className="w-full px-3 py-2 pr-14 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none font-bold text-emerald-700"
                        />
                        {p.unidad && (
                          <span className="absolute right-3 text-slate-400 font-semibold text-[11px]">{p.unidad}</span>
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={respuestas[p.id] || ''}
                        onChange={e => setRespuestas(r => ({ ...r, [p.id]: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {fase === 'generando' && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-sm font-bold text-slate-700">Calculando cantidades y precios referenciales…</p>
            </div>
          )}

          {fase === 'resultado' && (
            <>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-950">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span><strong>Precios referenciales de IA, no vinculantes.</strong> Son una estimación de mercado, no una cotización real — valide o reemplace cada precio unitario antes de usar este itemizado como Presupuesto Estimado oficial.</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-2 text-left">Fase</th>
                      <th className="p-2 text-left">Descripción</th>
                      <th className="p-2">Unidad</th>
                      <th className="p-2 text-right">Cantidad</th>
                      <th className="p-2 text-right">P. Unit. Referencial</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultado.map((it, i) => (
                      <tr key={i}>
                        <td className="p-2 text-[10px] text-indigo-800 font-bold uppercase whitespace-nowrap">{it.fase}</td>
                        <td className="p-2 min-w-[200px]">{it.descripcion}</td>
                        <td className="p-2 text-center">{it.unidad}</td>
                        <td className="p-2 text-right">{it.cantidad.toLocaleString('es-CL')}</td>
                        <td className="p-2 text-right text-amber-700 font-semibold">{formatoMonedaCLP(it.precioUnitarioReferencial)}</td>
                        <td className="p-2 text-right font-bold">{formatoMonedaCLP(it.cantidad * it.precioUnitarioReferencial)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200">
                      <td colSpan={5} className="p-2 text-right font-bold text-slate-500 uppercase text-[10px]">Total Referencial (Neto)</td>
                      <td className="p-2 text-right font-black text-indigo-700">{formatoMonedaCLP(totalReferencial)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t shrink-0">
          {fase === 'resultado' ? (
            <button
              type="button"
              onClick={() => { setFase('formulario'); setResultado([]); }}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a las preguntas
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-xs">
              Cancelar
            </button>
            {fase === 'formulario' && (
              <button
                type="button"
                onClick={generarItemizado}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-bold text-xs shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" /> Generar Itemizado
              </button>
            )}
            {fase === 'resultado' && (
              <button
                type="button"
                onClick={() => { onAgregarPartidas(resultado); onClose(); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Agregar al Itemizado
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
