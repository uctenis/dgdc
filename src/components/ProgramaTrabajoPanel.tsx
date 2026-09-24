import { useEffect, useState } from 'react';
import { CalendarRange, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import type { ProyectoMaestro } from '../types';
import { updateProyectoMaestro } from '../services/firestoreService';
import { sugerirProgramaTrabajoConIA, isAIConfigured, mensajeErrorIA } from '../services/aiService';
import { agruparPorFase, SIN_FASE } from '../utils/itemizadoOrganizer';
import { calcularFechaTerminoEfectiva } from '../utils/avanceFinanciero';

interface Props {
  proyecto: ProyectoMaestro;
  /** Respaldo cuando el proyecto maestro aún no tiene fecha de inicio/plazo propios (ej. los del encabezado de la ficha). */
  fechaInicioRespaldo?: string;
  duracionRespaldoDias?: number;
}

interface FaseProgramada {
  fase: string;
  diaInicio: number;
  diaTermino: number;
}

const COLORES_FASE = ['bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500', 'bg-slate-500'];

function calcularDuracionTotalDias(proyecto: ProyectoMaestro): number {
  const fechaTermino = calcularFechaTerminoEfectiva(proyecto);
  if (proyecto.fechaInicio && fechaTermino) {
    const dias = Math.round((new Date(fechaTermino).getTime() - new Date(proyecto.fechaInicio).getTime()) / 86400000);
    if (dias > 0) return dias;
  }
  return proyecto.plazoEjecucionDias || proyecto.duracionEstimadaDias || 0;
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

/**
 * Reparto determinístico (sin IA): fases en orden, cada una dura en proporción a su peso
 * presupuestario, con un traslape leve (10 % de su duración) con la fase anterior.
 */
function repartoPorPresupuesto(fases: { fase: string; pesoPresupuestario: number }[]) {
  const totalPeso = fases.reduce((s, f) => s + f.pesoPresupuestario, 0) || 1;
  const TRASLAPE = 0.1;
  let cursor = 0;
  const bruto = fases.map((f, i) => {
    const dur = f.pesoPresupuestario / totalPeso;
    const inicio = i === 0 ? 0 : Math.max(0, cursor - dur * TRASLAPE);
    cursor = inicio + dur;
    return { fase: f.fase, inicio, fin: cursor };
  });
  const escala = cursor > 0 ? 100 / cursor : 1;
  return bruto.map(b => ({ fase: b.fase, inicioPct: b.inicio * escala, duracionPct: (b.fin - b.inicio) * escala }));
}

export function ProgramaTrabajoPanel({ proyecto: proyectoBase, fechaInicioRespaldo, duracionRespaldoDias }: Props) {
  const proyecto: ProyectoMaestro = {
    ...proyectoBase,
    fechaInicio: proyectoBase.fechaInicio || fechaInicioRespaldo || undefined,
    duracionEstimadaDias: proyectoBase.duracionEstimadaDias || duracionRespaldoDias || undefined,
  };
  const [programa, setPrograma] = useState<FaseProgramada[]>(proyecto.programaTrabajo?.fases || []);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hayCambios, setHayCambios] = useState(false);
  const [duracionManual, setDuracionManual] = useState(0);

  useEffect(() => {
    setPrograma(proyecto.programaTrabajo?.fases || []);
    setHayCambios(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  const duracionCalculada = calcularDuracionTotalDias(proyecto);
  const duracionTotalDias = duracionCalculada || duracionManual;
  const gruposConMonto = agruparPorFase(proyecto.itemizado || [])
    .map(g => ({ fase: g.fase, monto: g.items.reduce((s, it) => s + (it.precioTotal || 0), 0) }))
    .filter(g => g.monto > 0);
  // Las partidas sin fase solo se programan como una única fase si ninguna está clasificada.
  const conFase = gruposConMonto.filter(g => g.fase !== SIN_FASE);
  const fasesDelItemizado = conFase.length > 0
    ? conFase
    : gruposConMonto.map(g => ({ ...g, fase: 'Ejecución de obra' }));
  const totalItemizado = fasesDelItemizado.reduce((s, f) => s + f.monto, 0);

  // El programa se habilita cuando TODAS las partidas del presupuesto estimativo tienen su información.
  const partidas = proyecto.itemizado || [];
  const partidasIncompletas = partidas.filter(it =>
    !it.descripcion?.trim() || !it.unidad?.trim() || !(it.cantidad > 0) || !(it.precioUnitario > 0)
  ).length;
  const hayFasesClasificadas = partidas.some(it => it.fase && it.fase !== SIN_FASE);
  const partidasSinFase = hayFasesClasificadas ? partidas.filter(it => !it.fase || it.fase === SIN_FASE).length : 0;
  const presupuestoCompleto = partidas.length > 0 && partidasIncompletas === 0 && partidasSinFase === 0;

  const puedeGenerar = presupuestoCompleto && duracionTotalDias > 0 && fasesDelItemizado.length > 0;

  const generar = async () => {
    setError(null);
    setGenerando(true);
    try {
      const fasesConPeso = fasesDelItemizado.map(f => ({
        fase: f.fase,
        pesoPresupuestario: totalItemizado > 0 ? Math.round((f.monto / totalItemizado) * 100) : 0,
      }));
      let sugerencias: { fase: string; inicioPct: number; duracionPct: number }[] = [];
      let motivoRespaldo = '';
      if (fasesConPeso.length === 1) {
        sugerencias = [{ fase: fasesConPeso[0].fase, inicioPct: 0, duracionPct: 100 }];
      } else if (!isAIConfigured()) {
        motivoRespaldo = 'La IA no está configurada';
      } else {
        try {
          sugerencias = await sugerirProgramaTrabajoConIA({
            tipoObra: proyecto.tipoObra,
            duracionTotalDias,
            fases: fasesConPeso,
          });
          const nombres = new Set(fasesConPeso.map(f => f.fase));
          if (sugerencias.length !== fasesConPeso.length || !sugerencias.every(x => nombres.has(x.fase))) {
            sugerencias = [];
            motivoRespaldo = 'La IA devolvió una secuencia inconsistente con las fases del presupuesto';
          }
        } catch (err) {
          console.error('Error generando el programa de trabajo con IA:', err);
          motivoRespaldo = 'La IA no respondió';
        }
      }
      if (!sugerencias.length) {
        sugerencias = repartoPorPresupuesto(fasesConPeso);
        setError(`${motivoRespaldo}: se calculó el programa proporcional al presupuesto de cada fase (ajústelo manualmente si corresponde).`);
      }
      setPrograma(sugerencias.map(s => ({
        fase: s.fase,
        diaInicio: Math.round((s.inicioPct / 100) * duracionTotalDias),
        diaTermino: Math.min(duracionTotalDias, Math.round(((s.inicioPct + s.duracionPct) / 100) * duracionTotalDias)),
      })));
      setHayCambios(true);
    } catch (err) {
      console.error('Error generando el programa de trabajo con IA:', err);
      setError(mensajeErrorIA(err));
    } finally {
      setGenerando(false);
    }
  };

  const actualizarFase = (index: number, cambios: Partial<FaseProgramada>) => {
    setPrograma(actuales => actuales.map((f, i) => (i === index ? { ...f, ...cambios } : f)));
    setHayCambios(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await updateProyectoMaestro(proyecto.id, {
        programaTrabajo: {
          fechaGeneracion: new Date().toISOString(),
          duracionTotalDias,
          fases: programa,
        },
        ...(!duracionCalculada && duracionManual > 0 ? { duracionEstimadaDias: duracionManual } : {}),
      });
      setHayCambios(false);
    } catch (err) {
      console.error('Error guardando el programa de trabajo:', err);
      alert('No se pudo guardar el programa de trabajo. Intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-indigo-600" />
            Programa de Trabajo (Carta Gantt Referencial)
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Secuencia estimada por fase, calculada a partir del peso presupuestario de cada fase del Itemizado y la duración total del proyecto — es referencial, no reemplaza la Carta Gantt formal de licitación.
          </p>
        </div>
        <button
          type="button"
          onClick={generar}
          disabled={generando || !puedeGenerar}
          title={!puedeGenerar ? 'Complete todas las partidas del presupuesto estimativo y declare la duración del proyecto' : undefined}
          className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed border border-violet-200 text-violet-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm shrink-0"
        >
          {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generando ? 'Generando…' : programa.length > 0 ? 'Regenerar Programa' : 'Generar Programa'}
        </button>
      </div>

      {partidas.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className={`font-bold ${presupuestoCompleto ? 'text-emerald-700' : 'text-amber-700'}`}>
            {partidas.length - partidasIncompletas}/{partidas.length} partidas completas
          </span>
          {presupuestoCompleto && <span className="text-emerald-700">· Presupuesto estimativo listo para programar</span>}
        </div>
      )}

      {!duracionCalculada && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-600">
          <span className="font-bold">Duración total del proyecto:</span>
          <input
            type="number"
            min={0}
            value={duracionManual || ''}
            onChange={e => { setDuracionManual(Math.max(0, Number(e.target.value) || 0)); setHayCambios(true); }}
            placeholder="0"
            className="w-20 p-1 border border-slate-200 rounded text-right"
          />
          <span>días corridos (o declare Inicio y Plazo en el resumen del proyecto)</span>
        </div>
      )}

      {!puedeGenerar && (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-500">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {partidas.length === 0 && 'Falta el Presupuesto Estimativo: agregue las partidas del proyecto para poder generar la Gantt.'}
            {partidasIncompletas > 0 && `${partidasIncompletas} partida(s) sin información completa (descripción, unidad, cantidad y precio unitario). `}
            {partidasSinFase > 0 && `${partidasSinFase} partida(s) sin fase asignada. `}
            {presupuestoCompleto && duracionTotalDias === 0 && 'Declare la duración total del proyecto para generar la Gantt.'}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {programa.length > 0 && (
        <>
          <div className="space-y-2">
            {programa.map((f, i) => (
              <div key={f.fase} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-[10px] font-bold text-slate-700 truncate" title={f.fase}>{f.fase}</span>
                <div className="flex-1 relative h-5 bg-slate-100 rounded-md overflow-hidden">
                  <div
                    className={`absolute top-0 h-full rounded-md ${COLORES_FASE[i % COLORES_FASE.length]} opacity-80`}
                    style={{
                      left: `${duracionTotalDias > 0 ? (f.diaInicio / duracionTotalDias) * 100 : 0}%`,
                      width: `${duracionTotalDias > 0 ? Math.max(2, ((f.diaTermino - f.diaInicio) / duracionTotalDias) * 100) : 0}%`,
                    }}
                    title={`${f.fase}: día ${f.diaInicio} a ${f.diaTermino}`}
                  />
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={duracionTotalDias}
                    value={f.diaInicio}
                    onChange={e => actualizarFase(i, { diaInicio: Number(e.target.value) })}
                    className="w-14 p-1 border border-slate-200 rounded text-right"
                  />
                  <span>a</span>
                  <input
                    type="number"
                    min={0}
                    max={duracionTotalDias}
                    value={f.diaTermino}
                    onChange={e => actualizarFase(i, { diaTermino: Number(e.target.value) })}
                    className="w-14 p-1 border border-slate-200 rounded text-right"
                  />
                  <span>días</span>
                </div>
                {proyecto.fechaInicio && (
                  <span className="text-[10px] text-slate-400 shrink-0 w-32 text-right">
                    {sumarDias(proyecto.fechaInicio, f.diaInicio)} → {sumarDias(proyecto.fechaInicio, f.diaTermino)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[10px] text-slate-400">
              Duración total: {duracionTotalDias} días
              {proyecto.fechaInicio ? ` · ${sumarDias(proyecto.fechaInicio, 0)} → ${sumarDias(proyecto.fechaInicio, duracionTotalDias)}` : ' (sin Fecha de Inicio declarada — se muestran solo días relativos)'}
            </span>
            <button
              type="button"
              onClick={guardar}
              disabled={!hayCambios || guardando}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-2"
            >
              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {guardando ? 'Guardando…' : hayCambios ? 'Guardar Programa' : 'Programa guardado'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
