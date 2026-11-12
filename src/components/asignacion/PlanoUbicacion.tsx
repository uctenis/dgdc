// Elegir el recinto de destino sobre el plano del edificio: se elige edificio y piso, y se hace clic en el recinto.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Loader2, Map as IconoPlano, UserPlus, X } from 'lucide-react';
import type { DocumentoEdificio, Piso, Recinto } from '../../types/recintos';
import { listarDocumentos, listarPisos, listarRecintos } from '../../services/recintos';
import type { RecintoAsignable } from '../../utils/asignacion';
import { comoTitulo } from '../../utils/texto';
import { RecintoElegido, campoClase, campusDeEdificio, nombreEdificio, useAsignacion } from './comun';

const VisorPlano = lazy(() => import('../VisorPlano').then(m => ({ default: m.VisorPlano })));

export function PlanoUbicacion({ edificioInicial, agregar, titulo, onElegir, onCerrar }: {
  edificioInicial?: string | null;
  /** Cuántas personas se ubicarían (para mostrar cómo queda el recinto). */
  agregar: number;
  titulo?: string;
  onElegir: (r: RecintoAsignable) => void;
  onCerrar: () => void;
}) {
  const { recintos: todos, porId, nombresEdificio } = useAsignacion();
  // Edificios con recintos, ordenados por campus y código.
  const edificios = useMemo(() => [...new Set(todos.map(r => r.edificio_codigo))]
    .sort((a, b) => campusDeEdificio(a).localeCompare(campusDeEdificio(b)) || a.localeCompare(b, 'es', { numeric: true })), [todos]);
  const [edificio, setEdificio] = useState(edificioInicial && edificios.includes(edificioInicial) ? edificioInicial : '');
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [recintos, setRecintos] = useState<Recinto[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoEdificio[]>([]);
  const [pisoId, setPisoId] = useState('');
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [onCerrar]);

  useEffect(() => {
    if (!edificio) return;
    let vigente = true;
    setCargando(true); setSeleccion(null);
    void Promise.all([listarPisos(edificio), listarRecintos(edificio), listarDocumentos(edificio)]).then(([p, r, d]) => {
      if (!vigente) return;
      const ordenados = [...p].sort((a, b) => a.orden - b.orden);
      setPisos(ordenados); setRecintos(r.filter(x => x.estado !== 'Eliminado')); setDocumentos(d);
      // Piso inicial: el primero que tiene plano.
      const conPlano = ordenados.find(x => d.some(doc => esLaminaDe(doc, x.id, ordenados.length)));
      setPisoId((conPlano || ordenados[0])?.id || '');
    }).catch(() => {}).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [edificio]);

  const lamina = documentos.filter(d => esLaminaDe(d, pisoId, pisos.length)).sort((a, b) => Number(b.vigente) - Number(a.vigente))[0];
  const elegido = seleccion ? porId.get(seleccion) : undefined;
  const delPiso = recintos.filter(r => r.piso_id === pisoId);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-stretch justify-center p-2 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-[1700px] flex flex-col overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
          <IconoPlano className="w-5 h-5 text-violet-700" />
          <h2 className="font-extrabold text-slate-900">{titulo || 'Elegir recinto en el plano'}</h2>
          <select value={edificio} onChange={e => setEdificio(e.target.value)} className={`${campoClase} w-auto max-w-[22rem] py-1.5`}>
            <option value="">Elija el edificio…</option>
            {edificios.map(e => <option key={e} value={e}>{nombreEdificio(nombresEdificio, e)}</option>)}
          </select>
          {pisos.length > 1 && (
            <select value={pisoId} onChange={e => { setPisoId(e.target.value); setSeleccion(null); }} className={`${campoClase} w-auto py-1.5`}>
              {pisos.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
            </select>
          )}
          <span className="text-xs text-slate-500">Haga clic en un recinto del plano para elegirlo.</span>
          <button type="button" onClick={onCerrar} title="Cerrar (Esc)" className="ml-auto p-2 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </header>
        <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-0 overflow-auto p-2 sm:p-3">
            {!edificio ? <p className="p-8 text-center text-slate-400">Elija un edificio para ver su plano.</p>
              : cargando ? <div className="h-full grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-violet-700" /></div>
              : lamina ? (
                <Suspense fallback={<div className="h-[60vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-violet-700" /></div>}>
                  <VisorPlano key={lamina.id} documento={lamina} pisos={pisos} recintos={recintos} destacado={seleccion} modo="consulta"
                    onSeleccionar={setSeleccion} onEditarRecinto={r => setSeleccion(r.id)} />
                </Suspense>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">Este piso no tiene plano cargado. Elija el recinto de la lista:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                    {delPiso.map(r => (
                      <button key={r.id} type="button" onClick={() => setSeleccion(r.id)}
                        className={`text-left rounded-xl border p-2 text-sm ${r.id === seleccion ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-white hover:border-violet-300'}`}>
                        <span className="font-mono font-bold text-violet-800">{r.codigo}</span> <span className="text-slate-600">{comoTitulo(r.nombre)}</span>
                        <span className="block text-[11px] text-slate-500">{(r.ocupantes || []).length} persona(s)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>
          <aside className="border-t lg:border-t-0 lg:border-l border-slate-200 bg-white p-4 space-y-3 overflow-y-auto">
            {elegido ? (
              <>
                <RecintoElegido r={elegido} agregar={agregar} />
                <button type="button" onClick={() => { onElegir(elegido); onCerrar(); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold">
                  <UserPlus className="w-4 h-4" /> Elegir {elegido.codigo}
                </button>
              </>
            ) : <p className="text-sm text-slate-500">{edificio ? 'Haga clic en un recinto del plano: aquí verá quiénes lo ocupan y cómo quedaría.' : ''}</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Lámina con visor de un piso (si el edificio tiene un solo piso, también las que no indican piso). */
function esLaminaDe(d: DocumentoEdificio, pisoId: string, cantidadPisos: number) {
  return d.tipo === 'Plano' && !!d.archivo_visor && (d.piso_id === pisoId || (!d.piso_id && cantidadPisos === 1));
}
