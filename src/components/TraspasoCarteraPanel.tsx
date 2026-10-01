import { useState } from 'react';
import { ArrowRightCircle } from 'lucide-react';
import type { ProyectoMaestro } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { traspasarProyectosDeCartera } from '../services/firestoreService';
import { decisionDeCartera, type DecisionCartera } from '../utils/carteraAnual';
import { useAuth } from '../context/AuthContext';

interface TraspasoCarteraPanelProps {
  anio: number;
  /** Proyectos de la cartera de ese año. */
  proyectos: ProyectoMaestro[];
  onCerrar: () => void;
}

const ETIQUETA: Record<DecisionCartera, string> = { pendiente: 'Por revisar', observado: 'Observado', aprobado: 'Aprobado sin adjudicar', rechazado: 'Rechazado' };

/** Un proyecto ya adjudicado o en ejecución se queda en su cartera: lo que falte por pagar es arrastre, no traspaso. */
const enEjecucion = (p: ProyectoMaestro) => (p.montoAdjudicado || 0) > 0 || p.estado !== 'Pendiente';

/**
 * Cierre anual: pasa a la cartera del año siguiente los proyectos que no se aprobaron (y, si se quiere, los
 * aprobados que no alcanzaron a adjudicarse). Conservan su código y quedan por revisar en la cartera nueva.
 */
export function TraspasoCarteraPanel({ anio, proyectos, onCerrar }: TraspasoCarteraPanelProps) {
  const { user } = useAuth();
  const destino = anio + 1;
  const candidatos = proyectos.filter(p => !enEjecucion(p));
  const seQuedan = proyectos.length - candidatos.length;
  // Por defecto se traspasan los no aprobados; los aprobados sin adjudicar quedan a elección.
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(candidatos.filter(p => decisionDeCartera(p) !== 'aprobado').map(p => p.id)));
  const [trabajando, setTrabajando] = useState(false);

  const alternar = (id: string) => setElegidos(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const montoElegido = candidatos.filter(p => elegidos.has(p.id)).reduce((s, p) => s + (p.valorAprox || 0), 0);

  const traspasar = async () => {
    if (!elegidos.size) return;
    if (!confirm(`Se pasarán ${elegidos.size} proyecto(s) (${formatoMonedaCLP(montoElegido)}) a la Cartera ${destino}. Conservan su código y quedan por revisar en esa cartera. ¿Continuar?`)) return;
    setTrabajando(true);
    try {
      const n = await traspasarProyectosDeCartera([...elegidos], destino, { email: user?.email });
      alert(`${n} proyecto(s) pasaron a la Cartera ${destino}. Elija ${destino} en el selector de la Cartera para verlos.`);
      onCerrar();
    } catch (err) {
      console.error('Error traspasando proyectos de cartera:', err);
      alert('No se pudieron traspasar todos los proyectos. Revise la cartera e intente nuevamente con los que falten.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-1 text-indigo-950">
        <p className="font-extrabold flex items-center gap-2 text-sm"><ArrowRightCircle className="w-4 h-4 text-indigo-600" /> Pasar proyectos a la Cartera {destino}</p>
        <p>
          Marque los proyectos de la Cartera {anio} que se defenderán de nuevo en {destino}. Es el mismo proyecto: conserva código, ficha, itemizado, documentos e historial, y queda por revisar en la cartera nueva.
        </p>
        {seQuedan > 0 && (
          <p className="text-indigo-800">
            {seQuedan} proyecto(s) adjudicado(s), en ejecución o terminados se quedan en la Cartera {anio} y no aparecen en esta lista.
          </p>
        )}
      </div>

      {candidatos.length === 0 ? (
        <p className="text-center text-slate-400 py-6">No hay proyectos sin adjudicar en la Cartera {anio}.</p>
      ) : (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
          {candidatos.map(p => (
            <label key={p.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => alternar(p.id)} className="w-4 h-4 text-indigo-600 rounded" />
              <span className="min-w-0 flex-1">
                <strong className="block text-slate-900 truncate">{p.nombre}</strong>
                <span className="text-[10px] text-slate-500"><span className="font-mono">{p.codigoProyecto}</span> · {ETIQUETA[decisionDeCartera(p)]}{p.presupuesto?.observacion ? ` · ${p.presupuesto.observacion}` : ''}</span>
              </span>
              <span className="font-black text-slate-700 tabular-nums shrink-0">{formatoMonedaCLP(p.valorAprox || 0)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-slate-600">{elegidos.size} proyecto(s) marcados · <strong>{formatoMonedaCLP(montoElegido)}</strong></span>
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold">Volver a la revisión</button>
          <button type="button" onClick={traspasar} disabled={trabajando || elegidos.size === 0} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-lg">
            {trabajando ? 'Traspasando…' : `Pasar a la Cartera ${destino}`}
          </button>
        </div>
      </div>
    </div>
  );
}
