import React, { useState, useEffect } from 'react';
import type { ConfiguracionFirmas } from '../types';
import {
  getResponsablesList,
  saveResponsablesList,
  type ResponsableInfraestructura,
} from '../data/responsablesData';
import { CAMPUS_UCT } from '../data/campusData';
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
  X,
  Building,
} from 'lucide-react';
import { formatoMonedaCLP } from '../services/evaluationEngine';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ConfiguracionFirmas;
  onSaveConfig: (newConfig: ConfiguracionFirmas) => void;
  onResetData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onResetData,
}) => {
  const [activeTab, setActiveTab] = useState<'parametros' | 'firmas' | 'responsables' | 'campus' | 'respaldos'>('parametros');
  
  // State principal de Configuración
  const [formData, setFormData] = useState<ConfiguracionFirmas>(config);
  
  // State de Responsables de Infraestructura
  const [responsables, setResponsables] = useState<ResponsableInfraestructura[]>([]);
  const [busquedaResponsable, setBusquedaResponsable] = useState('');
  
  // Formulario para Nuevo / Editar Responsable
  const [isEditingResponsable, setIsEditingResponsable] = useState(false);
  const [respEditando, setRespEditando] = useState<ResponsableInfraestructura>({
    codigo: '',
    nombre: '',
    email: '',
    cargo: '',
    telefono: '',
    estado: 'Activo',
  });

  // Cargar datos al abrir modal
  useEffect(() => {
    if (isOpen) {
      setFormData(config);
      setResponsables(getResponsablesList());
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  // Manejadores de Ponderaciones SGC
  const paramSgc = formData.parametrosSgc || {
    porcentajeEconomico: 55,
    porcentajeTecnico: 35,
    porcentajeSustentabilidad: 10,
    tasaIva: 19,
    umbralActaObligatoria: 800001,
    umbralAprobacionVrae: 5000001,
  };

  const sumaPonderaciones =
    (paramSgc.porcentajeEconomico || 0) +
    (paramSgc.porcentajeTecnico || 0) +
    (paramSgc.porcentajeSustentabilidad || 0);

  const ponderacionesValidas = sumaPonderaciones === 100;

  // Manejador del submit general
  const handleSubmitGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ponderacionesValidas) {
      alert('La suma de las ponderaciones de evaluación (Económica, Técnica y Sustentabilidad) debe ser exactamente igual a 100%.');
      return;
    }
    saveResponsablesList(responsables);
    onSaveConfig(formData);
    onClose();
  };

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
      // Verificar código único al crear
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

  // Filtrado de Responsables
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
      fechaExportacion: new Date().toISOString(),
      version: 'SGC-2026-v2',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGC_Configuracion_Infraestructura_${new Date().toISOString().slice(0, 10)}.json`;
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
        alert('¡Configuración importada con éxito!');
      } catch {
        alert('El archivo seleccionado no tiene un formato JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl flex flex-col max-h-[92vh] border border-slate-200 overflow-hidden">
        
        {/* Header Principal del Modal */}
        <div
          className="px-6 py-4 flex items-center justify-between text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                <span>Configuración de Parámetros SGC & Gestión de Infraestructura</span>
              </h3>
              <p className="text-[11px] text-slate-300">
                Ajuste los criterios de evaluación, firmantes de actas, catálogo de responsables e inspectores ITO.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('parametros')}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'parametros'
                ? 'border-sky-600 text-sky-700 bg-white shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>1. Parámetros SGC</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('responsables')}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'responsables'
                ? 'border-sky-600 text-sky-700 bg-white shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>2. Responsables e ITOs ({responsables.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('firmas')}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'firmas'
                ? 'border-sky-600 text-sky-700 bg-white shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileSignature className="w-4 h-4" />
            <span>3. Firmantes Oficiales</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('campus')}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'campus'
                ? 'border-sky-600 text-sky-700 bg-white shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>4. Sedes & Campus ({CAMPUS_UCT.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('respaldos')}
            className={`py-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'respaldos'
                ? 'border-sky-600 text-sky-700 bg-white shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>5. Respaldos & Sistema</span>
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ================= TAB 1: PARÁMETROS SGC ================= */}
          {activeTab === 'parametros' && (
            <div className="space-y-6 text-xs">
              
              {/* Información de la Unidad */}
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
                      onChange={e => setFormData({ ...formData, institucion: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Subdirección / Unidad Emisora</label>
                    <input
                      type="text"
                      value={formData.subdireccion}
                      onChange={e => setFormData({ ...formData, subdireccion: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Matriz de Ponderaciones SGC */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-sky-600" />
                      <span>Ponderaciones para Matriz de Evaluación (SGC PS-FOR-DGDC 0003)</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Configure el peso relativo (%) de cada aspecto evaluado en las licitaciones de obras e infraestructura.
                    </p>
                  </div>
                  
                  {/* Status Indicator Suma 100% */}
                  <div className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 text-xs ${
                    ponderacionesValidas
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}>
                    {ponderacionesValidas ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Suma de Ponderaciones: 100% (VÁLIDO)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Suma Actual: {sumaPonderaciones}% (Debe ser igual a 100%)</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 bg-sky-50/60 rounded-xl border border-sky-100 space-y-2">
                    <label className="block font-bold text-sky-950">1. Oferta Económica (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={paramSgc.porcentajeEconomico}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            parametrosSgc: {
                              ...paramSgc,
                              porcentajeEconomico: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-sky-300 rounded-lg text-sm font-extrabold text-sky-900 outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <span className="font-bold text-sky-800 text-sm">%</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Evaluación automática por menor precio ofertado con IVA.</p>
                  </div>

                  <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-2">
                    <label className="block font-bold text-indigo-950">2. Oferta Técnica (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={paramSgc.porcentajeTecnico}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            parametrosSgc: {
                              ...paramSgc,
                              porcentajeTecnico: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-sm font-extrabold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="font-bold text-indigo-800 text-sm">%</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Ajuste a requerimientos, experiencia previa y plazo ofrecido.</p>
                  </div>

                  <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 space-y-2">
                    <label className="block font-bold text-emerald-950">3. Sustentabilidad (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={paramSgc.porcentajeSustentabilidad}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            parametrosSgc: {
                              ...paramSgc,
                              porcentajeSustentabilidad: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm font-extrabold text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="font-bold text-emerald-800 text-sm">%</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Declaración de prácticas o certificación sustentable.</p>
                  </div>
                </div>
              </div>

              {/* Umbrales Financieros y Normativa */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-600" />
                  <span>Umbrales Financieros y Tributarios</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tasa Impuesto IVA (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={paramSgc.tasaIva}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            parametrosSgc: { ...paramSgc, tasaIva: Number(e.target.value) },
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-bold"
                      />
                      <span className="font-bold text-slate-600">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Monto Mínimo Acta Obligatoria (CLP)</label>
                    <input
                      type="number"
                      value={paramSgc.umbralActaObligatoria}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          parametrosSgc: { ...paramSgc, umbralActaObligatoria: Number(e.target.value) },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-mono font-bold"
                    />
                    <span className="text-[10px] text-slate-500 font-medium">Formato Oficial: {formatoMonedaCLP(paramSgc.umbralActaObligatoria)}</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Monto Mínimo Firma VRAE (CLP)</label>
                    <input
                      type="number"
                      value={paramSgc.umbralAprobacionVrae}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          parametrosSgc: { ...paramSgc, umbralAprobacionVrae: Number(e.target.value) },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none font-mono font-bold"
                    />
                    <span className="text-[10px] text-purple-700 font-medium">Requiere Aprobación Vicerrectora: {formatoMonedaCLP(paramSgc.umbralAprobacionVrae)}</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ================= TAB 2: GESTIÓN DE RESPONSABLES E ITO ================= */}
          {activeTab === 'responsables' && (
            <div className="space-y-5 text-xs">
              
              {/* Header Tab Actions */}
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

              {/* Formulario de Creación / Edición Modal Inline */}
              {(respEditando.codigo !== '' || !isEditingResponsable) && (
                <div className="bg-sky-50/60 p-4 rounded-2xl border border-sky-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-sky-950 text-xs flex items-center gap-2">
                      {isEditingResponsable ? <Edit2 className="w-4 h-4 text-sky-600" /> : <Plus className="w-4 h-4 text-sky-600" />}
                      <span>{isEditingResponsable ? `Editar Responsable: ${respEditando.codigo}` : 'Formulario Nuevo Responsable / Inspector de Obra'}</span>
                    </h5>
                    <span className="text-[10px] text-sky-800 font-medium">Asignable a proyectos y licitaciones</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
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
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Nombre Completo *</label>
                      <input
                        type="text"
                        placeholder="Ej: David Silva Roco"
                        value={respEditando.nombre}
                        onChange={e => setRespEditando({ ...respEditando, nombre: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none font-medium"
                      />
                    </div>
                    <div>
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
                    <div>
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

              {/* Tabla Completa de Responsables */}
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
                          No se encontraron responsables que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      responsablesFiltrados.map(r => (
                        <tr key={r.codigo} className="hover:bg-slate-50/80 transition">
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

          {/* ================= TAB 3: FIRMANTES OFICIALES ================= */}
          {activeTab === 'firmas' && (
            <div className="space-y-6 text-xs">
              <div className="bg-sky-50 p-4 rounded-2xl border border-sky-200 text-sky-950 space-y-1">
                <h4 className="font-bold text-sm">Nómina Institucional de Aprobadores SGC</h4>
                <p className="text-[11px] text-sky-800">
                  Los nombres y cargos configurados aquí aparecerán automáticamente en los pies de firma del <strong>Cuadro Comparativo y Acta de Adjudicación SGC exportable a PDF</strong>.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. Director DGDC */}
                <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="font-extrabold text-slate-900 text-xs block uppercase">1. Director de Gestión y Desarrollo de Campus</span>
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

                {/* 2. Subdirector Infraestructura */}
                <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="font-extrabold text-slate-900 text-xs block uppercase">2. Sub-Director de Infraestructura</span>
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

                {/* 3. Responsable Desarrollo */}
                <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
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

                {/* 4. Vicerrector VRAE */}
                <div className="space-y-3 bg-purple-50/60 p-5 rounded-2xl border border-purple-200 shadow-sm">
                  <span className="font-extrabold text-purple-950 text-xs block uppercase">4. Vicerrectora / Vicerrector VRAE (&gt; $5.000.001)</span>
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

          {/* ================= TAB 4: SEDES Y CAMPUS ================= */}
          {activeTab === 'campus' && (
            <div className="space-y-5 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Catálogo de Campus UCT y Edificios</h4>
                  <p className="text-[11px] text-slate-500">
                    Se registran 15 sedes universitarias habilitadas para la localización de proyectos de infraestructura.
                  </p>
                </div>
                <span className="text-xs font-bold bg-sky-100 text-sky-900 px-3 py-1 rounded-full border border-sky-300">
                  {CAMPUS_UCT.length} Campus Activos
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {CAMPUS_UCT.map(c => (
                  <div key={c.sigla} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2 hover:border-sky-300 transition">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-extrabold text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                        {c.sigla}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">{c.ciudad}</span>
                    </div>
                    <h5 className="font-bold text-slate-900 text-xs leading-snug">{c.nombre}</h5>
                    <div className="pt-1 flex items-center justify-between text-[11px] text-slate-600 border-t border-slate-100">
                      <span>Edificios asociados:</span>
                      <strong className="text-sky-700 font-mono">{c.edificios.length}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= TAB 5: RESPALDOS Y SISTEMA ================= */}
          {activeTab === 'respaldos' && (
            <div className="space-y-6 text-xs">
              
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Download className="w-4 h-4 text-sky-600" />
                  <span>Exportar e Importar Respaldos SGC (.json)</span>
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Guarde una copia de respaldo en su equipo local con todos los parámetros institucionales, firmantes y catálogo de responsables de infraestructura para transferir o restaurar la configuración en otro dispositivo.
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
                  <span>Restablecimiento de Demostración</span>
                </h4>
                <p className="text-rose-800 leading-relaxed">
                  Reinicie la caché local de demostración para volver a cargar el set inicial de proyectos, proveedores de ejemplo y configuraciones originales de fábrica.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    if (confirm('¿Restablecer todos los datos de la aplicación a su estado de fábrica? Esta acción no se puede deshacer.')) {
                      onResetData();
                      onClose();
                    }
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restablecer Todo a Valores de Fábrica</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions del Modal */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 font-medium">
            {ponderacionesValidas ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <Check className="w-4 h-4" /> Configuración SGC Lista para Guardar
              </span>
            ) : (
              <span className="text-rose-600 font-bold">
                ⚠️ Ajuste las ponderaciones para que la suma sea igual a 100%
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmitGeneral}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-md transition text-xs flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Configuración General</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
