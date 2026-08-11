const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, writeBatch, collection } = require('firebase/firestore');
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

const suppliers = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/userSuppliers.json'), 'utf8'));

async function seedFirestore() {
  console.log(`Uploading ${suppliers.length} suppliers to Firestore collection 'proveedores'...`);
  
  // Batch writes (max 500 operations per batch)
  let batch = writeBatch(db);
  let count = 0;

  for (const s of suppliers) {
    const docRef = doc(db, 'proveedores', s.id);
    batch.set(docRef, {
      rut: s.rut,
      razonSocial: s.razonSocial,
      nombreContacto: s.nombreContacto,
      email: s.email,
      telefono: s.telefono,
      rubro: s.rubro,
      cuentaSustentabilidad: s.cuentaSustentabilidad,
      direccion: s.direccion,
      ciudad: s.ciudad,
      estado: s.estado,
      fechaRegistro: s.fechaRegistro,
    });
    count++;

    if (count % 400 === 0) {
      await batch.commit();
      console.log(`Committed batch of ${count} suppliers...`);
      batch = writeBatch(db);
    }
  }

  await batch.commit();
  console.log(`Successfully uploaded all ${suppliers.length} suppliers to Firestore!`);
  process.exit(0);
}

seedFirestore().catch(err => {
  console.error('Error uploading suppliers to Firestore:', err);
  process.exit(1);
});
