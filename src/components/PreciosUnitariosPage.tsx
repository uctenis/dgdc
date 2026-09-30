import { useEffect, useMemo, useState } from 'react';
import { Calculator, Ruler, Search, Trophy } from 'lucide-react';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { buscarPrecios, construirBiblioteca, estadisticas } from '../utils/bibliotecaPrecios';
import { factorReajuste } from '../utils/reajusteUF';
import type { Cotizacion, LicitacionProyecto } from '../types';

const MAX_FILAS = 60;
const fechaCorta = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL') : '—');

/** Factores de reajuste UF por fecha (se piden solo para las fechas que se muestran). */
function useFactores(fechas: string[]) {
  const [factores, setFactores] = useState<Record<string, number>>({});
  const [sinUF, setSinUF] = useState(false);
  const clave = [...new Set(fechas.filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    const pendientes = clave.split(',').filter(f => !(f in factores));
    if (!pendientes.length) return;
    Promise.all(pendientes.map(async f => [f, await factorReajuste(f)] as const)).then(res => {
      if (!vigente) return;
      setFactores(prev => ({ ...prev, ...Object.fromEntries(res.map(([f, r]) => [f, r.factor])) }));
      if (res.some(([, r]) => !r.reajustado)) setSinUF(true);
    });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return { factores, sinUF };
}

/**
 * Biblioteca de precios unitarios: los precios reales ofertados y adjudicados en las licitaciones de la UCT,
 * llevados a pesos de hoy con la UF, más el costo por m² de las obras adjudicadas.
 */
export function PreciosUnitariosPage({ licitaciones, cotizaciones }: { licitaciones: LicitacionProyecto[]; cotizaciones: Cotizacion[] }) {
  const [texto, setTexto] = useState('');
  const [unidad, setUnidad] = useState('');
  const [soloAdjudicados, setSoloAdjudicados] = useState(false);

  const biblioteca = useMemo(() => construirBiblioteca(cotizaciones, licitaciones), [cotizaciones, licitaciones]);
  const unidades = useMemo(() => [...new Set(biblioteca.map(p => p.unidad))].sort(), [biblioteca]);
  const resultados = useMemo(() => buscarPrecios(biblioteca, texto, unidad, soloAdjudicados), [biblioteca, texto, unidad, soloAdjudicados]);

  // Costo por m² de obras adjudicadas con superficie informada.
  const obrasM2 = useMemo(() => licitaciones
    .filter(l => (l.superficieM2 || 0) > 0 && (l.montoAdjudicadoTotal || 0) > 0)
    .map(l => ({
      id: l.id, nombre: l.nombreProyecto, codigo: l.codigoProyecto, tipo: l.tipoObra || 'Sin tipo de obra',
      m2: l.superficieM2 as number, monto: l.montoAdjudicadoTotal as number,
      fecha: (l.fechaAdjudicacion || l.fechaInicioObra || l.fechaCreacion || '').slice(0, 10),
    })), [licitaciones]);

  const { factores, sinUF } = useFactores([...resultados.slice(0, MAX_FILAS).map(p => p.fecha), ...obrasM2.map(o => o.fecha)]);
  const reajustar = (monto: number, fecha: string) => Math.round(monto * (factores[fecha] ?? 1));

  const stats = estadisticas(resultados.map(p => reajustar(p.precioUnitario, p.fecha)));
  const obrasDistintas = new Set(resultados.map(p => p.licitacionId)).size;
  const unidadesEnResultados = [...new Set(resultados.map(p => p.unidad))];

  const porTipo = useMemo(() => {
    const grupos = new Map<string, number[]>();
    obrasM2.forEach(o => grupos.set(o.tipo, [...(grupos.get(o.tipo) || []), reajustar(o.monto, o.fecha) / o.m2]));
    return [...grupos.entries()].map(([tipo, valores]) => ({ tipo, ...(estadisticas(valores) as NonNullable<ReturnType<typeof estadisticas>>) })).sort((a, b) => b.n - a.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrasM2, factores]);

  const campo = 'px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Calculator className="w-5 h-5 text-sky-600" /> Biblioteca de precios unitarios</h2>
          <p className="text-xs text-slate-500">
            {biblioteca.length.toLocaleString('es-CL')} precios reales de {new Set(biblioteca.map(p => p.licitacionId)).size} licitaciones, llevados a pesos de hoy con la UF.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input className={`${campo} w-full pl-9`} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Partida: ej. cubierta zinc, cerámica muro, pintura esmalte…" />
          </div>
          <select className={campo} value={unidad} onChange={e => setUnidad(e.target.value)} aria-label="Unidad">
            <option value="">Todas las unidades</option>
            {unidades.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 px-1">
            <input type="checkbox" checked={soloAdjudicados} onChange={e => setSoloAdjudicados(e.target.checked)} /> Solo adjudicados
          </label>
        </div>

        {texto.trim() && (
          resultados.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No hay precios para esa partida{unidad ? ` en ${unidad}` : ''}.</p>
          ) : (
            <>
              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-sky-700">Mediana (hoy)</span>
                    <span className="block text-base font-black text-slate-800 tabular-nums">{formatoMonedaCLP(stats.mediana)}</span>
                    <span className="block text-[10px] text-slate-500">{unidadesEnResultados.length === 1 ? `por ${unidadesEnResultados[0]}` : 'filtre por unidad para comparar'}</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Rango</span>
                    <span className="block text-sm font-black text-slate-700 tabular-nums">{formatoMonedaCLP(stats.min)} – {formatoMonedaCLP(stats.max)}</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Promedio</span>
                    <span className="block text-sm font-black text-slate-700 tabular-nums">{formatoMonedaCLP(stats.promedio)}</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Base</span>
                    <span className="block text-sm font-black text-slate-700">{stats.n} precios</span>
                    <span className="block text-[10px] text-slate-500">{obrasDistintas} licitaciones</span>
                  </div>
                </div>
              )}
              {unidadesEnResultados.length > 1 && (
                <p className="text-[11px] text-amber-800">Hay partidas en distintas unidades ({unidadesEnResultados.join(', ')}): elija una unidad para que las estadísticas sean comparables.</p>
              )}
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {resultados.slice(0, MAX_FILAS).map(p => (
                  <div key={p.clave} className="py-2 flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800">{p.descripcion}</p>
                      <p className="text-[10px] text-slate-500">
                        {p.codigo} · {p.obra} · {p.proveedor} · {fechaCorta(p.fecha)}
                        {p.adjudicado && <span className="inline-flex items-center gap-0.5 ml-1 text-emerald-700 font-bold"><Trophy className="w-3 h-3" /> adjudicado</span>}
                      </p>
                    </div>
                    <div className="sm:text-right shrink-0">
                      <span className="text-xs font-black text-slate-800 tabular-nums">{formatoMonedaCLP(reajustar(p.precioUnitario, p.fecha))}</span>
                      <span className="text-[10px] text-slate-500"> /{p.unidad}</span>
                      {reajustar(p.precioUnitario, p.fecha) !== p.precioUnitario && (
                        <span className="block text-[10px] text-slate-400 tabular-nums">ofertado {formatoMonedaCLP(p.precioUnitario)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {resultados.length > MAX_FILAS && <p className="text-[10px] text-slate-400">Mostrando {MAX_FILAS} de {resultados.length}; las estadísticas consideran todos.</p>}
            </>
          )
        )}
        {sinUF && <p className="text-[10px] text-amber-700">No se pudo obtener la UF de algunas fechas (sin conexión): esos precios se muestran sin reajustar.</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><Ruler className="w-4 h-4 text-indigo-600" /> Costo por m² de obras adjudicadas</h3>
          <p className="text-[11px] text-slate-500">Monto adjudicado (con IVA, en pesos de hoy) dividido por la superficie intervenida. Sirve para contrastar un presupuesto nuevo con obras parecidas.</p>
        </div>
        {obrasM2.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Aún no hay obras adjudicadas con superficie (m²) informada. La superficie se registra en los estados de pago.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {porTipo.map(t => (
                <div key={t.tipo} className="rounded-xl bg-indigo-50/60 border border-indigo-100 px-3 py-2">
                  <span className="block text-[10px] font-bold uppercase text-indigo-600 truncate">{t.tipo}</span>
                  <span className="block text-base font-black text-slate-800 tabular-nums">{formatoMonedaCLP(t.mediana)}/m²</span>
                  <span className="block text-[10px] text-slate-500">{t.n} obra{t.n === 1 ? '' : 's'}{t.n > 1 ? ` · ${formatoMonedaCLP(t.min)} – ${formatoMonedaCLP(t.max)}` : ''}</span>
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {obrasM2.map(o => (
                <div key={o.id} className="py-2 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">{o.nombre}</p>
                    <p className="text-[10px] text-slate-500">{o.codigo} · {o.tipo} · {o.m2.toLocaleString('es-CL')} m² · {formatoMonedaCLP(o.monto)}</p>
                  </div>
                  <span className="text-xs font-black text-slate-800 tabular-nums shrink-0">{formatoMonedaCLP(Math.round(reajustar(o.monto, o.fecha) / o.m2))}/m²</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
