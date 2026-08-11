import React, { useState } from 'react';
import {
  FileText, FileCheck2, Scale, ChevronRight
} from 'lucide-react';

export interface WorkflowStep {
  id: number;
  nombre: string;
  rol: string;
  rolColor: string;
  descripcion: string;
  documentos?: string[];
  decision?: string;
  aprobadoNext: number;
  rechazadoNext?: number;
}

export const SGC_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 1,
    nombre: 'Levantar requerimiento de licitación',
    rol: 'Subdirector(a) de Gestión de Campus',
    rolColor: 'bg-indigo-600 text-white',
    descripcion: 'Identificación de necesidades de la comunidad universitaria y normativas asociadas.',
    aprobadoNext: 3,
  },
  {
    id: 3,
    nombre: 'Establecer / revisar / actualizar bases técnicas y administrativas',
    rol: 'Coordinador(a) de Calidad',
    rolColor: 'bg-emerald-600 text-white',
    descripcion: 'Redacción de bases técnicas con calendario de actividades, bases administrativas y anexos del servicio.',
    documentos: ['Bases Administrativas', 'Bases Técnicas', 'Anexos del Servicio'],
    aprobadoNext: 4,
  },
  {
    id: 4,
    nombre: 'Revisar bases técnicas y administrativas para licitación',
    rol: 'Secretario(a) General',
    rolColor: 'bg-amber-600 text-white',
    descripcion: 'Revisión de pertinencia legal de las bases redactadas.',
    decision: '¿Aprueba bases técnicas y administrativas para licitación?',
    aprobadoNext: 2,
    rechazadoNext: 1,
  },
  {
    id: 2,
    nombre: 'Buscar potenciales oferentes',
    rol: 'Coordinador(a) a Cargo de Servicio',
    rolColor: 'bg-sky-600 text-white',
    descripcion: 'Búsqueda e identificación de proveedores habilitados en el rubro.',
    aprobadoNext: 5,
  },
  {
    id: 5,
    nombre: 'Convocar a oferentes a postular',
    rol: 'Coordinador(a) a Cargo de Servicio',
    rolColor: 'bg-sky-600 text-white',
    descripcion: 'Invitación a mínimo 3 empresas por plataforma interna o correo electrónico.',
    aprobadoNext: 6,
  },
  {
    id: 6,
    nombre: 'Recepcionar propuestas de oferente',
    rol: 'Coordinador(a) a Cargo de Servicio',
    rolColor: 'bg-sky-600 text-white',
    descripcion: 'Recepción formal de propuestas (monto, plazo, sustentabilidad y archivos Excel/PDF).',
    documentos: ['Propuestas Oferentes'],
    aprobadoNext: 7,
  },
  {
    id: 7,
    nombre: 'Evaluar las ofertas según criterios establecidos en las bases',
    rol: 'Comisión Evaluadora',
    rolColor: 'bg-purple-600 text-white',
    descripcion: 'Evaluación de propuesta técnica, económica, plazo y experiencia.',
    documentos: ['Acta de Evaluación de Ofertas'],
    aprobadoNext: 8,
  },
  {
    id: 8,
    nombre: 'Presentar propuesta de proveedores evaluados',
    rol: 'Comisión Evaluadora',
    rolColor: 'bg-purple-600 text-white',
    descripcion: 'Envío del informe y acta de evaluación a la Vicerrectoría (VRAE).',
    aprobadoNext: 9,
  },
  {
    id: 9,
    nombre: 'Revisar acta de evaluación y adjudicación del servicio',
    rol: 'VRAE',
    rolColor: 'bg-rose-600 text-white',
    descripcion: 'Revisión final y aprobación por la Vicerrectoría de Administración y Asuntos Económicos.',
    decision: '¿Aprueba adjudicación del servicio?',
    documentos: ['Resolución VRAE'],
    aprobadoNext: 11,
    rechazadoNext: 10,
  },
  {
    id: 10,
    nombre: 'Subsanar observaciones de adjudicación',
    rol: 'Comisión Evaluadora',
    rolColor: 'bg-purple-600 text-white',
    descripcion: 'Corrección y aclaración de observaciones indicadas por VRAE.',
    aprobadoNext: 9,
  },
  {
    id: 11,
    nombre: 'Comunicar los resultados a oferentes',
    rol: 'Coordinador(a) a Cargo de Servicio',
    rolColor: 'bg-sky-600 text-white',
    descripcion: 'Notificación oficial de adjudicación o desestimación a las empresas convocadas.',
    aprobadoNext: 12,
  },
  {
    id: 12,
    nombre: 'Elaboración del contrato',
    rol: 'Coordinador(a) de Calidad',
    rolColor: 'bg-emerald-600 text-white',
    descripcion: 'Redacción del contrato de servicio externo. Revisión interna con Subdirector de Campus.',
    aprobadoNext: 13,
  },
  {
    id: 13,
    nombre: 'Revisión de contrato de servicio',
    rol: 'Secretario(a) General',
    rolColor: 'bg-amber-600 text-white',
    descripcion: 'Revisión de pertinencias legales de las cláusulas contractuales.',
    decision: '¿Aprueba contrato de servicio?',
    aprobadoNext: 14,
    rechazadoNext: 12,
  },
  {
    id: 14,
    nombre: 'Tramitar firmas de contrato',
    rol: 'Coordinador(a) de Calidad',
    rolColor: 'bg-emerald-600 text-white',
    descripcion: 'Firma de la Universidad y el representante legal del proveedor adjudicado.',
    documentos: ['Contrato de Servicio Externo Firmado'],
    aprobadoNext: 15,
  },
  {
    id: 15,
    nombre: 'Enviar contrato firmado a partes e ingresar a LMD',
    rol: 'Coordinador(a) de Calidad',
    rolColor: 'bg-emerald-600 text-white',
    descripcion: 'Distribución final del contrato y archivo institucional según LMD.',
    aprobadoNext: 15,
  },
];

