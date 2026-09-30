import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

/**
 * Registro de cambios (colección `auditoria`): quién hizo qué, cuándo y con qué valores antes y después.
 * Las reglas de Firebase no permiten editarlo ni borrarlo. Se escribe sin esperar al servidor (no demora la
 * pantalla y, sin señal, queda en cola) y nunca interrumpe la operación si falla.
 */

export type EntidadAuditoria =
  | 'Licitación' | 'Proyecto' | 'Proveedor' | 'Cotización' | 'Estado de pago' | 'Aumento de obra'
  | 'Garantía' | 'Multa' | 'Aclaración' | 'Consulta' | 'Evaluación de desempeño' | 'Invitado' | 'Configuración';

export type AccionAuditoria = 'Creó' | 'Modificó' | 'Eliminó' | 'Adjudicó' | 'Publicó' | 'Respondió' | 'Invitó';

export interface CambioCampo { antes?: string; despues?: string }

export interface RegistroAuditoria {
  id: string;
  fecha: string;
  usuario: string;
  accion: AccionAuditoria;
  entidad: EntidadAuditoria;
  entidadId: string;
  nombre?: string;
  licitacionId?: string;
  cambios?: Record<string, CambioCampo>;
  detalle?: string;
}

/** Campos técnicos que no aportan al registro. */
const IGNORADOS = new Set(['_updatedAt', '_createdAt', 'limiteOfertasMs']);
/** Agrupa cambios repetidos (autoguardado): misma persona, mismo registro y mismos campos dentro de esta ventana. */
const VENTANA_AGRUPACION_MS = 10 * 60_000;
const ultimos = new Map<string, number>();

/** Texto corto y legible de un valor para el registro (los arreglos y objetos grandes se resumen). */
export function resumirValor(valor: unknown): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (typeof valor === 'string') return valor.length > 160 ? `${valor.slice(0, 157)}…` : valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (Array.isArray(valor)) return `(${valor.length} ${valor.length === 1 ? 'elemento' : 'elementos'})`;
  if (typeof valor === 'object' && 'toDate' in (valor as object)) return undefined; // marcas de tiempo del servidor
  const json = JSON.stringify(valor);
  return json.length > 160 ? `${json.slice(0, 157)}…` : json;
}

/** Campos que cambian entre `antes` y los `datos` nuevos (solo los campos que se están guardando). */
export function diferencias(antes: Record<string, unknown> | undefined, datos: Record<string, unknown>): Record<string, CambioCampo> {
  const cambios: Record<string, CambioCampo> = {};
  for (const [campo, nuevo] of Object.entries(datos)) {
    if (IGNORADOS.has(campo) || campo.includes('.')) continue;
    const previo = antes?.[campo];
    if (JSON.stringify(previo ?? null) === JSON.stringify(nuevo ?? null)) continue;
    const a = resumirValor(previo);
    const d = resumirValor(nuevo);
    // Arreglos del mismo largo que cambiaron por dentro (ej. itemizado editado).
    cambios[campo] = { ...(a !== undefined ? { antes: a } : {}), ...(d !== undefined ? { despues: a === d ? `${d} (modificado)` : d } : {}) };
  }
  return cambios;
}

export function registrarCambio(entrada: Omit<RegistroAuditoria, 'id' | 'fecha' | 'usuario'>): void {
  try {
    const usuario = auth.currentUser?.email || 'sin sesión';
    if (entrada.accion === 'Modificó') {
      if (!entrada.cambios || !Object.keys(entrada.cambios).length) return;
      const clave = `${usuario}|${entrada.entidad}|${entrada.entidadId}|${Object.keys(entrada.cambios).sort().join(',')}`;
      const ahora = Date.now();
      if (ahora - (ultimos.get(clave) || 0) < VENTANA_AGRUPACION_MS) return;
      ultimos.set(clave, ahora);
    }
    const limpio = Object.fromEntries(Object.entries(entrada).filter(([, v]) => v !== undefined));
    void addDoc(collection(db, 'auditoria'), { ...limpio, usuario, fecha: new Date().toISOString(), _createdAt: serverTimestamp() })
      .catch(err => console.warn('No se pudo guardar el registro de cambios:', err));
  } catch (err) {
    console.warn('No se pudo preparar el registro de cambios:', err);
  }
}

/** Últimos cambios registrados, del más reciente al más antiguo. */
export function subscribeToAuditoria(callback: (registros: RegistroAuditoria[]) => void, onError?: (err: unknown) => void, maximo = 500): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'auditoria'), orderBy('fecha', 'desc'), limit(maximo)),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<RegistroAuditoria, 'id'>) }))),
    err => { console.warn('No se pudo leer el registro de cambios:', err); onError?.(err); }
  );
}
