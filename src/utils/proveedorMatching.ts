import type { Proveedor, EvaluacionDesempeno, LicitacionProyecto } from '../types';
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

export interface ChecklistAntecedentesEfectivo {
  basesTecnicasOk: boolean;
  basesAdministrativasOk: boolean;
  planosOk: boolean;
  calendarioDefinidoOk: boolean;
  revisadoSecretariaGeneralOk: boolean;
  /** Ítems cumplidos a mano, sin archivo que los respalde (deben advertirse). */
  sinAdjuntos: { basesTecnicasOk: boolean; basesAdministrativasOk: boolean; planosOk: boolean };
}

const tieneArchivoReal = (lic: LicitacionProyecto, tipo: string) =>
  Boolean(lic.antecedentesTecnicos?.some(d => d.tipo === tipo && d.archivoURL && d.archivoURL !== '#'));

/**
 * Checklist previo a invitar / recibir ofertas, calculado en un solo lugar para que todas las
 * pantallas coincidan: archivo real adjunto, o marca manual (desde Antecedentes o desde el checklist
 * de la Ficha: ch-01 Bases Administrativas, ch-02 EETT/Bases Técnicas, ch-03 Planos).
 */
export function checklistAntecedentesEfectivo(lic: LicitacionProyecto): ChecklistAntecedentesEfectivo {
  const g = lic.checklistAntecedentes;
  const f = lic.checklistManual || {};
  const manual = {
    basesTecnicasOk: Boolean(g?.basesTecnicasSinAdjuntos) || f['ch-02'] === true,
    basesAdministrativasOk: Boolean(g?.basesAdministrativasSinAdjuntos) || f['ch-01'] === true,
    planosOk: Boolean(g?.planosSinAdjuntos) || f['ch-03'] === true,
  };
  const conArchivo = {
    basesTecnicasOk: tieneArchivoReal(lic, 'Bases Tecnicas'),
    basesAdministrativasOk: tieneArchivoReal(lic, 'Bases Administrativas'),
    planosOk: tieneArchivoReal(lic, 'Planos'),
  };
  return {
    basesTecnicasOk: conArchivo.basesTecnicasOk || manual.basesTecnicasOk,
    basesAdministrativasOk: conArchivo.basesAdministrativasOk || manual.basesAdministrativasOk,
    planosOk: conArchivo.planosOk || manual.planosOk,
    calendarioDefinidoOk: Boolean(
      lic.fechaVisitaTerreno && lic.fechaRecepcionConsultas && lic.fechaRespuestaConsultas && lic.fechaEvaluacion
    ),
    revisadoSecretariaGeneralOk: g?.revisadoSecretariaGeneralOk === true,
    sinAdjuntos: {
      basesTecnicasOk: !conArchivo.basesTecnicasOk && manual.basesTecnicasOk,
      basesAdministrativasOk: !conArchivo.basesAdministrativasOk && manual.basesAdministrativasOk,
      planosOk: !conArchivo.planosOk && manual.planosOk,
    },
  };
}

export const checklistAntecedentesCompleto = (c: ChecklistAntecedentesEfectivo) =>
  c.basesTecnicasOk && c.basesAdministrativasOk && c.planosOk && c.calendarioDefinidoOk && c.revisadoSecretariaGeneralOk;

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
