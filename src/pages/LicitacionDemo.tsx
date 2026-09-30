import { useState } from 'react';
import { LicitacionWorkspacePage, type TabId } from '../components/LicitacionWorkspacePage';
import { INITIAL_CONFIG_FIRMAS } from '../data/initialData';
import type { Cotizacion, LicitacionProyecto, Proveedor } from '../types';

const enDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
};

const itemizado = [
  { id: 'i1', item: '1.1', descripcion: 'Instalación de faenas y cierres perimetrales', unidad: 'gl', cantidad: 1, precioUnitario: 850000, precioTotal: 850000 },
  { id: 'i2', item: '1.2', descripcion: 'Retiro de cubierta existente', unidad: 'm2', cantidad: 180, precioUnitario: 4500, precioTotal: 810000 },
  { id: 'i3', item: '2.1', descripcion: 'Reposición de estructura de techumbre', unidad: 'm2', cantidad: 180, precioUnitario: 9800, precioTotal: 1764000 },
  { id: 'i4', item: '3.1', descripcion: 'Cubierta zinc-alum e=0,5 mm', unidad: 'm2', cantidad: 190, precioUnitario: 12500, precioTotal: 2375000 },
];
const neto = itemizado.reduce((s, i) => s + i.precioTotal, 0);

const proveedor = { id: 'demo-prov', rut: '76.123.456-7', razonSocial: 'Constructora Los Robles SpA', nombreContacto: 'María Soto', email: 'contacto@losrobles.cl', telefono: '+56 9 8765 4321', rubro: 'Obras Civiles', cuentaSustentabilidad: false, estado: 'Activo', fechaRegistro: '2026-01-01' } as Proveedor;

const cotizacion = {
  id: 'demo-cot', licitacionId: 'demo', proveedorId: proveedor.id, proveedorRut: proveedor.rut, proveedorNombre: proveedor.razonSocial,
  montoNeto: neto, montoIva: Math.round(neto * 0.19), montoTotal: Math.round(neto * 1.19), plazoDias: 60, itemizado,
  ajustaRequerimientos: true, cuentaExperiencia: true, cumplePlazoRequerido: true, declaraSustentabilidad: false, fechaCarga: enDias(-30),
} as Cotizacion;

const licitacion = {
  id: 'demo', codigoCP: '409-1722', codigoOP: 'OP-552', codigoOT: '', codigoProyecto: '2026_005',
  nombreProyecto: 'Cambio de cubierta edificio CJP08',
  descripcion: 'Cambio de cubierta lado sur del edificio: retiro de cubierta existente, reposición de estructura de techumbre, aislación térmica y nueva cubierta de zinc-alum.',
  montoEstimado: 6500000, fechaEvaluacion: enDias(-35), estado: 'Adjudicado', estadoLifecycle: 'En_Ejecucion',
  proveedorAdjudicadoId: proveedor.id, proveedorGanadorId: proveedor.id, proveedorAdjudicadoNombre: proveedor.razonSocial,
  cotizacionAdjudicadaId: cotizacion.id, montoAdjudicadoNeto: neto, montoAdjudicadoTotal: cotizacion.montoTotal,
  plazoAdjudicadoDias: 60, fechaInicioObra: enDias(-25), fechaTerminoProgramada: enDias(35),
  proveedoresInvitadosIds: [proveedor.id], responsableEmail: 'dsilva@uct.cl', responsableNombre: 'David Silva Roco',
} as unknown as LicitacionProyecto;

/** SOLO servidor local (/demo/licitacion): una licitación adjudicada de ejemplo para revisar pantallas (p. ej. en celular). */
export function LicitacionDemo() {
  const [tab] = useState<TabId>(() => (new URLSearchParams(window.location.search).get('tab') as TabId) || 'resumen');
  return (
    <div className="min-h-screen bg-slate-100/70 px-3 sm:px-6 py-4">
      <div className="mb-3 px-3 py-2 rounded-lg text-xs text-center font-bold" style={{ background: '#78350f', color: '#fde68a' }}>
        Vista de demostración · datos de ejemplo
      </div>
      <LicitacionWorkspacePage
        licitacion={licitacion}
        proveedores={[proveedor]}
        cotizaciones={[cotizacion]}
        configFirmas={INITIAL_CONFIG_FIRMAS}
        onBack={() => history.back()}
        onAddCotizacion={() => alert('Demostración')}
        onDeleteCotizacion={() => alert('Demostración')}
        onAdjudicarLicitacion={async () => alert('Demostración')}
        initialTab={tab}
      />
    </div>
  );
}
