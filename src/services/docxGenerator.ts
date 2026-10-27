import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  convertInchesToTwip,
} from 'docx';
import { saveAs } from 'file-saver';

export const FUENTE_DOCUMENTO_LEGAL = 'Georgia';

/** Trae el isotipo institucional para el membrete de los documentos Word. Si no está disponible
 * (fetch falla, entorno sin red), retorna null y el documento se genera sin logo, sin bloquear. */
export async function obtenerLogoUCTBuffer(): Promise<ArrayBuffer | null> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}logo-uct.png`);
    if (!resp.ok) return null;
    return await resp.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Exporta un documento genérico de secciones (título + contenido) a Word, en
 * un formato profesional de documento legal/institucional: membrete
 * institucional, márgenes amplios, tipografía serif, texto justificado,
 * interlineado 1.15 y numeración de página. Reutilizado por Bases
 * Administrativas y Técnicas y por el Contrato de Adjudicación, que
 * comparten la misma estructura de "lista de cláusulas/secciones con texto".
 */
export async function generarDocumentoSeccionesWord(opciones: {
  tituloDocumento: string;
  subtitulo?: string;
  lineaCodigos?: string;
  institucion?: string;
  subdireccion?: string;
  secciones: { titulo: string; contenido: string }[];
  firmantes?: { nombre: string; cargo: string }[];
  nombreArchivo: string;
}) {
  const {
    tituloDocumento,
    subtitulo,
    lineaCodigos,
    institucion = 'Universidad Católica de Temuco',
    subdireccion = 'Subdirección de Infraestructura · Dirección de Gestión y Desarrollo de Campus',
    secciones,
    firmantes,
    nombreArchivo,
  } = opciones;

  // Los saltos de línea ("\n") del contenido no se ven solos en Word: hay que partir el texto y
  // marcar cada línea siguiente con `break`, si no todo el párrafo queda pegado en una sola línea.
  const parrafoJustificado = (texto: string) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 276 },
      children: texto.split('\n').map((linea, i) =>
        new TextRun({ text: linea, size: 22, font: FUENTE_DOCUMENTO_LEGAL, break: i > 0 ? 1 : undefined })
      ),
    });

  const logoBuffer = await obtenerLogoUCTBuffer();

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1.25),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              ...(logoBuffer
                ? [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 60 },
                    children: [new ImageRun({ type: 'png', data: logoBuffer, transformation: { width: 140, height: 48 } })],
                  })]
                : []),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1A365D', space: 4 } },
                spacing: { after: 100 },
                children: [
                  new TextRun({ text: institucion.toUpperCase(), bold: true, size: 18, font: FUENTE_DOCUMENTO_LEGAL, color: '1A365D' }),
                  new TextRun({ text: subdireccion, size: 15, font: FUENTE_DOCUMENTO_LEGAL, color: '475569', break: 1 }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Página ', size: 16, font: FUENTE_DOCUMENTO_LEGAL, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FUENTE_DOCUMENTO_LEGAL, color: '64748B' }),
                  new TextRun({ text: ' de ', size: 16, font: FUENTE_DOCUMENTO_LEGAL, color: '64748B' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: FUENTE_DOCUMENTO_LEGAL, color: '64748B' }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 80 },
            children: [new TextRun({ text: tituloDocumento.toUpperCase(), bold: true, size: 30, font: FUENTE_DOCUMENTO_LEGAL })],
          }),
          ...(subtitulo ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: subtitulo, bold: true, size: 22, font: FUENTE_DOCUMENTO_LEGAL })] })] : []),
          ...(lineaCodigos ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: lineaCodigos, italics: true, size: 18, font: FUENTE_DOCUMENTO_LEGAL, color: '475569' })] })] : []),
          ...secciones.flatMap(s => [
            new Paragraph({
              spacing: { before: 200, after: 100 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1', space: 2 } },
              children: [new TextRun({ text: s.titulo.toUpperCase(), bold: true, size: 22, font: FUENTE_DOCUMENTO_LEGAL, color: '1A365D' })],
            }),
            parrafoJustificado(s.contenido),
          ]),
          ...(firmantes && firmantes.length > 0
            ? [
                new Paragraph({ text: '', spacing: { before: 400 } }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  },
                  rows: [
                    new TableRow({
                      children: firmantes.map(f => new TableCell({
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            border: { top: { style: BorderStyle.SINGLE, size: 6, color: '1A365D', space: 4 } },
                            spacing: { before: 500 },
                            children: [
                              new TextRun({ text: `${f.nombre}`, bold: true, size: 20, font: FUENTE_DOCUMENTO_LEGAL }),
                              new TextRun({ text: `\n${f.cargo}`, size: 18, font: FUENTE_DOCUMENTO_LEGAL, color: '475569' }),
                            ],
                          }),
                        ],
                      })),
                    }),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, nombreArchivo);
}
