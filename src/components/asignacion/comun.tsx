// Piezas compartidas del módulo de Asignación de Espacios: contexto de datos, buscador de recintos y tarjetas.
import { createContext, lazy, Suspense, useContext, useMemo, useState } from 'react';
import { ExternalLink, Map as IconoPlano, Search, Users } from 'lucide-react';

const PlanoUbicacion = lazy(() => import('./PlanoUbicacion').then(m => ({ default: m.PlanoUbicacion })));
import type { Ocupante } from '../../types/recintos';
import type { RecintoAsignable } from '../../utils/asignacion';
import { avisoOcupacion, m2PorPersona } from '../../utils/asignacion';
import { comoTitulo } from '../../utils/texto';
import { sinTildes } from '../../utils/sugerencias';
import { getCampusList } from '../../data/campusData';

export interface DatosAsignacion {
  recintos: RecintoAsignable[];
  porId: Map<string, RecintoAsignable>;
  codigos: Map<string, string>;
  nombresEdificio: Record<string, string>;
  usuario: string;
  recargar: () => Promise<void>;
  avisar: (texto: string, tipo?: 'ok' | 'error') => void;
}
export const ContextoAsignacion = createContext<DatosAsignacion | null>(null);
export const useAsignacion = () => useContext(ContextoAsignacion)!;

