import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, FileText, CheckCircle2, Upload,
  Trash2, Building, User, DollarSign,
  MapPin, ShieldCheck, CheckSquare, Square, Printer, FolderCheck, Edit3, Cloud, AlertCircle, CalendarDays
} from 'lucide-react';
import type { Cotizacion, LicitacionProyecto, ProyectoMaestro, Proveedor } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { normalizarNombreProyecto, corregirOrtografiaEspanol } from '../utils/spellCorrector';
import { rewriteTextWithAI, isAIConfigured } from '../services/aiService';
import { updateLicitacion, updateProyectoMaestro } from '../services/firestoreService';
import { uploadFileToProjectFolder, deleteFileFromDrive } from '../services/driveService';

interface DocumentoProyecto {
  id: string;
  nombre: string;
  tipo: 'Bases' | 'EETT' | 'Planos DWG' | 'Planos PDF' | 'Presupuesto' | 'Carta Gantt' | 'Anexo';
  archivoNombre: string;
  archivoURL?: string;
  driveFileId?: string; // ID del archivo en Google Drive
  driveLink?: string; // URL de visualización en Google Drive
  fechaCarga: string;
  cargadoPor?: string;
  estado?: 'local' | 'almacenado'; // local: solo en memoria, almacenado: guardado en Drive
}

interface ChecklistItem {
  id: string;
  label: string;
  descripcion: string;
  completado: boolean;
}

interface FichaProyectoPageProps {
  proyecto: LicitacionProyecto | ProyectoMaestro;
  onBack: () => void;
  onUpdateSuccess?: () => void;
  hideBack?: boolean;
  proveedorAdjudicado?: Proveedor;
  cotizacionAdjudicada?: Cotizacion;
}

const normalizarTipoDocumento = (tipo: string): DocumentoProyecto['tipo'] => {
  switch (tipo) {
    case 'Bases Tecnicas':
      return 'EETT';
    case 'Bases Administrativas':
    case 'Documento':
      return 'Bases';
    case 'Plano':
    case 'Planos':
      return 'Planos PDF';
    case 'EETT':
    case 'Planos DWG':
    case 'Planos PDF':
    case 'Presupuesto':
    case 'Carta Gantt':
    case 'Anexo':
      return tipo;
    default:
      return 'Anexo';
  }
};

