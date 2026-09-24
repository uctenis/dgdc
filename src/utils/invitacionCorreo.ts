import type { LicitacionProyecto } from '../types';

function formatearFechaEmail(fecha?: string): string {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'No definida';
  return new Intl.DateTimeFormat('es-CL').format(new Date(`${fecha}T12:00:00`));
}

/**
 * Asunto y cuerpo de la invitación. Es espejo de la plantilla de la Cloud Function
 * `enviarInvitacionesLicitacion` (functions/src/index.js): en modo prueba se usa esto para mostrar
 * lo que se enviaría; en modo real el historial guarda el HTML que devuelve el servidor.
 */
export function construirInvitacionCorreo(licitacion: LicitacionProyecto, portalUrl: string, proveedorNombre: string) {
  const asunto = `Invitación a licitación — ${licitacion.codigoProyecto || ''} ${licitacion.nombreProyecto || ''}`.trim();
  const html = `
        <div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 14px;">
          <p>Estimados <strong>${proveedorNombre || ''}</strong>,</p>
          <p>Junto con saludar, les invitamos a participar en el proceso de licitación:</p>
          <p style="background:#f1f5f9; border-radius:8px; padding:12px 16px;">
            <strong>${licitacion.nombreProyecto || ''}</strong><br/>
            Código de Proyecto: ${licitacion.codigoProyecto || 'No informado'} · Centro de Costo: ${licitacion.codigoCP || 'No informado'}
          </p>
          <p>Para revisar las bases, antecedentes técnicos y presentar su oferta, ingrese con su cuenta de correo al portal de proveedores:</p>
          <p><a href="${portalUrl}" style="display:inline-block; background:#0369a1; color:#fff; text-decoration:none; padding:10px 18px; border-radius:8px; font-weight:bold;">Ingresar al Portal de Proveedores</a></p>
          <p style="font-size:12px; color:#64748b;">Si el botón no funciona, copie y pegue este enlace en su navegador: ${portalUrl}</p>
          <p><strong>Calendario del proceso:</strong></p>
          <table style="border-collapse: collapse; font-size: 13px;">
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Visita a Terreno</td><td><strong>${formatearFechaEmail(licitacion.fechaVisitaTerreno)}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Recepción de Consultas</td><td><strong>${formatearFechaEmail(licitacion.fechaRecepcionConsultas)}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Respuesta de Consultas</td><td><strong>${formatearFechaEmail(licitacion.fechaRespuestaConsultas)}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Entrega de Propuestas</td><td><strong>${formatearFechaEmail(licitacion.fechaEntregaPropuestas || licitacion.fechaEvaluacion)}, hasta las ${licitacion.horaLimiteOfertas || '23:59'} hrs (hora de Chile)</strong></td></tr>
          </table>
          <p style="margin-top:16px;">Saludos cordiales,<br/>Subdirección de Infraestructura — Universidad Católica de Temuco</p>
        </div>
      `.trim();
  return { asunto, html };
}
