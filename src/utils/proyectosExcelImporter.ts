import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import type { ProyectoMaestro } from '../types';
import { getRubrosList } from '../data/rubrosData';

export interface FilaProyectoImportada {
  fila: number; // número de fila en el Excel (para referenciar errores)
  datos: {
    codigoCP: string;
    codigoProyecto: string;
    nombre: string;
    descripcion: string;
    valorAprox: number;
    campusSigla: string;
    edificioSigla: string;
    tipoObra: string;
    uso: string;
    rubro: string;
    responsableNombre: string;
    responsableEmail: string;
    prioridad: ProyectoMaestro['prioridad'];
    modalidadContrato: ProyectoMaestro['modalidadContrato'];
    fechaInicio?: string;
    fechaTermino?: string;
    presupuestoAprobado: boolean;
  };
  errores: string[];
}

const ENCABEZADOS = [
  'Centro de Costo (CP)', 'Código Proyecto', 'Nombre del Proyecto', 'Descripción',
  'Presupuesto Estimado (CLP)', 'Campus (Sigla)', 'Edificio', 'Tipo de Obra', 'Uso', 'Rubro',
  'Responsable', 'Email Responsable', 'Prioridad (Alta/Media/Baja)',
  'Modalidad Contrato (Suma Alzada/Serie de Precios/Administración Directa)',
  'Fecha Inicio (DD-MM-AAAA)', 'Fecha Término (DD-MM-AAAA)', 'Aprobado Ppto. Anual (Sí/No)',
];

export async function generarPlantillaProyectosExcel(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Proyectos');

  ws.columns = ENCABEZADOS.map(() => ({ width: 24 }));

  const header = ws.getRow(1);
  header.values = ENCABEZADOS;
  header.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFF' }, size: 10 };
  header.height = 32;
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  for (let c = 1; c <= ENCABEZADOS.length; c++) {
    header.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1D5C86' } };
  }

  const ejemplo = ws.getRow(2);
  ejemplo.values = [
    '409-1722', '2026_050', 'REMODELACIÓN LABORATORIO CRC17', 'Tabiquería, cielo falso e iluminación LED',
    15000000, 'CRC', 'CRC17', 'REMODELACION', 'DOCENCIA', 'Tabiquería, Cielos y Terminaciones',
    'David Silva Roco', 'dsilva@uct.cl', 'Media', 'Suma Alzada',
    '01-03-2026', '30-06-2026', 'Sí',
  ];
  ejemplo.font = { name: 'Arial', italic: true, color: { argb: '888888' }, size: 10 };

  // Las 3 últimas columnas son opcionales, pero sin ellas el proyecto no aparece en
  // Avance Financiero (necesita fechas) ni queda aprobado para el presupuesto anual.
  const nota = ws.getRow(4);
  nota.getCell(1).value =
    'Las columnas Rubro, Fecha Inicio, Fecha Término y "Aprobado Ppto. Anual" son opcionales, ' +
    'pero se recomienda llenarlas: sin fechas el proyecto no se puede proyectar mes a mes en ' +
    'Avance Financiero, y sin "Aprobado Ppto. Anual = Sí" no compromete el presupuesto anual.';
  ws.mergeCells(4, 1, 4, ENCABEZADOS.length);
  nota.getCell(1).font = { name: 'Arial', italic: true, size: 9, color: { argb: '9A6B00' } };
  nota.getCell(1).alignment = { wrapText: true };
  nota.height = 30;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Plantilla_Carga_Proyectos_Cartera_UCT.xlsx');
}

function aFechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Excel puede entregar la fecha como Date, número serial o texto DD-MM-AAAA / DD/MM/AAAA / AAAA-MM-DD.
 * Siempre devuelve 'AAAA-MM-DD' (sin hora), el mismo formato que usa PremiumDatePicker en toda la app. */
function parsearFecha(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return aFechaISO(v);
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000); // serial Excel -> epoch Unix
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : aFechaISO(d);
  }
  const s = String(v).trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? undefined : aFechaISO(d);
  }
  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? undefined : aFechaISO(d2);
}

/** Normaliza el Rubro escrito libremente al nombre oficial del catálogo (coincidencia insensible a mayúsculas). */
function normalizarRubro(v: unknown): string {
  const texto = String(v ?? '').trim();
  if (!texto) return '';
  const oficial = getRubrosList().find(r => r.nombre.toLowerCase() === texto.toLowerCase());
  return oficial ? oficial.nombre : texto;
}

function normalizarSiNo(v: unknown): boolean {
  const n = String(v ?? '').trim().toLowerCase();
  return n === 'si' || n === 'sí' || n === 'x' || n === 'yes' || n === 'true' || n === '1';
}

