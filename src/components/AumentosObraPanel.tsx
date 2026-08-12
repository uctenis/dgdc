import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FilePlus2, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { AumentoObra, Cotizacion, ItemAumentoObra, LicitacionProyecto } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { addAumentoObra, subscribeToAumentosObra, updateAumentoObraEstado } from '../services/firestoreService';
import { uploadFileToProjectFolder } from '../services/driveService';
import { useAuth } from '../context/AuthContext';
import { isProjectResponsible } from '../services/internalAccessService';

interface Props {
  licitacion: LicitacionProyecto;
  oferta?: Cotizacion;
  onChange?: (aumentos: AumentoObra[]) => void;
}

const nuevoItem = (index: number): ItemAumentoObra => ({
  id: `partida-${Date.now()}-${index}`,
  item: `AO-${index + 1}`,
  descripcion: '',
  unidad: 'un',
  cantidad: 1,
  precioUnitario: 0,
  precioTotal: 0,
  tipo: 'Nueva partida',
});

export function AumentosObraPanel({ licitacion, oferta, onChange }: Props) {
  const { user, isAdmin } = useAuth();
  const [aumentos, setAumentos] = useState<AumentoObra[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [ordenCompraNumero, setOrdenCompraNumero] = useState('');
  const [fechaOrdenCompra, setFechaOrdenCompra] = useState('');
  const [ampliacionPlazoDias, setAmpliacionPlazoDias] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [archivoOC, setArchivoOC] = useState<File | null>(null);
  const [items, setItems] = useState<ItemAumentoObra[]>([nuevoItem(0)]);

  useEffect(() => subscribeToAumentosObra(licitacion.id, data => {
    setAumentos(data);
    onChange?.(data);
  }), [licitacion.id, onChange]);

  const puedePreparar = isAdmin || isProjectResponsible(user?.email, licitacion.responsableEmail);
  const aprobados = aumentos.filter(aumento => aumento.estado === 'Aprobado');
  const aumentoNeto = items.reduce((total, item) => total + item.precioTotal, 0);
  const aumentoIva = Math.round(aumentoNeto * 0.19);
  const aumentoTotal = aumentoNeto + aumentoIva;
  const montoOriginal = licitacion.montoAdjudicadoTotal || oferta?.montoTotal || 0;
  const plazoOriginal = licitacion.plazoAdjudicadoDias || oferta?.plazoDias || 0;
  const montoAumentos = aprobados.reduce((total, aumento) => total + aumento.montoTotal, 0);
  const diasAumentos = aprobados.reduce((total, aumento) => total + aumento.ampliacionPlazoDias, 0);

  const opcionesOriginales = useMemo(() => oferta?.itemizado || [], [oferta?.itemizado]);

  const actualizarItem = (id: string, cambios: Partial<ItemAumentoObra>) => {
    setItems(actuales => actuales.map(item => {
      if (item.id !== id) return item;
      const actualizado = { ...item, ...cambios };
      return { ...actualizado, precioTotal: Math.round(actualizado.cantidad * actualizado.precioUnitario) };
    }));
  };

  const limpiar = () => {
    setTitulo('');
    setMotivo('');
    setOrdenCompraNumero('');
    setFechaOrdenCompra('');
    setAmpliacionPlazoDias(0);
    setObservaciones('');
    setArchivoOC(null);
    setItems([nuevoItem(0)]);
    setAbierto(false);
  };

  const guardar = async () => {
    const partidasValidas = items.filter(item => item.descripcion.trim() && item.cantidad > 0 && item.precioUnitario > 0);
    if (!titulo.trim() || !motivo.trim() || !ordenCompraNumero.trim() || !fechaOrdenCompra) {
      return alert('Complete título, fundamento, número de orden de compra y fecha de la OC.');
    }
    if (!partidasValidas.length || partidasValidas.length !== items.length) {
      return alert('Cada partida debe tener descripción, cantidad y precio unitario mayor que cero.');
    }
    setGuardando(true);
    try {
      let respaldo: { id: string; url: string } | undefined;
      if (archivoOC) {
        const uploaded = await uploadFileToProjectFolder(archivoOC, licitacion.id, licitacion.nombreProyecto);
        if (uploaded.storage !== 'drive') {
          alert('La orden de compra no pudo almacenarse en Drive. Autorice Drive e intente nuevamente.');
          return;
        }
        respaldo = uploaded;
      }
      await addAumentoObra(licitacion.id, {
        titulo: titulo.trim(),
        motivo: motivo.trim(),
        ordenCompraNumero: ordenCompraNumero.trim(),
        fechaOrdenCompra,
        items: partidasValidas,
        montoNeto: aumentoNeto,
        montoIva: aumentoIva,
        montoTotal: aumentoTotal,
        ampliacionPlazoDias: Math.max(0, ampliacionPlazoDias),
        observaciones: observaciones.trim(),
        ...(archivoOC && respaldo ? { archivoOCNombre: archivoOC.name, archivoOCURL: respaldo.url, archivoOCDriveId: respaldo.id } : {}),
        estado: 'Borrador',
        creadoPor: user?.email || '',
        fechaCreacion: new Date().toISOString(),
      });
      limpiar();
      alert('Aumento de obra guardado como borrador. Debe ser aprobado por el administrador para modificar el contrato vigente.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (aumento: AumentoObra, estado: AumentoObra['estado']) => {
    if (!isAdmin) return;
    if (!confirm(`¿Confirma dejar el aumento N° ${aumento.numero} como ${estado}?`)) return;
    await updateAumentoObraEstado(licitacion.id, aumento.id, estado, user?.email || '');
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-violet-100 bg-violet-50/70 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-black text-slate-900"><FilePlus2 className="h-5 w-5 text-violet-700" /> Modificaciones contractuales y aumentos de obra</h3>
            <p className="mt-1 text-xs text-slate-600">El contrato original permanece intacto. Solo los aumentos aprobados modifican monto, partidas y plazo vigente.</p>
          </div>
          {puedePreparar && <button onClick={() => setAbierto(value => !value)} className="rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white"><Plus className="mr-1 inline h-4 w-4" /> Nuevo aumento</button>}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border bg-white p-3"><span className="block text-[9px] font-bold uppercase text-slate-400">Contrato original</span><strong>{formatoMonedaCLP(montoOriginal)} · {plazoOriginal} días</strong></div>
          <div className="rounded-xl border border-violet-200 bg-white p-3"><span className="block text-[9px] font-bold uppercase text-violet-500">Aumentos aprobados</span><strong className="text-violet-800">+{formatoMonedaCLP(montoAumentos)} · +{diasAumentos} días</strong></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><span className="block text-[9px] font-bold uppercase text-emerald-600">Contrato vigente</span><strong className="text-emerald-900">{formatoMonedaCLP(montoOriginal + montoAumentos)} · {plazoOriginal + diasAumentos} días</strong></div>
        </div>
      </div>

      {abierto && (
        <div className="space-y-4 border-b border-violet-100 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold">Nombre de la modificación *<input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Aumento obras eléctricas sector norte" className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>
            <label className="text-xs font-bold">Orden de compra asociada *<input value={ordenCompraNumero} onChange={e => setOrdenCompraNumero(e.target.value)} placeholder="OC-4500..." className="mt-1 w-full rounded-lg border p-2.5 font-mono font-normal" /></label>
            <label className="text-xs font-bold">Fecha de la OC *<input type="date" value={fechaOrdenCompra} onChange={e => setFechaOrdenCompra(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>
            <label className="text-xs font-bold">Ampliación de plazo (días corridos)<input type="number" min="0" value={ampliacionPlazoDias} onChange={e => setAmpliacionPlazoDias(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>
          </div>
          <label className="block text-xs font-bold">Fundamento técnico/administrativo *<textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Explique necesidad, alcance, impacto y autorización..." className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[900px] text-[11px]">
              <thead className="bg-slate-900 text-white"><tr><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Partida</th><th className="p-2 text-left">Descripción</th><th className="p-2">Unidad</th><th className="p-2">Cantidad</th><th className="p-2">P. unitario neto</th><th className="p-2 text-right">Total neto</th><th></th></tr></thead>
              <tbody className="divide-y">
                {items.map(item => <tr key={item.id}>
                  <td className="p-2"><select value={item.tipo} onChange={e => actualizarItem(item.id, { tipo: e.target.value as ItemAumentoObra['tipo'], itemOriginalId: undefined })} className="rounded border p-2"><option>Nueva partida</option><option>Aumento de cantidad</option></select></td>
                  <td className="p-2">{item.tipo === 'Aumento de cantidad' ? <select value={item.itemOriginalId || ''} onChange={e => { const original = opcionesOriginales.find(opcion => opcion.id === e.target.value); actualizarItem(item.id, { itemOriginalId: e.target.value, item: original ? `${original.item}-AUM` : item.item, descripcion: original?.descripcion || item.descripcion, unidad: original?.unidad || item.unidad }); }} className="w-36 rounded border p-2"><option value="">Seleccione</option>{opcionesOriginales.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.item}</option>)}</select> : <input value={item.item} onChange={e => actualizarItem(item.id, { item: e.target.value })} className="w-28 rounded border p-2" />}</td>
                  <td className="p-2"><input value={item.descripcion} onChange={e => actualizarItem(item.id, { descripcion: e.target.value })} className="w-full min-w-52 rounded border p-2" /></td>
                  <td className="p-2"><input value={item.unidad} onChange={e => actualizarItem(item.id, { unidad: e.target.value })} className="w-16 rounded border p-2" /></td>
                  <td className="p-2"><input type="number" min="0" step="0.01" value={item.cantidad} onChange={e => actualizarItem(item.id, { cantidad: Number(e.target.value) })} className="w-20 rounded border p-2 text-right" /></td>
                  <td className="p-2"><input type="number" min="0" value={item.precioUnitario} onChange={e => actualizarItem(item.id, { precioUnitario: Number(e.target.value) })} className="w-28 rounded border p-2 text-right" /></td>
                  <td className="p-2 text-right font-bold">{formatoMonedaCLP(item.precioTotal)}</td>
                  <td className="p-2"><button onClick={() => setItems(actuales => actuales.length === 1 ? actuales : actuales.filter(actual => actual.id !== item.id))} className="text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <button onClick={() => setItems(actuales => [...actuales, nuevoItem(actuales.length)])} className="text-xs font-bold text-violet-700"><Plus className="mr-1 inline h-4 w-4" /> Agregar partida</button>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-2"><label className="block text-xs font-bold">Observaciones<textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label><label className="block text-xs font-bold">Respaldo de la OC<input type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" onChange={e => setArchivoOC(e.target.files?.[0] || null)} className="mt-1 block text-xs font-normal" /></label></div>
            <div className="min-w-56 rounded-xl bg-slate-50 p-4 text-right text-xs"><p>Neto: <strong>{formatoMonedaCLP(aumentoNeto)}</strong></p><p>IVA: <strong>{formatoMonedaCLP(aumentoIva)}</strong></p><p className="mt-1 text-base text-violet-800">Total: <strong>{formatoMonedaCLP(aumentoTotal)}</strong></p><button onClick={() => void guardar()} disabled={guardando} className="mt-3 rounded-lg bg-violet-700 px-4 py-2 font-bold text-white disabled:opacity-50">{guardando ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Guardar borrador'}</button></div>
          </div>
        </div>
      )}

      <div className="p-5">
        {!aumentos.length ? <p className="text-xs text-slate-500">No existen modificaciones contractuales registradas.</p> : <div className="grid gap-3 lg:grid-cols-2">{aumentos.map(aumento => (
          <article key={aumento.id} className={`rounded-xl border p-4 ${aumento.estado === 'Aprobado' ? 'border-emerald-200 bg-emerald-50/40' : aumento.estado === 'Borrador' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-start justify-between gap-3"><div><span className="text-[9px] font-black uppercase text-slate-400">Aumento N° {aumento.numero} · {aumento.ordenCompraNumero}</span><h4 className="font-black text-slate-900">{aumento.titulo}</h4></div><span className="rounded-full border bg-white px-2 py-1 text-[9px] font-bold">{aumento.estado}</span></div>
            <p className="mt-2 text-xs text-slate-600">{aumento.motivo}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><span className="block text-slate-400">Monto</span><strong>{formatoMonedaCLP(aumento.montoTotal)}</strong></div><div><span className="block text-slate-400">Plazo</span><strong>+{aumento.ampliacionPlazoDias} días</strong></div><div><span className="block text-slate-400">Partidas</span><strong>{aumento.items.length}</strong></div></div>
            {aumento.archivoOCURL && <a href={aumento.archivoOCURL} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[10px] font-bold text-sky-700 underline">Abrir respaldo OC</a>}
            {isAdmin && aumento.estado === 'Borrador' && <div className="mt-4 flex gap-2"><button onClick={() => void cambiarEstado(aumento, 'Aprobado')} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Aprobar e incorporar</button><button onClick={() => void cambiarEstado(aumento, 'Rechazado')} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-bold text-red-700"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> Rechazar</button></div>}
            {aumento.estado === 'Aprobado' && <p className="mt-3 flex items-center gap-1 text-[10px] font-bold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" /> Incorporado al contrato vigente por {aumento.aprobadoPor || 'administración'}</p>}
          </article>
        ))}</div>}
      </div>
    </section>
  );
}
