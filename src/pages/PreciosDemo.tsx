import { PreciosUnitariosPage } from '../components/PreciosUnitariosPage';
import type { Cotizacion, LicitacionProyecto } from '../types';

const lic = (i: number, extra: Partial<LicitacionProyecto> = {}) => ({
  id: `l${i}`, codigoCP: '', codigoOP: '', codigoOT: '', codigoProyecto: `2025_0${i}`, nombreProyecto: `Obra de ejemplo ${i}`,
  descripcion: '', montoEstimado: 0, fechaEvaluacion: '', estado: 'Adjudicado', ...extra,
}) as LicitacionProyecto;

const cot = (i: number, lid: string, fecha: string, proveedor: string, items: [string, string, number][]) => ({
  id: `c${i}`, licitacionId: lid, proveedorId: `p${i}`, proveedorRut: '', proveedorNombre: proveedor, montoNeto: 0, montoIva: 0, montoTotal: 0,
  plazoDias: 30, ajustaRequerimientos: true, cuentaExperiencia: true, cumplePlazoRequerido: true, declaraSustentabilidad: false, fechaCarga: fecha,
  itemizado: items.map(([descripcion, unidad, precioUnitario], j) => ({ id: `i${j}`, item: `${j + 1}`, descripcion, unidad, cantidad: 1, precioUnitario, precioTotal: precioUnitario })),
}) as Cotizacion;

const licitaciones = [
  lic(1, { cotizacionAdjudicadaId: 'c1', superficieM2: 180, montoAdjudicadoTotal: 21_000_000, tipoObra: 'Cubiertas', fechaAdjudicacion: '2025-03-10' }),
  lic(2, { cotizacionAdjudicadaId: 'c3', superficieM2: 95, montoAdjudicadoTotal: 12_500_000, tipoObra: 'Cubiertas', fechaAdjudicacion: '2025-11-20' }),
  lic(3, { superficieM2: 60, montoAdjudicadoTotal: 9_800_000, tipoObra: 'Remodelación', fechaAdjudicacion: '2026-06-01' }),
];
const cotizaciones = [
  cot(1, 'l1', '2025-03-05', 'Constructora Los Robles SpA', [['Cubierta zinc-alum e=0,5 mm', 'm2', 11800], ['Hojalatería canales y bajadas', 'ml', 7200]]),
  cot(2, 'l1', '2025-03-05', 'Ingeniería Sur Ltda.', [['Cubierta de zinc alum 0,5mm', 'm2', 13500]]),
  cot(3, 'l2', '2025-11-15', 'Techos del Sur', [['Cubierta zincalum ondulada', 'm²', 12900], ['Canales y bajadas de hojalatería', 'ml', 7900]]),
  cot(4, 'l3', '2026-05-28', 'Remodela SpA', [['Cerámica de muro 30x60', 'm2', 21000]]),
];

/** SOLO servidor local (/demo/precios): la biblioteca de precios con datos de ejemplo. */
export function PreciosDemo() {
  return (
    <div className="min-h-screen bg-slate-100/70 px-3 sm:px-6 py-4 max-w-5xl mx-auto">
      <div className="mb-3 px-3 py-2 rounded-lg text-xs text-center font-bold" style={{ background: '#78350f', color: '#fde68a' }}>Vista de demostración · datos de ejemplo</div>
      <PreciosUnitariosPage licitaciones={licitaciones} cotizaciones={cotizaciones} />
    </div>
  );
}
