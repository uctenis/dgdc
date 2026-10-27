import { useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { X, Upload, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { importarRecintos } from '../services/recintos';
import { ESTADOS_RECINTO, type EstadoRecinto } from '../types/recintos';

interface Props {
  edificioCodigo: string;
  etiquetaEdificio: string;
  onClose: () => void;
  onImportado: () => void;
}

// Campos del recinto a los que se asigna una columna de la planilla.
const CAMPOS = [
  { id: 'piso', etiqueta: 'Piso', obligatorio: true, pistas: ['piso', 'nivel', 'planta'] },
  { id: 'codigo', etiqueta: 'Código del recinto', obligatorio: true, pistas: ['codigo', 'código', 'cod', 'recinto', 'n°', 'nro', 'numero'] },
  { id: 'nombre', etiqueta: 'Nombre', obligatorio: true, pistas: ['nombre', 'descripcion', 'descripción', 'denominacion', 'denominación'] },
  { id: 'uso', etiqueta: 'Uso', obligatorio: false, pistas: ['uso', 'destino', 'tipo'] },
  { id: 'superficie_m2', etiqueta: 'Superficie (m²)', obligatorio: false, pistas: ['superficie', 'sup', 'm2', 'm²', 'area', 'área'] },
  { id: 'capacidad', etiqueta: 'Capacidad (personas)', obligatorio: false, pistas: ['capacidad', 'aforo', 'personas', 'puestos'] },
  { id: 'estado', etiqueta: 'Estado', obligatorio: false, pistas: ['estado'] },
  { id: 'unidad_usuaria', etiqueta: 'Unidad usuaria', obligatorio: false, pistas: ['unidad', 'facultad', 'departamento', 'usuario'] },
  { id: 'observaciones', etiqueta: 'Observaciones', obligatorio: false, pistas: ['observacion', 'observación', 'obs', 'notas', 'comentario'] },
] as const;
type IdCampo = typeof CAMPOS[number]['id'];

type Tabla = { hojas: string[]; filasPorHoja: Record<string, string[][]> };

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Texto de una celda de Excel, sea número, fecha, fórmula o texto con formato. */
function textoCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    const v = valor as { result?: unknown; text?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return '';
  }
  return String(valor).trim();
}

/** "1.234,5" → 1234.5; "12,5" → 12.5; vacío o no numérico → null. */
function numero(texto: string): number | null {
  const t = texto.replace(/\s|m2|m²/gi, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

async function leerArchivo(archivo: File): Promise<Tabla> {
  if (/\.csv$/i.test(archivo.name)) {
    const texto = await archivo.text();
    const separador = (texto.split('\n')[0].match(/;/g)?.length || 0) > (texto.split('\n')[0].match(/,/g)?.length || 0) ? ';' : ',';
    const filas = texto.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(separador).map(c => c.replace(/^"|"$/g, '').trim()));
    return { hojas: ['CSV'], filasPorHoja: { CSV: filas } };
  }
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const filasPorHoja: Record<string, string[][]> = {};
  libro.worksheets.forEach(hoja => {
    const filas: string[][] = [];
    hoja.eachRow({ includeEmpty: false }, fila => {
      const valores = (fila.values as ExcelJS.CellValue[]).slice(1).map(textoCelda);
      if (valores.some(Boolean)) filas.push(valores);
    });
    if (filas.length) filasPorHoja[hoja.name] = filas;
  });
  return { hojas: Object.keys(filasPorHoja), filasPorHoja };
}

/** Planilla para importar recintos: elige la hoja, asigna columnas, revisa y carga (sin duplicar códigos). */
export function ImportarRecintosModal({ edificioCodigo, etiquetaEdificio, onClose, onImportado }: Props) {
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [hoja, setHoja] = useState('');
  const [filaEncabezado, setFilaEncabezado] = useState(1);
  const [asignacion, setAsignacion] = useState<Partial<Record<IdCampo, number>>>({});
  const [guardarResto, setGuardarResto] = useState(true);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<string>('');

  const filas = useMemo(() => (tabla && hoja ? tabla.filasPorHoja[hoja] || [] : []), [tabla, hoja]);
  const encabezados = useMemo(() => filas[filaEncabezado - 1] || [], [filas, filaEncabezado]);
  const datos = useMemo(() => filas.slice(filaEncabezado), [filas, filaEncabezado]);

  const asignarAutomatico = (cabecera: string[]) => {
    const nueva: Partial<Record<IdCampo, number>> = {};
    const usadas = new Set<number>();
    CAMPOS.forEach(campo => {
      const i = cabecera.findIndex((c, idx) => !usadas.has(idx) && campo.pistas.some(p => sinTildes(c).includes(sinTildes(p))));
      if (i >= 0) { nueva[campo.id] = i; usadas.add(i); }
    });
    setAsignacion(nueva);
  };

  const elegirArchivo = async (archivo?: File) => {
    if (!archivo) return;
    setError('');
    setResultado('');
    setLeyendo(true);
    try {
      const leida = await leerArchivo(archivo);
      if (!leida.hojas.length) throw new Error('La planilla no tiene datos.');
      setTabla(leida);
      setHoja(leida.hojas[0]);
      setFilaEncabezado(1);
      asignarAutomatico(leida.filasPorHoja[leida.hojas[0]][0] || []);
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLeyendo(false);
    }
  };

  // Filas listas para cargar, con sus problemas.
  const revision = useMemo(() => {
    const col = (fila: string[], campo: IdCampo) => (asignacion[campo] !== undefined ? (fila[asignacion[campo]!] || '').trim() : '');
    const asignadas = new Set(Object.values(asignacion));
    const vistos = new Set<string>();
    return datos.map((fila, i) => {
      const problemas: string[] = [];
      const piso = col(fila, 'piso');
      const codigo = col(fila, 'codigo');
      const nombre = col(fila, 'nombre');
      if (!piso) problemas.push('sin piso');
      if (!codigo) problemas.push('sin código');
      if (!nombre) problemas.push('sin nombre');
      if (codigo && vistos.has(codigo.toUpperCase())) problemas.push('código repetido en la planilla');
      if (codigo) vistos.add(codigo.toUpperCase());
      const textoSup = col(fila, 'superficie_m2');
      const superficie = numero(textoSup);
      if (textoSup && superficie === null) problemas.push('superficie no numérica');
      const textoCap = col(fila, 'capacidad');
      const capacidad = numero(textoCap);
      const textoEstado = col(fila, 'estado');
      const estado = ESTADOS_RECINTO.find(e => sinTildes(e) === sinTildes(textoEstado)) as EstadoRecinto | undefined;
      if (textoEstado && !estado) problemas.push(`estado "${textoEstado}" no reconocido (se usará Operativo)`);
      const atributos: Record<string, string> = {};
      if (guardarResto) encabezados.forEach((cab, idx) => { if (!asignadas.has(idx) && cab && fila[idx]) atributos[cab] = fila[idx]; });
      return {
        n: filaEncabezado + i + 1,
        problemasGraves: problemas.filter(p => !p.includes('no reconocido')),
        problemas,
        piso,
        recinto: {
          codigo, nombre,
          uso: col(fila, 'uso') || null,
          superficie_m2: superficie,
          capacidad: capacidad !== null ? Math.round(capacidad) : null,
          estado,
          unidad_usuaria: col(fila, 'unidad_usuaria') || null,
          observaciones: col(fila, 'observaciones') || null,
          atributos,
        },
      };
    });
  }, [datos, asignacion, guardarResto, encabezados, filaEncabezado]);

  const validas = revision.filter(r => !r.problemasGraves.length);
  const faltaObligatorio = CAMPOS.some(c => c.obligatorio && asignacion[c.id] === undefined);

  const importar = async () => {
    if (!validas.length) return;
    if (!confirm(`Se cargarán ${validas.length} recinto(s) en ${etiquetaEdificio}. Los que ya existan con el mismo código se actualizarán con los datos de la planilla.\n\n¿Continuar?`)) return;
    setImportando(true);
    setError('');
    try {
      const r = await importarRecintos(edificioCodigo, validas.map(v => ({ piso: v.piso, recinto: v.recinto })));
      setResultado(`Listo: ${r.creados} recinto(s) nuevos, ${r.actualizados} actualizados${r.pisosNuevos ? ` y ${r.pisosNuevos} piso(s) creados (revise sus nombres)` : ''}.`);
      onImportado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[94vh] overflow-hidden border border-slate-200 text-xs">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <span className="text-[10px] font-extrabold uppercase text-emerald-700 flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" /> Importar recintos desde planilla</span>
            <h3 className="text-sm font-bold text-slate-800">{etiquetaEdificio}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-slate-600">
            Suba la planilla (Excel o CSV) de este edificio. Cada fila es un recinto; debe traer al menos el <strong>piso</strong>, el <strong>código</strong> y el <strong>nombre</strong>.
            Si un recinto ya existe con el mismo código, se actualiza: no se duplica.
          </p>
          <label className="flex items-center gap-2 w-fit px-3 py-2 border border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 rounded-lg font-bold text-slate-600 cursor-pointer">
            {leyendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {leyendo ? 'Leyendo…' : tabla ? 'Elegir otra planilla' : 'Elegir planilla'}
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { elegirArchivo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>

          {tabla && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                {tabla.hojas.length > 1 && (
                  <label className="font-bold text-slate-700">Hoja
                    <select value={hoja} onChange={e => { setHoja(e.target.value); setFilaEncabezado(1); asignarAutomatico(tabla.filasPorHoja[e.target.value][0] || []); }} className="block mt-1 px-2 py-1.5 border border-slate-300 rounded-lg font-normal">
                      {tabla.hojas.map(h => <option key={h}>{h}</option>)}
                    </select>
                  </label>
                )}
                <label className="font-bold text-slate-700">Fila de encabezados
                  <input type="number" min={1} max={Math.max(1, filas.length)} value={filaEncabezado}
                    onChange={e => { const n = Math.max(1, Number(e.target.value) || 1); setFilaEncabezado(n); asignarAutomatico(filas[n - 1] || []); }}
                    className="block mt-1 w-20 px-2 py-1.5 border border-slate-300 rounded-lg font-normal" />
                </label>
                <span className="text-slate-500 pb-2">{datos.length} fila(s) de datos</span>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1.5">¿Qué columna corresponde a cada dato?</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CAMPOS.map(campo => (
                    <label key={campo.id} className="font-semibold text-slate-700">
                      {campo.etiqueta}{campo.obligatorio && <span className="text-rose-600"> *</span>}
                      <select
                        value={asignacion[campo.id] ?? ''}
                        onChange={e => setAsignacion(a => ({ ...a, [campo.id]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        className={`block mt-1 w-full px-2 py-1.5 border rounded-lg font-normal ${campo.obligatorio && asignacion[campo.id] === undefined ? 'border-rose-300 bg-rose-50' : 'border-slate-300'}`}
                      >
                        <option value="">— no está en la planilla —</option>
                        {encabezados.map((c, i) => <option key={i} value={i}>{c || `(columna ${i + 1} sin título)`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 mt-2 text-slate-600">
                  <input type="checkbox" checked={guardarResto} onChange={e => setGuardarResto(e.target.checked)} />
                  Guardar también las demás columnas de la planilla como datos adicionales del recinto
                </label>
              </div>

              {!faltaObligatorio && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-1.5">
                    Revisión: {validas.length} listo(s) para cargar{revision.length - validas.length ? `, ${revision.length - validas.length} con problemas (no se cargan)` : ''}
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-72">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-100 text-slate-600 sticky top-0">
                        <tr><th className="p-1.5 text-left">Fila</th><th className="p-1.5 text-left">Piso</th><th className="p-1.5 text-left">Código</th><th className="p-1.5 text-left">Nombre</th><th className="p-1.5 text-left">Uso</th><th className="p-1.5 text-right">m²</th><th className="p-1.5 text-left">Observación</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {revision.slice(0, 200).map(r => (
                          <tr key={r.n} className={r.problemasGraves.length ? 'bg-rose-50' : ''}>
                            <td className="p-1.5 text-slate-400">{r.n}</td>
                            <td className="p-1.5">{r.piso}</td>
                            <td className="p-1.5 font-mono font-bold">{r.recinto.codigo}</td>
                            <td className="p-1.5">{r.recinto.nombre}</td>
                            <td className="p-1.5">{r.recinto.uso}</td>
                            <td className="p-1.5 text-right">{r.recinto.superficie_m2?.toLocaleString('es-CL')}</td>
                            <td className={`p-1.5 ${r.problemasGraves.length ? 'text-rose-700 font-bold' : 'text-amber-700'}`}>{r.problemas.join('; ')}</td>
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

          {error && <p className="flex items-start gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</p>}
          {resultado && <p className="flex items-start gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5"><CheckCircle2 className="w-4 h-4 shrink-0" /> {resultado}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">{resultado ? 'Cerrar' : 'Cancelar'}</button>
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
