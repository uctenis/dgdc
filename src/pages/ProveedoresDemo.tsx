import type { Proveedor } from '../types';
import { SupplierManager } from '../components/SupplierManager';

// SOLO servidor local (ruta /demo/proveedores): proveedores de ejemplo para revisar la ficha y la
// ventana de edición sin sesión de Firebase. Guardar no persiste nada.

const PROVEEDORES = [
  { id: 'a', rut: '76.123.456-7', razonSocial: 'Constructora Araucanía SpA', nombreContacto: 'Pedro Soto', email: 'contacto@araucania.cl', telefono: '+56 9 1234 5678', rubro: 'Obras Civiles y Estructuras', cuentaSustentabilidad: true, estado: 'Activo', fechaRegistro: '',
    datosContrato: { representantes: [], domicilioLegal: '', personeria: '', datosBancarios: { banco: 'BancoEstado', tipoCuenta: 'Cuenta Corriente', numeroCuenta: '123456', titular: 'Constructora Araucanía SpA', rutTitular: '76.123.456-7' } } },
  { id: 'b', rut: '77.555.444-3', razonSocial: '', nombreContacto: 'María Pérez', email: '', telefono: '', rubro: 'Instalaciones Eléctricas', cuentaSustentabilidad: false, estado: 'Activo', fechaRegistro: '' },
] as unknown as Proveedor[];

export function ProveedoresDemo() {
  return (
    <main className="p-8 max-w-7xl mx-auto">
      <SupplierManager proveedores={PROVEEDORES} onAddProveedor={() => {}} onUpdateProveedor={() => {}} onDeleteProveedor={() => {}} />
    </main>
  );
}
