import type { ParametrosCalculoGG } from '../utils/gastosGenerales';

// ─── DATOS DEL CONTRATISTA PARA EL CONTRATO ────────────────────────────────
export interface RepresentanteLegal {
  /** Tratamiento con que se cita en el contrato (se pide, no se deduce del nombre). */
  tratamiento: 'don' | 'doña';
  nombre: string;
  /** Cédula de identidad. */
  rut: string;
}

/** Lo que el contrato necesita de cada contratista: quién firma, dónde se domicilia y con qué personería. */
export interface DatosContratista {
  representantes: RepresentanteLegal[];
  domicilioLegal: string;
  /** Documento que acredita a los representantes (ej. Certificado de Estatuto Actualizado, escritura pública). */
  personeria: string;
  datosBancarios?: { banco: string; tipoCuenta: string; numeroCuenta: string; titular: string; rutTitular: string };
}

// ─── PROVEEDOR ─────────────────────────────────────────────────────────────
export interface Proveedor {
  id: string;
  rut: string;
  razonSocial: string;
  nombreContacto: string;
  email: string;
  telefono: string;
  rubro: string; // Ej: Obras Menores, Electricidad, Climatizaciones, Pintura, Obras Civiles
  cuentaSustentabilidad: boolean;
  direccion?: string;
  ciudad?: string;
  /** Representantes legales, domicilio y personería: se usan para redactar el contrato. */
  datosContrato?: DatosContratista;
  /** Carpeta de documentos de la empresa (F30, vigencia, seguros...) con su fecha de vencimiento. */
  documentos?: DocumentoProveedor[];
  estado: 'Activo' | 'Inactivo';
  fechaRegistro: string;
}

// ─── INSCRIPCIÓN DE PROVEEDORES POR INVITACIÓN ────────────────────────────
// `inscripcionesProveedores/{código}`: la UCT invita a una empresa con un enlace personal (el código es el id del
// documento); la empresa completa sus datos y sube los requisitos; la UCT revisa, aprueba y solicita a
// Adquisiciones el registro oficial.
export type EstadoInscripcion = 'Invitada' | 'Enviada' | 'Observada' | 'Aprobada' | 'Rechazada' | 'Solicitada a Adquisiciones' | 'Registrada';

export interface DocumentoInscripcion { nombre: string; url: string; fechaEmision?: string; fechaCarga: string }

export interface InscripcionProveedor {
  id: string;
  razonSocialInvitada: string;
  emailInvitado: string;
  invitadaPor: string;
  fechaInvitacion: string;
  estado: EstadoInscripcion;
  datos?: {
    rut: string; razonSocial: string; giro: string; rubro: string;
    nombreContacto: string; email: string; telefono: string; direccion: string; ciudad: string;
    representanteLegal: string; rutRepresentante: string;
    datosBancarios: { banco: string; tipoCuenta: string; numeroCuenta: string; titular: string; rutTitular: string };
  };
  /** Requisito (id de REQUISITOS_INSCRIPCION) → archivo subido. */
  documentos?: Record<string, DocumentoInscripcion>;
  sustentabilidad?: { declara: boolean; descripcion?: string };
  fechaEnvio?: string;
  /** Observaciones de la UCT (al pedir correcciones o rechazar). */
  observaciones?: string;
  revisadaPor?: string;
  fechaRevision?: string;
  proveedorId?: string;
  solicitudAdquisiciones?: { fecha: string; por: string };
  fechaRegistroOficial?: string;
}

// ─── DOCUMENTOS DEL PROVEEDOR CON VENCIMIENTO ─────────────────────────────
export const TIPOS_DOCUMENTO_PROVEEDOR = [
  'Certificado F30 (Antecedentes Laborales y Previsionales)',
  'Certificado F30-1 (Cumplimiento de Obligaciones Laborales)',
  'Certificado de Vigencia de la Sociedad',
  'Escritura / Estatutos',
  'Seguro de Responsabilidad Civil',
  'Certificado de Mutualidad (tasa de accidentabilidad)',
  'Otro',
] as const;
export type TipoDocumentoProveedor = typeof TIPOS_DOCUMENTO_PROVEEDOR[number];

export interface DocumentoProveedor {
  id: string;
  tipo: TipoDocumentoProveedor;
  /** Descripción libre (obligatoria si el tipo es "Otro"). */
  descripcion?: string;
  fechaEmision?: string;
  /** YYYY-MM-DD. Sin fecha = no vence (ej. escritura). */
  fechaVencimiento?: string;
  archivoNombre?: string;
  archivoURL?: string;
  fechaCarga: string;
  cargadoPor?: string;
}

// ─── GARANTÍAS DE LA LICITACIÓN / CONTRATO ────────────────────────────────
// Subcolección licitaciones/{id}/garantias.
export const TIPOS_GARANTIA = ['Seriedad de la Oferta', 'Fiel Cumplimiento del Contrato', 'Anticipo', 'Correcta Ejecución de la Obra', 'Otra'] as const;
export type TipoGarantia = typeof TIPOS_GARANTIA[number];
export const INSTRUMENTOS_GARANTIA = ['Boleta de Garantía Bancaria', 'Vale Vista', 'Póliza de Seguro', 'Certificado de Fianza'] as const;
export type InstrumentoGarantia = typeof INSTRUMENTOS_GARANTIA[number];

export interface GarantiaLicitacion {
  id: string;
  tipo: TipoGarantia;
  instrumento: InstrumentoGarantia;
  numero: string;
  /** Banco o compañía que la emite. */
  emisor: string;
  monto: number;
  moneda: 'CLP' | 'UF';
  proveedorId?: string;
  proveedorNombre?: string;
  fechaEmision?: string;
  /** YYYY-MM-DD */
  fechaVencimiento: string;
  estado: 'Vigente' | 'Devuelta' | 'Cobrada';
  fechaCambioEstado?: string;
  observaciones?: string;
  archivoNombre?: string;
  archivoURL?: string;
  fechaRegistro: string;
  registradaPor?: string;
}

