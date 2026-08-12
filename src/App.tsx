import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProjectManager } from './components/ProjectManager';
import { SupplierManager } from './components/SupplierManager';
import { QuotationIngestion } from './components/QuotationIngestion';
import { EvaluationMatrix } from './components/EvaluationMatrix';
import { DocumentGenerator } from './components/DocumentGenerator';
import { SettingsModal } from './components/SettingsModal';
import { SettingsView } from './components/SettingsView';
import { ProyectosMaestros } from './components/ProyectosMaestros';
import { SgcProcessWorkflow } from './components/SgcProcessWorkflow';
import { FichaProyectoPage } from './components/FichaProyectoPage';
import { LicitacionWorkspacePage } from './components/LicitacionWorkspacePage';

import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { InternalLoginPage } from './pages/InternalLoginPage';
import { PortalDashboard } from './pages/PortalDashboard';
import { LicitacionDetalle } from './pages/LicitacionDetalle';

import type { Proveedor, LicitacionProyecto, Cotizacion, ConfiguracionFirmas, ProyectoMaestro } from './types';
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
  const [proyectoParaFicha, setProyectoParaFicha] = useState<LicitacionProyecto | ProyectoMaestro | null>(null);
  const [licitacionWorkspaceId, setLicitacionWorkspaceId] = useState<string | null>(null);

  const handleOpenFicha = (p: LicitacionProyecto | ProyectoMaestro) => {
    if ('nombreProyecto' in p) {
      setLicitacionSeleccionadaId(p.id);
      setLicitacionWorkspaceId(p.id);
      setActiveTab('ficha-licitacion');
      return;
    }
    setProyectoParaFicha(p);
    setActiveTab('ficha-proyecto');
  };

  // Firestore Subscriptions for Licitaciones and Proveedores
  useEffect(() => {
    const unsubProvs = subscribeToProveedores(provs => {
      setProveedores(provs);
      setFirestoreLoading(false);
    });

    const unsubLics = subscribeToLicitaciones(lics => {
      setLicitaciones(lics);
      if (lics.length > 0) {
        setLicitacionSeleccionadaId(currentId => currentId ?? lics[0].id);
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
    setLicitacionWorkspaceId(id);
    setActiveTab('ficha-licitacion');
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
    const licitacion = licitaciones.find(item => item.id === newCot.licitacionId);
    if (licitacion && (
      licitacion.estado === 'Adjudicado'
      || licitacion.estado === 'Cerrado'
      || licitacion.proveedorAdjudicadoId
      || licitacion.proveedorGanadorId
    )) {
      throw new Error('PROCESO_CERRADO: La licitación ya fue adjudicada y no acepta nuevas ofertas.');
    }
    await fsAddCotizacion(newCot);
    const updatedCots = await getAllCotizaciones();
    setCotizaciones(updatedCots);
  };

  const handleDeleteCotizacion = async (id: string) => {
    const cotizacion = cotizaciones.find(item => item.id === id);
    const licitacion = cotizacion
      ? licitaciones.find(item => item.id === cotizacion.licitacionId)
      : undefined;
    if (licitacion && (
      licitacion.estado === 'Adjudicado'
      || licitacion.estado === 'Cerrado'
      || licitacion.proveedorAdjudicadoId
      || licitacion.proveedorGanadorId
    )) {
      alert('Proceso cerrado: una licitación adjudicada conserva sus ofertas como antecedentes y no permite eliminarlas.');
      return;
    }
    if (confirm('¿Confirma que desea eliminar esta cotización?')) {
      await fsDeleteCotizacion(id);
      const updatedCots = await getAllCotizaciones();
      setCotizaciones(updatedCots);
    }
  };

  // Handler for Adjudicación Compuesta (Actualiza Firestore + Genera Historial en todos los proveedores)
  const handleAdjudicarLicitacion = async (licId: string, provId: string, justificacion: string) => {
    const licitacionAAdjudicar = licitaciones.find(licitacion => licitacion.id === licId);
    if (!licitacionAAdjudicar) return;

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
      codigoCP: licitacionAAdjudicar.codigoCP,
      codigoOP: licitacionAAdjudicar.codigoOP,
      nombreProyecto: licitacionAAdjudicar.nombreProyecto,
    });

    alert('¡Licitación adjudicada con éxito! El historial de obras fue actualizado. Puede abrir el acta oficial desde la pestaña "Actas" y exportarla a PDF.');
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
        openSettings={() => setActiveTab('configuracion')}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'licitaciones' && (
          <ProjectManager
            licitaciones={licitaciones}
            proveedores={proveedores}
            cotizaciones={cotizaciones}
            configFirmas={configFirmas}
            licitacionSeleccionadaId={licitacionSeleccionadaId}
            onSelectLicitacion={id => {
              setLicitacionSeleccionadaId(id);
              setLicitacionWorkspaceId(id);
              setActiveTab('ficha-licitacion');
            }}
            onOpenFicha={lic => handleOpenFicha(lic)}
            onAddLicitacion={handleAddLicitacion}
            onUpdateLicitacion={handleUpdateLicitacion}
            onDeleteLicitacion={handleDeleteLicitacion}
            onAdjudicarLicitacion={handleAdjudicarLicitacion}
          />
        )}

        {activeTab === 'proyectos-maestros' && (
          <ProyectosMaestros onOpenFicha={p => handleOpenFicha(p)} />
        )}

        {activeTab === 'ficha-proyecto' && proyectoParaFicha && (
          <FichaProyectoPage
            proyecto={proyectoParaFicha}
            onBack={() => setActiveTab('licitaciones')}
          />
        )}

        {activeTab === 'ficha-licitacion' && (() => {
          const licitacion = licitaciones.find(l => l.id === licitacionWorkspaceId);
          return licitacion ? (
            <LicitacionWorkspacePage
              licitacion={licitacion}
              proveedores={proveedores}
              cotizaciones={cotizaciones}
              configFirmas={configFirmas}
              onBack={() => setActiveTab('licitaciones')}
              onAddCotizacion={handleAddCotizacion}
              onDeleteCotizacion={handleDeleteCotizacion}
              onAdjudicarLicitacion={handleAdjudicarLicitacion}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">Cargando ficha de la licitación...</div>
          );
        })()}

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
            proveedores={proveedores}
            configFirmas={configFirmas}
            onAdjudicarLicitacion={handleAdjudicarLicitacion}
          />
        )}

        {activeTab === 'diagrama-sgc' && (
          <SgcProcessWorkflow />
        )}

        {activeTab === 'configuracion' && (
          <SettingsView
            config={configFirmas}
            onSaveConfig={handleSaveConfigFirmas}
            onResetData={handleResetAllData}
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

function ProtectedProveedorRoute({ children }: { children: React.ReactNode }) {
  const { user, isProveedor, loading } = useAuth();
  if (loading) return null;
  if (!user || !isProveedor) return <Navigate to="/portal/login" replace />;
  return <>{children}</>;
}

function ProtectedInternalRoute({ children }: { children: React.ReactNode }) {
  const { user, isInternalUser, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-950" />;
  if (!user || !isInternalUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Rutas internas */}
          <Route path="/login" element={<InternalLoginPage />} />
          <Route path="/" element={<ProtectedInternalRoute><AdminApp /></ProtectedInternalRoute>} />

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
