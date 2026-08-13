import React, { useState, useEffect } from 'react';
import {
  BookOpen, Plus, X, DollarSign, MapPin, Building, User,
  FileText, Paperclip, FolderPlus, Trash2
} from 'lucide-react';
import {
  addProyectoMaestro,
  updateProyectoMaestro
} from '../services/firestoreService';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';
import { corregirOrtografiaEspanol, normalizarNombreProyecto, ATRIBUTOS_ORTOGRAFIA_ES } from '../utils/spellCorrector';
import { CAMPUS_UCT, obtenerEdificiosDeCampus, obtenerCampusPorSigla } from '../data/campusData';
import { RESPONSABLES_INFRAESTRUCTURA } from '../data/responsablesData';
import { getCentrosCostoList } from '../data/centrosCostoData';
import type { ProyectoMaestro } from '../types';

export const EMPTY_FORM = {
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
  montoAdjudicado: 0,
  gastoEfectivo: 0,
  prioridad: 'Media' as ProyectoMaestro['prioridad'],
  fechaInicio: '',
  fechaTermino: '',
  documentosAntecedentes: [] as {
    id: string;
    nombre: string;
    tipo: 'Plano' | 'Documento' | 'Bases' | 'EETT' | 'Anexo';
    archivoNombre?: string;
    fechaCarga: string;
  }[],
};

interface ProyectoMaestroFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
  initialData: typeof EMPTY_FORM;
  onSaveSuccess?: () => void;
}

export const ProyectoMaestroFormModal: React.FC<ProyectoMaestroFormModalProps> = ({
  isOpen,
  onClose,
  editingId,
  initialData,
  onSaveSuccess,
}) => {
  const [form, setForm] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [tabActivaModal, setTabActivaModal] = useState<'datos' | 'planos' | 'documentos'>('datos');

  // Estado temporal de nuevo antecedente
  const [nuevoDocNombre, setNuevoDocNombre] = useState('');
  const [nuevoDocTipo, setNuevoDocTipo] = useState<'Plano' | 'Documento' | 'Bases' | 'EETT' | 'Anexo'>('Plano');
  const [nuevoDocArchivoNombre, setNuevoDocArchivoNombre] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm(initialData);
      setTabActivaModal('datos');
      setNuevoDocNombre('');
      setNuevoDocArchivoNombre('');
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

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
          montoAdjudicado: form.montoAdjudicado,
          gastoEfectivo: form.gastoEfectivo,
          prioridad: form.prioridad,
          fechaInicio: form.fechaInicio,
          fechaTermino: form.fechaTermino,
          documentosAntecedentes: form.documentosAntecedentes,
        });
      } else {
        await addProyectoMaestro({
          codigoCP: form.codigoCP,
          codigoOP: '',
          codigoOT: '',
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
          montoAdjudicado: form.montoAdjudicado,
          gastoEfectivo: form.gastoEfectivo,
          prioridad: form.prioridad,
          fechaInicio: form.fechaInicio,
          fechaTermino: form.fechaTermino,
          documentosAntecedentes: form.documentosAntecedentes,
        });
      }

      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Error guardando proyecto:', err);
      alert('Error al guardar el proyecto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col border border-slate-200">
        
        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-900 px-2.5 py-0.5 rounded">
              Cartera de Proyectos 2026 • Subdirección de Infraestructura
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1">
              {editingId ? `Editar Proyecto: ${form.nombre}` : 'Nuevo Proyecto en Cartera 2026'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

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

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {tabActivaModal === 'datos' && (
            <form id="proyecto-form" onSubmit={handleSubmit} className="space-y-4">
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
                    disabled
                    value={editingId ? form.codigoProyecto : "Generado autom. (YYYY_NNN)"}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 outline-none text-[11px] font-semibold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Identificador ID único</span>
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
                          {ed}
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1 text-[11px]">
                    <DollarSign className="w-3.5 h-3.5 text-slate-500" /> Presupuesto Estimado
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold text-sm">$</span>
                    <input
                      type="text"
                      required
                      placeholder="15.000.000"
                      value={formatearEnteroConMiles(form.valorAprox)}
                      onChange={e => setForm(f => ({ ...f, valorAprox: desformatearEntero(e.target.value) }))}
                      className="w-full pl-6 pr-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-600 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1 text-[11px]">
                    <DollarSign className="w-3.5 h-3.5 text-indigo-600" /> Monto Adjudicado
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold text-sm">$</span>
                    <input
                      type="text"
                      disabled
                      title="Se obtiene automáticamente al adjudicar una Licitación"
                      value={formatearEnteroConMiles(form.montoAdjudicado || 0)}
                      className="w-full pl-6 pr-2 py-2 bg-indigo-50/50 border border-indigo-100 rounded-lg outline-none font-extrabold text-indigo-400 text-sm cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1 text-[11px]">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Gasto Efectivo
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold text-sm">$</span>
                    <input
                      type="text"
                      disabled
                      title="El gasto se actualiza automáticamente con los pagos"
                      value={formatearEnteroConMiles(form.gastoEfectivo || 0)}
                      className="w-full pl-6 pr-2 py-2 bg-emerald-50/50 border border-emerald-100 rounded-lg outline-none font-extrabold text-emerald-400 text-sm cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Estado Cartera</label>
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
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Prioridad</label>
                  <select
                    value={form.prioridad}
                    onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as ProyectoMaestro['prioridad'] }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                  >
                    <option value="Alta">🔴 Alta</option>
                    <option value="Media">🟡 Media</option>
                    <option value="Baja">🟢 Baja</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Fecha Inicio</label>
                  <input
                    type="date"
                    value={form.fechaInicio}
                    onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Fecha Término</label>
                  <input
                    type="date"
                    value={form.fechaTermino}
                    onChange={e => setForm(f => ({ ...f, fechaTermino: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                  />
                </div>
              </div>

            </form>
          )}

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

        <div className="flex justify-end gap-3 pt-3 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
          <button
            type="submit"
            form="proyecto-form"
            disabled={saving || (tabActivaModal !== 'datos')}
            className={`px-5 py-2 text-white rounded-lg font-semibold shadow-sm transition ${saving || (tabActivaModal !== 'datos') ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {saving ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Agregar Proyecto a Cartera 2026'}
          </button>
        </div>

      </div>
    </div>
  );
};
