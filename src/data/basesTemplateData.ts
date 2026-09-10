export interface SeccionBases {
  id: string;
  titulo: string;
  contenido: string;
}

export type FamiliaBases = 'obra-civil' | 'obra-menor' | 'diseno' | 'suministro' | 'otros';

/**
 * Agrupa cada Tipo de Obra (ver tiposObraData.ts) en una "familia" de Bases,
 * porque escribir una plantilla distinta para cada uno de los 12 tipos sería
 * puro copy-paste sin ganar precisión real. Cada familia comparte la misma
 * naturaleza contractual (ejecución de obra civil, obra menor, consultoría de
 * diseño o suministro), que es lo que realmente cambia el contenido de las
 * bases (garantías, forma de pago, qué se recibe al final, etc).
 */
export const TIPO_OBRA_A_FAMILIA: Record<string, FamiliaBases> = {
  'OBRA NUEVA': 'obra-civil',
  'AUMENTO DE OBRA': 'obra-civil',
  'AMPLIACION': 'obra-civil',
  'DEMOLICION': 'obra-civil',
  'REMODELACION': 'obra-menor',
  'ALHAJAMIENTO': 'obra-menor',
  'AREAS VERDES': 'obra-menor',
  'REGULARIZACION': 'obra-menor',
  'INSTALACIONES': 'obra-menor',
  'DISEÑO': 'diseno',
  'COMPRA ELEMENTOS': 'suministro',
  'OTROS': 'otros',
};

/** Determina la familia de bases a partir del Tipo de Obra del proyecto (normaliza mayúsculas/espacios). */
export function obtenerFamiliaPorTipoObra(tipoObra?: string): FamiliaBases {
  if (!tipoObra) return 'otros';
  const normalizado = tipoObra.trim().toUpperCase();
  return TIPO_OBRA_A_FAMILIA[normalizado] || 'otros';
}

export const FAMILIA_BASES_LABEL: Record<FamiliaBases, string> = {
  'obra-civil': 'Obra Civil / Construcción (Obra Nueva, Ampliación, Aumento de Obra, Demolición)',
  'obra-menor': 'Obra Menor / Habilitación (Remodelación, Alhajamiento, Áreas Verdes, Regularización, Instalaciones)',
  'diseno': 'Diseño y Consultoría',
  'suministro': 'Suministro / Compra de Elementos',
  'otros': 'Genérica (Otros / sin clasificar)',
};

/**
 * Exigir boletas de garantía bancarias en contratos de monto bajo es
 * desproporcionado (el costo/trámite de la boleta puede superar el beneficio)
 * y en la práctica no se cobra. Por eso esto NO puede ser texto fijo en la
 * plantilla: depende del monto de CADA proyecto y debe decidirse al crearlo,
 * no redactarse en abstracto.
 */
export type PoliticaGarantias = 'Sin Garantías' | 'Retención sobre Estados de Pago' | 'Boletas de Garantía Completas';

/**
 * Umbrales sugeridos, alineados a los mismos tramos institucionales usados en
 * Parámetros SGC (umbralActaObligatoria / umbralAprobacionVrae). Es una
 * sugerencia de partida, siempre editable por quien crea el proyecto — no
 * reemplaza la política oficial de garantías que defina Coordinación de Calidad.
 */
export const UMBRAL_GARANTIAS_RETENCION = 800001;
export const UMBRAL_GARANTIAS_BOLETAS = 5000001;

export function sugerirPoliticaGarantias(valorAprox: number): PoliticaGarantias {
  if (valorAprox >= UMBRAL_GARANTIAS_BOLETAS) return 'Boletas de Garantía Completas';
  if (valorAprox >= UMBRAL_GARANTIAS_RETENCION) return 'Retención sobre Estados de Pago';
  return 'Sin Garantías';
}

const TEXTO_GARANTIAS_SIN = 'Dado el monto estimado de este proyecto ({{montoEstimado}}), inferior al umbral de exigencia de garantías formales, no corresponde exigir boletas de garantía bancarias ni retención especial. Esto no exime al proveedor de su responsabilidad contractual y legal por la correcta ejecución de lo contratado.';

