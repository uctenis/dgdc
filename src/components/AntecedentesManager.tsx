import React, { useMemo, useState } from 'react';
import {
  FileText, Upload, CheckCircle2, AlertCircle, Trash2, X,
  ShieldCheck, FileCheck, Loader2, ExternalLink
} from 'lucide-react';
import type { LicitacionProyecto } from '../types';
import { updateLicitacion } from '../services/firestoreService';
import { uploadLicitacionDocument } from '../services/storageService';

interface AntecedentesManagerProps {
  licitacion: LicitacionProyecto;
  onClose: () => void;
  onChecklistComplete?: () => void;
}

type TipoAntecedente = 'Bases Tecnicas' | 'Bases Administrativas' | 'Planos' | 'Anexo' | 'Presupuesto';

function tieneDocumentoReal(antecedentes: LicitacionProyecto['antecedentesTecnicos'], tipo: TipoAntecedente): boolean {
  return Boolean(antecedentes?.some(d => d.tipo === tipo && d.archivoURL && d.archivoURL !== '#'));
}

export const AntecedentesManager: React.FC<AntecedentesManagerProps> = ({
  licitacion,
  onClose,
  onChecklistComplete,
}) => {
  const [antecedentes, setAntecedentes] = useState(licitacion.antecedentesTecnicos || []);

  // Los 3 primeros ítems del checklist se derivan de documentos reales adjuntos — no son
  // togglables a mano, así se evita que el sistema marque "verificado" sin un archivo real.
  const basesTecnicasOk = useMemo(() => tieneDocumentoReal(antecedentes, 'Bases Tecnicas'), [antecedentes]);
  const basesAdministrativasOk = useMemo(() => tieneDocumentoReal(antecedentes, 'Bases Administrativas'), [antecedentes]);
  const planosOk = useMemo(() => tieneDocumentoReal(antecedentes, 'Planos'), [antecedentes]);
  const calendarioDefinidoOk = Boolean(
    licitacion.fechaVisitaTerreno && licitacion.fechaRecepcionConsultas && licitacion.fechaRespuestaConsultas && licitacion.fechaEvaluacion
  );

  // Único ítem que sigue siendo un juicio humano (revisión legal) — nace SIN marcar.
  const [revisadoSecretariaGeneralOk, setRevisadoSecretariaGeneralOk] = useState(
    licitacion.checklistAntecedentes?.revisadoSecretariaGeneralOk === true
  );

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<TipoAntecedente>('Bases Tecnicas');
  const [nuevoArchivo, setNuevoArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');

  const todoCompleto = basesTecnicasOk && basesAdministrativasOk && planosOk && calendarioDefinidoOk && revisadoSecretariaGeneralOk;

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoArchivo) return;
    setErrorSubida('');
    setSubiendo(true);
    try {
      const archivoURL = await uploadLicitacionDocument(licitacion.id, 'antecedentes', nuevoArchivo);
      const newDoc = {
        id: 'doc-' + Date.now(),
        nombre: nuevoNombre.trim() || nuevoArchivo.name,
        tipo: nuevoTipo,
        archivoNombre: nuevoArchivo.name,
        archivoURL,
        fechaCarga: new Date().toISOString().split('T')[0],
        cargadoPor: licitacion.responsableNombre || 'Subdirección Infraestructura',
      };
      setAntecedentes(prev => [...prev, newDoc]);
      setNuevoNombre('');
      setNuevoArchivo(null);
      const fileInput = document.getElementById('antecedente-file-input') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
    } catch (err) {
      console.error('Error subiendo antecedente:', err);
      setErrorSubida('No se pudo subir el archivo. Intente nuevamente.');
    } finally {
      setSubiendo(false);
    }
  };

  const handleDeleteDoc = (id: string) => {
    setAntecedentes(prev => prev.filter(d => d.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorGuardado('');
    try {
      await updateLicitacion(licitacion.id, {
        antecedentesTecnicos: antecedentes,
        checklistAntecedentes: {
          basesTecnicasOk,
          basesAdministrativasOk,
          planosOk,
          calendarioDefinidoOk,
          revisadoSecretariaGeneralOk,
        },
      });
      alert('¡Antecedentes técnicos y checklist de verificación guardados con éxito!');
      if (todoCompleto) onChecklistComplete?.();
      onClose();
    } catch (err) {
      console.error('Error guardando antecedentes:', err);
      setErrorGuardado('No se pudieron guardar los antecedentes. Intente nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const checklistItems: { key: string; label: string; checked: boolean; auto: boolean }[] = [
    { key: 'basesTecnicasOk', label: '1. Bases Técnicas de Servicio y Alcances de Obra cargadas', checked: basesTecnicasOk, auto: true },
    { key: 'basesAdministrativasOk', label: '2. Bases Administrativas y Criterios de Evaluación integrados', checked: basesAdministrativasOk, auto: true },
    { key: 'planosOk', label: '3. Planos, Esquemas o Croquis del Edificio adjuntos', checked: planosOk, auto: true },
    { key: 'calendarioDefinidoOk', label: '4. Fechas clave (Visita Terreno, Consultas y Entrega) definidas', checked: calendarioDefinidoOk, auto: true },
    { key: 'revisadoSecretariaGeneralOk', label: '5. Pertinencia Legal revisada por Secretaría General / Coordinación', checked: revisadoSecretariaGeneralOk, auto: false },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col border border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded">
                Paso 3 · Antecedentes Técnicos
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
                  : 'Los 3 primeros puntos se validan automáticamente al adjuntar el archivo correspondiente. El envío de invitaciones y el ingreso de ofertas quedarán bloqueados hasta completar los 5 puntos.'}
              </p>
            </div>
          </div>

          {/* Checklist de Verificación Previos */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Checklist de Validación Pre-Invitación
            </h4>
            <div className="space-y-2 text-xs">
              {checklistItems.map(item => (
                <label
                  key={item.key}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition ${item.auto ? 'cursor-default' : 'cursor-pointer'} ${
                    item.checked
                      ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={item.auto}
                    onChange={item.auto ? undefined : () => setRevisadoSecretariaGeneralOk(v => !v)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-70"
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.auto && (
                    <span className="text-[9px] font-bold uppercase text-slate-400 shrink-0">
                      {item.checked ? 'Verificado por archivo' : 'Falta archivo'}
                    </span>
                  )}
                </label>
              ))}
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

            {antecedentes.length === 0 && (
              <p className="text-[11px] text-slate-400 italic">Aún no hay documentos reales adjuntos a esta licitación.</p>
            )}

            <div className="space-y-2">
              {antecedentes.map(doc => (
                <div key={doc.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100 shrink-0">
                      <FileCheck className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <h5 className="font-semibold text-xs text-slate-800 truncate">{doc.nombre}</h5>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-700">{doc.tipo}</span>
                        <span>·</span>
                        <span className="truncate max-w-[160px]">{doc.archivoNombre}</span>
                        <span>·</span>
                        <span>Cargado por: {doc.cargadoPor}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {doc.archivoURL && doc.archivoURL !== '#' ? (
                      <a
                        href={doc.archivoURL}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded font-bold border border-sky-200 hover:bg-sky-100"
                      >
                        <ExternalLink className="w-3 h-3" /> Ver
                      </a>
                    ) : (
                      <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded font-bold border border-red-200">
                        Sin archivo
                      </span>
                    )}
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
                  placeholder="Nombre del antecedente (opcional, ej: Especificaciones Eléctricas)"
                  value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <select
                  value={nuevoTipo}
                  onChange={e => setNuevoTipo(e.target.value as TipoAntecedente)}
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
            <input
              id="antecedente-file-input"
              type="file"
              required
              onChange={e => setNuevoArchivo(e.target.files?.[0] || null)}
              className="w-full text-[11px]"
            />
            {errorSubida && <p className="text-[11px] text-red-700 font-semibold">{errorSubida}</p>}
            <button
              type="submit"
              disabled={subiendo || !nuevoArchivo}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{subiendo ? 'Subiendo…' : 'Adjuntar Documento a la Licitación'}</span>
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
          <div className="flex items-center gap-3">
            {errorGuardado && <span className="text-[11px] text-red-700 font-semibold">{errorGuardado}</span>}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{isSaving ? 'Guardando...' : 'Guardar y Validar Antecedentes'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
