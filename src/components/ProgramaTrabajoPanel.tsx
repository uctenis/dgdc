import { useEffect, useState } from 'react';
import { CalendarRange, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import type { ProyectoMaestro } from '../types';
import { updateProyectoMaestro } from '../services/firestoreService';
import { sugerirProgramaTrabajoConIA } from '../services/aiService';
import { agruparPorFase, SIN_FASE } from '../utils/itemizadoOrganizer';
import { calcularFechaTerminoEfectiva } from '../utils/avanceFinanciero';

interface Props {
  proyecto: ProyectoMaestro;
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

export function ProgramaTrabajoPanel({ proyecto }: Props) {
  const [programa, setPrograma] = useState<FaseProgramada[]>(proyecto.programaTrabajo?.fases || []);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hayCambios, setHayCambios] = useState(false);

  useEffect(() => {
    setPrograma(proyecto.programaTrabajo?.fases || []);
    setHayCambios(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  const duracionTotalDias = calcularDuracionTotalDias(proyecto);
  const fasesDelItemizado = agruparPorFase(proyecto.itemizado || [])
    .filter(g => g.fase !== SIN_FASE)
    .map(g => ({ fase: g.fase, monto: g.items.reduce((s, it) => s + (it.precioTotal || 0), 0) }))
    .filter(g => g.monto > 0);
  const totalItemizado = fasesDelItemizado.reduce((s, f) => s + f.monto, 0);

  const puedeGenerar = duracionTotalDias > 0 && fasesDelItemizado.length > 0;

  const generar = async () => {
    setError(null);
    setGenerando(true);
    try {
      const fasesConPeso = fasesDelItemizado.map(f => ({
        fase: f.fase,
        pesoPresupuestario: totalItemizado > 0 ? Math.round((f.monto / totalItemizado) * 100) : 0,
      }));
      const sugerencias = await sugerirProgramaTrabajoConIA({
        tipoObra: proyecto.tipoObra,
        duracionTotalDias,
        fases: fasesConPeso,
      });
      if (!sugerencias.length) {
        setError('La IA no devolvió una secuencia. Intente nuevamente.');
        return;
      }
      setPrograma(sugerencias.map(s => ({
        fase: s.fase,
        diaInicio: Math.round((s.inicioPct / 100) * duracionTotalDias),
        diaTermino: Math.min(duracionTotalDias, Math.round(((s.inicioPct + s.duracionPct) / 100) * duracionTotalDias)),
      })));
      setHayCambios(true);
    } catch (err) {
      console.error('Error generando el programa de trabajo con IA:', err);
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.includes('AI_API_KEY_NOT_CONFIGURED')
          ? 'La sugerencia por IA no está configurada en este ambiente (falta VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY).'
          : msg.includes('AI_TIMEOUT')
          ? 'La IA no respondió a tiempo. Intente nuevamente.'
          : 'No se pudo generar el programa de trabajo. Intente nuevamente.'
      );
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
          title={!puedeGenerar ? 'Complete el Itemizado (con fases) y la Duración/Fecha de Inicio del proyecto primero' : undefined}
          className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed border border-violet-200 text-violet-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm shrink-0"
        >
          {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generando ? 'Pensando…' : programa.length > 0 ? 'Regenerar con IA' : 'Generar Programa con IA'}
        </button>
      </div>

      {!puedeGenerar && (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-500">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {fasesDelItemizado.length === 0 && duracionTotalDias === 0 && 'Falta el Itemizado (con partidas clasificadas por fase) y la Duración Aproximada o Fecha de Inicio del proyecto.'}
            {fasesDelItemizado.length === 0 && duracionTotalDias > 0 && 'Falta el Itemizado del Proyecto — agregue partidas y clasifíquelas por fase para poder generar la secuencia.'}
            {fasesDelItemizado.length > 0 && duracionTotalDias === 0 && 'Falta declarar la Duración Aproximada (días) o la Fecha de Inicio del proyecto.'}
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
