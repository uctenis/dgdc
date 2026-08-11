import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { LicitacionProyecto } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   Helper: aplica estilos a una celda (solo con SheetJS Pro, pero se usan
   anchos, alto de filas y fusiones que sí funcionan con la versión Community)
───────────────────────────────────────────────────────────────────────────── */

export function generarPlantillaCotizacionExcel(licitacion?: LicitacionProyecto) {
  const wb = XLSX.utils.book_new();

  /* ══════════════════════════════════════════════════════════════════════════
     HOJA 1 — FORMULARIO OFICIAL DE COTIZACIÓN
  ══════════════════════════════════════════════════════════════════════════ */
  const now = new Date();
  const fechaHoy = now.toLocaleDateString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const codigoProyecto = licitacion?.codigoProyecto || 'XXXX';

  // Filas de la hoja (índice de fila → contenido)
  const wsData: any[][] = [
    // ── Fila 0: Título principal ──────────────────────────────────────────
    ['UNIVERSIDAD CATÓLICA DE TEMUCO', null, null, null, null, null],
    ['SUBDIRECCIÓN DE INFRAESTRUCTURA — DIRECCIÓN DE GESTIÓN DEL CAMPUS', null, null, null, null, null],
    ['FORMULARIO ESTÁNDAR DE COTIZACIÓN DE OBRAS Y SERVICIOS', null, null, null, null, null],
    ['Código SGC: PS-FOR-DGDC0003', null, null, null, null, null],
    [null, null, null, null, null, null], // espacio

    // ── Datos de la Licitación ────────────────────────────────────────────
    ['DATOS DE LA LICITACIÓN / PROYECTO', null, null, null, null, null],
    ['Código CP', licitacion?.codigoCP || '409-XXX', 'Código OP', licitacion?.codigoOP || 'OP-XXXX', 'Código OT', licitacion?.codigoOT || 'OT-XXXX'],
    ['Código Proyecto', codigoProyecto, 'Fecha Cotización', fechaHoy, null, null],
    ['Nombre del Proyecto', licitacion?.nombreProyecto || 'NOMBRE DEL PROYECTO / SERVICIO', null, null, null, null],
    ['Descripción', licitacion?.descripcion || 'DESCRIPCIÓN DE LA OBRA O SERVICIO A COTIZAR', null, null, null, null],
    [null, null, null, null, null, null],

    // ── Datos del Proveedor ───────────────────────────────────────────────
    ['DATOS DEL PROVEEDOR (OFERENTE)', null, null, null, null, null],
    ['RUT Empresa', '', 'Razón Social / Nombre Comercial', '', null, null],
    ['Nombre Contacto', '', 'Cargo / Representante', '', null, null],
    ['Email de Contacto', '', 'Teléfono de Contacto', '', null, null],
    ['Dirección', '', 'Ciudad', 'Temuco', null, null],
    [null, null, null, null, null, null],

    // ── Encabezado del Itemizado ──────────────────────────────────────────
    ['ITEMIZADO DE LA OFERTA — DESGLOSE DE COSTOS (VALORES NETOS SIN IVA)', null, null, null, null, null],
    ['ÍTEM', 'DESCRIPCIÓN DEL TRABAJO / MATERIAL / SERVICIO', 'UNIDAD', 'CANTIDAD', 'PRECIO UNITARIO NETO ($)', 'PRECIO TOTAL NETO ($)'],

    // ── Ítems (filas editables) ───────────────────────────────────────────
    ['1.1', 'Instalación de faenas y seguridad de obra', 'Global', 1, 0, { f: 'D20*E20' }],
    ['1.2', 'Demoliciones y retiro de escombros', 'Global', 1, 0, { f: 'D21*E21' }],
    ['2.1', 'Obras preliminares (tabiquería, cielos)', 'm²', 0, 0, { f: 'D22*E22' }],
    ['2.2', 'Instalación eléctrica e iluminación LED', 'Global', 1, 0, { f: 'D23*E23' }],
    ['2.3', 'Pinturas y terminaciones interiores', 'm²', 0, 0, { f: 'D24*E24' }],
    ['2.4', 'Carpintería y estructuras metálicas', 'Global', 1, 0, { f: 'D25*E25' }],
    ['3.1', 'Instalaciones sanitarias / plomería', 'Global', 1, 0, { f: 'D26*E26' }],
    ['3.2', 'Aseo final, limpieza y retiro de residuos', 'Global', 1, 0, { f: 'D27*E27' }],
    ['3.3', '(Agregar ítem adicional si corresponde)', '', 0, 0, { f: 'D28*E28' }],
    ['3.4', '(Agregar ítem adicional si corresponde)', '', 0, 0, { f: 'D29*E29' }],

    // ── Resumen financiero ────────────────────────────────────────────────
    [null, null, null, null, 'SUBTOTAL NETO ($)', { f: 'SUM(F20:F29)' }],
    [null, null, null, null, 'GASTOS GENERALES Y UTILIDADES (%)', 0],
    [null, null, null, null, 'GASTOS GENERALES Y UTILIDADES ($)', { f: 'F30*(F31/100)' }],
    [null, null, null, null, 'VALOR NETO TOTAL ($)', { f: 'F30+F32' }],
    [null, null, null, null, 'IVA 19% ($)', { f: 'F33*0.19' }],
    [null, null, null, null, 'TOTAL OFERTA CON IVA ($)', { f: 'F33+F34' }],
    [null, null, null, null, null, null],

    // ── Condiciones comerciales ───────────────────────────────────────────
    ['CONDICIONES COMERCIALES DE LA OFERTA', null, null, null, null, null],
    ['Plazo de Ejecución (Días Corridos)', '', 'Forma de Pago Propuesta', '', null, null],
    ['Validez de la Oferta (Días)', 30, 'Inicio de Obras (Días tras adjudicación)', 5, null, null],
    [null, null, null, null, null, null],

    // ── Parámetros técnicos ───────────────────────────────────────────────
    ['EVALUACIÓN TÉCNICA Y SUSTENTABILIDAD (PARA USO DEL SISTEMA DGDC)', null, null, null, null, null],
    ['PARÁMETRO', 'RESPUESTA (SI / NO)', 'OBSERVACIÓN / EVIDENCIA', null, null, null],
    ['a) ¿Ajusta su oferta a todos los requerimientos y especificaciones técnicas?', 'SI', '', null, null, null],
    ['b) ¿Cuenta con experiencia comprobable en trabajos de similar naturaleza?', 'SI', 'Adjuntar cartas de referencia', null, null, null],
    ['c) ¿Se compromete a cumplir el servicio dentro del plazo ofertado?', 'SI', '', null, null, null],
    ['d) ¿Declara tener certificación/política sustentable o firma Carta Compromiso Sustentable UCT?', 'SI', 'Ej: Carta Compromiso, Certificado de Residuos, Política ISO 14001', null, null, null],
    ['Tipo de evidencia sustentable', 'Carta Compromiso Sustentable UCT', null, null, null, null],
    [null, null, null, null, null, null],

    // ── Declaración jurada ────────────────────────────────────────────────
    ['DECLARACIÓN DEL OFERENTE', null, null, null, null, null],
    ['El suscrito declara que la información contenida en este formulario es veraz y que los precios indicados son netos sin IVA, salvo indicación contraria. Asimismo, declara conocer y aceptar las bases y condiciones de cotización establecidas por la Subdirección de Infraestructura de la Universidad Católica de Temuco.', null, null, null, null, null],
    [null, null, null, null, null, null],
    ['Firma:', '', 'Cargo:', '', 'Fecha:', fechaHoy],
    ['RUT:', '', 'Razón Social:', '', null, null],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  /* ── Fusión de celdas (merges) ─────────────────────────────────────────── */
  ws['!merges'] = [
    // Encabezados institucionales (filas 0-3)
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } },

    // Secciones de datos licitación
    { s: { r: 5, c: 0 }, e: { r: 5, c: 5 } },
    { s: { r: 8, c: 1 }, e: { r: 8, c: 5 } },
    { s: { r: 9, c: 1 }, e: { r: 9, c: 5 } },

    // Sección proveedor
    { s: { r: 11, c: 0 }, e: { r: 11, c: 5 } },
    { s: { r: 12, c: 2 }, e: { r: 12, c: 3 } },
    { s: { r: 12, c: 3 }, e: { r: 12, c: 5 } },

    // Itemizado header
    { s: { r: 17, c: 0 }, e: { r: 17, c: 5 } },

    // Resumen financiero — etiquetas abarcan col 0-3
    { s: { r: 30, c: 0 }, e: { r: 30, c: 3 } },
    { s: { r: 31, c: 0 }, e: { r: 31, c: 3 } },
    { s: { r: 32, c: 0 }, e: { r: 32, c: 3 } },
    { s: { r: 33, c: 0 }, e: { r: 33, c: 3 } },
    { s: { r: 34, c: 0 }, e: { r: 34, c: 3 } },
    { s: { r: 35, c: 0 }, e: { r: 35, c: 3 } },

    // Condiciones
    { s: { r: 37, c: 0 }, e: { r: 37, c: 5 } },

    // Parámetros
    { s: { r: 40, c: 0 }, e: { r: 40, c: 5 } },
    { s: { r: 41, c: 2 }, e: { r: 41, c: 5 } },
    { s: { r: 42, c: 2 }, e: { r: 42, c: 5 } },
    { s: { r: 43, c: 2 }, e: { r: 43, c: 5 } },
    { s: { r: 44, c: 2 }, e: { r: 44, c: 5 } },
    { s: { r: 45, c: 2 }, e: { r: 45, c: 5 } },
    { s: { r: 46, c: 2 }, e: { r: 46, c: 5 } },
    { s: { r: 46, c: 1 }, e: { r: 46, c: 5 } },

    // Declaración
    { s: { r: 48, c: 0 }, e: { r: 48, c: 5 } },
    { s: { r: 49, c: 0 }, e: { r: 49, c: 5 } },
  ];

  /* ── Anchos de columna ─────────────────────────────────────────────────── */
  ws['!cols'] = [
    { wch: 10 },   // A — Ítem
    { wch: 48 },   // B — Descripción
    { wch: 12 },   // C — Unidad
    { wch: 12 },   // D — Cantidad
    { wch: 30 },   // E — Precio Unitario / Etiqueta resumen
    { wch: 22 },   // F — Precio Total / Valor resumen
  ];

  /* ── Alturas de fila destacadas ────────────────────────────────────────── */
  ws['!rows'] = [
    { hpx: 28 }, // 0 — UCT título
    { hpx: 20 }, // 1 — Subdirección
    { hpx: 22 }, // 2 — Formulario estándar
    { hpx: 16 }, // 3 — Código SGC
    { hpx: 8  }, // 4 — espacio
    { hpx: 22 }, // 5 — Sección datos licitación
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Cotización Oficial');

  /* ══════════════════════════════════════════════════════════════════════════
     HOJA 2 — INSTRUCCIONES DETALLADAS PARA EL PROVEEDOR
  ══════════════════════════════════════════════════════════════════════════ */
  const instrData: string[][] = [
    ['INSTRUCCIONES PARA EL PROVEEDOR (OFERENTE)'],
    ['Universidad Católica de Temuco — Subdirección de Infraestructura'],
    [''],
    ['═══════════════════════════════════════════════════════════════════════════'],
    ['SECCIÓN A — DATOS DEL PROVEEDOR'],
    ['───────────────────────────────────────────────────────────────────────────'],
    ['1. Complete todos los campos de identificación: RUT, Razón Social, Contacto y Dirección.'],
    ['2. El RUT debe estar en formato: XX.XXX.XXX-X'],
    [''],
    ['SECCIÓN B — ITEMIZADO DE LA OFERTA'],
    ['───────────────────────────────────────────────────────────────────────────'],
    ['3. Ingrese el Precio Unitario NETO (sin IVA) para cada ítem en la columna E.'],
    ['4. El sistema calculará automáticamente el Precio Total por ítem (Cantidad × P.Unitario).'],
    ['5. Puede modificar, agregar o eliminar ítems según su propuesta.'],
    ['6. Todos los precios deben ser en Pesos Chilenos (CLP).'],
    [''],
    ['SECCIÓN C — RESUMEN FINANCIERO (LLENADO AUTOMÁTICO)'],
    ['───────────────────────────────────────────────────────────────────────────'],
    ['7. SUBTOTAL: suma automática de todos los ítems del itemizado.'],
    ['8. GASTOS GENERALES Y UTILIDADES (%): ingrese el porcentaje que aplica su empresa (puede ser 0%).'],
    ['9. VALOR NETO TOTAL: calculado como Subtotal + Gastos Generales.'],
    ['10. IVA 19%: calculado automáticamente sobre el Valor Neto Total.'],
    ['11. TOTAL OFERTA CON IVA: valor final que debe coincidir con su factura.'],
    [''],
    ['SECCIÓN D — CONDICIONES COMERCIALES'],
    ['───────────────────────────────────────────────────────────────────────────'],
    ['12. Indique el Plazo de Ejecución en días corridos (no hábiles).'],
    ['13. La Validez de la Oferta por defecto es 30 días desde la fecha de cotización.'],
    [''],
    ['SECCIÓN E — EVALUACIÓN TÉCNICA Y SUSTENTABILIDAD'],
    ['───────────────────────────────────────────────────────────────────────────'],
    ['14. Responda SI o NO para cada parámetro de evaluación técnica.'],
    ['15. Si no cuenta con certificación ambiental, debe firmar la Carta Compromiso Sustentable UCT.'],
    ['16. Estos parámetros son parte del sistema de evaluación (Ponderación: Econ. 55%, Tec. 35%, Sust. 10%).'],
    [''],
    ['SECCIÓN F — ENVÍO Y CARGA AL SISTEMA'],
    ['───────────────────────────────────────────────────────────────────────────'],
    ['17. Guarde el archivo con el nombre: Cotizacion_[NombreEmpresa]_[CodigoProyecto].xlsx'],
    [`18. Proyecto activo: ${licitacion?.nombreProyecto || 'Ver indicaciones del funcionario UCT'}`],
    ['19. Suba el archivo al sistema de la Subdirección de Infraestructura UCT.'],
    ['20. Ante consultas, contacte a la Subdirección de Infraestructura.'],
    [''],
    ['═══════════════════════════════════════════════════════════════════════════'],
    ['SISTEMA DE GESTIÓN DE CALIDAD — SUBDIRECCIÓN DE INFRAESTRUCTURA — UCT'],
    [`Documento generado el ${fechaHoy}`],
  ];

  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr['!cols'] = [{ wch: 90 }];
  wsInstr['!rows'] = [{ hpx: 26 }, { hpx: 18 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  /* ══════════════════════════════════════════════════════════════════════════
     HOJA 3 — RESUMEN EJECUTIVO (solo lectura, para el lector de PDF)
  ══════════════════════════════════════════════════════════════════════════ */
  const resumenData: (string | null)[][] = [
    ['RESUMEN EJECUTIVO DE OFERTA'],
    ['Complete este resumen luego de llenar el itemizado. Este resumen es para uso del evaluador.'],
    [null],
    ['Proyecto', licitacion?.nombreProyecto || ''],
    ['Código', codigoProyecto],
    ['Fecha', fechaHoy],
    [null],
    ['PROVEEDOR', 'RUT', 'MONTO NETO ($)', 'IVA ($)', 'TOTAL CON IVA ($)', 'PLAZO (DÍAS)'],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
  ];

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
  wsResumen['!cols'] = [
    { wch: 35 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
  ];
  wsResumen['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Ejecutivo');

  /* ── Exportar archivo ──────────────────────────────────────────────────── */
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const nombreArchivo = `Formato_Cotizacion_${codigoProyecto}_UCT.xlsx`;
  saveAs(blob, nombreArchivo);
}
