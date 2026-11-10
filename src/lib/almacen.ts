// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ALMACÉN DE DOCUMENTOS EN SUPABASE (etapa 2 de la unificación)
//
// Misma forma de trabajo que Firestore (colecciones, documentos, consultas, transacciones, lotes y avisos en vivo),
// pero guardado en las tablas de Supabase: cada registro lleva el documento completo en la columna «datos» y las
// columnas de la tabla se calculan solas a partir de él (migración 0015). Así los servicios de datos solo cambian su
// importación de 'firebase/firestore' a esta capa.
//
// - Las escrituras pasan por la función escribir_documentos (una transacción de la base por llamada).
// - Las transacciones son optimistas, como en Firestore: guardan la versión de lo leído y, si alguien lo cambió
//   entremedio, se reintentan.
// - onSnapshot = lectura + aviso en vivo de Supabase Realtime + aviso local al escribir + sondeo de respaldo.
// - Los lotes (writeBatch) que fallan por falta de señal quedan en una cola del navegador y se suben solos al volver
//   la conexión (el libro de obra se usa en terreno); mientras tanto se muestran como pendientes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase';

export type DocumentData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Unsubscribe = () => void;

/** Marca que reemplaza al objeto `db` de Firestore (no guarda estado). */
export const db = { tipo: 'almacen-supabase' } as const;
type Almacen = typeof db;

// ── Rutas → tablas ──────────────────────────────────────────────────────────────────────────────────────────────

interface Destino {
  tabla: string;
  /** Filtros fijos por los padres de la ruta (ej. licitacion_id y tipo). */
  filtros: Record<string, string>;
  /** Columna que guarda el id del documento. */
  columnaId: string;
  /** Prefijo del id en la tabla (fotos del libro de obra: «{entrada}/»). */
  prefijo?: string;
}

/** Tabla y filtros de una colección dada por su ruta (segmentos alternados colección/documento). */
export function destinoDeColeccion(segs: string[]): Destino {
  const [c0, d0, c1, d1, c2] = segs;
  const ruta = segs.join('/');
  if (segs.length === 1) {
    switch (c0) {
      case 'proyectos': return { tabla: 'proyectos', filtros: {}, columnaId: 'id' };
      case '_counters': return { tabla: 'contadores', filtros: {}, columnaId: 'id' };
      case 'licitaciones': return { tabla: 'licitaciones', filtros: {}, columnaId: 'id' };
      case 'proveedores': return { tabla: 'proveedores', filtros: {}, columnaId: 'id' };
      case 'cotizaciones': return { tabla: 'cotizaciones', filtros: {}, columnaId: 'id' };
      case 'inscripcionesProveedores': return { tabla: 'inscripciones_proveedores', filtros: {}, columnaId: 'codigo' };
      case 'invitaciones': return { tabla: 'invitaciones_acceso', filtros: {}, columnaId: 'token' };
    }
  }
  if (segs.length === 3 && c0 === 'proyectos') return { tabla: 'proyecto_subcolecciones', filtros: { proyecto_id: d0, tipo: c1 }, columnaId: 'id' };
  if (segs.length === 3 && c0 === 'licitaciones') {
    if (c1 === 'invitados') return { tabla: 'licitacion_invitados', filtros: { licitacion_id: d0 }, columnaId: 'proveedor_id' };
    if (c1 === 'propuestas') return { tabla: 'licitacion_propuestas', filtros: { licitacion_id: d0 }, columnaId: 'proveedor_id' };
    return { tabla: 'licitacion_subcolecciones', filtros: { licitacion_id: d0, tipo: c1 }, columnaId: 'id' };
  }
  if (segs.length === 5 && c0 === 'licitaciones' && c1 === 'libroObra' && c2 === 'fotos') {
    return { tabla: 'licitacion_subcolecciones', filtros: { licitacion_id: d0, tipo: 'libroObraFotos' }, columnaId: 'id', prefijo: `${d1}/` };
  }
  if (segs.length === 3 && c0 === 'proveedores') {
    if (c1 === 'evaluacionesDesempeno') return { tabla: 'evaluaciones_desempeno', filtros: { proveedor_id: d0 }, columnaId: 'id' };
    if (c1 === 'historialObras') return { tabla: 'historial_obras_proveedor', filtros: { proveedor_id: d0 }, columnaId: 'id' };
  }
  throw new Error(`RUTA_NO_MIGRADA: «${ruta}» no tiene tabla en Supabase`);
}

