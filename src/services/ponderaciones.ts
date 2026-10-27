// De dónde salen las ponderaciones con que se evalúan las ofertas de una licitación.
//
// Se configuran en Configuración → Parámetros SGC. Al invitar a los proveedores, la licitación guarda las vigentes
// en ese momento (`licitacion.ponderaciones`): así un cambio posterior en la configuración no altera las reglas de
// un proceso ya convocado, y el portal de proveedores (que no puede leer la configuración interna) muestra las mismas.

import type { LicitacionProyecto } from '../types';
import { storageService } from './storageService';
import { ponderacionesDe, PONDERACIONES_POR_DEFECTO, type Ponderaciones } from './evaluationEngine';

/** Ponderaciones de la configuración actual (o las de por defecto si no suman 100). */
export function ponderacionesVigentes(): Ponderaciones {
  try {
    return ponderacionesDe(storageService.getConfigFirmas().parametrosSgc);
  } catch {
    return PONDERACIONES_POR_DEFECTO;
  }
}

/** Las de la licitación si ya invitó (quedaron fijas), o las vigentes si todavía no. */
export function ponderacionesDeLicitacion(licitacion?: Pick<LicitacionProyecto, 'ponderaciones'> | null): Ponderaciones {
  const fijas = licitacion?.ponderaciones;
  return fijas ? ponderacionesDe({ porcentajeEconomico: fijas.economico, porcentajeTecnico: fijas.tecnico, porcentajeSustentabilidad: fijas.sustentabilidad }) : ponderacionesVigentes();
}