const TEXTO_GARANTIAS_RETENCION = 'Dado el monto estimado de este proyecto ({{montoEstimado}}), en vez de boletas de garantía bancarias se aplicará una retención de 5% a 10% sobre cada Estado de Pago (o sobre el pago único, si aplica), liberada contra Recepción Conforme. Evalúe con Coordinación de Calidad si además corresponde exigir una boleta de Seriedad de la Oferta.';

/** Reemplaza el texto de garantías de la plantilla por el que corresponde según la política elegida para el proyecto. */
export function resolverContenidoGarantias(politica: PoliticaGarantias | undefined, textoBoletasCompletas: string): string {
  if (politica === 'Sin Garantías') return TEXTO_GARANTIAS_SIN;
  if (politica === 'Retención sobre Estados de Pago') return TEXTO_GARANTIAS_RETENCION;
  return textoBoletasCompletas;
}

export type ModalidadContrato = 'Suma Alzada' | 'Serie de Precios' | 'Administración Directa';

/**
 * El texto de la sección "Modalidad de Contratación" de cada plantilla está
 * escrito pensando en Suma Alzada. Si en el selector de la Ficha se elige
 * otra modalidad, este texto debe cambiar en consecuencia — el mecanismo de
 * pago y de riesgo de cantidades es legalmente distinto en cada una.
 */
const TEXTO_MODALIDAD: Record<ModalidadContrato, string> = {
  'Suma Alzada': 'Contrato a Suma Alzada: el proveedor adjudicado ejecuta la totalidad de los trabajos especificados por un precio fijo, asumiendo los riesgos de cantidades de obra no contempladas explícitamente en las bases.',
  'Serie de Precios': 'Contrato a Serie de Precios Unitarios: el proveedor adjudicado ejecuta los trabajos según los precios unitarios ofertados por partida; el monto final del contrato se determina según las cantidades de obra efectivamente ejecutadas y medidas en terreno (cubicación real), no un monto fijo cerrado. La Universidad asume el riesgo de mayores o menores cantidades respecto del presupuesto referencial.',
  'Administración Directa': 'Contrato por Administración Directa (o Delegada): la Universidad administra directamente la ejecución de los trabajos, aportando o contratando materiales, mano de obra y/o equipos; el proveedor actúa bajo instrucción directa del Responsable de Infraestructura y es remunerado por los costos efectivamente incurridos más un margen o tarifa administrativa pactada, sin que exista un precio total cerrado por el alcance completo.',
};

/** Reemplaza el texto de la sección de Modalidad de Contratación según lo elegido para el proyecto (independiente de la familia de bases). */
export function resolverContenidoModalidad(modalidad: ModalidadContrato): string {
  return TEXTO_MODALIDAD[modalidad];
}

