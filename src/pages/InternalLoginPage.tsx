import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function InternalLoginPage() {
  const { user, isInternalUser, loading, loginInternalWithGoogle, loginDevBypass, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user && isInternalUser) return <Navigate to="/" replace />;

  const login = async () => {
    clearError();
    setSubmitting(true);
    try {
      await loginInternalWithGoogle();
      navigate('/', { replace: true });
    } catch {
      // El contexto entrega el mensaje específico al usuario.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-sky-800 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 text-white shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-700 shadow-lg">
          <Building2 className="h-8 w-8" />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[.24em] text-sky-300">UCT · Infraestructura</p>
          <h1 className="mt-2 text-2xl font-black">Gestor de Adjudicaciones</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">Acceso interno para Dirección, Subdirección y responsables de proyectos.</p>
        </div>

        <div className="mt-7 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-xs text-sky-100">
          <div className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-sky-300" /><p>Use su cuenta institucional de Google <strong>@uct.cl</strong>. El correo debe estar incluido en la nómina autorizada.</p></div>
        </div>

        {error && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-300/30 bg-red-400/10 p-3 text-xs text-red-100"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

        <button onClick={login} disabled={submitting || loading} className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-bold text-slate-900 shadow-lg transition hover:bg-sky-50 disabled:opacity-60">
          {submitting || loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-black text-blue-600 ring-1 ring-slate-200">G</span>}
          {submitting ? 'Validando correo…' : 'Continuar con Google'}
        </button>

        {import.meta.env.DEV && (
          <button 
            onClick={(e) => { e.preventDefault(); loginDevBypass?.(); }} 
            className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl bg-slate-800 px-4 py-3 font-bold text-white shadow-lg transition hover:bg-slate-700"
          >
            🚧 Ingreso Rápido (Solo Desarrollo)
          </button>
        )}

        <p className="mt-5 text-center text-[10px] leading-relaxed text-slate-400">Administrador del sistema: dsilva@uct.cl</p>
      </section>
    </main>
  );
}
