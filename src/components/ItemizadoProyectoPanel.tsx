import { Fragment, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2, ListChecks, AlertTriangle, Download } from 'lucide-react';
import { FASES_ITEMIZADO } from '../types';
import type { ItemItemizadoProyecto, ProyectoMaestro, ConfiguracionFirmas } from '../types';
import { updateProyectoMaestro } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { sugerirItemizadoConIA, isAIConfigured } from '../services/aiService';
import { formatearEnteroConMiles, desformatearEntero, formatearNumeroConMiles, desformatearNumero } from '../utils/rutUtils';
import { agruparPorFase, renumerarPartidasCorrelativas, SIN_FASE } from '../utils/itemizadoOrganizer';
import { generarItemizadoExcel } from '../services/itemizadoExporter';

const UNIDADES_CONSTRUCCION = ['m2', 'm3', 'ml', 'm', 'un', 'gl', 'kg', 'ton', 'hh', 'día', 'jornada', 'litro', 'caja', 'saco', 'rollo'];

interface Props {
  proyecto: ProyectoMaestro;
  configFirmas?: ConfiguracionFirmas;
}

const nuevaPartida = (indice: number, origen: ItemItemizadoProyecto['origen'] = 'Manual', fase?: string): ItemItemizadoProyecto => ({
  id: `partida-${Date.now()}-${indice}`,
  item: String(indice + 1),
  descripcion: '',
  unidad: 'un',
  cantidad: 0,
  precioUnitario: 0,
  precioTotal: 0,
  origen,
  fase,
});

