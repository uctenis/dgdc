import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProjectManager } from './components/ProjectManager';
import { SupplierManager } from './components/SupplierManager';
import { QuotationIngestion } from './components/QuotationIngestion';
import { EvaluationMatrix } from './components/EvaluationMatrix';
import { DocumentGenerator } from './components/DocumentGenerator';
import { SettingsModal } from './components/SettingsModal';
import { ProyectosMaestros } from './components/ProyectosMaestros';
import { SgcProcessWorkflow } from './components/SgcProcessWorkflow';

import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { PortalDashboard } from './pages/PortalDashboard';
import { LicitacionDetalle } from './pages/LicitacionDetalle';

import type { Proveedor, LicitacionProyecto, Cotizacion, ConfiguracionFirmas } from './types';
import { storageService } from './services/storageService';
import {
  subscribeToProveedores,
  addProveedor as fsAddProveedor,
  updateProveedor as fsUpdateProveedor,
  deleteProveedor as fsDeleteProveedor,
  subscribeToLicitaciones,
  addLicitacion as fsAddLicitacion,
  updateLicitacion as fsUpdateLicitacion,
  deleteLicitacion as fsDeleteLicitacion,
  getAllCotizaciones,
  addCotizacion as fsAddCotizacion,
  deleteCotizacion as fsDeleteCotizacion,
  adjudicarLicitacion as fsAdjudicarLicitacion,
} from './services/firestoreService';
import { evaluarCotizaciones } from './services/evaluationEngine';

function AdminApp() {
  const [activeTab, setActiveTab] = useState<string>('licitaciones');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Core App State
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [firestoreLoading, setFirestoreLoading] = useState<boolean>(true);
  const [licitaciones, setLicitaciones] = useState<LicitacionProyecto[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [configFirmas, setConfigFirmas] = useState<ConfiguracionFirmas>(storageService.getConfigFirmas());
  const [licitacionSeleccionadaId, setLicitacionSeleccionadaId] = useState<string | null>(null);

  // Firestore Subscriptions for Licitaciones and Proveedores
  useEffect(() => {
    const unsubProvs = subscribeToProveedores(provs => {
      setProveedores(provs);
      setFirestoreLoading(false);
    });

    const unsubLics = subscribeToLicitaciones(lics => {
      setLicitaciones(lics);
      if (lics.length > 0 && !licitacionSeleccionadaId) {
        setLicitacionSeleccionadaId(lics[0].id);
      }
    });

    // Cargar cotizaciones
    getAllCotizaciones().then(cots => setCotizaciones(cots));

    return () => {
      unsubProvs();
      unsubLics();
    };
  }, []);

  const licitacionActiva = licitaciones.find(l => l.id === licitacionSeleccionadaId) || null;

  // Handlers for Proveedores
  const handleAddProveedor = async (newProv: Omit<Proveedor, 'id' | 'fechaRegistro'>) => {
    await fsAddProveedor(newProv);
  };

  const handleUpdateProveedor = async (id: string, updated: Partial<Proveedor>) => {
    await fsUpdateProveedor(id, updated);
  };

  const handleDeleteProveedor = async (id: string) => {
    if (confirm('¿Confirma que desea eliminar este proveedor?')) {
      await fsDeleteProveedor(id);
    }
  };

  // Handlers for Licitaciones (Firestore)
  const handleAddLicitacion = async (newLicitacion: Omit<LicitacionProyecto, 'id'>) => {
    const id = await fsAddLicitacion(newLicitacion);
    setLicitacionSeleccionadaId(id);
  };

  const handleUpdateLicitacion = async (id: string, updated: Partial<LicitacionProyecto>) => {
    await fsUpdateLicitacion(id, updated);
  };

  const handleDeleteLicitacion = async (id: string) => {
    if (confirm('¿Confirma que desea eliminar esta licitación y sus cotizaciones asociadas?')) {
      await fsDeleteLicitacion(id);
    }
  };

  // Handlers for Cotizaciones (Firestore)
  const handleAddCotizacion = async (newCot: Omit<Cotizacion, 'id' | 'fechaCarga'>) => {
    await fsAddCotizacion(newCot);
    const updatedCots = await getAllCotizaciones();
    setCotizaciones(updatedCots);
  };

  const handleDeleteCotizacion = async (id: string) => {
    if (confirm('¿Confirma que desea eliminar esta cotización?')) {
      await fsDeleteCotizacion(id);
      const updatedCots = await getAllCotizaciones();
      setCotizaciones(updatedCots);
    }
  };

  // Handler for Adjudicación Compuesta (Actualiza Firestore + Genera Historial en todos los proveedores)
  const handleAdjudicarLicitacion = async (licId: string, provId: string, justificacion: string) => {
    if (!licitacionActiva) return;

    const cots = cotizaciones.filter(c => c.licitacionId === licId);
    const evs = evaluarCotizaciones(cots);
    const puntajes: Record<string, number> = {};
    evs.forEach(e => {
      puntajes[e.proveedorId] = e.puntajeTotalPonderado;
    });

    await fsAdjudicarLicitacion({
      licitacionId: licId,
      proveedorGanadorId: provId,
      justificacion,
      cotizaciones: cots,
      puntajes,
      codigoCP: licitacionActiva.codigoCP,
      codigoOP: licitacionActiva.codigoOP,
      nombreProyecto: licitacionActiva.nombreProyecto,
    });

    alert('¡Licitación adjudicada con éxito! El historial de obras ha sido actualizado automáticamente en los perfiles de todos los proveedores participantes. Diríjase a la pestaña "Actas & Documentos SGC" para exportar los informes oficiales.');
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
            proveedores={proveedores}
            cotizaciones={cotizaciones}
            licitacionSeleccionadaId={licitacionSeleccionadaId}
            onSelectLicitacion={id => {
              setLicitacionSeleccionadaId(id);
              setActiveTab('cotizaciones');
            }}
            onAddLicitacion={handleAddLicitacion}
            onUpdateLicitacion={handleUpdateLicitacion}
            onDeleteLicitacion={handleDeleteLicitacion}
            onAdjudicarLicitacion={handleAdjudicarLicitacion}
          />
        )}

        {activeTab === 'proyectos-maestros' && (
          <ProyectosMaestros />
        )}

        {activeTab === 'proveedores' && (
          <SupplierManager
            proveedores={proveedores}
            isLoading={firestoreLoading}
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
            licitacion={licitaciones.find(l => l.id === licitacionSeleccionadaId) || licitaciones[0]}
            cotizaciones={cotizaciones}
            configFirmas={configFirmas}
          />
        )}

        {activeTab === 'diagrama-sgc' && (
          <SgcProcessWorkflow />
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

function ProtectedProveedorRoute({ children }: { children: React.ReactNode }) {
  const { user, isProveedor, loading } = useAuth();
  if (loading) return null;
  if (!user || !isProveedor) return <Navigate to="/portal/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Admin routes */}
          <Route path="/" element={<AdminApp />} />

          {/* Provider routes */}
          <Route path="/portal/login" element={<LoginPage />} />
          <Route
            path="/portal"
            element={
              <ProtectedProveedorRoute>
                <PortalDashboard />
              </ProtectedProveedorRoute>
            }
          />
          <Route
            path="/portal/licitacion/:id"
            element={
              <ProtectedProveedorRoute>
                <LicitacionDetalle />
              </ProtectedProveedorRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