// ─── FAMILIA: OBRA CIVIL / CONSTRUCCIÓN ────────────────────────────────────
const PLANTILLA_OBRA_CIVIL: SeccionBases[] = [
  {
    id: 'objeto',
    titulo: '1. Objeto de la Licitación',
    contenido: 'Describa el objeto del contrato: {{nombreProyecto}} ({{tipoObra}}), ubicado en {{campus}}{{edificio}}. Detalle el alcance de los trabajos de construcción a ejecutar, incluyendo obra gruesa, terminaciones y especialidades.',
  },
  {
    id: 'modalidad',
    titulo: '2. Modalidad de Contratación',
    contenido: 'Contrato a Suma Alzada: el proveedor adjudicado ejecuta la totalidad de las obras especificadas por un precio fijo, asumiendo los riesgos de cantidades de obra no contempladas explícitamente en las bases.',
  },
  {
    id: 'presupuesto',
    titulo: '3. Presupuesto Referencial',
    contenido: 'Presupuesto estimado: {{montoEstimado}} (IVA incluido). Las ofertas que superen este monto podrán ser declaradas inadmisibles según lo defina la comisión evaluadora.',
  },
  {
    id: 'plazo',
    titulo: '4. Plazo de Ejecución',
    contenido: 'Plazo referencial de ejecución: {{plazoDias}} días corridos desde la fecha de inicio de obra notificada por la Universidad.',
  },
  {
    id: 'garantias',
    titulo: '5. Garantías',
    contenido: 'a) Seriedad de la Oferta: boleta de garantía o vale vista por 1% a 3% del presupuesto referencial, vigencia desde la apertura hasta la adjudicación + 30 días. b) Fiel Cumplimiento del Contrato: 5% a 10% del monto contratado, vigencia igual al plazo de ejecución + 90 días. c) Correcta Ejecución / Vicios Ocultos: retención adicional o boleta por 5%-10%, con vigencia de 12 a 18 meses desde la Recepción Definitiva (conforme a la responsabilidad del constructor por vicios de construcción del Art. 2003 N°3 del Código Civil, y hasta 10 años si compromete elementos estructurales según Art. 18 de la Ley General de Urbanismo y Construcciones). Ajustar montos y plazos exactos con Coordinación de Calidad según la envergadura del proyecto.',
  },
  {
    id: 'multas',
    titulo: '6. Multas y Sanciones',
    contenido: 'Multa por atraso: 1‰ (uno por mil) a 2‰ del monto contratado por cada día corrido de atraso no justificado, con tope máximo de 10% a 15% del contrato. Superado el tope, o acumulados más de [definir] días de atraso, la Universidad podrá poner término anticipado al contrato y hacer efectiva la garantía de Fiel Cumplimiento. Aplican también multas por incumplimiento de normativa de seguridad (DS N°594) o por no contar con personal acreditado en obra.',
  },
  {
    id: 'forma-pago',
    titulo: '7. Forma de Pago',
    contenido: 'Pago mediante Estados de Pago mensuales según avance físico certificado por el Inspector Técnico de Obra (ITO), con retención de 5% a 10% liberada contra Recepción Conforme. Pago dentro de 30 días corridos desde la recepción de la factura asociada al estado de pago aprobado (conforme a la Ley N°21.131 de pago a 30 días). Toda factura debe emitirse una vez visado el estado de pago por el ITO.',
  },
  {
    id: 'requisitos-oferentes',
    titulo: '8. Requisitos de los Oferentes',
    contenido: 'Inscripción vigente en el registro de contratistas de la Universidad (o del MOP si aplica); experiencia mínima acreditable en obras similares en los últimos [3-5] años; Certificados F30 y F30-1 de la Dirección del Trabajo al día (cumplimiento laboral y previsional); póliza de responsabilidad civil por daños a terceros; cumplimiento de la Ley N°16.744 (seguro contra accidentes del trabajo) y, si subcontrata, de la Ley N°20.123 sobre subcontratación; situación financiera acorde al monto del contrato para obras de mayor envergadura.',
  },
  {
    id: 'criterios-evaluacion',
    titulo: '9. Criterios de Evaluación',
    contenido: 'Ponderación conforme a los parámetros SGC vigentes: Oferta Económica 55%, Oferta Técnica 35% (experiencia, plazo, metodología, cumplimiento de requerimientos y calidad de materiales), Sustentabilidad 10%. Verificar que estos porcentajes coincidan con los configurados en Parámetros SGC antes de convocar.',
  },
  {
    id: 'recepcion',
    titulo: '10. Recepción de la Obra',
    contenido: 'La obra tendrá una Recepción Provisoria, con observaciones si las hubiera y plazo para subsanarlas, y una Recepción Definitiva (Recepción Conforme) una vez subsanadas, verificada en terreno por el Responsable de Infraestructura y el ITO. Si el proyecto requiere permiso de edificación, debe además contar con la Recepción Municipal de la Dirección de Obras Municipales (DOM) conforme a la Ley General de Urbanismo y Construcciones, antes o como condición de la Recepción Definitiva institucional, según corresponda.',
  },
  {
    id: 'eett',
    titulo: '11. Especificaciones Técnicas (EETT)',
    contenido: 'Tipo de obra: {{tipoObra}}. Detalle las especificaciones técnicas por partida, materiales, calidades y normativa aplicable: Ordenanza General de Urbanismo y Construcciones (OGUC) para obra civil, Reglamento de Instalaciones Eléctricas (RIC) de la SEC para instalaciones eléctricas, RIDAA para instalaciones sanitarias, y Normas Chilenas (NCh) sectoriales pertinentes.',
  },
];

