import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ProyectoMaestro } from '../types';
import type { AuditoriaLicitacion } from './auditoriaReport';

const ESTADO_LABEL: Record<string, string> = { ok: 'OK', falta: 'FALTA', na: 'N/A' };

export async function generarReporteAuditoriaExcel(
  proyectos: ProyectoMaestro[],
  auditorias: AuditoriaLicitacion[]
): Promise<void> {
  const wb = new ExcelJS.Workbook();

  // Hoja 1: Cartera de Proyectos
  const wsCartera = wb.addWorksheet('Cartera de Proyectos');
  wsCartera.columns = [
    { header: 'Cód. Proyecto', key: 'codigoProyecto', width: 14 },
    { header: 'Centro Costo', key: 'codigoCP', width: 12 },
    { header: 'Nombre', key: 'nombre', width: 40 },
    { header: 'Campus', key: 'campus', width: 10 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Prioridad', key: 'prioridad', width: 10 },
    { header: 'Modalidad Contrato', key: 'modalidad', width: 20 },
    { header: 'Presupuesto Estimado', key: 'valorAprox', width: 20 },
    { header: 'Monto Adjudicado', key: 'montoAdjudicado', width: 20 },
    { header: 'Gasto Efectivo', key: 'gastoEfectivo', width: 20 },
    { header: 'Responsable', key: 'responsable', width: 22 },
  ];
  wsCartera.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  wsCartera.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1D5C86' } };
  proyectos.forEach(p => {
    wsCartera.addRow({
      codigoProyecto: p.codigoProyecto,
      codigoCP: p.codigoCP,
      nombre: p.nombre,
      campus: p.campusSigla || '',
      estado: p.estado,
      prioridad: p.prioridad || 'Media',
      modalidad: p.modalidadContrato || '',
      valorAprox: p.valorAprox || 0,
      montoAdjudicado: p.montoAdjudicado || 0,
      gastoEfectivo: p.gastoEfectivo || 0,
      responsable: p.responsableNombre || '',
    });
  });
  ['H', 'I', 'J'].forEach(col => {
    wsCartera.getColumn(col).numFmt = '"$"#,##0';
  });

  // Hoja 2: Auditoría de Expedientes
  const wsAuditoria = wb.addWorksheet('Auditoría de Expedientes');
  const checkLabels = auditorias[0]?.checks.map(c => c.etiqueta) || [];
  wsAuditoria.columns = [
    { header: 'Cód. Proyecto', key: 'cod', width: 14 },
    { header: 'Licitación', key: 'nombre', width: 40 },
    { header: 'Estado', key: 'estado', width: 16 },
    ...checkLabels.map((label, i) => ({ header: label, key: `check${i}`, width: 22 })),
    { header: '% Completitud', key: 'pct', width: 14 },
  ];
  wsAuditoria.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  wsAuditoria.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E7566' } };
  auditorias.forEach(a => {
    const row: Record<string, unknown> = {
      cod: a.licitacion.codigoProyecto,
      nombre: a.licitacion.nombreProyecto,
      estado: a.licitacion.estadoLifecycle || a.licitacion.estado,
      pct: `${a.pctCompletitud}%`,
    };
    a.checks.forEach((c, i) => { row[`check${i}`] = ESTADO_LABEL[c.estado]; });
    wsAuditoria.addRow(row);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Reporte_Auditoria_Cartera_UCT_${new Date().toISOString().split('T')[0]}.xlsx`);
}
