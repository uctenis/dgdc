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

// ─── PROYECTO MAESTRO ──────────────────────────────────────────────────────
export interface ProyectoMaestro {
  id: string;
  correlativo: number;       // auto-incremental: 1, 2, 3...
  codigoCP: string;          // 409-XXX
  codigoOP: string;          // OP-XXX
  codigoOT: string;          // OT-XXXX
  codigoProyecto: string;    // 2X_0XX
  nombre: string;
  descripcion: string;
  valorAprox: number;
  estado: 'Pendiente' | 'En Proceso' | 'Completado';
  fechaCreacion: string;

  // Datos financieros y de programación (PPTO)
  montoAdjudicado?: number;
  gastoEfectivo?: number;
  prioridad?: 'Alta' | 'Media' | 'Baja';
  fechaInicio?: string;
  fechaTermino?: string;

  // Ubicación y Metadatos Institucionales (Filtros Avanzados)
  campusSigla?: string;      // ej: CSF, CJP, CRC
  campusNombre?: string;     // ej: Campus San Francisco
  edificioSigla?: string;    // ej: CSF10, CRC16, CJP08
  uso?: string;              // ej: DOCENCIA, ESPACIOS COMUNES
  tipoObra?: string;         // ej: REMODELACION, ALHAJAMIENTO

  // Responsable de Infraestructura
  responsableNombre?: string; // ej: Arturo Meza, David Silva Roco
  responsableEmail?: string;  // ej: ameza@uct.cl, dsilva@uct.cl

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

  // Responsable de Infraestructura
  responsableNombre?: string;
  responsableEmail?: string;

  // Calendario SGC de la Licitación
  fechaVisitaTerreno?: string;      // Fecha de visita obligatoria / optativa a terreno
  fechaRecepcionConsultas?: string; // Fecha límite para recepción de consultas
  fechaEntregaPropuestas?: string;  // Fecha límite de entrega de ofertas
  // Empresas Invitadas
  proveedoresInvitadosIds?: string[];

  // Antecedentes Técnicos y Checklist de Verificación SGC
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

  // Recepción Conforme de Obras
  recepcionConforme?: {
    solicitada: boolean;
    fechaSolicitud?: string;
    aprobada: boolean;
    fechaAprobacion?: string;
    observaciones?: string;
    aprobadoPor?: string;
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
  estado: 'Borrador' | 'Ingresado' | 'Aprobado' | 'Pagado';
  firmaResponsable?: {
    uid: string;
    email: string;
    nombre: string;
    cargo: string;
    fecha: string;
    sha256: string;
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
}

// ─── CONFIGURACIÓN DE FIRMAS Y PARÁMETROS SGC ──────────────────────────────
export interface ParametrosLicitacionSGC {
  porcentajeEconomico: number;     // 55
  porcentajeTecnico: number;       // 35
  porcentajeSustentabilidad: number; // 10
  tasaIva: number;                 // 19
  umbralActaObligatoria: number;   // 800001
  umbralAprobacionVrae: number;    // 5000001
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
}
