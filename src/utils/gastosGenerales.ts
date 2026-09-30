/**
 * Estimación de Gastos Generales (GG) de una obra a partir de sus variables reales — plazo,
 * envergadura (Costo Directo), complejidad y si se trabaja en un recinto universitario en
 * funcionamiento — en vez de un % fijo. Los GG no dependen de las cantidades de obra sino
 * principalmente del TIEMPO (personal y servicios mensuales) más algunos costos fijos y financieros.
 *
 * GG = Σ (costo mensual × dedicación × plazo) + Σ (% del Costo Directo)
 *
 * Los valores base son referenciales de mercado regional (Temuco; costo empresa, 2026) y se pueden ajustar
 * en la calculadora; quedan guardados en el proyecto como respaldo del % aplicado.
 */

export type Complejidad = 'baja' | 'media' | 'alta';
export type Envergadura = 'menor' | 'mediana' | 'mayor';

export interface ParametrosCalculoGG {
  plazoMeses: number;
  complejidad: Complejidad;
  recintoOcupado: boolean;
  /** Ajustes manuales sobre los valores sugeridos, por id de concepto. */
  ajustesMensuales?: Record<string, { mensual?: number; dedicacionPct?: number }>;
  ajustesPorcentuales?: Record<string, number>;
}

export interface LineaGG {
  id: string;
  concepto: string;
  detalle: string;
  tipo: 'mensual' | 'porcentual';
  /** Solo tipo mensual. */
  mensual?: number;
  dedicacionPct?: number;
  /** Solo tipo porcentual: % del Costo Directo. */
  pctCostoDirecto?: number;
  monto: number;
  ajustado: boolean;
  /** Fase del itemizado que ya cubre este concepto en el Costo Directo — no se suma otra vez. */
  incluidoEnFase?: string;
}

export interface ResultadoCalculoGG {
  envergadura: Envergadura;
  lineas: LineaGG[];
  total: number;
  pct: number;
  utilidadSugeridaPct: number;
}

const MM = 1_000_000;

export function envergaduraDe(costoDirecto: number): Envergadura {
  if (costoDirecto < 30 * MM) return 'menor';
  if (costoDirecto <= 150 * MM) return 'mediana';
  return 'mayor';
}

export const ETIQUETA_ENVERGADURA: Record<Envergadura, string> = {
  menor: 'Obra menor (< $30 MM)',
  mediana: 'Obra mediana ($30 – $150 MM)',
  mayor: 'Obra mayor (> $150 MM)',
};

const FACTOR_COMPLEJIDAD: Record<Complejidad, number> = { baja: 0.85, media: 1, alta: 1.25 };

interface ConceptoMensual {
  id: string;
  concepto: string;
  detalle: string;
  mensual: number;
  dedicacion: Record<Envergadura, number>;
  /** Si la dedicación del personal escala con la complejidad de la obra. */
  escalaConComplejidad?: boolean;
  soloRecintoOcupado?: boolean;
  /** Si el itemizado ya trae esta fase, el concepto va en el Costo Directo y no en los GG. */
  cubiertoPorFase?: string;
}

const CONCEPTOS_MENSUALES: ConceptoMensual[] = [
  { id: 'residente', concepto: 'Profesional residente / jefe de obra', detalle: 'Dirección técnica en terreno', mensual: 2_400_000, dedicacion: { menor: 10, mediana: 50, mayor: 100 }, escalaConComplejidad: true },
  { id: 'prevencionista', concepto: 'Experto en prevención de riesgos', detalle: 'Ley 16.744 / DS 44', mensual: 1_400_000, dedicacion: { menor: 5, mediana: 30, mayor: 60 }, escalaConComplejidad: true },
  { id: 'administrativo', concepto: 'Administrativo / bodeguero', detalle: 'Control de materiales y documentación', mensual: 850_000, dedicacion: { menor: 0, mediana: 50, mayor: 100 } },
  { id: 'consumos', concepto: 'Consumos y servicios provisorios', detalle: 'Energía, agua, baño químico, contenedor, comunicaciones', mensual: 250_000, dedicacion: { menor: 50, mediana: 100, mayor: 100 }, cubiertoPorFase: 'Instalación de Faenas' },
  { id: 'movilizacion', concepto: 'Movilización y fletes', detalle: 'Traslado de personal, equipos y materiales', mensual: 150_000, dedicacion: { menor: 50, mediana: 100, mayor: 100 } },
  { id: 'recintoOcupado', concepto: 'Trabajo en recinto en funcionamiento', detalle: 'Aislamiento de zonas, aseo diario, horarios restringidos, coordinación con usuarios', mensual: 250_000, dedicacion: { menor: 50, mediana: 100, mayor: 100 }, soloRecintoOcupado: true },
];

interface ConceptoPorcentual {
  id: string;
  concepto: string;
  detalle: string;
  pct: (plazoMeses: number) => number;
  minimo?: number;
  cubiertoPorFase?: string;
}

