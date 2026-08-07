import React, { useState } from 'react';
import type { Cotizacion, Proveedor, LicitacionProyecto } from '../types';
import { FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Plus, Trash2, ShieldCheck, Leaf, Clock, FileText } from 'lucide-react';
import { parsearCotizacionExcel } from '../services/excelParser';
import { formatoMonedaCLP } from '../services/evaluationEngine';

interface QuotationIngestionProps {
  licitacion: LicitacionProyecto | null;
  proveedores: Proveedor[];
  cotizaciones: Cotizacion[];
  onAddCotizacion: (cot: Omit<Cotizacion, 'id' | 'fechaCarga'>) => void;
  onDeleteCotizacion: (id: string) => void;
}

export const QuotationIngestion: React.FC<QuotationIngestionProps> = ({
  licitacion,
  proveedores,
  cotizaciones,
  onAddCotizacion,
  onDeleteCotizacion,
}) => {
  const [mensajeNotificacion, setMensajeNotificacion] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  // Form state for quotation
  const [selectedProveedorId, setSelectedProveedorId] = useState<string>('');
  const [montoNeto, setMontoNeto] = useState<number>(0);
  const [montoIva, setMontoIva] = useState<number>(0);
  const [montoTotal, setMontoTotal] = useState<number>(0);
  const [plazoDias, setPlazoDias] = useState<number>(15);

  // Technical & Sustainability criteria
  const [ajustaRequerimientos, setAjustaRequerimientos] = useState<boolean>(true);
  const [cuentaExperiencia, setCuentaExperiencia] = useState<boolean>(true);
  const [cumplePlazoRequerido, setCumplePlazoRequerido] = useState<boolean>(true);
  const [declaraSustentabilidad, setDeclaraSustentabilidad] = useState<boolean>(true);
  const [tipoEvidenciaSustentable, setTipoEvidenciaSustentable] = useState<string>('Carta Compromiso Sustentable');
  const [documentoCotizacionNombre, setDocumentoCotizacionNombre] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  if (!licitacion) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No hay ninguna Licitación o Proyecto Seleccionado</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Por favor diríjase a la pestaña "Proyectos & Licitaciones" y seleccione el proyecto en el cual desea ingresar cotizaciones.
        </p>
      </div>
    );
  }

  // Handle Net Amount changes and auto-calculate IVA and Total
  const handleMontoNetoChange = (val: number) => {
    setMontoNeto(val);
    const iva = Math.round(val * 0.19);
    setMontoIva(iva);
    setMontoTotal(val + iva);
  };

  // Handle file drop / file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMensajeNotificacion(null);

    try {
      const resultado = await parsearCotizacionExcel(file, licitacion.id);

      if (resultado.exito && resultado.cotizacionParcial) {
        const c = resultado.cotizacionParcial;
        
        // Tratar de hacer match con el proveedor por RUT o Razón Social
        const matchProv = proveedores.find(
          p =>
            (c.proveedorRut && p.rut.toLowerCase().replace(/[^0-9k]/gi, '') === c.proveedorRut.toLowerCase().replace(/[^0-9k]/gi, '')) ||
            (c.proveedorNombre && p.razonSocial.toLowerCase().includes(c.proveedorNombre.toLowerCase()))
        );

        if (matchProv) {
          setSelectedProveedorId(matchProv.id);
        } else if (proveedores.length > 0) {
          setSelectedProveedorId(proveedores[0].id);
        }

        if (c.montoNeto) handleMontoNetoChange(c.montoNeto);
        else if (c.montoTotal) {
          setMontoTotal(c.montoTotal);
          const neto = Math.round(c.montoTotal / 1.19);
          setMontoNeto(neto);
          setMontoIva(c.montoTotal - neto);
        }

        if (c.plazoDias) setPlazoDias(c.plazoDias);
        if (c.ajustaRequerimientos !== undefined) setAjustaRequerimientos(c.ajustaRequerimientos);
        if (c.cuentaExperiencia !== undefined) setCuentaExperiencia(c.cuentaExperiencia);
        if (c.cumplePlazoRequerido !== undefined) setCumplePlazoRequerido(c.cumplePlazoRequerido);
        if (c.declaraSustentabilidad !== undefined) setDeclaraSustentabilidad(c.declaraSustentabilidad);
        if (c.tipoEvidenciaSustentable) setTipoEvidenciaSustentable(c.tipoEvidenciaSustentable);
        if (c.observaciones) setObservaciones(c.observaciones);
        setDocumentoCotizacionNombre(file.name);

        setMensajeNotificacion({
          tipo: 'exito',
          texto: `Archivo "${file.name}" leído exitosamente. Revisa los campos completados a continuación.`,
        });
      } else {
        setMensajeNotificacion({
          tipo: 'error',
          texto: resultado.mensaje || 'Error al procesar el archivo.',
        });
      }
    } catch (err: any) {
      setMensajeNotificacion({
        tipo: 'error',
        texto: `No se pudo leer el archivo: ${err.message}`,
      });
    }
  };

  const handleSaveCotizacion = (e: React.FormEvent) => {
    e.preventDefault();

    const prov = proveedores.find(p => p.id === selectedProveedorId);
    if (!prov) {
      alert('Por favor seleccione o registre un proveedor de la lista.');
      return;
    }

    if (montoTotal <= 0) {
      alert('Por favor ingrese el monto de la cotización.');
      return;
    }

    onAddCotizacion({
      licitacionId: licitacion.id,
      proveedorId: prov.id,
      proveedorRut: prov.rut,
      proveedorNombre: prov.razonSocial,
      montoNeto,
      montoIva,
      montoTotal,
      plazoDias,
      ajustaRequerimientos,
      cuentaExperiencia,
      cumplePlazoRequerido,
      declaraSustentabilidad,
      tipoEvidenciaSustentable,
      documentoCotizacionNombre: documentoCotizacionNombre || 'Cotizacion_Cargada.pdf',
      observaciones,
    });

    // Reset Form
    setMontoNeto(0);
    setMontoIva(0);
    setMontoTotal(0);
    setObservaciones('');
    setDocumentoCotizacionNombre('');
    setMensajeNotificacion({
      tipo: 'exito',
      texto: `Cotización de ${prov.razonSocial} registrada correctamente en la licitación.`,
    });
  };

  const cotizacionesProyecto = cotizaciones.filter(c => c.licitacionId === licitacion.id);

  return (
    <div className="space-y-6">
      {/* Active Project Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase bg-sky-500/20 text-sky-300 px-2.5 py-0.5 rounded border border-sky-400/30">
            Licitación Activa
          </span>
          <h2 className="text-lg font-bold text-white mt-1">
            CP: {licitacion.codigoCP} | {licitacion.nombreProyecto}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            OP: {licitacion.codigoOP} • OT: {licitacion.codigoOT} • Cod: {licitacion.codigoProyecto}
          </p>
        </div>

        <div className="bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700 text-right">
          <span className="text-[10px] text-slate-400 block">Cotizaciones Ingresadas</span>
          <span className="text-xl font-bold text-sky-400">{cotizacionesProyecto.length} Ofertas</span>
        </div>
      </div>

      {/* Main Grid: Upload Zone + Manual Entry & Current Quotes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Excel Reader & Form Entry (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Automatic File Dropzone */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span>Lectura y Extracción Automática de Cotizaciones (Excel / PDF)</span>
              </h3>
            </div>

            <div className="border-2 border-dashed border-sky-200 hover:border-sky-400 bg-sky-50/40 rounded-2xl p-6 text-center transition cursor-pointer relative">
              <input
                type="file"
                accept=".xlsx, .xls, .csv, .pdf"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <Upload className="w-8 h-8 text-sky-600 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800">
                Sube la plantilla Excel completada por el proveedor
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                El sistema leerá automáticamente el proveedor, monto neto, IVA, plazo de entrega y parámetros técnicos.
              </p>
            </div>

            {mensajeNotificacion && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  mensajeNotificacion.tipo === 'exito'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {mensajeNotificacion.tipo === 'exito' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{mensajeNotificacion.texto}</span>
              </div>
            )}
          </div>

          {/* Form Entry */}
          <form onSubmit={handleSaveCotizacion} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-sky-600" />
              <span>Confirmar y Validar Datos de la Cotización</span>
            </h3>

            <div className="space-y-4 text-xs">
              {/* Select Supplier */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Proveedor (Oferente) *</label>
                <select
                  required
                  value={selectedProveedorId}
                  onChange={e => setSelectedProveedorId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none text-slate-800"
                >
                  <option value="">-- Seleccionar Proveedor Registrado --</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.razonSocial} (RUT: {p.rut})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amounts Grid */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto Oferta NETO</label>
                  <input
                    type="number"
                    required
                    value={montoNeto}
                    onChange={e => handleMontoNetoChange(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">IVA (19%)</label>
                  <input
                    type="number"
                    readOnly
                    value={montoIva}
                    className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-lg text-slate-600 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto TOTAL con IVA</label>
                  <input
                    type="number"
                    required
                    value={montoTotal}
                    onChange={e => setMontoTotal(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-sky-300 bg-sky-50 rounded-lg text-sky-900 font-extrabold"
                  />
                </div>
              </div>

              {/* Plazo Días */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-sky-600" />
                  <span>Plazo de Ejecución (Días de corrido) *</span>
                </label>
                <input
                  type="number"
                  required
                  value={plazoDias}
                  onChange={e => setPlazoDias(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              {/* Parámetros Técnicos SGC (Ponderación 35%) */}
              <div className="space-y-2 bg-sky-50/50 p-4 rounded-xl border border-sky-100">
                <span className="font-bold text-sky-950 block text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-600" />
                  <span>Parámetros de Evaluación Técnica (SGC 35%)</span>
                </span>

                <label className="flex items-center justify-between cursor-pointer p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-700">a) Ajuste a requerimientos, procedimientos y materiales de calidad</span>
                  <input
                    type="checkbox"
                    checked={ajustaRequerimientos}
                    onChange={e => setAjustaRequerimientos(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-700">b) Cuenta con experiencia relacionada (cartas de recomendación)</span>
                  <input
                    type="checkbox"
                    checked={cuentaExperiencia}
                    onChange={e => setCuentaExperiencia(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-700">c) Cumple con el plazo requerido en las bases</span>
                  <input
                    type="checkbox"
                    checked={cumplePlazoRequerido}
                    onChange={e => setCumplePlazoRequerido(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded"
                  />
                </label>
              </div>

              {/* Parámetro Sustentabilidad SGC (Ponderación 10%) */}
              <div className="space-y-2 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                <span className="font-bold text-emerald-950 block text-xs flex items-center gap-1.5">
                  <Leaf className="w-4 h-4 text-emerald-600" />
                  <span>Parámetro de Sustentabilidad Institucional (SGC 10%)</span>
                </span>

                <label className="flex items-center justify-between cursor-pointer p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-700">
                    Declara tener prácticas sustentables o adjunta Carta Compromiso Sustentable UCT firmada
                  </span>
                  <input
                    type="checkbox"
                    checked={declaraSustentabilidad}
                    onChange={e => setDeclaraSustentabilidad(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                </label>

                {declaraSustentabilidad && (
                  <input
                    type="text"
                    placeholder="Tipo de Evidencia (Ej: Carta Compromiso Firmada / Certificación ISO 14001)"
                    value={tipoEvidenciaSustentable}
                    onChange={e => setTipoEvidenciaSustentable(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observaciones</label>
                <input
                  type="text"
                  placeholder="Detalles o notas adicionales sobre la cotización"
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-md transition text-xs"
              >
                Guardar y Registrar Cotización en el Proyecto
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Loaded Quotes List (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-3 flex items-center justify-between">
              <span>Cotizaciones Registradas</span>
              <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-xs">
                {cotizacionesProyecto.length} Ofertas
              </span>
            </h3>

            {cotizacionesProyecto.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <FileText className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs">No hay cotizaciones ingresadas para este proyecto aún.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {cotizacionesProyecto.map(cot => (
                  <div
                    key={cot.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-sm transition space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{cot.proveedorNombre}</h4>
                        <span className="text-[10px] text-slate-500">RUT: {cot.proveedorRut}</span>
                      </div>
                      <button
                        onClick={() => onDeleteCotizacion(cot.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                        title="Eliminar cotización"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Total con IVA</span>
                        <span className="font-bold text-emerald-700">{formatoMonedaCLP(cot.montoTotal)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Plazo</span>
                        <span className="font-semibold text-slate-700">{cot.plazoDias} días</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                      {cot.declaraSustentabilidad && (
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">
                          🌱 Sustentable
                        </span>
                      )}
                      <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-medium">
                        Técnica OK
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
