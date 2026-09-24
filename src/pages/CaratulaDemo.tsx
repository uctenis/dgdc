import type { LicitacionProyecto } from '../types';
import { FichaProyectoPage } from '../components/FichaProyectoPage';

// SOLO servidor local (ruta /demo/caratula): licitación adjudicada de ejemplo para revisar la
// carátula del proyecto sin sesión de Firebase (los estados de pago no cargan sin sesión).

const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();

const licitacion = {
  id: 'demo-lic', codigoCP: '409-1722', codigoOP: 'OP-2026-0153', codigoOT: 'OT-2026-044', codigoProyecto: '2026_007',
  nombreProyecto: 'MANTA TERMICA PISCINA CURACAUTIN',
  descripcion: 'Adquisición e instalación de una manta térmica para la piscina del Campus Curacautín, para reducir la pérdida de calor y la evaporación del agua cuando el recinto no está en uso.',
  montoEstimado: 9000000, fechaEvaluacion: '', fechaCreacion: hace(40), estado: 'Adjudicado',
  proveedorAdjudicadoNombre: 'Constructora Araucanía SpA', proveedorAdjudicadoRut: '76.123.456-7',
  montoAdjudicadoTotal: 8450000, plazoAdjudicadoDias: 45, fechaInicioObra: hace(10).slice(0, 10),
  campusSigla: 'CCC', edificioSigla: '', uso: 'Deportivo', tipoObra: 'REMODELACION', rubro: 'Obras Exteriores, Pavimentos y Paisajismo',
  responsableNombre: 'J. Solís de Ovando', responsableEmail: 'jsolis@uct.cl',
  actaFirmaDigital: { version: 1, estado: 'Firmada', fechaActualizacion: hace(20), sha256: 'x', firmas: [{ uid: 'x', email: 'icisternas@uct.cl', nombre: 'Iván Cisternas', cargo: 'Director', rolFirma: 'director', fecha: hace(20), version: 1, sha256: 'x' }] },
  opRegistro: { fecha: hace(15) }, ordenPedidoNumero: 'OP-2026-0153',
} as unknown as LicitacionProyecto;

export function CaratulaDemo() {
  return <FichaProyectoPage proyecto={licitacion} onBack={() => {}} />;
}
