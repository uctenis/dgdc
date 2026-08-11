const fs = require('fs');
const path = require('path');

const rawData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/presupuesto2026Data.json'), 'utf8'));

const initialProvs = [
  {
    id: 'prov-1',
    rut: '76.892.410-K',
    razonSocial: 'Constructora e Inversiones Araucanía SpA',
    nombreContacto: 'Carlos Mendoza Morales',
    email: 'contacto@constructoraaraucania.cl',
    telefono: '+56 9 8765 4321',
    rubro: 'Obras Menores y Remodelaciones',
    cuentaSustentabilidad: true,
    direccion: 'Av. Alemania 0845, Temuco',
    ciudad: 'Temuco',
    estado: 'Activo',
    fechaRegistro: '2024-01-15',
  },
  {
    id: 'prov-2',
    rut: '77.104.550-3',
    razonSocial: 'Servicios e Infraestructura del Sur Ltda.',
    nombreContacto: 'María José Fuentes',
    email: 'mfuentes@infrasur.cl',
    telefono: '+56 9 9123 8844',
    rubro: 'Climatización y Electricidad',
    cuentaSustentabilidad: true,
    direccion: 'Calle Manuel Montt 1120, Temuco',
    ciudad: 'Temuco',
    estado: 'Activo',
    fechaRegistro: '2024-02-10',
  },
  {
    id: 'prov-3',
    rut: '76.443.219-8',
    razonSocial: 'Ingeniería y Construcciones Cautín EIRL',
    nombreContacto: 'Roberto Araya Soto',
    email: 'raraya@cautiningenieria.cl',
    telefono: '+56 9 7441 0099',
    rubro: 'Obras Civiles y Tabiquería',
    cuentaSustentabilidad: false,
    direccion: 'Calle Prat 450, Temuco',
    ciudad: 'Temuco',
    estado: 'Activo',
    fechaRegistro: '2024-03-01',
  },
  ...rawData.suppliers
];

const content = `import type { Proveedor, LicitacionProyecto, Cotizacion, ConfiguracionFirmas, ProyectoMaestro } from '../types';

export const INITIAL_CONFIG_FIRMAS: ConfiguracionFirmas = {
  directorGestionCampus: {
    nombre: 'Iván Cisternas Cisternas',
    cargo: 'Director de Gestión y Desarrollo de Campus',
  },
  subdirectorInfraestructura: {
    nombre: 'David Silva Roco',
    cargo: 'Sub-Director de Infraestructura',
  },
  responsableDesarrollo: {
    nombre: 'Ing. Desarrollo Infraestructura',
    cargo: 'Responsable Desarrollo Infraestructura',
  },
  vicerrectorAdministracion: {
    nombre: 'Dr. Marcelo Toneatti Bastidas',
    cargo: 'Vicerrector de Administración y Asuntos Económicos',
  },
  institucion: 'Universidad Católica de Temuco',
  subdireccion: 'Subdirección de Infraestructura - Dirección de Gestión y Desarrollo de Campus',
};

export const INITIAL_PROVEEDORES: Proveedor[] = ${JSON.stringify(initialProvs, null, 2)};

export const INITIAL_PROYECTOS_MAESTROS: ProyectoMaestro[] = ${JSON.stringify(rawData.projects, null, 2)};

export const INITIAL_LICITACIONES: LicitacionProyecto[] = [
  {
    id: 'lic-101',
    codigoCP: '409-5243',
    codigoOP: 'OP-RC-070_26',
    codigoOT: 'OT-9012',
    codigoProyecto: '2026_001',
    nombreProyecto: 'SOPORTES PARA INSTALACION DE TELEVISORES SALAS DE REUNIONES Y LABORATORIOS NUEVO EDIFICIO INGENIERIA',
    descripcion: 'EDIFICIO INGENIERÍA (EX TEC) + HABILITACIÓN — SOPORTES E INSTALACIONES (Resp: A. Meza)',
    montoEstimado: 5537070,
    fechaEvaluacion: '2026-11-15',
    estado: 'En Evaluacion',
  },
  {
    id: 'lic-102',
    codigoCP: '409-1722',
    codigoOP: 'OP-RC-008_26',
    codigoOT: 'OT-9105',
    codigoProyecto: '2026_002',
    nombreProyecto: 'REMODELACION LABORATORIO COMPUTACION CRC16_210',
    descripcion: 'IMPREVISTOS — REMODELACION LABORATORIO COMPUTACION CRC16_210 (Resp: A. Meza)',
    montoEstimado: 10154673,
    fechaEvaluacion: '2026-11-20',
    estado: 'Borrador',
  },
];

export const INITIAL_COTIZACIONES: Cotizacion[] = [
  {
    id: 'cot-1',
    licitacionId: 'lic-101',
    proveedorId: 'prov-1',
    proveedorRut: '76.892.410-K',
    proveedorNombre: 'Constructora e Inversiones Araucanía SpA',
    montoNeto: 4500000,
    montoIva: 855000,
    montoTotal: 5355000,
    plazoDias: 15,
    ajustaRequerimientos: true,
    cuentaExperiencia: true,
    cumplePlazoRequerido: true,
    declaraSustentabilidad: true,
    tipoEvidenciaSustentable: 'Certificado de Gestión de Residuos',
    documentoCotizacionNombre: 'Cotizacion_Araucania_Lab_409-5243.xlsx',
    observaciones: 'Incluye certificado ambiental y garantía de 12 meses.',
    fechaCarga: '2026-02-10',
  },
];
`;

fs.writeFileSync(path.join(__dirname, '../src/data/initialData.ts'), content);
console.log('Updated initialData.ts with 2026 data successfully');
