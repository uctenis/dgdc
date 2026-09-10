import type { SeccionBases } from './basesTemplateData';

export type SeccionContrato = SeccionBases;

/**
 * Umbral desde el cual una licitación adjudicada requiere un Contrato formal
 * bilateral (además de la Orden de Compra). Bajo este monto, la OC es
 * suficiente respaldo administrativo. Reutiliza el mismo tramo que activa las
 * boletas de garantía completas (ver basesTemplateData.ts) porque un contrato
 * que exige boletas bancarias completas amerita, por coherencia, quedar
 * formalizado en un contrato firmado, no solo en una Orden de Compra.
 */
export const UMBRAL_CONTRATO_FORMAL = 5000001;

export function requiereContratoFormal(montoAdjudicado: number): boolean {
  return montoAdjudicado >= UMBRAL_CONTRATO_FORMAL;
}

/**
 * Plantilla basada en un contrato de construcción a Suma Alzada realmente
 * utilizado por la Universidad ("CONTRATO DE CONSTRUCCIÓN MODALIDAD SUMA
 * ALZADA"), consolidando sus 22 cláusulas en secciones editables. Los datos
 * institucionales fijos (Rectora, RUT UC Temuco, domicilio, cláusula Ley
 * 21.369) están pre-cargados con los datos vigentes conocidos — verifíquelos
 * antes de usar, ya que pueden cambiar (ej. cambio de Rector/a).
 */
