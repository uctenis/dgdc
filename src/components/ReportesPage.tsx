import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, CheckCircle2, XCircle, MinusCircle, ShieldAlert } from 'lucide-react';
import type { LicitacionProyecto, Cotizacion, ProyectoMaestro } from '../types';
import { subscribeToProyectos } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { auditarLicitacion, type AuditoriaLicitacion } from '../utils/auditoriaReport';
import { generarReporteAuditoriaExcel } from '../utils/reporteExcelExport';

interface ReportesPageProps {
  licitaciones: LicitacionProyecto[];
  cotizaciones: Cotizacion[];
}

export function ReportesPage({ licitaciones, cotizaciones }: ReportesPageProps) {
  const [proyectos, setProyectos] = useState<ProyectoMaestro[]>([]);
  const [exportando, setExportando] = useState(false);

  useEffect(() => subscribeToProyectos(setProyectos), []);

  const proyectoPorLicitacion = useMemo(() => {
    const porId = new Map(proyectos.map(p => [p.id, p]));
    const porCodigo = new Map(proyectos.map(p => [p.codigoProyecto, p]));
    return (l: LicitacionProyecto): ProyectoMaestro | undefined =>
      (l.proyectoMaestroId && porId.get(l.proyectoMaestroId)) || porCodigo.get(l.codigoProyecto);
  }, [proyectos]);

  const auditorias: AuditoriaLicitacion[] = useMemo(() => {
    return licitaciones.map(l => {
      const cantidadOfertas = cotizaciones.filter(c => c.licitacionId === l.id).length;
      return auditarLicitacion(l, cantidadOfertas, proyectoPorLicitacion(l));
    });
  }, [licitaciones, cotizaciones, proyectoPorLicitacion]);

  const conBrechas = auditorias.filter(a => a.pctCompletitud < 100);

  const kpis = useMemo(() => {
    const totalCartera = proyectos.reduce((s, p) => s + (p.valorAprox || 0), 0);
    const totalAdjudicado = proyectos.reduce((s, p) => s + (p.montoAdjudicado || 0), 0);
    const totalGastado = proyectos.reduce((s, p) => s + (p.gastoEfectivo || 0), 0);
    const promedioCompletitud = auditorias.length
      ? Math.round(auditorias.reduce((s, a) => s + a.pctCompletitud, 0) / auditorias.length)
      : 100;
    return { totalCartera, totalAdjudicado, totalGastado, promedioCompletitud };
  }, [proyectos, auditorias]);

  const exportar = async () => {
    setExportando(true);
    try {
      await generarReporteAuditoriaExcel(proyectos, auditorias);
    } finally {
      setExportando(false);
    }
  };

  const iconoCheck = (estado: 'ok' | 'falta' | 'na') => {
    if (estado === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    if (estado === 'falta') return <XCircle className="w-4 h-4 text-rose-600" />;
    return <MinusCircle className="w-4 h-4 text-slate-300" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Reportes y Auditoría
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Estado consolidado de la Cartera y expediente de respaldo por licitación — lo que normalmente se solicita en una auditoría (Contraloría, Secretaría General o auditoría interna).
          </p>
        </div>
        <button
          onClick={exportar}
          disabled={exportando}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm transition text-xs shrink-0"
        >
          <Download className="w-4 h-4" />
          {exportando ? 'Generando…' : 'Exportar Reporte Completo (.xlsx)'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Presupuesto Cartera</span>
          <span className="text-sm font-black text-slate-800">{formatoMonedaCLP(kpis.totalCartera)}</span>
        </div>
        <div className="bg-sky-50 p-4 rounded-xl border border-sky-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-sky-600 block">Monto Adjudicado</span>
          <span className="text-sm font-black text-sky-800">{formatoMonedaCLP(kpis.totalAdjudicado)}</span>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-emerald-600 block">Gasto Efectivo</span>
          <span className="text-sm font-black text-emerald-800">{formatoMonedaCLP(kpis.totalGastado)}</span>
        </div>
        <div className={`p-4 rounded-xl border shadow-sm ${kpis.promedioCompletitud >= 90 ? 'bg-emerald-50 border-emerald-200' : kpis.promedioCompletitud >= 70 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
          <span className="text-[10px] font-bold uppercase text-slate-500 block">Completitud Expedientes</span>
          <span className="text-lg font-black text-slate-800">{kpis.promedioCompletitud}%</span>
        </div>
      </div>

      {conBrechas.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span><strong>{conBrechas.length}</strong> licitación(es) con al menos un ítem pendiente de respaldo documental. Revise la tabla de abajo — las columnas en rojo son las que faltan.</span>
        </div>
      )}

      {/* Tabla de auditoría */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="bg-slate-900 text-white sticky top-0">
            <tr>
              <th className="px-3 py-3 text-left font-bold">Licitación</th>
              {auditorias[0]?.checks.map(c => (
                <th key={c.id} className="px-2 py-3 text-center font-bold whitespace-nowrap">{c.etiqueta}</th>
              ))}
              <th className="px-3 py-3 text-center font-bold">Completitud</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {auditorias.length === 0 ? (
              <tr><td colSpan={100} className="text-center py-10 text-slate-400 italic">No hay licitaciones registradas todavía.</td></tr>
            ) : auditorias.map(a => (
              <tr key={a.licitacion.id} className={a.pctCompletitud < 100 ? 'bg-amber-50/40' : ''}>
                <td className="px-3 py-2.5">
                  <span className="font-bold text-slate-800 block line-clamp-1">{a.licitacion.nombreProyecto}</span>
                  <span className="text-[10px] text-slate-400">{a.licitacion.codigoProyecto} · {a.licitacion.estadoLifecycle || a.licitacion.estado}</span>
                </td>
                {a.checks.map(c => (
                  <td key={c.id} className="px-2 py-2.5 text-center" title={c.detalle}>
                    <div className="flex justify-center">{iconoCheck(c.estado)}</div>
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center">
                  <span className={`font-black ${a.pctCompletitud === 100 ? 'text-emerald-700' : a.pctCompletitud >= 70 ? 'text-amber-700' : 'text-rose-700'}`}>
                    {a.pctCompletitud}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400">
        Nota: los ítems se marcan "N/A" (gris) cuando la etapa del proceso todavía no los exige — por ejemplo, una licitación en evaluación no requiere aún Acta de Recepción. La evaluación de desempeño de proveedores se audita por separado en el módulo de Proveedores.
      </p>
    </div>
  );
}
