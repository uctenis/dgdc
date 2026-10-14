import { collection, doc, getDocs, getDoc, serverTimestamp, query, where, runTransaction, type DocumentReference } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { normalizarNombreProyecto } from '../../utils/spellCorrector';
import { type HistorialObra, type LicitacionProyecto, type Cotizacion } from '../../types';

// ═══════════════════════════════════════════════════════════════════
// ADJUDICACIÓN + HISTORIAL (acción compuesta)
// ═══════════════════════════════════════════════════════════════════

/**
 * Adjudica una licitación y registra el historial en todos los proveedores participantes.
 * - Ganador → resultado: 'Adjudicado'
 * - Resto   → resultado: 'No Adjudicado'
 */
export async function adjudicarLicitacionSinRegistro(params: {
  licitacionId: string;
  proveedorGanadorId: string;
  justificacion: string;
  cotizaciones: Cotizacion[];
  puntajes: Record<string, number>; // proveedorId → puntajeTotalPonderado
  codigoCP: string;
  codigoOP: string;
  nombreProyecto: string;
  codigoProyecto?: string;
  proyectoMaestroId?: string;
}): Promise<void> {
  const { licitacionId, proveedorGanadorId, justificacion, cotizaciones, puntajes, codigoCP, codigoOP, nombreProyecto, codigoProyecto, proyectoMaestroId } = params;
  const fecha = new Date().toISOString().split('T')[0];
  const cotGanadora = cotizaciones.find(c => c.proveedorId === proveedorGanadorId);

  // Resolución (solo lectura) del Proyecto Maestro vinculado, ANTES de la transacción —
  // las transacciones de Firestore no admiten queries con `where`, solo lecturas de
  // documentos puntuales. IMPORTANTE: codigoCP no es único entre proyectos (varios
  // comparten el valor por defecto '409-1722'), por lo que NO se usa como filtro de
  // respaldo — ni siquiera cuando da un único resultado, porque esa coincidencia puede
  // seguir siendo el proyecto equivocado. Solo se sincroniza vía proyectoMaestroId
  // (vínculo exacto) o codigoProyecto (correlativo, único). Si ninguno coincide, se
  // omite la sincronización automática.
  let proyectoRef: DocumentReference | null = null;
  if (proyectoMaestroId) {
    const docProy = await getDoc(doc(db, 'proyectos', proyectoMaestroId));
    if (docProy.exists()) proyectoRef = docProy.ref;
  }
  if (!proyectoRef && codigoProyecto) {
    const snap = await getDocs(query(collection(db, 'proyectos'), where('codigoProyecto', '==', codigoProyecto)));
    if (snap.size === 1) {
      proyectoRef = snap.docs[0].ref;
    } else if (snap.size > 1) {
      console.warn(`adjudicarLicitacion: codigoProyecto "${codigoProyecto}" coincide con ${snap.size} proyectos; se omite la sincronización automática para evitar ambigüedad.`);
    }
  }

  // Toda la escritura (licitación + invitados + historial de cada proveedor + Proyecto
  // Maestro vinculado) ocurre dentro de UNA sola transacción: o se aplica todo, o no se
  // aplica nada. La comprobación de `estado` dentro de la transacción también evita que
  // dos clics/pestañas concurrentes dupliquen el historial o se pisen entre sí — si la
  // licitación ya quedó adjudicada, la transacción falla con un error claro en vez de
  // reprocesar todo silenciosamente.
  await runTransaction(db, async tx => {
    const licRef = doc(db, 'licitaciones', licitacionId);
    const licSnap = await tx.get(licRef);
    if (!licSnap.exists()) throw new Error('La licitación ya no existe.');
    const licData = licSnap.data() as LicitacionProyecto;
    if (licData.estado === 'Adjudicado' || licData.estado === 'Cerrado') {
      throw new Error('PROCESO_CERRADO: Esta licitación ya fue adjudicada previamente.');
    }

    const proyData = proyectoRef ? (await tx.get(proyectoRef)).data() : undefined;

    // 1. Estado de la licitación
    tx.update(licRef, {
      estado: 'Adjudicado',
      proveedorAdjudicadoId: proveedorGanadorId,
      proveedorGanadorId,
      justificacionAdjudicacion: justificacion,
      cotizacionAdjudicadaId: cotGanadora?.id,
      proveedorAdjudicadoNombre: cotGanadora?.proveedorNombre,
      proveedorAdjudicadoRut: cotGanadora?.proveedorRut,
      montoAdjudicadoNeto: cotGanadora?.montoNeto,
      montoAdjudicadoIva: cotGanadora?.montoIva,
      montoAdjudicadoTotal: cotGanadora?.montoTotal,
      plazoAdjudicadoDias: cotGanadora?.plazoDias,
      fechaAdjudicacion: fecha,
      estadoLifecycle: 'Adjudicado',
      nombreProyecto: normalizarNombreProyecto(licData.nombreProyecto),
      _updatedAt: serverTimestamp(),
    });

    // 2. Estado de invitados (todos los que cotizaron quedan "Presentada", ganador o no) +
    //    3. Historial en cada proveedor participante — ID determinístico (licitacionId) para
    //    que un reintento de la transacción no duplique entradas.
    for (const cot of cotizaciones) {
      tx.set(
        doc(db, 'licitaciones', licitacionId, 'invitados', cot.proveedorId),
        { estadoPropuesta: 'Presentada' },
        { merge: true }
      );

      const resultado: HistorialObra['resultado'] = cot.proveedorId === proveedorGanadorId ? 'Adjudicado' : 'No Adjudicado';
      tx.set(doc(db, 'proveedores', cot.proveedorId, 'historialObras', licitacionId), {
        licitacionId,
        codigoCP,
        codigoOP,
        nombreProyecto: normalizarNombreProyecto(nombreProyecto),
        montoTotal: cot.montoTotal,
        plazoDias: cot.plazoDias,
        resultado,
        fecha,
        puntajeObtenido: puntajes[cot.proveedorId],
        _createdAt: serverTimestamp(),
      });
    }

    // 4. Proyecto Maestro vinculado en la Cartera (si se pudo resolver sin ambigüedad)
    if (proyectoRef) {
      tx.update(proyectoRef, {
        estado: 'En Proceso',
        plazoAdjudicadoDias: cotGanadora?.plazoDias || 0,
        fechaInicioObra: fecha,
        montoAdjudicado: cotGanadora?.montoTotal || proyData?.montoAdjudicado || 0,
        _updatedAt: serverTimestamp(),
      });
    }
  });
}
