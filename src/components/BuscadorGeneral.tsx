import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, FileText, FolderKanban, Search, X } from 'lucide-react';
import { subscribeToProyectos } from '../services/firestoreService';
import type { LicitacionProyecto, Proveedor, ProyectoMaestro } from '../types';

type Resultado =
  | { tipo: 'licitacion'; id: string; titulo: string; detalle: string; item: LicitacionProyecto }
  | { tipo: 'proyecto'; id: string; titulo: string; detalle: string; item: ProyectoMaestro }
  | { tipo: 'proveedor'; id: string; titulo: string; detalle: string; item: Proveedor };

/** Minúsculas, sin tildes ni puntos/guiones: "2026_005", "OC-4500" y "76.123.456-7" se encuentran escribiendo como sea. */
const normalizar = (t: unknown) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-_\s]/g, '');

const coincide = (terminos: string[], campos: unknown[]) => {
  const texto = campos.map(normalizar).join('|');
  return terminos.every(t => texto.includes(t));
};

const ICONO = { licitacion: FolderKanban, proyecto: FileText, proveedor: Building2 };
const ETIQUETA = { licitacion: 'Licitación', proyecto: 'Cartera', proveedor: 'Proveedor' };
const MAX_POR_TIPO = 6;

/**
 * Buscador general (Ctrl+K / ⌘K, o el botón de la barra): encuentra licitaciones, proyectos de la Cartera y
 * proveedores por nombre, código, CP, OP, OC, RUT o responsable, y abre el elegido.
 */
export function BuscadorGeneral({ abierto, onCerrar, licitaciones, proveedores, onAbrirLicitacion, onAbrirProyecto, onAbrirProveedor }: {
  abierto: boolean;
  onCerrar: () => void;
  licitaciones: LicitacionProyecto[];
  proveedores: Proveedor[];
  onAbrirLicitacion: (l: LicitacionProyecto) => void;
  onAbrirProyecto: (p: ProyectoMaestro) => void;
  onAbrirProveedor: (p: Proveedor) => void;
}) {
  const [texto, setTexto] = useState('');
  const [seleccion, setSeleccion] = useState(0);
  const [proyectos, setProyectos] = useState<ProyectoMaestro[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // La Cartera se lee solo mientras el buscador está abierto.
  useEffect(() => {
    if (!abierto) return;
    setTexto('');
    setSeleccion(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return subscribeToProyectos(setProyectos, () => setProyectos([]));
  }, [abierto]);

  const resultados = useMemo<Resultado[]>(() => {
    const terminos = texto.trim().split(/\s+/).map(normalizar).filter(Boolean);
    if (!terminos.length) return [];
    const lics: Resultado[] = licitaciones
      .filter(l => coincide(terminos, [l.nombreProyecto, l.codigoProyecto, l.codigoCP, l.codigoOP, l.codigoOT, l.ordenCompraNumero, l.proveedorAdjudicadoNombre, l.responsableNombre]))
      .slice(0, MAX_POR_TIPO)
      .map(l => ({
        tipo: 'licitacion', id: l.id, item: l, titulo: l.nombreProyecto,
        detalle: [l.codigoProyecto, l.codigoCP && `CP ${l.codigoCP}`, l.ordenCompraNumero && `OC ${l.ordenCompraNumero}`, l.estado, l.proveedorAdjudicadoNombre].filter(Boolean).join(' · '),
      }));
    const proys: Resultado[] = proyectos
      .filter(p => coincide(terminos, [p.nombre, p.codigoProyecto, p.codigoCP, p.ordenCompraNumero, p.codigoOC, p.responsableNombre, p.campusSigla, p.edificioSigla]))
      .slice(0, MAX_POR_TIPO)
      .map(p => ({
        tipo: 'proyecto', id: p.id, item: p, titulo: p.nombre,
        detalle: [p.codigoProyecto, p.codigoCP && `CP ${p.codigoCP}`, (p.ordenCompraNumero || p.codigoOC) && `OC ${p.ordenCompraNumero || p.codigoOC}`, p.estado, p.responsableNombre].filter(Boolean).join(' · '),
      }));
    const provs: Resultado[] = proveedores
      .filter(p => coincide(terminos, [p.razonSocial, p.rut, p.nombreContacto, p.email, p.rubro, p.ciudad]))
      .slice(0, MAX_POR_TIPO)
      .map(p => ({ tipo: 'proveedor', id: p.id, item: p, titulo: p.razonSocial, detalle: [p.rut, p.rubro, p.ciudad].filter(Boolean).join(' · ') }));
    return [...lics, ...proys, ...provs];
  }, [texto, licitaciones, proyectos, proveedores]);

  useEffect(() => { setSeleccion(0); }, [texto]);

  if (!abierto) return null;

  const abrir = (r: Resultado) => {
    onCerrar();
    if (r.tipo === 'licitacion') onAbrirLicitacion(r.item);
    else if (r.tipo === 'proyecto') onAbrirProyecto(r.item);
    else onAbrirProveedor(r.item);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onCerrar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSeleccion(i => Math.min(resultados.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSeleccion(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && resultados[seleccion]) { e.preventDefault(); abrir(resultados[seleccion]); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-start justify-center p-2 sm:p-4 sm:pt-[12vh]" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()} onKeyDown={teclas}>
        <div className="flex items-center gap-2 px-4 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Buscar proyecto, licitación, proveedor, CP, OC, RUT…"
            className="flex-1 py-3.5 text-sm outline-none bg-transparent"
            aria-label="Buscar en todo el sistema"
          />
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-700" title="Cerrar (Esc)"><X className="w-4 h-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!texto.trim() ? (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">Escriba un nombre, código de proyecto, CP, OP, OC o RUT. Use ↑ ↓ y Enter para abrir.</p>
          ) : resultados.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">Sin resultados para «{texto}».</p>
          ) : (
            <ul role="listbox" className="py-1">
              {resultados.map((r, i) => {
                const Icono = ICONO[r.tipo];
                return (
                  <li key={`${r.tipo}-${r.id}`} role="option" aria-selected={i === seleccion}>
                    <button
                      type="button"
                      onMouseEnter={() => setSeleccion(i)}
                      onClick={() => abrir(r)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-2.5 ${i === seleccion ? 'bg-sky-50' : ''}`}
                    >
                      <Icono className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-slate-800 leading-snug">{r.titulo}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{r.detalle}</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0 mt-0.5">{ETIQUETA[r.tipo]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
