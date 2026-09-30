import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Plus, Loader2, Paperclip, Trash2, Undo2, AlertTriangle, X } from 'lucide-react';
import { addGarantia, deleteGarantia, subscribeToGarantias, updateGarantia } from '../services/firestoreService';
import { uploadLicitacionDocument } from '../services/storageService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { useAuth } from '../context/AuthContext';
import { COLOR_VENCIMIENTO, estadoVencimiento, requiereAviso, DIAS_AVISO_VENCIMIENTO } from '../utils/vencimientos';
import {
  INSTRUMENTOS_GARANTIA, TIPOS_GARANTIA,
  type GarantiaLicitacion, type InstrumentoGarantia, type LicitacionProyecto, type Proveedor, type TipoGarantia,
} from '../types';

interface Props {
  licitacion: LicitacionProyecto;
  proveedores: Proveedor[];
}

const formularioVacio = (proveedorId = '') => ({
  tipo: 'Fiel Cumplimiento del Contrato' as TipoGarantia,
  instrumento: 'Boleta de Garantía Bancaria' as InstrumentoGarantia,
  numero: '',
  emisor: '',
  monto: '',
  moneda: 'CLP' as 'CLP' | 'UF',
  proveedorId,
  fechaEmision: '',
  fechaVencimiento: '',
  observaciones: '',
});

const ESTILO_ESTADO: Record<GarantiaLicitacion['estado'], string> = {
  Vigente: 'bg-sky-100 text-sky-800',
  Devuelta: 'bg-slate-200 text-slate-600',
  Cobrada: 'bg-purple-100 text-purple-800',
};

const montoTexto = (g: Pick<GarantiaLicitacion, 'monto' | 'moneda'>) =>
  g.moneda === 'UF' ? `UF ${g.monto.toLocaleString('es-CL', { maximumFractionDigits: 2 })}` : formatoMonedaCLP(g.monto);

/**
 * Garantías de la licitación y del contrato (boletas, pólizas, vales vista): registro con respaldo, alerta de
 * vencimiento con DIAS_AVISO_VENCIMIENTO días de anticipación y control de devolución o cobro.
 */
