import type { LicitacionProyecto, ProyectoMaestro } from '../types';
import { licitacionCerradaParaOfertas } from '../services/firestoreService';
import { esProcesoSimplificado } from '../data/contratoTemplateData';

export type EstadoCheck = 'ok' | 'falta' | 'na';

export interface ChecklistItem {
  id: string;
  etiqueta: string;
  estado: EstadoCheck;
  detalle?: string;
}

export interface AuditoriaLicitacion {
  licitacion: LicitacionProyecto;
  checks: ChecklistItem[];
  pctCompletitud: number; // sobre los checks aplicables (no incluye los 'na')
}

function esAdjudicada(l: LicitacionProyecto): boolean {
  return licitacionCerradaParaOfertas(l);
}

function obraFinalizadaOEnRecepcion(l: LicitacionProyecto): boolean {
  return l.estadoLifecycle === 'Finalizado' || l.estadoLifecycle === 'Recepcion_Solicitada' || Boolean(l.recepcionConforme?.solicitada);
}

/**
 * Expediente de auditoría por licitación: los checks que no aplican todavía
 * según la etapa del proceso se marcan 'na' (no cuentan como falla), para no
 * penalizar una licitación que legítimamente aún no llega a esa etapa.
 */
export function auditarLicitacion(l: LicitacionProyecto, cantidadOfertas: number, proyectoVinculado?: ProyectoMaestro): AuditoriaLicitacion {
  const adjudicada = esAdjudicada(l);
  const enRecepcionOFinalizada = obraFinalizadaOEnRecepcion(l);
  // Proceso simplificado (Comparación de Precios, bajo el umbral de Licitación formal): no exige
  // Bases aprobadas ni un mínimo de invitados, así que esos checks no aplican ('na').
  const simplificado = esProcesoSimplificado(l.montoEstimado);

  const checks: ChecklistItem[] = [
    {
      id: 'bases',
      etiqueta: 'Bases aprobadas',
      estado: simplificado ? 'na' : proyectoVinculado?.bases
        ? (proyectoVinculado.bases.estado === 'Aprobada' ? 'ok' : 'falta')
        : 'falta',
      detalle: simplificado ? 'No aplica: proceso simplificado (Comparación de Precios)' : proyectoVinculado?.bases ? `Estado: ${proyectoVinculado.bases.estado}` : 'Sin bases generadas en el proyecto vinculado',
    },
    {
      id: 'invitados',
      etiqueta: '≥ 3 proveedores invitados',
      estado: simplificado ? 'na' : (l.proveedoresInvitadosIds?.length || 0) >= 3 ? 'ok' : 'falta',
      detalle: simplificado ? 'No aplica: proceso simplificado (Comparación de Precios)' : `${l.proveedoresInvitadosIds?.length || 0} invitado(s)`,
    },
    {
      id: 'ofertas',
      etiqueta: 'Ofertas recibidas',
      estado: cantidadOfertas > 0 ? 'ok' : 'falta',
      detalle: `${cantidadOfertas} oferta(s)`,
    },
    {
      id: 'acta_adjudicacion',
      etiqueta: 'Acta de Adjudicación firmada',
      estado: !adjudicada ? 'na' : (l.actaFirmaDigital?.estado === 'Firmada' ? 'ok' : 'falta'),
    },
    {
      id: 'oc',
      etiqueta: 'Orden de Compra emitida',
      estado: !adjudicada ? 'na' : (l.ordenCompraNumero ? 'ok' : 'falta'),
    },
    {
      id: 'recepcion_conforme',
      etiqueta: 'Recepción Conforme aprobada',
      estado: !enRecepcionOFinalizada ? 'na' : (l.recepcionConforme?.aprobada ? 'ok' : 'falta'),
    },
    {
      id: 'acta_recepcion',
      etiqueta: 'Acta de Recepción firmada',
      estado: !l.recepcionConforme?.aprobada ? 'na' : (
        l.actaRecepcionFirmaInterna?.estado === 'Firmada' || l.actaRecepcionAdobe?.status === 'SIGNED' || l.actaRecepcionAdobe?.status === 'APPROVED'
          ? 'ok' : 'falta'
      ),
    },
  ];

  const aplicables = checks.filter(c => c.estado !== 'na');
  const ok = aplicables.filter(c => c.estado === 'ok').length;
  const pctCompletitud = aplicables.length ? Math.round((ok / aplicables.length) * 100) : 100;

  return { licitacion: l, checks, pctCompletitud };
}
