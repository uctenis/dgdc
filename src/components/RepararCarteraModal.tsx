import { useEffect, useState } from 'react';
import { X, AlertTriangle, RefreshCw, ShieldCheck, Loader2, Search } from 'lucide-react';
import type { LicitacionProyecto, ProyectoMaestro } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { getAllLicitaciones, getAllProyectosMaestros, updateProyectoMaestro } from '../services/firestoreService';

interface ActaRecepcionModalCloseProps {
  onClose: () => void;
}

interface Diagnostico {
  proyecto: ProyectoMaestro;
  valorActual: number;
  valorPropuesto: number;
  motivo: string;
  confiable: boolean; // true = restaurado desde una licitación vinculada de forma confiable; false = reseteo por sospecha de corrupción cruzada
}

function esAdjudicada(l: LicitacionProyecto): boolean {
  return l.estado === 'Adjudicado' || l.estadoLifecycle === 'Adjudicado' || (l.montoAdjudicadoTotal || 0) > 0;
}

export function RepararCarteraModal({ onClose }: ActaRecepcionModalCloseProps) {
  const [cargando, setCargando] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([]);
  const [totalProyectos, setTotalProyectos] = useState(0);
  const [aplicados, setAplicados] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setCargando(true);
      const [proyectos, licitaciones] = await Promise.all([getAllProyectosMaestros(), getAllLicitaciones()]);
      setTotalProyectos(proyectos.length);

      const adjudicadas = licitaciones.filter(esAdjudicada);

      // Grupos por codigoCP, para detectar proyectos que comparten un CP no único.
      const porCP = new Map<string, ProyectoMaestro[]>();
      proyectos.forEach(p => {
        if (!p.codigoCP) return;
        porCP.set(p.codigoCP, [...(porCP.get(p.codigoCP) || []), p]);
      });

      const resultados: Diagnostico[] = [];

      for (const p of proyectos) {
        const valorActual = p.montoAdjudicado || 0;

        // 1. Vínculo confiable: por proyectoMaestroId exacto.
        let matchConfiable = adjudicadas.find(l => l.proyectoMaestroId === p.id);

        // 2. Vínculo confiable: por codigoProyecto, solo si es único entre las licitaciones adjudicadas.
        if (!matchConfiable && p.codigoProyecto) {
          const candidatas = adjudicadas.filter(l => l.codigoProyecto === p.codigoProyecto);
          if (candidatas.length === 1) matchConfiable = candidatas[0];
        }

        if (matchConfiable) {
          const valorCorrecto = matchConfiable.montoAdjudicadoTotal || 0;
          if (valorCorrecto !== valorActual) {
            resultados.push({
              proyecto: p,
              valorActual,
              valorPropuesto: valorCorrecto,
              motivo: `Restaurar desde licitación vinculada (${matchConfiable.codigoProyecto || matchConfiable.id})`,
              confiable: true,
            });
          }
          continue;
        }

        // 3. Sin vínculo confiable: si el proyecto tiene monto > 0 y comparte codigoCP
        //    con otros proyectos que muestran EXACTAMENTE el mismo valor, es la firma
        //    del bug (script syncProyectos.cjs matcheaba solo por codigoCP no único).
        if (valorActual > 0) {
          const grupo = porCP.get(p.codigoCP) || [p];
          const hermanosConMismoValor = grupo.filter(g => g.id !== p.id && (g.montoAdjudicado || 0) === valorActual);
          if (grupo.length > 1 && hermanosConMismoValor.length > 0) {
            resultados.push({
              proyecto: p,
              valorActual,
              valorPropuesto: 0,
              motivo: `Valor idéntico a otros ${hermanosConMismoValor.length} proyecto(s) que comparten CP "${p.codigoCP}", sin licitación propia — corrupción cruzada`,
              confiable: false,
            });
          }
        }
      }

      setDiagnosticos(resultados);
      setCargando(false);
    })();
  }, []);

  const aplicarUno = async (d: Diagnostico) => {
    await updateProyectoMaestro(d.proyecto.id, { montoAdjudicado: d.valorPropuesto });
    setAplicados(prev => new Set(prev).add(d.proyecto.id));
  };

  const aplicarTodos = async () => {
    if (!confirm(`¿Confirma aplicar las ${diagnosticos.length} correcciones a la Cartera de Proyectos? Esta acción escribe directamente en Firestore.`)) return;
    setAplicando(true);
    try {
      for (const d of diagnosticos) {
        if (!aplicados.has(d.proyecto.id)) {
          await updateProyectoMaestro(d.proyecto.id, { montoAdjudicado: d.valorPropuesto });
          setAplicados(prev => new Set(prev).add(d.proyecto.id));
        }
      }
    } finally {
      setAplicando(false);
    }
  };

  const pendientes = diagnosticos.filter(d => !aplicados.has(d.proyecto.id));

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded">
              Herramienta de diagnóstico y reparación
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1">Presupuesto Adjudicado duplicado en la Cartera</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Se revisaron {totalProyectos} proyectos contra las licitaciones adjudicadas para detectar valores propagados por código CP compartido.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" /> Analizando Cartera de Proyectos y Licitaciones...
            </div>
          ) : diagnosticos.length === 0 ? (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-emerald-900 text-sm">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              No se detectaron inconsistencias en el Presupuesto Adjudicado de la Cartera.
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Se encontraron <strong>{diagnosticos.length}</strong> proyectos con inconsistencias. Revise cada fila antes de aplicar — puede corregir una por una o todas juntas.</span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs min-w-[720px]">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-2.5 text-left">Proyecto</th>
                      <th className="p-2.5 text-right">Valor actual</th>
                      <th className="p-2.5 text-right">Valor propuesto</th>
                      <th className="p-2.5 text-left">Motivo</th>
                      <th className="p-2.5 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diagnosticos.map(d => {
                      const yaAplicado = aplicados.has(d.proyecto.id);
                      return (
                        <tr key={d.proyecto.id} className={yaAplicado ? 'bg-emerald-50/60' : ''}>
                          <td className="p-2.5">
                            <span className="font-bold text-slate-800 block">{d.proyecto.codigoProyecto || d.proyecto.id}</span>
                            <span className="text-slate-500 text-[10px] line-clamp-1">{d.proyecto.nombre}</span>
                          </td>
                          <td className="p-2.5 text-right font-mono text-rose-700">{formatoMonedaCLP(d.valorActual)}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">{formatoMonedaCLP(d.valorPropuesto)}</td>
                          <td className="p-2.5 text-slate-600">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mr-1 ${d.confiable ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'}`}>
                              {d.confiable ? 'Restaurar' : 'Resetear'}
                            </span>
                            {d.motivo}
                          </td>
                          <td className="p-2.5 text-center">
                            {yaAplicado ? (
                              <span className="text-emerald-600 font-bold text-[10px]">Aplicado ✓</span>
                            ) : (
                              <button
                                onClick={() => aplicarUno(d)}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold"
                              >
                                Corregir
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {diagnosticos.length > 0 && (
          <div className="flex justify-end gap-3 pt-3 border-t shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-xs">Cerrar</button>
            <button
              onClick={aplicarTodos}
              disabled={aplicando || pendientes.length === 0}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg font-semibold text-xs flex items-center gap-2"
            >
              {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {aplicando ? 'Aplicando…' : `Aplicar ${pendientes.length} correcciones restantes`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function BotonRepararCartera({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 font-semibold px-3 py-2 rounded-xl text-xs shrink-0"
      title="Diagnosticar valores de Presupuesto Adjudicado duplicados en la Cartera"
    >
      <Search className="w-3.5 h-3.5" />
      <span>Diagnosticar Cartera</span>
    </button>
  );
}
