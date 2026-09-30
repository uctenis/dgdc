import { IndicadoresGestion } from '../components/IndicadoresGestion';
import type { LicitacionProyecto, ProyectoMaestro } from '../types';

const enDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

const base = (i: number, extra: Partial<LicitacionProyecto>) => ({
  id: `l${i}`, codigoCP: `409-${i}`, codigoOP: '', codigoOT: '', codigoProyecto: `2026_00${i}`, nombreProyecto: `Obra de ejemplo ${i}`,
  descripcion: '', montoEstimado: 10_000_000, fechaEvaluacion: enDias(-60), estado: 'Adjudicado', proyectoMaestroId: `p${i}`, ...extra,
}) as LicitacionProyecto;

const licitaciones = [
  base(1, { proveedorAdjudicadoId: 'a', proveedorAdjudicadoNombre: 'Constructora Los Robles SpA', montoAdjudicadoTotal: 9_200_000, fechaCreacion: enDias(-90), fechaAdjudicacion: enDias(-62), fechaTerminoProgramada: enDias(-5) }),
  base(2, { proveedorAdjudicadoId: 'a', proveedorAdjudicadoNombre: 'Constructora Los Robles SpA', montoAdjudicadoTotal: 14_500_000, montoEstimado: 15_000_000, fechaCreacion: enDias(-70), fechaAdjudicacion: enDias(-40), fechaTerminoProgramada: enDias(20) }),
  base(3, { proveedorAdjudicadoId: 'b', proveedorAdjudicadoNombre: 'Ingeniería Sur Ltda.', montoAdjudicadoTotal: 6_100_000, montoEstimado: 6_000_000, fechaCreacion: enDias(-120), fechaAdjudicacion: enDias(-95), recepcionConforme: { solicitada: true, aprobada: true }, actaRecepcionFirmaInterna: { estado: 'Firmada' } as LicitacionProyecto['actaRecepcionFirmaInterna'] }),
  base(4, { proveedorAdjudicadoId: 'c', proveedorAdjudicadoNombre: 'Climatización Araucanía', montoAdjudicadoTotal: 3_800_000, montoEstimado: 4_200_000, recepcionConforme: { solicitada: true, aprobada: true } }),
  base(5, { estado: 'En Evaluacion' }),
];

const proyectos = [1, 2, 3, 4, 5].map(i => ({
  id: `p${i}`, codigoProyecto: `2026_00${i}`, nombre: `Obra ${i}`,
  ...(i <= 3 ? { bases: { version: 1, estado: i === 1 ? 'Aprobada' : 'Borrador', secciones: [], fechaActualizacion: enDias(-80) } } : {}),
})) as unknown as ProyectoMaestro[];

/** SOLO servidor local (/demo/indicadores): el panel de indicadores con datos de ejemplo. */
export function IndicadoresDemo() {
  return (
    <div className="min-h-screen bg-slate-100/70 px-3 sm:px-6 py-4 max-w-7xl mx-auto">
      <div className="mb-3 px-3 py-2 rounded-lg text-xs text-center font-bold" style={{ background: '#78350f', color: '#fde68a' }}>Vista de demostración · datos de ejemplo</div>
      <IndicadoresGestion licitaciones={licitaciones} proyectos={proyectos} />
    </div>
  );
}
