export interface Proveedor {
  id: string;
  rut: string;
  razonSocial: string;
  nombreContacto: string;
  email: string;
  telefono: string;
  rubro: string; // Ej: Obras Menores, Electricidad, Climatizaciones, Pintura, Obras Civiles
  cuentaSustentabilidad: boolean; // Certificado de sustentabilidad o política previa
  direccion?: string;
  ciudad?: string;
  estado: 'Activo' | 'Inactivo';
  fechaRegistro: string;
}

export interface ItemCotizacion {
  id: string;
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  precioTotal: number;
}

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
  ajustaRequerimientos: boolean; // a) Procedimientos y materiales de calidad
  cuentaExperiencia: boolean;    // b) Cartas de referencia / experiencia
  cumplePlazoRequerido: boolean; // c) Servicio dentro del tiempo

  // Parámetros de Sustentabilidad
  declaraSustentabilidad: boolean; // Certificación previa o Carta Compromiso Sustentable firmada
  tipoEvidenciaSustentable?: string; // 'Certificado Ambiental', 'Carta Compromiso', 'Ninguna'

  documentoCotizacionNombre?: string;
  observaciones?: string;
  fechaCarga: string;
}

export interface EvaluacionResultado {
  cotizacionId: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRut: string;
  montoTotal: number;
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

export interface LicitacionProyecto {
  id: string;
  codigoCP: string; // ej: 409-123
  codigoOP: string; // ej: OP-552
  codigoOT: string; // ej: OT-8841
  codigoProyecto: string; // ej: 2X_0XX
  nombreProyecto: string;
  descripcion: string;
  montoEstimado: number;
  fechaEvaluacion: string;
  estado: 'Borrador' | 'En Evaluacion' | 'Adjudicado' | 'Cerrado';
  proveedorAdjudicadoId?: string;
  justificacionAdjudicacion?: string;
  esUnicoProveedor?: boolean;
}

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
