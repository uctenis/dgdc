import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Plus, Trash2, CheckCircle2, Clock, ArrowLeft,
  AlertTriangle, Mail, Building2, Send, ShieldCheck, Star, Award, Filter, Hammer
} from 'lucide-react';
import {
  subscribeToInvitados,
  addInvitado,
  removeInvitado,
  updateLicitacion,
  addEnvioInvitacion,
  sincronizarFormatoPresupuesto,
  asegurarLimiteOfertas,
  asegurarTokensInvitados,
  subscribeToEnviosInvitaciones,
  getEvaluacionesDesempenoDeProveedores,
} from '../services/firestoreService';
import type { Proveedor, InvitadoLicitacion, LicitacionProyecto, EvaluacionDesempeno, ConfiguracionFirmas, EnvioInvitacion } from '../types';
import { ordenarProveedoresPorRubroYDesempeno, porcentajeAntecedentes, checklistAntecedentesEfectivo, checklistAntecedentesCompleto } from '../utils/proveedorMatching';
import { useAuth } from '../context/AuthContext';
import { enviarInvitacionesLicitacion, ENVIO_CORREOS_REAL } from '../services/invitacionService';

interface InvitadosManagerProps {
  licitacion: LicitacionProyecto;
  proveedores: Proveedor[];
  configFirmas?: ConfiguracionFirmas;
  onClose: () => void;
  /** true = se muestra dentro de la pestaña de la licitación, no como pantalla completa. */
  embedded?: boolean;
}

