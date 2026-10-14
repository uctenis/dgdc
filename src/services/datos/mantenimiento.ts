import { collection, getDocs, writeBatch, type DocumentReference } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type ProyectoMaestro } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// RESET DE CARTERA Y LICITACIONES (herramienta administrativa)
// Borra proyectos, licitaciones y sus subcolecciones (estados de pago,
// aumentos de obra, invitados, propuestas, contadores) y las cotizaciones
// asociadas. NO toca proveedores, configuración de firmas, responsables
// ni usuarios — para eso existe storageService.resetAllData().
// ═══════════════════════════════════════════════════════════════════

const SUBCOLECCIONES_LICITACION = ['estadosPago', 'aumentosObra', 'invitados', 'propuestas', 'control'];

export interface ProyectoConGastoEfectivo {
  id: string;
  nombre: string;
  codigoProyecto: string;
  gastoEfectivo: number;
}

export async function contarCarteraYLicitaciones(): Promise<{
  proyectos: number;
  licitaciones: number;
  cotizaciones: number;
  proyectosConGastoEfectivo: ProyectoConGastoEfectivo[];
}> {
  const [proyectosSnap, licitacionesSnap, cotizacionesSnap] = await Promise.all([
    getDocs(collection(db, 'proyectos')),
    getDocs(collection(db, 'licitaciones')),
    getDocs(collection(db, 'cotizaciones')),
  ]);
  const proyectosConGastoEfectivo = proyectosSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as Omit<ProyectoMaestro, 'id'>) }))
    .filter(p => (p.gastoEfectivo || 0) > 0)
    .map(p => ({ id: p.id, nombre: p.nombre, codigoProyecto: p.codigoProyecto, gastoEfectivo: p.gastoEfectivo || 0 }));
  return {
    proyectos: proyectosSnap.size,
    licitaciones: licitacionesSnap.size,
    cotizaciones: cotizacionesSnap.size,
    proyectosConGastoEfectivo,
  };
}

async function borrarRefsEnLotes(refs: DocumentReference[]): Promise<void> {
  const TAMANO_LOTE = 450; // margen bajo el límite de 500 operaciones por batch de Firestore
  for (let i = 0; i < refs.length; i += TAMANO_LOTE) {
    const batch = writeBatch(db);
    refs.slice(i, i + TAMANO_LOTE).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

export async function resetCarteraYLicitaciones(): Promise<{
  proyectos: number;
  licitaciones: number;
  cotizaciones: number;
}> {
  // Resguardo: nunca borrar proyectos con gasto efectivo (pagos reales ya cursados),
  // aunque quien llame a esta función se salte el modal de confirmación.
  const { proyectosConGastoEfectivo } = await contarCarteraYLicitaciones();
  if (proyectosConGastoEfectivo.length > 0) {
    const detalle = proyectosConGastoEfectivo.map(p => `${p.codigoProyecto} — ${p.nombre}`).join(', ');
    throw new Error(`No se puede borrar: ${proyectosConGastoEfectivo.length} proyecto(s) ya registran Gasto Efectivo (pagos cursados): ${detalle}. Contacte al administrador si de todas formas necesita anularlos.`);
  }

  const licitacionesSnap = await getDocs(collection(db, 'licitaciones'));

  for (const licDoc of licitacionesSnap.docs) {
    for (const sub of SUBCOLECCIONES_LICITACION) {
      const subSnap = await getDocs(collection(db, 'licitaciones', licDoc.id, sub));
      await borrarRefsEnLotes(subSnap.docs.map(d => d.ref));
    }
  }
  await borrarRefsEnLotes(licitacionesSnap.docs.map(d => d.ref));

  const proyectosSnap = await getDocs(collection(db, 'proyectos'));
  await borrarRefsEnLotes(proyectosSnap.docs.map(d => d.ref));

  const cotizacionesSnap = await getDocs(collection(db, 'cotizaciones'));
  await borrarRefsEnLotes(cotizacionesSnap.docs.map(d => d.ref));

  return {
    proyectos: proyectosSnap.size,
    licitaciones: licitacionesSnap.size,
    cotizaciones: cotizacionesSnap.size,
  };
}
