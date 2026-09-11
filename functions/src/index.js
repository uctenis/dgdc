import Busboy from 'busboy';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import nodemailer from 'nodemailer';

initializeApp();

const adobeClientId = defineSecret('ADOBE_SIGN_CLIENT_ID');
const adobeClientSecret = defineSecret('ADOBE_SIGN_CLIENT_SECRET');
const adobeRefreshToken = defineSecret('ADOBE_SIGN_REFRESH_TOKEN');
const adobeApiAccessPoint = defineString('ADOBE_SIGN_API_ACCESS_POINT', {
  default: 'https://api.na1.adobesign.com',
});
const gmailUser = defineSecret('GMAIL_USER');
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const db = getFirestore();
let cachedToken;

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

async function requireFirebaseUser(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  return getAuth().verifyIdToken(header.slice(7));
}

async function getAdobeToken() {
  if (cachedToken?.expiresAt > Date.now() + 60_000) return cachedToken;
  const response = await fetch(`${adobeApiAccessPoint.value().replace(/\/$/, '')}/oauth/v2/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: adobeClientId.value(),
      client_secret: adobeClientSecret.value(),
      refresh_token: adobeRefreshToken.value(),
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.message || payload.error_description || 'No fue posible renovar la sesión de Acrobat Sign.');
  }
  const apiRoot = (payload.api_access_point || 'https://api.na1.adobesign.com/').replace(/\/$/, '');
  cachedToken = {
    accessToken: payload.access_token,
    apiBase: `${apiRoot}/api/rest/v6`,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return cachedToken;
}

async function adobeFetch(path, init = {}) {
  const token = await getAdobeToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token.accessToken}`);
  const response = await fetch(`${token.apiBase}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = payload.code ? ` (${payload.code})` : '';
    throw new Error(`${payload.message || 'Error devuelto por Acrobat Sign'}${code}`);
  }
  return response;
}

function parseAgreementForm(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let pdf;
    const parser = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_PDF_BYTES, fields: 5 },
    });
    parser.on('field', (name, value) => { fields[name] = value; });
    parser.on('file', (name, stream, info) => {
      const chunks = [];
      let exceeded = false;
      stream.on('limit', () => { exceeded = true; });
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        if (exceeded) return reject(new Error('El PDF supera el máximo de 12 MB.'));
        pdf = { buffer: Buffer.concat(chunks), filename: info.filename, mimeType: info.mimeType };
      });
    });
    parser.on('error', reject);
    parser.on('finish', () => resolve({ fields, pdf }));
    parser.end(req.rawBody);
  });
}

function validateSigners(rawSigners) {
  let signers;
  try { signers = JSON.parse(rawSigners || '[]'); } catch { throw new Error('La nómina de firmantes no es válida.'); }
  if (!Array.isArray(signers) || signers.length === 0 || signers.length > 4) {
    throw new Error('El acuerdo debe tener entre 1 y 4 firmantes.');
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set();
  for (const signer of signers) {
    const email = String(signer.email || '').trim().toLowerCase();
    if (!emailPattern.test(email)) throw new Error(`Correo de firmante inválido: ${signer.nombre || 'sin nombre'}.`);
    if (seen.has(email)) throw new Error(`El correo ${email} está repetido en la secuencia de firma.`);
    seen.add(email);
    signer.email = email;
  }
  return signers;
}

async function getSigningUrl(agreementId, email) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await adobeFetch(`/agreements/${encodeURIComponent(agreementId)}/signingUrls`).catch(error => {
      if (String(error.message).includes('DOCUMENT_NOT_YET_AVAILABLE')) return null;
      throw error;
    });
    if (response) {
      const payload = await response.json();
      const urls = (payload.signingUrlSetInfos || []).flatMap(set => set.signingUrls || []);
      const match = urls.find(item => String(item.email || '').toLowerCase() === email.toLowerCase());
      return match?.esignUrl;
    }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  return undefined;
}

async function createAgreement(req, res, firebaseUser) {
  const { fields, pdf } = await parseAgreementForm(req);
  if (!pdf?.buffer?.length || (pdf.mimeType !== 'application/pdf' && !pdf.filename.toLowerCase().endsWith('.pdf'))) {
    return sendError(res, 400, 'Debe adjuntar un documento PDF válido.');
  }
  const signers = validateSigners(fields.signers);
  const transientForm = new FormData();
  transientForm.append('File', new Blob([pdf.buffer], { type: 'application/pdf' }), pdf.filename);
  const transientResponse = await adobeFetch('/transientDocuments', { method: 'POST', body: transientForm });
  const { transientDocumentId } = await transientResponse.json();

  const agreementResponse = await adobeFetch('/agreements', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileInfos: [{ transientDocumentId }],
      name: String(fields.name || pdf.filename).slice(0, 255),
      participantSetsInfo: signers.map((signer, index) => ({
        memberInfos: [{ email: signer.email }],
        name: `${signer.nombre} — ${signer.cargo}`.slice(0, 255),
        order: index + 1,
        role: 'SIGNER',
      })),
      signatureType: 'ESIGN',
      state: 'IN_PROCESS',
      message: 'Revise y firme el acta oficial de evaluación y adjudicación DGDC.',
      locale: 'es_ES',
    }),
  });
  const { id: agreementId } = await agreementResponse.json();
  await db.collection('adobeSignAgreements').doc(agreementId).set({
    projectId: String(fields.projectId || ''),
    createdBy: firebaseUser.uid,
    allowedEmails: signers.map(signer => signer.email),
    createdAt: FieldValue.serverTimestamp(),
  });
  const signingUrl = firebaseUser.email ? await getSigningUrl(agreementId, firebaseUser.email) : undefined;
  res.status(201).json({ agreementId, status: 'OUT_FOR_SIGNATURE', signingUrl });
}

async function assertAgreementAccess(agreementId, firebaseUser) {
  const snapshot = await db.collection('adobeSignAgreements').doc(agreementId).get();
  if (!snapshot.exists) throw new Error('AGREEMENT_NOT_FOUND');
  const access = snapshot.data();
  const email = String(firebaseUser.email || '').toLowerCase();
  if (access.createdBy !== firebaseUser.uid && !access.allowedEmails?.includes(email)) {
    throw new Error('AGREEMENT_FORBIDDEN');
  }
}

async function getAgreement(req, res, agreementId) {
  const response = await adobeFetch(`/agreements/${encodeURIComponent(agreementId)}`);
  const agreement = await response.json();
  res.json({ agreementId, status: agreement.status || 'UNKNOWN' });
}

async function sendSigningUrl(res, agreementId, firebaseUser) {
  if (!firebaseUser.email) return sendError(res, 403, 'La cuenta autenticada no tiene correo verificable.');
  const signingUrl = await getSigningUrl(agreementId, firebaseUser.email);
  if (!signingUrl) {
    return sendError(res, 409, 'Acrobat Sign aún no habilita la firma para este usuario o el turno corresponde a otro firmante.');
  }
  res.json({ signingUrl });
}

async function sendSignedDocument(res, agreementId) {
  const statusResponse = await adobeFetch(`/agreements/${encodeURIComponent(agreementId)}`);
  const agreement = await statusResponse.json();
  if (!['SIGNED', 'APPROVED'].includes(agreement.status)) {
    return sendError(res, 409, `El acuerdo todavía no está completamente firmado (${agreement.status}).`);
  }
  const response = await adobeFetch(`/agreements/${encodeURIComponent(agreementId)}/combinedDocument`);
  const bytes = Buffer.from(await response.arrayBuffer());
  res.set('content-type', 'application/pdf');
  res.set('content-disposition', `attachment; filename="acta-firmada-${agreementId}.pdf"`);
  res.send(bytes);
}

export const adobeSignApi = onRequest({
  cors: true,
  timeoutSeconds: 120,
  memory: '512MiB',
  secrets: [adobeClientId, adobeClientSecret, adobeRefreshToken],
}, async (req, res) => {
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const parts = req.path.split('/').filter(Boolean);
    if (req.method === 'POST' && parts.length === 1 && parts[0] === 'agreements') {
      return await createAgreement(req, res, firebaseUser);
    }
    if (parts[0] !== 'agreements' || !parts[1]) return sendError(res, 404, 'Ruta no encontrada.');
    const agreementId = parts[1];
    await assertAgreementAccess(agreementId, firebaseUser);
    if (req.method === 'GET' && parts.length === 2) return await getAgreement(req, res, agreementId);
    if (req.method === 'GET' && parts[2] === 'signing-url') return await sendSigningUrl(res, agreementId, firebaseUser);
    if (req.method === 'GET' && parts[2] === 'document') return await sendSignedDocument(res, agreementId);
    return sendError(res, 404, 'Ruta no encontrada.');
  } catch (error) {
    console.error('Adobe Sign API error', error);
    if (error.message === 'AUTH_REQUIRED') return sendError(res, 401, 'Debe iniciar sesión para usar Acrobat Sign.');
    if (error.message === 'AGREEMENT_NOT_FOUND') return sendError(res, 404, 'El acuerdo no pertenece a esta aplicación.');
    if (error.message === 'AGREEMENT_FORBIDDEN') return sendError(res, 403, 'Su cuenta no tiene acceso a este acuerdo.');
    return sendError(res, 500, error instanceof Error ? error.message : 'Error inesperado en Acrobat Sign.');
  }
});

export const firmarEstadoPago = onRequest({ cors: true, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return sendError(res, 405, 'Método no permitido.');
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const licitacionId = String(req.body?.licitacionId || '').trim();
    const estadoPagoId = String(req.body?.estadoPagoId || '').trim();
    const sha256 = String(req.body?.sha256 || '').trim().toLowerCase();
    if (!licitacionId || !estadoPagoId || !/^[a-f0-9]{64}$/.test(sha256)) {
      return sendError(res, 400, 'Solicitud de firma incompleta o huella SHA-256 inválida.');
    }

    const licitacionRef = db.collection('licitaciones').doc(licitacionId);
    const estadoRef = licitacionRef.collection('estadosPago').doc(estadoPagoId);
    await db.runTransaction(async transaction => {
      const [licitacionSnap, estadoSnap] = await Promise.all([
        transaction.get(licitacionRef),
        transaction.get(estadoRef),
      ]);
      if (!licitacionSnap.exists || !estadoSnap.exists) throw new Error('PAYMENT_NOT_FOUND');
      const licitacion = licitacionSnap.data();
      const estado = estadoSnap.data();
      const authenticatedEmail = String(firebaseUser.email || '').trim().toLowerCase();
      const responsibleEmail = String(licitacion.responsableEmail || '').trim().toLowerCase();
      if (!authenticatedEmail || authenticatedEmail !== responsibleEmail) throw new Error('NOT_PROJECT_RESPONSIBLE');
      if (estado.firmaResponsable) throw new Error('PAYMENT_ALREADY_SIGNED');
      transaction.update(estadoRef, {
        estado: 'Aprobado',
        firmaResponsable: {
          uid: firebaseUser.uid,
          email: authenticatedEmail,
          nombre: licitacion.responsableNombre || firebaseUser.name || authenticatedEmail,
          cargo: 'Responsable del Proyecto / Inspección Técnica de Obra',
          fecha: new Date().toISOString(),
          sha256,
        },
        _updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return res.json({ signed: true });
  } catch (error) {
    console.error('Error firmando estado de pago', error);
    if (error.message === 'AUTH_REQUIRED') return sendError(res, 401, 'Debe iniciar sesión con Google.');
    if (error.message === 'PAYMENT_NOT_FOUND') return sendError(res, 404, 'No se encontró el estado de pago.');
    if (error.message === 'NOT_PROJECT_RESPONSIBLE') return sendError(res, 403, 'Solo el responsable asignado al proyecto puede firmar este estado de pago.');
    if (error.message === 'PAYMENT_ALREADY_SIGNED') return sendError(res, 409, 'El estado de pago ya fue firmado.');
  }
});

export const enviarCorreoAdjudicacion = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  if (req.method !== 'POST') return sendError(res, 405, 'Método no permitido.');
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const licitacionId = String(req.body?.licitacionId || '').trim();
    if (!licitacionId) return sendError(res, 400, 'Falta el ID de la licitación.');

    const licitacionSnap = await db.collection('licitaciones').doc(licitacionId).get();
    if (!licitacionSnap.exists) return sendError(res, 404, 'Licitación no encontrada.');
    const licitacion = licitacionSnap.data();

    // Fetch the signed PDF if available
    let attachments = [];
    if (licitacion.actaFirmaDigital?.archivoURL) {
      try {
        const response = await fetch(licitacion.actaFirmaDigital.archivoURL);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          attachments.push({
            filename: `Acta_Adjudicacion_Firmada.pdf`,
            content: Buffer.from(arrayBuffer),
          });
        }
      } catch (err) {
        console.error('Error fetching PDF:', err);
      }
    }

    // Usaremos Ethereal Mail para desarrollo/testing local sin requerir credenciales reales
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    const formatoMonedaCLP = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(v);

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
          th, td { border: 1px solid #999; padding: 8px 12px; text-align: left; }
          .bg-gray { background-color: #f3f4f6; }
          .bg-yellow { background-color: #fef08a; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <p>Estimados,</p>
        <p>Junto con saludar, solicito autorización y gestión de OP para lo siguiente.</p>
        <table>
          <tr>
            <td class="bg-gray bold" style="width: 25%;">N° Orden de Trabajo</td>
            <td class="bg-gray bold" style="width: 25%;">${licitacion.codigoOT || ''}</td>
            <td class="bg-gray bold" style="width: 25%;">OP:</td>
            <td class="bg-yellow bold" style="width: 25%;">OC:</td>
          </tr>
          <tr><td>Requerimiento</td><td colspan="3">${licitacion.nombreProyecto || ''}</td></tr>
          <tr><td>Proveedor (adjudicado)</td><td colspan="3">${licitacion.proveedorAdjudicadoNombre || ''}</td></tr>
          <tr><td>Ubicación específica</td><td colspan="3">${licitacion.campusSigla || ''} ${licitacion.edificioSigla ? `- ${licitacion.edificioSigla}` : ''}</td></tr>
          <tr><td>Responsable del bien</td><td colspan="3">${licitacion.responsableNombre || ''}</td></tr>
          <tr><td>Usuario</td><td colspan="3">${licitacion.uso || ''}</td></tr>
          <tr><td>Motivo de la compra</td><td colspan="3">${licitacion.descripcion || ''}</td></tr>
          <tr><td>Descripción</td><td colspan="3">${licitacion.descripcion || ''}</td></tr>
          <tr><td>Precio con IVA (Adjudicado)</td><td colspan="3" style="text-align: right;">${formatoMonedaCLP(licitacion.montoAdjudicadoTotal || licitacion.montoEstimado || 0)}</td></tr>
          <tr><td>Centro de costo</td><td colspan="2">${licitacion.codigoCP || ''}</td><td></td></tr>
          <tr><td>Observación</td><td colspan="3"></td></tr>
        </table>
      </body>
      </html>
    `.trim();

    const info = await transporter.sendMail({
      from: '"Sistema SGC" <no-reply@uct.cl>',
      to: "dsilva@uct.cl",
      subject: `Solicitud de OP - ${licitacion.nombreProyecto || licitacion.codigoOT || 'Proyecto'}`,
      html: htmlBody,
      attachments: attachments
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log("Message sent: %s", info.messageId);
    console.log("Preview URL: %s", previewUrl);

    return res.json({ success: true, previewUrl: previewUrl });
  } catch (error) {
    console.error('Error al enviar correo', error);
    return sendError(res, 500, 'Error inesperado al enviar el correo.');
  }
});

function formatearFechaEmail(fecha) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'No definida';
  return new Intl.DateTimeFormat('es-CL').format(new Date(`${fecha}T12:00:00`));
}

