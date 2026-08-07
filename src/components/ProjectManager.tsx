import React, { useState } from 'react';
import type { LicitacionProyecto } from '../types';
import { FolderKanban, Plus, Calendar, DollarSign, ArrowRight, Edit3, Trash2, CheckCircle } from 'lucide-react';
import { formatoMonedaCLP } from '../services/evaluationEngine';

interface ProjectManagerProps {
  licitaciones: LicitacionProyecto[];
  licitacionSeleccionadaId: string | null;
  onSelectLicitacion: (id: string) => void;
  onAddLicitacion: (lic: Omit<LicitacionProyecto, 'id'>) => void;
  onUpdateLicitacion: (id: string, lic: Partial<LicitacionProyecto>) => void;
  onDeleteLicitacion: (id: string) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({
  licitaciones,
  licitacionSeleccionadaId,
  onSelectLicitacion,
  onAddLicitacion,
  onUpdateLicitacion,
  onDeleteLicitacion,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [codigoCP, setCodigoCP] = useState('409-');
  const [codigoOP, setCodigoOP] = useState('OP-');
  const [codigoOT, setCodigoOT] = useState('OT-');
  const [codigoProyecto, setCodigoProyecto] = useState('2X_0');
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [montoEstimado, setMontoEstimado] = useState<number>(5000000);
  const [fechaEvaluacion, setFechaEvaluacion] = useState(new Date().toISOString().split('T')[0]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setCodigoCP('409-');
    setCodigoOP('OP-');
    setCodigoOT('OT-');
    setCodigoProyecto('2X_0');
    setNombreProyecto('');
    setDescripcion('');
    setMontoEstimado(5000000);
    setFechaEvaluacion(new Date().toISOString().split('T')[0]);
    setShowModal(true);
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
    setFechaEvaluacion(lic.fechaEvaluacion);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProyecto) return;

    if (editingId) {
      onUpdateLicitacion(editingId, {
        codigoCP,
        codigoOP,
        codigoOT,
        codigoProyecto,
        nombreProyecto,
        descripcion,
        montoEstimado,
        fechaEvaluacion,
      });
    } else {
      onAddLicitacion({
        codigoCP,
        codigoOP,
        codigoOT,
        codigoProyecto,
        nombreProyecto,
        descripcion,
        montoEstimado,
        fechaEvaluacion,
        estado: 'En Evaluacion',
      });
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-sky-600" />
            <span>Gestión de Proyectos & Licitaciones de Obra</span>
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

      {/* Grid of Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {licitaciones.map(lic => {
          const isSelected = lic.id === licitacionSeleccionadaId;
          const requiereActa = lic.montoEstimado > 800001;
          const requiereVicerrector = lic.montoEstimado > 500001;

          return (
            <div
              key={lic.id}
              onClick={() => onSelectLicitacion(lic.id)}
              className={`cursor-pointer bg-white rounded-2xl p-6 shadow-sm border transition flex flex-col justify-between relative overflow-hidden ${
                isSelected
                  ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/20'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
              }`}
            >
              {isSelected && (
                <div className="absolute top-0 right-0 bg-sky-600 text-white text-[10px] font-extrabold uppercase px-3 py-1 rounded-bl-xl flex items-center gap-1 shadow-sm">
                  <CheckCircle className="w-3 h-3" />
                  <span>Proyecto Seleccionado Activo</span>
                </div>
              )}

              <div>
                {/* Codes badges */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-md">
                    CP: {lic.codigoCP}
                  </span>
                  <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    OP: {lic.codigoOP}
                  </span>
                  <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    OT: {lic.codigoOT}
                  </span>
                  <span className="text-[11px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                    Cod: {lic.codigoProyecto}
                  </span>
                </div>

                {/* Title and Description */}
                <h3 className="text-base font-bold text-slate-800 line-clamp-2 leading-snug">
                  {lic.nombreProyecto}
                </h3>
                <p className="text-xs text-slate-500 mt-2 line-clamp-2">{lic.descripcion}</p>
              </div>

              {/* Specs & Info */}
              <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="text-[10px] text-slate-400 block">Monto Estimado</span>
                      <span className="font-bold text-slate-800">{formatoMonedaCLP(lic.montoEstimado)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Calendar className="w-4 h-4 text-sky-600" />
                    <div>
                      <span className="text-[10px] text-slate-400 block">Fecha Evaluación</span>
                      <span className="font-semibold text-slate-700">{lic.fechaEvaluacion}</span>
                    </div>
                  </div>
                </div>

                {/* Rules indicators */}
                <div className="flex items-center gap-2 pt-1">
                  {requiereActa && (
                    <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-medium">
                      Acta Adjudicación Required (&gt;800k)
                    </span>
                  )}
                  {requiereVicerrector && (
                    <span className="text-[10px] bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded font-medium">
                      Firma VR-AAE Required (&gt;5M)
                    </span>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleOpenEdit(lic);
                      }}
                      className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-slate-100 rounded-lg transition"
                      title="Editar licitación"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteLicitacion(lic.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition"
                      title="Eliminar licitación"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <span className="text-xs font-bold text-sky-600 flex items-center gap-1">
                    <span>Evaluar y Cargar Cotizaciones</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add / Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-3">
              {editingId ? 'Editar Licitación' : 'Crear Nueva Licitación'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código CP *</label>
                  <input
                    type="text"
                    required
                    placeholder="409-XXX"
                    value={codigoCP}
                    onChange={e => setCodigoCP(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código OP *</label>
                  <input
                    type="text"
                    required
                    placeholder="OP-XXXX"
                    value={codigoOP}
                    onChange={e => setCodigoOP(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código OT *</label>
                  <input
                    type="text"
                    required
                    placeholder="OT-XXXX"
                    value={codigoOT}
                    onChange={e => setCodigoOT(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cod. Proyecto *</label>
                  <input
                    type="text"
                    required
                    placeholder="2X_0XX"
                    value={codigoProyecto}
                    onChange={e => setCodigoProyecto(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Proyecto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Remodelación Laboratorio de Redes Campus San Juan Pablo II"
                  value={nombreProyecto}
                  onChange={e => setNombreProyecto(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción del Requerimiento</label>
                <textarea
                  rows={3}
                  placeholder="Detalles de la obra, ubicación y alcances..."
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto Estimado / Presupuesto (CLP)</label>
                  <input
                    type="number"
                    value={montoEstimado}
                    onChange={e => setMontoEstimado(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha de Evaluación</label>
                  <input
                    type="date"
                    value={fechaEvaluacion}
                    onChange={e => setFechaEvaluacion(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  {editingId ? 'Guardar Cambios' : 'Crear Licitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
