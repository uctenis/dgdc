import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, FolderKanban, DoorOpen, Check } from 'lucide-react';

// Módulos del sistema DGDC. Cada uno tiene su propia entrada y menú; comparten el inicio de sesión y se cruzan datos.
const MODULOS = [
  { id: 'adjudicaciones', nombre: 'Gestor de Adjudicaciones', detalle: 'Cartera, licitaciones, obras y proveedores', ruta: '/adjudicaciones', icono: FolderKanban },
  { id: 'espacios', nombre: 'Gestor de Espacios', detalle: 'Campus, edificios, recintos y planos', ruta: '/espacios', icono: DoorOpen },
] as const;
export type IdModulo = typeof MODULOS[number]['id'];

/** Título del módulo actual, que al hacer clic permite cambiar a otro módulo. */
export function SelectorModulos({ actual }: { actual: IdModulo }) {
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
    <div ref={caja} className="relative min-w-0">
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
          <p className="px-3 pt-2.5 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Módulos del sistema</p>
          {MODULOS.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => { setAbierto(false); if (m.id !== actual) navigate(m.ruta); }}
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
