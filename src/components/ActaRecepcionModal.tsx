import { useRef, useState } from 'react';
import { X, Printer, FileSignature, ShieldCheck, Download, Loader2, AlertCircle, RefreshCw, LockKeyhole } from 'lucide-react';
import type { LicitacionProyecto, ConfiguracionFirmas } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { updateLicitacion } from '../services/firestoreService';
import { generarPdfDesdeElemento } from '../services/pdfGenerator';
import {
  crearAcuerdoAdobeSign,
  obtenerEstadoAcuerdoAdobeSign,
  obtenerUrlFirmaAdobeSign,
  descargarDocumentoFirmadoAdobeSign,
  adobeSignConfigurado,
  esEstadoAdobeFirmado,
  type AdobeSignerInput,
} from '../services/adobeSignService';
import { useAuth } from '../context/AuthContext';
import { isProjectResponsible } from '../services/internalAccessService';

interface ActaRecepcionModalProps {
  licitacion: LicitacionProyecto;
  configFirmas: ConfiguracionFirmas;
  onClose: () => void;
}

function formatearFecha(fecha?: string): string {
  if (!fecha) return 'Pendiente';
  return new Intl.DateTimeFormat('es-CL').format(new Date(`${fecha}T12:00:00`));
}

export function ActaRecepcionModal({ licitacion, configFirmas, onClose }: ActaRecepcionModalProps) {
  const { user } = useAuth();
  const actaRef = useRef<HTMLDivElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const adobe = licitacion.actaRecepcionAdobe;
  const firmado = adobe ? esEstadoAdobeFirmado(adobe.status) : false;

  const enviarAFirmaDigital = async () => {
    if (!user) return alert('Debe iniciar sesión para enviar el acta a firma digital.');
    if (!adobeSignConfigurado()) {
      return alert('Acrobat Sign no está configurado en este entorno (falta VITE_ADOBE_SIGN_API_URL o los secretos del backend). Contacte al administrador del sistema.');
    }
    if (!actaRef.current) return;
    if (!confirm('¿Confirma generar el Acta de Recepción en PDF y enviarla a firma digital avanzada?')) return;

    setEnviando(true);
    setMensaje('Generando PDF del acta...');
    try {
      const nombreArchivo = `Acta_Recepcion_${licitacion.codigoProyecto || licitacion.id}.pdf`;
      const file = await generarPdfDesdeElemento(actaRef.current, nombreArchivo);

      const posiblesFirmantes: AdobeSignerInput[] = [
        {
          email: licitacion.responsableEmail || configFirmas.responsableDesarrollo.email || '',
          nombre: licitacion.responsableNombre || configFirmas.responsableDesarrollo.nombre,
          cargo: 'Responsable de Infraestructura',
          rolFirma: 'responsable',
        },
        {
          email: configFirmas.subdirectorInfraestructura.email || '',
          nombre: configFirmas.subdirectorInfraestructura.nombre,
          cargo: configFirmas.subdirectorInfraestructura.cargo,
          rolFirma: 'subdirector',
        },
      ];
      const signers = posiblesFirmantes.filter(signer => signer.email);

      if (!signers.length) {
        setMensaje('');
        return alert('No hay correos configurados para los firmantes (Responsable / Subdirector). Configure los emails antes de enviar a firma.');
      }

      setMensaje('Creando acuerdo en Acrobat Sign...');
      const acuerdo = await crearAcuerdoAdobeSign(user, file, nombreArchivo, signers, licitacion.id);

      await updateLicitacion(licitacion.id, {
        actaRecepcionAdobe: {
          agreementId: acuerdo.agreementId,
          status: acuerdo.status,
          nombreDocumento: nombreArchivo,
          fechaEnvio: new Date().toISOString(),
          enviadoPor: user.email || '',
        },
      });

      setMensaje('Acta enviada a firma digital avanzada correctamente.');
    } catch (error) {
      console.error('Error enviando acta a Acrobat Sign:', error);
      alert(error instanceof Error ? error.message : 'No se pudo enviar el acta a firma digital.');
      setMensaje('');
    } finally {
      setEnviando(false);
    }
  };

  const abrirUrlFirma = async () => {
    if (!user || !adobe) return;
    try {
      const url = await obtenerUrlFirmaAdobeSign(user, adobe.agreementId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo obtener el enlace de firma.');
    }
  };

  const verificarEstado = async () => {
    if (!user || !adobe) return;
    setVerificando(true);
    try {
      const actual = await obtenerEstadoAcuerdoAdobeSign(user, adobe.agreementId);
      await updateLicitacion(licitacion.id, {
        actaRecepcionAdobe: {
          ...adobe,
          status: actual.status,
          fechaUltimaVerificacion: new Date().toISOString(),
        },
      });
      setMensaje(`Estado actual: ${actual.status}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo verificar el estado.');
    } finally {
      setVerificando(false);
    }
  };

  const descargarFirmado = async () => {
    if (!user || !adobe) return;
    setDescargando(true);
    try {
      const blob = await descargarDocumentoFirmadoAdobeSign(user, adobe.agreementId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Acta_Recepcion_Firmada_${licitacion.codigoProyecto || licitacion.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo descargar el documento firmado.');
    } finally {
      setDescargando(false);
    }
  };

  const plazoOfertado = licitacion.plazoAdjudicadoDias ? `${licitacion.plazoAdjudicadoDias} días corridos` : 'No registrado';
  const observaciones = licitacion.recepcionConforme?.observaciones || 'Sin observaciones registradas.';
  const firmasInternaActa = licitacion.actaRecepcionFirmaInterna?.firmas || [];
  const firmaResponsableImg = firmasInternaActa.find(f => f.rolFirma === 'responsable')?.firmaImagenURL;
  const firmaSubdirectorImg = firmasInternaActa.find(f => f.rolFirma === 'subdirector')?.firmaImagenURL;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 max-h-[94vh] flex flex-col border border-slate-200">

        {/* Header UI (no se imprime) */}
        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-sky-100 text-sky-900 px-2.5 py-0.5 rounded">
              Acta de Recepción Conforme de Obra · Documento propuesto
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1">{licitacion.codigoProyecto} — {licitacion.nombreProyecto?.toLocaleUpperCase('es-CL')}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {/* Documento imprimible / capturable a PDF */}
          <div ref={actaRef} className="bg-white p-8 border border-slate-200 rounded-lg text-slate-900" style={{ width: '760px', margin: '0 auto', fontFamily: 'Georgia, serif' }}>
            <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
              <p className="text-[11px] font-bold uppercase tracking-wide">{configFirmas.institucion}</p>
              <p className="text-[10px] text-slate-600">{configFirmas.subdireccion}</p>
              <h1 className="text-lg font-bold mt-2 uppercase">Acta de Recepción Conforme de Obra</h1>
            </div>

            <table className="w-full text-xs mb-4">
              <tbody>
                <tr><td className="py-1 font-bold w-56">Código de Proyecto:</td><td>{licitacion.codigoProyecto}</td></tr>
                <tr><td className="py-1 font-bold">Centro de Costo (CP):</td><td>{licitacion.codigoCP}</td></tr>
                <tr><td className="py-1 font-bold">Nombre del proyecto:</td><td>{licitacion.nombreProyecto}</td></tr>
                <tr><td className="py-1 font-bold">Ubicación:</td><td>{licitacion.campusNombre || licitacion.campusSigla || '—'} {licitacion.edificioSigla ? `· Edificio ${licitacion.edificioSigla}` : ''}</td></tr>
                <tr><td className="py-1 font-bold">Proveedor adjudicado:</td><td>{licitacion.proveedorAdjudicadoNombre || '—'} (RUT {licitacion.proveedorAdjudicadoRut || '—'})</td></tr>
                <tr><td className="py-1 font-bold">Monto adjudicado:</td><td>{formatoMonedaCLP(licitacion.montoAdjudicadoTotal || 0)} IVA incluido</td></tr>
                <tr><td className="py-1 font-bold">Plazo ofertado:</td><td>{plazoOfertado}</td></tr>
                <tr><td className="py-1 font-bold">Fecha inicio de obra:</td><td>{formatearFecha(licitacion.fechaInicioObra)}</td></tr>
                <tr><td className="py-1 font-bold">Fecha de solicitud de recepción:</td><td>{formatearFecha(licitacion.recepcionConforme?.fechaSolicitud)}</td></tr>
              </tbody>
            </table>

            <p className="text-xs leading-relaxed text-justify mb-4">
              Se deja constancia de que la Universidad Católica de Temuco, a través de {licitacion.responsableNombre || 'el Responsable de Infraestructura'},
              verificó en terreno la ejecución de los trabajos contratados conforme a las bases técnicas, especificaciones y el itemizado adjudicado,
              declarando su <strong>recepción conforme</strong> en la fecha que se indica en las firmas de este documento.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-6">
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Observaciones</p>
              <p className="text-xs">{observaciones}</p>
            </div>

            <div className="grid grid-cols-2 gap-8 mt-10 text-center text-[10px]">
              <div>
                <div className="border-b border-slate-800 h-14 flex items-end justify-center pb-1">
                  {firmaResponsableImg && <img src={firmaResponsableImg} alt="Firma Responsable" className="max-h-12 max-w-[170px] object-contain" />}
                </div>
                <p className="mt-1 font-bold">{licitacion.responsableNombre || configFirmas.responsableDesarrollo.nombre}</p>
                <p className="text-slate-500">Responsable de Infraestructura</p>
              </div>
              <div>
                <div className="border-b border-slate-800 h-14 flex items-end justify-center pb-1">
                  {firmaSubdirectorImg && <img src={firmaSubdirectorImg} alt="Firma Sub-Director" className="max-h-12 max-w-[170px] object-contain" />}
                </div>
                <p className="mt-1 font-bold">{configFirmas.subdirectorInfraestructura.nombre}</p>
                <p className="text-slate-500">{configFirmas.subdirectorInfraestructura.cargo}</p>
              </div>
            </div>
          </div>

          {/* Panel de firma interna (hash + identidad Google) — mecanismo activo hoy */}
          <FirmaInternaRecepcionPanel licitacion={licitacion} configFirmas={configFirmas} />

          {/* Panel de firma digital avanzada (no se imprime) — para cuando se habilite Acrobat Sign */}
          <section className="bg-slate-900 text-white rounded-2xl p-5 space-y-3 opacity-90">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="font-black flex items-center gap-2"><FileSignature className="w-4 h-4 text-sky-300" /> Firma digital avanzada (Acrobat Sign) — opcional</h4>
              {adobe && (
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${firmado ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' : 'bg-amber-500/20 text-amber-200 border-amber-400/30'}`}>
                  {adobe.status}
                </span>
              )}
            </div>

            {!adobeSignConfigurado() && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Acrobat Sign no está configurado en este entorno (falta <code>VITE_ADOBE_SIGN_API_URL</code>). No es necesario para firmar el acta: la firma con identidad Google de arriba es el mecanismo oficial vigente.</span>
              </div>
            )}

            {!adobe ? (
              <button
                onClick={enviarAFirmaDigital}
                disabled={enviando}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                {enviando ? 'Enviando…' : 'Generar PDF y enviar a firma digital avanzada'}
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!firmado && (
                  <button onClick={abrirUrlFirma} className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-2">
                    <FileSignature className="w-4 h-4" /> Abrir enlace de firma
                  </button>
                )}
                <button onClick={verificarEstado} disabled={verificando} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2">
                  {verificando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Verificar estado
                </button>
                {firmado && (
                  <button onClick={descargarFirmado} disabled={descargando} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2">
                    {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar documento firmado
                  </button>
                )}
              </div>
            )}

            {mensaje && <p role="status" className="text-xs text-sky-200 bg-sky-950/40 border border-sky-800/40 rounded-lg px-3 py-2">{mensaje}</p>}

            {firmado && (
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">
                <ShieldCheck className="w-4 h-4" /> Acta de Recepción firmada digitalmente por ambas partes.
              </div>
            )}
          </section>

          <button onClick={() => window.print()} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" /> Imprimir / vista previa rápida
          </button>
        </div>
      </div>
    </div>
  );
}

