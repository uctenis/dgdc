import { useState } from 'react';
import { Gavel, Landmark, Loader2, Undo2 } from 'lucide-react';
import { addMulta, updateLicitacion, updateMulta } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { useAuth } from '../context/AuthContext';
import { PARAMETROS_CONTRATO } from '../data/contratoTemplateData';
import { calcularAtraso, MULTA_DIARIA } from '../utils/multasRetenciones';
import type { EstadoPago, LicitacionProyecto, MultaObra } from '../types';

const fecha = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL') : '—');

interface Props {
  licitacion: LicitacionProyecto;
  montoContrato: number;
  /** Último día del plazo contractual, con las ampliaciones aprobadas (YYYY-MM-DD). */
  fechaTermino: string;
  estados: EstadoPago[];
  multas: MultaObra[];
  retencionPct: number;
  puedeGestionar: boolean;
}

/**
 * Multas por atraso (cláusula SEXTA del contrato) y retenciones de garantía (cláusula NOVENA): cálculo, registro,
 * exención justificada y devolución de retenciones tras la recepción.
 */
export function MultasRetencionesPanel({ licitacion, montoContrato, fechaTermino, estados, multas, retencionPct, puedeGestionar }: Props) {
  const { user } = useAuth();
  const [procesando, setProcesando] = useState(false);
  const entrega = licitacion.recepcionConforme?.fechaSolicitud || licitacion.recepcionConforme?.fechaAprobacion;
  const atraso = calcularAtraso({ fechaTermino, montoContrato, multas, fechaEntrega: entrega });
  const pendientesDescuento = multas.filter(m => m.estado === 'Aplicada' && !m.estadoPagoId);

  const retenido = estados.reduce((s, e) => s + (e.montoRetencion || 0), 0);
  const devuelto = licitacion.devolucionRetenciones?.monto || 0;
  const saldoRetenido = Math.max(0, retenido - devuelto);
  const recepcionAprobada = licitacion.recepcionConforme?.aprobada === true;

  const registrarMulta = async (estado: 'Aplicada' | 'Exenta') => {
    if (!atraso.desdeSinRegistrar || !user?.email) return;
    let justificacion = '';
    if (estado === 'Exenta') {
      justificacion = (prompt('¿Por qué no corresponde multa? (atraso por causa de la UCT o fuerza mayor, cláusula 6.4)') || '').trim();
      if (!justificacion) return;
    } else if (!confirm(`¿Aplicar una multa de ${formatoMonedaCLP(atraso.multaSugerida)} por ${atraso.diasSinRegistrar} días de atraso (${fecha(atraso.desdeSinRegistrar)} al ${fecha(atraso.hasta)})? Se descontará en el próximo estado de pago.`)) {
      return;
    }
    setProcesando(true);
    try {
      await addMulta(licitacion.id, {
        desde: atraso.desdeSinRegistrar,
        hasta: atraso.hasta,
        dias: atraso.diasSinRegistrar,
        monto: estado === 'Aplicada' ? atraso.multaSugerida : 0,
        motivo: `Atraso de ${atraso.diasSinRegistrar} días respecto del término contractual (${fecha(fechaTermino)})`,
        estado,
        ...(justificacion ? { justificacion } : {}),
        fechaRegistro: new Date().toISOString(),
        registradaPor: user.email,
      });
    } catch (err) {
      console.error('Error registrando la multa:', err);
      alert('No se pudo registrar la multa. Intente nuevamente.');
    } finally {
      setProcesando(false);
    }
  };

  const anularMulta = async (m: MultaObra) => {
    const justificacion = (prompt(`¿Por qué se anula la multa de ${formatoMonedaCLP(m.monto)}?`) || '').trim();
    if (!justificacion) return;
    await updateMulta(licitacion.id, m.id, { estado: 'Anulada', justificacion });
  };

  const devolverRetenciones = async () => {
    if (!user?.email) return;
    if (!confirm(`¿Registrar la devolución de ${formatoMonedaCLP(saldoRetenido)} en retenciones al contratista?`)) return;
    setProcesando(true);
    try {
      await updateLicitacion(licitacion.id, {
        devolucionRetenciones: { fecha: new Date().toISOString().slice(0, 10), monto: retenido, registradaPor: user.email },
      });
    } finally {
      setProcesando(false);
    }
  };

  const colorAtraso = atraso.dias === 0 ? 'text-emerald-700' : atraso.superaDiasResolucion ? 'text-red-700' : 'text-amber-700';

  return (
    <section className="grid md:grid-cols-2 gap-3">
      {/* Multas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div>
          <h3 className="text-sm font-black flex items-center gap-2"><Gavel className="w-4 h-4 text-rose-600" /> Multas por atraso</h3>
          <p className="text-[10px] text-slate-500">
            {String(PARAMETROS_CONTRATO.multaDiariaPct)}% del contrato por día ({formatoMonedaCLP(Math.round(montoContrato * MULTA_DIARIA))}/día), tope {PARAMETROS_CONTRATO.topeMultasPct}% ({formatoMonedaCLP(atraso.tope)}).
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <span className="block font-semibold uppercase text-slate-400">Atraso</span>
            <strong className={`text-sm ${colorAtraso}`}>{fechaTermino ? `${atraso.dias} días` : '—'}</strong>
          </div>
          <div>
            <span className="block font-semibold uppercase text-slate-400">Aplicado</span>
            <strong className="text-sm text-rose-700 tabular-nums">{formatoMonedaCLP(atraso.multasAplicadas)}</strong>
          </div>
          <div>
            <span className="block font-semibold uppercase text-slate-400">Por descontar</span>
            <strong className="text-sm text-slate-700 tabular-nums">{formatoMonedaCLP(pendientesDescuento.reduce((s, m) => s + m.monto, 0))}</strong>
          </div>
        </div>

        {!fechaTermino && <p className="text-[11px] text-slate-500">Defina la fecha de inicio de la obra para calcular el atraso.</p>}
        {fechaTermino && atraso.dias === 0 && <p className="text-[11px] text-emerald-700">En plazo: el término contractual es el {fecha(fechaTermino)}.</p>}
        {atraso.superaDiasResolucion && (
          <p className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
            El atraso supera {PARAMETROS_CONTRATO.diasResolucionPorAtraso} días: la UCT puede terminar el contrato (cláusula 6.2).
          </p>
        )}
        {atraso.alcanzaTope && (
          <p className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
            Las multas alcanzaron el tope del {PARAMETROS_CONTRATO.topeMultasPct}%: la UCT puede terminar el contrato.
          </p>
        )}

        {atraso.diasSinRegistrar > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-xs text-amber-900">
            <p>
              <strong>{atraso.diasSinRegistrar} días de atraso sin registrar</strong> ({fecha(atraso.desdeSinRegistrar)} al {fecha(atraso.hasta)}):
              corresponde una multa de <strong>{formatoMonedaCLP(atraso.multaSugerida)}</strong>.
            </p>
            {puedeGestionar ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={procesando || atraso.multaSugerida <= 0} onClick={() => void registrarMulta('Aplicada')} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50">
                  {procesando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aplicar multa'}
                </button>
                <button type="button" disabled={procesando} onClick={() => void registrarMulta('Exenta')} className="px-3 py-1.5 rounded-lg border border-amber-400 font-bold hover:bg-amber-100">
                  No corresponde (justificar)
                </button>
              </div>
            ) : (
              <p className="text-[10px]">Solo el responsable del proyecto o el administrador puede aplicarla.</p>
            )}
          </div>
        )}

        {multas.length > 0 && (
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {multas.map(m => (
              <div key={m.id} className="py-2 flex items-start gap-2 text-[11px]">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">
                    {fecha(m.desde)} al {fecha(m.hasta)} · {m.dias} días ·{' '}
                    <span className={m.estado === 'Aplicada' ? 'text-rose-700' : 'text-slate-500'}>{m.estado === 'Aplicada' ? formatoMonedaCLP(m.monto) : m.estado}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {m.estado === 'Aplicada' ? (m.estadoPagoNumero ? `Descontada en el EP N° ${m.estadoPagoNumero}` : 'Se descontará en el próximo estado de pago') : m.justificacion}
                    {' · '}{m.registradaPor}
                  </p>
                </div>
                {puedeGestionar && m.estado === 'Aplicada' && !m.estadoPagoId && (
                  <button type="button" onClick={() => void anularMulta(m)} className="p-1 text-slate-400 hover:text-slate-700" title="Anular (con justificación)">
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Retenciones */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div>
          <h3 className="text-sm font-black flex items-center gap-2"><Landmark className="w-4 h-4 text-indigo-600" /> Retenciones de garantía</h3>
          <p className="text-[10px] text-slate-500">
            {retencionPct > 0
              ? `${retencionPct}% de cada estado de pago; se devuelve al firmarse el acta de recepción (cláusula 10.4).`
              : 'Este contrato no exige retenciones según su política de garantías.'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <span className="block font-semibold uppercase text-slate-400">Retenido</span>
            <strong className="text-sm text-indigo-700 tabular-nums">{formatoMonedaCLP(retenido)}</strong>
          </div>
          <div>
            <span className="block font-semibold uppercase text-slate-400">Devuelto</span>
            <strong className="text-sm text-emerald-700 tabular-nums">{formatoMonedaCLP(devuelto)}</strong>
          </div>
          <div>
            <span className="block font-semibold uppercase text-slate-400">Saldo</span>
            <strong className="text-sm text-slate-700 tabular-nums">{formatoMonedaCLP(saldoRetenido)}</strong>
          </div>
        </div>
        {licitacion.devolucionRetenciones && (
          <p className="text-[11px] text-emerald-700">
            Devolución registrada el {fecha(licitacion.devolucionRetenciones.fecha)} por {licitacion.devolucionRetenciones.registradaPor}.
          </p>
        )}
        {saldoRetenido > 0 && (
          recepcionAprobada ? (
            puedeGestionar && (
              <button type="button" disabled={procesando} onClick={() => void devolverRetenciones()} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
                Registrar devolución de retenciones
              </button>
            )
          ) : (
            <p className="text-[11px] text-slate-500">La devolución se habilita cuando se apruebe la recepción conforme de la obra.</p>
          )
        )}
      </div>
    </section>
  );
}
