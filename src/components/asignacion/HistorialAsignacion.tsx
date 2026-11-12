// Historial de movimientos de personas entre recintos (ubicaciones, cambios sueltos y propuestas aplicadas).
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { listarHistorial, type Movimiento, type Propuesta } from '../../services/asignacion';
import { comoTitulo } from '../../utils/texto';
import { campoClase, normalizar, useAsignacion } from './comun';

const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function HistorialAsignacion({ propuestas, version }: { propuestas: Propuesta[]; version: number }) {
  const { avisar } = useAsignacion();
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => {
    setCargando(true);
    listarHistorial().then(setMovimientos).catch(e => avisar(e instanceof Error ? e.message : String(e), 'error')).finally(() => setCargando(false));
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const nombrePropuesta = useMemo(() => new Map(propuestas.map(p => [p.id, p.nombre])), [propuestas]);
  const origen = (m: Movimiento) => (m.propuesta_id ? `Propuesta «${nombrePropuesta.get(m.propuesta_id) || '—'}»`
    : !m.desde_id ? 'Ubicación' : !m.hacia_id ? (m.realizado_por?.startsWith('Nómina') ? 'Salida: ya no figura en la nómina' : 'Salida') : 'Cambio de recinto');
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda).split(/\s+/).filter(Boolean);
    return movimientos.filter(m => q.every(p => normalizar([m.persona.nombre, m.persona.unidad, m.desde_codigo, m.hacia_codigo, m.realizado_por, origen(m)].join(' ')).includes(p)));
  }, [movimientos, busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportar = () => {
    const hoja = XLSX.utils.json_to_sheet(filtrados.map(m => ({
      Fecha: fechaHora(m.realizado_en), Persona: comoTitulo(m.persona.nombre), Unidad: comoTitulo(m.persona.unidad || ''),
      Desde: m.desde_codigo || '(sin recinto)', Hacia: m.hacia_codigo || '(sale)', Origen: origen(m), Por: m.realizado_por || '',
    })));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Historial');
    XLSX.writeFile(libro, `historial_asignacion_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-wrap gap-2 items-center">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar persona, unidad, recinto o propuesta…" className={`${campoClase} flex-1 min-w-[220px]`} />
        <span className="text-xs text-slate-500"><b className="text-slate-800">{filtrados.length}</b> movimiento(s)</span>
        <button type="button" onClick={exportar} disabled={!filtrados.length} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <Download className="w-4 h-4" /> Excel</button>
      </div>
      {cargando ? <p className="p-6 text-slate-400 text-sm">Cargando…</p> : !filtrados.length ? (
        <p className="p-6 text-center text-slate-400 text-sm">{movimientos.length ? 'Nada coincide con la búsqueda.' : 'Aún no hay movimientos. Aquí quedará cada persona que se ubique o cambie de recinto.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="text-left px-4 py-2">Fecha</th><th className="text-left px-4 py-2">Persona</th><th className="text-left px-4 py-2">Movimiento</th><th className="text-left px-4 py-2">Origen</th><th className="text-left px-4 py-2">Por</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500">{fechaHora(m.realizado_en)}</td>
                  <td className="px-4 py-2"><span className="font-semibold text-slate-800">{comoTitulo(m.persona.nombre)}</span>{m.persona.unidad && <span className="block text-[11px] text-slate-500">{comoTitulo(m.persona.unidad)}</span>}</td>
                  <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                    <span className={m.desde_codigo ? '' : 'font-sans italic text-slate-400'}>{m.desde_codigo || 'sin recinto'}</span>
                    <ArrowRight className="inline w-3.5 h-3.5 mx-1 text-violet-600" />
                    <span className={m.hacia_codigo ? 'font-bold text-violet-800' : 'font-sans italic text-slate-400'}>{m.hacia_codigo || 'sale'}</span>
                    {m.conservar_origen && <span className="ml-1 font-sans text-[10px] px-1.5 rounded-full bg-sky-100 text-sky-800">conserva su recinto</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{origen(m)}</td>
                  <td className="px-4 py-2 text-slate-500">{m.realizado_por?.startsWith('Nómina') ? 'Sistema' : (m.realizado_por || '').split('@')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