type RolFirmaRecepcion = 'responsable' | 'subdirector';

function FirmaInternaRecepcionPanel({ licitacion, configFirmas }: {
  licitacion: LicitacionProyecto;
  configFirmas: ConfiguracionFirmas;
}) {
  const { user, profile, isAdmin } = useAuth();
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const roles: { id: RolFirmaRecepcion; nombre: string; cargo: string; email?: string }[] = [
    {
      id: 'responsable',
      nombre: licitacion.responsableNombre || configFirmas.responsableDesarrollo.nombre,
      cargo: 'Responsable de Infraestructura',
      email: licitacion.responsableEmail || configFirmas.responsableDesarrollo.email,
    },
    { id: 'subdirector', ...configFirmas.subdirectorInfraestructura },
  ];

  const firmaActual = licitacion.actaRecepcionFirmaInterna;
  const emailActual = (profile?.email || user?.email || '').toLowerCase();
  const rolPorEmail = roles.find(rol => rol.email?.toLowerCase() === emailActual)?.id;
  const esResponsableLicitacion = isProjectResponsible(user?.email, licitacion.responsableEmail);
  const puedeFirmar = Boolean(user) && (isAdmin || profile?.puedeFirmarActas === true || Boolean(rolPorEmail) || esResponsableLicitacion);
  const rolPendiente = roles.find(rol => !firmaActual?.firmas.some(f => f.rolFirma === rol.id))?.id || roles[0].id;
  const [rolSeleccionado, setRolSeleccionado] = useState<RolFirmaRecepcion>(rolPorEmail || (esResponsableLicitacion ? 'responsable' : rolPendiente));

  const rolesDisponibles = isAdmin || profile?.puedeFirmarActas === true
    ? roles
    : roles.filter(item => item.id === rolPorEmail || (esResponsableLicitacion && item.id === 'responsable'));

  const rol = rolesDisponibles.find(item => item.id === rolSeleccionado) || rolesDisponibles[0] || roles[0];
  const firmasRegistradas = firmaActual?.firmas || [];
  const completas = roles.every(item => firmasRegistradas.some(f => f.rolFirma === item.id));

  const firmar = async () => {
    if (!user || !puedeFirmar || !rol) return alert('Su usuario no tiene facultad registrada para firmar esta acta.');
    if (!confirm(`¿Confirma que desea firmar digitalmente el Acta de Recepción en calidad de ${rol.cargo}? Esta acción registrará su identidad de Google y la fecha actual.`)) return;

    setProcesando(true);
    setMensaje('Registrando firma segura...');
    try {
      const now = new Date().toISOString();
      const datosParaHash = `${licitacion.id}|acta-recepcion|${user.uid}|${now}`;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(datosParaHash));
      const sha256 = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      const nuevaFirma = {
        uid: user.uid,
        email: emailActual,
        nombre: profile?.displayName || user.displayName || emailActual,
        cargo: rol.cargo,
        rolFirma: rol.id,
        fecha: now,
        version: 1,
        sha256,
        ...(profile?.firmaImagenURL ? { firmaImagenURL: profile.firmaImagenURL } : {}),
      };

      const nuevasFirmas = [...firmasRegistradas.filter(f => f.rolFirma !== rol.id), nuevaFirma];
      const todasListas = roles.every(item => nuevasFirmas.some(f => f.rolFirma === item.id));

      await updateLicitacion(licitacion.id, {
        actaRecepcionFirmaInterna: {
          version: (firmaActual?.version || 0) + 1,
          estado: todasListas ? 'Firmada' : 'En firma',
          fechaActualizacion: now,
          firmas: nuevasFirmas,
        },
      });

      setMensaje(`Firma de ${rol.cargo} registrada exitosamente.`);
    } catch (error) {
      console.error('Error al firmar internamente el Acta de Recepción:', error);
      alert('Hubo un error al registrar su firma. Intente nuevamente.');
      setMensaje('');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h4 className="font-black flex items-center gap-2 text-sm"><FileSignature className="w-4 h-4 text-sky-300" /> Firma del Acta de Recepción</h4>
          <p className="text-[11px] text-slate-300 mt-0.5">Firma con su identidad de Google institucional — mecanismo oficial de firma para el Acta de Recepción.</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border shrink-0 ${completas ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' : 'bg-amber-500/20 text-amber-200 border-amber-400/30'}`}>
          {firmaActual?.estado || 'Pendiente de firmas'} · {firmasRegistradas.length}/{roles.length}
        </span>
      </div>

      <div className="p-5 grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          {roles.map(item => {
            const registrada = firmasRegistradas.find(f => f.rolFirma === item.id);
            return (
              <div key={item.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${registrada ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div>
                  <strong className="text-xs text-slate-900">{item.nombre}</strong>
                  <p className="text-[10px] text-slate-500">{item.cargo}</p>
                  {registrada && <p className="text-[9px] text-slate-400 mt-0.5">{new Date(registrada.fecha).toLocaleString('es-CL')}</p>}
                </div>
                <span className={`text-[9px] font-black uppercase ${registrada ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {registrada ? 'Firmado' : 'Pendiente'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          {puedeFirmar && !profile?.firmaImagenURL && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>No tiene una firma manuscrita registrada. Puede firmar igual (queda su identidad y hash), pero el acta no mostrará su firma. Suba una en <strong>Configuración → Firmas → Mi Firma Manuscrita</strong>.</span>
            </div>
          )}
          {puedeFirmar ? (
            <>
              <div>
                <label className="text-xs font-bold text-slate-700">Firmar en calidad de</label>
                <select value={rol.id} onChange={e => setRolSeleccionado(e.target.value as RolFirmaRecepcion)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold">
                  {rolesDisponibles.map(item => <option key={item.id} value={item.id}>{item.nombre} — {item.cargo}</option>)}
                </select>
              </div>
              {!completas ? (
                <button
                  onClick={firmar}
                  disabled={procesando || firmasRegistradas.some(f => f.rolFirma === rol.id)}
                  className="w-full py-2.5 bg-sky-700 hover:bg-sky-600 disabled:bg-slate-300 text-white rounded-xl text-xs font-black flex justify-center items-center gap-2"
                >
                  {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                  {firmasRegistradas.some(f => f.rolFirma === rol.id) ? 'Ya ha firmado en este rol' : 'Firmar Acta de Recepción'}
                </button>
              ) : (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs font-bold text-emerald-900 flex gap-2">
                  <ShieldCheck className="w-5 h-5 shrink-0" /> El acta ya cuenta con todas las firmas requeridas.
                </div>
              )}
              {mensaje && <p role="status" className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-900">{mensaje}</p>}
            </>
          ) : (
            <div className="rounded-xl bg-slate-100 border border-slate-200 p-4 text-xs text-slate-600 flex gap-2">
              <LockKeyhole className="w-4 h-4 shrink-0" />
              <span>{user ? 'Su usuario puede consultar el acta, pero no tiene facultad de firma.' : 'Debe iniciar sesión con una cuenta institucional para firmar.'}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
