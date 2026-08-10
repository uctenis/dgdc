import React, { useState } from 'react';
import type { Proveedor } from '../types';
import { Building2, Search, Plus, Leaf, Edit3, Trash2, Phone, Mail, MapPin, Wifi } from 'lucide-react';

interface SupplierManagerProps {
  proveedores: Proveedor[];
  isLoading?: boolean;
  onAddProveedor: (prov: Omit<Proveedor, 'id' | 'fechaRegistro'>) => void;
  onUpdateProveedor: (id: string, prov: Partial<Proveedor>) => void;
  onDeleteProveedor: (id: string) => void;
}

export const SupplierManager: React.FC<SupplierManagerProps> = ({
  proveedores,
  isLoading = false,
  onAddProveedor,
  onUpdateProveedor,
  onDeleteProveedor,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('Todos');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [rut, setRut] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [nombreContacto, setNombreContacto] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rubro, setRubro] = useState('Obras Menores y Remodelaciones');
  const [cuentaSustentabilidad, setCuentaSustentabilidad] = useState(true);
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('Temuco');

  const rubrosDisponibles = [
    'Obras Menores y Remodelaciones',
    'Climatización y Electricidad',
    'Obras Civiles y Tabiquería',
    'Pintura e Iluminación',
    'Carpintería y Estructuras',
    'Sanitario y Plomería',
  ];

  const handleOpenAddModal = () => {
    setEditingId(null);
    setRut('');
    setRazonSocial('');
    setNombreContacto('');
    setEmail('');
    setTelefono('');
    setRubro('Obras Menores y Remodelaciones');
    setCuentaSustentabilidad(true);
    setDireccion('');
    setCiudad('Temuco');
    setShowModal(true);
  };

  const handleOpenEditModal = (prov: Proveedor) => {
    setEditingId(prov.id);
    setRut(prov.rut);
    setRazonSocial(prov.razonSocial);
    setNombreContacto(prov.nombreContacto);
    setEmail(prov.email);
    setTelefono(prov.telefono);
    setRubro(prov.rubro);
    setCuentaSustentabilidad(prov.cuentaSustentabilidad);
    setDireccion(prov.direccion || '');
    setCiudad(prov.ciudad || 'Temuco');
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rut || !razonSocial) return;

    if (editingId) {
      onUpdateProveedor(editingId, {
        rut,
        razonSocial,
        nombreContacto,
        email,
        telefono,
        rubro,
        cuentaSustentabilidad,
        direccion,
        ciudad,
      });
    } else {
      onAddProveedor({
        rut,
        razonSocial,
        nombreContacto,
        email,
        telefono,
        rubro,
        cuentaSustentabilidad,
        direccion,
        ciudad,
        estado: 'Activo',
      });
    }
    setShowModal(false);
  };

  const filteredProveedores = proveedores.filter(p => {
    const matchesSearch =
      p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.rut.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.nombreContacto.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRubro = filtroRubro === 'Todos' || p.rubro === filtroRubro;
    return matchesSearch && matchesRubro;
  });

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-sky-600" />
            <span>Base de Datos de Proveedores Institucional</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Registro centralizado de contratistas, empresas de obras y prestadores de servicios de la Subdirección de Infraestructura.
          </p>
          {/* Firebase sync indicator */}
          <div className="flex items-center gap-1.5 mt-2">
            <Wifi className={`w-3.5 h-3.5 ${isLoading ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`} />
            <span className={`text-[10px] font-semibold ${isLoading ? 'text-amber-600' : 'text-emerald-600'}`}>
              {isLoading ? 'Conectando con Firebase...' : `Firebase Firestore · ${proveedores.length} proveedores sincronizados`}
            </span>
          </div>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm transition text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Nuevo Proveedor</span>
        </button>
      </div>

      {/* Filters & Search bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Buscar por RUT, Razón Social o Contacto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
          />
        </div>

        <div>
          <select
            value={filtroRubro}
            onChange={e => setFiltroRubro(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
          >
            <option value="Todos">Todos los Rubros</option>
            {rubrosDisponibles.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Supplier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProveedores.map(prov => (
          <div
            key={prov.id}
            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-extrabold uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded tracking-wide border border-slate-200">
                    RUT: {prov.rut}
                  </span>
                  <h3 className="text-sm font-bold text-slate-800 mt-2 line-clamp-2">{prov.razonSocial}</h3>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditModal(prov)}
                    className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-slate-50 rounded-lg transition"
                    title="Editar datos"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteProveedor(prov.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded-lg transition"
                    title="Eliminar proveedor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Rubro tag */}
              <div className="mt-3">
                <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-1 rounded-md font-medium inline-block">
                  {prov.rubro}
                </span>
              </div>

              {/* Contact info list */}
              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Contacto:</span> {prov.nombreContacto}
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{prov.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{prov.telefono}</span>
                </div>
                {prov.direccion && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {prov.direccion}, {prov.ciudad}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom status bar */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                {prov.cuentaSustentabilidad ? (
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sustentabilidad Acreditada</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    <span>Requiere Carta Compromiso</span>
                  </span>
                )}
              </div>

              <span
                onClick={() =>
                  onUpdateProveedor(prov.id, {
                    estado: prov.estado === 'Activo' ? 'Inactivo' : 'Activo',
                  })
                }
                className={`cursor-pointer px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  prov.estado === 'Activo'
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {prov.estado}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Add / Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-3">
              {editingId ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RUT Empresa *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 76.123.456-7"
                    value={rut}
                    onChange={e => setRut(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rubro Principal *</label>
                  <select
                    value={rubro}
                    onChange={e => setRubro(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  >
                    {rubrosDisponibles.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Razón Social / Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  placeholder="Nombre oficial de la empresa"
                  value={razonSocial}
                  onChange={e => setRazonSocial(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre Contacto</label>
                  <input
                    type="text"
                    placeholder="Persona responsable"
                    value={nombreContacto}
                    onChange={e => setNombreContacto(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="correo@empresa.cl"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="+56 9 ..."
                    value={telefono}
                    onChange={e => setTelefono(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dirección</label>
                  <input
                    type="text"
                    placeholder="Calle y número"
                    value={direccion}
                    onChange={e => setDireccion(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ciudad</label>
                  <input
                    type="text"
                    placeholder="Temuco"
                    value={ciudad}
                    onChange={e => setCiudad(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-emerald-900 block">Política o Certificación Sustentable</span>
                  <span className="text-[11px] text-emerald-700">
                    Marca si el proveedor ya cuenta con política de sustentabilidad o certificación de reciclaje.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={cuentaSustentabilidad}
                  onChange={e => setCuentaSustentabilidad(e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  {editingId ? 'Guardar Cambios' : 'Registrar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
