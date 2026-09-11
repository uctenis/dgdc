import { useEffect, useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2, ListChecks, AlertTriangle } from 'lucide-react';
import type { ItemItemizadoProyecto, ProyectoMaestro } from '../types';
import { updateProyectoMaestro } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { sugerirItemizadoConIA, isAIConfigured } from '../services/aiService';

interface Props {
  proyecto: ProyectoMaestro;
}

const nuevaPartida = (indice: number, origen: ItemItemizadoProyecto['origen'] = 'Manual'): ItemItemizadoProyecto => ({
  id: `partida-${Date.now()}-${indice}`,
  item: String(indice + 1),
  descripcion: '',
  unidad: 'un',
  cantidad: 0,
  precioUnitario: 0,
  precioTotal: 0,
  origen,
});

export function ItemizadoProyectoPanel({ proyecto }: Props) {
  const [items, setItems] = useState<ItemItemizadoProyecto[]>(proyecto.itemizado || []);
  const [guardando, setGuardando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [hayCambios, setHayCambios] = useState(false);

  // Si se navega a otro proyecto (o llega un cambio remoto), recargar desde Firestore.
  useEffect(() => {
    setItems(proyecto.itemizado || []);
    setHayCambios(false);
  }, [proyecto.id, proyecto.itemizado]);

  const subtotal = items.reduce((sum, it) => sum + (it.precioTotal || 0), 0);

  const actualizarItem = (id: string, cambios: Partial<ItemItemizadoProyecto>) => {
    setItems(actuales => actuales.map(it => {
      if (it.id !== id) return it;
      const actualizado = { ...it, ...cambios };
      return { ...actualizado, precioTotal: Math.round((actualizado.cantidad || 0) * (actualizado.precioUnitario || 0)) };
    }));
    setHayCambios(true);
  };

  const agregarPartida = () => {
    setItems(actuales => [...actuales, nuevaPartida(actuales.length)]);
    setHayCambios(true);
  };

  const eliminarPartida = (id: string) => {
    setItems(actuales => actuales.filter(it => it.id !== id));
    setHayCambios(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await updateProyectoMaestro(proyecto.id, { itemizado: items });
      setHayCambios(false);
    } catch (err) {
      console.error('Error guardando itemizado:', err);
      alert('No se pudo guardar el itemizado. Intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  const sugerirConIA = async () => {
    setErrorIA(null);
    setSugiriendo(true);
    try {
      const sugerencias = await sugerirItemizadoConIA({
        nombre: proyecto.nombre,
        descripcion: proyecto.descripcion,
        tipoObra: proyecto.tipoObra,
        rubro: proyecto.rubro,
        uso: proyecto.uso,
      });
      if (!sugerencias.length) {
        setErrorIA('La IA no devolvió partidas. Intente nuevamente o complete el itemizado manualmente.');
        return;
      }
      setItems(actuales => [
        ...actuales,
        ...sugerencias.map((s, i) => ({
          id: `partida-ia-${Date.now()}-${i}`,
          item: s.item || String(actuales.length + i + 1),
          descripcion: s.descripcion,
          unidad: s.unidad || 'un',
          cantidad: 0,
          precioUnitario: 0,
          precioTotal: 0,
          origen: 'IA' as const,
        })),
      ]);
      setHayCambios(true);
    } catch (err) {
      console.error('Error sugiriendo itemizado con IA:', err);
      const msg = err instanceof Error ? err.message : '';
      setErrorIA(
        msg.includes('AI_API_KEY_NOT_CONFIGURED')
          ? 'La sugerencia por IA no está configurada en este ambiente (falta VITE_OPENAI_API_KEY).'
          : 'No se pudo obtener la sugerencia de la IA. Intente nuevamente.'
      );
    } finally {
      setSugiriendo(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-indigo-600" />
            Itemizado del Proyecto (Presupuesto Referencial por Partidas)
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Desglose progresivo del Presupuesto Estimado — se puede ir completando a medida que se detalla el alcance del proyecto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={sugerirConIA}
            disabled={sugiriendo || !isAIConfigured()}
            title={isAIConfigured() ? 'Proponer partidas típicas para este tipo de proyecto' : 'Configure VITE_OPENAI_API_KEY para habilitar esta función'}
            className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed border border-violet-200 text-violet-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
          >
            {sugiriendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {sugiriendo ? 'Pensando…' : 'Sugerir partidas con IA'}
          </button>
          <button
            type="button"
            onClick={agregarPartida}
            className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar partida
          </button>
        </div>
      </div>

      {errorIA && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{errorIA}</span>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-[11px] min-w-[640px]">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="p-2 text-left w-16">Item</th>
              <th className="p-2 text-left">Descripción</th>
              <th className="p-2 w-20">Unidad</th>
              <th className="p-2 w-24 text-right">Cantidad</th>
              <th className="p-2 w-28 text-right">P. Unitario</th>
              <th className="p-2 w-28 text-right">Total</th>
              <th className="p-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr><td colSpan={7} className="p-5 text-center text-slate-400 italic">Sin partidas todavía. Agregue una manualmente o use "Sugerir partidas con IA".</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className={item.origen === 'IA' ? 'bg-violet-50/40' : ''}>
                <td className="p-1.5">
                  <input value={item.item} onChange={e => actualizarItem(item.id, { item: e.target.value })} className="w-14 p-1.5 border border-slate-200 rounded" />
                </td>
                <td className="p-1.5">
                  <div className="flex items-center gap-1">
                    {item.origen === 'IA' && <Sparkles className="w-3 h-3 text-violet-500 shrink-0" aria-label="Sugerida por IA" />}
                    <input
                      value={item.descripcion}
                      onChange={e => actualizarItem(item.id, { descripcion: e.target.value })}
                      className="min-w-[220px] w-full p-1.5 border border-slate-200 rounded"
                      placeholder="Descripción de la partida"
                    />
                  </div>
                </td>
                <td className="p-1.5">
                  <input value={item.unidad} onChange={e => actualizarItem(item.id, { unidad: e.target.value })} className="w-16 p-1.5 border border-slate-200 rounded text-center" />
                </td>
                <td className="p-1.5">
                  <input type="number" step="any" value={item.cantidad} onChange={e => actualizarItem(item.id, { cantidad: Number(e.target.value) })} className="w-full p-1.5 border border-slate-200 rounded text-right" />
                </td>
                <td className="p-1.5">
                  <input type="number" step="any" value={item.precioUnitario} onChange={e => actualizarItem(item.id, { precioUnitario: Number(e.target.value) })} className="w-full p-1.5 border border-slate-200 rounded text-right" />
                </td>
                <td className="p-2 text-right font-bold text-slate-700">{formatoMonedaCLP(item.precioTotal)}</td>
                <td className="p-1 text-center">
                  <button type="button" onClick={() => eliminarPartida(item.id)} className="p-1 text-rose-500 hover:text-rose-700">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="p-2 text-right font-bold text-slate-500 uppercase text-[10px]">Subtotal Itemizado</td>
                <td className="p-2 text-right font-black text-indigo-700">{formatoMonedaCLP(subtotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400">
          {proyecto.valorAprox > 0 && subtotal > 0 && Math.abs(subtotal - proyecto.valorAprox) > proyecto.valorAprox * 0.1 && (
            <span className="text-amber-600 font-semibold">⚠ El subtotal difiere en más de 10% del Presupuesto Estimado ({formatoMonedaCLP(proyecto.valorAprox)}).</span>
          )}
        </span>
        <button
          type="button"
          onClick={guardar}
          disabled={!hayCambios || guardando}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-2"
        >
          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {guardando ? 'Guardando…' : hayCambios ? 'Guardar Itemizado' : 'Itemizado guardado'}
        </button>
      </div>
    </div>
  );
}
