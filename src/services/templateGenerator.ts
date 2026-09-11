import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { LicitacionProyecto } from '../types';
import { normalizarNombreProyecto } from '../utils/spellCorrector';

export async function generarPlantillaCotizacionExcel(licitacion?: LicitacionProyecto) {
  const wb = new ExcelJS.Workbook();
  const nombreProyecto = normalizarNombreProyecto(licitacion?.nombreProyecto || 'NOMBRE DEL PROYECTO / SERVICIO');
  const codigoProyecto = licitacion?.codigoProyecto || 'XXXX';
  const fechaHoy = new Date().toLocaleDateString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const ws = wb.addWorksheet('Cotización Oficial', {
    pageSetup: {
      paperSize: 1 as any, // Letter
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25, right: 0.25,
        top: 0.75, bottom: 0.75,
        header: 0.3, footer: 0.3
      }
    }
  });

  // Colores corporativos UCT
  const COLOR_UCT_BLUE = '002B5C';
  const COLOR_UCT_LIGHT_BLUE = '0085CA';
  const COLOR_BG_HEADER = 'F0F4F8';
  const COLOR_BG_EDITABLE = 'FFFFE0'; // Amarillo muy claro para campos editables
  const COLOR_BG_DISABLED = 'F5F5F5'; // Gris claro para campos calculados/bloqueados

  // Anchos de columna optimizados
  ws.columns = [
    { width: 10 },   // A - Ítem
    { width: 50 },   // B - Descripción
    { width: 12 },   // C - Unidad
    { width: 12 },   // D - Cantidad
    { width: 25 },   // E - Precio Unitario
    { width: 25 },   // F - Precio Total
  ];

  const addHeader = (rowNum: number, texts: string[], heights: number[]) => {
     texts.forEach((text, idx) => {
        const row = ws.getRow(rowNum + idx);
        row.getCell(1).value = text;
        row.height = heights[idx];
        ws.mergeCells(`A${rowNum + idx}:F${rowNum + idx}`);
        const cell = row.getCell(1);
        cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFF' }, size: idx === 0 ? 14 : 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_UCT_BLUE } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
     });
  };

  // 1. Cabecera Institucional
  addHeader(1, [
    'UNIVERSIDAD CATÓLICA DE TEMUCO',
    'SUBDIRECCIÓN DE INFRAESTRUCTURA — DIRECCIÓN DE GESTIÓN DEL CAMPUS',
    'FORMULARIO ESTÁNDAR DE COTIZACIÓN DE OBRAS Y SERVICIOS',
    'Código: PS-FOR-DGDC0003'
  ], [30, 20, 20, 16]);

  ws.getRow(5).height = 10;

  const addSectionHeader = (rowNum: number, title: string) => {
    const row = ws.getRow(rowNum);
    row.getCell(1).value = title;
    row.height = 22;
    ws.mergeCells(`A${rowNum}:F${rowNum}`);
    row.getCell(1).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_UCT_LIGHT_BLUE } };
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  };

  // 2. Datos Licitación
  addSectionHeader(6, 'DATOS DE LA LICITACIÓN / PROYECTO');
  
  ws.getRow(7).values = ['Código CP', licitacion?.codigoCP || '409-XXX', 'Código OP', licitacion?.codigoOP || 'OP-XXXX', 'Código OT', licitacion?.codigoOT || 'OT-XXXX'];
  ws.getRow(8).values = ['Código Proyecto', codigoProyecto, 'Fecha Cotización', fechaHoy, null, null];
  ws.getRow(9).values = ['Nombre del Proyecto', nombreProyecto, null, null, null, null];
  ws.getRow(10).values = ['Descripción', licitacion?.descripcion || 'DESCRIPCIÓN DE LA OBRA O SERVICIO A COTIZAR', null, null, null, null];
  ws.mergeCells('B9:F9');
  ws.mergeCells('B10:F10');
  
  for (let r = 7; r <= 10; r++) {
    const row = ws.getRow(r);
    [1,3,5].forEach(c => {
       if (row.getCell(c).value) {
         row.getCell(c).font = { name: 'Arial', bold: true, size: 10 };
         row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_HEADER } };
         row.getCell(c).border = { top: { style: 'thin', color: { argb: 'DDDDDD' } }, bottom: { style: 'thin', color: { argb: 'DDDDDD' } } };
       }
    });
  }

  ws.getRow(11).height = 10;

  // 3. Datos Proveedor
  addSectionHeader(12, 'DATOS DEL PROVEEDOR (OFERENTE)');
  ws.getRow(13).values = ['RUT Empresa', '', 'Razón Social / Nombre Comercial', '', null, null];
  ws.getRow(14).values = ['Nombre Contacto', '', 'Cargo / Representante', '', null, null];
  ws.getRow(15).values = ['Email de Contacto', '', 'Teléfono de Contacto', '', null, null];
  ws.getRow(16).values = ['Dirección', '', 'Ciudad', 'Temuco', null, null];
  
  ws.mergeCells('D13:F13');
  ws.mergeCells('D14:F14');
  ws.mergeCells('D15:F15');
  ws.mergeCells('D16:F16');

  for (let r = 13; r <= 16; r++) {
    const row = ws.getRow(r);
    [1,3].forEach(c => {
       if (row.getCell(c).value) {
         row.getCell(c).font = { name: 'Arial', bold: true, size: 10 };
         row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_HEADER } };
       }
    });
    [2,4].forEach(c => {
       row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_EDITABLE } };
       row.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'CCCCCC' } } };
    });
  }

  ws.getRow(17).height = 10;

  // 4. Itemizado
  addSectionHeader(18, 'ITEMIZADO DE LA OFERTA — DESGLOSE DE COSTOS (VALORES NETOS SIN IVA)');
  const itemHeader = ws.getRow(19);
  itemHeader.values = ['ÍTEM', 'DESCRIPCIÓN DEL TRABAJO / MATERIAL / SERVICIO', 'UNIDAD', 'CANTIDAD', 'PRECIO UNITARIO NETO ($)', 'PRECIO TOTAL NETO ($)'];
  itemHeader.font = { name: 'Arial', bold: true, color: { argb: '000000' }, size: 10 };
  itemHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  itemHeader.height = 35;
  for (let c = 1; c <= 6; c++) {
    itemHeader.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' } };
    itemHeader.getCell(c).border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  }

  const items = [
    ['1.1', 'Instalación de faenas y seguridad de obra', 'Global', 1, 0],
    ['1.2', 'Demoliciones y retiro de escombros', 'Global', 1, 0],
    ['2.1', 'Obras preliminares (tabiquería, cielos)', 'm²', 0, 0],
    ['2.2', 'Instalación eléctrica e iluminación LED', 'Global', 1, 0],
    ['2.3', 'Pinturas y terminaciones interiores', 'm²', 0, 0],
    ['2.4', 'Carpintería y estructuras metálicas', 'Global', 1, 0],
    ['3.1', 'Instalaciones sanitarias / plomería', 'Global', 1, 0],
    ['3.2', 'Aseo final, limpieza y retiro de residuos', 'Global', 1, 0],
    ['3.3', '(Agregar ítem adicional si corresponde)', '', 0, 0],
    ['3.4', '(Agregar ítem adicional si corresponde)', '', 0, 0],
  ];

  let rowIdx = 20;
  items.forEach(item => {
    const r = ws.getRow(rowIdx);
    r.values = [...item, { formula: `D${rowIdx}*E${rowIdx}`, result: 0 }];
    r.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_EDITABLE } };
    r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_DISABLED } };
    
    for (let c = 1; c <= 6; c++) {
      r.getCell(c).font = { name: 'Arial', size: 10 };
      r.getCell(c).border = { top: { style: 'thin', color: { argb: 'EEEEEE' } }, bottom: { style: 'thin', color: { argb: 'EEEEEE' } } };
      if (c >= 4) r.getCell(c).numFmt = '"$"#,##0';
    }
    r.getCell(2).alignment = { wrapText: true };
    rowIdx++;
  });

  const endItems = rowIdx - 1;
  ws.getRow(rowIdx).height = 10; rowIdx++;

  // 5. Resumen
  const addTotalRow = (label: string, formulaOrVal: any, bold = false, size = 10) => {
    const r = ws.getRow(rowIdx);
    r.getCell(5).value = label;
    r.getCell(6).value = formulaOrVal;
    ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
    r.getCell(5).font = { name: 'Arial', bold, size };
    r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(6).font = { name: 'Arial', bold, size };
    r.getCell(6).numFmt = '"$"#,##0';
    r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: typeof formulaOrVal === 'number' ? COLOR_BG_EDITABLE : COLOR_BG_DISABLED } };
    r.getCell(6).border = { top: { style: 'thin', color: { argb: 'CCCCCC' } }, bottom: { style: 'thin', color: { argb: 'CCCCCC' } }, left: { style: 'thin', color: { argb: 'CCCCCC' } }, right: { style: 'thin', color: { argb: 'CCCCCC' } } };
    r.height = 20;
    rowIdx++;
    return rowIdx - 1;
  };

  const rSub = addTotalRow('SUBTOTAL NETO ($)', { formula: `SUM(F20:F${endItems})` }, true);
  const rGG = addTotalRow('GASTOS GENERALES Y UTILIDADES (%)', 0);
  const rGGVal = addTotalRow('GASTOS GENERALES Y UTILIDADES ($)', { formula: `F${rSub}*(F${rGG}/100)` });
  const rNeto = addTotalRow('VALOR NETO TOTAL ($)', { formula: `F${rSub}+F${rGGVal}` }, true, 11);
  const rIVA = addTotalRow('IVA 19% ($)', { formula: `F${rNeto}*0.19` });
  
  // Fila Total Oferta
  const rTotal = ws.getRow(rowIdx);
  rTotal.getCell(5).value = 'TOTAL OFERTA CON IVA ($)';
  rTotal.getCell(6).value = { formula: `F${rNeto}+F${rIVA}` };
  ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
  rTotal.getCell(5).font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FFFFFF' } };
  rTotal.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_UCT_BLUE } };
  rTotal.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
  rTotal.getCell(6).font = { name: 'Arial', bold: true, size: 12 };
  rTotal.getCell(6).numFmt = '"$"#,##0';
  rTotal.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } }; // Verde muy claro para el total
  rTotal.getCell(6).border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' } };
  rTotal.height = 25;
  rowIdx++;

  ws.getRow(rowIdx).height = 15; rowIdx++;

  // 6. Condiciones Comerciales
  addSectionHeader(rowIdx, 'CONDICIONES COMERCIALES DE LA OFERTA'); rowIdx++;
  ws.getRow(rowIdx).values = ['Plazo de Ejecución (Días Corridos)', '', 'Forma de Pago Propuesta', '', null, null];
  ws.mergeCells(`D${rowIdx}:F${rowIdx}`);
  ws.getRow(rowIdx).getCell(1).font = { name: 'Arial', bold: true, size: 10 }; ws.getRow(rowIdx).getCell(3).font = { name: 'Arial', bold: true, size: 10 };
  ws.getRow(rowIdx).getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_EDITABLE } };
  ws.getRow(rowIdx).getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_EDITABLE } };
  rowIdx++;
  ws.getRow(rowIdx).values = ['Validez de la Oferta (Días)', 30, 'Inicio de Obras (Días tras adjudicación)', 5, null, null];
  ws.mergeCells(`D${rowIdx}:F${rowIdx}`);
  ws.getRow(rowIdx).getCell(1).font = { name: 'Arial', bold: true, size: 10 }; ws.getRow(rowIdx).getCell(3).font = { name: 'Arial', bold: true, size: 10 };
  ws.getRow(rowIdx).getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_EDITABLE } };
  ws.getRow(rowIdx).getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_EDITABLE } };
  rowIdx++;
  ws.getRow(rowIdx).height = 15; rowIdx++;

  // 7. Parámetros Técnicos
  addSectionHeader(rowIdx, 'EVALUACIÓN TÉCNICA Y SUSTENTABILIDAD (PARA USO DEL SISTEMA DGDC)'); rowIdx++;
  const ptHeader = ws.getRow(rowIdx);
  ptHeader.values = ['PARÁMETRO', 'RESPUESTA (SI / NO)', 'OBSERVACIÓN / EVIDENCIA', null, null, null];
  ws.mergeCells(`C${rowIdx}:F${rowIdx}`);
  ptHeader.font = { name: 'Arial', bold: true, size: 10 }; ptHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' } };
  rowIdx++;
  
  const addParam = (q: string, a: string, obs: string) => {
     ws.getRow(rowIdx).values = [q, a, obs, null, null, null];
     ws.mergeCells(`C${rowIdx}:F${rowIdx}`);
     ws.getRow(rowIdx).getCell(1).font = { name: 'Arial', size: 10 };
     ws.getRow(rowIdx).getCell(2).font = { name: 'Arial', size: 10, bold: true };
     ws.getRow(rowIdx).getCell(3).font = { name: 'Arial', size: 10, italic: true };
     ws.getRow(rowIdx).getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_EDITABLE } };
     ws.getRow(rowIdx).getCell(2).alignment = { horizontal: 'center' };
     ws.getRow(rowIdx).border = { bottom: { style: 'thin', color: { argb: 'EEEEEE' } } };
     rowIdx++;
  };
  addParam('a) ¿Ajusta su oferta a todos los requerimientos y especificaciones técnicas?', 'SI', '');
  addParam('b) ¿Cuenta con experiencia comprobable en trabajos de similar naturaleza?', 'SI', 'Adjuntar cartas de referencia');
  addParam('c) ¿Se compromete a cumplir el servicio dentro del plazo ofertado?', 'SI', '');
  addParam('d) ¿Declara tener certificación/política sustentable o firma Carta Compromiso Sustentable UCT?', 'SI', 'Ej: Carta Compromiso, Certificado de Residuos, Política ISO 14001');
  ws.getRow(rowIdx).values = ['Tipo de evidencia sustentable', 'Carta Compromiso Sustentable UCT', null, null, null, null];
  ws.mergeCells(`B${rowIdx}:F${rowIdx}`);
  ws.getRow(rowIdx).getCell(1).font = { name: 'Arial', size: 10 };
  ws.getRow(rowIdx).getCell(2).font = { name: 'Arial', size: 10, bold: true };
  ws.getRow(rowIdx).getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BG_EDITABLE } };
  rowIdx++;
  ws.getRow(rowIdx).height = 15; rowIdx++;

  // 8. Declaración
  addSectionHeader(rowIdx, 'DECLARACIÓN DEL OFERENTE'); rowIdx++;
  ws.getRow(rowIdx).values = ['El suscrito declara que la información contenida en este formulario es veraz y que los precios indicados son netos sin IVA, salvo indicación contraria. Asimismo, declara conocer y aceptar las bases y condiciones de cotización establecidas por la Subdirección de Infraestructura de la Universidad Católica de Temuco.', null, null, null, null, null];
  ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
  ws.getRow(rowIdx).height = 45;
  ws.getRow(rowIdx).getCell(1).font = { name: 'Arial', size: 9, italic: true, color: { argb: '555555' } };
  ws.getRow(rowIdx).getCell(1).alignment = { wrapText: true, vertical: 'top' };
  rowIdx++;
  ws.getRow(rowIdx).height = 10; rowIdx++;

  ws.getRow(rowIdx).values = ['Firma:', '', 'Cargo:', '', 'Fecha:', fechaHoy];
  ws.getRow(rowIdx).getCell(1).font = { name: 'Arial', bold: true, size: 10 };
  ws.getRow(rowIdx).getCell(3).font = { name: 'Arial', bold: true, size: 10 };
  ws.getRow(rowIdx).getCell(5).font = { name: 'Arial', bold: true, size: 10 };
  ws.getRow(rowIdx).getCell(2).border = { bottom: { style: 'medium' } };
  ws.getRow(rowIdx).getCell(4).border = { bottom: { style: 'medium' } };
  rowIdx++;
  ws.getRow(rowIdx).values = ['RUT:', '', 'Razón Social:', '', null, null];
  ws.mergeCells(`D${rowIdx}:F${rowIdx}`);
  ws.getRow(rowIdx).getCell(1).font = { name: 'Arial', bold: true, size: 10 };
  ws.getRow(rowIdx).getCell(3).font = { name: 'Arial', bold: true, size: 10 };
  ws.getRow(rowIdx).getCell(2).border = { bottom: { style: 'medium' } };
  ws.getRow(rowIdx).getCell(4).border = { bottom: { style: 'medium' } };

  // 9. Cargar Logo UCT
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}logo-uct.png`);
    const blob = await response.blob();
    const base64data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const logoId = wb.addImage({
      base64: base64data,
      extension: 'png',
    });
    
    // Insertar el logo en la esquina superior izquierda flotando sobre la cabecera azul
    ws.addImage(logoId, {
      tl: { col: 0.1, row: 0.2 }, // Ligeramente desplazado de la esquina
      ext: { width: 140, height: 48 } // Ajustado para encajar en el alto de la primera fila (30px) + un poco más
    });
  } catch (error) {
    console.warn('No se pudo cargar el logo UCT para el Excel', error);
  }

  // Exportar Archivo
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Formato_Cotizacion_${codigoProyecto}_UCT.xlsx`);
}