export const PLANTILLA_CONTRATO_OBRA_CIVIL: SeccionContrato[] = [
  {
    id: 'comparecencia',
    titulo: 'Comparecencia',
    contenido: 'En Temuco, a {{fechaContrato}}, entre la UNIVERSIDAD CATÓLICA DE TEMUCO, Casa de Estudios Superiores, RUT N°71.918.700-5, representada por su Rectora doña Marcela Momberg Alarcón, RUT N°9.932.229-2, ambos domiciliados para efectos de este contrato en Avenida Alemania N°0211 de la ciudad de Temuco, en adelante el "MANDANTE"; y de otra parte, {{proveedorNombre}}, RUT {{proveedorRut}}, representada legalmente por {{proveedorRepresentante}}, en adelante el "PRESTADOR" o "CONTRATISTA", domiciliado en {{proveedorDireccion}}, han acordado la suscripción de un contrato de construcción, en modalidad {{modalidadNombre}}, respecto de la obra "{{nombreProyecto}}" ({{codigoProyecto}}), en los términos y condiciones que se indican a continuación.',
  },
  {
    id: 'antecedentes',
    titulo: 'Antecedentes',
    contenido: 'I. La Universidad Católica de Temuco, en adelante el MANDANTE, ha adjudicado al PRESTADOR, mediante el proceso de licitación {{codigoProyecto}} (CP {{codigoCP}}), la ejecución de las obras de "{{nombreProyecto}}" ({{tipoObra}}), ubicadas en {{campus}}{{edificio}}. II. El PRESTADOR acepta ejecutar los trabajos de acuerdo con los antecedentes técnicos, Bases Administrativas y Técnicas, y la oferta presentada en dicho proceso, declarando conocerlos. III. Los antecedentes y argumentos que avalan la adjudicación figuran en el acta de adjudicación respectiva.',
  },
  {
    id: 'objeto',
    titulo: 'Primera — Objeto del Contrato',
    contenido: '1.1 El presente contrato y sus anexos (Presupuesto Oficial, Programa de Obra / Carta Gantt, Programa Financiero y Condiciones Particulares) son los únicos documentos válidos para regular las relaciones entre las partes, dejando sin efecto cualquier previsión de la oferta del PRESTADOR o de la documentación precedente a la firma. 1.2 El MANDANTE encarga al PRESTADOR la ejecución de la totalidad de la obra "{{nombreProyecto}}" según lo estudiado en el proceso de licitación, incluyendo aclaraciones del proceso de consultas, que el PRESTADOR declara conocer. 1.3 El PRESTADOR reconoce como interlocutores válidos únicamente a los representantes que determine el MANDANTE.',
  },
  {
    id: 'precio',
    titulo: 'Segunda — Precio',
    contenido: 'El precio del contrato es el consignado en la propuesta económica adjudicada del PRESTADOR, reconocido como "Presupuesto Oficial" (Anexo N°1) a partir de la firma de este contrato, correspondiente a {{montoAdjudicado}} IVA incluido. {{notaModalidadPrecio}}',
  },
  {
    id: 'plazo',
    titulo: 'Tercera — Plazos de Ejecución',
    contenido: 'El plazo de ejecución adjudicado corresponde a {{plazoDias}} días corridos, conforme al Programa de Obra con Ruta Crítica e identificación de hitos (Anexo N°2), que forma parte integral de este contrato. Dichos plazos podrán ser modificados por el MANDANTE para adaptarlos a la buena marcha de las obras, previa comunicación al PRESTADOR. Si se produjese retraso por causas imputables al MANDANTE o fuerza mayor, el PRESTADOR tendrá derecho a una prórroga igual a la demora, siempre que haya sido reconocida previamente y por escrito por el MANDANTE.\n\nFechas que regulan el contrato:\n- Fecha de Contrato: {{fechaContrato}}\n- Fecha de Inicio de Obras: {{fechaInicioObra}}\n- Plazo: {{plazoDias}} días corridos\n- Fecha de Término: {{fechaTermino}}',
  },
  {
    id: 'ejecucion-calidad',
    titulo: 'Cuarta — Ejecución de los Trabajos y Calidad',
    contenido: 'El PRESTADOR no podrá cambiar marcas ni especificaciones técnicas de materiales, equipos o máquinas sin autorización previa del MANDANTE. Presentará muestras de materiales antes del inicio de los trabajos para su aprobación por la Inspección de Obra. Todos los trabajos cumplirán los pliegos de condiciones técnicas y normas de obligado cumplimiento aplicables, empleando materiales certificados. La calidad de los trabajos se subordina a la aprobación de la Inspección de Obra, quien podrá exigir controles, pruebas y ensayos a costa del PRESTADOR. Los trabajos se realizan a riesgo del PRESTADOR.',
  },
  {
    id: 'multas',
    titulo: 'Quinta — Multas',
    contenido: 'El incumplimiento de los hitos del Anexo N°2 dará derecho al MANDANTE a exigir una penalización equivalente al 0,02% del importe global del contrato por cada día de retraso. La sumatoria de multas no podrá exceder el 15% del precio total del contrato; superado ese porcentaje, la Universidad podrá resolver el contrato reteniendo la facturación pendiente y las garantías, previa liquidación. Si el atraso supera los 30 días corridos respecto al plazo contractual, la Universidad podrá resolver el contrato de pleno derecho mediante notificación escrita. No serán aplicables sanciones por causas imputables al MANDANTE o de fuerza mayor.',
  },
  {
    id: 'forma-pago',
    titulo: 'Sexta — Medición, Facturación y Forma de Pago',
    contenido: 'Las cantidades a facturar corresponderán a obra realmente ejecutada, según el Presupuesto Oficial. Mensualmente se realizará una medición a origen de las partidas ejecutadas (Estado de Pago), con conformidad de la Inspección de Obra; con resultado conforme, el PRESTADOR enviará factura dentro de los primeros 5 días del mes siguiente. El pago se realiza mediante transferencia bancaria, dentro de 30 días corridos desde la factura conforme (Ley N°21.131), previa revisión del Estado de Pago por la Universidad (plazo referencial de 3 días hábiles). El PRESTADOR podrá solicitar un anticipo de hasta 10% del monto del contrato, si así se acuerda.',
  },
  {
    id: 'garantias',
    titulo: 'Séptima — Retenciones, Garantías y Seguros',
    contenido: '{{notaGarantias}} Adicionalmente, el PRESTADOR se obliga a contratar Seguro de Responsabilidad Civil y Seguro de Todo Riesgo de Construcción, y a asegurar la maquinaria y equipos que emplee en obra (incluyendo robo e incendio).',
  },
  {
    id: 'recepcion',
    titulo: 'Octava — Terminación, Acta de Recepción y Garantía Post-Venta',
    contenido: 'Concluidos los trabajos, el PRESTADOR comunicará su término al MANDANTE, quien dispondrá de 15 días para inspeccionar las obras en presencia del PRESTADOR, levantando acta que certifique si las obras son conformes, incompletas/defectuosas (con plazo de subsanación no superior a 15 días), o conformes con trabajos menores pendientes. La liquidación de la obra se efectúa al suscribirse el acta de recepción con resultado positivo. Se establece un período de garantía post-venta de 365 días desde el acta de recepción, caucionado con Boleta de Garantía de Correcta Ejecución o póliza equivalente. Aplican además los plazos del Art. 18 de la Ley General de Urbanismo y Construcciones.',
  },
  {
    id: 'obligaciones-laborales',
    titulo: 'Novena — Obligaciones Laborales, Previsionales, Seguridad y Medio Ambiente',
    contenido: 'El PRESTADOR es el único responsable del cumplimiento de las leyes laborales, previsionales y de seguridad social de su personal, no existiendo vínculo laboral ni subordinación entre este y el MANDANTE. El PRESTADOR no podrá ceder ni subcontratar sin autorización escrita de la Universidad, manteniéndose siempre su responsabilidad directa. Debe cumplir y hacer cumplir la normativa de prevención de riesgos laborales (incluyendo suministro de EPP a su personal) y toda la normativa medioambiental aplicable, siendo responsable de las consecuencias de su incumplimiento, incluyendo multas equivalentes a las que impongan las autoridades competentes.',
  },
  {
    id: 'resolucion',
    titulo: 'Décima — Resolución del Contrato',
    contenido: 'Son causas de resolución, además de las previstas en cláusulas anteriores: extinción de la personalidad jurídica de alguna de las partes; falta de capacidad técnica, laboral o económica del PRESTADOR; incumplimiento grave o reiterado de normativa de prevención de riesgos o medio ambiente; falta de subsanación de defectos; mutuo acuerdo; e incumplimiento total o parcial de las cláusulas del contrato. En caso de retraso en los hitos por causa del PRESTADOR, el MANDANTE podrá ejecutar los trabajos pendientes por sus propios medios o con terceros, cubriendo los costos con las cantidades adeudadas al PRESTADOR, garantías o retenciones, con un recargo del 15% a cargo del PRESTADOR.',
  },
  {
    id: 'generales',
    titulo: 'Undécima — Jurisdicción y Normas Generales',
    contenido: 'Ambas partes se someten a la jurisdicción de los juzgados y tribunales de la ciudad de Temuco. El PRESTADOR no podrá transmitir ni utilizar para otros fines los conocimientos y especificaciones de la obra o del MANDANTE. Conforme a la Ley N°21.369, forman parte integrante de este contrato la Política de Género de la UC Temuco y la normativa asociada contra el acoso sexual, la violencia y la discriminación de género, disponible en https://direcciongenero.uct.cl/, que las partes declaran conocer y les resulta vinculante.',
  },
  {
    id: 'firmas',
    titulo: 'Firmas',
    contenido: 'En los términos convenidos y ratificándose ambas partes, firman el presente contrato, por triplicado, quedando dos ejemplares en poder de la Universidad y uno en poder del PRESTADOR, en el lugar y fecha indicados en el encabezamiento.',
  },
];