// ─── HISTORIAL DE OBRAS POR PROVEEDOR ─────────────────────────────────────
export interface HistorialObra {
  id: string;
  licitacionId: string;
  codigoCP: string;
  codigoOP: string;
  nombreProyecto: string;
  montoTotal: number;
  plazoDias: number;
  resultado: 'Adjudicado' | 'No Adjudicado' | 'Invitado' | 'Participando';
  fecha: string; // fecha de adjudicación / cierre
  puntajeObtenido?: number;
  codigoOT?: string;
  codigoProyecto?: string;
  estadoLicitacion?: LicitacionProyecto['estado'];
  estadoLifecycle?: LicitacionProyecto['estadoLifecycle'];
  estadoActual?: 'Licitación activa' | 'Obra activa' | 'Proceso cerrado' | 'Finalizado';
  activo?: boolean;
}

// ─── EVALUACIÓN DE DESEMPEÑO POR PROVEEDOR (post-ejecución) ───────────────
// Criterios ponderados 1-5. Se registra al cierre de una obra (Recepción
// Conforme), a diferencia de HistorialObra.puntajeObtenido que califica la
// OFERTA al momento de licitar, no la ejecución real.
export interface CriterioDesempeno {
  id: 'calidad' | 'plazo' | 'seguridad' | 'garantias' | 'comunicacion';
  etiqueta: string;
  puntaje: number; // 1 a 5
  ponderacion: number; // 0 a 1, suma 1 entre todos los criterios
}

export interface EvaluacionDesempeno {
  id: string;
  licitacionId: string;
  codigoProyecto?: string;
  nombreProyecto: string;
  fecha: string;
  evaluadorEmail: string;
  evaluadorNombre: string;
  criterios: CriterioDesempeno[];
  puntajeFinal: number; // promedio ponderado, 1 a 5
  observaciones?: string;
}

// ─── PROYECTO MAESTRO ──────────────────────────────────────────────────────
export interface ProyectoMaestro {
  id: string;
  correlativo: number;       // auto-incremental: 1, 2, 3...
  codigoCP: string;          // 409-XXX
  codigoOP: string;          // OP-XXX
  codigoOT: string;          // OT-XXXX
  codigoProyecto: string;    // 2X_0XX
  /** Cartera (año presupuestario) a la que pertenece. Si falta, se deduce del código (ver anioDeCartera).
   * Puede ser posterior al año del código: un proyecto no aprobado pasa a la cartera siguiente con su código. */
  anioPresupuesto?: number;
  ordenCompraNumero?: string; // NRO OC (ej: OC-6790 or 6790)
  codigoOC?: string;
  nombre: string;
  descripcion: string;
  valorAprox: number;
  estado: 'Pendiente' | 'En Proceso' | 'Completado';
  fechaCreacion: string;

  // Datos de adjudicación y proveedor (sincronizados)
  proveedorAdjudicadoNombre?: string;
  proveedorAdjudicadoRut?: string;
  plazoEjecucionDias?: number;
  archivoOCNombre?: string;
  archivoOCURL?: string;
  fechaCargaOC?: string;

  // Datos financieros y de programación (PPTO)
  montoAdjudicado?: number;
  gastoEfectivo?: number;
  prioridad?: 'Alta' | 'Media' | 'Baja';
  fechaInicio?: string;
  fechaTermino?: string;
  /** Duración aproximada en días, estimada al crear el proyecto (antes de licitar) — distinta de
   * `plazoEjecucionDias`, que es el plazo REAL del contrato adjudicado. Sirve de respaldo para
   * proyectar `fechaTermino` en Avance Financiero mientras el proyecto todavía no tiene licitación. */
  duracionEstimadaDias?: number;

  /** Itemizado / partidas de referencia del proyecto — desglose progresivo del Presupuesto Estimado,
   * partida por partida, que se completa en la Ficha del Proyecto a medida que se detalla el alcance.
   * Es independiente del itemizado de cada Cotización (`ItemCotizacion`), que es la oferta del proveedor. */
  itemizado?: ItemItemizadoProyecto[];
  /** Gastos Generales y Utilidad del itemizado, en % — igual al esquema típico de un presupuesto de
   * construcción: Gastos Generales se calcula sobre el Costo Directo (suma de partidas), y Utilidad
   * sobre Costo Directo + Gastos Generales; el IVA se aplica al final, sobre ese Total Neto. Quedan
   * en 0 mientras no se definan (el Presupuesto Estimado es solo la suma de partidas + IVA). */
  itemizadoMarkup?: {
    gastosGeneralesPct: number;
    utilidadPct: number;
    /** Parámetros con que se estimó el % de Gastos Generales en la calculadora (plazo,
     * complejidad, recinto ocupado y ajustes) — respaldo del % aplicado. */
    calculoGG?: ParametrosCalculoGG;
  };
  /** Ítems del checklist de la Ficha marcados a mano, sin documento que los respalde. */
  checklistManual?: Record<string, boolean>;

  /** Programa de Trabajo / Carta Gantt referencial — calculado a partir de las fases del
   * itemizado (peso presupuestario de cada una) y la duración total declarada del proyecto,
   * con la secuencia y traslapes típicos de obra que sugiere la IA (ver ProgramaTrabajoPanel).
   * Es un programa REFERENCIAL para la Ficha, no reemplaza la Carta Gantt formal de licitación. */
  programaTrabajo?: {
    fechaGeneracion: string;
    duracionTotalDias: number;
    fases: { fase: string; diaInicio: number; diaTermino: number }[];
  };

