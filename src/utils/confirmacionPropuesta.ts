import type { LicitacionProyecto, Propuesta } from '../types';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const clp = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

/**
 * Correo de confirmación al proveedor cuando su oferta queda enviada. Es espejo de la plantilla de la
 * Cloud Function `confirmarPropuestaEnviada` (functions/src/index.js): en modo prueba se usa esto para mostrar
 * lo que se enviaría.
 */
export function construirConfirmacionPropuesta(licitacion: LicitacionProyecto, propuesta: Partial<Propuesta>, proveedorNombre: string) {
  const asunto = `Confirmación de oferta recibida — ${licitacion.codigoProyecto || ''} ${licitacion.nombreProyecto || ''}`.trim();
  const fecha = propuesta.fechaEnvio ? new Date(propuesta.fechaEnvio) : new Date();
  const html = `
        <div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 14px;">
          <p>Estimados <strong>${esc(proveedorNombre)}</strong>,</p>
          <p>Confirmamos que su oferta para la siguiente licitación fue <strong>recibida correctamente</strong>:</p>
          <p style="background:#f1f5f9; border-radius:8px; padding:12px 16px;">
            <strong>${esc(licitacion.nombreProyecto)}</strong><br/>
            Código de Proyecto: ${esc(licitacion.codigoProyecto || 'No informado')}
          </p>
          <table style="border-collapse: collapse; font-size: 13px;">
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Fecha y hora de envío</td><td><strong>${esc(fecha.toLocaleString('es-CL'))}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Monto neto</td><td><strong>${esc(clp(propuesta.montoNeto || 0))}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Total con IVA</td><td><strong>${esc(clp(propuesta.montoTotal || 0))}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Plazo de ejecución</td><td><strong>${esc(propuesta.plazoDias || 0)} días corridos</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Oferta económica</td><td>${esc(propuesta.archivoNombre || '—')}</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Oferta técnica</td><td>${esc(propuesta.archivoTecnicoNombre || '—')}</td></tr>
          </table>
          <p style="font-size:12px; color:#64748b;">Este correo es una confirmación automática de recepción; no constituye adjudicación. La evaluación se realizará según las bases de la licitación.</p>
          <p style="margin-top:16px;">Saludos cordiales,<br/>Subdirección de Infraestructura — Universidad Católica de Temuco</p>
        </div>
      `.trim();
  return { asunto, html };
}
