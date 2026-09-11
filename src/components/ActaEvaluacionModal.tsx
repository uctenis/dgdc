import React, { useState } from 'react';
import {
  FileCheck2, Trophy, X, Edit3, Save, Printer, ShieldCheck, AlertTriangle
} from 'lucide-react';
import type { LicitacionProyecto, Cotizacion, Proveedor, ConfiguracionFirmas, EvaluacionResultado } from '../types';
import { formatoMonedaCLP, evaluarCotizaciones } from '../services/evaluationEngine';
import { updateLicitacion } from '../services/firestoreService';
import confetti from 'canvas-confetti';
import { auth } from '../lib/firebase';

interface ActaEvaluacionModalProps {
  licitacion: LicitacionProyecto;
  cotizaciones: Cotizacion[];
  proveedores: Proveedor[];
  configFirmas: ConfiguracionFirmas;
  onClose: () => void;
  onAdjudicar: (proveedorId: string, justificacion: string) => Promise<void>;
}

export const ActaEvaluacionModal: React.FC<ActaEvaluacionModalProps> = ({
  licitacion,
  cotizaciones,
  proveedores,
  configFirmas,
  onClose,
  onAdjudicar,
}) => {
  const cotizacionesLicitacion = cotizaciones.filter(c => c.licitacionId === licitacion.id);
  const evaluaciones = evaluarCotizaciones(cotizacionesLicitacion);
  const ganadoraDefault = evaluaciones.find(e => e.esPropuestaAdjudicada) || evaluaciones[0];

  const [proveedorSeleccionadoId, setProveedorSeleccionadoId] = useState<string>(
    licitacion.proveedorAdjudicadoId || ganadoraDefault?.proveedorId || ''
  );

  const crearTextoAdjudicacion = (evaluacion?: EvaluacionResultado) => evaluacion
    ? `Según el análisis comparativo de las cotizaciones recibidas y la aplicación de los criterios de evaluación establecidos, se adjudica la contratación a ${evaluacion.proveedorNombre} (RUT ${evaluacion.proveedorRut}), por un monto total de ${formatoMonedaCLP(evaluacion.montoTotal)} IVA incluido y un plazo de ejecución ofertado de ${evaluacion.plazoDias} días corridos.`
    : 'Pendiente de recepción de ofertas.';

  const [justificacionEditada, setJustificacionEditada] = useState<string>(
    licitacion.justificacionAdjudicacion ||
      crearTextoAdjudicacion(ganadoraDefault)
  );

  const [modoEdicion, setModoEdicion] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdjudicando, setIsAdjudicando] = useState(false);

  const cotizacionGanadoraSel = evaluaciones.find(e => e.proveedorId === proveedorSeleccionadoId) || ganadoraDefault;

  const proveedorganador = proveedores.find(p => p.id === proveedorSeleccionadoId) || {
    razonSocial: cotizacionGanadoraSel?.proveedorNombre || 'Sin Adjudicar',
    rut: cotizacionGanadoraSel?.proveedorRut || 'N/A',
  };

  const montoAdjudicadoTotal = cotizacionGanadoraSel?.montoTotal || licitacion.montoEstimado;
  const plazoAdjudicadoDias = cotizacionGanadoraSel?.plazoDias || licitacion.plazoAdjudicadoDias;
  const umbralActa = configFirmas.parametrosSgc?.umbralActaObligatoria ?? 800001;
  const umbralVrae = configFirmas.parametrosSgc?.umbralAprobacionVrae ?? 5000001;
  const umbralContrato = configFirmas.parametrosSgc?.umbralContratoFormal ?? 25000001;
  const requiereFirmaVicerrectora = montoAdjudicadoTotal > umbralVrae;
  const requiereEquipoEvaluador = montoAdjudicadoTotal >= umbralContrato;
  const cotizacionPorId = new Map(cotizacionesLicitacion.map(cotizacion => [cotizacion.id, cotizacion]));
  const montoNetoAdjudicado = cotizacionGanadoraSel?.montoNeto
    ?? (montoAdjudicadoTotal ? Math.round(montoAdjudicadoTotal / 1.19) : undefined);

  const handleGuardarActa = async () => {
    setIsSaving(true);
    try {
      await updateLicitacion(licitacion.id, {
        proveedorAdjudicadoId: proveedorSeleccionadoId,
        justificacionAdjudicacion: justificacionEditada,
        cotizacionAdjudicadaId: cotizacionGanadoraSel?.cotizacionId,
        proveedorAdjudicadoNombre: cotizacionGanadoraSel?.proveedorNombre,
        proveedorAdjudicadoRut: cotizacionGanadoraSel?.proveedorRut,
        montoAdjudicadoNeto: montoNetoAdjudicado,
        montoAdjudicadoTotal: cotizacionGanadoraSel?.montoTotal,
        montoAdjudicadoIva: cotizacionGanadoraSel && montoNetoAdjudicado !== undefined
          ? cotizacionGanadoraSel.montoTotal - montoNetoAdjudicado
          : undefined,
        plazoAdjudicadoDias: cotizacionGanadoraSel?.plazoDias,
      });
      alert('¡Acta de Evaluación y Adjudicación guardada exitosamente!');
      setModoEdicion(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAprobarYAdjudicar = async () => {
    if (!proveedorSeleccionadoId) {
      alert('Seleccione un proveedor para adjudicar.');
      return;
    }
    if (!confirm(`¿Confirmar la Adjudicación Oficial de la Licitación a ${proveedorganador.razonSocial}?`)) return;

    setIsAdjudicando(true);
    try {
      await onAdjudicar(proveedorSeleccionadoId, justificacionEditada);
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
      });
      onClose();
    } catch (err) {
      console.error('Error al adjudicar la licitación:', err);
      alert(err instanceof Error ? err.message : 'No fue posible adjudicar la licitación. Intente nuevamente.');
    } finally {
      setIsAdjudicando(false);
    }
  };

  const isAdjudicado = licitacion.estado === 'Adjudicado' || licitacion.estado === 'Cerrado';
  const isFirmada = licitacion.actaFirmaDigital?.estado === 'Firmada';
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

  const handleEnviarAMarioly = async () => {
    setIsGeneratingEmail(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Usuario no autenticado.');
      
      const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://127.0.0.1:5001/dgdc-c848d/us-central1'
        : 'https://us-central1-dgdc-c848d.cloudfunctions.net';
      
      const response = await fetch(`${baseUrl}/enviarCorreoAdjudicacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ licitacionId: licitacion.id })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${response.status}`);
      }
      
      const data = await response.json();
      alert('¡Correo enviado exitosamente en segundo plano!');
      if (data.previewUrl) {
        console.log('Preview del correo:', data.previewUrl);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al enviar el correo.');
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  const handleImprimirDocumento = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Estilos CSS para Impresión Oficial en 2 Páginas */}
      <style>{`
        .signature-table {
          table-layout: fixed;
        }
        .signature-block,
        .signature-row {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .signature-identity {
          vertical-align: middle;
          padding: 12px 16px;
        }
        .signature-space {
          min-height: 88px;
          padding: 12px 16px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
        }
        .signature-line {
          width: min(82%, 320px);
          border-bottom: 1.5px solid #0f172a;
          margin: 0 auto 5px;
        }
        .signature-caption {
          min-height: 14px;
          text-align: center;
          font-size: 9px;
          line-height: 1.2;
          font-weight: 700;
          color: #475569;
        }
        @media print {
          @page {
            size: letter portrait;
            margin: 10mm;
          }
          html, body, #root, main {
            height: auto !important;
            max-height: none !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          .printable-sgc-acta, .printable-sgc-acta * {
            visibility: visible !important;
          }
          .fixed,
          .inset-0,
          .backdrop-blur-sm,
          .max-h-\\[94vh\\],
          .overflow-y-auto,
          .overflow-x-auto,
          .shadow-2xl {
            position: static !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
          }
          .printable-sgc-acta {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            font-size: 9pt !important;
            line-height: 1.3 !important;
          }
          .page-break {
            page-break-before: always !important;
            break-before: page !important;
            clear: both !important;
            margin-top: 0 !important;
            padding-top: 4mm !important;
          }
          .no-print {
            display: none !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
          .signature-space {
            min-height: 23mm !important;
            padding: 3mm 4mm 2.5mm !important;
          }
          .signature-identity {
            padding: 3mm 4mm !important;
          }
          .signature-line {
            width: 82% !important;
            border-bottom-width: 0.4mm !important;
            margin-bottom: 1.5mm !important;
          }
          .signature-caption {
            font-size: 7.5pt !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl space-y-5 max-h-[94vh] flex flex-col border border-slate-200">
        
        {/* Header Modal UI */}
        <div className="flex items-center justify-between border-b pb-4 shrink-0 no-print">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase bg-sky-100 text-sky-900 px-2.5 py-0.5 rounded flex items-center gap-1">
                <FileCheck2 className="w-3.5 h-3.5 text-sky-700" />
                Documento PS-FOR-DGDC 0003 (Versión 03) • Formato 2 Páginas
              </span>
              <span className="text-[10px] text-slate-500 font-bold">CP: {licitacion.codigoCP}</span>
              {requiereFirmaVicerrectora ? (
                <span className="text-[10px] bg-purple-100 text-purple-900 font-bold px-2 py-0.5 rounded border border-purple-300">
                  Requiere Firma VRAE (&gt; {formatoMonedaCLP(umbralVrae)})
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded border border-emerald-300">
                  Firmas Estándar (Director, Subdirector y Responsable)
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-800 mt-1">
              Acta de Evaluación y Adjudicación Institucional
            </h3>
            <p className="text-xs text-slate-500">{licitacion.codigoProyecto} - {licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Módulo de Selección Directa (UI flotante) */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-xl space-y-2 no-print shrink-0 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              Selección de Empresa Adjudicada:
            </span>
            <span className="text-[11px] text-indigo-300 font-semibold">
              Monto Adjudicado: {formatoMonedaCLP(montoAdjudicadoTotal)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={proveedorSeleccionadoId}
              onChange={e => {
                const proveedorId = e.target.value;
                setProveedorSeleccionadoId(proveedorId);
                setJustificacionEditada(crearTextoAdjudicacion(evaluaciones.find(ev => ev.proveedorId === proveedorId)));
              }}
              className="flex-1 px-3 py-2 bg-white text-slate-900 rounded-lg font-bold text-xs outline-none"
            >
              {evaluaciones.length === 0 ? (
                <option value="">Sin cotizaciones registradas</option>
              ) : (
                evaluaciones.map(e => (
                  <option key={e.proveedorId} value={e.proveedorId}>
                    {e.proveedorNombre} ({e.proveedorRut}) — Total: {formatoMonedaCLP(e.montoTotal)} ({e.puntajeTotalPonderado.toFixed(1)} pts)
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* CUERPO DEL DOCUMENTO (IMPRIMIBLE EN 2 HOJAS) */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 printable-sgc-acta">

          {/* ==================== HOJA 1 / 2 ==================== */}
          <div className="space-y-5 bg-white p-4 rounded-xl border border-slate-300">
            {/* Encabezado Oficial - HOJA 1 */}
            <div className="border border-slate-900 rounded-xl overflow-hidden text-slate-900 bg-white">
              <div className="grid grid-cols-12 border-b border-slate-900 divide-x divide-slate-900">
                <div className="col-span-3 p-3 flex flex-col justify-center items-center bg-slate-50">
                  <div className="font-black text-xs text-sky-900 uppercase text-center leading-tight">
                    {configFirmas.institucion.toUpperCase()}
                  </div>
                </div>
                <div className="col-span-6 p-3 flex flex-col justify-center items-center text-center bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-600 italic">{configFirmas.subdireccion}</span>
                  <h4 className="font-black text-sm text-slate-900 uppercase mt-0.5">
                    CUADRO COMPARATIVO Y ACTA ADJUDICACIÓN
                  </h4>
                </div>
                <div className="col-span-3 p-2 text-[9px] space-y-0.5 bg-slate-50 font-mono text-slate-900">
                  <div><strong>Código:</strong> PS-FOR-DGDC 0003</div>
                  <div><strong>Versión:</strong> 03</div>
                  <div><strong>Fecha vigencia:</strong> 23-08-2024</div>
                  <div><strong>Página:</strong> 1 de 2</div>
                </div>
              </div>

              {/* Fila de Referencia de Identificación */}
              <div className="grid grid-cols-4 p-2.5 bg-slate-100 text-slate-900 font-bold border-b border-slate-900 text-[11px]">
                <div>CP: <span className="font-mono">{licitacion.codigoCP}</span></div>
                <div>OT: <span className="font-mono">{licitacion.codigoOT || 'INF-400_26'}</span></div>
                <div>Fecha: <span className="font-mono">{new Date().toLocaleDateString('es-CL')}</span></div>
                <div>Adjudicado: <span className="font-mono text-emerald-800">{formatoMonedaCLP(montoAdjudicadoTotal)}</span></div>
              </div>

              {/* Fila de Detalle del Proyecto */}
              <div className="p-4 space-y-2 bg-white text-xs text-slate-900">
                <h5 className="font-black text-slate-900 text-xs uppercase tracking-wide">
                  PROYECTO: {licitacion.codigoProyecto} - {licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}
                </h5>
                <div className="space-y-1 text-slate-800 text-[11px]">
                  <div>• <strong>Detalle:</strong> {licitacion.descripcion}</div>
                  <div>• <strong>Proveedor Adjudicado:</strong> <strong className="text-slate-900">{proveedorganador.razonSocial}</strong> (RUT: {proveedorganador.rut})</div>
                  <div>• <strong>Ubicación Específica:</strong> {licitacion.campusSigla || 'Campus San Juan Pablo II'} {licitacion.edificioSigla ? `• ${licitacion.edificioSigla}` : ''}</div>
                  <div>• <strong>Responsable del Proyecto:</strong> {licitacion.responsableNombre || 'David Silva Roco'}</div>
                  <div>• <strong>Motivo de Compra:</strong> {licitacion.descripcion || 'Necesidad de infraestructura institucional'}</div>
                  <div>• <strong>Usuario Solicitante:</strong> {licitacion.uso || 'Facultad de Ingeniería / Dirección de Campos'}</div>
                  <div>• <strong>Precio Adjudicado:</strong> <strong className="text-emerald-700 font-extrabold">{formatoMonedaCLP(montoAdjudicadoTotal)} IVA incluido</strong></div>
                  <div>• <strong>Plazo de Ejecución Adjudicado:</strong> <strong>{plazoAdjudicadoDias ? `${plazoAdjudicadoDias} días corridos` : 'No informado'}</strong></div>
                  <div>• <strong>Centro de Costo (CC):</strong> {licitacion.codigoCP}</div>
                </div>
              </div>
            </div>

            {/* 1. Cuadro Comparativo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase">
                  1. Cuadro Comparativo de Ofertas
                </h4>
                <span className="text-[10px] text-slate-600 font-medium">Ponderaciones: Económica 55% | Técnica 35% | Sustentabilidad 10%</span>
              </div>

              {evaluaciones.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl text-center text-slate-500">
                  Aún no hay ofertas registradas para este proyecto.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-900 rounded-xl">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold">
                        <th className="p-2 border-r border-slate-800">Aspecto a evaluar</th>
                        <th className="p-2 text-center border-r border-slate-800">Medio de verificación</th>
                        <th className="p-2 text-center border-r border-slate-800">Ponderación</th>
                        {evaluaciones.map(ev => (
                          <th key={ev.cotizacionId} colSpan={2} className="p-2 text-center border-r border-slate-800 last:border-0">
                            {ev.proveedorNombre}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-900">
                        <th className="p-1 border-r border-slate-400"></th>
                        <th className="p-1 border-r border-slate-400"></th>
                        <th className="p-1 border-r border-slate-400"></th>
                        {evaluaciones.map(ev => (
                          <React.Fragment key={ev.cotizacionId}>
                            <th className="p-1 text-center border-r border-slate-300 text-[10px]">Pje.</th>
                            <th className="p-1 text-center border-r border-slate-400 text-[10px]">Valor</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300 bg-white">
                      {/* Oferta Económica */}
                      <tr>
                        <td className="p-2 font-semibold text-slate-900 border-r border-slate-300">
                          <strong>Oferta Económica</strong><br />
                          <span className="text-[10px] text-slate-600">Menor precio con impuestos incluidos.</span>
                        </td>
                        <td className="p-2 text-center border-r border-slate-300">Cotización</td>
                        <td className="p-2 text-center font-bold border-r border-slate-300">55%</td>
                        {evaluaciones.map(ev => (
                          <React.Fragment key={ev.cotizacionId}>
                            <td className="p-2 text-center border-r border-slate-200">{ev.puntajeEconomico.toFixed(2)}</td>
                            <td className="p-2 text-center font-bold text-emerald-800 border-r border-slate-300">{formatoMonedaCLP(ev.montoTotal)}</td>
                          </React.Fragment>
                        ))}
                      </tr>

                      {/* Oferta Técnica */}
                      <tr>
                        <td className="p-2 font-semibold text-slate-900 border-r border-slate-300">
                          <strong>Oferta Técnica</strong><br />
                          <span className="text-[10px] text-slate-600">Requerimientos, experiencia y plazo.</span>
                        </td>
                        <td className="p-2 text-center border-r border-slate-300">Referencias y Cotización</td>
                        <td className="p-2 text-center font-bold border-r border-slate-300">35%</td>
                        {evaluaciones.map(ev => (
                          <React.Fragment key={ev.cotizacionId}>
                            <td className="p-2 text-center border-r border-slate-200">{ev.puntajeTecnico.toFixed(2)}</td>
                            <td className="p-2 text-center font-bold text-sky-800 border-r border-slate-300">{ev.plazoDias} días</td>
                          </React.Fragment>
                        ))}
                      </tr>

                      {/* Sustentabilidad */}
                      <tr>
                        <td className="p-2 font-semibold text-slate-900 border-r border-slate-300">
                          <strong>Sustentabilidad</strong><br />
                          <span className="text-[10px] text-slate-600">Prácticas o declaración sustentable.</span>
                        </td>
                        <td className="p-2 text-center border-r border-slate-300">Declaración</td>
                        <td className="p-2 text-center font-bold border-r border-slate-300">10%</td>
                        {evaluaciones.map(ev => (
                          <React.Fragment key={ev.cotizacionId}>
                            <td className="p-2 text-center border-r border-slate-200">{ev.puntajeSustentabilidad.toFixed(2)}</td>
                            <td className="p-2 text-center font-bold text-indigo-800 border-r border-slate-300">
                              {cotizacionPorId.get(ev.cotizacionId)?.declaraSustentabilidad ? 'Declara' : 'No declara'}
                            </td>
                          </React.Fragment>
                        ))}
                      </tr>

                      {/* Totales */}
                      <tr className="bg-slate-100 font-extrabold border-t-2 border-slate-900">
                        <td colSpan={3} className="p-2 text-right border-r border-slate-300 uppercase">Total Costo con IVA incluido</td>
                        {evaluaciones.map(ev => (
                          <td key={ev.cotizacionId} colSpan={2} className="p-2 text-center border-r border-slate-300 text-emerald-800 font-bold">
                            {formatoMonedaCLP(ev.montoTotal)}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-slate-900 text-white font-extrabold">
                        <td colSpan={3} className="p-2 text-right border-r border-slate-800 uppercase">Puntaje Total de Proveedor</td>
                        {evaluaciones.map(ev => (
                          <td key={ev.cotizacionId} colSpan={2} className="p-2 text-center border-r border-slate-800 text-amber-400 text-xs font-black">
                            {ev.puntajeTotalPonderado.toFixed(2)} pts
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pie de Página HOJA 1 */}
            <div className="border-t border-slate-900 pt-2 flex items-center justify-between text-[9px] text-slate-600 font-medium">
              <span>PS-FOR-DGDC 0003 • Dirección de Gestión de Desarrollo de Campus</span>
              <span>Página 1 de 2</span>
            </div>
          </div>

          {/* ==================== HOJA 2 / 2 ==================== */}
          <div className="space-y-5 bg-white p-4 rounded-xl border border-slate-300 page-break">
            
            {/* Encabezado Oficial - HOJA 2 */}
            <div className="border border-slate-900 rounded-xl overflow-hidden text-slate-900 bg-white">
              <div className="grid grid-cols-12 border-b border-slate-900 divide-x divide-slate-900">
                <div className="col-span-3 p-3 flex flex-col justify-center items-center bg-slate-50">
                  <div className="font-black text-xs text-sky-900 uppercase text-center leading-tight">
                    {configFirmas.institucion.toUpperCase()}
                  </div>
                </div>
                <div className="col-span-6 p-3 flex flex-col justify-center items-center text-center bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-600 italic">{configFirmas.subdireccion}</span>
                  <h4 className="font-black text-sm text-slate-900 uppercase mt-0.5">
                    CUADRO COMPARATIVO Y ACTA ADJUDICACIÓN
                  </h4>
                </div>
                <div className="col-span-3 p-2 text-[9px] space-y-0.5 bg-slate-50 font-mono text-slate-900">
                  <div><strong>Código:</strong> PS-FOR-DGDC 0003</div>
                  <div><strong>Versión:</strong> 03</div>
                  <div><strong>Fecha vigencia:</strong> 23-08-2024</div>
                  <div><strong>Página:</strong> 2 de 2</div>
                </div>
              </div>
            </div>

            {/* 2. Acta Adjudicación y Justificación */}
            <div className="space-y-3">
              <h4 className="font-extrabold text-slate-900 text-xs uppercase">
                2. Acta Adjudicación
              </h4>
              <p className="text-[10px] text-slate-600 font-bold">(*) Acta requerida para compras superiores a {formatoMonedaCLP(umbralActa)}.</p>

              <div className="p-3.5 bg-slate-50 border border-slate-900 rounded-xl space-y-2">
                <div className="flex items-center justify-between no-print">
                  <label className="font-bold text-slate-900 text-xs">Texto Oficial del Acta de Adjudicación:</label>
                  <button
                    type="button"
                    onClick={() => setModoEdicion(!modoEdicion)}
                    className="text-[10px] text-indigo-700 font-bold hover:underline flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    {modoEdicion ? 'Bloquear Edición' : 'Editar Texto del Acta'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  disabled={!modoEdicion}
                  value={justificacionEditada}
                  onChange={e => setJustificacionEditada(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none disabled:bg-white disabled:text-slate-900 leading-relaxed font-medium no-print"
                />
                <div className="hidden print:block text-xs font-medium text-slate-900 leading-relaxed whitespace-pre-wrap p-2 border border-slate-300 rounded-lg">
                  {justificacionEditada}
                </div>
              </div>

              <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[9px] leading-relaxed text-slate-700">
                <strong className="text-slate-900">Criterios aplicados:</strong>{' '}
                Oferta económica 55% (menor precio = 100 puntos; restantes: precio menor / precio evaluado × 100);{' '}
                oferta técnica 35% (cumplimiento de requerimientos, experiencia y plazo);{' '}
                sustentabilidad 10% (declaración o compromiso acreditado).
              </div>

              {/* Módulo de Firmas Estándar (3 Firmantes: Director, Subdirector, Responsable) */}
              <div className="space-y-2 pt-2 signature-block">
                <span className="font-bold text-slate-900 text-xs block uppercase">
                  Han actuado como evaluadores de las ofertas las siguientes personas:
                </span>
                
                <div className="border border-slate-900 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse text-xs signature-table">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-900 font-bold text-slate-900">
                        <th className="p-2.5 w-1/2 border-r border-slate-900">Nombre y Cargo del Evaluador</th>
                        <th className="p-2.5 text-center">Firma de Conformidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {/* Firma 1: Director */}
                      <tr className="signature-row">
                        <td className="font-medium signature-identity">
                          <strong className="text-slate-900 block text-xs">{configFirmas.directorGestionCampus.nombre}</strong>
                          <span className="text-slate-600 text-[11px]">{configFirmas.directorGestionCampus.cargo}</span>
                        </td>
                        <td className="p-0 text-center align-middle font-mono text-slate-800">
                          <div className="signature-space">
                            <div className="signature-line"></div>
                            <span className="signature-caption">Firma de conformidad</span>
                          </div>
                        </td>
                      </tr>

                      {/* Firma 2: Subdirector */}
                      <tr className="signature-row">
                        <td className="font-medium signature-identity">
                          <strong className="text-slate-900 block text-xs">{configFirmas.subdirectorInfraestructura.nombre}</strong>
                          <span className="text-slate-600 text-[11px]">{configFirmas.subdirectorInfraestructura.cargo}</span>
                        </td>
                        <td className="p-0 text-center align-middle font-mono text-slate-800">
                          <div className="signature-space">
                            <div className="signature-line"></div>
                            <span className="signature-caption">Firma de conformidad</span>
                          </div>
                        </td>
                      </tr>

                      {/* Firma 3: Responsable del Proyecto */}
                      <tr className="signature-row">
                        <td className="font-medium signature-identity">
                          <strong className="text-slate-900 block text-xs">{licitacion.responsableNombre || configFirmas.responsableDesarrollo.nombre}</strong>
                          <span className="text-slate-600 text-[11px]">{configFirmas.responsableDesarrollo.cargo}</span>
                        </td>
                        <td className="p-0 text-center align-middle font-mono text-slate-800">
                          <div className="signature-space">
                            <div className="signature-line"></div>
                            <span className="signature-caption">Firma de conformidad</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Módulo de Firma Condicional VRAE */}
              <div className="space-y-2 pt-2 signature-block">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 uppercase">
                    <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
                    Aprueba cuadro comparativo y acta de adjudicación:
                  </span>
                  <span className="text-[10px] font-bold text-slate-600">
                    (Completar sólo en el caso de compras superiores a {formatoMonedaCLP(umbralVrae)})
                  </span>
                </div>

                {requiereFirmaVicerrectora ? (
                  <div className="border border-slate-900 rounded-xl overflow-hidden bg-purple-50/40">
                    <table className="w-full text-left border-collapse text-xs signature-table">
                      <thead>
                        <tr className="bg-purple-100 text-purple-950 font-bold border-b border-slate-900">
                          <th className="p-2.5 w-1/2 border-r border-slate-900">Nombre y Cargo Aprobador VRAE</th>
                          <th className="p-2.5 text-center">Firma de Aprobación VRAE</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="signature-row">
                          <td className="font-medium signature-identity">
                            <strong className="text-purple-950 block text-xs">{configFirmas.vicerrectorAdministracion.nombre}</strong>
                            <span className="text-purple-800 text-[11px]">{configFirmas.vicerrectorAdministracion.cargo}</span>
                          </td>
                          <td className="p-0 text-center align-middle">
                            <div className="signature-space">
                              <div className="signature-line !border-purple-900"></div>
                              <span className="signature-caption !text-purple-900">Firma de aprobación</span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-600 italic">
                    El monto adjudicado ({formatoMonedaCLP(montoAdjudicadoTotal)}) es menor o igual a {formatoMonedaCLP(umbralVrae)}. No requiere firma adicional de VRAE.
                  </div>
                )}
              </div>

              {requiereEquipoEvaluador && (
                <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-[10px] text-amber-950 flex items-start gap-2 no-print">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    <strong>Monto adjudicado ({formatoMonedaCLP(montoAdjudicadoTotal)}) ≥ {formatoMonedaCLP(umbralContrato)}:</strong> según el Anexo 1 de la Resolución VRAE 02/2014, este tramo exige Licitación (Privada o Pública) y un equipo evaluador conformado por el Director de Proyecto o Unidad, la VRAE (o quien delegue), un representante VRA cuando la naturaleza de la adquisición lo requiera, y Secretaría General como ministro de fe — además del Contrato formal firmado.
                  </span>
                </div>
              )}

            </div>

            {/* Pie de Página Institucional - HOJA 2 */}
            <div className="border-t-2 border-slate-900 pt-3 grid grid-cols-3 gap-2 text-[10px] text-slate-800 font-semibold">
              <div>Elaborado por: Coordinador(a) de Infraestructura.</div>
              <div>Revisado por: Coordinador(a) de Calidad.</div>
              <div>Aprobado por: Subdirector(a) de Infraestructura.</div>
            </div>

            <div className="flex items-center justify-between text-[9px] text-slate-500 font-medium pt-2">
              <span>PS-FOR-DGDC 0003 • Dirección de Gestión de Desarrollo de Campus</span>
              <span>Página 2 de 2</span>
            </div>
          </div>

        </div>

        {/* Modal Actions Footer (UI) */}
        <div className="flex items-center justify-between pt-4 border-t shrink-0 text-xs no-print">
          <button
            type="button"
            onClick={handleImprimirDocumento}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2"
          >
            <Printer className="w-4 h-4 text-sky-400" />
            <span>Imprimir / Exportar PDF (2 Hojas)</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGuardarActa}
              disabled={isSaving}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl border border-indigo-200 transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Acta'}</span>
            </button>

            {!isAdjudicado && (
              <button
                type="button"
                onClick={handleAprobarYAdjudicar}
                disabled={isAdjudicando}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2"
              >
                <Trophy className="w-4 h-4" />
                <span>{isAdjudicando ? 'Adjudicando…' : 'Aprobar y Emitir Adjudicación'}</span>
              </button>
            )}

            {isFirmada && (
              <button
                type="button"
                onClick={handleEnviarAMarioly}
                disabled={isGeneratingEmail}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 disabled:bg-blue-400"
              >
                {isGeneratingEmail ? <span className="animate-spin text-lg leading-none">↻</span> : <Trophy className="w-4 h-4" />}
                <span>{isGeneratingEmail ? 'Generando...' : 'Generar Solicitud OP (Enviar a Marioly)'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