  /** Aprobación explícita para entrar al Presupuesto Anual Proyectado — distinta de `prioridad`,
   * que es solo un criterio de apoyo para decidir. Solo los proyectos con `aprobado: true`
   * comprometen el techo institucional (`presupuestoAnualAprobado`) en el Flujo de Caja / Avance Financiero. */
  presupuesto?: {
    aprobado: boolean;
    /** true = revisado y rechazado para la cartera de su año (queda como candidato a la del año siguiente).
     * Sin `aprobado` ni `rechazado`, el proyecto está propuesto y pendiente de revisión. */
    rechazado?: boolean;
    /** true = devuelto con observaciones (ej. bajar el valor quitando partidas o reduciendo la envergadura):
     * el responsable ajusta el itemizado y lo reenvía a revisión. */
    observado?: boolean;
    /** true = el responsable ya ajustó el proyecto observado y lo reenvió; espera una nueva decisión. */
    ajustado?: boolean;
    /** Valor e itemizado con que el proyecto llegó a la revisión, para mostrar qué cambió con el ajuste. */
    baseAjuste?: { valor: number; partidas: { id: string; descripcion: string; precioTotal: number }[] };
    /** Observación de quien decidió (por qué se aprobó, observó o rechazó). */
    observacion?: string;
    fecha?: string;
    aprobadoPorNombre?: string;
    aprobadoPorEmail?: string;
  };
  /** Fundamento con que se defiende el proyecto en la revisión de la cartera (necesidad, beneficio, urgencia). */
  fundamento?: string;
  /** Historial de la revisión de cartera: decisiones, observaciones y ajustes de valor e itemizado, en orden. */
  historialRevision?: RevisionCarteraEntrada[];

  // Ubicación y Metadatos Institucionales (Filtros Avanzados)
  campusSigla?: string;      // ej: CSF, CJP, CRC
  campusNombre?: string;     // ej: Campus San Francisco
  edificioSigla?: string;    // ej: CSF10, CRC16, CJP08
  uso?: string;              // ej: DOCENCIA, ESPACIOS COMUNES
  tipoObra?: string;         // ej: REMODELACION, ALHAJAMIENTO
  rubro?: string;            // Rubro del proveedor asociado (ver rubrosData.ts)

  // Responsable de Infraestructura
  responsableNombre?: string; // ej: Arturo Meza, David Silva Roco
  responsableEmail?: string;  // ej: ameza@uct.cl, dsilva@uct.cl

  // Modalidad contractual (para estandarizar Bases Administrativas y Técnicas)
  modalidadContrato?: 'Suma Alzada' | 'Serie de Precios' | 'Administración Directa';

  // Política de garantías del contrato — depende del monto, se decide por proyecto (no es texto fijo de plantilla)
  politicaGarantias?: 'Sin Garantías' | 'Retención sobre Estados de Pago' | 'Boletas de Garantía Completas';

  // Bases Administrativas y Técnicas estandarizadas
  bases?: {
    version: number;
    estado: 'Borrador' | 'En Revisión Legal' | 'Aprobada';
    secciones: { id: string; titulo: string; contenido: string }[];
    fechaActualizacion: string;
    actualizadoPor?: string;
    fechaAprobacion?: string;
    aprobadoPor?: string;
    /** true si algún dato citado en el texto (presupuesto, plazo, tipo de obra, garantías, etc.)
     * cambió en el proyecto después de generar/aprobar estas Bases — ver updateProyectoMaestro. */
    desactualizada?: boolean;
    // Documento final (Word/PDF) editado fuera del sistema y vuelto a subir — es el que realmente
    // se publica/firma; independiente del borrador de texto editable en `secciones`.
    archivoFinalURL?: string;
    archivoFinalNombre?: string;
    archivoFinalFechaCarga?: string;
    archivoFinalCargadoPor?: string;
  };

  // Especificaciones Técnicas (EETT) — una especificación por cada partida del itemizado
  // (Presupuesto Estimativo), más generalidades de la obra. Se generan con IA y se editan a mano.
  eett?: EspecificacionesTecnicasProyecto;

  // Contrato de Adjudicación — se genera al adjudicar, con los datos reales del proveedor ganador
  // (distinto de "bases": bases son las reglas pre-adjudicación, el contrato es el documento bilateral post-adjudicación)
  contrato?: {
    version: number;
    estado: 'Borrador' | 'En Revisión Legal' | 'Firmado';
    secciones: { id: string; titulo: string; contenido: string; tabla?: string[][] }[];
    fechaActualizacion: string;
    actualizadoPor?: string;
    fechaFirma?: string;
    firmadoPor?: string;
  };

  // Antecedentes y Documentos del Proyecto (Planos y Documentos)
  documentosAntecedentes?: {
    id: string;
    nombre: string;
    tipo: 'Plano' | 'Documento' | 'Bases' | 'EETT' | 'Anexo';
    archivoURL?: string;
    archivoNombre?: string;
    fechaCarga: string;
    subidoPor?: string;
  }[];

  /** Carpeta del proyecto en Google Drive (dentro de la carpeta de su edificio). Los planos y documentos de
   * trabajo viven ahí: el sistema guarda solo el enlace, sin copia. */
  driveCarpetaUrl?: string;
  /** Documentos del proyecto que están en Drive (solo el enlace). Son internos: los proveedores no entran al
   * Drive de la UCT, así que lo que se les publica sigue subiéndose en los antecedentes de la licitación. */
  documentosDrive?: DocumentoDrive[];
}

