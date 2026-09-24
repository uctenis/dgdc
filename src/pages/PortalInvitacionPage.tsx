import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Building2, CheckCircle2, Loader2, LogOut, Mail, ShieldX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { verificarInvitacionLicitacion, getInvitadosLicitacion } from '../services/firestoreService';
import type { InvitadoLicitacion } from '../types';
import { LicitacionDetalle } from './LicitacionDetalle';
import { PortalAccesoRestringido } from './PortalAccesoRestringido';

const FONDO = 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0369a1 100%)';
const TARJETA: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 24px 48px -8px rgba(0,0,0,0.5)',
};

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: FONDO }}>
      <div className="mb-8 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)' }}
        >
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Portal de Proveedores</h1>
        <p className="text-sky-300 text-sm mt-1">Universidad Católica de Temuco · DGDC</p>
      </div>
      <div className="w-full max-w-md rounded-3xl p-8 space-y-5" style={TARJETA}>{children}</div>
    </div>
  );
}

function MensajeError({ texto }: { texto: string }) {
  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs text-left"
      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
    >
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{texto}</span>
    </div>
  );
}

/**
 * Puerta de entrada del Portal de Proveedores: solo se llega con el enlace del correo de invitación
 * (/portal/licitacion/:id). Exige sesión y verifica que la cuenta pertenezca a un proveedor INVITADO a
 * esa licitación; si no, no muestra nada de la licitación.
 */
