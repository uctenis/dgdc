import React, { useState, useRef, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  ArrowLeft, FileText, CheckCircle2, Upload,
  Trash2, Building, User, DollarSign,
  MapPin, ShieldCheck, CheckSquare, Square, Printer, FolderCheck, Edit3, Cloud, AlertCircle, CalendarDays,
  ScrollText,
} from 'lucide-react';
import type { AumentoObra, Cotizacion, LicitacionProyecto, ProyectoMaestro, Proveedor, ConfiguracionFirmas } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { normalizarNombreProyecto, corregirOrtografiaEspanol, corregirTextoAvanzado } from '../utils/spellCorrector';
import { rewriteTextWithAI, isAIConfigured } from '../services/aiService';
import { updateLicitacion, updateProyectoMaestro, deleteLicitacion, deleteProyectoMaestro, syncOCToProyectoMaestro } from '../services/firestoreService';
import { uploadProyectoDocumento } from '../services/storageService';
import { getCampusList, obtenerEdificiosDeCampus } from '../data/campusData';
import { RESPONSABLES_INFRAESTRUCTURA } from '../data/responsablesData';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';
import { AumentosObraPanel } from './AumentosObraPanel';
import { ItemizadoProyectoPanel } from './ItemizadoProyectoPanel';
import { BitacoraProyectoPanel } from './BitacoraProyectoPanel';
import { CargaOrdenCompraModal } from './CargaOrdenCompraModal';
import { PremiumDatePicker } from './PremiumDatePicker';
import { BasesLicitacionModal } from './BasesLicitacionModal';
import { ContratoAdjudicacionModal } from './ContratoAdjudicacionModal';
import { requiereContratoFormal, UMBRAL_CONTRATO_FORMAL } from '../data/contratoTemplateData';

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
  configFirmas?: ConfiguracionFirmas;
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
  configFirmas,
}) => {
  const umbralContratoFormal = configFirmas?.parametrosSgc?.umbralContratoFormal;
  const [licitacionVinculada, setLicitacionVinculada] = useState<LicitacionProyecto | null>(null);
  const [proyectoMaestroVinculado, setProyectoMaestroVinculado] = useState<ProyectoMaestro | null>(null);

  // Búsqueda cruzada en Firestore para mantener sincronizados Cartera y Licitaciones
  useEffect(() => {
    let isMounted = true;
    const buscarVinculados = async () => {
      try {
        const codigoProyectoTarget = 'codigoProyecto' in proyecto ? proyecto.codigoProyecto : '';

        // Si la ficha recibió un ProyectoMaestro, buscar su LicitacionProyecto asociada.
        // Se usa proyectoMaestroId (vínculo explícito) primero, y codigoProyecto como respaldo.
        // NO se usa codigoCP como respaldo: no es único (muchos proyectos comparten el valor
        // por defecto "409-1722"), lo que enlazaba proyectos nuevos con licitaciones ajenas.
        if (!('montoEstimado' in proyecto)) {
          const licsRef = collection(db, 'licitaciones');
          let snap = await getDocs(query(licsRef, where('proyectoMaestroId', '==', proyecto.id)));
          if (snap.empty && codigoProyectoTarget) {
            snap = await getDocs(query(licsRef, where('codigoProyecto', '==', codigoProyectoTarget)));
          }
          if (!snap.empty && isMounted) {
            const licData = { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<LicitacionProyecto, 'id'>) };
            setLicitacionVinculada(licData);
          }
        }

        // Si la ficha recibió una LicitacionProyecto, buscar su ProyectoMaestro asociado.
        // Mismo criterio: proyectoMaestroId (vínculo directo por id de documento) primero,
        // codigoProyecto como respaldo, sin fallback por codigoCP.
        if ('montoEstimado' in proyecto) {
          if (proyecto.proyectoMaestroId) {
            const directSnap = await getDoc(doc(db, 'proyectos', proyecto.proyectoMaestroId));
            if (directSnap.exists() && isMounted) {
              setProyectoMaestroVinculado({ id: directSnap.id, ...(directSnap.data() as Omit<ProyectoMaestro, 'id'>) });
              return;
            }
          }
          if (codigoProyectoTarget) {
            const snap = await getDocs(query(collection(db, 'proyectos'), where('codigoProyecto', '==', codigoProyectoTarget)));
            if (!snap.empty && isMounted) {
              const proyData = { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<ProyectoMaestro, 'id'>) };
              setProyectoMaestroVinculado(proyData);
            }
          }
        }
      } catch (err) {
        console.error('Error buscando vinculados en FichaProyectoPage:', err);
      }
    };

    buscarVinculados();
    return () => { isMounted = false; };
  }, [proyecto]);

  const licitacionEfectiva = 'montoEstimado' in proyecto ? proyecto : (licitacionVinculada || undefined);
  const proyectoMaestroEfectivo = 'valorAprox' in proyecto ? proyecto : (proyectoMaestroVinculado || undefined);

  // Normalización de datos unificados entre LicitacionProyecto y ProyectoMaestro
  const id = proyecto.id;
  const codigoCP = proyecto.codigoCP || licitacionEfectiva?.codigoCP || proyectoMaestroEfectivo?.codigoCP || '409-1722';
  const codigoOT = proyectoMaestroEfectivo?.codigoOT || licitacionEfectiva?.codigoOT || ('codigoOT' in proyecto ? proyecto.codigoOT : '');
  const codigoOP = proyectoMaestroEfectivo?.codigoOP || licitacionEfectiva?.codigoOP || ('codigoOP' in proyecto ? proyecto.codigoOP : '');
  const codigoProyecto = proyectoMaestroEfectivo?.codigoProyecto || licitacionEfectiva?.codigoProyecto || ('codigoProyecto' in proyecto ? proyecto.codigoProyecto : '');

  const ordenCompraNumero = licitacionEfectiva?.ordenCompraNumero
    || (licitacionEfectiva as any)?.codigoOC
    || proyectoMaestroEfectivo?.ordenCompraNumero
    || proyectoMaestroEfectivo?.codigoOC
    || ('ordenCompraNumero' in proyecto ? (proyecto.ordenCompraNumero || (proyecto as any).codigoOC) : '')
    || '';

  const nombreProyecto = normalizarNombreProyecto(
    licitacionEfectiva?.nombreProyecto
    || proyectoMaestroEfectivo?.nombre
    || ('nombreProyecto' in proyecto ? proyecto.nombreProyecto : (proyecto as ProyectoMaestro).nombre || '')
  );
  const nombreProyectoUpper = nombreProyecto;

  const montoEstimado = licitacionEfectiva?.montoEstimado ?? proyectoMaestroEfectivo?.valorAprox ?? 0;
  const montoAdjudicado = licitacionEfectiva?.montoAdjudicadoTotal ?? proyectoMaestroEfectivo?.montoAdjudicado;

  const estaAdjudicado = Boolean(
    licitacionEfectiva?.estado === 'Adjudicado'
    || licitacionEfectiva?.estado === 'Cerrado'
    || licitacionEfectiva?.proveedorAdjudicadoId
    || licitacionEfectiva?.proveedorGanadorId
    || (proyectoMaestroEfectivo?.montoAdjudicado && proyectoMaestroEfectivo.montoAdjudicado > 0)
  );

  const proveedorAdjudicadoNombre = licitacionEfectiva?.proveedorAdjudicadoNombre
    || (licitacionEfectiva as any)?.proveedorGanadorNombre
    || cotizacionAdjudicada?.proveedorNombre
    || proveedorAdjudicado?.razonSocial
    || proyectoMaestroEfectivo?.proveedorAdjudicadoNombre;

  const proveedorAdjudicadoRut = licitacionEfectiva?.proveedorAdjudicadoRut
    || cotizacionAdjudicada?.proveedorRut
    || proveedorAdjudicado?.rut
    || proyectoMaestroEfectivo?.proveedorAdjudicadoRut;

  const plazoAdjudicadoDias = licitacionEfectiva?.plazoAdjudicadoDias
    || cotizacionAdjudicada?.plazoDias
    || proyectoMaestroEfectivo?.plazoEjecucionDias;

  const tieneMontoAdjudicado = Boolean(
    montoAdjudicado && montoAdjudicado > 0 &&
    (estaAdjudicado || Boolean(proveedorAdjudicadoNombre)),
  );
  const montoOficial = tieneMontoAdjudicado ? montoAdjudicado! : montoEstimado;
  const [aumentosObra, setAumentosObra] = useState<AumentoObra[]>([]);
  const aumentosAprobados = aumentosObra.filter(aumento => aumento.estado === 'Aprobado');
  const montoAumentosAprobados = aumentosAprobados.reduce((total, aumento) => total + aumento.montoTotal, 0);
  const diasAumentoAprobados = aumentosAprobados.reduce((total, aumento) => total + aumento.ampliacionPlazoDias, 0);
  const montoVigente = montoOficial + montoAumentosAprobados;
  const plazoVigenteDias = (plazoAdjudicadoDias || 0) + diasAumentoAprobados;
  const fechaInicioObra = licitacionEfectiva?.fechaInicioObra;
  const fechaTerminoProgramada = licitacionEfectiva?.fechaTerminoProgramada;
  const fechaTerminoVigente = fechaInicioObra && plazoVigenteDias > 0
    ? (() => {
      const fecha = new Date(`${fechaInicioObra}T12:00:00`);
      fecha.setDate(fecha.getDate() + plazoVigenteDias - 1);
      return fecha.toISOString().split('T')[0];
    })()
    : fechaTerminoProgramada;
  const campusSigla = proyecto.campusSigla || licitacionEfectiva?.campusSigla || proyectoMaestroEfectivo?.campusSigla || 'CJP';
  const edificioSigla = proyecto.edificioSigla || licitacionEfectiva?.edificioSigla || proyectoMaestroEfectivo?.edificioSigla || '';
  const responsableNombre = proyecto.responsableNombre || licitacionEfectiva?.responsableNombre || proyectoMaestroEfectivo?.responsableNombre || 'David Silva Roco';
  const responsableEmail = proyecto.responsableEmail || licitacionEfectiva?.responsableEmail || proyectoMaestroEfectivo?.responsableEmail || 'dsilva@uct.cl';
  const uso = proyecto.uso || licitacionEfectiva?.uso || proyectoMaestroEfectivo?.uso || 'Infraestructura Institucional';

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

  // State para Checklist de Carátula
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: 'ch-01', label: '1. Bases Administrativas / Términos de Referencia', descripcion: 'Reglas del proceso y criterios de evaluación', completado: false },
    { id: 'ch-02', label: '2. Especificaciones Técnicas (EETT)', descripcion: 'Detalle de materiales, cubicaciones y requerimientos de obra', completado: false },
    { id: 'ch-03', label: '3. Planos de Arquitectura y Especialidades (DWG / PDF)', descripcion: 'Planos acotados, instalaciones eléctricas y sanitarias', completado: false },
    { id: 'ch-04', label: '4. Presupuesto Detallado e Itemizado (XLSX)', descripcion: 'Cubicaciones y desglose de costos por partida', completado: false },
    { id: 'ch-05', label: '5. Programa de Trabajo y Carta Gantt', descripcion: 'Cronograma de ejecución y plazos por etapa', completado: false },
    { id: 'ch-06', label: '6. Certificado / Informe de Visita a Terreno', descripcion: 'Registro oficial de contratistas asistentes', completado: false },
    { id: 'ch-07', label: '7. Aclaraciones y Respuestas (Consultas)', descripcion: 'Acta de respuestas a consultas de proveedores', completado: false },
    { id: 'ch-08', label: '8. Cotizaciones / Ofertas de Proveedores Recibidas', descripcion: 'Propuestas económicas y técnicas en sistema', completado: false },
    { id: 'ch-09', label: '9. Cuadro Comparativo & Acta de Adjudicación', descripcion: 'Evaluación parametrizada y resolución de adjudicación', completado: false },
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
          completado = docs.some(d => d.tipo === 'Planos DWG' || d.tipo === 'Planos PDF');
        } else if (item.id === 'ch-04') {
          completado = docs.some(d => d.tipo === 'Presupuesto');
        } else if (item.id === 'ch-05') {
          completado = docs.some(d => d.tipo === 'Carta Gantt');
        } else if (item.id === 'ch-06' || item.id === 'ch-07') {
          completado = docs.some(d => d.tipo === 'Anexo');
        } else if (item.id === 'ch-08' || item.id === 'ch-09' || item.id === 'ch-10') {
          completado = Boolean(estaAdjudicado || ordenCompraNumero);
        }

        return { ...item, completado };
      })
    );
  };

  // Sincronizar dinámicamente la lista de documentos y validar el checklist
  useEffect(() => {
    const docsBase: DocumentoProyecto[] = [];

    if ('documentosAntecedentes' in proyecto && proyecto.documentosAntecedentes) {
      proyecto.documentosAntecedentes.forEach(d => {
        docsBase.push({
          id: d.id,
          nombre: d.nombre,
          tipo: normalizarTipoDocumento(d.tipo),
          archivoNombre: d.archivoNombre || `${d.nombre.replace(/\s+/g, '_')}.pdf`,
          fechaCarga: d.fechaCarga || new Date().toLocaleDateString('es-CL'),
          cargadoPor: responsableNombre,
        });
      });
    }

    if (proyectoMaestroEfectivo?.documentosAntecedentes) {
      proyectoMaestroEfectivo.documentosAntecedentes.forEach(d => {
        if (!docsBase.some(x => x.nombre === d.nombre || x.archivoNombre === d.archivoNombre)) {
          docsBase.push({
            id: d.id,
            nombre: d.nombre,
            tipo: normalizarTipoDocumento(d.tipo),
            archivoNombre: d.archivoNombre || `${d.nombre.replace(/\s+/g, '_')}.pdf`,
            fechaCarga: d.fechaCarga || new Date().toLocaleDateString('es-CL'),
            cargadoPor: responsableNombre,
          });
        }
      });
    }

    if (licitacionEfectiva?.antecedentesTecnicos) {
      licitacionEfectiva.antecedentesTecnicos.forEach(d => {
        if (!docsBase.some(x => x.nombre === d.nombre || x.archivoNombre === d.archivoNombre)) {
          docsBase.push({
            id: d.id,
            nombre: d.nombre,
            tipo: normalizarTipoDocumento(d.tipo),
            archivoNombre: d.archivoNombre || `${d.nombre.replace(/\s+/g, '_')}.pdf`,
            archivoURL: d.archivoURL,
            driveFileId: (d as any).driveFileId,
            driveLink: (d as any).driveLink || d.archivoURL,
            fechaCarga: d.fechaCarga || new Date().toLocaleDateString('es-CL'),
            cargadoPor: d.cargadoPor || 'Sistema',
            estado: (d as any).driveFileId ? 'almacenado' : 'local',
          });
        }
      });
    }

    const ocNombre = licitacionEfectiva?.archivoOCNombre || (proyecto as any).archivoOCNombre || proyectoMaestroEfectivo?.archivoOCNombre;
    const ocUrl = licitacionEfectiva?.archivoOCURL || (proyecto as any).archivoOCURL || proyectoMaestroEfectivo?.archivoOCURL;
    if (ocNombre && !docsBase.some(x => x.archivoNombre === ocNombre)) {
      docsBase.push({
        id: 'oc_doc_file',
        nombre: `Orden de Compra ${ordenCompraNumero || ''}`.trim(),
        tipo: 'Presupuesto',
        archivoNombre: ocNombre,
        archivoURL: ocUrl,
        driveLink: ocUrl,
        fechaCarga: licitacionEfectiva?.fechaCargaOC || (proyecto as any).fechaCargaOC || new Date().toLocaleDateString('es-CL'),
        cargadoPor: 'Subdirección Infraestructura',
        estado: ocUrl ? 'almacenado' : 'local',
      });
    }

    if (docsBase.length > 0) {
      setDocumentos(docsBase);
      validateChecklistFromDocuments(docsBase);
    }
  }, [proyecto, licitacionVinculada, proyectoMaestroVinculado]);

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
  const [basesAbierto, setBasesAbierto] = useState(false);
  const [contratoAbierto, setContratoAbierto] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false); // Track cambios
  const [showOCModal, setShowOCModal] = useState(false);

  const [mainData, setMainData] = useState({
    nombreProyecto: nombreProyectoUpper,
    codigoCP: codigoCP,
    codigoOT: codigoOT,
    codigoOP: codigoOP,
    codigoOC: ordenCompraNumero,
    codigoProyecto: codigoProyecto || id,
    campusSigla: campusSigla,
    edificioSigla: edificioSigla,
    responsableNombre: responsableNombre,
    responsableEmail: responsableEmail,
    uso: uso,
    montoEstimado: montoEstimado,
    fechaInicioObra: fechaInicioObra || '',
    fechaTerminoProgramada: fechaTerminoProgramada || '',
    plazoAdjudicadoDias: plazoAdjudicadoDias || 0,
  });

  const saveInlineUpdate = async (updates: Partial<typeof mainData>) => {
    try {
      const payload: any = { ...updates };
      if (updates.codigoOC !== undefined) {
        payload.ordenCompraNumero = updates.codigoOC;
        payload.codigoOC = updates.codigoOC;
      }
      if ('montoEstimado' in proyecto) {
        await updateLicitacion(id, payload);
        await syncOCToProyectoMaestro({ ...proyecto, id }, payload);
      } else {
        await updateProyectoMaestro(id, payload);
      }
      setHasChanges(true);
    } catch (e) {
      console.error(e);
      alert('Error guardando cambios.');
    }
  };


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

    // Subir archivo a Firebase Storage (almacenamiento propio de la app)
    setIsUploading(true);
    setUploadProgress(5);

    try {
      const archivoURL = await uploadProyectoDocumento(
        codigoProyecto || id,
        archivoSeleccionado,
        pct => setUploadProgress(pct)
      );

      // Crear registro del documento
      const doc: DocumentoProyecto = {
        id: `doc-${Date.now()}`,
        nombre: nuevoNombreDoc.trim(),
        tipo: nuevoTipoDoc,
        archivoNombre: archivoSeleccionado.name,
        archivoURL,
        fechaCarga: new Date().toLocaleDateString('es-CL'),
        cargadoPor: responsableNombre,
        estado: 'almacenado',
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

  const handleDeleteProyectoFromFicha = async () => {
    const nombreProy = nombreProyecto || 'este proyecto';
    if (!confirm(`¿Confirma que desea eliminar el proyecto "${nombreProy}" de forma definitiva del sistema?`)) {
      return;
    }

    try {
      if ('montoEstimado' in proyecto) {
        await deleteLicitacion(proyecto.id);
        if (proyectoMaestroVinculado) {
          await deleteProyectoMaestro(proyectoMaestroVinculado.id);
        }
      } else {
        await deleteProyectoMaestro(proyecto.id);
        if (licitacionVinculada) {
          await deleteLicitacion(licitacionVinculada.id);
        }
      }
      alert('✓ Proyecto eliminado correctamente.');
      onBack();
    } catch (err) {
      console.error('Error al eliminar proyecto desde ficha:', err);
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el proyecto.');
    }
  };

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
        {proyectoMaestroEfectivo && (
          <button
            onClick={() => setBasesAbierto(true)}
            className={`px-4 py-2.5 font-bold rounded-xl text-sm transition flex items-center gap-2 border shadow-sm ${
              proyectoMaestroEfectivo.bases?.estado === 'Aprobada' ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' :
              proyectoMaestroEfectivo.bases ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' :
              'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title={proyectoMaestroEfectivo.bases ? `Bases: ${proyectoMaestroEfectivo.bases.estado}` : 'Generar Bases Administrativas y Técnicas'}
          >
            <ScrollText className="w-4 h-4" />
            <span>Bases</span>
          </button>
        )}
        {proyectoMaestroEfectivo && (proyectoMaestroEfectivo.montoAdjudicado || 0) > 0 && (
          <button
            onClick={() => setContratoAbierto(true)}
            className={`px-4 py-2.5 font-bold rounded-xl text-sm transition flex items-center gap-2 border shadow-sm ${
              proyectoMaestroEfectivo.contrato?.estado === 'Firmado' ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' :
              proyectoMaestroEfectivo.contrato ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' :
              requiereContratoFormal(proyectoMaestroEfectivo.montoAdjudicado || 0, umbralContratoFormal) ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200' :
              'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title={
              proyectoMaestroEfectivo.contrato ? `Contrato: ${proyectoMaestroEfectivo.contrato.estado}` :
              requiereContratoFormal(proyectoMaestroEfectivo.montoAdjudicado || 0, umbralContratoFormal) ? `Desde ${formatoMonedaCLP(umbralContratoFormal ?? UMBRAL_CONTRATO_FORMAL)} (Anexo 1, Resolución VRAE 02/2014) se exige Licitación con Contrato formal firmado y equipo evaluador (Director de Proyecto/Unidad, VRAE o delegado, Secretaría General como ministro de fe) — no basta con la OC` :
              'Generar Contrato de Adjudicación (opcional bajo este monto)'
            }
          >
            <FileText className="w-4 h-4" />
            <span>Contrato</span>
          </button>
        )}
        <button
          onClick={handleDeleteProyectoFromFicha}
          className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-sm transition flex items-center gap-2 border border-rose-200 shadow-sm"
          title="Eliminar este proyecto de la Cartera"
        >
          <Trash2 className="w-4 h-4 text-rose-600" />
          <span>Eliminar Proyecto</span>
        </button>
      </div>

      {/* SECCIÓN DE ENCABEZADO PROMINENTE DEL PROYECTO (COMPACTA) */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 rounded-2xl shadow-sm overflow-hidden caratula-print border border-slate-600">
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Fila de Códigos */}
          <div className="flex flex-wrap gap-1.5">
            <div className="flex items-center gap-1 bg-slate-700 text-slate-100 px-2.5 py-1 rounded-full font-mono border border-slate-600 transition">
              <span className="text-[10px] font-extrabold uppercase">CP:</span>
              <input 
                type="text" 
                value={mainData.codigoCP}
                onChange={e => setMainData({...mainData, codigoCP: e.target.value})}
                onBlur={() => saveInlineUpdate({ codigoCP: mainData.codigoCP })}
                className="bg-transparent text-[10px] font-extrabold uppercase outline-none w-16 placeholder-slate-400"
                placeholder="CP..."
              />
            </div>
            <div className="flex items-center gap-1 bg-slate-700 text-slate-100 px-2.5 py-1 rounded-full font-mono border border-slate-600 transition">
              <span className="text-[10px] font-extrabold uppercase">Cód:</span>
              <input 
                type="text" 
                value={mainData.codigoProyecto}
                onChange={e => setMainData({...mainData, codigoProyecto: e.target.value})}
                onBlur={() => saveInlineUpdate({ codigoProyecto: mainData.codigoProyecto })}
                className="bg-transparent text-[10px] font-extrabold uppercase outline-none w-20 placeholder-slate-400"
                placeholder="ID Proy"
              />
            </div>
            <div className="flex items-center gap-1 bg-purple-900/80 text-purple-200 px-2.5 py-1 rounded-full font-mono border border-purple-600 transition">
              <span className="text-[10px] font-extrabold uppercase">OC:</span>
              <input 
                type="text" 
                value={mainData.codigoOC}
                onChange={e => setMainData({...mainData, codigoOC: e.target.value})}
                onBlur={() => saveInlineUpdate({ codigoOC: mainData.codigoOC })}
                className="bg-transparent text-[10px] font-extrabold uppercase outline-none w-24 placeholder-purple-400 text-purple-200 font-extrabold"
                placeholder="OC..."
              />
            </div>
            <div className="flex items-center gap-1 bg-slate-700 text-slate-100 px-2.5 py-1 rounded-full font-mono border border-slate-600 transition">
              <span className="text-[10px] font-extrabold uppercase">OT:</span>
              <input 
                type="text" 
                value={mainData.codigoOT}
                onChange={e => setMainData({...mainData, codigoOT: e.target.value})}
                onBlur={() => saveInlineUpdate({ codigoOT: mainData.codigoOT })}
                className="bg-transparent text-[10px] font-extrabold uppercase outline-none w-14 placeholder-slate-400"
                placeholder="OT..."
              />
            </div>
            <div className="flex items-center gap-1 bg-slate-700 text-slate-100 px-2.5 py-1 rounded-full font-mono border border-slate-600 transition">
              <span className="text-[10px] font-extrabold uppercase">OP:</span>
              <input 
                type="text" 
                value={mainData.codigoOP}
                onChange={e => setMainData({...mainData, codigoOP: e.target.value})}
                onBlur={() => saveInlineUpdate({ codigoOP: mainData.codigoOP })}
                className="bg-transparent text-[10px] font-extrabold uppercase outline-none w-14 placeholder-slate-400"
                placeholder="OP..."
              />
            </div>
          </div>

          {/* Nombre Principal y Descripción */}
          <div className="space-y-2">
            <textarea
              value={mainData.nombreProyecto}
              onChange={e => setMainData({...mainData, nombreProyecto: e.target.value})}
              onBlur={() => saveInlineUpdate({ nombreProyecto: mainData.nombreProyecto })}
              className="w-full bg-transparent text-xl sm:text-2xl font-black text-white leading-snug tracking-tight uppercase resize-none outline-none focus:bg-slate-800/50 rounded-lg p-1 -ml-1 transition border border-transparent focus:border-slate-600"
              rows={1}
              placeholder="Nombre del Proyecto..."
            />
            
            {/* Descripción del Proyecto */}
            <div className="bg-slate-700/40 p-2.5 rounded-xl border border-slate-600/70 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-xs sm:text-sm leading-relaxed font-normal">
                  {descripcionLocal || 'Sin descripción. Pulse Editar para agregar detalles del proyecto.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingDesc(true)}
                className="px-2.5 py-1 bg-slate-600/80 hover:bg-slate-500 text-white font-bold rounded-md text-[11px] transition flex items-center gap-1 shrink-0"
                title="Editar descripción"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            </div>
          </div>

          {/* Información Clave del Proyecto (4 Tarjetas Compactas) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-700/50 p-2.5 rounded-xl border border-slate-600/80 space-y-1">
              <p className="text-slate-300 text-[10px] font-extrabold uppercase">Campus / Edificio</p>
              <select
                value={mainData.campusSigla}
                onChange={(e) => {
                  const val = e.target.value;
                  setMainData({ ...mainData, campusSigla: val, edificioSigla: '' });
                  saveInlineUpdate({ campusSigla: val, edificioSigla: '' });
                }}
                className="w-full bg-slate-800 text-white text-xs font-bold border border-slate-600 rounded p-1 outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">UCT Central</option>
                {getCampusList().map(c => <option key={c.sigla} value={c.sigla}>{c.sigla}</option>)}
              </select>
              <select
                value={mainData.edificioSigla}
                onChange={(e) => {
                  const val = e.target.value;
                  setMainData({ ...mainData, edificioSigla: val });
                  saveInlineUpdate({ edificioSigla: val });
                }}
                disabled={!mainData.campusSigla}
                className="w-full bg-slate-800 text-slate-300 text-[11px] border border-slate-600 rounded p-1 outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Edificio (Todos)</option>
                {mainData.campusSigla && obtenerEdificiosDeCampus(mainData.campusSigla).map(ed => (
                  <option key={ed} value={ed}>Edificio {ed}</option>
                ))}
              </select>
            </div>
            
            <div className="bg-slate-700/50 p-2.5 rounded-xl border border-slate-600/80 space-y-1">
              <p className="text-slate-300 text-[10px] font-extrabold uppercase">Responsable UCT</p>
              <select
                value={mainData.responsableNombre}
                onChange={(e) => {
                  const nombre = e.target.value;
                  const r = RESPONSABLES_INFRAESTRUCTURA.find(resp => resp.nombre === nombre);
                  const email = r ? r.email : '';
                  setMainData({ ...mainData, responsableNombre: nombre, responsableEmail: email });
                  saveInlineUpdate({ responsableNombre: nombre, responsableEmail: email });
                }}
                className="w-full bg-slate-800 text-white text-xs font-bold border border-slate-600 rounded p-1 outline-none focus:ring-1 focus:ring-indigo-500 truncate"
              >
                <option value="">Sin Asignar</option>
                {RESPONSABLES_INFRAESTRUCTURA.map(r => <option key={r.codigo} value={r.nombre}>{r.nombre}</option>)}
              </select>
              <p className="text-slate-300 text-[10px] font-mono truncate pt-0.5">{mainData.responsableEmail}</p>
            </div>

            <div className="bg-slate-700/50 p-2.5 rounded-xl border border-slate-600/80 space-y-1">
              <p className="text-slate-300 text-[10px] font-extrabold uppercase flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-400" />
                {montoAumentosAprobados > 0 ? 'Contrato vigente' : tieneMontoAdjudicado ? 'Monto adjudicado' : 'Monto estimado'}
              </p>
              {tieneMontoAdjudicado ? (
                <p className="text-emerald-300 text-base font-black truncate">{formatoMonedaCLP(montoVigente)}</p>
              ) : (
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded border border-slate-600">
                  <span className="text-slate-400 font-bold ml-1 text-xs">$</span>
                  <input
                    type="text"
                    value={formatearEnteroConMiles(mainData.montoEstimado)}
                    onChange={e => setMainData({...mainData, montoEstimado: desformatearEntero(e.target.value)})}
                    onBlur={() => saveInlineUpdate({ montoEstimado: mainData.montoEstimado })}
                    className="bg-transparent text-white font-black w-full text-xs outline-none"
                  />
                </div>
              )}
              <select
                value={mainData.uso}
                onChange={(e) => {
                  setMainData({...mainData, uso: e.target.value});
                  saveInlineUpdate({ uso: e.target.value });
                }}
                className="w-full bg-slate-800 text-slate-300 text-[10px] border border-slate-600 rounded p-1 outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Uso General</option>
                <option value="Docencia">Docencia</option>
                <option value="Investigación">Investigación</option>
                <option value="Administración">Administración</option>
                <option value="Bienestar Estudiantil">Bienestar Estudiantil</option>
                <option value="Laboratorio">Laboratorio</option>
                <option value="Deportivo">Deportivo</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div className="bg-slate-700/50 p-2.5 rounded-xl border border-slate-600/80 space-y-1">
              <div className="flex items-center gap-1 mb-1">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
                <p className="text-slate-300 text-[10px] font-extrabold uppercase">Calendario y Plazos</p>
              </div>
              
              <div className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-600/50">
                  <span className="font-extrabold text-slate-400 text-[10px]">INICIO</span>
                  <PremiumDatePicker
                    icon={false}
                    value={mainData.fechaInicioObra || ''}
                    onChange={nuevaFecha => {
                      const nuevosDatos = { ...mainData, fechaInicioObra: nuevaFecha };
                      if (nuevaFecha && mainData.plazoAdjudicadoDias) {
                        const date = new Date(nuevaFecha);
                        date.setDate(date.getDate() + Number(mainData.plazoAdjudicadoDias));
                        nuevosDatos.fechaTerminoProgramada = date.toISOString().split('T')[0];
                      }
                      setMainData(nuevosDatos);
                      saveInlineUpdate({
                        fechaInicioObra: nuevosDatos.fechaInicioObra,
                        fechaTerminoProgramada: nuevosDatos.fechaTerminoProgramada
                      });
                    }}
                    className="bg-transparent border-0 p-0 font-bold text-white outline-none text-[11px] cursor-pointer text-right w-24"
                  />
                </div>

                <div className="flex items-center justify-between gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-600/50">
                  <span className="font-extrabold text-slate-400 text-[10px]">PLAZO</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={mainData.plazoAdjudicadoDias || ''}
                      onChange={e => {
                        const nuevoPlazo = parseInt(e.target.value) || 0;
                        const nuevosDatos = { ...mainData, plazoAdjudicadoDias: nuevoPlazo };
                        if (mainData.fechaInicioObra && nuevoPlazo > 0) {
                          const date = new Date(mainData.fechaInicioObra);
                          date.setDate(date.getDate() + nuevoPlazo);
                          nuevosDatos.fechaTerminoProgramada = date.toISOString().split('T')[0];
                        }
                        setMainData(nuevosDatos);
                      }}
                      onBlur={() => saveInlineUpdate({ 
                        plazoAdjudicadoDias: mainData.plazoAdjudicadoDias,
                        fechaTerminoProgramada: mainData.fechaTerminoProgramada
                      })}
                      className="bg-transparent font-extrabold text-indigo-400 outline-none w-10 text-right text-[11px]"
                      placeholder="0"
                      min="0"
                    />
                    <span className="text-[9px] text-slate-400 font-bold">días</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-600/50">
                  <span className="font-extrabold text-slate-400 text-[10px]">FIN</span>
                  <PremiumDatePicker
                    icon={false}
                    value={mainData.fechaTerminoProgramada || ''}
                    onChange={nuevaFechaFin => {
                      const nuevosDatos = { ...mainData, fechaTerminoProgramada: nuevaFechaFin };
                      if (nuevaFechaFin && mainData.fechaInicioObra) {
                        const start = new Date(mainData.fechaInicioObra);
                        const end = new Date(nuevaFechaFin);
                        const diffTime = Math.abs(end.getTime() - start.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        if (end >= start) {
                          nuevosDatos.plazoAdjudicadoDias = diffDays;
                        }
                      }
                      setMainData(nuevosDatos);
                      saveInlineUpdate({
                        fechaTerminoProgramada: nuevosDatos.fechaTerminoProgramada,
                        plazoAdjudicadoDias: nuevosDatos.plazoAdjudicadoDias
                      });
                    }}
                    className="bg-transparent border-0 p-0 font-bold text-emerald-400 outline-none text-[11px] cursor-pointer text-right w-24"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ─── INDICADORES DE GESTIÓN: RIESGO + SUPERFICIE ─── */}
          {'montoEstimado' in proyecto && (
            <div className="grid grid-cols-2 gap-2.5">
              {/* Nivel de Riesgo */}
              <div className="bg-slate-700/50 p-2.5 rounded-xl border border-slate-600/80 space-y-1.5">
                <p className="text-slate-300 text-[10px] font-extrabold uppercase flex items-center gap-1">
                  ⚠️ Nivel de Riesgo
                </p>
                <select
                  value={(proyecto as LicitacionProyecto).nivelRiesgo || ''}
                  onChange={(e) => {
                    const val = e.target.value as LicitacionProyecto['nivelRiesgo'];
                    saveInlineUpdate({ nivelRiesgo: val || undefined } as any);
                  }}
                  className="w-full bg-slate-800 text-white text-xs font-bold border border-slate-600 rounded p-1 outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">Sin evaluar</option>
                  <option value="Bajo">🟢 Bajo</option>
                  <option value="Medio">🟡 Medio</option>
                  <option value="Alto">🟠 Alto</option>
                  <option value="Crítico">🔴 Crítico</option>
                </select>
                <input
                  type="text"
                  placeholder="Motivo breve del riesgo..."
                  defaultValue={(proyecto as LicitacionProyecto).motivoRiesgo || ''}
                  onBlur={(e) => saveInlineUpdate({ motivoRiesgo: e.target.value } as any)}
                  className="w-full bg-slate-800 text-slate-300 text-[10px] border border-slate-600 rounded p-1 outline-none placeholder-slate-500"
                />
              </div>

              {/* Superficie m² */}
              <div className="bg-slate-700/50 p-2.5 rounded-xl border border-slate-600/80 space-y-1">
                <p className="text-slate-300 text-[10px] font-extrabold uppercase">
                  📐 Superficie (m²)
                </p>
                <div className="flex items-center gap-1 bg-slate-800 p-1.5 rounded border border-slate-600">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0.0"
                    defaultValue={(proyecto as LicitacionProyecto).superficieM2 || ''}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) saveInlineUpdate({ superficieM2: val } as any);
                    }}
                    className="bg-transparent text-white font-black outline-none w-full text-sm text-right"
                  />
                  <span className="text-slate-400 text-xs font-bold shrink-0">m²</span>
                </div>
                {(proyecto as LicitacionProyecto).montoAdjudicadoTotal && (proyecto as LicitacionProyecto).superficieM2 && (proyecto as LicitacionProyecto).superficieM2! > 0 && (
                  <p className="text-[10px] text-indigo-300 font-bold">
                    {formatoMonedaCLP(Math.round(((proyecto as LicitacionProyecto).montoAdjudicadoTotal || 0) / (proyecto as LicitacionProyecto).superficieM2!))}/m²
                  </p>
                )}
              </div>
            </div>
          )}

          {estaAdjudicado && (
            <div className="bg-emerald-950/70 p-3 rounded-xl border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-400/15 border border-emerald-400/20 flex items-center justify-center shrink-0">
                  <Building className="w-4 h-4 text-emerald-300" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">Proyecto adjudicado a</p>
                  <p className="text-sm font-black text-white">{proveedorAdjudicadoNombre || 'Proveedor adjudicado'}</p>
                  {proveedorAdjudicadoRut && <p className="text-[11px] text-emerald-100 font-mono">RUT {proveedorAdjudicadoRut}</p>}
                </div>
              </div>
              <div className="flex gap-2 text-right shrink-0">
                <div className="bg-white/5 rounded-lg px-2.5 py-1 border border-white/10">
                  <span className="block text-[8px] uppercase text-emerald-200">Monto oficial</span>
                  <strong className="text-xs text-white">{formatoMonedaCLP(montoVigente)}</strong>
                </div>
                <div className="bg-white/5 rounded-lg px-2.5 py-1 border border-white/10">
                  <span className="block text-[8px] uppercase text-emerald-200">Plazo adjudicado</span>
                  <strong className="text-xs text-white">{plazoVigenteDias ? `${plazoVigenteDias} días` : 'Por informar'}</strong>
                </div>
              </div>
            </div>
          )}

            {/* Barra de Progreso del Estado del Expediente */}
            <div className="bg-slate-700/50 p-5 rounded-2xl border border-slate-600">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-extrabold text-sm flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  Estado del Expediente
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

      {proyectoMaestroEfectivo && (
        <ItemizadoProyectoPanel proyecto={proyectoMaestroEfectivo} />
      )}

      {/* Grid Principal: Carátula Oficial (Izquierda) + CheckList y Documentos (Derecha) */}
      {licitacionEfectiva && estaAdjudicado && (
        <AumentosObraPanel
          licitacion={licitacionEfectiva}
          oferta={cotizacionAdjudicada}
          onChange={setAumentosObra}
        />
      )}

      <BitacoraProyectoPanel
        proyectoId={id}
        coleccionProyecto={licitacionEfectiva ? 'licitaciones' : 'proyectos'}
        responsableNombre={responsableNombre}
        responsableEmail={responsableEmail}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* COLUMNA IZQUIERDA: CARÁTULA OFICIAL DEL PROYECTO */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-md overflow-hidden caratula-print">
            {/* Encabezado Carátula */}
            <div className="bg-slate-900 text-white p-4 text-center border-b-2 border-slate-900 space-y-1">
              <span className="text-[10px] font-mono tracking-widest text-sky-300 uppercase block">
                UNIVERSIDAD CATÓLICA DE TEMUCO • SUBDIRECCIÓN DE INFRAESTRUCTURA
              </span>
              <h3 className="text-base font-black uppercase tracking-wide">
                CARÁTULA OFICIAL DE EXPEDIENTE
              </h3>
              <p className="text-[11px] text-slate-300 font-medium">PS-FOR-DGDC 0003 • Sistema de Control de Obras</p>
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
                  <span className="text-[10px] font-bold text-purple-700 block">Orden Compra (OC):</span>
                  <span className="font-extrabold text-purple-900 text-xs">{mainData.codigoOC || ordenCompraNumero || 'Pendiente'}</span>
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
                    <strong>{montoAumentosAprobados > 0 ? 'Contrato vigente:' : tieneMontoAdjudicado ? 'Monto oficial adjudicado:' : 'Monto estimado:'}</strong>{' '}
                    <strong className="text-emerald-800 font-extrabold">{formatoMonedaCLP(montoVigente)}</strong>
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
                      {plazoVigenteDias > 0 && <span className="block text-[10px] text-slate-600">Plazo vigente: {plazoVigenteDias} días corridos{diasAumentoAprobados > 0 ? ` (${plazoAdjudicadoDias || 0} originales + ${diasAumentoAprobados} de aumento)` : ''}</span>}
                    </span>
                  </div>
                )}
                {fechaInicioObra && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-sky-600 shrink-0" />
                    <span><strong>Programa contractual vigente:</strong> {new Intl.DateTimeFormat('es-CL').format(new Date(`${fechaInicioObra}T12:00:00`))} – {fechaTerminoVigente ? new Intl.DateTimeFormat('es-CL').format(new Date(`${fechaTerminoVigente}T12:00:00`)) : 'Término pendiente'}</span>
                  </div>
                )}
                {/* Bloque Destacado de Orden de Compra (OC) */}
                <div className="p-3.5 bg-purple-50/90 rounded-xl border border-purple-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-purple-200 text-purple-900 rounded-lg font-bold text-xs">💳 OC</span>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-purple-800 block">Número Orden de Compra:</span>
                        {mainData.codigoOC || ordenCompraNumero ? (
                          <strong className="text-purple-950 font-black text-sm block font-mono">
                            {mainData.codigoOC || ordenCompraNumero}
                          </strong>
                        ) : (
                          <span className="text-purple-600 italic text-xs block">
                            Sin Orden de Compra cargada
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOCModal(true)}
                      className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-xs transition shadow-sm shrink-0"
                    >
                      {mainData.codigoOC || ordenCompraNumero ? 'Reemplazar / Ver OC' : 'Cargar OC (PDF/Excel)'}
                    </button>
                  </div>
                  {('archivoOCNombre' in proyecto && (proyecto as any).archivoOCNombre) ? (
                    <p className="text-[11px] text-purple-900 font-semibold border-t border-purple-200/60 pt-1.5">
                      📄 Archivo registrado: <strong>{(proyecto as any).archivoOCNombre}</strong> {(proyecto as any).fechaCargaOC ? `(${ (proyecto as any).fechaCargaOC })` : ''}
                    </p>
                  ) : null}
                </div>

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
                  <span>Checklist de Contenidos del Proyecto (Expediente)</span>
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
                    onClick={() => setDescripcionLocal(corregirTextoAvanzado(descripcionLocal))}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                    title="Corrige tildes y errores de tipeo comparando cada palabra contra un vocabulario base"
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
                          {doc.archivoURL ? (
                            <button
                              type="button"
                              onClick={() => window.open(doc.archivoURL, '_blank')}
                              className="p-1.5 text-blue-700 hover:bg-blue-100 rounded-lg transition"
                              title="Ver / Descargar archivo"
                            >
                              <Cloud className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => alert(`"${doc.nombre}" quedó registrado solo como referencia (sin archivo adjunto). Edite el documento y adjunte el archivo para poder descargarlo.`)}
                              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition"
                              title="Sin archivo adjunto"
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

      {/* Modal Carga Orden de Compra */}
      {showOCModal && (
        <CargaOrdenCompraModal
          licitacion={licitacionEfectiva || {
            id: proyecto.id,
            codigoCP: proyecto.codigoCP || '409-1722',
            codigoOP: mainData.codigoOP || ('codigoOP' in proyecto ? (proyecto as any).codigoOP : ''),
            codigoOT: mainData.codigoOT || ('codigoOT' in proyecto ? (proyecto as any).codigoOT : ''),
            codigoProyecto: mainData.codigoProyecto || ('codigoProyecto' in proyecto ? (proyecto as any).codigoProyecto : ''),
            nombreProyecto: nombreProyecto,
            descripcion: 'descripcion' in proyecto ? ((proyecto as any).descripcion || '') : '',
            montoEstimado: montoEstimado,
            fechaEvaluacion: '',
            estado: 'Adjudicado',
            ordenCompraNumero: mainData.codigoOC || ordenCompraNumero,
            proyectoMaestroId: proyecto.id,
            archivoOCNombre: 'archivoOCNombre' in proyecto ? (proyecto as any).archivoOCNombre : undefined,
          }}
          onClose={() => setShowOCModal(false)}
          onSuccess={() => {
            onUpdateSuccess?.();
          }}
        />
      )}

      {basesAbierto && proyectoMaestroEfectivo && (
        <BasesLicitacionModal
          proyecto={proyectoMaestroEfectivo}
          licitacion={licitacionEfectiva}
          onClose={() => setBasesAbierto(false)}
        />
      )}

      {contratoAbierto && proyectoMaestroEfectivo && (
        <ContratoAdjudicacionModal
          proyecto={proyectoMaestroEfectivo}
          proveedores={proveedorAdjudicado ? [proveedorAdjudicado] : []}
          onClose={() => setContratoAbierto(false)}
        />
      )}

    </div>
  );
};
