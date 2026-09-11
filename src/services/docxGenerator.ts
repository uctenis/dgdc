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
import type { LicitacionProyecto, Cotizacion, EvaluacionResultado, ConfiguracionFirmas } from '../types';
import { formatoMonedaCLP } from './evaluationEngine';
import { normalizarNombreProyecto } from '../utils/spellCorrector';

export async function generarDocumentoCuadroComparativoActa(
  licitacion: LicitacionProyecto,
  _cotizaciones: Cotizacion[],
  evaluaciones: EvaluacionResultado[],
  configFirmas: ConfiguracionFirmas
) {
  // Ordenar evaluaciones por ranking
  const evaluacionesOrdenadas = [...evaluaciones].sort((a, b) => a.ranking - b.ranking);
  const adjudicado = evaluacionesOrdenadas.find(e => e.esPropuestaAdjudicada) || evaluacionesOrdenadas[0];

  const requiereVicerrector = (adjudicado?.montoTotal || 0) > 500001;

  // Crear la tabla del Cuadro Comparativo
  const headerCells = [
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Aspecto a evaluar', bold: true, size: 20 })] })],
      width: { size: 25, type: WidthType.PERCENTAGE },
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Medio de verificación', bold: true, size: 20 })] })],
      width: { size: 20, type: WidthType.PERCENTAGE },
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Ponderación', bold: true, size: 20 })] })],
      width: { size: 15, type: WidthType.PERCENTAGE },
    }),
  ];

  evaluacionesOrdenadas.forEach((ev, idx) => {
    headerCells.push(
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `Proveedor ${idx + 1}`, bold: true, size: 18 }),
              new Paragraph({ children: [new TextRun({ text: ev.proveedorNombre, size: 16 })] }),
              new Paragraph({ children: [new TextRun({ text: `Pje. | Valor`, size: 14, italics: true })] }),
            ],
          }),
        ],
        width: { size: 40 / evaluacionesOrdenadas.length, type: WidthType.PERCENTAGE },
      })
    );
  });

  // Fila Económica
  const filaEconomicaCells = [
    new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: 'Oferta económica\n', bold: true, size: 18 }),
            new TextRun({
              text: 'El oferente que proponga el menor precio con impuestos incluidos.',
              size: 16,
            }),
          ],
        }),
      ],
    }),
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Cotización', size: 16 })] })] }),
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '55%', bold: true, size: 18 })] })] }),
  ];

  evaluacionesOrdenadas.forEach(ev => {
    filaEconomicaCells.push(
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${ev.puntajeEconomico.toFixed(1)} pts (${ev.puntajeEconomicoPonderado.toFixed(2)})\n${formatoMonedaCLP(ev.montoTotal)}`,
                size: 16,
              }),
            ],
          }),
        ],
      })
    );
  });

  // Fila Técnica
  const filaTecnicaCells = [
    new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: 'Oferta técnica\n', bold: true, size: 18 }),
            new TextRun({
              text: 'a) Ajuste a requerimientos b) Experiencia c) Cumplimiento de plazo',
              size: 16,
            }),
          ],
        }),
      ],
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Cartas de referencia y cotización', size: 16 })] })],
    }),
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '35%', bold: true, size: 18 })] })] }),
  ];

  evaluacionesOrdenadas.forEach(ev => {
    filaTecnicaCells.push(
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${ev.puntajeTecnico.toFixed(0)} pts (${ev.puntajeTecnicoPonderado.toFixed(2)})\n${ev.plazoDias} días`,
                size: 16,
              }),
            ],
          }),
        ],
      })
    );
  });

  // Fila Sustentabilidad
  const filaSustentabilidadCells = [
    new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: 'Sustentabilidad\n', bold: true, size: 18 }),
            new TextRun({
              text: 'a) Declara/compromete prácticas sustentables b) No declara',
              size: 16,
            }),
          ],
        }),
      ],
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'Carta Compromiso / Certificado', size: 16 })] })],
    }),
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '10%', bold: true, size: 18 })] })] }),
  ];

  evaluacionesOrdenadas.forEach(ev => {
    filaSustentabilidadCells.push(
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${ev.puntajeSustentabilidad.toFixed(0)} pts (${ev.puntajeSustentabilidadPonderado.toFixed(2)})`,
                size: 16,
              }),
            ],
          }),
        ],
      })
    );
  });

  // Fila TOTALES
  const filaTotalesCells = [
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'PUNTAJE TOTAL DE PROVEEDOR', bold: true, size: 18 })],
        }),
      ],
    }),
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Sumatoria Ponderada', size: 16 })] })] }),
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '100%', bold: true, size: 18 })] })] }),
  ];

  evaluacionesOrdenadas.forEach(ev => {
    filaTotalesCells.push(
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${ev.puntajeTotalPonderado.toFixed(2)} pts\n(Ranking #${ev.ranking})`,
                bold: true,
                size: 18,
                color: ev.esPropuestaAdjudicada ? '006622' : '333333',
              }),
            ],
          }),
        ],
      })
    );
  });

  // Crear Documento Word
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${configFirmas.institucion.toUpperCase()}\n${configFirmas.subdireccion.toUpperCase()}\n`,
                bold: true,
                size: 20,
              }),
              new TextRun({
                text: 'CUADRO COMPARATIVO Y ACTA DE ADJUDICACIÓN (PS-FOR-DGDC0003)\n',
                bold: true,
                size: 24,
                color: '1A365D',
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: `CP: ${licitacion.codigoCP}   OP: ${licitacion.codigoOP}   OT: ${licitacion.codigoOT}   Fecha: ${licitacion.fechaEvaluacion}\n`, bold: true, size: 18 }),
              new TextRun({ text: `PROYECTO: ${licitacion.codigoProyecto} - ${normalizarNombreProyecto(licitacion.nombreProyecto)}\n`, bold: true, size: 20 }),
              new TextRun({ text: `DESCRIPCIÓN: ${licitacion.descripcion}\n`, size: 18 }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: '1. CUADRO COMPARATIVO DE OFERTAS', bold: true, size: 22, color: '1A365D' })],
          }),
          new Paragraph({ text: '' }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: headerCells }),
              new TableRow({ children: filaEconomicaCells }),
              new TableRow({ children: filaTecnicaCells }),
              new TableRow({ children: filaSustentabilidadCells }),
              new TableRow({ children: filaTotalesCells }),
            ],
          }),

          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: '2. ACTA DE ADJUDICACIÓN', bold: true, size: 22, color: '1A365D' })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `(Completar sólo en el caso de compras superiores a $800.001 CLP)\n`,
                italics: true,
                size: 16,
              }),
              new TextRun({
                text: `Según análisis comparativo basado en cotizaciones adjuntas, entre las propuestas recibidas todas responden a los requisitos técnicos de obras, por tanto se adjudica la oferta correspondiente a `,
                size: 18,
              }),
              new TextRun({
                text: `${formatoMonedaCLP(adjudicado?.montoTotal || 0)} IVA incluido`,
                bold: true,
                size: 18,
              }),
              new TextRun({
                text: `, a la empresa `,
                size: 18,
              }),
              new TextRun({
                text: `${adjudicado?.proveedorNombre || 'N/A'} (RUT ${adjudicado?.proveedorRut || 'N/A'}).`,
                bold: true,
                size: 18,
              }),
            ],
          }),

          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: 'EVALUADORES DE LAS OFERTAS:', bold: true, size: 18 })],
          }),
          new Paragraph({ text: '' }),

          // Tabla Firmas Evaluadores
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: `\n\n_______________________\n`, bold: true }),
                          new TextRun({ text: `${configFirmas.directorGestionCampus.nombre}\n`, bold: true, size: 18 }),
                          new TextRun({ text: `${configFirmas.directorGestionCampus.cargo}`, size: 16 }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: `\n\n_______________________\n`, bold: true }),
                          new TextRun({ text: `${configFirmas.subdirectorInfraestructura.nombre}\n`, bold: true, size: 18 }),
                          new TextRun({ text: `${configFirmas.subdirectorInfraestructura.cargo}`, size: 16 }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: `\n\n_______________________\n`, bold: true }),
                          new TextRun({ text: `${configFirmas.responsableDesarrollo.nombre}\n`, bold: true, size: 18 }),
                          new TextRun({ text: `${configFirmas.responsableDesarrollo.cargo}`, size: 16 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // Sección Aprueba (para > $5.000.001 CLP)
          ...(requiereVicerrector
            ? [
                new Paragraph({ text: '' }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'APRUEBA CUADRO COMPARATIVO Y ACTA DE ADJUDICACIÓN (Requerido para compras superiores a $5.000.001 CLP):',
                      bold: true,
                      size: 18,
                    }),
                  ],
                }),
                new Paragraph({ text: '' }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: `\n\n_________________________________________\n`, bold: true }),
                    new TextRun({ text: `${configFirmas.vicerrectorAdministracion.nombre}\n`, bold: true, size: 18 }),
                    new TextRun({ text: `${configFirmas.vicerrectorAdministracion.cargo}`, size: 16 }),
                  ],
                }),
              ]
            : []),

          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: 'CONSIDERACIONES DE EVALUACIÓN:', bold: true, size: 18 })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `• Oferta Económica (55%): Menor oferta = 100 pts. Otras = (Precio Menor / Precio Evaluado) x 100.\n` +
                  `• Oferta Técnica (35%): 3 ítems acreditados = 100 pts, 2 ítems = 60 pts, 1 ítem = 40 pts, 0 ítems = 0 pts.\n` +
                  `• Sustentabilidad (10%): Declara/compromete prácticas sustentables = 100 pts, No declara = 0 pts.`,
                size: 16,
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `Cuadro_Comparativo_y_Acta_${licitacion.codigoCP}_${licitacion.codigoProyecto}.docx`;
  saveAs(blob, fileName);
}

const FUENTE_DOCUMENTO_LEGAL = 'Georgia';

/** Trae el isotipo institucional para el membrete de los documentos Word. Si no está disponible
 * (fetch falla, entorno sin red), retorna null y el documento se genera sin logo, sin bloquear. */
async function obtenerLogoUCTBuffer(): Promise<ArrayBuffer | null> {
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