/** Claves (columnas y valores) que identifican a un documento en su tabla. */
export function clavesDeDocumento(segs: string[]): { tabla: string; claves: Record<string, string> } {
  const d = destinoDeColeccion(segs.slice(0, -1));
  return { tabla: d.tabla, claves: { ...d.filtros, [d.columnaId]: (d.prefijo || '') + segs[segs.length - 1] } };
}

// Grupos de colecciones (collectionGroup): todas las subcolecciones con ese nombre, en cualquier licitación.
const GRUPOS: Record<string, { tabla: string; filtros: Record<string, string>; columnaId: string }> = {
  consultas: { tabla: 'licitacion_subcolecciones', filtros: { tipo: 'consultas' }, columnaId: 'id' },
  garantias: { tabla: 'licitacion_subcolecciones', filtros: { tipo: 'garantias' }, columnaId: 'id' },
  invitados: { tabla: 'licitacion_invitados', filtros: {}, columnaId: 'proveedor_id' },
};

// ── Referencias ─────────────────────────────────────────────────────────────────────────────────────────────────

const partir = (partes: string[]) => partes.flatMap(p => String(p).split('/')).filter(Boolean);

export class CollectionReference {
  readonly type = 'collection' as const;
  readonly segs: string[];
  constructor(segs: string[]) { this.segs = segs; }
  get id() { return this.segs[this.segs.length - 1]; }
  get path() { return this.segs.join('/'); }
  get parent(): DocumentReference | null { return this.segs.length > 1 ? new DocumentReference(this.segs.slice(0, -1)) : null; }
}

export class DocumentReference {
  readonly type = 'document' as const;
  readonly segs: string[];
  constructor(segs: string[]) { this.segs = segs; }
  get id() { return this.segs[this.segs.length - 1]; }
  get path() { return this.segs.join('/'); }
  get parent(): CollectionReference { return new CollectionReference(this.segs.slice(0, -1)); }
}

interface Grupo { readonly type: 'group'; readonly nombre: string }

type Restriccion =
  | { tipo: 'where'; campo: string; op: string; valor: unknown }
  | { tipo: 'orderBy'; campo: string; dir: 'asc' | 'desc' }
  | { tipo: 'limit'; n: number };

export class Query {
  readonly type = 'query' as const;
  readonly base: CollectionReference | Grupo;
  readonly restricciones: Restriccion[];
  constructor(base: CollectionReference | Grupo, restricciones: Restriccion[]) { this.base = base; this.restricciones = restricciones; }
}

const nuevoId = () => {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const azar = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(azar, b => letras[b % letras.length]).join('');
};

export function collection(base: Almacen | DocumentReference | CollectionReference, ...ruta: string[]): CollectionReference {
  const previos = base instanceof DocumentReference || base instanceof CollectionReference ? base.segs : [];
  const segs = [...previos, ...partir(ruta)];
  if (segs.length % 2 === 0) throw new Error(`Ruta de colección inválida: ${segs.join('/')}`);
  return new CollectionReference(segs);
}

export function doc(base: Almacen | DocumentReference | CollectionReference, ...ruta: string[]): DocumentReference {
  const previos = base instanceof DocumentReference || base instanceof CollectionReference ? base.segs : [];
  let segs = [...previos, ...partir(ruta)];
  if (segs.length % 2 === 1) segs = [...segs, nuevoId()]; // doc(colección): id nuevo
  return new DocumentReference(segs);
}

export const collectionGroup = (_db: Almacen, nombre: string): Grupo => {
  if (!GRUPOS[nombre]) throw new Error(`RUTA_NO_MIGRADA: grupo «${nombre}»`);
  return { type: 'group', nombre };
};

export const where = (campo: string, op: string, valor: unknown): Restriccion => ({ tipo: 'where', campo, op, valor });
export const orderBy = (campo: string, dir: 'asc' | 'desc' = 'asc'): Restriccion => ({ tipo: 'orderBy', campo, dir });
export const limit = (n: number): Restriccion => ({ tipo: 'limit', n });
export function query(base: CollectionReference | Query | Grupo, ...restricciones: Restriccion[]): Query {
  return base instanceof Query ? new Query(base.base, [...base.restricciones, ...restricciones]) : new Query(base, restricciones);
}

