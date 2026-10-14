import { collection, doc, addDoc, updateDoc, getDocs, getDoc, onSnapshot, serverTimestamp, query, where, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { registrarCambio } from '../auditoriaService';
import { renombrarSiglaEdificio } from '../../data/campusData';
import { type ProyectoMaestro, type MultaObra } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// MULTAS POR ATRASO (licitaciones/{id}/multas)
// ═══════════════════════════════════════════════════════════════════

export function subscribeToMultas(licitacionId: string, callback: (multas: MultaObra[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'licitaciones', licitacionId, 'multas'), snap => {
    callback(snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<MultaObra, 'id'>) }))
      .sort((a, b) => a.desde.localeCompare(b.desde)));
  }, err => console.warn('No se pudieron leer las multas:', err));
}

export async function addMultaSinRegistro(licitacionId: string, data: Omit<MultaObra, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'licitaciones', licitacionId, 'multas'), { ...data, _createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateMultaSinRegistro(licitacionId: string, multaId: string, data: Partial<MultaObra>): Promise<void> {
  await updateDoc(doc(db, 'licitaciones', licitacionId, 'multas', multaId), { ...data, _updatedAt: serverTimestamp() });
}

/** Marca las multas como descontadas en un estado de pago. */
export async function marcarMultasDescontadas(licitacionId: string, multasIds: string[], estadoPagoId: string, estadoPagoNumero: number): Promise<void> {
  if (!multasIds.length) return;
  const batch = writeBatch(db);
  multasIds.forEach(id => batch.update(doc(db, 'licitaciones', licitacionId, 'multas', id), { estadoPagoId, estadoPagoNumero, _updatedAt: serverTimestamp() }));
  await batch.commit();
}

/**
 * Lleva a los proyectos y licitaciones el cambio de sigla o de nombre de un campus (ej. CHS → CSL): campus, nombre
 * del campus y edificio. El catálogo se cambia aparte (renombrarSiglaCampus en campusData).
 */
export async function migrarSiglaCampus(antigua: string, nueva: string, nombreCampus: string): Promise<{ proyectos: number; licitaciones: number }> {
  const conteo = { proyectos: 0, licitaciones: 0 };
  for (const coleccion of ['proyectos', 'licitaciones'] as const) {
    const snap = await getDocs(query(collection(db, coleccion), where('campusSigla', '==', antigua)));
    // Los lotes de Firestore admiten hasta 500 escrituras.
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach(d => {
        const edificio = d.data().edificioSigla;
        batch.update(d.ref, {
          campusSigla: nueva,
          campusNombre: nombreCampus,
          ...(typeof edificio === 'string' && edificio ? { edificioSigla: renombrarSiglaEdificio(edificio, antigua, nueva) } : {}),
          _updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
    conteo[coleccion] = snap.docs.length;
  }
  registrarCambio({
    accion: 'Modificó', entidad: 'Configuración', entidadId: `campus-${antigua}`, nombre: `Campus ${antigua}`,
    cambios: { campus: { antes: antigua, despues: `${nueva} · ${nombreCampus}` } },
    detalle: `${conteo.proyectos} proyecto(s) y ${conteo.licitaciones} licitación(es) actualizados`,
  });
  return conteo;
}

/** Política de garantías definida en el proyecto de la Cartera (si la licitación está vinculada a uno). */
export async function getPoliticaGarantiasProyecto(proyectoMaestroId?: string): Promise<ProyectoMaestro['politicaGarantias']> {
  if (!proyectoMaestroId) return undefined;
  const snap = await getDoc(doc(db, 'proyectos', proyectoMaestroId));
  return snap.exists() ? (snap.data() as ProyectoMaestro).politicaGarantias : undefined;
}