export const InvitadosManager: React.FC<InvitadosManagerProps> = ({
  licitacion,
  embedded = false,
  proveedores,
  configFirmas,
  onClose,
}) => {
  const { user } = useAuth();
  const [enviandoInvitaciones, setEnviandoInvitaciones] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState('');
  const [envios, setEnvios] = useState<EnvioInvitacion[]>([]);
  const [mensajeAbierto, setMensajeAbierto] = useState<string | null>(null);
  const [invitados, setInvitados] = useState<InvitadoLicitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [soloMiRubro, setSoloMiRubro] = useState(false);
  const [error, setError] = useState('');
  const [guardandoUnicoProveedor, setGuardandoUnicoProveedor] = useState(false);
  const [evaluacionesPorProveedor, setEvaluacionesPorProveedor] = useState<Record<string, EvaluacionDesempeno[]>>({});

  const handleToggleUnicoProveedor = async () => {
    const nuevoValor = !licitacion.esUnicoProveedor;
    if (nuevoValor && !confirm('¿Confirma marcar esta licitación como "Único Proveedor"? Esto habilita adjudicarla con menos de 3 invitados. Úselo solo cuando exista una justificación real (proveedor especializado, trato directo, etc.) — regístrela en la justificación de adjudicación.')) return;
    setGuardandoUnicoProveedor(true);
    try {
      await updateLicitacion(licitacion.id, { esUnicoProveedor: nuevoValor });
    } catch (err) {
      console.error('Error actualizando esUnicoProveedor:', err);
      setError('No se pudo actualizar la marca de "Único Proveedor". Intente nuevamente.');
    } finally {
      setGuardandoUnicoProveedor(false);
    }
  };

  const checklist = checklistAntecedentesEfectivo(licitacion);
  const antecedentesCompletos = checklistAntecedentesCompleto(checklist);
  const pctAntecedentes = porcentajeAntecedentes(checklist);
  const sinAdjuntosLista = [
    checklist.sinAdjuntos.basesAdministrativasOk && 'Bases Administrativas',
    checklist.sinAdjuntos.basesTecnicasOk && 'Bases Técnicas',
    checklist.sinAdjuntos.planosOk && 'Planos',
  ].filter(Boolean) as string[];
  const planosSinAdjuntos = sinAdjuntosLista.length > 0;
  const faltantes = [
    !checklist.basesTecnicasOk && 'Bases Técnicas',
    !checklist.basesAdministrativasOk && 'Bases Administrativas',
    !checklist.planosOk && 'Planos',
    !checklist.calendarioDefinidoOk && 'Fechas clave del calendario',
    !checklist.revisadoSecretariaGeneralOk && 'Pertinencia legal revisada por Secretaría General',
  ].filter(Boolean) as string[];

  const marcarRevisionLegal = async () => {
    if (!confirm('¿Confirma que la pertinencia legal de las bases fue revisada por Secretaría General / Coordinación?')) return;
    try {
      await updateLicitacion(licitacion.id, {
        checklistAntecedentes: {
          ...licitacion.checklistAntecedentes,
          basesTecnicasOk: checklist.basesTecnicasOk,
          basesAdministrativasOk: checklist.basesAdministrativasOk,
          planosOk: checklist.planosOk,
          calendarioDefinidoOk: checklist.calendarioDefinidoOk,
          revisadoSecretariaGeneralOk: true,
        },
      });
    } catch (err) {
      console.error('Error marcando la revisión legal:', err);
      setError('No se pudo guardar la revisión legal. Intente nuevamente.');
    }
  };

  useEffect(() => subscribeToEnviosInvitaciones(licitacion.id, setEnvios), [licitacion.id]);

  useEffect(() => {
    const unsub = subscribeToInvitados(licitacion.id, data => {
      setInvitados(data);
      setLoading(false);
    });
    return unsub;
  }, [licitacion.id]);

  // Carga el desempeño histórico de los proveedores activos una vez, para poder
  // ordenar/mostrar sugerencias reales (rubro + evaluaciones), no solo texto libre.
  useEffect(() => {
    const ids = proveedores.filter(p => p.estado === 'Activo').map(p => p.id);
    if (!ids.length) return;
    getEvaluacionesDesempenoDeProveedores(ids)
      .then(setEvaluacionesPorProveedor)
      .catch(err => console.error('Error cargando evaluaciones de desempeño:', err));
  }, [proveedores]);

  const invitadoIds = new Set(invitados.map(i => i.proveedorId));

  const proveedoresDisponibles = useMemo(() => {
    const filtrados = proveedores
      .filter(p => p.estado === 'Activo' && !invitadoIds.has(p.id))
      .filter(p =>
        !search ||
        p.razonSocial.toLowerCase().includes(search.toLowerCase()) ||
        p.rut.includes(search) ||
        p.rubro.toLowerCase().includes(search.toLowerCase())
      )
      .filter(p => !soloMiRubro || !licitacion.rubro || p.rubro === licitacion.rubro);
    return ordenarProveedoresPorRubroYDesempeno(filtrados, licitacion.rubro, evaluacionesPorProveedor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedores, invitados, search, soloMiRubro, licitacion.rubro, evaluacionesPorProveedor]);

  const handleAdd = async (prov: Proveedor) => {
    setError('');
    setAddingId(prov.id);
    try {
      await addInvitado(licitacion.id, {
        proveedorId: prov.id,
        proveedorEmail: prov.email,
        proveedorNombre: prov.razonSocial,
        proveedorRut: prov.rut,
        fechaInvitacion: new Date().toISOString().split('T')[0],
        estadoPropuesta: 'Pendiente',
      });
    } catch (err) {
      console.error('Error invitando proveedor:', err);
      setError(`No se pudo invitar a ${prov.razonSocial}. Intente nuevamente.`);
    } finally {
      setAddingId(null);
    }
  };

  const handleAutoSuggest = async () => {
    if (!licitacion.rubro) {
      alert('Esta licitación no tiene un Rubro Requerido definido — vaya a "Editar Licitación" y asígnelo para que la sugerencia priorice el rubro correcto. Mientras tanto se sugerirá solo por desempeño histórico.');
    }
    const recomendados = proveedoresDisponibles.slice(0, 3);
    if (recomendados.length === 0) {
      alert('No hay proveedores disponibles para invitar.');
      return;
    }
    if (recomendados.length < 3) {
      alert(`Solo se encontraron ${recomendados.length} proveedor(es) disponibles — se recomienda al menos 3 invitados.`);
    }

    for (const sugerido of recomendados) {
      await handleAdd(sugerido.proveedor);
    }
  };

  const handleRemove = async (invitado: InvitadoLicitacion) => {
    if (invitado.estadoPropuesta !== 'Pendiente') {
      alert('No se puede eliminar un proveedor que ya presentó propuesta.');
      return;
    }
    if (!confirm(`¿Eliminar la invitación a ${invitado.proveedorNombre}?`)) return;
    setError('');
    setRemovingId(invitado.proveedorId);
    try {
      await removeInvitado(licitacion.id, invitado.proveedorId);
    } catch (err) {
      console.error('Error eliminando invitado:', err);
      setError(`No se pudo eliminar a ${invitado.proveedorNombre}. Intente nuevamente.`);
    } finally {
      setRemovingId(null);
    }
  };

  const estadoBadge = (estado: InvitadoLicitacion['estadoPropuesta']) => {
    switch (estado) {
      case 'Presentada':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Propuesta Presentada</span>;
      case 'Rechazada':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Rechazada</span>;
      default:
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>;
    }
  };

  const copiarEnlacePersonal = async (inv: InvitadoLicitacion) => {
    if (!inv.tokenAcceso) {
      alert('El enlace personal de este proveedor se genera al enviar la invitación.');
      return;
    }
    const url = `${window.location.origin}${import.meta.env.BASE_URL}portal/licitacion/${licitacion.id}?t=${inv.tokenAcceso}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Enlace personal copiado. Es único de este proveedor: no lo comparta con otras empresas.');
    } catch {
      window.prompt('Copie el enlace personal de este proveedor:', url);
    }
  };

  const handleEnviarInvitaciones = async () => {
    if (!antecedentesCompletos) {
      alert('No se puede enviar la invitación: el checklist de "Bases & Planos" (Antecedentes Técnicos) no está completo para esta licitación.');
      return;
    }
    if (invitados.length === 0) {
      alert('Debe agregar al menos un proveedor para enviar invitaciones.');
      return;
    }
    if (!user) {
      alert('Debe iniciar sesión para enviar invitaciones.');
      return;
    }
    if (!confirm(`${ENVIO_CORREOS_REAL ? '' : '[MODO PRUEBA — no se enviará ningún correo real] '}${planosSinAdjuntos ? `ATENCIÓN: se marcó como cumplido sin adjuntar archivos: ${sinAdjuntosLista.join(', ')}. ` : ''}¿Confirma enviar la invitación oficial por correo a ${invitados.length} proveedor(es), con copia a ${licitacion.responsableEmail || 'el responsable'}${configFirmas?.subdirectorInfraestructura.email ? ` y ${configFirmas.subdirectorInfraestructura.email}` : ''}?`)) return;

    setEnviandoInvitaciones(true);
    setResultadoEnvio('');
    setError('');
    try {
      // El portal cierra a la hora: se deja calculado el instante exacto del cierre.
      await asegurarLimiteOfertas(licitacion).catch(err => console.warn('Cierre de ofertas no sincronizado:', err));
      // El portal ofrece el formato de presupuesto (partidas sin precios): se deja al día antes de invitar.
      if (licitacion.proyectoMaestroId) {
        await sincronizarFormatoPresupuesto(licitacion.id, licitacion.proyectoMaestroId).catch(err => console.warn('Formato de presupuesto no sincronizado:', err));
      }
      const portalUrl = `${window.location.origin}${import.meta.env.BASE_URL}portal/licitacion/${licitacion.id}`;
      const ccExtra = configFirmas?.subdirectorInfraestructura.email ? [configFirmas.subdirectorInfraestructura.email] : [];
      // Cada invitado recibe su enlace personal: se garantiza su código antes de enviar.
      const conToken = await asegurarTokensInvitados(licitacion.id, invitados);
      const envio = await enviarInvitacionesLicitacion(user, licitacion, portalUrl, ccExtra, conToken);
      // Constancia de lo que se envió (o se habría enviado, en modo prueba): asunto, copias y mensaje exacto.
      try {
        await addEnvioInvitacion(licitacion.id, { ...envio, fecha: new Date().toISOString(), enviadoPorEmail: user.email || '' });
      } catch (errLog) {
        console.error('No se pudo guardar el historial del envío:', errLog);
      }
      const resultados = envio.destinatarios;
      const exitosos = resultados.filter(r => r.enviado).length;
      const fallidos = resultados.filter(r => !r.enviado);
      if (fallidos.length === 0) {
        setResultadoEnvio(ENVIO_CORREOS_REAL
          ? `✓ Invitación enviada correctamente a los ${exitosos} proveedor(es).`
          : `✓ [MODO PRUEBA] Envío simulado a ${exitosos} proveedor(es): no se envió ningún correo real.`);
      } else {
        setResultadoEnvio(`Se enviaron ${exitosos} de ${resultados.length}. Fallaron: ${fallidos.map(f => f.email).join(', ')}.`);
      }
    } catch (err) {
      console.error('Error enviando invitaciones:', err);
      setError(err instanceof Error ? err.message : 'No se pudieron enviar las invitaciones. Intente nuevamente.');
    } finally {
      setEnviandoInvitaciones(false);
    }
  };

  return (
    <div className={embedded ? '' : 'fixed inset-0 bg-white z-50 overflow-y-auto'}>
      <div className={embedded ? 'space-y-5' : 'max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5'}>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            {!embedded && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition mb-2"
              >
                <ArrowLeft className="w-4 h-4" /> Volver a la Licitación
              </button>
            )}
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-600" />
              Gestión de Invitados
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800">
              <Hammer className="w-3.5 h-3.5" />
              Rubro Requerido: {licitacion.rubro || <span className="italic font-normal text-amber-700">Sin definir</span>}
            </span>
          </div>
        </div>

        {/* Banner de Antecedentes + Envío de Invitación */}
        <div className={`rounded-2xl p-4 text-white flex flex-wrap items-center justify-between gap-4 ${antecedentesCompletos ? 'bg-slate-900' : 'bg-amber-800'}`}>
          <div className="flex items-center gap-2.5 text-xs flex-1 min-w-[220px]">
            <ShieldCheck className="w-5 h-5 text-indigo-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white block">Estado Antecedentes Técnicos:</span>
                <span className={`font-black text-sm shrink-0 ${antecedentesCompletos ? 'text-emerald-300' : 'text-amber-300'}`}>{pctAntecedentes}%</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden mt-1 mb-1">
                <div
                  className={`h-full rounded-full transition-all ${antecedentesCompletos ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${pctAntecedentes}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-200">
                {antecedentesCompletos ? '✓ Checklist de Bases y Planos completo' : '⚠️ Checklist de "Bases & Planos" incompleto — complételo antes de invitar'}
              </span>
              {faltantes.length > 0 && (
                <span className="block text-[11px] font-bold text-white mt-0.5">Falta: {faltantes.join(' · ')}</span>
              )}
              {!checklist.revisadoSecretariaGeneralOk && (
                <button
                  type="button"
                  onClick={marcarRevisionLegal}
                  className="mt-1.5 text-[11px] font-bold bg-white/15 hover:bg-white/25 border border-white/30 px-2.5 py-1 rounded-lg transition"
                >
                  ✓ Marcar revisión legal como realizada
                </button>
              )}
              {planosSinAdjuntos && (
                <span className="block text-[11px] font-bold text-amber-300 mt-0.5">⚠ Marcado sin archivos adjuntos: {sinAdjuntosLista.join(', ')}. Los proveedores no recibirán esos documentos.</span>
              )}
            </div>
          </div>

          <a
            href={`${window.location.origin}${import.meta.env.BASE_URL}portal/licitacion/${licitacion.id}`}
            target="_blank"
            rel="noreferrer"
            className="bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shrink-0"
            title="Abre el portal tal como lo verán los proveedores (vista de administrador, solo lectura)"
          >
            Ver portal de proveedores ↗
          </a>

          <button
            onClick={handleEnviarInvitaciones}
            disabled={!antecedentesCompletos || enviandoInvitaciones}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-1.5 shrink-0"
            title={antecedentesCompletos ? `Envía un correo individual a cada invitado, con copia al responsable${configFirmas?.subdirectorInfraestructura.email ? ' y al subdirector' : ''}, con el enlace al portal de proveedores.` : 'Complete el checklist de Bases & Planos antes de invitar'}
          >
            <Send className="w-3.5 h-3.5" />
            <span>{enviandoInvitaciones ? 'Enviando…' : `Enviar Invitación por Correo (${invitados.length})`}</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-semibold">
            {error}
          </div>
        )}

        {resultadoEnvio && (
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold">
            {resultadoEnvio}
          </div>
        )}

        {/* Historial de envíos: constancia de lo que se envió y con qué mensaje */}
        <details className="bg-white border border-slate-200 rounded-2xl" open={envios.length > 0 && envios.length <= 1}>
          <summary className="cursor-pointer select-none px-4 py-3 text-xs font-bold text-slate-800 flex items-center gap-2">
            <Send className="w-3.5 h-3.5 text-sky-600" />
            Historial de envíos ({envios.length})
          </summary>
          <div className="px-4 pb-4 space-y-3">
            {envios.length === 0 && (
              <p className="text-[11px] text-slate-400 italic">Aún no se ha enviado ninguna invitación desde esta licitación.</p>
            )}
            {envios.map(envio => {
              const ok = envio.destinatarios.filter(d => d.enviado).length;
              return (
                <div key={envio.id} className="border border-slate-200 rounded-xl p-3 space-y-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-extrabold uppercase text-[9px] px-1.5 py-0.5 rounded border ${envio.modo === 'real' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                      {envio.modo === 'real' ? 'Envío real' : 'Prueba — no se envió'}
                    </span>
                    <span className="font-bold text-slate-800">{new Date(envio.fecha).toLocaleString('es-CL')}</span>
                    <span className="text-slate-500">por {envio.enviadoPorEmail || '—'}</span>
                    <span className="ml-auto font-bold text-slate-700">{ok}/{envio.destinatarios.length} {envio.modo === 'real' ? 'enviados' : 'simulados'}</span>
                  </div>
                  <p><span className="text-slate-500">Asunto:</span> <strong className="text-slate-800">{envio.asunto}</strong></p>
                  <p><span className="text-slate-500">Con copia a:</span> {envio.cc.length ? envio.cc.join(', ') : '—'}</p>
                  <div className="space-y-1.5">
                    {envio.destinatarios.map(d => {
                      const clave = `${envio.id}:${d.email}`;
                      return (
                        <div key={clave} className="border border-slate-100 rounded-lg">
                          <div className="flex items-center gap-2 px-2.5 py-1.5">
                            <span className={d.enviado ? 'text-emerald-600' : 'text-red-600'}>{d.enviado ? '✓' : '✗'}</span>
                            <span className="font-semibold text-slate-800">{d.proveedorNombre || d.email}</span>
                            <span className="text-slate-500 truncate">{d.email}</span>
                            {d.error && <span className="text-red-700">· {d.error}</span>}
                            {d.html && (
                              <button
                                type="button"
                                onClick={() => setMensajeAbierto(mensajeAbierto === clave ? null : clave)}
                                className="ml-auto text-sky-700 font-bold hover:underline shrink-0"
                              >
                                {mensajeAbierto === clave ? 'Ocultar mensaje' : 'Ver mensaje'}
                              </button>
                            )}
                          </div>
                          {mensajeAbierto === clave && (
                            <iframe
                              title={`Mensaje enviado a ${d.email}`}
                              sandbox=""
                              srcDoc={d.html}
                              className="w-full h-96 border-t border-slate-100 bg-white rounded-b-lg"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </details>

        {/* Dos columnas: Invitados actuales | Catálogo de proveedores */}
        <div className="grid lg:grid-cols-5 gap-5 items-start">

          {/* Columna izquierda: Invitados actuales */}
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Invitados ({invitados.length})
                </h4>
                {invitados.length < 3 && !licitacion.esUnicoProveedor && (
                  <span className="flex items-center gap-1 text-amber-600 text-[10px] font-semibold text-right">
                    <AlertTriangle className="w-3 h-3 shrink-0" /> Mínimo 3
                  </span>
                )}
                {invitados.length < 3 && licitacion.esUnicoProveedor && (
                  <span className="flex items-center gap-1 text-indigo-600 text-[10px] font-semibold">
                    <ShieldCheck className="w-3 h-3" /> Único Proveedor
                  </span>
                )}
                {invitados.length >= 3 && (
                  <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Cumple mínimo
                  </span>
                )}
              </div>

              {invitados.length < 3 && !licitacion.esUnicoProveedor && (
                <p className="mb-3 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  No se podrá adjudicar hasta cumplir el mínimo de 3, salvo excepción "Único Proveedor".
                </p>
              )}

              {invitados.length < 3 && (
                <label className="mb-3 flex items-start gap-2 p-2.5 rounded-lg border border-indigo-200 bg-indigo-50/60 text-[11px] text-indigo-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(licitacion.esUnicoProveedor)}
                    disabled={guardandoUnicoProveedor}
                    onChange={handleToggleUnicoProveedor}
                    className="w-4 h-4 mt-0.5 text-indigo-600 rounded"
                  />
                  <span>Marcar como <strong>Único Proveedor / trato directo</strong> (excepción justificada — sin esta marca no se podrá adjudicar con menos de 3).</span>
                </label>
              )}

              {loading ? (
                <p className="text-xs text-slate-400">Cargando...</p>
              ) : invitados.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No hay empresas invitadas aún.<br />Agréguelas desde el catálogo de la derecha.
                </div>
              ) : (
                <div className="space-y-2">
                  {invitados.map(inv => (
                    <div
                      key={inv.proveedorId}
                      className="flex items-center justify-between bg-slate-50 rounded-xl px-3.5 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800 truncate">{inv.proveedorNombre}</span>
                          {estadoBadge(inv.estadoPropuesta)}
                          {inv.estadoPropuesta === 'Presentada' && inv.fechaPresentacion && (
                            <span className="text-[10px] text-emerald-700 font-semibold">{new Date(inv.fechaPresentacion).toLocaleString('es-CL')}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[11px] text-slate-500">{inv.proveedorRut}</span>
                          <span className="flex items-center gap-1 text-[11px] text-slate-400 truncate">
                            <Mail className="w-3 h-3 shrink-0" /> {inv.proveedorEmail}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                          <Clock className="w-3 h-3" /> Invitado el {inv.fechaInvitacion}
                          <button
                            type="button"
                            onClick={() => copiarEnlacePersonal(inv)}
                            className="ml-2 text-sky-700 font-bold hover:underline"
                            title="Copia el enlace personal de este proveedor al portal"
                          >
                            Copiar enlace personal
                          </button>
                        </span>
                      </div>
                      {inv.estadoPropuesta === 'Pendiente' && (
                        <button
                          onClick={() => handleRemove(inv)}
                          disabled={removingId === inv.proveedorId}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                          title="Eliminar invitación"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 px-1">
              <Send className="w-3.5 h-3.5 shrink-0" />
              Las empresas invitadas acceden al portal de proveedores con su cuenta registrada.
            </p>
          </div>

          {/* Columna derecha: Catálogo de proveedores disponibles */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Agregar Empresa de la Base de Proveedores
              </h4>
              <button
                onClick={handleAutoSuggest}
                title="Selecciona los 3 proveedores más idóneos: primero por coincidencia de Rubro Requerido, luego por mejor desempeño histórico evaluado"
                className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-xl text-xs transition border border-indigo-200 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                Sugerir 3 Idóneos
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Buscar por nombre, RUT o rubro..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-4 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-sky-500"
              />
              <label className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-[11px] font-bold cursor-pointer transition shrink-0 ${
                soloMiRubro ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
              } ${!licitacion.rubro ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input
                  type="checkbox"
                  checked={soloMiRubro}
                  disabled={!licitacion.rubro}
                  onChange={e => setSoloMiRubro(e.target.checked)}
                  className="hidden"
                />
                <Filter className="w-3.5 h-3.5" />
                Solo mi rubro
              </label>
            </div>

            {proveedoresDisponibles.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                {search || soloMiRubro ? 'No se encontraron proveedores con ese criterio.' : 'Todos los proveedores activos ya fueron invitados.'}
              </p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {proveedoresDisponibles.map(({ proveedor: prov, coincideRubro, promedioDesempeno, cantidadEvaluaciones }) => (
                  <div
                    key={prov.id}
                    className={`flex items-center justify-between bg-white border rounded-xl px-4 py-3 hover:border-sky-300 hover:bg-sky-50/30 transition group ${coincideRubro ? 'border-indigo-200' : 'border-slate-200'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 truncate">{prov.razonSocial}</span>
                        {coincideRubro && (
                          <span className="flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">
                            <Award className="w-3 h-3" /> Rubro coincide
                          </span>
                        )}
                        {promedioDesempeno !== null && (
                          <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                            <Star className="w-3 h-3 fill-current" /> {promedioDesempeno.toFixed(1)} ({cantidadEvaluaciones})
                          </span>
                        )}
                        {prov.cuentaSustentabilidad && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Sustentable</span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1">
                        <span className="text-[11px] text-slate-500">{prov.rut}</span>
                        <span className="text-[11px] text-slate-400">{prov.rubro}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(prov)}
                      disabled={addingId === prov.id}
                      className="ml-3 flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold rounded-lg transition shrink-0 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      Invitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
