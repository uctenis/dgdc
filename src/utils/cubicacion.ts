// Cubicación base de un edificio por piso: pisos y cielos (superficie útil), muros interiores (perímetro de cada
// recinto × altura de piso) y cuántos recintos hay de cada tipo. Es una estimación para dimensionar obras (pintura,
// revestimientos, cielos, pavimentos); no reemplaza la medición en terreno.
import type { Piso, Recinto } from '../types/recintos';
import { hoyISO, vigenteEn } from './vigenciaRecinto';

export const ALTURA_PISO_DEFECTO = 2.6;
/** Pendiente típica de cubierta: la superficie inclinada es ~10 % mayor que su proyección en planta. */
export const FACTOR_PENDIENTE = 1.1;

export interface CubicacionPiso {
  piso: Piso;
  altura: number;
  alturaOrigen: string;
  recintos: number;
  util: number;
  oguc: number;
  /** Suma de perímetros de los recintos (m): cada muro cuenta por cada recinto que lo tiene, como al pintarlo. */
  perimetro: number;
  /** Muros interiores en bruto (m²): perímetro × altura, sin descontar puertas ni ventanas. */
  muros: number;
  /** Recintos cuyo perímetro se estimó (sin contorno en el plano): 4 × √superficie, como si fueran cuadrados. */
  perimetrosEstimados: number;
  /** Huella del piso (m²) y su perímetro exterior (m), desde los contornos; null si el piso no tiene contornos. */
  huella: number | null;
  huellaPerimetro: number | null;
  /** Fachada en bruto (m²): perímetro de la huella × altura, sin descontar ventanas. */
  fachada: number | null;
  /** La huella es confiable si cubre al menos 80 % de la superficie OGUC del piso (si no, faltan contornos). */
  huellaConfiable: boolean;
}

/** Perímetro de un recinto: el medido en su contorno o, si no tiene, el de un cuadrado de su misma superficie. */
export function perimetroDe(r: Recinto): { m: number; estimado: boolean } {
  if (r.perimetro_m && r.perimetro_m > 0) return { m: Number(r.perimetro_m), estimado: false };
  const a = Number(r.superficie_m2) || 0;
  return { m: a > 0 ? 4 * Math.sqrt(a) : 0, estimado: a > 0 };
}

export function cubicarPiso(piso: Piso, recintos: Recinto[], alturaDefecto = ALTURA_PISO_DEFECTO): CubicacionPiso {
  const hoy = hoyISO();
  const lista = recintos.filter(r => r.piso_id === piso.id && r.estado !== 'Eliminado' && vigenteEn(r, hoy));
  const altura = Number(piso.altura_m) || alturaDefecto;
  let perimetro = 0, estimados = 0;
  for (const r of lista) { const p = perimetroDe(r); perimetro += p.m; if (p.estimado) estimados++; }
  return {
    piso, altura,
    alturaOrigen: piso.altura_m ? (piso.altura_origen || 'Manual') : `Por defecto (${alturaDefecto.toLocaleString('es-CL')} m)`,
    recintos: lista.length,
    util: lista.reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0),
    oguc: lista.reduce((s, r) => s + (Number(r.superficie_oguc_m2) || 0), 0),
    perimetro, muros: perimetro * altura, perimetrosEstimados: estimados,
    huella: piso.huella_m2 ? Number(piso.huella_m2) : null,
    huellaPerimetro: piso.huella_perimetro_m ? Number(piso.huella_perimetro_m) : null,
    fachada: piso.huella_perimetro_m ? Number(piso.huella_perimetro_m) * altura : null,
    huellaConfiable: !!piso.huella_m2 && Number(piso.huella_m2) >= 0.8 * lista.reduce((s, r) => s + (Number(r.superficie_oguc_m2) || 0), 0),
  };
}

export function cubicarEdificio(pisos: Piso[], recintos: Recinto[], alturaDefecto = ALTURA_PISO_DEFECTO) {
  const porPiso = [...pisos].sort((a, b) => a.orden - b.orden).map(p => cubicarPiso(p, recintos, alturaDefecto));
  const total = porPiso.reduce((t, c) => ({
    recintos: t.recintos + c.recintos, util: t.util + c.util, oguc: t.oguc + c.oguc, perimetro: t.perimetro + c.perimetro,
    muros: t.muros + c.muros, perimetrosEstimados: t.perimetrosEstimados + c.perimetrosEstimados,
  }), { recintos: 0, util: 0, oguc: 0, perimetro: 0, muros: 0, perimetrosEstimados: 0 });
  // Cubierta: la mayor huella del edificio (el piso más extenso define el techo) con la pendiente típica. Si esa huella
  // no es confiable (faltan contornos), se usa la superficie OGUC de ese piso.
  const mayor = [...porPiso].sort((a, b) => Math.max(b.huella || 0, b.oguc) - Math.max(a.huella || 0, a.oguc))[0];
  const planta = mayor ? (mayor.huellaConfiable && mayor.huella ? mayor.huella : mayor.oguc) : 0;
  const nombre = mayor ? (mayor.piso.nombre || mayor.piso.codigo) : '';
  const cubierta = {
    planta, inclinada: planta * FACTOR_PENDIENTE,
    origen: !mayor ? '' : mayor.huellaConfiable ? `huella de ${nombre}` : `superficie OGUC de ${nombre} (faltan contornos para la huella)`,
  };
  const fachadas = porPiso.reduce((s, c) => s + (c.fachada || 0), 0);
  return { porPiso, total, cubierta, fachadas };
}
