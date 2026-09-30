import { useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import { subscribeToGarantiasVigentes } from '../services/firestoreService';
import { isProjectResponsible } from '../services/internalAccessService';
import { useAuth } from '../context/AuthContext';
import { estadoVencimiento, requiereAviso, documentosConAviso, DIAS_AVISO_VENCIMIENTO, type EstadoVencimiento } from '../utils/vencimientos';
import type { GarantiaLicitacion, LicitacionProyecto, Proveedor } from '../types';

interface Aviso {
  clave: string;
  titulo: string;
  detalle: string;
  estado: EstadoVencimiento;
  accion: () => void;
  textoAccion: string;
}

const VISIBLES = 5;

/**
 * Alerta general de vencimientos: garantías vigentes vencidas o por vencer (de las licitaciones de las que el
 * usuario es responsable; el administrador ve todas) y, para el administrador, documentos de proveedores activos.
 */
export function VencimientosAlerta({ licitaciones, proveedores, onAbrirGarantias, onAbrirProveedores }: {
  licitaciones: LicitacionProyecto[];
  proveedores: Proveedor[];
  onAbrirGarantias: (licitacionId: string) => void;
  onAbrirProveedores: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const [garantias, setGarantias] = useState<(GarantiaLicitacion & { licitacionId: string })[]>([]);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => subscribeToGarantiasVigentes(setGarantias), []);

  const avisos: Aviso[] = [];
  for (const g of garantias) {
    const lic = licitaciones.find(l => l.id === g.licitacionId);
    if (!lic || !(isAdmin || isProjectResponsible(user?.email, lic.responsableEmail))) continue;
    const estado = estadoVencimiento(g.fechaVencimiento);
    if (!requiereAviso(estado)) continue;
    avisos.push({
      clave: `g-${g.licitacionId}-${g.id}`,
      titulo: `${g.tipo} · ${g.instrumento} N° ${g.numero}`,
      detalle: `${lic.codigoProyecto || lic.codigoCP} ${lic.nombreProyecto}${g.proveedorNombre ? ` · ${g.proveedorNombre}` : ''}`,
      estado,
      accion: () => onAbrirGarantias(lic.id),
      textoAccion: 'Ver garantía',
    });
  }
  if (isAdmin) {
    for (const p of proveedores.filter(x => x.estado === 'Activo')) {
      for (const d of documentosConAviso(p)) {
        avisos.push({
          clave: `d-${p.id}-${d.documento.id}`,
          titulo: d.nombre,
          detalle: p.razonSocial,
          estado: d.estado,
          accion: onAbrirProveedores,
          textoAccion: 'Ver proveedor',
        });
      }
    }
  }

  if (!avisos.length) return null;
  avisos.sort((a, b) => (a.estado.dias ?? 0) - (b.estado.dias ?? 0));
  const vencidos = avisos.filter(a => a.estado.nivel === 'vencido').length;
  const mostrados = verTodos ? avisos : avisos.slice(0, VISIBLES);

  return (
    <div className={`mb-6 rounded-2xl border px-5 py-4 space-y-2 ${vencidos ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
      <p className={`text-xs font-bold flex items-center gap-2 ${vencidos ? 'text-red-900' : 'text-amber-900'}`}>
        <CalendarClock className="w-4 h-4" />
        Vencimientos: {vencidos > 0 && `${vencidos} vencido${vencidos === 1 ? '' : 's'}, `}
        {avisos.length - vencidos} por vencer en los próximos {DIAS_AVISO_VENCIMIENTO} días
      </p>
      {mostrados.map(a => (
        <div key={a.clave} className="flex flex-wrap items-center gap-2 text-xs bg-white/70 border border-white rounded-xl px-3 py-2">
          <strong className="text-slate-800">{a.titulo}</strong>
          <span className="text-slate-600 truncate max-w-[45ch]">{a.detalle}</span>
          <span className={`font-semibold ${a.estado.nivel === 'vencido' ? 'text-red-700' : 'text-amber-800'}`}>· {a.estado.texto}</span>
          <button
            type="button"
            onClick={a.accion}
            className="ml-auto px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold"
          >
            {a.textoAccion}
          </button>
        </div>
      ))}
      {avisos.length > VISIBLES && (
        <button type="button" onClick={() => setVerTodos(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900">
          {verTodos ? <><ChevronUp className="w-3.5 h-3.5" /> Ver menos</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver los {avisos.length}</>}
        </button>
      )}
    </div>
  );
}
