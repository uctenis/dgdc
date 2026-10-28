// Formato de textos para mostrar: nombres de campus y de personas que vienen en mayúsculas desde las planillas.

/** Palabras que en un título van en minúscula (salvo al comienzo). */
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'a', 'al', 'por', 'para', 'con']);
/** Siglas y números romanos que se mantienen en mayúsculas. */
const SIGLAS = new Set(['UCT', 'DGDC', 'CCEE', 'UAS', 'USP', 'MINEDUC', 'DDPER', 'TI', 'RRHH', 'OGUC', 'NN', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);

/**
 * Escribe un texto como título en español: cada palabra con mayúscula inicial, salvo artículos y preposiciones
 * («Campus Doctor Luis Rivas del Canto», «Parque Industrial Lautaro»). Respeta siglas y números romanos.
 */
export function comoTitulo(texto?: string | null): string {
  if (!texto) return '';
  let primera = true;
  return texto.trim().replace(/\s+/g, ' ').replace(/[\p{L}\p{N}]+/gu, palabra => {
    const esPrimera = primera;
    primera = false;
    const mayus = palabra.toUpperCase();
    if (SIGLAS.has(mayus)) return mayus;
    const minus = palabra.toLowerCase();
    if (!esPrimera && MENORES.has(minus)) return minus;
    return minus.charAt(0).toUpperCase() + minus.slice(1);
  });
}
