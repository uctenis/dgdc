import React, { useState, useMemo } from 'react';
import type { LicitacionProyecto, Proveedor, ProyectoMaestro, Cotizacion, ConfiguracionFirmas } from '../types';
import {
  FolderKanban, Plus, Calendar, ArrowRight, Edit3, Trash2,
  CheckCircle, Users, BookOpen, X, FileText, Sparkles, MapPin,
  Search, TrendingUp, TrendingDown, AlertTriangle,
  ChevronUp, ChevronDown, Activity, ShieldAlert,
} from 'lucide-react';
import { formatoMonedaCLP, ordenarCotizacionesPorResultado } from '../services/evaluationEngine';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';
import { corregirOrtografiaEspanol, normalizarNombreProyecto, ATRIBUTOS_ORTOGRAFIA_ES } from '../utils/spellCorrector';
import { InvitadosManager } from './InvitadosManager';
import { AntecedentesManager } from './AntecedentesManager';
import { ActaEvaluacionModal } from './ActaEvaluacionModal';
import { IngresoOfertasLicitacionModal } from './IngresoOfertasLicitacionModal';
import { CargaOrdenCompraModal } from './CargaOrdenCompraModal';
import { ProyectosMaestros } from './ProyectosMaestros';
import { PremiumDatePicker } from './PremiumDatePicker';
import { getCentrosCostoList } from '../data/centrosCostoData';

// ─── COLORES DE RIESGO ───────────────────────────────────────────────────────
const RIESGO_COLOR: Record<string, string> = {
  Bajo: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Medio: 'bg-amber-100 text-amber-800 border-amber-200',
  Alto: 'bg-orange-100 text-orange-800 border-orange-200',
  Crítico: 'bg-red-100 text-red-800 border-red-200',
};

// ─── COLORES LIFECYCLE ───────────────────────────────────────────────────────
const LIFECYCLE_LABEL: Record<string, string> = {
  Bases: 'Bases', Invitando: 'Invitando', Evaluando: 'Evaluando',
  Adjudicado: 'Adjudicado', OT_Emitida: 'OT Emitida', OP_Emitida: 'OP Emitida',
  OC_Emitida: 'OC Emitida', En_Ejecucion: 'En Ejecución',
  Recepcion_Solicitada: 'Recepción', Finalizado: 'Finalizado',
};

