import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, FolderKanban, DoorOpen, Check, Home, LayoutGrid, Users } from 'lucide-react';

// Módulos del sistema DGDC. Cada uno tiene su propia entrada y menú; comparten el inicio de sesión y se cruzan datos.
const MODULOS = [
  { id: 'adjudicaciones', nombre: 'Gestor de Proyectos', detalle: 'Cartera, presupuestos, licitaciones, obras y proveedores', ruta: '/proyectos', icono: FolderKanban },
  { id: 'espacios', nombre: 'Gestor de Espacios', detalle: 'Campus, edificios, recintos y planos', ruta: '/espacios', icono: DoorOpen },
  { id: 'asignacion', nombre: 'Asignación de Espacios', detalle: 'Ubicar personas, propuestas de cambio e historial', ruta: '/asignacion', icono: Users },
] as const;
export type IdModulo = typeof MODULOS[number]['id'];

/**
 * Logo del sistema: lleva al inicio de DGDC (donde se elige el módulo). Es el mismo en todos los módulos; cambia solo
 * el color, para que el usuario reconozca dónde está.
 */
export function LogoInicioDGDC({ tono = 'azul' }: { tono?: 'azul' | 'verde' | 'violeta' }) {
  const navigate = useNavigate();
  const fondo = tono === 'violeta'
    ? { background: 'linear-gradient(135deg, #c4b5fd 0%, #6d28d9 100%)', boxShadow: '0 0 0 2px rgba(196,181,253,0.25), 0 4px 12px -2px rgba(109,40,217,0.5)' }
    : tono === 'verde'
    ? { background: 'linear-gradient(135deg, #5eead4 0%, #0f766e 100%)', boxShadow: '0 0 0 2px rgba(94,234,212,0.25), 0 4px 12px -2px rgba(15,118,110,0.5)' }
    : { background: 'linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)', boxShadow: '0 0 0 2px rgba(56,189,248,0.25), 0 4px 12px -2px rgba(29,78,216,0.5)' };
  return (
    <button type="button" onClick={() => navigate('/')} title="Inicio del sistema DGDC (elegir módulo)" aria-label="Inicio del sistema DGDC"
      className="group relative w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center shrink-0 transition hover:scale-105" style={fondo}>
      <svg viewBox="0 0 40 40" width="24" height="24" fill="none" className="transition group-hover:opacity-0">
        <path d="M20 4L36 12V28L20 36L4 28V12L20 4Z" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M20 4V36M4 12L36 12M4 28L36 28" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <circle cx="20" cy="20" r="4" fill="white" opacity="0.9" />
      </svg>
      {/* Al pasar el mouse, el logo muestra la cuadrícula de módulos: deja claro a dónde lleva. */}
      <LayoutGrid className="absolute w-5 h-5 text-white opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

/**
 * Título del módulo actual: al hacer clic permite cambiar a otro módulo o volver al inicio del sistema. La casita
 * (si el módulo la ofrece con `onInicioModulo`) lleva al inicio del propio módulo.
 */
export function SelectorModulos({ actual, onInicioModulo }: { actual: IdModulo; onInicioModulo?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const modulo = MODULOS.find(m => m.id === actual)!;

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  return (
    <div ref={caja} className="relative min-w-0 flex items-center gap-1">
      {onInicioModulo && (
        <button type="button" onClick={onInicioModulo} title={`Inicio del ${modulo.nombre}`} aria-label={`Inicio del ${modulo.nombre}`}
          className="shrink-0 rounded-md p-1 -ml-1 text-white/80 hover:text-white hover:bg-white/15 transition">
          <Home className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        title="Cambiar de módulo"
        className="flex items-center gap-1.5 text-sm lg:text-base font-bold tracking-tight text-white leading-tight truncate hover:text-sky-200 transition"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        <span className="truncate">{modulo.nombre}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="absolute left-0 top-full mt-2 w-72 rounded-xl bg-white text-slate-800 shadow-2xl border border-slate-200 overflow-hidden z-[60]">
          <button type="button" onClick={() => { setAbierto(false); navigate('/'); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100">
            <LayoutGrid className="w-4 h-4 text-slate-600 shrink-0" />
            <span className="text-xs font-bold">Inicio del sistema DGDC</span>
          </button>
          <p className="px-3 pt-2.5 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Módulos del sistema</p>
          {MODULOS.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => { setAbierto(false); if (m.id !== actual) navigate(m.ruta); else onInicioModulo?.(); }}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 ${m.id === actual ? 'bg-sky-50' : ''}`}
            >
              <m.icono className="w-4 h-4 mt-0.5 text-sky-700 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold">{m.nombre}</span>
                <span className="block text-[10px] text-slate-500">{m.detalle}</span>
              </span>
              {m.id === actual && <Check className="w-4 h-4 text-sky-700 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
