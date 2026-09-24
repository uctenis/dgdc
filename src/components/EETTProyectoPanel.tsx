import { useEffect, useMemo, useRef, useState } from 'react';
import { FileCheck2, Sparkles, Loader2, AlertTriangle, Download, CheckCircle2, RotateCcw } from 'lucide-react';
import type { ProyectoMaestro, EspecificacionPartida, EspecificacionesTecnicasProyecto } from '../types';
import { updateProyectoMaestro } from '../services/firestoreService';
import {
  generarGeneralidadesEETTConIA,
  generarEspecificacionesPartidasConIA,
  isAIConfigured,
  type ContextoProyectoEETT, mensajeErrorIA } from '../services/aiService';
import { generarEETTWord } from '../services/eettDocxGenerator';
import { storageService } from '../services/storageService';
import { agruparPorFase } from '../utils/itemizadoOrganizer';
import { obtenerCampusPorSigla, descripcionEdificioParaIA } from '../data/campusData';
import { useAuth } from '../context/AuthContext';

interface Props {
  proyecto: ProyectoMaestro;
}

// Partidas por llamada a la IA: lotes chicos para que la respuesta no se corte ni exceda el timeout.
const PARTIDAS_POR_LOTE = 4;

type EspecLocal = Pick<EspecificacionPartida, 'especificacion' | 'origen'>;

function contextoDesdeProyecto(p: ProyectoMaestro): ContextoProyectoEETT {
  const campus = p.campusSigla ? obtenerCampusPorSigla(p.campusSigla) : undefined;
  return {
    nombre: p.nombre,
    descripcion: p.descripcion,
    tipoObra: p.tipoObra,
    rubro: p.rubro,
    uso: p.uso,
    ubicacion: campus
      ? [p.edificioSigla ? descripcionEdificioParaIA(p.edificioSigla) : '', campus.nombre, campus.direccion || '', campus.ciudad].filter(Boolean).join(', ')
      : undefined,
  };
}