interface SgcProcessWorkflowProps {
  pasoActualId?: number;
}

export const SgcProcessWorkflow: React.FC<SgcProcessWorkflowProps> = ({ pasoActualId = 1 }) => {
  const [selectedStep, setSelectedStep] = useState<WorkflowStep>(
    SGC_WORKFLOW_STEPS.find(s => s.id === pasoActualId) || SGC_WORKFLOW_STEPS[0]
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-300 font-mono text-xs px-2.5 py-1 rounded-md border border-indigo-500/30">
              SGC PS-DF-DGDC 0021
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-1 rounded-md font-semibold border border-emerald-500/30">
              Versión 00 (Vigencia 02/04/2025)
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-2">
            Procedimiento Oficial de Licitación de Servicios Externos UCT
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl">
            Diagrama de flujo del Sistema de Gestión de Calidad (SGC) de la Subdirección de Infraestructura - Dirección de Gestión y Desarrollo de Campus.
          </p>
        </div>
      </div>

      {/* Grid: Process Steps List & Step Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step Selector List */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800 border-b pb-2 flex items-center justify-between">
            <span>Flujo del Proceso SGC (15 Pasos)</span>
            <span className="text-xs text-slate-400 font-normal">Haga clic en un paso para ver detalles</span>
          </h3>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {SGC_WORKFLOW_STEPS.map(step => {
              const isSelected = selectedStep.id === step.id;
              const isCurrent = step.id === pasoActualId;

              return (
                <div
                  key={step.id}
                  onClick={() => setSelectedStep(step)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-500'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isCurrent ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {step.id}
                    </span>
                    <div>
                      <h4 className="font-semibold text-xs text-slate-800">{step.nombre}</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold mt-1 inline-block ${step.rolColor}`}>
                        {step.rol}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {step.decision && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-200">
                        Aprobación Legal / VRAE
                      </span>
                    )}
                    <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Step Inspector */}
        <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-lg space-y-5 h-fit sticky top-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-mono text-indigo-400">PASO {selectedStep.id} DE 15</span>
            <span className={`text-[11px] px-2.5 py-1 rounded-md font-bold ${selectedStep.rolColor}`}>
              {selectedStep.rol}
            </span>
          </div>

          <div>
            <h3 className="text-base font-bold text-white mb-2">{selectedStep.nombre}</h3>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
              {selectedStep.descripcion}
            </p>
          </div>

          {selectedStep.documentos && selectedStep.documentos.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                Documentos Salida / Anexos SGC:
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedStep.documentos.map(doc => (
                  <span key={doc} className="bg-indigo-950 text-indigo-200 border border-indigo-800/60 px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1">
                    <FileCheck2 className="w-3 h-3 text-indigo-400" />
                    {doc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedStep.decision && (
            <div className="bg-amber-950/40 border border-amber-800/60 p-3.5 rounded-xl space-y-2">
              <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                Punto de Decisión / Aprobación:
              </h4>
              <p className="text-xs text-amber-200 font-semibold">{selectedStep.decision}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-1 rounded text-center font-bold">
                  SI → Paso {selectedStep.aprobadoNext}
                </span>
                <span className="bg-rose-950 text-rose-300 border border-rose-800 px-2 py-1 rounded text-center font-bold">
                  NO → Paso {selectedStep.rechazadoNext}
                </span>
              </div>
            </div>
          )}

          <div className="border-t border-slate-800 pt-4 flex justify-between items-center text-xs text-slate-400">
            <span>Subdirección de Infraestructura</span>
            <span>SGC PS-DF-DGDC 0021</span>
          </div>
        </div>
      </div>
    </div>
  );
};
