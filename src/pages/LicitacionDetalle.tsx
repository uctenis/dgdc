import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Upload, CheckCircle2, AlertTriangle, AlertCircle,
  FileText, Save, Send, Clock, DollarSign, Calendar,
  X, FileSpreadsheet, Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToLicitaciones,
  getPropuesta,
  savePropuesta,
  updateInvitadoEstado,
  getProveedores,
  updateLicitacion,
  licitacionCerradaParaOfertas,
} from '../services/firestoreService';
import { uploadFileToProjectFolder } from '../services/driveService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import type { LicitacionProyecto, Propuesta } from '../types';
import { parseCotizacionExcel } from '../utils/excelParser';
import { parseCotizacionPdf } from '../utils/pdfParser';
import { formatearEnteroConMiles, desformatearEntero } from '../utils/rutUtils';

export function LicitacionDetalle() {
  const { id: licitacionId } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [licitacion, setLicitacion] = useState<LicitacionProyecto | null>(null);
  const [propuesta, setPropuesta] = useState<Partial<Propuesta>>({
    ajustaRequerimientos: true,
    cuentaExperiencia: true,
    cumplePlazoRequerido: true,
    declaraSustentabilidad: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState('');
  const [parsedFeedback, setParsedFeedback] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const proveedorId = profile?.proveedorId ?? '';

  // Computed
  const iva = Math.round((propuesta.montoNeto ?? 0) * 0.19);
  const total = (propuesta.montoNeto ?? 0) + iva;

  const vencida = licitacion
    ? new Date() > new Date(licitacion.fechaEvaluacion)
    : false;
  const yaEnviada = propuesta.estado === 'Enviada';
  const procesoCerrado = licitacion ? licitacionCerradaParaOfertas(licitacion) : false;
  const canEdit = !vencida && !yaEnviada && licitacion?.estado === 'En Evaluacion';

  const [proveedorRut, setProveedorRut] = useState('');

  useEffect(() => {
    if (!licitacionId || !proveedorId) return;

    // Cargar licitación
    const unsub = subscribeToLicitaciones(lics => {
      const found = lics.find(l => l.id === licitacionId);
      setLicitacion(found ?? null);
    });

    // Cargar RUT del proveedor
    getProveedores().then(provs => {
      const p = provs.find(pr => pr.id === proveedorId);
      if (p) setProveedorRut(p.rut);
    });

    // Cargar propuesta existente
    getPropuesta(licitacionId, proveedorId).then(p => {
      if (p) setPropuesta(p);
      setLoading(false);
    });

    return unsub;
  }, [licitacionId, proveedorId]);

  const handleFileUpload = async (file: File) => {
    if (!licitacionId || !proveedorId) return;
    if (procesoCerrado) {
      alert('Proceso cerrado: la licitación ya fue adjudicada y no acepta nuevas ofertas.');
      return;
    }
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const tipo = isExcel ? 'excel' : 'pdf';
    setUploadPct(0);

    try {
      // 1. Subida del archivo a Storage
      setUploadPct(20);
      const archivoDrive = await uploadFileToProjectFolder(
        file,
        licitacionId,
        licitacion?.nombreProyecto || 'Licitacion'
      );
      const url = archivoDrive.storage === 'drive' ? archivoDrive.url : undefined;
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
        // Validar si coincide con catálogo de 155 proveedores
        const allProvs = await getProveedores();
        const matchedProv = allProvs.find(p => p.rut === parsedData.rutProveedor || p.rut.replace(/[^0-9kK]/g, '') === parsedData.rutProveedor?.replace(/[^0-9kK]/g, ''));
        if (matchedProv) {
          feedbackList.push(`✓ Proveedor identificado por RUT: ${matchedProv.razonSocial} (${matchedProv.rut})`);
        } else {
          feedbackList.push(`✓ RUT extraído del documento: ${parsedData.rutProveedor}`);
        }
      }

      if (parsedData?.detallesLeidos && parsedData.detallesLeidos.length > 0) {
        feedbackList.push(...parsedData.detallesLeidos);
      } else if (feedbackList.length === 0) {
        feedbackList.push(`Archivo ${isExcel ? 'Excel' : 'PDF'} cargado exitosamente.`);
      }
      if (archivoDrive.storage !== 'drive') {
        feedbackList.push('⚠ El archivo fue leído, pero no quedó respaldado en Drive. Autorice Drive antes de enviar.');
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

  const handleSave = async (estado: 'Borrador' | 'Enviada') => {
    if (!licitacionId || !proveedorId || !profile) return;
    if (procesoCerrado) {
      alert('Proceso cerrado: no es posible guardar ni enviar propuestas después de la adjudicación.');
      return;
    }
    if (estado === 'Enviada' && (!propuesta.archivoNombre || !propuesta.archivoURL)) {
      alert('Para enviar la propuesta debe adjuntar el archivo y completar su respaldo en Google Drive.');
      return;
    }
    if (estado === 'Enviada' && (!propuesta.itemizado || propuesta.itemizado.length === 0)) {
      alert('No se detectó el itemizado de la cotización. Use la plantilla oficial o un PDF con columnas de item, descripción, unidad, cantidad, precio unitario y total.');
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
      observaciones: propuesta.observaciones,
      fechaEnvio: new Date().toISOString(),
      estado,
    };

    try {
      await savePropuesta(licitacionId, proveedorId, data);
      if (estado === 'Enviada') {
        await updateInvitadoEstado(licitacionId, proveedorId, 'Presentada');
      }
      setPropuesta(prev => ({ ...prev, ...data }));
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
        Licitación no encontrada.
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
        <button onClick={() => navigate('/portal')} className="text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-[10px] text-sky-400 font-semibold uppercase tracking-wider">Presentar Propuesta</p>
          <p className="text-sm font-bold text-white leading-tight line-clamp-1">{licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}</p>
        </div>
        {procesoCerrado && (
          <span className="ml-auto flex items-center gap-1.5 text-amber-300 text-xs font-bold">
            <AlertTriangle className="w-4 h-4" /> Proceso Cerrado
          </span>
        )}
        {!procesoCerrado && yaEnviada && (
          <span className="ml-auto flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" /> Propuesta Enviada
          </span>
        )}
        {!procesoCerrado && vencida && !yaEnviada && (
          <span className="ml-auto flex items-center gap-1.5 text-red-400 text-xs font-bold">
            <AlertTriangle className="w-4 h-4" /> Plazo Vencido
          </span>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Info card */}
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded">CP: {licitacion.codigoCP}</span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">OP: {licitacion.codigoOP}</span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">OT: {licitacion.codigoOT}</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{licitacion.descripcion}</p>
          <div className="flex items-center gap-4 pt-1">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300 font-semibold">{formatoMonedaCLP(licitacion.montoEstimado)}</span>
              <span className="text-slate-500">estimado</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              Límite: <span className="text-sky-300 font-semibold">{new Date(licitacion.fechaEvaluacion).toLocaleDateString('es-CL')}</span>
            </span>
            {!vencida && (
              <span className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
                <Clock className="w-3.5 h-3.5" />
                {Math.ceil((new Date(licitacion.fechaEvaluacion).getTime() - Date.now()) / 86400000)} días restantes
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
                : 'El plazo para presentar propuestas ha vencido.'}
          </div>
        )}

        {/* Formulario */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" /> Datos Económicos
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

        {/* Upload archivo */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" /> Archivo de Propuesta
          </h3>
          <p className="text-xs text-slate-500">
            Adjunte su propuesta en formato <strong className="text-slate-400">Excel (.xlsx)</strong> o <strong className="text-slate-400">PDF</strong>.
            Se recomienda usar la plantilla oficial disponible en la barra de herramientas.
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