/** Un paso de la revisión de cartera de un proyecto (ver ProyectoMaestro.historialRevision). */
export interface RevisionCarteraEntrada {
  fecha: string;
  /** Cartera en revisión. */
  anio: number;
  /** `ajuste` = el responsable modificó el proyecto observado y lo reenvió. */
  decision: 'aprobado' | 'rechazado' | 'observado' | 'pendiente' | 'ajuste';
  usuario?: string;
  observacion?: string;
  /** Presupuesto estimado del proyecto en ese momento. */
  valor: number;
  /** Valor con que había llegado a la revisión, si cambió. */
  valorAnterior?: number;
  /** Partidas del itemizado que cambiaron respecto de lo presentado (descripciones). */
  partidasEliminadas?: string[];
  partidasAgregadas?: string[];
  partidasModificadas?: string[];
}

export const TIPOS_DOCUMENTO_DRIVE =['Plano', 'EETT', 'Bases', 'Presupuesto', 'Carta Gantt', 'Otro'] as const;

export interface DocumentoDrive {
  id: string;
  nombre: string;
  tipo: typeof TIPOS_DOCUMENTO_DRIVE[number];
  /** Enlace al archivo o carpeta en Google Drive. */
  url: string;
  fechaVinculo: string;
  vinculadoPor?: string;
}

// ─── ITEM DE COTIZACIÓN ────────────────────────────────────────────────────
export interface ItemCotizacion {
  id: string;
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
}

// ─── ITEMIZADO DE REFERENCIA DEL PROYECTO (ProyectoMaestro.itemizado) ─────
// Desglose de partidas del presupuesto estimado, previo a licitar. `origen: 'IA'`
// marca partidas propuestas por el asistente (el usuario completa cantidad y precio).

/** Fases estándar de un proyecto de obra, en orden de ejecución — usadas para agrupar y
 * renumerar el itemizado (ver ItemizadoProyectoPanel). La IA etiqueta cada partida sugerida
 * con una de estas; las partidas manuales pueden asignarse a cualquiera. */
export const FASES_ITEMIZADO = [
  'Instalación de Faenas',
  'Desarme y Retiro',
  'Obra Gruesa',
  'Instalaciones',
  'Terminaciones',
  'Aseo y Entrega',
] as const;
export type FaseItemizado = typeof FASES_ITEMIZADO[number];

/** Especificación técnica de UNA partida del itemizado — enlazada por `partidaId` (id estable de
 * la partida; `item`/`descripcion` se guardan como referencia por si la partida cambia después). */
export interface EspecificacionPartida {
  partidaId: string;
  item: string;
  descripcion: string;
  unidad: string;
  especificacion: string;
  origen: 'IA' | 'Manual';
}

export interface EspecificacionesTecnicasProyecto {
  version: number;
  estado: 'Borrador' | 'Aprobada';
  generalidades: string;
  partidas: EspecificacionPartida[];
  fechaActualizacion: string;
  actualizadoPor?: string;
  fechaAprobacion?: string;
  aprobadoPor?: string;
}

export interface ItemItemizadoProyecto {
  id: string;
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
  origen: 'Manual' | 'IA' | 'Excel' | 'PDF';
  /** Sin valor = itemizado creado antes de esta clasificación, o partida aún sin asignar. */
  fase?: FaseItemizado | string;
  /** true = el precioUnitario fue estimado por la IA (Presupuesto Preciso), NO es una cotización
   * real — queda marcado en la UI como referencial hasta que el usuario lo valide o lo reemplace. */
  precioReferencial?: boolean;
}

// ─── COTIZACIÓN (cargada por admin) ───────────────────────────────────────
export interface Cotizacion {
  id: string;
  licitacionId: string;
  proveedorId: string;
  proveedorRut: string;
  proveedorNombre: string;
  montoNeto: number;
  montoIva: number;
  montoTotal: number; // Con IVA
  plazoDias: number;
  itemizado?: ItemCotizacion[];
  fechaCotizacion?: string;

  // Parámetros de Evaluación Técnica
  ajustaRequerimientos: boolean;
  cuentaExperiencia: boolean;
  cumplePlazoRequerido: boolean;

  // Parámetros de Sustentabilidad
  declaraSustentabilidad: boolean;
  tipoEvidenciaSustentable?: string;

  documentoCotizacionNombre?: string;
  documentoCotizacionURL?: string;
  documentoCotizacionDriveId?: string;
  documentoCotizacionStorage?: 'drive' | 'firebase';
  observaciones?: string;
  fechaCarga: string;

  // Origen de la cotización
  origenPropuestaId?: string; // Si fue generada desde una propuesta de proveedor
  /** Cuándo se RECIBIÓ la oferta (ISO). En las del portal es la hora de envío; en las manuales la indica el administrador. */
  fechaRecepcion?: string;
  ofertaTecnicaNombre?: string;
  ofertaTecnicaURL?: string;
  /** Solo en ingresos de emergencia hechos por el administrador: quién y por qué. */
  ingresoManual?: { motivo: string; porEmail: string; fecha: string };
}

// ─── INVITADO A LICITACIÓN ─────────────────────────────────────────────────
export interface InvitadoLicitacion {
  id: string;
  proveedorId: string;
  proveedorEmail: string;
  proveedorNombre: string;
  proveedorRut: string;
  fechaInvitacion: string;
  estadoPropuesta: 'Pendiente' | 'Presentada' | 'Rechazada';
  /** Código secreto del enlace personal de la invitación (portal/licitacion/:id?t=...). Único por proveedor. */
  tokenAcceso?: string;
  /** Cuándo el proveedor envió su oferta desde el portal (ISO). */
  fechaPresentacion?: string;
  /** Registro de ingresos al portal con su enlace personal (ISO): primera vez, última vez y cuántas sesiones. */
  primerAcceso?: string;
  ultimoAcceso?: string;
  cantidadAccesos?: number;
  /** Aclaraciones que el proveedor ya vio en el portal: id de la aclaración → fecha (ISO). */
  aclaracionesVistas?: Record<string, string>;
}

