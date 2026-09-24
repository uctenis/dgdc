import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Upload, CheckCircle2, AlertTriangle, AlertCircle,
  FileText, Save, Send, Clock, DollarSign, Calendar,
  X, FileSpreadsheet, Loader2, Download, LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToLicitacion,
  getPropuesta,
  savePropuesta,
  updateInvitadoEstado,
  getProveedorPorId,
  updateLicitacion,
  licitacionCerradaParaOfertas,
  registrarConfirmacionPropuesta,
} from '../services/firestoreService';
import { enviarConfirmacionPropuesta } from '../services/confirmacionPropuestaService';
import { uploadLicitacionDocument } from '../services/storageService';
import { generarFormatoPresupuestoExcel } from '../services/formatoPresupuestoExporter';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import type { LicitacionProyecto, Propuesta, Proveedor, DatosContratista } from '../types';
import { parseCotizacionExcel } from '../utils/excelParser';
import { plazoOfertasVencido, textoLimiteOfertas, tiempoRestanteOfertas } from '../utils/plazoOfertas';
import { DatosContratistaForm } from '../components/DatosContratistaForm';
import { datosContratistaVacios, datosContratistaCompletos } from '../utils/datosContratista';
import { parseCotizacionPdf } from '../utils/pdfParser';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';

interface LicitacionDetalleProps {
  /** Vista de administrador: se ve como este proveedor, sin sesión de proveedor. */
  proveedorIdVista?: string;
  /** true = solo lectura (no permite cargar, guardar ni enviar propuestas). */
  soloLectura?: boolean;
  /** SOLO servidor local: muestra la pantalla con esta licitación de ejemplo, sin leer ni escribir en Firebase. */
  demoLicitacion?: LicitacionProyecto;
  demoProveedor?: Proveedor;
}

