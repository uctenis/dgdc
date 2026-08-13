import React, { useEffect, useState } from 'react';
import {
  BookOpen, Plus, Edit3, Trash2, Search,
  X, DollarSign, Calendar, MapPin, Building, User,
  FileText, Paperclip, FolderPlus
} from 'lucide-react';
import {
  subscribeToProyectos,
  addProyectoMaestro,
  updateProyectoMaestro,
  deleteProyectoMaestro,
} from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';
import { corregirOrtografiaEspanol, normalizarNombreProyecto, ATRIBUTOS_ORTOGRAFIA_ES } from '../utils/spellCorrector';
import { CAMPUS_UCT, obtenerEdificiosDeCampus, obtenerCampusPorSigla } from '../data/campusData';
import { RESPONSABLES_INFRAESTRUCTURA } from '../data/responsablesData';
import { getCentrosCostoList } from '../data/centrosCostoData';
import type { ProyectoMaestro } from '../types';

interface ProyectosMaestrosProps {
  onSelectProyecto?: (p: ProyectoMaestro) => void;
  onOpenFicha?: (p: ProyectoMaestro) => void;
  modoSelector?: boolean;
}

const EMPTY_FORM = {
  codigoCP: '409-1722',
  codigoOP: '',
  codigoOT: '',
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
}) => {
  const [proyectos, setProyectos] = useState<ProyectoMaestro[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroCampus, setFiltroCampus] = useState('Todos');
  const [filtroResponsable, setFiltroResponsable] = useState('Todos');
  const [showModal, setShowModal] = useState(false);
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

  const openAdd = () => {
    setEditingId(null);
    const nextNum = proyectos.length + 1;
    setForm({
      ...EMPTY_FORM,
      codigoProyecto: `2026_${String(nextNum).padStart(3, '0')}`,
    });
    setTabActivaModal('datos');
    setShowModal(true);
  };

  const openEdit = (p: ProyectoMaestro) => {
    setEditingId(p.id);
    setForm({
      codigoCP: p.codigoCP || '409-',
      codigoOP: p.codigoOP || '',
      codigoOT: p.codigoOT || '',
      codigoProyecto: p.codigoProyecto || '',
      nombre: p.nombre || '',
      descripcion: p.descripcion || '',
      valorAprox: p.valorAprox || 0,
      estado: p.estado || 'Pendiente',
      fechaCreacion: p.fechaCreacion || new Date().toISOString(),
      campusSigla: p.campusSigla || '',
      edificioSigla: p.edificioSigla || '',
      uso: p.uso || '',
      tipoObra: p.tipoObra || '',
      responsableNombre: p.responsableNombre || '',
      responsableEmail: p.responsableEmail || '',
      documentosAntecedentes: p.documentosAntecedentes || [],
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

    setSaving(true);
    try {
      if (editingId) {
        await updateProyectoMaestro(editingId, {
          codigoCP: form.codigoCP,
          codigoProyecto: form.codigoProyecto,
          nombre: normalizarNombreProyecto(form.nombre),
          descripcion: form.descripcion,
          valorAprox: form.valorAprox,
          estado: form.estado,
          campusSigla: form.campusSigla,
          campusNombre: form.campusSigla ? obtenerCampusPorSigla(form.campusSigla)?.nombre : '',
          edificioSigla: form.edificioSigla,
          uso: form.uso,
          tipoObra: form.tipoObra,
          responsableNombre: form.responsableNombre,
          responsableEmail: form.responsableEmail,
          documentosAntecedentes: form.documentosAntecedentes,
        });
      } else {
        await addProyectoMaestro({
          codigoCP: form.codigoCP,
          codigoOP: '',
          codigoOT: '',
          codigoProyecto: form.codigoProyecto,
          nombre: normalizarNombreProyecto(form.nombre),
          descripcion: form.descripcion,
          valorAprox: form.valorAprox,
          estado: form.estado,
          fechaCreacion: new Date().toISOString(),
          campusSigla: form.campusSigla,
          campusNombre: form.campusSigla ? obtenerCampusPorSigla(form.campusSigla)?.nombre : '',
          edificioSigla: form.edificioSigla,
          uso: form.uso,
          tipoObra: form.tipoObra,
          responsableNombre: form.responsableNombre,
          responsableEmail: form.responsableEmail,
          documentosAntecedentes: form.documentosAntecedentes,
        });
      }

      setShowModal(false);
    } catch (err) {
      console.error('Error guardando proyecto:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: ProyectoMaestro) => {
    if (!confirm(`¿Eliminar el proyecto "${p.nombre}" de la Cartera de Proyectos 2026?`)) return;
    await deleteProyectoMaestro(p.id);
  };

  const filtered = proyectos.filter(p => {
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      p.nombre.toLowerCase().includes(q) ||
      p.codigoCP.toLowerCase().includes(q) ||
      p.codigoProyecto.toLowerCase().includes(q) ||
      (p.responsableNombre && p.responsableNombre.toLowerCase().includes(q));

    const matchCampus = filtroCampus === 'Todos' || p.campusSigla === filtroCampus;
    const matchResponsable = filtroResponsable === 'Todos' || p.responsableNombre === filtroResponsable;

    return matchSearch && matchCampus && matchResponsable;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            Cartera de Proyectos 2026 (Presupuesto Anual)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Gestión oficial de la cartera de iniciativas 2026, centros de costos (CC) y expedientes técnicos de obras.
          </p>
        </div>
        {!modoSelector && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm transition text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Proyecto Cartera 2026</span>
          </button>
        )}
      </div>

      {/* Search & Location Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, CP, Cód. Proyecto o responsable..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
        <div>
          <select
            value={filtroCampus}
            onChange={e => setFiltroCampus(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm"
          >
            <option value="Todos">Todos los Campus</option>
            {CAMPUS_UCT.map(c => (
              <option key={c.sigla} value={c.sigla}>
                {c.sigla} — {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={filtroResponsable}
            onChange={e => setFiltroResponsable(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm"
          >
            <option value="Todos">Todos los Responsables</option>
            {RESPONSABLES_INFRAESTRUCTURA.map(r => (
              <option key={r.codigo} value={r.nombre}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando Cartera de Proyectos...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No se encontraron proyectos en la Cartera 2026 con ese criterio de búsqueda.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white border-b border-slate-800">
              <tr>
                <th className="px-3 py-3 text-left font-bold w-12">N°</th>
                <th className="px-3 py-3 text-center font-bold">Cód. Proyecto</th>
                <th className="px-3 py-3 text-center font-bold">Centro Costo (CC)</th>
                <th className="px-3 py-3 text-left font-bold">Proyecto Institucional</th>
                <th className="px-3 py-3 text-left font-bold">Ubicación UCT</th>
                <th className="px-3 py-3 text-center font-bold">Prioridad</th>
                <th className="px-3 py-3 text-right font-bold">Ppto. Aprox.</th>
                <th className="px-3 py-3 text-right font-bold">Ppto. Adjudicado</th>
                <th className="px-3 py-3 text-center font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => {
                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 transition ${(modoSelector || onOpenFicha) ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (modoSelector) {
                        onSelectProyecto?.(p);
                      } else {
                        onOpenFicha?.(p);
                      }
                    }}
                  >
                    <td className="px-3 py-3">
                      <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-mono">
                        {String(p.correlativo).padStart(3, '0')}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded w-fit font-mono inline-block">
                        {p.codigoProyecto || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-bold text-slate-800 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded w-fit font-mono inline-block">
                        {p.codigoCP || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-800 line-clamp-1">{(p.nombre || '').toUpperCase()}</p>
                      {p.responsableNombre && (
                        <p className="text-slate-500 text-[10px] line-clamp-1 mt-0.5">Resp: {p.responsableNombre}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {p.campusSigla ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded w-fit">
                          <MapPin className="w-3 h-3 text-indigo-500" />
                          {p.campusSigla} {p.edificioSigla ? `• Ed. ${p.edificioSigla}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">UCT Central</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                       {p.prioridad === 'Alta' ? (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold text-[10px] inline-block">Alta</span>
                       ) : p.prioridad === 'Media' ? (
                          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold text-[10px] inline-block">Media</span>
                       ) : p.prioridad === 'Baja' ? (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold text-[10px] inline-block">Baja</span>
                       ) : (
                          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold text-[10px] inline-block">Normal</span>
                       )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-medium text-slate-600">{formatoMonedaCLP(p.valorAprox)}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-extrabold text-emerald-700">{p.montoAdjudicado ? formatoMonedaCLP(p.montoAdjudicado) : '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {!modoSelector && (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenFicha?.(p);
                            }}
                            className="px-2 py-1 text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition flex items-center gap-1 border border-sky-200"
                            title="Ver Ficha y Carátula del Proyecto"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Ficha</span>
                          </button>
                          <button onClick={() => openEdit(p)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Editar datos y antecedentes">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(p)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Eliminar proyecto">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
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
                      <label className="block font-semibold text-slate-700 mb-1">Cód. Proyecto Correlativo *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: 2026_099"
                        value={form.codigoProyecto}
                        onChange={e => setForm(f => ({ ...f, codigoProyecto: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-indigo-700"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Identificador correlativo 2026</span>
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
                      onBlur={e => setForm(f => ({ ...f, descripcion: corregirOrtografiaEspanol(e.target.value) }))}
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
                        {CAMPUS_UCT.map(c => (
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
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 space-y-3">
                    <h4 className="font-bold text-indigo-900 text-xs flex items-center gap-2">
                      <FolderPlus className="w-4 h-4 text-indigo-600" />
                      <span>Agregar Nuevo Documento o Bases Técnicas</span>
                    </h4>
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
    </div>
  );
};