// ── Valores especiales ──────────────────────────────────────────────────────────────────────────────────────────

class ValorEspecial {
  readonly op: Record<string, unknown>;
  constructor(op: Record<string, unknown>) { this.op = op; }
}
export const serverTimestamp = () => new ValorEspecial({ __op: 'serverTimestamp' });
export const increment = (n: number) => new ValorEspecial({ __op: 'increment', n });
export const arrayUnion = (...v: unknown[]) => new ValorEspecial({ __op: 'arrayUnion', v });
export const arrayRemove = (...v: unknown[]) => new ValorEspecial({ __op: 'arrayRemove', v });
export const deleteField = () => new ValorEspecial({ __op: 'deleteField' });

const esObjetoPlano = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof ValorEspecial) && !(v instanceof Date) && Object.getPrototypeOf(v) === Object.prototype;

/**
 * Prepara un valor para guardarlo: quita `undefined` (como ignoreUndefinedProperties de Firestore), pasa las fechas a
 * texto ISO y convierte los valores especiales. Dentro de objetos anidados la hora del servidor se resuelve aquí.
 */
export function codificar(v: unknown, nivelSuperior = true): unknown {
  if (v instanceof ValorEspecial) {
    if (!nivelSuperior && v.op.__op === 'serverTimestamp') return new Date().toISOString();
    return v.op;
  }
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(x => (x === undefined ? null : codificar(x, false)));
  if (esObjetoPlano(v)) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, codificar(x, false)]));
  }
  return v;
}

/** Cambios de primer nivel (cada clave puede ser una ruta con puntos), con sus valores ya codificados. */
const cambiosDe = (datos: DocumentData) =>
  Object.fromEntries(Object.entries(datos).filter(([, x]) => x !== undefined).map(([k, x]) => [k, codificar(x, true)]));

/** setDoc con merge: los objetos se mezclan en profundidad (como Firestore), así que se aplanan a rutas con punto. */
export function aplanarParaMezcla(datos: DocumentData, prefijo = ''): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(datos)) {
    if (x === undefined) continue;
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    if (esObjetoPlano(x) && Object.keys(x).length) Object.assign(salida, aplanarParaMezcla(x, ruta));
    else salida[ruta] = codificar(x, true);
  }
  return salida;
}

/** Fechas de Firestore copiadas como {seconds, nanoseconds} → texto ISO (por si quedó alguna sin normalizar). */
export function normalizarLeido(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalizarLeido);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const claves = Object.keys(o);
    if ('seconds' in o && 'nanoseconds' in o && claves.length <= 3) {
      return new Date(Number(o.seconds) * 1000 + Math.round(Number(o.nanoseconds) / 1e6)).toISOString();
    }
    return Object.fromEntries(claves.map(k => [k, normalizarLeido(o[k])]));
  }
  return v;
}

// ── Instantáneas ────────────────────────────────────────────────────────────────────────────────────────────────

export class DocumentSnapshot<T = DocumentData> {
  readonly metadata: { hasPendingWrites: boolean; fromCache: boolean };
  readonly ref: DocumentReference;
  readonly version: string | null;
  private readonly datos: T | undefined;
  constructor(ref: DocumentReference, datos: T | undefined, version: string | null, pendiente = false) {
    this.ref = ref;
    this.datos = datos;
    this.version = version;
    this.metadata = { hasPendingWrites: pendiente, fromCache: false };
  }
  get id() { return this.ref.id; }
  exists(): this is QueryDocumentSnapshot<T> { return this.datos !== undefined; }
  data(): T | undefined { return this.datos; }
  get(campo: string): unknown {
    return campo.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), this.datos);
  }
}
/** Documento que viene de una consulta: siempre existe. */
export class QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  data(): T { return super.data() as T; }
}

export class QuerySnapshot<T = DocumentData> {
  readonly docs: QueryDocumentSnapshot<T>[];
  constructor(docs: QueryDocumentSnapshot<T>[]) { this.docs = docs; }
  get size() { return this.docs.length; }
  get empty() { return this.docs.length === 0; }
  forEach(fn: (d: QueryDocumentSnapshot<T>) => void) { this.docs.forEach(fn); }
}

