import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Sparkles, Loader2, AlertTriangle, Check } from 'lucide-react';
import type { ProyectoMaestro } from '../types';
import { updateProyectoMaestro } from '../services/firestoreService';
import { sugerirProgramaTrabajoConIA, isAIConfigured, mensajeErrorIA } from '../services/aiService';
import { agruparPorFase, SIN_FASE } from '../utils/itemizadoOrganizer';
import { calcularFechaTerminoEfectiva } from '../utils/avanceFinanciero';
import { GanttFases } from './GanttFases';

interface Props {
  proyecto: ProyectoMaestro;
  /** Fecha de Inicio que muestra la cabecera de la ficha (Calendario y Plazos): es el día 0 del programa. */
  fechaInicioFicha?: string;
  /** Duración que muestra la cabecera de la ficha, en días corridos. */
  duracionFichaDias?: number;
  /** Plazo del contrato adjudicado. Si existe, el programa se ajusta a él y la IA no estima otro. */
  plazoContractualDias?: number;
  ubicacion?: string;
  /** Avisa a la ficha el plazo que estimó la IA, para que su cabecera lo muestre de inmediato. */
  onPlazoEstimado?: (dias: number, fechaTermino?: string) => void;
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

// Medianoche local: new Date('YYYY-MM-DD') es UTC y en Chile mostraba el día anterior.
const fechaLocal = (fechaISO: string) => new Date(`${fechaISO.slice(0, 10)}T00:00:00`);
const aISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function sumarDias(fechaISO: string, dias: number): string {
  const d = fechaLocal(fechaISO);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

function fechaMasDias(fechaISO: string, dias: number): string {
  const d = fechaLocal(fechaISO);
  d.setDate(d.getDate() + dias);
  return aISO(d);
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

export function ProgramaTrabajoPanel({ proyecto: proyectoBase, fechaInicioFicha, duracionFichaDias, plazoContractualDias, ubicacion, onPlazoEstimado }: Props) {
  // El día 0 es la Fecha de Inicio que se ve en la ficha; si la ficha no la tiene, la del proyecto.
  const proyecto: ProyectoMaestro = {
    ...proyectoBase,
    fechaInicio: fechaInicioFicha || proyectoBase.fechaInicio || undefined,
    duracionEstimadaDias: proyectoBase.duracionEstimadaDias || duracionFichaDias || undefined,
  };
  const [programa, setPrograma] = useState<FaseProgramada[]>(proyecto.programaTrabajo?.fases || []);
  // Plazo del programa vigente (el que estimó la IA o el guardado); 0 = aún no hay programa.
  const [duracionPrograma, setDuracionPrograma] = useState(proyecto.programaTrabajo?.duracionTotalDias || 0);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [hayCambios, setHayCambios] = useState(false);
  const [duracionManual, setDuracionManual] = useState(0);

  useEffect(() => {
    setPrograma(proyecto.programaTrabajo?.fases || []);
    setDuracionPrograma(proyecto.programaTrabajo?.duracionTotalDias || 0);
    setHayCambios(false);
    setAviso(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  // Plazo declarado (contrato, ficha o proyecto): base del reparto sin IA y referencia para la IA.
  const plazoDeclarado = plazoContractualDias || duracionFichaDias || calcularDuracionTotalDias(proyecto) || duracionManual;
  const duracionTotalDias = plazoContractualDias || duracionPrograma || plazoDeclarado;
  const gruposConMonto = agruparPorFase(proyecto.itemizado || [])
    .map(g => ({ fase: g.fase, monto: g.items.reduce((s, it) => s + (it.precioTotal || 0), 0), items: g.items }))
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

  // Con IA el plazo lo estima ella; sin IA hace falta un plazo declarado para repartirlo.
  const puedeGenerar = presupuestoCompleto && fasesDelItemizado.length > 0 && (isAIConfigured() || plazoDeclarado > 0);
  // Con Fecha de Inicio y duración se dibuja la carta con fechas reales; si falta algo, barras en días relativos.
  const conGantt = Boolean(proyecto.fechaInicio) && duracionTotalDias > 0;

  /** Guarda el programa. Si el plazo lo estimó la IA (sin contrato), también pasa a ser el plazo del proyecto. */
  const guardar = async (fases: FaseProgramada[] = programa, total: number = duracionTotalDias, plazoEstimado = false) => {
    if (!fases.length || total <= 0) return;
    setGuardando(true);
    try {
      const actualizarPlazo = plazoEstimado && !plazoContractualDias;
      const fechaTermino = actualizarPlazo && proyecto.fechaInicio ? fechaMasDias(proyecto.fechaInicio, total) : undefined;
      await updateProyectoMaestro(proyecto.id, {
        programaTrabajo: { fechaGeneracion: new Date().toISOString(), duracionTotalDias: total, fases },
        ...(actualizarPlazo ? { duracionEstimadaDias: total, ...(fechaTermino ? { fechaTermino } : {}) } : {}),
        ...(!actualizarPlazo && !calcularDuracionTotalDias(proyectoBase) && duracionManual > 0 ? { duracionEstimadaDias: duracionManual } : {}),
        // La fecha de inicio de la ficha queda también en el proyecto, para que cronograma y ficha no se separen.
        ...(proyecto.fechaInicio && proyecto.fechaInicio !== proyectoBase.fechaInicio ? { fechaInicio: proyecto.fechaInicio } : {}),
      });
      if (actualizarPlazo) onPlazoEstimado?.(total, fechaTermino);
      setHayCambios(false);
    } catch (err) {
      console.error('Error guardando el programa de trabajo:', err);
      setError('No se pudo guardar el programa de trabajo. Revise su conexión y presione «Guardar ahora».');
      setHayCambios(true);
    } finally {
      setGuardando(false);
    }
  };

  const generar = async () => {
    setError(null);
    setAviso(null);
    setGenerando(true);
    try {
      const fasesConPeso = fasesDelItemizado.map(f => ({
        fase: f.fase,
        pesoPresupuestario: totalItemizado > 0 ? Math.round((f.monto / totalItemizado) * 100) : 0,
        partidas: f.items.map(it => ({ descripcion: it.descripcion, unidad: it.unidad, cantidad: it.cantidad })),
      }));
      let fases: FaseProgramada[] = [];
      let estimadoPorIA = false;
      let motivoRespaldo = '';
      if (!isAIConfigured()) {
        motivoRespaldo = 'La IA no está configurada';
      } else {
        try {
          const sugerencias = await sugerirProgramaTrabajoConIA({
            nombre: proyecto.nombre,
            tipoObra: proyecto.tipoObra,
            ubicacion,
            fases: fasesConPeso,
            plazoContractualDias,
            plazoReferenciaDias: plazoContractualDias ? undefined : (plazoDeclarado || undefined),
          });
          const nombres = new Set(fasesConPeso.map(f => f.fase));
          if (sugerencias.length !== fasesConPeso.length || !sugerencias.every(x => nombres.has(x.fase))) {
            motivoRespaldo = 'La IA devolvió una secuencia inconsistente con las fases del presupuesto';
          } else {
            fases = sugerencias.map(x => ({ fase: x.fase, diaInicio: x.diaInicio, diaTermino: x.diaInicio + x.duracionDias }));
            estimadoPorIA = true;
          }
        } catch (err) {
          console.error('Error generando el programa de trabajo con IA:', err);
          motivoRespaldo = mensajeErrorIA(err).replace(/\.$/, '');
        }
      }

      let total: number;
      if (estimadoPorIA) {
        total = Math.max(...fases.map(f => f.diaTermino));
        // Con contrato, el programa debe caber exactamente en su plazo: se reescala si la IA se pasó o quedó corta.
        if (plazoContractualDias && total !== plazoContractualDias) {
          const factor = plazoContractualDias / total;
          fases = fases.map(f => {
            const diaInicio = Math.min(plazoContractualDias - 1, Math.round(f.diaInicio * factor));
            return { ...f, diaInicio, diaTermino: Math.min(plazoContractualDias, Math.max(diaInicio + 1, Math.round(f.diaTermino * factor))) };
          });
          total = plazoContractualDias;
        }
      } else {
        if (!(plazoDeclarado > 0)) {
          setError(`${motivoRespaldo}. Declare la duración del proyecto para calcular el programa sin IA, o intente nuevamente.`);
          return;
        }
        total = plazoDeclarado;
        fases = repartoPorPresupuesto(fasesConPeso).map(s => {
          const diaInicio = Math.min(total - 1, Math.round((s.inicioPct / 100) * total));
          return { fase: s.fase, diaInicio, diaTermino: Math.min(total, Math.max(diaInicio + 1, Math.round(((s.inicioPct + s.duracionPct) / 100) * total))) };
        });
        setError(`${motivoRespaldo}: se calculó el programa proporcional al presupuesto de cada fase, sobre ${total} días (ajústelo manualmente si corresponde).`);
      }

      setPrograma(fases);
      setDuracionPrograma(total);
      if (estimadoPorIA && !plazoContractualDias) {
        const anterior = proyectoBase.duracionEstimadaDias || duracionFichaDias || 0;
        setAviso(anterior && anterior !== total
          ? `La IA estimó un plazo de ${total} días corridos según las partidas (el proyecto tenía ${anterior}). El plazo del proyecto se actualizó a ${total} días.`
          : `La IA estimó un plazo de ${total} días corridos según las partidas.`);
      }
      // El programa generado se guarda de inmediato: no depende de que alguien presione un botón.
      await guardar(fases, total, estimadoPorIA);
    } finally {
      setGenerando(false);
    }
  };

  const actualizarFase = (index: number, cambios: Partial<FaseProgramada>) => {
    setPrograma(actuales => actuales.map((f, i) => (i === index ? { ...f, ...cambios } : f)));
    setHayCambios(true);
  };

  // Los ajustes a mano (arrastrar barras, escribir días) se guardan solos al dejar de editar.
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;
  useEffect(() => {
    if (!hayCambios || !programa.length) return;
    const espera = setTimeout(() => { void guardarRef.current(); }, 1500);
    return () => clearTimeout(espera);
  }, [hayCambios, programa]);

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-indigo-600" />
            Programa de Trabajo (Carta Gantt Referencial)
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Parte en la Fecha de Inicio de la ficha. {plazoContractualDias
              ? `Se ajusta al plazo del contrato (${plazoContractualDias} días).`
              : 'La IA estima cuánto dura cada fase según las partidas y cantidades del presupuesto, y de ahí sale el plazo.'} Es referencial: no reemplaza la Carta Gantt formal de licitación.
          </p>
        </div>
        <button
          type="button"
          onClick={generar}
          disabled={generando || !puedeGenerar}
          title={!puedeGenerar ? 'Complete todas las partidas del presupuesto estimativo' : undefined}
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

      {!proyecto.fechaInicio && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>El proyecto no tiene Fecha de Inicio. Indíquela en «Calendario y Plazos» de la ficha para que el programa muestre fechas reales; mientras tanto se muestran solo días relativos.</span>
        </div>
      )}

      {!isAIConfigured() && !(plazoContractualDias || duracionFichaDias || calcularDuracionTotalDias(proyecto)) && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-600">
          <span className="font-bold">Duración total del proyecto:</span>
          <input
            type="number"
            min={0}
            value={duracionManual || ''}
            onChange={e => { setDuracionManual(Math.max(0, Number(e.target.value) || 0)); }}
            placeholder="0"
            className="w-20 p-1 border border-slate-200 rounded text-right"
          />
          <span>días corridos (la IA no está disponible para estimarla)</span>
        </div>
      )}

      {!puedeGenerar && (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-500">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {partidas.length === 0 && 'Falta el Presupuesto Estimativo: agregue las partidas del proyecto para poder generar la Gantt.'}
            {partidasIncompletas > 0 && `${partidasIncompletas} partida(s) sin información completa (descripción, unidad, cantidad y precio unitario). `}
            {partidasSinFase > 0 && `${partidasSinFase} partida(s) sin fase asignada. `}
            {presupuestoCompleto && !isAIConfigured() && !plazoDeclarado && 'Declare la duración total del proyecto para generar la Gantt.'}
          </span>
        </div>
      )}

      {aviso && (
        <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg p-2.5 text-[11px] text-violet-900">
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{aviso}</span>
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
          {conGantt && proyecto.fechaInicio && (
            <GanttFases
              key={`${proyecto.id}-${proyecto.fechaInicio}`}
              fechaInicio={proyecto.fechaInicio}
              duracionTotalDias={duracionTotalDias}
              fases={programa}
              onCambio={actualizarFase}
            />
          )}
          <div className="space-y-2">
            {programa.map((f, i) => (
              <div key={f.fase} className="flex items-center gap-3">
                <span className={`${conGantt ? 'flex-1' : 'w-40 shrink-0'} text-[10px] font-bold text-slate-700 truncate`} title={f.fase}>{f.fase}</span>
                {!conGantt && (
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
                )}
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
                    {sumarDias(proyecto.fechaInicio, f.diaInicio)} → {sumarDias(proyecto.fechaInicio, Math.max(f.diaInicio, f.diaTermino - 1))}
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
            {guardando ? (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</span>
            ) : hayCambios ? (
              <button
                type="button"
                onClick={() => guardar()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm"
              >
                Guardar ahora
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700"><Check className="w-3.5 h-3.5" /> Programa guardado</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
