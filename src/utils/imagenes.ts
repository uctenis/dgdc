/**
 * Comprime una foto del celular a JPEG (lado mayor `maxLado` px) para guardarla junto a la anotación del libro de
 * obra. Baja la calidad hasta que pese menos de `maxBytes`: así cada foto cabe en un documento de Firebase y
 * funciona sin señal.
 */
export async function comprimirImagen(file: File, maxLado = 1280, maxBytes = 450_000): Promise<string> {
  const bitmap = await cargarImagen(file);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let calidad = 0.75;
  let dataUrl = canvas.toDataURL('image/jpeg', calidad);
  while (dataUrl.length * 0.75 > maxBytes && calidad > 0.3) {
    calidad -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', calidad);
  }
  return dataUrl;
}

async function cargarImagen(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap respeta la orientación EXIF de las fotos del celular.
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* se usa <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** SHA-256 en hexadecimal (funciona sin conexión). */
export async function sha256Hex(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
