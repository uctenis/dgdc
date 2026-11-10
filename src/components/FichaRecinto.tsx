import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowRightLeft, Database, DoorOpen, ExternalLink, History, Info, Layers, Package, Pencil, Ruler,
  ShieldCheck, Users, X, Zap,
} from 'lucide-react';
import type { Ocupante, Piso, Recinto } from '../types/recintos';
import { alertasRecinto, observacionesSinNotas } from '../utils/alertasRecinto';
import { formatoFecha } from '../utils/fechas';
import { comoTitulo } from '../utils/texto';
import { colorDeCategoria } from '../utils/geometriaPlano';
import { tipoConfigurado } from '../data/espaciosConfig';

const m2 = (n?: number | null) => (n ? `${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 })} m²` : '—');
const COLOR_ESTADO: Record<string, string> = {
  Operativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'En obra': 'bg-amber-50 text-amber-800 border-amber-200',
  'Fuera de servicio': 'bg-rose-50 text-rose-700 border-rose-200',
  Eliminado: 'bg-slate-100 text-slate-500 border-slate-200',
};

type IdSeccion = 'general' | 'ocupantes' | 'inventario' | 'seguridad' | 'instalaciones' | 'catastro';
/**
 * Secciones de la ficha. Las que aún no tienen datos en el sistema muestran qué se registrará ahí: al habilitar el
 * inventario, la seguridad o las instalaciones basta con darles su contenido en `contenido` más abajo.
 */
const SECCIONES: { id: IdSeccion; nombre: string; icono: ComponentType<{ className?: string }>; pronto?: { titulo: string; detalle: string[] } }[] = [
  { id: 'general', nombre: 'General', icono: Info },
  { id: 'ocupantes', nombre: 'Ocupantes', icono: Users },
  {
    id: 'inventario', nombre: 'Inventario', icono: Package,
    pronto: { titulo: 'Inventario del recinto', detalle: ['Mobiliario y equipamiento, con cantidad y estado', 'Número de inventario y fecha de alta', 'Fotos y responsable de cada bien'] },
  },
  {
    id: 'seguridad', nombre: 'Seguridad', icono: ShieldCheck,
    pronto: { titulo: 'Elementos de seguridad', detalle: ['Extintores, red húmeda y detectores, con su última revisión', 'Luces de emergencia y señalética', 'Vías de evacuación y zona de seguridad'] },
  },
  {
    id: 'instalaciones', nombre: 'Instalaciones', icono: Zap,
    pronto: { titulo: 'Instalaciones y equipos', detalle: ['Tablero y circuitos eléctricos, enchufes y luminarias', 'Climatización y ventilación', 'Puntos de red y datos'] },
  },
  { id: 'catastro', nombre: 'Catastro', icono: Database },
];