export function EETTProyectoPanel({ proyecto }: Props) {
  const { user } = useAuth();
  const partidas = useMemo(() => proyecto.itemizado || [], [proyecto.itemizado]);
  const grupos = useMemo(() => agruparPorFase(partidas), [partidas]);

  const [generalidades, setGeneralidades] = useState(proyecto.eett?.generalidades || '');
  const [especs, setEspecs] = useState<Record<string, EspecLocal>>(() => mapaDesde(proyecto.eett));
  const [estado, setEstado] = useState<EspecificacionesTecnicasProyecto['estado']>(proyecto.eett?.estado || 'Borrador');
  const [hayCambios, setHayCambios] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [exportando, setExportando] = useState(false);

  function mapaDesde(eett?: EspecificacionesTecnicasProyecto): Record<string, EspecLocal> {
    const m: Record<string, EspecLocal> = {};
    for (const e of eett?.partidas || []) m[e.partidaId] = { especificacion: e.especificacion, origen: e.origen };
    return m;
  }

  // Recargar solo al cambiar de proyecto (mismo criterio que el itemizado: la ficha suscribe el
  // proyecto en vivo y recargar con cada cambio remoto borraría lo que se está escribiendo).
  const idCargadoRef = useRef(proyecto.id);
  useEffect(() => {
    idCargadoRef.current = proyecto.id;
    setGeneralidades(proyecto.eett?.generalidades || '');
    setEspecs(mapaDesde(proyecto.eett));
    setEstado(proyecto.eett?.estado || 'Borrador');
    setHayCambios(false);
    setAvisos([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  const construirEETT = (): EspecificacionesTecnicasProyecto => ({
    version: (proyecto.eett?.version || 0) + 1,
    estado,
    generalidades,
    // Solo se guardan especificaciones de partidas que siguen existiendo en el itemizado.
    partidas: partidas
      .filter(p => especs[p.id]?.especificacion)
      .map(p => ({
        partidaId: p.id,
        item: p.item,
        descripcion: p.descripcion,
        unidad: p.unidad,
        especificacion: especs[p.id].especificacion,
        origen: especs[p.id].origen,
      })),
    fechaActualizacion: new Date().toISOString(),
    actualizadoPor: user?.email || undefined,
    ...(estado === 'Aprobada'
      ? { fechaAprobacion: proyecto.eett?.fechaAprobacion || new Date().toISOString(), aprobadoPor: proyecto.eett?.aprobadoPor || user?.email || undefined }
      : {}),
  });

  // Autoguardado 1,5 s después de la última edición (igual que el itemizado).
  const construirRef = useRef(construirEETT);
  construirRef.current = construirEETT;
  useEffect(() => {
    if (!hayCambios || idCargadoRef.current !== proyecto.id) return;
    const id = proyecto.id;
    const t = setTimeout(async () => {
      try {
        await updateProyectoMaestro(id, { eett: construirRef.current() });
        setErrorGuardado(false);
        setHayCambios(false);
      } catch (err) {
        console.error('Error guardando EETT:', err);
        setErrorGuardado(true);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [generalidades, especs, estado, hayCambios, proyecto.id]);

  const faltantes = partidas.filter(p => !especs[p.id]?.especificacion);
  const hayAlgo = Boolean(generalidades) || partidas.some(p => especs[p.id]?.especificacion);
  const generando = progreso !== null;

  const generar = async (soloFaltantes: boolean) => {
    if (!soloFaltantes && hayAlgo && !confirm('Esto reemplazará las especificaciones actuales (incluidas las que editó a mano) por una nueva versión generada con IA. ¿Continuar?')) return;
    setAvisos([]);
    const contexto = contextoDesdeProyecto(proyecto);
    const objetivo = soloFaltantes ? faltantes : partidas;
    const errores: string[] = [];

    // Lotes por fase, de a PARTIDAS_POR_LOTE, para que cada respuesta sea corta y coherente.
    const lotes = agruparPorFase(objetivo).flatMap(g => {
      const out: { fase: string; items: typeof objetivo }[] = [];
      for (let i = 0; i < g.items.length; i += PARTIDAS_POR_LOTE) out.push({ fase: g.fase, items: g.items.slice(i, i + PARTIDAS_POR_LOTE) });
      return out;
    });
    const necesitaGeneralidades = !soloFaltantes || !generalidades.trim();
    const totalPasos = lotes.length + (necesitaGeneralidades ? 1 : 0);
    let paso = 0;

    try {
      if (necesitaGeneralidades) {
        setProgreso(`Redactando generalidades (1/${totalPasos})…`);
        try {
          const texto = await generarGeneralidadesEETTConIA(contexto, grupos.map(g => g.fase));
          setGeneralidades(texto);
          setHayCambios(true);
        } catch (err) {
          console.error('Error generando generalidades EETT:', err);
          errores.push('No se pudieron generar las Generalidades.');
        }
        paso++;
      }

      for (const lote of lotes) {
        paso++;
        setProgreso(`Especificando ${lote.fase} (${paso}/${totalPasos})…`);
        try {
          const conClave = lote.items.map((p, i) => ({ clave: `P${i + 1}`, item: p.item, descripcion: p.descripcion, unidad: p.unidad, cantidad: p.cantidad, fase: p.fase }));
          const resultado = await generarEspecificacionesPartidasConIA(contexto, conClave);
          const nuevas: Record<string, EspecLocal> = {};
          lote.items.forEach((p, i) => {
            const texto = resultado[`P${i + 1}`];
            if (texto) nuevas[p.id] = { especificacion: texto, origen: 'IA' };
          });
          if (Object.keys(nuevas).length) {
            setEspecs(prev => ({ ...prev, ...nuevas }));
            setHayCambios(true);
          }
          const sinRespuesta = lote.items.filter((_, i) => !resultado[`P${i + 1}`]);
          if (sinRespuesta.length) errores.push(`Sin respuesta para: ${sinRespuesta.map(p => `${p.item} ${p.descripcion}`).join('; ')}.`);
        } catch (err) {
          console.error('Error generando EETT del lote:', err);
          errores.push(`${lote.fase}: ${mensajeErrorIA(err)}`);
        }
      }
    } finally {
      setProgreso(null);
      if (errores.length) setAvisos([...errores, 'Use "Completar partidas faltantes" para reintentar solo lo que faltó.']);
    }
  };

  const exportarWord = async () => {
    setExportando(true);
    try {
      await generarEETTWord({
        proyecto,
        partidas,
        especificaciones: Object.fromEntries(Object.entries(especs).map(([id, e]) => [id, e.especificacion])),
        generalidades,
        estado,
        version: proyecto.eett?.version || 1,
        configFirmas: storageService.getConfigFirmas(),
      });
    } catch (err) {
      console.error('Error exportando EETT a Word:', err);
      alert('No se pudo generar el Word. Intente nuevamente.');
    } finally {
      setExportando(false);
    }
  };

  const editarEspec = (partidaId: string, texto: string) => {
    setEspecs(prev => ({ ...prev, [partidaId]: { especificacion: texto, origen: 'Manual' } }));
    if (estado === 'Aprobada') setEstado('Borrador');
    setHayCambios(true);
  };

  if (partidas.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center space-y-2">
        <FileCheck2 className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-sm font-bold text-slate-800">Primero arme el Presupuesto Estimativo</p>
        <p className="text-[11px] text-slate-500 max-w-md mx-auto">
          Las Especificaciones Técnicas se generan a partir de las partidas del itemizado. Vaya a la pestaña
          "Presupuesto Estimativo", cree o cargue las partidas y vuelva aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-indigo-600" />
            Especificaciones Técnicas (EETT)
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${estado === 'Aprobada' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {estado}
            </span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Una especificación por cada partida del Presupuesto Estimativo ({partidas.length} partidas), más las generalidades de la obra.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hayAlgo && faltantes.length > 0 && (
            <button
              type="button"
              onClick={() => generar(true)}
              disabled={generando || !isAIConfigured()}
              className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed border border-violet-200 text-violet-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" /> Completar {faltantes.length} partida(s) faltante(s)
            </button>
          )}
          <button
            type="button"
            onClick={() => generar(false)}
            disabled={generando || !isAIConfigured()}
            title={isAIConfigured() ? 'Redacta las EETT con IA a partir de las partidas del presupuesto y los datos del proyecto' : 'Configure VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY para habilitar esta función'}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
          >
            {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : hayAlgo ? <RotateCcw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            {hayAlgo ? 'Regenerar todo con IA' : 'Generar EETT con IA'}
          </button>
        </div>
      </div>

      {!proyecto.presupuesto?.aprobado && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>El Presupuesto Estimativo de este proyecto aún no está aprobado. Puede generar las EETT igual, pero si cambian las partidas tendrá que completarlas o regenerarlas.</span>
        </div>
      )}

      {progreso && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-[11px] text-indigo-900 font-semibold">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>{progreso} Puede seguir en esta pestaña; lo generado se guarda a medida que llega.</span>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5">{avisos.map((a, i) => <p key={i}>{a}</p>)}</div>
        </div>
      )}

      {hayAlgo && (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-600">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
          <span>Texto generado con IA como borrador: revíselo y ajústelo (materiales, normas, medición) antes de aprobarlo y publicarlo en la licitación.</span>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-extrabold text-slate-800">1. Generalidades</label>
        <textarea
          value={generalidades}
          onChange={e => { setGeneralidades(e.target.value); if (estado === 'Aprobada') setEstado('Borrador'); setHayCambios(true); }}
          rows={generalidades ? 8 : 3}
          placeholder="Alcance, normativa aplicable, calidad de materiales, instalación de faenas, seguridad, aseo y recepción…"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {grupos.map((g, gi) => (
        <div key={g.fase} className="space-y-2">
          <h4 className="text-xs font-extrabold text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
            {gi + 2}. {g.fase}
          </h4>
          {g.items.map(p => {
            const e = especs[p.id];
            return (
              <div key={p.id} className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-800">
                    <span className="font-mono text-slate-500 mr-1.5">{p.item}</span>
                    {p.descripcion || <em className="text-slate-400">Partida sin descripción</em>}
                    <span className="ml-1.5 font-normal text-slate-400">({p.unidad})</span>
                  </span>
                  {e?.especificacion ? (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${e.origen === 'IA' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                      {e.origen === 'IA' ? 'IA' : 'Editada'}
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-slate-50 text-slate-500 border-slate-200">Pendiente</span>
                  )}
                </div>
                <textarea
                  value={e?.especificacion || ''}
                  onChange={ev => editarEspec(p.id, ev.target.value)}
                  rows={e?.especificacion ? 5 : 2}
                  placeholder="Alcance, materiales, procedimiento de ejecución, control de calidad y forma de medición y pago…"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-[11px] focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            );
          })}
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <span className="text-[11px] text-slate-500 mr-auto">
          {errorGuardado ? <span className="text-rose-600 font-bold">No se pudo guardar — revise su conexión.</span>
            : hayCambios ? 'Guardando cambios…'
            : proyecto.eett ? `Guardado · v${proyecto.eett.version}` : ''}
        </span>
        <button
          type="button"
          onClick={exportarWord}
          disabled={!hayAlgo || exportando}
          className="px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-300 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2"
        >
          {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Exportar Word
        </button>
        <button
          type="button"
          onClick={() => { setEstado(estado === 'Aprobada' ? 'Borrador' : 'Aprobada'); setHayCambios(true); }}
          disabled={!hayAlgo || generando || (estado !== 'Aprobada' && faltantes.length > 0)}
          title={estado !== 'Aprobada' && faltantes.length > 0 ? 'Complete la especificación de todas las partidas antes de aprobar' : undefined}
          className={`px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold shadow-sm flex items-center gap-2 ${
            estado === 'Aprobada' ? 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {estado === 'Aprobada' ? 'Volver a Borrador' : 'Aprobar EETT'}
        </button>
      </div>
    </div>
  );
}
