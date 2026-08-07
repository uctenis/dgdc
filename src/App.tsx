import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ProjectManager } from './components/ProjectManager';
import { SupplierManager } from './components/SupplierManager';
import { QuotationIngestion } from './components/QuotationIngestion';
import { EvaluationMatrix } from './components/EvaluationMatrix';
import { DocumentGenerator } from './components/DocumentGenerator';
import { SettingsModal } from './components/SettingsModal';

import type { Proveedor, LicitacionProyecto, Cotizacion, ConfiguracionFirmas } from './types';
import { storageService } from './services/storageService';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('licitaciones');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Core App State
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [licitaciones, setLicitaciones] = useState<LicitacionProyecto[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [configFirmas, setConfigFirmas] = useState<ConfiguracionFirmas>(storageService.getConfigFirmas());
  const [licitacionSeleccionadaId, setLicitacionSeleccionadaId] = useState<string | null>(null);

  // Initial Load from Storage
  useEffect(() => {
    const l = storageService.getLicitaciones();
    const p = storageService.getProveedores();
    const c = storageService.getCotizaciones();
    const cfg = storageService.getConfigFirmas();

    setLicitaciones(l);
    setProveedores(p);
    setCotizaciones(c);
    setConfigFirmas(cfg);

    if (l.length > 0) {
      setLicitacionSeleccionadaId(l[0].id);
    }
  }, []);

  const licitacionActiva = licitaciones.find(l => l.id === licitacionSeleccionadaId) || null;

  // Handlers for Proveedores
  const handleAddProveedor = (newProv: Omit<Proveedor, 'id' | 'fechaRegistro'>) => {
    storageService.addProveedor(newProv);
    setProveedores(storageService.getProveedores());
  };

  const handleUpdateProveedor = (id: string, updated: Partial<Proveedor>) => {
    storageService.updateProveedor(id, updated);
    setProveedores(storageService.getProveedores());
  };

  const handleDeleteProveedor = (id: string) => {
    if (confirm('¿Confirma que desea eliminar este proveedor?')) {
      storageService.deleteProveedor(id);
      setProveedores(storageService.getProveedores());
    }
  };

  // Handlers for Licitaciones
  const handleAddLicitacion = (newLicitacion: Omit<LicitacionProyecto, 'id'>) => {
    const created = storageService.addLicitacion(newLicitacion);
    setLicitaciones(storageService.getLicitaciones());
    setLicitacionSeleccionadaId(created.id);
  };

  const handleUpdateLicitacion = (id: string, updated: Partial<LicitacionProyecto>) => {
    storageService.updateLicitacion(id, updated);
    setLicitaciones(storageService.getLicitaciones());
  };

  const handleDeleteLicitacion = (id: string) => {
    if (confirm('¿Confirma que desea eliminar esta licitación y sus cotizaciones asociadas?')) {
      storageService.deleteLicitacion(id);
      const l = storageService.getLicitaciones();
      setLicitaciones(l);
      setCotizaciones(storageService.getCotizaciones());
      if (l.length > 0) setLicitacionSeleccionadaId(l[0].id);
      else setLicitacionSeleccionadaId(null);
    }
  };

  // Handlers for Cotizaciones
  const handleAddCotizacion = (newCot: Omit<Cotizacion, 'id' | 'fechaCarga'>) => {
    storageService.addCotizacion(newCot);
    setCotizaciones(storageService.getCotizaciones());
  };

  const handleDeleteCotizacion = (id: string) => {
    if (confirm('¿Confirma que desea eliminar esta cotización?')) {
      storageService.deleteCotizacion(id);
      setCotizaciones(storageService.getCotizaciones());
    }
  };

  // Handler for Adjudicación
  const handleAdjudicarLicitacion = (licId: string, provId: string, justificacion: string) => {
    storageService.updateLicitacion(licId, {
      estado: 'Adjudicado',
      proveedorAdjudicadoId: provId,
      justificacionAdjudicacion: justificacion,
    });
    setLicitaciones(storageService.getLicitaciones());
    alert('¡Licitación adjudicada con éxito! Diríjase a la pestaña "Actas & Documentos SGC" para exportar los informes oficiales.');
  };

  const handleSaveConfigFirmas = (cfg: ConfiguracionFirmas) => {
    storageService.saveConfigFirmas(cfg);
    setConfigFirmas(cfg);
  };

  const handleResetAllData = () => {
    storageService.resetAllData();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-100/70 font-sans text-slate-800 antialiased selection:bg-sky-500 selection:text-white flex flex-col">
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'licitaciones' && (
          <ProjectManager
            licitaciones={licitaciones}
            licitacionSeleccionadaId={licitacionSeleccionadaId}
            onSelectLicitacion={id => {
              setLicitacionSeleccionadaId(id);
              setActiveTab('cotizaciones');
            }}
            onAddLicitacion={handleAddLicitacion}
            onUpdateLicitacion={handleUpdateLicitacion}
            onDeleteLicitacion={handleDeleteLicitacion}
          />
        )}

        {activeTab === 'proveedores' && (
          <SupplierManager
            proveedores={proveedores}
            onAddProveedor={handleAddProveedor}
            onUpdateProveedor={handleUpdateProveedor}
            onDeleteProveedor={handleDeleteProveedor}
          />
        )}

        {activeTab === 'cotizaciones' && (
          <QuotationIngestion
            licitacion={licitacionActiva}
            proveedores={proveedores}
            cotizaciones={cotizaciones}
            onAddCotizacion={handleAddCotizacion}
            onDeleteCotizacion={handleDeleteCotizacion}
          />
        )}

        {activeTab === 'evaluacion' && (
          <EvaluationMatrix
            licitacion={licitacionActiva}
            cotizaciones={cotizaciones}
            onAdjudicarLicitacion={handleAdjudicarLicitacion}
            onNavigateToDocumentos={() => setActiveTab('documentos')}
          />
        )}

        {activeTab === 'documentos' && (
          <DocumentGenerator
            licitacion={licitacionActiva}
            cotizaciones={cotizaciones}
            configFirmas={configFirmas}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-6 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-1">
          <p className="font-semibold text-slate-300">
            Universidad Católica de Temuco — Subdirección de Infraestructura (SGC-DGDC)
          </p>
          <p className="text-[11px] text-slate-500">
            Sistema Inteligente de Gestión de Licitaciones, Evaluación Paramétrica y Generación de Actas SGC PS-FOR-DGDC0003
          </p>
        </div>
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={configFirmas}
        onSaveConfig={handleSaveConfigFirmas}
        onResetData={handleResetAllData}
      />
    </div>
  );
}
