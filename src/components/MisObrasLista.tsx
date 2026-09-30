import { ChevronRight, HardHat } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isProjectResponsible } from '../services/internalAccessService';
import type { LicitacionProyecto } from '../types';

const obraEnEjecucion = (l: LicitacionProyecto) =>
  Boolean(l.proveedorAdjudicadoId || l.proveedorGanadorId || l.estado === 'Adjudicado')
  && l.estado !== 'Cerrado' && l.estadoLifecycle !== 'Finalizado' && l.recepcionConforme?.aprobada !== true;

/**
 * Obras en ejecución a cargo del usuario (el responsable del proyecto es quien la inspecciona; el administrador ve
 * todas). Es la entrada al libro de obra, pensada para el celular.
 */
export function MisObrasLista({ licitaciones, onAbrir }: {
  licitaciones: LicitacionProyecto[];
  onAbrir: (licitacionId: string) => void;
}) {
  const { user, isAdmin } = useAuth();
  const obras = licitaciones
    .filter(obraEnEjecucion)
    .filter(l => isAdmin || isProjectResponsible(user?.email, l.responsableEmail))
    .sort((a, b) => a.nombreProyecto.localeCompare(b.nombreProyecto));

  if (!obras.length) {
    return (
      <div className="text-center py-16 space-y-2 text-slate-500">
        <HardHat className="w-10 h-10 mx-auto text-slate-300" />
        <p className="text-sm">No tiene obras en ejecución a su cargo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {obras.map(l => (
        <button
          key={l.id}
          type="button"
          onClick={() => onAbrir(l.id)}
          className="w-full text-left flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 hover:border-sky-300 active:bg-sky-50"
        >
          <HardHat className="w-6 h-6 text-amber-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800 line-clamp-2">{l.nombreProyecto}</p>
            <p className="text-[11px] text-slate-500">
              {l.codigoProyecto} · {l.proveedorAdjudicadoNombre || 'Contratista sin nombre'}
              {l.fechaTerminoProgramada && ` · término ${new Date(`${l.fechaTerminoProgramada.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL')}`}
              {isAdmin && l.responsableNombre && ` · ${l.responsableNombre}`}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
        </button>
      ))}
    </div>
  );
}
