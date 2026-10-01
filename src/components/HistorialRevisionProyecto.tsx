import { useState } from 'react';
import { AlertTriangle, History, Send } from 'lucide-react';
import type { ProyectoMaestro, RevisionCarteraEntrada } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { reenviarProyectoAjustado } from '../services/firestoreService';
import { anioDeCartera, compararConBaseAjuste, decisionDeCartera } from '../utils/carteraAnual';
import { useAuth } from '../context/AuthContext';

const ETIQUETA: Record<RevisionCarteraEntrada['decision'], string> = {
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  observado: 'Observado',
  pendiente: 'Vuelve a revisión',
  ajuste: 'Ajuste del responsable',
};
const COLOR: Record<RevisionCarteraEntrada['decision'], string> = {
  aprobado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rechazado: 'bg-rose-100 text-rose-800 border-rose-200',
  observado: 'bg-orange-100 text-orange-800 border-orange-200',
  pendiente: 'bg-slate-100 text-slate-700 border-slate-200',
  ajuste: 'bg-sky-100 text-sky-800 border-sky-200',
};

const lista = (titulo: string, partidas?: string[]) =>
  partidas?.length ? <p><span className="font-semibold">{titulo}:</span> {partidas.join('; ')}</p> : null;

/** Pasos de la revisión de cartera de un proyecto, del más reciente al más antiguo. */
export function HistorialRevisionLista({ historial }: { historial: RevisionCarteraEntrada[] }) {
  return (
    <div className="space-y-1.5">
      {[...historial].reverse().map((h, i) => (
        <div key={`${h.fecha}-${i}`} className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-700 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase ${COLOR[h.decision]}`}>{ETIQUETA[h.decision]}</span>
            <span className="text-slate-500">{new Date(h.fecha).toLocaleDateString('es-CL')} · Cartera {h.anio}{h.usuario ? ` · ${h.usuario}` : ''}</span>
            <strong className="ml-auto tabular-nums">
              {h.valorAnterior !== undefined && h.valorAnterior !== h.valor ? `${formatoMonedaCLP(h.valorAnterior)} → ` : ''}{formatoMonedaCLP(h.valor)}
            </strong>
          </div>
          {h.observacion && <p className="whitespace-pre-line">{h.observacion}</p>}
          {lista('Partidas eliminadas', h.partidasEliminadas)}
          {lista('Partidas con otro monto', h.partidasModificadas)}
          {lista('Partidas agregadas', h.partidasAgregadas)}
        </div>
      ))}
    </div>
  );
}

/**
 * En la ficha: aviso cuando el proyecto fue observado en la revisión de cartera (con lo que hay que ajustar y el
 * botón para reenviarlo una vez ajustado el itemizado) y, si se pide, el historial completo de la revisión.
 */
export function HistorialRevisionProyecto({ proyecto, mostrarHistorial }: { proyecto: ProyectoMaestro; mostrarHistorial: boolean }) {
  const { user } = useAuth();
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const observado = decisionDeCartera(proyecto) === 'observado';
  const ajuste = compararConBaseAjuste(proyecto);
  const historial = proyecto.historialRevision || [];

  const reenviar = async () => {
    if (!ajuste?.hayCambios && !confirm('El valor y el itemizado siguen igual que cuando se observó el proyecto. ¿Reenviarlo a revisión de todas formas?')) return;
    setEnviando(true);
    try {
      await reenviarProyectoAjustado(proyecto.id, { email: user?.email }, nota);
      setNota('');
    } catch (err) {
      console.error('Error reenviando el proyecto a revisión:', err);
      alert('No se pudo reenviar el proyecto. Intente nuevamente.');
    } finally {
      setEnviando(false);
    }
  };

  if (!observado && !(mostrarHistorial && historial.length > 0)) return null;

  return (
    <div className="space-y-3">
      {observado && (
        <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4 space-y-2 text-xs text-orange-950">
          <p className="font-extrabold flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-orange-600" /> Proyecto observado en la revisión de la Cartera {anioDeCartera(proyecto)}
          </p>
          {proyecto.presupuesto?.observacion && <p className="whitespace-pre-line"><strong>Observación:</strong> {proyecto.presupuesto.observacion}</p>}
          <p>
            Ajuste las partidas en la pestaña <strong>Presupuesto Estimativo</strong> y presione "Usar como Presupuesto Estimado" para actualizar el valor. Luego reenvíe el proyecto: el ajuste queda en su historial.
          </p>
          {ajuste && (
            <p className="font-semibold">
              Presentado en {formatoMonedaCLP(ajuste.valorAnterior)}
              {ajuste.hayCambios
                ? ` → ahora ${formatoMonedaCLP(ajuste.valor)}${ajuste.eliminadas.length ? ` · ${ajuste.eliminadas.length} partida(s) eliminada(s)` : ''}${ajuste.modificadas.length ? ` · ${ajuste.modificadas.length} con otro monto` : ''}${ajuste.agregadas.length ? ` · ${ajuste.agregadas.length} agregada(s)` : ''}.`
                : ': aún sin cambios.'}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Qué se ajustó (opcional): ej. se eliminó el cambio de ventanas y se redujo la superficie"
              className="flex-1 px-3 py-2 bg-white border border-orange-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button type="button" onClick={reenviar} disabled={enviando} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap">
              <Send className="w-3.5 h-3.5" /> {enviando ? 'Reenviando…' : 'Reenviar a revisión'}
            </button>
          </div>
        </div>
      )}

      {mostrarHistorial && historial.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
          <h3 className="flex items-center gap-2 font-black"><History className="h-5 w-5 text-indigo-700" /> Historial de la revisión de cartera</h3>
          <HistorialRevisionLista historial={historial} />
        </section>
      )}
    </div>
  );
}
