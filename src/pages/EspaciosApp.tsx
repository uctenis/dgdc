import { LogOut, UserCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SelectorModulos } from '../components/SelectorModulos';
import { RecintosPage } from '../components/RecintosPage';

/** Gestor de Espacios: módulo propio (campus, edificios, recintos y planos), con su entrada y su menú. */
export function EspaciosApp() {
  const { user, profile, logout } = useAuth();
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
            <button onClick={() => void logout()} title="Cerrar sesión" className="rounded-lg bg-white/5 p-2.5 text-teal-50 transition hover:bg-white/15 hover:text-white"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <RecintosPage />
      </main>
    </div>
  );
}