/**
 * Envía una invitación de licitación real y personalizada a cada proveedor invitado
 * (uno por uno, no un solo BCC masivo), con copia al responsable del proyecto y a
 * quien más se indique (ej. subdirector), vía Gmail/Workspace institucional (SMTP con
 * App Password). El cuerpo del correo enlaza al portal de proveedores — ya existente,
 * con login Google — en vez de adjuntar archivos pesados.
 */
export const enviarInvitacionesLicitacion = onRequest({
  cors: true,
  timeoutSeconds: 120,
  secrets: [gmailUser, gmailAppPassword],
}, async (req, res) => {
  if (req.method !== 'POST') return sendError(res, 405, 'Método no permitido.');
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const licitacionId = String(req.body?.licitacionId || '').trim();
    if (!licitacionId) return sendError(res, 400, 'Falta el ID de la licitación.');

    const portalUrl = String(req.body?.portalUrl || '').trim();
    if (!portalUrl.startsWith('https://') && !portalUrl.startsWith('http://localhost')) {
      return sendError(res, 400, 'El enlace del portal de proveedores no es válido.');
    }

    const ccExtra = Array.isArray(req.body?.ccExtra)
      ? req.body.ccExtra.filter(email => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      : [];

    const licitacionRef = db.collection('licitaciones').doc(licitacionId);
    const [licitacionSnap, invitadosSnap] = await Promise.all([
      licitacionRef.get(),
      licitacionRef.collection('invitados').get(),
    ]);
    if (!licitacionSnap.exists) return sendError(res, 404, 'Licitación no encontrada.');
    const licitacion = licitacionSnap.data();

    const checklist = licitacion.checklistAntecedentes || {};
    const antecedentesCompletos = Boolean(
      checklist.basesTecnicasOk && checklist.basesAdministrativasOk && checklist.planosOk &&
      checklist.calendarioDefinidoOk && checklist.revisadoSecretariaGeneralOk
    );
    if (!antecedentesCompletos) {
      return sendError(res, 409, 'El checklist de "Bases & Planos" (Antecedentes Técnicos) no está completo — no se pueden enviar invitaciones todavía.');
    }

    const invitados = invitadosSnap.docs
      .map(doc => doc.data())
      .filter(inv => inv.proveedorEmail);
    if (!invitados.length) {
      return sendError(res, 400, 'No hay proveedores invitados con correo registrado en su ficha.');
    }

    const cc = [licitacion.responsableEmail, ...ccExtra].filter(Boolean).join(',') || undefined;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser.value(), pass: gmailAppPassword.value() },
    });

    const asunto = `Invitación a licitación — ${licitacion.codigoProyecto || ''} ${licitacion.nombreProyecto || ''}`.trim();
    const resultados = [];
    for (const inv of invitados) {
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 14px;">
          <p>Estimados <strong>${inv.proveedorNombre || ''}</strong>,</p>
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
            <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Entrega de Propuestas</td><td><strong>${formatearFechaEmail(licitacion.fechaEntregaPropuestas || licitacion.fechaEvaluacion)}</strong></td></tr>
          </table>
          <p style="margin-top:16px;">Saludos cordiales,<br/>Subdirección de Infraestructura — Universidad Católica de Temuco</p>
        </div>
      `.trim();

      try {
        await transporter.sendMail({
          from: `"Subdirección de Infraestructura UCT" <${gmailUser.value()}>`,
          to: inv.proveedorEmail,
          cc,
          subject: asunto,
          html: htmlBody,
        });
        resultados.push({ proveedorId: inv.proveedorId, email: inv.proveedorEmail, enviado: true });
      } catch (err) {
        console.error(`Error enviando invitación a ${inv.proveedorEmail}:`, err);
        resultados.push({ proveedorId: inv.proveedorId, email: inv.proveedorEmail, enviado: false, error: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }

    console.log(`Invitaciones de licitación ${licitacionId} procesadas por ${firebaseUser.email}: ${resultados.filter(r => r.enviado).length}/${resultados.length} enviadas.`);
    return res.json({ resultados });
  } catch (error) {
    console.error('Error enviando invitaciones de licitación', error);
    if (error.message === 'AUTH_REQUIRED') return sendError(res, 401, 'Debe iniciar sesión para enviar invitaciones.');
    return sendError(res, 500, error instanceof Error ? error.message : 'Error inesperado al enviar las invitaciones.');
  }
});
