// Asistente de consultas del Gestor de Espacios: una ventana de chat donde se pregunta en palabras («¿cuántos m²
// tienen las oficinas 301, 302 y 303 del CSF16?») y responde con cifras calculadas sobre los datos reales.
import { useEffect, useRef, useState } from 'react';
import { BarChart3, Loader2, Send, Sparkles, Trash2, X } from 'lucide-react';
import { cargarDatosAnalisis } from '../services/analisisEspacios';
import { mensajeErrorIA, preguntarIA, isAIConfigured } from '../services/aiService';
import { getCampusList } from '../data/campusData';
import { DIMENSIONES, MEDIDAS, formatoMedida, type Filtros, type Dimension, type Medida } from '../utils/analisisEspacios';
import { armarPrompt, catalogo, ejecutarPlan, leerPlan, type PlanConsulta, type ResultadoConsulta } from '../utils/consultaIA';
import { comoTitulo } from '../utils/texto';
import { interpretarLocal } from '../utils/interpreteLocal';

type Mensaje =
  | { rol: 'usuario'; texto: string }
  | { rol: 'asistente'; pregunta: string; resultado?: ResultadoConsulta; error?: string; instantanea?: boolean };

const EJEMPLOS = [
  '¿Cuántos m² tienen las oficinas 301, 302 y 303 del CSF16?',
  'Superficie útil por piso del edificio CJP01',
  '¿Cuántas salas de clases hay en cada campus?',
  '¿Qué recintos ocupa la Dirección de Gestión y Desarrollo de Campus?',
];
const numero = (n: number, d = 0) => n.toLocaleString('es-CL', { maximumFractionDigits: d });