export function GarantiasManager({ licitacion, proveedores }: Props) {
  const { user } = useAuth();
  const [garantias, setGarantias] = useState<GarantiaLicitacion[]>([]);
  const proveedorAdjudicado = licitacion.proveedorAdjudicadoId || licitacion.proveedorGanadorId || '';
  const [form, setForm] = useState(() => formularioVacio(proveedorAdjudicado));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeToGarantias(licitacion.id, setGarantias), [licitacion.id]);

  // Proveedores que participan en esta licitación (invitados); si no hay, todos.
  const opcionesProveedor = useMemo(() => {
    const ids = new Set([...(licitacion.proveedoresInvitadosIds || []), proveedorAdjudicado].filter(Boolean));
    const lista = ids.size ? proveedores.filter(p => ids.has(p.id)) : proveedores;
    return [...lista].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));
  }, [licitacion.proveedoresInvitadosIds, proveedorAdjudicado, proveedores]);

  const vigentes = garantias.filter(g => g.estado === 'Vigente');
  const conAviso = vigentes.filter(g => requiereAviso(estadoVencimiento(g.fechaVencimiento)));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const monto = Number(String(form.monto).replace(/\./g, '').replace(',', '.'));
    if (!form.numero.trim() || !form.emisor.trim() || !form.fechaVencimiento || !(monto > 0)) {
      setError('Complete el N° del documento, el emisor, el monto y la fecha de vencimiento.');
      return;
    }
    setGuardando(true);
    try {
      let archivoURL: string | undefined;
      if (archivo) archivoURL = await uploadLicitacionDocument(licitacion.id, 'garantias', archivo);
      const prov = proveedores.find(p => p.id === form.proveedorId);
      await addGarantia(licitacion.id, {
        tipo: form.tipo,
        instrumento: form.instrumento,
        numero: form.numero.trim(),
        emisor: form.emisor.trim(),
        monto,
        moneda: form.moneda,
        ...(prov ? { proveedorId: prov.id, proveedorNombre: prov.razonSocial } : {}),
        ...(form.fechaEmision ? { fechaEmision: form.fechaEmision } : {}),
        fechaVencimiento: form.fechaVencimiento,
        estado: 'Vigente',
        ...(form.observaciones.trim() ? { observaciones: form.observaciones.trim() } : {}),
        ...(archivo && archivoURL ? { archivoNombre: archivo.name, archivoURL } : {}),
        fechaRegistro: new Date().toISOString(),
        ...(user?.email ? { registradaPor: user.email } : {}),
      });
      setForm(formularioVacio(proveedorAdjudicado));
      setArchivo(null);
      setAbierto(false);
    } catch (err) {
      console.error('Error guardando la garantía:', err);
      setError('No se pudo guardar la garantía. Intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (g: GarantiaLicitacion, estado: GarantiaLicitacion['estado']) => {
    const pregunta = estado === 'Devuelta'
      ? `¿Registrar que la ${g.instrumento} N° ${g.numero} fue DEVUELTA al proveedor?`
      : estado === 'Cobrada'
        ? `¿Registrar que la ${g.instrumento} N° ${g.numero} fue COBRADA (ejecutada)?`
        : `¿Volver a dejar la ${g.instrumento} N° ${g.numero} como vigente?`;
    if (!confirm(pregunta)) return;
    await updateGarantia(licitacion.id, g.id, { estado, fechaCambioEstado: new Date().toISOString() });
  };

  const eliminar = async (g: GarantiaLicitacion) => {
    if (!confirm(`¿Eliminar el registro de la ${g.instrumento} N° ${g.numero}? Use esto solo si se registró por error.`)) return;
    await deleteGarantia(licitacion.id, g.id);
  };

  const campo = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-400';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-600" /> Garantías
          </h3>
          <p className="text-[11px] text-slate-500">
            Boletas, pólizas y vales vista del proceso y del contrato. Se avisa {DIAS_AVISO_VENCIMIENTO} días antes de cada vencimiento.
          </p>
        </div>
        {!abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
          >
            <Plus className="w-4 h-4" /> Registrar garantía
          </button>
        )}
      </div>

      {conAviso.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            <strong>{conAviso.length} {conAviso.length === 1 ? 'garantía vigente requiere' : 'garantías vigentes requieren'} atención:</strong>{' '}
            pida la renovación al proveedor antes del vencimiento o, si corresponde, gestione su cobro.
          </span>
        </div>
      )}

      {abierto && (
        <form onSubmit={guardar} className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-800">Nueva garantía</p>
            <button type="button" onClick={() => { setAbierto(false); setError(''); }} className="text-slate-400 hover:text-slate-700" title="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="space-y-1 text-[11px] font-semibold text-slate-600">
              Garantiza
              <select className={campo} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoGarantia }))}>
                {TIPOS_GARANTIA.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-slate-600">
              Documento
              <select className={campo} value={form.instrumento} onChange={e => setForm(f => ({ ...f, instrumento: e.target.value as InstrumentoGarantia }))}>
                {INSTRUMENTOS_GARANTIA.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-slate-600">
              Proveedor (tomador)
              <select className={campo} value={form.proveedorId} onChange={e => setForm(f => ({ ...f, proveedorId: e.target.value }))}>
                <option value="">— Seleccione —</option>
                {opcionesProveedor.map(p => <option key={p.id} value={p.id}>{p.razonSocial}{p.id === proveedorAdjudicado ? ' (adjudicado)' : ''}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-slate-600">
              N° del documento
              <input className={campo} value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="Ej: 0012345" />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-slate-600">
              Banco o compañía emisora
              <input className={campo} value={form.emisor} onChange={e => setForm(f => ({ ...f, emisor: e.target.value }))} placeholder="Ej: Banco de Chile" />
            </label>
            <div className="space-y-1 text-[11px] font-semibold text-slate-600">
              Monto
              <div className="flex gap-1.5">
                <select className={`${campo} w-20`} value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'CLP' | 'UF' }))}>
                  <option value="CLP">$</option>
                  <option value="UF">UF</option>
                </select>
                <input className={campo} inputMode="decimal" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="Ej: 464100" />
              </div>
            </div>
            <label className="space-y-1 text-[11px] font-semibold text-slate-600">
              Fecha de emisión
              <input type="date" className={campo} value={form.fechaEmision} onChange={e => setForm(f => ({ ...f, fechaEmision: e.target.value }))} />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-slate-600">
              Fecha de vencimiento *
              <input type="date" className={campo} value={form.fechaVencimiento} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))} />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-slate-600">
              Respaldo (PDF o imagen)
              <input type="file" accept=".pdf,image/*" className="block w-full text-[11px] text-slate-600 file:mr-2 file:px-2.5 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-200 file:text-slate-700 file:text-[11px] file:font-bold" onChange={e => setArchivo(e.target.files?.[0] || null)} />
            </label>
          </div>
          <label className="block space-y-1 text-[11px] font-semibold text-slate-600">
            Observaciones
            <input className={campo} value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Opcional" />
          </label>
          {error && <p className="text-[11px] font-semibold text-red-700">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold disabled:opacity-60">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar garantía
            </button>
          </div>
        </form>
      )}

      {garantias.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Aún no hay garantías registradas en esta licitación.</p>
      ) : (
        <div className="space-y-2">
          {garantias.map(g => {
            const venc = estadoVencimiento(g.fechaVencimiento);
            return (
              <div key={g.id} className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${g.estado === 'Vigente' ? 'border-slate-200' : 'border-slate-100 bg-slate-50 opacity-75'}`}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-xs text-slate-800">{g.tipo}</strong>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ESTILO_ESTADO[g.estado]}`}>{g.estado}</span>
                    {g.estado === 'Vigente' && (
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${COLOR_VENCIMIENTO[venc.nivel]}`}>{venc.texto}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {g.instrumento} N° {g.numero} · {g.emisor} · <strong>{montoTexto(g)}</strong>
                    {g.proveedorNombre && <> · {g.proveedorNombre}</>}
                  </p>
                  {(g.observaciones || g.fechaCambioEstado) && (
                    <p className="text-[10px] text-slate-400">
                      {g.observaciones}
                      {g.estado !== 'Vigente' && g.fechaCambioEstado && ` ${g.estado} el ${new Date(g.fechaCambioEstado).toLocaleDateString('es-CL')}.`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {g.archivoURL && (
                    <a href={g.archivoURL} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50" title={g.archivoNombre}>
                      <Paperclip className="w-3.5 h-3.5" /> Respaldo
                    </a>
                  )}
                  {g.estado === 'Vigente' ? (
                    <>
                      <button type="button" onClick={() => cambiarEstado(g, 'Devuelta')} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold">Devuelta</button>
                      <button type="button" onClick={() => cambiarEstado(g, 'Cobrada')} className="px-2.5 py-1.5 rounded-lg border border-purple-300 text-purple-800 hover:bg-purple-50 text-[11px] font-bold">Cobrada</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => cambiarEstado(g, 'Vigente')} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Volver a vigente">
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => eliminar(g)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Eliminar registro">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
