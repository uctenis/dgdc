import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Copy, Leaf, Loader2, Mail, Send, UserPlus, X } from 'lucide-react';
import {
  aprobarInscripcion, crearInvitacionInscripcion, marcarSolicitadaAdquisiciones,
  observarInscripcion, rechazarInscripcion, subscribeToInscripciones,
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { CORREO_ADQUISICIONES_REGISTRO, REQUISITOS_INSCRIPCION, diasDesdeEmision } from '../data/inscripcionProveedores';
import type { EstadoInscripcion, InscripcionProveedor, Proveedor } from '../types';

const ESTILO_ESTADO: Record<EstadoInscripcion, string> = {
  Invitada: 'bg-slate-100 text-slate-700',
  Enviada: 'bg-sky-100 text-sky-800',
  Observada: 'bg-amber-100 text-amber-900',
  Aprobada: 'bg-emerald-100 text-emerald-800',
  'Solicitada a Adquisiciones': 'bg-indigo-100 text-indigo-800',
  Registrada: 'bg-emerald-600 text-white',
  Rechazada: 'bg-red-100 text-red-800',
};
const ORDEN: EstadoInscripcion[] = ['Enviada', 'Solicitada a Adquisiciones', 'Aprobada', 'Observada', 'Invitada', 'Registrada', 'Rechazada'];
const ETIQUETA_ESTADO: Partial<Record<EstadoInscripcion, string>> = {
  Enviada: 'Por enviar a Adquisiciones',
  'Solicitada a Adquisiciones': 'En Adquisiciones',
  Observada: 'Con correcciones pendientes',
  Rechazada: 'No aprobada',
};
const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-CL') : '—');
const normalizarRut = (r = '') => r.replace(/[^0-9kK]/g, '').toUpperCase();
const enlace = (codigo: string) => `${window.location.origin}${import.meta.env.BASE_URL}proveedores/inscripcion?t=${codigo}`;

function textoSolicitudAdquisiciones(ins: InscripcionProveedor): { asunto: string; cuerpo: string } {
  const d = ins.datos;
  const docs = REQUISITOS_INSCRIPCION
    .filter(r => ins.documentos?.[r.id])
    .map(r => `- ${r.nombre}${ins.documentos?.[r.id]?.fechaEmision ? ` (emitido el ${fecha(`${ins.documentos[r.id].fechaEmision}T12:00:00`)})` : ''}: ${ins.documentos?.[r.id]?.url}`)
    .join('\n');
  return {
    asunto: `Solicitud de registro de proveedor — ${d?.razonSocial} (${d?.rut})`,
    cuerpo: `Estimado Miguel:\n\nJunto con saludar, la Subdirección de Infraestructura invitó a la siguiente empresa a inscribirse como proveedor y solicita revisar sus antecedentes y agregarla al registro oficial de proveedores de la UCT. Le agradeceremos avisarnos cuando esté registrada o si falta algún antecedente:\n\n`
      + `Razón social: ${d?.razonSocial}\nRUT: ${d?.rut}\nGiro: ${d?.giro}\nRubro: ${d?.rubro}\nRepresentante legal: ${d?.representanteLegal} (${d?.rutRepresentante})\n`
      + `Contacto: ${d?.nombreContacto} · ${d?.email} · ${d?.telefono}\nDirección: ${d?.direccion}, ${d?.ciudad}\n`
      + `Cuenta bancaria: ${d?.datosBancarios.banco}, ${d?.datosBancarios.tipoCuenta} N° ${d?.datosBancarios.numeroCuenta}, titular ${d?.datosBancarios.titular} (${d?.datosBancarios.rutTitular})\n`
      + `Sustentabilidad: ${ins.sustentabilidad?.declara ? `Sí${ins.sustentabilidad.descripcion ? ` — ${ins.sustentabilidad.descripcion}` : ''}` : 'No declara'}\n\n`
      + `Documentos:\n${docs}\n\nSaludos cordiales.`,
  };
}

/**
 * Inscripción de proveedores por invitación: la UCT invita con un enlace personal, revisa los requisitos que sube
 * la empresa, aprueba (queda como proveedor en el sistema) y solicita a Adquisiciones el registro oficial.
 */
export function InscripcionesProveedoresModal({ proveedores, onClose }: { proveedores: Proveedor[]; onClose: () => void }) {
  const { user } = useAuth();
  const [inscripciones, setInscripciones] = useState<InscripcionProveedor[]>([]);
  const [razonSocial, setRazonSocial] = useState('');
  const [email, setEmail] = useState('');
  const [invitando, setInvitando] = useState(false);
  const [recienCreada, setRecienCreada] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => subscribeToInscripciones(setInscripciones), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const por = user?.email || '';

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!razonSocial.trim() || !email.includes('@')) { setAviso('Indique la empresa y un correo válido.'); return; }
    setInvitando(true);
    setAviso('');
    try {
      const codigo = await crearInvitacionInscripcion(razonSocial, email, por);
      setRecienCreada(codigo);
      setAbierta(codigo);
      setRazonSocial('');
      setEmail('');
    } catch (err) {
      console.error('Error creando la invitación:', err);
      setAviso('No se pudo crear la invitación. Intente nuevamente.');
    } finally {
      setInvitando(false);
    }
  };

  const copiar = async (texto: string, que: string) => {
    try { await navigator.clipboard.writeText(texto); setAviso(`${que} copiado.`); } catch { setAviso('No se pudo copiar; selecciónelo a mano.'); }
  };

  const correoEmpresa = (ins: InscripcionProveedor) => {
    const asunto = 'Inscripción como proveedor — Universidad Católica de Temuco';
    const cuerpo = `Estimados ${ins.razonSocialInvitada}:\n\nLes invitamos a inscribirse como proveedores de la Universidad Católica de Temuco. Para ello, completen sus datos y suban la documentación solicitada en el siguiente enlace personal (no lo compartan):\n\n${enlace(ins.id)}\n\nPueden guardar su avance y volver con el mismo enlace.\n\nSaludos cordiales,\nSubdirección de Infraestructura — UCT`;
    window.location.href = `mailto:${ins.emailInvitado}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  };

  const accion = async (ins: InscripcionProveedor, tipo: 'observar' | 'rechazar' | 'solicitar' | 'registrar') => {
    setAviso('');
    try {
      if (tipo === 'observar' || tipo === 'rechazar') {
        const motivo = (prompt(tipo === 'observar' ? '¿Qué debe corregir o completar la empresa? (lo verá en su enlace)' : '¿Por qué no se aprueba? (lo verá la empresa)') || '').trim();
        if (!motivo) return;
        setProcesando(ins.id);
        await (tipo === 'observar' ? observarInscripcion(ins, motivo, por) : rechazarInscripcion(ins, motivo, por));
      } else if (tipo === 'solicitar') {
        const { asunto, cuerpo } = textoSolicitudAdquisiciones(ins);
        window.location.href = `mailto:${CORREO_ADQUISICIONES_REGISTRO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
        if (!confirm(`Se abrió su correo con la solicitud para ${CORREO_ADQUISICIONES_REGISTRO}. ¿La envió? (si no se abrió, use "Copiar solicitud")`)) return;
        setProcesando(ins.id);
        await marcarSolicitadaAdquisiciones(ins, por);
      } else {
        const existente = proveedores.find(p => normalizarRut(p.rut) === normalizarRut(ins.datos?.rut));
        const msg = `¿Adquisiciones confirmó que ${ins.datos?.razonSocial} ya está en el registro oficial de proveedores de la UCT?\n\n`
          + (existente
            ? `Ya existe en el sistema con el RUT ${ins.datos?.rut} (${existente.razonSocial}): se completará esa ficha con los datos y documentos de la inscripción.`
            : 'Quedará como proveedor activo en el sistema, con sus datos, cuenta bancaria y documentos.');
        if (!confirm(msg)) return;
        setProcesando(ins.id);
        await aprobarInscripcion(ins, por, existente?.id);
        setAviso(`${ins.datos?.razonSocial} quedó registrada como proveedor.`);
      }
    } catch (err) {
      console.error('Error procesando la inscripción:', err);
      setAviso('No se pudo completar la acción. Intente nuevamente.');
    } finally {
      setProcesando(null);
    }
  };

  const ordenadas = [...inscripciones].sort((a, b) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado));
  const campo = 'px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-400';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[94vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><UserPlus className="w-4 h-4 text-sky-600" /> Inscripción de proveedores</h3>
            <p className="text-[11px] text-slate-500">Solo por invitación: la empresa recibe un enlace personal y sube los requisitos; sus antecedentes se envían a Adquisiciones ({CORREO_ADQUISICIONES_REGISTRO}), que avisa cuando queda registrada.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" title="Cerrar (Esc)"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
          <form onSubmit={invitar} className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 flex flex-col sm:flex-row gap-2">
            <input className={`${campo} flex-1`} value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Empresa a invitar" />
            <input type="email" className={`${campo} flex-1`} value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@empresa.cl" />
            <button type="submit" disabled={invitando} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-60">
              {invitando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Invitar a inscribirse
            </button>
          </form>
          {aviso && <p className="text-[11px] font-semibold text-slate-700">{aviso}</p>}

          {ordenadas.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Aún no hay inscripciones.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {ordenadas.map(ins => {
                const d = ins.datos;
                const existente = d?.rut ? proveedores.find(p => normalizarRut(p.rut) === normalizarRut(d.rut) && p.id !== ins.proveedorId) : undefined;
                const esAbierta = abierta === ins.id;
                return (
                  <div key={ins.id} className={recienCreada === ins.id ? 'bg-sky-50/60' : ''}>
                    <button type="button" onClick={() => setAbierta(a => (a === ins.id ? null : ins.id))} className="w-full text-left px-3 py-2.5 flex items-start gap-2">
                      {esAbierta ? <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5" /> : <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-800">{d?.razonSocial || ins.razonSocialInvitada}</span>
                        <span className="block text-[10px] text-slate-500">
                          {d?.rut ? `${d.rut} · ` : ''}{ins.emailInvitado} · invitada el {fecha(ins.fechaInvitacion)}{ins.fechaEnvio ? ` · enviada el ${fecha(ins.fechaEnvio)}` : ''}
                        </span>
                      </span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${ESTILO_ESTADO[ins.estado]}`}>{ETIQUETA_ESTADO[ins.estado] || ins.estado}</span>
                    </button>

                    {esAbierta && (
                      <div className="px-4 pb-3 space-y-2.5 text-[11px]">
                        {(ins.estado === 'Invitada' || ins.estado === 'Observada') && (
                          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 space-y-1.5">
                            <p className="font-semibold text-slate-700">Enlace personal de la empresa (envíeselo; no requiere cuenta):</p>
                            <p className="font-mono text-[10px] text-slate-600 break-all">{enlace(ins.id)}</p>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => void copiar(enlace(ins.id), 'Enlace')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 font-bold"><Copy className="w-3 h-3" /> Copiar enlace</button>
                              <button type="button" onClick={() => correoEmpresa(ins)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 font-bold"><Mail className="w-3 h-3" /> Escribir correo a la empresa</button>
                            </div>
                          </div>
                        )}
                        {ins.observaciones && <p className="text-amber-800"><strong>Observaciones:</strong> {ins.observaciones}</p>}

                        {d && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-slate-700">
                            <p><strong>Giro:</strong> {d.giro}</p>
                            <p><strong>Rubro:</strong> {d.rubro}</p>
                            <p><strong>Representante:</strong> {d.representanteLegal} ({d.rutRepresentante})</p>
                            <p><strong>Contacto:</strong> {d.nombreContacto} · {d.telefono}</p>
                            <p><strong>Dirección:</strong> {d.direccion}, {d.ciudad}</p>
                            <p><strong>Banco:</strong> {d.datosBancarios.banco} · {d.datosBancarios.tipoCuenta} N° {d.datosBancarios.numeroCuenta}</p>
                          </div>
                        )}
                        {existente && (
                          <p className="flex items-center gap-1 font-semibold text-amber-800"><AlertTriangle className="w-3.5 h-3.5" /> Ya existe un proveedor con este RUT: {existente.razonSocial}. Al aprobar se completará esa ficha.</p>
                        )}

                        {ins.documentos && (
                          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                            {REQUISITOS_INSCRIPCION.map(r => {
                              const doc = ins.documentos?.[r.id];
                              const dias = doc?.fechaEmision && ins.fechaEnvio ? diasDesdeEmision(doc.fechaEmision, new Date(ins.fechaEnvio)) : undefined;
                              const fueraPlazo = r.vigenciaDias !== undefined && dias !== undefined && dias > r.vigenciaDias;
                              return (
                                <div key={r.id} className="px-2.5 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  {doc ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : r.opcional ? <Leaf className="w-3.5 h-3.5 text-slate-300 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                                  <span className="flex-1 min-w-0 text-slate-700">{r.nombre}</span>
                                  {doc ? (
                                    <>
                                      {doc.fechaEmision && <span className={fueraPlazo ? 'text-red-600 font-semibold' : 'text-slate-500'}>emitido {fecha(`${doc.fechaEmision}T12:00:00`)}{dias !== undefined ? ` (${dias} días al enviar)` : ''}</span>}
                                      <a href={doc.url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">Ver</a>
                                    </>
                                  ) : <span className="text-slate-400">{r.opcional ? 'no presentado' : 'falta'}</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {ins.sustentabilidad?.declara && <p className="text-emerald-700 flex items-center gap-1"><Leaf className="w-3.5 h-3.5" /> Declara sustentabilidad{ins.sustentabilidad.descripcion ? `: ${ins.sustentabilidad.descripcion}` : ''}</p>}
                        {ins.solicitudAdquisiciones && <p className="text-indigo-700">Solicitud a Adquisiciones: {fecha(ins.solicitudAdquisiciones.fecha)} por {ins.solicitudAdquisiciones.por}.</p>}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {procesando === ins.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                          {(ins.estado === 'Enviada' || ins.estado === 'Solicitada a Adquisiciones' || ins.estado === 'Aprobada') && (
                            <>
                              <button type="button" onClick={() => void accion(ins, 'solicitar')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold">
                                <Send className="w-3 h-3" /> {ins.estado === 'Solicitada a Adquisiciones' ? 'Reenviar a Adquisiciones' : 'Enviar a Adquisiciones'}
                              </button>
                              <button type="button" onClick={() => { const t = textoSolicitudAdquisiciones(ins); void copiar(`${t.asunto}\n\n${t.cuerpo}`, 'Texto de la solicitud'); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 font-bold">
                                <Copy className="w-3 h-3" /> Copiar solicitud
                              </button>
                            </>
                          )}
                          {ins.estado === 'Solicitada a Adquisiciones' && (
                            <button type="button" onClick={() => void accion(ins, 'registrar')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">Adquisiciones confirmó: registrar</button>
                          )}
                          {(ins.estado === 'Enviada' || ins.estado === 'Solicitada a Adquisiciones') && (
                            <>
                              <button type="button" onClick={() => void accion(ins, 'observar')} className="px-3 py-1.5 rounded-lg border border-amber-400 text-amber-900 font-bold">Pedir correcciones</button>
                              <button type="button" onClick={() => void accion(ins, 'rechazar')} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 font-bold">No aprobar</button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
