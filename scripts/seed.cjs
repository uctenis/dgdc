const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const wb = XLSX.readFile(path.join(__dirname, '../SGC PS-FOR-DGDC 0005 PRESUPUESTO INFRAESTRUCTURA 2026.xlsx'));
const sheet = wb.Sheets['Base datos 2026'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

function calcularDV(rutBody) {
  const clean = String(rutBody).replace(/[^0-9]/g, '');
  if (!clean) return '';
  let sum = 0;
  let mul = 2;
  for (let i = clean.length - 1; i >= 0; i--) {
    sum += parseInt(clean.charAt(i), 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  if (res === 11) return '0';
  if (res === 10) return 'K';
  return String(res);
}

function formatearRUT(rawInput) {
  if (!rawInput) return '';
  const clean = String(rawInput).replace(/[^0-9]/g, '');
  if (!clean) return '';
  const dv = calcularDV(clean);
  const bodyFormatted = new Intl.NumberFormat('es-CL').format(Number(clean));
  return dv ? bodyFormatted + '-' + dv : bodyFormatted;
}

const campusDefs = [
  { sigla: 'CML', nombre: 'Campus Monseñor Alejandro Menchaca Lira' },
  { sigla: 'CDS', nombre: 'Campus Dieciocho de Septiembre' },
  { sigla: 'CPH', nombre: 'Campus Phillippi' },
  { sigla: 'CSC', nombre: 'Campus Monseñor Sergio Contreras Navia' },
  { sigla: 'CTH', nombre: 'Campus Thiers' },
  { sigla: 'CBQ', nombre: 'Campus El Bosque' },
  { sigla: 'CSF', nombre: 'Campus San Francisco' },
  { sigla: 'CHS', nombre: 'Campus Prieto Norte' },
  { sigla: 'CEC', nombre: 'Campus Educación Continua' },
  { sigla: 'CJP', nombre: 'Campus San Juan Pablo II' },
  { sigla: 'CRC', nombre: 'Campus Doctor Luis Rivas Del Canto' },
  { sigla: 'CPL', nombre: 'Campus Pillanlelbun' },
  { sigla: 'CCC', nombre: 'Campus Curacautín' },
  { sigla: 'CSD', nombre: 'Campus Santiago Departamento' },
  { sigla: 'CLE', nombre: 'CLE Nuestra Señora de Lourdes' }
];

function findLocation(text) {
  if (!text) return {};
  const upper = text.toUpperCase();

  let edificioSigla = undefined;
  const edMatch = upper.match(/\b([A-Z]{3}\d{1,3})\b/);
  if (edMatch) edificioSigla = edMatch[1];

  let campusFound = undefined;
  for (const c of campusDefs) {
    if (upper.includes(c.sigla) || upper.includes(c.nombre.toUpperCase())) {
      campusFound = c;
      break;
    }
  }
  if (!campusFound && edificioSigla) {
    const prefix = edificioSigla.substring(0, 3);
    campusFound = campusDefs.find(c => c.sigla === prefix);
  }

  const campusSigla = campusFound ? campusFound.sigla : 'CSF';
  const campusNombre = campusFound ? campusFound.nombre : 'Campus San Francisco';
  const finalEdificio = edificioSigla || `${campusSigla}01`;

  return {
    campusSigla,
    campusNombre,
    edificioSigla: finalEdificio,
  };
}

const responsablesDefs = [
  { codigo: 'D.Silva', nombre: 'David Silva Roco', email: 'dsilva@uct.cl' },
  { codigo: 'M.Zurita', nombre: 'M. Zurita', email: 'mzurita@uct.cl' },
  { codigo: 'F.Anselme', nombre: 'Felipe Anselme', email: 'fanselme@uct.cl' },
  { codigo: 'C.Correa', nombre: 'Cristóbal Correa', email: 'ccorrea@uct.cl' },
  { codigo: 'M.Matus', nombre: 'M. Matus', email: 'mmatus@uct.cl' },
  { codigo: 'J.Solis de Ovando', nombre: 'J. Solís de Ovando', email: 'jsolis@uct.cl' },
  { codigo: 'L. Rios', nombre: 'L. Ríos', email: 'lrios@uct.cl' },
  { codigo: 'C. Huenchual', nombre: 'C. Huenchual', email: 'chuenchual@uct.cl' },
  { codigo: 'O. Painen', nombre: 'O. Painén', email: 'opainen@uct.cl' },
  { codigo: 'I. Cisternas', nombre: 'Iván Cisternas Cisternas', email: 'icisternas@uct.cl' },
  { codigo: 'A. Meza', nombre: 'Arturo Meza', email: 'ameza@uct.cl' },
  { codigo: 'I. Riquelme', nombre: 'I. Riquelme', email: 'iriquelme@uct.cl' },
];

function findResponsable(respStr) {
  if (!respStr) return {};
  const clean = respStr.trim().toLowerCase();
  const match = responsablesDefs.find(r => r.codigo.toLowerCase() === clean || r.nombre.toLowerCase().includes(clean));
  if (match) return { responsableNombre: match.nombre, responsableEmail: match.email };
  return { responsableNombre: respStr, responsableEmail: '' };
}

const projects = [];
const suppliersMap = new Map();

data.slice(3).forEach((row, idx) => {
  if (!row || row.length < 5) return;
  const cpRaw = String(row[0] || '').trim();
  const projGroup = String(row[1] || '').trim();
  const usoRaw = String(row[7] || '').trim();
  const nombreDetalle = String(row[8] || row[1] || '').trim();
  const monto = Number(row[9] || row[11] || 0);
  const provName = String(row[13] || '').trim();
  const resp = String(row[14] || '').trim();
  const rc = String(row[15] || '').trim();

  if (cpRaw && nombreDetalle && monto > 0) {
    const cpMatch = cpRaw.match(/409-\d+/);
    const codigoCP = cpMatch ? cpMatch[0] : (cpRaw.split(' ')[0] || '409-2026');
    const loc = findLocation(projGroup + ' ' + nombreDetalle + ' ' + String(row[5] || ''));
    const respData = findResponsable(resp);

    projects.push({
      id: 'proj-2026-' + (idx + 1),
      correlativo: idx + 1,
      codigoCP: codigoCP,
      codigoOP: rc ? 'OP-' + rc : 'OP-2026-' + (idx+1),
      codigoOT: 'OT-2026-' + (idx+1),
      codigoProyecto: '2026_' + String(idx+1).padStart(3, '0'),
      nombre: nombreDetalle,
      descripcion: (projGroup ? projGroup + ' — ' : '') + nombreDetalle + (resp ? ' (Resp: ' + resp + ')' : ''),
      valorAprox: monto,
      estado: provName ? 'En Proceso' : 'Pendiente',
      fechaCreacion: '2026-01-15',
      campusSigla: loc.campusSigla,
      campusNombre: loc.campusNombre,
      edificioSigla: loc.edificioSigla,
      uso: usoRaw || undefined,
      tipoObra: projGroup || undefined,
      responsableNombre: respData.responsableNombre,
      responsableEmail: respData.responsableEmail
    });

    if (provName && provName !== 'undefined' && provName.length > 2) {
      if (!suppliersMap.has(provName)) {
        suppliersMap.set(provName, {
          id: 'prov-2026-' + (suppliersMap.size + 10),
          rut: formatearRUT(String(76100000 + suppliersMap.size * 123456)),
          razonSocial: provName,
          nombreContacto: 'Contacto ' + provName,
          email: 'contacto@' + provName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.cl',
          telefono: '+56 9 ' + String(80000000 + suppliersMap.size * 1234).substring(0, 8),
          rubro: 'Obras Civiles y Estructuras',
          cuentaSustentabilidad: true,
          direccion: 'Av. Alemania 0' + (100 + suppliersMap.size),
          ciudad: 'Temuco',
          estado: 'Activo',
          fechaRegistro: '2026-01-01'
        });
      }
    }
  }
});

const userSuppliers = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/userSuppliers.json'), 'utf8'));

// Merge Excel budget suppliers and TSV user suppliers, avoiding RUT duplicates
const allSuppliersMap = new Map();

userSuppliers.forEach(s => {
  if (s.rut) allSuppliersMap.set(s.rut, s);
});

Array.from(suppliersMap.values()).forEach(s => {
  if (s.rut && !allSuppliersMap.has(s.rut)) {
    allSuppliersMap.set(s.rut, s);
  }
});

const initialProvs = Array.from(allSuppliersMap.values());

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

export const INITIAL_PROYECTOS_MAESTROS: ProyectoMaestro[] = ${JSON.stringify(projects, null, 2)};

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
