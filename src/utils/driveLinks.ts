/** Enlaces a Google Drive: el sistema los guarda tal cual, sin copiar el archivo. */

const HOSTS_DRIVE = ['drive.google.com', 'docs.google.com'];

/** true si es un enlace https a Google Drive o a un documento de Google (Docs, Sheets, Slides). */
export function esEnlaceDrive(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && HOSTS_DRIVE.includes(u.hostname);
  } catch {
    return false;
  }
}

/** true si el enlace apunta a una carpeta (no a un archivo). */
export function esCarpetaDrive(url?: string): boolean {
  return esEnlaceDrive(url) && /\/folders\//.test(url as string);
}