export function PortalInvitacionPage() {
  const { id: licitacionId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user, profile, isProveedor, loading, error, clearError, logout,
    loginProveedorPorInvitacion, enviarEnlaceIngresoInvitacion, esEnlaceDeIngreso, completarLoginConEnlace,
    loginPortalDevBypass, isInternalUser, loginInternalWithGoogle,
  } = useAuth();

  // Código del enlace personal de la invitación (?t=...). Se guarda al entrar: los parámetros de la URL se limpian tras el ingreso.
  const [token] = useState(() => new URLSearchParams(window.location.search).get('t') || '');

  // Vista de administrador: el personal interno autorizado (ej. dsilva@uct.cl) entra siempre, sin ser invitado,
  // en modo solo lectura, viendo el portal como uno de los proveedores invitados.
  const esAdminVista = Boolean(user && isInternalUser);
  const [invitadosVista, setInvitadosVista] = useState<InvitadoLicitacion[]>([]);
  const [vistaProveedorId, setVistaProveedorId] = useState('');
  useEffect(() => {
    if (!esAdminVista) return;
    getInvitadosLicitacion(licitacionId)
      .then(lista => { setInvitadosVista(lista); setVistaProveedorId(prev => prev || lista[0]?.proveedorId || ''); })
      .catch(() => { /* sin invitados legibles: se ve como proveedor genérico */ });
  }, [esAdminVista, licitacionId]);

  const [acceso, setAcceso] = useState<'verificando' | 'ok' | 'denegado'>('verificando');

  // Regreso desde el enlace de correo: completa el ingreso y limpia los parámetros de la URL.
  const [procesandoEnlace, setProcesandoEnlace] = useState(() => esEnlaceDeIngreso());
  const [pedirCorreo, setPedirCorreo] = useState(false);
  const [correoConfirmacion, setCorreoConfirmacion] = useState('');

  const completarEnlace = async (correo?: string) => {
    setProcesandoEnlace(true);
    try {
      await completarLoginConEnlace(licitacionId, token, correo);
      setPedirCorreo(false);
      navigate(token ? `${location.pathname}?t=${encodeURIComponent(token)}` : location.pathname, { replace: true });
    } catch (e) {
      if ((e as Error)?.message === 'EMAIL_REQUERIDO') setPedirCorreo(true);
    } finally {
      setProcesandoEnlace(false);
    }
  };

  useEffect(() => {
    if (esEnlaceDeIngreso()) void completarEnlace();
    // Solo al montar con el enlace en la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verificación de la invitación para la sesión actual.
  useEffect(() => {
    if (loading || !user || !isProveedor || !profile) return;
    // Sesión de prueba del servidor local: no hay invitación real que verificar.
    if (profile.uid === 'dev-proveedor') { setAcceso('ok'); return; }
    let vigente = true;
    setAcceso('verificando');
    verificarInvitacionLicitacion(licitacionId, { proveedorId: profile.proveedorId, email: user.email, token })
      .then(inv => { if (vigente) setAcceso(inv ? 'ok' : 'denegado'); })
      .catch(() => { if (vigente) setAcceso('denegado'); });
    return () => { vigente = false; };
  }, [loading, user, isProveedor, profile, licitacionId, token]);

  // Ingreso
  const [ingresando, setIngresando] = useState(false);
  const [mostrarEnlace, setMostrarEnlace] = useState(false);
  const [correo, setCorreo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);

  const ingresarConGoogle = async () => {
    clearError();
    setIngresando(true);
    try {
      await loginProveedorPorInvitacion(licitacionId, token);
    } catch {
      // el error ya queda en el contexto
    } finally {
      setIngresando(false);
    }
  };

  // SOLO servidor local: entra como el primer proveedor invitado a esta licitación (o uno de prueba).
  const [avisoLocal, setAvisoLocal] = useState('');
  const entrarModoLocal = async () => {
    // Firestore exige sesión: sin una sesión real de Firebase en este navegador no se podrían leer los datos.
    if (!auth.currentUser) {
      setAvisoLocal('Para ver los datos primero inicie sesión en el sistema interno (http://localhost:5180/login) en ESTE mismo navegador, sin ventana privada, y vuelva a abrir este enlace.');
      return;
    }
    setAvisoLocal('');
    let datos = { proveedorId: 'dev-proveedor', email: 'proveedor.prueba@local.test', nombre: 'Proveedor de Prueba' };
    try {
      const primero = (await getInvitadosLicitacion(licitacionId))[0];
      if (primero) datos = { proveedorId: primero.proveedorId, email: primero.proveedorEmail, nombre: primero.proveedorNombre };
    } catch {
      // sin acceso a los invitados: se usa el proveedor de prueba
    }
    loginPortalDevBypass?.(datos);
  };

  const enviarEnlace = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setEnviando(true);
    try {
      await enviarEnlaceIngresoInvitacion(correo, licitacionId, token);
      setEnlaceEnviado(true);
    } catch {
      // el error ya queda en el contexto
    } finally {
      setEnviando(false);
    }
  };

  if (loading || procesandoEnlace) {
    return (
      <Pantalla>
        <div className="text-center space-y-3">
          <Loader2 className="w-7 h-7 animate-spin text-sky-400 mx-auto" />
          <p className="text-sm text-slate-300">{procesandoEnlace ? 'Confirmando su acceso...' : 'Cargando...'}</p>
        </div>
      </Pantalla>
    );
  }

  if (pedirCorreo) {
    return (
      <Pantalla>
        <h2 className="text-lg font-bold text-white text-center">Confirme su correo</h2>
        <p className="text-sky-300 text-xs text-center">
          Por seguridad, ingrese el correo al que le enviamos el enlace para completar su ingreso.
        </p>
        <form
          onSubmit={ev => { ev.preventDefault(); clearError(); void completarEnlace(correoConfirmacion); }}
          className="space-y-3"
        >
          <input
            type="email"
            required
            value={correoConfirmacion}
            onChange={e => setCorreoConfirmacion(e.target.value)}
            placeholder="correo@empresa.cl"
            className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none placeholder:text-slate-500"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          />
          {error && <MensajeError texto={error} />}
          <button
            type="submit"
            className="w-full py-3 rounded-xl font-bold text-sm text-white"
            style={{ background: 'linear-gradient(135deg,#38bdf8,#1d4ed8)' }}
          >
            Confirmar e Ingresar
          </button>
        </form>
      </Pantalla>
    );
  }

  if (esAdminVista) {
    return (
      <div>
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs" style={{ background: '#78350f', color: '#fde68a' }}>
          <strong>Vista de administrador · solo lectura</strong>
          <span>Sesión: {user?.email}</span>
          {invitadosVista.length > 0 && (
            <label className="flex items-center gap-2 ml-auto">
              Ver como:
              <select
                value={vistaProveedorId}
                onChange={e => setVistaProveedorId(e.target.value)}
                className="rounded px-2 py-1 text-slate-900"
              >
                {invitadosVista.map(i => (
                  <option key={i.proveedorId} value={i.proveedorId}>{i.proveedorNombre}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <LicitacionDetalle key={vistaProveedorId} proveedorIdVista={vistaProveedorId || 'vista-admin'} soloLectura />
      </div>
    );
  }

  // Sin el enlace personal de la invitación no hay acceso (salvo la sesión de prueba del servidor local).
  if (!token && profile?.uid !== 'dev-proveedor') return <PortalAccesoRestringido />;

  if (user && isProveedor) {
    if (acceso === 'ok') return <LicitacionDetalle />;
    if (acceso === 'verificando') {
      return (
        <Pantalla>
          <div className="text-center space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-sky-400 mx-auto" />
            <p className="text-sm text-slate-300">Verificando su invitación...</p>
          </div>
        </Pantalla>
      );
    }
    return (
      <Pantalla>
        <div className="text-center space-y-3">
          <ShieldX className="w-8 h-8 text-red-300 mx-auto" />
          <h2 className="text-lg font-bold text-white">No tiene acceso a esta licitación</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            La cuenta <strong className="text-white">{user.email}</strong> no figura entre las empresas invitadas a este proceso.
            Ingrese con el correo al que llegó la invitación.
          </p>
          <button
            onClick={() => { void logout(); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
          </button>
        </div>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-white">Invitación a licitación</h2>
        <p className="text-xs text-sky-200 leading-relaxed">
          Ingrese con el correo al que llegó la invitación para revisar los antecedentes y presentar su propuesta.
        </p>
      </div>

      {error && !mostrarEnlace && <MensajeError texto={error} />}

      <button
        type="button"
        onClick={ingresarConGoogle}
        disabled={ingresando}
        className="w-full py-3 rounded-xl font-bold text-sm text-slate-900 bg-white transition-all flex items-center justify-center gap-3 hover:bg-sky-50 shadow-lg disabled:opacity-60"
      >
        {ingresando ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-black text-blue-600 ring-1 ring-slate-200">G</span>
        )}
        <span>{ingresando ? 'Validando...' : 'Ingresar con Google'}</span>
      </button>

      <button
        type="button"
        onClick={async () => { clearError(); try { await loginInternalWithGoogle(); } catch { /* error en el contexto */ } }}
        className="w-full py-2.5 rounded-xl text-xs font-bold text-sky-100 transition hover:bg-white/10"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)' }}
      >
        Ingresar como administrador UCT
      </button>

      {loginPortalDevBypass && (
        <button
          type="button"
          onClick={entrarModoLocal}
          className="w-full py-2.5 rounded-xl text-xs font-bold text-amber-200 transition hover:bg-amber-400/20"
          style={{ background: 'rgba(251,191,36,0.12)', border: '1px dashed rgba(251,191,36,0.5)' }}
        >
          🛠 Entrar para ver el portal (solo modo local)
        </button>
      )}
      {avisoLocal && <MensajeError texto={avisoLocal} />}

      <div className="pt-4 border-t border-white/10">
        {!mostrarEnlace ? (
          <button
            type="button"
            onClick={() => { setMostrarEnlace(true); clearError(); setEnlaceEnviado(false); }}
            className="w-full text-center text-xs text-slate-400 hover:text-sky-300 transition flex items-center justify-center gap-1.5"
          >
            <Mail className="w-3.5 h-3.5" />
            ¿No usa Google? Recibir un enlace de ingreso por correo
          </button>
        ) : enlaceEnviado ? (
          <div
            className="flex items-start gap-2 px-3 py-3 rounded-xl text-xs"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' }}
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Enviamos un enlace de ingreso a <strong>{correo}</strong>. Revise su bandeja (y spam) y haga clic para entrar.</span>
          </div>
        ) : (
          <form onSubmit={enviarEnlace} className="space-y-2.5">
            <label className="block text-xs font-semibold text-sky-300">Correo al que llegó la invitación</label>
            <input
              type="email"
              required
              value={correo}
              onChange={e => setCorreo(e.target.value)}
              placeholder="correo@empresa.cl"
              className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none placeholder:text-slate-500"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            />
            {error && <MensajeError texto={error} />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMostrarEnlace(false); clearError(); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#38bdf8,#1d4ed8)' }}
              >
                {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Enviar Enlace
              </button>
            </div>
          </form>
        )}
      </div>
    </Pantalla>
  );
}