interface ProjectManagerProps {
  licitaciones: LicitacionProyecto[];
  proveedores: Proveedor[];
  cotizaciones: Cotizacion[];
  configFirmas: ConfiguracionFirmas;
  licitacionSeleccionadaId: string | null;
  onSelectLicitacion: (id: string) => void;
  onOpenFicha?: (p: LicitacionProyecto) => void;
  onAddLicitacion: (lic: Omit<LicitacionProyecto, 'id'>) => void | Promise<void>;
  onUpdateLicitacion: (id: string, lic: Partial<LicitacionProyecto>) => void | Promise<void>;
  onDeleteLicitacion: (id: string) => void;
  onAdjudicarLicitacion: (licitacionId: string, proveedorId: string, justificacion: string) => Promise<void>;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({
  licitaciones,
  proveedores,
  cotizaciones,
  configFirmas,
  licitacionSeleccionadaId,
  onSelectLicitacion,
  onOpenFicha,
  onAddLicitacion,
  onUpdateLicitacion,
  onDeleteLicitacion,
  onAdjudicarLicitacion,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invitadosLicitacion, setInvitadosLicitacion] = useState<LicitacionProyecto | null>(null);
  const [antecedentesLicitacion, setAntecedentesLicitacion] = useState<LicitacionProyecto | null>(null);
  const [actaLicitacion, setActaLicitacion] = useState<LicitacionProyecto | null>(null);
  const [ofertasLicitacion, setOfertasLicitacion] = useState<LicitacionProyecto | null>(null);
  const [ocLicitacion, setOcLicitacion] = useState<LicitacionProyecto | null>(null);
  const [showMasterSelector, setShowMasterSelector] = useState(false);

  // ─── FILTROS Y VISTA ──────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCampus, setFiltroCampus] = useState('');
  const [sortCol, setSortCol] = useState<'nombre' | 'monto' | 'estado' | 'fecha'>('fecha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  // ─── KPIs GLOBALES ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const adjudicadas = licitaciones.filter(l => l.estado === 'Adjudicado' || Boolean(l.proveedorAdjudicadoId));
    const enEjecucion = licitaciones.filter(l => l.estadoLifecycle === 'En_Ejecucion');
    const finalizadas = licitaciones.filter(l => l.estadoLifecycle === 'Finalizado');
    const conRiesgoAlto = licitaciones.filter(l => l.nivelRiesgo === 'Alto' || l.nivelRiesgo === 'Crítico');

    const montoTotalEstimado = licitaciones.reduce((s, l) => s + (l.montoEstimado || 0), 0);
    const montoTotalAdjudicado = adjudicadas.reduce((s, l) => s + (l.montoAdjudicadoTotal || 0), 0);
    const ahorroTotal = adjudicadas.reduce((s, l) => {
      const adj = l.montoAdjudicadoTotal || 0;
      const est = l.montoEstimado || 0;
      return s + (est - adj);
    }, 0);

    const ofertasPorLic = licitaciones.map(l => cotizaciones.filter(c => c.licitacionId === l.id).length);
    const promedioOferentes = ofertasPorLic.length ? (ofertasPorLic.reduce((a, b) => a + b, 0) / ofertasPorLic.length) : 0;

    const lifecycleCount: Record<string, number> = {};
    licitaciones.forEach(l => {
      const k = l.estadoLifecycle || l.estado || 'Sin estado';
      lifecycleCount[k] = (lifecycleCount[k] || 0) + 1;
    });

    return {
      total: licitaciones.length,
      adjudicadas: adjudicadas.length,
      enEjecucion: enEjecucion.length,
      finalizadas: finalizadas.length,
      conRiesgoAlto: conRiesgoAlto.length,
      montoTotalEstimado,
      montoTotalAdjudicado,
      ahorroTotal,
      pctAhorro: montoTotalEstimado > 0 ? (ahorroTotal / montoTotalEstimado * 100) : 0,
      promedioOferentes,
      lifecycleCount,
    };
  }, [licitaciones, cotizaciones]);

