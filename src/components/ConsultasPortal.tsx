import { useEffect, useState } from 'react';
import { HelpCircle, Loader2, Send, MessageSquare, Clock } from 'lucide-react';
import { addConsulta, subscribeToMisConsultas, subscribeToConsultasPublicadas } from '../services/firestoreService';
import { fechaLimiteConsultas, formatoFechaHoraChile } from '../utils/plazoOfertas';
import type { ConsultaLicitacion, ConsultaPublicada, LicitacionProyecto } from '../types';

interface Props {
  licitacion: LicitacionProyecto;
  proveedorId: string;
  proveedorNombre: string;
  proveedorUid: string;
  /** Vista de administrador: muestra las respuestas pero no permite preguntar. */
  soloLectura?: boolean;
  /** Demostración local: no lee ni escribe en Firebase; las consultas se responden solas. */
  demo?: boolean;
  /** true = el portal ya cerró la recepción de ofertas. */
  portalCerrado: boolean;
}

const TARJETA = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' };
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-CL');

const consultasDemo = (): ConsultaPublicada[] => {
  const hoy = new Date().toISOString();
  return [{
    id: 'demo-1', numero: 1, fechaPregunta: hoy, fechaRespuesta: hoy,
    pregunta: '¿La visita a terreno es obligatoria para presentar oferta?',
    respuesta: 'Sí. Solo podrán ofertar las empresas que asistan a la visita a terreno y firmen el acta de asistencia.',
  }];
};

/**
 * Período de consultas en el portal: el proveedor pregunta hasta el cierre de la recepción de consultas y ve
 * las respuestas publicadas por la universidad, que son las mismas para todos los invitados y no identifican
 * a quién preguntó.
 */
export function ConsultasPortal({ licitacion, proveedorId, proveedorNombre, proveedorUid, soloLectura, demo, portalCerrado }: Props) {
  const [publicadas, setPublicadas] = useState<ConsultaPublicada[]>(() => (demo ? consultasDemo() : []));
  const [mias, setMias] = useState<ConsultaLicitacion[]>([]);
  const [pregunta, setPregunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (demo) return;
    const avisar = (err: unknown) => console.warn('No se pudieron leer las consultas:', err);
    const unsubPub = subscribeToConsultasPublicadas(licitacion.id, setPublicadas, avisar);
    const unsubMias = proveedorId ? subscribeToMisConsultas(licitacion.id, proveedorId, setMias, avisar) : () => {};
    return () => { unsubPub(); unsubMias(); };
  }, [licitacion.id, proveedorId, demo]);

  const limite = fechaLimiteConsultas(licitacion);
  const periodoAbierto = !portalCerrado && (!limite || Date.now() <= limite.getTime());
  const puedePreguntar = periodoAbierto && !soloLectura && Boolean(proveedorId);
  const pendientes = mias.filter(c => c.estado === 'Pendiente');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = pregunta.trim();
    if (!texto || !puedePreguntar) return;
    setEnviando(true);
    setMensaje('');
    if (demo) {
      // Demostración: la consulta queda pendiente y a los pocos segundos "la universidad" publica la respuesta.
      const id = `demo-${Date.now()}`;
      const ahora = new Date().toISOString();
      setMias(prev => [...prev, { id, proveedorId, proveedorNombre, proveedorUid, pregunta: texto, fechaPregunta: ahora, estado: 'Pendiente' }]);
      setPregunta('');
      setEnviando(false);
      setMensaje('Consulta enviada. (Demostración: en unos segundos se simula la respuesta publicada por la universidad.)');
      window.setTimeout(() => {
        setMias(prev => prev.filter(c => c.id !== id));
        setPublicadas(prev => [...prev, {
          id, numero: prev.length + 1, pregunta: texto, fechaPregunta: ahora, fechaRespuesta: new Date().toISOString(),
          respuesta: 'Respuesta de ejemplo: se mantiene lo indicado en las Especificaciones Técnicas. Esta respuesta la ven todos los oferentes, sin indicar quién preguntó.',
        }]);
        setMensaje('');
      }, 5000);
      return;
    }
    try {
      await addConsulta(licitacion.id, { proveedorId, proveedorNombre, proveedorUid, pregunta: texto });
      setPregunta('');
      setMensaje('Consulta enviada. La respuesta se publicará en esta misma sección para todos los oferentes.');
    } catch (err) {
      console.error('Error enviando consulta:', err);
      setMensaje('No se pudo enviar la consulta. Intente nuevamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rounded-2xl p-5 space-y-4" style={TARJETA}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-sky-400" />
          Consultas y Respuestas
        </h3>
        {limite && (
          <span className={`text-[11px] font-semibold flex items-center gap-1 ${periodoAbierto ? 'text-amber-300' : 'text-slate-400'}`}>
            <Clock className="w-3.5 h-3.5" />
            {periodoAbierto ? `Recepción de consultas hasta el ${formatoFechaHoraChile(limite)} hrs` : 'Período de consultas cerrado'}
          </span>
        )}
      </div>

      {/* Respuestas publicadas: iguales para todos los invitados */}
      {publicadas.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Aún no hay respuestas publicadas.</p>
      ) : (
        <div className="space-y-2.5">
          {publicadas.map(c => (
            <div key={c.id} className="rounded-xl bg-white/5 border border-white/10 p-3.5 space-y-2">
              <p className="text-[10px] font-bold uppercase text-sky-300">Consulta N° {c.numero} · respondida el {fechaCorta(c.fechaRespuesta)}</p>
              <p className="text-xs text-slate-200"><strong className="text-white">P:</strong> {c.pregunta}</p>
              <p className="text-xs text-emerald-200 whitespace-pre-line"><strong className="text-emerald-300">R:</strong> {c.respuesta}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mis consultas aún sin respuesta */}
      {pendientes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-300">Sus consultas en espera de respuesta ({pendientes.length})</p>
          {pendientes.map(c => (
            <div key={c.id} className="text-xs text-slate-300 bg-amber-400/10 border border-amber-300/20 rounded-lg px-3 py-2">
              <span className="text-[10px] text-amber-300 font-bold block">Enviada el {fechaCorta(c.fechaPregunta)} · Pendiente</span>
              {c.pregunta}
            </div>
          ))}
        </div>
      )}

      {puedePreguntar ? (
        <form onSubmit={enviar} className="space-y-2 pt-2 border-t border-white/10">
          <label className="block text-[11px] font-semibold text-sky-300">Nueva consulta</label>
          <textarea
            value={pregunta}
            onChange={e => setPregunta(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Escriba su consulta sobre las bases, planos o especificaciones..."
            className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none placeholder:text-slate-500"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> La respuesta se publica para todos los oferentes, sin indicar quién preguntó.
            </span>
            <button
              type="submit"
              disabled={enviando || !pregunta.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#38bdf8,#1d4ed8)' }}
            >
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Enviar consulta
            </button>
          </div>
          {mensaje && <p className="text-[11px] text-emerald-300">{mensaje}</p>}
        </form>
      ) : !periodoAbierto && !soloLectura && !demo ? (
        <p className="text-[11px] text-slate-400 pt-2 border-t border-white/10">El período para enviar consultas terminó.</p>
      ) : null}
    </div>
  );
}
