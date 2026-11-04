// Empareja los PDF de láminas que se suben de una vez con las láminas registradas en el índice de planos. Los
// archivos vienen del repositorio de planos en Drive, con nombres como «CSN11-L01 260113.pdf» o «CSN_Campus 260113.pdf».
import type { DocumentoEdificio, Piso } from '../types/recintos';
import { PREFIJOS_ANTIGUOS } from '../data/codigosAntiguosEdificios';

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
  const m = /^([A-Z]{2,4}[A-Z0-9_]*?)[-\s]+(L\d+)\b/.exec(nombre);
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
  // Plano general del campus («CML_Campus 260713», «CSF Campus areas comunes 260713 LR»): queda en el campus, no en
  // un edificio. Lo que va entre «Campus» y la fecha distingue las variantes (áreas comunes, formato 40x60).
  const general = /^([A-Z]{2,4})[_\s]+CAMPUS\b\s*(.*?)\s*(?:\d{6}|\d{2}-\d{2}-\d{4})?(?:\s+LR)?$/i.exec(sinExt);
  if (general) {
    const sigla = general[1].toUpperCase();
    if (siglaCampus && sigla !== siglaCampus.toUpperCase()) return null;
    const variante = general[2].trim();
    return variante
      ? { edificio_codigo: sigla, codigo_lamina: `L01-${variante.toUpperCase().replace(/\s+/g, '-')}`, titulo: `Plano general del campus (${variante.toLowerCase()})` }
      : { edificio_codigo: sigla, codigo_lamina: 'L01', titulo: 'Plano general del campus' };
  }
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

/**
 * Piso que corresponde a una lámina según su número. En el repositorio cada edificio tiene una lámina por nivel,
 * numeradas desde el más bajo: en CSF11 (niveles −2 a 5) L01 es el nivel −2 y L03 el nivel 1. Por eso Ln es el
 * n-ésimo piso en orden ascendente, no el piso n. Si el edificio no tiene tantos pisos, queda sin piso.
 */
export function pisoDeLamina(codigoLamina: string | null, pisos: Pick<Piso, 'id' | 'orden'>[]): string | null {
  const m = /^L0*(\d+)$/i.exec((codigoLamina || '').trim());
  if (!m) return pisos.length === 1 ? pisos[0].id : null;
  const ordenados = [...pisos].sort((a, b) => a.orden - b.orden);
  return ordenados[Number(m[1]) - 1]?.id || null;
}

/**
 * Fecha escrita en el nombre de una lámina, como «AAAA-MM-DD». Acepta las tres formas del repositorio: «260713»
 * (AAMMDD), «11-01-2017» (DD-MM-AAAA) y «2022-01-05». Sin fecha reconocible, null.
 */
export function fechaDeNombre(nombreArchivo: string): string | null {
  const s = nombreArchivo.replace(/\.pdf$/i, '');
  const valida = (a: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 1990 && a <= 2100
    ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = /\b(\d{2})-(\d{2})-(\d{4})\b/.exec(s);
  if (m) return valida(+m[3], +m[2], +m[1]);
  m = /(?:^|[\s_-])(\d{2})(\d{2})(\d{2})(?=$|[\s_.-])/.exec(s);
  if (m) return valida(2000 + +m[1], +m[2], +m[3]);
  return null;
}

/** Datos de una lámina anterior (versión histórica) a partir del nombre de su archivo. */
export interface LaminaAnterior { edificio_codigo: string; codigo_lamina: string; titulo: string; fecha: string | null }

/**
 * Interpreta el nombre de una lámina de las carpetas «anteriores». Hay tres formas:
 *  • con el código actual: «CML03 L01 220902», «CSC01-L02 221118»;
 *  • con el código antiguo del edificio: «CSF_A Lam01 24-10-2014», «CML_MLA Lam03 2022-01-05», «CJP_EB Lam-01 …»
 *    (se traduce con la tabla de códigos antiguos);
 *  • planos generales: «CSF Campus 230511 LR 40x60cm», «CML Master 04-08-2020», «CPL_MASTER Lam01 …».
 * `traducir` da el código actual de un código antiguo dentro del campus. Devuelve null si no se reconoce el edificio
 * o si es de otro campus.
 */
export function inferirLaminaAnterior(nombreArchivo: string, siglaCampus: string, traducir: (sigla: string, antiguo: string) => string | null): LaminaAnterior | null {
  const sinExt = nombreArchivo.replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim();
  const fecha = fechaDeNombre(sinExt);
  const campus = siglaCampus.toUpperCase();
  const fechaTexto = fecha ? ` · ${fecha.slice(0, 4)}` : '';

  // Plano general del campus (actual «Campus» o antiguo «Master»).
  const general = /^(?:MASTER(?:\s+[A-ZÑ]+)+\s+\d+|([A-Z]{2,4})[_\s-]+(CAMPUS|MASTER)\b)(.*)$/i.exec(sinExt);
  if (general && (!general[1] || general[1].toUpperCase() === campus) && !/MASTER\S/i.test(sinExt)) {
    const variante = (general[3] || '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}-\d{2}-\d{4}\b|\b\d{6}\b/g, '').replace(/\bLR\b|\b40x60(cm)?\b|-?\bL(am)?0*1\b/gi, '')
      .replace(/[\s_-]+/g, ' ').trim();
    return {
      edificio_codigo: campus,
      codigo_lamina: variante ? `L01-${variante.toUpperCase().replace(/\s+/g, '-')}` : 'L01',
      titulo: `Plano general del campus${variante ? ` (${variante.toLowerCase()})` : ''}${fechaTexto}`,
      fecha,
    };
  }

  // Código antiguo: SIGLA_CODIGO [texto] Lam01.
  const antiguo = /^([A-Z]{2,4}\d*)_([A-Z0-9+ÑÁÉÍÓÚ]+)(?:\s+[A-ZÑ]+)?[-_\s]+LAM-?\s?0*(\d+)/i.exec(sinExt);
  if (antiguo) {
    const edificio = traducir(antiguo[1], antiguo[2]);
    if (!edificio || !edificio.startsWith(campus)) return null;
    const lamina = `L${antiguo[3].padStart(2, '0')}`;
    return { edificio_codigo: edificio, codigo_lamina: lamina, titulo: `Lámina ${lamina} (${edificio}, código antiguo ${antiguo[1]}_${antiguo[2]})${fechaTexto}`, fecha };
  }

  // Código actual con número de lámina.
  const actual = /^([A-Z]{2,4}\d+[A-Z0-9_]*?)[-_\s]+L(?:AM)?-?0*(\d+)\b/i.exec(sinExt);
  if (actual) {
    const leido = actual[1].toUpperCase();
    const prefijo = PREFIJOS_ANTIGUOS[leido.slice(0, 3)];
    const edificio = prefijo ? prefijo + leido.slice(3) : leido;
    if (!edificio.startsWith(campus)) return null;
    const lamina = `L${actual[2].padStart(2, '0')}`;
    return { edificio_codigo: edificio, codigo_lamina: lamina, titulo: `Lámina ${lamina} (${edificio}${prefijo ? `, antes ${leido}` : ''})${fechaTexto}`, fecha };
  }
  return null;
}
