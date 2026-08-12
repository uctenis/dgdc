import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ClipboardCheck, FileCheck2, FileText, FolderOpen, Landmark,
  CalendarDays, CircleDollarSign, Clock3, Loader2, Receipt, Save, TrendingUp,
  Trophy, Upload, WalletCards, ShieldCheck, LockKeyhole,
} from 'lucide-react';
import type {
  AumentoObra, ConfiguracionFirmas, Cotizacion, EstadoPago, ItemEstadoPago,
  LicitacionProyecto, Proveedor,
} from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { QuotationIngestion } from './QuotationIngestion';
import { EvaluationMatrix } from './EvaluationMatrix';
import { DocumentGenerator } from './DocumentGenerator';
import { FichaProyectoPage } from './FichaProyectoPage';
import { EstadoPagoDocumentModal } from './EstadoPagoDocumentModal';
import { parseOrdenDeCompra } from '../utils/ocParser';
import { uploadFileToProjectFolder } from '../services/driveService';
import {
  addEstadoPago, subscribeToAumentosObra, subscribeToEstadosPago, updateLicitacion,
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { isProjectResponsible } from '../services/internalAccessService';
import { firmarEstadoPagoSeguro } from '../services/paymentSignatureService';

type TabId = 'resumen' | 'expediente' | 'ofertas' | 'evaluacion' | 'actas' | 'oc' | 'pagos';

interface Props {
  licitacion: LicitacionProyecto;
  proveedores: Proveedor[];
  cotizaciones: Cotizacion[];
  configFirmas: ConfiguracionFirmas;
  onBack: () => void;
  onAddCotizacion: (cotizacion: Omit<Cotizacion, 'id' | 'fechaCarga'>) => void | Promise<void>;
  onDeleteCotizacion: (id: string) => void | Promise<void>;
  onAdjudicarLicitacion: (licitacionId: string, proveedorId: string, justificacion: string) => void | Promise<void>;
}

const tabs: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'resumen', label: 'Resumen', icon: ClipboardCheck },
  { id: 'expediente', label: 'Expediente', icon: FolderOpen },
  { id: 'ofertas', label: 'Ofertas', icon: Receipt },
  { id: 'evaluacion', label: 'Evaluación', icon: Trophy },
  { id: 'actas', label: 'Actas', icon: FileCheck2 },
  { id: 'oc', label: 'Orden de compra', icon: Landmark },
  { id: 'pagos', label: 'Estados de pago', icon: WalletCards },
];

export function LicitacionWorkspacePage({
  licitacion, proveedores, cotizaciones, configFirmas, onBack,
  onAddCotizacion, onDeleteCotizacion, onAdjudicarLicitacion,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const ofertas = cotizaciones.filter(c => c.licitacionId === licitacion.id);
  const ofertaAdjudicada = ofertas.find(c => c.id === licitacion.cotizacionAdjudicadaId)
    || ofertas.find(c => c.proveedorId === (licitacion.proveedorAdjudicadoId || licitacion.proveedorGanadorId));
  const proveedorAdjudicado = proveedores.find(p => p.id === (licitacion.proveedorAdjudicadoId || licitacion.proveedorGanadorId));
  const montoAdjudicado = licitacion.montoAdjudicadoTotal ?? ofertaAdjudicada?.montoTotal;
  const tieneMontoAdjudicado = Boolean(
    montoAdjudicado && montoAdjudicado > 0 &&
    (licitacion.estado === 'Adjudicado' || Boolean(licitacion.proveedorAdjudicadoId || licitacion.proveedorGanadorId)),
  );
  const montoProyecto = tieneMontoAdjudicado ? montoAdjudicado! : licitacion.montoEstimado;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-sky-700">
        <ArrowLeft className="w-4 h-4" /> Volver a licitaciones
      </button>

      <section className="rounded-3xl p-6 sm:p-8 text-white shadow-lg border border-slate-700 bg-gradient-to-br from-slate-950 via-blue-950 to-sky-900">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
              <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10">CP {licitacion.codigoCP}</span>
              <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10">{licitacion.codigoProyecto}</span>
              <span className="px-2.5 py-1 rounded-full bg-sky-400/15 text-sky-200 border border-sky-300/20">{licitacion.estado}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}</h1>
            <p className="text-sm text-slate-300 max-w-3xl">{licitacion.descripcion}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[300px]">
            <div className="rounded-xl bg-white/8 border border-white/10 p-3">
              <span className="block text-[10px] uppercase text-slate-400">Ofertas</span>
              <strong className="text-xl text-sky-300">{ofertas.length}</strong>
            </div>
            <div className="rounded-xl bg-white/8 border border-white/10 p-3">
              <span className="block text-[10px] uppercase text-slate-400">{tieneMontoAdjudicado ? 'Monto adjudicado' : 'Monto estimado'}</span>
              <strong className="text-sm text-emerald-300">{formatoMonedaCLP(montoProyecto)}</strong>
              {tieneMontoAdjudicado && (
                <span className="block text-[9px] text-slate-400 mt-1">Estimado: {formatoMonedaCLP(licitacion.montoEstimado)}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'resumen' && <ResumenLicitacion licitacion={licitacion} oferta={ofertaAdjudicada} ofertasCount={ofertas.length} onNavigate={setActiveTab} />}
      {activeTab === 'expediente' && (
        <FichaProyectoPage
          proyecto={licitacion}
          onBack={onBack}
          hideBack
          proveedorAdjudicado={proveedorAdjudicado}
          cotizacionAdjudicada={ofertaAdjudicada}
        />
      )}
      {activeTab === 'ofertas' && (
        <QuotationIngestion licitacion={licitacion} proveedores={proveedores} cotizaciones={cotizaciones} onAddCotizacion={onAddCotizacion} onDeleteCotizacion={onDeleteCotizacion} />
      )}
      {activeTab === 'evaluacion' && (
        <EvaluationMatrix licitacion={licitacion} cotizaciones={cotizaciones} onAdjudicarLicitacion={onAdjudicarLicitacion} onNavigateToDocumentos={() => setActiveTab('actas')} />
      )}
      {activeTab === 'actas' && (
        <DocumentGenerator
          licitacion={licitacion}
          cotizaciones={cotizaciones}
          proveedores={proveedores}
          configFirmas={configFirmas}
          onAdjudicarLicitacion={onAdjudicarLicitacion}
        />
      )}
      {activeTab === 'oc' && <OrdenCompraTab licitacion={licitacion} oferta={ofertaAdjudicada} />}
      {activeTab === 'pagos' && <EstadosPagoTab licitacion={licitacion} oferta={ofertaAdjudicada} />}
    </div>
  );
}

