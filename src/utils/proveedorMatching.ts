import type { Proveedor, EvaluacionDesempeno } from '../types';
import { calcularPromedioDesempeno } from '../services/firestoreService';

export interface ProveedorSugerido {
  proveedor: Proveedor;
  coincideRubro: boolean;
  promedioDesempeno: number | null;
  cantidadEvaluaciones: number;
}

/**
 * Ordena proveedores para sugerir a quién invitar: primero coincidencia exacta de
 * rubro (mismo catálogo de rubrosData.ts en Proveedor y en la licitación — nada de
 * texto libre/fuzzy), luego mejor desempeño histórico promedio, y como desempate,
 * proveedores con sello de sustentabilidad.
 */
export function ordenarProveedoresPorRubroYDesempeno(
  proveedores: Proveedor[],
  rubroRequerido: string | undefined,
  evaluacionesPorProveedor: Record<string, EvaluacionDesempeno[]>
): ProveedorSugerido[] {
  const enriquecidos: ProveedorSugerido[] = proveedores.map(p => {
    const evaluaciones = evaluacionesPorProveedor[p.id] || [];
    return {
      proveedor: p,
      coincideRubro: Boolean(rubroRequerido) && p.rubro === rubroRequerido,
      promedioDesempeno: calcularPromedioDesempeno(evaluaciones),
      cantidadEvaluaciones: evaluaciones.length,
    };
  });

  return enriquecidos.sort((a, b) => {
    if (a.coincideRubro !== b.coincideRubro) return a.coincideRubro ? -1 : 1;
    const desempenoA = a.promedioDesempeno ?? -1;
    const desempenoB = b.promedioDesempeno ?? -1;
    if (desempenoA !== desempenoB) return desempenoB - desempenoA;
    if (a.proveedor.cuentaSustentabilidad !== b.proveedor.cuentaSustentabilidad) {
      return a.proveedor.cuentaSustentabilidad ? -1 : 1;
    }
    return a.proveedor.razonSocial.localeCompare(b.proveedor.razonSocial);
  });
}

/** % de cumplimiento de los 5 campos mínimos del checklist de antecedentes previo a invitar. */
export function porcentajeAntecedentes(checklist?: {
  basesTecnicasOk?: boolean;
  basesAdministrativasOk?: boolean;
  planosOk?: boolean;
  calendarioDefinidoOk?: boolean;
  revisadoSecretariaGeneralOk?: boolean;
}): number {
  if (!checklist) return 0;
  const campos = [
    checklist.basesTecnicasOk, checklist.basesAdministrativasOk, checklist.planosOk,
    checklist.calendarioDefinidoOk, checklist.revisadoSecretariaGeneralOk,
  ];
  const completos = campos.filter(Boolean).length;
  return Math.round((completos / campos.length) * 100);
}