const CONCEPTOS_PORCENTUALES: ConceptoPorcentual[] = [
  // Seguro de responsabilidad civil (~0,4%) + boleta de fiel cumplimiento del 5% del contrato,
  // con comisión bancaria ~2,5% anual durante el plazo más 3 meses de vigencia adicional.
  { id: 'garantias', concepto: 'Garantías y seguros', detalle: 'Boleta de fiel cumplimiento y seguro de RC', pct: m => 0.4 + 5 * 0.025 * (m + 3) / 12 },
  // El contratista financia en promedio ~1 mes de avance a una tasa ~1,2% mensual.
  { id: 'financieros', concepto: 'Gastos financieros', detalle: 'Capital de trabajo hasta el pago de cada estado de pago', pct: () => 1.2 },
  { id: 'entrega', concepto: 'Entrega de obra', detalle: 'Aseo final, planos as-built, certificados y documentos de recepción', pct: () => 0.3, minimo: 150_000, cubiertoPorFase: 'Aseo y Entrega' },
  { id: 'oficinaCentral', concepto: 'Gastos de oficina central', detalle: 'Administración de la empresa prorrateada a la obra', pct: () => 2 },
];

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param fasesEnCostoDirecto fases que ya tienen partidas en el itemizado: lo que cubren (instalación
 *   de faenas, aseo y entrega) ya está en el Costo Directo y no se vuelve a sumar como GG.
 */
export function calcularGastosGenerales(costoDirecto: number, p: ParametrosCalculoGG, fasesEnCostoDirecto: string[] = []): ResultadoCalculoGG {
  const envergadura = envergaduraDe(costoDirecto);
  const plazo = Math.max(0, p.plazoMeses || 0);
  const lineas: LineaGG[] = [];
  const cubierto = (fase?: string) => (fase && fasesEnCostoDirecto.includes(fase) ? fase : undefined);

  for (const c of CONCEPTOS_MENSUALES) {
    if (c.soloRecintoOcupado && !p.recintoOcupado) continue;
    const fase = cubierto(c.cubiertoPorFase);
    if (fase) {
      lineas.push({ id: c.id, concepto: c.concepto, detalle: c.detalle, tipo: 'mensual', monto: 0, ajustado: false, incluidoEnFase: fase });
      continue;
    }
    const ajuste = p.ajustesMensuales?.[c.id];
    const dedicacionSugerida = Math.min(100, Math.round(c.dedicacion[envergadura] * (c.escalaConComplejidad ? FACTOR_COMPLEJIDAD[p.complejidad] : 1)));
    const mensual = ajuste?.mensual ?? c.mensual;
    const dedicacionPct = ajuste?.dedicacionPct ?? dedicacionSugerida;
    lineas.push({
      id: c.id, concepto: c.concepto, detalle: c.detalle, tipo: 'mensual',
      mensual, dedicacionPct,
      monto: Math.round(mensual * (dedicacionPct / 100) * plazo),
      ajustado: ajuste?.mensual !== undefined || ajuste?.dedicacionPct !== undefined,
    });
  }

  for (const c of CONCEPTOS_PORCENTUALES) {
    const fase = cubierto(c.cubiertoPorFase);
    if (fase) {
      lineas.push({ id: c.id, concepto: c.concepto, detalle: c.detalle, tipo: 'porcentual', monto: 0, ajustado: false, incluidoEnFase: fase });
      continue;
    }
    const ajuste = p.ajustesPorcentuales?.[c.id];
    const pct = ajuste ?? redondear2(c.pct(plazo));
    const monto = Math.max(Math.round(costoDirecto * pct / 100), costoDirecto > 0 ? c.minimo || 0 : 0);
    lineas.push({ id: c.id, concepto: c.concepto, detalle: c.detalle, tipo: 'porcentual', pctCostoDirecto: pct, monto, ajustado: ajuste !== undefined });
  }

  const total = lineas.reduce((s, l) => s + l.monto, 0);
  const pct = costoDirecto > 0 ? redondear2((total / costoDirecto) * 100) : 0;
  const utilidadBase: Record<Envergadura, number> = { menor: 10, mediana: 9, mayor: 8 };
  const utilidadSugeridaPct = utilidadBase[envergadura] + (p.complejidad === 'alta' ? 1 : 0);

  return { envergadura, lineas, total, pct, utilidadSugeridaPct };
}

/** Plazo sugerido en meses a partir de los datos del proyecto (duración estimada o plazo del contrato). */
export function plazoSugeridoMeses(proyecto: { plazoEjecucionDias?: number; duracionEstimadaDias?: number }, costoDirecto: number): number {
  const dias = proyecto.plazoEjecucionDias || proyecto.duracionEstimadaDias;
  if (dias && dias > 0) return Math.max(0.5, Math.round((dias / 30) * 2) / 2);
  // Sin plazo declarado: el plazo crece menos que proporcional al monto (~1 mes a $10 MM,
  // ~3 meses a $80 MM, ~7,5 meses a $400 MM).
  return Math.max(1, Math.round(0.8 * Math.pow(costoDirecto / (10 * MM), 0.6) * 2) / 2);
}
