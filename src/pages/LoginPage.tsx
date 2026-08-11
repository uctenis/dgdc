import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogIn, UserPlus, Eye, EyeOff, AlertCircle, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProveedores } from '../services/firestoreService';
import type { Proveedor } from '../types';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { loginProveedor, registerProveedor, error, clearError } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // Registro: selección de proveedor
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [loadingProvs, setLoadingProvs] = useState(false);
  const [provError, setProvError] = useState('');

  const switchMode = async (m: Mode) => {
    clearError();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setProvError('');

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setProvError('Las contraseñas no coinciden.');
        return;
      }
      if (!selectedProveedorId) {
        setProvError('Debe seleccionar su empresa de la lista.');
        return;
      }
      const prov = proveedores.find(p => p.id === selectedProveedorId)!;
      setLoading(true);
      try {
        await registerProveedor(email, password, prov.razonSocial, selectedProveedorId);
        navigate('/portal');
      } catch {
        // error handled in context
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        await loginProveedor(email, password);
        navigate('/portal');
      } catch {
        // error handled in context
      } finally {
        setLoading(false);
      }
    }
  };

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

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-sky-300 mb-1.5">
              Email de contacto *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="empresa@correo.cl"
              className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none placeholder:text-slate-500"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-sky-300 mb-1.5">
              Contraseña *
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-4 py-2.5 pr-10 rounded-xl text-sm text-white outline-none placeholder:text-slate-500"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password (register only) */}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-sky-300 mb-1.5">
                Confirmar Contraseña *
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repita su contraseña"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none placeholder:text-slate-500"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              />
            </div>
          )}

          {/* Errors */}
          {(error || provError) && (
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
            className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2"
            style={{
              background: loading
                ? 'rgba(56,189,248,0.3)'
                : 'linear-gradient(135deg, #38bdf8, #1d4ed8)',
              boxShadow: loading ? 'none' : '0 4px 16px -2px rgba(29,78,216,0.5)',
            }}
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : mode === 'login' ? (
              <><LogIn className="w-4 h-4" /> Ingresar al Portal</>
            ) : (
              <><UserPlus className="w-4 h-4" /> Crear mi Cuenta</>
            )}
          </button>
        </form>

        {mode === 'register' && (
          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            Su cuenta será vinculada a la empresa que seleccione. Solo podrá ver las licitaciones a las que haya sido invitado por la UCT.
          </p>
        )}
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-slate-500 text-center">
        ¿Es administrador? Acceda directamente al{' '}
        <a href="/" className="text-sky-400 hover:underline">panel de gestión</a>
      </p>
    </div>
  );
}
