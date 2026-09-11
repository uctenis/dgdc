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
  estado: 'Activo' | 'Inactivo';
  fechaRegistro: string;
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
    fecha?: string;
    aprobadoPorNombre?: string;
    aprobadoPorEmail?: string;
  };

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

  // Contrato de Adjudicación — se genera al adjudicar, con los datos reales del proveedor ganador
  // (distinto de "bases": bases son las reglas pre-adjudicación, el contrato es el documento bilateral post-adjudicación)
  contrato?: {
    version: number;
    estado: 'Borrador' | 'En Revisión Legal' | 'Firmado';
    secciones: { id: string; titulo: string; contenido: string }[];
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

export interface ItemItemizadoProyecto {
  id: string;
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
  origen: 'Manual' | 'IA';
  /** Sin valor = itemizado creado antes de esta clasificación, o partida aún sin asignar. */
  fase?: FaseItemizado | string;
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

  observaciones?: string;
  fechaEnvio: string;
  estado: 'Borrador' | 'Enviada';
}

// ─── LICITACIÓN / PROYECTO ─────────────────────────────────────────────────
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

  checklistAntecedentes?: {
    basesTecnicasOk: boolean;
    basesAdministrativasOk: boolean;
    planosOk: boolean;
    calendarioDefinidoOk: boolean;
    revisadoSecretariaGeneralOk: boolean;
  };

  // Traza Documental Legafos & Flujo Administrativo (OT → OP → OC)
  ordenTrabajoNumero?: string;      // ej: OT-2026-099 (Generada al adjudicar)
  ordenPedidoNumero?: string;       // ej: OP-2026-099 (Revisada por administración)
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
}