export const FichaProyectoPage: React.FC<FichaProyectoPageProps> = ({
  proyecto,
  onBack,
  onUpdateSuccess,
  hideBack = false,
  proveedorAdjudicado,
  cotizacionAdjudicada,
}) => {
  // Normalización de datos entre LicitacionProyecto y ProyectoMaestro
  const id = proyecto.id;
  const codigoCP = proyecto.codigoCP || '409-1722';
  const codigoOT = 'codigoOT' in proyecto ? proyecto.codigoOT : '';
  const codigoOP = 'codigoOP' in proyecto ? proyecto.codigoOP : '';
  const codigoProyecto = 'codigoProyecto' in proyecto ? proyecto.codigoProyecto : '';
  const nombreProyecto = normalizarNombreProyecto('nombreProyecto' in proyecto ? proyecto.nombreProyecto : (proyecto as ProyectoMaestro).nombre || '');
  const nombreProyectoUpper = nombreProyecto;
  const licitacionProyecto = 'montoEstimado' in proyecto ? proyecto : undefined;
  const montoEstimado = licitacionProyecto?.montoEstimado ?? (proyecto as ProyectoMaestro).valorAprox ?? 0;
  const montoAdjudicado = licitacionProyecto?.montoAdjudicadoTotal;
  const estaAdjudicado = licitacionProyecto?.estado === 'Adjudicado'
    || licitacionProyecto?.estado === 'Cerrado'
    || Boolean(licitacionProyecto?.proveedorAdjudicadoId || licitacionProyecto?.proveedorGanadorId);
  const proveedorAdjudicadoNombre = licitacionProyecto?.proveedorAdjudicadoNombre
    || cotizacionAdjudicada?.proveedorNombre
    || proveedorAdjudicado?.razonSocial;
  const proveedorAdjudicadoRut = licitacionProyecto?.proveedorAdjudicadoRut
    || cotizacionAdjudicada?.proveedorRut
    || proveedorAdjudicado?.rut;
  const plazoAdjudicadoDias = licitacionProyecto?.plazoAdjudicadoDias
    || cotizacionAdjudicada?.plazoDias;
  const tieneMontoAdjudicado = Boolean(
    montoAdjudicado && montoAdjudicado > 0 &&
    (licitacionProyecto?.estado === 'Adjudicado' || Boolean(licitacionProyecto?.proveedorAdjudicadoId)),
  );
  const montoOficial = tieneMontoAdjudicado ? montoAdjudicado! : montoEstimado;
  const fechaInicioObra = licitacionProyecto?.fechaInicioObra;
  const fechaTerminoProgramada = licitacionProyecto?.fechaTerminoProgramada;
  const campusSigla = proyecto.campusSigla || 'CJP';
  const edificioSigla = proyecto.edificioSigla || '';
  const responsableNombre = proyecto.responsableNombre || 'David Silva Roco';
  const responsableEmail = proyecto.responsableEmail || 'dsilva@uct.cl';
  const uso = proyecto.uso || 'Infraestructura Institucional';

  // State para Antecedentes y Documentos cargados
  const [documentos, setDocumentos] = useState<DocumentoProyecto[]>(() => {
    if ('documentosAntecedentes' in proyecto && proyecto.documentosAntecedentes && proyecto.documentosAntecedentes.length > 0) {
      return proyecto.documentosAntecedentes.map(d => ({
        id: d.id,
        nombre: d.nombre,
        tipo: normalizarTipoDocumento(d.tipo),
        archivoNombre: d.archivoNombre || `${d.nombre.replace(/\s+/g, '_')}.pdf`,
        fechaCarga: d.fechaCarga || new Date().toLocaleDateString('es-CL'),
        cargadoPor: responsableNombre,
      }));
    }
    if ('antecedentesTecnicos' in proyecto && proyecto.antecedentesTecnicos && proyecto.antecedentesTecnicos.length > 0) {
      return proyecto.antecedentesTecnicos.map(d => ({
        id: d.id,
        nombre: d.nombre,
        tipo: normalizarTipoDocumento(d.tipo),
        archivoNombre: d.archivoNombre || `${d.nombre.replace(/\s+/g, '_')}.pdf`,
        fechaCarga: d.fechaCarga || new Date().toLocaleDateString('es-CL'),
        cargadoPor: d.cargadoPor || responsableNombre,
      }));
    }
    return []; // Sin documentos por defecto
  });

  // State para Checklist de Carátula SGC
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: 'ch-01', label: '1. Bases Administrativas / Términos de Referencia', descripcion: 'Reglas del proceso y criterios de evaluación SGC', completado: false },
    { id: 'ch-02', label: '2. Especificaciones Técnicas (EETT)', descripcion: 'Detalle de materiales, cubicaciones y requerimientos de obra', completado: false },
    { id: 'ch-03', label: '3. Planos de Arquitectura y Especialidades (DWG / PDF)', descripcion: 'Planos acotados, instalaciones eléctricas y sanitarias', completado: false },
    { id: 'ch-04', label: '4. Presupuesto Detallado e Itemizado (XLSX)', descripcion: 'Cubicaciones y desglose de costos por partida', completado: false },
    { id: 'ch-05', label: '5. Programa de Trabajo y Carta Gantt', descripcion: 'Cronograma de ejecución y plazos por etapa', completado: false },
    { id: 'ch-06', label: '6. Certificado / Informe de Visita a Terreno', descripcion: 'Registro oficial de contratistas asistentes', completado: false },
    { id: 'ch-07', label: '7. Aclaraciones y Respuestas (Consultas SGC)', descripcion: 'Acta de respuestas a consultas de proveedores', completado: false },
    { id: 'ch-08', label: '8. Cotizaciones / Ofertas de Proveedores Recibidas', descripcion: 'Propuestas económicas y técnicas en sistema', completado: false },
    { id: 'ch-09', label: '9. Cuadro Comparativo & Acta de Adjudicación SGC', descripcion: 'Evaluación parametrizada y resolución de adjudicación', completado: false },
    { id: 'ch-10', label: '10. Orden de Compra (OP/OT) & Decreto de Cierre', descripcion: 'Documentos presupuestarios finales aprobados', completado: false },
  ]);

  /**
   * Valida automáticamente el checklist basado en documentos cargados
   */
  const validateChecklistFromDocuments = (docs: DocumentoProyecto[]) => {
    setChecklistItems(items =>
      items.map(item => {
        let completado = false;

        // Mapear qué documentos satisfacen cada checklist item
        if (item.id === 'ch-01') {
          completado = docs.some(d => d.tipo === 'Bases');
        } else if (item.id === 'ch-02') {
          completado = docs.some(d => d.tipo === 'EETT');
        } else if (item.id === 'ch-03') {
          completado = docs.some(d => d.tipo.includes('Planos'));
        } else if (item.id === 'ch-04') {
          completado = docs.some(d => d.tipo === 'Presupuesto');
        } else if (item.id === 'ch-05') {
          completado = docs.some(d => d.tipo === 'Carta Gantt');
        }
        // ch-06 a ch-10 se pueden marcar manualmente si lo deseas

        return { ...item, completado };
      })
    );
  };

  // Formulario de Nuevo Documento
  const [nuevoNombreDoc, setNuevoNombreDoc] = useState('');
  const [nuevoTipoDoc, setNuevoTipoDoc] = useState<DocumentoProyecto['tipo']>('Bases');
  const [nuevoNombreArchivo, setNuevoNombreArchivo] = useState('');
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Descripción editable y reescritura IA
  const [descripcionLocal, setDescripcionLocal] = useState<string>(() => {
    const raw = ('descripcion' in proyecto && proyecto.descripcion) ? proyecto.descripcion : '';
    try {
      return corregirOrtografiaEspanol(raw);
    } catch {
      return raw;
    }
  });
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false); // Track cambios

  const completadosCount = checklistItems.filter(i => i.completado).length;
  const porcentajeAvance = Math.round((completadosCount / checklistItems.length) * 100);

  const handleToggleChecklist = (idCheck: string) => {
    // Solo permitir cambios manuales en items ch-06 a ch-10 (no son automáticos)
    const autoItems = ['ch-01', 'ch-02', 'ch-03', 'ch-04', 'ch-05'];
    if (autoItems.includes(idCheck)) {
      return; // No permitir cambios en items automáticos
    }

    setChecklistItems(items =>
      items.map(item => (item.id === idCheck ? { ...item, completado: !item.completado } : item))
    );
    setHasChanges(true);
  };

  const handleAgregarDocumento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombreDoc.trim()) {
      alert('Ingrese la denominación del documento.');
      return;
    }

    // Si no hay archivo, crear registro local
    if (!archivoSeleccionado) {
      const doc: DocumentoProyecto = {
        id: `doc-${Date.now()}`,
        nombre: nuevoNombreDoc.trim(),
        tipo: nuevoTipoDoc,
        archivoNombre: nuevoNombreArchivo.trim() || `${nuevoNombreDoc.trim().replace(/\s+/g, '_')}.${nuevoTipoDoc.includes('DWG') ? 'dwg' : 'pdf'}`,
        fechaCarga: new Date().toLocaleDateString('es-CL'),
        cargadoPor: responsableNombre,
        estado: 'local',
      };
      const newDocs = [...documentos, doc];
      setDocumentos(newDocs);
      validateChecklistFromDocuments(newDocs);
      setNuevoNombreDoc('');
      setNuevoNombreArchivo('');
      setArchivoSeleccionado(null);
      setHasChanges(true);
      return;
    }

    // Subir archivo a Google Drive
    setIsUploading(true);
    setUploadProgress(10);

    try {
      setUploadProgress(30);
      
      // Subir archivo a Google Drive
      const uploadResult = await uploadFileToProjectFolder(
        archivoSeleccionado,
        codigoProyecto || id,
        nombreProyecto
      );

      setUploadProgress(80);

      // Crear registro del documento
      const doc: DocumentoProyecto = {
        id: uploadResult.id,
        nombre: nuevoNombreDoc.trim(),
        tipo: nuevoTipoDoc,
        archivoNombre: archivoSeleccionado.name,
        driveFileId: uploadResult.id,
        driveLink: uploadResult.url,
        archivoURL: uploadResult.url,
        fechaCarga: new Date().toLocaleDateString('es-CL'),
        cargadoPor: responsableNombre,
        estado: uploadResult.storage === 'drive' ? 'almacenado' : 'local',
      };

      const newDocs = [...documentos, doc];
      setDocumentos(newDocs);
      validateChecklistFromDocuments(newDocs);
      setUploadProgress(100);
      setHasChanges(true);

      // Reset formulario
      setTimeout(() => {
        setNuevoNombreDoc('');
        setNuevoNombreArchivo('');
        setArchivoSeleccionado(null);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 500);

      alert(uploadResult.storage === 'drive'
        ? `Archivo "${archivoSeleccionado.name}" cargado exitosamente a Google Drive.`
        : `El archivo fue leído, pero no se almacenó en Drive. Configure o autorice Google Drive e intente nuevamente.`);
    } catch (error) {
      console.error('Error cargando archivo:', error);
      alert(`Error al cargar el archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleEliminarDocumento = async (docId: string) => {
    const doc = documentos.find(d => d.id === docId);
    if (!doc) return;

    if (confirm('¿Confirma eliminar este documento del expediente del proyecto?')) {
      // Si está almacenado en Drive, eliminarlo primero
      if (doc.estado === 'almacenado' && doc.driveFileId) {
        try {
          await deleteFileFromDrive(doc.driveFileId);
        } catch (error) {
          console.error('Error eliminando archivo de Drive:', error);
          // Continuar de todos modos
        }
      }

      const newDocs = documentos.filter(d => d.id !== docId);
      setDocumentos(newDocs);
      validateChecklistFromDocuments(newDocs);
      setHasChanges(true);
    }
  };

  /**
   * Guarda TODOS los cambios: descripción, checklist y documentos
   */
  const handleGuardarCambios = async () => {
    setIsSaving(true);
    try {
      const datosActualizar: any = {
        descripcion: descripcionLocal,
      };

      // Guardar documentos
      if ('montoEstimado' in proyecto) {
        datosActualizar.antecedentesTecnicos = documentos.map(d => ({
          id: d.id,
          nombre: d.nombre,
          tipo: d.tipo as any,
          archivoNombre: d.archivoNombre,
          archivoURL: d.archivoURL || '#',
          fechaCarga: d.fechaCarga,
          cargadoPor: d.cargadoPor,
          driveFileId: d.driveFileId,
          driveLink: d.driveLink,
          estado: d.estado,
        }));

        await updateLicitacion(id, datosActualizar);
      } else {
        datosActualizar.documentosAntecedentes = documentos.map(d => ({
          id: d.id,
          nombre: d.nombre,
          tipo: (d.tipo.includes('Plano') ? 'Plano' : 'Documento') as any,
          archivoNombre: d.archivoNombre,
          fechaCarga: d.fechaCarga,
          driveFileId: d.driveFileId,
          driveLink: d.driveLink,
          estado: d.estado,
        }));

        await updateProyectoMaestro(id, datosActualizar);
      }

      setHasChanges(false);
      alert('✓ Todos los cambios han sido guardados exitosamente');
      onUpdateSuccess?.();
    } catch (error) {
      console.error('Error guardando cambios:', error);
      alert('Error al guardar los cambios. Por favor, intente nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyDescription = async (newDesc: string) => {
    setIsSaving(true);
    try {
      const corrected = corregirOrtografiaEspanol(newDesc || '');
      if ('montoEstimado' in proyecto) {
        await updateLicitacion(id, { descripcion: corrected });
      } else {
        await updateProyectoMaestro(id, { descripcion: corrected });
      }
      setDescripcionLocal(corrected);
      setIsEditingDesc(false);
      onUpdateSuccess?.();
      alert('Descripción actualizada.');
    } catch (err) {
      console.error('Error guardando descripción:', err);
      alert('No se pudo guardar la descripción en el servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRewriteWithAI = async () => {
    if (!descripcionLocal) return alert('La descripción está vacía.');
    setAiProcessing(true);
    try {
      if (isAIConfigured()) {
        const rewritten = await rewriteTextWithAI(descripcionLocal, 'técnico y conciso');
        const accept = confirm('Vista previa IA:\n\n' + rewritten + '\n\n¿Aceptar como nueva descripción?');
        if (accept) await handleApplyDescription(rewritten);
      } else {
        const corrected = corregirOrtografiaEspanol(descripcionLocal);
        const accept = confirm('Corrección ortográfica local:\n\n' + corrected + '\n\n¿Aceptar como nueva descripción?');
        if (accept) await handleApplyDescription(corrected);
      }
    } catch (err) {
      console.error('AI rewrite failed', err);
      alert('No se pudo procesar la reescritura con IA. Se aplicará corrección ortográfica local.');
      const corrected = corregirOrtografiaEspanol(descripcionLocal);
      if (confirm('Corrección ortográfica local:\n\n' + corrected + '\n\n¿Aceptar como nueva descripción?')) {
        await handleApplyDescription(corrected);
      }
    } finally {
      setAiProcessing(false);
    }
  };

  // Validar checklist cuando cambian los documentos
  useEffect(() => {
    validateChecklistFromDocuments(documentos);
  }, [documentos]);

  return (
    <div className="space-y-6 text-slate-800">
      
      {/* Botones de Acción Rápida */}
      <div className="flex flex-wrap gap-3">
        {!hideBack && (
          <button
            onClick={onBack}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition flex items-center gap-2 font-bold text-sm border border-slate-200 shadow-sm"
            title="Volver a la lista"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← Volver</span>
          </button>
        )}
        
        <div className="flex-1"></div>
        
        <button
          onClick={() => window.print()}
          className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm transition flex items-center gap-2 font-bold border border-slate-200 shadow-sm"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir</span>
        </button>
        <button
          onClick={handleGuardarCambios}
          disabled={isSaving}
          className="px-5 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition shadow-sm flex items-center gap-2"
        >
          <FolderCheck className="w-4 h-4" />
          <span>{isSaving ? 'Guardando...' : hasChanges ? 'Guardar Cambios' : 'Guardar Expediente'}</span>
        </button>
      </div>

      {/* SECCIÓN DE ENCABEZADO PROMINENTE DEL PROYECTO */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 rounded-3xl shadow-md overflow-hidden caratula-print border border-slate-600">
        <div className="p-8 sm:p-10 md:p-12">
          <div className="flex flex-col gap-6">
            {/* Fila de Códigos */}
            <div className="flex flex-wrap gap-2">
              <span className="text-[11px] font-extrabold uppercase bg-slate-700 text-slate-100 px-3 py-1.5 rounded-full font-mono border border-slate-600 hover:bg-slate-600 transition">
                CP: {codigoCP}
              </span>
              <span className="text-[11px] font-extrabold uppercase bg-slate-700 text-slate-100 px-3 py-1.5 rounded-full font-mono border border-slate-600 hover:bg-slate-600 transition">
                Cód: {codigoProyecto || id}
              </span>
              {codigoOT && (
                <span className="text-[11px] font-extrabold uppercase bg-slate-700 text-slate-100 px-3 py-1.5 rounded-full font-mono border border-slate-600 hover:bg-slate-600 transition">
                  OT: {codigoOT}
                </span>
              )}
              {codigoOP && (
                <span className="text-[11px] font-extrabold uppercase bg-slate-700 text-slate-100 px-3 py-1.5 rounded-full font-mono border border-slate-600 hover:bg-slate-600 transition">
                  OP: {codigoOP}
                </span>
              )}
            </div>

            {/* Nombre Principal del Proyecto */}
            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight uppercase">
                {nombreProyectoUpper}
              </h1>
              
              {/* Descripción del Proyecto */}
              <div className="flex items-start gap-3 bg-slate-700/50 p-4 rounded-2xl border border-slate-600">
                <div className="flex-1">
                  <p className="text-slate-100 text-base leading-relaxed font-medium">
                    {descripcionLocal || 'Sin descripción. Pulse el botón Editar para agregar detalles del proyecto.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsEditingDesc(true)}
                    className="mt-3 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg text-sm transition flex items-center gap-2 inline-flex"
                    title="Editar descripción"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Editar Descripción</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Información Clave del Proyecto */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="bg-slate-700/60 p-4 rounded-xl border border-slate-600">
                <p className="text-slate-300 text-xs font-bold uppercase mb-2">Campus</p>
                <p className="text-white text-lg font-extrabold">{campusSigla}</p>
                {edificioSigla && <p className="text-slate-300 text-xs mt-1">Edificio {edificioSigla}</p>}
              </div>
              
              <div className="bg-slate-700/60 p-4 rounded-xl border border-slate-600">
                <p className="text-slate-300 text-xs font-bold uppercase mb-2">Responsable</p>
                <p className="text-white text-sm font-extrabold truncate">{responsableNombre}</p>
                <p className="text-slate-300 text-[11px] font-mono mt-1">{responsableEmail}</p>
              </div>

              <div className="bg-slate-700/60 p-4 rounded-xl border border-slate-600">
                <p className="text-slate-300 text-xs font-bold uppercase mb-2 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {tieneMontoAdjudicado ? 'Monto adjudicado' : 'Monto estimado'}
                </p>
                <p className="text-white text-lg font-extrabold">{formatoMonedaCLP(montoOficial)}</p>
                {tieneMontoAdjudicado && (
                  <p className="text-slate-300 text-[10px] mt-1">Estimado inicial: {formatoMonedaCLP(montoEstimado)}</p>
                )}
              </div>

              <div className="bg-slate-700/60 p-4 rounded-xl border border-slate-600">
                <p className="text-slate-300 text-xs font-bold uppercase mb-2">Uso</p>
                <p className="text-white text-sm font-extrabold">{uso}</p>
              </div>
            </div>

            {estaAdjudicado && (
              <div className="bg-emerald-950/70 p-5 rounded-2xl border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-400/15 border border-emerald-400/20 flex items-center justify-center shrink-0">
                    <Building className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Proyecto adjudicado a</p>
                    <p className="text-lg font-black text-white">{proveedorAdjudicadoNombre || 'Proveedor adjudicado pendiente de identificar'}</p>
                    {proveedorAdjudicadoRut && <p className="text-xs text-emerald-100 mt-0.5">RUT {proveedorAdjudicadoRut}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-right shrink-0">
                  <div className="bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                    <span className="block text-[9px] uppercase text-emerald-200">Monto oficial</span>
                    <strong className="text-sm text-white">{formatoMonedaCLP(montoOficial)}</strong>
                  </div>
                  <div className="bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                    <span className="block text-[9px] uppercase text-emerald-200">Plazo adjudicado</span>
                    <strong className="text-sm text-white">{plazoAdjudicadoDias ? `${plazoAdjudicadoDias} días` : 'Por informar'}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Barra de Progreso del Estado del Expediente */}
            <div className="bg-slate-700/50 p-5 rounded-2xl border border-slate-600">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-extrabold text-sm flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  Estado del Expediente SGC
                </span>
                <span className="text-white font-bold text-lg">{porcentajeAvance}% Completo</span>
              </div>
              <div className="w-full bg-slate-600 rounded-full h-3 overflow-hidden border border-slate-500">
                <div
                  className={`h-3 transition-all duration-500 rounded-full ${
                    porcentajeAvance === 100
                      ? 'bg-emerald-600'
                      : porcentajeAvance >= 50
                      ? 'bg-sky-600'
                      : 'bg-amber-600'
                  }`}
                  style={{ width: `${porcentajeAvance}%` }}
                ></div>
              </div>
              <p className="text-slate-300 text-xs font-semibold mt-2">
                {completadosCount} de {checklistItems.length} Requisitos Documentales Validados
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Principal: Carátula Oficial (Izquierda) + CheckList y Documentos (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* COLUMNA IZQUIERDA: CARÁTULA OFICIAL DEL PROYECTO SGC */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-md overflow-hidden caratula-print">
            {/* Encabezado Carátula SGC */}
            <div className="bg-slate-900 text-white p-4 text-center border-b-2 border-slate-900 space-y-1">
              <span className="text-[10px] font-mono tracking-widest text-sky-300 uppercase block">
                UNIVERSIDAD CATÓLICA DE TEMUCO • SUBDIRECCIÓN DE INFRAESTRUCTURA
              </span>
              <h3 className="text-base font-black uppercase tracking-wide">
                CARÁTULA OFICIAL DE EXPEDIENTE SGC
              </h3>
              <p className="text-[11px] text-slate-300 font-medium">SGC PS-FOR-DGDC 0003 • Sistema de Control de Obras</p>
            </div>

            {/* Datos Resumen del Proyecto */}
            <div className="p-5 space-y-4 text-xs bg-slate-50/50">
              
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Resumen Información Técnica del Proyecto:</span>
                
                <div className="bg-white rounded-lg p-4 border border-slate-200">
                  <p className="text-slate-500 text-[10px] mb-2 font-bold">NOMBRE OFICIAL:</p>
                  <p className="text-slate-900 text-sm font-extrabold uppercase leading-snug">{nombreProyectoUpper}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-b border-slate-200 py-3 font-mono">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Centro de Costo (CC/CP):</span>
                  <span className="font-extrabold text-slate-900 text-xs">{codigoCP}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Código Proyecto:</span>
                  <span className="font-extrabold text-indigo-700 text-xs">{codigoProyecto || id}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Orden Trabajo (OT):</span>
                  <span className="font-bold text-slate-800 text-xs">{codigoOT || 'Pendiente'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Orden Pedido (OP):</span>
                  <span className="font-bold text-slate-800 text-xs">{codigoOP || 'Pendiente'}</span>
                </div>
              </div>

              <div className="space-y-2 text-slate-700 text-xs">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
                  <span><strong>Ubicación:</strong> Campus {campusSigla} {edificioSigla ? `• Edificio ${edificioSigla}` : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span><strong>Responsable UCT:</strong> {responsableNombre}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>{tieneMontoAdjudicado ? 'Monto oficial adjudicado:' : 'Monto estimado:'}</strong>{' '}
                    <strong className="text-emerald-800 font-extrabold">{formatoMonedaCLP(montoOficial)}</strong>
                  </span>
                </div>
                {tieneMontoAdjudicado && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <DollarSign className="w-4 h-4 shrink-0" />
                    <span><strong>Monto estimado inicial:</strong> {formatoMonedaCLP(montoEstimado)}</span>
                  </div>
                )}
                {estaAdjudicado && (
                  <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                    <Building className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>Proveedor adjudicado:</strong>{' '}
                      <strong className="text-emerald-900">{proveedorAdjudicadoNombre || 'Pendiente de identificar'}</strong>
                      {proveedorAdjudicadoRut && <span className="block text-[10px] text-slate-600 mt-0.5">RUT: {proveedorAdjudicadoRut}</span>}
                      {plazoAdjudicadoDias && <span className="block text-[10px] text-slate-600">Plazo contractual: {plazoAdjudicadoDias} días corridos</span>}
                    </span>
                  </div>
                )}
                {fechaInicioObra && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-sky-600 shrink-0" />
                    <span><strong>Programa contractual:</strong> {new Intl.DateTimeFormat('es-CL').format(new Date(`${fechaInicioObra}T12:00:00`))} – {fechaTerminoProgramada ? new Intl.DateTimeFormat('es-CL').format(new Date(`${fechaTerminoProgramada}T12:00:00`)) : 'Término pendiente'}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-purple-600 shrink-0" />
                  <span><strong>Uso Solicitante:</strong> {uso}</span>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA: CHECKLIST DE CONTENIDOS DEL PROYECTO + GESTIÓN DE DOCUMENTOS */}
        <div className="lg:col-span-7 space-y-6">

          {/* MÓDULO 1: CHECK LIST DE LO QUE CONTIENE EL PROYECTO */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                  <span>Checklist de Contenidos del Proyecto (Expediente SGC)</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Marque los componentes e hito documentales verificados en la carátula oficial.
                </p>
              </div>
              <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-900 px-3 py-1 rounded-full">
                {completadosCount} / {checklistItems.length}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {checklistItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleToggleChecklist(item.id)}
                  className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                    item.completado
                      ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <button type="button" className="mt-0.5 shrink-0">
                    {item.completado ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                  <div className="flex-1">
                    <span className={`font-extrabold text-xs block ${item.completado ? 'text-emerald-950 line-through opacity-80' : 'text-slate-900'}`}>
                      {item.label}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block">
                      {item.descripcion}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modal / Inline Editor para descripción */}
          {isEditingDesc && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-extrabold">Editar Descripción del Proyecto</h4>
                  <button onClick={() => setIsEditingDesc(false)} className="text-slate-400 hover:text-slate-700">Cerrar</button>
                </div>
                <textarea
                  rows={8}
                  value={descripcionLocal}
                  onChange={e => setDescripcionLocal(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none"
                />
                <div className="flex items-center justify-end gap-3 mt-3">
                  <button
                    onClick={() => setDescripcionLocal(corregirOrtografiaEspanol(descripcionLocal))}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                  >Corregir ortografía</button>

                  {isAIConfigured() && (
                    <button
                      onClick={handleRewriteWithAI}
                      disabled={aiProcessing}
                      className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm"
                    >{aiProcessing ? 'Procesando...' : 'Mejorar con IA'}</button>
                  )}

                  <button
                    onClick={() => handleApplyDescription(descripcionLocal)}
                    disabled={isSaving}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm"
                  >{isSaving ? 'Guardando...' : 'Guardar descripción'}</button>
                </div>
              </div>
            </div>
          )}

          {/* MÓDULO 2: INGRESO Y CARGA DE DOCUMENTOS NECESARIOS DEL PROYECTO */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-600" />
                  <span>Documentos & Antecedentes Cargados al Proyecto</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ingrese las Bases, EETT, Planos DWG/PDF, Presupuestos y Anexos necesarios para la obra.
                </p>
              </div>
              <span className="text-[11px] font-bold text-sky-700 bg-sky-100 px-2.5 py-0.5 rounded-full">
                {documentos.length} Documento(s)
              </span>
            </div>

            {/* Formulario Inline de Carga de Nuevo Documento */}
            <form onSubmit={handleAgregarDocumento} className="bg-sky-50/50 p-4 rounded-xl border border-sky-200 space-y-3">
              <span className="font-bold text-sky-950 text-xs block flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-sky-600" />
                <span>Ingresar Documento al Proyecto (Se almacenará en Google Drive)</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Nombre o Denominación del Documento *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Plano de Electricidad e Iluminación LED"
                    value={nuevoNombreDoc}
                    onChange={e => setNuevoNombreDoc(e.target.value)}
                    disabled={isUploading}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-500 font-medium disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoría Documento *</label>
                  <select
                    value={nuevoTipoDoc}
                    onChange={e => setNuevoTipoDoc(e.target.value as any)}
                    disabled={isUploading}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-500 font-semibold disabled:opacity-50"
                  >
                    <option value="Bases">Bases Administrativas</option>
                    <option value="EETT">Especificaciones Técnicas (EETT)</option>
                    <option value="Planos DWG">Plano DWG (CAD)</option>
                    <option value="Planos PDF">Plano PDF</option>
                    <option value="Presupuesto">Presupuesto Detallado</option>
                    <option value="Carta Gantt">Carta Gantt</option>
                    <option value="Anexo">Anexo General</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-white border border-dashed border-sky-300 rounded-lg">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setArchivoSeleccionado(file);
                        setNuevoNombreArchivo(file.name);
                      }
                    }}
                    disabled={isUploading}
                    className="flex-1 text-xs"
                  />
                  {archivoSeleccionado && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 whitespace-nowrap">
                      ✓ {archivoSeleccionado.name}
                    </span>
                  )}
                </div>
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-sky-900">Cargando archivo...</span>
                    <span className="font-bold text-sky-600">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-sky-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-2.5 bg-sky-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isUploading || !nuevoNombreDoc.trim()}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold rounded-lg text-xs transition shadow-sm flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>{isUploading ? 'Cargando...' : 'Adjuntar al Proyecto'}</span>
                </button>
              </div>
            </form>

            {/* Tabla de Documentos Registrados */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-[11px]">
                    <th className="p-3">Documento / Antecedente</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Fecha Carga</th>
                    <th className="p-3">Cargado por</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {documentos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        Aún no hay documentos registrados para este proyecto.
                      </td>
                    </tr>
                  ) : (
                    documentos.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50 transition">
                        <td className="p-3">
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <strong className="text-slate-900 block text-xs">{doc.nombre}</strong>
                              <span className="text-[10px] text-slate-500 font-mono">{doc.archivoNombre}</span>
                            </div>
                            {doc.estado === 'almacenado' && (
                              <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 whitespace-nowrap font-bold flex items-center gap-1">
                                <Cloud className="w-3 h-3" />
                                Drive
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            doc.tipo.includes('Planos')
                              ? 'bg-purple-100 text-purple-900 border border-purple-200'
                              : doc.tipo === 'EETT'
                              ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                              : 'bg-sky-100 text-sky-900 border border-sky-200'
                          }`}>
                            {doc.tipo}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 text-[11px]">{doc.fechaCarga}</td>
                        <td className="p-3 text-slate-500 text-[11px]">{doc.cargadoPor || 'Sistema'}</td>
                        <td className="p-3 text-right space-x-1">
                          {doc.estado === 'almacenado' && doc.driveLink ? (
                            <button
                              type="button"
                              onClick={() => window.open(doc.driveLink, '_blank')}
                              className="p-1.5 text-blue-700 hover:bg-blue-100 rounded-lg transition"
                              title="Abrir en Google Drive"
                            >
                              <Cloud className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => alert(`Archivo local: ${doc.archivoNombre}`)}
                              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition"
                              title="Archivo local (sin sincronizar)"
                            >
                              <AlertCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEliminarDocumento(doc.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition"
                            title="Eliminar documento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
