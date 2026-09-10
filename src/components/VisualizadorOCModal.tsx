import React from 'react';
import { X, Printer, Download, ExternalLink, FileText, ShieldCheck, Building, Calendar, DollarSign } from 'lucide-react';
import type { ProyectoMaestro, LicitacionProyecto } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { formatearRut } from '../utils/rutUtils';

interface VisualizadorOCModalProps {
  proyecto: ProyectoMaestro | LicitacionProyecto;
  onClose: () => void;
}

export const VisualizadorOCModal: React.FC<VisualizadorOCModalProps> = ({
  proyecto,
  onClose,
}) => {
  const ocNumero = proyecto.ordenCompraNumero || (proyecto as any).codigoOC || 'OC-SIN-NUMERO';
  const nombreProyecto = ('nombreProyecto' in proyecto ? proyecto.nombreProyecto : proyecto.nombre) || 'PROYECTO SIN NOMBRE';
  const codigoCP = proyecto.codigoCP || '409-1722';
  const codigoProyecto = ('codigoProyecto' in proyecto ? proyecto.codigoProyecto : '') || '2026_001';
  const codigoOT = proyecto.codigoOT || ('ordenTrabajoNumero' in proyecto ? (proyecto as any).ordenTrabajoNumero : '') || 'OT-2026-001';
  const codigoOP = proyecto.codigoOP || ('ordenPedidoNumero' in proyecto ? (proyecto as any).ordenPedidoNumero : '') || 'OP-2026-001';
  
  const montoTotal = ('montoAdjudicado' in proyecto && proyecto.montoAdjudicado && proyecto.montoAdjudicado > 0)
    ? proyecto.montoAdjudicado
    : ('montoAdjudicadoTotal' in proyecto && proyecto.montoAdjudicadoTotal && proyecto.montoAdjudicadoTotal > 0)
    ? proyecto.montoAdjudicadoTotal
    : ('valorAprox' in proyecto ? proyecto.valorAprox : proyecto.montoEstimado) || 0;

  const montoNeto = Math.round(montoTotal / 1.19);
  const montoIva = montoTotal - montoNeto;

  const proveedorNombre = proyecto.proveedorAdjudicadoNombre || (proyecto as any).proveedorGanadorNombre || 'PROVEEDOR ADJUDICADO SGC';
  const proveedorRut = proyecto.proveedorAdjudicadoRut || '76.123.456-7';
  const campus = proyecto.campusSigla || 'CJP';
  const edificio = proyecto.edificioSigla || '01';
  const responsable = proyecto.responsableNombre || 'David Silva Roco';
  const fechaEmision = proyecto.fechaCargaOC || new Date().toLocaleDateString('es-CL');

  const archivoURL = proyecto.archivoOCURL;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 text-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-700 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* TOP BAR / CONTROL WINDOW HEADER */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white font-mono">{ocNumero}</span>
                <span className="text-[10px] font-bold bg-purple-900/80 text-purple-200 px-2 py-0.5 rounded border border-purple-600">
                  Documento Oficial PDF / OC
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md mt-0.5">
                {nombreProyecto.toUpperCase()}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {archivoURL && (
              <>
                <button
                  type="button"
                  onClick={() => window.open(archivoURL, '_blank')}
                  className="hidden sm:flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition border border-slate-700"
                  title="Abrir PDF original en pestaña nueva"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Original</span>
                </button>
                <a
                  href={archivoURL}
                  download={`${ocNumero}.pdf`}
                  className="hidden sm:flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition border border-slate-700"
                  title="Descargar el archivo original"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar</span>
                </a>
              </>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm"
              title="Imprimir o Guardar como PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition ml-1"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DOCUMENT VIEWER BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/90 space-y-4">
          
          {/* If there is a direct PDF iframe URL */}
          {archivoURL && (archivoURL.endsWith('.pdf') || archivoURL.includes('drive.google.com')) ? (
            <div className="w-full h-[70vh] bg-white rounded-xl overflow-hidden shadow-inner border border-slate-700">
              <iframe
                src={archivoURL}
                title={`Orden de Compra ${ocNumero}`}
                className="w-full h-full border-0"
              />
            </div>
          ) : (
            /* OFFICIAL PDF TEMPLATE PREVIEW (DOCUMENTO DE ORDEN DE COMPRA) */
            <div className="bg-white text-slate-900 rounded-xl p-6 sm:p-8 shadow-2xl border border-slate-300 space-y-6 max-w-3xl mx-auto caratula-print font-sans">
              
              {/* Document Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-slate-900 pb-4 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Building className="w-6 h-6 text-indigo-900" />
                    <span className="font-black text-sm tracking-tight text-indigo-950 uppercase">
                      UNIVERSIDAD CATÓLICA DE TEMUCO
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                    SUBDIRECCIÓN DE INFRAESTRUCTURA • GESTIÓN DE OBRAS CIVILES
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">RUT: 81.678.900-K • Manuel Montt 56, Temuco</p>
                </div>

                <div className="bg-slate-900 text-white p-3.5 rounded-xl text-center space-y-1 border border-slate-800 shrink-0">
                  <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest block font-mono">
                    DOCUMENTO OFICIAL SGC
                  </span>
                  <h2 className="text-lg font-black text-white font-mono tracking-wider">
                    ORDEN DE COMPRA
                  </h2>
                  <span className="inline-block bg-purple-600 text-white font-mono text-xs font-black px-2.5 py-0.5 rounded">
                    N° {ocNumero}
                  </span>
                </div>
              </div>

              {/* Informative Note */}
              <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg flex items-center justify-between text-xs text-purple-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>
                    <strong>Orden de Compra emitida y validada</strong> por la Subdirección de Infraestructura UCT.
                  </span>
                </div>
                <span className="text-[10px] font-bold font-mono text-purple-700 bg-white px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Fecha: {fechaEmision}
                </span>
              </div>

              {/* Grid 2 Columnas: Datos del Proveedor y Datos de Imputación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                
                {/* Datos Proveedor */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-black uppercase text-indigo-900 tracking-wider block border-b border-slate-200 pb-1">
                    1. DATOS DEL PROVEEDOR ADJUDICADO
                  </span>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block">Razón Social:</span>
                    <strong className="text-slate-900 font-extrabold text-xs block uppercase">{proveedorNombre}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block">RUT Contratista:</span>
                    <span className="font-bold text-slate-800 font-mono text-xs">{formatearRut(proveedorRut)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block">Condición de Pago:</span>
                    <span className="font-semibold text-slate-700">Transferencia Electrónica Factura a 30 Días</span>
                  </div>
                </div>

                {/* Datos de Imputación / Obra */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 font-mono">
                  <span className="text-[10px] font-black uppercase text-indigo-900 tracking-wider block border-b border-slate-200 pb-1 font-sans">
                    2. IMPUTACIÓN PRESUPUESTARIA & UBICACIÓN
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold font-sans block">Centro Costo (CP):</span>
                      <strong className="text-indigo-900 text-xs block">{codigoCP}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold font-sans block">Cód. Proyecto:</span>
                      <strong className="text-sky-700 text-xs block">{codigoProyecto}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold font-sans block">Orden Trabajo (OT):</span>
                      <span className="text-slate-800 text-xs block">{codigoOT}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold font-sans block">Orden Pedido (OP):</span>
                      <span className="text-slate-800 text-xs block">{codigoOP}</span>
                    </div>
                  </div>
                  <div className="font-sans border-t border-slate-200 pt-1.5">
                    <span className="text-[10px] text-slate-500 font-bold block">Ubicación Obra:</span>
                    <span className="font-bold text-slate-800 text-[11px]">Campus {campus} • Edificio {edificio}</span>
                  </div>
                </div>

              </div>

              {/* Detalle de Partidas / Trabajo Solicitado */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-indigo-900 tracking-wider block">
                  3. DETALLE DE TRABAJOS Y ESPECIFICACIONES CONTRATADAS
                </span>

                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px]">
                        <th className="p-2.5">Item / Descripción de la Obra</th>
                        <th className="p-2.5 text-center w-16">Cant.</th>
                        <th className="p-2.5 text-center w-16">Unid.</th>
                        <th className="p-2.5 text-right w-28">Precio Unit.</th>
                        <th className="p-2.5 text-right w-32">Total Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="p-3">
                          <strong className="text-slate-900 block text-xs uppercase">{nombreProyecto}</strong>
                          <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-2">
                            {('descripcion' in proyecto ? proyecto.descripcion : '') || 'Ejecución de obras de remodelación e infraestructura según EETT y oferta adjudicada SGC.'}
                          </p>
                          <span className="text-[10px] text-indigo-700 font-semibold mt-1 block">
                            Responsable de Inspección Técnica: {responsable}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold">1</td>
                        <td className="p-3 text-center font-semibold">GL</td>
                        <td className="p-3 text-right font-medium">{formatoMonedaCLP(montoNeto)}</td>
                        <td className="p-3 text-right font-extrabold text-slate-900">{formatoMonedaCLP(montoNeto)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totales Financieros */}
              <div className="flex justify-end pt-2">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 w-full sm:w-72 space-y-1.5 text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-[10px] font-sans font-bold text-slate-500 uppercase pb-1 border-b border-slate-200">
                    <DollarSign className="w-3 h-3" /> Resumen Financiero
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal Neto:</span>
                    <span className="font-bold">{formatoMonedaCLP(montoNeto)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IVA (19%):</span>
                    <span className="font-bold">{formatoMonedaCLP(montoIva)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-300 pt-2">
                    <span>TOTAL OC:</span>
                    <span className="text-purple-900 font-extrabold">{formatoMonedaCLP(montoTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Firmas SGC */}
              <div className="pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="space-y-1">
                  <div className="h-12 flex items-end justify-center">
                    <span className="font-script text-indigo-900 text-lg italic opacity-80">{responsable}</span>
                  </div>
                  <div className="border-t border-slate-400 pt-1">
                    <strong className="block text-slate-900 text-xs">{responsable}</strong>
                    <span className="text-[10px] text-slate-500 block">Responsable de Infraestructura UCT</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="h-12"></div>
                  <div className="border-t border-slate-400 pt-1">
                    <strong className="block text-slate-400 text-xs">&nbsp;</strong>
                    <span className="text-[10px] text-slate-500 block">Subdirección de Infraestructura UCT</span>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
};
