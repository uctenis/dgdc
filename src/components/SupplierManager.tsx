import React, { useState } from 'react';
import type { Proveedor } from '../types';
import { Building2, Search, Plus, Leaf, Edit3, Trash2, Phone, Mail, MapPin, Wifi, History, CheckCircle2, AlertCircle, Upload, Loader2, FileText } from 'lucide-react';
import { HistorialObrasModal } from './HistorialObrasModal';
import { formatearRUT, validarRUT } from '../utils/rutUtils';
import { parseProveedorDesdeCotizacion } from '../utils/providerDocumentParser';

import { getRubrosList } from '../data/rubrosData';

interface SupplierManagerProps {
  proveedores: Proveedor[];
  isLoading?: boolean;
  onAddProveedor: (prov: Omit<Proveedor, 'id' | 'fechaRegistro'>) => void | Promise<void>;
  onUpdateProveedor: (id: string, prov: Partial<Proveedor>) => void | Promise<void>;
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
  const [selectedHistorialProv, setSelectedHistorialProv] = useState<Proveedor | null>(null);

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
  const [leyendoCotizacion, setLeyendoCotizacion] = useState(false);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [lecturaFeedback, setLecturaFeedback] = useState<string[]>([]);
  const [lecturaError, setLecturaError] = useState('');

  const rubrosLista = getRubrosList();
  const rubrosDisponibles = rubrosLista.filter(r => r.estado === 'Activo').map(r => r.nombre);
  if (rubrosDisponibles.length === 0) {
    rubrosDisponibles.push('Obras Menores y Remodelaciones');
  }

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
    setLecturaFeedback([]);
    setLecturaError('');
    setLeyendoCotizacion(false);
    setGuardandoProveedor(false);
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
    setLecturaFeedback([]);
    setLecturaError('');
    setLeyendoCotizacion(false);
    setGuardandoProveedor(false);
    setShowModal(true);
  };

  const handleLeerCotizacion = async (file?: File) => {
    if (!file) return;

    setLeyendoCotizacion(true);
    setLecturaFeedback([]);
    setLecturaError('');

    try {
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('La lectura tardó demasiado. Intenta nuevamente o completa los datos manualmente.')), 20000);
      });
      const datos = await Promise.race([parseProveedorDesdeCotizacion(file), timeout]);

      if (datos.rut) setRut(formatearRUT(datos.rut));
      if (datos.razonSocial) setRazonSocial(datos.razonSocial);
      if (datos.nombreContacto) setNombreContacto(datos.nombreContacto);
      if (datos.email) setEmail(datos.email);
      if (datos.telefono) setTelefono(datos.telefono);
      if (datos.direccion) setDireccion(datos.direccion);
      if (datos.ciudad) setCiudad(datos.ciudad);

      setLecturaFeedback(
        datos.detalles.length > 0
          ? datos.detalles
          : ['El documento fue leído, pero no se reconocieron datos del proveedor. Puedes completar los campos manualmente.'],
      );
    } catch (error) {
      setLecturaError(error instanceof Error ? error.message : 'No fue posible leer la cotización.');
    } finally {
      setLeyendoCotizacion(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rut || !razonSocial || guardandoProveedor) return;

    const rutNormalizado = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    const proveedorDuplicado = proveedores.some(
      proveedor => proveedor.id !== editingId && proveedor.rut.replace(/[^0-9kK]/g, '').toUpperCase() === rutNormalizado,
    );
    if (proveedorDuplicado) {
      setLecturaError('Ya existe un proveedor registrado con este RUT.');
      return;
    }

    setGuardandoProveedor(true);
    setLecturaError('');
    try {
      if (editingId) {
        await onUpdateProveedor(editingId, {
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
        await onAddProveedor({
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
    } catch (error) {
      setLecturaError(error instanceof Error ? error.message : 'No fue posible guardar el proveedor. Intenta nuevamente.');
    } finally {
      setGuardandoProveedor(false);
    }
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedHistorialProv(prov)}
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-semibold bg-sky-50 px-2 py-1 rounded-md border border-sky-200 transition"
                  title="Ver historial de licitaciones y obras"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Historial</span>
                </button>

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
          </div>
        ))}
      </div>

      {selectedHistorialProv && (
        <HistorialObrasModal
          proveedor={selectedHistorialProv}
          onClose={() => setSelectedHistorialProv(null)}
        />
      )}

      {/* Modal Add / Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl max-h-[92vh] overflow-y-auto w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-3">
              {editingId ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {!editingId && (
                <div className="rounded-xl border border-dashed border-sky-300 bg-sky-50/70 p-4">
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg transition ${leyendoCotizacion ? 'pointer-events-none opacity-70' : 'hover:bg-sky-100/70'}`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sky-600 shadow-sm">
                      {leyendoCotizacion ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                    </span>
                    <span>
                      <span className="block font-bold text-sky-900">
                        {leyendoCotizacion ? 'Leyendo datos de la cotización…' : 'Adjuntar cotización para completar los datos'}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-sky-700">
                        PDF, Excel o CSV. Los campos detectados quedarán editables antes de registrar.
                      </span>
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                      className="hidden"
                      disabled={leyendoCotizacion}
                      onChange={event => {
                        void handleLeerCotizacion(event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>

                  {lecturaFeedback.length > 0 && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-emerald-800">
                      <div className="mb-1.5 flex items-center gap-1.5 font-bold">
                        <FileText className="h-4 w-4" />
                        Datos encontrados y completados
                      </div>
                      <ul className="space-y-0.5 text-[11px]">
                        {lecturaFeedback.map((detalle, index) => <li key={`${detalle}-${index}`}>• {detalle}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {lecturaError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 font-medium text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{lecturaError}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RUT Empresa *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 76.123.456-7"
                    value={rut}
                    onChange={e => setRut(formatearRUT(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none font-medium ${
                      rut
                        ? validarRUT(rut).esValido
                          ? 'border-emerald-500 focus:ring-emerald-500 bg-emerald-50/20'
                          : 'border-amber-400 focus:ring-amber-500 bg-amber-50/20'
                        : 'border-slate-300 focus:ring-sky-500'
                    }`}
                  />
                  {rut ? (
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold">
                      {validarRUT(rut).esValido ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          RUT Válido (Módulo 11 OK)
                        </span>
                      ) : (
                        <span className="text-amber-700 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          {validarRUT(rut).mensaje}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Puntos de miles automáticos. Ingrese el DV manualmente.
                    </span>
                  )}
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
                  disabled={guardandoProveedor}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={leyendoCotizacion || guardandoProveedor}
                  className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 text-white rounded-lg font-semibold shadow-sm"
                >
                  {guardandoProveedor && <Loader2 className="h-4 w-4 animate-spin" />}
                  {guardandoProveedor ? 'Guardando…' : editingId ? 'Guardar Cambios' : 'Registrar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
