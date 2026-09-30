import type { InvitadoLicitacion, LicitacionProyecto } from '../types';

/** Ventana para medir cuán seguido se invita a un proveedor (rotación). */
export const MESES_ROTACION = 6;
/** Desde cuántas invitaciones en la ventana se considera que un proveedor se está repitiendo. */
export const UMBRAL_INVITACIONES_FRECUENTES = 3;

export interface ReferenciaLicitacion {
  licitacionId: string;
  codigo: string;
  nombre: string;
  /** Monto adjudicado (obras) o estimado (licitaciones abiertas). */
  monto: number;
  detalle?: string;
}

export interface CargaProveedor {
  /** Licitaciones aún abiertas (Borrador / En Evaluación) en que está invitado. */
  licitacionesAbiertas: ReferenciaLicitacion[];
  /** Obras que se le adjudicaron y aún no terminan (sin recepción conforme). */
  obrasEnEjecucion: ReferenciaLicitacion[];
  montoEnEjecucion: number;
  invitacionesRecientes: number;
  invitacionesTotal: number;
  ofertasPresentadas: number;
  adjudicacionesTotal: number;
  ultimaInvitacion?: string;
  nivel: 'Libre' | 'Media' | 'Alta';
  /** Se le invitó UMBRAL_INVITACIONES_FRECUENTES o más veces en los últimos MESES_ROTACION meses. */
  invitadoFrecuente: boolean;
}

export const cargaVacia = (): CargaProveedor => ({
  licitacionesAbiertas: [],
  obrasEnEjecucion: [],
  montoEnEjecucion: 0,
  invitacionesRecientes: 0,
  invitacionesTotal: 0,
  ofertasPresentadas: 0,
  adjudicacionesTotal: 0,
  nivel: 'Libre',
  invitadoFrecuente: false,
});

const codigoLicitacion = (l: LicitacionProyecto) => l.codigoProyecto || l.codigoCP || l.codigoOP || l.id;

const obraTerminada = (l: LicitacionProyecto) =>
  l.estadoLifecycle === 'Finalizado' || l.recepcionConforme?.aprobada === true || l.estado === 'Cerrado';

const procesoAbierto = (l: LicitacionProyecto) => l.estado === 'Borrador' || l.estado === 'En Evaluacion';

/**
 * Consolida, para cada proveedor, en qué otras licitaciones está participando, qué obras tiene en ejecución y
 * cuántas veces se le ha invitado últimamente. Sirve para advertir su capacidad de trabajo al invitarlo y para
 * rotar proveedores. `excluirLicitacionId` deja fuera la licitación que se está gestionando.
 */
export function calcularCargaProveedores(
  licitaciones: LicitacionProyecto[],
  invitadosPorLicitacion: Record<string, InvitadoLicitacion[]>,
  excluirLicitacionId?: string,
  hoy: Date = new Date()
): Record<string, CargaProveedor> {
  const desde = new Date(hoy);
  desde.setMonth(desde.getMonth() - MESES_ROTACION);
  const desdeISO = desde.toISOString().split('T')[0];

  const cargas: Record<string, CargaProveedor> = {};
  const de = (id: string) => (cargas[id] ||= cargaVacia());

  licitaciones.forEach(lic => {
    if (lic.id === excluirLicitacionId) return;
    const invitados = invitadosPorLicitacion[lic.id] || [];
    const invitadosIds = new Set([...invitados.map(i => i.proveedorId), ...(lic.proveedoresInvitadosIds || [])]);

    invitadosIds.forEach(provId => {
      const inv = invitados.find(i => i.proveedorId === provId);
      const c = de(provId);
      const fecha = inv?.fechaInvitacion || lic.fechaCreacion || '';
      c.invitacionesTotal++;
      if (fecha && fecha >= desdeISO) c.invitacionesRecientes++;
      if (fecha && (!c.ultimaInvitacion || fecha > c.ultimaInvitacion)) c.ultimaInvitacion = fecha;
      if (inv?.estadoPropuesta === 'Presentada') c.ofertasPresentadas++;
      if (procesoAbierto(lic)) {
        c.licitacionesAbiertas.push({
          licitacionId: lic.id,
          codigo: codigoLicitacion(lic),
          nombre: lic.nombreProyecto,
          monto: lic.montoEstimado || 0,
          detalle: inv?.estadoPropuesta === 'Presentada' ? 'ya ofertó' : 'invitado',
        });
      }
    });

    const adjudicadoId = lic.proveedorAdjudicadoId || lic.proveedorGanadorId;
    if (adjudicadoId) {
      const c = de(adjudicadoId);
      c.adjudicacionesTotal++;
      if (!obraTerminada(lic)) {
        const monto = lic.montoAdjudicadoTotal || lic.montoAdjudicadoNeto || 0;
        c.obrasEnEjecucion.push({
          licitacionId: lic.id,
          codigo: codigoLicitacion(lic),
          nombre: lic.nombreProyecto,
          monto,
          detalle: lic.fechaTerminoProgramada ? `término ${lic.fechaTerminoProgramada}` : undefined,
        });
        c.montoEnEjecucion += monto;
      }
    }
  });

  Object.values(cargas).forEach(c => {
    // Una obra en ejecución pesa el doble que una licitación en curso.
    const puntos = c.obrasEnEjecucion.length * 2 + c.licitacionesAbiertas.length;
    c.nivel = puntos >= 4 ? 'Alta' : puntos >= 2 ? 'Media' : 'Libre';
    c.invitadoFrecuente = c.invitacionesRecientes >= UMBRAL_INVITACIONES_FRECUENTES;
  });

  return cargas;
}

/** Texto para advertir, antes de invitar, la carga actual del proveedor. Vacío si no hay nada que advertir. */
export function advertenciaCarga(nombre: string, c: CargaProveedor | undefined, formatoMonto: (n: number) => string): string {
  if (!c) return '';
  const partes: string[] = [];
  if (c.obrasEnEjecucion.length) {
    partes.push(`Tiene ${c.obrasEnEjecucion.length} obra(s) adjudicada(s) en ejecución${c.montoEnEjecucion ? ` por ${formatoMonto(c.montoEnEjecucion)}` : ''}:\n`
      + c.obrasEnEjecucion.map(o => `  • ${o.codigo} — ${o.nombre}${o.detalle ? ` (${o.detalle})` : ''}`).join('\n'));
  }
  if (c.licitacionesAbiertas.length) {
    partes.push(`Está participando en ${c.licitacionesAbiertas.length} licitación(es) abierta(s):\n`
      + c.licitacionesAbiertas.map(o => `  • ${o.codigo} — ${o.nombre} (${o.detalle})`).join('\n'));
  }
  if (c.invitadoFrecuente) {
    partes.push(`Se le ha invitado ${c.invitacionesRecientes} veces en los últimos ${MESES_ROTACION} meses: considere rotar e invitar a otros proveedores del rubro.`);
  }
  if (!partes.length) return '';
  return `${nombre}\nCarga de trabajo: ${c.nivel.toUpperCase()}\n\n${partes.join('\n\n')}`;
}