// ── Lectura ─────────────────────────────────────────────────────────────────────────────────────────────────────

const errorDe = (e: { message?: string } | null, accion: string) => new Error(`${accion}: ${e?.message || 'error desconocido'}`);

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  const { tabla, claves } = clavesDeDocumento(ref.segs);
  let consulta = supabase.from(tabla).select('datos, actualizado_en');
  for (const [c, v] of Object.entries(claves)) consulta = consulta.eq(c, v);
  const { data, error } = await consulta.maybeSingle();
  if (error) throw errorDe(error, `No se pudo leer ${ref.path}`);
  const fila = data as { datos: DocumentData; actualizado_en: string } | null;
  const pendiente = pendientesDe(ref.segs.slice(0, -1)).find(p => p.id === ref.id);
  if (pendiente) return new DocumentSnapshot(ref, { ...(fila?.datos ? normalizarLeido(fila.datos) as DocumentData : {}), ...pendiente.datos }, fila?.actualizado_en ?? null, true);
  return new DocumentSnapshot(ref, fila ? (normalizarLeido(fila.datos) as DocumentData) : undefined, fila?.actualizado_en ?? null);
}

/** Valor con el que se compara un campo del documento (`datos->>campo` es texto). */
const comoTexto = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export async function getDocs(q: Query | CollectionReference | Grupo): Promise<QuerySnapshot> {
  const consulta = q instanceof Query ? q : new Query(q, []);
  const base = consulta.base;
  const grupo = base instanceof CollectionReference ? null : GRUPOS[(base as Grupo).nombre];
  const destino: Destino = base instanceof CollectionReference ? destinoDeColeccion(base.segs) : { ...grupo! };
  const conPadre = !!grupo; // en los grupos, cada fila trae su licitación
  const columnas = [destino.columnaId, 'datos', 'actualizado_en', ...(conPadre ? ['licitacion_id'] : [])].join(', ');
  const limite = consulta.restricciones.find(r => r.tipo === 'limit') as { n: number } | undefined;

  const filas: Record<string, unknown>[] = [];
  for (let desde = 0; ; desde += 1000) {
    let s = supabase.from(destino.tabla).select(columnas);
    for (const [c, v] of Object.entries(destino.filtros)) s = s.eq(c, v);
    if (destino.prefijo) s = s.like(destino.columnaId, `${destino.prefijo.replace(/[%_]/g, '\\$&')}%`);
    for (const r of consulta.restricciones) {
      if (r.tipo !== 'where') continue;
      const campo = `datos->>${r.campo}`;
      if (r.op === '==') s = r.valor === null ? s.is(`datos->${r.campo}`, null) : s.eq(campo, comoTexto(r.valor));
      else if (r.op === '!=') s = s.neq(campo, comoTexto(r.valor));
      else if (r.op === 'in') s = s.in(campo, (r.valor as unknown[]).map(comoTexto));
      else if (r.op === 'array-contains') s = s.filter(`datos->${r.campo}`, 'cs', JSON.stringify([r.valor]));
      else throw new Error(`Operador de consulta no disponible: ${r.op}`);
    }
    for (const r of consulta.restricciones) if (r.tipo === 'orderBy') s = s.order(`datos->${r.campo}`, { ascending: r.dir === 'asc' });
    s = s.order(destino.columnaId, { ascending: true });
    const hasta = limite ? Math.min(desde + 999, limite.n - 1) : desde + 999;
    const { data, error } = await s.range(desde, hasta);
    if (error) throw errorDe(error, `No se pudo leer ${base instanceof CollectionReference ? base.path : (base as Grupo).nombre}`);
    filas.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000 || (limite && filas.length >= limite.n)) break;
  }

  const docs = filas.map(f => {
    const idTabla = String(f[destino.columnaId]);
    const id = destino.prefijo ? idTabla.slice(destino.prefijo.length) : idTabla;
    const segs = base instanceof CollectionReference ? [...base.segs, id] : ['licitaciones', String(f.licitacion_id), (base as Grupo).nombre, id];
    return new QueryDocumentSnapshot(new DocumentReference(segs), normalizarLeido(f.datos) as DocumentData, String(f.actualizado_en));
  });
  // Escrituras hechas sin señal que aún no llegan al servidor (solo colecciones directas, como el libro de obra).
  if (base instanceof CollectionReference) {
    for (const p of pendientesDe(base.segs)) {
      const i = docs.findIndex(d => d.id === p.id);
      const snap = new QueryDocumentSnapshot(new DocumentReference([...base.segs, p.id]), { ...(i >= 0 ? docs[i].data() : {}), ...p.datos }, null, true);
      if (i >= 0) docs[i] = snap; else docs.push(snap);
    }
  }
  return new QuerySnapshot(docs);
}

