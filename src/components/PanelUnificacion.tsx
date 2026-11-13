import { useEffect, useState } from 'react';
import { CheckCircle2, Database, FileUp, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { conteoSupabase, copiarContenidoArchivos, sincronizarFirestoreASupabase, SUPABASE_ES_FUENTE_ETAPA_2, ultimoResumenCopia, type ResumenMigracionSupabase } from '../services/migracionSupabase';

// Lo que sigue en Firestore (y se sigue copiando) hasta la etapa 4; todo lo demás ya vive en Supabase.
const EN_FIRESTORE = new Set(['configuracion', 'usuarios', 'archivos', 'auditoria']);

// Nombre legible de cada tabla de Supabase (y de qué colección de Firestore viene).
const TABLAS: { tabla: string; nombre: string }[] = [
  { tabla: 'configuracion', nombre: 'Configuración compartida' },
  { tabla: 'usuarios', nombre: 'Usuarios' },
  { tabla: 'proveedores', nombre: 'Proveedores' },
  { tabla: 'evaluaciones_desempeno', nombre: 'Evaluaciones de desempeño' },
  { tabla: 'historial_obras_proveedor', nombre: 'Historial de obras de proveedores' },
  { tabla: 'proyectos', nombre: 'Proyectos de la Cartera' },
  { tabla: 'proyecto_subcolecciones', nombre: 'Bitácora de proyectos' },
  { tabla: 'contadores', nombre: 'Contadores de códigos' },
  { tabla: 'licitaciones', nombre: 'Licitaciones' },
  { tabla: 'licitacion_invitados', nombre: 'Invitados a licitaciones' },
  { tabla: 'invitaciones_acceso', nombre: 'Enlaces de invitación' },
  { tabla: 'licitacion_propuestas', nombre: 'Propuestas' },
  { tabla: 'licitacion_subcolecciones', nombre: 'Estados de pago, garantías, multas, consultas, libro de obra…' },
  { tabla: 'licitacion_subcolecciones:libroObraFotos', nombre: 'Fotos del libro de obra' },
  { tabla: 'cotizaciones', nombre: 'Cotizaciones' },
  { tabla: 'inscripciones_proveedores', nombre: 'Inscripciones de proveedores' },
  { tabla: 'archivos', nombre: 'Archivos (registro)' },
  { tabla: 'auditoria', nombre: 'Historial de cambios (auditoría)' },
];

/**
 * Unificación en Supabase, etapa 1 (solo el administrador del sistema): copia todo Firestore a Supabase y compara,
 * tabla por tabla, cuánto se leyó en Firestore con cuánto hay en Supabase. Firestore sigue siendo la fuente.
 */
export function PanelUnificacion() {
  const [resumen, setResumen] = useState<ResumenMigracionSupabase | null>(() => ultimoResumenCopia());
  const [conteo, setConteo] = useState<Record<string, number> | null>(null);
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');
  const [archivos, setArchivos] = useState<{ copiados: number; errores: string[] } | null>(null);

  const contar = async () => {
    try { setConteo(await conteoSupabase()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void contar(); }, []);

  const copiarTodo = async () => {
    setTrabajando('Iniciando…');
    setError('');
    try {
      const r = await sincronizarFirestoreASupabase(true, t => setTrabajando(t));
      if (!r) setError('No se pudo copiar: revise que haya iniciado sesión como administrador y que la migración 0011 esté ejecutada.');
      setResumen(r);
      await contar();
    } finally { setTrabajando(''); }
  };

  const copiarArchivos = async () => {
    setTrabajando('Archivos…');
    setError('');
    try {
      setArchivos(await copiarContenidoArchivos((hechos, total, nombre) => setTrabajando(`Archivos ${hechos} de ${total}${nombre ? ` · ${nombre}` : ''}`)));
      await contar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setTrabajando(''); }
  };

  // En Supabase puede haber MÁS que lo leído (registros nuevos escritos en vivo, o borrados en Firestore que la copia
  // no elimina), pero nunca menos: eso es lo que se marca como problema.
  const filas = TABLAS.map(t => {
    const leidos = resumen?.porTabla[t.tabla]?.leidos;
    const enSupabase = t.tabla === 'licitacion_subcolecciones'
      ? (conteo?.[t.tabla] ?? 0) - (conteo?.['licitacion_subcolecciones:libroObraFotos'] ?? 0)
      // La función de conteo no informa los tipos de subcolección sin registros: ahí son 0.
      : conteo ? (conteo[t.tabla] ?? (t.tabla.includes(':') ? 0 : undefined)) : undefined;
    const errorTabla = resumen?.porTabla[t.tabla]?.error;
    const falta = leidos !== undefined && enSupabase !== undefined && enSupabase < leidos;
    const fuenteSupabase = SUPABASE_ES_FUENTE_ETAPA_2 && !EN_FIRESTORE.has(t.tabla);
    return { ...t, leidos: fuenteSupabase ? undefined : leidos, enSupabase, errorTabla, fuenteSupabase, ok: leidos !== undefined && enSupabase !== undefined && !falta && !errorTabla };
  });
  const archivosPendientes = conteo ? (conteo.archivos ?? 0) - (conteo.archivos_con_contenido ?? 0) : null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-teal-200 shadow-xs space-y-4">
      <div className="space-y-1">
        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2"><Database className="w-4 h-4 text-teal-700" /> Unificación en Supabase · etapa 1: copia completa</h4>
        <p className="text-slate-600">
          Firestore sigue siendo la fuente de los datos. Aquí se copia todo a Supabase y se compara, tabla por tabla, lo leído en
          Firestore con lo que hay en Supabase. Cuando todo esté en verde se puede pasar a la etapa 2 (leer y escribir en Supabase).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!trabajando} onClick={() => void copiarTodo()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold disabled:opacity-50">
          {trabajando && !trabajando.startsWith('Archivos') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Copiar todo ahora
        </button>
        <button type="button" disabled={!!trabajando || archivosPendientes === 0} onClick={() => void copiarArchivos()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-300 text-teal-800 font-bold hover:bg-teal-50 disabled:opacity-50">
          {trabajando.startsWith('Archivos') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
          Copiar contenido de archivos{archivosPendientes ? ` (${archivosPendientes} pendientes)` : ''}
        </button>
        <button type="button" disabled={!!trabajando} onClick={() => void contar()} className="px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Volver a contar
        </button>
      </div>
      {trabajando && <p className="text-teal-800 font-semibold">{trabajando}</p>}
      {error && <p className="flex items-start gap-1.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-2.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</p>}
      {archivos && (
        <p className={`rounded-lg p-2.5 border ${archivos.errores.length ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
          {archivos.copiados} archivo(s) copiados.{archivos.errores.length ? ` Con problemas: ${archivos.errores.slice(0, 5).join(' · ')}${archivos.errores.length > 5 ? '…' : ''}` : ''}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <tr><th className="py-1.5 pr-2">Datos</th><th className="py-1.5 px-2 text-right">Leídos en Firestore</th><th className="py-1.5 px-2 text-right">En Supabase</th><th className="py-1.5 pl-2">Estado</th></tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.tabla} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 font-semibold text-slate-800">{f.nombre}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{f.leidos ?? '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{f.enSupabase ?? '—'}</td>
                <td className="py-1.5 pl-2">
                  {f.fuenteSupabase ? <span className="flex items-center gap-1 text-teal-800 font-semibold"><Database className="w-3.5 h-3.5" /> Fuente: Supabase</span>
                    : f.errorTabla ? <span className="text-rose-700 font-semibold">Error: {f.errorTabla}</span>
                    : f.ok ? <span className="flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Completo</span>
                    : f.leidos === undefined ? <span className="text-slate-400">Sin copia completa aún</span>
                    : <span className="text-amber-700 font-semibold">Faltan registros</span>}
                </td>
              </tr>
            ))}
            {conteo && (
              <tr>
                <td className="py-1.5 pr-2 font-semibold text-slate-800">Contenido de archivos</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{conteo.archivos ?? 0}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{conteo.archivos_con_contenido ?? 0}</td>
                <td className="py-1.5 pl-2">{archivosPendientes === 0
                  ? <span className="flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Completo</span>
                  : <span className="text-amber-700 font-semibold">{archivosPendientes} por copiar</span>}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {resumen && <p className="text-slate-500">Última copia: {new Date(resumen.fecha).toLocaleString('es-CL')}{resumen.completa ? ' (completa)' : ' (diaria, sin auditoría ni fotos)'}</p>}
    </div>
  );
}
