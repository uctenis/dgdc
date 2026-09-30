import { useEffect, useState } from 'react';
import { HelpCircle, AlertTriangle } from 'lucide-react';
import { subscribeToConsultasPendientes } from '../services/firestoreService';
import { isProjectResponsible } from '../services/internalAccessService';
import { useAuth } from '../context/AuthContext';
import { estadoPlazoRespuesta } from './ConsultasManager';
import type { ConsultaLicitacion, LicitacionProyecto } from '../types';

const ORDEN_NIVEL = { vencido: 0, urgente: 1, normal: 2, 'sin-fecha': 3 };

/**
 * Alerta general del personal interno: consultas de proveedores sin responder en las licitaciones de las que
 * es responsable (el administrador ve todas), con el plazo que queda para responderlas.
 */
export function ConsultasPendientesAlerta({ licitaciones, onAbrir }: {
  licitaciones: LicitacionProyecto[];
  onAbrir: (licitacionId: string) => void;
}) {
  const { user, isAdmin } = useAuth();
  const [pendientes, setPendientes] = useState<(ConsultaLicitacion & { licitacionId: string })[]>([]);

  useEffect(() => subscribeToConsultasPendientes(setPendientes), []);

  const porLicitacion = licitaciones
    .filter(l => isAdmin || isProjectResponsible(user?.email, l.responsableEmail))
    .map(l => ({ licitacion: l, cantidad: pendientes.filter(c => c.licitacionId === l.id).length, plazo: estadoPlazoRespuesta(l) }))
    .filter(x => x.cantidad > 0)
    .sort((a, b) => ORDEN_NIVEL[a.plazo.nivel] - ORDEN_NIVEL[b.plazo.nivel]);

  if (!porLicitacion.length) return null;
  const hayUrgente = porLicitacion.some(x => x.plazo.nivel === 'vencido' || x.plazo.nivel === 'urgente');

  return (
    <div className={`mb-6 rounded-2xl border px-5 py-4 space-y-2 ${hayUrgente ? 'bg-amber-50 border-amber-300' : 'bg-sky-50 border-sky-200'}`}>
      <p className={`text-xs font-bold flex items-center gap-2 ${hayUrgente ? 'text-amber-900' : 'text-sky-900'}`}>
        {hayUrgente ? <AlertTriangle className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
        Consultas de proveedores sin responder
      </p>
      {porLicitacion.map(({ licitacion, cantidad, plazo }) => (
        <div key={licitacion.id} className="flex flex-wrap items-center gap-2 text-xs bg-white/70 border border-white rounded-xl px-3 py-2">
          <strong className="text-slate-800">{licitacion.codigoProyecto || licitacion.codigoCP}</strong>
          <span className="text-slate-700 truncate max-w-[40ch]">{licitacion.nombreProyecto}</span>
          <span className="font-bold text-amber-800">{cantidad} pendiente{cantidad === 1 ? '' : 's'}</span>
          <span className={`font-semibold ${plazo.nivel === 'vencido' ? 'text-red-700' : plazo.nivel === 'urgente' ? 'text-amber-800' : 'text-slate-500'}`}>
            · {plazo.texto}
          </span>
          <button
            type="button"
            onClick={() => onAbrir(licitacion.id)}
            className="ml-auto px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold"
          >
            Responder
          </button>
        </div>
      ))}
    </div>
  );
}