// ── Escritura ───────────────────────────────────────────────────────────────────────────────────────────────────

interface Operacion {
  tabla: string;
  claves: Record<string, string>;
  accion: 'set' | 'merge' | 'update' | 'delete';
  datos?: Record<string, unknown>;
  version?: string | null;
}

function operacion(ref: DocumentReference, accion: Operacion['accion'], datos?: DocumentData): Operacion {
  const { tabla, claves } = clavesDeDocumento(ref.segs);
  const codificados = !datos ? undefined : accion === 'merge' ? aplanarParaMezcla(datos) : cambiosDe(datos);
  return { tabla, claves, accion, ...(codificados ? { datos: codificados } : {}) };
}

async function enviar(ops: Operacion[]): Promise<void> {
  if (!ops.length) return;
  const { error } = await supabase.rpc('escribir_documentos', { ops });
  if (error) {
    const e = new Error(error.message) as Error & { code?: string };
    e.code = /CONFLICTO_TRANSACCION/.test(error.message) ? 'aborted' : /NO_EXISTE/.test(error.message) ? 'not-found' : /row-level security|permission denied/i.test(error.message) ? 'permission-denied' : 'unknown';
    throw e;
  }
  for (const t of new Set(ops.map(o => o.tabla))) avisarCambio(t);
}

export async function setDoc(ref: DocumentReference, datos: DocumentData, opciones?: { merge?: boolean }): Promise<void> {
  await enviar([operacion(ref, opciones?.merge ? 'merge' : 'set', datos)]);
}
export async function updateDoc(ref: DocumentReference, datos: DocumentData): Promise<void> {
  await enviar([operacion(ref, 'update', datos)]);
}
export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await enviar([operacion(ref, 'delete')]);
}
export async function addDoc(col: CollectionReference, datos: DocumentData): Promise<DocumentReference> {
  const ref = doc(col);
  await setDoc(ref, datos);
  return ref;
}

export interface WriteBatch {
  set(ref: DocumentReference, datos: DocumentData, opciones?: { merge?: boolean }): WriteBatch;
  update(ref: DocumentReference, datos: DocumentData): WriteBatch;
  delete(ref: DocumentReference): WriteBatch;
  commit(): Promise<void>;
}

export function writeBatch(_db: Almacen): WriteBatch {
  const ops: Operacion[] = [];
  const locales: { segs: string[]; datos: DocumentData; accion: Operacion['accion'] }[] = [];
  const lote: WriteBatch = {
    set(ref, datos, opciones) { ops.push(operacion(ref, opciones?.merge ? 'merge' : 'set', datos)); locales.push({ segs: ref.segs, datos, accion: 'set' }); return lote; },
    update(ref, datos) { ops.push(operacion(ref, 'update', datos)); locales.push({ segs: ref.segs, datos, accion: 'update' }); return lote; },
    delete(ref) { ops.push(operacion(ref, 'delete')); locales.push({ segs: ref.segs, datos: {}, accion: 'delete' }); return lote; },
    async commit() {
      try {
        await enviar(ops);
      } catch (e) {
        if (!esFaltaDeSenal(e)) throw e;
        // Sin señal: queda en la cola del navegador y se sube sola al volver la conexión.
        return encolar(ops, locales);
      }
    },
  };
  return lote;
}

export interface Transaction {
  get(ref: DocumentReference): Promise<DocumentSnapshot>;
  set(ref: DocumentReference, datos: DocumentData, opciones?: { merge?: boolean }): Transaction;
  update(ref: DocumentReference, datos: DocumentData): Transaction;
  delete(ref: DocumentReference): Transaction;
}

