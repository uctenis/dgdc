import { useState } from 'react';
import { X, CheckCircle2, XCircle, Clock, Lock, ClipboardCheck } from 'lucide-react';
import type { ConfiguracionFirmas, ProyectoMaestro } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { setDecisionPresupuesto, updateProyectoMaestro } from '../services/firestoreService';
import { ANIO_CARTERA_INICIAL, decisionDeCartera, presupuestoDelAnio, resumenRevisionCartera, type DecisionCartera } from '../utils/carteraAnual';
import { useAuth } from '../context/AuthContext';

interface RevisionCarteraModalProps {
  anio: number;
  /** Proyectos de la cartera de ese año. */
  proyectos: ProyectoMaestro[];
  configFirmas?: ConfiguracionFirmas;
  onSaveConfig?: (cfg: ConfiguracionFirmas) => void;
  onClose: () => void;
}

const ORDEN: Record<DecisionCartera, number> = { pendiente: 0, aprobado: 1, rechazado: 2 };

/**
 * Revisión de la cartera del año: cada proyecto se defiende con su fundamento y se aprueba o rechaza. Al cerrar la
 * revisión, la suma de los aprobados queda como Presupuesto Anual Aprobado de esa cartera (nadie lo escribe a mano).
 */
export function RevisionCarteraModal({ anio, proyectos, configFirmas, onSaveConfig, onClose }: RevisionCarteraModalProps) {
  const { isAdmin, user, profile } = useAuth();
  const [textos, setTextos] = useState<Record<string, { fundamento?: string; observacion?: string }>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState('');

  const resumen = resumenRevisionCartera(proyectos);
  const cierre = configFirmas?.revisionesCartera?.[String(anio)];
  const presupuestoFijado = presupuestoDelAnio(configFirmas, anio);
  const ordenados = [...proyectos].sort((a, b) => ORDEN[decisionDeCartera(a)] - ORDEN[decisionDeCartera(b)] || (b.valorAprox || 0) - (a.valorAprox || 0));

  const ejecutar = async (id: string, accion: () => Promise<void>) => {
    setGuardando(id);
    setError('');
    try {
      await accion();
    } catch (err) {
      console.error('Error en la revisión de cartera:', err);
      setError('No se pudo guardar. Intente nuevamente.');
    } finally {
      setGuardando(null);
    }
  };

  const guardarFundamento = (p: ProyectoMaestro) => {
    const nuevo = textos[p.id]?.fundamento;
    if (nuevo === undefined || nuevo.trim() === (p.fundamento || '')) return;
    void ejecutar(p.id, () => updateProyectoMaestro(p.id, { fundamento: nuevo.trim() }));
  };

  const decidir = (p: ProyectoMaestro, decision: DecisionCartera) => {
    const observacion = textos[p.id]?.observacion ?? p.presupuesto?.observacion;
    void ejecutar(p.id, () => setDecisionPresupuesto(p.id, decision, { nombre: profile?.displayName || user?.displayName, email: user?.email }, observacion));
  };

  const cerrarRevision = () => {
    if (!configFirmas || !onSaveConfig) return;
    const aviso = resumen.pendiente.cantidad > 0
      ? `Quedan ${resumen.pendiente.cantidad} proyecto(s) sin revisar: no entran al presupuesto.\n\n`
      : '';
    if (!confirm(`${aviso}El Presupuesto Anual Aprobado ${anio} quedará en ${formatoMonedaCLP(resumen.aprobado.monto)} (${resumen.aprobado.cantidad} proyecto(s) aprobados). ¿Cerrar la revisión?`)) return;
    onSaveConfig({
      ...configFirmas,
      presupuestosAnuales: { ...(configFirmas.presupuestosAnuales || {}), [anio]: resumen.aprobado.monto },
      ...(anio === ANIO_CARTERA_INICIAL ? { presupuestoAnualAprobado: resumen.aprobado.monto } : {}),
      revisionesCartera: {
        ...(configFirmas.revisionesCartera || {}),
        [anio]: { fecha: new Date().toISOString(), monto: resumen.aprobado.monto, proyectos: resumen.aprobado.cantidad, cerradaPor: user?.email || undefined },
      },
    });
  };

  const tarjeta = 'rounded-xl border px-3 py-2';

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col border border-slate-200 text-xs">
        <div className="flex items-start justify-between border-b pb-3 shrink-0 gap-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-900 px-2.5 py-0.5 rounded">Cartera {anio}</span>
            <h3 className="text-base font-bold text-slate-800 mt-1 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-indigo-600" /> Revisión de la cartera y presupuesto anual
            </h3>
            <p className="text-slate-500 mt-0.5">
              Cada proyecto se defiende con su fundamento y se aprueba o rechaza. Al cerrar la revisión, la suma de los aprobados queda como Presupuesto Anual Aprobado {anio}.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
          <div className={`${tarjeta} bg-slate-50 border-slate-200`}>
            <span className="block text-[9px] font-bold uppercase text-slate-400">Propuesto</span>
            <span className="block text-sm font-black text-slate-700 tabular-nums">{formatoMonedaCLP(resumen.propuesto.monto)}</span>
            <span className="text-[10px] text-slate-500">{resumen.propuesto.cantidad} proyecto(s)</span>
          </div>
          <div className={`${tarjeta} bg-emerald-50 border-emerald-200`}>
            <span className="block text-[9px] font-bold uppercase text-emerald-600">Aprobado</span>
            <span className="block text-sm font-black text-emerald-800 tabular-nums">{formatoMonedaCLP(resumen.aprobado.monto)}</span>
            <span className="text-[10px] text-slate-500">{resumen.aprobado.cantidad} proyecto(s)</span>
          </div>
          <div className={`${tarjeta} bg-rose-50 border-rose-200`}>
            <span className="block text-[9px] font-bold uppercase text-rose-600">Rechazado</span>
            <span className="block text-sm font-black text-rose-800 tabular-nums">{formatoMonedaCLP(resumen.rechazado.monto)}</span>
            <span className="text-[10px] text-slate-500">{resumen.rechazado.cantidad} proyecto(s)</span>
          </div>
          <div className={`${tarjeta} bg-amber-50 border-amber-200`}>
            <span className="block text-[9px] font-bold uppercase text-amber-600">Por revisar</span>
            <span className="block text-sm font-black text-amber-800 tabular-nums">{formatoMonedaCLP(resumen.pendiente.monto)}</span>
            <span className="text-[10px] text-slate-500">{resumen.pendiente.cantidad} proyecto(s)</span>
          </div>
        </div>

        <div className={`${tarjeta} shrink-0 flex flex-wrap items-center justify-between gap-2 ${cierre ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
          <p className="text-slate-700">
            {cierre ? (
              <>
                <Lock className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-indigo-600" />
                Revisión cerrada el <strong>{new Date(cierre.fecha).toLocaleDateString('es-CL')}</strong>: presupuesto {anio} fijado en <strong>{formatoMonedaCLP(presupuestoFijado)}</strong> ({cierre.proyectos} proyecto(s)).
                {resumen.aprobado.monto !== presupuestoFijado && (
                  <span className="block text-amber-700 font-semibold mt-0.5">
                    Los aprobados hoy suman {formatoMonedaCLP(resumen.aprobado.monto)}: si corresponde, cierre la revisión de nuevo para actualizar el presupuesto.
                  </span>
                )}
              </>
            ) : presupuestoFijado > 0 ? (
              <>Presupuesto {anio} escrito a mano en Configuración: <strong>{formatoMonedaCLP(presupuestoFijado)}</strong>. Al cerrar la revisión se reemplaza por la suma de los aprobados.</>
            ) : (
              <>Cartera <strong>en revisión</strong>: el presupuesto {anio} aún no está fijado.</>
            )}
          </p>
          {isAdmin && onSaveConfig && configFirmas && (
            <button type="button" onClick={cerrarRevision} disabled={resumen.aprobado.cantidad === 0} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-lg shadow-sm whitespace-nowrap">
              {cierre ? 'Actualizar presupuesto con los aprobados' : `Cerrar revisión y fijar presupuesto ${anio}`}
            </button>
          )}
        </div>

        {error && <p className="text-red-700 font-semibold shrink-0">{error}</p>}

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {ordenados.length === 0 && <p className="text-center text-slate-400 py-8">La Cartera {anio} aún no tiene proyectos.</p>}
          {ordenados.map(p => {
            const decision = decisionDeCartera(p);
            const ocupado = guardando === p.id;
            return (
              <div key={p.id} className={`rounded-xl border p-3 space-y-2 ${decision === 'aprobado' ? 'border-emerald-300 bg-emerald-50/40' : decision === 'rechazado' ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <strong className="text-slate-900 block">{p.nombre}</strong>
                    <span className="text-[10px] text-slate-500 font-mono">{p.codigoProyecto}</span>
                    <span className="text-[10px] text-slate-500"> · Prioridad {p.prioridad || 'Media'}{p.campusSigla ? ` · ${p.campusSigla}${p.edificioSigla ? ` ${p.edificioSigla}` : ''}` : ''}{p.responsableNombre ? ` · ${p.responsableNombre}` : ''}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block text-sm font-black text-slate-800 tabular-nums">{formatoMonedaCLP(p.valorAprox || 0)}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase ${decision === 'aprobado' ? 'text-emerald-700' : decision === 'rechazado' ? 'text-rose-700' : 'text-amber-700'}`}>
                      {decision === 'aprobado' ? <CheckCircle2 className="w-3 h-3" /> : decision === 'rechazado' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {decision === 'aprobado' ? 'Aprobado' : decision === 'rechazado' ? 'Rechazado' : 'Por revisar'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block font-bold text-slate-600 mb-0.5">Fundamento del proyecto</span>
                    <textarea
                      rows={2}
                      value={textos[p.id]?.fundamento ?? p.fundamento ?? ''}
                      onChange={e => setTextos(t => ({ ...t, [p.id]: { ...t[p.id], fundamento: e.target.value } }))}
                      onBlur={() => guardarFundamento(p)}
                      placeholder="Necesidad que resuelve, beneficio y urgencia. Se guarda al salir del cuadro."
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </label>
                  <label className="block">
                    <span className="block font-bold text-slate-600 mb-0.5">Observación de la decisión</span>
                    <textarea
                      rows={2}
                      disabled={!isAdmin}
                      value={textos[p.id]?.observacion ?? p.presupuesto?.observacion ?? ''}
                      onChange={e => setTextos(t => ({ ...t, [p.id]: { ...t[p.id], observacion: e.target.value } }))}
                      placeholder={isAdmin ? 'Por qué se aprueba o rechaza. Se guarda al presionar Aprobar o Rechazar.' : 'Sin observación.'}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </label>
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {decision !== 'pendiente' && (
                      <button type="button" disabled={ocupado} onClick={() => decidir(p, 'pendiente')} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold disabled:opacity-50">Volver a "por revisar"</button>
                    )}
                    <button type="button" disabled={ocupado} onClick={() => decidir(p, 'rechazado')} className={`px-3 py-1.5 rounded-lg font-bold border disabled:opacity-50 ${decision === 'rechazado' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'}`}>Rechazar</button>
                    <button type="button" disabled={ocupado} onClick={() => decidir(p, 'aprobado')} className={`px-3 py-1.5 rounded-lg font-bold border disabled:opacity-50 ${decision === 'aprobado' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'}`}>Aprobar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!isAdmin && <p className="text-[11px] text-slate-500 shrink-0">Puede completar el fundamento de los proyectos. Aprobar, rechazar y cerrar la revisión lo hace el administrador.</p>}
      </div>
    </div>
  );
}