/**
 * Aclaración o modificación de las bases publicada por la UCT durante el proceso (`licitaciones/{id}/aclaraciones`).
 * La ven todos los invitados en el portal; si cambia la fecha de cierre, la licitación se actualiza al publicarla.
 */
export interface AclaracionLicitacion {
  id: string;
  numero: number;
  titulo: string;
  texto: string;
  fecha: string;
  publicadaPor: string;
  archivo?: { nombre: string; url: string };
  cambioCierre?: { fechaAnterior: string; fechaNueva: string; horaAnterior?: string; horaNueva?: string };
}

/**
 * Consulta de un proveedor durante el período de consultas (`licitaciones/{id}/consultas`). Solo la ven el
 * personal interno y el proveedor que la hizo; al responderla se publica sin identificar a quien preguntó.
 */
export interface ConsultaLicitacion {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorUid: string;
  pregunta: string;
  fechaPregunta: string;
  estado: 'Pendiente' | 'Respondida';
  respuesta?: string;
  fechaRespuesta?: string;
  respondidaPorEmail?: string;
  /** N° correlativo con que se publicó (Consulta N° 1, 2, ...). */
  numero?: number;
}

/** Pregunta y respuesta publicadas, anónimas y visibles para todos los invitados (`licitaciones/{id}/consultasPublicadas`). */
export interface ConsultaPublicada {
  id: string;
  numero: number;
  pregunta: string;
  respuesta: string;
  fechaPregunta: string;
  fechaRespuesta: string;
}

/** Lo que resuelve un enlace personal de invitación (colección `invitaciones/{código}`). */
export interface InvitacionAcceso {
  licitacionId: string;
  proveedorId: string;
  proveedorEmail: string;
  proveedorNombre: string;
}

// ─── PROPUESTA DEL PROVEEDOR (vía portal) ─────────────────────────────────
export interface Propuesta {
  id: string;
  licitacionId: string;
  proveedorId: string;
  proveedorUid: string;
  proveedorNombre: string;
  proveedorRut: string;

  montoNeto: number;
  montoIva: number;
  montoTotal: number;
  plazoDias: number;
  itemizado?: ItemCotizacion[];
  fechaCotizacion?: string;

  // Criterios técnicos (auto-declaración del proveedor)
  ajustaRequerimientos: boolean;
  cuentaExperiencia: boolean;
  cumplePlazoRequerido: boolean;
  declaraSustentabilidad: boolean;
  tipoEvidenciaSustentable?: string;

  // Archivo subido
  archivoNombre?: string;
  archivoURL?: string;
  archivoTipo?: 'excel' | 'pdf';

  // Oferta técnica (archivo aparte de la oferta económica)
  archivoTecnicoNombre?: string;
  archivoTecnicoURL?: string;

  /** Confirmación por correo al proveedor tras enviar su oferta. 'prueba' = simulada, no salió ningún correo. */
  confirmacionCorreo?: { modo: 'real' | 'prueba'; fecha: string; email: string; asunto?: string; html?: string };

  /** Datos de representación legal que el proveedor informa al ofertar (se usan solo si resulta adjudicado). */
  datosContrato?: DatosContratista;

  observaciones?: string;
  fechaEnvio: string;
  estado: 'Borrador' | 'Enviada';
}

// ─── LICITACIÓN / PROYECTO ─────────────────────────────────────────────────
// ─── MULTAS POR ATRASO ────────────────────────────────────────────────────
// licitaciones/{id}/multas. Se calculan con PARAMETROS_CONTRATO (multa diaria sobre el contrato, con tope) y se
// descuentan en el siguiente estado de pago. No aplican si el atraso es imputable a la UCT o por fuerza mayor.
export interface MultaObra {
  id: string;
  /** Período de atraso que cubre (YYYY-MM-DD, ambos incluidos). */
  desde: string;
  hasta: string;
  dias: number;
  monto: number;
  motivo: string;
  estado: 'Aplicada' | 'Exenta' | 'Anulada';
  /** Obligatoria si es Exenta o Anulada (ej. atraso por causa de la UCT o fuerza mayor). */
  justificacion?: string;
  /** Estado de pago en que se descontó. */
  estadoPagoId?: string;
  estadoPagoNumero?: number;
  fechaRegistro: string;
  registradaPor: string;
}

// ─── LIBRO DE OBRA DIGITAL ────────────────────────────────────────────────
// licitaciones/{id}/libroObra/{entradaId} y sus fotos en libroObra/{entradaId}/fotos/{n}. Las anotaciones no se
// editan ni se borran (como el libro en papel): un error se corrige con una nueva anotación que la referencia.
export const TIPOS_ANOTACION_LIBRO = ['Avance', 'Instrucción al contratista', 'Observación', 'Visita / inspección', 'Recepción de materiales', 'Otro'] as const;
export type TipoAnotacionLibro = typeof TIPOS_ANOTACION_LIBRO[number];

export interface EntradaLibroObra {
  id: string;
  tipo: TipoAnotacionLibro;
  texto: string;
  /** Momento en que se escribió en el dispositivo (ISO): ordena el libro y da el N° de folio. */
  fecha: string;
  autorEmail: string;
  autorNombre: string;
  /** Avance físico estimado de la obra a la fecha, en % (alimenta la Curva S real). */
  avanceFisicoPct?: number;
  ubicacion?: { lat: number; lng: number; precisionM?: number };
  clima?: string;
  cantidadFotos: number;
  /** Id de la anotación que esta corrige. */
  corrigeA?: string;
  /** SHA-256 del contenido: permite demostrar que la anotación no cambió. */
  huella: string;
}

