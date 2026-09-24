import type { SeccionBases, PoliticaGarantias } from './basesTemplateData';
import { sugerirPoliticaGarantias } from './basesTemplateData';

/** Sección de contrato. `tabla` se usa en el Anexo N°1 (Presupuesto Oficial): filas de la oferta adjudicada. */
export interface SeccionContrato extends SeccionBases {
  tabla?: string[][];
}

/**
 * Umbral desde el cual una licitación adjudicada requiere un Contrato formal
 * bilateral (además de la Orden de Compra). Bajo este monto, la OC es
 * suficiente respaldo administrativo. Corresponde al último tramo de la
 * Resolución VRAE 02/2014 (Anexo 1: Tabla de exigencias según monto de
 * compra) — "$25.000.001 y superior" exige Licitación (Privada o Pública)
 * con Contrato, además de la Orden de Compra. Entre $5.000.001 y $25.000.000
 * solo se exige V°B° VRAE (ver `umbralAprobacionVrae`), NO contrato formal.
 */
export const UMBRAL_CONTRATO_FORMAL = 25000001;

export function requiereContratoFormal(montoAdjudicado: number, umbral: number = UMBRAL_CONTRATO_FORMAL): boolean {
  return montoAdjudicado >= umbral;
}

/**
 * Umbral desde el cual el Presupuesto Estimado de un proyecto EXIGE una Licitación formal
 * (invitación + portal de proveedores, mínimo 3 invitados). Es el mismo valor por defecto de
 * `ParametrosLicitacionSGC.umbralAprobacionVrae` (ver `types/index.ts` e `initialData.ts`) —
 * se duplica aquí como respaldo por si la configuración institucional no lo trae.
 */
export const UMBRAL_LICITACION_OBLIGATORIA = 5000001;

/**
 * Bajo `UMBRAL_LICITACION_OBLIGATORIA`, el proyecto puede tramitarse como "Comparación de
 * Precios" (proceso simplificado): ofertas recibidas directamente por correo u otro medio,
 * con un mínimo de 1 oferta para adjudicar en vez de las 3 que exige una Licitación formal.
 * No es exclusivo: en ese rango también se puede optar por invitar formalmente por el
 * sistema si se prefiere — es una alternativa disponible, no la única. Desde ese umbral
 * hacia arriba, la Licitación formal pasa a ser obligatoria. Se evalúa sobre el Presupuesto
 * Estimado (antes de tener ofertas), a diferencia de `requiereContratoFormal`, que se evalúa
 * sobre el monto ya adjudicado y usa un umbral distinto y más alto (`UMBRAL_CONTRATO_FORMAL`):
 * una Licitación puede ser obligatoria sin que además se exija Contrato formal bilateral.
 */
export function esProcesoSimplificado(montoEstimado: number, umbral: number = UMBRAL_LICITACION_OBLIGATORIA): boolean {
  return montoEstimado < umbral;
}

/**
 * Valores numéricos del contrato en UN solo lugar (tomados del contrato modelo IGECE-UCT, marzo 2026).
 * Cualquier texto de Bases o de contrato que cite multas, retenciones, garantías o plazos debe leerlos de aquí,
 * para que ambos documentos nunca se contradigan. Confirme con Secretaría General que son los oficiales.
 */
export const PARAMETROS_CONTRATO = {
  multaDiariaPct: '0,02',
  topeMultasPct: 15,
  diasResolucionPorAtraso: 30,
  retencionPct: 5,
  anticipoPct: 30,
  fielCumplimientoPct: 10,
  vigenciaFielCumplimientoDias: 60,
  postVentaDias: 365,
  boletaPostVentaPct: 10,
  diasRevisionEstadoPago: 3,
  diasHabilesMedicion: 5,
  diasFacturacion: 5,
  diasReclamacion: 30,
  diasInspeccionRecepcion: 15,
  diasSubsanacion: 15,
  atrasoParcialPct: 10,
  recargoEjecucionDirectaPct: 15,
} as const;

/**
 * Representante de la Universidad y su personería, como figuran en el contrato modelo. Verifique su vigencia
 * antes de cada uso (cambio de Rector/a, nuevo decreto o escritura).
 */
export const REPRESENTANTE_UNIVERSIDAD = {
  tratamiento: 'doña',
  nombre: 'Marcela Momberg Alarcón',
  rut: '9.932.229-2',
  cargo: 'Rectora',
  personeria:
    'consta en Decreto de Gran Cancillería N° 3/2025, reducido a escritura pública con fecha 6 de marzo de 2025, en la Notaría de doña Paula Falcón Cartes de la ciudad de Temuco, inscrita en el repertorio de instrumentos públicos No 312.',
} as const;

const TEXTO_PRECIO_SUMA_ALZADA = 'Los precios indicados en el Presupuesto Oficial (Anexo N°1), serán fijos y no estarán sujetos a revisión, ni siquiera por variaciones de precios de los materiales u otro motivo externo a lo que regula el presente Contrato, por corresponder la Modalidad de este contrato a Suma Alzada.';
const TEXTO_PRECIO_SERIE_PRECIOS = 'El monto indicado es referencial: el precio final del contrato se determinará según los precios unitarios ofertados por partida (Presupuesto Oficial, Anexo N°1) y las cantidades de obra efectivamente ejecutadas y medidas en terreno (cubicación real), por corresponder la Modalidad de este contrato a Serie de Precios Unitarios.';
const TEXTO_PRECIO_ADMINISTRACION_DIRECTA = 'Por corresponder la Modalidad de este contrato a Administración Directa, el monto indicado es una estimación referencial: el PRESTADOR será remunerado por los costos efectivamente incurridos (materiales, mano de obra y subcontratos debidamente respaldados) más la utilidad y gastos generales pactados, con un tope equivalente al monto adjudicado, salvo aumento de obra aprobado por el MANDANTE.';

export function resolverNotaModalidadPrecio(modalidad: 'Suma Alzada' | 'Serie de Precios' | 'Administración Directa'): string {
  if (modalidad === 'Serie de Precios') return TEXTO_PRECIO_SERIE_PRECIOS;
  if (modalidad === 'Administración Directa') return TEXTO_PRECIO_ADMINISTRACION_DIRECTA;
  return TEXTO_PRECIO_SUMA_ALZADA;
}

