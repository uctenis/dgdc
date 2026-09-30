import type { DocumentoProveedor, Proveedor } from '../types';

/** Días de anticipación con que se avisa un vencimiento (garantías y documentos). */
export const DIAS_AVISO_VENCIMIENTO = 30;

export type NivelVencimiento = 'vencido' | 'por-vencer' | 'vigente' | 'sin-fecha';

export interface EstadoVencimiento {
  nivel: NivelVencimiento;
  /** Días que faltan (negativo si ya venció). */
  dias?: number;
  texto: string;
}

/** Estado de una fecha de vencimiento (YYYY-MM-DD, se considera vigente todo ese día). */
export function estadoVencimiento(fecha?: string, hoy: Date = new Date()): EstadoVencimiento {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) return { nivel: 'sin-fecha', texto: 'Sin vencimiento' };
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = Math.round((new Date(a, m - 1, d).getTime() - inicioHoy.getTime()) / 86_400_000);
  const fechaTexto = new Date(a, m - 1, d).toLocaleDateString('es-CL');
  if (dias < 0) return { nivel: 'vencido', dias, texto: `Venció el ${fechaTexto} (hace ${-dias} ${dias === -1 ? 'día' : 'días'})` };
  if (dias === 0) return { nivel: 'por-vencer', dias, texto: `Vence HOY (${fechaTexto})` };
  if (dias <= DIAS_AVISO_VENCIMIENTO) return { nivel: 'por-vencer', dias, texto: `Vence el ${fechaTexto} (en ${dias} ${dias === 1 ? 'día' : 'días'})` };
  return { nivel: 'vigente', dias, texto: `Vigente hasta el ${fechaTexto}` };
}

export const COLOR_VENCIMIENTO: Record<NivelVencimiento, string> = {
  vencido: 'bg-red-100 text-red-800 border-red-300',
  'por-vencer': 'bg-amber-100 text-amber-900 border-amber-300',
  vigente: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'sin-fecha': 'bg-slate-100 text-slate-600 border-slate-200',
};

export const requiereAviso = (e: EstadoVencimiento) => e.nivel === 'vencido' || e.nivel === 'por-vencer';

export const nombreDocumento = (d: DocumentoProveedor) => (d.tipo === 'Otro' ? d.descripcion || 'Otro documento' : d.tipo);

/** Documentos del proveedor vencidos o por vencer (aviso en la tarjeta y en la alerta general). */
export function documentosConAviso(p: Pick<Proveedor, 'documentos'>) {
  return (p.documentos || [])
    .map(d => ({ documento: d, nombre: nombreDocumento(d), estado: estadoVencimiento(d.fechaVencimiento) }))
    .filter(x => requiereAviso(x.estado));
}
