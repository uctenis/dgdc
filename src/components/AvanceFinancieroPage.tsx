import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import {
  subscribeToProyectos,
  subscribeToLicitaciones,
  getEstadosPagoDeLicitaciones,
} from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import {
  construirFlujoCajaAnual,
  construirResumenPorProyecto,
  calcularFechaTerminoEfectiva,
  type SemaforoAvance,
} from '../utils/avanceFinanciero';
import type { ProyectoMaestro, LicitacionProyecto, EstadoPago, ConfiguracionFirmas } from '../types';

interface AvanceFinancieroPageProps {
  configFirmas?: ConfiguracionFirmas;
}

function formatoCompacto(valor: number): string {
  if (Math.abs(valor) >= 1_000_000) return `$${(valor / 1_000_000).toFixed(1)}M`;
  if (Math.abs(valor) >= 1_000) return `$${Math.round(valor / 1_000)}K`;
  return `$${Math.round(valor)}`;
}

const SEMAFORO_ESTILOS: Record<SemaforoAvance, string> = {
  'Adelantado': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'En línea': 'bg-sky-100 text-sky-800 border-sky-200',
  'Atrasado': 'bg-rose-100 text-rose-800 border-rose-200',
  'Sin programar': 'bg-slate-100 text-slate-500 border-slate-200',
};

