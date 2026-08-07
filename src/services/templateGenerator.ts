import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { LicitacionProyecto } from '../types';

export function generarPlantillaCotizacionExcel(licitacion?: LicitacionProyecto) {
  // Crear libro de trabajo
  const wb = XLSX.utils.book_new();

  // Hoja 1: Formulario Estándar de Cotización
  const wsData = [
    ['UNIVERSIDAD CATÓLICA DE TEMUCO - SUBDIRECCIÓN DE INFRAESTRUCTURA'],
    ['FORMULARIO ESTÁNDAR DE COTIZACIÓN DE OBRAS Y SERVICIOS'],
    [''],
    ['DATOS DE LA LICITACIÓN / PROYECTO'],
    ['Código CP', licitacion?.codigoCP || '409-XXX'],
    ['Código OP', licitacion?.codigoOP || 'OP-XXXX'],
    ['Código OT', licitacion?.codigoOT || 'OT-XXXX'],
    ['Nombre Proyecto', licitacion?.nombreProyecto || 'NOMBRE DEL PROYECTO'],
    ['Descripción', licitacion?.descripcion || 'DESCRIPCIÓN DE LA OBRA O SERVICIO'],
    [''],
    ['DATOS DEL PROVEEDOR (OFERENTE)'],
    ['RUT Empresa (Ej: 76.123.456-7)', ''],
    ['Razón Social / Nombre', ''],
    ['Nombre Contacto', ''],
    ['Email de Contacto', ''],
    ['Teléfono de Contacto', ''],
    ['Dirección / Ciudad', ''],
    [''],
    ['RESUMEN DE LA OFERTA'],
    ['Monto Oferta NETO (CLP)', 0],
    ['IVA 19% (CLP)', 0],
    ['Monto Oferta TOTAL CON IVA (CLP)', 0],
    ['Plazo de Ejecución (Días de corrido)', 0],
    [''],
    ['PARÁMETROS TÉCNICOS Y SUSTENTABILIDAD (Marcar SI / NO)'],
    ['¿Ajusta su oferta a todos los requerimientos y especificaciones técnicas?', 'SI'],
    ['¿Cuenta con experiencia comprobable en trabajos de similar naturaleza?', 'SI'],
    ['¿Se compromete a cumplir el servicio dentro del plazo ofertado?', 'SI'],
    ['¿Declara tener certificación/política sustentable o firma Carta Compromiso Sustentable?', 'SI'],
    ['Tipo de evidencia sustentable (Ej: Carta Compromiso, Certificado Residuos, Política ISO)', 'Carta Compromiso Sustentable'],
    ['Observaciones / Comentarios adicionales', ''],
    [''],
    ['ITEMIZADO DE LA OBRA (DESGLOSE DE COSTOS)'],
    ['Item', 'Descripción del Trabajo / Material', 'Unidad', 'Cantidad', 'Precio Unitario (Neto)', 'Precio Total (Neto)'],
    ['1.1', 'Instalación de faenas y seguridad', 'Global', 1, 0, 0],
    ['1.2', 'Demoliciones y retiro de escombros', 'Global', 1, 0, 0],
    ['2.1', 'Obras preliminares y tabiquería', 'm2', 1, 0, 0],
    ['2.2', 'Instalación eléctrica e iluminación LED', 'Global', 1, 0, 0],
    ['2.3', 'Pintura y terminaciones', 'm2', 1, 0, 0],
    ['3.1', 'Aseo final y entrega de obra', 'Global', 1, 0, 0],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Ajustar anchos de columnas
  ws['!cols'] = [
    { wch: 45 },
    { wch: 45 },
    { wch: 15 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Cotización Oficial');

  // Hoja 2: Instrucciones para el Proveedor
  const instruccionesData = [
    ['INSTRUCCIONES PARA EL PROVEEDOR (OFERENTE)'],
    [''],
    ['1. Rellene todos los campos requeridos en los datos del proveedor.'],
    ['2. En la sección RESUMEN DE LA OFERTA, ingrese el Monto Neto y Plazo en Días. El sistema calculará el IVA e impuestos.'],
    ['3. En el ITEMIZADO DE LA OBRA, desglose las actividades y partidas de su propuesta.'],
    ['4. En PARÁMETROS TÉCNICOS Y SUSTENTABILIDAD, indique si cuenta con la documentación requerida.'],
    ['5. En caso de no contar con certificación ambiental, adjunte firmada la Carta Compromiso Sustentable de UCT.'],
    ['6. Guarde este archivo Excel y súbalo al sistema de Infraestructura UCT.'],
  ];

  const wsInstrucciones = XLSX.utils.aoa_to_sheet(instruccionesData);
  wsInstrucciones['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

  // Generar archivo ejecutable para descarga
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  const nombreArchivo = `Formato_Estandar_Cotizacion_${licitacion?.codigoProyecto || 'UCT'}.xlsx`;
  saveAs(blob, nombreArchivo);
}