export function ItemizadoProyectoPanel({ proyecto, configFirmas }: Props) {
  const [items, setItems] = useState<ItemItemizadoProyecto[]>(proyecto.itemizado || []);
  const [guardando, setGuardando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [hayCambios, setHayCambios] = useState(false);
  const [aplicandoPresupuesto, setAplicandoPresupuesto] = useState(false);
  const [exportando, setExportando] = useState(false);
  // Mientras se escribe una Cantidad con decimales, se guarda el texto crudo tal cual se tipea
  // (con la coma al final incluida) — si se reformateara desde el número en cada tecla, la coma
  // decimal desaparecería apenas se escribe (12, -> 12) y nunca se podría ingresar el decimal.
  const [textoCantidad, setTextoCantidad] = useState<Record<string, string>>({});

  // Recargar solo al cambiar de proyecto — OJO: no agregar `proyecto.itemizado` a las
  // dependencias. La Ficha ahora suscribe el proyecto en vivo, así que ese array cambia de
  // referencia con cualquier edición remota a CUALQUIER campo del proyecto (no solo itemizado);
  // si dependiera de eso, escribir el Presupuesto Estimado desde otra pestaña, por ejemplo,
  // borraría lo que el usuario esté tipeando aquí sin guardar todavía.
  useEffect(() => {
    setItems(proyecto.itemizado || []);
    setHayCambios(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  const subtotalNeto = items.reduce((sum, it) => sum + (it.precioTotal || 0), 0);
  const tasaIva = configFirmas?.parametrosSgc?.tasaIva ?? 19;
  const montoIva = Math.round(subtotalNeto * (tasaIva / 100));
  const totalConIva = subtotalNeto + montoIva;
  const gruposPorFase = useMemo(() => agruparPorFase(items), [items]);

  const actualizarItem = (id: string, cambios: Partial<ItemItemizadoProyecto>) => {
    setItems(actuales => actuales.map(it => {
      if (it.id !== id) return it;
      const actualizado = { ...it, ...cambios };
      return { ...actualizado, precioTotal: Math.round((actualizado.cantidad || 0) * (actualizado.precioUnitario || 0)) };
    }));
    setHayCambios(true);
  };

  const agregarPartida = (fase?: string) => {
    setItems(actuales => [...actuales, nuevaPartida(actuales.length, 'Manual', fase)]);
    setHayCambios(true);
  };

  const eliminarPartida = (id: string) => {
    setItems(actuales => actuales.filter(it => it.id !== id));
    setHayCambios(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      // Al guardar se renumeran todas las partidas de forma correlativa (1, 1.1, 1.2, 2, 3.1, 3.2...)
      // — incluye tanto las que trajo la IA como las agregadas a mano, para que el itemizado final
      // quede con una numeración correlativa y legible, sin importar el orden en que se cargaron.
      const renumerados = renumerarPartidasCorrelativas(items);
      await updateProyectoMaestro(proyecto.id, { itemizado: renumerados });
      setItems(renumerados);
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
          fase: s.fase || undefined,
        })),
      ]);
      setHayCambios(true);
    } catch (err) {
      console.error('Error sugiriendo itemizado con IA:', err);
      const msg = err instanceof Error ? err.message : '';
      setErrorIA(
        msg.includes('AI_API_KEY_NOT_CONFIGURED')
          ? 'La sugerencia por IA no está configurada en este ambiente (falta VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY).'
          : msg.includes('AI_TIMEOUT')
          ? 'La IA no respondió a tiempo (60s). Intente nuevamente — si persiste, puede ser un problema temporal del proveedor (pruebe más tarde, o configure la otra IA como respaldo — Gemini/OpenAI).'
          : msg.includes('AI_NETWORK_ERROR')
          ? 'No se pudo conectar con el proveedor de IA (revise su conexión a internet o un firewall/proxy que bloquee la llamada).'
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
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={sugerirConIA}
              disabled={sugiriendo || !isAIConfigured()}
              title={isAIConfigured() ? 'Proponer partidas típicas para este tipo de proyecto' : 'Configure VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY para habilitar esta función'}
              className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed border border-violet-200 text-violet-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
            >
              {sugiriendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {sugiriendo ? 'Pensando…' : 'Sugerir más partidas con IA'}
            </button>
            <button
              type="button"
              onClick={() => agregarPartida()}
              className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar partida
            </button>
          </div>
        )}
      </div>

      {errorIA && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{errorIA}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-3 py-10 px-6 border-2 border-dashed border-violet-200 rounded-2xl bg-violet-50/30">
          <Sparkles className="w-8 h-8 text-violet-400" />
          <div>
            <p className="text-sm font-bold text-slate-800">Empiece con una sugerencia de la IA</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md">
              Analiza el nombre, tipo de obra y rubro del proyecto y propone partidas típicas organizadas por fase — desde ahí usted las edita, completa cantidad/precio o agrega más.
            </p>
          </div>
          <button
            type="button"
            onClick={sugerirConIA}
            disabled={sugiriendo || !isAIConfigured()}
            title={isAIConfigured() ? 'Proponer partidas típicas para este tipo de proyecto' : 'Configure VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY para habilitar esta función'}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-sm"
          >
            {sugiriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {sugiriendo ? 'Pensando…' : 'Sugerir partidas con IA'}
          </button>
          <button
            type="button"
            onClick={() => agregarPartida()}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            o agregue una partida manualmente
          </button>
        </div>
      ) : (
      <>
      <datalist id="unidades-construccion">
        {UNIDADES_CONSTRUCCION.map(u => <option key={u} value={u} />)}
      </datalist>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-[11px] min-w-[760px]">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="p-2 text-left w-14">Item</th>
              <th className="p-2 text-left w-40">Fase</th>
              <th className="p-2 text-left">Descripción</th>
              <th className="p-2 w-20">Unidad</th>
              <th className="p-2 w-24 text-right">Cantidad</th>
              <th className="p-2 w-28 text-right">P. Unitario</th>
              <th className="p-2 w-28 text-right">Total</th>
              <th className="p-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gruposPorFase.map(grupo => {
              const subtotalGrupo = grupo.items.reduce((sum, it) => sum + (it.precioTotal || 0), 0);
              return (
                <Fragment key={grupo.fase}>
                  <tr className="bg-indigo-50/70">
                    <td colSpan={8} className="p-1.5 text-[10px] font-extrabold uppercase text-indigo-900 tracking-wide">
                      <div className="flex items-center justify-between">
                        <span>{grupo.fase}</span>
                        <button
                          type="button"
                          onClick={() => agregarPartida(grupo.fase === SIN_FASE ? undefined : grupo.fase)}
                          className="text-indigo-600 hover:text-indigo-900 font-bold normal-case flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Agregar a esta fase
                        </button>
                      </div>
                    </td>
                  </tr>
                  {grupo.items.map(item => (
                    <tr key={item.id} className={item.origen === 'IA' ? 'bg-violet-50/40' : ''}>
                      <td className="p-1.5">
                        <input value={item.item} onChange={e => actualizarItem(item.id, { item: e.target.value })} className="w-14 p-1.5 border border-slate-200 rounded" />
                      </td>
                      <td className="p-1.5">
                        <select
                          value={item.fase || ''}
                          onChange={e => actualizarItem(item.id, { fase: e.target.value || undefined })}
                          className="w-full p-1.5 border border-slate-200 rounded text-[10px] bg-white"
                        >
                          <option value="">Sin fase</option>
                          {FASES_ITEMIZADO.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
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
                        <input
                          value={item.unidad}
                          onChange={e => actualizarItem(item.id, { unidad: e.target.value })}
                          onFocus={e => e.target.select()}
                          list="unidades-construccion"
                          className="w-16 p-1.5 border border-slate-200 rounded text-center"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={textoCantidad[item.id] ?? (item.cantidad === 0 ? '' : formatearNumeroConMiles(item.cantidad))}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const crudo = e.target.value;
                            setTextoCantidad(t => ({ ...t, [item.id]: formatearNumeroConMiles(crudo) }));
                            actualizarItem(item.id, { cantidad: desformatearNumero(crudo) });
                          }}
                          onBlur={() => setTextoCantidad(t => {
                            const { [item.id]: _omitido, ...resto } = t;
                            return resto;
                          })}
                          className="w-full p-1.5 border border-slate-200 rounded text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.precioUnitario === 0 ? '' : formatearEnteroConMiles(item.precioUnitario)}
                          onFocus={e => e.target.select()}
                          onChange={e => actualizarItem(item.id, { precioUnitario: desformatearEntero(e.target.value) })}
                          className="w-full p-1.5 border border-slate-200 rounded text-right"
                        />
                      </td>
                      <td className="p-2 text-right font-bold text-slate-700">{formatoMonedaCLP(item.precioTotal)}</td>
                      <td className="p-1 text-center">
                        <button type="button" onClick={() => eliminarPartida(item.id)} className="p-1 text-rose-500 hover:text-rose-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/70">
                    <td colSpan={6} className="p-1.5 text-right text-[10px] font-semibold text-slate-400 uppercase">Subtotal {grupo.fase}</td>
                    <td className="p-1.5 text-right text-[10px] font-bold text-slate-600">{formatoMonedaCLP(subtotalGrupo)}</td>
                    <td></td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={6} className="p-2 text-right font-semibold text-slate-500 uppercase text-[10px]">Subtotal Neto</td>
                <td className="p-2 text-right font-bold text-slate-600">{formatoMonedaCLP(subtotalNeto)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={6} className="p-2 text-right font-semibold text-slate-500 uppercase text-[10px]">IVA ({tasaIva}%)</td>
                <td className="p-2 text-right font-bold text-slate-600">{formatoMonedaCLP(montoIva)}</td>
                <td></td>
              </tr>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={6} className="p-2 text-right font-bold text-slate-500 uppercase text-[10px]">Total (IVA incluido)</td>
                <td className="p-2 text-right font-black text-indigo-700">{formatoMonedaCLP(totalConIva)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </>
      )}

      {totalConIva > 0 && totalConIva !== proyecto.valorAprox && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <span>
            El Presupuesto Estimado actual es <strong>{formatoMonedaCLP(proyecto.valorAprox || 0)}</strong>; el itemizado suma <strong>{formatoMonedaCLP(totalConIva)}</strong> (IVA incluido)
            {proyecto.valorAprox > 0 && Math.abs(totalConIva - proyecto.valorAprox) > proyecto.valorAprox * 0.1 ? ' — diferencia mayor al 10%.' : '.'}
          </span>
          <button
            type="button"
            onClick={async () => {
              setAplicandoPresupuesto(true);
              try {
                await updateProyectoMaestro(proyecto.id, { valorAprox: totalConIva });
              } catch (err) {
                console.error('Error actualizando el Presupuesto Estimado desde el itemizado:', err);
                alert('No se pudo actualizar el Presupuesto Estimado. Intente nuevamente.');
              } finally {
                setAplicandoPresupuesto(false);
              }
            }}
            disabled={aplicandoPresupuesto}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold shrink-0 flex items-center gap-1.5"
          >
            {aplicandoPresupuesto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Usar {formatoMonedaCLP(totalConIva)} como Presupuesto Estimado
          </button>
        </div>
      )}

      {items.length > 0 && (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={async () => {
            setExportando(true);
            try {
              await generarItemizadoExcel(proyecto, items, tasaIva);
            } catch (err) {
              console.error('Error exportando el itemizado a Excel:', err);
              alert('No se pudo generar el Excel. Intente nuevamente.');
            } finally {
              setExportando(false);
            }
          }}
          disabled={items.length === 0 || exportando}
          className="px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-300 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2"
        >
          {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {exportando ? 'Generando…' : 'Exportar Excel'}
        </button>
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
      )}
    </div>
  );
}
