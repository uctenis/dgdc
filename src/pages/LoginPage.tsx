import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogIn, UserPlus, AlertCircle, ChevronDown, Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProveedores } from '../services/firestoreService';
import type { Proveedor } from '../types';

type Mode = 'login' | 'register';

export function LoginPage() {
  const {
    loginProveedorWithGoogle,
    enviarEnlaceIngresoProveedor,
    esEnlaceDeIngreso,
    completarLoginConEnlace,
    error,
    clearError,
  } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);

  // Registro: selección de proveedor
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [loadingProvs, setLoadingProvs] = useState(false);
  const [provError, setProvError] = useState('');

  // Ingreso sin Google: enlace de un solo uso enviado al correo registrado
  const isLinkReturn = esEnlaceDeIngreso();
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [confirmingLink, setConfirmingLink] = useState(isLinkReturn);
  const [needsEmailForLink, setNeedsEmailForLink] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState('');

  useEffect(() => {
    if (!isLinkReturn) return;
    completarLoginConEnlace()
      .then(() => navigate('/portal', { replace: true }))
      .catch(e => {
        if ((e as Error)?.message === 'EMAIL_REQUERIDO') setNeedsEmailForLink(true);
      })
      .finally(() => setConfirmingLink(false));
    // Solo debe correr una vez, al montar la página con el enlace en la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = async (m: Mode) => {
    clearError();
    setProvError('');
    setMode(m);
    if (m === 'register' && proveedores.length === 0) {
      setLoadingProvs(true);
      try {
        const data = await getProveedores();
        setProveedores(data.filter(p => p.estado === 'Activo'));
      } finally {
        setLoadingProvs(false);
      }
    }
  };

  const handleGoogleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setProvError('');

    if (mode === 'register') {
      if (!selectedProveedorId) {
        setProvError('Debe seleccionar su empresa de la lista.');
        return;
      }
      setLoading(true);
      try {
        await loginProveedorWithGoogle(selectedProveedorId);
        navigate('/portal');
      } catch {
        // error manejado en el contexto
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        await loginProveedorWithGoogle();
        navigate('/portal');
      } catch {
        // error manejado en el contexto
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLinkSent(false);
    setSendingLink(true);
    try {
      await enviarEnlaceIngresoProveedor(linkEmail);
      setLinkSent(true);
    } catch {
      // error manejado en el contexto
    } finally {
      setSendingLink(false);
    }
  };

  const handleConfirmEmailForLink = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setConfirmingLink(true);
    try {
      await completarLoginConEnlace(confirmEmailInput);
      navigate('/portal', { replace: true });
    } catch {
      // error manejado en el contexto
    } finally {
      setConfirmingLink(false);
    }
  };

  // Pantalla especial: el usuario llegó desde el enlace de correo (distinto flujo,
  // no tiene sentido mostrarle el formulario normal de Google/registro).
  if (isLinkReturn) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0369a1 100%)' }}
      >
        <div
          className="w-full max-w-md rounded-3xl p-8 space-y-5 text-center"
          style={{
            background: 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 24px 48px -8px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)' }}
          >
            <Mail className="w-7 h-7 text-white" />
          </div>

          {needsEmailForLink ? (
            <>
              <h1 className="text-lg font-bold text-white">Confirme su correo</h1>
              <p className="text-sky-300 text-xs">
                Por seguridad, ingrese el correo al que le enviamos el enlace para completar su ingreso.
              </p>
              <form onSubmit={handleConfirmEmailForLink} className="space-y-3 text-left">
                <input
                  type="email"
                  required
                  value={confirmEmailInput}
                  onChange={e => setConfirmEmailInput(e.target.value)}
                  placeholder="correo@empresa.cl"
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none placeholder:text-slate-500"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                />
                {error && (
                  <div
                    className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={confirmingLink}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#38bdf8,#1d4ed8)' }}
                >
                  {confirmingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  Confirmar e Ingresar
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold text-white">
                {confirmingLink ? 'Confirmando su acceso...' : 'Procesando enlace'}
              </h1>
              {confirmingLink && <Loader2 className="w-6 h-6 animate-spin text-sky-400 mx-auto" />}
              {error && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs text-left"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {error && (
                <a href={`${import.meta.env.BASE_URL}portal/login`} className="text-sky-400 text-xs hover:underline">
                  Volver al ingreso
                </a>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0369a1 100%)' }}
    >
      {/* Logo header */}
      <div className="mb-8 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{
            background: 'linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)',
            boxShadow: '0 0 0 3px rgba(56,189,248,0.2), 0 8px 24px -4px rgba(29,78,216,0.6)',
          }}
        >
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Portal de Proveedores</h1>
        <p className="text-sky-300 text-sm mt-1">Universidad Católica de Temuco · DGDC</p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-md rounded-3xl p-8 space-y-6"
        style={{
          background: 'rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 48px -8px rgba(0,0,0,0.5)',
        }}
      >
        {/* Toggle tabs */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)' }}>
          {(['login', 'register'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className="flex-1 py-2.5 text-sm font-semibold transition-all"
              style={{
                background: mode === m ? 'rgba(56,189,248,0.2)' : 'transparent',
                color: mode === m ? '#38bdf8' : 'rgba(148,163,184,0.8)',
                borderBottom: mode === m ? '2px solid #38bdf8' : '2px solid transparent',
              }}
            >
              {m === 'login' ? (
                <span className="flex items-center justify-center gap-2"><LogIn className="w-3.5 h-3.5" />Iniciar Sesión</span>
              ) : (
                <span className="flex items-center justify-center gap-2"><UserPlus className="w-3.5 h-3.5" />Crear Cuenta</span>
              )}
            </button>
          ))}
        </div>

        <form onSubmit={handleGoogleAuth} className="space-y-4">
          {/* Register: selección de empresa */}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-sky-300 mb-1.5">
                Seleccione su Empresa *
              </label>
              {loadingProvs ? (
                <div className="text-slate-400 text-xs py-2">Cargando proveedores...</div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedProveedorId}
                    onChange={e => setSelectedProveedorId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 pr-9 rounded-xl text-sm outline-none appearance-none"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: selectedProveedorId ? 'white' : 'rgba(148,163,184,0.7)',
                    }}
                  >
                    <option value="" disabled style={{ background: '#1e3a8a' }}>— Seleccione su razón social —</option>
                    {proveedores.map(p => (
                      <option key={p.id} value={p.id} style={{ background: '#1e3a8a', color: 'white' }}>
                        {p.razonSocial} · {p.rut}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              )}
            </div>
          )}

          {/* Instrucciones */}
          <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-xs text-sky-100">
            {mode === 'login' ? (
              <p>Ingrese al portal utilizando su cuenta de Google registrada.</p>
            ) : (
              <p>Seleccione la empresa a la que pertenece y regístrese con su cuenta de Google corporativa o personal.</p>
            )}
          </div>

          {/* Errors */}
          {(error || provError) && !showLinkForm && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error || provError}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm text-slate-900 bg-white transition-all flex items-center justify-center gap-3 mt-4 hover:bg-sky-50 shadow-lg disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-black text-blue-600 ring-1 ring-slate-200">G</span>
            )}
            {loading ? (
              <span>Validando...</span>
            ) : mode === 'login' ? (
              <span>Ingresar con Google</span>
            ) : (
              <span>Registrarse con Google</span>
            )}
          </button>
        </form>

        {mode === 'register' && (
          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            Su cuenta será vinculada a la empresa que seleccione. Solo podrá ver las licitaciones a las que haya sido invitado.
          </p>
        )}

        {/* Ingreso alternativo sin cuenta Google */}
        <div className="pt-4 border-t border-white/10">
          {!showLinkForm ? (
            <button
              type="button"
              onClick={() => { setShowLinkForm(true); clearError(); setLinkSent(false); }}
              className="w-full text-center text-xs text-slate-400 hover:text-sky-300 transition flex items-center justify-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              ¿No tiene cuenta Google? Ingresar con enlace por correo
            </button>
          ) : linkSent ? (
            <div
              className="flex items-start gap-2 px-3 py-3 rounded-xl text-xs"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' }}
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Enviamos un enlace de ingreso a <strong>{linkEmail}</strong>. Revise su bandeja (y spam) y haga clic para entrar — el enlace expira tras un tiempo, si no llega puede solicitar uno nuevo.</span>
            </div>
          ) : (
            <form onSubmit={handleSendLink} className="space-y-2.5">
              <label className="block text-xs font-semibold text-sky-300">
                Correo registrado de su empresa
              </label>
              <input
                type="email"
                required
                value={linkEmail}
                onChange={e => setLinkEmail(e.target.value)}
                placeholder="correo@empresa.cl"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none placeholder:text-slate-500"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
              />
              {error && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowLinkForm(false); clearError(); }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sendingLink}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-1.5 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#38bdf8,#1d4ed8)' }}
                >
                  {sendingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  Enviar Enlace
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-slate-500 text-center">
        ¿Es administrador? Acceda directamente al{' '}
        <a href="/" className="text-sky-400 hover:underline">panel de gestión</a>
      </p>
    </div>
  );
}
