import { useState } from 'react';
import { X, Download, Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { generarPlantillaProyectosExcel, parseProyectosExcel, type FilaProyectoImportada } from '../utils/proyectosExcelImporter';
import { addProyectoMaestro } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { obtenerCampusPorSigla } from '../data/campusData';

interface ImportarProyectosExcelModalProps {
  onClose: () => void;
  onImportado?: () => void;
}

export function ImportarProyectosExcelModal({ onClose, onImportado }: ImportarProyectosExcelModalProps) {
  const [filas, setFilas] = useState<FilaProyectoImportada[]>([]);
  const [erroresGenerales, setErroresGenerales] = useState<string[]>([]);
  const [analizando, setAnalizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<{ ok: number; fallidos: number } | null>(null);

  const validas = filas.filter(f => f.errores.length === 0);
  const conError = filas.filter(f => f.errores.length > 0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalizando(true);
    setResultado(null);
    try {
      const r = await parseProyectosExcel(file);
      setFilas(r.filas);
      setErroresGenerales(r.erroresGenerales);
    } catch (err) {
      setErroresGenerales([err instanceof Error ? err.message : 'No se pudo leer el archivo.']);
      setFilas([]);
    } finally {
      setAnalizando(false);
      e.target.value = '';
    }
  };

  const importar = async () => {
    if (!validas.length) return;
    if (!confirm(`¿Confirma agregar ${validas.length} proyecto(s) nuevo(s) a la Cartera 2026?`)) return;
    setImportando(true);
    let ok = 0;
    let fallidos = 0;
    for (let i = 0; i < validas.length; i++) {
      const f = validas[i];
      try {
        await addProyectoMaestro({
          codigoCP: f.datos.codigoCP,
          codigoOP: '',
          codigoOT: '',
          nombre: f.datos.nombre,
          descripcion: f.datos.descripcion,
          valorAprox: f.datos.valorAprox,
          estado: 'Pendiente',
          fechaCreacion: new Date().toISOString(),
          campusSigla: f.datos.campusSigla,
          campusNombre: f.datos.campusSigla ? obtenerCampusPorSigla(f.datos.campusSigla)?.nombre : '',
          edificioSigla: f.datos.edificioSigla,
          uso: f.datos.uso,
          tipoObra: f.datos.tipoObra,
          rubro: f.datos.rubro,
          responsableNombre: f.datos.responsableNombre,
          responsableEmail: f.datos.responsableEmail,
          prioridad: f.datos.prioridad,
          modalidadContrato: f.datos.modalidadContrato,
          fechaInicio: f.datos.fechaInicio,
          fechaTermino: f.datos.fechaTermino,
          presupuesto: f.datos.presupuestoAprobado
            ? { aprobado: true, fecha: new Date().toISOString(), aprobadoPorNombre: 'Importación Excel' }
            : { aprobado: false },
          documentosAntecedentes: [],
        });
        ok++;
      } catch (err) {
        console.error(`Error importando fila ${f.fila}:`, err);
        fallidos++;
      }
      setProgreso(Math.round(((i + 1) / validas.length) * 100));
    }
    setResultado({ ok, fallidos });
    setImportando(false);
    onImportado?.();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded">
              Carga Masiva de Proyectos
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1">Importar Cartera desde Excel</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {resultado ? (
            <div className={`rounded-xl p-5 border text-sm ${resultado.fallidos ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
              <p className="font-bold flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Importación completada</p>
              <p className="mt-1">{resultado.ok} proyecto(s) agregado(s) a la Cartera 2026.</p>
              {resultado.fallidos > 0 && <p className="mt-1 text-rose-700">{resultado.fallidos} fila(s) fallaron al guardar — revise la consola del navegador.</p>}
              <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold">Cerrar</button>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => generarPlantillaProyectosExcel()}
                  className="flex items-center gap-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Descargar plantilla (.xlsx)
                </button>
                <label className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-sm cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Seleccionar archivo Excel
                  <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
                </label>
                {analizando && <span className="text-xs text-slate-500 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando...</span>}
              </div>

              {erroresGenerales.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800">
                  {erroresGenerales.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}

              {filas.length > 0 && (
                <>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 font-bold text-emerald-700"><CheckCircle2 className="w-4 h-4" /> {validas.length} listas para importar</span>
                    {conError.length > 0 && <span className="flex items-center gap-1.5 font-bold text-rose-700"><AlertTriangle className="w-4 h-4" /> {conError.length} con errores</span>}
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead className="bg-slate-900 text-white sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Fila</th>
                          <th className="p-2 text-left">Nombre</th>
                          <th className="p-2 text-right">Presupuesto</th>
                          <th className="p-2 text-left">Campus</th>
                          <th className="p-2 text-left">Ventana</th>
                          <th className="p-2 text-center">Ppto.</th>
                          <th className="p-2 text-left">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filas.map(f => (
                          <tr key={f.fila} className={f.errores.length ? 'bg-rose-50/60' : ''}>
                            <td className="p-2 font-mono text-slate-400">{f.fila}</td>
                            <td className="p-2 font-semibold text-slate-800">{f.datos.nombre || '—'}</td>
                            <td className="p-2 text-right">{formatoMonedaCLP(f.datos.valorAprox)}</td>
                            <td className="p-2">{f.datos.campusSigla || '—'}</td>
                            <td className="p-2 text-[10px] text-slate-500 whitespace-nowrap">
                              {f.datos.fechaInicio ? new Date(f.datos.fechaInicio).toLocaleDateString('es-CL') : '—'}
                              {' → '}
                              {f.datos.fechaTermino ? new Date(f.datos.fechaTermino).toLocaleDateString('es-CL') : '—'}
                            </td>
                            <td className="p-2 text-center">
                              {f.datos.presupuestoAprobado ? <span className="text-indigo-700 font-bold">✓</span> : <span className="text-slate-300">-</span>}
                            </td>
                            <td className="p-2">
                              {f.errores.length ? (
                                <span className="text-rose-700 font-semibold" title={f.errores.join(' ')}>⚠ {f.errores[0]}</span>
                              ) : (
                                <span className="text-emerald-700 font-semibold">✓ Lista</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {importando && (
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progreso}%` }} />
                    </div>
                  )}

                  <button
                    onClick={importar}
                    disabled={!validas.length || importando}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                  >
                    {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                    {importando ? `Importando… ${progreso}%` : `Importar ${validas.length} proyecto(s) a la Cartera`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
