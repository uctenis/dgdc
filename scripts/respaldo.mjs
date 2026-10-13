// Respaldo completo de la base de datos (Firestore) a archivos JSON en este computador.
//
//   node scripts/respaldo.mjs                 → guarda en ../dgdc-respaldos/AAAA-MM-DD_HHMM/
//   node scripts/respaldo.mjs D:\respaldos    → guarda en la carpeta indicada
//
// Usa la sesión de Google Cloud de quien lo ejecuta (`gcloud auth login` con una cuenta dueña o
// editora del proyecto): no necesita ni guarda ninguna clave. La carpeta de destino debe quedar
// FUERA del repositorio, que es público: el respaldo contiene datos de proveedores y de proyectos.
//
// Cada colección queda en un archivo, con sus subcolecciones dentro de cada documento, en el formato
// propio de Firestore (con el tipo de cada campo), para poder restaurarlo sin pérdida.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROYECTO = process.env.FIREBASE_PROJECT || 'dgdc-c848d';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents`;
const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ahora = new Date();
const dos = n => String(n).padStart(2, '0');
const sello = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}_${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
const destino = resolve(process.argv[2] || join(raizRepo, '..', 'dgdc-respaldos'), sello);
if (destino.startsWith(raizRepo + '\\') || destino.startsWith(raizRepo + '/')) {
  console.error('La carpeta de respaldo no puede estar dentro del repositorio (es público).');
  process.exit(1);
}

let token = '';
try {
  token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  console.error('No hay sesión de Google Cloud. Ejecute primero: gcloud auth login');
  process.exit(1);
}

async function llamar(url, opciones = {}) {
  const resp = await fetch(url, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROYECTO, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`${resp.status} en ${url.replace(BASE, '')}: ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

/** Ids de las subcolecciones de un documento (ruta '' = colecciones raíz). */
async function listarColecciones(rutaDocumento) {
  const ids = [];
  let pageToken;
  do {
    const r = await llamar(`${BASE}${rutaDocumento ? `/${rutaDocumento}` : ''}:listCollectionIds`, {
      method: 'POST', body: JSON.stringify({ pageSize: 300, pageToken }),
    });
    ids.push(...(r.collectionIds || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return ids;
}

const totales = {};

/** Todos los documentos de una colección, cada uno con sus subcolecciones. */
async function leerColeccion(rutaColeccion) {
  const documentos = [];
  let pageToken;
  do {
    // showMissing: incluye documentos "vacíos" que solo existen porque tienen subcolecciones.
    const r = await llamar(`${BASE}/${rutaColeccion}?pageSize=300&showMissing=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    for (const d of r.documents || []) {
      const ruta = d.name.split('/documents/')[1];
      const sub = {};
      for (const id of await listarColecciones(ruta)) sub[id] = await leerColeccion(`${ruta}/${id}`);
      documentos.push({
        ruta,
        ...(d.fields ? { campos: d.fields } : { sinCampos: true }),
        ...(d.createTime ? { creado: d.createTime, actualizado: d.updateTime } : {}),
        ...(Object.keys(sub).length ? { subcolecciones: sub } : {}),
      });
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  const nombre = rutaColeccion.split('/').filter((_, i) => i % 2 === 0).join('/');
  totales[nombre] = (totales[nombre] || 0) + documentos.length;
  return documentos;
}

const raices = await listarColecciones('');
mkdirSync(destino, { recursive: true });
let bytes = 0;
for (const id of raices) {
  const contenido = JSON.stringify({ proyecto: PROYECTO, coleccion: id, fecha: ahora.toISOString(), documentos: await leerColeccion(id) });
  writeFileSync(join(destino, `${id}.json`), contenido);
  bytes += Buffer.byteLength(contenido);
  console.log(`  ${id}: ${totales[id]} documento(s)`);
}
writeFileSync(join(destino, '_resumen.json'), JSON.stringify({ proyecto: PROYECTO, fecha: ahora.toISOString(), colecciones: raices, documentosPorColeccion: totales, bytes }, null, 2));
console.log(`\nRespaldo completo: ${Object.values(totales).reduce((a, b) => a + b, 0)} documentos, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(destino);
