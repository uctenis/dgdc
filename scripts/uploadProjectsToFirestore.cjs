const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, writeBatch } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

const firebaseConfig = {
  apiKey: "AIzaSyBRcvt7iWJIUiNNVE87ZA_3MhdATJbicFc",
  authDomain: "dgdc-c848d.firebaseapp.com",
  projectId: "dgdc-c848d",
  storageBucket: "dgdc-c848d.firebasestorage.app",
  messagingSenderId: "614609890960",
  appId: "1:614609890960:web:4359cfc6beb11fdf13b215",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const budgetData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/presupuesto2026Data.json'), 'utf8'));
const projects = budgetData.projects;

async function seedProjects() {
  console.log(`Uploading ${projects.length} projects to Firestore collection 'proyectos'...`);
  
  let batch = writeBatch(db);
  let count = 0;

  for (const p of projects) {
    const docRef = doc(db, 'proyectos', p.id);
    batch.set(docRef, {
      correlativo: p.correlativo,
      codigoCP: p.codigoCP,
      codigoOP: p.codigoOP,
      codigoOT: p.codigoOT,
      codigoProyecto: p.codigoProyecto,
      nombre: p.nombre,
      descripcion: p.descripcion,
      valorAprox: p.valorAprox,
      estado: p.estado,
      fechaCreacion: p.fechaCreacion,
      campusSigla: p.campusSigla || '',
      campusNombre: p.campusNombre || '',
      edificioSigla: p.edificioSigla || '',
      uso: p.uso || '',
      tipoObra: p.tipoObra || '',
      responsableNombre: p.responsableNombre || '',
      responsableEmail: p.responsableEmail || '',
    });
    count++;

    if (count % 400 === 0) {
      await batch.commit();
      console.log(`Committed batch of ${count} projects...`);
      batch = writeBatch(db);
    }
  }

  // Set correlativo counter in _counters/proyectos
  const counterRef = doc(db, '_counters', 'proyectos');
  batch.set(counterRef, { current: projects.length });

  await batch.commit();
  console.log(`Successfully uploaded all ${projects.length} projects to Firestore!`);
  process.exit(0);
}

seedProjects().catch(err => {
  console.error('Error uploading projects to Firestore:', err);
  process.exit(1);
});
