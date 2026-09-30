import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpenCheck, LayoutGrid, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeToLicitaciones } from '../services/firestoreService';
import { LibroObraPanel } from '../components/LibroObraPanel';
import { MisObrasLista } from '../components/MisObrasLista';
import type { LicitacionProyecto } from '../types';

/**
 * Versión para celular del libro de obra (/libro-obra): el inspector elige su obra y anota desde terreno.
 * Instalable como aplicación y usable sin señal (lo abierto una vez con conexión queda disponible).
 */
export function LibroObraMovilPage() {
  const { id } = useParams<{ id: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [licitaciones, setLicitaciones] = useState<LicitacionProyecto[] | null>(null);

  useEffect(() => subscribeToLicitaciones(setLicitaciones, () => setLicitaciones(prev => prev ?? [])), []);

  const obra = id ? licitaciones?.find(l => l.id === id) : undefined;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
        {id ? (
          <Link to="/libro-obra" className="text-slate-300 hover:text-white" title="Mis obras"><ArrowLeft className="w-5 h-5" /></Link>
        ) : (
          <BookOpenCheck className="w-5 h-5 text-sky-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-sky-300 font-semibold">Libro de obra</p>
          <p className="text-sm font-bold truncate">{obra ? obra.nombreProyecto : 'Mis obras en ejecución'}</p>
        </div>
        {!id && (
          <>
            <Link to="/" className="text-slate-400 hover:text-white" title="Ir al sistema completo"><LayoutGrid className="w-5 h-5" /></Link>
            <button type="button" onClick={() => { void logout(); }} className="text-slate-400 hover:text-white" title="Cerrar sesión"><LogOut className="w-5 h-5" /></button>
          </>
        )}
      </header>

      <main className="max-w-2xl mx-auto p-3 sm:p-4">
        {licitaciones === null ? (
          <p className="text-sm text-slate-500 text-center py-16">Cargando…</p>
        ) : id ? (
          obra ? (
            <>
              <p className="text-xs text-slate-500 mb-3">
                {obra.codigoProyecto} · Contratista: {obra.proveedorAdjudicadoNombre || '—'}
              </p>
              <LibroObraPanel licitacion={obra} compacto />
            </>
          ) : (
            <p className="text-sm text-slate-500 text-center py-16">No se encontró la obra (o no está disponible sin señal).</p>
          )
        ) : (
          <MisObrasLista licitaciones={licitaciones} onAbrir={lid => navigate(`/libro-obra/${lid}`)} />
        )}
      </main>
    </div>
  );
}
