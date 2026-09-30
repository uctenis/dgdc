import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Building2,
  FolderKanban,
  FileCheck2,
  FileText,
  Settings,
  Download,
  LogOut,
  UserCircle2,
  BarChart3,
  TrendingUp,
  ClipboardList,
  HardHat,
  Search,
  Calculator,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /** Abre el buscador general (Ctrl+K). */
  onBuscar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onBuscar }) => {
  const { user, profile, isAdmin, isSecretaria, logout } = useAuth();
  const allTabs = [
    { id: 'proyectos-maestros', label: 'Cartera de Proyectos 2026', icon: FileText },
    { id: 'avance-financiero', label: 'Avance Financiero', icon: TrendingUp },
    { id: 'licitaciones', label: 'Licitaciones', icon: FolderKanban },
    { id: 'mis-obras', label: 'Mis obras', icon: HardHat },
    { id: 'bandeja-op', label: 'Solicitudes OP', icon: ClipboardList, adminOnly: true },
    { id: 'proveedores',  label: 'Proveedores', icon: Building2, adminOnly: true },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: FileSpreadsheet, contextual: true, adminOnly: true },
    { id: 'ficha-proyecto', label: 'Ficha del Proyecto', icon: FileText, contextual: true },
    { id: 'evaluacion',   label: 'Evaluación', icon: FileCheck2, contextual: true },
    { id: 'documentos',   label: 'Actas', icon: FileText, contextual: true },
    { id: 'precios', label: 'Precios unitarios', icon: Calculator },
    { id: 'reportes', label: 'Reportes y Auditoría', icon: BarChart3 },
    { id: 'diagrama-sgc', label: 'Flujo 0021', icon: FileCheck2 },
    { id: 'configuracion', label: 'Configuración', icon: Settings, adminOnly: true },
  ];

  // Secretaría (mbustos@uct.cl) solo trabaja en la bandeja de Solicitudes de OP.
  // Celular: el menú se despliega con ☰ y se cierra al elegir una opción.
  const [menuAbierto, setMenuAbierto] = useState(false);
  useEffect(() => { setMenuAbierto(false); }, [activeTab]);

  const tabs = isSecretaria && !isAdmin
    ? allTabs.filter(t => t.id === 'bandeja-op')
    : allTabs.filter(t => (!t.contextual || activeTab === t.id) && (!t.adminOnly || isAdmin));

  return (
    <header
      className="sticky top-0 z-50 text-white"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)',
        boxShadow: '0 4px 24px -4px rgba(15,23,42,0.55)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[60px] lg:h-[72px] gap-3">

          {/* ── Brand ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 lg:gap-4 min-w-0">
            {/* Logo mark */}
            <div
              className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)',
                boxShadow: '0 0 0 2px rgba(56,189,248,0.25), 0 4px 12px -2px rgba(29,78,216,0.5)',
              }}
            >
              <svg viewBox="0 0 40 40" width="24" height="24" fill="none">
                <path d="M20 4L36 12V28L20 36L4 28V12L20 4Z" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
                <path d="M20 4V36M4 12L36 12M4 28L36 28" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
                <circle cx="20" cy="20" r="4" fill="white" opacity="0.9"/>
              </svg>
            </div>

            {/* Title stack */}
            <div className="min-w-0">
              <div className="hidden sm:flex items-center gap-2 mb-0.5">
                <span
                  className="text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded"
                  style={{ background: 'rgba(56,189,248,0.15)', color: '#7dd3fc', border: '1px solid rgba(56,189,248,0.2)' }}
                >
                  UCT · Infraestructura
                </span>
                <span className="text-[10px] text-slate-400 hidden sm:inline">DGDC</span>
              </div>
              <h1 className="text-sm lg:text-base font-bold tracking-tight text-white leading-tight truncate" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Gestor de Adjudicaciones
              </h1>
            </div>
          </div>

          {/* ── Actions ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 shrink-0">
            {onBuscar && (
              <button
                type="button"
                onClick={onBuscar}
                title="Buscar en todo el sistema (Ctrl+K)"
                aria-label="Buscar"
                className="flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 p-2.5 lg:px-3 lg:py-2 text-slate-200 text-xs transition"
              >
                <Search className="h-4 w-4" />
                <span className="hidden lg:inline">Buscar</span>
                <kbd className="hidden lg:inline text-[10px] text-slate-400 border border-white/20 rounded px-1">Ctrl K</kbd>
              </button>
            )}
            {isAdmin && <button
              onClick={() => { void import('../services/templateGenerator').then(m => m.generarPlantillaCotizacionExcel()); }}
              title="Descargar plantilla Excel oficial para enviar a proveedores"
              className="hidden sm:flex items-center gap-2 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition border"
              style={{
                background: 'rgba(5,150,105,0.2)',
                borderColor: 'rgba(52,211,153,0.25)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(5,150,105,0.35)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(5,150,105,0.2)';
              }}
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-200">Plantilla Excel</span>
            </button>}

            <div className="hidden lg:flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[10px] text-slate-300">
              <UserCircle2 className="h-4 w-4 text-sky-300" />
              <span><strong className="block text-white">{profile?.displayName || user?.displayName || 'Usuario UCT'}</strong>{user?.email}</span>
            </div>
            <button onClick={() => void logout()} title="Cerrar sesión" className="hidden lg:block rounded-lg bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/15 hover:text-white"><LogOut className="h-5 w-5" /></button>
            <button
              type="button"
              onClick={() => setMenuAbierto(v => !v)}
              className="lg:hidden rounded-lg bg-white/10 p-2.5 text-white"
              aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuAbierto}
            >
              {menuAbierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* ── Menú de celular ───────────────────────────────────────── */}
        {menuAbierto && (
          <nav className="lg:hidden pb-3 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMenuAbierto(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold text-left ${isActive ? 'bg-sky-400/15 text-sky-300' : 'text-slate-200 active:bg-white/10'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
            <div className="mt-2 pt-3 flex items-center justify-between gap-3 px-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-[11px] text-slate-300 min-w-0">
                <strong className="block text-white truncate">{profile?.displayName || user?.displayName || 'Usuario UCT'}</strong>
                <span className="truncate block">{user?.email}</span>
              </span>
              <button onClick={() => void logout()} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white shrink-0">
                <LogOut className="h-4 w-4" /> Salir
              </button>
            </div>
          </nav>
        )}

        {/* ── Navigation Tabs ───────────────────────────────────────── */}
        <nav className="hidden lg:flex gap-0.5 overflow-x-auto pb-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-5 py-3 text-xs font-semibold whitespace-nowrap transition-all relative"
                style={{
                  color: isActive ? '#38bdf8' : 'rgba(148,163,184,0.9)',
                  background: isActive ? 'rgba(56,189,248,0.08)' : 'transparent',
                  borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                  borderRadius: '0',
                }}
              >
                <Icon
                  className="w-3.5 h-3.5"
                  style={{ color: isActive ? '#38bdf8' : 'rgba(148,163,184,0.7)' }}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