// ─── FAMILIA: OBRA MENOR / HABILITACIÓN ────────────────────────────────────
const PLANTILLA_OBRA_MENOR: SeccionBases[] = [
  {
    id: 'objeto',
    titulo: '1. Objeto de la Licitación',
    contenido: 'Describa el objeto del contrato: {{nombreProyecto}} ({{tipoObra}}), ubicado en {{campus}}{{edificio}}. Detalle el alcance de los trabajos de remodelación/habilitación a ejecutar y las partidas afectadas.',
  },
  {
    id: 'modalidad',
    titulo: '2. Modalidad de Contratación',
    contenido: 'Contrato a Suma Alzada: el proveedor adjudicado ejecuta la totalidad de los trabajos especificados por un precio fijo. Al ser una obra de menor escala, el riesgo de cantidades no contempladas es acotado.',
  },
  {
    id: 'presupuesto',
    titulo: '3. Presupuesto Referencial',
    contenido: 'Presupuesto estimado: {{montoEstimado}} (IVA incluido). Las ofertas que superen este monto podrán ser declaradas inadmisibles según lo defina la comisión evaluadora.',
  },
  {
    id: 'plazo',
    titulo: '4. Plazo de Ejecución',
    contenido: 'Plazo referencial de ejecución: {{plazoDias}} días corridos desde la fecha de inicio de obra notificada por la Universidad. Considere holguras por coordinación con la operación normal del recinto intervenido (docencia, uso de espacios comunes).',
  },
  {
    id: 'garantias',
    titulo: '5. Garantías',
    contenido: 'Para obras menores, evalúe con Coordinación de Calidad según el monto: bajo el umbral de Acta obligatoria ($800.001) suele bastar con retención de 5%-10% sobre los estados de pago, sin boleta de garantía. Sobre ese umbral, exigir Fiel Cumplimiento (5%-10% del contrato, vigencia plazo de ejecución + 90 días) y una retención o boleta de Correcta Ejecución (5%-10%, vigencia 6 a 12 meses desde la recepción, dado el menor riesgo constructivo respecto de obra nueva).',
  },
  {
    id: 'multas',
    titulo: '6. Multas y Sanciones',
    contenido: 'Multa por atraso: 1‰ a 2‰ del monto contratado por día corrido de atraso no justificado, tope máximo 10% del contrato. Incluir además causal de multa por daños a instalaciones existentes o incumplimiento de horarios de trabajo coordinados con la operación del recinto (docencia, uso de espacios comunes).',
  },
  {
    id: 'forma-pago',
    titulo: '7. Forma de Pago',
    contenido: 'Pago mediante Estados de Pago según avance físico certificado por el ITO, dentro de 30 días corridos desde la factura (Ley N°21.131). Para trabajos de corta duración (bajo 30 días de plazo) o bajo el umbral de Acta obligatoria, evalúe pago único contra Recepción Conforme en vez de estados de pago mensuales.',
  },
  {
    id: 'requisitos-oferentes',
    titulo: '8. Requisitos de los Oferentes',
    contenido: 'Inscripción vigente en el registro de contratistas de la Universidad; experiencia mínima en obras de remodelación o habilitación similares; Certificados F30 y F30-1 de la Dirección del Trabajo al día; cumplimiento de la Ley N°16.744 (seguro de accidentes del trabajo). Para montos menores, puede eximirse la exigencia de situación financiera acreditada, a criterio de Coordinación de Calidad.',
  },
  {
    id: 'criterios-evaluacion',
    titulo: '9. Criterios de Evaluación',
    contenido: 'Ponderación conforme a los parámetros SGC vigentes: Oferta Económica 55%, Oferta Técnica 35% (experiencia, plazo, metodología), Sustentabilidad 10%. Verificar que estos porcentajes coincidan con los configurados en Parámetros SGC antes de convocar.',
  },
  {
    id: 'recepcion',
    titulo: '10. Recepción de la Obra',
    contenido: 'Recepción Conforme verificada en terreno por el Responsable de Infraestructura, confirmando que no queden interferencias con la operación normal del recinto intervenido. Si la obra requiere regularización o permiso municipal (ej. cambio de uso, ampliación de superficie), debe contar además con la Recepción de la Dirección de Obras Municipales (DOM) antes del cierre.',
  },
  {
    id: 'eett',
    titulo: '11. Especificaciones Técnicas (EETT)',
    contenido: 'Tipo de obra: {{tipoObra}}. Detalle partidas de demolición/retiro si aplica, materiales de terminación, y compatibilidad con la normativa vigente del recinto intervenido (OGUC, RIC-SEC para eléctrico, RIDAA para sanitario, según corresponda).',
  },
];