export interface FotoLibroObra {
  id: string;
  /** Imagen comprimida (JPEG en base64): viaja con la anotación y funciona sin señal. */
  dataUrl: string;
  nombre: string;
  orden: number;
}

/** Registro automático de la apertura: quiénes ofertaron y cuándo, fijado al primer ingreso tras el cierre. */
export interface RegistroAperturaOfertas {
  /** Hora de cierre de la recepción (ISO). */
  fechaCierre: string;
  fechaRegistro: string;
  registradoPor: string;
  ofertas: {
    proveedorId: string;
    proveedorNombre: string;
    proveedorRut?: string;
    fechaEnvio?: string;
    montoTotal: number;
    plazoDias: number;
    archivoEconomico?: string;
    archivoTecnico?: string;
  }[];
  /** Invitados que no presentaron oferta. */
  sinOferta: { proveedorId: string; proveedorNombre: string }[];
}

export interface LicitacionProyecto {
  id: string;
  codigoCP: string;    // ej: 409-123
  codigoOP: string;    // ej: OP-552
  codigoOT: string;    // ej: OT-8841
  codigoProyecto: string; // ej: 2X_0XX
  nombreProyecto: string;
  descripcion: string;
  montoEstimado: number;
  fechaEvaluacion: string;     // fecha límite de presentación de propuestas
  fechaCreacion?: string;
  estado: 'Borrador' | 'En Evaluacion' | 'Adjudicado' | 'Cerrado';
  proveedorAdjudicadoId?: string;
  /** YYYY-MM-DD. Se registra al adjudicar (licitaciones adjudicadas antes de 2026-09-30 no la tienen). */
  fechaAdjudicacion?: string;
  aperturaOfertas?: RegistroAperturaOfertas;
  /** Devolución de las retenciones de garantía al contratista (tras el acta de recepción). */
  devolucionRetenciones?: { fecha: string; monto: number; registradaPor: string; observacion?: string };
  proveedorGanadorId?: string;
  justificacionAdjudicacion?: string;
  proveedorAdjudicadoNombre?: string;
  proveedorAdjudicadoRut?: string;
  montoAdjudicadoNeto?: number;
  montoAdjudicadoIva?: number;
  montoAdjudicadoTotal?: number;
  gastoEfectivo?: number; // reflejado también en ProyectoMaestro.gastoEfectivo vía syncGastoEfectivoToProyectoMaestro
  plazoAdjudicadoDias?: number;
  fechaInicioObra?: string;
  fechaTerminoProgramada?: string;
  cotizacionAdjudicadaId?: string;
  actaFirmaDigital?: {
    archivoNombre?: string;
    archivoURL?: string;
    archivoDriveId?: string;
    adobeAgreementId?: string;
    adobeStatus?: string;
    fechaInicioAdobe?: string;
    version: number;
    estado: 'En firma' | 'Firmada' | 'Cancelada';
    fechaActualizacion: string;
    sha256: string;
    firmas: {
      uid: string;
      email: string;
      nombre: string;
      cargo: string;
      rolFirma: 'director' | 'subdirector' | 'responsable' | 'vrae';
      fecha: string;
      version: number;
      sha256: string;
      firmaImagenURL?: string; // Copia de la firma manuscrita del firmante al momento de firmar
    }[];
  };
  esUnicoProveedor?: boolean;
  proyectoMaestroId?: string;  // Referencia a la lista maestra

  // Ubicación y Metadatos Institucionales
  campusSigla?: string;
  campusNombre?: string;
  edificioSigla?: string;
  uso?: string;
  tipoObra?: string;
  /** Rubro del proveedor requerido (catálogo de rubrosData.ts) — se sincroniza desde ProyectoMaestro.rubro vía proyectoMaestroId. Distinto de tipoObra (texto libre). */
  rubro?: string;

  // Responsable de Infraestructura
  responsableNombre?: string;
  responsableEmail?: string;

  // Calendario de la Licitación
  fechaVisitaTerreno?: string;       // Fecha de visita obligatoria / optativa a terreno
  fechaRecepcionConsultas?: string;  // Fecha límite para recepción de consultas de los oferentes
  fechaRespuestaConsultas?: string;  // Fecha en que la Universidad publica las respuestas a las consultas
  fechaEntregaPropuestas?: string;   // Fecha límite de entrega de ofertas — no se aceptan propuestas después de esta fecha
  /** Hora de cierre de la recepción de ofertas (HH:MM, hora de Chile) del día de fechaEntregaPropuestas. Sin valor = 23:59. */
  horaLimiteOfertas?: string;
  /** Instante exacto del cierre (ms), calculado al guardar la licitación; lo usan las reglas de Firebase para cerrar el portal a la hora. */
  limiteOfertasMs?: number;
  // Empresas Invitadas
  proveedoresInvitadosIds?: string[];

  // Antecedentes Técnicos y Checklist de Verificación
  antecedentesTecnicos?: {
    id: string;
    nombre: string;
    tipo: 'Bases Tecnicas' | 'Bases Administrativas' | 'Planos' | 'Anexo' | 'Presupuesto';
    archivoURL?: string;
    archivoNombre?: string;
    fechaCarga: string;
    cargadoPor?: string;
  }[];

  /** Partidas del proyecto SIN precios, para el formato de presupuesto que descarga el proveedor. Se copia del
   * itemizado del proyecto (ver sincronizarFormatoPresupuesto) para que el portal no lea el presupuesto interno. */
  formatoPresupuesto?: { item: string; fase?: string; descripcion: string; unidad: string }[];

