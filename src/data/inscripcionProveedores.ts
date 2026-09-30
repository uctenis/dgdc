/**
 * Requisitos para inscribirse como proveedor de la UCT (requisitos mínimos excluyentes, informados por la
 * Subdirección de Infraestructura). La empresa los sube con su enlace personal de inscripción; la UCT revisa y, si
 * aprueba, solicita a Adquisiciones que la agregue al registro oficial de proveedores de la Universidad.
 */

export interface RequisitoInscripcion {
  id: string;
  grupo: string;
  nombre: string;
  /** Vigencia máxima desde su emisión al momento de enviar la inscripción (días). */
  vigenciaDias?: number;
  /** Detalle para la empresa. */
  ayuda?: string;
  opcional?: boolean;
}

export const REQUISITOS_INSCRIPCION: RequisitoInscripcion[] = [
  { id: 'inicioActividades', grupo: 'Antecedentes tributarios y legales', nombre: 'Certificado de Inicio de Actividades', ayuda: 'Con giro relacionado al rubro en que se inscribe.' },
  { id: 'carpetaTributaria', grupo: 'Antecedentes tributarios y legales', nombre: 'Carpeta Tributaria', ayuda: 'Información tributaria, Formulario 29 de los últimos 24 meses y Formulario 22 de los últimos 2 años.' },
  { id: 'boletinComercial', grupo: 'Antecedentes financieros y de cumplimiento', nombre: 'Boletín de Informaciones Comerciales', vigenciaDias: 30 },
  { id: 'certificadoConcursal', grupo: 'Antecedentes financieros y de cumplimiento', nombre: 'Certificado de Procedimientos Concursales (Quiebra)', vigenciaDias: 30 },
  { id: 'f30', grupo: 'Antecedentes financieros y de cumplimiento', nombre: 'Certificado de Antecedentes Laborales y Previsionales (F30)', vigenciaDias: 30 },
  { id: 'dfin0001', grupo: 'Documentos de adhesión UCT', nombre: 'SGC PS-FOR-DFIN 0001 Información de Proveedores', ayuda: 'Debidamente completado.' },
  { id: 'dfin0002', grupo: 'Documentos de adhesión UCT', nombre: 'SGC PS-FOR-DFIN 0002 Términos y Condiciones de Compra', ayuda: 'Debidamente completado y firmado por el representante legal.' },
  { id: 'sustentabilidad', grupo: 'Compromiso con la sustentabilidad (factor favorable)', nombre: 'Política o certificación de sustentabilidad', ayuda: 'Opcional: política ambiental, certificación, gestión de residuos o reciclaje.', opcional: true },
];

/** Correo de Adquisiciones que agrega a los proveedores aprobados al registro oficial de la UCT. */
export const CORREO_ADQUISICIONES_REGISTRO = 'miguel.angulo@uct.cl';

/** Formularios de adhesión para descargar desde la inscripción (archivos en /public/formularios/). */
export const FORMULARIOS_ADHESION: { id: string; nombre: string; archivo: string }[] = [
  { id: 'dfin0001', nombre: 'SGC PS-FOR-DFIN 0001 Información de Proveedores', archivo: 'formularios/SGC-PS-FOR-DFIN-0001-Informacion-de-Proveedores.pdf' },
  { id: 'dfin0002', nombre: 'SGC PS-FOR-DFIN 0002 Términos y Condiciones de Compra', archivo: 'formularios/SGC-PS-FOR-DFIN-0002-Terminos-y-Condiciones-de-Compra.pdf' },
];

/** Días desde la emisión hasta hoy (fechas YYYY-MM-DD). */
export function diasDesdeEmision(fechaEmision: string, hoy = new Date()): number {
  const [a, m, d] = fechaEmision.slice(0, 10).split('-').map(Number);
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((inicioHoy.getTime() - new Date(a, m - 1, d).getTime()) / 86_400_000);
}