export function AsistenteEspacios({ onAbrirRecinto, onAbrirAnalisis }: {
  onAbrirRecinto: (edificio: string, recintoId: string) => void;
  onAbrirAnalisis: (consulta: { f: Filtros; g?: Dimension; m?: Medida }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [etapa, setEtapa] = useState('');
  const [segundos, setSegundos] = useState(0);
  // Los recintos se leen de antemano (al entrar al Gestor), para no esperar al preguntar.
  useEffect(() => {
    const t = window.setTimeout(() => { void cargarDatosAnalisis().catch(() => {}); }, 1500);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!pensando) return;
    setSegundos(0);
    const t = window.setInterval(() => setSegundos(x => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [pensando]);
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, pensando]);

  const preguntar = async (pregunta: string) => {
    const q = pregunta.trim();
    if (!q || pensando) return;
    setTexto('');
    setMensajes(m => [...m, { rol: 'usuario', texto: q }]);
    setPensando(true);
    try {
      setEtapa('Leyendo los recintos…');
      const datos = await cargarDatosAnalisis();
      const nombresCampus = Object.fromEntries(getCampusList().map(c => [c.sigla, comoTitulo(c.nombre)]));
      // Primero el intérprete propio: resuelve al instante y sin costo las preguntas típicas. Solo si no entiende
      // toda la pregunta, se consulta a la IA.
      const local = interpretarLocal(q, datos.filas, nombresCampus);
      if (local) {
        setMensajes(m => [...m, { rol: 'asistente', pregunta: q, resultado: ejecutarPlan(datos.filas, local), instantanea: true }]);
        return;
      }
      setEtapa('Interpretando la pregunta con IA…');
      // Las últimas consultas, para entender preguntas encadenadas («¿y en el piso 2?»).
      const previas = mensajes.filter((m): m is Extract<Mensaje, { rol: 'asistente' }> => m.rol === 'asistente' && !!m.resultado)
        .slice(-3).map(m => ({ pregunta: m.pregunta, plan: m.resultado!.plan }));
      const respuesta = await preguntarIA(armarPrompt(q, catalogo(datos.filas, nombresCampus, [q, ...previas.map(p => p.pregunta)].join(' ')), previas), 700);
      let plan: PlanConsulta;
      try { plan = leerPlan(respuesta); } catch { throw new Error('AI_INVALID_JSON'); }
      setMensajes(m => [...m, { rol: 'asistente', pregunta: q, resultado: ejecutarPlan(datos.filas, plan) }]);
    } catch (e) {
      setMensajes(m => [...m, { rol: 'asistente', pregunta: q, error: mensajeErrorIA(e) }]);
    } finally { setPensando(false); }
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} title="Pregunte en palabras: superficies, recintos, unidades, ocupantes…"
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 pl-4 pr-5 py-3 rounded-full bg-gradient-to-r from-teal-700 to-emerald-600 text-white font-bold shadow-2xl hover:scale-105 transition">
        <Sparkles className="w-5 h-5" /> Preguntar
      </button>
    );
  }

  return (
    <div className="fixed z-[60] inset-x-2 bottom-2 top-16 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:top-auto sm:w-[460px] sm:h-[min(680px,calc(100vh-110px))] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-teal-800 to-emerald-700 text-white">
        <Sparkles className="w-5 h-5" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-tight">Asistente de espacios</p>
          <p className="text-[11px] text-teal-100">Las cifras se calculan con los datos del sistema</p>
        </div>
        {mensajes.length > 0 && <button type="button" onClick={() => setMensajes([])} title="Nueva conversación" className="p-1.5 rounded-lg hover:bg-white/15"><Trash2 className="w-4 h-4" /></button>}
        <button type="button" onClick={() => setAbierto(false)} title="Cerrar" className="p-1.5 rounded-lg hover:bg-white/15"><X className="w-5 h-5" /></button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 text-sm">
        {!mensajes.length && (
          <div className="space-y-2">
            <p className="text-slate-600">Pregunte en palabras por superficies, recintos, pisos, unidades u ocupantes. Por ejemplo:</p>
            {EJEMPLOS.map(e => (
              <button key={e} type="button" onClick={() => void preguntar(e)}
                className="block w-full text-left px-3 py-2 rounded-xl border border-teal-200 bg-white text-teal-900 hover:bg-teal-50">{e}</button>
            ))}
            {!isAIConfigured() && <p className="text-amber-700 text-xs">La IA no está configurada en este ambiente.</p>}
          </div>
        )}
        {mensajes.map((m, i) => m.rol === 'usuario' ? (
          <div key={i} className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-sm bg-teal-700 text-white px-3 py-2">{m.texto}</p></div>
        ) : (
          <div key={i} className="max-w-[95%] rounded-2xl rounded-bl-sm bg-white border border-slate-200 px-3 py-2.5 shadow-sm">
            {m.error ? <p className="text-rose-700">{m.error}</p> : m.resultado && <Respuesta r={m.resultado} onAbrirRecinto={onAbrirRecinto} onAbrirAnalisis={onAbrirAnalisis} />}
            {m.resultado && <p className="mt-1.5 text-[10px] text-slate-400">{m.instantanea ? '⚡ Respondida al instante (sin IA)' : 'Interpretada con IA'}</p>}
          </div>
        ))}
        {pensando && (
          <p className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> {etapa || 'Consultando…'} <span className="text-slate-400">{segundos} s</span>
            {segundos >= 20 && <span className="text-[11px] text-amber-700">· la IA está lenta; el sistema reintenta solo</span>}</p>
        )}
        <div ref={fin} />
      </div>

      <form onSubmit={e => { e.preventDefault(); void preguntar(texto); }} className="flex items-end gap-2 p-2 border-t border-slate-200 bg-white">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={1} placeholder="Escriba su pregunta…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void preguntar(texto); } }}
          className="flex-1 resize-none max-h-28 px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-teal-300" />
        <button type="submit" disabled={!texto.trim() || pensando} title="Enviar (Enter)" className="p-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}

function Respuesta({ r, onAbrirRecinto, onAbrirAnalisis }: {
  r: ResultadoConsulta; onAbrirRecinto: (edificio: string, recintoId: string) => void; onAbrirAnalisis: (c: { f: Filtros; g?: Dimension; m?: Medida }) => void;
}) {
  const { plan, totales: t } = r;
  if (plan.noAplica) return <p className="text-slate-700">{plan.noAplica}</p>;
  const medida = MEDIDAS.find(x => x.id === plan.medida)!;
  const verFilas = plan.listar || r.filas.length <= 12;
  const filas = [...r.filas].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  return (
    <div className="space-y-2">
      {plan.interpretacion && <p className="text-[12px] italic text-slate-500">{plan.interpretacion}</p>}
      {r.sinCoincidencia.length > 0 && <p className="text-[12px] text-amber-700">No encontré: {r.sinCoincidencia.join(', ')}.</p>}
      {!r.filas.length ? (
        <div className="space-y-1 text-slate-700">
          <p>Ningún recinto cumple todas esas condiciones.</p>
          {r.sinFiltro?.map(x => (
            <p key={x.dimension} className="text-[12px] text-slate-600">
              Sin el filtro de <b>{DIMENSIONES.find(d => d.id === x.dimension)!.nombre.toLowerCase()}</b> hay {x.recintos} recinto(s): {x.donde.map(g => `${comoTitulo(g.clave)} (${g.recintos})`).join(', ')}.
            </p>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Cifra valor={numero(t.recintos)} texto={t.recintos === 1 ? 'recinto' : 'recintos'} />
            <Cifra valor={`${numero(t.util, 1)} m²`} texto="útiles" destacada={plan.medida === 'util'} />
            {t.oguc > 0 && <Cifra valor={`${numero(t.oguc, 1)} m²`} texto="OGUC" destacada={plan.medida === 'oguc'} />}
            <Cifra valor={numero(t.ocupantes)} texto="ocupantes" destacada={plan.medida === 'ocupantes'} />
            {t.capacidad > 0 && <Cifra valor={numero(t.capacidad)} texto="capacidad" destacada={plan.medida === 'capacidad'} />}
            {t.edificios > 1 && <Cifra valor={numero(t.edificios)} texto="edificios" />}
          </div>
          {r.grupos.length > 0 && plan.agrupar && (
            <table className="w-full text-[12px]">
              <thead><tr className="text-slate-400 text-left"><th className="font-bold py-1">{DIMENSIONES.find(d => d.id === plan.agrupar)!.nombre}</th><th className="font-bold text-right">{medida.corto}</th><th className="font-bold text-right">recintos</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {r.grupos.slice(0, 20).map(g => (
                  <tr key={g.clave}><td className="py-1 pr-2">{comoTitulo(g.clave)}</td><td className="text-right font-bold text-slate-800">{formatoMedida(g[plan.medida], plan.medida)}</td><td className="text-right text-slate-500">{g.recintos}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {verFilas && (
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {filas.slice(0, 30).map(f => (
                <li key={f.id}>
                  <button type="button" onClick={() => onAbrirRecinto(f.edificio, f.id)} className="w-full text-left px-2 py-1.5 hover:bg-teal-50 text-[12px]" title="Abrir el recinto">
                    <span className="font-mono font-bold text-teal-800">{f.codigo}</span> <span className="text-slate-700">{comoTitulo(f.tipo)}</span>
                    <span className="float-right text-slate-600">{numero(f.util, 1)} m²{f.ocupantes.length ? ` · ${f.ocupantes.length} p.` : ''}</span>
                    <span className="block text-[11px] text-slate-400">{f.edificio} · {f.piso}{f.unidades[0] ? ` · ${comoTitulo(f.unidades[0])}` : ''}</span>
                  </button>
                </li>
              ))}
              {filas.length > 30 && <li className="px-2 py-1.5 text-[11px] text-slate-500">y {filas.length - 30} más…</li>}
            </ul>
          )}
          {!plan.filtros.codigos?.length && (
            <button type="button" onClick={() => onAbrirAnalisis({ f: r.filtrosAplicados, ...(plan.agrupar ? { g: plan.agrupar } : {}), m: plan.medida })}
              className="flex items-center gap-1.5 text-[12px] font-bold text-teal-700 hover:underline"><BarChart3 className="w-3.5 h-3.5" /> Ver el detalle en Análisis</button>
          )}
        </>
      )}
    </div>
  );
}

function Cifra({ valor, texto, destacada }: { valor: string; texto: string; destacada?: boolean }) {
  return (
    <span className={`inline-flex items-baseline gap-1 px-2 py-1 rounded-lg ${destacada ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
      <b className="text-sm">{valor}</b><span className={`text-[11px] ${destacada ? 'text-teal-100' : 'text-slate-500'}`}>{texto}</span>
    </span>
  );
}

