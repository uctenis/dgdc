import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Target, TrendingDown, Timer, HardHat, Star, Users } from 'lucide-react';
import { getEvaluacionesDesempenoDeProveedores } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { adjudicada, calcularIndicadores, calcularMetas } from '../utils/indicadoresGestion';
import type { EvaluacionDesempeno, LicitacionProyecto, ProyectoMaestro } from '../types';

const pctTexto = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;

/** Un proveedor que concentra más de este % del monto adjudicado se marca para revisar la rotación. */
const UMBRAL_CONCENTRACION = 30;

function Indicador({ icon: Icon, label, valor, detalle }: { icon: typeof Timer; label: string; valor: string; detalle: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Icon className="w-3.5 h-3.5" />{label}</span>
      <span className="block text-lg font-black text-slate-800 tabular-nums mt-0.5">{valor}</span>
      <span className="block text-[10px] text-slate-500">{detalle}</span>
    </div>
  );
}

/**
 * Panel de gestión para la dirección: avance de las 3 metas de desempeño del departamento e indicadores del
 * proceso (duración, ahorro, obras atrasadas, reparto entre proveedores y su desempeño).
 */
export function IndicadoresGestion({ licitaciones, proyectos }: { licitaciones: LicitacionProyecto[]; proyectos: ProyectoMaestro[] }) {
  const [evaluaciones, setEvaluaciones] = useState<Record<string, EvaluacionDesempeno[]>>({});
  const idsAdjudicados = useMemo(
    () => [...new Set(licitaciones.filter(adjudicada).map(l => l.proveedorAdjudicadoId || l.proveedorGanadorId || '').filter(Boolean))].sort().join(','),
    [licitaciones]
  );
  useEffect(() => {
    if (!idsAdjudicados) return;
    getEvaluacionesDesempenoDeProveedores(idsAdjudicados.split(','))
      .then(setEvaluaciones)
      .catch(err => console.warn('No se pudieron leer las evaluaciones de desempeño:', err));
  }, [idsAdjudicados]);

  const ind = useMemo(() => calcularIndicadores(licitaciones, evaluaciones), [licitaciones, evaluaciones]);
  const metas = useMemo(() => calcularMetas(licitaciones, proyectos, evaluaciones), [licitaciones, proyectos, evaluaciones]);
  const maxMonto = ind.reparto[0]?.monto || 1;

  return (
    <div className="space-y-4">
      {/* Metas */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><Target className="w-4 h-4 text-indigo-600" /> Metas del departamento 2026</h3>
        <div className="divide-y divide-slate-100">
          {metas.map(m => {
            const cumplida = m.pct !== null && m.pct >= 80;
            return (
              <div key={m.id} className="py-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">Meta {m.id} · {m.titulo}</span>
                  <span className={`flex items-center gap-1 text-[11px] font-bold ${m.pct === null ? 'text-slate-400' : cumplida ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {m.pct === null ? 'Sin casos aún' : <>{cumplida ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}{m.pct}% {cumplida ? 'avanzada' : 'en curso'}</>}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${m.pct ?? 0}%`}>
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${m.pct ?? 0}%` }} />
                </div>
                <p className="text-[11px] text-slate-600">{m.detalle}.</p>
                {m.pendiente && <p className="text-[10px] text-slate-400">Pendiente: {m.pendiente}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Indicadores */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Indicador
          icon={Timer}
          label="Duración de licitación"
          valor={ind.proceso.promedioDias !== null ? `${ind.proceso.promedioDias} días` : '—'}
          detalle={ind.proceso.n ? `Promedio desde la creación hasta la adjudicación (${ind.proceso.n} licitaciones)` : 'Se medirá desde las próximas adjudicaciones'}
        />
        <Indicador
          icon={TrendingDown}
          label="Ahorro vs. estimado"
          valor={ind.ahorro.pct !== null ? pctTexto(ind.ahorro.pct) : '—'}
          detalle={ind.ahorro.n ? `${formatoMonedaCLP(ind.ahorro.ahorro)} en ${ind.ahorro.n} adjudicaciones` : 'Sin adjudicaciones comparables'}
        />
        <Indicador
          icon={HardHat}
          label="Obras fuera de plazo"
          valor={ind.obras.pctAtrasadas !== null ? `${ind.obras.atrasadas} de ${ind.obras.enEjecucion}` : '—'}
          detalle={ind.obras.enEjecucion ? `${ind.obras.pctAtrasadas}% de las obras en ejecución · ${ind.obras.finalizadas} finalizadas` : `${ind.obras.finalizadas} obras finalizadas`}
        />
        <Indicador
          icon={Star}
          label="Desempeño contratistas"
          valor={ind.desempeno.promedio !== null ? `${ind.desempeno.promedio.toLocaleString('es-CL')} / 5` : '—'}
          detalle={ind.desempeno.evaluaciones ? `Promedio de ${ind.desempeno.evaluaciones} evaluaciones` : 'Sin evaluaciones registradas'}
        />
      </section>

      {/* Reparto entre proveedores */}
      {ind.reparto.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><Users className="w-4 h-4 text-sky-600" /> Reparto de adjudicaciones por proveedor</h3>
            <p className="text-[10px] text-slate-500">Monto adjudicado (con IVA) por contratista. Sirve para cuidar la rotación de proveedores.</p>
          </div>
          {ind.concentracionMayor !== null && ind.concentracionMayor > UMBRAL_CONCENTRACION && (
            <p className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {ind.reparto[0].nombre} concentra el {pctTexto(ind.concentracionMayor)} del monto adjudicado (sobre {UMBRAL_CONCENTRACION}%).
            </p>
          )}
          <div className="space-y-2">
            {ind.reparto.slice(0, 10).map(p => (
              <div key={p.nombre} className="space-y-1" title={`${p.nombre}: ${formatoMonedaCLP(p.monto)} · ${p.obras} obras · ${pctTexto(p.pct)}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] font-semibold text-slate-700 truncate">{p.nombre}</span>
                  <span className="text-[11px] text-slate-600 tabular-nums text-right shrink-0">
                    {formatoMonedaCLP(p.monto)} · {pctTexto(p.pct)}
                    <span className="text-slate-400"> · {p.obras} obra{p.obras === 1 ? '' : 's'}{p.promedioDesempeno !== null ? ` · ★ ${p.promedioDesempeno.toLocaleString('es-CL')}` : ''}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(2, (p.monto / maxMonto) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          {ind.reparto.length > 10 && <p className="text-[10px] text-slate-400">Y {ind.reparto.length - 10} proveedores más.</p>}
        </section>
      )}
    </div>
  );
}
