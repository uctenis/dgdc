import type { LicitacionProyecto, Cotizacion } from '../types';
import { INITIAL_CONFIG_FIRMAS } from '../data/initialData';
import { BandejaOPPage } from '../components/BandejaOPPage';

// SOLO servidor local (ruta /demo/bandeja-op): datos de ejemplo para revisar la bandeja de
// Solicitudes de OP sin sesión real de Firebase. No guarda nada que importe.

const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();

const base = {
  codigoCP: '409-1722', codigoOT: '', descripcion: '', fechaEvaluacion: '', responsableNombre: 'J. Solís de Ovando',
  responsableEmail: 'jsolis@uct.cl',
} as const;

const firmada = (dias: number): LicitacionProyecto['actaFirmaDigital'] => ({
  version: 1, estado: 'Firmada', fechaActualizacion: hace(dias), sha256: 'demo',
  firmas: [{ uid: 'x', email: 'icisternas@uct.cl', nombre: 'Iván Cisternas', cargo: 'Director', rolFirma: 'director', fecha: hace(dias), version: 1, sha256: 'demo' }],
});

const LICITACIONES: LicitacionProyecto[] = [
  { ...base, id: 'demo1', codigoProyecto: '2026_007', codigoOP: '', nombreProyecto: 'MANTA TERMICA PISCINA CURACAUTIN', montoEstimado: 9000000, estado: 'Adjudicado',
    proveedorAdjudicadoNombre: 'Constructora Araucanía SpA', montoAdjudicadoTotal: 8450000, actaFirmaDigital: firmada(2),
    antecedentesTecnicos: [{ id: 'a1', nombre: 'Bases técnicas', tipo: 'Bases Tecnicas', archivoURL: 'https://example.com/bases.pdf', archivoNombre: 'bases.pdf', fechaCarga: hace(30) }] },
  { ...base, id: 'demo2', codigoProyecto: '2026_004', codigoOP: '', nombreProyecto: 'REPARACION CUBIERTA CSF10', montoEstimado: 15000000, estado: 'Adjudicado',
    proveedorAdjudicadoNombre: 'Techos del Sur Ltda.', montoAdjudicadoTotal: 14200000, actaFirmaDigital: firmada(8) },
  { ...base, id: 'demo3', codigoProyecto: '2026_002', codigoOP: 'OP-2026-0153', nombreProyecto: 'PINTURA FACHADA CRC16', montoEstimado: 6000000, estado: 'Adjudicado',
    proveedorAdjudicadoNombre: 'Pinturas Temuco', montoAdjudicadoTotal: 5600000, actaFirmaDigital: firmada(15), opRegistro: { fecha: hace(12), registradoPor: 'mbustos@uct.cl' } },
  { ...base, id: 'demo4', codigoProyecto: '2026_009', codigoOP: '', nombreProyecto: 'CAMBIO LUMINARIAS LED CJP08', montoEstimado: 4000000, estado: 'Adjudicado',
    proveedorAdjudicadoNombre: 'Eléctrica Cautín', actaFirmaDigital: { ...firmada(1)!, estado: 'En firma' } },
  { ...base, id: 'demo5', codigoProyecto: '2026_001', codigoOP: 'OP-2026-0120', nombreProyecto: 'HABILITACION SALA CSF01', montoEstimado: 7000000, estado: 'Adjudicado',
    proveedorAdjudicadoNombre: 'Obras Menores Sur', actaFirmaDigital: firmada(40), ordenCompraNumero: '4500128901', fechaCargaOC: hace(20).slice(0, 10) },
];

const COTIZACIONES: Cotizacion[] = [];

export function BandejaOPDemo() {
  return (
    <main className="min-h-screen bg-slate-100/70 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BandejaOPPage licitaciones={LICITACIONES} cotizaciones={COTIZACIONES} proveedores={[]} configFirmas={INITIAL_CONFIG_FIRMAS} simularSecretaria={new URLSearchParams(window.location.search).has('secretaria')} />
    </main>
  );
}
