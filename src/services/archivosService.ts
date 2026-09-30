import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { comprimirImagen } from '../utils/imagenes';

/**
 * Almacén de archivos en Firestore (sin Firebase Storage, que exige plan de pago). Cada archivo es un documento
 * `archivos/{id}` con sus datos y quién puede verlo, y el contenido en `archivos/{id}/partes/{n}` (pedazos en base64
 * de ~700 KB, bajo el límite de 1 MB por documento). Se abre con el enlace propio `{sitio}/archivo/{id}`.
 */

/** Tamaño máximo de un archivo (la base gratuita tiene 1 GB en total). */
export const MAX_BYTES_ARCHIVO = 15 * 1024 * 1024;
const BYTES_POR_PARTE = 700_000;
/** Las imágenes más pesadas que esto se comprimen antes de guardarlas. */
const COMPRIMIR_IMAGENES_DESDE = 900_000;

/** Quién puede abrir el archivo (lo aplican las reglas de Firebase). */
export type AccesoArchivo =
  | { tipo: 'interno' }
  /** Personal UCT y todos los invitados de la licitación (antecedentes, aclaraciones). */
  | { tipo: 'invitados'; licitacionId: string }
  /** Personal UCT y el proveedor dueño de la oferta. */
  | { tipo: 'oferta'; licitacionId: string; proveedorId: string }
  /** Personal UCT y la empresa con el enlace de inscripción (sin sesión). */
  | { tipo: 'inscripcion'; codigo: string };

export interface ArchivoMeta {
  nombre: string;
  tipo: string;
  tamano: number;
  partes: number;
  completo: boolean;
  acceso: AccesoArchivo['tipo'];
  licitacionId?: string;
  proveedorId?: string;
  inscripcion?: string;
  subidoPorUid?: string;
  subidoPor?: string;
  fecha: string;
}

const PREFIJO_RUTA = 'archivo/';

/** Enlace para abrir el archivo dentro del sistema. */
export const urlArchivo = (id: string) => `${window.location.origin}${import.meta.env.BASE_URL}${PREFIJO_RUTA}${id}`;

/** Id del archivo si la URL es un enlace propio del sistema (si no, undefined). */
export function idDesdeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const i = url.indexOf(`/${PREFIJO_RUTA}`);
  if (i < 0) return undefined;
  return url.slice(i + PREFIJO_RUTA.length + 1).split(/[?#/]/)[0] || undefined;
}

function aBase64(bytes: Uint8Array): string {
  let binario = '';
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  return btoa(binario);
}

function desdeBase64(datos: string): Uint8Array<ArrayBuffer> {
  const binario = atob(datos);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function prepararImagen(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.size <= COMPRIMIR_IMAGENES_DESDE) return file;
  const dataUrl = await comprimirImagen(file, 2000, COMPRIMIR_IMAGENES_DESDE);
  return new Blob([desdeBase64(dataUrl.split(',')[1])], { type: 'image/jpeg' });
}

/** Guarda el archivo y devuelve su enlace. `onProgress` va de 0 a 100. */
export async function subirArchivo(file: File, acceso: AccesoArchivo, onProgress?: (pct: number) => void): Promise<string> {
  const contenido = await prepararImagen(file);
  if (contenido.size > MAX_BYTES_ARCHIVO) {
    throw new Error(`ARCHIVO_MUY_GRANDE: el archivo pesa ${(contenido.size / 1048576).toFixed(1)} MB; el máximo es ${MAX_BYTES_ARCHIVO / 1048576} MB.`);
  }
  const bytes = new Uint8Array(await contenido.arrayBuffer());
  const partes = Math.max(1, Math.ceil(bytes.length / BYTES_POR_PARTE));
  const ref = doc(collection(db, 'archivos'));
  const usuario = auth.currentUser;
  const meta: ArchivoMeta = {
    nombre: file.name,
    tipo: contenido.type || file.type || 'application/octet-stream',
    tamano: bytes.length,
    partes,
    completo: false,
    acceso: acceso.tipo,
    ...('licitacionId' in acceso ? { licitacionId: acceso.licitacionId } : {}),
    ...('proveedorId' in acceso ? { proveedorId: acceso.proveedorId } : {}),
    ...('codigo' in acceso ? { inscripcion: acceso.codigo } : {}),
    ...(usuario ? { subidoPorUid: usuario.uid, ...(usuario.email ? { subidoPor: usuario.email } : {}) } : {}),
    fecha: new Date().toISOString(),
  };
  onProgress?.(2);
  await setDoc(ref, { ...meta, _createdAt: serverTimestamp() });
  for (let n = 0; n < partes; n++) {
    await setDoc(doc(ref, 'partes', String(n)), { n, datos: aBase64(bytes.subarray(n * BYTES_POR_PARTE, (n + 1) * BYTES_POR_PARTE)) });
    onProgress?.(Math.round(5 + ((n + 1) / partes) * 90));
  }
  await updateDoc(ref, { completo: true });
  onProgress?.(100);
  return urlArchivo(ref.id);
}

export async function leerMetaArchivo(id: string): Promise<ArchivoMeta | null> {
  const snap = await getDoc(doc(db, 'archivos', id));
  return snap.exists() ? (snap.data() as ArchivoMeta) : null;
}

/** Contenido del archivo. Acepta un enlace propio del sistema o cualquier otra URL (se descarga normalmente). */
export async function obtenerBlobArchivo(url: string): Promise<{ blob: Blob; nombre?: string }> {
  const id = idDesdeUrl(url);
  if (!id) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No se pudo descargar (${resp.status}).`);
    return { blob: await resp.blob() };
  }
  const meta = await leerMetaArchivo(id);
  if (!meta) throw new Error('ARCHIVO_NO_EXISTE');
  const partes = await getDocs(collection(db, 'archivos', id, 'partes'));
  const ordenadas = partes.docs.map(d => d.data() as { n: number; datos: string }).sort((a, b) => a.n - b.n);
  if (ordenadas.length < meta.partes) throw new Error('ARCHIVO_INCOMPLETO');
  return { blob: new Blob(ordenadas.map(p => desdeBase64(p.datos)), { type: meta.tipo }), nombre: meta.nombre };
}

/** Borra un archivo propio del sistema (las URLs externas se ignoran). */
export async function borrarArchivo(url: string): Promise<void> {
  const id = idDesdeUrl(url);
  if (!id) return;
  const meta = await leerMetaArchivo(id);
  const batch = writeBatch(db);
  for (let n = 0; n < (meta?.partes || 0); n++) batch.delete(doc(db, 'archivos', id, 'partes', String(n)));
  batch.delete(doc(db, 'archivos', id));
  await batch.commit().catch(() => deleteDoc(doc(db, 'archivos', id)).catch(() => undefined));
}

/** Espacio usado por los archivos (bytes), para mostrar cuánto queda de la base gratuita. */
export async function espacioUsadoArchivos(): Promise<{ bytes: number; cantidad: number }> {
  const snap = await getDocs(collection(db, 'archivos'));
  return snap.docs.reduce((acc, d) => ({ bytes: acc.bytes + ((d.data() as ArchivoMeta).tamano || 0), cantidad: acc.cantidad + 1 }), { bytes: 0, cantidad: 0 });
}
