import { useState } from 'react';
import { Ruler, Pencil, Check, X, AlertTriangle } from 'lucide-react';
import type { Piso, Recinto } from '../types/recintos';
import { cubicarEdificio, ALTURA_PISO_DEFECTO } from '../utils/cubicacion';

const n = (v: number, d = 1) => v.toLocaleString('es-CL', { maximumFractionDigits: d, minimumFractionDigits: d });

/**
 * Cubicación base del edificio por piso: pisos y cielos, muros interiores (perímetro de los recintos × altura de piso) y
 * superficies OGUC. La altura viene de las cotas de nivel del CAD o se escribe a mano; sin dato se usa la por defecto.
 */
export function CubicacionEdificio({ pisos, recintos, onGuardarAltura }: {
  pisos: Piso[]; recintos: Recinto[]; onGuardarAltura: (piso: Piso, altura: number | null) => Promise<void>;
}) {
  const { porPiso, total, cubierta, fachadas } = cubicarEdificio(pisos, recintos);
  const [editando, setEditando] = useState<{ id: string; valor: string } | null>(null);
  const guardar = async (p: Piso) => {
    if (!editando) return;
    const v = editando.valor.trim() === '' ? null : Number(editando.valor.replace(',', '.'));
    if (v !== null && !(v > 1.5 && v < 15)) return;
    await onGuardarAltura(p, v);
    setEditando(null);
  };
  if (!pisos.length) return <p className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">El edificio aún no tiene pisos.</p>;
  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="text-slate-500 text-[10px] uppercase tracking-wide border-b border-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">Piso</th>
              <th className="px-3 py-2 text-left">Altura de piso</th>
              <th className="px-3 py-2 text-right">Recintos</th>
              <th className="px-3 py-2 text-right" title="Superficie útil: pavimentos y cielos">Pisos y cielos (m²)</th>
              <th className="px-3 py-2 text-right">OGUC (m²)</th>
              <th className="px-3 py-2 text-right" title="Suma de perímetros de los recintos">Perímetro de muros (m)</th>
              <th className="px-3 py-2 text-right" title="Perímetro × altura, sin descontar puertas ni ventanas">Muros interiores (m²)</th>
              <th className="px-3 py-2 text-right" title="Unión de los contornos del piso, con los muros cerrados">Huella (m²)</th>
              <th className="px-3 py-2 text-right" title="Perímetro de la huella × altura, sin descontar ventanas">Fachada (m²)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {porPiso.map(c => (
              <tr key={c.piso.id}>
                <td className="px-3 py-2 font-semibold text-slate-800">{c.piso.nombre || c.piso.codigo}</td>
                <td className="px-3 py-2">
                  {editando?.id === c.piso.id ? (
                    <span className="flex items-center gap-1">
                      <input autoFocus value={editando.valor} onChange={e => setEditando({ id: c.piso.id, valor: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') void guardar(c.piso); if (e.key === 'Escape') setEditando(null); }}
                        placeholder={String(ALTURA_PISO_DEFECTO)} className="w-16 px-1.5 py-0.5 border border-slate-300 rounded" />
                      <span className="text-slate-500">m</span>
                      <button type="button" onClick={() => void guardar(c.piso)} className="p-0.5 text-emerald-700"><Check className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => setEditando(null)} className="p-0.5 text-slate-400"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setEditando({ id: c.piso.id, valor: c.piso.altura_m ? String(c.piso.altura_m) : '' })}
                      className="group flex items-center gap-1 text-left" title="Corregir la altura de este piso">
                      <strong className="tabular-nums">{n(c.altura, 2)} m</strong>
                      <span className={`text-[10px] ${c.piso.altura_m ? 'text-slate-500' : 'text-amber-700'}`}>{c.alturaOrigen}</span>
                      <Pencil className="w-3 h-3 text-slate-300 group-hover:text-teal-700" />
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.recintos}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(c.util)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{n(c.oguc)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(c.perimetro)}{c.perimetrosEstimados > 0 && <span className="text-amber-700" title={`${c.perimetrosEstimados} recinto(s) sin contorno: perímetro estimado`}> *</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{n(c.muros)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.huella != null ? <span className={c.huellaConfiable ? '' : 'text-amber-700'} title={c.huellaConfiable ? '' : 'Faltan contornos en este piso: la huella sale menor que la real'}>{n(c.huella)}{!c.huellaConfiable && ' *'}</span> : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.fachada != null ? n(c.fachada) : '—'}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-extrabold text-slate-800">
              <td className="px-3 py-2" colSpan={2}>Total edificio</td>
              <td className="px-3 py-2 text-right tabular-nums">{total.recintos}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(total.util)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(total.oguc)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(total.perimetro)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(total.muros)}</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right tabular-nums">{fachadas ? n(fachadas) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {cubierta.planta > 0 && (
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="bg-white border border-slate-200 rounded-2xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-500">Cubierta estimada</p>
            <p className="text-lg font-extrabold text-slate-900 tabular-nums">{n(cubierta.inclinada)} m² <span className="text-xs font-semibold text-slate-500">({n(cubierta.planta)} m² en planta)</span></p>
            <p className="text-[11px] text-slate-500">Desde la {cubierta.origen}, con pendiente típica (+10 %). Base para cambio de cubierta y canaletas.</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-500">Fachadas estimadas</p>
            <p className="text-lg font-extrabold text-slate-900 tabular-nums">{fachadas ? `${n(fachadas)} m²` : '—'}</p>
            <p className="text-[11px] text-slate-500">Perímetro de la huella de cada piso por su altura, sin descontar ventanas. Base para pintura exterior y revestimientos.</p>
          </div>
        </div>
      )}
      <div className="flex items-start gap-2 text-slate-600 text-[11px]">
        <Ruler className="w-4 h-4 shrink-0 text-teal-700" />
        <p>
          Cubicación base para dimensionar obras: pisos y cielos son la superficie útil; los muros, el perímetro de cada recinto por la altura de su
          piso, sin descontar puertas ni ventanas (un muro entre dos recintos cuenta por cada cara). La altura sale de las cotas de nivel del CAD o se
          corrige aquí; sin dato se usa {n(ALTURA_PISO_DEFECTO, 1)} m. No reemplaza la medición en terreno.
          {total.perimetrosEstimados > 0 && <span className="text-amber-700"> <AlertTriangle className="inline w-3 h-3 -mt-0.5" /> * {total.perimetrosEstimados} recinto(s) sin contorno en el plano: su perímetro se estimó como un cuadrado de igual superficie.</span>}
        </p>
      </div>
    </div>
  );
}
