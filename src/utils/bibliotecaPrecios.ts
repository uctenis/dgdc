import type { Cotizacion, LicitacionProyecto } from '../types';
import { normalizarUnidad, tokensDescripcion } from './preciosHistoricos';

/** Un precio unitario real ofertado en una licitación. */
export interface PrecioBiblioteca {
  clave: string;
  descripcion: string;
  unidad: string;
  precioUnitario: number;
  fecha: string;
  proveedor: string;
  licitacionId: string;
  obra: string;
  codigo: string;
  adjudicado: boolean;
  tokens: Set<string>;
}

/** Todas las partidas con precio de las ofertas recibidas, marcando las de la oferta adjudicada. */
export function construirBiblioteca(cotizaciones: Cotizacion[], licitaciones: LicitacionProyecto[]): PrecioBiblioteca[] {
  const porId = new Map(licitaciones.map(l => [l.id, l]));
  return cotizaciones.flatMap(c => {
    const lic = porId.get(c.licitacionId);
    const adjudicado = Boolean(lic && (lic.cotizacionAdjudicadaId === c.id || (!lic.cotizacionAdjudicadaId && lic.proveedorAdjudicadoId === c.proveedorId)));
    const fecha = (c.fechaCotizacion || c.fechaCarga || '').slice(0, 10);
    return (c.itemizado || [])
      .filter(it => it.precioUnitario > 0 && it.descripcion)
      .map((it, i) => ({
        clave: `${c.id}-${it.id || i}`,
        descripcion: it.descripcion,
        unidad: normalizarUnidad(it.unidad),
        precioUnitario: it.precioUnitario,
        fecha,
        proveedor: c.proveedorNombre,
        licitacionId: c.licitacionId,
        obra: lic?.nombreProyecto || 'Licitación',
        codigo: lic?.codigoProyecto || lic?.codigoCP || '',
        adjudicado,
        tokens: tokensDescripcion(it.descripcion),
      }));
  });
}

/** Partidas que contienen todas las palabras buscadas (misma lógica de palabras que el presupuesto con IA). */
export function buscarPrecios(biblioteca: PrecioBiblioteca[], texto: string, unidad: string, soloAdjudicados: boolean): PrecioBiblioteca[] {
  const buscados = [...tokensDescripcion(texto)];
  const texto3 = texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!buscados.length && texto3.length < 3) return [];
  return biblioteca.filter(p =>
    (!unidad || p.unidad === unidad)
    && (!soloAdjudicados || p.adjudicado)
    && (buscados.length
      ? buscados.every(t => [...p.tokens].some(pt => pt.startsWith(t) || t.startsWith(pt)))
      : p.descripcion.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(texto3)));
}

export function estadisticas(valores: number[]) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  const mediana = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  return { n: v.length, min: v[0], max: v[v.length - 1], mediana: Math.round(mediana), promedio: Math.round(v.reduce((s, x) => s + x, 0) / v.length) };
}