/** Transacción optimista: se reintenta (hasta 5 veces) si algo de lo leído cambió antes de guardar. */
export async function runTransaction<T>(_db: Almacen, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    const versiones = new Map<string, string | null>();
    const ops: Operacion[] = [];
    const conVersion = (ref: DocumentReference, op: Operacion) => (versiones.has(ref.path) ? { ...op, version: versiones.get(ref.path)! } : op);
    const tx: Transaction = {
      async get(ref) {
        const snap = await getDoc(ref);
        versiones.set(ref.path, snap.exists() ? snap.version : null);
        return snap;
      },
      set(ref, datos, opciones) { ops.push(conVersion(ref, operacion(ref, opciones?.merge ? 'merge' : 'set', datos))); return tx; },
      update(ref, datos) { ops.push(conVersion(ref, operacion(ref, 'update', datos))); return tx; },
      delete(ref) { ops.push(conVersion(ref, operacion(ref, 'delete'))); return tx; },
    };
    const resultado = await fn(tx);
    try {
      await enviar(ops);
      return resultado;
    } catch (e) {
      if ((e as { code?: string }).code !== 'aborted' || intento >= 5) throw e;
      await new Promise(r => setTimeout(r, 80 * intento + Math.random() * 120));
    }
  }
}

// ── Cola de escrituras sin señal ────────────────────────────────────────────────────────────────────────────────

const CLAVE_COLA = 'dgdc:almacen:pendientes';
interface Pendiente { ops: Operacion[]; locales: { segs: string[]; datos: DocumentData; accion: Operacion['accion'] }[] }
let colaEnMemoria: Pendiente[] | null = null;

const esFaltaDeSenal = (e: unknown) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || /Failed to fetch|NetworkError|Load failed|network/i.test(String((e as Error)?.message || e));

function leerCola(): Pendiente[] {
  if (colaEnMemoria) return colaEnMemoria;
  try { colaEnMemoria = JSON.parse(localStorage.getItem(CLAVE_COLA) || '[]') as Pendiente[]; } catch { colaEnMemoria = []; }
  return colaEnMemoria;
}
function guardarCola(cola: Pendiente[]) {
  colaEnMemoria = cola;
  // Las fotos pueden no caber en el almacenamiento del navegador: en ese caso la cola vive solo mientras la pestaña
  // siga abierta (se avisa en la consola).
  try { localStorage.setItem(CLAVE_COLA, JSON.stringify(cola)); } catch (e) { console.warn('La cola sin señal no cabe en el navegador; no cierre la pestaña hasta que se suba.', e); }
}

const esperandoCola: (() => void)[] = [];
function encolar(ops: Operacion[], locales: Pendiente['locales']): Promise<void> {
  guardarCola([...leerCola(), { ops, locales }]);
  for (const t of new Set(ops.map(o => o.tabla))) avisarCambio(t);
  programarReintento();
  return new Promise(resolve => esperandoCola.push(resolve));
}

/** Documentos de una colección que están en la cola (para mostrarlos como pendientes). */
function pendientesDe(segsColeccion: string[]): { id: string; datos: DocumentData }[] {
  const ruta = segsColeccion.join('/');
  const salida = new Map<string, DocumentData>();
  for (const p of leerCola()) {
    for (const l of p.locales) {
      if (l.segs.slice(0, -1).join('/') !== ruta || l.accion === 'delete') continue;
      const id = l.segs[l.segs.length - 1];
      salida.set(id, { ...(salida.get(id) || {}), ...(normalizarLeido(codificar(l.datos, false)) as DocumentData) });
    }
  }
  return [...salida.entries()].map(([id, datos]) => ({ id, datos }));
}

let reintento: ReturnType<typeof setTimeout> | null = null;
function programarReintento(ms = 15000) {
  if (reintento || typeof window === 'undefined') return;
  reintento = setTimeout(() => { reintento = null; void vaciarCola(); }, ms);
}
async function vaciarCola() {
  let cola = leerCola();
  while (cola.length) {
    try {
      await enviar(cola[0].ops);
    } catch (e) {
      if (esFaltaDeSenal(e)) { programarReintento(); return; }
      console.error('Una escritura guardada sin señal fue rechazada por el servidor y se descarta:', e);
    }
    cola = cola.slice(1);
    guardarCola(cola);
  }
  for (const t of new Set(Object.keys(vigilantesPorTabla))) avisarCambio(t);
  esperandoCola.splice(0).forEach(r => r());
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void vaciarCola());
  if (leerCola().length) programarReintento(2000);
}

