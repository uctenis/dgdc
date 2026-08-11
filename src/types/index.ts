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
  resultado: 'Adjudicado' | 'No Adjudicado' | 'Invitado';
  fecha: string; // fecha de adjudicación / cierre
  puntajeObtenido?: number;
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

  // Parámetros de Evaluación Técnica
  ajustaRequerimientos: boolean;
  cuentaExperiencia: boolean;
  cumplePlazoRequerido: boolean;

  // Parámetros de Sustentabilidad
  declaraSustentabilidad: boolean;
  tipoEvidenciaSustentable?: string;

  documentoCotizacionNombre?: string;
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
  archivoOCNombre?: string;         // Nombre del archivo PDF/Excel de la OC subida
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
  role: 'admin' | 'proveedor';
  proveedorId?: string;  // Si es proveedor, referencia al doc en /proveedores
  displayName: string;
  fechaRegistro: string;
  verificado: boolean;
}

// ─── CONFIGURACIÓN DE FIRMAS ───────────────────────────────────────────────
export interface ConfiguracionFirmas {
  directorGestionCampus: {
    nombre: string;
    cargo: string;
  };
  subdirectorInfraestructura: {
    nombre: string;
    cargo: string;
  };
  responsableDesarrollo: {
    nombre: string;
    cargo: string;
  };
  vicerrectorAdministracion: {
    nombre: string;
    cargo: string;
  };
  institucion: string;
  subdireccion: string;
}
