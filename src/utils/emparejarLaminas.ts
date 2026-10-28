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
