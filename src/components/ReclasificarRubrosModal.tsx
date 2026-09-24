import { useMemo, useState } from 'react';
import { X, Search, Sparkles, Loader2, CheckCircle2, Tags, AlertTriangle } from 'lucide-react';
import type { Proveedor } from '../types';
import { getRubrosList } from '../data/rubrosData';
import { sugerirRubrosProveedoresConIA, isAIConfigured, mensajeErrorIA } from '../services/aiService';

interface Props {
  proveedores: Proveedor[];
  onUpdateProveedor: (id: string, prov: Partial<Proveedor>) => void | Promise<void>;
  onClose: () => void;
}

// Proveedores por llamada a la IA (lista corta → respuesta rápida y sin cortes).
const LOTE_IA = 40;

/**
 * Reclasificación masiva del rubro de los proveedores. El rubro es lo que usa la licitación para
 * sugerir a quién invitar: si todos tienen el mismo rubro, el filtro "Solo mi rubro" no sirve.
 */
export function ReclasificarRubrosModal({ proveedores, onUpdateProveedor, onClose }: Props) {
  const rubros = getRubrosList().filter(r => r.estado === 'Activo');
  const [busqueda, setBusqueda] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('Todos');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [rubroDestino, setRubroDestino] = useState('');
  const [sugerencias, setSugerencias] = useState<Record<string, string>>({});
  const [progresoIA, setProgresoIA] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const visibles = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return proveedores
      .filter(p => filtroRubro === 'Todos' || (p.rubro || '') === filtroRubro)
      .filter(p => !q || p.razonSocial.toLowerCase().includes(q) || p.rut.toLowerCase().includes(q))
      .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));
  }, [proveedores, busqueda, filtroRubro]);

  const conteoPorRubro = useMemo(() => {
    const m = new Map<string, number>();
    proveedores.forEach(p => m.set(p.rubro || '(sin rubro)', (m.get(p.rubro || '(sin rubro)') || 0) + 1));
    return m;
  }, [proveedores]);

  const todosVisiblesMarcados = visibles.length > 0 && visibles.every(p => seleccion.has(p.id));
  const alternarTodos = () => setSeleccion(prev => {
    const s = new Set(prev);
    if (todosVisiblesMarcados) visibles.forEach(p => s.delete(p.id));
    else visibles.forEach(p => s.add(p.id));
    return s;
  });
  const alternar = (id: string) => setSeleccion(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const aplicar = async (cambios: { id: string; rubro: string }[], etiqueta: string) => {
    const reales = cambios.filter(c => proveedores.find(p => p.id === c.id)?.rubro !== c.rubro);
    if (reales.length === 0) { setAviso({ tipo: 'ok', texto: 'No había cambios que guardar.' }); return; }
    setAviso(null);
    let ok = 0;
    for (const [i, c] of reales.entries()) {
      setGuardando(`${etiqueta}: ${i + 1} de ${reales.length}…`);
      try {
        await onUpdateProveedor(c.id, { rubro: c.rubro });
        ok++;
      } catch (err) {
        console.error('Error actualizando rubro del proveedor', c.id, err);
      }
    }
    setGuardando(null);
    setSeleccion(new Set());
    setSugerencias(prev => {
      const n = { ...prev };
      reales.forEach(c => delete n[c.id]);
      return n;
    });
    setAviso(ok === reales.length
      ? { tipo: 'ok', texto: `Rubro actualizado en ${ok} proveedor(es).` }
      : { tipo: 'error', texto: `Se actualizaron ${ok} de ${reales.length}. Revise su conexión e intente de nuevo con los restantes.` });
  };

  const asignarASeleccionados = () => {
    if (!rubroDestino || seleccion.size === 0) return;
    void aplicar([...seleccion].map(id => ({ id, rubro: rubroDestino })), 'Asignando');
  };

  const sugerirConIA = async () => {
    const objetivo = (seleccion.size ? visibles.filter(p => seleccion.has(p.id)) : visibles);
    if (objetivo.length === 0) return;
    setAviso(null);
    const nuevas: Record<string, string> = {};
    try {
      for (let i = 0; i < objetivo.length; i += LOTE_IA) {
        const lote = objetivo.slice(i, i + LOTE_IA);
        setProgresoIA(`Analizando ${Math.min(i + LOTE_IA, objetivo.length)} de ${objetivo.length} proveedores…`);
        const res = await sugerirRubrosProveedoresConIA(
          lote.map((p, j) => ({ clave: `P${j + 1}`, razonSocial: p.razonSocial })),
          rubros.map(r => ({ nombre: r.nombre, descripcion: r.descripcion }))
        );
        lote.forEach((p, j) => {
          const r = res[`P${j + 1}`];
          if (r && r !== p.rubro) nuevas[p.id] = r;
        });
        setSugerencias(prev => ({ ...prev, ...nuevas }));
      }
      setAviso({ tipo: 'ok', texto: `La IA propuso cambiar el rubro de ${Object.keys(nuevas).length} proveedor(es). Revise las propuestas (en violeta) y aplíquelas. Los que no tienen propuesta tienen una razón social que no permite deducir la especialidad.` });
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeErrorIA(err) });
    } finally {
      setProgresoIA(null);
    }
  };

  const idsConSugerencia = Object.keys(sugerencias).filter(id => visibles.some(p => p.id === id));
  const ocupado = Boolean(guardando || progresoIA);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><Tags className="w-5 h-5 text-violet-600" /> Reclasificar rubros de proveedores</h3>
            <p className="text-[11px] text-slate-500 mt-1 max-w-2xl">
              El rubro define a quién se sugiere invitar en cada licitación. Filtre, marque proveedores y asígneles un rubro,
              o pida a la IA una propuesta según la razón social (usted revisa antes de aplicar).
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Filtrar por razón social o RUT (ej: eléctric, clima, pintura, paisaj)…"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <select value={filtroRubro} onChange={e => setFiltroRubro(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white">
              <option value="Todos">Todos los rubros ({proveedores.length})</option>
              {[...conteoPorRubro.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => <option key={r} value={r === '(sin rubro)' ? '' : r}>{r} ({n})</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <span className="text-[11px] font-bold text-slate-700">{seleccion.size} seleccionado(s)</span>
            <select value={rubroDestino} onChange={e => setRubroDestino(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-lg text-[11px] bg-white">
              <option value="">Asignar el rubro…</option>
              {rubros.map(r => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
            </select>
            <button
              onClick={asignarASeleccionados}
              disabled={!rubroDestino || seleccion.size === 0 || ocupado}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Asignar a seleccionados
            </button>
            <span className="flex-1" />
            <button
              onClick={sugerirConIA}
              disabled={ocupado || visibles.length === 0 || !isAIConfigured()}
              title={isAIConfigured() ? 'Propone un rubro según la razón social (a los seleccionados, o a todos los visibles si no hay selección)' : 'La IA no está configurada'}
              className="px-3 py-1.5 bg-white hover:bg-violet-50 disabled:opacity-40 border border-violet-300 text-violet-800 rounded-lg text-[11px] font-bold flex items-center gap-1"
            >
              {progresoIA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Sugerir con IA ({seleccion.size || visibles.length})
            </button>
            {idsConSugerencia.length > 0 && (
              <button
                onClick={() => void aplicar(idsConSugerencia.map(id => ({ id, rubro: sugerencias[id] })), 'Aplicando propuestas')}
                disabled={ocupado}
                className="px-3 py-1.5 bg-violet-700 hover:bg-violet-800 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold"
              >
                Aplicar {idsConSugerencia.length} propuesta(s) de la IA
              </button>
            )}
          </div>

          {(progresoIA || guardando) && (
            <p className="text-[11px] text-violet-800 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {progresoIA || guardando}</p>
          )}
          {aviso && (
            <p className={`text-[11px] rounded-lg p-2 border flex items-start gap-1.5 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
              {aviso.tipo === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />} {aviso.texto}
            </p>
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="p-2 w-8"><input type="checkbox" checked={todosVisiblesMarcados} onChange={alternarTodos} /></th>
                  <th className="p-2">Proveedor ({visibles.length})</th>
                  <th className="p-2">Rubro actual</th>
                  <th className="p-2">Propuesta IA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map(p => (
                  <tr key={p.id} className={seleccion.has(p.id) ? 'bg-violet-50/60' : 'hover:bg-slate-50'}>
                    <td className="p-2"><input type="checkbox" checked={seleccion.has(p.id)} onChange={() => alternar(p.id)} /></td>
                    <td className="p-2"><span className="font-bold text-slate-800">{p.razonSocial}</span><span className="block text-[9px] text-slate-400">{p.rut}</span></td>
                    <td className="p-2 text-slate-600">{p.rubro || <em className="text-slate-400">sin rubro</em>}</td>
                    <td className="p-2">
                      {sugerencias[p.id] ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200 font-bold">{sugerencias[p.id]}</span>
                          <button
                            onClick={() => setSugerencias(prev => { const n = { ...prev }; delete n[p.id]; return n; })}
                            title="Descartar esta propuesta"
                            className="text-slate-400 hover:text-rose-600"
                          ><X className="w-3 h-3" /></button>
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">Ningún proveedor coincide con el filtro.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
