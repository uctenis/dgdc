import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { supabase, SUPABASE_CONFIGURADO } from '../lib/supabase';
import { SYSTEM_ADMIN_EMAIL } from '../lib/adminSistema';

const CLAVE_MIGRACION_STORAGE = 'dgdc:migracion_firestore_supabase_v1';

export interface ResumenMigracionSupabase {
  configuracion: number;
  proveedores: number;
  proyectos: number;
  licitaciones: number;
  cotizaciones: number;
  subcolecciones: number;
  inscripciones: number;
  fecha: string;
}

/**
 * Sincroniza automáticamente en segundo plano las colecciones de Firestore hacia las tablas
 * relacionales de Supabase (`0011_unificacion_supabase.sql`) cuando ingresa el administrador.
 * Es idempotente (`upsert`): se puede ejecutar múltiples veces sin duplicar registros.
 */
export async function sincronizarFirestoreASupabase(forzar = false): Promise<ResumenMigracionSupabase | null> {
  if (!SUPABASE_CONFIGURADO) return null;
  const email = (auth.currentUser?.email || '').toLowerCase();
  if (email !== SYSTEM_ADMIN_EMAIL) return null;

  if (!forzar) {
    try {
      const previo = localStorage.getItem(CLAVE_MIGRACION_STORAGE);
      if (previo) {
        const datos = JSON.parse(previo) as { fecha?: string };
        // Si ya sincronizó en la última hora, no repetir en cada recarga
        if (datos.fecha && Date.now() - new Date(datos.fecha).getTime() < 3600_000) {
          return null;
        }
      }
    } catch { /* continuar */ }
  }

  // Verificar primero si la tabla `public.configuracion` de la migración 0011 ya está creada en Supabase
  const { error: probeError } = await supabase.from('configuracion').select('id').limit(1);
  if (probeError) {
    // La migración 0011 aún no se ha aplicado en el servidor Supabase
    return null;
  }

  const resumen: ResumenMigracionSupabase = {
    configuracion: 0,
    proveedores: 0,
    proyectos: 0,
    licitaciones: 0,
    cotizaciones: 0,
    subcolecciones: 0,
    inscripciones: 0,
    fecha: new Date().toISOString(),
  };

  try {
    // 1. Configuración compartida
    const configSnap = await getDocs(collection(db, 'configuracion'));
    if (!configSnap.empty) {
      const filas = configSnap.docs.map(d => ({
        id: d.id,
        valor: String(d.data().valor ?? ''),
        actualizado_por: (d.data().actualizadoPor as string) || email,
        fecha_actualizacion: new Date().toISOString(),
      }));
      const { error } = await supabase.from('configuracion').upsert(filas, { onConflict: 'id' });
      if (!error) resumen.configuracion = filas.length;
    }

    // 2. Proveedores + evaluaciones de desempeño + historial de obras
    const provSnap = await getDocs(collection(db, 'proveedores'));
    if (!provSnap.empty) {
      const filasProv = provSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          rut: String(data.rut || ''),
          razon_social: String(data.razonSocial || ''),
          email: data.email ? String(data.email) : null,
          estado: String(data.estado || 'Activo'),
          fecha_registro: data.fechaRegistro ? new Date(String(data.fechaRegistro)).toISOString() : new Date().toISOString(),
          datos: data,
          actualizado_en: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from('proveedores').upsert(filasProv, { onConflict: 'id' });
      if (!error) resumen.proveedores = filasProv.length;

      for (const pDoc of provSnap.docs) {
        const [evalSnap, histSnap] = await Promise.all([
          getDocs(collection(db, 'proveedores', pDoc.id, 'evaluacionesDesempeno')).catch(() => null),
          getDocs(collection(db, 'proveedores', pDoc.id, 'historialObras')).catch(() => null),
        ]);
        if (evalSnap && !evalSnap.empty) {
          const evals = evalSnap.docs.map(e => ({
            id: e.id,
            proveedor_id: pDoc.id,
            licitacion_id: (e.data().licitacionId as string) || null,
            fecha: String(e.data().fecha || ''),
            puntaje_final: Number(e.data().puntajeFinal || 0),
            datos: e.data(),
          }));
          await supabase.from('evaluaciones_desempeno').upsert(evals, { onConflict: 'id' });
        }
        if (histSnap && !histSnap.empty) {
          const hists = histSnap.docs.map(h => ({
            id: h.id,
            proveedor_id: pDoc.id,
            licitacion_id: String(h.data().licitacionId || h.id),
            fecha: (h.data().fecha as string) || null,
            datos: h.data(),
          }));
          await supabase.from('historial_obras_proveedor').upsert(hists, { onConflict: 'proveedor_id,id' });
        }
      }
    }

    // 3. Proyectos de la Cartera
    const proySnap = await getDocs(collection(db, 'proyectos'));
    if (!proySnap.empty) {
      const filasProy = proySnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          correlativo: Number(data.correlativo || 1),
          codigo_proyecto: String(data.codigoProyecto || d.id),
          nombre: String(data.nombre || ''),
          anio_presupuesto: data.anioPresupuesto ? Number(data.anioPresupuesto) : null,
          campus_sigla: (data.campusSigla as string) || null,
          edificio_sigla: (data.edificioSigla as string) || null,
          estado: (data.estado as string) || null,
          gasto_efectivo: Number(data.gastoEfectivo || 0),
          datos: data,
          actualizado_en: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from('proyectos').upsert(filasProy, { onConflict: 'id' });
      if (!error) resumen.proyectos = filasProy.length;
    }

    // 4. Licitaciones y sus subcolecciones
    const licSnap = await getDocs(collection(db, 'licitaciones'));
    if (!licSnap.empty) {
      const filasLic = licSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          proyecto_maestro_id: (data.proyectoMaestroId as string) || null,
          codigo_proyecto: (data.codigoProyecto as string) || null,
          nombre_proyecto: String(data.nombreProyecto || ''),
          estado: String(data.estado || 'Borrador'),
          proveedor_ganador_id: (data.proveedorAdjudicadoId as string) || (data.proveedorGanadorId as string) || null,
          limite_ofertas_ms: data.limiteOfertasMs ? Number(data.limiteOfertasMs) : null,
          datos: data,
          actualizado_en: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from('licitaciones').upsert(filasLic, { onConflict: 'id' });
      if (!error) resumen.licitaciones = filasLic.length;

      const tiposSub = [
        'estadosPago', 'aumentosObra', 'garantias', 'multas',
        'aclaraciones', 'consultas', 'consultasPublicadas', 'envios',
        'libroObra', 'bitacoraDesarrollo',
      ] as const;

      for (const lDoc of licSnap.docs) {
        // Invitados
        const invSnap = await getDocs(collection(db, 'licitaciones', lDoc.id, 'invitados')).catch(() => null);
        if (invSnap && !invSnap.empty) {
          const filasInv = invSnap.docs.map(i => ({
            licitacion_id: lDoc.id,
            proveedor_id: i.id,
            proveedor_email: (i.data().proveedorEmail as string) || null,
            proveedor_nombre: (i.data().proveedorNombre as string) || null,
            token_acceso: (i.data().tokenAcceso as string) || null,
            estado_propuesta: (i.data().estadoPropuesta as string) || null,
            datos: i.data(),
            actualizado_en: new Date().toISOString(),
          }));
          await supabase.from('licitacion_invitados').upsert(filasInv, { onConflict: 'licitacion_id,proveedor_id' });
        }

        // Propuestas
        const propSnap = await getDocs(collection(db, 'licitaciones', lDoc.id, 'propuestas')).catch(() => null);
        if (propSnap && !propSnap.empty) {
          const filasProp = propSnap.docs.map(p => ({
            licitacion_id: lDoc.id,
            proveedor_id: p.id,
            estado: (p.data().estado as string) || null,
            datos: p.data(),
            actualizado_en: new Date().toISOString(),
          }));
          await supabase.from('licitacion_propuestas').upsert(filasProp, { onConflict: 'licitacion_id,proveedor_id' });
        }

        // Resto de subcolecciones de licitación
        for (const tipo of tiposSub) {
          const subSnap = await getDocs(collection(db, 'licitaciones', lDoc.id, tipo)).catch(() => null);
          if (subSnap && !subSnap.empty) {
            const filasSub = subSnap.docs.map(s => ({
              id: s.id,
              licitacion_id: lDoc.id,
              tipo,
              proveedor_id: (s.data().proveedorId as string) || null,
              numero: s.data().numero !== undefined ? Number(s.data().numero) : null,
              fecha: (s.data().fecha as string) || (s.data().fechaPregunta as string) || null,
              estado: (s.data().estado as string) || null,
              datos: s.data(),
              actualizado_en: new Date().toISOString(),
            }));
            const { error: subErr } = await supabase.from('licitacion_subcolecciones').upsert(filasSub, { onConflict: 'licitacion_id,tipo,id' });
            if (!subErr) resumen.subcolecciones += filasSub.length;
          }
        }
      }
    }

    // 5. Cotizaciones
    const cotSnap = await getDocs(collection(db, 'cotizaciones'));
    if (!cotSnap.empty) {
      const filasCot = cotSnap.docs.map(d => ({
        id: d.id,
        licitacion_id: String(d.data().licitacionId || ''),
        proveedor_id: String(d.data().proveedorId || ''),
        monto_total: Number(d.data().montoTotal || 0),
        fecha_carga: (d.data().fechaCarga as string) || null,
        datos: d.data(),
        actualizado_en: new Date().toISOString(),
      }));
      const { error } = await supabase.from('cotizaciones').upsert(filasCot, { onConflict: 'id' });
      if (!error) resumen.cotizaciones = filasCot.length;
    }

    // 6. Inscripciones de proveedores
    const inscSnap = await getDocs(collection(db, 'inscripcionesProveedores'));
    if (!inscSnap.empty) {
      const filasInsc = inscSnap.docs.map(d => ({
        codigo: d.id,
        estado: String(d.data().estado || 'Invitada'),
        datos: d.data(),
        actualizado_en: new Date().toISOString(),
      }));
      const { error } = await supabase.from('inscripciones_proveedores').upsert(filasInsc, { onConflict: 'codigo' });
      if (!error) resumen.inscripciones = filasInsc.length;
    }

    localStorage.setItem(CLAVE_MIGRACION_STORAGE, JSON.stringify(resumen));
    return resumen;
  } catch (err) {
    console.warn('Error parcial sincronizando Firestore hacia Supabase:', err);
    return null;
  }
}