function ResumenLicitacion({ licitacion, oferta, ofertasCount, onNavigate }: {
  licitacion: LicitacionProyecto;
  oferta?: Cotizacion;
  ofertasCount: number;
  onNavigate: (tab: TabId) => void;
}) {
  const empresaAdjudicada = oferta?.proveedorNombre || licitacion.proveedorAdjudicadoNombre;
  const rutAdjudicado = oferta?.proveedorRut || licitacion.proveedorAdjudicadoRut;
  const montoAdjudicado = licitacion.montoAdjudicadoTotal || oferta?.montoTotal;
  const plazoAdjudicado = licitacion.plazoAdjudicadoDias || oferta?.plazoDias;
  const etapas = [
    { label: 'Ofertas recibidas', ok: ofertasCount > 0, tab: 'ofertas' as TabId },
    { label: 'Empresa adjudicada', ok: Boolean(empresaAdjudicada), tab: 'evaluacion' as TabId },
    { label: 'Orden de compra', ok: Boolean(licitacion.ordenCompraNumero), tab: 'oc' as TabId },
    { label: 'Ejecución y pagos', ok: licitacion.estadoLifecycle === 'En_Ejecucion' || licitacion.estadoLifecycle === 'Finalizado', tab: 'pagos' as TabId },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="font-black text-slate-900 mb-4">Estado operativo de la licitación</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {etapas.map((etapa, index) => (
            <button key={etapa.label} onClick={() => onNavigate(etapa.tab)} className="text-left p-4 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition">
              <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-black mr-2 ${etapa.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
              <strong className="text-sm">{etapa.label}</strong>
              <span className={`block ml-9 text-[11px] ${etapa.ok ? 'text-emerald-700' : 'text-slate-400'}`}>{etapa.ok ? 'Completado' : 'Pendiente'}</span>
            </button>
          ))}
        </div>
      </div>
      <aside className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="font-black text-slate-900 mb-4">Responsable de la obra</h2>
        {empresaAdjudicada ? (
          <div className="space-y-3 text-sm">
            <div><span className="text-[10px] uppercase text-slate-400 block">Empresa adjudicada</span><strong>{empresaAdjudicada}</strong>{rutAdjudicado && <p className="text-xs text-slate-500">RUT: {rutAdjudicado}</p>}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 p-3 rounded-xl"><span className="text-[10px] text-emerald-700 block">Monto oficial</span><strong className="text-xs">{montoAdjudicado ? formatoMonedaCLP(montoAdjudicado) : 'Por informar'}</strong></div>
              <div className="bg-sky-50 p-3 rounded-xl"><span className="text-[10px] text-sky-700 block">Plazo</span><strong>{plazoAdjudicado ? `${plazoAdjudicado} días` : 'Por informar'}</strong></div>
            </div>
          </div>
        ) : <p className="text-xs text-slate-500">La empresa, el monto y el plazo se completarán automáticamente al adjudicar.</p>}
      </aside>
    </div>
  );
}

function OrdenCompraTab({ licitacion, oferta }: { licitacion: LicitacionProyecto; oferta?: Cotizacion }) {
  const [file, setFile] = useState<File | null>(null);
  const [numero, setNumero] = useState(licitacion.ordenCompraNumero || '');
  const [numeroContrato, setNumeroContrato] = useState(licitacion.numeroContrato || '');
  const [numeroOT, setNumeroOT] = useState(licitacion.codigoOT || licitacion.ordenTrabajoNumero || '');
  const [numeroOP, setNumeroOP] = useState(licitacion.codigoOP || licitacion.ordenPedidoNumero || '');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFile = async (selected: File) => {
    setFile(selected);
    setParsing(true);
    const parsed = await parseOrdenDeCompra(selected);
    if (parsed.numeroOC) setNumero(parsed.numeroOC);
    if (parsed.numeroOT) setNumeroOT(parsed.numeroOT);
    if (parsed.numeroOP) setNumeroOP(parsed.numeroOP);
    setParsing(false);
  };

  const save = async () => {
    if ((!file && !licitacion.archivoOCURL) || !numero.trim()) return alert('Seleccione la orden de compra y confirme su número.');
    setSaving(true);
    try {
      let archivoActualizado: Partial<LicitacionProyecto> = {};
      if (file) {
        const uploaded = await uploadFileToProjectFolder(file, licitacion.id, licitacion.nombreProyecto);
        if (uploaded.storage !== 'drive') {
          alert('No se pudo almacenar la OC en Drive. Configure o autorice Google Drive e intente nuevamente.');
          return;
        }
        archivoActualizado = { archivoOCNombre: file.name, archivoOCURL: uploaded.url, archivoOCDriveId: uploaded.id };
      }
      await updateLicitacion(licitacion.id, {
        ordenCompraNumero: numero.trim(), numeroContrato: numeroContrato.trim(),
        codigoOT: numeroOT.trim(), ordenTrabajoNumero: numeroOT.trim(),
        codigoOP: numeroOP.trim(), ordenPedidoNumero: numeroOP.trim(),
        ...archivoActualizado,
        fechaCargaOC: new Date().toISOString().split('T')[0], estadoLifecycle: 'OC_Emitida',
      });
      alert('Orden de compra guardada en la carpeta de la licitación.');
    } finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <section className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div><h2 className="font-black text-slate-900">Orden de compra</h2><p className="text-xs text-slate-500">El documento se aloja en la carpeta Drive de esta licitación.</p></div>
        <label className="block border-2 border-dashed border-violet-200 bg-violet-50/40 rounded-2xl p-7 text-center cursor-pointer">
          <Upload className="w-8 h-8 text-violet-600 mx-auto mb-2" />
          <strong className="text-sm text-slate-800">{file?.name || licitacion.archivoOCNombre || 'Seleccionar documento OC'}</strong>
          <input type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold text-slate-700">Número de OC (principal)</label><input value={numero} onChange={e => setNumero(e.target.value.toUpperCase())} className="mt-1 w-full px-3 py-2.5 border border-violet-300 rounded-xl font-bold" placeholder="OC-450012890" /></div><div><label className="text-xs font-bold text-slate-700">Número de contrato (si corresponde)</label><input value={numeroContrato} onChange={e => setNumeroContrato(e.target.value.toUpperCase())} className="mt-1 w-full px-3 py-2.5 border border-slate-300 rounded-xl font-bold" placeholder="CONTRATO-2026-001" /></div></div>
        <div className="grid sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold text-slate-700">Orden de Trabajo (OT)</label><input value={numeroOT} onChange={e => setNumeroOT(e.target.value.toUpperCase())} className="mt-1 w-full px-3 py-2.5 border border-slate-300 rounded-xl font-bold" placeholder="OT-2026-001" /><span className="text-[9px] text-slate-400">Se completa automáticamente desde la OC.</span></div><div><label className="text-xs font-bold text-slate-700">Orden de Pedido (OP)</label><input value={numeroOP} onChange={e => setNumeroOP(e.target.value.toUpperCase())} className="mt-1 w-full px-3 py-2.5 border border-slate-300 rounded-xl font-bold" placeholder="OP-2026-001" /><span className="text-[9px] text-slate-400">Se completa automáticamente desde la OC.</span></div></div>
        <button onClick={save} disabled={saving || parsing} className="px-5 py-2.5 bg-violet-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50">
          {saving || parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {parsing ? 'Leyendo OC...' : saving ? 'Guardando...' : 'Guardar orden de compra'}
        </button>
      </section>
      <aside className="bg-slate-900 text-white p-6 rounded-2xl space-y-3">
        <h3 className="font-bold">Datos de adjudicación</h3>
        {oferta ? <><p className="text-sm font-bold text-sky-300">{oferta.proveedorNombre}</p><p className="text-xs text-slate-400">Monto: {formatoMonedaCLP(oferta.montoTotal)}</p><p className="text-xs text-slate-400">Plazo: {oferta.plazoDias} días</p></> : <p className="text-xs text-amber-300">Debe adjudicar una oferta antes de emitir la OC.</p>}
        {licitacion.archivoOCURL && <a href={licitacion.archivoOCURL} target="_blank" rel="noreferrer" className="text-xs text-sky-300 underline">Abrir OC almacenada</a>}
      </aside>
    </div>
  );
}

async function calcularHashEstadoPago(estado: EstadoPago): Promise<string> {
  const contenidoFirmado = JSON.stringify({
    id: estado.id,
    licitacionId: estado.licitacionId,
    numero: estado.numero,
    fecha: estado.fecha,
    proveedorId: estado.proveedorId,
    cotizacionId: estado.cotizacionId,
    items: estado.items,
    montoNeto: estado.montoNeto,
    montoIva: estado.montoIva,
    montoTotal: estado.montoTotal,
    porcentajeAvanceGlobal: estado.porcentajeAvanceGlobal,
    observaciones: estado.observaciones || '',
    archivoDriveId: estado.archivoDriveId || '',
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contenidoFirmado));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function EstadosPagoTab({ licitacion, oferta }: { licitacion: LicitacionProyecto; oferta?: Cotizacion }) {
  const { user } = useAuth();
  const [estados, setEstados] = useState<EstadoPago[]>([]);
  const [aumentos, setAumentos] = useState<AumentoObra[]>([]);
  const [avances, setAvances] = useState<Record<string, number | undefined>>({});
  const [observaciones, setObservaciones] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [fechaInicio, setFechaInicio] = useState(licitacion.fechaInicioObra || '');
  const [estadoDocumento, setEstadoDocumento] = useState<EstadoPago | null>(null);
  const [firmandoId, setFirmandoId] = useState<string | null>(null);

  useEffect(() => subscribeToEstadosPago(licitacion.id, setEstados), [licitacion.id]);
  useEffect(() => subscribeToAumentosObra(licitacion.id, setAumentos), [licitacion.id]);
  useEffect(() => setFechaInicio(licitacion.fechaInicioObra || ''), [licitacion.fechaInicioObra]);

  const esResponsableActual = isProjectResponsible(user?.email, licitacion.responsableEmail);

  const firmarEstadoPago = async (estado: EstadoPago) => {
    if (!user || !esResponsableActual) {
      return alert(`Solo ${licitacion.responsableNombre || 'el responsable del proyecto'} (${licitacion.responsableEmail || 'correo no configurado'}) puede firmar este estado de pago.`);
    }
    if (estado.firmaResponsable) return alert('Este estado de pago ya fue firmado y no admite una segunda firma.');
    if (!confirm(`¿Confirma la revisión y firma electrónica del Estado de Pago N° ${estado.numero}? Esta aprobación quedará asociada a ${user.email}.`)) return;
    setFirmandoId(estado.id);
    try {
      const sha256 = await calcularHashEstadoPago(estado);
      await firmarEstadoPagoSeguro(user, licitacion.id, estado.id, sha256);
      alert(`Estado de Pago N° ${estado.numero} firmado correctamente.`);
    } catch (error) {
      console.error('No se pudo firmar el estado de pago:', error);
      alert('No fue posible registrar la firma. Intente nuevamente.');
    } finally {
      setFirmandoId(null);
    }
  };

  const aumentosAprobados = aumentos.filter(aumento => aumento.estado === 'Aprobado');
  const items = useMemo(() => [
    ...(oferta?.itemizado || []),
    ...aumentosAprobados.flatMap(aumento => aumento.items.map(item => ({
      id: `aumento-${aumento.id}-${item.id}`,
      item: `AO${aumento.numero}-${item.item}`,
      descripcion: item.descripcion,
      unidad: item.unidad,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      precioTotal: item.precioTotal,
    }))),
  ], [oferta?.itemizado, aumentosAprobados]);
  const diasAumentos = aumentosAprobados.reduce((total, aumento) => total + aumento.ampliacionPlazoDias, 0);
  const montoAumentos = aumentosAprobados.reduce((total, aumento) => total + aumento.montoTotal, 0);
  const plazoDias = (licitacion.plazoAdjudicadoDias || oferta?.plazoDias || 0) + diasAumentos;
  const fechaTermino = fechaInicio && plazoDias ? sumarDiasCorridos(fechaInicio, plazoDias - 1) : '';
  const pagadoAnterior = useMemo(() => {
    const result: Record<string, number> = {};
    estados.forEach(ep => ep.items.forEach(item => {
      result[item.itemCotizacionId] = Math.max(result[item.itemCotizacionId] || 0, item.avanceAcumuladoPct);
    }));
    return result;
  }, [estados]);

  const erroresAvance: Record<string, string> = {};
  const itemsPago: ItemEstadoPago[] = items.map(item => {
    const anterior = pagadoAnterior[item.id] || 0;
    const ingresado = avances[item.id];
    if (ingresado !== undefined && (ingresado < anterior || ingresado > 100)) {
      erroresAvance[item.id] = `Debe estar entre ${anterior}% y 100%.`;
    }
    const acumulado = ingresado === undefined || erroresAvance[item.id] ? anterior : ingresado;
    const periodo = Math.max(0, acumulado - anterior);
    return {
      itemCotizacionId: item.id,
      item: item.item,
      descripcion: item.descripcion,
      unidad: item.unidad,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      precioTotal: item.precioTotal,
      avanceAnteriorPct: anterior,
      avancePeriodoPct: periodo,
      avanceAcumuladoPct: acumulado,
      montoPeriodo: Math.round(item.precioTotal * periodo / 100),
    };
  });

  const montoNeto = itemsPago.reduce((sum, item) => sum + item.montoPeriodo, 0);
  const montoIva = Math.round(montoNeto * .19);
  const montoTotal = montoNeto + montoIva;
  const totalItemizadoOriginalNeto = (oferta?.itemizado || []).reduce((sum, item) => sum + item.precioTotal, 0);
  const totalItemizadoNeto = items.reduce((sum, item) => sum + item.precioTotal, 0);
  const totalContratoOriginal = oferta?.montoTotal || licitacion.montoAdjudicadoTotal || Math.round(totalItemizadoOriginalNeto * 1.19);
  const totalContrato = totalContratoOriginal + montoAumentos;
  const porcentajeGlobal = totalItemizadoNeto
    ? redondear(itemsPago.reduce((sum, item) => sum + item.precioTotal * item.avanceAcumuladoPct / 100, 0) / totalItemizadoNeto * 100)
    : 0;
  const porcentajeFisicoRegistrado = totalItemizadoNeto
    ? redondear(items.reduce((sum, item) => sum + item.precioTotal * (pagadoAnterior[item.id] || 0) / 100, 0) / totalItemizadoNeto * 100)
    : 0;
  const pagadoAcumulado = estados.reduce((sum, ep) => sum + ep.montoTotal, 0);
  const avanceFinanciero = totalContrato ? Math.min(100, redondear(pagadoAcumulado / totalContrato * 100)) : 0;
  const saldoContrato = Math.max(0, totalContrato - pagadoAcumulado);
  const contratoCompletado = porcentajeFisicoRegistrado >= 100 || avanceFinanciero >= 100 || saldoContrato <= 1;
  const estadoPendienteFirma = estados.find(estado => !estado.firmaResponsable);
  const diasTranscurridos = fechaInicio ? Math.max(0, diferenciaDias(fechaInicio, new Date().toISOString().split('T')[0]) + 1) : 0;
  const avanceProgramado = fechaInicio && plazoDias ? Math.min(100, redondear(diasTranscurridos / plazoDias * 100)) : 0;
  const desviacionFisica = redondear(porcentajeFisicoRegistrado - avanceProgramado);

  let cursorGantt = 0;
  const ganttItems = items.map((item, index) => {
    const proporcion = totalItemizadoNeto ? item.precioTotal / totalItemizadoNeto : 1 / Math.max(items.length, 1);
    const inicioPct = cursorGantt * 100;
    const anchoPct = index === items.length - 1 ? 100 - inicioPct : proporcion * 100;
    const inicioDia = Math.round(cursorGantt * plazoDias);
    cursorGantt += proporcion;
    const terminoDia = index === items.length - 1 ? Math.max(0, plazoDias - 1) : Math.max(inicioDia, Math.round(cursorGantt * plazoDias) - 1);
    return {
      ...item,
      inicioPct,
      anchoPct,
      avancePct: pagadoAnterior[item.id] || 0,
      fechaInicio: fechaInicio ? sumarDiasCorridos(fechaInicio, inicioDia) : '',
      fechaTermino: fechaInicio ? sumarDiasCorridos(fechaInicio, terminoDia) : '',
    };
  });

  const guardarFechas = async () => {
    if (!fechaInicio) return alert('Ingrese la fecha de inicio de la obra.');
    if (!plazoDias) return alert('La adjudicación no tiene un plazo de ejecución válido.');
    setSavingDates(true);
    try {
      await updateLicitacion(licitacion.id, { fechaInicioObra: fechaInicio, fechaTerminoProgramada: fechaTermino });
      alert(`Programa actualizado. Término contractual: ${formatearFecha(fechaTermino)}.`);
    } finally {
      setSavingDates(false);
    }
  };

  const save = async () => {
    if (contratoCompletado) return alert('El contrato vigente ya alcanzó el 100% de avance. Para habilitar nuevos estados debe aprobarse previamente un aumento de obra con nuevas partidas.');
    if (estadoPendienteFirma) return alert(`El Estado de Pago N° ${estadoPendienteFirma.numero} debe ser firmado por el responsable antes de ingresar el siguiente.`);
    if (!oferta || !items.length) return alert('La oferta adjudicada no contiene un itemizado para controlar avances.');
    if (Object.keys(erroresAvance).length) return alert('Corrija los porcentajes: ningún avance puede ser menor al anterior ni superior a 100%.');
    if (!montoNeto) return alert('Ingrese un avance acumulado mayor al registrado en al menos una partida.');
    if (montoTotal > saldoContrato + 1) return alert(`El estado supera el saldo contractual disponible (${formatoMonedaCLP(saldoContrato)}). Ajuste los avances del período.`);
    setSaving(true);
    try {
      let archivo: { id: string; url: string } | undefined;
      if (file) {
        const uploaded = await uploadFileToProjectFolder(file, licitacion.id, licitacion.nombreProyecto);
        if (uploaded.storage !== 'drive') {
          alert('No se pudo respaldar el estado de pago en Drive. Autorice Drive e intente nuevamente.');
          return;
        }
        archivo = uploaded;
      }
      const nuevoEstado: Omit<EstadoPago, 'id' | 'licitacionId'> = {
        numero: estados.length + 1,
        fecha: new Date().toISOString().split('T')[0],
        proveedorId: oferta.proveedorId,
        proveedorNombre: oferta.proveedorNombre,
        cotizacionId: oferta.id,
        items: itemsPago.filter(item => item.avancePeriodoPct > 0),
        montoNeto,
        montoIva,
        montoTotal,
        porcentajeAvanceGlobal: porcentajeGlobal,
        observaciones,
        ...(file && archivo ? { archivoNombre: file.name, archivoURL: archivo.url, archivoDriveId: archivo.id } : {}),
        estado: 'Ingresado',
      };
      const estadoPagoId = await addEstadoPago(licitacion.id, nuevoEstado);
      await updateLicitacion(licitacion.id, { estadoLifecycle: 'En_Ejecucion' });
      setEstadoDocumento({ id: estadoPagoId, licitacionId: licitacion.id, ...nuevoEstado });
      setAvances({});
      setObservaciones('');
      setFile(null);
      alert(`Estado de pago N° ${estados.length + 1} ingresado.`);
    } finally {
      setSaving(false);
    }
  };

  if (!oferta) return <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-900">Adjudique una oferta para habilitar el control de estados de pago.</div>;
  if (!items.length) return <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-900">La cotización adjudicada no tiene partidas. Vuelva a cargarla desde “Ofertas” para leer o ingresar el itemizado.</div>;

  return (
    <div className="space-y-5">
      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <IndicadorProyecto icon={CircleDollarSign} label="Contrato vigente" value={formatoMonedaCLP(totalContrato)} detail={montoAumentos > 0 ? `${formatoMonedaCLP(totalContratoOriginal)} original + ${formatoMonedaCLP(montoAumentos)} en aumentos` : 'Monto original con IVA'} color="emerald" />
        <IndicadorProyecto icon={WalletCards} label="Estados acumulados" value={formatoMonedaCLP(pagadoAcumulado)} detail={`${avanceFinanciero}% de avance financiero cursado`} color="sky" progress={avanceFinanciero} />
        <IndicadorProyecto icon={TrendingUp} label="Avance físico" value={`${porcentajeFisicoRegistrado}%`} detail={`Programado a hoy: ${avanceProgramado}%`} color={desviacionFisica < 0 ? 'amber' : 'emerald'} progress={porcentajeFisicoRegistrado} />
        <IndicadorProyecto icon={Clock3} label="Saldo contractual" value={formatoMonedaCLP(saldoContrato)} detail={desviacionFisica < 0 ? `${Math.abs(desviacionFisica)} pts bajo programa` : `${desviacionFisica} pts sobre programa`} color={desviacionFisica < 0 ? 'amber' : 'slate'} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="font-black flex items-center gap-2"><CalendarDays className="w-5 h-5 text-sky-600" /> Programa contractual y Carta Gantt</h2>
            <p className="text-xs text-slate-500 mt-1">La programación se distribuye por el peso económico y orden del itemizado; el avance azul corresponde al avance físico aprobado.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="font-bold text-slate-600">Inicio de obra<input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="block mt-1 px-3 py-2 border rounded-lg" /></label>
            <div className="px-3 py-2 bg-slate-50 border rounded-lg"><span className="block text-[9px] uppercase text-slate-400">Plazo</span><strong>{plazoDias} días corridos</strong></div>
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg"><span className="block text-[9px] uppercase text-emerald-600">Término calculado</span><strong className="text-emerald-800">{fechaTermino ? formatearFecha(fechaTermino) : 'Pendiente'}</strong></div>
            <button onClick={guardarFechas} disabled={savingDates || !fechaInicio || !plazoDias} className="px-4 py-2.5 bg-sky-700 text-white rounded-lg font-bold disabled:opacity-50">{savingDates ? 'Guardando…' : 'Guardar programa'}</button>
          </div>
        </div>

        {fechaInicio && plazoDias ? (
          <div className="overflow-x-auto">
            <div className="min-w-[760px] space-y-2">
              <div className="grid grid-cols-[260px_1fr] gap-3 text-[10px] font-bold text-slate-500"><span>PARTIDA</span><div className="flex justify-between"><span>{formatearFecha(fechaInicio)}</span><span>{formatearFecha(fechaTermino)}</span></div></div>
              {ganttItems.map(item => (
                <div key={item.id} className="grid grid-cols-[260px_1fr] gap-3 items-center py-1.5 border-t border-slate-100">
                  <div className="min-w-0"><strong className="text-[11px] text-slate-800 block truncate">{item.item}. {item.descripcion}</strong><span className="text-[9px] text-slate-400">{formatearFecha(item.fechaInicio)} – {formatearFecha(item.fechaTermino)} · {item.avancePct}% ejecutado</span></div>
                  <div className="relative h-7 rounded-md bg-slate-100 overflow-hidden">
                    <div className="absolute inset-y-1 rounded bg-slate-300 border border-slate-400 overflow-hidden" style={{ left: `${item.inicioPct}%`, width: `${item.anchoPct}%` }}>
                      <div className="h-full bg-sky-600" style={{ width: `${item.avancePct}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-4 text-[10px] text-slate-500"><span><i className="inline-block w-3 h-2 bg-slate-300 mr-1"></i>Programado</span><span><i className="inline-block w-3 h-2 bg-sky-600 mr-1"></i>Avance físico</span></div>
            </div>
          </div>
        ) : <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">Ingrese la fecha de inicio para calcular el término contractual y generar la Carta Gantt.</div>}
      </section>

      {contratoCompletado && (
        <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-950">
          <div className="flex items-start gap-3"><ShieldCheck className="h-6 w-6 shrink-0 text-emerald-700" /><div><h2 className="font-black">Contrato vigente completado</h2><p className="mt-1 text-xs">El avance físico o financiero alcanzó el 100%. No se pueden ingresar más estados de pago. Si existe mayor obra, regístrela en la ficha del proyecto y obtenga su aprobación; las nuevas partidas y el nuevo saldo habilitarán automáticamente el siguiente estado.</p></div></div>
        </section>
      )}
      {aumentos.some(aumento => aumento.estado === 'Borrador') && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">Existe una modificación contractual en borrador. Sus partidas, monto y plazo no se incorporarán hasta que el administrador la apruebe.</div>
      )}
      {!contratoCompletado && estadoPendienteFirma && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900"><strong>Ingreso temporalmente bloqueado:</strong> el Estado de Pago N° {estadoPendienteFirma.numero} está pendiente de firma del responsable. La secuencia se habilitará cuando quede firmado.</div>
      )}

      <section className={`${contratoCompletado || estadoPendienteFirma ? 'hidden' : ''} bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden`}>
        <div className="p-5 border-b"><h2 className="font-black">Estado de pago N° {estados.length + 1}</h2><p className="text-xs text-slate-500">Ingrese el nuevo avance acumulado. Debe ser igual o superior al aprobado anteriormente y nunca mayor a 100%.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-900 text-white"><tr><th className="p-3 text-left">Item / descripción</th><th className="p-3 text-right">Contrato neto</th><th className="p-3 text-right">Anterior</th><th className="p-3 text-right">Nuevo acumulado</th><th className="p-3 text-right">Avance período</th><th className="p-3 text-right">Monto período</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {itemsPago.map(item => {
                const error = erroresAvance[item.itemCotizacionId];
                return (
                  <tr key={item.itemCotizacionId} className={error ? 'bg-red-50/60' : ''}>
                    <td className="p-3"><strong>{item.item}</strong><span className="block text-slate-500 max-w-md">{item.descripcion}</span></td>
                    <td className="p-3 text-right">{formatoMonedaCLP(item.precioTotal)}</td>
                    <td className="p-3 text-right font-bold text-slate-600">{item.avanceAnteriorPct}%</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex flex-col items-end">
                        <span><input type="number" min={item.avanceAnteriorPct} max={100} step="0.01" value={avances[item.itemCotizacionId] ?? ''} placeholder={String(item.avanceAnteriorPct)} onChange={e => setAvances(actual => ({ ...actual, [item.itemCotizacionId]: e.target.value === '' ? undefined : Number(e.target.value) }))} onBlur={e => { if (e.target.value !== '') setAvances(actual => ({ ...actual, [item.itemCotizacionId]: Math.min(100, Math.max(item.avanceAnteriorPct, Number(e.target.value))) })); }} className={`w-24 px-2 py-1.5 border rounded-lg text-right font-bold outline-none ${error ? 'border-red-500 text-red-700 ring-2 ring-red-100' : 'border-slate-300 focus:ring-2 focus:ring-sky-500'}`} /> %</span>
                        {error && <span className="text-[9px] text-red-600 mt-1">{error}</span>}
                      </div>
                    </td>
                    <td className="p-3 text-right font-bold text-sky-700">+{item.avancePeriodoPct}%</td>
                    <td className="p-3 text-right font-bold text-emerald-700">{formatoMonedaCLP(item.montoPeriodo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-5 bg-slate-50 grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-3"><textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2} placeholder="Observaciones del avance..." className="w-full p-3 border rounded-xl text-xs" /><input type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" /></div>
          <div className="text-right text-xs space-y-1"><p>Neto: <strong>{formatoMonedaCLP(montoNeto)}</strong></p><p>IVA: <strong>{formatoMonedaCLP(montoIva)}</strong></p><p className="text-base text-emerald-700">Total: <strong>{formatoMonedaCLP(montoTotal)}</strong></p><p>Avance físico resultante: <strong>{porcentajeGlobal}%</strong></p><button onClick={save} disabled={saving || Object.keys(erroresAvance).length > 0} className="mt-2 px-4 py-2 bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-50">{saving ? 'Guardando...' : 'Ingresar estado de pago'}</button></div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black">Historial financiero y firmas</h3>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${esResponsableActual ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            {esResponsableActual ? 'Puede firmar como responsable' : `Firma asignada a ${licitacion.responsableEmail || 'correo pendiente'}`}
          </span>
        </div>
        {estados.length === 0 ? <p className="text-xs text-slate-400">Aún no hay estados de pago ingresados.</p> : (
          <div className="grid md:grid-cols-2 gap-3">
            {estados.map(ep => (
              <div key={ep.id} className={`rounded-xl border p-4 ${ep.firmaResponsable ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/30'}`}>
                <div className="flex justify-between gap-3">
                  <strong className="text-sm">Estado N° {ep.numero}</strong>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${ep.firmaResponsable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{ep.firmaResponsable ? 'Firmado' : 'Pendiente de firma'}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{formatearFecha(ep.fecha)} · Avance físico acumulado {ep.porcentajeAvanceGlobal}%</p>
                <p className="text-sm font-black text-emerald-700 mt-2">{formatoMonedaCLP(ep.montoTotal)}</p>
                {ep.firmaResponsable ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-white/80 p-2 text-[10px] text-emerald-900">
                    <p className="flex items-center gap-1 font-bold"><ShieldCheck className="h-3.5 w-3.5" /> {ep.firmaResponsable.nombre}</p>
                    <p>{ep.firmaResponsable.email} · {new Date(ep.firmaResponsable.fecha).toLocaleString('es-CL')}</p>
                    <p className="mt-1 truncate font-mono text-[8px] text-slate-500" title={ep.firmaResponsable.sha256}>SHA-256: {ep.firmaResponsable.sha256}</p>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-amber-800"><LockKeyhole className="h-3.5 w-3.5" /> Requiere firma de {licitacion.responsableNombre || 'responsable asignado'}.</div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button onClick={() => setEstadoDocumento(ep)} className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-sky-700"><FileText className="w-3.5 h-3.5" /> Ver documento</button>
                  {ep.archivoURL && <a href={ep.archivoURL} target="_blank" rel="noreferrer" className="text-xs text-sky-700 underline">Abrir respaldo</a>}
                  {!ep.firmaResponsable && esResponsableActual && <button onClick={() => void firmarEstadoPago(ep)} disabled={firmandoId === ep.id} className="ml-auto flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{firmandoId === ep.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Firmar estado</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {estadoDocumento && (
        <EstadoPagoDocumentModal
          licitacion={licitacion}
          oferta={oferta}
          estadoPago={estadoDocumento}
          estadosPago={estados.some(estado => estado.id === estadoDocumento.id) ? estados : [...estados, estadoDocumento]}
          onClose={() => setEstadoDocumento(null)}
        />
      )}
    </div>
  );
}

function IndicadorProyecto({ icon: Icon, label, value, detail, color, progress }: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  detail: string;
  color: 'emerald' | 'sky' | 'amber' | 'slate';
  progress?: number;
}) {
  const colors = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    sky: 'bg-sky-50 border-sky-200 text-sky-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
  };
  return <div className={`rounded-2xl border p-4 ${colors[color]}`}><Icon className="w-5 h-5 mb-3" /><span className="block text-[10px] uppercase font-bold opacity-70">{label}</span><strong className="block text-lg mt-1">{value}</strong><span className="block text-[10px] mt-1 opacity-75">{detail}</span>{progress !== undefined && <div className="h-1.5 rounded-full bg-white/80 overflow-hidden mt-3"><div className="h-full rounded-full bg-current transition-all" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}></div></div>}</div>;
}

function sumarDiasCorridos(fecha: string, dias: number): string {
  const date = new Date(`${fecha}T12:00:00`);
  date.setDate(date.getDate() + Math.max(0, dias));
  return date.toISOString().split('T')[0];
}

function diferenciaDias(inicio: string, termino: string): number {
  const desde = new Date(`${inicio}T12:00:00`).getTime();
  const hasta = new Date(`${termino}T12:00:00`).getTime();
  return Math.floor((hasta - desde) / 86400000);
}

function formatearFecha(fecha: string): string {
  if (!fecha) return 'Pendiente';
  return new Intl.DateTimeFormat('es-CL').format(new Date(`${fecha}T12:00:00`));
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
