// ─── EXPORTACIÓN DE ESPECIFICACIONES TÉCNICAS (Word) ─────────────────────────
// Documento técnico formal para licitación: portada institucional con la ficha del proyecto,
// índice, Generalidades, un capítulo por fase del itemizado con una sección por partida (unidad y
// cantidad referencial + especificación), disposiciones finales, anexo con el resumen de partidas
// (sin precios: las EETT van a los oferentes) y bloque de firmas. Los títulos usan los estilos
// "Título 1/2" de Word, así el usuario puede insertar una tabla de contenido con N° de página y
// navegar el documento desde el panel de navegación.

import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageBreak,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
  convertInchesToTwip,
} from 'docx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { ProyectoMaestro, ItemItemizadoProyecto, ConfiguracionFirmas } from '../types';
import { FUENTE_DOCUMENTO_LEGAL as FUENTE, obtenerLogoUCTBuffer } from './docxGenerator';
import { agruparPorFase } from '../utils/itemizadoOrganizer';
import { obtenerCampusPorSigla, obtenerInfoEdificio } from '../data/campusData';

const AZUL = '1A365D';
const GRIS = '475569';
const GRIS_CLARO = 'CBD5E1';
const FONDO_ETIQUETA = 'EEF2F7';

export interface DatosExportacionEETT {
  proyecto: ProyectoMaestro;
  partidas: ItemItemizadoProyecto[];
  especificaciones: Record<string, string>;
  generalidades: string;
  estado: 'Borrador' | 'Aprobada';
  version: number;
  configFirmas?: ConfiguracionFirmas;
}

// ── Utilidades de formato ──────────────────────────────────────────────────

const texto = (t: string, opciones: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text: t, font: FUENTE, size: opciones.size ?? 21, bold: opciones.bold, italics: opciones.italics, color: opciones.color });

const parrafo = (hijos: TextRun[], opciones: { alineacion?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; despues?: number } = {}) =>
  new Paragraph({
    alignment: opciones.alineacion ?? AlignmentType.JUSTIFIED,
    spacing: { before: opciones.antes ?? 0, after: opciones.despues ?? 140, line: 288 },
    children: hijos,
  });

/**
 * Convierte el texto de una especificación en párrafos. Si una línea parte con un rótulo en
 * mayúsculas seguido de dos puntos ("ALCANCE: …", "MATERIALES: …") el rótulo va en negrita.
 */
function parrafosDeTexto(contenido: string): Paragraph[] {
  return contenido
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(linea => {
      const m = linea.match(/^([A-ZÁÉÍÓÚÑ0-9 ,/().-]{3,60}):\s*(.*)$/);
      if (m) return parrafo([texto(`${m[1]}: `, { bold: true, color: AZUL }), texto(m[2])]);
      const vineta = linea.match(/^[-•·]\s+(.*)$/);
      if (vineta) {
        return new Paragraph({
          bullet: { level: 0 },
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 80, line: 288 },
          children: [texto(vineta[1])],
        });
      }
      return parrafo([texto(linea)]);
    });
}

const bordeTabla = { style: BorderStyle.SINGLE, size: 4, color: GRIS_CLARO };
const bordesCelda = { top: bordeTabla, bottom: bordeTabla, left: bordeTabla, right: bordeTabla };

function celda(contenido: string, opciones: { etiqueta?: boolean; ancho?: number; alineacion?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; encabezado?: boolean } = {}) {
  return new TableCell({
    borders: bordesCelda,
    width: opciones.ancho ? { size: opciones.ancho, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: opciones.encabezado
      ? { type: ShadingType.CLEAR, fill: AZUL, color: 'auto' }
      : opciones.etiqueta ? { type: ShadingType.CLEAR, fill: FONDO_ETIQUETA, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opciones.alineacion ?? AlignmentType.LEFT,
        children: [texto(contenido, {
          size: 18,
          bold: opciones.bold || opciones.etiqueta || opciones.encabezado,
          color: opciones.encabezado ? 'FFFFFF' : opciones.etiqueta ? AZUL : undefined,
        })],
      }),
    ],
  });
}

