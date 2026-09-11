import React, { useEffect, useState } from 'react';
import {
  BookOpen, Plus, Trash2, Search,
  X, DollarSign, Calendar, MapPin, Building, User,
  FileText, Paperclip, FolderPlus, ScrollText, Hammer, ShieldCheck
} from 'lucide-react';
import {
  subscribeToProyectos,
  subscribeToLicitaciones,
  subscribeToProveedores,
  addProyectoMaestro,
  updateProyectoMaestro,
  setAprobacionPresupuesto,
} from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';
import { corregirOrtografiaEspanol, corregirTextoAvanzado, normalizarNombreProyecto, ATRIBUTOS_ORTOGRAFIA_ES } from '../utils/spellCorrector';
import { getCampusList, obtenerEdificiosDeCampus, obtenerCampusPorSigla } from '../data/campusData';
import { RESPONSABLES_INFRAESTRUCTURA } from '../data/responsablesData';
import { getCentrosCostoList } from '../data/centrosCostoData';
import { getRubrosList } from '../data/rubrosData';
import { getTiposObraList } from '../data/tiposObraData';
import { sugerirPoliticaGarantias } from '../data/basesTemplateData';
import { VisualizadorOCModal } from './VisualizadorOCModal';
import { RepararCarteraModal, BotonRepararCartera } from './RepararCarteraModal';
import { BasesLicitacionModal } from './BasesLicitacionModal';
import { ContratoAdjudicacionModal } from './ContratoAdjudicacionModal';
import { ImportarProyectosExcelModal } from './ImportarProyectosExcelModal';
import { useAuth } from '../context/AuthContext';
import type { ProyectoMaestro, LicitacionProyecto, Proveedor, ConfiguracionFirmas } from '../types';

interface ProyectosMaestrosProps {
  onSelectProyecto?: (p: ProyectoMaestro) => void;
  onOpenFicha?: (p: ProyectoMaestro) => void;
  modoSelector?: boolean;
  configFirmas?: ConfiguracionFirmas;
}

const EMPTY_FORM = {
  codigoCP: '409-1722',
  codigoOP: '',
  codigoOT: '',
  ordenCompraNumero: '',
  codigoOC: '',
  codigoProyecto: '2026_099',
  nombre: '',
  descripcion: '',
  valorAprox: 0,
  estado: 'Pendiente' as ProyectoMaestro['estado'],
  fechaCreacion: new Date().toISOString(),
  campusSigla: '',
  edificioSigla: '',
  uso: '',
  tipoObra: '',
  rubro: '',
  politicaGarantias: '' as ProyectoMaestro['politicaGarantias'] | '',
  responsableNombre: '',
  responsableEmail: '',
  documentosAntecedentes: [] as {
    id: string;
    nombre: string;
    tipo: 'Plano' | 'Documento' | 'Bases' | 'EETT' | 'Anexo';
    archivoNombre?: string;
    fechaCarga: string;
  }[],
};

