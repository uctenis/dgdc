import { useEffect, useMemo, useState } from 'react';
import { X, Calculator, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';
import {
  calcularGastosGenerales, plazoSugeridoMeses, ETIQUETA_ENVERGADURA,
  type ParametrosCalculoGG, type Complejidad,
} from '../utils/gastosGenerales';

interface Props {
  costoDirecto: number;
  /** Fases con partidas en el itemizado (lo que cubren no se suma de nuevo como GG). */
  fasesEnCostoDirecto: string[];
  proyecto: { plazoEjecucionDias?: number; duracionEstimadaDias?: number };
  /** Cálculo guardado anteriormente en el proyecto, si lo hay. */
  calculoPrevio?: ParametrosCalculoGG;
  onClose: () => void;
  onAplicar: (resultado: { gastosGeneralesPct: number; utilidadPct?: number; calculo: ParametrosCalculoGG }) => void;
}

const COMPLEJIDADES: { valor: Complejidad; etiqueta: string; detalle: string }[] = [
  { valor: 'baja', etiqueta: 'Baja', detalle: 'Una especialidad, obra repetitiva (pintura, pisos, cambio de cubierta simple)' },
  { valor: 'media', etiqueta: 'Media', detalle: 'Varias especialidades coordinadas (habilitación de salas, baños)' },
  { valor: 'alta', etiqueta: 'Alta', detalle: 'Instalaciones críticas, estructura, laboratorios o edificio patrimonial' },
];

export function CalculadoraGastosGeneralesModal({ costoDirecto, fasesEnCostoDirecto, proyecto, calculoPrevio, onClose, onAplicar }: Props) {
  const [parametros, setParametros] = useState<ParametrosCalculoGG>(() => calculoPrevio ?? {
    plazoMeses: plazoSugeridoMeses(proyecto, costoDirecto),
    complejidad: 'media',
    recintoOcupado: true,
  });
  const [aplicarUtilidad, setAplicarUtilidad] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resultado = useMemo(() => calcularGastosGenerales(costoDirecto, parametros, fasesEnCostoDirecto), [costoDirecto, parametros, fasesEnCostoDirecto]);
  const hayAjustes = resultado.lineas.some(l => l.ajustado);

  const ajustarMensual = (id: string, cambio: { mensual?: number; dedicacionPct?: number }) => {
    setParametros(p => ({ ...p, ajustesMensuales: { ...p.ajustesMensuales, [id]: { ...p.ajustesMensuales?.[id], ...cambio } } }));
  };
  const ajustarPorcentual = (id: string, pct: number) => {
    setParametros(p => ({ ...p, ajustesPorcentuales: { ...p.ajustesPorcentuales, [id]: pct } }));
  };
  const restablecer = () => setParametros(p => ({ ...p, ajustesMensuales: undefined, ajustesPorcentuales: undefined }));

  const fueraDeRango = resultado.pct > 0 && (resultado.pct < 8 || resultado.pct > 30);

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b pb-3.5 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded flex items-center gap-1 w-fit">
              <Calculator className="w-3 h-3" /> Calculadora de Gastos Generales
            </span>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Estima los GG según el plazo y las condiciones de la obra, en vez de un % fijo. Costo Directo: <strong>{formatoMonedaCLP(costoDirecto)}</strong> · {ETIQUETA_ENVERGADURA[resultado.envergadura]}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg" title="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-4 pr-1 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="font-bold text-slate-700">Plazo de ejecución (meses)</span>
              <input
                type="number" min={0.5} step={0.5}
                value={parametros.plazoMeses || ''}
                onChange={e => setParametros(p => ({ ...p, plazoMeses: Number(e.target.value) || 0 }))}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="font-bold text-slate-700">Complejidad de la obra</span>
              <select
                value={parametros.complejidad}
                onChange={e => setParametros(p => ({ ...p, complejidad: e.target.value as Complejidad }))}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {COMPLEJIDADES.map(c => <option key={c.valor} value={c.valor}>{c.etiqueta} — {c.detalle}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={parametros.recintoOcupado}
              onChange={e => setParametros(p => ({ ...p, recintoOcupado: e.target.checked }))}
            />
            Se trabaja en un recinto en funcionamiento (con clases, oficinas o usuarios presentes)
          </label>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-[11px] min-w-[600px]">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="p-2 text-left">Concepto</th>
                  <th className="p-2 text-right">Costo mensual</th>
                  <th className="p-2 text-right">Dedicación / %</th>
                  <th className="p-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {resultado.lineas.map(l => (
                  <tr key={l.id} className={`border-t border-slate-100 ${l.ajustado ? 'bg-amber-50/50' : ''}`}>
                    <td className="p-2">
                      <span className="font-semibold text-slate-700 block">{l.concepto}</span>
                      <span className="text-[10px] text-slate-400">{l.detalle}</span>
                    </td>
                    {l.incluidoEnFase ? (
                      <td colSpan={2} className="p-2 text-right text-[10px] text-emerald-700">Ya incluido en el costo directo (fase {l.incluidoEnFase})</td>
                    ) : l.tipo === 'mensual' ? (
                      <>
                        <td className="p-1.5 text-right">
                          <input
                            type="text" inputMode="numeric"
                            value={formatearEnteroConMiles(l.mensual || 0)}
                            onChange={e => ajustarMensual(l.id, { mensual: desformatearEntero(e.target.value) })}
                            className="w-24 p-1 border border-slate-200 rounded text-right"
                          />
                        </td>
                        <td className="p-1.5 text-right whitespace-nowrap">
                          <input
                            type="number" min={0} max={100} step={5}
                            value={l.dedicacionPct ?? 0}
                            onChange={e => ajustarMensual(l.id, { dedicacionPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                            className="w-14 p-1 border border-slate-200 rounded text-right"
                          /> <span className="text-slate-400">% × {parametros.plazoMeses || 0} m</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2 text-right text-slate-400">—</td>
                        <td className="p-1.5 text-right whitespace-nowrap">
                          <input
                            type="number" min={0} step={0.1}
                            value={l.pctCostoDirecto ?? 0}
                            onChange={e => ajustarPorcentual(l.id, Math.max(0, Number(e.target.value) || 0))}
                            className="w-14 p-1 border border-slate-200 rounded text-right"
                          /> <span className="text-slate-400">% del CD</span>
                        </td>
                      </>
                    )}
                    <td className="p-2 text-right font-bold text-slate-700">{formatoMonedaCLP(l.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-indigo-50/60">
                  <td colSpan={3} className="p-2 text-right font-bold text-slate-600 uppercase text-[10px]">Total Gastos Generales</td>
                  <td className="p-2 text-right font-black text-indigo-700">{formatoMonedaCLP(resultado.total)} <span className="text-[10px]">({resultado.pct}%)</span></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {hayAjustes && (
            <button type="button" onClick={restablecer} className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800">
              <RotateCcw className="w-3 h-3" /> Restablecer valores sugeridos (filas en amarillo fueron ajustadas a mano)
            </button>
          )}

          {fueraDeRango && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>El resultado ({resultado.pct}%) está fuera del rango habitual en Chile (≈10–25%). Revise el plazo y las dedicaciones.</span>
            </div>
          )}

          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={aplicarUtilidad} onChange={e => setAplicarUtilidad(e.target.checked)} />
            <span>Aplicar también la utilidad sugerida: <strong>{resultado.utilidadSugeridaPct}%</strong> <span className="text-slate-400">(según envergadura y complejidad)</span></span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-xs">Cancelar</button>
          <button
            type="button"
            disabled={costoDirecto <= 0 || resultado.total <= 0}
            onClick={() => onAplicar({
              gastosGeneralesPct: resultado.pct,
              utilidadPct: aplicarUtilidad ? resultado.utilidadSugeridaPct : undefined,
              calculo: parametros,
            })}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg font-bold text-xs"
          >
            Aplicar {resultado.pct}% de Gastos Generales
          </button>
        </div>
      </div>
    </div>
  );
}