  // ─── LISTA FILTRADA Y ORDENADA ────────────────────────────────────────────
  const licitacionesFiltradas = useMemo(() => {
    const q = search.toLowerCase();
    return licitaciones
      .filter(l => {
        if (q && !(
          l.nombreProyecto.toLowerCase().includes(q) ||
          l.codigoCP?.toLowerCase().includes(q) ||
          l.codigoProyecto?.toLowerCase().includes(q) ||
          (l.proveedorAdjudicadoNombre || '').toLowerCase().includes(q)
        )) return false;
        if (filtroEstado && l.estado !== filtroEstado) return false;
        if (filtroCampus && l.campusSigla !== filtroCampus) return false;
        return true;
      })
      .sort((a, b) => {
        let va: number | string = 0;
        let vb: number | string = 0;
        if (sortCol === 'nombre') { va = a.nombreProyecto; vb = b.nombreProyecto; }
        else if (sortCol === 'monto') { va = a.montoAdjudicadoTotal || a.montoEstimado || 0; vb = b.montoAdjudicadoTotal || b.montoEstimado || 0; }
        else if (sortCol === 'estado') { va = a.estadoLifecycle || a.estado; vb = b.estadoLifecycle || b.estado; }
        else if (sortCol === 'fecha') { va = a.fechaCreacion || ''; vb = b.fechaCreacion || ''; }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
  }, [licitaciones, search, filtroEstado, filtroCampus, sortCol, sortDir]);

  const campusOpciones = useMemo(() =>
    [...new Set(licitaciones.map(l => l.campusSigla).filter(Boolean))].sort() as string[],
    [licitaciones]
  );

  // Form state
  const [codigoCP, setCodigoCP] = useState('409-');
  const [codigoOP, setCodigoOP] = useState('OP-');
  const [codigoOT, setCodigoOT] = useState('OT-');
  const [codigoProyecto, setCodigoProyecto] = useState('2026_099');
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [montoEstimado, setMontoEstimado] = useState<number>(5000000);
  const [campusSigla, setCampusSigla] = useState('');
  const [edificioSigla, setEdificioSigla] = useState('');
  const [responsableNombre, setResponsableNombre] = useState('');
  const [responsableEmail, setResponsableEmail] = useState('');
  const [selectedMasterProyectoId, setSelectedMasterProyectoId] = useState<string | null>(null);

  // Fechas Calendario SGC
  const getFutureDate = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  };

  const [fechaVisitaTerreno, setFechaVisitaTerreno] = useState(getFutureDate(5));
  const [fechaRecepcionConsultas, setFechaRecepcionConsultas] = useState(getFutureDate(8));
  const [fechaRespuestaConsultas, setFechaRespuestaConsultas] = useState(getFutureDate(10));
  const [fechaEvaluacion, setFechaEvaluacion] = useState(getFutureDate(12));

  const handleOpenAdd = () => {
    setEditingId(null);
    setCodigoCP('409-');
    setCodigoOP('');
    setCodigoOT('');
    setCodigoProyecto('');
    setNombreProyecto('');
    setDescripcion('');
    setMontoEstimado(5000000);
    setCampusSigla('');
    setEdificioSigla('');
    setResponsableNombre('');
    setResponsableEmail('');
    setFechaVisitaTerreno(getFutureDate(5));
    setFechaRecepcionConsultas(getFutureDate(8));
    setFechaRespuestaConsultas(getFutureDate(10));
    setFechaEvaluacion(getFutureDate(12));
    setSelectedMasterProyectoId(null);
    // Abre primero el selector de la Lista de Proyectos
    setShowMasterSelector(true);
  };

  const handleOpenEdit = (lic: LicitacionProyecto) => {
    setEditingId(lic.id);
    setCodigoCP(lic.codigoCP);
    setCodigoOP(lic.codigoOP);
    setCodigoOT(lic.codigoOT);
    setCodigoProyecto(lic.codigoProyecto);
    setNombreProyecto(lic.nombreProyecto);
    setDescripcion(lic.descripcion);
    setMontoEstimado(lic.montoEstimado);
    setCampusSigla(lic.campusSigla || '');
    setEdificioSigla(lic.edificioSigla || '');
    setResponsableNombre(lic.responsableNombre || '');
    setResponsableEmail(lic.responsableEmail || '');
    setFechaVisitaTerreno(lic.fechaVisitaTerreno || getFutureDate(5));
    setFechaRecepcionConsultas(lic.fechaRecepcionConsultas || getFutureDate(8));
    setFechaRespuestaConsultas(lic.fechaRespuestaConsultas || getFutureDate(10));
    setFechaEvaluacion(lic.fechaEvaluacion);
    setShowModal(true);
  };

  const handleSelectFromMaster = (p: ProyectoMaestro) => {
    setCodigoCP(p.codigoCP);
    setCodigoOP(p.codigoOP || '');
    setCodigoOT(p.codigoOT || '');
    setCodigoProyecto(p.codigoProyecto);
    setNombreProyecto(p.nombre);
    setDescripcion(p.descripcion);
    if (p.valorAprox > 0) setMontoEstimado(p.valorAprox);
    setCampusSigla(p.campusSigla || '');
    setEdificioSigla(p.edificioSigla || '');
    setResponsableNombre(p.responsableNombre || '');
    setResponsableEmail(p.responsableEmail || '');
    setSelectedMasterProyectoId(p.id);
    setShowMasterSelector(false);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProyecto) return;

    if (fechaVisitaTerreno > fechaRecepcionConsultas || fechaRecepcionConsultas > fechaRespuestaConsultas || fechaRespuestaConsultas > fechaEvaluacion) {
      alert('El Calendario SGC tiene un orden inválido: Visita a Terreno → Recepción de Consultas → Respuesta de Consultas → Entrega de Propuestas deben ir en ese orden cronológico. Corrija las fechas antes de guardar.');
      return;
    }

    const nombreFormateado = normalizarNombreProyecto(nombreProyecto);

    if (editingId) {
      await onUpdateLicitacion(editingId, {
        codigoCP,
        codigoOP,
        codigoOT,
        codigoProyecto,
        nombreProyecto: nombreFormateado,
        descripcion,
        montoEstimado,
        fechaVisitaTerreno,
        fechaRecepcionConsultas,
        fechaRespuestaConsultas,
        fechaEvaluacion,
        fechaEntregaPropuestas: fechaEvaluacion,
        campusSigla,
        edificioSigla,
        responsableNombre,
        responsableEmail,
      });
    } else {
      await onAddLicitacion({
        codigoCP,
        codigoOP,
        codigoOT,
        codigoProyecto,
        nombreProyecto: nombreFormateado,
        descripcion,
        montoEstimado,
        fechaCreacion: new Date().toISOString().split('T')[0],
        fechaVisitaTerreno,
        fechaRecepcionConsultas,
        fechaRespuestaConsultas,
        fechaEvaluacion,
        fechaEntregaPropuestas: fechaEvaluacion,
        campusSigla,
        edificioSigla,
        responsableNombre,
        responsableEmail,
        estado: 'En Evaluacion',
        estadoLifecycle: 'Invitando',
        ...(selectedMasterProyectoId ? { proyectoMaestroId: selectedMasterProyectoId } : {}),
      });
    }

    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-sky-600" />
            <span>Gestión de Proyectos &amp; Licitaciones de Obra</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Administre los procesos de compra y licitación identificados por sus códigos CP, OP y OT.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm transition text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Crear Nueva Licitación</span>
        </button>
      </div>

      {/* ─── KPIs GLOBALES ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Licitaciones</span>
          <span className="text-lg font-black text-slate-800">{kpis.total}</span>
        </div>
        <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-emerald-600 block">Adjudicadas</span>
          <span className="text-lg font-black text-emerald-800">{kpis.adjudicadas}</span>
        </div>
        <div className="bg-sky-50 p-3.5 rounded-xl border border-sky-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-sky-600 block">Monto Adjudicado</span>
          <span className="text-sm font-black text-sky-800">{formatoMonedaCLP(kpis.montoTotalAdjudicado)}</span>
        </div>
        <div className={`p-3.5 rounded-xl border shadow-sm ${kpis.ahorroTotal >= 0 ? 'bg-violet-50 border-violet-200' : 'bg-red-50 border-red-200'}`}>
          <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${kpis.ahorroTotal >= 0 ? 'text-violet-600' : 'text-red-600'}`}>
            {kpis.ahorroTotal >= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            Ahorro vs. Estimado
          </span>
          <span className={`text-sm font-black ${kpis.ahorroTotal >= 0 ? 'text-violet-800' : 'text-red-800'}`}>{formatoMonedaCLP(kpis.ahorroTotal)} ({kpis.pctAhorro.toFixed(1)}%)</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
            <Activity className="w-3 h-3" /> En Ejecución
          </span>
          <span className="text-lg font-black text-slate-800">{kpis.enEjecucion}</span>
        </div>
        <div className={`p-3.5 rounded-xl border shadow-sm ${kpis.conRiesgoAlto > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <span className={`text-[10px] font-bold uppercase block ${kpis.conRiesgoAlto > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Riesgo Alto/Crítico</span>
          <span className={`text-lg font-black ${kpis.conRiesgoAlto > 0 ? 'text-amber-800' : 'text-slate-800'}`}>{kpis.conRiesgoAlto}</span>
        </div>
      </div>

      {/* ─── BÚSQUEDA, FILTROS Y ORDEN ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, CP, código de proyecto o proveedor..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">Todos los estados</option>
          <option value="Borrador">Borrador</option>
          <option value="En Evaluacion">En Evaluación</option>
          <option value="Adjudicado">Adjudicado</option>
          <option value="Cerrado">Cerrado</option>
        </select>
        {campusOpciones.length > 0 && (
          <select
            value={filtroCampus}
            onChange={e => setFiltroCampus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">Todos los campus</option>
            {campusOpciones.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="flex items-center gap-1.5">
          <select
            value={sortCol}
            onChange={e => toggleSort(e.target.value as typeof sortCol)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="fecha">Ordenar por fecha</option>
            <option value="nombre">Ordenar por nombre</option>
            <option value="monto">Ordenar por monto</option>
            <option value="estado">Ordenar por estado</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
            className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            {sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {licitacionesFiltradas.map(lic => {
          const isSelected = lic.id === licitacionSeleccionadaId;
          const cotsLic = cotizaciones.filter(c => c.licitacionId === lic.id);
          const resultadosOfertas = ordenarCotizacionesPorResultado(cotsLic, lic);
          const cotizacionAdjudicada = cotsLic.find(c => c.id === lic.cotizacionAdjudicadaId)
            || cotsLic.find(c => c.proveedorId === (lic.proveedorAdjudicadoId || lic.proveedorGanadorId));
          const montoAdjudicado = lic.montoAdjudicadoTotal ?? cotizacionAdjudicada?.montoTotal;
          const tieneMontoAdjudicado = Boolean(
            montoAdjudicado && montoAdjudicado > 0 &&
            (lic.estado === 'Adjudicado' || Boolean(lic.proveedorAdjudicadoId || lic.proveedorGanadorId)),
          );
          const antecedentesContador = lic.antecedentesTecnicos?.length || 0;
          const invitadosContador = lic.proveedoresInvitadosIds?.length || 0;

          return (
            <div
                  key={lic.id}
                  onClick={() => {
                    onSelectLicitacion(lic.id);
                    onOpenFicha?.(lic);
                  }}
                  className={`bg-white rounded-2xl p-6 shadow-sm border transition flex flex-col justify-between relative overflow-hidden group hover:shadow-md ${
                    isSelected
                      ? 'border-sky-500 ring-2 ring-sky-500/20 bg-gradient-to-b from-sky-50/30 to-white'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
            >
              {/* Active Selection Badge */}
              {isSelected && (
                <div className="absolute top-0 right-0 bg-sky-600 text-white text-[10px] font-extrabold uppercase px-3 py-1 rounded-bl-xl flex items-center gap-1 shadow-sm">
                  <CheckCircle className="w-3 h-3" />
                  <span>Proyecto Activo</span>
                </div>
              )}

              <div>
                {/* Header Identifiers & Codes */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-extrabold bg-slate-900 text-white px-2.5 py-0.5 rounded-md font-mono">
                      CP: {lic.codigoCP}
                    </span>
                    <span className="font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded font-mono">
                      Cód: {lic.codigoProyecto}
                    </span>

                    {/* OC, OT y OP si existen */}
                    {lic.ordenCompraNumero ? (
                      <span className="font-extrabold text-purple-900 bg-purple-100 px-2 py-0.5 rounded font-mono border border-purple-200">
                        {lic.ordenCompraNumero}
                      </span>
                    ) : null}
                    {lic.codigoOT ? (
                      <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-mono">
                        OT: {lic.codigoOT}
                      </span>
                    ) : null}
                    {lic.codigoOP ? (
                      <span className="font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded font-mono">
                        OP: {lic.codigoOP}
                      </span>
                    ) : null}

                    {!lic.codigoOT && !lic.codigoOP && (
                      <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                        ⏳ OT / OP: Asignación al Adjudicar
                      </span>
                    )}

                    {lic.campusSigla && (
                      <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1 border border-slate-200">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        {lic.campusSigla} {lic.edificioSigla ? `• ${lic.edificioSigla}` : ''}
                      </span>
                    )}
                    {lic.estadoLifecycle && (
                      <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {LIFECYCLE_LABEL[lic.estadoLifecycle] || lic.estadoLifecycle}
                      </span>
                    )}
                    {lic.nivelRiesgo && (lic.nivelRiesgo === 'Alto' || lic.nivelRiesgo === 'Crítico') && (
                      <span className={`font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${RIESGO_COLOR[lic.nivelRiesgo]}`} title={lic.motivoRiesgo}>
                        <ShieldAlert className="w-3 h-3" />
                        Riesgo {lic.nivelRiesgo}
                      </span>
                    )}
                  </div>
                </div>

                {/* Title and Description */}
                <h3 className="text-base font-bold text-slate-800 line-clamp-2 leading-snug group-hover:text-sky-900 transition">
                  {(lic.nombreProyecto || '').toUpperCase()}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{lic.descripcion}</p>
              </div>

              {/* Stats & Key Dates Bar */}
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">{tieneMontoAdjudicado ? 'Monto adjudicado' : 'Monto estimado'}</span>
                    <span className="font-extrabold text-emerald-700">{formatoMonedaCLP(tieneMontoAdjudicado ? montoAdjudicado! : lic.montoEstimado)}</span>
                    {tieneMontoAdjudicado && <span className="block text-[9px] text-slate-400">Estimado: {formatoMonedaCLP(lic.montoEstimado)}</span>}
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Entrega Propuestas</span>
                    <span className="font-bold text-slate-700">{lic.fechaEvaluacion || 'Por definir'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Visita / Consultas</span>
                    <span className="font-semibold text-slate-600 text-[11px] truncate block">
                      {lic.fechaVisitaTerreno || 'Sin fecha'}
                    </span>
                  </div>
                </div>

                {/* SGC Gestiones Integradas (Bases + Invitados) */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setAntecedentesLicitacion(lic);
                    }}
                    className="p-2 bg-indigo-50/70 hover:bg-indigo-100 rounded-xl border border-indigo-100 flex items-center justify-between text-indigo-900 transition"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="font-bold text-[11px] truncate">Bases & Planos</span>
                    </div>
                    <span className="text-[10px] bg-indigo-200 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                      {antecedentesContador}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setInvitadosLicitacion(lic);
                    }}
                    className="p-2 bg-sky-50/70 hover:bg-sky-100 rounded-xl border border-sky-100 flex items-center justify-between text-sky-900 transition"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="font-bold text-[11px] truncate">Empresas Invitadas</span>
                    </div>
                    <span className="text-[10px] bg-sky-200 text-sky-800 font-bold px-1.5 py-0.5 rounded">
                      {invitadosContador}
                    </span>
                  </button>
                </div>

