import React, { useState, useEffect } from 'react';
import type { ConfiguracionFirmas } from '../types';
import { useAuth } from '../context/AuthContext';
import { ResetCarteraModal } from './ResetCarteraModal';
import {
  getResponsablesList,
  saveResponsablesList,
  type ResponsableInfraestructura,
} from '../data/responsablesData';
import {
  getCentrosCostoList,
  saveCentrosCostoList,
  type CentroCosto,
} from '../data/centrosCostoData';
import {
  getTiposObraList,
  saveTiposObraList,
  type TipoObraInfo,
} from '../data/tiposObraData';
import {
  getEstadosProyectoList,
  saveEstadosProyectoList,
  type EstadoProyectoInfo,
} from '../data/estadosProyectoData';
import {
  getRubrosList,
  saveRubrosList,
  type RubroProveedor,
} from '../data/rubrosData';
import { getCampusList, saveCampusList, type CampusInfo } from '../data/campusData';
import {
  Settings,
  Save,
  RotateCcw,
  Users,
  Building2,
  Sliders,
  FileSignature,
  Download,
  Upload,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Check,
  Building,
  CreditCard,
  Tag,
  Hammer,
  BookmarkCheck,
  Briefcase,
  ScrollText,
  MapPin,
  X,
  DollarSign,
} from 'lucide-react';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { uploadFirmaImagen } from '../services/storageService';
import { updateUserProfile } from '../services/firestoreService';
import {
  getPlantillaBasesPorFamilia,
  guardarPlantillaBasesPorFamilia,
  restaurarPlantillaBasesPorFamilia,
  FAMILIA_BASES_LABEL,
  type FamiliaBases,
  type SeccionBases,
} from '../data/basesTemplateData';

