import React, { useState, useEffect } from 'react';
import type { Cotizacion, Proveedor, LicitacionProyecto, Propuesta, ItemCotizacion } from '../types';
import { FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Plus, Trash2, ShieldCheck, Leaf, Clock, FileText, Globe, ArrowDownToLine, Loader2 } from 'lucide-react';
import { parseCotizacionExcel } from '../utils/excelParser';
import { parseCotizacionPdf } from '../utils/pdfParser';
import { uploadFileToProjectFolder } from '../services/driveService';
import { uploadLicitacionDocument } from '../services/storageService';
import { formatoMonedaCLP, ordenarCotizacionesPorResultado } from '../services/evaluationEngine';
import { subscribeToPropuestas, convertirPropuestaACotizacion, plazoEntregaVencido } from '../services/firestoreService';
import { SupplierSearchInput } from './SupplierSearchInput';
import { PremiumDatePicker } from './PremiumDatePicker';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';

const OnlinePropuestasList: React.FC<{
  licitacionId: string;
  onImportPropuesta: (p: Propuesta) => void;
  procesoCerrado?: boolean;
}> = ({ licitacionId, onImportPropuesta, procesoCerrado = false }) => {
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToPropuestas(licitacionId, data => {
      setPropuestas(data);
      setLoading(false);
    });
    return unsub;
  }, [licitacionId]);

  if (loading || propuestas.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-sky-900 to-indigo-900 text-white p-6 rounded-2xl shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-sky-300">
          <Globe className="w-4 h-4" />
          Propuestas Recibidas vía Portal de Proveedores ({propuestas.length})
        </h4>
      </div>

      <div className="space-y-2">
        {propuestas.map(p => (
          <div key={p.id} className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 flex items-center justify-between border border-white/10">
            <div className="space-y-1">
              <span className="font-bold text-sm text-white">{p.proveedorNombre}</span>
              <div className="flex gap-3 text-xs text-sky-200">
                <span>Total: <strong>{formatoMonedaCLP(p.montoTotal)}</strong></span>
                <span>Plazo: <strong>{p.plazoDias} días</strong></span>
                {p.archivoNombre && <span>Archivo: <a href={p.archivoURL} target="_blank" rel="noreferrer" className="underline">{p.archivoNombre}</a></span>}
              </div>
            </div>
            <button
              onClick={() => onImportPropuesta(p)}
              disabled={procesoCerrado}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 disabled:text-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-2 rounded-lg transition shadow-sm shrink-0"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              {procesoCerrado ? 'Proceso cerrado' : 'Convertir en Cotización'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const conTimeout = <T,>(promesa: Promise<T>, milisegundos: number, mensaje: string): Promise<T> =>
  Promise.race([
    promesa,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(mensaje)), milisegundos)),
  ]);

interface QuotationIngestionProps {
  licitacion: LicitacionProyecto | null;
  proveedores: Proveedor[];
  cotizaciones: Cotizacion[];
  onAddCotizacion: (cot: Omit<Cotizacion, 'id' | 'fechaCarga'>) => void | Promise<void>;
  onDeleteCotizacion: (id: string) => void | Promise<void>;
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

  // Technical & Sustainability criteria — nacen sin marcar: el evaluador debe confirmarlas explícitamente.
  const [ajustaRequerimientos, setAjustaRequerimientos] = useState<boolean>(false);
  const [cuentaExperiencia, setCuentaExperiencia] = useState<boolean>(false);
  const [cumplePlazoRequerido, setCumplePlazoRequerido] = useState<boolean>(false);
  const [declaraSustentabilidad, setDeclaraSustentabilidad] = useState<boolean>(false);
  const [tipoEvidenciaSustentable, setTipoEvidenciaSustentable] = useState<string>('Carta Compromiso Sustentable');
  const [documentoCotizacionNombre, setDocumentoCotizacionNombre] = useState<string>('');
  const [documentoCotizacionURL, setDocumentoCotizacionURL] = useState<string>('');
  const [documentoCotizacionDriveId, setDocumentoCotizacionDriveId] = useState<string>('');
  const [documentoCotizacionStorage, setDocumentoCotizacionStorage] = useState<'drive' | 'firebase'>('firebase');
  const [fechaCotizacion, setFechaCotizacion] = useState<string>('');
  const [itemizado, setItemizado] = useState<ItemCotizacion[]>([]);
  const [procesandoArchivo, setProcesandoArchivo] = useState(false);
  const [guardandoCotizacion, setGuardandoCotizacion] = useState(false);
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

  const procesoCerrado = licitacion.estado === 'Adjudicado'
    || licitacion.estado === 'Cerrado'
    || Boolean(licitacion.proveedorAdjudicadoId)
    || Boolean(licitacion.proveedorGanadorId);

  const checklistLic = licitacion.checklistAntecedentes;
  const antecedentesCompletos = Boolean(
    checklistLic?.basesTecnicasOk && checklistLic?.basesAdministrativasOk && checklistLic?.planosOk &&
    checklistLic?.calendarioDefinidoOk && checklistLic?.revisadoSecretariaGeneralOk
  );

  // Handle Net Amount changes and auto-calculate IVA and Total
  const handleMontoNetoChange = (val: number) => {
    setMontoNeto(val);
    const iva = Math.round(val * 0.19);
    setMontoIva(iva);
    setMontoTotal(val + iva);
  };

  const guardarItemizado = (items: ItemCotizacion[]) => {
    setItemizado(items);
    if (items.length > 0) {
      handleMontoNetoChange(items.reduce((sum, item) => sum + item.precioTotal, 0));
    }
  };

  const actualizarItem = (id: string, cambios: Partial<ItemCotizacion>) => {
    guardarItemizado(itemizado.map(item => {
      if (item.id !== id) return item;
      const actualizado = { ...item, ...cambios };
      if ('cantidad' in cambios || 'precioUnitario' in cambios) {
        actualizado.precioTotal = Math.round(actualizado.cantidad * actualizado.precioUnitario);
      }
      return actualizado;
    }));
  };

  // Handle file drop / file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (procesoCerrado) {
      e.target.value = '';
      setMensajeNotificacion({ tipo: 'error', texto: 'Proceso cerrado: la licitación ya fue adjudicada y no acepta nuevas ofertas.' });
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setMensajeNotificacion(null);
    setProcesandoArchivo(true);
    setDocumentoCotizacionNombre(file.name);

    try {
      const esPdf = file.name.toLowerCase().endsWith('.pdf');
      const c = await conTimeout(
        esPdf ? parseCotizacionPdf(file) : parseCotizacionExcel(file),
        20000,
        'La lectura del archivo excedió 20 segundos.'
      );

      // Liberar la interfaz apenas termina la lectura; el respaldo continúa aparte.
      const proveedorDetectado = proveedores.find(
        p =>
          (c.rutProveedor && p.rut.replace(/[^0-9k]/gi, '') === c.rutProveedor.replace(/[^0-9k]/gi, '')) ||
          (c.razonSocialProveedor && p.razonSocial.toLowerCase().includes(c.razonSocialProveedor.toLowerCase()))
      );
      if (proveedorDetectado) setSelectedProveedorId(proveedorDetectado.id);
      else if (proveedores.length > 0) setSelectedProveedorId(proveedores[0].id);
      if (c.montoNeto) handleMontoNetoChange(c.montoNeto);
      if (c.plazoDias) setPlazoDias(c.plazoDias);
      if (c.fechaCotizacion) setFechaCotizacion(c.fechaCotizacion);
      if (c.itemizado?.length) setItemizado(c.itemizado);
      setMensajeNotificacion({
        tipo: 'exito',
        texto: `Datos leídos correctamente: ${c.itemizado?.length || 0} partidas. El respaldo del archivo continúa en segundo plano.`,
      });
      setProcesandoArchivo(false);

      const archivoDrive = await conTimeout(
        uploadFileToProjectFolder(file, licitacion.id, licitacion.nombreProyecto),
        8000,
        'Google Drive no respondió a tiempo.'
      ).catch(() => ({ id: '', name: file.name, url: '', mimeType: file.type, storage: 'local' as const }));
      let archivoURL = archivoDrive.url;
      let almacenamiento: 'drive' | 'firebase' = 'drive';
      let respaldoCompleto = archivoDrive.storage === 'drive';
      if (archivoDrive.storage !== 'drive') {
        try {
          archivoURL = await conTimeout(
            uploadLicitacionDocument(licitacion.id, 'ofertas', file),
            12000,
            'El respaldo alternativo excedió el tiempo de espera.'
          );
          almacenamiento = 'firebase';
          respaldoCompleto = true;
        } catch (storageError) {
          console.warn('No se pudo respaldar el archivo de cotización:', storageError);
          archivoURL = '';
          respaldoCompleto = false;
        }
      }
        
        // Tratar de hacer match con el proveedor por RUT o Razón Social
        const matchProv = proveedores.find(
          p =>
            (c.rutProveedor && p.rut.toLowerCase().replace(/[^0-9k]/gi, '') === c.rutProveedor.toLowerCase().replace(/[^0-9k]/gi, '')) ||
            (c.razonSocialProveedor && p.razonSocial.toLowerCase().includes(c.razonSocialProveedor.toLowerCase()))
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
        if (c.fechaCotizacion) setFechaCotizacion(c.fechaCotizacion);
        if (c.itemizado?.length) setItemizado(c.itemizado);
        setDocumentoCotizacionURL(archivoURL);
        setDocumentoCotizacionDriveId(archivoDrive.storage === 'drive' ? archivoDrive.id : '');
        setDocumentoCotizacionStorage(almacenamiento);

        setMensajeNotificacion({
          tipo: respaldoCompleto ? 'exito' : 'error',
          texto: archivoDrive.storage === 'drive'
            ? `Archivo "${file.name}" leído y respaldado en Drive. Se detectaron ${c.itemizado?.length || 0} partidas.`
            : respaldoCompleto
              ? `Archivo leído (${c.itemizado?.length || 0} partidas) y respaldado. Drive no está configurado, por lo que se usó el almacenamiento seguro del sistema.`
              : `Los datos fueron leídos y podrá guardar la cotización, pero el archivo quedó pendiente de respaldo.`,
        });
    } catch (err: any) {
      setMensajeNotificacion({
        tipo: 'error',
        texto: `No se pudo leer el archivo: ${err.message}`,
      });
    } finally {
      setProcesandoArchivo(false);
    }
  };

  const handleSaveCotizacion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (procesoCerrado) {
      setMensajeNotificacion({ tipo: 'error', texto: 'Proceso cerrado: las ofertas existentes quedan disponibles únicamente como antecedentes.' });
      return;
    }
    if (!antecedentesCompletos) {
      setMensajeNotificacion({ tipo: 'error', texto: 'No se puede registrar una cotización: el checklist de "Bases & Planos" (Antecedentes Técnicos) de esta licitación no está completo.' });
      return;
    }

    const prov = proveedores.find(p => p.id === selectedProveedorId);
    if (!prov) {
      alert('Por favor seleccione o registre un proveedor de la lista.');
      return;
    }

    if (montoTotal <= 0) {
      alert('Por favor ingrese el monto de la cotización.');
      return;
    }
    if (!documentoCotizacionNombre) {
      alert('Adjunte el archivo de cotización antes de registrarla.');
      return;
    }
    if (itemizado.length === 0 || itemizado.some(item => !item.descripcion || item.cantidad <= 0 || item.precioUnitario <= 0)) {
      alert('La cotización debe incluir un itemizado completo: item, descripción, unidad, cantidad y precio unitario.');
      return;
    }
    if (plazoEntregaVencido(licitacion)) {
      const fechaLimite = licitacion.fechaEntregaPropuestas || licitacion.fechaEvaluacion;
      const continuar = confirm(
        `El plazo de entrega de propuestas de esta licitación venció el ${fechaLimite}. ` +
        `Solo continúe si esta oferta llegó por otro medio (correo, papel) antes de esa fecha y recién ahora se está registrando. ` +
        `¿Confirma registrarla de todas formas?`
      );
      if (!continuar) return;
    }

    setGuardandoCotizacion(true);
    try {
      await onAddCotizacion({
        licitacionId: licitacion.id,
        proveedorId: prov.id,
        proveedorRut: prov.rut,
        proveedorNombre: prov.razonSocial,
        montoNeto,
        montoIva,
        montoTotal,
        plazoDias,
        fechaCotizacion: fechaCotizacion || new Date().toISOString().split('T')[0],
        itemizado,
        ajustaRequerimientos,
        cuentaExperiencia,
        cumplePlazoRequerido,
        declaraSustentabilidad,
        tipoEvidenciaSustentable,
        documentoCotizacionNombre: documentoCotizacionNombre || 'Cotizacion_Cargada.pdf',
        ...(documentoCotizacionURL ? { documentoCotizacionURL, documentoCotizacionStorage } : {}),
        ...(documentoCotizacionDriveId ? { documentoCotizacionDriveId } : {}),
        observaciones,
      });

      setMontoNeto(0);
      setMontoIva(0);
      setMontoTotal(0);
      setObservaciones('');
      setDocumentoCotizacionNombre('');
      setDocumentoCotizacionURL('');
      setDocumentoCotizacionDriveId('');
      setDocumentoCotizacionStorage('firebase');
      setFechaCotizacion('');
      setItemizado([]);
      setMensajeNotificacion({ tipo: 'exito', texto: `Cotización de ${prov.razonSocial} registrada correctamente en la licitación.` });
    } catch (error) {
      console.error('Error guardando cotización:', error);
      const mensaje = error instanceof Error && error.message.includes('COTIZACION_DUPLICADA')
        ? 'Este proveedor ya tiene una cotización registrada en esta licitación. Elimínela primero desde el listado si desea reemplazarla.'
        : error instanceof Error && error.message.includes('PROCESO_CERRADO')
        ? 'Proceso cerrado: la licitación ya fue adjudicada y no acepta nuevas ofertas.'
        : 'No se pudo guardar la cotización. Revise la conexión y los permisos de Firestore.';
      setMensajeNotificacion({ tipo: 'error', texto: mensaje });
    } finally {
      setGuardandoCotizacion(false);
    }
  };

  const cotizacionesProyectoOrdenadas = ordenarCotizacionesPorResultado(
    cotizaciones.filter(c => c.licitacionId === licitacion.id),
    licitacion,
  );
  const cotizacionesProyecto = cotizacionesProyectoOrdenadas.map(resultado => resultado.cotizacion);

  return (
    <div className="space-y-6">
      {/* Active Project Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase bg-sky-500/20 text-sky-300 px-2.5 py-0.5 rounded border border-sky-400/30">
            {procesoCerrado ? 'Proceso cerrado por adjudicación' : 'Licitación Activa'}
          </span>
          <h2 className="text-lg font-bold text-white mt-1">
            CP: {licitacion.codigoCP} | {licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}
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

      {procesoCerrado && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl px-5 py-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-extrabold">Recepción de ofertas cerrada</p>
            <p className="text-xs mt-1">La licitación fue adjudicada. No se pueden cargar, importar, modificar ni eliminar ofertas; los antecedentes registrados permanecen disponibles en modo de consulta.</p>
          </div>
        </div>
      )}

      {!procesoCerrado && !antecedentesCompletos && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-extrabold">Antecedentes Técnicos incompletos</p>
            <p className="text-xs mt-1">El checklist de "Bases & Planos" de esta licitación no está completo. Complételo antes de registrar cotizaciones.</p>
          </div>
        </div>
      )}

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
                disabled={procesoCerrado}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed w-full h-full"
              />
              <Upload className="w-8 h-8 text-sky-600 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800">
                Sube la plantilla Excel completada por el proveedor
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                El sistema leerá proveedor, fecha, itemizado, monto neto, IVA y plazo; el archivo quedará respaldado en Drive.
              </p>
              {procesandoArchivo && <p className="text-[11px] text-sky-700 font-bold mt-2">Leyendo campos y guardando archivo...</p>}
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

            {itemizado.length > 0 && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-2 text-left">Item</th><th className="p-2 text-left">Descripción</th>
                      <th className="p-2">Unidad</th><th className="p-2 text-right">Cantidad</th>
                      <th className="p-2 text-right">P. unitario</th><th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemizado.map(item => (
                      <tr key={item.id}>
                        <td className="p-2 font-bold">{item.item}</td>
                        <td className="p-2 min-w-[260px]">{item.descripcion}</td>
                        <td className="p-2 text-center">{item.unidad}</td>
                        <td className="p-2 text-right">{item.cantidad.toLocaleString('es-CL')}</td>
                        <td className="p-2 text-right">{formatoMonedaCLP(item.precioUnitario)}</td>
                        <td className="p-2 text-right font-bold">{formatoMonedaCLP(item.precioTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Online Proposals from Provider Portal */}
          <OnlinePropuestasList
            licitacionId={licitacion.id}
            procesoCerrado={procesoCerrado || !antecedentesCompletos}
            onImportPropuesta={async p => {
              try {
                await convertirPropuestaACotizacion(p);
                setMensajeNotificacion({
                  tipo: 'exito',
                  texto: `Propuesta enviada por ${p.proveedorNombre} importada como Cotización Oficial.`,
                });
              } catch (error) {
                setMensajeNotificacion({
                  tipo: 'error',
                  texto: error instanceof Error && error.message.includes('COTIZACION_DUPLICADA')
                    ? 'Este proveedor ya tiene una cotización oficial registrada; elimínela primero si desea reemplazarla por esta propuesta.'
                    : error instanceof Error && error.message.includes('PROCESO_CERRADO')
                    ? 'Proceso cerrado: la licitación ya fue adjudicada.'
                    : 'No fue posible importar la propuesta.',
                });
              }
            }}
          />

          {/* Form Entry */}
          <form onSubmit={handleSaveCotizacion} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-sky-600" />
              <span>Confirmar y Validar Datos de la Cotización</span>
              {procesoCerrado && (
                <span className="ml-auto text-[10px] font-black uppercase bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                  Solo consulta
                </span>
              )}
            </h3>

            <fieldset disabled={procesoCerrado || !antecedentesCompletos} className="space-y-4 text-xs disabled:opacity-60">
              {/* Select Supplier */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Buscar y Seleccionar Proveedor (Oferente por RUT o Nombre) *</label>
                <SupplierSearchInput
                  proveedores={proveedores}
                  selectedProveedorId={selectedProveedorId}
                  onSelectProveedor={setSelectedProveedorId}
                  placeholder="Buscar proveedor por RUT o Razón Social (ej: 76.814.443-5 o Abastec)..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fecha de la cotización *</label>
                <PremiumDatePicker value={fechaCotizacion || new Date().toISOString().split('T')[0]} onChange={setFechaCotizacion} className="flex items-center gap-2 w-full px-3 py-2 border border-slate-300 rounded-lg text-left" />
              </div>

              {/* Amounts Grid */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto Oferta NETO *</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold">$</span>
                    <input
                      type="text"
                      required
                      placeholder="12.500.000"
                      value={formatearEnteroConMiles(montoNeto)}
                      onChange={e => handleMontoNetoChange(desformatearEntero(e.target.value))}
                      className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none font-bold text-emerald-700"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">IVA (19%)</label>
                  <input
                    type="text"
                    readOnly
                    value={formatoMonedaCLP(montoIva)}
                    className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-lg text-slate-600 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto TOTAL con IVA *</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold">$</span>
                    <input
                      type="text"
                      required
                      placeholder="14.875.000"
                      value={formatearEnteroConMiles(montoTotal)}
                      onChange={e => setMontoTotal(desformatearEntero(e.target.value))}
                      className="w-full pl-7 pr-3 py-2 border border-sky-300 bg-sky-50 rounded-lg text-sky-900 font-extrabold"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div><span className="font-bold text-slate-800">Itemizado de la oferta *</span><p className="text-[10px] text-slate-500">Los gastos generales deben estar incorporados en los precios unitarios.</p></div>
                  <button type="button" onClick={() => guardarItemizado([...itemizado, { id: `item-${Date.now()}`, item: String(itemizado.length + 1), descripcion: '', unidad: 'Un', cantidad: 1, precioUnitario: 0, precioTotal: 0 }])} className="px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Agregar partida</button>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-[11px]"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Descripción</th><th className="p-2">Unidad</th><th className="p-2">Cantidad</th><th className="p-2">Precio unitario</th><th className="p-2 text-right">Total</th><th></th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{itemizado.length === 0 ? <tr><td colSpan={7} className="p-4 text-center text-slate-400">Cargue el archivo para leer las partidas o agréguelas manualmente.</td></tr> : itemizado.map(item => <tr key={item.id}>
                      <td className="p-1.5"><input value={item.item} onChange={e => actualizarItem(item.id, { item: e.target.value })} className="w-14 p-1.5 border rounded" /></td>
                      <td className="p-1.5"><input value={item.descripcion} onChange={e => actualizarItem(item.id, { descripcion: e.target.value })} className="min-w-[260px] w-full p-1.5 border rounded" /></td>
                      <td className="p-1.5"><input value={item.unidad} onChange={e => actualizarItem(item.id, { unidad: e.target.value })} className="w-16 p-1.5 border rounded" /></td>
                      <td className="p-1.5"><input type="number" step="any" value={item.cantidad} onChange={e => actualizarItem(item.id, { cantidad: Number(e.target.value) })} className="w-20 p-1.5 border rounded text-right" /></td>
                      <td className="p-1.5"><input type="number" value={item.precioUnitario} onChange={e => actualizarItem(item.id, { precioUnitario: Number(e.target.value) })} className="w-28 p-1.5 border rounded text-right" /></td>
                      <td className="p-2 text-right font-bold">{formatoMonedaCLP(item.precioTotal)}</td>
                      <td className="p-1"><button type="button" onClick={() => guardarItemizado(itemizado.filter(i => i.id !== item.id))} className="p-1 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>)}</tbody>
                  </table>
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

              {/* Parámetros Técnicos (Ponderación 35%) */}
              <div className="space-y-2 bg-sky-50/50 p-4 rounded-xl border border-sky-100">
                <span className="font-bold text-sky-950 block text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-600" />
                  <span>Parámetros de Evaluación Técnica (35%)</span>
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

              {/* Parámetro Sustentabilidad (Ponderación 10%) */}
              <div className="space-y-2 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                <span className="font-bold text-emerald-950 block text-xs flex items-center gap-1.5">
                  <Leaf className="w-4 h-4 text-emerald-600" />
                  <span>Parámetro de Sustentabilidad Institucional (10%)</span>
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
            </fieldset>

            <button
              type="submit"
              disabled={procesoCerrado || !antecedentesCompletos || guardandoCotizacion || procesandoArchivo}
              className="w-full py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 text-white rounded-xl font-bold shadow-md transition text-xs flex items-center justify-center gap-2"
            >
              {guardandoCotizacion && <Loader2 className="w-4 h-4 animate-spin" />}
              {procesoCerrado ? 'Proceso de ofertas cerrado' : guardandoCotizacion ? 'Guardando cotización...' : 'Guardar y Registrar Cotización en el Proyecto'}
            </button>
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
                {cotizacionesProyectoOrdenadas.map(({ cotizacion: cot, puntaje, rankingPuntaje, esAdjudicada }) => (
                  <div
                    key={cot.id}
                    className={`p-4 rounded-xl border hover:bg-white hover:shadow-sm transition space-y-2 ${esAdjudicada ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/50'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          {esAdjudicada && <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase">Adjudicada</span>}
                          <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-[9px] font-bold">Ranking #{rankingPuntaje} · {puntaje.toFixed(2)} pts</span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-800">{cot.proveedorNombre}</h4>
                        <span className="text-[10px] text-slate-500">RUT: {cot.proveedorRut}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cot.documentoCotizacionURL ? (
                          <button
                            onClick={() => window.open(cot.documentoCotizacionURL, '_blank')}
                            className="p-1 text-sky-600 hover:text-sky-800 hover:bg-sky-50 rounded transition"
                            title={`Ver oferta adjunta${cot.documentoCotizacionNombre ? `: ${cot.documentoCotizacionNombre}` : ''}`}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="p-1 text-slate-300" title="Sin archivo de oferta adjunto">
                            <FileText className="w-4 h-4" />
                          </span>
                        )}
                        <button
                          onClick={() => onDeleteCotizacion(cot.id)}
                          disabled={procesoCerrado}
                          className="p-1 text-slate-400 hover:text-red-600 disabled:text-slate-300 disabled:cursor-not-allowed rounded transition"
                          title={procesoCerrado ? 'Las ofertas quedan bloqueadas después de adjudicar' : 'Eliminar cotización'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