export function LicitacionDetalle({ proveedorIdVista, soloLectura = false, demoLicitacion, demoProveedor }: LicitacionDetalleProps = {}) {
  const { id: licitacionId } = useParams<{ id: string }>();
  const { profile, user, logout } = useAuth();
  const navigate = useNavigate();

  const [licitacion, setLicitacion] = useState<LicitacionProyecto | null>(null);
  const [propuesta, setPropuesta] = useState<Partial<Propuesta>>({
    ajustaRequerimientos: true,
    cuentaExperiencia: true,
    cumplePlazoRequerido: true,
    declaraSustentabilidad: false,
  });
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState('');
  const [parsedFeedback, setParsedFeedback] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTecRef = useRef<HTMLInputElement>(null);
  const [uploadTecPct, setUploadTecPct] = useState<number | null>(null);
  const [descargandoFormato, setDescargandoFormato] = useState(false);
  const [proveedorDatos, setProveedorDatos] = useState<Proveedor | null>(demoProveedor ?? null);
  const [confirmacionMsg, setConfirmacionMsg] = useState('');
  const [datosContrato, setDatosContrato] = useState<DatosContratista>(datosContratistaVacios());
  const datosContratoIniciados = useRef(false);

  // Precarga los datos de representación legal: lo ya enviado en la propuesta, o lo de la ficha de la empresa.
  useEffect(() => {
    if (datosContratoIniciados.current) return;
    const guardados = propuesta.datosContrato || proveedorDatos?.datosContrato;
    if (guardados) {
      setDatosContrato(guardados);
      datosContratoIniciados.current = true;
    }
  }, [propuesta.datosContrato, proveedorDatos]);

  const proveedorId = proveedorIdVista ?? profile?.proveedorId ?? '';

  // Computed
  const iva = Math.round((propuesta.montoNeto ?? 0) * 0.19);
  const total = (propuesta.montoNeto ?? 0) + iva;

  // El portal cierra a la hora indicada: se reevalúa cada 15 s para bloquearlo justo al cierre.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const vencida = licitacion ? plazoOfertasVencido(licitacion, new Date(ahora)) : false;
  const yaEnviada = propuesta.estado === 'Enviada';
  const procesoCerrado = licitacion ? licitacionCerradaParaOfertas(licitacion) : false;
  const canEdit = !soloLectura && !vencida && !yaEnviada && licitacion?.estado === 'En Evaluacion';

  const [proveedorRut, setProveedorRut] = useState('');

  useEffect(() => {
    if (demoLicitacion) {
      setLicitacion(demoLicitacion);
      setLoading(false);
      return;
    }
    if (!licitacionId || !proveedorId) return;

    // Cargar licitación
    const avisarErrorLectura = (err: unknown) => {
      console.error('Error cargando la licitación en el portal:', err);
      const code = (err as { code?: string })?.code;
      setErrorCarga(
        code === 'permission-denied'
          ? 'No hay permiso para leer los datos: falta una sesión válida de Firebase. Si está probando en local, inicie sesión primero en el sistema interno en este mismo navegador y vuelva a abrir el enlace.'
          : 'No se pudo cargar la licitación. Intente nuevamente.'
      );
    };

    // Solo ESTA licitación (nunca la colección completa): el proveedor no debe descargar datos de otras.
    const unsub = subscribeToLicitacion(licitacionId, found => setLicitacion(found), avisarErrorLectura);

    // Cargar RUT del proveedor
    // Solo la ficha de SU empresa (no el catálogo de proveedores).
    getProveedorPorId(proveedorId).then(p => {
      if (p) { setProveedorRut(p.rut); setProveedorDatos(p); }
    }).catch(() => { /* el RUT es opcional en pantalla */ });

    // Cargar propuesta existente
    getPropuesta(licitacionId, proveedorId)
      .then(p => { if (p) setPropuesta(p); })
      .catch(avisarErrorLectura)
      .finally(() => setLoading(false));

    return unsub;
  }, [licitacionId, proveedorId]);

  const handleFileUpload = async (file: File) => {
    if (demoLicitacion) { alert('Vista de demostración: no se sube ningún archivo.'); return; }
    if (soloLectura || !licitacionId || !proveedorId) return;
    if (licitacion && plazoOfertasVencido(licitacion)) { alert(`El portal se cerró el ${textoLimiteOfertas(licitacion)}. Ya no es posible subir archivos.`); return; }
    if (procesoCerrado) {
      alert('Proceso cerrado: la licitación ya fue adjudicada y no acepta nuevas ofertas.');
      return;
    }
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const tipo = isExcel ? 'excel' : 'pdf';
    setUploadPct(0);

    try {
      // 1. Subida del archivo a Firebase Storage
      setUploadPct(5);
      const url = await uploadLicitacionDocument(licitacionId, 'ofertas', file, pct => setUploadPct(Math.round(pct * 0.6)), proveedorId);
      setUploadPct(60);
      
      // 2. Lectura e inteligencia de datos (Excel / PDF)
      let parsedData: any = null;
      if (isExcel) {
        parsedData = await parseCotizacionExcel(file);
      } else if (isPdf) {
        parsedData = await parseCotizacionPdf(file);
      }

      const feedbackList: string[] = [];
      if (parsedData?.rutProveedor) {
        setProveedorRut(parsedData.rutProveedor);
        feedbackList.push(`✓ RUT extraído del documento: ${parsedData.rutProveedor}`);
      }

      if (parsedData?.detallesLeidos && parsedData.detallesLeidos.length > 0) {
        feedbackList.push(...parsedData.detallesLeidos);
      } else if (feedbackList.length === 0) {
        feedbackList.push(`Archivo ${isExcel ? 'Excel' : 'PDF'} cargado exitosamente.`);
      }

      setParsedFeedback(feedbackList);

      setPropuesta(prev => ({
        ...prev,
        archivoNombre: file.name,
        archivoURL: url,
        archivoTipo: tipo,
        ...(parsedData?.montoNeto ? { montoNeto: parsedData.montoNeto } : {}),
        ...(parsedData?.plazoDias ? { plazoDias: parsedData.plazoDias } : {}),
        ...(parsedData?.fechaCotizacion ? { fechaCotizacion: parsedData.fechaCotizacion } : {}),
        ...(parsedData?.itemizado?.length ? { itemizado: parsedData.itemizado } : {}),
      }));
      setUploadPct(100);
    } catch (err) {
      console.error('Error al subir/leer archivo:', err);
    } finally {
      setUploadPct(null);
    }
  };

  const handleTecnicoUpload = async (file: File) => {
    if (demoLicitacion) { alert('Vista de demostración: no se sube ningún archivo.'); return; }
    if (soloLectura || !licitacionId || !proveedorId) return;
    if (licitacion && plazoOfertasVencido(licitacion)) { alert(`El portal se cerró el ${textoLimiteOfertas(licitacion)}. Ya no es posible subir archivos.`); return; }
    if (procesoCerrado) {
      alert('Proceso cerrado: la licitación ya fue adjudicada y no acepta nuevas ofertas.');
      return;
    }
    setUploadTecPct(5);
    try {
      const url = await uploadLicitacionDocument(licitacionId, 'ofertas', file, pct => setUploadTecPct(pct), proveedorId);
      setPropuesta(prev => ({ ...prev, archivoTecnicoNombre: file.name, archivoTecnicoURL: url }));
    } catch (err) {
      console.error('Error subiendo la oferta técnica:', err);
      alert('No se pudo subir el archivo de la oferta técnica. Intente nuevamente.');
    } finally {
      setUploadTecPct(null);
    }
  };

  const descargarFormato = async () => {
    if (!licitacion) return;
    setDescargandoFormato(true);
    try {
      // El formato sale con los datos de la empresa invitada ya completados.
      await generarFormatoPresupuestoExcel(licitacion, {
        razonSocial: proveedorDatos?.razonSocial || profile?.displayName || '',
        rut: proveedorDatos?.rut || proveedorRut,
        nombreContacto: proveedorDatos?.nombreContacto,
        email: proveedorDatos?.email || profile?.email,
        telefono: proveedorDatos?.telefono,
        direccion: proveedorDatos?.direccion,
        ciudad: proveedorDatos?.ciudad,
      });
    } catch (err) {
      console.error('Error generando el formato de presupuesto:', err);
      alert('No se pudo generar el formato de presupuesto. Intente nuevamente.');
    } finally {
      setDescargandoFormato(false);
    }
  };

  // Confirmación por correo al proveedor de que su oferta fue recibida (simulada en modo prueba).
  const confirmarPorCorreo = async (enviada: Partial<Propuesta>) => {
    if (!user || !licitacion || !licitacionId) return;
    const email = proveedorDatos?.email || profile?.email || user.email || '';
    const nombre = proveedorDatos?.razonSocial || profile?.displayName || '';
    try {
      const conf = await enviarConfirmacionPropuesta(user, licitacion, enviada, nombre, email);
      setConfirmacionMsg(conf.modo === 'real'
        ? `Le enviamos un correo de confirmación a ${conf.email}.`
        : `[MODO PRUEBA] No se envió ningún correo real. Se habría enviado una confirmación a ${conf.email}.`);
      setPropuesta(prev => ({ ...prev, confirmacionCorreo: conf }));
      if (conf.modo === 'prueba') {
        await registrarConfirmacionPropuesta(licitacionId, proveedorId, conf).catch(err => console.warn('No se pudo registrar la confirmación:', err));
      }
    } catch (err) {
      console.error('Error enviando la confirmación por correo:', err);
      setConfirmacionMsg('Su oferta fue recibida, pero no pudimos enviar el correo de confirmación. Conserve este comprobante en pantalla.');
    }
  };

  const handleSave = async (estado: 'Borrador' | 'Enviada') => {
    if (demoLicitacion) { alert('Vista de demostración: no se guarda ni se envía nada.'); return; }
    if (soloLectura) return;
    if (licitacion && plazoOfertasVencido(licitacion)) { alert(`El portal se cerró el ${textoLimiteOfertas(licitacion)}. Ya no es posible guardar ni enviar su propuesta.`); return; }
    if (!licitacionId || !proveedorId || !profile) return;
    if (procesoCerrado) {
      alert('Proceso cerrado: no es posible guardar ni enviar propuestas después de la adjudicación.');
      return;
    }
    if (estado === 'Enviada' && (!propuesta.archivoNombre || !propuesta.archivoURL)) {
      alert('Para enviar la propuesta debe adjuntar su oferta económica (el formato de presupuesto completado).');
      return;
    }
    if (estado === 'Enviada' && (!propuesta.archivoTecnicoNombre || !propuesta.archivoTecnicoURL)) {
      alert('Para enviar la propuesta debe adjuntar también su oferta técnica.');
      return;
    }
    if (estado === 'Enviada' && !datosContratistaCompletos(datosContrato)) {
      alert('Complete los datos para el contrato: representante(s) legal(es) con su cédula de identidad, domicilio legal y personería.');
      return;
    }
    if (estado === 'Enviada' && (!propuesta.itemizado || propuesta.itemizado.length === 0)) {
      alert('No se detectó el itemizado en su oferta económica. Use el formato de presupuesto descargable y complete la Cantidad y el Precio Unitario de cada partida.');
      return;
    }
    const setter = estado === 'Enviada' ? setSending : setSaving;
    setter(true);

    const data: Omit<Propuesta, 'id'> = {
      licitacionId,
      proveedorId,
      proveedorUid: profile.uid,
      proveedorNombre: profile.displayName,
      proveedorRut,
      montoNeto: propuesta.montoNeto ?? 0,
      montoIva: iva,
      montoTotal: total,
      plazoDias: propuesta.plazoDias ?? 0,
      itemizado: propuesta.itemizado,
      fechaCotizacion: propuesta.fechaCotizacion,
      ajustaRequerimientos: propuesta.ajustaRequerimientos ?? false,
      cuentaExperiencia: propuesta.cuentaExperiencia ?? false,
      cumplePlazoRequerido: propuesta.cumplePlazoRequerido ?? false,
      declaraSustentabilidad: propuesta.declaraSustentabilidad ?? false,
      tipoEvidenciaSustentable: propuesta.tipoEvidenciaSustentable,
      archivoNombre: propuesta.archivoNombre,
      archivoURL: propuesta.archivoURL,
      archivoTipo: propuesta.archivoTipo,
      ...(propuesta.archivoTecnicoNombre ? { archivoTecnicoNombre: propuesta.archivoTecnicoNombre } : {}),
      ...(propuesta.archivoTecnicoURL ? { archivoTecnicoURL: propuesta.archivoTecnicoURL } : {}),
      observaciones: propuesta.observaciones,
      datosContrato,
      fechaEnvio: new Date().toISOString(),
      estado,
    };

    try {
      await savePropuesta(licitacionId, proveedorId, data);
      if (estado === 'Enviada') {
        await updateInvitadoEstado(licitacionId, proveedorId, 'Presentada');
      }
      setPropuesta(prev => ({ ...prev, ...data }));
      if (estado === 'Enviada') void confirmarPorCorreo({ ...propuesta, ...data });
      setSavedMsg(estado === 'Enviada' ? '¡Propuesta enviada exitosamente!' : 'Borrador guardado.');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (error) {
      const mensaje = error instanceof Error && error.message.includes('PLAZO_VENCIDO')
        ? 'El plazo de entrega de propuestas para esta licitación ya venció. No es posible enviar ni modificar su propuesta.'
        : error instanceof Error && error.message.includes('PROCESO_CERRADO')
        ? 'Proceso cerrado: la licitación fue adjudicada mientras esta página estaba abierta.'
        : 'No fue posible guardar la propuesta. Intente nuevamente.';
      alert(mensaje);
    } finally {
      setter(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#0f172a,#1e3a8a)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
      </div>
    );
  }

  if (!licitacion) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={{ background: 'linear-gradient(160deg,#0f172a,#1e3a8a)' }}>
        <div className="max-w-md text-center space-y-2 px-4">
          <p className="font-bold">{errorCarga ? 'No se pudo abrir la licitación' : 'Licitación no encontrada.'}</p>
          {errorCarga && <p className="text-sm text-slate-300 leading-relaxed">{errorCarga}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: 'linear-gradient(160deg,#0f172a 0%,#1e3a8a 45%,#0c4a6e 100%)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 px-6 py-4 flex items-center gap-4"
        style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        {soloLectura && (
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition" title="Volver al sistema">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div>
          <p className="text-[10px] text-sky-400 font-semibold uppercase tracking-wider">Presentar Propuesta</p>
          <p className="text-sm font-bold text-white leading-tight line-clamp-1">{licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}</p>
        </div>
        <div className="flex-1" />
        {procesoCerrado && (
          <span className="flex items-center gap-1.5 text-amber-300 text-xs font-bold">
            <AlertTriangle className="w-4 h-4" /> Proceso Cerrado
          </span>
        )}
        {!procesoCerrado && yaEnviada && (
          <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" /> Propuesta Enviada
          </span>
        )}
        {!procesoCerrado && vencida && !yaEnviada && (
          <span className="flex items-center gap-1.5 text-red-400 text-xs font-bold">
            <AlertTriangle className="w-4 h-4" /> Plazo Vencido
          </span>
        )}
        {!soloLectura && !demoLicitacion && (
          <button
            onClick={async () => { await logout(); navigate('/portal/login', { replace: true }); }}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white transition"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Info card */}
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{licitacion.codigoProyecto}</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{licitacion.descripcion}</p>
          <div className="flex items-center gap-4 pt-1">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              Cierre: <span className="text-sky-300 font-semibold">{textoLimiteOfertas(licitacion)}</span>
            </span>
            {!vencida && (
              <span className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
                <Clock className="w-3.5 h-3.5" />
                {tiempoRestanteOfertas(licitacion, new Date(ahora))} restantes
              </span>
            )}
          </div>

          {(licitacion.fechaVisitaTerreno || licitacion.fechaRecepcionConsultas || licitacion.fechaRespuestaConsultas) && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-[10px]">
              {licitacion.fechaVisitaTerreno && (
                <div>
                  <span className="text-slate-500 block">Visita a Terreno</span>
                  <strong className="text-slate-200">{new Date(`${licitacion.fechaVisitaTerreno}T12:00:00`).toLocaleDateString('es-CL')}</strong>
                </div>
              )}
              {licitacion.fechaRecepcionConsultas && (
                <div>
                  <span className="text-slate-500 block">Recepción Consultas</span>
                  <strong className="text-slate-200">{new Date(`${licitacion.fechaRecepcionConsultas}T12:00:00`).toLocaleDateString('es-CL')}</strong>
                </div>
              )}
              {licitacion.fechaRespuestaConsultas && (
                <div>
                  <span className="text-slate-500 block">Respuesta Consultas</span>
                  <strong className="text-slate-200">{new Date(`${licitacion.fechaRespuestaConsultas}T12:00:00`).toLocaleDateString('es-CL')}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Antecedentes técnicos y Bases — descarga directa */}
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            Bases y Antecedentes Técnicos
          </h3>
          {licitacion.antecedentesTecnicos && licitacion.antecedentesTecnicos.length > 0 ? (
            <div className="space-y-1.5">
              {licitacion.antecedentesTecnicos.filter(doc => doc.tipo !== 'Presupuesto' && doc.archivoURL && doc.archivoURL !== '#').map(doc => (
                <a
                  key={doc.id}
                  href={doc.archivoURL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3.5 py-2.5 transition"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-100 block truncate">{doc.nombre}</span>
                    <span className="text-[10px] text-slate-400">{doc.tipo}</span>
                  </div>
                  <Download className="w-4 h-4 text-sky-400 shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Aún no hay documentos de antecedentes disponibles para esta licitación.</p>
          )}
        </div>

        {/* Comprobante: oferta enviada */}
        {yaEnviada && (
          <div
            className="rounded-2xl p-5 space-y-1.5"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)' }}
          >
            <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Su oferta fue enviada correctamente
            </h3>
            {propuesta.fechaEnvio && (
              <p className="text-xs text-emerald-100">Enviada el {new Date(propuesta.fechaEnvio).toLocaleString('es-CL')}. Ya está a la vista de la Subdirección de Infraestructura.</p>
            )}
            {(confirmacionMsg || propuesta.confirmacionCorreo) && (
              <p className="text-xs text-emerald-200/90">
                {confirmacionMsg || (propuesta.confirmacionCorreo?.modo === 'real'
                  ? `Confirmación enviada por correo a ${propuesta.confirmacionCorreo.email}.`
                  : `[MODO PRUEBA] Confirmación simulada para ${propuesta.confirmacionCorreo?.email}: no se envió ningún correo real.`)}
              </p>
            )}
          </div>
        )}

        {/* Formato de presupuesto — partidas del proyecto sin cantidades ni precios, para completar */}
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Formato de presupuesto
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Descargue el formato en Excel: trae las partidas del proyecto ({licitacion.formatoPresupuesto?.length || 0} partidas) y los datos de su empresa ya completados.
            Complete la <strong className="text-slate-300">Cantidad</strong> y el <strong className="text-slate-300">Precio Unitario</strong> de cada partida y súbalo más abajo como su oferta económica.
          </p>
          <button
            type="button"
            onClick={descargarFormato}
            disabled={descargandoFormato}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
          >
            {descargandoFormato ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Descargar formato de presupuesto (.xlsx)
          </button>
        </div>

        {/* Status overlay */}
        {!canEdit && (
          <div
            className="rounded-2xl p-4 flex items-center gap-3 text-sm"
            style={{
              background: procesoCerrado ? 'rgba(245,158,11,0.12)' : yaEnviada ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${procesoCerrado ? 'rgba(245,158,11,0.3)' : yaEnviada ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              color: procesoCerrado ? '#fcd34d' : yaEnviada ? '#6ee7b7' : '#fca5a5',
            }}
          >
            {yaEnviada && !procesoCerrado ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            {procesoCerrado
              ? 'La licitación fue adjudicada y el proceso de recepción de ofertas está cerrado. Su propuesta queda disponible únicamente como antecedente.'
              : yaEnviada
                ? 'Su propuesta fue enviada exitosamente. No puede realizar más cambios.'
                : `El portal de recepción de ofertas se cerró el ${textoLimiteOfertas(licitacion)}. Ya no es posible enviar ni modificar propuestas.`}
          </div>
        )}

        {/* Formulario */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" /> Oferta Económica — Datos
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-sky-300 mb-1.5">Monto Neto (sin IVA) *</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-400 font-bold text-sm">$</span>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={formatearEnteroConMiles(propuesta.montoNeto)}
                  onChange={e => setPropuesta(p => ({ ...p, montoNeto: desformatearEntero(e.target.value) }))}
                  placeholder="12.500.000"
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl text-sm text-white font-bold outline-none disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-sky-300 mb-1.5">Plazo de Ejecución (días corridos) *</label>
              <input
                type="number"
                disabled={!canEdit}
                value={propuesta.plazoDias ?? ''}
                onChange={e => setPropuesta(p => ({ ...p, plazoDias: Number(e.target.value) }))}
                placeholder="0"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
              />
            </div>
          </div>

          {/* Resumen montos */}
          {(propuesta.montoNeto ?? 0) > 0 && (
            <div
              className="rounded-xl p-4 text-xs space-y-1.5"
              style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex justify-between text-slate-400"><span>Monto Neto</span><span className="text-white font-semibold">{formatoMonedaCLP(propuesta.montoNeto ?? 0)}</span></div>
              <div className="flex justify-between text-slate-400"><span>IVA (19%)</span><span className="text-white font-semibold">{formatoMonedaCLP(iva)}</span></div>
              <div className="flex justify-between text-sky-300 font-bold pt-1.5 border-t border-white/10">
                <span>Total con IVA</span><span>{formatoMonedaCLP(total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Upload archivo */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" /> Oferta Económica — Archivo
          </h3>
          <p className="text-xs text-slate-500">
            Suba el <strong className="text-slate-400">formato de presupuesto completado</strong> (Excel .xlsx; también se acepta PDF).
            Descárguelo arriba, en "Formato de presupuesto": el sistema lee los precios y calcula el monto solo.
          </p>

          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.pdf"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{
                  background: 'rgba(56,189,248,0.1)',
                  border: '2px dashed rgba(56,189,248,0.3)',
                  color: '#7dd3fc',
                }}
              >
                <Upload className="w-4 h-4" />
                {propuesta.archivoNombre ? 'Cambiar archivo' : 'Seleccionar archivo'}
              </button>
            </>
          )}

          {/* Progress */}
          {uploadPct !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Subiendo archivo...</span><span>{uploadPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </div>
          )}

          {/* File chip */}
          {propuesta.archivoNombre && (
            <div className="space-y-2">
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                {propuesta.archivoTipo === 'excel' ? (
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <FileText className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <a
                  href={propuesta.archivoURL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-300 hover:underline flex-1 truncate"
                >
                  {propuesta.archivoNombre}
                </a>
                {canEdit && (
                  <button
                    onClick={() => {
                      setPropuesta(p => ({ ...p, archivoNombre: undefined, archivoURL: undefined }));
                      setParsedFeedback(null);
                    }}
                    className="text-slate-500 hover:text-red-400 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Feedback de Lectura Automática */}
              {parsedFeedback && parsedFeedback.length > 0 && (
                <div
                  className="rounded-xl p-3.5 text-xs space-y-1.5"
                  style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: '#7dd3fc' }}
                >
                  <span className="font-bold flex items-center gap-1.5 text-sky-300">
                    ✨ Lectura Automática del Archivo de Cotización:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90">
                    {parsedFeedback.map((msg, idx) => (
                      <li key={idx}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Criterios técnicos */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-400" /> Criterios Técnicos y de Sustentabilidad
          </h3>
          <p className="text-[11px] text-slate-500">
            Estos factores son considerados en la evaluación (35% técnico + 10% sustentabilidad).
            Sea preciso — el administrador puede solicitarle documentación de respaldo.
          </p>

          {[
            { key: 'ajustaRequerimientos', label: 'a) Los procedimientos y materiales propuestos se ajustan a los requerimientos de la UCT', weight: '35%' },
            { key: 'cuentaExperiencia', label: 'b) Cuenta con experiencia acreditada (cartas de referencia, contratos previos similares)', weight: '35%' },
            { key: 'cumplePlazoRequerido', label: 'c) El servicio se puede ejecutar dentro del plazo requerido por la institución', weight: '35%' },
          ].map(item => (
            <label
              key={item.key}
              className="flex items-start gap-3 cursor-pointer group"
              style={{ opacity: canEdit ? 1 : 0.6 }}
            >
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={propuesta[item.key as keyof Propuesta] as boolean ?? false}
                onChange={e => setPropuesta(p => ({ ...p, [item.key]: e.target.checked }))}
                className="mt-0.5 w-4 h-4 rounded accent-sky-500"
              />
              <span className="text-xs text-slate-300 group-hover:text-white transition leading-relaxed">
                {item.label}
              </span>
            </label>
          ))}

          <div className="pt-2 border-t border-white/10">
            <label className="flex items-start gap-3 cursor-pointer group" style={{ opacity: canEdit ? 1 : 0.6 }}>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={propuesta.declaraSustentabilidad ?? false}
                onChange={e => setPropuesta(p => ({ ...p, declaraSustentabilidad: e.target.checked }))}
                className="mt-0.5 w-4 h-4 rounded accent-emerald-500"
              />
              <span className="text-xs text-slate-300 group-hover:text-white transition leading-relaxed">
                d) Declara cumplimiento sustentable: cuenta con certificación ambiental o firma carta compromiso sustentable (10%)
              </span>
            </label>
            {propuesta.declaraSustentabilidad && (
              <div className="mt-3 ml-7">
                <label className="block text-xs font-semibold text-emerald-300 mb-1.5">Tipo de evidencia:</label>
                <select
                  disabled={!canEdit}
                  value={propuesta.tipoEvidenciaSustentable ?? ''}
                  onChange={e => setPropuesta(p => ({ ...p, tipoEvidenciaSustentable: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-xs text-white outline-none disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <option value="">— Seleccione —</option>
                  <option value="Certificado Ambiental">Certificado Ambiental (ISO 14001, SIGA u otro)</option>
                  <option value="Carta Compromiso">Carta Compromiso Sustentable Firmada</option>
                  <option value="Certificado de Gestión de Residuos">Certificado de Gestión de Residuos</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Observaciones */}
        <div
          className="rounded-2xl p-6 space-y-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <label className="block text-sm font-bold text-white">Observaciones adicionales</label>
          <textarea
            rows={3}
            disabled={!canEdit}
            value={propuesta.observaciones ?? ''}
            onChange={e => setPropuesta(p => ({ ...p, observaciones: e.target.value }))}
            placeholder="Condiciones de pago, garantías, consideraciones especiales..."
            className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none resize-none placeholder:text-slate-600 disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          />
        </div>

        {/* Oferta técnica */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-violet-400" /> Oferta Técnica — Archivo
          </h3>
          <p className="text-xs text-slate-500">
            Suba su propuesta técnica: metodología de trabajo, materiales, equipo, carta Gantt y experiencia acreditada.
            Formatos: <strong className="text-slate-400">PDF, Word o Excel</strong>.
          </p>

          {canEdit && (
            <>
              <input
                ref={fileTecRef}
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.zip"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleTecnicoUpload(e.target.files[0])}
              />
              <button
                type="button"
                onClick={() => fileTecRef.current?.click()}
                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{ background: 'rgba(167,139,250,0.1)', border: '2px dashed rgba(167,139,250,0.35)', color: '#c4b5fd' }}
              >
                <Upload className="w-4 h-4" />
                {propuesta.archivoTecnicoNombre ? 'Cambiar archivo' : 'Seleccionar archivo'}
              </button>
            </>
          )}

          {uploadTecPct !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400"><span>Subiendo archivo...</span><span>{uploadTecPct}%</span></div>
              <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                <div className="h-full bg-violet-500 transition-all duration-300 rounded-full" style={{ width: `${uploadTecPct}%` }} />
              </div>
            </div>
          )}

          {propuesta.archivoTecnicoNombre && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
              <a href={propuesta.archivoTecnicoURL} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 hover:underline flex-1 truncate">
                {propuesta.archivoTecnicoNombre}
              </a>
              {canEdit && (
                <button
                  onClick={() => setPropuesta(p => ({ ...p, archivoTecnicoNombre: undefined, archivoTecnicoURL: undefined }))}
                  className="text-slate-500 hover:text-red-400 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Datos para el contrato (representación legal) */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-300" /> Datos para el contrato — Representación legal
          </h3>
          <p className="text-xs text-slate-500">
            Se usarán únicamente para redactar el contrato si su empresa resulta adjudicada: quién lo firma, su domicilio legal y la personería que acredita a los representantes.
          </p>
          <DatosContratistaForm value={datosContrato} onChange={setDatosContrato} tema="oscuro" disabled={!canEdit} />
        </div>

        {/* Success message */}
        {savedMsg && (
          <div
            className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}
          >
            <CheckCircle2 className="w-4 h-4" /> {savedMsg}
          </div>
        )}

        {/* Recepción Conforme de Trabajos Solicitada / Aprobada */}
        {licitacion?.proveedorGanadorId === proveedorId && (
          <div className="rounded-2xl p-5 border space-y-3" style={{ background: 'rgba(30,41,59,0.7)', borderColor: 'rgba(56,189,248,0.2)' }}>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Recepción Conforme de Trabajos (Término de Obra)
            </h4>
            <p className="text-xs text-slate-300">
              Una vez completados los trabajos físicos en el campus, solicite la Recepción Conforme para la aprobación del Responsable de Infraestructura ({licitacion.responsableNombre || 'Subdirección'}).
            </p>

            {licitacion.recepcionConforme?.aprobada ? (
              <div className="bg-emerald-950/60 border border-emerald-500/40 p-3 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                Obra Finalizada con Recepción Conforme Aprobada ({licitacion.recepcionConforme.fechaAprobacion})
              </div>
            ) : licitacion.recepcionConforme?.solicitada ? (
              <div className="bg-amber-950/60 border border-amber-500/40 p-3 rounded-xl text-amber-300 text-xs font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                Recepción Conforme Solicitada el {licitacion.recepcionConforme.fechaSolicitud}. En revisión por {licitacion.responsableNombre || 'el Responsable UCT'}.
              </div>
            ) : (
              <div className="space-y-2">
                {licitacion.recepcionConforme?.objetada && (
                  <div className="bg-rose-950/60 border border-rose-500/40 p-3 rounded-xl text-rose-300 text-xs">
                    <span className="font-semibold flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      Solicitud objetada el {licitacion.recepcionConforme.fechaObjecion}
                    </span>
                    <span>Motivo: "{licitacion.recepcionConforme.observaciones}". Corrija y vuelva a solicitar.</span>
                  </div>
                )}
                <button
                  onClick={async () => {
                    if (!licitacionId) return;
                    await updateLicitacion(licitacionId, {
                      recepcionConforme: {
                        solicitada: true,
                        fechaSolicitud: new Date().toISOString().split('T')[0],
                        aprobada: false,
                        objetada: false,
                      },
                      estadoLifecycle: 'Recepcion_Solicitada',
                    });
                    alert('¡Solicitud de Recepción Conforme enviada con éxito al Responsable del Proyecto!');
                  }}
                  className="w-full py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Solicitar Recepción Conforme al Responsable UCT
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {canEdit && (
          <div className="flex gap-3">
            <button
              onClick={() => handleSave('Borrador')}
              disabled={saving}
              className="flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Borrador
            </button>
            <button
              onClick={() => {
                if (!propuesta.montoNeto || !propuesta.plazoDias) {
                  alert('Complete el monto neto y el plazo antes de enviar.');
                  return;
                }
                if (confirm('¿Confirma que desea enviar su propuesta? Una vez enviada no podrá editarla.')) {
                  handleSave('Enviada');
                }
              }}
              disabled={sending}
              className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all text-white"
              style={{
                background: sending ? 'rgba(16,185,129,0.3)' : 'linear-gradient(135deg,#10b981,#059669)',
                boxShadow: sending ? 'none' : '0 4px 16px -2px rgba(16,185,129,0.4)',
              }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar Propuesta
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
