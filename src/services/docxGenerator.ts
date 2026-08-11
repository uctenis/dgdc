import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
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
                text: 'CUADRO COMPARATIVO Y ACTA DE ADJUDICACIÓN (SGC PS-FOR-DGDC0003)\n',
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
            children: [new TextRun({ text: 'CONSIDERACIONES DE EVALUACIÓN SGC:', bold: true, size: 18 })],
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
  const fileName = `SGC_Cuadro_Comparativo_y_Acta_${licitacion.codigoCP}_${licitacion.codigoProyecto}.docx`;
  saveAs(blob, fileName);
}
