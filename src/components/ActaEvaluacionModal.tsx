import React, { useState } from 'react';
import {
  FileCheck2, Trophy, X, Edit3, Save, Printer, ShieldCheck
} from 'lucide-react';
import type { LicitacionProyecto, Cotizacion, Proveedor } from '../types';
import { formatoMonedaCLP, evaluarCotizaciones } from '../services/evaluationEngine';
import { updateLicitacion } from '../services/firestoreService';
import confetti from 'canvas-confetti';

interface ActaEvaluacionModalProps {
  licitacion: LicitacionProyecto;
  cotizaciones: Cotizacion[];
  proveedores: Proveedor[];
  onClose: () => void;
  onAdjudicar: (proveedorId: string, justificacion: string) => void;
}

export const ActaEvaluacionModal: React.FC<ActaEvaluacionModalProps> = ({
  licitacion,
  cotizaciones,
  proveedores,
  onClose,
  onAdjudicar,
}) => {
  const cotizacionesLicitacion = cotizaciones.filter(c => c.licitacionId === licitacion.id);
  const evaluaciones = evaluarCotizaciones(cotizacionesLicitacion);
  const ganadoraDefault = evaluaciones.find(e => e.esPropuestaAdjudicada) || evaluaciones[0];

  const [proveedorSeleccionadoId, setProveedorSeleccionadoId] = useState<string>(
    licitacion.proveedorAdjudicadoId || ganadoraDefault?.proveedorId || ''
  );

  const [justificacionEditada, setJustificacionEditada] = useState<string>(
    licitacion.justificacionAdjudicacion ||
      (ganadoraDefault
        ? `Según análisis comparativo basado en cotizaciones adjuntas, entre las propuestas recibidas todas responden a los requisitos técnicos de obras. Por tanto se adjudica la oferta correspondiente a ${formatoMonedaCLP(ganadoraDefault.montoTotal)} IVA incluido, a la empresa ${ganadoraDefault.proveedorNombre}.`
        : 'Pendiente de recepción de ofertas.')
  );

  const [modoEdicion, setModoEdicion] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const cotizacionGanadoraSel = evaluaciones.find(e => e.proveedorId === proveedorSeleccionadoId) || ganadoraDefault;

  const proveedorganador = proveedores.find(p => p.id === proveedorSeleccionadoId) || {
    razonSocial: cotizacionGanadoraSel?.proveedorNombre || 'Sin Adjudicar',
    rut: cotizacionGanadoraSel?.proveedorRut || 'N/A',
  };

  const montoAdjudicadoTotal = cotizacionGanadoraSel?.montoTotal || licitacion.montoEstimado;
  const requiereFirmaVicerrectora = montoAdjudicadoTotal > 5000001;

  const handleGuardarActa = async () => {
    setIsSaving(true);
    try {
      await updateLicitacion(licitacion.id, {
        proveedorAdjudicadoId: proveedorSeleccionadoId,
        justificacionAdjudicacion: justificacionEditada,
      });
      alert('¡Acta de Evaluación y Adjudicación SGC guardada exitosamente!');
      setModoEdicion(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAprobarYAdjudicar = () => {
    if (!proveedorSeleccionadoId) {
      alert('Seleccione un proveedor para adjudicar.');
      return;
    }
    if (!confirm(`¿Confirmar la Adjudicación Oficial de la Licitación a ${proveedorganador.razonSocial}?`)) return;

    confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.6 },
    });

    onAdjudicar(proveedorSeleccionadoId, justificacionEditada);
    onClose();
  };

  const handleImprimirDocumento = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Estilos CSS para Impresión Oficial en 2 Páginas */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-sgc-acta, .printable-sgc-acta * {
            visibility: visible;
          }
          .printable-sgc-acta {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: white !important;
            color: black !important;
            font-size: 10pt;
          }
          .page-break {
            page-break-before: always;
            break-before: page;
          }
          .no-print {
            display: none !important;
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
                Documento SGC PS-FOR-DGDC 0003 (Versión 03) • Formato 2 Páginas
              </span>
              <span className="text-[10px] text-slate-500 font-bold">CP: {licitacion.codigoCP}</span>
              {requiereFirmaVicerrectora ? (
                <span className="text-[10px] bg-purple-100 text-purple-900 font-bold px-2 py-0.5 rounded border border-purple-300">
                  Requiere Firma VRAE (&gt; $5.000.001)
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded border border-emerald-300">
                  Firmas Estándar (Director, Subdirector y Responsable)
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-800 mt-1">
              Acta de Evaluación y Adjudicación Institucional SGC
            </h3>
            <p className="text-xs text-slate-500">{licitacion.codigoProyecto} - {licitacion.nombreProyecto}</p>
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
              onChange={e => setProveedorSeleccionadoId(e.target.value)}
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

        {/* CUERPO DEL DOCUMENTO SGC (IMPRIMIBLE EN 2 HOJAS) */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 printable-sgc-acta">

          {/* ==================== HOJA 1 / 2 ==================== */}
          <div className="space-y-5 bg-white p-4 rounded-xl border border-slate-300">
            {/* Encabezado Oficial SGC - HOJA 1 */}
            <div className="border border-slate-900 rounded-xl overflow-hidden text-slate-900 bg-white">
              <div className="grid grid-cols-12 border-b border-slate-900 divide-x divide-slate-900">
                <div className="col-span-3 p-3 flex flex-col justify-center items-center bg-slate-50">
                  <div className="font-black text-xs text-sky-900 uppercase text-center leading-tight">
                    UNIVERSIDAD CATÓLICA<br />DE TEMUCO
                  </div>
                </div>
                <div className="col-span-6 p-3 flex flex-col justify-center items-center text-center bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-600 italic">Universidad Católica de Temuco</span>
                  <h4 className="font-black text-sm text-slate-900 uppercase mt-0.5">
                    CUADRO COMPARATIVO Y ACTA ADJUDICACIÓN
                  </h4>
                </div>
                <div className="col-span-3 p-2 text-[9px] space-y-0.5 bg-slate-50 font-mono text-slate-900">
                  <div><strong>Código:</strong> SGC PS-FOR-DGDC 0003</div>
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
                  PROYECTO: {licitacion.codigoProyecto} - {licitacion.nombreProyecto}
                </h5>
                <div className="space-y-1 text-slate-800 text-[11px]">
                  <div>• <strong>Detalle:</strong> {licitacion.descripcion}</div>
                  <div>• <strong>Proveedor Adjudicado:</strong> <strong className="text-slate-900">{proveedorganador.razonSocial}</strong> (RUT: {proveedorganador.rut})</div>
                  <div>• <strong>Ubicación Específica:</strong> {licitacion.campusSigla || 'Campus San Juan Pablo II'} {licitacion.edificioSigla ? `• ${licitacion.edificioSigla}` : ''}</div>
                  <div>• <strong>Responsable del Proyecto:</strong> {licitacion.responsableNombre || 'David Silva Roco'}</div>
                  <div>• <strong>Motivo de Compra:</strong> {licitacion.descripcion || 'Necesidad de infraestructura institucional'}</div>
                  <div>• <strong>Usuario Solicitante:</strong> {licitacion.uso || 'Facultad de Ingeniería / Dirección de Campos'}</div>
                  <div>• <strong>Precio Adjudicado:</strong> <strong className="text-emerald-700 font-extrabold">{formatoMonedaCLP(montoAdjudicadoTotal)} IVA incluido</strong></div>
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
                <span className="text-[10px] text-slate-600 font-medium">Ponderaciones SGC: Económica 55% | Técnica 35% | Sustentabilidad 10%</span>
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
                            <td className="p-2 text-center font-bold text-emerald-800 border-r border-slate-300">{ev.puntajeEconomicoPonderado.toFixed(2)}</td>
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
                            <td className="p-2 text-center font-bold text-sky-800 border-r border-slate-300">{ev.puntajeTecnicoPonderado.toFixed(2)}</td>
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
                            <td className="p-2 text-center font-bold text-indigo-800 border-r border-slate-300">{ev.puntajeSustentabilidadPonderado.toFixed(2)}</td>
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
              <span>SGC PS-FOR-DGDC 0003 • Dirección de Gestión de Desarrollo de Campus</span>
              <span>Página 1 de 2</span>
            </div>
          </div>

          {/* ==================== HOJA 2 / 2 ==================== */}
          <div className="space-y-5 bg-white p-4 rounded-xl border border-slate-300 page-break">
            
            {/* Encabezado Oficial SGC - HOJA 2 */}
            <div className="border border-slate-900 rounded-xl overflow-hidden text-slate-900 bg-white">
              <div className="grid grid-cols-12 border-b border-slate-900 divide-x divide-slate-900">
                <div className="col-span-3 p-3 flex flex-col justify-center items-center bg-slate-50">
                  <div className="font-black text-xs text-sky-900 uppercase text-center leading-tight">
                    UNIVERSIDAD CATÓLICA<br />DE TEMUCO
                  </div>
                </div>
                <div className="col-span-6 p-3 flex flex-col justify-center items-center text-center bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-600 italic">Universidad Católica de Temuco</span>
                  <h4 className="font-black text-sm text-slate-900 uppercase mt-0.5">
                    CUADRO COMPARATIVO Y ACTA ADJUDICACIÓN
                  </h4>
                </div>
                <div className="col-span-3 p-2 text-[9px] space-y-0.5 bg-slate-50 font-mono text-slate-900">
                  <div><strong>Código:</strong> SGC PS-FOR-DGDC 0003</div>
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
              <p className="text-[10px] text-slate-600 font-bold">(*) Completar sólo en el caso de compras superiores a $800.001.</p>

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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none disabled:bg-white disabled:text-slate-900 leading-relaxed font-medium"
                />
              </div>

              {/* Módulo de Firmas Estándar (3 Firmantes: Director, Subdirector, Responsable) */}
              <div className="space-y-2 pt-2">
                <span className="font-bold text-slate-900 text-xs block uppercase">
                  Han actuado como evaluadores de las ofertas las siguientes personas:
                </span>
                
                <div className="border border-slate-900 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-900 font-bold text-slate-900">
                        <th className="p-2.5 w-1/2 border-r border-slate-900">Nombre y Cargo del Evaluador</th>
                        <th className="p-2.5 text-center">Firma de Conformidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {/* Firma 1: Director */}
                      <tr>
                        <td className="p-3 font-medium">
                          <strong className="text-slate-900 block text-xs">Iván Cisternas Cisternas.</strong>
                          <span className="text-slate-600 text-[11px]">Director de Gestión y Desarrollo de Campus</span>
                        </td>
                        <td className="p-3 text-center align-middle font-mono text-slate-400">
                          <div className="border-b border-dashed border-slate-400 w-48 mx-auto mb-1"></div>
                          <span className="text-[10px]">Director de Gestión y Desarrollo de Campus</span>
                        </td>
                      </tr>

                      {/* Firma 2: Subdirector */}
                      <tr>
                        <td className="p-3 font-medium">
                          <strong className="text-slate-900 block text-xs">Felipe Anselme Grandón.</strong>
                          <span className="text-slate-600 text-[11px]">Sub-Director de Infraestructura</span>
                        </td>
                        <td className="p-3 text-center align-middle font-mono text-slate-400">
                          <div className="border-b border-dashed border-slate-400 w-48 mx-auto mb-1"></div>
                          <span className="text-[10px]">Sub-Director de Infraestructura</span>
                        </td>
                      </tr>

                      {/* Firma 3: Responsable del Proyecto */}
                      <tr>
                        <td className="p-3 font-medium">
                          <strong className="text-slate-900 block text-xs">{licitacion.responsableNombre || 'David Silva Roco'}</strong>
                          <span className="text-slate-600 text-[11px]">Desarrollo Infraestructura / Responsable de Obra</span>
                        </td>
                        <td className="p-3 text-center align-middle font-mono text-slate-400">
                          <div className="border-b border-dashed border-slate-400 w-48 mx-auto mb-1"></div>
                          <span className="text-[10px]">Responsable del Proyecto</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Módulo de Firma Condicional VRAE (> $5.000.001 CLP) */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 uppercase">
                    <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
                    Aprueba cuadro comparativo y acta de adjudicación:
                  </span>
                  <span className="text-[10px] font-bold text-slate-600">
                    (Completar sólo en el caso de compras superiores a $5.000.001)
                  </span>
                </div>

                {requiereFirmaVicerrectora ? (
                  <div className="border border-slate-900 rounded-xl overflow-hidden bg-purple-50/40">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-purple-100 text-purple-950 font-bold border-b border-slate-900">
                          <th className="p-2.5 w-1/2 border-r border-slate-900">Nombre y Cargo Aprobador VRAE</th>
                          <th className="p-2.5 text-center">Firma de Aprobación VRAE</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-3 font-medium">
                            <strong className="text-purple-950 block text-xs">Alejandra Espinoza Cid</strong>
                            <span className="text-purple-800 text-[11px]">Vicerrectora de Administración y Asuntos Económicos (VRAE)</span>
                          </td>
                          <td className="p-3 text-center align-middle">
                            <div className="border-b border-dashed border-purple-500 w-48 mx-auto mb-1"></div>
                            <span className="text-[10px] text-purple-800 font-semibold">Vicerrectora de Administración y Asuntos Económicos</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-600 italic">
                    El monto adjudicado ({formatoMonedaCLP(montoAdjudicadoTotal)}) es menor o igual a $5.000.001 CLP. No requiere firma adicional de la Vicerrectora de Administración.
                  </div>
                )}
              </div>

            </div>

            {/* Pie de Página Institucional - HOJA 2 */}
            <div className="border-t-2 border-slate-900 pt-3 grid grid-cols-3 gap-2 text-[10px] text-slate-800 font-semibold">
              <div>Elaborado por: Coordinador(a) de Infraestructura.</div>
              <div>Revisado por: Coordinador(a) de Calidad.</div>
              <div>Aprobado por: Subdirector(a) de Infraestructura.</div>
            </div>

            <div className="flex items-center justify-between text-[9px] text-slate-500 font-medium pt-2">
              <span>SGC PS-FOR-DGDC 0003 • Dirección de Gestión de Desarrollo de Campus</span>
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

            <button
              type="button"
              onClick={handleAprobarYAdjudicar}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2"
            >
              <Trophy className="w-4 h-4" />
              <span>Aprobar y Emitir Adjudicación</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
