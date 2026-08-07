import React from 'react';
import type { LicitacionProyecto, Cotizacion, ConfiguracionFirmas } from '../types';
import { evaluarCotizaciones } from '../services/evaluationEngine';
import { generarDocumentoCuadroComparativoActa } from '../services/docxGenerator';
import { generarPlantillaCotizacionExcel } from '../services/templateGenerator';
import { FileText, Download, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import { formatoMonedaCLP } from '../services/evaluationEngine';

interface DocumentGeneratorProps {
  licitacion: LicitacionProyecto | null;
  cotizaciones: Cotizacion[];
  configFirmas: ConfiguracionFirmas;
}

export const DocumentGenerator: React.FC<DocumentGeneratorProps> = ({
  licitacion,
  cotizaciones,
  configFirmas,
}) => {
  if (!licitacion) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No hay ninguna Licitación o Proyecto Seleccionado</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Seleccione un proyecto en la pestaña "Proyectos & Licitaciones" para generar los documentos oficiales.
        </p>
      </div>
    );
  }

  const cotizacionesProyecto = cotizaciones.filter(c => c.licitacionId === licitacion.id);
  const evaluaciones = evaluarCotizaciones(cotizacionesProyecto);
  const adjudicado = evaluaciones.find(e => e.esPropuestaAdjudicada) || evaluaciones[0];

  const requiereActa = (adjudicado?.montoTotal || 0) > 800001;
  const requiereVicerrector = (adjudicado?.montoTotal || 0) > 500001;

  const handleDescargarCuadroYActaDocx = () => {
    generarDocumentoCuadroComparativoActa(licitacion, cotizacionesProyecto, evaluaciones, configFirmas);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-sky-600" />
            <span>Generador de Documentos Oficiales SGC</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Genere los archivos finales en formato Word (.docx) formateados según el Sistema de Gestión de Calidad institucional.
          </p>
        </div>

        <button
          onClick={() => generarPlantillaCotizacionExcel(licitacion)}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm transition text-xs"
        >
          <Download className="w-4 h-4" />
          <span>Descargar Plantilla Cotización Excel</span>
        </button>
      </div>

      {/* Grid of Documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Document 1: SGC PS-FOR-DGDC0003 Cuadro Comparativo y Acta */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between space-y-4 hover:shadow-md transition">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold bg-sky-100 text-sky-800 px-2.5 py-0.5 rounded border border-sky-200">
                SGC PS-FOR-DGDC0003
              </span>
              <span className="text-[10px] font-semibold text-slate-400">Formato Word Oficial</span>
            </div>

            <h3 className="text-base font-bold text-slate-800">
              Cuadro Comparativo y Acta de Adjudicación
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Documento oficial que incluye el desglose de ponderaciones (55% Económico, 35% Técnico, 10% Sustentabilidad), el ranking de ofertas y el texto resolutivo de adjudicación con los firmantes requeridos.
            </p>

            {/* Document specs checklist */}
            <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-xs border border-slate-200">
              <div className="flex items-center justify-between text-slate-700">
                <span>Evaluadores (Director, Subdirector, Resp.):</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span>Firma Vicerrector AAE (&gt;$5.000.001):</span>
                {requiereVicerrector ? (
                  <span className="text-purple-700 font-bold bg-purple-100 px-2 py-0.5 rounded text-[10px]">
                    Requerida ({formatoMonedaCLP(adjudicado?.montoTotal || 0)})
                  </span>
                ) : (
                  <span className="text-slate-400 text-[10px]">No requerida</span>
                )}
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span>Acta de Adjudicación (&gt;$800.001):</span>
                {requiereActa ? (
                  <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded text-[10px]">
                    Requerida
                  </span>
                ) : (
                  <span className="text-slate-400 text-[10px]">Compra Menor</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleDescargarCuadroYActaDocx}
            disabled={cotizacionesProyecto.length === 0}
            className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition ${
              cotizacionesProyecto.length > 0
                ? 'bg-sky-600 hover:bg-sky-700 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Descargar Cuadro Comparativo y Acta (.docx)</span>
          </button>
        </div>

        {/* Document 2: Plantilla Excel Proveedores */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between space-y-4 hover:shadow-md transition">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded border border-emerald-200">
                Plantilla Estandarizada
              </span>
              <span className="text-[10px] font-semibold text-slate-400">Formato Excel (.xlsx)</span>
            </div>

            <h3 className="text-base font-bold text-slate-800">
              Formulario Estándar de Cotización para Proveedores
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Archivo Excel con estructura validada que la Subdirección de Infraestructura entrega a los proveedores. Contiene la hoja de cotización y la pestaña de instrucciones.
            </p>

            <div className="bg-emerald-50/50 p-4 rounded-xl space-y-2 text-xs border border-emerald-100 text-emerald-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Campos bloqueados y estructurados para lectura sin errores.</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Desglose de partidas de obra y parámetros de sustentabilidad.</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => generarPlantillaCotizacionExcel(licitacion)}
            className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Plantilla Oficial Proveedores (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Summary Box: Firmantes Institucionales Configurados */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <ShieldCheck className="w-4 h-4 text-sky-400" />
          <span>Firmantes Configurados en las Actas</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Evaluador 1</span>
            <div className="font-bold text-white mt-1">{configFirmas.directorGestionCampus.nombre}</div>
            <div className="text-[11px] text-slate-400">{configFirmas.directorGestionCampus.cargo}</div>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Evaluador 2</span>
            <div className="font-bold text-white mt-1">{configFirmas.subdirectorInfraestructura.nombre}</div>
            <div className="text-[11px] text-slate-400">{configFirmas.subdirectorInfraestructura.cargo}</div>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <span className="text-[10px] text-purple-300 block font-semibold uppercase">Aprueba (Vicerrectoría)</span>
            <div className="font-bold text-white mt-1">{configFirmas.vicerrectorAdministracion.nombre}</div>
            <div className="text-[11px] text-slate-400">{configFirmas.vicerrectorAdministracion.cargo}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
