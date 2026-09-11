import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ItemItemizadoProyecto, ProyectoMaestro } from '../types';
import { agruparPorFase } from '../utils/itemizadoOrganizer';

const COLOR_ENCABEZADO = '1D5C86';
const COLOR_FASE = 'DCE6F1';
const COLOR_TOTAL = 'FFF2CC';

/** Exporta el Itemizado del Proyecto a un Excel con formato institucional: membrete con logo,
 * datos del proyecto, partidas agrupadas por fase con subtotal cada una, y el total con IVA. */
export async function generarItemizadoExcel(proyecto: ProyectoMaestro, items: ItemItemizadoProyecto[], tasaIva: number): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Itemizado', { views: [{ showGridLines: false }] });

  const ENCABEZADOS = ['Item', 'Fase', 'Descripción', 'Unidad', 'Cantidad', 'Precio Unitario', 'Total'];
  ws.columns = [
    { width: 8 }, { width: 22 }, { width: 46 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 16 },
  ];

  // ── Membrete ──────────────────────────────────────────────────────────
  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'UNIVERSIDAD CATÓLICA DE TEMUCO';
  ws.getCell('A1').font = { name: 'Arial', bold: true, size: 13, color: { argb: COLOR_ENCABEZADO } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = 'Subdirección de Infraestructura · Dirección de Gestión y Desarrollo de Campus';
  ws.getCell('A2').font = { name: 'Arial', italic: true, size: 9, color: { argb: '64748B' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.mergeCells('A3:G3');
  ws.getCell('A3').value = 'ITEMIZADO DEL PROYECTO — PRESUPUESTO REFERENCIAL';
  ws.getCell('A3').font = { name: 'Arial', bold: true, size: 12 };
  ws.getCell('A3').alignment = { horizontal: 'center' };
  ws.getRow(3).height = 20;

  ws.mergeCells('A4:G4');
  ws.getCell('A4').value = `${proyecto.codigoProyecto || ''} — ${(proyecto.nombre || '').toUpperCase()}`;
  ws.getCell('A4').font = { name: 'Arial', bold: true, size: 10 };
  ws.getCell('A4').alignment = { horizontal: 'center' };

  ws.mergeCells('A5:G5');
  ws.getCell('A5').value = `CP ${proyecto.codigoCP || '—'} · Campus ${proyecto.campusNombre || proyecto.campusSigla || '—'} · Tipo de Obra: ${proyecto.tipoObra || '—'} · Emitido: ${new Date().toLocaleDateString('es-CL')}`;
  ws.getCell('A5').font = { name: 'Arial', size: 9, color: { argb: '475569' } };
  ws.getCell('A5').alignment = { horizontal: 'center' };
  ws.addRow([]);

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}logo-uct.png`);
    const blob = await response.blob();
    const base64data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const logoId = wb.addImage({ base64: base64data, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.05, row: 0.15 }, ext: { width: 100, height: 34 } });
  } catch (error) {
    console.warn('No se pudo cargar el logo UCT para el Excel del itemizado', error);
  }

  // ── Encabezado de tabla ───────────────────────────────────────────────
  const filaEncabezado = ws.addRow(ENCABEZADOS);
  filaEncabezado.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFF' }, size: 10 };
  filaEncabezado.height = 20;
  filaEncabezado.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin' } };
  });

  const bordeFino: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'E2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
    left: { style: 'thin', color: { argb: 'E2E8F0' } },
    right: { style: 'thin', color: { argb: 'E2E8F0' } },
  };

  let subtotalNeto = 0;
  for (const grupo of agruparPorFase(items)) {
    const filaFase = ws.addRow([grupo.fase]);
    ws.mergeCells(filaFase.number, 1, filaFase.number, 7);
    filaFase.getCell(1).font = { name: 'Arial', bold: true, size: 10, color: { argb: COLOR_ENCABEZADO } };
    filaFase.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FASE } };

    let subtotalGrupo = 0;
    for (const it of grupo.items) {
      const fila = ws.addRow([it.item, it.fase || '—', it.descripcion, it.unidad, it.cantidad, it.precioUnitario, it.precioTotal]);
      fila.eachCell(cell => { cell.border = bordeFino; cell.font = { name: 'Arial', size: 9 }; });
      fila.getCell(5).numFmt = '#,##0.##';
      fila.getCell(5).alignment = { horizontal: 'right' };
      fila.getCell(6).numFmt = '$#,##0';
      fila.getCell(6).alignment = { horizontal: 'right' };
      fila.getCell(7).numFmt = '$#,##0';
      fila.getCell(7).alignment = { horizontal: 'right' };
      fila.getCell(7).font = { name: 'Arial', size: 9, bold: true };
      subtotalGrupo += it.precioTotal || 0;
    }

    const filaSubtotal = ws.addRow(['', '', '', '', '', `Subtotal ${grupo.fase}`, subtotalGrupo]);
    ws.mergeCells(filaSubtotal.number, 3, filaSubtotal.number, 6);
    filaSubtotal.getCell(3).alignment = { horizontal: 'right' };
    filaSubtotal.getCell(3).font = { name: 'Arial', italic: true, size: 9, color: { argb: '64748B' } };
    filaSubtotal.getCell(7).numFmt = '$#,##0';
    filaSubtotal.getCell(7).font = { name: 'Arial', bold: true, size: 9 };
    filaSubtotal.getCell(7).border = { top: { style: 'thin' } };
    subtotalNeto += subtotalGrupo;
  }

  ws.addRow([]);
  const montoIva = Math.round(subtotalNeto * (tasaIva / 100));
  const totalConIva = subtotalNeto + montoIva;

  const agregarFilaResumen = (etiqueta: string, monto: number, destacado = false) => {
    const fila = ws.addRow(['', '', '', '', '', etiqueta, monto]);
    ws.mergeCells(fila.number, 3, fila.number, 6);
    fila.getCell(3).alignment = { horizontal: 'right' };
    fila.getCell(3).font = { name: 'Arial', bold: destacado, size: destacado ? 11 : 10 };
    fila.getCell(7).numFmt = '$#,##0';
    fila.getCell(7).font = { name: 'Arial', bold: true, size: destacado ? 12 : 10, color: { argb: destacado ? COLOR_ENCABEZADO : '000000' } };
    if (destacado) {
      fila.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL } };
      fila.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL } };
    }
    return fila;
  };

  agregarFilaResumen('Subtotal Neto', subtotalNeto);
  agregarFilaResumen(`IVA (${tasaIva}%)`, montoIva);
  agregarFilaResumen('TOTAL (IVA incluido)', totalConIva, true);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Itemizado_${proyecto.codigoProyecto || proyecto.id}.xlsx`);
}