// ── Avisos en vivo (onSnapshot) ─────────────────────────────────────────────────────────────────────────────────

const vigilantesPorTabla: Record<string, Set<() => void>> = {};
function avisarCambio(tabla: string) {
  vigilantesPorTabla[tabla]?.forEach(f => f());
}

type AlCambiar<S> = (snap: S) => void;
type AlFallar = (error: Error) => void;
let contadorCanales = 0;

/**
 * Escucha un documento o una consulta: entrega el estado inicial y vuelve a leer cuando la tabla cambia (aviso en vivo
 * de Supabase, escritura propia o, como respaldo, cada 20 segundos). Solo avisa si el resultado cambió.
 */
export function onSnapshot(objetivo: DocumentReference, alCambiar: AlCambiar<DocumentSnapshot>, alFallar?: AlFallar): Unsubscribe;
export function onSnapshot(objetivo: DocumentReference, opciones: object, alCambiar: AlCambiar<DocumentSnapshot>, alFallar?: AlFallar): Unsubscribe;
export function onSnapshot(objetivo: Query | CollectionReference | Grupo, alCambiar: AlCambiar<QuerySnapshot>, alFallar?: AlFallar): Unsubscribe;
export function onSnapshot(objetivo: Query | CollectionReference | Grupo, opciones: object, alCambiar: AlCambiar<QuerySnapshot>, alFallar?: AlFallar): Unsubscribe;
export function onSnapshot(objetivo: DocumentReference | Query | CollectionReference | Grupo, ...args: unknown[]): Unsubscribe {
  const funciones = args.filter(a => typeof a === 'function') as [AlCambiar<never>, AlFallar?];
  const [alCambiar, alFallar] = funciones;
  const esDoc = objetivo instanceof DocumentReference;
  const base = objetivo instanceof Query ? objetivo.base : objetivo;
  const destino = base instanceof DocumentReference ? clavesDeDocumento(base.segs)
    : base instanceof CollectionReference ? (() => { const d = destinoDeColeccion(base.segs); return { tabla: d.tabla, claves: d.filtros }; })()
    : { tabla: GRUPOS[(base as Grupo).nombre].tabla, claves: GRUPOS[(base as Grupo).nombre].filtros };

  let activo = true;
  let ultimo = '';
  let enCurso = false;
  let otraVez = false;
  const leer = async () => {
    if (!activo) return;
    if (enCurso) { otraVez = true; return; }
    enCurso = true;
    try {
      const snap = esDoc ? await getDoc(objetivo as DocumentReference) : await getDocs(objetivo as Query | CollectionReference | Grupo);
      const firma = esDoc
        ? JSON.stringify([(snap as DocumentSnapshot).data() ?? null, (snap as DocumentSnapshot).metadata.hasPendingWrites])
        : JSON.stringify((snap as QuerySnapshot).docs.map(d => [d.id, d.data(), d.metadata.hasPendingWrites]));
      if (activo && firma !== ultimo) { ultimo = firma; alCambiar(snap as never); }
    } catch (e) {
      if (activo) alFallar?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      enCurso = false;
      if (otraVez && activo) { otraVez = false; void leer(); }
    }
  };
  let espera: ReturnType<typeof setTimeout> | null = null;
  const programar = () => { if (espera) clearTimeout(espera); espera = setTimeout(() => { espera = null; void leer(); }, 150); };

  (vigilantesPorTabla[destino.tabla] ||= new Set()).add(programar);
  // Supabase Realtime admite un solo filtro: se usa el más específico disponible.
  const [filtroCol, filtroVal] = Object.entries(destino.claves).find(([c]) => c !== 'tipo') || [];
  const canal = supabase.channel(`almacen-${destino.tabla}-${++contadorCanales}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: destino.tabla, ...(filtroCol ? { filter: `${filtroCol}=eq.${filtroVal}` } : {}) }, programar)
    .subscribe();
  const sondeo = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState === 'visible') void leer(); }, 20000);
  void leer();

  return () => {
    activo = false;
    if (espera) clearTimeout(espera);
    clearInterval(sondeo);
    vigilantesPorTabla[destino.tabla]?.delete(programar);
    void supabase.removeChannel(canal);
  };
}