export const campoClase = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400';
export const normalizar = (s: string) => sinTildes(s || '').toLowerCase();
export const m2 = (n?: number | null) => (n ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m²` : '—');

/** Campus de un edificio (según la configuración; si no está, las tres primeras letras del código). */
export const campusDeEdificio = (edificio: string) => getCampusList().find(c => c.edificios.includes(edificio))?.sigla || edificio.slice(0, 3);

/** Enlace para abrir el recinto en el Gestor de Espacios (en otra pestaña). */
export const enlaceRecinto = (r: RecintoAsignable) =>
  `${import.meta.env.BASE_URL}espacios?${new URLSearchParams({ campus: campusDeEdificio(r.edificio_codigo), edificio: r.edificio_codigo, recinto: r.id })}`;

export function nombreEdificio(nombres: Record<string, string>, codigo: string) {
  return nombres[codigo] ? `${codigo} · ${comoTitulo(nombres[codigo])}` : codigo;
}

/** Ocupación de un recinto con cierta cantidad de personas: m² por persona y aviso si queda estrecho. */
export function Ocupacion({ r, personas, compacto }: { r: RecintoAsignable; personas: number; compacto?: boolean }) {
  const porPersona = m2PorPersona(r.superficie_m2, personas);
  const aviso = avisoOcupacion(r, personas);
  return (
    <span className={`inline-flex items-center gap-1.5 ${compacto ? 'text-[11px]' : 'text-xs'}`}>
      <Users className="w-3.5 h-3.5 text-slate-400" />
      <b className="text-slate-800">{personas}</b>
      {porPersona !== null && <span className="text-slate-500">· {porPersona.toLocaleString('es-CL')} m²/p</span>}
      {aviso && <span className="px-1.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">{aviso}</span>}
    </span>
  );
}

/** Buscador de recintos por código, tipo, edificio, unidad u ocupante. */
export function BuscadorRecinto({ onElegir, excluir, placeholder = 'Buscar recinto: código, tipo, edificio, unidad o persona…', agregar = 0, sugeridos, edificioPlano }: {
  onElegir: (r: RecintoAsignable) => void; excluir?: Set<string>; placeholder?: string;
  /** Personas que se agregarían: muestra cómo quedaría cada recinto. */
  agregar?: number;
  /** Recintos sugeridos (con su motivo), que se muestran cuando no se ha escrito nada. */
  sugeridos?: { recinto: RecintoAsignable; motivo: string }[];
  /** Edificio con que se abre el plano (si no, el del primer sugerido). */
  edificioPlano?: string | null;
}) {
  const { recintos, nombresEdificio } = useAsignacion();
  const [texto, setTexto] = useState('');
  const [enPlano, setEnPlano] = useState(false);
  const resultados = useMemo(() => {
    const q = normalizar(texto).split(/\s+/).filter(Boolean);
    if (!q.length) return [];
    return recintos.filter(r => !excluir?.has(r.id)).filter(r => {
      const base = normalizar([r.codigo, r.nombre, r.edificio_codigo, nombresEdificio[r.edificio_codigo], r.unidad_usuaria,
        ...(r.ocupantes || []).flatMap(o => [o.nombre, o.unidad])].filter(Boolean).join(' '));
      return q.every(p => base.includes(p));
    }).slice(0, 40);
  }, [texto, recintos, excluir, nombresEdificio]);
  const lista = texto.trim() ? resultados.map(r => ({ recinto: r, motivo: '' })) : (sugeridos || []);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={placeholder} className={`${campoClase} pl-9`} />
      </div>
      <button type="button" onClick={() => setEnPlano(true)}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-violet-300 text-violet-800 font-bold text-sm hover:bg-violet-50 hover:border-violet-400">
        <IconoPlano className="w-4 h-4" /> Elegir en el plano del edificio
      </button>
      {enPlano && (
        <Suspense fallback={null}>
          <PlanoUbicacion edificioInicial={edificioPlano || sugeridos?.[0]?.recinto.edificio_codigo} agregar={agregar}
            onElegir={r => { onElegir(r); setTexto(''); }} onCerrar={() => setEnPlano(false)} />
        </Suspense>
      )}
      {!texto.trim() && !!sugeridos?.length && <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Sugeridos</p>}
      {texto.trim() && !resultados.length && <p className="text-xs text-slate-400 px-1">Sin resultados.</p>}
      <ul className="max-h-80 overflow-y-auto space-y-1 pr-1">
        {lista.map(({ recinto: r, motivo }) => {
          const n = (r.ocupantes || []).length;
          return (
            <li key={r.id}>
              <button type="button" onClick={() => { onElegir(r); setTexto(''); }}
                className="w-full text-left rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-violet-400 hover:bg-violet-50/40 transition">
                <span className="flex items-baseline gap-2">
                  <span className="font-mono font-bold text-violet-800">{r.codigo}</span>
                  <span className="font-bold text-slate-800 truncate">{comoTitulo(r.nombre)}</span>
                  <span className="ml-auto text-[11px] text-slate-500 shrink-0">{m2(r.superficie_m2)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
                  <span className="truncate">{nombreEdificio(nombresEdificio, r.edificio_codigo)}</span>
                  <Ocupacion r={r} personas={n + agregar} compacto />
                  {motivo && <span className="text-violet-700 font-bold">{motivo}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Tarjeta de un recinto elegido, con su ocupación antes y después de agregar personas. */
export function RecintoElegido({ r, agregar = 0, quitar = 0, onCambiar }: { r: RecintoAsignable; agregar?: number; quitar?: number; onCambiar?: () => void }) {
  const { nombresEdificio } = useAsignacion();
  const n = (r.ocupantes || []).length;
  return (
    <div className="rounded-xl border-2 border-violet-300 bg-violet-50/50 px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono font-bold text-violet-800">{r.codigo}</span>
        <span className="font-bold text-slate-800 truncate">{comoTitulo(r.nombre)}</span>
        <a href={enlaceRecinto(r)} target="_blank" rel="noreferrer" title="Abrir en el Gestor de Espacios" className="ml-auto text-violet-700 hover:text-violet-900"><ExternalLink className="w-3.5 h-3.5" /></a>
        {onCambiar && <button type="button" onClick={onCambiar} className="text-[11px] font-bold text-violet-700 hover:underline">Cambiar</button>}
      </div>
      <p className="text-[11px] text-slate-500">{nombreEdificio(nombresEdificio, r.edificio_codigo)} · {m2(r.superficie_m2)}{r.capacidad ? ` · capacidad ${r.capacidad}` : ''}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Hoy</span><Ocupacion r={r} personas={n} />
        {(agregar > 0 || quitar > 0) && <><span className="text-slate-400">→</span><span className="text-slate-500">Después</span><Ocupacion r={r} personas={n + agregar - quitar} /></>}
      </div>
      {n > 0 && <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">Ocupantes: {(r.ocupantes || []).map(o => comoTitulo(o.nombre)).join(', ')}</p>}
    </div>
  );
}

export const textoPersona = (o: Ocupante) => [o.cargo && comoTitulo(o.cargo), o.unidad && comoTitulo(o.unidad)].filter(Boolean).join(' · ');
