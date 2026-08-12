import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Loader2, Plus } from 'lucide-react';
import type { HitoDesarrolloProyecto } from '../types';
import { addHitoDesarrolloProyecto, subscribeToBitacoraProyecto, updateHitoDesarrolloEstado } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { useAuth } from '../context/AuthContext';

interface Props {
  proyectoId: string;
  coleccionProyecto: 'licitaciones' | 'proyectos';
  responsableNombre: string;
  responsableEmail?: string;
}

export function BitacoraProyectoPanel({ proyectoId, coleccionProyecto, responsableNombre, responsableEmail }: Props) {
  const { user } = useAuth();
  const [hitos, setHitos] = useState<HitoDesarrolloProyecto[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [tipo, setTipo] = useState<HitoDesarrolloProyecto['tipo']>('Hito');
  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [responsable, setResponsable] = useState(responsableNombre);
  const [estado, setEstado] = useState<HitoDesarrolloProyecto['estado']>('Abierto');
  const [impactoCosto, setImpactoCosto] = useState(0);
  const [impactoPlazoDias, setImpactoPlazoDias] = useState(0);

  useEffect(() => subscribeToBitacoraProyecto(coleccionProyecto, proyectoId, setHitos), [coleccionProyecto, proyectoId]);

  const guardar = async () => {
    if (!fecha || !titulo.trim() || !detalle.trim() || !responsable.trim()) return alert('Complete fecha, título, detalle y responsable del registro.');
    setGuardando(true);
    try {
      await addHitoDesarrolloProyecto(coleccionProyecto, proyectoId, {
        fecha,
        tipo,
        titulo: titulo.trim(),
        detalle: detalle.trim(),
        responsableNombre: responsable.trim(),
        responsableEmail,
        estado,
        impactoCosto: Math.max(0, impactoCosto),
        impactoPlazoDias,
        creadoPor: user?.email || '',
        fechaCreacion: new Date().toISOString(),
      });
      setTitulo(''); setDetalle(''); setImpactoCosto(0); setImpactoPlazoDias(0); setAbierto(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="rounded-2xl border border-sky-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b bg-sky-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="flex items-center gap-2 font-black"><Activity className="h-5 w-5 text-sky-700" /> Bitácora de desarrollo del proyecto</h3><p className="mt-1 text-xs text-slate-600">Registro cronológico de hitos, inspecciones, acuerdos, riesgos, incidencias y recepciones.</p></div>
        <button onClick={() => setAbierto(value => !value)} className="rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-bold text-white"><Plus className="mr-1 inline h-4 w-4" /> Nuevo registro</button>
      </div>
      {abierto && <div className="space-y-3 border-b p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold">Fecha *<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>
          <label className="text-xs font-bold">Tipo *<select value={tipo} onChange={e => setTipo(e.target.value as HitoDesarrolloProyecto['tipo'])} className="mt-1 w-full rounded-lg border p-2.5 font-normal"><option>Hito</option><option>Reunión</option><option>Inspección</option><option>Decisión</option><option>Riesgo</option><option>Incidencia</option><option>Recepción</option></select></label>
          <label className="text-xs font-bold">Estado *<select value={estado} onChange={e => setEstado(e.target.value as HitoDesarrolloProyecto['estado'])} className="mt-1 w-full rounded-lg border p-2.5 font-normal"><option>Abierto</option><option>En seguimiento</option><option>Cerrado</option></select></label>
          <label className="text-xs font-bold">Responsable *<input value={responsable} onChange={e => setResponsable(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>
        </div>
        <label className="block text-xs font-bold">Título *<input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Entrega de terreno al contratista" className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>
        <label className="block text-xs font-bold">Detalle, acuerdo o acción requerida *<textarea value={detalle} onChange={e => setDetalle(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Impacto estimado en costo<input type="number" min="0" value={impactoCosto} onChange={e => setImpactoCosto(Number(e.target.value))} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label><label className="text-xs font-bold">Impacto estimado en plazo (días; puede ser negativo)<input type="number" value={impactoPlazoDias} onChange={e => setImpactoPlazoDias(Number(e.target.value))} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label></div>
        <div className="text-right"><button onClick={() => void guardar()} disabled={guardando} className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{guardando ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Guardar en bitácora'}</button></div>
      </div>}
      <div className="p-5">
        {!hitos.length ? <p className="text-xs text-slate-500">Aún no hay registros de desarrollo.</p> : <div className="space-y-3">{hitos.map(hito => <article key={hito.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[110px_1fr_auto]">
          <div><span className="block text-[9px] font-black uppercase text-sky-700">{hito.tipo}</span><strong className="text-xs">{new Intl.DateTimeFormat('es-CL').format(new Date(`${hito.fecha}T12:00:00`))}</strong></div>
          <div><h4 className="text-sm font-black">{hito.titulo}</h4><p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{hito.detalle}</p><p className="mt-2 text-[10px] text-slate-500">Responsable: <strong>{hito.responsableNombre}</strong>{hito.impactoCosto ? ` · Impacto costo: ${formatoMonedaCLP(hito.impactoCosto)}` : ''}{hito.impactoPlazoDias ? ` · Impacto plazo: ${hito.impactoPlazoDias > 0 ? '+' : ''}${hito.impactoPlazoDias} días` : ''}</p></div>
          <div className="text-right"><span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${hito.estado === 'Cerrado' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{hito.estado}</span>{hito.estado !== 'Cerrado' && <button onClick={() => void updateHitoDesarrolloEstado(coleccionProyecto, proyectoId, hito.id, 'Cerrado')} className="mt-3 block text-[10px] font-bold text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Cerrar</button>}{hito.estado === 'En seguimiento' && <Clock3 className="ml-auto mt-2 h-4 w-4 text-amber-600" />}</div>
        </article>)}</div>}
      </div>
    </section>
  );
}
