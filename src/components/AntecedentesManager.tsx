import React, { useState } from 'react';
import {
  FileText, Upload, CheckCircle2, AlertCircle, Trash2, X,
  ShieldCheck, FileCheck
} from 'lucide-react';
import type { LicitacionProyecto } from '../types';
import { updateLicitacion } from '../services/firestoreService';

interface AntecedentesManagerProps {
  licitacion: LicitacionProyecto;
  onClose: () => void;
  onChecklistComplete?: () => void;
}

export const AntecedentesManager: React.FC<AntecedentesManagerProps> = ({
  licitacion,
  onClose,
  onChecklistComplete,
}) => {
  const [antecedentes, setAntecedentes] = useState(licitacion.antecedentesTecnicos || [
    {
      id: 'doc-1',
      nombre: 'Bases Técnicas de Servicio y Especificaciones',
      tipo: 'Bases Tecnicas' as const,
      archivoNombre: `Bases_Tecnicas_${licitacion.codigoProyecto}.pdf`,
      archivoURL: '#',
      fechaCarga: new Date().toISOString().split('T')[0],
      cargadoPor: licitacion.responsableNombre || 'Subdirección de Infraestructura',
    },
    {
      id: 'doc-2',
      nombre: 'Bases Administrativas y Criterios de Evaluación SGC',
      tipo: 'Bases Administrativas' as const,
      archivoNombre: `Bases_Administrativas_SGC.pdf`,
      archivoURL: '#',
      fechaCarga: new Date().toISOString().split('T')[0],
      cargadoPor: 'Secretaría General UCT',
    },
    {
      id: 'doc-3',
      nombre: 'Plano de Ubicación y Esquema del Edificio',
      tipo: 'Planos' as const,
      archivoNombre: `Plano_Arquitectura_${licitacion.edificioSigla || 'UCT'}.dwg`,
      archivoURL: '#',
      fechaCarga: new Date().toISOString().split('T')[0],
      cargadoPor: licitacion.responsableNombre || 'ITO Infraestructura',
    },
  ]);

  const [checklist, setChecklist] = useState(licitacion.checklistAntecedentes || {
    basesTecnicasOk: true,
    basesAdministrativasOk: true,
    planosOk: true,
    calendarioDefinidoOk: Boolean(licitacion.fechaVisitaTerreno && licitacion.fechaRecepcionConsultas && licitacion.fechaEvaluacion),
    revisadoSecretariaGeneralOk: true,
  });

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<'Bases Tecnicas' | 'Bases Administrativas' | 'Planos' | 'Anexo' | 'Presupuesto'>('Bases Tecnicas');
  const [isSaving, setIsSaving] = useState(false);

  const todoCompleto =
    checklist.basesTecnicasOk &&
    checklist.basesAdministrativasOk &&
    checklist.planosOk &&
    checklist.calendarioDefinidoOk &&
    checklist.revisadoSecretariaGeneralOk;

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre) return;

    const newDoc = {
      id: 'doc-' + Date.now(),
      nombre: nuevoNombre,
      tipo: nuevoTipo,
      archivoNombre: `${nuevoNombre.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      archivoURL: '#',
      fechaCarga: new Date().toISOString().split('T')[0],
      cargadoPor: licitacion.responsableNombre || 'Subdirección Infraestructura',
    };

    setAntecedentes(prev => [...prev, newDoc]);
    setNuevoNombre('');
  };

  const handleDeleteDoc = (id: string) => {
    setAntecedentes(prev => prev.filter(d => d.id !== id));
  };

  const handleToggleChecklist = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateLicitacion(licitacion.id, {
        antecedentesTecnicos: antecedentes,
        checklistAntecedentes: checklist,
      });
      alert('¡Antecedentes técnicos y checklist de verificación guardados con éxito!');
      if (todoCompleto) onChecklistComplete?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded">
                SGC Paso 3 · Antecedentes Técnicos
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Cód: {licitacion.codigoProyecto}</span>
            </div>
            <h3 className="text-base font-bold text-slate-800 mt-1">
              Antecedentes Técnicos y Checklist Previos a la Invitación
            </h3>
            <p className="text-xs text-slate-500">{licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-1">

          {/* Banner de Validación Checklist */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
            todoCompleto
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            {todoCompleto ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="font-bold">
                {todoCompleto
                  ? '✓ Todos los Antecedentes Técnicos Habilitados para Enviar Invitaciones'
                  : '⚠️ Checklist Incompleto: Debe validar todos los antecedentes antes de enviar invitaciones'}
              </h4>
              <p className="mt-1 text-[11px] opacity-90">
                {todoCompleto
                  ? 'Las bases administrativas, técnicas, planos y calendario están verificados. El sistema autoriza el envío de invitaciones a los proveedores.'
                  : 'Verifique los puntos obligatorios en la lista de chequeo para desbloquear el envío masivo de invitaciones a contratistas.'}
              </p>
            </div>
          </div>

          {/* Checklist de Verificación Previos */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Checklist de Validación Pre-Invitación (Requisito SGC)
            </h4>
            <div className="space-y-2 text-xs">
              {[
                { key: 'basesTecnicasOk', label: '1. Bases Técnicas de Servicio y Alcances de Obra cargadas' },
                { key: 'basesAdministrativasOk', label: '2. Bases Administrativas y Criterios de Evaluación integrados' },
                { key: 'planosOk', label: '3. Planos, Esquemas o Croquis del Edificio adjuntos' },
                { key: 'calendarioDefinidoOk', label: '4. Fechas clave (Visita Terreno, Consultas y Entrega) definidas' },
                { key: 'revisadoSecretariaGeneralOk', label: '5. Pertinencia Legal revisada por Secretaría General / Coordinación' },
              ].map(item => {
                const isChecked = checklist[item.key as keyof typeof checklist];
                return (
                  <label
                    key={item.key}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition cursor-pointer ${
                      isChecked
                        ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleChecklist(item.key as keyof typeof checklist)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Repositorio de Documentos / Antecedentes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <FileText className="w-4 h-4 text-indigo-600" />
                Documentación y Antecedentes Adjuntos ({antecedentes.length})
              </h4>
            </div>

            <div className="space-y-2">
              {antecedentes.map(doc => (
                <div key={doc.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 transition">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100">
                      <FileCheck className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <h5 className="font-semibold text-xs text-slate-800">{doc.nombre}</h5>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-700">{doc.tipo}</span>
                        <span>·</span>
                        <span>{doc.archivoNombre}</span>
                        <span>·</span>
                        <span>Cargado por: {doc.cargadoPor}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
                      Disponible
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Formulario de Carga de Nuevo Antecedente */}
          <form onSubmit={handleAddDocument} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-indigo-600" />
              Cargar Nuevo Antecedente Técnico / Plano
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  required
                  placeholder="Nombre del antecedente (ej: Especificaciones Eléctricas)"
                  value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <select
                  value={nuevoTipo}
                  onChange={e => setNuevoTipo(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Bases Tecnicas">Bases Técnicas</option>
                  <option value="Bases Administrativas">Bases Administrativas</option>
                  <option value="Planos">Planos / Arquitectura</option>
                  <option value="Anexo">Anexo de Servicio</option>
                  <option value="Presupuesto">Presupuesto Referencial</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold text-xs transition flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Adjuntar Documento a la Licitación</span>
            </button>
          </form>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t shrink-0 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition disabled:opacity-50 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSaving ? 'Guardando...' : 'Guardar y Validar Antecedentes'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
