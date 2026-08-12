const admin = require('firebase-admin');

// Inicializar la aplicación con las credenciales por defecto (asegúrate de tener GOOGLE_APPLICATION_CREDENTIALS configurado)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function syncProyectos() {
  console.log('Iniciando sincronización de proyectos...');

  try {
    // 1. Obtener todas las licitaciones adjudicadas
    const licitacionesSnap = await db.collection('licitaciones').get();
    const adjudicadas = licitacionesSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(l => l.estado === 'Adjudicado' || l.estadoLifecycle === 'Adjudicado' || l.montoAdjudicadoTotal > 0);
    
    console.log(`Se encontraron ${adjudicadas.length} licitaciones adjudicadas.`);

    // 2. Obtener todos los proyectos
    const proyectosSnap = await db.collection('proyectos').get();
    let proyectos = proyectosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`Se encontraron ${proyectos.length} proyectos en la cartera.`);

    // Ordenar los proyectos por fecha de creación (si existe) o por ID para darles un correlativo consistente
    proyectos.sort((a, b) => {
      const dateA = a.fechaCreacion || '';
      const dateB = b.fechaCreacion || '';
      return dateA.localeCompare(dateB) || a.id.localeCompare(b.id);
    });

    // 3. Actualizar cada proyecto
    const batch = db.batch();
    let updates = 0;

    for (let i = 0; i < proyectos.length; i++) {
      const p = proyectos[i];
      const correlativoNuevo = i + 1;
      
      const updateData = {
        correlativo: correlativoNuevo
      };

      // Buscar si este proyecto tiene una licitación adjudicada asociada
      const lic = adjudicadas.find(l => l.codigoCP === p.codigoCP);
      if (lic) {
        updateData.estado = 'En Proceso';
        updateData.montoAdjudicado = lic.montoAdjudicadoTotal || lic.montoAdjudicadoNeto || 0;
        updateData.plazoAdjudicadoDias = lic.plazoAdjudicadoDias || 0;
        updateData.fechaInicioObra = lic.fechaInicioObra || new Date().toISOString().split('T')[0];
        console.log(`Proyecto ${p.codigoCP} sincronizado con licitación adjudicada (Monto: ${updateData.montoAdjudicado})`);
      }

      const docRef = db.collection('proyectos').doc(p.id);
      batch.update(docRef, updateData);
      updates++;

      // Firebase permite máximo 500 operaciones por batch, pero como tenemos pocos proyectos podemos hacerlo de una vez o dividir
      if (updates >= 400) {
        await batch.commit();
        console.log('Batch intermedio guardado...');
        updates = 0;
      }
    }

    if (updates > 0) {
      await batch.commit();
    }

    console.log('Sincronización completada exitosamente.');
  } catch (error) {
    console.error('Error durante la sincronización:', error);
  }
}

syncProyectos();