/**
 * Textos de la cláusula de garantías según la política del proyecto. Si el proyecto nunca definió una política
 * explícita, NO se asume la más exigente: se sugiere según el monto ADJUDICADO (igual que en las Bases).
 * 'Boletas de Garantía Completas' reproduce exactamente el contrato modelo.
 */
export function resolverTextosGarantias(politica: PoliticaGarantias | undefined, montoAdjudicado = 0) {
  const p = PARAMETROS_CONTRATO;
  const efectiva = politica || sugerirPoliticaGarantias(montoAdjudicado);
  const retencion =
    `Para garantizar la calidad de los trabajos realizados y de los materiales empleados por el PRESTADOR, así como el cumplimiento de los plazos establecidos en el ANEXO Nº 2 y las demás obligaciones contenidas en el presente contrato, se establece una retención del ${p.retencionPct}% del monto de cada factura. El total de las retenciones de las facturas efectuadas al PRESTADOR y las fianzas si las hubiere, responderá no sólo de la correcta ejecución de la obra contratada, sino también del cumplimiento de todas las obligaciones que según el presente contrato correspondan al PRESTADOR.`;
  const boleta =
    `\n\nEL PRESTADOR debe proporcionar Una Boleta de Fiel Cumplimiento del Contrato o Póliza de seguro de ejecución inmediata por el ${p.fielCumplimientoPct}% del contrato, la cual tendrá vigencia de ${p.vigenciaFielCumplimientoDias} días después de la aprobación de las obras, lo cual constará en el documento denominado Recepción Provisoria. Si el proyecto se extiende, la garantía se actualizará.`;

  if (efectiva === 'Sin Garantías') {
    return {
      garantias91: 'Dado el monto de este contrato, inferior al umbral de exigencia de garantías formales, no corresponde exigir retenciones ni boletas de garantía bancarias. Esto no exime al PRESTADOR de su responsabilidad contractual y legal por la correcta ejecución de lo contratado.',
      texto92: '9.2 Al no haberse exigido retenciones ni boletas de garantía, no procede su devolución.',
      caucionPostVenta: ',',
      texto104: `10.4 Suscrita el acta de recepción de la obra, y transcurrido el período de post venta de ${p.postVentaDias} días, el PRESTADOR queda liberado de las garantías contractuales, sin perjuicio de su responsabilidad legal (Art. 18 de la Ley General de Urbanismo y Construcciones).`,
    };
  }
  if (efectiva === 'Retención sobre Estados de Pago') {
    return {
      garantias91: retencion,
      texto92: '9.2 La devolución de las retenciones se realizará según lo detalla la cláusula 10.4.',
      caucionPostVenta: ',',
      texto104: `10.4 Una vez suscrita el acta de recepción de la obra, se devolverá al PRESTADOR el 100% de la retención realizada. Posterior a esto se considerará igualmente un periodo de ${p.postVentaDias} días de post venta por parte del PRESTADOR.`,
    };
  }
  return {
    garantias91: retencion + boleta,
    texto92: '9.2 La devolución de las retenciones se realizará según lo detalla la cláusula 10.4.',
    caucionPostVenta: `, el que se caucionará con una Boleta de Garantía de Correcta Ejecución de las obras o Póliza de seguro de ejecución inmediata por el ${p.boletaPostVentaPct}%,`,
    texto104: `10.4 Una vez suscrita el acta de recepción de la obra, se devolverá al PRESTADOR el 100% de la retención realizada, previa entrega por parte del PRESTADOR de la garantía indicada en cláusula 9.1. Previo ingreso de la garantía de correcta ejecución se realizará estado de pago para canje de retenciones. Posterior a esto se considerará igualmente un periodo de ${p.postVentaDias} días de post venta por parte del PRESTADOR.`,
  };
}

/**
 * Plantilla basada en el contrato de construcción a Suma Alzada realmente suscrito por la Universidad
 * (“Mejoramiento Térmico de Cubierta y Segundo Nivel Edificio CRC05”, Empresa Constructora IGECE Limitada,
 * 17 de marzo de 2026), con sus cláusulas y Anexos N°1 a N°4. Las cifras vienen de PARAMETROS_CONTRATO y los
 * datos de cada obra y contratista se completan al generar el borrador. Se corrigió la numeración del original
 * (saltaba de la cláusula 18 a la 20) y las referencias cruzadas entre cláusulas.
 */