// ─── FAMILIA: DISEÑO Y CONSULTORÍA ─────────────────────────────────────────
const PLANTILLA_DISENO: SeccionBases[] = [
  {
    id: 'objeto',
    titulo: '1. Objeto de la Licitación',
    contenido: 'Describa el objeto del contrato de consultoría: desarrollo del diseño de {{nombreProyecto}}, ubicado en {{campus}}{{edificio}}. Especifique las especialidades requeridas (arquitectura, cálculo estructural, eléctrico, sanitario, climatización, u otras).',
  },
  {
    id: 'modalidad',
    titulo: '2. Modalidad de Contratación',
    contenido: 'Contrato de prestación de servicios de consultoría a suma alzada por etapa de diseño: el consultor adjudicado desarrolla la totalidad de los entregables especificados por un precio fijo.',
  },
  {
    id: 'presupuesto',
    titulo: '3. Presupuesto Referencial',
    contenido: 'Presupuesto estimado: {{montoEstimado}} (IVA incluido). Las ofertas que superen este monto podrán ser declaradas inadmisibles según lo defina la comisión evaluadora.',
  },
  {
    id: 'plazo',
    titulo: '4. Plazo de Desarrollo del Proyecto',
    contenido: 'Plazo referencial de desarrollo: {{plazoDias}} días corridos desde la orden de inicio, distribuidos por etapa (anteproyecto, proyecto de especialidades, ingreso a permisos).',
  },
  {
    id: 'garantias',
    titulo: '5. Garantías',
    contenido: 'a) Seriedad de la Oferta: 1%-3% del presupuesto referencial. b) Fiel Cumplimiento del Contrato de consultoría: 5%-10% del monto contratado, vigencia plazo de desarrollo + 60 días. No corresponde garantía de correcta ejecución de obra, al no existir ejecución física; en su lugar, considere una retención del último pago hasta la aprobación formal de todos los entregables.',
  },
  {
    id: 'multas',
    titulo: '6. Multas y Sanciones',
    contenido: 'Multa por atraso en la entrega de cada hito: 1‰ a 2‰ del monto contratado por día corrido de atraso, tope máximo 10%-15% del contrato. Incluir causal de término anticipado si el diseño es rechazado reiteradamente por incumplir la normativa aplicable (OGUC, normas sectoriales) o los requerimientos del mandante.',
  },
  {
    id: 'forma-pago',
    titulo: '7. Forma de Pago',
    contenido: 'Pago por hitos de entrega y aprobación formal de antecedentes (ej. 30% anteproyecto, 40% proyecto de especialidades, 30% ingreso y obtención de permisos), no por avance físico de obra. Pago dentro de 30 días corridos desde la factura asociada al hito aprobado (Ley N°21.131).',
  },
  {
    id: 'requisitos-oferentes',
    titulo: '8. Requisitos de los Oferentes',
    contenido: 'Inscripción vigente de los profesionales responsables en los colegios/registros correspondientes (Colegio de Arquitectos, Colegio de Ingenieros, según especialidad); experiencia mínima acreditable en proyectos de diseño similares; Certificados F30 y F30-1 de la Dirección del Trabajo al día si corresponde a una oficina con personal dependiente.',
  },
  {
    id: 'criterios-evaluacion',
    titulo: '9. Criterios de Evaluación',
    contenido: 'Ponderación conforme a los parámetros SGC vigentes: Oferta Económica 55%, Oferta Técnica 35% (experiencia del equipo profesional, metodología y plazo de desarrollo), Sustentabilidad 10%. Verificar que estos porcentajes coincidan con los configurados en Parámetros SGC antes de convocar.',
  },
  {
    id: 'recepcion',
    titulo: '10. Recepción y Aprobación Final',
    contenido: 'La recepción de los antecedentes de diseño se ajustará a la aprobación formal de la Unidad Técnica en cada hito, verificando cumplimiento normativo y del mandante antes del cierre del contrato.',
  },
  {
    id: 'eett',
    titulo: '11. Especificaciones Técnicas (EETT)',
    contenido: 'Tipo de proyecto: {{tipoObra}}. Detalle el alcance técnico esperado del diseño: especialidades incluidas, normativa aplicable (OGUC, normas sectoriales) y formato de entrega de los antecedentes (planos, especificaciones, informes de cálculo).',
  },
];

