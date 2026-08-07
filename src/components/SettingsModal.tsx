import React, { useState } from 'react';
import type { ConfiguracionFirmas } from '../types';
import { Settings, Save, RotateCcw } from 'lucide-react';

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
  const [formData, setFormData] = useState<ConfiguracionFirmas>(config);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-600" />
            <span>Configuración Institucional & Firmantes SGC</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg font-bold">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Institutional Info */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="font-bold text-slate-800 block text-xs">Información Institucional</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Institución</label>
                <input
                  type="text"
                  value={formData.institucion}
                  onChange={e => setFormData({ ...formData, institucion: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subdirección / Unidad</label>
                <input
                  type="text"
                  value={formData.subdireccion}
                  onChange={e => setFormData({ ...formData, subdireccion: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Evaluator 1: Director */}
          <div className="space-y-2 bg-sky-50/50 p-4 rounded-xl border border-sky-100">
            <span className="font-bold text-sky-950 block text-xs">1. Director de Gestión y Desarrollo de Campus</span>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nombre completo"
                value={formData.directorGestionCampus.nombre}
                onChange={e =>
                  setFormData({
                    ...formData,
                    directorGestionCampus: { ...formData.directorGestionCampus, nombre: e.target.value },
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Cargo"
                value={formData.directorGestionCampus.cargo}
                onChange={e =>
                  setFormData({
                    ...formData,
                    directorGestionCampus: { ...formData.directorGestionCampus, cargo: e.target.value },
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Evaluator 2: Sub-Director */}
          <div className="space-y-2 bg-sky-50/50 p-4 rounded-xl border border-sky-100">
            <span className="font-bold text-sky-950 block text-xs">2. Sub-Director de Infraestructura</span>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nombre completo"
                value={formData.subdirectorInfraestructura.nombre}
                onChange={e =>
                  setFormData({
                    ...formData,
                    subdirectorInfraestructura: { ...formData.subdirectorInfraestructura, nombre: e.target.value },
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Cargo"
                value={formData.subdirectorInfraestructura.cargo}
                onChange={e =>
                  setFormData({
                    ...formData,
                    subdirectorInfraestructura: { ...formData.subdirectorInfraestructura, cargo: e.target.value },
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Evaluator 3: Responsable Desarrollo */}
          <div className="space-y-2 bg-sky-50/50 p-4 rounded-xl border border-sky-100">
            <span className="font-bold text-sky-950 block text-xs">3. Responsable Desarrollo Infraestructura</span>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nombre o Rol"
                value={formData.responsableDesarrollo.nombre}
                onChange={e =>
                  setFormData({
                    ...formData,
                    responsableDesarrollo: { ...formData.responsableDesarrollo, nombre: e.target.value },
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Cargo"
                value={formData.responsableDesarrollo.cargo}
                onChange={e =>
                  setFormData({
                    ...formData,
                    responsableDesarrollo: { ...formData.responsableDesarrollo, cargo: e.target.value },
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Approver: Vicerrector */}
          <div className="space-y-2 bg-purple-50/50 p-4 rounded-xl border border-purple-100">
            <span className="font-bold text-purple-950 block text-xs">
              4. Vicerrector de Administración y Asuntos Económicos (Aprobación &gt;$5.000.001)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nombre Vicerrector"
                value={formData.vicerrectorAdministracion.nombre}
                onChange={e =>
                  setFormData({
                    ...formData,
                    vicerrectorAdministracion: { ...formData.vicerrectorAdministracion, nombre: e.target.value },
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Cargo"
                value={formData.vicerrectorAdministracion.cargo}
                onChange={e =>
                  setFormData({
                    ...formData,
                    vicerrectorAdministracion: { ...formData.vicerrectorAdministracion, cargo: e.target.value },
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <button
              type="button"
              onClick={() => {
                if (confirm('¿Restablecer datos de fábrica de demostración?')) {
                  onResetData();
                  onClose();
                }
              }}
              className="text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restablecer Datos de Demostración</span>
            </button>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold shadow-sm flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Configuración</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