  checklistAntecedentes?: {
    basesTecnicasOk: boolean;
    basesAdministrativasOk: boolean;
    planosOk: boolean;
    calendarioDefinidoOk: boolean;
    revisadoSecretariaGeneralOk: boolean;
    /** Planos marcados como cumplidos SIN archivo adjunto (ej. el proyecto no tiene planos). Debe advertirse. */
    planosSinAdjuntos?: boolean;
    /** Ídem para las Bases: marcadas como cumplidas SIN archivo adjunto. */
    basesTecnicasSinAdjuntos?: boolean;
    basesAdministrativasSinAdjuntos?: boolean;
  };
  /** Ítems del checklist de la Ficha marcados a mano, sin documento que los respalde. */
  checklistManual?: Record<string, boolean>;

  // Traza Documental Legafos & Flujo Administrativo (OT → OP → OC)
  ordenTrabajoNumero?: string;      // ej: OT-2026-099 (Generada al adjudicar)
  ordenPedidoNumero?: string;       // ej: OP-2026-099 (Revisada por administración)
  /** Registro de la OP obtenida en Kellun por Secretaría (bandeja Solicitudes de OP). */
  opRegistro?: {
    fecha: string;
    registradoPor?: string;
    archivoNombre?: string;
    archivoURL?: string;
  };
  ordenCompraNumero?: string;       // ej: OC-450012890 (Emitida por Finanzas)
  numeroContrato?: string;          // Contrato formal, cuando corresponda
  archivoOCNombre?: string;         // Nombre del archivo PDF/Excel de la OC subida
  archivoOCURL?: string;
  archivoOCDriveId?: string;
  fechaCargaOC?: string;            // Fecha en que se cargó la OC

  // Estado del Ciclo de Vida Operativo
  estadoLifecycle?: 'Bases' | 'Invitando' | 'Evaluando' | 'Adjudicado' | 'OT_Emitida' | 'OP_Emitida' | 'OC_Emitida' | 'En_Ejecucion' | 'Recepcion_Solicitada' | 'Finalizado';

  // Indicadores de Gestión y Riesgo
  nivelRiesgo?: 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
  motivoRiesgo?: string;        // Descripción breve del factor de riesgo
  superficieM2?: number;        // Superficie en m² para análisis costo/m²

  // Recepción Conforme de Obras
  recepcionConforme?: {
    solicitada: boolean;
    fechaSolicitud?: string;
    aprobada: boolean;
    fechaAprobacion?: string;
    objetada?: boolean;
    fechaObjecion?: string;
    observaciones?: string;
    aprobadoPor?: string;
  };

  // Acta de Recepción — firma digital avanzada (Adobe Acrobat Sign)
  actaRecepcionAdobe?: {
    agreementId: string;
    status: 'DRAFT' | 'AUTHORING' | 'OUT_FOR_SIGNATURE' | 'SIGNED' | 'APPROVED' | 'CANCELLED' | 'EXPIRED' | 'ARCHIVED' | 'UNKNOWN';
    nombreDocumento: string;
    fechaEnvio: string;
    enviadoPor: string;
    fechaUltimaVerificacion?: string;
  };

  // Acta de Recepción — firma interna provisoria (hash + identidad Google),
  // mismo mecanismo que actaFirmaDigital, mientras se habilita Acrobat Sign.
  actaRecepcionFirmaInterna?: {
    version: number;
    estado: 'En firma' | 'Firmada' | 'Cancelada';
    fechaActualizacion: string;
    firmas: {
      uid: string;
      email: string;
      nombre: string;
      cargo: string;
      rolFirma: 'director' | 'subdirector' | 'responsable' | 'vrae';
      fecha: string;
      version: number;
      sha256: string;
      firmaImagenURL?: string; // Copia de la firma manuscrita del firmante al momento de firmar
    }[];
  };
}

export interface ItemEstadoPago {
  itemCotizacionId: string;
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
  avanceAnteriorPct: number;
  avancePeriodoPct: number;
  avanceAcumuladoPct: number;
  montoPeriodo: number;
}

export interface ItemAumentoObra {
  id: string;
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
  tipo: 'Nueva partida' | 'Aumento de cantidad';
  itemOriginalId?: string;
}

export interface AumentoObra {
  id: string;
  licitacionId: string;
  numero: number;
  titulo: string;
  motivo: string;
  ordenCompraNumero: string;
  fechaOrdenCompra: string;
  items: ItemAumentoObra[];
  montoNeto: number;
  montoIva: number;
  montoTotal: number;
  ampliacionPlazoDias: number;
  observaciones?: string;
  archivoOCNombre?: string;
  archivoOCURL?: string;
  archivoOCDriveId?: string;
  estado: 'Borrador' | 'Aprobado' | 'Rechazado' | 'Anulado';
  creadoPor?: string;
  fechaCreacion: string;
  aprobadoPor?: string;
  fechaAprobacion?: string;
}

export interface HitoDesarrolloProyecto {
  id: string;
  proyectoId: string;
  fecha: string;
  tipo: 'Hito' | 'Reunión' | 'Inspección' | 'Decisión' | 'Riesgo' | 'Incidencia' | 'Recepción';
  titulo: string;
  detalle: string;
  responsableNombre: string;
  responsableEmail?: string;
  estado: 'Abierto' | 'En seguimiento' | 'Cerrado';
  impactoCosto?: number;
  impactoPlazoDias?: number;
  creadoPor?: string;
  fechaCreacion: string;
}