// ─── FAMILIA: SUMINISTRO / COMPRA DE ELEMENTOS ─────────────────────────────
const PLANTILLA_SUMINISTRO: SeccionBases[] = [
  {
    id: 'objeto',
    titulo: '1. Objeto de la Licitación',
    contenido: 'Describa el objeto del contrato: suministro de {{nombreProyecto}} para {{campus}}{{edificio}}. Detalle los bienes/elementos a adquirir, cantidades y características técnicas.',
  },
  {
    id: 'modalidad',
    titulo: '2. Modalidad de Contratación',
    contenido: 'Contrato de suministro a precio fijo: el proveedor adjudicado entrega la totalidad de los bienes especificados por un precio cerrado, incluyendo despacho e instalación si corresponde.',
  },
  {
    id: 'presupuesto',
    titulo: '3. Presupuesto Referencial',
    contenido: 'Presupuesto estimado: {{montoEstimado}} (IVA incluido). Las ofertas que superen este monto podrán ser declaradas inadmisibles según lo defina la comisión evaluadora.',
  },
  {
    id: 'plazo',
    titulo: '4. Plazo de Entrega',
    contenido: 'Plazo referencial de entrega: {{plazoDias}} días corridos desde la emisión de la Orden de Compra.',
  },
  {
    id: 'garantias',
    titulo: '5. Garantías',
    contenido: 'a) Seriedad de la Oferta: 1%-3% del presupuesto referencial (solo para montos mayores; en compras menores puede omitirse). b) Garantía de calidad y vicios ocultos de los bienes: retención de 5%-10% del pago o boleta con vigencia de 6 a 12 meses desde la recepción conforme, para cubrir fallas de fabricación no evidentes al momento de la entrega.',
  },
  {
    id: 'multas',
    titulo: '6. Multas y Sanciones',
    contenido: 'Multa por atraso en la entrega: 1‰ a 2‰ del monto contratado por día corrido de atraso, tope máximo 10% del contrato. Multa adicional por entrega de bienes que no cumplan las especificaciones técnicas ofertadas, sujeta a rechazo y reposición sin costo para la Universidad.',
  },
  {
    id: 'forma-pago',
    titulo: '7. Forma de Pago',
    contenido: 'Pago contra Recepción Conforme de los bienes, verificando cantidad, estado y cumplimiento de especificaciones técnicas, dentro de 30 días corridos desde la factura (Ley N°21.131). Para suministros con instalación, evaluar un pago parcial contra despacho y el saldo contra puesta en marcha/instalación conforme.',
  },
  {
    id: 'requisitos-oferentes',
    titulo: '8. Requisitos de los Oferentes',
    contenido: 'Representación o distribución autorizada de la marca (si aplica), experiencia en suministros similares, y certificaciones de calidad o normativa técnica exigida al producto (ej. certificación SEC para artefactos eléctricos). Si el suministro incluye instalación, exigir además Certificados F30/F30-1 y cumplimiento de la Ley N°16.744.',
  },
  {
    id: 'criterios-evaluacion',
    titulo: '9. Criterios de Evaluación',
    contenido: 'Ponderación conforme a los parámetros SGC vigentes: Oferta Económica 55%, Oferta Técnica 35% (plazo de entrega, calidad/marca, garantía post-venta), Sustentabilidad 10%. Verificar que estos porcentajes coincidan con los configurados en Parámetros SGC antes de convocar.',
  },
  {
    id: 'recepcion',
    titulo: '10. Recepción de los Elementos',
    contenido: 'La recepción se ajustará a la verificación en bodega o en terreno de la cantidad, estado y especificaciones de los bienes entregados, antes del cierre del contrato.',
  },
  {
    id: 'eett',
    titulo: '11. Especificaciones Técnicas (EETT)',
    contenido: 'Tipo de adquisición: {{tipoObra}}. Detalle marca/modelo referencial (si aplica), normativa o certificaciones exigidas, y condiciones de garantía post-venta.',
  },
];