export const PLANTILLA_CONTRATO_OBRA_CIVIL: SeccionContrato[] = [
  {
    id: 'comparecencia',
    titulo: 'Comparecencia',
    contenido: 'En Temuco, a {{fechaContrato}}, entre la UNIVERSIDAD CATÓLICA DE TEMUCO, Casa de Estudios Superiores, RUT N°71.918.700-5, representada por su Rectora {{rectoraTratamiento}} {{rectoraNombre}}, RUT N°{{rectoraRut}}, ambas domiciliadas para efectos de este contrato en Avenida Alemania número 0211 de la ciudad de Temuco, y de otra, {{proveedorNombreMayus}}, RUT {{proveedorRut}}, representada legalmente por {{proveedorRepresentantes}}, domiciliado en {{proveedorDomicilio}}, han acordado la suscripción de un contrato de construcción, en modalidad {{modalidadMinus}} en los términos y condiciones que se indican a continuación.',
  },
  {
    id: 'antecedentes',
    titulo: 'Antecedentes',
    contenido: 'I. La UNIVERSIDAD CATÓLICA DE TEMUCO, a quien en lo sucesivo se denomina el MANDANTE, ha adjudicado a {{proveedorNombreMayus}}, en adelante el PRESTADOR, la construcción de las Obras “{{nombreProyecto}}”.\nII. Para la obra citada en el apartado anterior, El PRESTADOR acepta, los trabajos de construcción de las Obras “{{nombreProyecto}}” de acuerdo con los antecedentes técnicos y la calidad indicada por el MANDANTE.\nIII. El PRESTADOR es una empresa especializada en la ejecución de los trabajos a que se refiere el presente contrato, motivo determinante por el cual ha sido contratado para la ejecución de estos. Los antecedentes y argumentos que avalan esta decisión figuran en el acta de adjudicación respectiva{{referenciaActa}}.\n\nAlcance declarado del proyecto: {{descripcionProyecto}}',
  },
  {
    id: 'objeto',
    titulo: 'PRIMERA. - OBJETO DEL CONTRATO',
    contenido: '1.1 El presente contrato y sus anexos son los únicos documentos válidos para regular las relaciones entre las partes y dejan sin efecto cualquier previsión contenida en la oferta del PRESTADOR y en la documentación precedente a la firma de este contrato.\n\n1.2 El MANDANTE encarga al PRESTADOR la ejecución de la totalidad de la obra por un monto fijo, para ser realizados según pliego de antecedentes técnicos estudiados en el proceso de licitación incluyendo aclaraciones realizadas en el proceso de Consultas, que el PRESTADOR declara expresamente conocer.\n\n1.3 El PRESTADOR, reconoce como interlocutores válidos a efectos de este contrato, a los representantes que el MANDANTE determine, absteniéndose de mantener contacto con personas externas al proyecto para efecto de la ejecución del proyecto estipulado en el presente contrato.',
  },
  {
    id: 'precio',
    titulo: 'SEGUNDA. - PRECIO',
    contenido: '2.1 El precio para el pago es el consignado en la propuesta económica del PRESTADOR que se reconoce como “Presupuesto Oficial” a partir de la firma del presente Contrato, correspondiente a {{montoAdjudicado}}.- IVA incluido ({{montoEnPalabras}}).\n\n2.2 {{notaModalidadPrecio}}',
  },
  {
    id: 'plazo',
    titulo: 'TERCERA. - PLAZOS DE EJECUCIÓN',
    contenido: '3.1 Para una adecuada calendarización de la construcción del edificio materia de este contrato, se establece un Programa de Obra con Ruta Crítica y la identificación de Hitos. Dicho Programa se encuentra en Anexo N°2 y forma parte integral del presente Contrato.\n\n3.2 Dichos plazos podrán ser modificados por el MANDANTE para adaptarlos a la buena marcha de las obras, previa comunicación al PRESTADOR.\n\n3.3 Si se produjese retraso de los trabajos por causas imputables al MANDANTE o por causa de fuerza mayor, el PRESTADOR, tendrá derecho a una prórroga de plazo igual a la demora producida, siempre que ésta haya sido reconocida previamente y por escrito por el MANDANTE.\n\n3.4 En caso de interrupciones, paralizaciones o suspensión de las obras, salvo que sean directa y exclusivamente imputables al MANDANTE, el PRESTADOR asumirá las consecuencias de dichas interrupciones, paralizaciones e incluso suspensión de los trabajos de forma temporal o definitiva, comprometiéndose a no reclamar al MANDANTE ningún perjuicio, salvo el precio de los trabajos efectivamente realizados de conformidad con el contrato.\n\n3.5 El plazo de ejecución estipulado por el PRESTADOR corresponde a {{plazoDias}} DIAS CORRIDOS desde la fecha de término de instalación de faenas, esta será estipulada por el MANDANTE y se dejará constancia en Libro de obras por el mismo. Ello conforme al Anexo N° 2.',
  },
  {
    id: 'ejecucion',
    titulo: 'CUARTA. - EJECUCIÓN DE LOS TRABAJOS',
    contenido: '4.1 El PRESTADOR no podrá realizar cambio de marcas ni especificaciones técnicas ninguna, respecto de los materiales, equipos o máquinas a emplear en la obra, sin la previa autorización del MANDANTE, incurriendo en caso contrario, en una penalización regulada en la Cláusula Sexta (Multas), más los daños y perjuicios que se deriven de la necesidad de reponer los materiales o equipos originalmente proyectados, sin perjuicio de la facultad del MANDANTE para resolver el contrato, si lo estimara oportuno.\n\n4.2 Con la antelación suficiente y, en todo caso, antes del inicio de sus trabajos, el PRESTADOR presentará en obra, muestra de los diferentes materiales y equipos a suministrar, los cuales deberán ser aceptados siempre por el MANDANTE y su Inspección de Obra. Cualquier perjuicio producido a la obra por demora en la presentación de muestras, será imputable al PRESTADOR.\n\n4.3 Las variaciones sobre el proyecto original que se produjeran como consecuencia de órdenes emanadas del MANDANTE, por medio de su Inspección, serán asumidas por el PRESTADOR, sin que ello suponga derecho alguno a revisar los términos de este contrato, salvo el derivado de la valoración de los aumentos de obra y/o nuevas obras a ejecutar, que deberán ser aprobadas por el MANDANTE.\n\n4.4 El PRESTADOR realizará a su cargo todas las construcciones e instalaciones necesarias para el desarrollo de sus trabajos. El MANDANTE no tendrá responsabilidad en la descarga, verificación, custodia o almacenaje de los materiales o maquinaria del PRESTADOR.\n\n4.5 El PRESTADOR limpiará y retirará a su costa todo desperdicio o material sobrante de su trabajo, dejando las áreas libres y en buen estado para su posterior uso.\n\n4.6 El PRESTADOR no podrá retirar de obra, durante el transcurso de los trabajos, personal ni medios de producción o materiales acopiados, que puedan alterar la marcha de los trabajos, sin la previa autorización por escrito del MANDANTE.\n\n4.7 Con el fin de organizar debidamente la ejecución de las obras, el PRESTADOR deberá asumir la organización que establezca la Inspección de Obra en aquellas instancias que por requerimiento institucional amerite intervenciones en el área de ejecución, como lo son, por ejemplo, el acto de la primera Piedra, visita de Autoridades de la Universidad entre otros.\n\n4.8 Toda reclamación que desee hacer el PRESTADOR con relación a cualquier incidencia que se produzca durante la ejecución de las obras deberá realizarla en el plazo de treinta días desde la fecha de su ocurrencia. Si así no se hiciera, perderá el PRESTADOR el derecho a realizar la reclamación.\n\n4.9 La totalidad de las obras que ejecuta el PRESTADOR se consideran en posesión del MANDANTE, aunque no estén facturadas o pagadas, ostentando el PRESTADOR únicamente un derecho de crédito por el importe de las obras ejecutadas de conformidad con lo establecido en este contrato.',
  },
  {
    id: 'calidad',
    titulo: 'QUINTA. - CALIDAD DE LOS TRABAJOS',
    contenido: '5.1 Todos los trabajos que realice el PRESTADOR cumplirán los pliegos de condiciones técnicas y normas tecnológicas o de obligado cumplimiento establecidas por cualquier organismo oficial, o compañía suministradora, que mantenga competencias sobre los trabajos objeto de contratación, aunque expresamente no se citen en el contrato, debiendo emplear materiales cuya calidad esté certificada por organismos oficiales o por entidades privadas homologadas. Asimismo, se obliga a hacer entrega al MANDANTE, de los documentos que acrediten las circunstancias anteriores previamente a la incorporación a la obra.\n\n5.2 El PRESTADOR, como especialista en los trabajos que le han sido contratados, declara poseer los conocimientos necesarios y disponer de la información y documentación adecuadas para su ejecución como son: situación de la obra, memoria, planos, pliego de condiciones del MANDANTE, mediciones, especificaciones técnicas y en general, toda la documentación relativa a la misma que, una vez examinada por el PRESTADOR, la considera suficiente y completa para la ejecución de su trabajo.\n\n5.3 El PRESTADOR, declara poseer las capacidades técnicas, tanto como empresa, como sus empleados, en aquellos trabajos en que dichas exigencias sean de obligado cumplimiento, según los organismos oficiales que tengan competencia en los trabajos que se contratan.\n\n5.4 La calidad de los trabajos se subordina a la aprobación del MANDANTE por medio de su Inspección de Obra.\n\n5.5 El PRESTADOR se compromete a realizar a sus expensas, todos los controles, pruebas y ensayos necesarios y/o solicitados por la Inspección de Obra, siendo a su cargo exclusivo los gastos de devolución de materiales que no satisfagan las pruebas, así como la demolición y reconstrucción de las unidades ejecutadas con dichos materiales y de aquellas otras partes de la obra que pudieran haber sido dañadas. El PRESTADOR está obligado a retirar, dentro del plazo establecido en Libro Obra, todos aquellos materiales o equipos que sean objetados por la Inspección de Obra.\n\n5.6 El MANDANTE no tendrá obligación de pago de ninguna factura al PRESTADOR de unidades que resulten rechazadas por su Inspección de Obra, como consecuencia de la inadecuada calidad de los materiales empleados o de la mala ejecución de los trabajos realizados por el PRESTADOR.\n\n5.7 El PRESTADOR se obliga a corregir a su costa, durante los períodos de ejecución y de garantía, los trabajos que haya realizado sin aprobación del MANDANTE, o que, a juicio de su Inspección de Obra, no fueran admisibles por su mala ejecución o por falta de calidad de los materiales aportados por el PRESTADOR, incluyendo los trabajos de demolición, refuerzo y nueva ejecución de las unidades en cuestión. Cuando estos trabajos sean realizados por el MANDANTE o terceras personas a instancias de éste, los gastos que se deriven se deducirán de las facturas del PRESTADOR o de las garantías. Los daños que se causen al MANDANTE o a terceros como consecuencia de los incumplimientos indicados en esta cláusula podrán ser satisfechos por el MANDANTE con cargo a retenciones o facturas pendientes del PRESTADOR.\n\n5.8 Los trabajos se realizan a riesgo del PRESTADOR.\n\n5.9 El PRESTADOR realizará por su cuenta, y a satisfacción del MANDANTE, las pruebas finales de obra de todas las instalaciones técnicas por él ejecutadas, en cumplimiento con la Normativa.\n\n5.10 El PRESTADOR, como especialista en los trabajos que se le han contratado, ejecutará los mismos con plena autonomía en la aplicación de las técnicas de buena ejecución, sin perjuicio de la facultad de la Inspección de Obra de cuidar que el resultado final sea conforme con el proyecto.',
  },
  {
    id: 'multas',
    titulo: 'SEXTA. - MULTAS',
    contenido: '6.1 El incumplimiento por parte del PRESTADOR de los hitos establecidos en el ANEXO Nº 2 de este contrato, dará derecho al MANDANTE a exigir de aquél, además de la indemnización que por daños y perjuicios pudiera corresponderle, una penalización equivalente al {{multaDiariaPct}} % del importe global del contrato por cada día de retraso.\n\n6.2 La sumatoria de las multas aplicadas no podrá exceder el {{topeMultasTexto}} ({{topeMultasPct}}%) del precio total del contrato. En caso de superar dicho porcentaje, la UC TEMUCO queda facultado para resolver el contrato, reteniendo toda la facturación pendiente de pago, así como las garantías aportadas por el PRESTADOR, después de efectuar la liquidación de los trabajos efectuados, una vez realizadas las deducciones que procedan por los perjuicios ocasionados a la UC TEMUCO. En caso de que el atraso en la ejecución de la obra supere los {{diasResolucionTexto}} ({{diasResolucionPorAtraso}}) días corridos respecto al plazo contractual, la UC TEMUCO podrá resolver el contrato de pleno derecho, mediante notificación escrita, sin necesidad de intervención judicial.\n\n6.3 El valor de las multas, si existiesen, se deducirá, en el momento de su aplicación, de las facturas pendientes de pago.\n\n6.4 No serán aplicables las sanciones por retrasos, cuando éstos se produzcan por causas imputables al MANDANTE o por causas de fuerza mayor.',
  },
  {
    id: 'medicion',
    titulo: 'SÉPTIMA. - MEDICIÓN Y FACTURACIÓN',
    contenido: '7.1 Las cantidades a facturar corresponderán siempre a obra realmente ejecutada y el pago por los trabajos necesarios para su ejecución será la suma total ofertada y oficializada en el “Presupuesto Oficial” Anexo 1 y a lo señalado en el Anexo 2.\n\n7.2 Mensualmente y con {{diasHabilesMedicion}} días hábiles de anticipación al término del mes, se realizará, entre las personas autorizadas por parte de la UC TEMUCO y del PRESTADOR, una medición a origen de las partidas ejecutadas y terminadas en obra de acuerdo con el “Estado de Pago”, que deberá contar con la conformidad de la Inspección de Obra.\n\n7.3 Con el resultado conforme de dicha medición, según Código: SGC PS-FOR-DGDC 0050 Recepción Conforme de trabajos de Infraestructura, el PRESTADOR enviará digitalmente factura por triplicado, durante los {{diasFacturacionTexto}} PRIMEROS DÍAS de cada mes.\n\n7.4 Las facturas se emitirán basándose en el valor autorizado en el Estado de Pago correspondiente, sin que su pago suponga aprobación de los trabajos contenidos en la misma.\n\n7.5 No se admitirán facturas que incluyan unidades de obra que no figuren en el cuadro de cantidades y precios, y sus posibles ampliaciones firmadas, o que contengan errores o no se ajusten a las exigencias legales o que, salvo pacto expreso en contra, incluyan facturación de materiales o equipos en acopio, ni de maquinaria de producción a disposición de obra.',
  },
  {
    id: 'forma-pago',
    titulo: 'OCTAVA. - FORMA DE PAGO',
    contenido: 'En caso de conformidad de las facturas presentadas, la UC TEMUCO pagará el monto:\n8.1 Mediante Transferencia Bancaria, a la cuenta entregada por el PRESTADOR.\n\n8.2 Para el pago de la última factura será necesario firmar el correspondiente a último Estado de Pago, sin perjuicio de lo pactado sobre las retenciones.\n\n8.3 Los pagos se realizarán una vez se haya completado el siguiente procedimiento: primero, el PRESTADOR presentará el Estado de Pago. A continuación, la UC TEMUCO dispondrá de un plazo de {{diasRevisionEstadoPago}} días para revisar la obra correspondiente al avance. Una vez que la UC TEMUCO acepte el Estado de Pago, el PRESTADOR deberá presentar la factura.\n\n8.4 De existir observaciones a la obra, el PRESTADOR deberá subsanarlas según el plazo indicado por correo electrónico y una vez subsanadas reingresar el Estado de Pago respectivo, con la validación de la Inspección Técnica de Obras reiterándose el procedimiento antes descrito. Cada pago será realizado por la UC TEMUCO en pesos chilenos más el Impuesto al Valor Agregado (IVA).\n\n8.5 Se fijará entre las partes un Programa Financiero Mensual correlacionado con los avances del Programa Oficial de Obra. Dicho programa se encuentra en el Anexo N° 3 y forma parte integral del presente contrato.\n\n8.6 El PRESTADOR podrá solicitar un anticipo del {{anticipoPct}}% del monto del contrato.',
  },
  {
    id: 'garantias',
    titulo: 'NOVENA. - RETENCIONES, GARANTÍAS Y SEGUROS',
    contenido: '9.1 {{garantias91}}\n\n{{texto92}}\n\n9.3 El PRESTADOR se obliga a contratar los Seguros de responsabilidad Civil y Seguro de Todo riesgo de Construcción.\n\n9.4 El MANDANTE queda expresamente autorizado para hacer efectivas, automáticamente, las deducciones que aplique al PRESTADOR en esta obra por penalizaciones, servicios y prestaciones que el MANDANTE haya prestado al PRESTADOR, indemnizaciones, etc., contra las facturas o cantidades pendientes de pago por retenciones, en ésta o en cualquier otra obra en la que intervenga el mismo PRESTADOR.\n\n9.5 El PRESTADOR, responderá de cualquier daño o perjuicio que fuera causado al MANDANTE o a terceros, como consecuencia de los trabajos realizados para el MANDANTE, y se hará responsable de los pagos o restitución de bienes que la ley determine en cualquier reclamación judicial o extrajudicial que se origine como consecuencia del presente contrato. El MANDANTE no obstante, queda facultado expresamente en este contrato, para atender los pagos que fueran requeridos por mandato judicial o administrativo y a descontar el monto de los mismos de la facturación pendiente de pago o, en su caso, de las garantías aportadas por el PRESTADOR.\n\n9.6 El PRESTADOR tendrá debidamente asegurada toda la maquinaria y equipos que emplee en las obras, incluyendo entre las garantías contratadas el robo y el incendio.',
  },
  {
    id: 'recepcion',
    titulo: 'DÉCIMA. - TERMINACIÓN DE LOS TRABAJOS. ACTA DE RECEPCIÓN. LIQUIDACIÓN Y GARANTÍA',
    contenido: '10.1 Una vez concluidos los trabajos, el PRESTADOR comunicará la terminación de los mismos al MANDANTE, quien dispondrá de un plazo de {{diasInspeccionRecepcion}} días para efectuar la comprobación e inspección de las obras realizadas.\nLa citada inspección deberá realizarse en presencia del PRESTADOR, debiendo levantarse acta en la que se hará constar, según el caso:\na) Que las obras son conformes.\nb) Que las obras son incompletas o defectuosas, en cuyo caso se harán constar en el acta los defectos observados o los incumplimientos detectados. En este supuesto, se concederá al PRESTADOR un plazo no superior a {{diasSubsanacion}} días para la subsanación de las deficiencias, imperfecciones o incumplimientos. El plazo que pueda establecerse para realizar la citada subsanación no liberará al PRESTADOR de la obligación de hacer efectiva, en su caso, la penalización establecida en la cláusula sexta. Si al término de dicho plazo el PRESTADOR no ha realizado las subsanaciones ordenadas por el MANDANTE, este último podrá resolver el contrato y ejecutarlas con terceros a costa del PRESTADOR, sin perjuicio del derecho a cobrar los daños y perjuicios correspondientes.\nc) Que las obras son conformes pero deben realizarse trabajos de menor entidad o cumplirse obligaciones menores o repasos en cuyo caso, si así lo considera el MANDANTE, se darán por terminados los trabajos pero se supeditará el pago de la última factura a la terminación de dichos repasos o cumplimiento de las obligaciones procedentes.\n\n10.2 La liquidación de la obra se efectuará al tiempo de suscribirse el acta de recepción con resultado positivo. En caso de no concurrir las circunstancias necesarias para prestar dicha conformidad, la liquidación habrá de realizarse una vez concluidas todas las reparaciones, subsanaciones o cumplimiento de requisitos u obligaciones por parte del PRESTADOR. Se entenderá liquidada la obra con el pago de la última factura, cuyo pago significará que no queda pendiente ningún pago por parte del MANDANTE, lo que se hará constar en el correspondiente finiquito que necesariamente habrá de suscribirse como condición necesaria para realizar este pago, sin perjuicio de lo establecido en el presente contrato para las retenciones.\n\n10.3 Se establece un periodo de garantía de post venta de {{postVentaDias}} días a contar de la fecha del acta de recepción de las obras{{caucionPostVenta}} durante el cual será de cargo del PRESTADOR la reparación de los defectos, desperfectos o daños que se aprecien en las obras ejecutadas, así como los que se puedan poner de manifiesto en el funcionamiento de las instalaciones.\n\n{{texto104}}\n\n10.5 Se deben considerar igualmente todos los plazos indicados en el ARTICULO 18 de la Ley General de Urbanismo y Construcciones.',
  },
  {
    id: 'obligaciones-laborales',
    titulo: 'UNDÉCIMA. - OBLIGACIONES SOCIALES, FISCALES Y LABORALES DEL PRESTADOR',
    contenido: '11.1 El PRESTADOR está obligado al cumplimiento de las disposiciones en vigor o que pudieran publicarse durante la vigencia de este contrato en materia laboral, fiscal y de seguridad social, de acuerdo con la reglamentación, convenio o norma que le sea aplicable.\n\n11.2 El PRESTADOR no podrá ceder ni subcontratar los trabajos o parte de ellos a terceros, sin permiso escrito de la UC TEMUCO. La autorización de subcontrataciones no liberará al PRESTADOR de ninguna de sus obligaciones frente a la UC TEMUCO, quien mantendrá siempre acción directa contra el PRESTADOR respecto del total cumplimiento del contrato.\n\n11.3 Asimismo, la UC TEMUCO y su representante, se reservan el derecho a informar y solicitar al PRESTADOR, el cambio de un(a) trabajador de este último cuyo actuar pueda comprometer la seguridad, ritmo de la obra o causar un perjuicio.\n\n11.4 El PRESTADOR deberá solicitar autorización expresa para utilizar la imagen o el nombre de la UC TEMUCO en cualquier soporte publicitario, que haga referencia a los trabajos que efectúa. Cuando dicha autorización se conceda, el PRESTADOR deberá citar siempre a la UC TEMUCO como propietario principal de las obras y utilizar los anagramas y formatos que la UC TEMUCO le facilite.',
  },
  {
    id: 'prevencion',
    titulo: 'DUODÉCIMA. - OBLIGACIONES DEL PRESTADOR EN MATERIA DE PREVENCIÓN DE RIESGOS LABORALES',
    contenido: '12.1 El PRESTADOR está obligado a cumplir y hacer cumplir a sus trabajadores toda la normativa sobre prevención de riesgos laborales, así como las normas jurídico-técnicas que incidan en las condiciones de trabajo en materia de prevención, siendo responsable de la puesta en práctica de las mismas, así como de las consecuencias que se derivasen de su incumplimiento.\n\n12.2 Antes del inicio de los trabajos, el PRESTADOR suministrará a su personal los equipos de protección individual que sean necesarios (cascos, monos, botas de seguridad, etc.) para el cabal cumplimiento de la normativa en esta materia.\n\n12.3 El PRESTADOR será responsable de la colocación en el momento oportuno, así como de su correcto uso y mantenimiento, de los equipos y medios de protección colectiva necesarios para la realización de los trabajos que le hayan sido encomendados.',
  },
  {
    id: 'medio-ambiente',
    titulo: 'DÉCIMO TERCERA. - OBLIGACIONES DEL PRESTADOR EN MATERIA DE MEDIO AMBIENTE',
    contenido: '13.1 El PRESTADOR está obligado a cumplir todas las disposiciones legales en materia de medio ambiente siendo responsable de la puesta en práctica de las mismas, así como de las consecuencias que se deriven de su incumplimiento, tanto en lo que se refiere a la actividad por él ejecutadas, como a la que subcontraten con terceros.\n\n13.2 El PRESTADOR deberá cumplir, cuando exista, el plan de medio ambiente de la obra. Para ello la UC TEMUCO pondrá a disposición del PRESTADOR la parte de dicho plan que le afecte.\n\n13.3 La UC TEMUCO no aceptará ninguna reclamación del PRESTADOR por pérdidas de tiempo debidas a interrupciones del trabajo, por incumplimiento por parte del mismo de la legislación medioambiental.\n\n13.4 El PRESTADOR se compromete a retirar de la obra todo tipo de envases y residuos industriales que genere en su actividad y a tratarlos con arreglo a la legislación de medio ambiente.\n\n13.5 El incumplimiento por el PRESTADOR de sus obligaciones en los temas medioambientales facultará a la UC TEMUCO a la imposición de una multa equivalente a la sanción que aplicarían las autoridades medioambientales (señalado por Ministerio de Medio Ambiente), por este incumplimiento. En caso de reiteración, se podrán retener los pagos y facturas en curso e incluso resolver el contrato sin que el PRESTADOR tenga derecho a indemnización alguna, independientemente de los daños y perjuicios que la UC TEMUCO pudiese reclamarle. Sin perjuicio de las multas administrativas, la UC TEMUCO podrá reclamar al PRESTADOR los daños y perjuicios adicionales que se produzcan como consecuencia del incumplimiento de la normativa medioambiental.',
  },
  {
    id: 'relacion-laboral',
    titulo: 'DÉCIMO CUARTA. - RELACIÓN LABORAL Y RESPONSABILIDAD DEL PRESTADOR CON SU PERSONAL',
    contenido: 'La relación entre las partes se limita al contenido del presente contrato, por lo que no existe entre ellas vínculo laboral alguno, debiendo responder cada una de ellas por las obligaciones de sus propios trabajadores o servicios externos.\nCon lo anterior, las partes declaran que cada una será responsable del cumplimiento de todas y cada una de las obligaciones laborales, previsionales y en general contractuales de las personas que participen en el presente contrato y que hayan sido contratadas por ellas. Por lo anterior, el PRESTADOR se obliga a responder por toda acción civil, laboral, penal, administrativa, etc., que cualquiera de sus trabajadores interpusiera en contra de la Universidad.\n\nEl personal que el PRESTADOR destine a la ejecución de este contrato será de su exclusiva dependencia, siendo por lo tanto el PRESTADOR el único responsable del cumplimiento de las leyes laborales, previsionales y de seguridad social vigentes.\n\nEn el evento que la Universidad fuese demandada, multada o sancionada en relación o por causa de algún trabajador del PRESTADOR, por algún organismo laboral, previsional o judicial, el PRESTADOR deberá pagar inmediatamente el monto reclamado e indemnizar a la Universidad por el valor equivalente al total demandado, multado o sancionado, y por los costos de su defensa judicial o administrativa, pudiendo la Universidad deducir las sumas adeudadas por este concepto del valor de cualquier pago de los Servicios prestados.\n\nLa UC TEMUCO podrá retener montos pendientes de pago, o hacer efectivos cobros contra las garantías entregadas, para cubrir multas, sanciones o pagos a terceros originados por incumplimientos laborales, previsionales o de seguridad del PRESTADOR.',
  },
  {
    id: 'relacion-contractual',
    titulo: 'DÉCIMO QUINTA. - RELACIÓN CONTRACTUAL',
    contenido: 'La Universidad Católica de Temuco deja expresa constancia que el prestador, para efectos del presente contrato y en relación a las obras objeto de la prestación de servicios, no tiene dependencia directa e inmediata con la Universidad, y que el presente contrato constituye una prestación de servicios, en el que no existen los elementos de subordinación que determinan otra clase de relación, en especial de índole laboral, de manera que el prestador no estará sujeto a fiscalización directa e inmediata y tampoco existirá a su respecto subordinación o dependencia. En consecuencia, a la Universidad no le asiste obligación alguna de efectuar al prestador pagos previsionales en algún organismo de Seguridad Social o de responder a cualquier título por derechos u obligaciones ajenas a este contrato de prestación de servicios.',
  },
  {
    id: 'resolucion',
    titulo: 'DÉCIMO SEXTA. - RESOLUCIÓN DEL CONTRATO',
    contenido: '16.1 Son causas de resolución de este contrato, además de las previstas especialmente en alguna de las cláusulas anteriores:\n\n16.1.1 La extinción de la personalidad jurídica de cualquiera de las partes.\n16.1.2 La falta de capacidad técnica, laboral o económica del PRESTADOR observada durante la ejecución de los trabajos contratados.\n16.1.3 El incumplimiento grave o reiterado de la normativa de prevención de riesgos laborales y de medio ambiente o de las órdenes de la UC TEMUCO.\n16.1.4 La falta de subsanación de los defectos en los trabajos realizados.\n16.1.5 El mutuo acuerdo de las partes, con los efectos que en el mismo se establezcan.\n16.1.6 En todo caso, será causa de resolución del contrato el incumplimiento total o parcial de todas o alguna de las cláusulas convenidas en el mismo si la otra parte solicitó la resolución.\n\n16.2 En caso de resolución de este contrato por causas imputables al PRESTADOR, la retención establecida se aplicará a subsanar los daños ocasionados a la UC TEMUCO sin perjuicio de las acciones ulteriores a que hubiere lugar, quedando afectados y en suspenso todos los pagos pendientes de vencimiento hasta la liquidación que se practique como consecuencia de tal resolución.',
  },
  {
    id: 'hitos',
    titulo: 'DÉCIMO SÉPTIMA. - REQUISITO PROGRAMA DE HITOS DEL CONTRATO',
    contenido: '17.1 En caso de retrasos en los hitos debido a causas o responsabilidad del PRESTADOR, la UC TEMUCO podrá ejecutar directamente, con sus propios medios o delegando en un tercero, los trabajos pendientes fuera de plazo. Los costos asociados podrán ser cubiertos con las cantidades que se le adeuden al PRESTADOR en ese momento, ya sea por facturas o certificaciones pendientes de pago, o por las boletas bancarias recibidas, así como por las retenciones en su poder. Esto sin perjuicio de las acciones legales que correspondan si dichas cantidades no son suficientes para cubrir el valor de las obras y la indemnización por los perjuicios causados. Los costos adicionales generados por este motivo, con un recargo del {{recargoEjecucionDirectaPct}}%, serán asumidos por el PRESTADOR.\n\n17.2 En caso de atrasos parciales, en la Construcción y/o ejecución de los trabajos que originen un atraso mayor al {{atrasoParcialPct}}% respecto al avance total programado de las obras contratadas, por causa o responsabilidad del PRESTADOR, la UC TEMUCO podrá gestionar directamente con sus propios medios o encomendar a un tercero, el presente contrato, descontando de las retenciones, boletas de garantías o de obras ejecutadas en etapa de pago. Los costos adicionales que por este motivo se ocasionen a la UC TEMUCO serán recargados en un {{recargoEjecucionDirectaPct}}% al PRESTADOR.',
  },
  {
    id: 'jurisdiccion',
    titulo: 'DÉCIMO OCTAVA. - JURISDICCIÓN',
    contenido: 'Ambas partes, se someten expresamente para la resolución de cuantas cuestiones resulten del presente contrato a la jurisdicción de los juzgados y tribunales de la ciudad de Temuco.',
  },
  {
    id: 'datos',
    titulo: 'DÉCIMO NOVENA. - PROTECCIÓN DE DATOS',
    contenido: 'El PRESTADOR no podrá transmitir ni utilizar para otros fines que no sean la ejecución de esta obra, los conocimientos y especificaciones de los equipos y programas de la UC TEMUCO.',
  },
  {
    id: 'ley-21369',
    titulo: 'VIGÉSIMA. - CLÁUSULA LEY 21.369',
    contenido: 'Las partes acuerdan que, de conformidad a lo dispuesto en la ley No 21.369, forman parte integrante del presente instrumento la política integral contra el acoso sexual, la violencia y la discriminación de género de la UC Temuco, la cual se encuentra conformada por (i) la Política de Género de la UC Temuco (DR 35/2019) (ii) el Modelo de prevención del acoso, la violencia y la discriminación de género de la UC Temuco (DR 113/2022), (iii) el Reglamento para la investigación, sanción y reparación del acoso sexual, la violencia y la discriminación de Género de la UC Temuco (DR 114/2022); (iv) el Protocolo de actuación frente a casos de violencia de género de la UC Temuco (Res. Secretaría General 24/2020); (v) el Protocolo de identidad de género y uso de nombre social (Res. Secretaría General 17/2021); y (vi) el Protocolo de atención y acompañamiento a personas afectadas por violencia de género; o la normativa que los reemplace o modifique, documentos que se encuentran disponibles en la página web de libre acceso al público https://direcciongenero.uct.cl/, normativa que declaran conocer y resulta vinculante para las partes.',
  },
  {
    id: 'personerias',
    titulo: 'VIGÉSIMO PRIMERA. - PERSONERÍAS',
    contenido: 'La personería de {{rectoraTratamiento}} {{rectoraNombreMayus}} para firmar en representación de la Universidad Católica de Temuco, {{rectoraPersoneria}}\n\n{{personeriaContratista}}\n\nEn los términos convenidos y ratificándose ambas partes, firman el presente contrato, por triplicado, quedando dos en poder de la Universidad y uno en poder del PRESTADOR, en el lugar y fecha expresados en el encabezamiento.',
  },
  {
    id: 'anexo1',
    titulo: 'ANEXO N°1 — PRESUPUESTO OFICIAL',
    contenido: '{{notaAnexo1}}',
  },
  {
    id: 'anexo2',
    titulo: 'ANEXO N°2 — PROGRAMA DE OBRA',
    contenido: '{{programaObra}}',
  },
  {
    id: 'anexo3',
    titulo: 'ANEXO N°3 — PROGRAMA FINANCIERO',
    contenido: 'Obra: {{nombreProyecto}} · Prestador: {{proveedorNombreMayus}} · RUT {{proveedorRut}}\n\nDETALLE | FECHA | VALOR %\nEstado de pago N° 1 | [fecha a acordar] | {{anticipoPct}}%\nEstado de pago N° 2 | Término de obra | {{restoPct}}%',
  },
  {
    id: 'anexo4',
    titulo: 'ANEXO N°4 — CONDICIONES PARTICULARES',
    contenido: 'OBRA {{nombreProyectoMayus}}\nPRESTADOR: {{proveedorNombreMayus}}\nRUT: {{proveedorRut}}\n\nPOR CUENTA DE LA UC TEMUCO:\nSe encargará de hacer entrega del terreno en óptimas condiciones para puesta en marcha e instalación de faenas por parte del PRESTADOR. Deberá indicar puntos de conexión a redes de agua y empalme eléctrico.\n\nDOCUMENTACIÓN A FACILITAR POR LA UC TEMUCO:\nAntecedentes técnicos constructivos de la obra.\n\nPOR CUENTA DEL PRESTADOR:\nDocumentación de Calidad, a solicitud de la Inspección de Obra.\n- Certificados de los materiales incorporados a obra y ensayos y controles.\n- Procedimiento de trabajo seguro detallando la metodología con la que realizará los trabajos.\n- Listado de equipos con los que ejecutará la obra y el organigrama del personal especializado.\n\nPRUEBAS Y ENSAYOS POR CUENTA DEL PRESTADOR:\nTodas las requeridas de acuerdo a especificaciones técnicas de arquitectura y especialidades según corresponda. Serán requerimiento todas aquellas pruebas que permitan la obtención de la Recepción Definitiva del proyecto por parte de la Dirección de Obras Municipales.\n\nFORMA DE PAGO:\nLa UC TEMUCO realizará pagos al PRESTADOR de la siguiente manera:\n1. Estados de pago conforme a lo establecido en el Anexo N° 3.\n2. La UC TEMUCO tendrá {{diasRevisionEstadoPago}} días hábiles para revisar el estado de pago, y una vez acordado, se autorizará la emisión de la factura correspondiente.\n\nESPECIFICACIONES TÉCNICAS:\nSe cumplirá lo especificado en los Pliegos de Prescripciones Técnicas Generales y Particulares del Proyecto, Planos de la Obra, Proyectos de Especialidad, Plan de Prevención y Plan de Medio Ambiente de la Obra, y siempre atendiendo las normativas vigentes.\n\nPLAZOS:\nA continuación, se especifican Plazos que regulan el contrato como:\n- Fecha de Adjudicación: {{fechaAdjudicacion}}\n- Fecha de Contrato: {{fechaContratoCorta}}\n- Fecha de Inicio Obras: {{fechaInicioCorta}}\n- Plazo: {{plazoDias}} días corridos\n- Hito Parcial: Indicado por PRESTADOR en Programación física y financiera\n- Hito Total: Considerado como el término de la obra para cursar último Estado de Pago.\n\nOTROS REQUISITOS:\nEl PRESTADOR designará un responsable de ejecución a pie de obra, para que coordine con la UC TEMUCO todas las actividades de sus equipos, quedando prohibido comentar datos de ejecución con personal ajeno a los representantes designados por la UNIVERSIDAD. Cuando por motivos de obra sea necesario trabajar en domingos y/o festivos, se acordará con la Inspección de Obra el cambio de ese día por otro para compensar los días trabajados en el mes. Los trabajos en doble turno y/o fines de semana, se deberán acordar previamente con la Inspección de Obra para solicitar la correspondiente autorización y evaluar incidencia de los trabajos en periodos de descanso respecto a la comunidad universitaria y/o terceros afectados.',
  },
];

