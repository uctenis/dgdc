const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const wb = XLSX.readFile(path.join(__dirname, '../SGC PS-FOR-DGDC 0005 PRESUPUESTO INFRAESTRUCTURA 2026.xlsx'));
const sheet = wb.Sheets['Datos'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const campusDefs = [
  { sigla: 'CML', nombre: 'Campus Monseñor Alejandro Menchaca Lira', ciudad: 'Temuco' },
  { sigla: 'CDS', nombre: 'Campus Dieciocho de Septiembre', ciudad: 'Temuco' },
  { sigla: 'CPH', nombre: 'Campus Phillippi', ciudad: 'Temuco' },
  { sigla: 'CSC', nombre: 'Campus Monseñor Sergio Contreras Navia', ciudad: 'Temuco' },
  { sigla: 'CTH', nombre: 'Campus Thiers', ciudad: 'Temuco' },
  { sigla: 'CBQ', nombre: 'Campus El Bosque', ciudad: 'Temuco' },
  { sigla: 'CSF', nombre: 'Campus San Francisco', ciudad: 'Temuco' },
  { sigla: 'CHS', nombre: 'Campus Prieto Norte', ciudad: 'Temuco' },
  { sigla: 'CEC', nombre: 'Campus Educación Continua', ciudad: 'Temuco' },
  { sigla: 'CJP', nombre: 'Campus San Juan Pablo II', ciudad: 'Temuco' },
  { sigla: 'CRC', nombre: 'Campus Doctor Luis Rivas Del Canto', ciudad: 'Temuco' },
  { sigla: 'CPL', nombre: 'Campus Pillanlelbun', ciudad: 'Pillanlelbun' },
  { sigla: 'CCC', nombre: 'Campus Curacautín', ciudad: 'Curacautín' },
  { sigla: 'CSD', nombre: 'Campus Santiago Departamento', ciudad: 'Santiago' },
  { sigla: 'CLE', nombre: 'CLE Nuestra Señora de Lourdes', ciudad: 'Temuco' }
];

const edificiosMap = {};
campusDefs.forEach(c => (edificiosMap[c.sigla] = []));

data.slice(2).forEach(row => {
  if (!row) return;
  const ed = String(row[2] || '').trim();
  if (ed && ed !== 'EDIFICIO' && ed !== 'null') {
    const prefixMatch = ed.match(/^[A-Z]{3}/);
    if (prefixMatch && edificiosMap[prefixMatch[0]]) {
      if (!edificiosMap[prefixMatch[0]].includes(ed)) {
        edificiosMap[prefixMatch[0]].push(ed);
      }
    }
  }
});

const tsContent = `export interface CampusInfo {
  sigla: string;
  nombre: string;
  ciudad: string;
  edificios: string[];
}

export const CAMPUS_UCT: CampusInfo[] = ${JSON.stringify(
  campusDefs.map(c => ({
    ...c,
    edificios: edificiosMap[c.sigla] || [],
  })),
  null,
  2
)};

export const USOS_PROYECTO = [
  'DOCENCIA',
  'INVESTIGACIÓN',
  'ESPACIOS COMUNES',
  'ADMINISTRACIÓN',
  'OTROS',
];

export const ESTADOS_PROYECTO = [
  'PROYECTO',
  'COTIZACIÓN',
  'EN EJECUCIÓN',
  'TERMINADO',
  'POSTERGADO',
  'EN CARPETA',
];

export const TIPOS_OBRA = [
  'OBRA NUEVA',
  'AUMENTO DE OBRA',
  'AMPLIACIÓN',
  'REMODELACIÓN',
  'ÁREAS VERDES',
  'ALHAJAMIENTO',
  'REGULARIZACIÓN',
  'COMPRA ELEMENTOS',
  'DEMOLICIÓN',
  'INSTALACIONES',
  'OTROS',
];

export function obtenerCampusPorSigla(sigla: string): CampusInfo | undefined {
  return CAMPUS_UCT.find(c => c.sigla === sigla.toUpperCase());
}

export function buscarCampusYEdificioPorTexto(texto: string): { campus?: CampusInfo; edificio?: string } {
  if (!texto) return {};
  const upper = texto.toUpperCase();
  for (const campus of CAMPUS_UCT) {
    for (const ed of campus.edificios) {
      if (upper.includes(ed)) {
        return { campus, edificio: ed };
      }
    }
    if (upper.includes(campus.sigla) || upper.includes(campus.nombre.toUpperCase())) {
      return { campus };
    }
  }
  return {};
}
`;

fs.writeFileSync(path.join(__dirname, '../src/data/campusData.ts'), tsContent);
console.log('Successfully created src/data/campusData.ts');
