import { useMemo, useState } from 'react';
import { X, Upload, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { importarRecintos } from '../services/recintos';
import {
  CAMPOS_IMPORTACION, asignarAutomatico, detectarFilaEncabezado, elegirHoja, leerLibro, letraColumna, revisarFilas,
  type Asignacion, type Tabla,
} from '../utils/importacionRecintos';

interface Props {
  /** Edificio abierto en la pantalla: se usa cuando la planilla no trae columna de edificio. */
  edificioCodigo: string;
  etiquetaEdificio: string;
  onClose: () => void;
  onImportado: () => void;
}

/** Importa recintos desde una planilla de uno o de varios edificios: elige hoja, asigna columnas, revisa y carga (sin duplicar códigos). */
export function ImportarRecintosModal({ edificioCodigo, etiquetaEdificio, onClose, onImportado }: Props) {
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [hoja, setHoja] = useState('');
  const [filaEncabezado, setFilaEncabezado] = useState(1);
  const [asignacion, setAsignacion] = useState<Asignacion>({});
  const [guardarResto, setGuardarResto] = useState(true);
  const [incluirDatosPersonales, setIncluirDatosPersonales] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [avance, setAvance] = useState('');
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState('');

  const filas = useMemo(() => (tabla && hoja ? tabla.filasPorHoja[hoja] || [] : []), [tabla, hoja]);
  const encabezados = useMemo(() => filas[filaEncabezado - 1] || [], [filas, filaEncabezado]);
  const datos = useMemo(() => filas.slice(filaEncabezado), [filas, filaEncabezado]);

  const usarHoja = (t: Tabla, nombre: string) => {
    const fila = detectarFilaEncabezado(t.filasPorHoja[nombre] || []);
    setHoja(nombre);
    setFilaEncabezado(fila);
    setAsignacion(asignarAutomatico(t.filasPorHoja[nombre]?.[fila - 1] || []));
  };

  const elegirArchivo = async (archivo?: File) => {
    if (!archivo) return;
    setError('');
    setResultado('');
    setLeyendo(true);
    try {
      const leida = await leerLibro(await archivo.arrayBuffer(), archivo.name);
      if (!leida.hojas.length) throw new Error('La planilla no tiene datos.');
      setTabla(leida);
      // Se parte por la hoja que más parece un listado de recintos (en un catastro, la consolidada).
      usarHoja(leida, elegirHoja(leida));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLeyendo(false);
    }
  };

  const revision = useMemo(
    () => revisarFilas(encabezados, datos, filaEncabezado, asignacion, { edificioPorDefecto: edificioCodigo, guardarResto, incluirDatosPersonales }),
    [encabezados, datos, filaEncabezado, asignacion, edificioCodigo, guardarResto, incluirDatosPersonales],
  );
  const validas = revision.filter(r => !r.problemasGraves.length && !r.repetida);
  const repetidas = revision.filter(r => r.repetida).length;
  const conProblemas = revision.filter(r => r.problemasGraves.length).length;
  const edificios = new Set(validas.map(r => r.edificio));
  const faltaObligatorio = CAMPOS_IMPORTACION.some(c => c.obligatorio && asignacion[c.id] === undefined);
  const variosEdificios = asignacion.edificio !== undefined;

  const importar = async () => {
    if (!validas.length) return;
    const destino = variosEdificios ? `${edificios.size} edificio(s)` : etiquetaEdificio;
    if (!confirm(`Se cargarán ${validas.length} recinto(s) en ${destino}. Los que ya existan con el mismo código se actualizarán con los datos de la planilla.\n\n¿Continuar?`)) return;
    setImportando(true);
    setError('');
    try {
      const r = await importarRecintos(
        validas.map(v => ({ edificio: v.edificio, piso: v.piso, recinto: v.recinto })),
        (hechos, total, edificio) => setAvance(edificio ? `Cargando ${edificio} (${hechos + 1} de ${total})…` : ''),
      );
      setResultado(`Listo: ${r.creados} recinto(s) nuevos y ${r.actualizados} actualizados en ${r.edificios} edificio(s)${r.pisosNuevos ? `; se crearon ${r.pisosNuevos} piso(s)` : ''}.`);
      onImportado();
    } catch (e) {
      setError(`${e instanceof Error ? e.message : String(e)} Lo cargado antes del error quedó guardado; puede volver a importar sin duplicar.`);
    } finally {
      setImportando(false);
      setAvance('');
    }
  };

  const etiquetaColumna = (c: string, i: number) => `${letraColumna(i)} · ${c || '(sin título)'}`;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl flex flex-col max-h-[94vh] overflow-hidden border border-slate-200 text-xs">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <span className="text-[10px] font-extrabold uppercase text-emerald-700 flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" /> Importar recintos desde planilla</span>
            <h3 className="text-sm font-bold text-slate-800">{variosEdificios ? 'Varios edificios (según la columna Edificio)' : etiquetaEdificio}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-slate-600">
            Suba la planilla (Excel o CSV). Cada fila es un recinto y debe traer al menos <strong>piso</strong>, <strong>código</strong> y <strong>nombre o tipo</strong>.
            Si trae una columna de <strong>edificio</strong>, se cargan todos los edificios de una vez; si no, todo va a {etiquetaEdificio}.
            Un recinto que ya existe con el mismo código se actualiza: no se duplica.
          </p>
          <label className="flex items-center gap-2 w-fit px-3 py-2 border border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 rounded-lg font-bold text-slate-600 cursor-pointer">
            {leyendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {leyendo ? 'Leyendo…' : tabla ? 'Elegir otra planilla' : 'Elegir planilla'}
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { elegirArchivo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>

          {tabla && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="font-bold text-slate-700">Hoja
                  <select value={hoja} onChange={e => usarHoja(tabla, e.target.value)} className="block mt-1 px-2 py-1.5 border border-slate-300 rounded-lg font-normal">
                    {tabla.hojas.map(h => <option key={h} value={h}>{h} ({tabla.filasPorHoja[h].length} filas)</option>)}
                  </select>
                </label>
                <label className="font-bold text-slate-700">Fila de encabezados
                  <input type="number" min={1} max={Math.max(1, filas.length)} value={filaEncabezado}
                    onChange={e => { const n = Math.max(1, Number(e.target.value) || 1); setFilaEncabezado(n); setAsignacion(asignarAutomatico(filas[n - 1] || [])); }}
                    className="block mt-1 w-20 px-2 py-1.5 border border-slate-300 rounded-lg font-normal" />
                </label>
                <span className="text-slate-500 pb-2">{datos.length} fila(s) de datos</span>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1.5">¿Qué columna corresponde a cada dato? <span className="font-normal text-slate-500">(revise lo que se asignó solo)</span></h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CAMPOS_IMPORTACION.map(campo => (
                    <label key={campo.id} className="font-semibold text-slate-700">
                      {campo.etiqueta}{campo.obligatorio && <span className="text-rose-600"> *</span>}
                      <select
                        value={asignacion[campo.id] ?? ''}
                        onChange={e => setAsignacion(a => ({ ...a, [campo.id]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        className={`block mt-1 w-full px-2 py-1.5 border rounded-lg font-normal ${campo.obligatorio && asignacion[campo.id] === undefined ? 'border-rose-300 bg-rose-50' : 'border-slate-300'}`}
                      >
                        <option value="">— no está en la planilla —</option>
                        {encabezados.map((c, i) => <option key={i} value={i}>{etiquetaColumna(c, i)}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 mt-2 text-slate-600">
                  <input type="checkbox" checked={guardarResto} onChange={e => setGuardarResto(e.target.checked)} />
                  Guardar también las demás columnas como datos adicionales del recinto
                </label>
                {guardarResto && (
                  <label className="flex items-center gap-2 mt-1 text-slate-600">
                    <input type="checkbox" checked={incluirDatosPersonales} onChange={e => setIncluirDatosPersonales(e.target.checked)} />
                    Incluir también RUT, anexo y tipo de contrato. <span className="text-amber-700">Recomendado: no. El nombre y el cargo de los ocupantes se guardan igual, en su lista de ocupantes.</span>
                  </label>
                )}
              </div>

              {!faltaObligatorio && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-1.5">
                    Revisión: {validas.length} recinto(s) listo(s) para cargar{variosEdificios ? ` en ${edificios.size} edificio(s)` : ''}
                    {repetidas ? ` · ${repetidas} fila(s) repiten un código (una por ocupante): sus ocupantes se suman al recinto` : ''}
                    {conProblemas ? ` · ${conProblemas} con problemas (no se cargan)` : ''}
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-72">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-100 text-slate-600 sticky top-0">
                        <tr><th className="p-1.5 text-left">Fila</th><th className="p-1.5 text-left">Edificio</th><th className="p-1.5 text-left">Piso</th><th className="p-1.5 text-left">Código</th><th className="p-1.5 text-left">Nombre</th><th className="p-1.5 text-left">Uso</th><th className="p-1.5 text-right">m² útil</th><th className="p-1.5 text-right">m² OGUC</th><th className="p-1.5 text-left">Estado</th><th className="p-1.5 text-left">Observación</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {revision.filter(r => !r.repetida).slice(0, 200).map(r => (
                          <tr key={r.n} className={r.problemasGraves.length ? 'bg-rose-50' : ''}>
                            <td className="p-1.5 text-slate-400">{r.n}</td>
                            <td className="p-1.5 font-mono">{r.edificio}</td>
                            <td className="p-1.5">{r.piso}</td>
                            <td className="p-1.5 font-mono font-bold">{r.recinto.codigo}</td>
                            <td className="p-1.5">{r.recinto.nombre}</td>
                            <td className="p-1.5">{r.recinto.uso}</td>
                            <td className="p-1.5 text-right">{r.recinto.superficie_m2?.toLocaleString('es-CL')}</td>
                            <td className="p-1.5 text-right">{r.recinto.superficie_oguc_m2?.toLocaleString('es-CL')}</td>
                            <td className="p-1.5">{r.recinto.estado}</td>
                            <td className={`p-1.5 ${r.problemasGraves.length ? 'text-rose-700 font-bold' : 'text-amber-700'}`}>{[...r.problemasGraves, ...r.avisos].join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {revision.length > 200 && <p className="text-slate-400 mt-1">Se muestran las primeras 200 filas; se cargan todas las que estén listas.</p>}
                </div>
              )}
            </>
          )}

          {avance && <p className="flex items-center gap-2 text-slate-600"><Loader2 className="w-4 h-4 animate-spin" /> {avance}</p>}
          {error && <p className="flex items-start gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</p>}
          {resultado && <p className="flex items-start gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5"><CheckCircle2 className="w-4 h-4 shrink-0" /> {resultado}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button type="button" onClick={onClose} disabled={importando} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">{resultado ? 'Cerrar' : 'Cancelar'}</button>
          {!resultado && (
            <button type="button" onClick={importar} disabled={importando || faltaObligatorio || !validas.length}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg font-bold flex items-center gap-1.5">
              {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Cargar {validas.length || ''} recinto(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
