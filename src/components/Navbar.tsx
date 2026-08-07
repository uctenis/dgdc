import React from 'react';
import {
  FileSpreadsheet,
  Building2,
  FolderKanban,
  FileCheck2,
  FileText,
  Settings,
  Sparkles,
  Download,
} from 'lucide-react';
import { generarPlantillaCotizacionExcel } from '../services/templateGenerator';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  openSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, openSettings }) => {
  const tabs = [
    { id: 'licitaciones', label: 'Proyectos & Licitaciones', icon: FolderKanban },
    { id: 'proveedores', label: 'Base de Proveedores', icon: Building2 },
    { id: 'cotizaciones', label: 'Cargar Cotizaciones', icon: FileSpreadsheet },
    { id: 'evaluacion', label: 'Cuadro Comparativo & Evaluación', icon: FileCheck2 },
    { id: 'documentos', label: 'Actas & Documentos SGC', icon: FileText },
  ];

  return (
    <header className="bg-slate-900 text-white shadow-xl border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo & Institution Brand */}
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-sky-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/20">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-extrabold tracking-widest text-sky-400 uppercase bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800">
                  UCT Infraestructura
                </span>
                <span className="text-xs text-slate-400">Sistema SGC-DGDC</span>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Gestor Inteligente de Adjudicaciones
              </h1>
            </div>
          </div>

          {/* Action buttons right */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => generarPlantillaCotizacionExcel()}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-md transition border border-emerald-500/30"
              title="Descargar plantilla Excel oficial para enviar a proveedores"
            >
              <Download className="w-4 h-4" />
              <span>Plantilla Excel Proveedores</span>
            </button>

            <button
              onClick={openSettings}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Configuración de Firmas y Parámetros SGC"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 border-t border-slate-800/80 pt-1 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
                  isActive
                    ? 'border-sky-400 text-sky-400 bg-slate-800/80 shadow-inner'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
