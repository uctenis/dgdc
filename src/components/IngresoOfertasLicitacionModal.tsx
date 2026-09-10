import React, { useState } from 'react';
import {
  Upload, CheckCircle2, X, Plus
} from 'lucide-react';
import type { LicitacionProyecto, Cotizacion, Proveedor } from '../types';
import { formatoMonedaCLP, ordenarCotizacionesPorResultado } from '../services/evaluationEngine';
import { addCotizacion, deleteCotizacion, plazoEntregaVencido, licitacionCerradaParaOfertas } from '../services/firestoreService';
import { parseCotizacionExcel } from '../utils/excelParser';
import { parseCotizacionPdf } from '../utils/pdfParser';
import { SupplierSearchInput } from './SupplierSearchInput';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';

interface IngresoOfertasLicitacionModalProps {
  licitacion: LicitacionProyecto;
  cotizaciones: Cotizacion[];
  proveedores: Proveedor[];
  onClose: () => void;
}

export const IngresoOfertasLicitacionModal: React.FC<IngresoOfertasLicitacionModalProps> = ({
  licitacion,
  cotizaciones,
  proveedores,
  onClose,
}) => {
  const resultadosOrdenados = ordenarCotizacionesPorResultado(
    cotizaciones.filter(c => c.licitacionId === licitacion.id),
    licitacion,
  );
  const cotizacionesExistentes = resultadosOrdenados.map(resultado => resultado.cotizacion);
  const procesoCerrado = licitacionCerradaParaOfertas(licitacion);
  const checklist = licitacion.checklistAntecedentes;
  const antecedentesCompletos = Boolean(
    checklist?.basesTecnicasOk && checklist?.basesAdministrativasOk && checklist?.planosOk &&
    checklist?.calendarioDefinidoOk && checklist?.revisadoSecretariaGeneralOk
  );

  const [ofertaActivaIndex, setOfertaActivaIndex] = useState<number>(0);

  // Estado del formulario de la oferta en edición
  const [proveedorId, setProveedorId] = useState<string>('');
  const [montoNeto, setMontoNeto] = useState<number | ''>('');
  const [plazoDias, setPlazoDias] = useState<number | ''>('');
  const [ajustaRequerimientos, setAjustaRequerimientos] = useState<boolean>(false);
  const [cuentaExperiencia, setCuentaExperiencia] = useState<boolean>(false);
  const [cumplePlazoRequerido, setCumplePlazoRequerido] = useState<boolean>(false);
  const [declaraSustentabilidad, setDeclaraSustentabilidad] = useState<boolean>(false);
  const [observaciones, setObservaciones] = useState<string>('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [parsedFeedback, setParsedFeedback] = useState<string[] | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const iva = typeof montoNeto === 'number' ? Math.round(montoNeto * 0.19) : 0;
  const total = typeof montoNeto === 'number' ? montoNeto + iva : 0;

  const handleFileUpload = async (file: File) => {
    if (procesoCerrado) {
      alert('Proceso cerrado: la licitación ya fue adjudicada y no acepta nuevas ofertas.');
      return;
    }
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    setUploadPct(10);
    setParseError('');

    try {
      let parsedData: any = null;
      if (isExcel) {
        parsedData = await parseCotizacionExcel(file);
      } else if (isPdf) {
        parsedData = await parseCotizacionPdf(file);
      }

      setUploadPct(100);

      const feedback: string[] = [];
      if (parsedData?.rutProveedor) {
        const matched = proveedores.find(
          p => p.rut.replace(/[^0-9kK]/g, '') === parsedData.rutProveedor.replace(/[^0-9kK]/g, '')
        );
        if (matched) {
          setProveedorId(matched.id);
          feedback.push(`✓ Proveedor identificado por RUT: ${matched.razonSocial} (${matched.rut})`);
        } else {
          feedback.push(`✓ RUT detectado en documento: ${parsedData.rutProveedor}`);
        }
      }

      if (parsedData?.montoNeto) {
        setMontoNeto(parsedData.montoNeto);
        feedback.push(`✓ Monto Neto extraído: $${parsedData.montoNeto.toLocaleString('es-CL')}`);
      }

      if (parsedData?.plazoDias) {
        setPlazoDias(parsedData.plazoDias);
        feedback.push(`✓ Plazo extraído: ${parsedData.plazoDias} días corridos`);
      }

      if (parsedData?.detallesLeidos) {
        feedback.push(...parsedData.detallesLeidos);
      }

      setParsedFeedback(feedback);
    } catch (err) {
      console.error('Error al leer archivo:', err);
      setParseError('No se pudo leer el archivo. Ingrese los datos de la oferta manualmente.');
    } finally {
      setTimeout(() => setUploadPct(null), 500);
    }
  };

  const handleGuardarOferta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (procesoCerrado) {
      alert('Proceso cerrado: no es posible registrar ofertas después de la adjudicación.');
      return;
    }
    if (!antecedentesCompletos) {
      alert('No se puede registrar una oferta: el checklist de "Bases & Planos" (Antecedentes Técnicos) de esta licitación no está completo.');
      return;
    }
    if (!proveedorId) {
      alert('Por favor seleccione una empresa oferente.');
      return;
    }
    if (!montoNeto || Number(montoNeto) <= 0) {
      alert('Por favor ingrese un monto neto válido.');
      return;
    }
    if (!plazoDias || Number(plazoDias) <= 0) {
      alert('Por favor ingrese el plazo de ejecución en días.');
      return;
    }

    const prov = proveedores.find(p => p.id === proveedorId);
    if (!prov) return;

    if (plazoEntregaVencido(licitacion)) {
      const fechaLimite = licitacion.fechaEntregaPropuestas || licitacion.fechaEvaluacion;
      const continuar = confirm(
        `El plazo de entrega de propuestas de esta licitación venció el ${fechaLimite}. ` +
        `Solo continúe si esta oferta llegó por otro medio antes de esa fecha y recién ahora se está registrando. ` +
        `¿Confirma registrarla de todas formas?`
      );
      if (!continuar) return;
    }

    setIsSaving(true);
    try {
      await addCotizacion({
        licitacionId: licitacion.id,
        proveedorId: prov.id,
        proveedorNombre: prov.razonSocial,
        proveedorRut: prov.rut,
        montoNeto: Number(montoNeto),
        montoIva: iva,
        montoTotal: total,
        plazoDias: Number(plazoDias),
        ajustaRequerimientos,
        cuentaExperiencia,
        cumplePlazoRequerido,
        declaraSustentabilidad,
        observaciones: observaciones || `Oferta ${cotizacionesExistentes.length + 1} ingresada directamente`,
      });

      alert(`¡Oferta ${cotizacionesExistentes.length + 1} de ${prov.razonSocial} registrada con éxito!`);
      // Reset form
      setProveedorId('');
      setMontoNeto('');
      setPlazoDias('');
      setAjustaRequerimientos(false);
      setCuentaExperiencia(false);
      setCumplePlazoRequerido(false);
      setDeclaraSustentabilidad(false);
      setObservaciones('');
      setParsedFeedback(null);
    } catch (error) {
      alert(error instanceof Error && error.message.includes('COTIZACION_DUPLICADA')
        ? 'Este proveedor ya tiene una oferta registrada en esta licitación. Elimínela primero si desea reemplazarla.'
        : error instanceof Error && error.message.includes('PROCESO_CERRADO')
        ? 'Proceso cerrado: la licitación fue adjudicada mientras esta ventana estaba abierta.'
        : 'No fue posible registrar la oferta. Intente nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOferta = async (cotizacionId: string) => {
    if (procesoCerrado) {
      alert('Las ofertas de una licitación adjudicada quedan bloqueadas como antecedentes del proceso.');
      return;
    }
    if (!confirm('¿Eliminar esta oferta registrada?')) return;
    await deleteCotizacion(cotizacionId);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col border border-slate-200 text-xs">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase bg-sky-100 text-sky-800 px-2.5 py-0.5 rounded">
                Ingreso Secuencial de Ofertas (Oferta 1, 2, 3...)
              </span>
              <span className="text-[10px] text-slate-500 font-bold">Cód: {licitacion.codigoProyecto}</span>
            </div>
            <h3 className="text-base font-bold text-slate-800 mt-1">
              Ingreso de Ofertas para {licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}
            </h3>
            <p className="text-xs text-slate-500">Presupuesto Estimado: {formatoMonedaCLP(licitacion.montoEstimado)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {procesoCerrado && (
          <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-xl px-4 py-3 shrink-0">
            <p className="font-extrabold">Proceso cerrado por adjudicación</p>
            <p className="mt-1 text-[11px]">No se admiten nuevas ofertas ni cambios sobre las ya registradas. Esta vista es únicamente de consulta.</p>
          </div>
        )}

        {!procesoCerrado && !antecedentesCompletos && (
          <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-xl px-4 py-3 shrink-0">
            <p className="font-extrabold">Antecedentes Técnicos incompletos</p>
            <p className="mt-1 text-[11px]">El checklist de "Bases & Planos" de esta licitación no está completo. Complételo antes de registrar ofertas.</p>
          </div>
        )}

        {/* Pestañas de Ofertas (Oferta 1, Oferta 2, Oferta 3...) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b shrink-0">
          {cotizacionesExistentes.map((cot, idx) => (
            <div
              key={cot.id}
              className={`px-3 py-2 rounded-xl border flex items-center gap-2 shrink-0 cursor-pointer transition ${
                ofertaActivaIndex === idx
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              onClick={() => setOfertaActivaIndex(idx)}
            >
              <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-extrabold text-[10px]">
                {idx + 1}
              </div>
              <div>
                <span className="block text-[9px] font-black uppercase text-emerald-600">
                  {resultadosOrdenados[idx].esAdjudicada ? 'Adjudicada' : `Ranking #${resultadosOrdenados[idx].rankingPuntaje}`}
                  {' · '}{resultadosOrdenados[idx].puntaje.toFixed(2)} pts
                </span>
                <span className="block text-[11px] font-bold truncate max-w-[120px]">{cot.proveedorNombre}</span>
                <span className="block text-[10px] opacity-80">{formatoMonedaCLP(cot.montoNeto)} ({cot.plazoDias}d)</span>
              </div>
              <button
                type="button"
                disabled={procesoCerrado}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteOferta(cot.id);
                }}
                className="text-slate-400 hover:text-red-400 disabled:text-slate-600 disabled:cursor-not-allowed p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {!procesoCerrado && (
            <button
              type="button"
              onClick={() => setOfertaActivaIndex(cotizacionesExistentes.length)}
              className={`px-4 py-2 rounded-xl border border-dashed flex items-center gap-1.5 font-bold transition shrink-0 ${
                ofertaActivaIndex === cotizacionesExistentes.length
                  ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                  : 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Ingresar Oferta {cotizacionesExistentes.length + 1}</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">

          {/* Formulario de Ingreso de Nueva Oferta */}
          {procesoCerrado && cotizacionesExistentes.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-600">
              Esta licitación fue adjudicada sin ofertas disponibles para visualizar.
            </div>
          ) : ofertaActivaIndex === cotizacionesExistentes.length ? (
            <form onSubmit={handleGuardarOferta} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-extrabold">
                    {cotizacionesExistentes.length + 1}
                  </span>
                  Registrar Datos de Oferta {cotizacionesExistentes.length + 1}
                </h4>
                <span className="text-[10px] text-sky-700 font-semibold bg-sky-100 px-2.5 py-0.5 rounded-full">
                  Lectura Automática Disponible (PDF / Excel)
                </span>
              </div>

              {/* Botón de Carga con Lectura Automática */}
              <div className="bg-white p-4 rounded-xl border border-sky-200 space-y-2">
                <label className="block font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-sky-600" />
                  Cargar Archivo de Oferta en PDF o Excel (Lee automáticamente el RUT, Monto y Plazo)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls"
                    onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
                  />
                </div>

                {uploadPct !== null && (
                  <div className="text-[10px] text-sky-600 font-semibold">Procesando y extrayendo datos del archivo ({uploadPct}%)...</div>
                )}

                {parseError && (
                  <div className="text-[11px] text-red-700 font-semibold">{parseError}</div>
                )}

                {parsedFeedback && parsedFeedback.length > 0 && (
                  <div className="bg-sky-50 border border-sky-200 p-3 rounded-lg text-[11px] text-sky-900 space-y-1">
                    <span className="font-bold block">✨ Lectura Automática de Oferta:</span>
                    {parsedFeedback.map((f, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-sky-600 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 mb-1">1. Buscar y Seleccionar Empresa Oferente (RUT o Nombre) *</label>
                  <SupplierSearchInput
                    proveedores={proveedores}
                    selectedProveedorId={proveedorId}
                    onSelectProveedor={setProveedorId}
                    placeholder="Escriba el RUT o Nombre del Proveedor (ej: 76.814.443-5 o Abastec)..."
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">2. Monto Neto (sin IVA) *</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-400 font-bold">$</span>
                    <input
                      type="text"
                      required
                      placeholder="12.500.000"
                      value={formatearEnteroConMiles(montoNeto)}
                      onChange={e => {
                        const num = desformatearEntero(e.target.value);
                        setMontoNeto(num > 0 ? num : '');
                      }}
                      className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none text-xs font-bold text-emerald-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">3. IVA (19%)</label>
                  <input
                    type="text"
                    disabled
                    value={formatoMonedaCLP(iva)}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 outline-none text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">4. Monto Total (con IVA)</label>
                  <input
                    type="text"
                    disabled
                    value={formatoMonedaCLP(total)}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-900 outline-none text-xs font-extrabold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">5. Plazo de Ejecución (Días Corridos) *</label>
                  <input
                    type="number"
                    required
                    placeholder="ej: 30"
                    value={plazoDias}
                    onChange={e => setPlazoDias(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">6. Sustentabilidad Declarada</label>
                  <label className="flex items-center gap-2 p-2 bg-white border border-slate-300 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={declaraSustentabilidad}
                      onChange={e => setDeclaraSustentabilidad(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span className="text-[11px] text-slate-700 font-semibold">Declara gestión de residuos o certificado verde</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">7. Verificación Técnica (evaluador debe confirmar cada punto — no se asumen por defecto)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 p-2 bg-white border border-slate-300 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={ajustaRequerimientos} onChange={e => setAjustaRequerimientos(e.target.checked)} className="w-4 h-4 text-sky-600 rounded" />
                    <span className="text-[11px] text-slate-700 font-semibold">Se ajusta a requerimientos</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white border border-slate-300 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={cuentaExperiencia} onChange={e => setCuentaExperiencia(e.target.checked)} className="w-4 h-4 text-sky-600 rounded" />
                    <span className="text-[11px] text-slate-700 font-semibold">Cuenta con experiencia acreditada</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white border border-slate-300 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={cumplePlazoRequerido} onChange={e => setCumplePlazoRequerido(e.target.checked)} className="w-4 h-4 text-sky-600 rounded" />
                    <span className="text-[11px] text-slate-700 font-semibold">Cumple plazo requerido</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">8. Observaciones de la Oferta</label>
                <textarea
                  rows={2}
                  placeholder="Garantías, validez de la oferta, observaciones adicionales..."
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none text-xs resize-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSaving || !antecedentesCompletos}
                  title={antecedentesCompletos ? undefined : 'Complete el checklist de Bases & Planos antes de registrar ofertas'}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSaving ? 'Guardando Oferta...' : `Guardar Oferta ${cotizacionesExistentes.length + 1}`}</span>
                </button>
              </div>
            </form>
          ) : (
            // Vista de Oferta Existente
            (() => {
              const cotSel = cotizacionesExistentes[ofertaActivaIndex];
              if (!cotSel) return null;
              return (
                <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-4 border border-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase bg-emerald-500 text-slate-950 px-2.5 py-0.5 rounded">
                        Oferta {ofertaActivaIndex + 1} Registrada
                      </span>
                      <h4 className="text-base font-bold text-white mt-1">{cotSel.proveedorNombre}</h4>
                      <p className="text-xs text-slate-400">RUT: {cotSel.proveedorRut}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Total con IVA</span>
                      <span className="text-lg font-extrabold text-emerald-400">{formatoMonedaCLP(cotSel.montoTotal)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 bg-white/5 p-3 rounded-xl border border-white/10 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Monto Neto</span>
                      <span className="font-bold text-white">{formatoMonedaCLP(cotSel.montoNeto)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Plazo de Ejecución</span>
                      <span className="font-bold text-white">{cotSel.plazoDias} días corridos</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Sustentabilidad</span>
                      <span className="font-bold text-emerald-300">{cotSel.declaraSustentabilidad ? 'Sí (Declarada)' : 'No'}</span>
                    </div>
                  </div>

                  {cotSel.observaciones && (
                    <div className="text-xs text-slate-300 bg-white/5 p-3 rounded-xl">
                      <span className="font-bold block text-slate-200">Observaciones:</span>
                      <p>{cotSel.observaciones}</p>
                    </div>
                  )}
                </div>
              );
            })()
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t shrink-0 text-xs">
          <span className="text-slate-500 font-medium">
            Total Ofertas Registradas: <strong className="text-slate-800 font-bold">{cotizacionesExistentes.length}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-sm transition"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