/** Tabla de dos columnas "Etiqueta | Valor" (ficha del proyecto en la portada). */
function tablaFicha(filas: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: filas.map(([etiqueta, valor]) => new TableRow({
      children: [celda(etiqueta, { etiqueta: true, ancho: 32 }), celda(valor || '—', { ancho: 68 })],
    })),
  });
}

const titulo1 = (t: string) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  pageBreakBefore: false,
  spacing: { before: 360, after: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL, space: 4 } },
  children: [new TextRun({ text: t.toUpperCase(), font: FUENTE, size: 26, bold: true, color: AZUL })],
});

const titulo2 = (t: string) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  keepNext: true,
  spacing: { before: 240, after: 80 },
  children: [new TextRun({ text: t, font: FUENTE, size: 22, bold: true, color: '0F172A' })],
});

const fechaLarga = (d = new Date()) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

const formatoCantidad = (n: number) => n ? n.toLocaleString('es-CL', { maximumFractionDigits: 2 }) : '—';

// ── Documento ──────────────────────────────────────────────────────────────

export async function generarEETTWord(datos: DatosExportacionEETT): Promise<void> {
  const { proyecto, partidas, especificaciones, generalidades, estado, version, configFirmas } = datos;
  const logo = await obtenerLogoUCTBuffer();
  const grupos = agruparPorFase(partidas);
  const campus = proyecto.campusSigla ? obtenerCampusPorSigla(proyecto.campusSigla) : undefined;
  const edificio = obtenerInfoEdificio(proyecto.edificioSigla);
  const codigo = proyecto.codigoProyecto || proyecto.id;

  // Capítulos: 1 Generalidades, 2..n fases, n+1 Disposiciones finales.
  const capitulos = [
    'Generalidades',
    ...grupos.map(g => g.fase),
    'Disposiciones finales',
  ];

  // ── Portada ──
  const portada: (Paragraph | Table)[] = [
    ...(logo ? [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
      children: [new ImageRun({ type: 'png', data: logo.slice(0), transformation: { width: 230, height: 79 } })],
    })] : []),
    // Sin logo disponible se escribe el nombre de la Universidad (el logo ya lo incluye).
    ...(logo ? [] : [parrafo([texto('UNIVERSIDAD CATÓLICA DE TEMUCO', { bold: true, size: 24, color: AZUL })], { alineacion: AlignmentType.CENTER, despues: 40 })]),
    parrafo([texto('Dirección de Gestión y Desarrollo de Campus · Subdirección de Infraestructura', { size: 18, color: GRIS })], { alineacion: AlignmentType.CENTER, despues: 700 }),
    // Franja institucional con el título del documento
    new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.CLEAR, fill: AZUL, color: 'auto' },
      spacing: { before: 0, after: 0 },
      border: { top: { style: BorderStyle.SINGLE, size: 24, color: AZUL, space: 10 }, bottom: { style: BorderStyle.SINGLE, size: 24, color: AZUL, space: 10 } },
      children: [new TextRun({ text: 'ESPECIFICACIONES TÉCNICAS', font: FUENTE, size: 40, bold: true, color: 'FFFFFF' })],
    }),
    parrafo([], { despues: 240 }),
    parrafo([texto(proyecto.nombre, { bold: true, size: 30 })], { alineacion: AlignmentType.CENTER, despues: 120 }),
    parrafo([texto(
      [edificio?.nombre ? `${proyecto.edificioSigla} · ${edificio.nombre}` : proyecto.edificioSigla, campus?.nombre, campus?.ciudad].filter(Boolean).join(' — '),
      { size: 20, color: GRIS },
    )], { alineacion: AlignmentType.CENTER, despues: 500 }),
    tablaFicha([
      ['Código del proyecto', codigo],
      ['Centro de costo (CP)', proyecto.codigoCP || ''],
      ['Mandante', 'Universidad Católica de Temuco'],
      ['Ubicación', [campus?.nombre, campus?.direccion, campus?.ciudad].filter(Boolean).join(', ')],
      ['Edificio', [proyecto.edificioSigla, edificio?.nombre, edificio?.facultad].filter(Boolean).join(' · ')],
      ...(edificio?.superficieM2 ? [['Superficie del edificio', `${edificio.superficieM2.toLocaleString('es-CL')} m²`] as [string, string]] : []),
      ['Tipo de obra', proyecto.tipoObra || ''],
      ['Especialidad (rubro)', proyecto.rubro || ''],
      ['Modalidad de contrato', proyecto.modalidadContrato || ''],
      ['Responsable del proyecto', [proyecto.responsableNombre, proyecto.responsableEmail].filter(Boolean).join(' · ')],
      ['Partidas especificadas', `${partidas.length}`],
      ['Versión', `${version} · ${fechaLarga()}`],
    ]),
    parrafo([], { despues: 300 }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.CLEAR, fill: estado === 'Aprobada' ? 'DCFCE7' : 'FEF3C7', color: 'auto' },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: estado === 'Aprobada' ? '15803D' : 'B45309', space: 6 },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: estado === 'Aprobada' ? '15803D' : 'B45309', space: 6 },
      },
      children: [new TextRun({
        text: estado === 'Aprobada' ? 'DOCUMENTO APROBADO' : 'BORRADOR — NO VÁLIDO PARA LICITAR HASTA SU APROBACIÓN',
        font: FUENTE, size: 18, bold: true, color: estado === 'Aprobada' ? '15803D' : 'B45309',
      })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  // ── Índice ──
  const indice: Paragraph[] = [
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL, space: 4 } },
      children: [new TextRun({ text: 'CONTENIDO', font: FUENTE, size: 26, bold: true, color: AZUL })],
    }),
    ...capitulos.map((c, i) => parrafo([texto(`${i + 1}.  `, { bold: true, color: AZUL }), texto(c.toUpperCase())], { alineacion: AlignmentType.LEFT, despues: 80 })),
    parrafo([texto(`${capitulos.length + 1}.  `, { bold: true, color: AZUL }), texto('ANEXO: RESUMEN DE PARTIDAS')], { alineacion: AlignmentType.LEFT, despues: 80 }),
    parrafo([texto('Para insertar el índice con números de página: en Word, Referencias → Tabla de contenido.', { italics: true, size: 16, color: GRIS })], { alineacion: AlignmentType.LEFT, antes: 200 }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  // ── 1. Generalidades ──
  const cuerpo: (Paragraph | Table)[] = [
    titulo1('1. Generalidades'),
    ...(proyecto.descripcion?.trim()
      ? [titulo2('1.1  Descripción del proyecto'), ...parrafosDeTexto(proyecto.descripcion), titulo2('1.2  Condiciones generales')]
      : []),
    ...(generalidades.trim()
      ? parrafosDeTexto(generalidades)
      : [parrafo([texto('Generalidades pendientes de redactar.', { italics: true, color: GRIS })])]),
  ];

  // ── 2..n. Una sección por fase, una subsección por partida ──
  grupos.forEach((grupo, gi) => {
    const nCap = gi + 2;
    cuerpo.push(titulo1(`${nCap}. ${grupo.fase}`));
    grupo.items.forEach((p, pi) => {
      const numero = `${nCap}.${pi + 1}`;
      cuerpo.push(titulo2(`${numero}  ${p.descripcion || 'Partida sin descripción'}`));
      cuerpo.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({
          children: [
            celda('Ítem', { etiqueta: true, ancho: 12 }),
            celda(p.item || '—', { ancho: 14, alineacion: AlignmentType.CENTER }),
            celda('Unidad', { etiqueta: true, ancho: 14 }),
            celda(p.unidad || '—', { ancho: 16, alineacion: AlignmentType.CENTER }),
            celda('Cantidad ref.', { etiqueta: true, ancho: 22 }),
            celda(formatoCantidad(p.cantidad), { ancho: 22, alineacion: AlignmentType.CENTER }),
          ],
        })],
      }));
      cuerpo.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
      const esp = especificaciones[p.id];
      cuerpo.push(...(esp?.trim()
        ? parrafosDeTexto(esp)
        : [parrafo([texto('Especificación pendiente.', { italics: true, color: 'B45309' })])]));
    });
  });

  // ── Disposiciones finales ──
  const nFinal = grupos.length + 2;
  cuerpo.push(titulo1(`${nFinal}. Disposiciones finales`));
  cuerpo.push(...parrafosDeTexto([
    'PRELACIÓN DE DOCUMENTOS: En caso de discrepancia entre los antecedentes de la licitación, prevalecerán en el siguiente orden: Bases Administrativas, las presentes Especificaciones Técnicas, los planos y, finalmente, el itemizado. Toda discrepancia u omisión deberá ser consultada durante el período de consultas o, durante la obra, a la Inspección Técnica de Obra (ITO), cuya resolución será obligatoria.',
    'CANTIDADES: Las cantidades indicadas son referenciales. El oferente deberá verificarlas en la visita a terreno y en los planos; su oferta se entenderá comprensiva de la totalidad de los trabajos necesarios para la correcta ejecución y funcionamiento de las obras especificadas.',
    'MATERIALES: Todos los materiales serán nuevos y de primera calidad. Cuando se indique una marca o modelo, se entiende como referencia de calidad "o equivalente técnico", sujeto a aprobación previa y por escrito de la ITO.',
    'NORMATIVA: Las obras se ejecutarán conforme a la Ley General de Urbanismo y Construcciones y su Ordenanza, las Normas Chilenas aplicables, la normativa SEC cuando existan instalaciones, la Ley N°16.744 y el D.S. N°594/2000 del MINSAL, y el reglamento interno de la Universidad para trabajos en sus recintos.',
    'RECEPCIÓN: Al término de los trabajos, el contratista entregará la obra limpia, sin escombros y en funcionamiento, junto con los certificados, garantías de fabricantes y documentación que correspondan, para su recepción por la ITO.',
  ].join('\n')));

  // ── Anexo: resumen de partidas (sin precios) ──
  cuerpo.push(titulo1(`${nFinal + 1}. Anexo: resumen de partidas`));
  cuerpo.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          celda('Ítem', { encabezado: true, ancho: 10, alineacion: AlignmentType.CENTER }),
          celda('Descripción', { encabezado: true, ancho: 60 }),
          celda('Unidad', { encabezado: true, ancho: 12, alineacion: AlignmentType.CENTER }),
          celda('Cantidad', { encabezado: true, ancho: 18, alineacion: AlignmentType.RIGHT }),
        ],
      }),
      ...grupos.flatMap(g => [
        new TableRow({
          children: [new TableCell({
            columnSpan: 4,
            borders: bordesCelda,
            shading: { type: ShadingType.CLEAR, fill: FONDO_ETIQUETA, color: 'auto' },
            margins: { top: 50, bottom: 50, left: 100, right: 100 },
            children: [new Paragraph({ children: [texto(g.fase.toUpperCase(), { bold: true, size: 17, color: AZUL })] })],
          })],
        }),
        ...g.items.map(p => new TableRow({
          children: [
            celda(p.item || '—', { alineacion: AlignmentType.CENTER }),
            celda(p.descripcion || '—'),
            celda(p.unidad || '—', { alineacion: AlignmentType.CENTER }),
            celda(formatoCantidad(p.cantidad), { alineacion: AlignmentType.RIGHT }),
          ],
        })),
      ]),
    ],
  }));

  // ── Firmas ──
  const firmantes: { rol: string; nombre: string; cargo: string }[] = [
    { rol: 'Elaborado por', nombre: proyecto.responsableNombre || '', cargo: 'Responsable del proyecto' },
    ...(configFirmas?.subdirectorInfraestructura?.nombre ? [{ rol: 'Revisado por', nombre: configFirmas.subdirectorInfraestructura.nombre, cargo: configFirmas.subdirectorInfraestructura.cargo }] : []),
    ...(configFirmas?.directorGestionCampus?.nombre ? [{ rol: 'Aprobado por', nombre: configFirmas.directorGestionCampus.nombre, cargo: configFirmas.directorGestionCampus.cargo }] : []),
  ];
  const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  cuerpo.push(new Paragraph({
    keepNext: true,
    spacing: { before: 480, after: 0 },
    children: [texto('FIRMAS', { bold: true, size: 18, color: AZUL })],
  }));
  cuerpo.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde, insideHorizontal: sinBorde, insideVertical: sinBorde },
    rows: [new TableRow({
      cantSplit: true,
      children: firmantes.map(f => new TableCell({
        borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
        margins: { left: 120, right: 120 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            spacing: { before: 700 },
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: AZUL, space: 4 } },
            children: [texto(f.nombre || '____________________', { bold: true, size: 18 })],
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [texto(f.cargo, { size: 16, color: GRIS })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [texto(f.rol, { size: 15, italics: true, color: GRIS })] }),
        ],
      })),
    })],
  }));

  // ── Encabezado y pie del cuerpo ──
  const encabezado = new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GRIS_CLARO, space: 4 } },
      children: [
        ...(logo ? [new ImageRun({ type: 'png', data: logo.slice(0), transformation: { width: 70, height: 24 } }), new TextRun({ text: '   ', font: FUENTE })] : []),
        new TextRun({ text: `Especificaciones Técnicas · ${proyecto.nombre}`, font: FUENTE, size: 15, color: GRIS }),
      ],
    })],
  });
  const pie = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: GRIS_CLARO, space: 4 } },
      children: [
        new TextRun({ text: `${codigo} · Versión ${version}${estado === 'Aprobada' ? '' : ' (borrador)'} · Página `, font: FUENTE, size: 15, color: GRIS }),
        new TextRun({ children: [PageNumber.CURRENT], font: FUENTE, size: 15, color: GRIS }),
        new TextRun({ text: ' de ', font: FUENTE, size: 15, color: GRIS }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FUENTE, size: 15, color: GRIS }),
      ],
    })],
  });

  const margenes = { top: convertInchesToTwip(1), bottom: convertInchesToTwip(0.9), left: convertInchesToTwip(1.1), right: convertInchesToTwip(1) };
  const doc = new Document({
    creator: 'Subdirección de Infraestructura UCT',
    title: `Especificaciones Técnicas — ${proyecto.nombre}`,
    description: `EETT ${codigo}`,
    styles: {
      default: { document: { run: { font: FUENTE, size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FUENTE, size: 26, bold: true, color: AZUL } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FUENTE, size: 22, bold: true, color: '0F172A' } },
      ],
    },
    sections: [
      { properties: { page: { margin: margenes } }, children: [...portada, ...indice] },
      { properties: { page: { margin: margenes } }, headers: { default: encabezado }, footers: { default: pie }, children: cuerpo },
    ],
  });

  const blob = await corregirIdsDeImagenes(await Packer.toBlob(doc));
  saveAs(blob, `EETT_${codigo}_v${version}${estado === 'Aprobada' ? '' : '_borrador'}.docx`);
}

/**
 * La librería `docx` numera cada imagen con el mismo id interno (wp:docPr id="1") en el cuerpo y en
 * el encabezado; Word descarta una de las dos (quedaba la portada sin logo). Se renumeran para que
 * cada imagen del documento tenga un id único.
 */
async function corregirIdsDeImagenes(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  let siguiente = 1000;
  const partes = Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  for (const nombre of partes) {
    const xml = await zip.file(nombre)!.async('string');
    const corregido = xml.replace(/<wp:docPr id="\d+"/g, () => `<wp:docPr id="${siguiente++}"`);
    if (corregido !== xml) zip.file(nombre, corregido);
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
