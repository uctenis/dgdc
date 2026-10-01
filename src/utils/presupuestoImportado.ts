import type { ItemItemizadoProyecto } from '../types';
import type { ParsedPresupuestoImportado } from './excelParser';
import { asignarFasesEstandar } from './itemizadoOrganizer';

/** Itemizado listo para guardar en el proyecto, a partir de un Excel o PDF de presupuesto ya leído. */
export interface ItemizadoImportado {
  items: ItemItemizadoProyecto[];
  /** % de Gastos Generales sobre el Costo Directo, si el archivo los trae en su resumen final. */
  gastosGeneralesPct?: number;
  /** % de Utilidad sobre Costo Directo + Gastos Generales, si el archivo la trae. */
  utilidadPct?: number;
}

/**
 * Convierte las partidas leídas de un archivo en partidas del itemizado del proyecto. Quedan marcadas como
 * referenciales (vienen de un archivo externo) hasta que el usuario las valide. Gastos Generales y Utilidad se
 * devuelven como % para que el Total con IVA del sistema calce con el del archivo.
 */
export function itemizadoDesdeImportado(resultado: ParsedPresupuestoImportado, origen: 'Excel' | 'PDF'): ItemizadoImportado {
  const sello = Date.now();
  // Los capítulos del archivo se llevan a las fases del sistema, para no reasignar cada partida a mano.
  const items: ItemItemizadoProyecto[] = asignarFasesEstandar(resultado.items.map((it, i) => ({
    id: `partida-${origen.toLowerCase()}-${sello}-${i}`,
    item: it.item || String(i + 1),
    descripcion: it.descripcion,
    unidad: it.unidad,
    cantidad: it.cantidad,
    precioUnitario: it.precioUnitario,
    precioTotal: Math.round(it.cantidad * it.precioUnitario),
    origen,
    fase: it.fase,
    precioReferencial: true,
  })));

  const costoDirecto = items.reduce((sum, it) => sum + (it.precioTotal || 0), 0);
  if (costoDirecto <= 0 || !resultado.gastosGeneralesDetectados) return { items };

  // Cuatro decimales: con dos, el Total con IVA del sistema se aleja algunos miles de pesos del total del archivo.
  const gastosGeneralesPct = Math.round((resultado.gastosGeneralesDetectados / costoDirecto) * 1000000) / 10000;
  if (!resultado.utilidadDetectada) return { items, gastosGeneralesPct };

  const baseUtilidad = costoDirecto + resultado.gastosGeneralesDetectados;
  return { items, gastosGeneralesPct, utilidadPct: Math.round((resultado.utilidadDetectada / baseUtilidad) * 1000000) / 10000 };
}

/** Total con IVA del itemizado, con el mismo cálculo en cascada de la pestaña Presupuesto Estimativo. */
export function totalItemizadoConIva(
  items: ItemItemizadoProyecto[],
  markup?: { gastosGeneralesPct?: number; utilidadPct?: number },
  tasaIva = 19
): number {
  const costoDirecto = items.reduce((sum, it) => sum + (it.precioTotal || 0), 0);
  const conGastosGenerales = costoDirecto + Math.round(costoDirecto * ((markup?.gastosGeneralesPct || 0) / 100));
  const neto = conGastosGenerales + Math.round(conGastosGenerales * ((markup?.utilidadPct || 0) / 100));
  return neto + Math.round(neto * (tasaIva / 100));
}

const MAX_PARTIDAS_IA = 60;

/**
 * Texto con las partidas del presupuesto para entregarlo a la IA como fuente del alcance. Sin `conMontos` no
 * lleva precios: la descripción del proyecto termina en las Bases, que leen los proveedores.
 */
export function resumenPartidasParaIA(items: ItemItemizadoProyecto[] | undefined, opciones: { conMontos?: boolean } = {}): string {
  const partidas = (items || []).filter(it => it.descripcion?.trim());
  if (partidas.length === 0) return '';

  // Con más partidas de las que caben, se priorizan las de mayor monto, conservando el orden del presupuesto.
  const elegidas = partidas.length <= MAX_PARTIDAS_IA
    ? partidas
    : (() => {
        const mayores = new Set([...partidas].sort((a, b) => (b.precioTotal || 0) - (a.precioTotal || 0)).slice(0, MAX_PARTIDAS_IA));
        return partidas.filter(it => mayores.has(it));
      })();

  const lineas: string[] = [];
  let faseActual: string | undefined;
  for (const it of elegidas) {
    const fase = it.fase?.trim();
    if (fase && fase !== faseActual) {
      lineas.push(`${fase}:`);
      faseActual = fase;
    }
    const cantidad = it.cantidad > 0 ? ` — ${it.cantidad.toLocaleString('es-CL')} ${it.unidad}` : '';
    const monto = opciones.conMontos && it.precioTotal > 0 ? ` — $${Math.round(it.precioTotal).toLocaleString('es-CL')} neto` : '';
    lineas.push(`- ${it.descripcion.trim()}${cantidad}${monto}`);
  }
  if (elegidas.length < partidas.length) {
    lineas.push(`(y ${partidas.length - elegidas.length} partidas menores que no se listan)`);
  }
  return lineas.join('\n');
}