interface SettingsViewProps {
  config: ConfiguracionFirmas;
  onSaveConfig: (newConfig: ConfiguracionFirmas) => void;
  onResetData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  onSaveConfig,
  onResetData,
}) => {
  const [activeTab, setActiveTab] = useState<
    'parametros' | 'centrosCosto' | 'tiposObra' | 'estadosProyecto' | 'rubros' | 'responsables' | 'firmas' | 'campus' | 'plantillasBases' | 'respaldos'
  >('parametros');
  const { isAdmin, user, profile } = useAuth();
  const [resetCarteraAbierto, setResetCarteraAbierto] = useState(false);

  // Firma manuscrita personal (enrolamiento del usuario logueado)
  const [firmaImagenLocal, setFirmaImagenLocal] = useState<string | undefined>(profile?.firmaImagenURL);
  const [subiendoFirma, setSubiendoFirma] = useState(false);

  useEffect(() => {
    setFirmaImagenLocal(profile?.firmaImagenURL);
  }, [profile?.firmaImagenURL]);

  const handleSubirFirma = async (file?: File) => {
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      alert('Seleccione una imagen (PNG o JPG) de su firma.');
      return;
    }
    setSubiendoFirma(true);
    try {
      const url = await uploadFirmaImagen(user.uid, file);
      await updateUserProfile(user.uid, { firmaImagenURL: url });
      setFirmaImagenLocal(url);
    } catch (error) {
      console.error('Error al subir la firma:', error);
      alert('No se pudo guardar la firma. Intente nuevamente.');
    } finally {
      setSubiendoFirma(false);
    }
  };

  // Plantillas maestras de Bases por familia de Tipo de Obra
  const [familiaBasesEditando, setFamiliaBasesEditando] = useState<FamiliaBases>('obra-civil');
  const [seccionesBasesEditando, setSeccionesBasesEditando] = useState<SeccionBases[]>(() => getPlantillaBasesPorFamilia('obra-civil'));
  const [hasChangesBases, setHasChangesBases] = useState(false);

  const cambiarFamiliaBasesEditando = (familia: FamiliaBases) => {
    setFamiliaBasesEditando(familia);
    setSeccionesBasesEditando(getPlantillaBasesPorFamilia(familia));
    setHasChangesBases(false);
  };

  const actualizarSeccionBasesEditando = (id: string, contenido: string) => {
    setSeccionesBasesEditando(prev => prev.map(s => (s.id === id ? { ...s, contenido } : s)));
    setHasChangesBases(true);
  };

  const guardarPlantillaBasesEditando = () => {
    guardarPlantillaBasesPorFamilia(familiaBasesEditando, seccionesBasesEditando);
    setHasChangesBases(false);
    alert(`Plantilla de bases "${FAMILIA_BASES_LABEL[familiaBasesEditando]}" guardada. Se usará para los próximos proyectos de este tipo.`);
  };

  const restaurarPlantillaBasesEditando = () => {
    if (!confirm('¿Restaurar esta plantilla a su contenido original de fábrica? Se perderán los cambios guardados para esta familia.')) return;
    setSeccionesBasesEditando(restaurarPlantillaBasesPorFamilia(familiaBasesEditando));
    setHasChangesBases(false);
  };

  // State para detectar cambios no guardados
  const [hasChanges, setHasChanges] = useState(false);

  // State principal de Configuración
  const [formData, setFormData] = useState<ConfiguracionFirmas>(config);

  const updateFormData = (updater: (prev: ConfiguracionFirmas) => ConfiguracionFirmas) => {
    setFormData(prev => updater(prev));
    setHasChanges(true);
  };
  
  // State de Responsables de Infraestructura
  const [responsables, setResponsables] = useState<ResponsableInfraestructura[]>([]);
  const [busquedaResponsable, setBusquedaResponsable] = useState('');
  const [isEditingResponsable, setIsEditingResponsable] = useState(false);
  const [respEditando, setRespEditando] = useState<ResponsableInfraestructura>({
    codigo: '',
    nombre: '',
    email: '',
    cargo: '',
    telefono: '',
    estado: 'Activo',
  });

  // State de Centros de Costo (CP / CC)
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [busquedaCC, setBusquedaCC] = useState('');
  const [isEditingCC, setIsEditingCC] = useState(false);
  const [ccEditando, setCcEditando] = useState<CentroCosto>({
    codigoCP: '',
    nombre: '',
    estado: 'Activo',
    descripcion: '',
  });

  // State de Tipos de Obra
  const [tiposObra, setTiposObra] = useState<TipoObraInfo[]>([]);
  const [busquedaTipoObra, setBusquedaTipoObra] = useState('');
  const [isEditingTipoObra, setIsEditingTipoObra] = useState(false);
  const [tipoObraEditando, setTipoObraEditando] = useState<TipoObraInfo>({
    id: '',
    nombre: '',
    estado: 'Activo',
    descripcion: '',
  });

  // State de Estados de Proyecto
  const [estadosProyecto, setEstadosProyecto] = useState<EstadoProyectoInfo[]>([]);
  const [busquedaEstadoProyecto, setBusquedaEstadoProyecto] = useState('');
  const [isEditingEstadoProyecto, setIsEditingEstadoProyecto] = useState(false);
  const [estadoProyectoEditando, setEstadoProyectoEditando] = useState<EstadoProyectoInfo>({
    id: '',
    nombre: '',
    colorBadge: 'bg-sky-100 text-sky-900 border-sky-300',
    estado: 'Activo',
    descripcion: '',
  });

  // State de Rubros de Proveedores
  const [rubros, setRubros] = useState<RubroProveedor[]>([]);
  const [busquedaRubro, setBusquedaRubro] = useState('');
  const [isEditingRubro, setIsEditingRubro] = useState(false);
  const [rubroEditando, setRubroEditando] = useState<RubroProveedor>({
    id: '',
    nombre: '',
    estado: 'Activo',
    descripcion: '',
  });

  // State de Campus y Edificios
  const CAMPUS_VACIO: CampusInfo = { sigla: '', nombre: '', ciudad: '', direccion: '', edificios: [] };
  const [campusList, setCampusList] = useState<CampusInfo[]>([]);
  const [busquedaCampus, setBusquedaCampus] = useState('');
  const [isEditingCampus, setIsEditingCampus] = useState(false);
  const [campusEditando, setCampusEditando] = useState<CampusInfo>(CAMPUS_VACIO);
  const [nuevoEdificioInput, setNuevoEdificioInput] = useState('');

  // Cargar datos iniciales
  useEffect(() => {
    setFormData(config);
    setResponsables(getResponsablesList());
    setCentrosCosto(getCentrosCostoList());
    setTiposObra(getTiposObraList());
    setEstadosProyecto(getEstadosProyectoList());
    setRubros(getRubrosList());
    setCampusList(getCampusList());
    setHasChanges(false);
  }, [config]);

  // Manejadores de Ponderaciones
  const paramSgc = formData.parametrosSgc || {
    porcentajeEconomico: 55,
    porcentajeTecnico: 35,
    porcentajeSustentabilidad: 10,
    tasaIva: 19,
    umbralActaObligatoria: 800001,
    umbralAprobacionVrae: 5000001,
    umbralContratoFormal: 25000001,
  };

  const sumaPonderaciones =
    (paramSgc.porcentajeEconomico || 0) +
    (paramSgc.porcentajeTecnico || 0) +
    (paramSgc.porcentajeSustentabilidad || 0);

  const ponderacionesValidas = sumaPonderaciones === 100;

  // Manejador del submit general
  const handleGuardarCambios = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ponderacionesValidas) {
      alert('La suma de las ponderaciones de evaluación (Económica, Técnica y Sustentabilidad) debe ser exactamente igual a 100%.');
      return;
    }
    saveResponsablesList(responsables);
    saveCentrosCostoList(centrosCosto);
    saveTiposObraList(tiposObra);
    saveEstadosProyectoList(estadosProyecto);
    saveRubrosList(rubros);
    saveCampusList(campusList);
    onSaveConfig(formData);
    setHasChanges(false);
    alert('¡Configuración del Sistema guardada exitosamente!');
  };

  // CRUD Rubros de Proveedores
  const handleGuardarRubro = () => {
    if (!rubroEditando.nombre.trim()) {
      alert('Por favor ingrese el nombre del Rubro de Proveedor.');
      return;
    }

    const index = rubros.findIndex(
      r => r.id === rubroEditando.id || r.nombre.toLowerCase() === rubroEditando.nombre.toLowerCase()
    );

    let actualizada: RubroProveedor[];
    if (index >= 0 && isEditingRubro) {
      actualizada = [...rubros];
      actualizada[index] = rubroEditando;
    } else {
      if (rubros.some(r => r.nombre.toLowerCase() === rubroEditando.nombre.toLowerCase())) {
        alert('Ya existe un Rubro registrado con esa denominación.');
        return;
      }
      const nuevoItem = {
        ...rubroEditando,
        id: rubroEditando.id || `rub-${Date.now()}`,
      };
      actualizada = [nuevoItem, ...rubros];
    }

    setRubros(actualizada);
    saveRubrosList(actualizada);
    setRubroEditando({ id: '', nombre: '', estado: 'Activo', descripcion: '' });
    setIsEditingRubro(false);
    setHasChanges(true);
  };

  const handleEliminarRubro = (id: string) => {
    if (confirm('¿Confirma eliminar este Rubro de Proveedor?')) {
      const filtrada = rubros.filter(r => r.id !== id);
      setRubros(filtrada);
      saveRubrosList(filtrada);
      setHasChanges(true);
    }
  };

  const handleToggleRubroStatus = (id: string) => {
    const actualizada = rubros.map(r => {
      if (r.id === id) {
        return { ...r, estado: (r.estado === 'Inactivo' ? 'Activo' : 'Inactivo') as 'Activo' | 'Inactivo' };
      }
      return r;
    });
    setRubros(actualizada);
    saveRubrosList(actualizada);
    setHasChanges(true);
  };

  // CRUD Campus y Edificios
  const handleGuardarCampus = () => {
    const sigla = campusEditando.sigla.trim().toUpperCase();
    if (!sigla || !campusEditando.nombre.trim()) {
      alert('Ingrese al menos la sigla y el nombre del Campus.');
      return;
    }

    const index = campusList.findIndex(c => c.sigla === sigla);
    let actualizada: CampusInfo[];
    if (index >= 0 && isEditingCampus) {
      actualizada = [...campusList];
      actualizada[index] = { ...campusEditando, sigla };
    } else {
      if (campusList.some(c => c.sigla === sigla)) {
        alert('Ya existe un Campus registrado con esa sigla.');
        return;
      }
      actualizada = [...campusList, { ...campusEditando, sigla }];
    }

    setCampusList(actualizada);
    saveCampusList(actualizada);
    setCampusEditando(CAMPUS_VACIO);
    setNuevoEdificioInput('');
    setIsEditingCampus(false);
    setHasChanges(true);
  };

  const handleEliminarCampus = (sigla: string) => {
    if (confirm(`¿Confirma eliminar el Campus "${sigla}" y su lista de edificios? Los proyectos ya asociados a esta sigla conservarán el valor guardado.`)) {
      const filtrada = campusList.filter(c => c.sigla !== sigla);
      setCampusList(filtrada);
      saveCampusList(filtrada);
      setHasChanges(true);
    }
  };

  const handleAgregarEdificio = () => {
    const nuevo = nuevoEdificioInput.trim().toUpperCase();
    if (!nuevo) return;
    if (campusEditando.edificios.includes(nuevo)) {
      setNuevoEdificioInput('');
      return;
    }
    setCampusEditando({ ...campusEditando, edificios: [...campusEditando.edificios, nuevo] });
    setNuevoEdificioInput('');
  };

  const handleQuitarEdificio = (edificio: string) => {
    setCampusEditando({ ...campusEditando, edificios: campusEditando.edificios.filter(e => e !== edificio) });
  };

  const campusFiltrados = campusList.filter(c =>
    c.sigla.toLowerCase().includes(busquedaCampus.toLowerCase()) ||
    c.nombre.toLowerCase().includes(busquedaCampus.toLowerCase()) ||
    c.ciudad.toLowerCase().includes(busquedaCampus.toLowerCase())
  );

  const rubrosFiltrados = rubros.filter(r =>
    r.nombre.toLowerCase().includes(busquedaRubro.toLowerCase()) ||
    (r.descripcion && r.descripcion.toLowerCase().includes(busquedaRubro.toLowerCase()))
  );

  // CRUD Estados de Proyecto
  const handleGuardarEstadoProyecto = () => {
    if (!estadoProyectoEditando.nombre.trim()) {
      alert('Por favor ingrese el nombre del Estado del Proyecto.');
      return;
    }

    const index = estadosProyecto.findIndex(
      e => e.id === estadoProyectoEditando.id || e.nombre.toLowerCase() === estadoProyectoEditando.nombre.toLowerCase()
    );

    let actualizada: EstadoProyectoInfo[];
    if (index >= 0 && isEditingEstadoProyecto) {
      actualizada = [...estadosProyecto];
      actualizada[index] = estadoProyectoEditando;
    } else {
      if (estadosProyecto.some(e => e.nombre.toLowerCase() === estadoProyectoEditando.nombre.toLowerCase())) {
        alert('Ya existe un Estado de Proyecto registrado con ese nombre.');
        return;
      }
      const nuevoItem = {
        ...estadoProyectoEditando,
        id: estadoProyectoEditando.id || `est-${Date.now()}`,
      };
      actualizada = [nuevoItem, ...estadosProyecto];
    }

    setEstadosProyecto(actualizada);
    saveEstadosProyectoList(actualizada);
    setEstadoProyectoEditando({ id: '', nombre: '', colorBadge: 'bg-sky-100 text-sky-900 border-sky-300', estado: 'Activo', descripcion: '' });
    setIsEditingEstadoProyecto(false);
  };

  const handleEliminarEstadoProyecto = (id: string) => {
    if (confirm('¿Confirma eliminar este Estado de Proyecto?')) {
      const filtrada = estadosProyecto.filter(e => e.id !== id);
      setEstadosProyecto(filtrada);
      saveEstadosProyectoList(filtrada);
    }
  };

  const handleToggleEstadoProyectoStatus = (id: string) => {
    const actualizada = estadosProyecto.map(e => {
      if (e.id === id) {
        return { ...e, estado: (e.estado === 'Inactivo' ? 'Activo' : 'Inactivo') as 'Activo' | 'Inactivo' };
      }
      return e;
    });
    setEstadosProyecto(actualizada);
    saveEstadosProyectoList(actualizada);
  };

  const estadosProyectoFiltrados = estadosProyecto.filter(e =>
    e.nombre.toLowerCase().includes(busquedaEstadoProyecto.toLowerCase()) ||
    (e.descripcion && e.descripcion.toLowerCase().includes(busquedaEstadoProyecto.toLowerCase()))
  );

  // CRUD Tipos de Obra
  const handleGuardarTipoObra = () => {
    if (!tipoObraEditando.nombre.trim()) {
      alert('Por favor ingrese el nombre del Tipo de Obra.');
      return;
    }

    const index = tiposObra.findIndex(
      t => t.id === tipoObraEditando.id || t.nombre.toLowerCase() === tipoObraEditando.nombre.toLowerCase()
    );

    let actualizada: TipoObraInfo[];
    if (index >= 0 && isEditingTipoObra) {
      actualizada = [...tiposObra];
      actualizada[index] = tipoObraEditando;
    } else {
      if (tiposObra.some(t => t.nombre.toLowerCase() === tipoObraEditando.nombre.toLowerCase())) {
        alert('Ya existe un Tipo de Obra con esa denominación.');
        return;
      }
      const nuevoItem = {
        ...tipoObraEditando,
        id: tipoObraEditando.id || `tipo-${Date.now()}`,
      };
      actualizada = [nuevoItem, ...tiposObra];
    }

    setTiposObra(actualizada);
    saveTiposObraList(actualizada);
    setTipoObraEditando({ id: '', nombre: '', estado: 'Activo', descripcion: '' });
    setIsEditingTipoObra(false);
  };

  const handleEliminarTipoObra = (id: string) => {
    if (confirm('¿Confirma eliminar este Tipo de Obra?')) {
      const filtrada = tiposObra.filter(t => t.id !== id);
      setTiposObra(filtrada);
      saveTiposObraList(filtrada);
    }
  };

  const handleToggleEstadoTipoObra = (id: string) => {
    const actualizada = tiposObra.map(t => {
      if (t.id === id) {
        return { ...t, estado: (t.estado === 'Inactivo' ? 'Activo' : 'Inactivo') as 'Activo' | 'Inactivo' };
      }
      return t;
    });
    setTiposObra(actualizada);
    saveTiposObraList(actualizada);
  };

  const tiposObraFiltrados = tiposObra.filter(t =>
    t.nombre.toLowerCase().includes(busquedaTipoObra.toLowerCase()) ||
    (t.descripcion && t.descripcion.toLowerCase().includes(busquedaTipoObra.toLowerCase()))
  );

  // CRUD Centros de Costo
  const handleGuardarCC = () => {
    if (!ccEditando.codigoCP.trim() || !ccEditando.nombre.trim()) {
      alert('Por favor ingrese tanto el Código CP (ej: 409-1722) como la Denominación del Centro de Costo.');
      return;
    }

    const index = centrosCosto.findIndex(
      c => c.codigoCP.toLowerCase() === ccEditando.codigoCP.toLowerCase()
    );

    let actualizada: CentroCosto[];
    if (index >= 0 && isEditingCC) {
      actualizada = [...centrosCosto];
      actualizada[index] = ccEditando;
    } else {
      if (centrosCosto.some(c => c.codigoCP.toLowerCase() === ccEditando.codigoCP.toLowerCase())) {
        alert('Ya existe un Centro de Costo registrado con ese código CP.');
        return;
      }
      actualizada = [ccEditando, ...centrosCosto];
    }

    setCentrosCosto(actualizada);
    saveCentrosCostoList(actualizada);
    setCcEditando({ codigoCP: '', nombre: '', estado: 'Activo', descripcion: '' });
    setIsEditingCC(false);
  };

  const handleEliminarCC = (codigoCP: string) => {
    if (confirm(`¿Confirma eliminar el Centro de Costo "${codigoCP}"?`)) {
      const filtrada = centrosCosto.filter(c => c.codigoCP !== codigoCP);
      setCentrosCosto(filtrada);
      saveCentrosCostoList(filtrada);
    }
  };

  const handleToggleEstadoCC = (codigoCP: string) => {
    const actualizada = centrosCosto.map(c => {
      if (c.codigoCP === codigoCP) {
        return { ...c, estado: (c.estado === 'Inactivo' ? 'Activo' : 'Inactivo') as 'Activo' | 'Inactivo' };
      }
      return c;
    });
    setCentrosCosto(actualizada);
    saveCentrosCostoList(actualizada);
  };

  const centrosCostoFiltrados = centrosCosto.filter(c =>
    c.codigoCP.toLowerCase().includes(busquedaCC.toLowerCase()) ||
    c.nombre.toLowerCase().includes(busquedaCC.toLowerCase()) ||
    (c.descripcion && c.descripcion.toLowerCase().includes(busquedaCC.toLowerCase()))
  );

  // CRUD Responsables
  const handleGuardarResponsable = () => {
    if (!respEditando.nombre.trim() || !respEditando.codigo.trim()) {
      alert('Por favor ingrese al menos el nombre y código del responsable.');
      return;
    }

    const index = responsables.findIndex(
      r => r.codigo.toLowerCase() === respEditando.codigo.toLowerCase()
    );

    let actualizada: ResponsableInfraestructura[];
    if (index >= 0 && isEditingResponsable) {
      actualizada = [...responsables];
      actualizada[index] = respEditando;
    } else {
      if (responsables.some(r => r.codigo.toLowerCase() === respEditando.codigo.toLowerCase())) {
        alert('Ya existe un responsable registrado con ese código. Ingrese un código único.');
        return;
      }
      actualizada = [respEditando, ...responsables];
    }

    setResponsables(actualizada);
    saveResponsablesList(actualizada);
    setRespEditando({ codigo: '', nombre: '', email: '', cargo: '', telefono: '', estado: 'Activo' });
    setIsEditingResponsable(false);
  };

  const handleEliminarResponsable = (codigo: string) => {
    if (confirm(`¿Confirma eliminar al responsable "${codigo}"?`)) {
      const filtrada = responsables.filter(r => r.codigo !== codigo);
      setResponsables(filtrada);
      saveResponsablesList(filtrada);
    }
  };

  const handleToggleEstadoResponsable = (codigo: string) => {
    const actualizada = responsables.map(r => {
      if (r.codigo === codigo) {
        return { ...r, estado: (r.estado === 'Inactivo' ? 'Activo' : 'Inactivo') as 'Activo' | 'Inactivo' };
      }
      return r;
    });
    setResponsables(actualizada);
    saveResponsablesList(actualizada);
  };

  const responsablesFiltrados = responsables.filter(r =>
    r.nombre.toLowerCase().includes(busquedaResponsable.toLowerCase()) ||
    r.codigo.toLowerCase().includes(busquedaResponsable.toLowerCase()) ||
    (r.cargo && r.cargo.toLowerCase().includes(busquedaResponsable.toLowerCase())) ||
    (r.email && r.email.toLowerCase().includes(busquedaResponsable.toLowerCase()))
  );

  // Exportar / Importar Configuración JSON
  const handleExportarConfigJSON = () => {
    const payload = {
      configFirmas: formData,
      responsables,
      centrosCosto,
      tiposObra,
      estadosProyecto,
      fechaExportacion: new Date().toISOString(),
      version: '2026-v5',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Configuracion_Infraestructura_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportarConfigJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        if (json.configFirmas) {
          setFormData(json.configFirmas);
        }
        if (Array.isArray(json.responsables)) {
          setResponsables(json.responsables);
          saveResponsablesList(json.responsables);
        }
        if (Array.isArray(json.centrosCosto)) {
          setCentrosCosto(json.centrosCosto);
          saveCentrosCostoList(json.centrosCosto);
        }
        if (Array.isArray(json.tiposObra)) {
          setTiposObra(json.tiposObra);
          saveTiposObraList(json.tiposObra);
        }
        if (Array.isArray(json.estadosProyecto)) {
          setEstadosProyecto(json.estadosProyecto);
          saveEstadosProyectoList(json.estadosProyecto);
        }
        alert('¡Configuración importada con éxito!');
      } catch {
        alert('El archivo seleccionado no tiene un formato JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      
      {/* Banner Principal de la Página de Configuración */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 border border-sky-200 shadow-xs">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span>Configuración del Sistema & Infraestructura</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Administración centralizada de parámetros de licitación, centros de costo, tipos de obra, estados de proyectos, responsables, firmantes y sedes.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleGuardarCambios()}
          className={`px-5 py-2.5 font-extrabold rounded-xl shadow-md transition text-xs flex items-center gap-2 shrink-0 ${
            hasChanges
              ? 'bg-gradient-to-r from-emerald-600 via-sky-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white ring-2 ring-emerald-400 shadow-emerald-500/30 animate-pulse'
              : 'bg-sky-600 hover:bg-sky-700 text-white'
          }`}
        >
          <Save className="w-4 h-4" />
          <span>{hasChanges ? '★ Guardar Cambios Pendientes' : 'Guardar Configuración General'}</span>
        </button>
      </div>

      {/* Grid de Navegación de la Página */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Sidebar Nav (Izquierda) */}
        <div className="lg:col-span-1 space-y-2">
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 px-3 py-1 block tracking-wider">
              Módulos de Parámetros
            </span>

            <button
              type="button"
              onClick={() => setActiveTab('parametros')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'parametros'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4" />
                <span>1. Parámetros de Licitación</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'parametros' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                Fórmulas
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('centrosCosto')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'centrosCosto'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4" />
                <span>2. Centros de Costo (CP)</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'centrosCosto' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {centrosCosto.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tiposObra')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'tiposObra'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Hammer className="w-4 h-4" />
                <span>3. Tipos de Obra</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'tiposObra' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {tiposObra.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('estadosProyecto')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'estadosProyecto'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookmarkCheck className="w-4 h-4" />
                <span>4. Estados del Proyecto</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'estadosProyecto' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {estadosProyecto.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rubros')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'rubros'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Briefcase className="w-4 h-4" />
                <span>5. Rubros de Proveedores</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'rubros' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {rubros.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('responsables')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'responsables'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>6. Responsables e ITOs</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'responsables' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {responsables.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('firmas')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'firmas'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileSignature className="w-4 h-4" />
                <span>6. Firmantes Oficiales</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'firmas' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                4
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('campus')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'campus'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4" />
                <span>7. Sedes & Campus</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'campus' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {campusList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('plantillasBases')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'plantillasBases'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ScrollText className="w-4 h-4" />
                <span>8. Plantillas de Bases</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'plantillasBases' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                5
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('respaldos')}
              className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-xs flex items-center justify-between transition ${
                activeTab === 'respaldos'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4" />
                <span>8. Respaldos & Sistema</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'respaldos' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                JSON
              </span>
            </button>

          </div>
        </div>

        {/* Panel de Contenido Principal (Derecha) */}
        <div className="lg:col-span-3">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[500px]">

            {/* TAB 1: PARÁMETROS DE LICITACIÓN */}
            {activeTab === 'parametros' && (
              <div className="space-y-6 text-xs">
                
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Building className="w-4 h-4 text-sky-600" />
                    <span>Identificación Institucional</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Institución UCT</label>
                      <input
                        type="text"
                        value={formData.institucion}
                        onChange={e => updateFormData(prev => ({ ...prev, institucion: e.target.value }))}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Subdirección / Unidad Emisora</label>
                      <input
                        type="text"
                        value={formData.subdireccion}
                        onChange={e => updateFormData(prev => ({ ...prev, subdireccion: e.target.value }))}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-sky-600" />
                        <span>Matriz de Ponderaciones (PS-FOR-DGDC 0003)</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Defina los pesos de ponderación para la evaluación objetiva de ofertas de infraestructura.
                      </p>
                    </div>

                    <div className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 text-xs shrink-0 ${
                      ponderacionesValidas
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}>
                      {ponderacionesValidas ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Suma: 100% (VÁLIDA)</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <span>Suma Actual: {sumaPonderaciones}%</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="p-4 bg-sky-50/70 rounded-2xl border border-sky-100 space-y-2">
                      <label className="block font-bold text-sky-950">1. Oferta Económica (%)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={paramSgc.porcentajeEconomico}
                          onChange={e =>
                            updateFormData(prev => ({
                              ...prev,
                              parametrosSgc: { ...paramSgc, porcentajeEconomico: Number(e.target.value) },
                            }))
                          }
                          className="w-full px-3 py-2 bg-white border border-sky-300 rounded-xl text-sm font-extrabold text-sky-900 outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <span className="font-bold text-sky-800 text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Menor precio ofertado con impuestos incluidos.</p>
                    </div>

                    <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 space-y-2">
                      <label className="block font-bold text-indigo-950">2. Oferta Técnica (%)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={paramSgc.porcentajeTecnico}
                          onChange={e =>
                            updateFormData(prev => ({
                              ...prev,
                              parametrosSgc: { ...paramSgc, porcentajeTecnico: Number(e.target.value) },
                            }))
                          }
                          className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-xl text-sm font-extrabold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-indigo-800 text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Requerimientos técnicos, experiencia e itinerario.</p>
                    </div>

                    <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-100 space-y-2">
                      <label className="block font-bold text-emerald-950">3. Sustentabilidad (%)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={paramSgc.porcentajeSustentabilidad}
                          onChange={e =>
                            updateFormData(prev => ({
                              ...prev,
                              parametrosSgc: { ...paramSgc, porcentajeSustentabilidad: Number(e.target.value) },
                            }))
                          }
                          className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-sm font-extrabold text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="font-bold text-emerald-800 text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Certificación o prácticas sustentables declaradas.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-200 space-y-3">
                  <h4 className="font-bold text-indigo-950 text-sm flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-indigo-600" />
                    <span>Presupuesto Anual Aprobado 2026</span>
                  </h4>
                  <p className="text-[11px] text-indigo-800">
                    Techo institucional del año. La Cartera de Proyectos lo usa para avisar si el total comprometido/adjudicado se acerca o sobrepasa este monto — no es lo mismo que la suma de montos adjudicados por proyecto.
                  </p>
                  <div>
                    <input
                      type="number"
                      value={formData.presupuestoAnualAprobado || 0}
                      onChange={e =>
                        updateFormData(prev => ({
                          ...prev,
                          presupuestoAnualAprobado: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3.5 py-2 border border-indigo-300 rounded-xl outline-none font-mono font-bold text-indigo-900 bg-white"
                    />
                    <span className="text-[10px] text-indigo-700 font-semibold">{formatoMonedaCLP(formData.presupuestoAnualAprobado || 0)}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    <span>Umbrales Financieros</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tasa Impuesto IVA (%)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={paramSgc.tasaIva}
                          onChange={e =>
                            updateFormData(prev => ({
                              ...prev,
                              parametrosSgc: { ...paramSgc, tasaIva: Number(e.target.value) },
                            }))
                          }
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-xl outline-none font-bold"
                        />
                        <span className="font-bold text-slate-600">%</span>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Acta Obligatoria (CLP)</label>
                      <input
                        type="number"
                        value={paramSgc.umbralActaObligatoria}
                        onChange={e =>
                          updateFormData(prev => ({
                            ...prev,
                            parametrosSgc: { ...paramSgc, umbralActaObligatoria: Number(e.target.value) },
                          }))
                        }
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-xl outline-none font-mono font-bold"
                      />
                      <span className="text-[10px] text-slate-500 font-medium">Desde: {formatoMonedaCLP(paramSgc.umbralActaObligatoria)}</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Firma VRAE (CLP)</label>
                      <input
                        type="number"
                        value={paramSgc.umbralAprobacionVrae}
                        onChange={e =>
                          updateFormData(prev => ({
                            ...prev,
                            parametrosSgc: { ...paramSgc, umbralAprobacionVrae: Number(e.target.value) },
                          }))
                        }
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-xl outline-none font-mono font-bold"
                      />
                      <span className="text-[10px] text-purple-700 font-medium">Aprobación Vicerrectoría: {formatoMonedaCLP(paramSgc.umbralAprobacionVrae)}</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Contrato Formal (CLP)</label>
                      <input
                        type="number"
                        value={paramSgc.umbralContratoFormal ?? 25000001}
                        onChange={e =>
                          updateFormData(prev => ({
                            ...prev,
                            parametrosSgc: { ...paramSgc, umbralContratoFormal: Number(e.target.value) },
                          }))
                        }
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-xl outline-none font-mono font-bold"
                      />
                      <span className="text-[10px] text-rose-700 font-medium">Licitación + Contrato: {formatoMonedaCLP(paramSgc.umbralContratoFormal)}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Tramos según Anexo 1 de la Resolución VRAE 02/2014: bajo "Acta Obligatoria" basta con Orden de Compra; entre ese monto y "Firma VRAE" se exigen 3 cotizaciones; desde "Firma VRAE" se suma el V°B° de la Vicerrectoría; desde "Contrato Formal" se exige Licitación (Privada o Pública) con Contrato firmado.
                  </p>
                </div>

              </div>
            )}

            {/* TAB 2: CENTROS DE COSTO (CC / CP) */}
            {activeTab === 'centrosCosto' && (
              <div className="space-y-5 text-xs">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Buscar por código CP (ej: 409-1722) o nombre del Centro de Costo..."
                      value={busquedaCC}
                      onChange={e => setBusquedaCC(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCcEditando({
                        codigoCP: '409-',
                        nombre: '',
                        estado: 'Activo',
                        descripcion: '',
                      });
                      setIsEditingCC(false);
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Añadir Centro de Costo</span>
                  </button>
                </div>

                {/* Formulario Inline Centros de Costo */}
                {(ccEditando.codigoCP !== '' || !isEditingCC) && (
                  <div className="bg-sky-50/60 p-4 rounded-2xl border border-sky-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-sky-950 text-xs flex items-center gap-2">
                        {isEditingCC ? <Edit2 className="w-4 h-4 text-sky-600" /> : <Plus className="w-4 h-4 text-sky-600" />}
                        <span>{isEditingCC ? `Editar Centro de Costo: ${ccEditando.codigoCP}` : 'Formulario Nuevo Centro de Costo (CP 409-XXXX)'}</span>
                      </h5>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Código Presupuestario (CP) *</label>
                        <input
                          type="text"
                          placeholder="Ej: 409-1722, 409-5243"
                          disabled={isEditingCC}
                          value={ccEditando.codigoCP}
                          onChange={e => setCcEditando({ ...ccEditando, codigoCP: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-bold text-slate-900 disabled:bg-slate-100 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Nombre / Denominación *</label>
                        <input
                          type="text"
                          placeholder="Ej: REMODELACIONES-OBRAS, CASINO VRAE"
                          value={ccEditando.nombre}
                          onChange={e => setCcEditando({ ...ccEditando, nombre: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-bold uppercase"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Descripción / Observaciones</label>
                        <input
                          type="text"
                          placeholder="Ej: Asignado a obras de infraestructura"
                          value={ccEditando.descripcion || ''}
                          onChange={e => setCcEditando({ ...ccEditando, descripcion: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setCcEditando({ codigoCP: '', nombre: '', estado: 'Activo', descripcion: '' })}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
                      >
                        Limpiar Formulario
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGuardarCC()}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isEditingCC ? 'Actualizar Centro' : 'Guardar Centro de Costo'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Tabla de Centros de Costo */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px]">
                        <th className="p-3">Código CP</th>
                        <th className="p-3">Denominación del Centro de Costo</th>
                        <th className="p-3">Descripción</th>
                        <th className="p-3 text-center">Estado</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {centrosCostoFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400">
                            No se encontraron centros de costo registrados.
                          </td>
                        </tr>
                      ) : (
                        centrosCostoFiltrados.map(c => (
                          <tr key={c.codigoCP} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono font-extrabold text-sky-900 flex items-center gap-2">
                              <Tag className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                              <span>{c.codigoCP}</span>
                            </td>
                            <td className="p-3 font-bold text-slate-800 uppercase">{c.nombre}</td>
                            <td className="p-3 text-slate-600 font-medium">{c.descripcion || '—'}</td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleEstadoCC(c.codigoCP)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                  c.estado !== 'Inactivo'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {c.estado !== 'Inactivo' ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <button
                                type="button"
                                title="Editar"
                                onClick={() => {
                                  setCcEditando(c);
                                  setIsEditingCC(true);
                                }}
                                className="p-1.5 text-sky-700 hover:bg-sky-100 rounded-lg transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Eliminar"
                                onClick={() => handleEliminarCC(c.codigoCP)}
                                className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* TAB 3: TIPOS DE OBRA / PROYECTO */}
            {activeTab === 'tiposObra' && (
              <div className="space-y-5 text-xs">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Buscar Tipo de Obra (ej: OBRA NUEVA, REMODELACION)..."
                      value={busquedaTipoObra}
                      onChange={e => setBusquedaTipoObra(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTipoObraEditando({
                        id: '',
                        nombre: '',
                        estado: 'Activo',
                        descripcion: '',
                      });
                      setIsEditingTipoObra(false);
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Añadir Tipo de Obra</span>
                  </button>
                </div>

                {/* Formulario Inline Tipos de Obra */}
                {(tipoObraEditando.id !== '' || !isEditingTipoObra) && (
                  <div className="bg-sky-50/60 p-4 rounded-2xl border border-sky-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-sky-950 text-xs flex items-center gap-2">
                        {isEditingTipoObra ? <Edit2 className="w-4 h-4 text-sky-600" /> : <Plus className="w-4 h-4 text-sky-600" />}
                        <span>{isEditingTipoObra ? `Editar Tipo de Obra: ${tipoObraEditando.nombre}` : 'Formulario Nuevo Tipo de Obra / Proyecto'}</span>
                      </h5>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Nombre del Tipo de Obra *</label>
                        <input
                          type="text"
                          placeholder="Ej: OBRA NUEVA, AMPLIACION, REMODELACION"
                          value={tipoObraEditando.nombre}
                          onChange={e => setTipoObraEditando({ ...tipoObraEditando, nombre: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-bold uppercase text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Descripción / Alcance</label>
                        <input
                          type="text"
                          placeholder="Ej: Trabajos de infraestructura y habilitación..."
                          value={tipoObraEditando.descripcion || ''}
                          onChange={e => setTipoObraEditando({ ...tipoObraEditando, descripcion: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setTipoObraEditando({ id: '', nombre: '', estado: 'Activo', descripcion: '' })}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
                      >
                        Limpiar Formulario
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGuardarTipoObra()}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isEditingTipoObra ? 'Actualizar Tipo' : 'Guardar Tipo de Obra'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Tabla de Tipos de Obra */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px]">
                        <th className="p-3">Tipo de Obra / Categoría</th>
                        <th className="p-3">Descripción y Alcance</th>
                        <th className="p-3 text-center">Estado</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {tiposObraFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-slate-400">
                            No se encontraron tipos de obra registrados.
                          </td>
                        </tr>
                      ) : (
                        tiposObraFiltrados.map(t => (
                          <tr key={t.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-bold text-slate-900 uppercase flex items-center gap-2">
                              <Hammer className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>{t.nombre}</span>
                            </td>
                            <td className="p-3 text-slate-600 font-medium">{t.descripcion || '—'}</td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleEstadoTipoObra(t.id)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                  t.estado !== 'Inactivo'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {t.estado !== 'Inactivo' ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <button
                                type="button"
                                title="Editar"
                                onClick={() => {
                                  setTipoObraEditando(t);
                                  setIsEditingTipoObra(true);
                                }}
                                className="p-1.5 text-sky-700 hover:bg-sky-100 rounded-lg transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Eliminar"
                                onClick={() => handleEliminarTipoObra(t.id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* TAB 4: ESTADOS DEL PROYECTO */}
            {activeTab === 'estadosProyecto' && (
              <div className="space-y-5 text-xs">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Buscar Estado del Proyecto (ej: PROYECTO, COTIZACION, EN EJECUCION)..."
                      value={busquedaEstadoProyecto}
                      onChange={e => setBusquedaEstadoProyecto(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEstadoProyectoEditando({
                        id: '',
                        nombre: '',
                        colorBadge: 'bg-sky-100 text-sky-900 border-sky-300',
                        estado: 'Activo',
                        descripcion: '',
                      });
                      setIsEditingEstadoProyecto(false);
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Añadir Estado de Proyecto</span>
                  </button>
                </div>

                {/* Formulario Inline Estados de Proyecto */}
                {(estadoProyectoEditando.id !== '' || !isEditingEstadoProyecto) && (
                  <div className="bg-sky-50/60 p-4 rounded-2xl border border-sky-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-sky-950 text-xs flex items-center gap-2">
                        {isEditingEstadoProyecto ? <Edit2 className="w-4 h-4 text-sky-600" /> : <Plus className="w-4 h-4 text-sky-600" />}
                        <span>{isEditingEstadoProyecto ? `Editar Estado: ${estadoProyectoEditando.nombre}` : 'Formulario Nuevo Estado del Proyecto'}</span>
                      </h5>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Nombre del Estado *</label>
                        <input
                          type="text"
                          placeholder="Ej: PROYECTO, COTIZACION, EN EJECUCION"
                          value={estadoProyectoEditando.nombre}
                          onChange={e => setEstadoProyectoEditando({ ...estadoProyectoEditando, nombre: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-bold uppercase text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Estilo Visual (Badge Color)</label>
                        <select
                          value={estadoProyectoEditando.colorBadge}
                          onChange={e => setEstadoProyectoEditando({ ...estadoProyectoEditando, colorBadge: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                        >
                          <option value="bg-blue-100 text-blue-900 border-blue-300">Azul (Formulación / Proyecto)</option>
                          <option value="bg-sky-100 text-sky-900 border-sky-300">Celeste (Cotización)</option>
                          <option value="bg-amber-100 text-amber-900 border-amber-300">Amarillo/Ámbar (En Ejecución)</option>
                          <option value="bg-emerald-100 text-emerald-900 border-emerald-300">Verde (Terminado)</option>
                          <option value="bg-purple-100 text-purple-900 border-purple-300">Morado (Postergado)</option>
                          <option value="bg-rose-100 text-rose-900 border-rose-300">Rojo (Eliminado)</option>
                          <option value="bg-orange-100 text-orange-900 border-orange-300">Naranja (Ajustado)</option>
                          <option value="bg-slate-100 text-slate-900 border-slate-300">Gris (En Carpeta)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Descripción / Etapa del Ciclo</label>
                        <input
                          type="text"
                          placeholder="Ej: Proyecto en fase de cotización..."
                          value={estadoProyectoEditando.descripcion || ''}
                          onChange={e => setEstadoProyectoEditando({ ...estadoProyectoEditando, descripcion: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEstadoProyectoEditando({ id: '', nombre: '', colorBadge: 'bg-sky-100 text-sky-900 border-sky-300', estado: 'Activo', descripcion: '' })}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
                      >
                        Limpiar Formulario
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGuardarEstadoProyecto()}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isEditingEstadoProyecto ? 'Actualizar Estado' : 'Guardar Estado'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Tabla de Estados de Proyecto */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px]">
                        <th className="p-3">Estado del Proyecto</th>
                        <th className="p-3">Vista Previa Badge</th>
                        <th className="p-3">Descripción y Etapa</th>
                        <th className="p-3 text-center">Estado</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {estadosProyectoFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400">
                            No se encontraron estados de proyecto registrados.
                          </td>
                        </tr>
                      ) : (
                        estadosProyectoFiltrados.map(e => (
                          <tr key={e.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-extrabold text-slate-900 uppercase flex items-center gap-2">
                              <BookmarkCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                              <span>{e.nombre}</span>
                            </td>
                            <td className="p-3">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${e.colorBadge}`}>
                                {e.nombre}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600 font-medium">{e.descripcion || '—'}</td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleEstadoProyectoStatus(e.id)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                  e.estado !== 'Inactivo'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {e.estado !== 'Inactivo' ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <button
                                type="button"
                                title="Editar"
                                onClick={() => {
                                  setEstadoProyectoEditando(e);
                                  setIsEditingEstadoProyecto(true);
                                }}
                                className="p-1.5 text-sky-700 hover:bg-sky-100 rounded-lg transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Eliminar"
                                onClick={() => handleEliminarEstadoProyecto(e.id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* TAB: RUBROS DE PROVEEDORES */}
            {activeTab === 'rubros' && (
              <div className="space-y-5 text-xs">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Buscar Rubro de Proveedor (ej: Obras Civiles, Climatización, Pintura)..."
                      value={busquedaRubro}
                      onChange={e => setBusquedaRubro(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRubroEditando({
                        id: '',
                        nombre: '',
                        estado: 'Activo',
                        descripcion: '',
                      });
                      setIsEditingRubro(false);
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Añadir Nuevo Rubro</span>
                  </button>
                </div>

                {/* Formulario Inline Rubros */}
                {(rubroEditando.id !== '' || !isEditingRubro) && (
                  <div className="bg-sky-50/60 p-4 rounded-2xl border border-sky-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-sky-950 text-xs flex items-center gap-2">
                        {isEditingRubro ? <Edit2 className="w-4 h-4 text-sky-600" /> : <Plus className="w-4 h-4 text-sky-600" />}
                        <span>{isEditingRubro ? `Editar Rubro: ${rubroEditando.nombre}` : 'Formulario Nuevo Rubro de Proveedor'}</span>
                      </h5>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Nombre / Categoría del Rubro *</label>
                        <input
                          type="text"
                          placeholder="Ej: Obras Civiles, Electricidad, Climatización, Pintura"
                          value={rubroEditando.nombre}
                          onChange={e => setRubroEditando({ ...rubroEditando, nombre: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Descripción / Alcance Técnico</label>
                        <input
                          type="text"
                          placeholder="Ej: Remodelaciones, instalaciones eléctricas, tabiquería..."
                          value={rubroEditando.descripcion || ''}
                          onChange={e => setRubroEditando({ ...rubroEditando, descripcion: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setRubroEditando({ id: '', nombre: '', estado: 'Activo', descripcion: '' })}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
                      >
                        Limpiar Formulario
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGuardarRubro()}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isEditingRubro ? 'Actualizar Rubro' : 'Guardar Rubro'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Tabla de Rubros */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px]">
                        <th className="p-3">Rubro / Categoría de Proveedor</th>
                        <th className="p-3">Descripción / Alcance</th>
                        <th className="p-3 text-center">Estado</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {rubrosFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-slate-400">
                            No se encontraron rubros de proveedores registrados.
                          </td>
                        </tr>
                      ) : (
                        rubrosFiltrados.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-extrabold text-slate-900 flex items-center gap-2">
                              <Briefcase className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                              <span>{r.nombre}</span>
                            </td>
                            <td className="p-3 text-slate-600 font-medium">{r.descripcion || '—'}</td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleRubroStatus(r.id)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                  r.estado !== 'Inactivo'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {r.estado !== 'Inactivo' ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <button
                                type="button"
                                title="Editar"
                                onClick={() => {
                                  setRubroEditando(r);
                                  setIsEditingRubro(true);
                                }}
                                className="p-1.5 text-sky-700 hover:bg-sky-100 rounded-lg transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Eliminar"
                                onClick={() => handleEliminarRubro(r.id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* TAB 5: RESPONSABLES E ITOs */}
            {activeTab === 'responsables' && (
              <div className="space-y-5 text-xs">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Buscar por nombre, código, email o cargo de ITO/responsable..."
                      value={busquedaResponsable}
                      onChange={e => setBusquedaResponsable(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRespEditando({
                        codigo: '',
                        nombre: '',
                        email: '',
                        cargo: 'Ingeniero de Proyectos',
                        telefono: '+56 45 205 0000',
                        estado: 'Activo',
                      });
                      setIsEditingResponsable(false);
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Añadir Nuevo Responsable</span>
                  </button>
                </div>

                {/* Formulario Inline Responsables */}
                {(respEditando.codigo !== '' || !isEditingResponsable) && (
                  <div className="bg-sky-50/60 p-4 rounded-2xl border border-sky-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-sky-950 text-xs flex items-center gap-2">
                        {isEditingResponsable ? <Edit2 className="w-4 h-4 text-sky-600" /> : <Plus className="w-4 h-4 text-sky-600" />}
                        <span>{isEditingResponsable ? `Editar Responsable: ${respEditando.codigo}` : 'Formulario Nuevo Responsable / Inspector de Obra'}</span>
                      </h5>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
                      <div className="flex flex-col justify-end">
                        <label className="block font-bold text-slate-700 mb-1">Código Identificador (Nombre antes de @) *</label>
                        <input
                          type="text"
                          placeholder="Ej: dsilva, mzurita"
                          disabled={isEditingResponsable}
                          value={respEditando.codigo}
                          onChange={e => setRespEditando({ ...respEditando, codigo: e.target.value.toLowerCase() })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-bold text-slate-900 disabled:bg-slate-100 font-mono"
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <label className="block font-bold text-slate-700 mb-1">Nombre Completo *</label>
                        <input
                          type="text"
                          placeholder="Ej: David Silva Roco"
                          value={respEditando.nombre}
                          onChange={e => setRespEditando({ ...respEditando, nombre: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <label className="block font-bold text-slate-700 mb-1">Email Institucional</label>
                        <input
                          type="email"
                          placeholder="dsilva@uct.cl"
                          value={respEditando.email}
                          onChange={e => {
                            const email = e.target.value;
                            const derivedCode = email.includes('@') ? email.split('@')[0].trim().toLowerCase() : email.trim().toLowerCase();
                            setRespEditando(r => ({
                              ...r,
                              email,
                              codigo: derivedCode || r.codigo,
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-mono"
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <label className="block font-bold text-slate-700 mb-1">Cargo / Especialidad</label>
                        <input
                          type="text"
                          placeholder="Ej: ITO, Subdirector, Supervisor"
                          value={respEditando.cargo}
                          onChange={e => setRespEditando({ ...respEditando, cargo: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setRespEditando({ codigo: '', nombre: '', email: '', cargo: '', telefono: '', estado: 'Activo' })}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
                      >
                        Limpiar Formulario
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGuardarResponsable()}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isEditingResponsable ? 'Actualizar Registro' : 'Guardar Responsable'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Tabla de Responsables */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px]">
                        <th className="p-3">Código</th>
                        <th className="p-3">Nombre Completo</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Cargo / Rol</th>
                        <th className="p-3 text-center">Estado</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {responsablesFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">
                            No se encontraron responsables registrados.
                          </td>
                        </tr>
                      ) : (
                        responsablesFiltrados.map(r => (
                          <tr key={r.codigo} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono font-bold text-slate-900">{r.codigo}</td>
                            <td className="p-3 font-bold text-slate-800">{r.nombre}</td>
                            <td className="p-3 text-slate-600 font-mono">{r.email || '—'}</td>
                            <td className="p-3 text-slate-700 font-medium">{r.cargo || 'Responsable de Infraestructura'}</td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleEstadoResponsable(r.codigo)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                                  r.estado !== 'Inactivo'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {r.estado !== 'Inactivo' ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <button
                                type="button"
                                title="Editar"
                                onClick={() => {
                                  setRespEditando(r);
                                  setIsEditingResponsable(true);
                                }}
                                className="p-1.5 text-sky-700 hover:bg-sky-100 rounded-lg transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Eliminar"
                                onClick={() => handleEliminarResponsable(r.codigo)}
                                className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* TAB 6: FIRMANTES OFICIALES */}
            {activeTab === 'firmas' && (
              <div className="space-y-6 text-xs">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-xs uppercase flex items-center gap-2">
                      <FileSignature className="w-4 h-4 text-indigo-600" />
                      Mi Firma Manuscrita (Enrolamiento)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Suba una foto o escaneo de su firma (fondo blanco, buen contraste). Quedará asociada a su cuenta
                      ({user?.email}) y se estampará automáticamente en las actas que firme digitalmente.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-48 h-24 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                      {firmaImagenLocal ? (
                        <img src={firmaImagenLocal} alt="Firma registrada" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-[10px] text-slate-400 px-2 text-center">Sin firma registrada aún</span>
                      )}
                    </div>
                    <label className={`px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-2 transition ${
                      subiendoFirma ? 'bg-slate-200 text-slate-500 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}>
                      <Upload className="w-4 h-4" />
                      {subiendoFirma ? 'Subiendo...' : firmaImagenLocal ? 'Reemplazar firma' : 'Subir firma'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={subiendoFirma}
                        className="hidden"
                        onChange={e => {
                          void handleSubirFirma(e.target.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="bg-sky-50 p-4 rounded-2xl border border-sky-200 text-sky-950 space-y-1">
                  <h4 className="font-bold text-sm">Nómina Institucional de Firmantes en Actas</h4>
                  <p className="text-[11px] text-sky-800">
                    Los nombres y cargos se reflejan automáticamente en el acta oficial impresa o exportada a PDF.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="font-extrabold text-slate-900 text-xs block uppercase">1. Director DGDC</span>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre Completo</label>
                      <input
                        type="text"
                        value={formData.directorGestionCampus.nombre}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            directorGestionCampus: { ...formData.directorGestionCampus, nombre: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Cargo Oficial</label>
                      <input
                        type="text"
                        value={formData.directorGestionCampus.cargo}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            directorGestionCampus: { ...formData.directorGestionCampus, cargo: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="font-extrabold text-slate-900 text-xs block uppercase">2. Sub-Director Infraestructura</span>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre Completo</label>
                      <input
                        type="text"
                        value={formData.subdirectorInfraestructura.nombre}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            subdirectorInfraestructura: { ...formData.subdirectorInfraestructura, nombre: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Cargo Oficial</label>
                      <input
                        type="text"
                        value={formData.subdirectorInfraestructura.cargo}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            subdirectorInfraestructura: { ...formData.subdirectorInfraestructura, cargo: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="font-extrabold text-slate-900 text-xs block uppercase">3. Responsable Desarrollo Infraestructura</span>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nombre o Rol Institucional</label>
                      <input
                        type="text"
                        value={formData.responsableDesarrollo.nombre}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            responsableDesarrollo: { ...formData.responsableDesarrollo, nombre: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Cargo Oficial</label>
                      <input
                        type="text"
                        value={formData.responsableDesarrollo.cargo}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            responsableDesarrollo: { ...formData.responsableDesarrollo, cargo: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 bg-purple-50/60 p-5 rounded-2xl border border-purple-200 shadow-xs">
                    <span className="font-extrabold text-purple-950 text-xs block uppercase">4. Vicerrectora VRAE (&gt; $5.000.001)</span>
                    <div>
                      <label className="block font-semibold text-purple-900 mb-1">Nombre Completo Vicerrector(a)</label>
                      <input
                        type="text"
                        value={formData.vicerrectorAdministracion.nombre}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            vicerrectorAdministracion: { ...formData.vicerrectorAdministracion, nombre: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl outline-none font-bold text-purple-950"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-purple-900 mb-1">Cargo Oficial</label>
                      <input
                        type="text"
                        value={formData.vicerrectorAdministracion.cargo}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            vicerrectorAdministracion: { ...formData.vicerrectorAdministracion, cargo: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl outline-none font-medium text-purple-900"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: SEDES Y CAMPUS */}
            {activeTab === 'campus' && (
              <div className="space-y-5 text-xs">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Catálogo de Campus UCT y Edificios</h4>
                    <p className="text-[11px] text-slate-500">
                      Agregue o quite edificios y registre la dirección de cada sede — se usa para completar Bases y Contratos automáticamente.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold bg-sky-100 text-sky-900 px-3 py-1 rounded-full border border-sky-300">
                      {campusList.length} Sedes Registradas
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCampusEditando(CAMPUS_VACIO);
                        setNuevoEdificioInput('');
                        setIsEditingCampus(false);
                      }}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Añadir Nuevo Campus</span>
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Buscar por sigla, nombre o ciudad..."
                    value={busquedaCampus}
                    onChange={e => setBusquedaCampus(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                  />
                </div>

                {/* Formulario Inline Campus */}
                {(campusEditando.sigla !== '' || !isEditingCampus) && (
                  <div className="bg-sky-50/60 p-4 rounded-2xl border border-sky-200 space-y-3">
                    <h5 className="font-bold text-sky-950 text-xs flex items-center gap-2">
                      {isEditingCampus ? <Edit2 className="w-4 h-4 text-sky-600" /> : <Plus className="w-4 h-4 text-sky-600" />}
                      <span>{isEditingCampus ? `Editar Campus: ${campusEditando.sigla}` : 'Formulario Nuevo Campus'}</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Sigla *</label>
                        <input
                          type="text"
                          disabled={isEditingCampus}
                          placeholder="Ej: CJP"
                          value={campusEditando.sigla}
                          onChange={e => setCampusEditando({ ...campusEditando, sigla: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Nombre del Campus *</label>
                        <input
                          type="text"
                          placeholder="Ej: Campus San Juan Pablo II"
                          value={campusEditando.nombre}
                          onChange={e => setCampusEditando({ ...campusEditando, nombre: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Ciudad</label>
                        <input
                          type="text"
                          placeholder="Ej: Temuco"
                          value={campusEditando.ciudad}
                          onChange={e => setCampusEditando({ ...campusEditando, ciudad: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-sky-600" /> Dirección del Campus</label>
                      <input
                        type="text"
                        placeholder="Ej: Av. Alemania 0211, Temuco"
                        value={campusEditando.direccion || ''}
                        onChange={e => setCampusEditando({ ...campusEditando, direccion: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Se usa para completar automáticamente el texto de Bases y Contratos de los proyectos de este campus.</p>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Edificios del Campus</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Ej: CJP01"
                          value={nuevoEdificioInput}
                          onChange={e => setNuevoEdificioInput(e.target.value.toUpperCase())}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAgregarEdificio(); } }}
                          className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-mono font-bold"
                        />
                        <button
                          type="button"
                          onClick={handleAgregarEdificio}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar</span>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {campusEditando.edificios.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">Sin edificios agregados aún.</span>
                        ) : (
                          campusEditando.edificios.map(ed => (
                            <span key={ed} className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono font-bold text-[11px] text-slate-700">
                              {ed}
                              <button type="button" onClick={() => handleQuitarEdificio(ed)} className="text-slate-400 hover:text-rose-600">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => { setCampusEditando(CAMPUS_VACIO); setNuevoEdificioInput(''); setIsEditingCampus(false); }}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
                      >
                        Limpiar Formulario
                      </button>
                      <button
                        type="button"
                        onClick={handleGuardarCampus}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isEditingCampus ? 'Actualizar Campus' : 'Guardar Campus'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {campusFiltrados.length === 0 ? (
                    <p className="col-span-full text-center text-slate-400 py-6">No se encontraron campus registrados.</p>
                  ) : (
                    campusFiltrados.map(c => (
                      <div key={c.sigla} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2 hover:border-sky-300 transition">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-extrabold text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                            {c.sigla}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500 font-medium">{c.ciudad}</span>
                            <button type="button" title="Editar" onClick={() => { setCampusEditando(c); setIsEditingCampus(true); }} className="p-1 text-sky-700 hover:bg-sky-100 rounded-lg transition">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" title="Eliminar" onClick={() => handleEliminarCampus(c.sigla)} className="p-1 text-rose-600 hover:bg-rose-100 rounded-lg transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <h5 className="font-bold text-slate-900 text-xs leading-snug">{c.nombre}</h5>
                        {c.direccion && (
                          <p className="flex items-start gap-1 text-[11px] text-slate-500"><MapPin className="w-3 h-3 mt-0.5 shrink-0 text-sky-600" /> {c.direccion}</p>
                        )}
                        <div className="pt-1 flex items-center justify-between text-[11px] text-slate-600 border-t border-slate-100">
                          <span>Edificios asociados:</span>
                          <strong className="text-sky-700 font-mono">{c.edificios.length}</strong>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'plantillasBases' && (
              <div className="space-y-5 text-xs">
                <div className="bg-sky-50 p-4 rounded-2xl border border-sky-200 text-sky-950 space-y-1">
                  <h4 className="font-bold text-sm">Plantillas Maestras de Bases (por tipo de proyecto)</h4>
                  <p className="text-[11px] text-sky-800">
                    Cuando se generan las Bases de un proyecto nuevo, el sistema elige automáticamente una de estas 5 plantillas
                    según su Tipo de Obra. Edítelas aquí junto con Secretaría General para que cada proyecto nuevo parta con el
                    mínimo de correcciones posible. Los cambios solo afectan a proyectos que aún no tengan bases generadas.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(Object.keys(FAMILIA_BASES_LABEL) as FamiliaBases[]).map(familia => (
                    <button
                      key={familia}
                      type="button"
                      onClick={() => cambiarFamiliaBasesEditando(familia)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition ${
                        familiaBasesEditando === familia
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {FAMILIA_BASES_LABEL[familia]}
                    </button>
                  ))}
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
                    <h5 className="font-extrabold text-slate-900 text-xs uppercase">{FAMILIA_BASES_LABEL[familiaBasesEditando]}</h5>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={restaurarPlantillaBasesEditando}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold flex items-center gap-1.5 border border-slate-200"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restaurar original
                      </button>
                      <button
                        type="button"
                        onClick={guardarPlantillaBasesEditando}
                        disabled={!hasChangesBases}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg font-bold flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" /> Guardar plantilla
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {seccionesBasesEditando.map(s => (
                      <div key={s.id}>
                        <label className="block font-bold text-slate-700 mb-1">{s.titulo}</label>
                        <textarea
                          value={s.contenido}
                          onChange={e => actualizarSeccionBasesEditando(s.id, e.target.value)}
                          rows={2}
                          className="w-full text-xs leading-relaxed border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-sky-400"
                        />
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-slate-400 flex items-start gap-1.5 pt-2 border-t border-slate-100">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    Recuerde: el texto de garantías, multas, requisitos y criterios sigue siendo una guía de estructura, no
                    cláusulas legales redactadas. Cada proyecto individual pasa igualmente por el flujo Borrador → En Revisión
                    Legal → Aprobada antes de convocar.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 8: RESPALDOS Y SISTEMA */}
            {activeTab === 'respaldos' && (
              <div className="space-y-6 text-xs">
                
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Download className="w-4 h-4 text-sky-600" />
                    <span>Exportar e Importar Respaldos (.json)</span>
                  </h4>
                  <p className="text-slate-600 leading-relaxed">
                    Exporte una copia en formato JSON de la configuración del sistema para respaldar o migrar los datos a otra instalación.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleExportarConfigJSON}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-2"
                    >
                      <Download className="w-4 h-4 text-sky-400" />
                      <span>Exportar Configuración Completa (.json)</span>
                    </button>

                    <label className="px-5 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold rounded-xl border border-sky-300 transition flex items-center gap-2 cursor-pointer">
                      <Upload className="w-4 h-4 text-sky-700" />
                      <span>Importar Archivo Configuración (.json)</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportarConfigJSON}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="bg-rose-50 p-6 rounded-2xl border border-rose-200 space-y-4">
                  <h4 className="font-bold text-rose-950 text-sm flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-rose-600" />
                    <span>Restablecimiento de Fábrica / Demostración</span>
                  </h4>
                  <p className="text-rose-800 leading-relaxed">
                    Vuelva a cargar el set inicial de proyectos y configuraciones iniciales del sistema.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('¿Restablecer todos los datos a su estado inicial de demostración?')) {
                        onResetData();
                      }
                    }}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Restablecer Datos de Demostración</span>
                  </button>
                  <p className="text-[11px] text-rose-500">Esto solo restablece la configuración local (responsables, centros de costo, tipos de obra, etc.) — no borra la Cartera de Proyectos ni las Licitaciones en Firestore.</p>
                </div>

                {isAdmin && (
                  <div className="bg-rose-100 p-6 rounded-2xl border-2 border-rose-300 space-y-4">
                    <h4 className="font-bold text-rose-950 text-sm flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-rose-700" />
                      <span>Borrar Cartera de Proyectos y Licitaciones (solo admin)</span>
                    </h4>
                    <p className="text-rose-900 leading-relaxed">
                      Elimina definitivamente todos los proyectos, licitaciones, cotizaciones, estados de pago, aumentos de obra e invitados en Firestore, para partir de cero con una nueva cartera. Proveedores, configuración de firmas, responsables y usuarios <strong>no</strong> se ven afectados.
                    </p>
                    <button
                      type="button"
                      onClick={() => setResetCarteraAbierto(true)}
                      className="px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Borrar Cartera y Licitaciones…</span>
                    </button>
                  </div>
                )}

              </div>
            )}

            {resetCarteraAbierto && (
              <ResetCarteraModal onClose={() => setResetCarteraAbierto(false)} />
            )}

          </div>
        </div>

      </div>

    </div>
  );
};