const TEXTO_PRECIO_SUMA_ALZADA = 'Los precios del Presupuesto Oficial (Anexo N°1) serán fijos y no estarán sujetos a revisión, ni siquiera por variaciones de precios de materiales u otro motivo externo, por corresponder la modalidad de este contrato a Suma Alzada. El PRESTADOR asume el riesgo de cantidades de obra no contempladas explícitamente.';
const TEXTO_PRECIO_SERIE_PRECIOS = 'El monto indicado es referencial: el precio final del contrato se determinará según los precios unitarios ofertados por partida y las cantidades de obra efectivamente ejecutadas y medidas en terreno (cubicación real), por corresponder la modalidad de este contrato a Serie de Precios Unitarios. El MANDANTE asume el riesgo de mayores o menores cantidades respecto del presupuesto referencial.';
const TEXTO_PRECIO_ADMINISTRACION_DIRECTA = 'Por corresponder la modalidad de este contrato a Administración Directa, el monto indicado es una estimación referencial: el PRESTADOR será remunerado por los costos efectivamente incurridos (materiales, mano de obra, equipos) más el margen o tarifa administrativa pactada, sin que exista un precio total cerrado por el alcance completo.';

export function resolverNotaModalidadPrecio(modalidad: 'Suma Alzada' | 'Serie de Precios' | 'Administración Directa'): string {
  if (modalidad === 'Serie de Precios') return TEXTO_PRECIO_SERIE_PRECIOS;
  if (modalidad === 'Administración Directa') return TEXTO_PRECIO_ADMINISTRACION_DIRECTA;
  return TEXTO_PRECIO_SUMA_ALZADA;
}

const TEXTO_GARANTIAS_CONTRATO_SIN = 'Dado el monto de este contrato, inferior al umbral de exigencia de garantías formales, no corresponde exigir boletas de garantía bancarias. Esto no exime al PRESTADOR de su responsabilidad contractual y legal por la correcta ejecución de lo contratado.';
const TEXTO_GARANTIAS_CONTRATO_RETENCION = 'En vez de boletas de garantía bancarias, se establece una retención de 5% sobre cada factura, la cual responderá de la correcta ejecución de la obra y del cumplimiento de las obligaciones del PRESTADOR. Su devolución se realizará conforme a lo indicado en la cláusula de Terminación y Garantía Post-Venta.';
const TEXTO_GARANTIAS_CONTRATO_COMPLETAS = 'Se establece una retención del 5% del monto de cada factura, que junto con las boletas exigidas responderá de la correcta ejecución de la obra y demás obligaciones del PRESTADOR. El PRESTADOR debe proporcionar una Boleta de Fiel Cumplimiento del Contrato o póliza equivalente por el 5% del contrato, con vigencia de 60 días luego de la Recepción Provisoria de las obras. Adicionalmente, para el período de garantía post-venta, deberá proporcionar una Boleta de Garantía de Correcta Ejecución (o póliza equivalente) por el 5%, con vigencia de 365 días desde el Acta de Recepción.';

export function resolverNotaGarantiasContrato(politica: 'Sin Garantías' | 'Retención sobre Estados de Pago' | 'Boletas de Garantía Completas' | undefined): string {
  if (politica === 'Sin Garantías') return TEXTO_GARANTIAS_CONTRATO_SIN;
  if (politica === 'Retención sobre Estados de Pago') return TEXTO_GARANTIAS_CONTRATO_RETENCION;
  return TEXTO_GARANTIAS_CONTRATO_COMPLETAS;
}

const STORAGE_KEY_CONTRATO_OBRA_CIVIL = 'infra_app_plantilla_contrato_v1_obra-civil';

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
