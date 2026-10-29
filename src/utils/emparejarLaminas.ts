// Empareja los PDF de láminas que se suben de una vez con las láminas registradas en el índice de planos. Los
// archivos vienen del repositorio de planos en Drive, con nombres como «CSN11-L01 260113.pdf» o «CSN_Campus 260113.pdf».
import type { DocumentoEdificio } from '../types/recintos';

const normalizar = (s: string) => s.toUpperCase().replace(/\.PDF$/i, '').replace(/\s+/g, ' ').trim();

/** Nombre del archivo en Drive que se anotó al registrar la lámina («Archivo en Drive: …»), si lo tiene. */
export function archivoRegistrado(documento: Pick<DocumentoEdificio, 'observaciones'>): string | null {
  const m = /Archivo en Drive:\s*([^\n]+?\.pdf)/i.exec(documento.observaciones || '');
  return m ? m[1].trim() : null;
}

/**
 * Lámina registrada que corresponde a un archivo: primero la que anotó ese mismo nombre de archivo; si no, la lámina
 * vigente del edificio y código de lámina que indica el nombre («CSN11-L01 …» → edificio CSN11, lámina L01).
 */
export function laminaDeArchivo(nombreArchivo: string, documentos: DocumentoEdificio[]): DocumentoEdificio | undefined {
  const nombre = normalizar(nombreArchivo);
  const exacta = documentos.find(d => normalizar(archivoRegistrado(d) || '') === nombre);
  if (exacta) return exacta;
  const m = /^([A-Z]{2,4}[A-Z0-9_]*?)-(L\d+)\b/.exec(nombre);
  if (!m) return undefined;
  const [, edificio, lamina] = m;
  return documentos.find(d => d.vigente && d.tipo === 'Plano' && d.edificio_codigo.toUpperCase() === edificio
    && (d.codigo_lamina || '').toUpperCase().replace(/^.*-(L\d+)$/, '$1') === lamina);
}

/**
 * Si un PDF aún no está registrado en la base, extrae su edificio y código de lámina a partir del nombre del archivo
 * (por ejemplo «CSN11-L01 260113.pdf» → edificio CSN11, lámina L01) para poder crearlo y subirlo en un solo paso.
 */
export function inferirDatosLamina(nombreArchivo: string, siglaCampus: string): { edificio_codigo: string; codigo_lamina: string | null; titulo: string } | null {
  const sinExt = nombreArchivo.replace(/\.pdf$/i, '').trim();
  const m = /^([A-Z]{2,4}[A-Z0-9_]*?)(?:[-_\s]+(L\d+|A-\d+))?\b/i.exec(sinExt);
  if (!m) return null;
  const edificio = m[1].toUpperCase();
  if (siglaCampus && !edificio.startsWith(siglaCampus.toUpperCase())) return null;
  const codigoLamina = m[2] ? m[2].toUpperCase() : null;
  return {
    edificio_codigo: edificio,
    codigo_lamina: codigoLamina,
    titulo: codigoLamina ? `Lámina ${codigoLamina} (${edificio})` : sinExt,
  };
}
