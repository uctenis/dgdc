import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ClipboardCheck, FileCheck2, FileText, FolderOpen, Landmark,
  CalendarDays, CircleDollarSign, Clock3, Loader2, Receipt, Save, TrendingUp,
  Trophy, Upload, WalletCards, ShieldCheck, LockKeyhole,
  AlertTriangle, ShieldAlert, Award, CheckSquare, Minus, TrendingDown, BarChart3,
  Camera, Plus, Trash2, Image as ImageIcon, Users,
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
import { CargaFacturaEstadoPagoModal } from './CargaFacturaEstadoPagoModal';
import { ActaRecepcionModal } from './ActaRecepcionModal';
import { EvaluacionDesempenoModal } from './EvaluacionDesempenoModal';
import { InvitadosManager } from './InvitadosManager';
import { PremiumDatePicker } from './PremiumDatePicker';
import { HITOS_LICITACION, calcularEstadosHitos, obtenerFechasHitos, formatearFechaCorta, ESTADO_HITO_DOT, ESTADO_HITO_TEXT, LIFECYCLE_COLOR, LIFECYCLE_LABEL } from '../utils/hitosLicitacion';
import { parseOrdenDeCompra } from '../utils/ocParser';
import { uploadLicitacionDocument } from '../services/storageService';
import {
  addEstadoPago, subscribeToAumentosObra, subscribeToEstadosPago, updateLicitacion, syncOCToProyectoMaestro
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { isProjectResponsible } from '../services/internalAccessService';
import { firmarEstadoPagoSeguro } from '../services/paymentSignatureService';

type TabId = 'resumen' | 'expediente' | 'invitados' | 'ofertas' | 'evaluacion' | 'actas' | 'oc' | 'pagos';

interface Props {
  licitacion: LicitacionProyecto;
  proveedores: Proveedor[];
  cotizaciones: Cotizacion[];
  configFirmas: ConfiguracionFirmas;
  onBack: () => void;
  onAddCotizacion: (cotizacion: Omit<Cotizacion, 'id' | 'fechaCarga'>) => void | Promise<void>;
  onDeleteCotizacion: (id: string) => void | Promise<void>;
  onAdjudicarLicitacion: (licitacionId: string, proveedorId: string, justificacion: string) => Promise<void>;
}

const tabs: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'resumen', label: 'Resumen', icon: ClipboardCheck },
  { id: 'expediente', label: 'Ficha', icon: FolderOpen },
  { id: 'invitados', label: 'Invitados', icon: Users },
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

      {/* Badge de riesgo del proyecto */}
      {licitacion.nivelRiesgo && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold w-fit ${
          licitacion.nivelRiesgo === 'Crítico' ? 'bg-red-50 border-red-300 text-red-800' :
          licitacion.nivelRiesgo === 'Alto' ? 'bg-orange-50 border-orange-300 text-orange-800' :
          licitacion.nivelRiesgo === 'Medio' ? 'bg-amber-50 border-amber-300 text-amber-800' :
          'bg-emerald-50 border-emerald-300 text-emerald-800'
        }`}>
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Riesgo {licitacion.nivelRiesgo}</span>
          {licitacion.motivoRiesgo && <span className="font-normal opacity-75"> · {licitacion.motivoRiesgo}</span>}
        </div>
      )}

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

      {activeTab === 'resumen' && <ResumenLicitacion licitacion={licitacion} oferta={ofertaAdjudicada} ofertasCount={ofertas.length} onNavigate={setActiveTab} cotizaciones={cotizaciones} />}
      {activeTab === 'expediente' && (
        <FichaProyectoPage
          proyecto={licitacion}
          onBack={onBack}
          hideBack
          proveedorAdjudicado={proveedorAdjudicado}
          cotizacionAdjudicada={ofertaAdjudicada}
          configFirmas={configFirmas}
        />
      )}
      {activeTab === 'invitados' && (
        <InvitadosManager
          licitacion={licitacion}
          proveedores={proveedores}
          configFirmas={configFirmas}
          onClose={() => setActiveTab('resumen')}
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
      {activeTab === 'pagos' && <EstadosPagoTab licitacion={licitacion} oferta={ofertaAdjudicada} configFirmas={configFirmas} />}
    </div>
  );
}

function ResumenLicitacion({ licitacion, oferta, ofertasCount, onNavigate, cotizaciones }: {
  licitacion: LicitacionProyecto;
  oferta?: Cotizacion;
  ofertasCount: number;
  onNavigate: (tab: TabId) => void;
  cotizaciones: Cotizacion[];
}) {
  const empresaAdjudicada = oferta?.proveedorNombre || licitacion.proveedorAdjudicadoNombre;
  const rutAdjudicado = oferta?.proveedorRut || licitacion.proveedorAdjudicadoRut;
  const montoAdjudicado = licitacion.montoAdjudicadoTotal || oferta?.montoTotal || 0;
  const plazoAdjudicado = licitacion.plazoAdjudicadoDias || oferta?.plazoDias || 0;
  const montoEstimado = licitacion.montoEstimado || 0;
  const ahorro = montoEstimado - montoAdjudicado;
  const pctAhorro = montoEstimado > 0 && montoAdjudicado > 0 ? (ahorro / montoEstimado * 100) : 0;

  // ─ Competencia
  const ofertasLic = cotizaciones.filter(c => c.licitacionId === licitacion.id);
  const montos = ofertasLic.map(c => c.montoTotal).sort((a, b) => a - b);
  const minOferta = montos[0] || 0;
  const maxOferta = montos[montos.length - 1] || 0;
  const spreadPct = maxOferta > 0 ? ((maxOferta - minOferta) / maxOferta * 100) : 0;
  const invitados = licitacion.proveedoresInvitadosIds?.length || 0;
  // Proveedores distintos con oferta (no cotizaciones totales): una empresa puede tener
  // más de una cotización cargada (ej. una versión corregida), y eso no debe inflar la
  // tasa de participación. Se acota a 100% además, porque puede llegar una oferta de una
  // empresa no invitada formalmente (dato inconsistente) sin que la tasa deje de ser legible.
  const proveedoresConOferta = new Set(ofertasLic.map(c => c.proveedorId)).size;
  const tasaParticipacion = invitados > 0 ? Math.min(100, (proveedoresConOferta / invitados) * 100) : null;

  // ─ Plazo y avance
  const fechaInicio = licitacion.fechaInicioObra || '';
  const fechaTermino = licitacion.fechaTerminoProgramada || '';
  const hoy = new Date().toISOString().split('T')[0];
  const diasTranscurridos = fechaInicio ? Math.max(0, Math.floor((new Date(hoy).getTime() - new Date(fechaInicio).getTime()) / 86400000) + 1) : 0;
  const avanceProgramadoPct = fechaInicio && plazoAdjudicado > 0 ? Math.min(100, Math.round(diasTranscurridos / plazoAdjudicado * 100)) : 0;

  // ─ Trazabilidad documental
  const hitos = [
    { label: 'Bases y planos', ok: Boolean(licitacion.antecedentesTecnicos?.length), tab: 'expediente' as TabId },
    { label: 'Visita a terreno', ok: Boolean(licitacion.fechaVisitaTerreno), tab: 'expediente' as TabId },
    { label: 'Consultas respondidas', ok: Boolean(licitacion.fechaRespuestaConsultas), tab: 'expediente' as TabId },
    { label: 'Empresas invitadas', ok: Boolean(licitacion.proveedoresInvitadosIds?.length), tab: 'invitados' as TabId },
    { label: 'Ofertas recibidas', ok: ofertasCount > 0, tab: 'ofertas' as TabId },
    { label: 'Empresa adjudicada', ok: Boolean(empresaAdjudicada), tab: 'evaluacion' as TabId },
    { label: 'Acta de evaluación', ok: Boolean(licitacion.actaFirmaDigital), tab: 'actas' as TabId },
    { label: 'OT emitida', ok: Boolean(licitacion.codigoOT || licitacion.ordenTrabajoNumero), tab: 'oc' as TabId },
    { label: 'OP emitida', ok: Boolean(licitacion.codigoOP || licitacion.ordenPedidoNumero), tab: 'oc' as TabId },
    { label: 'Orden de compra', ok: Boolean(licitacion.ordenCompraNumero), tab: 'oc' as TabId },
    { label: 'Inicio de obra', ok: Boolean(fechaInicio), tab: 'pagos' as TabId },
    { label: 'Estado de pagos', ok: Boolean(licitacion.estadoLifecycle === 'En_Ejecucion' || licitacion.estadoLifecycle === 'Finalizado'), tab: 'pagos' as TabId },
  ];
  const hitosOk = hitos.filter(h => h.ok).length;

  const fechasHitos = obtenerFechasHitos(licitacion);
  const estadosHitos = calcularEstadosHitos(fechasHitos);

  return (
    <div className="space-y-5">

      {/* ─── CALENDARIO DE HITOS + ETAPA DEL CICLO DE VIDA ───────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-sky-600" />
            Calendario de la Licitación
          </h3>
          {licitacion.estadoLifecycle && (
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${LIFECYCLE_COLOR[licitacion.estadoLifecycle] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
              {LIFECYCLE_LABEL[licitacion.estadoLifecycle] || licitacion.estadoLifecycle}
            </span>
          )}
        </div>
        <div className="flex items-start">
          {HITOS_LICITACION.map((h, i) => (
            <div key={h.campo} className="flex items-start flex-1 min-w-0">
              <div className="flex-1 min-w-0 text-center px-1">
                <span className={`block w-2.5 h-2.5 rounded-full mx-auto ${ESTADO_HITO_DOT[estadosHitos[i]]}`} />
                <span className="block text-[9px] font-bold uppercase text-slate-400 mt-1.5 truncate">{h.label}</span>
                <span className={`block text-xs font-bold mt-0.5 ${ESTADO_HITO_TEXT[estadosHitos[i]]}`}>{formatearFechaCorta(fechasHitos[i])}</span>
              </div>
              {i < HITOS_LICITACION.length - 1 && (
                <div className={`h-0.5 flex-1 mt-[5px] ${estadosHitos[i] === 'cumplido' ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── PANEL FINANCIERO ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Monto Estimado</span>
          <p className="text-lg font-black text-slate-700">{formatoMonedaCLP(montoEstimado)}</p>
          <span className="text-[10px] text-slate-400">Presupuesto inicial</span>
        </div>
        <div className={`rounded-2xl border p-4 shadow-sm ${ montoAdjudicado > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200' }`}>
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">{montoAdjudicado > 0 ? 'Monto Adjudicado' : 'Por Adjudicar'}</span>
          <p className={`text-lg font-black ${ montoAdjudicado > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
            {montoAdjudicado > 0 ? formatoMonedaCLP(montoAdjudicado) : '—'}
          </p>
          {montoAdjudicado > 0 && empresaAdjudicada && (
            <span className="text-[10px] text-emerald-600 truncate block">
              {empresaAdjudicada}{rutAdjudicado ? ` (RUT ${rutAdjudicado})` : ''}
            </span>
          )}
        </div>
        <div className={`rounded-2xl border p-4 shadow-sm ${ ahorro > 0 ? 'bg-sky-50 border-sky-200' : ahorro < 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200' }`}>
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Ahorro / Sobrevalor</span>
          <div className="flex items-center gap-1.5">
            {ahorro > 0 ? <TrendingDown className="w-4 h-4 text-sky-600" /> : ahorro < 0 ? <TrendingUp className="w-4 h-4 text-red-600" /> : <Minus className="w-4 h-4 text-slate-400" />}
            <p className={`text-lg font-black ${ ahorro > 0 ? 'text-sky-700' : ahorro < 0 ? 'text-red-700' : 'text-slate-400'}`}>
              {montoAdjudicado > 0 ? `${ahorro > 0 ? '' : ''}${formatoMonedaCLP(Math.abs(ahorro))}` : '—'}
            </p>
          </div>
          {montoAdjudicado > 0 && <span className="text-[10px] text-slate-500">{pctAhorro >= 0 ? '+' : ''}{pctAhorro.toFixed(1)}% vs estimado</span>}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Responsable Obra</span>
          <p className="text-sm font-bold text-slate-700 truncate">{licitacion.responsableNombre || <span className="text-slate-400 italic font-normal">Sin asignar</span>}</p>
          {licitacion.responsableEmail && <span className="text-[10px] text-slate-400 truncate block">{licitacion.responsableEmail}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ─── TRAZABILIDAD DOCUMENTAL ────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-slate-900 text-sm">Trazabilidad del Proceso</h3>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
              hitosOk === hitos.length ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
              hitosOk > hitos.length / 2 ? 'bg-sky-100 text-sky-800 border-sky-200' :
              'bg-slate-100 text-slate-600 border-slate-200'
            }`}>{hitosOk}/{hitos.length} completados</span>
          </div>
          {/* Barra de progreso general */}
          <div className="h-2 bg-slate-100 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-emerald-500 rounded-full transition-all"
              style={{ width: `${hitos.length > 0 ? (hitosOk / hitos.length * 100) : 0}%` }}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {hitos.map(hito => (
              <button
                key={hito.label}
                onClick={() => onNavigate(hito.tab)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition text-xs ${
                  hito.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:border-emerald-400'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-700'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  hito.ok ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                }`}>
                  {hito.ok ? <CheckSquare className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                </span>
                <span className="font-semibold">{hito.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── PANEL LATERAL: COMPETENCIA + PLAZO ───────────────────────── */}
        <div className="space-y-4">

          {/* Competencia */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-black text-slate-900 text-sm mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              Análisis de Competencia
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Empresas invitadas</span>
                <span className="font-bold text-slate-800">{invitados || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ofertas recibidas</span>
                <span className="font-bold text-slate-800">{ofertasLic.length}</span>
              </div>
              {tasaParticipacion !== null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Tasa participación</span>
                  <span className={`font-bold ${ tasaParticipacion >= 70 ? 'text-emerald-700' : tasaParticipacion >= 40 ? 'text-amber-700' : 'text-red-700'}`}>
                    {tasaParticipacion.toFixed(0)}%
                  </span>
                </div>
              )}
              {montos.length > 1 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Oferta más baja</span>
                    <span className="font-bold text-emerald-700">{formatoMonedaCLP(minOferta)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Oferta más alta</span>
                    <span className="font-bold text-slate-700">{formatoMonedaCLP(maxOferta)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Spread de precios</span>
                    <span className="font-bold text-sky-700">{spreadPct.toFixed(1)}%</span>
                  </div>
                </>
              )}
              {ofertasLic.length === 0 && <p className="text-slate-400 italic">Sin ofertas ingresadas.</p>}
            </div>
          </div>

          {/* Plazo */}
          {plazoAdjudicado > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-black text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-violet-500" />
                Estado de Plazo
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Plazo contrato</span>
                  <span className="font-bold text-slate-700">{plazoAdjudicado} días</span>
                </div>
                {fechaInicio && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Inicio</span>
                      <span className="font-bold text-slate-700">{fechaInicio}</span>
                    </div>
                    {fechaTermino && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Término programado</span>
                        <span className="font-bold text-slate-700">{fechaTermino}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Días transcurridos</span>
                      <span className="font-bold text-slate-700">{diasTranscurridos}</span>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-500">Avance programado</span>
                        <span className={`font-black ${
                          avanceProgramadoPct >= 100 ? 'text-slate-500' : 'text-violet-700'
                        }`}>{avanceProgramadoPct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-400 rounded-full transition-all"
                          style={{ width: `${avanceProgramadoPct}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}
                {!fechaInicio && <p className="text-slate-400 italic text-[11px]">Definir fecha de inicio en la pestaña Pagos.</p>}
              </div>
            </div>
          )}

          {/* Info OC */}
          {licitacion.ordenCompraNumero && (
            <div className="bg-violet-50 rounded-2xl border border-violet-200 p-4">
              <span className="text-[10px] font-bold text-violet-600 uppercase">Orden de Compra</span>
              <p className="font-extrabold text-violet-900 text-sm mt-0.5">{licitacion.ordenCompraNumero}</p>
              {licitacion.codigoOT && <p className="text-[11px] text-violet-700 mt-0.5">OT: {licitacion.codigoOT}</p>}
              {licitacion.codigoOP && <p className="text-[11px] text-violet-700">OP: {licitacion.codigoOP}</p>}
            </div>
          )}
        </div>
      </div>
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
        const url = await uploadLicitacionDocument(licitacion.id, 'ordenes-compra', file);
        archivoActualizado = { archivoOCNombre: file.name, archivoOCURL: url };
      }
      const datosOC = {
        ordenCompraNumero: numero.trim(),
        codigoOC: numero.trim(),
        numeroContrato: numeroContrato.trim(),
        codigoOT: numeroOT.trim(),
        ordenTrabajoNumero: numeroOT.trim(),
        codigoOP: numeroOP.trim(),
        ordenPedidoNumero: numeroOP.trim(),
        ...archivoActualizado,
        fechaCargaOC: new Date().toISOString().split('T')[0],
        estadoLifecycle: 'OC_Emitida' as LicitacionProyecto['estadoLifecycle'],
      };

      await updateLicitacion(licitacion.id, datosOC);
      await syncOCToProyectoMaestro(licitacion, datosOC);
      alert('Orden de compra guardada y asociada exitosamente a la Ficha y Cartera de Proyectos.');
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
    fotos: (estado.fotos || []).map(f => f.url),
    observacionesDetalle: (estado.observacionesDetalle || []).map(o => ({ texto: o.texto, fotoURL: o.fotoURL })),
    tipoObra: estado.tipoObra || '',
    superficieM2: estado.superficieM2 || 0,
    usoEspacio: estado.usoEspacio || '',
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contenidoFirmado));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function EstadosPagoTab({ licitacion, oferta, configFirmas }: { licitacion: LicitacionProyecto; oferta?: Cotizacion; configFirmas: ConfiguracionFirmas }) {
  const { user } = useAuth();
  const [estados, setEstados] = useState<EstadoPago[]>([]);
  const [aumentos, setAumentos] = useState<AumentoObra[]>([]);
  const [avances, setAvances] = useState<Record<string, number | undefined>>({});
  const [observaciones, setObservaciones] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [observacionesDetalle, setObservacionesDetalle] = useState<{ texto: string; foto: File | null }[]>([]);
  const [tipoObraForm, setTipoObraForm] = useState(licitacion.tipoObra || '');
  const [superficieForm, setSuperficieForm] = useState(licitacion.superficieM2 ? String(licitacion.superficieM2) : '');
  const [usoEspacioForm, setUsoEspacioForm] = useState(licitacion.uso || '');
  const [saving, setSaving] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [fechaInicio, setFechaInicio] = useState(licitacion.fechaInicioObra || '');
  const [estadoDocumento, setEstadoDocumento] = useState<EstadoPago | null>(null);
  const [facturaModalEP, setFacturaModalEP] = useState<EstadoPago | null>(null);
  const [firmandoId, setFirmandoId] = useState<string | null>(null);
  const [obsRecepcion, setObsRecepcion] = useState('');
  const [procesandoRecepcion, setProcesandoRecepcion] = useState(false);
  const [actaRecepcionAbierta, setActaRecepcionAbierta] = useState(false);
  const [evaluacionAbierta, setEvaluacionAbierta] = useState(false);

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

  const aprobarRecepcion = async () => {
    if (!user || !esResponsableActual) {
      return alert(`Solo ${licitacion.responsableNombre || 'el responsable del proyecto'} (${licitacion.responsableEmail || 'correo no configurado'}) puede aprobar la Recepción Conforme.`);
    }
    if (!confirm('¿Confirma la Recepción Conforme de la obra? La licitación quedará marcada como Finalizada.')) return;
    setProcesandoRecepcion(true);
    try {
      await updateLicitacion(licitacion.id, {
        recepcionConforme: {
          ...licitacion.recepcionConforme,
          solicitada: true,
          aprobada: true,
          fechaAprobacion: new Date().toISOString().split('T')[0],
          aprobadoPor: user.email || '',
          objetada: false,
          ...(obsRecepcion.trim() ? { observaciones: obsRecepcion.trim() } : {}),
        },
        estadoLifecycle: 'Finalizado',
        estado: 'Cerrado',
      });
      setObsRecepcion('');
      alert('Recepción Conforme aprobada. La licitación quedó marcada como Finalizada y Cerrada.');
    } finally {
      setProcesandoRecepcion(false);
    }
  };

  const objetarRecepcion = async () => {
    if (!user || !esResponsableActual) {
      return alert(`Solo ${licitacion.responsableNombre || 'el responsable del proyecto'} (${licitacion.responsableEmail || 'correo no configurado'}) puede objetar la Recepción Conforme.`);
    }
    if (!obsRecepcion.trim()) return alert('Indique el motivo de la objeción para que el proveedor pueda corregir.');
    if (!confirm('¿Confirma objetar esta solicitud? El proveedor deberá corregir y volver a solicitar la Recepción Conforme.')) return;
    setProcesandoRecepcion(true);
    try {
      await updateLicitacion(licitacion.id, {
        recepcionConforme: {
          ...licitacion.recepcionConforme,
          solicitada: false,
          aprobada: false,
          objetada: true,
          fechaObjecion: new Date().toISOString().split('T')[0],
          observaciones: obsRecepcion.trim(),
          aprobadoPor: user.email || '',
        },
      });
      setObsRecepcion('');
      alert('Objeción registrada. El proveedor verá el motivo y podrá volver a solicitar la recepción.');
    } finally {
      setProcesandoRecepcion(false);
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
    if (!fotos.length) return alert('Debe adjuntar al menos una fotografía del avance o de la obra terminada.');
    if (!tipoObraForm.trim()) return alert('Indique el tipo de obra (ej: Remodelación, Alhajamiento).');
    if (!superficieForm || Number(superficieForm) <= 0) return alert('Indique la superficie (m²) intervenida.');
    if (!usoEspacioForm.trim()) return alert('Indique el uso del espacio.');
    const observacionesIncompletas = observacionesDetalle.some(o => Boolean(o.texto.trim()) !== Boolean(o.foto));
    if (observacionesIncompletas) return alert('Cada observación debe tener texto y su fotografía de respaldo. Complete o elimine las observaciones incompletas.');
    setSaving(true);
    try {
      let archivoUrl: string | undefined;
      if (file) {
        archivoUrl = await uploadLicitacionDocument(licitacion.id, 'estados-pago', file);
      }
      const fotosUrls = await Promise.all(fotos.map(f => uploadLicitacionDocument(licitacion.id, 'estados-pago', f)));
      const fotosData = fotos.map((f, i) => ({ url: fotosUrls[i], nombre: f.name }));
      const observacionesConFoto = await Promise.all(
        observacionesDetalle
          .filter(o => o.texto.trim() && o.foto)
          .map(async o => ({
            texto: o.texto.trim(),
            fotoURL: await uploadLicitacionDocument(licitacion.id, 'estados-pago', o.foto as File),
            fotoNombre: (o.foto as File).name,
          }))
      );
      const nuevoEstado: Omit<EstadoPago, 'id' | 'licitacionId' | 'numero'> = {
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
        ...(file && archivoUrl ? { archivoNombre: file.name, archivoURL: archivoUrl } : {}),
        fotos: fotosData,
        ...(observacionesConFoto.length ? { observacionesDetalle: observacionesConFoto } : {}),
        tipoObra: tipoObraForm.trim(),
        superficieM2: Number(superficieForm),
        usoEspacio: usoEspacioForm.trim(),
        estado: 'Ingresado',
      };
      const { id: estadoPagoId, numero } = await addEstadoPago(licitacion.id, nuevoEstado);
      await updateLicitacion(licitacion.id, { estadoLifecycle: 'En_Ejecucion' });
      setEstadoDocumento({ id: estadoPagoId, licitacionId: licitacion.id, numero, ...nuevoEstado });
      setAvances({});
      setObservaciones('');
      setFile(null);
      setFotos([]);
      setObservacionesDetalle([]);
      alert(`Estado de pago N° ${numero} ingresado.`);
    } finally {
      setSaving(false);
    }
  };

  const agregarObservacion = () => {
    if (observacionesDetalle.length >= 5) return;
    setObservacionesDetalle(actual => [...actual, { texto: '', foto: null }]);
  };
  const actualizarObservacionTexto = (index: number, texto: string) => {
    setObservacionesDetalle(actual => actual.map((o, i) => i === index ? { ...o, texto } : o));
  };
  const actualizarObservacionFoto = (index: number, foto: File | null) => {
    setObservacionesDetalle(actual => actual.map((o, i) => i === index ? { ...o, foto } : o));
  };
  const eliminarObservacion = (index: number) => {
    setObservacionesDetalle(actual => actual.filter((_, i) => i !== index));
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

      {/* Panel de alerta de desvío + costo/m² */}
      <div className="flex flex-wrap gap-3">
        {/* Alerta de desvío significativo */}
        {fechaInicio && plazoDias > 0 && Math.abs(desviacionFisica) > 10 && (
          <div className={`flex-1 flex items-start gap-3 rounded-2xl border p-4 ${
            desviacionFisica < 0
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}>
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${desviacionFisica < 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
            <div>
              <p className="font-bold text-sm">
                {desviacionFisica < 0
                  ? `Desvío de atraso: ${Math.abs(desviacionFisica)} puntos bajo lo programado`
                  : `Adelanto: ${desviacionFisica} puntos sobre lo programado`}
              </p>
              <p className="text-xs mt-0.5 opacity-80">
                Avance físico: {porcentajeFisicoRegistrado}% · Avance programado: {avanceProgramado}% · Días transcurridos: {diasTranscurridos}/{plazoDias}
              </p>
            </div>
          </div>
        )}

        {/* Costo/m² efectivo */}
        {licitacion.superficieM2 && licitacion.superficieM2 > 0 && pagadoAcumulado > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-[220px]">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Costo efectivo/m²</span>
              <p className="font-black text-indigo-700 text-lg">
                {formatoMonedaCLP(Math.round(pagadoAcumulado / licitacion.superficieM2))}/m²
              </p>
              <span className="text-[10px] text-slate-400">{licitacion.superficieM2} m² · {formatoMonedaCLP(pagadoAcumulado)} pagados</span>
            </div>
          </div>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="font-black flex items-center gap-2"><CalendarDays className="w-5 h-5 text-sky-600" /> Programa contractual y Carta Gantt</h2>
            <p className="text-xs text-slate-500 mt-1">La programación se distribuye por el peso económico y orden del itemizado; el avance azul corresponde al avance físico aprobado.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="font-bold text-slate-600">Inicio de obra<PremiumDatePicker value={fechaInicio} onChange={setFechaInicio} className="flex items-center gap-2 mt-1 px-3 py-2 border rounded-lg text-left" /></label>
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

      {contratoCompletado && (
        <section className="rounded-2xl border border-sky-300 bg-sky-50 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="h-6 w-6 shrink-0 text-sky-700" />
            <div>
              <h2 className="font-black text-sky-950">Recepción Conforme de Obra</h2>
              <p className="mt-1 text-xs text-sky-900">Cierre formal del proceso: al aprobarla, la licitación pasa automáticamente a estado <strong>Finalizado</strong>.</p>
            </div>
          </div>

          {licitacion.recepcionConforme?.aprobada ? (
            <div className="space-y-3">
              <div className="bg-emerald-100 border border-emerald-300 rounded-xl p-4 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Recepción Conforme aprobada el {formatearFecha(licitacion.recepcionConforme.fechaAprobacion || '')} por {licitacion.recepcionConforme.aprobadoPor || 'el responsable'}.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActaRecepcionAbierta(true)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs flex items-center gap-2"
                >
                  <FileCheck2 className="w-4 h-4" />
                  {licitacion.actaRecepcionAdobe ? 'Ver Acta de Recepción y estado de firma' : 'Generar Acta de Recepción y enviar a firma digital'}
                </button>
                {licitacion.proveedorAdjudicadoId && (
                  <button
                    onClick={() => setEvaluacionAbierta(true)}
                    className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-bold text-xs flex items-center gap-2"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    Evaluar Desempeño del Proveedor
                  </button>
                )}
              </div>
            </div>
          ) : licitacion.recepcionConforme?.solicitada ? (
            <div className="space-y-3">
              <div className="bg-amber-100 border border-amber-300 rounded-xl p-4 text-amber-900 text-xs">
                Solicitada por {licitacion.proveedorAdjudicadoNombre || 'el proveedor'} el {formatearFecha(licitacion.recepcionConforme.fechaSolicitud || '')}. Pendiente de revisión.
              </div>
              <textarea
                value={obsRecepcion}
                onChange={e => setObsRecepcion(e.target.value)}
                placeholder="Observaciones (obligatorias si objeta; opcionales si aprueba)..."
                rows={2}
                className="w-full px-3 py-2 border border-sky-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-500"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={aprobarRecepcion}
                  disabled={procesandoRecepcion || !esResponsableActual}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs disabled:opacity-50"
                >
                  {procesandoRecepcion ? 'Procesando…' : 'Aprobar Recepción Conforme'}
                </button>
                <button
                  onClick={objetarRecepcion}
                  disabled={procesandoRecepcion || !esResponsableActual}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs disabled:opacity-50"
                >
                  Objetar y devolver al proveedor
                </button>
              </div>
              {!esResponsableActual && (
                <p className="text-[10px] text-sky-700">Solo {licitacion.responsableNombre || 'el responsable del proyecto'} puede aprobar u objetar esta solicitud.</p>
              )}
            </div>
          ) : (
            <div className="bg-white border border-sky-200 rounded-xl p-4 text-xs text-sky-800">
              {licitacion.recepcionConforme?.objetada && (
                <p className="mb-2 text-rose-700 font-semibold">
                  Última solicitud objetada el {formatearFecha(licitacion.recepcionConforme.fechaObjecion || '')}: “{licitacion.recepcionConforme.observaciones}”
                </p>
              )}
              Aún no hay una solicitud de Recepción Conforme del proveedor.
            </div>
          )}
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
        <div className="p-5 border-t bg-white space-y-4">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" /> Datos de la obra</h3>
            <div className="mt-2 grid sm:grid-cols-3 gap-3">
              <label className="text-[11px] font-bold text-slate-600">Tipo de obra
                <input type="text" value={tipoObraForm} onChange={e => setTipoObraForm(e.target.value)} placeholder="Ej: Remodelación, Alhajamiento" className="mt-1 w-full px-3 py-2 border rounded-lg text-xs" />
              </label>
              <label className="text-[11px] font-bold text-slate-600">Superficie intervenida (m²)
                <input type="number" min={0} step="0.01" value={superficieForm} onChange={e => setSuperficieForm(e.target.value)} placeholder="Ej: 120" className="mt-1 w-full px-3 py-2 border rounded-lg text-xs" />
              </label>
              <label className="text-[11px] font-bold text-slate-600">Uso del espacio
                <input type="text" value={usoEspacioForm} onChange={e => setUsoEspacioForm(e.target.value)} placeholder="Ej: Sala de clases, Laboratorio" className="mt-1 w-full px-3 py-2 border rounded-lg text-xs" />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Fotografías del avance / obra terminada <span className="text-red-600">*</span></h3>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={e => setFotos(actual => [...actual, ...Array.from(e.target.files || [])])}
              className="mt-2 text-xs"
            />
            {fotos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px]">
                    <ImageIcon className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button type="button" onClick={() => setFotos(actual => actual.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-500">Observaciones con evidencia fotográfica ({observacionesDetalle.length}/5)</h3>
              <button type="button" onClick={agregarObservacion} disabled={observacionesDetalle.length >= 5} className="flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:text-sky-900 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Agregar observación</button>
            </div>
            {observacionesDetalle.length === 0 && <p className="mt-1 text-[11px] text-slate-400">Sin observaciones puntuales registradas.</p>}
            <div className="mt-2 space-y-2">
              {observacionesDetalle.map((obs, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <textarea
                    value={obs.texto}
                    onChange={e => actualizarObservacionTexto(i, e.target.value)}
                    rows={2}
                    placeholder={`Observación ${i + 1}...`}
                    className="flex-1 px-3 py-2 border rounded-lg text-xs"
                  />
                  <div className="flex sm:flex-col items-start gap-1.5 shrink-0">
                    <input type="file" accept="image/*" onChange={e => actualizarObservacionFoto(i, e.target.files?.[0] || null)} className="text-[10px] w-40" />
                    <button type="button" onClick={() => eliminarObservacion(i)} className="flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-800"><Trash2 className="w-3 h-3" /> Quitar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 bg-slate-50 grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-3"><textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2} placeholder="Observaciones generales del avance (opcional)..." className="w-full p-3 border rounded-xl text-xs" /><input type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" /></div>
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
                {(ep.fotos?.length || ep.observacionesDetalle?.length) ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                    <Camera className="h-3 w-3" /> {ep.fotos?.length || 0} foto{(ep.fotos?.length || 0) === 1 ? '' : 's'}
                    {ep.observacionesDetalle?.length ? ` · ${ep.observacionesDetalle.length} observación${ep.observacionesDetalle.length === 1 ? '' : 'es'} con evidencia` : ''}
                  </p>
                ) : null}
                {ep.firmaResponsable ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-white/80 p-2 text-[10px] text-emerald-900">
                    <p className="flex items-center gap-1 font-bold"><ShieldCheck className="h-3.5 w-3.5" /> {ep.firmaResponsable.nombre}</p>
                    <p>{ep.firmaResponsable.email} · {new Date(ep.firmaResponsable.fecha).toLocaleString('es-CL')}</p>
                    <p className="mt-1 truncate font-mono text-[8px] text-slate-500" title={ep.firmaResponsable.sha256}>SHA-256: {ep.firmaResponsable.sha256}</p>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-amber-800"><LockKeyhole className="h-3.5 w-3.5" /> Requiere firma de {licitacion.responsableNombre || 'responsable asignado'}.</div>
                )}
                {/* Estado de Facturación y Glosa */}
                {ep.factura ? (
                  <div className="mt-3 bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 text-xs flex items-center justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-extrabold text-emerald-950 flex items-center gap-1">
                        <Receipt className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        Factura N° {ep.factura.numeroFactura} ({formatoMonedaCLP(ep.factura.montoFactura)})
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate max-w-xs font-mono" title={ep.factura.glosaOficial}>
                        "{ep.factura.glosaOficial}"
                      </span>
                    </div>
                    <button
                      onClick={() => setFacturaModalEP(ep)}
                      className="text-[10px] font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg transition shrink-0 shadow-sm"
                    >
                      Ver Factura
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 italic">Factura no cargada aún</span>
                    <button
                      onClick={() => setFacturaModalEP(ep)}
                      className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 px-3 py-1 rounded-lg shadow-sm transition"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      + Cargar Factura
                    </button>
                  </div>
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
          onCargarFactura={ep => setFacturaModalEP(ep)}
        />
      )}

      {facturaModalEP && (
        <CargaFacturaEstadoPagoModal
          licitacion={licitacion}
          estadoPago={facturaModalEP}
          estadosPago={estados}
          onClose={() => setFacturaModalEP(null)}
        />
      )}

      {actaRecepcionAbierta && (
        <ActaRecepcionModal
          licitacion={licitacion}
          configFirmas={configFirmas}
          onClose={() => setActaRecepcionAbierta(false)}
        />
      )}

      {evaluacionAbierta && licitacion.proveedorAdjudicadoId && (
        <EvaluacionDesempenoModal
          proveedorId={licitacion.proveedorAdjudicadoId}
          proveedorNombre={licitacion.proveedorAdjudicadoNombre || 'Proveedor'}
          licitacion={licitacion}
          onClose={() => setEvaluacionAbierta(false)}
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
