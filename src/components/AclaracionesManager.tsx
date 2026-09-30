import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Eye, FileWarning, Loader2, Megaphone, Paperclip, Plus, X } from 'lucide-react';
import { publicarAclaracion, subscribeToAclaraciones, subscribeToInvitados } from '../services/firestoreService';
import { uploadLicitacionDocument } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { horaLimite, textoLimiteOfertas } from '../utils/plazoOfertas';
import { motivoNoHabil } from '../utils/diasHabiles';
import type { AclaracionLicitacion, InvitadoLicitacion, LicitacionProyecto } from '../types';

const fechaCorta = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
const fechaDia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL');

/**
 * Aclaraciones y modificaciones a las bases (personal interno): se publican numeradas en el portal para todos
 * los invitados, con archivo opcional y, si corresponde, cambio de la fecha de cierre de ofertas.
 */
export function AclaracionesManager({ licitacion }: { licitacion: LicitacionProyecto }) {
  const { user } = useAuth();
  const [aclaraciones, setAclaraciones] = useState<AclaracionLicitacion[]>([]);
  const [invitados, setInvitados] = useState<InvitadoLicitacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cambiaCierre, setCambiaCierre] = useState(false);
  const cierreActual = licitacion.fechaEntregaPropuestas || licitacion.fechaEvaluacion || '';
  const [nuevaFecha, setNuevaFecha] = useState(cierreActual);
  const [nuevaHora, setNuevaHora] = useState(horaLimite(licitacion));
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState('');
  const [verQuien, setVerQuien] = useState<string | null>(null);

  useEffect(() => subscribeToAclaraciones(licitacion.id, setAclaraciones), [licitacion.id]);
  useEffect(() => subscribeToInvitados(licitacion.id, setInvitados), [licitacion.id]);

  const publicar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!titulo.trim() || !texto.trim()) { setError('Escriba el título y el detalle de la aclaración.'); return; }
    if (cambiaCierre && (!nuevaFecha || (nuevaFecha === cierreActual && nuevaHora === horaLimite(licitacion)))) {
      setError('Indique la nueva fecha u hora de cierre.'); return;
    }
    const aviso = cambiaCierre ? `\n\nLa fecha de cierre cambiará a ${fechaDia(nuevaFecha)} a las ${nuevaHora} hrs.` : '';
    if (!confirm(`¿Publicar la Aclaración N° ${aclaraciones.length + 1} en el portal? La verán todos los invitados y no se puede editar después.${aviso}`)) return;
    setPublicando(true);
    try {
      const url = archivo ? await uploadLicitacionDocument(licitacion.id, 'antecedentes', archivo) : undefined;
      await publicarAclaracion(licitacion.id, {
        titulo: titulo.trim(),
        texto: texto.trim(),
        fecha: new Date().toISOString(),
        publicadaPor: user?.email || '',
        ...(archivo && url ? { archivo: { nombre: archivo.name, url } } : {}),
        ...(cambiaCierre ? { cambioCierre: { fechaAnterior: cierreActual, fechaNueva: nuevaFecha, horaAnterior: horaLimite(licitacion), horaNueva: nuevaHora } } : {}),
      });
      setTitulo(''); setTexto(''); setArchivo(null); setCambiaCierre(false); setAbierto(false);
    } catch (err) {
      console.error('Error publicando la aclaración:', err);
      setError('No se pudo publicar la aclaración. Intente nuevamente.');
    } finally {
      setPublicando(false);
    }
  };

  const campo = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-400';
  const motivoFecha = cambiaCierre && nuevaFecha ? motivoNoHabil(nuevaFecha) : undefined;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Megaphone className="w-4 h-4 text-sky-600" /> Aclaraciones y modificaciones a las bases</h3>
          <p className="text-[11px] text-slate-500">Se publican en el portal para todos los invitados; queda registro de quién las vio.</p>
        </div>
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold">
            <Plus className="w-4 h-4" /> Nueva aclaración
          </button>
        )}
      </div>

      {abierto && (
        <form onSubmit={publicar} className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-800">Aclaración N° {aclaraciones.length + 1}</p>
            <button type="button" onClick={() => { setAbierto(false); setError(''); }} className="text-slate-400 hover:text-slate-700" title="Cerrar"><X className="w-4 h-4" /></button>
          </div>
          <input className={campo} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (ej: Reemplazo de plano de cubierta, lámina A-02)" maxLength={150} />
          <textarea className={campo} rows={4} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Qué cambia o se aclara, y desde cuándo rige…" />
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <Paperclip className="w-3.5 h-3.5" />
            <input type="file" className="text-[11px] file:mr-2 file:px-2.5 file:py-1 file:rounded-lg file:border-0 file:bg-slate-200 file:text-slate-700 file:text-[11px] file:font-bold" onChange={e => setArchivo(e.target.files?.[0] || null)} />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={cambiaCierre} onChange={e => setCambiaCierre(e.target.checked)} />
            Modifica la fecha de cierre de ofertas (hoy: {textoLimiteOfertas(licitacion)})
          </label>
          {cambiaCierre && (
            <div className="flex flex-wrap items-center gap-2 pl-5">
              <input type="date" className={`${campo} w-auto`} value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} />
              <input type="time" className={`${campo} w-auto`} value={nuevaHora} onChange={e => setNuevaHora(e.target.value)} />
              {motivoFecha && <span className="text-[10px] font-semibold text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cae en día no hábil ({motivoFecha}).</span>}
            </div>
          )}
          {error && <p className="text-[11px] font-semibold text-red-700">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={publicando} className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold disabled:opacity-60">
              {publicando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Publicar en el portal
            </button>
          </div>
        </form>
      )}

      {aclaraciones.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Aún no hay aclaraciones publicadas.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {[...aclaraciones].reverse().map(a => {
            const vieron = invitados.filter(i => i.aclaracionesVistas?.[a.id]);
            const faltan = invitados.filter(i => !i.aclaracionesVistas?.[a.id]);
            return (
              <div key={a.id} className="py-2.5 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-bold text-slate-800">N° {a.numero} · {a.titulo}</span>
                  <span className="text-[10px] text-slate-400">{fechaCorta(a.fecha)} · {a.publicadaPor}</span>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-line">{a.texto}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  {a.cambioCierre && (
                    <span className="flex items-center gap-1 font-semibold text-amber-800">
                      <CalendarClock className="w-3.5 h-3.5" /> Cierre: {fechaDia(a.cambioCierre.fechaAnterior)} → {fechaDia(a.cambioCierre.fechaNueva)} {a.cambioCierre.horaNueva} hrs
                    </span>
                  )}
                  {a.archivo && (
                    <a href={a.archivo.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-700 hover:underline"><Paperclip className="w-3 h-3" /> {a.archivo.nombre}</a>
                  )}
                  {invitados.length > 0 && (
                    <button type="button" onClick={() => setVerQuien(v => (v === a.id ? null : a.id))} className={`flex items-center gap-1 font-semibold ${faltan.length ? 'text-slate-600' : 'text-emerald-700'}`}>
                      <Eye className="w-3.5 h-3.5" /> Vista por {vieron.length} de {invitados.length}
                    </button>
                  )}
                </div>
                {verQuien === a.id && (
                  <div className="text-[11px] rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 space-y-0.5">
                    {vieron.map(i => <p key={i.proveedorId} className="text-emerald-700">✓ {i.proveedorNombre} · {fechaCorta(i.aclaracionesVistas?.[a.id] as string)}</p>)}
                    {faltan.map(i => <p key={i.proveedorId} className="text-slate-500 flex items-center gap-1"><FileWarning className="w-3 h-3" /> {i.proveedorNombre} · aún no la ve</p>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