                {/* Cuadros de Ofertas (1, 2, 3...) */}
                <div className="bg-slate-900 text-white p-3 rounded-xl space-y-2 border border-slate-800">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-300">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-sky-400" />
                      Registro de Ofertas ({cotsLic.length})
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setOfertasLicitacion(lic);
                      }}
                      className="text-[10px] text-sky-400 font-bold hover:underline"
                    >
                      + Ingresar Oferta
                    </button>
                  </div>

                  {cotsLic.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic">No hay ofertas ingresadas aún. Presione "+ Ingresar Oferta" para agregar.</p>
                  ) : (
                    <div className="space-y-1">
                      {resultadosOfertas.slice(0, 3).map(({ cotizacion: c, puntaje, esAdjudicada }, i) => (
                        <div key={c.id} className="bg-white/10 px-2 py-1 rounded text-[11px] flex items-center justify-between">
                          <span className="truncate max-w-[170px]">
                            <strong className={esAdjudicada ? 'text-emerald-300' : 'text-sky-300'}>{esAdjudicada ? 'Adjudicada' : `#${i + 1}`}:</strong> {c.proveedorNombre}
                          </span>
                          <span className="font-bold text-emerald-400">{puntaje.toFixed(2)} pts · {formatoMonedaCLP(c.montoNeto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sección Orden de Compra (OC) Post-Adjudicación */}
                {lic.proveedorAdjudicadoId && (
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-purple-200 text-purple-900 rounded-lg font-bold text-[10px]">💳 OC</span>
                      <div>
                        {lic.ordenCompraNumero ? (
                          <>
                            <span className="font-extrabold text-purple-950 block text-xs">
                              {lic.ordenCompraNumero}
                            </span>
                            <span className="text-[10px] text-purple-700">
                              {lic.archivoOCNombre ? `Archivo: ${lic.archivoOCNombre}` : 'Registrada en ficha de proyecto'}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-bold text-purple-900 block text-xs">Orden de Compra Pendiente</span>
                            <span className="text-[10px] text-purple-600">Suba el PDF/Excel de la OC para leerla automáticamente</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setOcLicitacion(lic);
                      }}
                      className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg transition text-[11px] shrink-0 shadow-sm"
                    >
                      {lic.ordenCompraNumero ? 'Reemplazar OC' : 'Subir OC →'}
                    </button>
                  </div>
                )}

                {/* Professional Footer Bar */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setActaLicitacion(lic);
                      }}
                      className="flex items-center gap-1.5 text-xs text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-xl transition font-bold border border-amber-300 shadow-sm"
                      title="Ver y editar Acta de Evaluación Propuesta y Adjudicación SGC"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-700" />
                      <span>Acta SGC</span>
                    </button>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        handleOpenEdit(lic);
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                      title="Editar licitación"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteLicitacion(lic.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Borrar licitación"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onOpenFicha?.(lic);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-700 px-3 py-1.5 rounded-xl transition border border-sky-200"
                    title="Ver Ficha y Carátula del Proyecto"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ficha SGC</span>
                  </button>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setOfertasLicitacion(lic);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white px-3.5 py-1.5 rounded-xl transition shadow-sm"
                  >
                    <span>Ofertas (1, 2, 3...)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            </div>
          );
        })}
        {licitacionesFiltradas.length === 0 && (
          <div className="col-span-2 py-16 text-center text-slate-400 italic text-sm">
            No se encontraron licitaciones con los filtros actuales.
          </div>
        )}
      </div>

      {/* Carga Orden de Compra Modal */}
      {ocLicitacion && (
        <CargaOrdenCompraModal
          licitacion={ocLicitacion}
          onClose={() => setOcLicitacion(null)}
        />
      )}

      {/* Ingreso Secuencial de Ofertas Modal */}
      {ofertasLicitacion && (
        <IngresoOfertasLicitacionModal
          licitacion={ofertasLicitacion}
          cotizaciones={cotizaciones}
          proveedores={proveedores}
          onClose={() => setOfertasLicitacion(null)}
        />
      )}

      {/* Acta de Evaluación Propuesta Modal */}
      {actaLicitacion && (
        <ActaEvaluacionModal
          licitacion={actaLicitacion}
          cotizaciones={cotizaciones}
          proveedores={proveedores}
          configFirmas={configFirmas}
          onClose={() => setActaLicitacion(null)}
          onAdjudicar={(provId, justificacion) => onAdjudicarLicitacion(actaLicitacion.id, provId, justificacion)}
        />
      )}

      {/* Antecedentes Técnicos & Checklist Modal */}
      {antecedentesLicitacion && (
        <AntecedentesManager
          licitacion={antecedentesLicitacion}
          onClose={() => setAntecedentesLicitacion(null)}
          onChecklistComplete={() => {
            // Se actualiza el objeto localmente
            setAntecedentesLicitacion(null);
          }}
        />
      )}

      {/* Invitados Modal */}
      {invitadosLicitacion && (
        <InvitadosManager
          licitacion={invitadosLicitacion}
          proveedores={proveedores}
          onClose={() => setInvitadosLicitacion(null)}
        />
      )}

      {/* Selector de Proyecto desde Lista de Proyectos */}
      {showMasterSelector && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 p-6 flex items-center justify-center">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-4 max-h-[88vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  Paso 1: Seleccionar Proyecto desde la Cartera de Proyectos 2026
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Seleccione el proyecto presupuestado del año 2026 para autocompletar su información.
                </p>
              </div>
              <button onClick={() => setShowMasterSelector(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              <ProyectosMaestros
                modoSelector
                onSelectProyecto={handleSelectFromMaster}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Add / Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? 'Editar Licitación' : 'Crear Nueva Licitación'}
              </h3>
              <button
                type="button"
                onClick={() => setShowMasterSelector(true)}
                className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg text-xs transition border border-indigo-200"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Importar desde Cartera de Proyectos 2026</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex flex-col h-full">
                  <label className="block font-semibold text-slate-700 mb-1 h-8 flex items-center">Cód. Proyecto *</label>
                  <input
                    type="text"
                    required
                    placeholder="2026_XXX"
                    value={codigoProyecto}
                    onChange={e => setCodigoProyecto(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none font-bold text-indigo-700 flex-grow"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block h-3 flex items-center">Desde Cartera 2026</span>
                </div>
                <div className="flex flex-col h-full">
                  <label className="block font-semibold text-slate-700 mb-1 h-8 flex items-center">Centro de Costo (CC) *</label>
                  <select
                    required
                    value={codigoCP}
                    onChange={e => setCodigoCP(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none font-semibold text-slate-800 flex-grow"
                  >
                    <option value="">-- Seleccionar Centro de Costo (CP) --</option>
                    {getCentrosCostoList()
                      .filter(c => c.estado !== 'Inactivo' || c.codigoCP === codigoCP)
                      .map(c => (
                        <option key={c.codigoCP} value={c.codigoCP}>
                          {c.codigoCP} — {c.nombre}
                        </option>
                      ))}
                  </select>
                  <span className="text-[10px] text-slate-400 mt-1 block h-3 flex items-center">CC del presupuesto</span>
                </div>
                <div className="flex flex-col h-full">
                  <label className="block font-semibold text-slate-500 mb-1 h-8 flex items-center">Código OT (Orden Trabajo)</label>
                  <input
                    type="text"
                    disabled
                    value={codigoOT ? codigoOT : 'Pendiente (Post-Adjudicación)'}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 outline-none text-[11px] font-semibold flex-grow"
                  />
                  <span className="text-[10px] text-amber-700 font-semibold mt-1 block h-3 flex items-center">Se asigna al adjudicar</span>
                </div>
                <div className="flex flex-col h-full">
                  <label className="block font-semibold text-slate-500 mb-1 h-8 flex items-center">Código OP (Orden Pedido)</label>
                  <input
                    type="text"
                    disabled
                    value={codigoOP ? codigoOP : 'Pendiente (Post-Adjudicación)'}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 outline-none text-[11px] font-semibold flex-grow"
                  />
                  <span className="text-[10px] text-amber-700 font-semibold mt-1 block h-3 flex items-center">Se asigna en Administración</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Proyecto *</label>
                <input
                  type="text"
                  required
                  {...ATRIBUTOS_ORTOGRAFIA_ES}
                  placeholder="Ej: Remodelación Laboratorio de Redes Campus San Juan Pablo II"
                  value={nombreProyecto}
                  onChange={e => setNombreProyecto(e.target.value.toLocaleUpperCase('es-CL'))}
                  onBlur={e => setNombreProyecto(normalizarNombreProyecto(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción del Requerimiento</label>
                <textarea
                  rows={3}
                  {...ATRIBUTOS_ORTOGRAFIA_ES}
                  placeholder="Detalles de la obra, ubicación y alcances..."
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  onBlur={e => setDescripcion(corregirOrtografiaEspanol(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none resize-none"
                />
              </div>

              {/* Calendario de la Licitación (SGC) */}
              <div className="bg-sky-50/60 p-3.5 rounded-xl border border-sky-100 space-y-2">
                <span className="text-[11px] font-bold text-sky-900 block flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-sky-600" />
                  Calendario SGC de la Licitación (Hitos Obligatorios)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-[11px]">1. Visita a Terreno</label>
                    <PremiumDatePicker
                      value={fechaVisitaTerreno}
                      onChange={setFechaVisitaTerreno}
                      className="flex items-center gap-1.5 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-[11px] text-left"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-[11px]">2. Recepción Consultas</label>
                    <PremiumDatePicker
                      value={fechaRecepcionConsultas}
                      onChange={setFechaRecepcionConsultas}
                      className="flex items-center gap-1.5 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-[11px] text-left"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-[11px]">3. Respuesta Consultas</label>
                    <PremiumDatePicker
                      value={fechaRespuestaConsultas}
                      onChange={setFechaRespuestaConsultas}
                      className="flex items-center gap-1.5 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-[11px] text-left"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-[11px]">4. Entrega Propuestas</label>
                    <PremiumDatePicker
                      value={fechaEvaluacion}
                      onChange={setFechaEvaluacion}
                      className="flex items-center gap-1.5 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-[11px] text-left"
                    />
                  </div>
                </div>
                {(fechaRecepcionConsultas > fechaRespuestaConsultas || fechaRespuestaConsultas > fechaEvaluacion || fechaVisitaTerreno > fechaRecepcionConsultas) && (
                  <p className="text-[10px] text-red-700 font-semibold flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> Orden inválido: deben avanzar 1 → 2 → 3 → 4. No podrá guardar hasta corregirlo.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto Estimado / Presupuesto (CLP) *</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold">$</span>
                    <input
                      type="text"
                      value={formatearEnteroConMiles(montoEstimado)}
                      onChange={e => setMontoEstimado(desformatearEntero(e.target.value))}
                      className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none font-bold text-emerald-700"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Responsable Asignado</label>
                  <input
                    type="text"
                    disabled
                    placeholder="Se importa de la Lista Maestra"
                    value={responsableNombre ? `${responsableNombre} (${responsableEmail})` : 'Sin asignar'}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 outline-none font-medium text-[11px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t">
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('¿Confirma que desea eliminar definitivamente esta licitación y todos sus datos cargados?')) {
                        onDeleteLicitacion(editingId);
                        setShowModal(false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg transition border border-red-200"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                    <span>Borrar Licitación</span>
                  </button>
                ) : (
                  <div></div>
                )}
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={fechaVisitaTerreno > fechaRecepcionConsultas || fechaRecepcionConsultas > fechaRespuestaConsultas || fechaRespuestaConsultas > fechaEvaluacion}
                    className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-sm"
                  >
                    {editingId ? 'Guardar Cambios' : 'Crear Licitación'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
