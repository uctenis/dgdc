import { LogOut, UserCircle2, Settings, BarChart3 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SelectorModulos } from '../components/SelectorModulos';
import { RecintosPage } from '../components/RecintosPage';
import { ConfigEspacios } from '../components/ConfigEspacios';
import { AnalisisEspacios } from '../components/AnalisisEspacios';
import { getCampusList } from '../data/campusData';

/** Gestor de Espacios: módulo propio (campus, edificios, recintos y planos), con su entrada y su menú. */
export function EspaciosApp() {
  const { user, profile, logout } = useAuth();
  // Configuración y análisis se abren con ?seccion=…: el botón «atrás» del navegador vuelve al Gestor.
  const [parametros, setParametros] = useSearchParams();
  const seccion = parametros.get('seccion');
  const enConfiguracion = seccion === 'configuracion';
  const enAnalisis = seccion === 'analisis';
  const abrirSeccion = (nombre: 'configuracion' | 'analisis' | null) => {
    const nuevo = new URLSearchParams(parametros);
    if (nombre) nuevo.set('seccion', nombre); else { nuevo.delete('seccion'); nuevo.delete('consulta'); }
    setParametros(nuevo);
  };
  const abrirConfiguracion = (abrir: boolean) => abrirSeccion(abrir ? 'configuracion' : null);
  /** Desde el análisis: abre el edificio del recinto y su ficha. */
  const abrirRecinto = (edificio: string, recintoId: string) => {
    const campus = getCampusList().find(c => c.edificios.includes(edificio))?.sigla || edificio.slice(0, 3);
    setParametros(new URLSearchParams({ campus, edificio, recinto: recintoId }));
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <header
        className="sticky top-0 z-50 text-white"
        style={{ background: 'linear-gradient(135deg, #042f2e 0%, #115e59 60%, #0f766e 100%)', boxShadow: '0 4px 24px -4px rgba(4,47,46,0.55)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-[60px] lg:h-[72px] gap-3">
          <div className="min-w-0">
            <span
              className="hidden sm:inline-block text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded mb-0.5"
              style={{ background: 'rgba(94,234,212,0.15)', color: '#99f6e4', border: '1px solid rgba(94,234,212,0.2)' }}
            >
              UCT · Infraestructura · DGDC
            </span>
            <SelectorModulos actual="espacios" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden lg:flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[10px] text-teal-50">
              <UserCircle2 className="h-4 w-4 text-teal-200" />
              <span><strong className="block text-white">{profile?.displayName || user?.displayName || 'Usuario UCT'}</strong>{user?.email}</span>
            </div>
            <button onClick={() => abrirSeccion(enAnalisis ? null : 'analisis')} title="Consultas y análisis: cruces de superficies, recintos y unidades"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold transition hover:bg-white/15 hover:text-white ${enAnalisis ? 'bg-white/20 text-white' : 'bg-white/5 text-teal-50'}`}><BarChart3 className="h-5 w-5" /><span className="hidden sm:inline">Análisis</span></button>
            <button onClick={() => abrirConfiguracion(!enConfiguracion)} title="Configuración del Gestor de Espacios"
              className={`rounded-lg p-2.5 transition hover:bg-white/15 hover:text-white ${enConfiguracion ? 'bg-white/20 text-white' : 'bg-white/5 text-teal-50'}`}><Settings className="h-5 w-5" /></button>
            <button onClick={() => void logout()} title="Cerrar sesión" className="rounded-lg bg-white/5 p-2.5 text-teal-50 transition hover:bg-white/15 hover:text-white"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {enConfiguracion ? <ConfigEspacios onCerrar={() => abrirConfiguracion(false)} />
          : enAnalisis ? <AnalisisEspacios onAbrirRecinto={abrirRecinto} onCerrar={() => abrirSeccion(null)} />
          : <RecintosPage />}
      </main>
    </div>
  );
}
