import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { LicitacionProyecto } from '../types';

const COLOR_ENCABEZADO = '1D5C86';
const COLOR_ENTRADA = 'FFF2CC';
const COLOR_DATO = 'F1F5F9';

/** Datos del contratista invitado que vienen prellenados en el formato. */
export interface DatosOferente {
  razonSocial: string;
  rut?: string;
  nombreContacto?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
}

/**
 * Formato de presupuesto que descarga el proveedor invitado: el itemizado del presupuesto estimativo del
 * proyecto SIN cantidades ni precios (solo item, fase, descripción y unidad) y con los datos de su empresa ya
 * completados. El proveedor llena Cantidad y Precio Unitario; el Total, el IVA y el monto final se calculan solos.
 * Los encabezados son los que lee `parseCotizacionExcel`, así que el mismo archivo se sube como oferta económica.
 */
export async function generarFormatoPresupuestoExcel(licitacion: LicitacionProyecto, oferente?: DatosOferente): Promise<void> {
  const partidas = licitacion.formatoPresupuesto || [];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Presupuesto', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 8 }, { width: 22 }, { width: 50 }, { width: 10 }, { width: 12 }, { width: 18 }, { width: 18 }];

  const titulo = (fila: number, texto: string, opciones: Partial<ExcelJS.Font>, altura?: number) => {
    ws.mergeCells(`A${fila}:G${fila}`);
    const celda = ws.getCell(`A${fila}`);
    celda.value = texto;
    celda.font = { name: 'Arial', ...opciones };
    celda.alignment = { horizontal: 'center', wrapText: true, vertical: 'middle' };
    if (altura) ws.getRow(fila).height = altura;
  };
  titulo(1, 'UNIVERSIDAD CATÓLICA DE TEMUCO', { bold: true, size: 13, color: { argb: COLOR_ENCABEZADO } });
  titulo(2, 'Subdirección de Infraestructura · Dirección de Gestión y Desarrollo de Campus', { italic: true, size: 9, color: { argb: '64748B' } });
  titulo(3, 'FORMATO DE PRESUPUESTO — OFERTA ECONÓMICA', { bold: true, size: 12 }, 20);
  titulo(4, `${licitacion.codigoProyecto || ''} — ${(licitacion.nombreProyecto || '').toUpperCase()}`, { bold: true, size: 10 });
  titulo(
    5,
    'Complete las columnas "Cantidad" y "Precio Unitario" (valores netos, sin IVA) de cada partida. El Total, el IVA y el monto final se calculan solos. No modifique el orden ni las columnas.',
    { size: 9, color: { argb: '475569' } },
    30,
  );
  ws.addRow([]);

  // ── Datos del oferente (prellenados con la ficha del contratista invitado) ──
  const datos: [string, string][] = [
    ['Razón social', oferente?.razonSocial || ''],
    ['RUT', oferente?.rut || ''],
    ['Contacto', oferente?.nombreContacto || ''],
    ['Correo', oferente?.email || ''],
    ['Teléfono', oferente?.telefono || ''],
    ['Dirección', [oferente?.direccion, oferente?.ciudad].filter(Boolean).join(', ')],
  ];
  ws.mergeCells('A7:G7');
  const cabDatos = ws.getCell('A7');
  cabDatos.value = 'DATOS DEL OFERENTE';
  cabDatos.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFF' } };
  cabDatos.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
  datos.forEach(([etiqueta, valor], i) => {
    const fila = 8 + i;
    ws.mergeCells(`A${fila}:B${fila}`);
    ws.mergeCells(`C${fila}:G${fila}`);
    const e = ws.getCell(`A${fila}`);
    e.value = etiqueta;
    e.font = { name: 'Arial', bold: true, size: 9 };
    e.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_DATO } };
    const v = ws.getCell(`C${fila}`);
    v.value = valor;
    v.font = { name: 'Arial', size: 9 };
  });
  ws.addRow([]);

  const filaEncabezado = 8 + datos.length + 1;
  const encabezado = ws.getRow(filaEncabezado);
  ['Item', 'Fase', 'Descripción', 'Unidad', 'Cantidad', 'Precio Unitario', 'Total'].forEach((texto, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = texto;
    celda.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
    celda.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  encabezado.height = 20;

  // Sin partidas registradas en el proyecto: se entrega la tabla con filas vacías para completar.
  const filas = partidas.length > 0
    ? partidas
    : Array.from({ length: 15 }, (_, i) => ({ item: String(i + 1), fase: '', descripcion: '', unidad: '' }));

  filas.forEach((p, i) => {
    const fila = filaEncabezado + 1 + i;
    const row = ws.getRow(fila);
    row.getCell(1).value = p.item;
    row.getCell(2).value = p.fase || '';
    row.getCell(3).value = p.descripcion;
    row.getCell(4).value = p.unidad;
    row.getCell(7).value = { formula: `IF(OR(E${fila}="",F${fila}=""),"",E${fila}*F${fila})`, result: 0 };
    row.getCell(5).numFmt = '#,##0.##';
    row.getCell(6).numFmt = '"$"#,##0';
    row.getCell(7).numFmt = '"$"#,##0';
    row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENTRADA } };
    row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENTRADA } };
    for (let c = 1; c <= 7; c++) {
      const celda = row.getCell(c);
      celda.font = { name: 'Arial', size: 9 };
      celda.border = { top: { style: 'thin', color: { argb: 'CBD5E1' } }, bottom: { style: 'thin', color: { argb: 'CBD5E1' } }, left: { style: 'thin', color: { argb: 'CBD5E1' } }, right: { style: 'thin', color: { argb: 'CBD5E1' } } };
    }
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  });

  const primera = filaEncabezado + 1;
  const ultima = filaEncabezado + filas.length;
  const filaNeto = ultima + 2;
  const totales: [string, string][] = [
    ['MONTO NETO', `SUM(G${primera}:G${ultima})`],
    ['IVA (19%)', `ROUND(G${filaNeto}*0.19,0)`],
    ['TOTAL CON IVA', `G${filaNeto}+G${filaNeto + 1}`],
  ];
  totales.forEach(([etiqueta, formula], i) => {
    const fila = filaNeto + i;
    ws.mergeCells(`A${fila}:F${fila}`);
    const e = ws.getCell(`A${fila}`);
    e.value = etiqueta;
    e.font = { name: 'Arial', bold: true, size: 10 };
    e.alignment = { horizontal: 'right' };
    const v = ws.getCell(`G${fila}`);
    v.value = { formula, result: 0 };
    v.numFmt = '"$"#,##0';
    v.font = { name: 'Arial', bold: true, size: 10 };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const empresa = (oferente?.razonSocial || 'Oferente').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
  const nombre = `Formato_Presupuesto_${(licitacion.codigoProyecto || licitacion.id).replace(/[^a-zA-Z0-9_-]/g, '_')}_${empresa}.xlsx`;
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
}