export const AvanceFinancieroPage: React.FC<AvanceFinancieroPageProps> = ({ configFirmas }) => {
  const [proyectos, setProyectos] = useState<ProyectoMaestro[]>([]);
  const [licitaciones, setLicitaciones] = useState<LicitacionProyecto[]>([]);
  const [estadosPago, setEstadosPago] = useState<EstadoPago[]>([]);
  const [cargandoEstadosPago, setCargandoEstadosPago] = useState(false);
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);

  useEffect(() => subscribeToProyectos(setProyectos), []);
  useEffect(() => subscribeToLicitaciones(setLicitaciones), []);

  const licitacionIdsKey = useMemo(
    () => licitaciones.map(l => l.id).sort().join(','),
    [licitaciones]
  );

  const cargarEstadosPago = React.useCallback(async () => {
    if (licitaciones.length === 0) {
      setEstadosPago([]);
      return;
    }
    setCargandoEstadosPago(true);
    try {
      const datos = await getEstadosPagoDeLicitaciones(licitaciones.map(l => l.id));
      setEstadosPago(datos);
    } finally {
      setCargandoEstadosPago(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionIdsKey]);

  useEffect(() => {
    cargarEstadosPago();
  }, [cargarEstadosPago]);

  const aniosDisponibles = useMemo(() => {
    const anios = new Set<number>([anioActual]);
    proyectos.filter(p => p.presupuesto?.aprobado).forEach(p => {
      if (p.fechaInicio) anios.add(new Date(p.fechaInicio).getFullYear());
      const fin = calcularFechaTerminoEfectiva(p);
      if (fin) anios.add(new Date(fin).getFullYear());
    });
    return Array.from(anios).filter(a => !Number.isNaN(a)).sort((a, b) => a - b);
  }, [proyectos, anioActual]);

  const flujo = useMemo(
    () => construirFlujoCajaAnual({ proyectos, licitaciones, estadosPago, anio }),
    [proyectos, licitaciones, estadosPago, anio]
  );

  const resumen = useMemo(
    () => construirResumenPorProyecto({ proyectos, licitaciones, estadosPago }),
    [proyectos, licitaciones, estadosPago]
  );

  const proyectosAprobados = proyectos.filter(p => p.presupuesto?.aprobado);
  const sinProgramar = proyectosAprobados.filter(p => !p.fechaInicio || !calcularFechaTerminoEfectiva(p));

  const presupuestoAnualAprobado = configFirmas?.presupuestoAnualAprobado || 0;
  const totalProyectadoAnio = flujo.reduce((s, m) => s + m.proyectado, 0);
  const totalRealAnio = flujo.reduce((s, m) => s + m.real, 0);
  const totalAdjudicadoAprobados = proyectosAprobados.reduce((s, p) => s + (p.montoAdjudicado || 0), 0);

  const mesIndiceCorte = anio === anioActual ? new Date().getMonth() : 11;
  const proyectadoAFecha = flujo[mesIndiceCorte]?.proyectadoAcum || 0;
  const realAFecha = flujo[mesIndiceCorte]?.realAcum || 0;
  const desviacionGlobalPct = proyectadoAFecha > 0
    ? Math.round(((realAFecha - proyectadoAFecha) / proyectadoAFecha) * 100)
    : 0;

  // ── Geometría del gráfico Curva S (SVG, sin dependencias externas) ──
  const W = 760, H = 260, padL = 56, padR = 16, padT = 14, padB = 26;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(1, ...flujo.map(m => Math.max(m.proyectadoAcum, m.realAcum)));
  const xFor = (i: number) => padL + (chartW / 11) * i;
  const yFor = (v: number) => padT + chartH - (v / maxVal) * chartH;
  const puntosProyectado = flujo.map((m, i) => `${xFor(i)},${yFor(m.proyectadoAcum)}`).join(' ');
  const puntosReal = flujo.map((m, i) => `${xFor(i)},${yFor(m.realAcum)}`).join(' ');
  const areaGap = [
    ...flujo.map((m, i) => `${xFor(i)},${yFor(m.proyectadoAcum)}`),
    ...[...flujo].reverse().map((m, i) => `${xFor(11 - i)},${yFor(m.realAcum)}`),
  ].join(' ');
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));

  const barW = (chartW / 12) * 0.32;
  const maxMensual = Math.max(1, ...flujo.map(m => Math.max(m.proyectado, m.real)));
  const yForBar = (v: number) => (v / maxMensual) * (chartH * 0.9);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Avance Financiero — Presupuesto Proyectado vs Real
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Solo cuentan los proyectos con <strong>Presupuesto Aprobado</strong> (ver pestaña Cartera de Proyectos). El monto proyectado se distribuye mes a mes con una Curva S según fecha de inicio y término; el real se construye con los Estados de Pago Aprobados/Pagados de cada contrato adjudicado.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700 outline-none"
          >
            {aniosDisponibles.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button
            onClick={() => cargarEstadosPago()}
            disabled={cargandoEstadosPago}
            className="flex items-center gap-1.5 text-xs font-semibold border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Releer Estados de Pago (el real ejecutado no se actualiza en vivo en esta pestaña)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargandoEstadosPago ? 'animate-spin' : ''}`} />
            Actualizar Real
          </button>
        </div>
      </div>

      {sinProgramar.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>{sinProgramar.length}</strong> proyecto(s) aprobado(s) en Presupuesto no tienen Fecha de Inicio/Término definida y no se pueden proyectar mes a mes: {sinProgramar.map(p => p.nombre).slice(0, 3).join(', ')}{sinProgramar.length > 3 ? '…' : ''}. Complete esas fechas en la Cartera de Proyectos.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Techo Institucional {anio}</span>
          <span className="text-sm font-black text-slate-800">{presupuestoAnualAprobado > 0 ? formatoMonedaCLP(presupuestoAnualAprobado) : '—'}</span>
        </div>
        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-indigo-500 block">Proyectado {anio} (Aprobados)</span>
          <span className="text-sm font-black text-indigo-900">{formatoMonedaCLP(totalProyectadoAnio)}</span>
        </div>
        <div className="bg-violet-50 p-4 rounded-xl border border-violet-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-violet-500 block">Comprometido (Adjudicado)</span>
          <span className="text-sm font-black text-violet-900">{formatoMonedaCLP(totalAdjudicadoAprobados)}</span>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-emerald-500 block">Ejecutado Real {anio}</span>
          <span className="text-sm font-black text-emerald-900">{formatoMonedaCLP(totalRealAnio)}</span>
        </div>
        <div className={`p-4 rounded-xl border shadow-sm ${desviacionGlobalPct >= 0 ? 'bg-emerald-50 border-emerald-200' : desviacionGlobalPct >= -15 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
          <span className="text-[10px] font-bold uppercase text-slate-500 block">Desviación a la Fecha</span>
          <span className="text-lg font-black text-slate-800">{desviacionGlobalPct > 0 ? '+' : ''}{desviacionGlobalPct}%</span>
        </div>
      </div>

      {/* Gráfico Curva S: acumulado proyectado vs real + barras mensuales */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-slate-700">Curva S — Acumulado Proyectado vs Real</h3>
          <div className="flex items-center gap-3 text-[10px] font-semibold">
            <span className="flex items-center gap-1 text-indigo-700"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />Proyectado</span>
            <span className="flex items-center gap-1 text-emerald-700"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />Real</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-64">
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={yFor(v)} y2={yFor(v)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={yFor(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{formatoCompacto(v)}</text>
            </g>
          ))}
          {/* Barras mensuales (proyectado / real del mes) ancladas a la base */}
          {flujo.map((m, i) => (
            <g key={m.mes}>
              <rect
                x={xFor(i) - barW - 1}
                y={padT + chartH - yForBar(m.proyectado)}
                width={barW}
                height={yForBar(m.proyectado)}
                fill="#c7d2fe"
                opacity={0.7}
              >
                <title>{`${m.mesLabel}: Proyectado ${formatoMonedaCLP(m.proyectado)}`}</title>
              </rect>
              <rect
                x={xFor(i) + 1}
                y={padT + chartH - yForBar(m.real)}
                width={barW}
                height={yForBar(m.real)}
                fill="#a7f3d0"
                opacity={0.8}
              >
                <title>{`${m.mesLabel}: Real ${formatoMonedaCLP(m.real)}`}</title>
              </rect>
              <text x={xFor(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#64748b">{m.mesLabel}</text>
            </g>
          ))}
          <polygon points={areaGap} fill={desviacionGlobalPct >= 0 ? '#10b981' : '#f43f5e'} opacity={0.06} />
          <polyline points={puntosProyectado} fill="none" stroke="#4f46e5" strokeWidth={2.5} />
          <polyline points={puntosReal} fill="none" stroke="#059669" strokeWidth={2.5} />
          {flujo.map((m, i) => (
            <circle key={`p-${m.mes}`} cx={xFor(i)} cy={yFor(m.proyectadoAcum)} r={2.5} fill="#4f46e5">
              <title>{`${m.mesLabel}: Proyectado acumulado ${formatoMonedaCLP(m.proyectadoAcum)}`}</title>
            </circle>
          ))}
          {flujo.map((m, i) => (
            <circle key={`r-${m.mes}`} cx={xFor(i)} cy={yFor(m.realAcum)} r={2.5} fill="#059669">
              <title>{`${m.mesLabel}: Real acumulado ${formatoMonedaCLP(m.realAcum)}`}</title>
            </circle>
          ))}
        </svg>
        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          Líneas: acumulado anual. Barras: gasto del mes (claro = proyectado, verde = real).
        </p>
      </div>

      {/* Tabla comparativa por proyecto */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs min-w-[920px]">
          <thead className="bg-slate-900 text-white sticky top-0">
            <tr>
              <th className="px-3 py-2.5 text-left font-bold">Proyecto</th>
              <th className="px-2 py-2.5 text-center font-bold">Ventana</th>
              <th className="px-2 py-2.5 text-center font-bold">Estado Licitación</th>
              <th className="px-2 py-2.5 text-right font-bold">Proyectado</th>
              <th className="px-2 py-2.5 text-right font-bold">Adjudicado</th>
              <th className="px-2 py-2.5 text-right font-bold">Ejecutado Real</th>
              <th className="px-2 py-2.5 text-center font-bold">Avance (Real vs Esperado)</th>
              <th className="px-2 py-2.5 text-center font-bold">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {resumen.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400 italic">Ningún proyecto tiene Presupuesto Aprobado todavía. Actívelo desde la Cartera de Proyectos.</td></tr>
            ) : resumen.map(r => (
              <tr key={r.proyecto.id} className="hover:bg-slate-50/70">
                <td className="px-3 py-2.5">
                  <span className="font-bold text-slate-800 block line-clamp-1">{r.proyecto.nombre}</span>
                  <span className="text-[10px] text-slate-400">{r.proyecto.codigoProyecto}</span>
                </td>
                <td className="px-2 py-2.5 text-center text-[10px] text-slate-500 whitespace-nowrap">
                  {r.fechaInicio ? new Date(r.fechaInicio).toLocaleDateString('es-CL') : '—'}
                  {' → '}
                  {r.fechaTermino ? new Date(r.fechaTermino).toLocaleDateString('es-CL') : '—'}
                </td>
                <td className="px-2 py-2.5 text-center">
                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {r.estadoLicitacion || 'Sin licitar'}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right font-bold text-slate-700">{formatoMonedaCLP(r.montoProyectado)}</td>
                <td className="px-2 py-2.5 text-right">
                  {r.montoAdjudicado ? <span className="font-bold text-violet-700">{formatoMonedaCLP(r.montoAdjudicado)}</span> : <span className="text-slate-300">-</span>}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {r.ejecutadoReal ? <span className="font-bold text-emerald-700">{formatoMonedaCLP(r.ejecutadoReal)}</span> : <span className="text-slate-300">-</span>}
                </td>
                <td className="px-2 py-2.5 text-center">
                  {r.semaforo === 'Sin programar' ? (
                    <span className="text-slate-300">-</span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-600">{r.pctAvanceReal}% <span className="text-slate-400 font-normal">/ {r.pctEsperadoAFecha}% esp.</span></span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SEMAFORO_ESTILOS[r.semaforo]}`}>
                    {r.semaforo}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
