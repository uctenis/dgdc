import { useEffect, useState } from 'react';
import { HelpCircle, AlertTriangle, CheckCircle2, Clock, Loader2, Send, Edit3, Globe } from 'lucide-react';
import { subscribeToConsultas, responderConsulta } from '../services/firestoreService';
import { fechaLimiteConsultas, fechaLimiteRespuestas, formatoFechaHoraChile, diasHasta } from '../utils/plazoOfertas';
import { useAuth } from '../context/AuthContext';
import type { ConsultaLicitacion, LicitacionProyecto } from '../types';

/** Aviso del plazo para responder, según cuántos días quedan. */
export function estadoPlazoRespuesta(lic: Pick<LicitacionProyecto, 'fechaRespuestaConsultas'>, ahora = new Date()) {
  const limite = fechaLimiteRespuestas(lic);
  if (!limite) return { limite, texto: 'Sin fecha de respuesta definida en el calendario', nivel: 'sin-fecha' as const };
  const dias = diasHasta(limite, ahora);
  if (ahora.getTime() > limite.getTime()) return { limite, texto: `Plazo de respuesta VENCIDO (${formatoFechaHoraChile(limite)})`, nivel: 'vencido' as const };
  if (dias < 1) return { limite, texto: `Vence HOY a las ${formatoFechaHoraChile(limite).slice(11)}`, nivel: 'urgente' as const };
  return { limite, texto: `Quedan ${dias} ${dias === 1 ? 'día' : 'días'} (hasta ${formatoFechaHoraChile(limite)})`, nivel: dias <= 2 ? 'urgente' as const : 'normal' as const };
}

const ESTILO_NIVEL = {
  vencido: 'bg-red-50 border-red-300 text-red-800',
  urgente: 'bg-amber-50 border-amber-300 text-amber-900',
  normal: 'bg-sky-50 border-sky-200 text-sky-900',
  'sin-fecha': 'bg-slate-50 border-slate-200 text-slate-700',
};

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Consultas del período de consultas (vista interna): el responsable ve quién preguntó, el plazo para
 * responder y publica cada respuesta en el portal, donde la ven todos los invitados sin saber quién preguntó.
 */
export function ConsultasManager({ licitacion }: { licitacion: LicitacionProyecto }) {
  const { user } = useAuth();
  const [consultas, setConsultas] = useState<ConsultaLicitacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => subscribeToConsultas(licitacion.id, c => { setConsultas(c); setCargando(false); }), [licitacion.id]);

  const pendientes = consultas.filter(c => c.estado === 'Pendiente');
  const respondidas = consultas.filter(c => c.estado === 'Respondida').sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
  const plazo = estadoPlazoRespuesta(licitacion);
  const cierreConsultas = fechaLimiteConsultas(licitacion);
  const siguienteNumero = Math.max(0, ...respondidas.map(c => c.numero ?? 0)) + 1;

  const publicar = async (c: ConsultaLicitacion) => {
    const respuesta = (borradores[c.id] ?? c.respuesta ?? '').trim();
    if (!respuesta) { alert('Escriba la respuesta antes de publicarla.'); return; }
    const aviso = c.estado === 'Respondida'
      ? `¿Publicar la corrección de la Consulta N° ${c.numero}? Todos los oferentes verán la nueva respuesta.`
      : '¿Publicar esta respuesta en el portal? La verán TODOS los proveedores invitados (sin indicar quién preguntó).';
    if (!confirm(aviso)) return;
    setGuardando(c.id);
    try {
      await responderConsulta(licitacion.id, c, respuesta, siguienteNumero, user?.email || '');
      setBorradores(b => { const n = { ...b }; delete n[c.id]; return n; });
      setEditando(null);
    } catch (err) {
      console.error('Error publicando la respuesta:', err);
      alert('No se pudo publicar la respuesta. Intente nuevamente.');
    } finally {
      setGuardando(null);
    }
  };

  const editor = (c: ConsultaLicitacion) => (
    <div className="space-y-2">
      <textarea
        value={borradores[c.id] ?? c.respuesta ?? ''}
        onChange={e => setBorradores(b => ({ ...b, [c.id]: e.target.value }))}
        rows={3}
        placeholder="Respuesta de la universidad..."
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-500"
      />
      <div className="flex justify-end gap-2">
        {c.estado === 'Respondida' && (
          <button onClick={() => setEditando(null)} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-[11px] font-bold">Cancelar</button>
        )}
        <button
          onClick={() => publicar(c)}
          disabled={guardando === c.id}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold"
        >
          {guardando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {c.estado === 'Respondida' ? 'Publicar corrección' : 'Responder y publicar'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-sky-600" /> Consultas de proveedores
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Los proveedores preguntan desde el portal{cierreConsultas ? ` hasta el ${formatoFechaHoraChile(cierreConsultas)} hrs` : ''}. Cada respuesta se publica en el portal para todos los invitados, sin indicar quién preguntó.
            </p>
          </div>
          <div className="flex gap-2 text-center">
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200">
              <span className="block text-[10px] font-bold uppercase text-amber-700">Pendientes</span>
              <strong className="text-lg text-amber-800">{pendientes.length}</strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="block text-[10px] font-bold uppercase text-emerald-700">Publicadas</span>
              <strong className="text-lg text-emerald-800">{respondidas.length}</strong>
            </div>
          </div>
        </div>

        {pendientes.length > 0 && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${ESTILO_NIVEL[plazo.nivel]}`}>
            {plazo.nivel === 'vencido' || plazo.nivel === 'urgente' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
            <span>Plazo para responder: {plazo.texto}</span>
          </div>
        )}
      </div>

      {cargando ? (
        <p className="text-xs text-slate-400">Cargando consultas...</p>
      ) : consultas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400">
          Aún no hay consultas de proveedores para esta licitación.
        </div>
      ) : (
        <>
          {pendientes.map(c => (
            <div key={c.id} className="bg-white border-2 border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-extrabold uppercase text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">Pendiente</span>
                <strong className="text-slate-800">{c.proveedorNombre}</strong>
                <span className="text-slate-400">· {fechaHora(c.fechaPregunta)}</span>
                <span className="ml-auto text-[10px] text-slate-400">Solo visible para la universidad</span>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-line">{c.pregunta}</p>
              {editor(c)}
            </div>
          ))}

          {respondidas.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-600" /> Publicadas en el portal
              </h4>
              {respondidas.map(c => (
                <div key={c.id} className="border border-slate-100 rounded-xl p-3 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Consulta N° {c.numero}</span>
                    <span className="text-slate-500">de {c.proveedorNombre}</span>
                    <span className="text-slate-400">· respondida {c.fechaRespuesta ? fechaHora(c.fechaRespuesta) : ''}{c.respondidaPorEmail ? ` por ${c.respondidaPorEmail}` : ''}</span>
                    {editando !== c.id && (
                      <button onClick={() => setEditando(c.id)} className="ml-auto flex items-center gap-1 text-sky-700 font-bold hover:underline">
                        <Edit3 className="w-3 h-3" /> Corregir
                      </button>
                    )}
                  </div>
                  <p className="text-slate-800"><strong>P:</strong> {c.pregunta}</p>
                  {editando === c.id ? editor(c) : (
                    <p className="text-emerald-900 whitespace-pre-line"><strong>R:</strong> {c.respuesta}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