const PLANTILLAS_POR_FAMILIA: Record<FamiliaBases, SeccionBases[]> = {
  'obra-civil': PLANTILLA_OBRA_CIVIL,
  'obra-menor': PLANTILLA_OBRA_MENOR,
  'diseno': PLANTILLA_DISENO,
  'suministro': PLANTILLA_SUMINISTRO,
  'otros': PLANTILLA_OBRA_CIVIL, // familia genérica: usa la estructura completa como base más segura
};

/** @deprecated usar PLANTILLAS_POR_FAMILIA['obra-civil'] */
export const PLANTILLA_BASES_SUMA_ALZADA = PLANTILLA_OBRA_CIVIL;

const STORAGE_KEY_POR_FAMILIA: Record<FamiliaBases, string> = {
  'obra-civil': 'infra_app_plantilla_bases_v3_obra-civil',
  'obra-menor': 'infra_app_plantilla_bases_v3_obra-menor',
  'diseno': 'infra_app_plantilla_bases_v3_diseno',
  'suministro': 'infra_app_plantilla_bases_v3_suministro',
  'otros': 'infra_app_plantilla_bases_v3_otros',
};

/** Obtiene la plantilla maestra (editable en Configuración) de una familia de bases, persistida en localStorage. */
export function getPlantillaBasesPorFamilia(familia: FamiliaBases): SeccionBases[] {
  const key = STORAGE_KEY_POR_FAMILIA[familia];
  const defecto = PLANTILLAS_POR_FAMILIA[familia];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defecto));
      return defecto;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defecto;
  } catch (e) {
    console.error(`Error leyendo la plantilla de bases (${familia}):`, e);
    return defecto;
  }
}

/** Guarda cambios a la plantilla maestra de una familia de bases (afecta a todos los proyectos nuevos de ese tipo). */
export function guardarPlantillaBasesPorFamilia(familia: FamiliaBases, secciones: SeccionBases[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_POR_FAMILIA[familia], JSON.stringify(secciones));
  } catch (e) {
    console.error(`Error al guardar la plantilla de bases (${familia}):`, e);
  }
}

/** Restaura la plantilla maestra de una familia a su contenido original de fábrica. */
export function restaurarPlantillaBasesPorFamilia(familia: FamiliaBases): SeccionBases[] {
  const original = PLANTILLAS_POR_FAMILIA[familia];
  guardarPlantillaBasesPorFamilia(familia, original);
  return original;
}

/** Atajo: obtiene la plantilla correcta a partir del Tipo de Obra del proyecto. */
export function getPlantillaBasesPorTipoObra(tipoObra?: string): SeccionBases[] {
  return getPlantillaBasesPorFamilia(obtenerFamiliaPorTipoObra(tipoObra));
}

/** @deprecated usar getPlantillaBasesPorFamilia('obra-civil') o getPlantillaBasesPorTipoObra */
export function getPlantillaBasesSumaAlzada(): SeccionBases[] {
  return getPlantillaBasesPorFamilia('obra-civil');
}

/** Reemplaza los marcadores {{campo}} de una sección con los datos reales del proyecto. */
export function aplicarDatosAPlantilla(contenido: string, datos: Record<string, string>): string {
  return contenido.replace(/\{\{(\w+)\}\}/g, (_match, campo) => datos[campo] ?? `{{${campo}}}`);
}
