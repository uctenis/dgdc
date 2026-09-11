import React, { useMemo, useState } from 'react';
import type { LicitacionProyecto, Cotizacion } from '../types';
import { evaluarCotizaciones, formatoMonedaCLP } from '../services/evaluationEngine';
import { Trophy, Award, DollarSign, ShieldCheck, Leaf, Sparkles, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';

interface EvaluationMatrixProps {
  licitacion: LicitacionProyecto | null;
  cotizaciones: Cotizacion[];
  onAdjudicarLicitacion: (licitacionId: string, proveedorId: string, justificacion: string) => Promise<void>;
  onNavigateToDocumentos: () => void;
}

export const EvaluationMatrix: React.FC<EvaluationMatrixProps> = ({
  licitacion,
  cotizaciones,
  onAdjudicarLicitacion,
  onNavigateToDocumentos,
}) => {
  const [isAdjudicando, setIsAdjudicando] = useState(false);
  const cotizacionesProyecto = useMemo(
    () => licitacion ? cotizaciones.filter(c => c.licitacionId === licitacion.id) : [],
    [cotizaciones, licitacion]
  );

  // Calcular evaluación en tiempo real
  const evaluaciones = useMemo(() => {
    const resultados = evaluarCotizaciones(cotizacionesProyecto);
    const proveedorAdjudicadoId = licitacion?.proveedorAdjudicadoId || licitacion?.proveedorGanadorId;
    const hayAdjudicacion = Boolean(licitacion?.cotizacionAdjudicadaId || proveedorAdjudicadoId);
    if (!hayAdjudicacion) return resultados;

    return resultados
      .map(resultado => ({
        ...resultado,
        esPropuestaAdjudicada: resultado.cotizacionId === licitacion?.cotizacionAdjudicadaId
          || Boolean(proveedorAdjudicadoId && resultado.proveedorId === proveedorAdjudicadoId),
      }))
      .sort((a, b) => {
        if (a.esPropuestaAdjudicada !== b.esPropuestaAdjudicada) return a.esPropuestaAdjudicada ? -1 : 1;
        if (b.puntajeTotalPonderado !== a.puntajeTotalPonderado) return b.puntajeTotalPonderado - a.puntajeTotalPonderado;
        return a.montoTotal - b.montoTotal;
      });
  }, [cotizacionesProyecto, licitacion]);

  if (!licitacion) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
        <Award className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No hay ninguna Licitación o Proyecto Seleccionado</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Por favor seleccione un proyecto en la pestaña "Proyectos & Licitaciones" para evaluar.
        </p>
      </div>
    );
  }

  const adjudicado = evaluaciones.find(e => e.esPropuestaAdjudicada) || evaluaciones[0];
  const procesoAdjudicado = licitacion.estado === 'Adjudicado'
    || licitacion.estado === 'Cerrado'
    || Boolean(licitacion.proveedorAdjudicadoId || licitacion.proveedorGanadorId);

  const handleCelebrarAdjudicacion = async () => {
    if (!adjudicado) return;
    if (!confirm(`¿Confirma adjudicar esta licitación a ${adjudicado.proveedorNombre}? Esta acción no se puede deshacer.`)) return;
    setIsAdjudicando(true);
    try {
      await onAdjudicarLicitacion(licitacion.id, adjudicado.proveedorId, `Adjudicado automáticamente según menor precio y mejor puntaje ponderado (${adjudicado.puntajeTotalPonderado} pts).`);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error('Error al adjudicar la licitación:', err);
      alert(err instanceof Error ? err.message : 'No fue posible adjudicar la licitación. Intente nuevamente.');
    } finally {
      setIsAdjudicando(false);
    }
  };

  if (cotizacionesProyecto.length === 0) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-4">
        <Trophy className="w-12 h-12 text-slate-300 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">Se requieren cotizaciones para realizar el Cuadro Comparativo</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Cargue al menos una cotización en la pestaña "Cargar Cotizaciones" para calcular automáticamente la ponderación y la propuesta de adjudicación.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner with Winning Recommendation */}
      {adjudicado && (
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-blue-950 text-white p-6 rounded-2xl shadow-xl border border-sky-800 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500 text-slate-950 font-extrabold text-[10px] uppercase px-3 py-1 rounded-full flex items-center gap-1 shadow-md">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{procesoAdjudicado ? 'Proveedor adjudicado' : 'Propuesta automática de adjudicación'}</span>
              </span>
              <span className="text-xs text-sky-300">Puntaje: {adjudicado.puntajeTotalPonderado.toFixed(2)} / 100 pts · Ranking técnico #{adjudicado.ranking}</span>
            </div>

            <h2 className="text-xl font-extrabold text-white tracking-tight">
              {adjudicado.proveedorNombre}
            </h2>
            <p className="text-xs text-slate-300">
              RUT: {adjudicado.proveedorRut} • Oferta Total: <strong className="text-emerald-400 font-bold">{formatoMonedaCLP(adjudicado.montoTotal)} IVA incl.</strong> • Plazo: {adjudicado.plazoDias} días
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!procesoAdjudicado && (
              <button
                onClick={handleCelebrarAdjudicacion}
                disabled={isAdjudicando}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold px-5 py-3 rounded-xl text-xs shadow-lg transition flex items-center gap-2"
              >
                <Trophy className="w-4 h-4" />
                <span>{isAdjudicando ? 'Adjudicando…' : 'Aprobar Adjudicación'}</span>
              </button>
            )}
            <button
              onClick={onNavigateToDocumentos}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-xl text-xs font-semibold backdrop-blur-sm border border-white/20 transition flex items-center gap-2"
            >
              <span>Generar Documento</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Table: Cuadro Comparativo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Award className="w-5 h-5 text-sky-600" />
              <span>1. Cuadro Comparativo de Ofertas (PS-FOR-DGDC0003)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              CP: {licitacion.codigoCP} • OP: {licitacion.codigoOP} • OT: {licitacion.codigoOT} • Proyecto: {licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}
            </p>
          </div>

          <span className="text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200 px-3 py-1 rounded-lg">
            Fórmulas Calculadas
          </span>
        </div>

        {/* Dynamic Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white border-b border-slate-800">
                <th className="p-4 font-bold w-1/4">Aspecto a Evaluar</th>
                <th className="p-4 font-bold w-1/6">Medio de Verificación</th>
                <th className="p-4 font-bold w-24 text-center">Ponderación</th>
                {evaluaciones.map(ev => (
                  <th key={ev.cotizacionId} className="p-4 font-bold text-center border-l border-slate-800">
                    <div className="space-y-1">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase ${
                        ev.esPropuestaAdjudicada ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-300'
                      }`}>
                        Ranking #{ev.ranking} {ev.esPropuestaAdjudicada && '🏆 Ganador'}
                      </span>
                      <div className="font-bold text-sm text-white line-clamp-1">{ev.proveedorNombre}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{ev.proveedorRut}</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {/* Row 1: Oferta Económica (55%) */}
              <tr className="hover:bg-slate-50/80 transition">
                <td className="p-4 font-medium text-slate-800">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Oferta Económica</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    El oferente que proponga el menor precio con impuestos incluidos obtiene 100 pts.
                  </p>
                </td>
                <td className="p-4 text-slate-600">Cotización adjunta</td>
                <td className="p-4 font-extrabold text-slate-900 text-center bg-slate-50">55%</td>
                {evaluaciones.map(ev => (
                  <td key={ev.cotizacionId} className="p-4 text-center border-l border-slate-100">
                    <div className="font-bold text-slate-800">{ev.puntajeEconomico.toFixed(1)} pts</div>
                    <div className="text-xs font-bold text-sky-700 mt-0.5">({ev.puntajeEconomicoPonderado.toFixed(2)} pond)</div>
                    <div className="text-[11px] font-medium text-slate-600 mt-1">{formatoMonedaCLP(ev.montoTotal)}</div>
                  </td>
                ))}
              </tr>

              {/* Row 2: Oferta Técnica (35%) */}
              <tr className="hover:bg-slate-50/80 transition">
                <td className="p-4 font-medium text-slate-800">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-sky-600" />
                    <span>Oferta Técnica</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    a) Requerimientos b) Experiencia c) Plazo. (3 ítems = 100, 2 = 60, 1 = 40, 0 = 0).
                  </p>
                </td>
                <td className="p-4 text-slate-600">Cartas de referencias y cotización</td>
                <td className="p-4 font-extrabold text-slate-900 text-center bg-slate-50">35%</td>
                {evaluaciones.map(ev => (
                  <td key={ev.cotizacionId} className="p-4 text-center border-l border-slate-100">
                    <div className="font-bold text-slate-800">{ev.puntajeTecnico.toFixed(0)} pts</div>
                    <div className="text-xs font-bold text-sky-700 mt-0.5">({ev.puntajeTecnicoPonderado.toFixed(2)} pond)</div>
                    <div className="text-[11px] font-medium text-slate-600 mt-1">{ev.plazoDias} días plazo</div>
                  </td>
                ))}
              </tr>

              {/* Row 3: Sustentabilidad (10%) */}
              <tr className="hover:bg-slate-50/80 transition">
                <td className="p-4 font-medium text-slate-800">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Leaf className="w-4 h-4 text-emerald-600" />
                    <span>Sustentabilidad</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    a) Declara/compromete prácticas sustentables = 100 pts. b) No declara = 0 pts.
                  </p>
                </td>
                <td className="p-4 text-slate-600">Carta Compromiso / Certificado</td>
                <td className="p-4 font-extrabold text-slate-900 text-center bg-slate-50">10%</td>
                {evaluaciones.map(ev => (
                  <td key={ev.cotizacionId} className="p-4 text-center border-l border-slate-100">
                    <div className="font-bold text-slate-800">{ev.puntajeSustentabilidad.toFixed(0)} pts</div>
                    <div className="text-xs font-bold text-sky-700 mt-0.5">({ev.puntajeSustentabilidadPonderado.toFixed(2)} pond)</div>
                    <div className="text-[10px] font-medium text-slate-500 mt-1">
                      {ev.puntajeSustentabilidad > 0 ? '✓ Acreditado' : '✗ No declara'}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Row 4: TOTALES PONDERADOS */}
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                <td className="p-4 text-slate-900 text-sm">PUNTAJE TOTAL DE PROVEEDOR</td>
                <td className="p-4 text-slate-600">Sumatoria Final Ponderada</td>
                <td className="p-4 text-center text-slate-900 text-sm bg-slate-200">100%</td>
                {evaluaciones.map(ev => (
                  <td
                    key={ev.cotizacionId}
                    className={`p-4 text-center border-l border-slate-300 ${
                      ev.esPropuestaAdjudicada ? 'bg-emerald-50 text-emerald-950' : ''
                    }`}
                  >
                    <div className={`text-base font-extrabold ${ev.esPropuestaAdjudicada ? 'text-emerald-700' : 'text-slate-800'}`}>
                      {ev.puntajeTotalPonderado.toFixed(2)} pts
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mt-1">
                      Ranking #{ev.ranking}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