function normalizarEncabezado(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function buscarColumna(headerRow: unknown[], ...alias: string[]): number {
  return headerRow.findIndex(h => {
    const n = normalizarEncabezado(h);
    return alias.some(a => n.includes(a));
  });
}

/** Igual que buscarColumna, pero descarta encabezados que contengan alguna de las palabras excluidas. */
function buscarColumnaExcluyendo(headerRow: unknown[], excluir: string[], ...alias: string[]): number {
  return headerRow.findIndex(h => {
    const n = normalizarEncabezado(h);
    if (excluir.some(e => n.includes(e))) return false;
    return alias.some(a => n.includes(a));
  });
}

function normalizarPrioridad(v: unknown): ProyectoMaestro['prioridad'] {
  const n = normalizarEncabezado(v);
  if (n.startsWith('alta')) return 'Alta';
  if (n.startsWith('baja')) return 'Baja';
  return 'Media';
}

function normalizarModalidad(v: unknown): ProyectoMaestro['modalidadContrato'] {
  const n = normalizarEncabezado(v);
  if (n.includes('serie')) return 'Serie de Precios';
  if (n.includes('administraci')) return 'Administración Directa';
  return 'Suma Alzada';
}

export async function parseProyectosExcel(file: File): Promise<{
  filas: FilaProyectoImportada[];
  erroresGenerales: string[];
}> {
  const erroresGenerales: string[] = [];
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rows.length) {
    erroresGenerales.push('El archivo está vacío.');
    return { filas: [], erroresGenerales };
  }

  const headerRow = rows[0];
  const idx = {
    codigoCP: buscarColumna(headerRow, 'centro de costo', 'cp'),
    codigoProyecto: buscarColumna(headerRow, 'código proyecto', 'codigo proyecto', 'cód. proyecto'),
    nombre: buscarColumna(headerRow, 'nombre'),
    descripcion: buscarColumna(headerRow, 'descrip'),
    valorAprox: buscarColumna(headerRow, 'presupuesto', 'valor'),
    campusSigla: buscarColumna(headerRow, 'campus'),
    edificioSigla: buscarColumna(headerRow, 'edificio'),
    tipoObra: buscarColumna(headerRow, 'tipo de obra', 'tipo obra'),
    uso: buscarColumna(headerRow, 'uso'),
    rubro: buscarColumna(headerRow, 'rubro'),
    responsableNombre: buscarColumnaExcluyendo(headerRow, ['email'], 'responsable'),
    responsableEmail: buscarColumna(headerRow, 'email'),
    prioridad: buscarColumna(headerRow, 'prioridad'),
    modalidadContrato: buscarColumna(headerRow, 'modalidad'),
    fechaInicio: buscarColumna(headerRow, 'inicio'),
    fechaTermino: buscarColumna(headerRow, 'término', 'termino', 'fecha fin', 'fecha final'),
    presupuestoAprobado: buscarColumna(headerRow, 'aprobado'),
  };

  if (idx.nombre < 0) {
    erroresGenerales.push('No se encontró la columna "Nombre del Proyecto" en la primera fila. Use la plantilla oficial.');
    return { filas: [], erroresGenerales };
  }

  const filas: FilaProyectoImportada[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => String(v ?? '').trim() === '')) continue; // fila vacía

    const get = (i: number) => (i >= 0 ? String(row[i] ?? '').trim() : '');
    const errores: string[] = [];

    const nombre = get(idx.nombre);
    if (!nombre) errores.push('Falta el nombre del proyecto.');

    const valorRaw = idx.valorAprox >= 0 ? row[idx.valorAprox] : 0;
    const valorAprox = typeof valorRaw === 'number' ? valorRaw : parseInt(String(valorRaw).replace(/[^\d]/g, ''), 10) || 0;

    const responsableEmail = get(idx.responsableEmail);
    if (responsableEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(responsableEmail)) {
      errores.push(`Email de responsable inválido: "${responsableEmail}".`);
    }

    const fechaInicio = parsearFecha(idx.fechaInicio >= 0 ? row[idx.fechaInicio] : undefined);
    const fechaTermino = parsearFecha(idx.fechaTermino >= 0 ? row[idx.fechaTermino] : undefined);
    if (fechaInicio && fechaTermino && new Date(fechaTermino) < new Date(fechaInicio)) {
      errores.push('La Fecha Término es anterior a la Fecha Inicio.');
    }

    filas.push({
      fila: r + 1,
      datos: {
        codigoCP: get(idx.codigoCP) || '409-1722',
        codigoProyecto: get(idx.codigoProyecto),
        nombre,
        descripcion: get(idx.descripcion),
        valorAprox,
        campusSigla: get(idx.campusSigla).toUpperCase(),
        edificioSigla: get(idx.edificioSigla).toUpperCase(),
        tipoObra: get(idx.tipoObra).toUpperCase(),
        uso: get(idx.uso).toUpperCase(),
        rubro: normalizarRubro(idx.rubro >= 0 ? row[idx.rubro] : ''),
        responsableNombre: get(idx.responsableNombre),
        responsableEmail,
        prioridad: normalizarPrioridad(idx.prioridad >= 0 ? row[idx.prioridad] : ''),
        modalidadContrato: normalizarModalidad(idx.modalidadContrato >= 0 ? row[idx.modalidadContrato] : ''),
        fechaInicio,
        fechaTermino,
        presupuestoAprobado: normalizarSiNo(idx.presupuestoAprobado >= 0 ? row[idx.presupuestoAprobado] : ''),
      },
      errores,
    });
  }

  if (!filas.length) erroresGenerales.push('No se encontraron filas con datos bajo el encabezado.');

  return { filas, erroresGenerales };
}