export const ProyectosMaestros: React.FC<ProyectosMaestrosProps> = ({
  onSelectProyecto,
  onOpenFicha,
  modoSelector = false,
  configFirmas,
}) => {
  const { isAdmin, user, profile } = useAuth();
  const [proyectos, setProyectos] = useState<ProyectoMaestro[]>([]);
  const [licitaciones, setLicitaciones] = useState<LicitacionProyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [repararAbierto, setRepararAbierto] = useState(false);
  const [basesProyecto, setBasesProyecto] = useState<ProyectoMaestro | null>(null);
  const [contratoProyecto, setContratoProyecto] = useState<ProyectoMaestro | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [importarExcelAbierto, setImportarExcelAbierto] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroCampus, setFiltroCampus] = useState('Todos');
  const [filtroResponsable, setFiltroResponsable] = useState('Todos');
  const [filtroRubro, setFiltroRubro] = useState('Todos');
  const rubrosDisponibles = getRubrosList().filter(r => r.estado === 'Activo');
  const tiposObraDisponibles = getTiposObraList().filter(t => t.estado === 'Activo');
  const [showModal, setShowModal] = useState(false);
  const [verPDFOCProyecto, setVerPDFOCProyecto] = useState<ProyectoMaestro | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tabActivaModal, setTabActivaModal] = useState<'datos' | 'planos' | 'documentos'>('datos');

  // Estado del formulario
  const [form, setForm] = useState(EMPTY_FORM);

  // Estado temporal de nuevo antecedente (Plano / Documento)
  const [nuevoDocNombre, setNuevoDocNombre] = useState('');
  const [nuevoDocTipo, setNuevoDocTipo] = useState<'Plano' | 'Documento' | 'Bases' | 'EETT' | 'Anexo'>('Plano');
  const [nuevoDocArchivoNombre, setNuevoDocArchivoNombre] = useState('');

  useEffect(() => {
    const unsub = subscribeToProyectos(data => {
      setProyectos(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToLicitaciones(data => setLicitaciones(data));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToProveedores(data => setProveedores(data));
    return unsub;
  }, []);

  // Set de proyectos maestros que ya cuentan con una licitación creada.
  // Coincide primero por proyectoMaestroId (vínculo directo) y, como respaldo
  // para licitaciones antiguas sin ese campo, por codigoProyecto.
  const proyectosConLicitacion = React.useMemo(() => {
    const porId = new Set(licitaciones.map(l => l.proyectoMaestroId).filter(Boolean) as string[]);
    const porCodigo = new Set(
      licitaciones.filter(l => !l.proyectoMaestroId && l.codigoProyecto).map(l => l.codigoProyecto)
    );
    return { porId, porCodigo };
  }, [licitaciones]);

  const tieneLicitacion = (p: ProyectoMaestro) =>
    proyectosConLicitacion.porId.has(p.id) ||
    (!!p.codigoProyecto && proyectosConLicitacion.porCodigo.has(p.codigoProyecto));

  const openAdd = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      codigoProyecto: '',
    });
    setTabActivaModal('datos');
    setShowModal(true);
  };

  const handleAgregarAntecedente = () => {
    if (!nuevoDocNombre.trim()) {
      alert('Ingrese el nombre o descripción del documento o plano.');
      return;
    }

    const nombreCorregido = corregirOrtografiaEspanol(nuevoDocNombre.trim());
    const item = {
      id: `doc-${Date.now()}`,
      nombre: nombreCorregido,
      tipo: nuevoDocTipo,
      archivoNombre: nuevoDocArchivoNombre || `${nombreCorregido.replace(/\s+/g, '_')}.${nuevoDocTipo === 'Plano' ? 'dwg' : 'pdf'}`,
      fechaCarga: new Date().toLocaleDateString('es-CL'),
    };

    setForm(f => ({
      ...f,
      documentosAntecedentes: [...(f.documentosAntecedentes || []), item],
    }));

    setNuevoDocNombre('');
    setNuevoDocArchivoNombre('');
  };

  const handleEliminarAntecedente = (id: string) => {
    setForm(f => ({
      ...f,
      documentosAntecedentes: (f.documentosAntecedentes || []).filter(d => d.id !== id),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      alert('Ingrese el nombre del proyecto.');
      return;
    }
    if (!form.tipoObra) {
      alert('Seleccione el Tipo de Obra: define la plantilla legal de Bases y la política de garantías del proyecto.');
      return;
    }
    if (!form.valorAprox || form.valorAprox <= 0) {
      alert('Ingrese un Presupuesto Estimado mayor a cero.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateProyectoMaestro(editingId, {
          codigoCP: form.codigoCP,
          ordenCompraNumero: form.ordenCompraNumero,
          codigoOC: form.codigoOC,
          nombre: normalizarNombreProyecto(form.nombre),
          descripcion: form.descripcion,
          valorAprox: form.valorAprox,
          estado: form.estado,
          campusSigla: form.campusSigla,
          campusNombre: form.campusSigla ? obtenerCampusPorSigla(form.campusSigla)?.nombre : '',
          edificioSigla: form.edificioSigla,
          uso: form.uso,
          tipoObra: form.tipoObra,
          rubro: form.rubro,
          politicaGarantias: form.politicaGarantias || undefined,
          responsableNombre: form.responsableNombre,
          responsableEmail: form.responsableEmail,
          documentosAntecedentes: form.documentosAntecedentes,
        });
      } else {
        const campusNombreNuevo = form.campusSigla ? obtenerCampusPorSigla(form.campusSigla)?.nombre : '';
        const nuevoId = await addProyectoMaestro({
          codigoCP: form.codigoCP,
          codigoOP: '',
          codigoOT: '',
          ordenCompraNumero: form.ordenCompraNumero,
          codigoOC: form.codigoOC,
          nombre: normalizarNombreProyecto(form.nombre),
          descripcion: form.descripcion,
          valorAprox: form.valorAprox,
          estado: form.estado,
          fechaCreacion: new Date().toISOString(),
          campusSigla: form.campusSigla,
          campusNombre: campusNombreNuevo,
          edificioSigla: form.edificioSigla,
          uso: form.uso,
          tipoObra: form.tipoObra,
          rubro: form.rubro,
          politicaGarantias: form.politicaGarantias || undefined,
          responsableNombre: form.responsableNombre,
          responsableEmail: form.responsableEmail,
          documentosAntecedentes: form.documentosAntecedentes,
        });

        setShowModal(false);
        // Encadenar directo a las Bases: se pre-cargan según el Tipo de Obra recién elegido.
        setBasesProyecto({
          id: nuevoId,
          correlativo: 0,
          codigoCP: form.codigoCP,
          codigoOP: '',
          codigoOT: '',
          codigoProyecto: form.codigoProyecto,
          ordenCompraNumero: form.ordenCompraNumero,
          codigoOC: form.codigoOC,
          nombre: normalizarNombreProyecto(form.nombre),
          descripcion: form.descripcion,
          valorAprox: form.valorAprox,
          estado: form.estado,
          fechaCreacion: new Date().toISOString(),
          campusSigla: form.campusSigla,
          campusNombre: campusNombreNuevo,
          edificioSigla: form.edificioSigla,
          uso: form.uso,
          tipoObra: form.tipoObra,
          rubro: form.rubro,
          politicaGarantias: form.politicaGarantias || undefined,
          responsableNombre: form.responsableNombre,
          responsableEmail: form.responsableEmail,
        });
        return;
      }

      setShowModal(false);
    } catch (err) {
      console.error('Error guardando proyecto:', err);
    } finally {
      setSaving(false);
    }
  };

  const [filtroPrioridad, setFiltroPrioridad] = useState('Todas');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [filtroLicitacion, setFiltroLicitacion] = useState<'Todos' | 'Con' | 'Sin'>('Todos');

  // Cálculos de Resumen por Prioridad y Financiero
  const totalAltaVal = proyectos.filter(p => p.prioridad === 'Alta').reduce((sum, p) => sum + (p.valorAprox || 0), 0);
  const totalAltaCount = proyectos.filter(p => p.prioridad === 'Alta').length;

  const totalMediaVal = proyectos.filter(p => p.prioridad === 'Media' || !p.prioridad).reduce((sum, p) => sum + (p.valorAprox || 0), 0);
  const totalMediaCount = proyectos.filter(p => p.prioridad === 'Media' || !p.prioridad).length;

  const totalBajaVal = proyectos.filter(p => p.prioridad === 'Baja').reduce((sum, p) => sum + (p.valorAprox || 0), 0);
  const totalBajaCount = proyectos.filter(p => p.prioridad === 'Baja').length;

  const totalPresupuestoGeneral = proyectos.reduce((sum, p) => sum + (p.valorAprox || 0), 0);
  const totalGastoEfectivoGeneral = proyectos.reduce((sum, p) => sum + (p.gastoEfectivo || 0), 0);

  // Solo los proyectos con Presupuesto Aprobado comprometen el techo institucional — el resto
  // de la cartera (totalPresupuestoGeneral) queda "en espera" y no cuenta para ese control.
  const proyectosAprobadosPpto = proyectos.filter(p => p.presupuesto?.aprobado);
  const totalPresupuestoAprobado = proyectosAprobadosPpto.reduce((sum, p) => sum + (p.montoAdjudicado || p.valorAprox || 0), 0);

  // Techo institucional anual (distinto de la suma de montos adjudicados): lo que hay que
  // controlar para que la Cartera no se pase, comparado contra lo ya comprometido (estimado).
  const presupuestoAnualAprobado = configFirmas?.presupuestoAnualAprobado || 0;
  const pctPresupuestoUsado = presupuestoAnualAprobado > 0
    ? Math.round((totalPresupuestoAprobado / presupuestoAnualAprobado) * 100)
    : 0;
  const presupuestoColor = pctPresupuestoUsado > 100 ? 'text-rose-700' : pctPresupuestoUsado >= 85 ? 'text-amber-700' : 'text-indigo-700';

  const handleToggleAprobacionPresupuesto = async (p: ProyectoMaestro) => {
    const yaAprobado = Boolean(p.presupuesto?.aprobado);
    await setAprobacionPresupuesto(p.id, !yaAprobado, {
      nombre: profile?.displayName || user?.displayName,
      email: user?.email,
    });
  };

  const filtered = proyectos.filter(p => {
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      p.nombre.toLowerCase().includes(q) ||
      p.codigoCP.toLowerCase().includes(q) ||
      p.codigoProyecto.toLowerCase().includes(q) ||
      (p.ordenCompraNumero && p.ordenCompraNumero.toLowerCase().includes(q)) ||
      (p.codigoOC && p.codigoOC.toLowerCase().includes(q)) ||
      (p.responsableNombre && p.responsableNombre.toLowerCase().includes(q));

    const matchCampus = filtroCampus === 'Todos' || p.campusSigla === filtroCampus;
    const matchResponsable = filtroResponsable === 'Todos' || p.responsableNombre === filtroResponsable;
    const matchRubro = filtroRubro === 'Todos' || p.rubro === filtroRubro;
    const matchPrioridad = filtroPrioridad === 'Todas' || (p.prioridad || 'Media') === filtroPrioridad;
    const matchEstado = filtroEstado === 'Todos' || p.estado === filtroEstado;
    const matchLicitacion =
      filtroLicitacion === 'Todos' ||
      (filtroLicitacion === 'Con' ? tieneLicitacion(p) : !tieneLicitacion(p));

    return matchSearch && matchCampus && matchResponsable && matchRubro && matchPrioridad && matchEstado && matchLicitacion;
  });

  const hayFiltrosActivos =
    search.trim() !== '' ||
    filtroCampus !== 'Todos' ||
    filtroResponsable !== 'Todos' ||
    filtroRubro !== 'Todos' ||
    filtroPrioridad !== 'Todas' ||
    filtroEstado !== 'Todos' ||
    filtroLicitacion !== 'Todos';

  const totalEstimadoFiltrado = filtered.reduce((sum, p) => sum + (p.valorAprox || 0), 0);
  const totalAdjudicadoFiltrado = filtered.reduce((sum, p) => sum + (p.montoAdjudicado || 0), 0);
  const totalGastoEfectivoFiltrado = filtered.reduce((sum, p) => sum + (p.gastoEfectivo || 0), 0);

  const limpiarFiltros = () => {
    setSearch('');
    setFiltroCampus('Todos');
    setFiltroResponsable('Todos');
    setFiltroRubro('Todos');
    setFiltroPrioridad('Todas');
    setFiltroEstado('Todos');
    setFiltroLicitacion('Todos');
  };

  return (
    <div className="space-y-2.5">
      {/* Header compacto: fila 1 = título + prioridades + acciones · fila 2 = totales financieros */}
      <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 shrink-0">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            Cartera 2026
          </h2>

          <div className="flex items-center gap-1 text-[10px] shrink-0">
            <span title={`Prioridad Alta: ${formatoMonedaCLP(totalAltaVal)}`} className="flex items-center gap-1 font-bold text-red-700 bg-red-50 border border-red-200 rounded-md pl-1.5 pr-2 py-1 whitespace-nowrap cursor-default">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0"></span>
              P1 <span className="opacity-70">{totalAltaCount}</span>
            </span>
            <span title={`Prioridad Media: ${formatoMonedaCLP(totalMediaVal)}`} className="flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md pl-1.5 pr-2 py-1 whitespace-nowrap cursor-default">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
              P2 <span className="opacity-70">{totalMediaCount}</span>
            </span>
            <span title={`Prioridad Baja: ${formatoMonedaCLP(totalBajaVal)}`} className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md pl-1.5 pr-2 py-1 whitespace-nowrap cursor-default">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              P3 <span className="opacity-70">{totalBajaCount}</span>
            </span>
          </div>

          <div className="flex-1 min-w-[4px]" />

          {!modoSelector && (
            <div className="flex items-center gap-1.5 shrink-0">
              {isAdmin && <BotonRepararCartera onOpen={() => setRepararAbierto(true)} />}
              <button
                onClick={() => setImportarExcelAbierto(true)}
                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold px-2.5 py-1.5 rounded-lg text-[11px] shrink-0"
                title="Importar varios proyectos desde una planilla Excel"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Importar Excel</span>
              </button>
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm transition text-[11px] shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuevo Proyecto</span>
              </button>
            </div>
          )}
        </div>

        {/* Totales financieros — franja propia para distinguirlos de la distribución por prioridad */}
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-1">
          {presupuestoAnualAprobado > 0 ? (
            <div className="flex items-baseline gap-1.5" title="Techo institucional anual, comparado solo contra los proyectos con Presupuesto Aprobado (columna Prioridad)">
              <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-400">Presupuesto Anual Aprobado</span>
              <span className="text-xs font-black text-indigo-900">{formatoMonedaCLP(presupuestoAnualAprobado)}</span>
              <span className={`text-[9px] font-extrabold ${presupuestoColor}`}>({pctPresupuestoUsado}% comprometido)</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-amber-500">Presupuesto Anual Aprobado</span>
              <span className="text-[10px] font-bold text-amber-700 italic">Sin definir — configúrelo en Configuración → Parámetros</span>
            </div>
          )}
          <div className="flex items-baseline gap-1.5" title="Suma de proyectos con Presupuesto Aprobado — son los que se proyectan mes a mes en Avance Financiero">
            <span className={`text-[9px] font-bold uppercase tracking-wide ${presupuestoColor}`}>Aprobado p/ Presupuesto ({proyectosAprobadosPpto.length})</span>
            <span className={`text-xs font-black ${presupuestoColor}`}>{formatoMonedaCLP(totalPresupuestoAprobado)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Cartera Total ({proyectos.length})</span>
            <span className="text-xs font-black text-slate-500">{formatoMonedaCLP(totalPresupuestoGeneral)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-500">Gasto Efectivo Pagado</span>
            <span className="text-xs font-black text-emerald-700">{formatoMonedaCLP(totalGastoEfectivoGeneral)}</span>
          </div>
        </div>
      </div>

      {/* Search & Location / Priority / Responsable Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <div className="sm:col-span-2 relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, CP, OC, Cód. Proyecto o responsable..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
        <div>
          <select
            value={filtroResponsable}
            onChange={e => setFiltroResponsable(e.target.value)}
            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm font-semibold"
          >
            <option value="Todos">Todos los Responsables</option>
            {RESPONSABLES_INFRAESTRUCTURA.map(r => (
              <option key={r.codigo} value={r.nombre}>
                👤 {r.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={filtroCampus}
            onChange={e => setFiltroCampus(e.target.value)}
            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm"
          >
            <option value="Todos">Todos los Campus</option>
            {getCampusList().map(c => (
              <option key={c.sigla} value={c.sigla}>
                {c.sigla} — {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={filtroPrioridad}
            onChange={e => setFiltroPrioridad(e.target.value)}
            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm font-semibold"
          >
            <option value="Todas">Todas las Prioridades</option>
            <option value="Alta">🔴 Alta (P1)</option>
            <option value="Media">🟡 Media (P2)</option>
            <option value="Baja">🟢 Baja (P3)</option>
          </select>
        </div>
        <div>
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm font-semibold"
          >
            <option value="Todos">Todos los Estados</option>
            <option value="Pendiente">⏳ Pendiente</option>
            <option value="En Proceso">🚧 En Proceso / Ejecución</option>
            <option value="Completado">✅ Completado</option>
          </select>
        </div>
        <div>
          <select
            value={filtroRubro}
            onChange={e => setFiltroRubro(e.target.value)}
            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm font-semibold"
          >
            <option value="Todos">Todos los Rubros</option>
            {rubrosDisponibles.map(r => (
              <option key={r.id} value={r.nombre}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={filtroLicitacion}
            onChange={e => setFiltroLicitacion(e.target.value as 'Todos' | 'Con' | 'Sin')}
            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm font-semibold"
          >
            <option value="Todos">Con / Sin Licitación</option>
            <option value="Con">📋 Con Licitación</option>
            <option value="Sin">— Sin Licitación</option>
          </select>
        </div>
      </div>

      {/* Totales del filtro activo — se recalculan sobre lo que muestra la tabla, no sobre toda la cartera */}
      {!modoSelector && (
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 rounded-xl border text-[10px] ${
          hayFiltrosActivos ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <span className="font-bold uppercase tracking-wide text-slate-500">
            {hayFiltrosActivos ? `Filtro activo · ${filtered.length} proyecto(s)` : `Todos los proyectos · ${filtered.length}`}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold uppercase tracking-wide text-slate-400">Estimado</span>
            <span className="font-black text-slate-700">{formatoMonedaCLP(totalEstimadoFiltrado)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold uppercase tracking-wide text-indigo-400">Adjudicado</span>
            <span className="font-black text-indigo-700">{formatoMonedaCLP(totalAdjudicadoFiltrado)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold uppercase tracking-wide text-emerald-500">Gasto Efectivo</span>
            <span className="font-black text-emerald-700">{formatoMonedaCLP(totalGastoEfectivoFiltrado)}</span>
          </div>
          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="ml-auto font-bold text-sky-700 hover:text-sky-900 underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando Cartera de Proyectos...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No se encontraron proyectos en la Cartera 2026 con ese criterio de búsqueda.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-auto max-h-[75vh]">
          <table className={`w-full text-xs ${modoSelector ? 'min-w-[560px]' : 'min-w-[880px]'}`}>
            <thead className="bg-slate-900 text-white border-b border-slate-800">
              <tr>
                <th className="px-3 py-1.5 text-center font-bold sticky top-0 z-10 bg-slate-900">Cód. Proyecto</th>
                {!modoSelector && <th className="px-3 py-1.5 text-center font-bold sticky top-0 z-10 bg-slate-900">Centro Costo (CC)</th>}
                {!modoSelector && <th className="px-3 py-1.5 text-center font-bold sticky top-0 z-10 bg-slate-900">Orden Compra (OC)</th>}
                <th className="px-3 py-1.5 text-left font-bold sticky top-0 z-10 bg-slate-900">Proyecto Institucional</th>
                <th className="px-3 py-1.5 text-left font-bold sticky top-0 z-10 bg-slate-900">Ubicación UCT</th>
                {!modoSelector && <th className="px-3 py-1.5 text-center font-bold sticky top-0 z-10 bg-slate-900">Prioridad</th>}
                {!modoSelector && <th className="px-3 py-1.5 text-center font-bold sticky top-0 z-10 bg-slate-900">Estado / Avance</th>}
                <th className="px-3 py-1.5 text-right font-bold sticky top-0 z-10 bg-slate-900 min-w-[190px]">Presupuesto (Estimado / Adjudicado / Gasto)</th>
                <th className="px-2 py-1.5 text-center font-bold sticky top-0 right-0 z-20 bg-slate-900 border-l border-slate-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => {
                const pctGasto = p.montoAdjudicado && p.montoAdjudicado > 0
                  ? Math.min(100, Math.round(((p.gastoEfectivo || 0) / p.montoAdjudicado) * 100))
                  : p.estado === 'Completado' ? 100 : p.estado === 'En Proceso' ? 50 : 0;

                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50/80 transition ${modoSelector ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (modoSelector) {
                        onSelectProyecto?.(p);
                      }
                    }}
                  >
                    <td className="px-3 py-1.5 text-center">
                      <span className="font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded w-fit font-mono inline-block">
                        {p.codigoProyecto || (p.correlativo ? String(p.correlativo).padStart(3, '0') : '-')}
                      </span>
                    </td>
                    {!modoSelector && (
                      <td className="px-3 py-1.5 text-center">
                        <span className="font-bold text-slate-800 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded w-fit font-mono inline-block">
                          {p.codigoCP || '-'}
                        </span>
                      </td>
                    )}
                    {!modoSelector && (
                      <td className="px-3 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        {p.ordenCompraNumero || p.codigoOC ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVerPDFOCProyecto(p);
                            }}
                            className="font-extrabold text-purple-900 bg-purple-100 hover:bg-purple-200 hover:text-purple-950 border border-purple-300 px-2.5 py-1 rounded font-mono inline-flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Haga clic para ver el PDF de la Orden de Compra"
                          >
                            <FileText className="w-3.5 h-3.5 text-purple-700" />
                            <span>{p.ordenCompraNumero || p.codigoOC}</span>
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    )}
                    <td className={modoSelector ? 'px-3 py-2' : 'px-3 py-1.5'}>
                      <div className="flex items-start gap-1.5">
                        <p className={modoSelector ? 'font-bold text-slate-800 text-sm leading-snug' : 'font-bold text-slate-800 line-clamp-1'}>
                          {(p.nombre || '').toUpperCase()}
                        </p>
                        {tieneLicitacion(p) && (
                          <span
                            className="shrink-0 inline-flex items-center gap-1 text-[9px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full mt-0.5"
                            title="Este proyecto ya tiene una licitación creada"
                          >
                            <FileText className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      {p.responsableNombre ? (
                        <p className="text-slate-500 text-[10px] line-clamp-1 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{p.responsableNombre}</span>
                        </p>
                      ) : (
                        <p className="text-slate-400 text-[10px] italic mt-0.5">Sin responsable asignado</p>
                      )}
                      {!modoSelector && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <select
                            value={p.tipoObra || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={async (e) => {
                              await updateProyectoMaestro(p.id, { tipoObra: e.target.value });
                            }}
                            className={`text-[9px] font-semibold rounded px-1 py-0.5 outline-none cursor-pointer border transition w-1/2 ${
                              p.tipoObra
                                ? 'text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100'
                                : 'text-slate-400 bg-slate-50 border-slate-200 hover:bg-slate-100 italic'
                            }`}
                            title="Asignar Tipo de Obra (define la plantilla de Bases)"
                          >
                            <option value="">-- Tipo obra --</option>
                            {tiposObraDisponibles.map(t => (
                              <option key={t.id} value={t.nombre}>
                                {t.nombre}
                              </option>
                            ))}
                          </select>
                          <select
                            value={p.rubro || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={async (e) => {
                              await updateProyectoMaestro(p.id, { rubro: e.target.value });
                            }}
                            className={`text-[9px] font-semibold rounded px-1 py-0.5 outline-none cursor-pointer border transition w-1/2 ${
                              p.rubro
                                ? 'text-violet-800 bg-violet-50 border-violet-200 hover:bg-violet-100'
                                : 'text-slate-400 bg-slate-50 border-slate-200 hover:bg-slate-100 italic'
                            }`}
                            title="Asignar Rubro del Proyecto"
                          >
                            <option value="">-- Rubro --</option>
                            {rubrosDisponibles.map(r => (
                              <option key={r.id} value={r.nombre}>
                                {r.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 text-[10px] min-w-[140px]">
                        <select
                          value={p.campusSigla || ''}
                          onChange={async (e) => {
                            const sigla = e.target.value;
                            const campInfo = obtenerCampusPorSigla(sigla);
                            const eds = obtenerEdificiosDeCampus(sigla);
                            const primerEd = eds.length > 0 ? eds[0] : '';
                            await updateProyectoMaestro(p.id, {
                              campusSigla: sigla,
                              campusNombre: campInfo ? campInfo.nombre : '',
                              edificioSigla: primerEd,
                            });
                          }}
                          className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 outline-none cursor-pointer hover:bg-indigo-100 transition text-[9px] w-1/2"
                          title="Cambiar Campus UCT"
                        >
                          <option value="">-- Campus --</option>
                          {getCampusList().map(c => (
                            <option key={c.sigla} value={c.sigla}>
                              {c.sigla} ({c.nombre})
                            </option>
                          ))}
                        </select>

                        {p.campusSigla ? (
                          <select
                            value={p.edificioSigla || ''}
                            onChange={async (e) => {
                              const edSigla = e.target.value;
                              await updateProyectoMaestro(p.id, { edificioSigla: edSigla });
                            }}
                            className="font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 outline-none cursor-pointer hover:bg-slate-100 transition text-[9px] w-1/2"
                            title="Cambiar Edificio del Campus"
                          >
                            <option value="">-- Edificio --</option>
                            {obtenerEdificiosDeCampus(p.campusSigla).map(ed => (
                              <option key={ed} value={ed}>
                                Ed. {ed}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[9px] text-slate-400 italic w-1/2">Seleccione campus</span>
                        )}
                      </div>
                    </td>
                    {!modoSelector && (
                      <td className="px-3 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-1">
                          <select
                            value={p.prioridad || 'Media'}
                            onChange={async (e) => {
                              const val = e.target.value as ProyectoMaestro['prioridad'];
                              await updateProyectoMaestro(p.id, { prioridad: val });
                            }}
                            className={`text-[10px] font-bold outline-none cursor-pointer rounded px-2 py-1 border transition ${
                              p.prioridad === 'Alta' ? 'bg-red-50 text-red-700 border-red-200' :
                              p.prioridad === 'Baja' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            <option value="Alta">🔴 Alta (P1)</option>
                            <option value="Media">🟡 Media (P2)</option>
                            <option value="Baja">🟢 Baja (P3)</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleToggleAprobacionPresupuesto(p)}
                            title={p.presupuesto?.aprobado
                              ? `Aprobado para Presupuesto Anual por ${p.presupuesto.aprobadoPorNombre || p.presupuesto.aprobadoPorEmail || '—'} el ${p.presupuesto.fecha ? new Date(p.presupuesto.fecha).toLocaleDateString('es-CL') : '—'}. Clic para retirar.`
                              : 'Fuera del Presupuesto Anual Proyectado. Clic para aprobar.'}
                            className={`text-[9px] font-extrabold rounded-full px-2 py-0.5 border transition whitespace-nowrap ${
                              p.presupuesto?.aprobado
                                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                                : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600'
                            }`}
                          >
                            {p.presupuesto?.aprobado ? '✓ Aprob. Ppto' : 'Aprobar Ppto'}
                          </button>
                        </div>
                      </td>
                    )}
                    {!modoSelector && (
                      <td className="px-3 py-1.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            p.estado === 'Completado' ? 'bg-emerald-100 text-emerald-800' :
                            p.estado === 'En Proceso' ? 'bg-sky-100 text-sky-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {p.estado}
                          </span>
                          <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200" title={`${pctGasto}% de avance`}>
                            <div
                              className={`h-full transition-all ${
                                pctGasto >= 100 ? 'bg-emerald-500' : pctGasto > 50 ? 'bg-sky-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${pctGasto}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col gap-0.5 min-w-[170px]">
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-slate-400 font-semibold">Estimado</span>
                          <span className="font-bold text-slate-600">{formatoMonedaCLP(p.valorAprox)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-indigo-400 font-semibold">Adjudicado</span>
                          {p.montoAdjudicado ? (
                            <span className="font-extrabold text-indigo-700">{formatoMonedaCLP(p.montoAdjudicado)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] pt-0.5 border-t border-slate-100">
                          <span className="text-emerald-600 font-bold">Gasto Efectivo</span>
                          {p.gastoEfectivo ? (
                            <span className="font-extrabold text-emerald-700">{formatoMonedaCLP(p.gastoEfectivo)} <span className="text-[9px] font-bold text-slate-400">({pctGasto}%)</span></span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center sticky right-0 z-10 bg-white border-l border-slate-200" onClick={e => e.stopPropagation()}>
                      {!modoSelector && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFicha?.(p);
                          }}
                          className="p-1.5 text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition border border-sky-200 shadow-sm"
                          title="Ver Ficha del Proyecto (editar, generar Bases, eliminar)"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {modoSelector && (
                        <span className="text-indigo-600 font-bold text-xs">Seleccionar →</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL PROFESIONAL DE PROYECTO (NUEVO / EDITAR) */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col border border-slate-200">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b pb-4 shrink-0">
              <div>
                <span className="text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-900 px-2.5 py-0.5 rounded">
                  Cartera de Proyectos 2026 • Subdirección de Infraestructura
                </span>
                <h3 className="text-base font-bold text-slate-800 mt-1">
                  {editingId ? `Editar Proyecto: ${form.nombre}` : 'Nuevo Proyecto en Cartera 2026'}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pestañas del Modal (Datos Generales | Planos | Documentos) */}
            <div className="flex items-center gap-2 border-b pb-1 shrink-0 text-xs">
              <button
                type="button"
                onClick={() => setTabActivaModal('datos')}
                className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${
                  tabActivaModal === 'datos'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Datos Generales del Proyecto</span>
              </button>

              <button
                type="button"
                onClick={() => setTabActivaModal('planos')}
                className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${
                  tabActivaModal === 'planos'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>📐 Planos del Proyecto ({(form.documentosAntecedentes || []).filter(d => d.tipo === 'Plano').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setTabActivaModal('documentos')}
                className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 ${
                  tabActivaModal === 'documentos'
                    ? 'bg-indigo-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>📄 Documentos & Bases ({(form.documentosAntecedentes || []).filter(d => d.tipo !== 'Plano').length})</span>
              </button>
            </div>

            {/* Formulario / Secciones */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              
              {/* TAB 1: DATOS GENERALES */}
              {tabActivaModal === 'datos' && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Codificación Oficial */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Centro de Costo (CC) *</label>
                      <select
                        required
                        value={form.codigoCP}
                        onChange={e => setForm(f => ({ ...f, codigoCP: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                      >
                        <option value="">-- Seleccionar Centro de Costo (CP) --</option>
                        {getCentrosCostoList()
                          .filter(c => c.estado !== 'Inactivo' || c.codigoCP === form.codigoCP)
                          .map(c => (
                            <option key={c.codigoCP} value={c.codigoCP}>
                              {c.codigoCP} — {c.nombre}
                            </option>
                          ))}
                      </select>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Centro de costo asignado</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Cód. Proyecto Correlativo</label>
                      <input
                        type="text"
                        disabled
                        value={form.codigoProyecto || 'Se asignará automáticamente al guardar'}
                        className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg outline-none font-bold text-slate-500 cursor-not-allowed"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Identificador correlativo — lo asigna el sistema, no es editable</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">N° Orden Compra (OC)</label>
                      <input
                        type="text"
                        placeholder="Ej: OC-6790"
                        value={form.ordenCompraNumero || form.codigoOC || ''}
                        onChange={e => setForm(f => ({ ...f, ordenCompraNumero: e.target.value.toUpperCase(), codigoOC: e.target.value.toUpperCase() }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-extrabold text-purple-900"
                      />
                      <span className="text-[10px] text-purple-700 font-semibold mt-0.5 block">N° OC de la universidad</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-500 mb-1">Códigos OP / OT</label>
                      <input
                        type="text"
                        disabled
                        value="Asignación Post-Adjudicación"
                        className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 outline-none text-[11px] font-semibold"
                      />
                      <span className="text-[10px] text-amber-700 font-semibold mt-0.5 block">Se generan al adjudicar</span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nombre Oficial del Proyecto *</label>
                    <input
                      type="text"
                      required
                      {...ATRIBUTOS_ORTOGRAFIA_ES}
                      placeholder="Ej: Iluminación y tabiquería interior laboratorio CRC17"
                      value={form.nombre}
                      onChange={e => setForm(f => ({ ...f, nombre: e.target.value.toLocaleUpperCase('es-CL') }))}
                      onBlur={e => setForm(f => ({ ...f, nombre: normalizarNombreProyecto(e.target.value) }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Descripción del Requerimiento Institucional</label>
                    <textarea
                      rows={3}
                      {...ATRIBUTOS_ORTOGRAFIA_ES}
                      placeholder="Detalle los trabajos, recintos intervenidos y justificación de compra..."
                      value={form.descripcion}
                      onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                      onBlur={e => setForm(f => ({ ...f, descripcion: corregirTextoAvanzado(e.target.value) }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    />
                  </div>

                  {/* Ubicación: Campus & Edificio */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                        Campus UCT *
                      </label>
                      <select
                        required
                        value={form.campusSigla}
                        onChange={e => {
                          const sigla = e.target.value;
                          const campInfo = obtenerCampusPorSigla(sigla);
                          const eds = obtenerEdificiosDeCampus(sigla);
                          setForm(f => ({
                            ...f,
                            campusSigla: sigla,
                            campusNombre: campInfo ? campInfo.nombre : '',
                            edificioSigla: eds.length > 0 ? eds[0] : '',
                          }));
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                      >
                        <option value="">-- Seleccionar Campus --</option>
                        {getCampusList().map(c => (
                          <option key={c.sigla} value={c.sigla}>
                            {c.sigla} — {c.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-indigo-600" />
                        Edificio del Campus *
                      </label>
                      <select
                        required
                        value={form.edificioSigla}
                        disabled={!form.campusSigla}
                        onChange={e => setForm(f => ({ ...f, edificioSigla: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium disabled:opacity-50"
                      >
                        {!form.campusSigla ? (
                          <option value="">-- Seleccione un Campus --</option>
                        ) : (
                          obtenerEdificiosDeCampus(form.campusSigla).map(ed => (
                            <option key={ed} value={ed}>
                              Edificio {ed}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      Responsable de Infraestructura UCT *
                    </label>
                    <select
                      required
                      value={form.responsableNombre}
                      onChange={e => {
                        const nombre = e.target.value;
                        const r = RESPONSABLES_INFRAESTRUCTURA.find(resp => resp.nombre === nombre);
                        setForm(f => ({
                          ...f,
                          responsableNombre: nombre,
                          responsableEmail: r ? r.email : f.responsableEmail,
                        }));
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                    >
                      <option value="">-- Seleccionar Responsable --</option>
                      {RESPONSABLES_INFRAESTRUCTURA.map(r => (
                        <option key={r.codigo} value={r.nombre}>
                          {r.nombre} — {r.email} ({r.cargo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Hammer className="w-3.5 h-3.5 text-indigo-600" />
                        Tipo de Obra *
                      </label>
                      <select
                        required
                        value={form.tipoObra}
                        onChange={e => setForm(f => ({ ...f, tipoObra: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                      >
                        <option value="">-- Seleccionar Tipo de Obra --</option>
                        {tiposObraDisponibles.map(t => (
                          <option key={t.id} value={t.nombre}>
                            {t.nombre}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">Define qué plantilla de Bases se pre-carga al generar las bases del proyecto.</p>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <ScrollText className="w-3.5 h-3.5 text-indigo-600" />
                        Rubro del Proyecto
                      </label>
                      <select
                        value={form.rubro}
                        onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                      >
                        <option value="">-- Seleccionar Rubro --</option>
                        {rubrosDisponibles.map(r => (
                          <option key={r.id} value={r.nombre}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                      Política de Garantías del Contrato
                    </label>
                    <select
                      value={form.politicaGarantias || ''}
                      onChange={e => setForm(f => ({ ...f, politicaGarantias: (e.target.value || '') as typeof f.politicaGarantias }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                    >
                      <option value="">-- Sin definir (se usará la sugerencia por monto) --</option>
                      <option value="Sin Garantías">Sin Garantías</option>
                      <option value="Retención sobre Estados de Pago">Retención sobre Estados de Pago</option>
                      <option value="Boletas de Garantía Completas">Boletas de Garantía Completas</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Sugerencia para {formatoMonedaCLP(form.valorAprox || 0)}: <strong className="text-slate-600">{sugerirPoliticaGarantias(form.valorAprox || 0)}</strong>.
                      {' '}No es obligatorio exigir boletas en contratos de bajo monto — esta política ajusta el texto de la sección de Garantías en las Bases.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Presupuesto Estimado (CLP con separador de miles) *
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 text-slate-400 font-bold">$</span>
                        <input
                          type="text"
                          placeholder="15.000.000"
                          value={formatearEnteroConMiles(form.valorAprox)}
                          onChange={e => setForm(f => ({ ...f, valorAprox: desformatearEntero(e.target.value) }))}
                          className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-emerald-700"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-sky-600" /> Estado de la Cartera
                      </label>
                      <select
                        value={form.estado}
                        onChange={e => setForm(f => ({ ...f, estado: e.target.value as ProyectoMaestro['estado'] }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="En Proceso">En Proceso</option>
                        <option value="Completado">Completado</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t">
                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Agregar Proyecto a Cartera 2026'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: PLANOS DEL PROYECTO */}
              {tabActivaModal === 'planos' && (
                <div className="space-y-4">
                  <div className="bg-sky-50 p-4 rounded-xl border border-sky-200 space-y-3">
                    <h4 className="font-bold text-sky-900 text-xs flex items-center gap-2">
                      <FolderPlus className="w-4 h-4 text-sky-600" />
                      <span>Agregar Nuevo Plano al Expediente del Proyecto</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Nombre / Descripción del Plano (ej: Plano Arquitectura Nivel 1)..."
                        value={nuevoDocNombre}
                        onChange={e => setNuevoDocNombre(e.target.value)}
                        className="sm:col-span-2 px-3 py-2 bg-white border border-sky-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setNuevoDocTipo('Plano');
                          handleAgregarAntecedente();
                        }}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-xs transition shadow-sm flex items-center justify-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adjuntar Plano</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-bold text-slate-800 text-xs">Planos Registrados:</h5>
                    {(form.documentosAntecedentes || []).filter(d => d.tipo === 'Plano').length === 0 ? (
                      <p className="text-slate-400 italic text-xs p-4 bg-slate-50 rounded-xl text-center border border-dashed border-slate-300">
                        No hay planos adjuntos aún a este proyecto.
                      </p>
                    ) : (
                      (form.documentosAntecedentes || []).filter(d => d.tipo === 'Plano').map(d => (
                        <div key={d.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="p-2 bg-sky-100 text-sky-700 rounded-lg font-bold text-xs">📐 DWG/PDF</span>
                            <div>
                              <span className="font-bold text-slate-800 block text-xs">{d.nombre}</span>
                              <span className="text-[10px] text-slate-400">{d.archivoNombre} • Carga: {d.fechaCarga}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEliminarAntecedente(d.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: DOCUMENTOS Y BASES */}
              {tabActivaModal === 'documentos' && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="font-bold text-emerald-900 text-xs flex items-center gap-2">
                        <ScrollText className="w-4 h-4 text-emerald-700" />
                        Bases Administrativas y Técnicas
                      </h4>
                      <p className="text-[11px] text-emerald-800 mt-1">
                        {editingId
                          ? 'Se generan solas a partir de una plantilla según el Tipo de Obra del proyecto (pestaña Datos Generales) — no se adjunta un archivo aquí.'
                          : 'Al hacer clic en "Agregar Proyecto a Cartera 2026" (botón abajo) se abrirán automáticamente, ya pre-cargadas según el Tipo de Obra que elijas en "Datos Generales".'}
                      </p>
                    </div>
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          const proyectoActual = proyectos.find(p => p.id === editingId);
                          if (proyectoActual) setBasesProyecto(proyectoActual);
                        }}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0"
                      >
                        <ScrollText className="w-3.5 h-3.5" /> Abrir Bases del Proyecto
                      </button>
                    )}
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 space-y-3">
                    <h4 className="font-bold text-indigo-900 text-xs flex items-center gap-2">
                      <FolderPlus className="w-4 h-4 text-indigo-600" />
                      <span>Agregar Otro Documento o Antecedente</span>
                    </h4>
                    <p className="text-[10px] text-indigo-700 -mt-1.5">Solo para registrar nombres de antecedentes de respaldo (planos externos, informes, anexos) — no reemplaza las Bases de arriba.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        placeholder="Nombre / Descripción (ej: EETT Especificaciones Técnicas)..."
                        value={nuevoDocNombre}
                        onChange={e => setNuevoDocNombre(e.target.value)}
                        className="sm:col-span-2 px-3 py-2 bg-white border border-indigo-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <select
                        value={nuevoDocTipo}
                        onChange={e => setNuevoDocTipo(e.target.value as any)}
                        className="px-2 py-2 bg-white border border-indigo-300 rounded-lg text-xs font-semibold"
                      >
                        <option value="Bases">Bases Técnicas</option>
                        <option value="EETT">EETT / Memoria</option>
                        <option value="Documento">Documento General</option>
                        <option value="Anexo">Anexo Administrativo</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAgregarAntecedente}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition shadow-sm flex items-center justify-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adjuntar</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-bold text-slate-800 text-xs">Documentos Registrados:</h5>
                    {(form.documentosAntecedentes || []).filter(d => d.tipo !== 'Plano').length === 0 ? (
                      <p className="text-slate-400 italic text-xs p-4 bg-slate-50 rounded-xl text-center border border-dashed border-slate-300">
                        No hay documentos técnicos adjuntos aún a este proyecto.
                      </p>
                    ) : (
                      (form.documentosAntecedentes || []).filter(d => d.tipo !== 'Plano').map(d => (
                        <div key={d.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="p-2 bg-indigo-100 text-indigo-800 rounded-lg font-bold text-xs">📄 {d.tipo}</span>
                            <div>
                              <span className="font-bold text-slate-800 block text-xs">{d.nombre}</span>
                              <span className="text-[10px] text-slate-400">{d.archivoNombre} • Carga: {d.fechaCarga}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEliminarAntecedente(d.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* Modal Visualizador del PDF de la Orden de Compra (OC) */}
      {verPDFOCProyecto && (
        <VisualizadorOCModal
          proyecto={verPDFOCProyecto}
          onClose={() => setVerPDFOCProyecto(null)}
        />
      )}

      {repararAbierto && (
        <RepararCarteraModal onClose={() => setRepararAbierto(false)} />
      )}

      {basesProyecto && (
        <BasesLicitacionModal proyecto={basesProyecto} onClose={() => setBasesProyecto(null)} />
      )}

      {contratoProyecto && (
        <ContratoAdjudicacionModal proyecto={contratoProyecto} proveedores={proveedores} onClose={() => setContratoProyecto(null)} />
      )}

      {importarExcelAbierto && (
        <ImportarProyectosExcelModal onClose={() => setImportarExcelAbierto(false)} />
      )}
    </div>
  );
};
