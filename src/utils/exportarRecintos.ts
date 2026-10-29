// Descarga a Excel de los recintos (de un edificio o de un campus completo): el reemplazo de la planilla del catastro
// para reportes. Una fila por recinto (los ocupantes van juntos en una celda, así las superficies no se suman dos
// veces) y una hoja de resumen por edificio y por tipo de recinto.
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Piso, Recinto } from '../types/recintos';
import { alertasRecinto, observacionesSinNotas } from './alertasRecinto';
import { comoTitulo } from './texto';

export interface FilaExportable extends Recinto {
  piso?: Pick<Piso, 'codigo' | 'nombre'> | null;
}

const AZUL = '1D5C86';
const encabezado = (hoja: ExcelJS.Worksheet) => {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  fila.alignment = { vertical: 'middle' };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } };
};
const m2 = (n?: number | null) => (n || n === 0 ? Number(n) : null);

/** Genera y descarga el Excel. `nombres` traduce el código de edificio a su nombre. */
export async function exportarRecintosExcel(recintos: FilaExportable[], nombres: Record<string, string>, titulo: string): Promise<void> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Gestor de Espacios UCT';
  const vigentes = recintos.filter(r => r.estado !== 'Eliminado');
  const ordenar = (a: FilaExportable, b: FilaExportable) =>
    a.edificio_codigo.localeCompare(b.edificio_codigo, 'es', { numeric: true }) || (a.piso?.codigo || '').localeCompare(b.piso?.codigo || '', 'es', { numeric: true })
    || a.codigo.localeCompare(b.codigo, 'es', { numeric: true });

  // Resumen por edificio.
  const resumen = libro.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Edificio', key: 'edificio', width: 12 }, { header: 'Nombre', key: 'nombre', width: 40 },
    { header: 'Recintos', key: 'n', width: 10 }, { header: 'm² útil', key: 'util', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'm² OGUC', key: 'oguc', width: 12, style: { numFmt: '#,##0.00' } }, { header: 'Ocupantes', key: 'ocupantes', width: 11 },
    { header: 'Por revisar', key: 'revisar', width: 12 },
  ];
  const porEdificio = new Map<string, FilaExportable[]>();
  vigentes.forEach(r => porEdificio.set(r.edificio_codigo, [...(porEdificio.get(r.edificio_codigo) || []), r]));
  for (const [e, lista] of [...porEdificio].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))) {
    resumen.addRow({
      edificio: e, nombre: nombres[e] || '', n: lista.length,
      util: lista.reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0),
      oguc: lista.reduce((s, r) => s + (Number(r.superficie_oguc_m2) || 0), 0),
      ocupantes: lista.reduce((s, r) => s + (r.ocupantes?.length || 0), 0),
      revisar: lista.filter(r => alertasRecinto(r).length).length,
    });
  }
  const total = resumen.addRow({
    edificio: 'Total', n: vigentes.length,
    util: vigentes.reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0),
    oguc: vigentes.reduce((s, r) => s + (Number(r.superficie_oguc_m2) || 0), 0),
    ocupantes: vigentes.reduce((s, r) => s + (r.ocupantes?.length || 0), 0),
    revisar: vigentes.filter(r => alertasRecinto(r).length).length,
  });
  total.font = { bold: true };
  encabezado(resumen);

  // Recintos.
  const hoja = libro.addWorksheet('Recintos');
  hoja.columns = [
    { header: 'Edificio', key: 'edificio', width: 10 }, { header: 'Nombre del edificio', key: 'nombreEdificio', width: 28 },
    { header: 'Piso', key: 'piso', width: 12 }, { header: 'Código', key: 'codigo', width: 14 }, { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Uso', key: 'uso', width: 24 }, { header: 'm² útil', key: 'util', width: 10, style: { numFmt: '#,##0.00' } },
    { header: 'm² OGUC', key: 'oguc', width: 10, style: { numFmt: '#,##0.00' } }, { header: 'Capacidad', key: 'capacidad', width: 10 },
    { header: 'Estado', key: 'estado', width: 14 }, { header: 'Unidad usuaria', key: 'unidad', width: 34 },
    { header: 'N° ocupantes', key: 'nOcupantes', width: 11 }, { header: 'Ocupantes', key: 'ocupantes', width: 60 },
    { header: 'Por revisar', key: 'revisar', width: 40 }, { header: 'Observaciones', key: 'observaciones', width: 40 },
  ];
  for (const r of [...recintos].sort(ordenar)) {
    hoja.addRow({
      edificio: r.edificio_codigo, nombreEdificio: nombres[r.edificio_codigo] || '', piso: r.piso?.nombre || '', codigo: r.codigo,
      nombre: r.nombre, uso: r.uso || '', util: m2(r.superficie_m2), oguc: m2(r.superficie_oguc_m2), capacidad: r.capacidad ?? null,
      estado: r.estado, unidad: r.unidad_usuaria || '', nOcupantes: r.ocupantes?.length || 0,
      ocupantes: (r.ocupantes || []).map(o => [comoTitulo(o.nombre), o.cargo].filter(Boolean).join(' – ')).join('; '),
      revisar: alertasRecinto(r).join('; '), observaciones: observacionesSinNotas(r.observaciones).join(' '),
    });
  }
  encabezado(hoja);

  // Resumen por tipo de recinto.
  const tipos = libro.addWorksheet('Por tipo');
  tipos.columns = [
    { header: 'Tipo de recinto', key: 'tipo', width: 40 }, { header: 'Recintos', key: 'n', width: 10 },
    { header: 'm² útil', key: 'util', width: 12, style: { numFmt: '#,##0.00' } }, { header: 'm² OGUC', key: 'oguc', width: 12, style: { numFmt: '#,##0.00' } },
  ];
  const porTipo = new Map<string, FilaExportable[]>();
  vigentes.forEach(r => porTipo.set(r.nombre, [...(porTipo.get(r.nombre) || []), r]));
  [...porTipo].sort((a, b) => b[1].length - a[1].length).forEach(([tipo, lista]) => tipos.addRow({
    tipo, n: lista.length,
    util: lista.reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0),
    oguc: lista.reduce((s, r) => s + (Number(r.superficie_oguc_m2) || 0), 0),
  }));
  encabezado(tipos);

  const datos = await libro.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);
  saveAs(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Recintos ${titulo} ${fecha}.xlsx`);
}