// v3: plantilla rehecha según el contrato modelo IGECE-UCT (marzo 2026). El cambio de versión en la llave
// fuerza a que todos los navegadores reciban el default nuevo (localStorage no se auto-migra).
const STORAGE_KEY_CONTRATO_OBRA_CIVIL = 'infra_app_plantilla_contrato_v3_obra-civil';

export function getPlantillaContratoObraCivil(): SeccionContrato[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONTRATO_OBRA_CIVIL);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_CONTRATO_OBRA_CIVIL, JSON.stringify(PLANTILLA_CONTRATO_OBRA_CIVIL));
      return PLANTILLA_CONTRATO_OBRA_CIVIL;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : PLANTILLA_CONTRATO_OBRA_CIVIL;
  } catch (e) {
    console.error('Error leyendo la plantilla de contrato:', e);
    return PLANTILLA_CONTRATO_OBRA_CIVIL;
  }
}

export function guardarPlantillaContratoObraCivil(secciones: SeccionContrato[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONTRATO_OBRA_CIVIL, JSON.stringify(secciones));
  } catch (e) {
    console.error('Error al guardar la plantilla de contrato:', e);
  }
}

export function restaurarPlantillaContratoObraCivil(): SeccionContrato[] {
  guardarPlantillaContratoObraCivil(PLANTILLA_CONTRATO_OBRA_CIVIL);
  return PLANTILLA_CONTRATO_OBRA_CIVIL;
}