/** Ficha técnica de un recinto: identificación, superficies, ocupantes y las secciones que vendrán (inventario, etc.). */
export function FichaRecinto({ recinto: r, piso, campus, edificio, onClose, onEditar, onHistorial, onVerEnPlano, onMover }: {
  recinto: Recinto; piso?: Piso; campus?: string; edificio?: string;
  onClose: () => void; onEditar: () => void; onHistorial: () => void; onVerEnPlano: () => void; onMover: (o: Ocupante) => void;
}) {
  const [seccion, setSeccion] = useState<IdSeccion>('general');
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose]);

  const color = tipoConfigurado(r.nombre)?.color || colorDeCategoria(r.nombre);
  const revisar = alertasRecinto(r);
  const observaciones = observacionesSinNotas(r.observaciones);
  const atributos = Object.entries(r.atributos || {}).filter(([, v]) => v !== '' && v != null);
  const ocupantes = r.ocupantes || [];
  const codigoCorto = r.codigo.replace(`${r.edificio_codigo}_`, '');
  const cuenta: Partial<Record<IdSeccion, number>> = { ocupantes: ocupantes.length, catastro: atributos.length };

  const indicador = (Icono: ComponentType<{ className?: string }>, etiqueta: string, valor: ReactNode, detalle?: string) => (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Icono className="w-3.5 h-3.5" /> {etiqueta}</p>
      <p className="mt-0.5 text-lg font-black text-slate-900 tabular-nums leading-tight">{valor}</p>
      {detalle && <p className="text-[10px] text-slate-400">{detalle}</p>}
    </div>
  );
  const grupo = (titulo: string, filas: [string, ReactNode][]) => {
    const visibles = filas.filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '');
    if (!visibles.length) return null;
    return (
      <section>
        <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 mb-1.5">{titulo}</h4>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {visibles.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(110px,40%)_1fr] gap-3 px-3 py-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-semibold text-slate-800 min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  };

  const contenido: Record<IdSeccion, () => ReactNode> = {
    general: () => (
      <div className="grid gap-4 md:grid-cols-2">
        {grupo('Identificación', [
          ['Código', <span className="font-mono">{r.codigo}</span>],
          ['Nombre', comoTitulo(r.nombre)],
          ['Uso', r.uso || '—'],
          ['Unidad usuaria', r.unidad_usuaria || '—'],
          ['Estado', <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${COLOR_ESTADO[r.estado] || COLOR_ESTADO.Eliminado}`}>{r.estado}</span>],
        ])}
        {grupo('Ubicación', [
          ['Campus', campus || null],
          ['Edificio', edificio ? <span><span className="font-mono">{r.edificio_codigo}</span> · {edificio}</span> : <span className="font-mono">{r.edificio_codigo}</span>],
          ['Piso', piso?.nombre || piso?.codigo || '—'],
        ])}
        {grupo('Superficies y capacidad', [
          ['Superficie útil', m2(r.superficie_m2)],
          ['Superficie OGUC', m2(r.superficie_oguc_m2)],
          ['Capacidad', r.capacidad != null ? `${r.capacidad} personas` : '—'],
        ])}
        {grupo('Vigencia', [
          ['Tenencia', r.tenencia && r.tenencia !== 'Propia' ? r.tenencia : null],
          ['Opera desde', r.fecha_alta ? `${formatoFecha(r.fecha_alta)}${r.motivo_alta ? ` · ${r.motivo_alta}` : ''}` : null],
          ['De baja desde', r.fecha_baja ? `${formatoFecha(r.fecha_baja)}${r.motivo_baja ? ` · ${r.motivo_baja}` : ''}` : null],
        ])}
        {observaciones.length > 0 && (
          <section className="md:col-span-2">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 mb-1.5">Observaciones</h4>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 space-y-1 text-slate-700">{observaciones.map((l, i) => <p key={i}>{l}</p>)}</div>
          </section>
        )}
      </div>
    ),
    ocupantes: () => ocupantes.length ? (
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {ocupantes.map((o, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-teal-50 text-teal-800 font-bold shrink-0">
              {comoTitulo(o.nombre).split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-slate-800">{comoTitulo(o.nombre)}</span>
              {(o.cargo || o.unidad) && <span className="block text-slate-500">{[o.cargo, o.unidad].filter(Boolean).join(' · ')}</span>}
            </span>
            <button type="button" onClick={() => onMover(o)} title="Cambiar a esta persona a otro recinto (o agregarla a otro sin quitarla de este)"
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50">
              <ArrowRightLeft className="w-3.5 h-3.5" /> Cambiar de recinto
            </button>
          </li>
        ))}
      </ul>
    ) : <Vacio icono={Users} titulo="Sin ocupantes registrados" detalle={['Agréguelos con «Editar».']} />,
    inventario: () => null,
    seguridad: () => null,
    instalaciones: () => null,
    catastro: () => atributos.length ? (
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {atributos.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(140px,40%)_1fr] gap-3 px-3 py-2">
            <dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-800 break-words">{String(v)}</dd>
          </div>
        ))}
      </dl>
    ) : <Vacio icono={Database} titulo="Sin datos adicionales del catastro" detalle={[]} />,
  };
  const actual = SECCIONES.find(s => s.id === seccion)!;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-slate-50 rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 text-xs" onClick={e => e.stopPropagation()}>
        {/* Encabezado */}
        <header className="relative bg-white border-b border-slate-200 px-4 sm:px-6 pt-4 pb-3">
          <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} aria-hidden />
          <div className="flex items-start gap-3 sm:gap-4">
            {r.foto_url
              ? <a href={r.foto_url} target="_blank" rel="noreferrer" title="Ver foto"><img src={r.foto_url} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-slate-200" /></a>
              : <span className="grid place-items-center w-16 h-16 sm:w-20 sm:h-20 rounded-xl shrink-0" style={{ background: `${color}26` }}><DoorOpen className="w-7 h-7 text-slate-500" /></span>}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-slate-500 truncate">
                {[campus, edificio ? `${r.edificio_codigo} · ${edificio}` : r.edificio_codigo, piso?.nombre].filter(Boolean).join('  ›  ')}
              </p>
              <h2 className="flex flex-wrap items-baseline gap-x-2 leading-tight">
                <span className="font-mono text-xl sm:text-2xl font-black text-slate-900">{codigoCorto}</span>
                <span className="text-base sm:text-lg font-bold text-slate-800">{comoTitulo(r.nombre)}</span>
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${COLOR_ESTADO[r.estado] || COLOR_ESTADO.Eliminado}`}>{r.estado}</span>
                {r.uso && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">{r.uso}</span>}
                {r.unidad_usuaria && <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[10px] font-bold truncate max-w-[260px]">{r.unidad_usuaria}</span>}
                {r.tenencia && r.tenencia !== 'Propia' && <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 text-[10px] font-bold">{r.tenencia}</span>}
              </div>
            </div>
            <button type="button" onClick={onClose} title="Cerrar (Esc)" className="p-2 -mr-2 -mt-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={onEditar} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 font-bold text-white"><Pencil className="w-3.5 h-3.5" /> Editar</button>
            <button type="button" onClick={onVerEnPlano} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50"><Layers className="w-3.5 h-3.5" /> Ver en el plano</button>
            <button type="button" onClick={onHistorial} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50"><History className="w-3.5 h-3.5" /> Historial</button>
            {r.foto_url && <a href={r.foto_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50"><ExternalLink className="w-3.5 h-3.5" /> Foto</a>}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Indicadores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 sm:px-6 pt-4">
            {indicador(Ruler, 'Superficie útil', m2(r.superficie_m2))}
            {indicador(Ruler, 'Superficie OGUC', m2(r.superficie_oguc_m2))}
            {indicador(Users, 'Capacidad', r.capacidad != null ? r.capacidad : '—', r.capacidad != null ? 'personas' : undefined)}
            {indicador(Users, 'Ocupantes', ocupantes.length)}
          </div>

          {revisar.length > 0 && (
            <div className="mx-4 sm:mx-6 mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Por revisar</p>
                {revisar.map((l, i) => <p key={i}>• {l.charAt(0).toUpperCase() + l.slice(1)}</p>)}
              </div>
            </div>
          )}

          {/* Secciones */}
          <nav className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur px-4 sm:px-6 pt-4 pb-2 flex gap-1 overflow-x-auto border-b border-slate-200">
            {SECCIONES.map(s => {
              const Icono = s.icono;
              const n = cuenta[s.id];
              return (
                <button key={s.id} type="button" onClick={() => setSeccion(s.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${seccion === s.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'}`}>
                  <Icono className="w-3.5 h-3.5" /> {s.nombre}
                  {n ? <span className={`px-1.5 rounded-full text-[10px] ${seccion === s.id ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>{n}</span> : null}
                  {s.pronto && <span className={`w-1.5 h-1.5 rounded-full ${seccion === s.id ? 'bg-amber-300' : 'bg-amber-400'}`} title="Próximamente" />}
                </button>
              );
            })}
          </nav>
          <div className="px-4 sm:px-6 py-4">
            {actual.pronto ? <Vacio icono={actual.icono} titulo={actual.pronto.titulo} detalle={actual.pronto.detalle} pronto /> : contenido[actual.id]()}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2.5 border-t border-slate-200 bg-white text-[11px] text-slate-400">
          <span>Origen: {r.origen}</span>
          {r.modificado_en && <span>· Actualizado el {formatoFecha(r.modificado_en, { dateStyle: 'medium' })}{r.modificado_por ? ` por ${r.modificado_por}` : ''}</span>}
          <button type="button" onClick={onClose} className="ml-auto px-3 py-1.5 rounded-lg font-bold text-slate-600 hover:bg-slate-100">Cerrar</button>
        </footer>
      </div>
    </div>
  );
}

function Vacio({ icono: Icono, titulo, detalle, pronto = false }: { icono: ComponentType<{ className?: string }>; titulo: string; detalle: string[]; pronto?: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
      <span className="mx-auto grid place-items-center w-12 h-12 rounded-2xl bg-slate-100 text-slate-500"><Icono className="w-6 h-6" /></span>
      <p className="mt-3 font-bold text-slate-800 text-sm">{titulo}</p>
      {pronto && <p className="mt-0.5 text-[11px] font-semibold text-amber-700">Próximamente en el sistema</p>}
      {detalle.length > 0 && (
        <ul className="mt-3 inline-block text-left text-slate-500 space-y-1">
          {detalle.map(d => <li key={d} className="flex gap-2"><span className="mt-1.5 w-1 h-1 rounded-full bg-slate-400 shrink-0" />{d}</li>)}
        </ul>
      )}
    </div>
  );
}
