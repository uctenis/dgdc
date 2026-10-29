import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Wand2, X } from 'lucide-react';
import { aplicarRenombres, type ValorEnUso } from '../services/recintos';
import { avisosNombre, formatoTipo, formatoUnidad } from '../utils/formatoNombres';

type Campo = 'nombre' | 'uso' | 'unidad';
interface Fila extends ValorEnUso { propuesto: string; avisos: string[]; aplicar: boolean }

interface Props {
  campo: Campo;
  enUso: ValorEnUso[];
  /** Tipos de recinto actuales, para avisar cuando una «unidad» es en realidad un tipo de recinto. */
  tipos: string[];
  onAplicado: (mapa: Record<string, string>, cambiados: number) => void;
  onCerrar: () => void;
}

const FILTROS = [
  { id: 'cambios', nombre: 'Con cambios' }, { id: 'avisos', nombre: 'Para revisar' }, { id: 'unen', nombre: 'Se unifican' }, { id: 'todos', nombre: 'Todos' },
] as const;

/**
 * Propuesta de formato para todos los valores de una lista (tipos, usos o unidades): el nombre actual, el propuesto
 * (editable) y los avisos de lo que necesita una persona. Al aplicar, se cambia en todos los recintos de una vez.
 */
export function RevisionFormato({ campo, enUso, tipos, onAplicado, onCerrar }: Props) {
  const formato = campo === 'unidad' ? formatoUnidad : formatoTipo;
  const tiposConocidos = useMemo(() => new Set(tipos.map(t => formatoTipo(t).toLowerCase())), [tipos]);
  const [filas, setFilas] = useState<Fila[]>(() => enUso.map(v => {
    const avisos = avisosNombre(v.valor, campo === 'unidad' ? 'unidad' : 'tipo', campo === 'unidad' ? tiposConocidos : undefined);
    const propuesto = formato(v.valor);
    return { ...v, propuesto, avisos, aplicar: propuesto !== v.valor && !avisos.length };
  }));
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('cambios');
  const [buscar, setBuscar] = useState('');
  const [aplicando, setAplicando] = useState<{ hechos: number; total: number } | null>(null);
  const [error, setError] = useState('');

  // Cuántos valores actuales terminan con el mismo nombre (se unifican).
  const porPropuesto = useMemo(() => {
    const m = new Map<string, number>();
    filas.forEach(f => m.set(f.propuesto.trim(), (m.get(f.propuesto.trim()) || 0) + 1));
    return m;
  }, [filas]);
  const visibles = filas.filter(f => {
    if (buscar.trim() && !`${f.valor} ${f.propuesto}`.toLowerCase().includes(buscar.trim().toLowerCase())) return false;
    if (filtro === 'cambios') return f.propuesto !== f.valor;
    if (filtro === 'avisos') return f.avisos.length > 0;
    if (filtro === 'unen') return (porPropuesto.get(f.propuesto.trim()) || 0) > 1;
    return true;
  });
  const elegidas = filas.filter(f => f.aplicar && f.propuesto.trim() !== f.valor);
  const cambiar = (valor: string, cambio: Partial<Fila>) => setFilas(prev => prev.map(f => (f.valor === valor ? { ...f, ...cambio } : f)));
  const contar = (id: (typeof FILTROS)[number]['id']) => filas.filter(f =>
    id === 'cambios' ? f.propuesto !== f.valor : id === 'avisos' ? f.avisos.length > 0 : id === 'unen' ? (porPropuesto.get(f.propuesto.trim()) || 0) > 1 : true).length;

  const aplicar = async () => {
    const mapa = Object.fromEntries(elegidas.map(f => [f.valor, f.propuesto.trim()]));
    const recintos = elegidas.reduce((s, f) => s + f.recintos, 0);
    const vacios = elegidas.filter(f => !f.propuesto.trim()).length;
    if (!confirm(`¿Aplicar ${elegidas.length} cambio(s) de nombre, que tocan unos ${recintos} recintos?${vacios ? ` ${vacios} valor(es) quedan vacíos y se quitan de los recintos.` : ''} Cada cambio queda en el historial del recinto.`)) return;
    setError(''); setAplicando({ hechos: 0, total: elegidas.length });
    try {
      const n = await aplicarRenombres(campo, mapa, (hechos, total) => setAplicando({ hechos, total }));
      onAplicado(mapa, n);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAplicando(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-teal-50/60 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-extrabold text-slate-800 flex items-center gap-1.5"><Wand2 className="w-4 h-4 text-teal-700" /> Revisar formato</h3>
          <span className="text-slate-600">
            {campo === 'unidad'
              ? 'Unidades en formato título («Dirección de Gestión y Desarrollo de Campus»), con tildes, abreviaturas completas y siglas en mayúscula.'
              : 'Mayúscula solo al inicio («Sala de reuniones»), con tildes y el «de» que falta. Las siglas quedan en mayúscula.'}
          </span>
          <button type="button" onClick={onCerrar} className="ml-auto p-1 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-slate-500">
          Revise la columna «Propuesto» y corríjala donde haga falta (sobre todo lo marcado «Para revisar»). Solo se aplican las filas marcadas. Si dos valores quedan con el mismo nombre, se unifican.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map(f => (
            <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
              className={`px-2.5 py-1 rounded-lg border font-bold ${filtro === f.id ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {f.nombre} ({contar(f.id)})
            </button>
          ))}
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar" className="px-2.5 py-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-400" />
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setFilas(prev => prev.map(f => (visibles.includes(f) ? { ...f, aplicar: f.propuesto !== f.valor } : f)))} className="text-teal-800 font-bold hover:underline">Marcar los visibles</button>
            <button type="button" onClick={() => setFilas(prev => prev.map(f => (visibles.includes(f) ? { ...f, aplicar: false } : f)))} className="text-slate-500 font-bold hover:underline">Desmarcar</button>
          </span>
        </div>
      </div>

      {error && <p className="m-3 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800"><AlertTriangle className="w-4 h-4" /> {error}</p>}

      <div className="overflow-x-auto max-h-[58vh]">
        <table className="w-full min-w-[900px] table-fixed">
          <colgroup><col className="w-12" /><col className="w-[32%]" /><col /><col className="w-20" /><col className="w-[24%]" /></colgroup>
          <thead className="sticky top-0 bg-white text-slate-500 text-[10px] uppercase tracking-wide border-b border-slate-100 z-10">
            <tr><th className="px-3 py-2">Aplicar</th><th className="px-3 py-2 text-left">Actual</th><th className="px-3 py-2 text-left">Propuesto</th><th className="px-3 py-2 text-right">Recintos</th><th className="px-3 py-2 text-left">Avisos</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map(f => {
              const unen = porPropuesto.get(f.propuesto.trim()) || 0;
              return (
                <tr key={f.valor} className={f.aplicar ? 'bg-teal-50/40' : ''}>
                  <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={f.aplicar} disabled={f.propuesto.trim() === f.valor} onChange={e => cambiar(f.valor, { aplicar: e.target.checked })} className="accent-teal-700" /></td>
                  <td className="px-3 py-1.5 truncate text-slate-500" title={f.valor}>{f.valor}</td>
                  <td className="px-3 py-1.5">
                    <input value={f.propuesto} onChange={e => cambiar(f.valor, { propuesto: e.target.value, aplicar: e.target.value.trim() !== f.valor })}
                      placeholder={campo === 'unidad' ? '(vacío: quitar esta unidad)' : ''}
                      className="w-full px-2 py-1 border border-slate-300 rounded-lg font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-teal-400" />
                    {unen > 1 && <span className="block text-[10px] text-teal-800 mt-0.5">Se unifica con {unen - 1} valor(es) más</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f.recintos}</td>
                  <td className="px-3 py-1.5 text-amber-800">{f.avisos.map((a, i) => <span key={i} className="flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{a}</span>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visibles.length && <p className="p-4 text-slate-500 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Nada en este filtro.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50">
        <span className="text-slate-600">{elegidas.length} cambio(s) marcados · {elegidas.reduce((s, f) => s + f.recintos, 0)} recintos</span>
        <button type="button" disabled={!elegidas.length || !!aplicando} onClick={() => void aplicar()}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold disabled:opacity-40">
          {aplicando ? <><Loader2 className="w-4 h-4 animate-spin" /> Aplicando {aplicando.hechos} de {aplicando.total}…</> : <><Wand2 className="w-4 h-4" /> Aplicar {elegidas.length} cambio(s)</>}
        </button>
      </div>
    </div>
  );
}
