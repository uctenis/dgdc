import type { LicitacionProyecto, Proveedor } from '../types';
import { LicitacionDetalle } from './LicitacionDetalle';

const enDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
};

const licitacionDemo = {
  id: 'demo',
  codigoCP: '409-1722',
  codigoOP: '',
  codigoOT: '',
  codigoProyecto: '2026_005',
  nombreProyecto: 'CAMBIO DE CUBIERTA EDIFICIO CJP08',
  descripcion: 'Cambio de cubierta lado sur del edificio: retiro de cubierta existente, reposición de estructura de techumbre, aislación térmica y nueva cubierta de zinc-alum.',
  montoEstimado: 4641000,
  estado: 'En Evaluacion',
  fechaVisitaTerreno: enDias(3),
  fechaRecepcionConsultas: enDias(6),
  fechaRespuestaConsultas: enDias(8),
  fechaEvaluacion: enDias(14),
  antecedentesTecnicos: [
    { id: 'a1', nombre: 'Bases Administrativas', tipo: 'Bases Administrativas', archivoNombre: 'bases_administrativas.pdf', archivoURL: 'https://example.com/bases.pdf', fechaCarga: enDias(0), cargadoPor: 'Infraestructura' },
    { id: 'a2', nombre: 'Especificaciones Técnicas', tipo: 'Bases Tecnicas', archivoNombre: 'eett.pdf', archivoURL: 'https://example.com/eett.pdf', fechaCarga: enDias(0), cargadoPor: 'Infraestructura' },
    { id: 'a3', nombre: 'Planos de cubierta y techumbre', tipo: 'Planos', archivoNombre: 'planos.pdf', archivoURL: 'https://example.com/planos.pdf', fechaCarga: enDias(0), cargadoPor: 'Infraestructura' },
    { id: 'a4', nombre: 'Presupuesto referencial (interno, no debe verse)', tipo: 'Presupuesto', archivoNombre: 'ppto.xlsx', archivoURL: 'https://example.com/ppto.xlsx', fechaCarga: enDias(0), cargadoPor: 'Infraestructura' },
  ],
  formatoPresupuesto: [
    { item: '1.1', fase: 'Obras Preliminares', descripcion: 'Instalación de faenas y cierres perimetrales', unidad: 'gl', cantidad: 1 },
    { item: '1.2', fase: 'Obras Preliminares', descripcion: 'Retiro de cubierta existente', unidad: 'm2', cantidad: 180 },
    { item: '2.1', fase: 'Obra Gruesa', descripcion: 'Reposición de estructura de techumbre', unidad: 'm2', cantidad: 180 },
    { item: '2.2', fase: 'Obra Gruesa', descripcion: 'Aislación térmica', unidad: 'm2', cantidad: 180 },
    { item: '3.1', fase: 'Terminaciones', descripcion: 'Cubierta zinc-alum e=0,5 mm', unidad: 'm2', cantidad: 190 },
    { item: '3.2', fase: 'Terminaciones', descripcion: 'Hojalatería, canales y bajadas', unidad: 'ml', cantidad: 48 },
  ],
} as unknown as LicitacionProyecto;

const proveedorDemo = {
  id: 'demo',
  rut: '76.123.456-7',
  razonSocial: 'Constructora Los Robles SpA',
  nombreContacto: 'María Soto',
  email: 'contacto@losrobles.cl',
  telefono: '+56 9 8765 4321',
  rubro: 'Obras Civiles',
  cuentaSustentabilidad: false,
  direccion: 'Av. Alemania 0123',
  ciudad: 'Temuco',
  estado: 'Activo',
  fechaRegistro: '2026-01-01',
} as Proveedor;

/** SOLO servidor local (/portal/demo): la pantalla real del proveedor con datos de ejemplo. */
export function PortalDemo() {
  return (
    <div>
      <div className="px-4 py-2 text-xs text-center font-bold" style={{ background: '#78350f', color: '#fde68a' }}>
        Vista de demostración · datos de ejemplo · no se guarda ni se envía nada
      </div>
      <LicitacionDetalle demoLicitacion={licitacionDemo} demoProveedor={proveedorDemo} proveedorIdVista="demo" />
    </div>
  );
}