export interface EstadoPago {
  id: string;
  licitacionId: string;
  numero: number;
  fecha: string;
  proveedorId: string;
  proveedorNombre: string;
  cotizacionId: string;
  items: ItemEstadoPago[];
  montoNeto: number;
  montoIva: number;
  montoTotal: number;
  porcentajeAvanceGlobal: number;
  observaciones?: string;
  archivoNombre?: string;
  archivoURL?: string;
  archivoDriveId?: string;
  // Evidencia fotográfica del avance o de la obra terminada (obligatoria al ingresar el estado)
  fotos?: { url: string; nombre: string }[];
  // Hasta 5 observaciones puntuales, cada una respaldada con su propia fotografía
  observacionesDetalle?: { texto: string; fotoURL: string; fotoNombre?: string }[];
  // Snapshot de datos de la obra al momento del registro de avance
  tipoObra?: string;
  superficieM2?: number;
  usoEspacio?: string;
  estado: 'Borrador' | 'Ingresado' | 'Aprobado' | 'Pagado';
  firmaResponsable?: {
    uid: string;
    email: string;
    nombre: string;
    cargo: string;
    fecha: string;
    sha256: string;
  };
  /** Retención de garantía aplicada a este estado (según la política de garantías del contrato). */
  retencionPct?: number;
  montoRetencion?: number;
  /** Multas por atraso descontadas en este estado (ids en licitaciones/{id}/multas). */
  montoMultas?: number;
  multasIds?: string[];
  /** Monto a pagar: total del estado menos retención y multas. */
  montoLiquido?: number;
  factura?: {
    numeroFactura: string;
    montoFactura: number;
    glosaOficial: string;
    archivoNombre?: string;
    archivoURL?: string;
    archivoDriveId?: string;
    fechaCarga: string;
    verificada: boolean; // true solo si montoFactura coincide con el Estado de Pago aprobado
    observacionDiferencia?: string; // obligatoria cuando verificada es false
  };
}

// ─── EVALUACIÓN ────────────────────────────────────────────────────────────
export interface EvaluacionResultado {
  cotizacionId: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRut: string;
  montoTotal: number;
  montoNeto?: number;
  plazoDias: number;

  // Puntajes base (0 a 100)
  puntajeEconomico: number;
  puntajeTecnico: number;
  puntajeSustentabilidad: number;

  // Puntajes ponderados (con el 55%, 35%, 10%)
  puntajeEconomicoPonderado: number;
  puntajeTecnicoPonderado: number;
  puntajeSustentabilidadPonderado: number;
  puntajeTotalPonderado: number;

  ranking: number;
  esPropuestaAdjudicada: boolean;
}

// ─── PERFIL DE USUARIO ─────────────────────────────────────────────────────
export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'responsable' | 'proveedor';
  proveedorId?: string;  // Si es proveedor, referencia al doc en /proveedores
  /** Proveedores: código del enlace de invitación con el que se vinculó la cuenta (lo exigen las reglas de Firestore). */
  tokenInvitacion?: string;
  displayName: string;
  fechaRegistro: string;
  verificado: boolean;
  puedeFirmarActas?: boolean;
  cargoFirma?: string;
  firmaImagenURL?: string; // Imagen de la firma manuscrita (enrolada por el usuario), estampada en las actas al firmar digitalmente
}

// ─── CONFIGURACIÓN DE FIRMAS Y PARÁMETROS ──────────────────────────────
export interface ParametrosLicitacionSGC {
  porcentajeEconomico: number;     // 55
  porcentajeTecnico: number;       // 35
  porcentajeSustentabilidad: number; // 10
  tasaIva: number;                 // 19
  umbralActaObligatoria: number;   // 800001
  umbralAprobacionVrae: number;    // 5000001
  /** Umbral desde el cual se exige Licitación (Privada o Pública) + Contrato formal firmado,
   * según el Anexo 1 de la Resolución VRAE 02/2014 (tramo "$25.000.001 y superior"). */
  umbralContratoFormal: number;    // 25000001
}

export interface ConfiguracionFirmas {
  directorGestionCampus: {
    nombre: string;
    cargo: string;
    email?: string;
  };
  subdirectorInfraestructura: {
    nombre: string;
    cargo: string;
    email?: string;
  };
  responsableDesarrollo: {
    nombre: string;
    cargo: string;
    email?: string;
  };
  vicerrectorAdministracion: {
    nombre: string;
    cargo: string;
    email?: string;
  };
  institucion: string;
  subdireccion: string;
  parametrosSgc?: ParametrosLicitacionSGC;
  /** Techo institucional anual (CLP) que la Cartera de Proyectos no debe sobrepasar — distinto del monto adjudicado, que es cuánto ya se comprometió contra ese techo. */
  presupuestoAnualAprobado?: number;
  /** Techo institucional por año de cartera ("2027" → monto). El campo anterior queda como respaldo de 2026. */
  presupuestosAnuales?: Record<string, number>;
  /** Cierre de la revisión de cada cartera: el presupuesto del año es la suma de los proyectos aprobados ese día. */
  revisionesCartera?: Record<string, { fecha: string; monto: number; proyectos: number; cerradaPor?: string }>;
}

// ─── HISTORIAL DE ENVÍOS DE INVITACIONES (licitaciones/{id}/envios) ────────
export interface EnvioInvitacion {
  id: string;
  fecha: string; // ISO
  /** 'prueba' = envío simulado (no salió ningún correo); 'real' = enviado a los proveedores. */
  modo: 'prueba' | 'real';
  enviadoPorEmail: string;
  asunto: string;
  cc: string[];
  portalUrl: string;
  destinatarios: {
    proveedorId: string;
    proveedorNombre: string;
    email: string;
    enviado: boolean;
    error?: string;
    /** Cuerpo HTML exacto del mensaje enviado a este destinatario. */
    html: string;
  }[];
}
