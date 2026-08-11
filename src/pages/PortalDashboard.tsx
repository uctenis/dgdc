import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, LogOut, FileText, Clock, CheckCircle2,
  AlertTriangle, ChevronRight, Calendar, DollarSign, Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeToLicitaciones, subscribeToInvitados } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import type { LicitacionProyecto, InvitadoLicitacion } from '../types';

interface LicitacionConEstado extends LicitacionProyecto {
  estadoPropuesta: InvitadoLicitacion['estadoPropuesta'] | null;
  fechaLimite: string;
  vencida: boolean;
}

export function PortalDashboard() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const [licitaciones, setLicitaciones] = useState<LicitacionConEstado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.proveedorId) return;

    // Suscripción a todas las licitaciones
    const unsub = subscribeToLicitaciones(async allLics => {
      // Para cada licitación, verificar si el proveedor fue invitado
      const relevantes: LicitacionConEstado[] = [];

      await Promise.all(
        allLics
          .filter(l => l.estado === 'En Evaluacion' || l.estado === 'Adjudicado')
          .map(lic => {
            return new Promise<void>(resolve => {
              const unsubInv = subscribeToInvitados(lic.id, invitados => {
                const invitado = invitados.find(i => i.proveedorId === profile.proveedorId);
                if (invitado) {
                  const hoy = new Date();
                  const fechaLimite = new Date(lic.fechaEvaluacion);
                  const vencida = hoy > fechaLimite;
                  relevantes.push({
                    ...lic,
                    estadoPropuesta: invitado.estadoPropuesta,
                    fechaLimite: lic.fechaEvaluacion,
                    vencida,
                  });
                }
                unsubInv();
                resolve();
              });
            });
          })
      );

      // Ordenar: vigentes primero, luego vencidas
      relevantes.sort((a, b) => {
        if (a.vencida !== b.vencida) return a.vencida ? 1 : -1;
        return new Date(a.fechaLimite).getTime() - new Date(b.fechaLimite).getTime();
      });

      setLicitaciones(relevantes);
      setLoading(false);
    });

    return unsub;
  }, [profile]);

  const handleLogout = async () => {
    await logout();
    navigate('/portal/login');
  };

  const getEstadoBadge = (lic: LicitacionConEstado) => {
    if (lic.estado === 'Adjudicado') {
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">Proceso Cerrado</span>;
    }
    if (lic.vencida) {
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Plazo Vencido</span>;
    }
    if (lic.estadoPropuesta === 'Presentada') {
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Propuesta Enviada</span>;
    }
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Pendiente</span>;
  };

  const diasRestantes = (fechaLimite: string) => {
    const hoy = new Date();
    const limite = new Date(fechaLimite);
    const diff = Math.ceil((limite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a8a 40%, #0c4a6e 100%)' }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between"
        style={{
          background: 'rgba(15,23,42,0.8)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #38bdf8, #1d4ed8)' }}
          >
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] text-sky-400 font-semibold uppercase tracking-wider">Portal Proveedores · UCT DGDC</p>
            <p className="text-sm font-bold text-white leading-tight">{profile?.displayName}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-medium transition px-3 py-1.5 rounded-lg hover:bg-white/10"
        >
          <LogOut className="w-4 h-4" />
          Cerrar Sesión
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Mis Licitaciones</h2>
          <p className="text-sky-300 text-sm mt-1">
            A continuación encontrará los procesos en los que ha sido invitado a participar.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="w-8 h-8 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        ) : licitaciones.length === 0 ? (
          <div
            className="rounded-3xl p-12 text-center"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No tiene licitaciones asignadas por el momento.</p>
            <p className="text-slate-600 text-sm mt-1">Cuando sea invitado a participar, aparecerán aquí.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {licitaciones.map(lic => {
              const dias = diasRestantes(lic.fechaLimite);
              const canSubmit = !lic.vencida && lic.estado === 'En Evaluacion';

              return (
                <div
                  key={lic.id}
                  className="rounded-2xl p-6 cursor-pointer transition-all group"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.3)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.09)';
                  }}
                  onClick={() => navigate(`/portal/licitacion/${lic.id}`)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Codes */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded">CP: {lic.codigoCP}</span>
                        <span className="text-[10px] font-semibold bg-slate-800 text-slate-400 px-2 py-0.5 rounded">OP: {lic.codigoOP}</span>
                        {getEstadoBadge(lic)}
                      </div>

                      <h3 className="text-base font-bold text-white line-clamp-2 leading-snug">{lic.nombreProyecto.toLocaleUpperCase('es-CL')}</h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{lic.descripcion}</p>

                      {/* Info row */}
                      <div className="flex items-center gap-4 mt-3">
                        <span className="flex items-center gap-1.5 text-xs text-slate-400">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300 font-semibold">{formatoMonedaCLP(lic.montoEstimado)}</span>
                          <span className="text-slate-500">estimado</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Calendar className="w-3.5 h-3.5 text-sky-400" />
                          <span>Límite: {new Date(lic.fechaLimite).toLocaleDateString('es-CL')}</span>
                        </span>
                      </div>
                    </div>

                    {/* Right panel */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {canSubmit ? (
                        <div className="text-center">
                          {dias <= 3 ? (
                            <span className="flex items-center gap-1 text-amber-400 text-xs font-bold">
                              <AlertTriangle className="w-3.5 h-3.5" /> {dias} día{dias !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-sky-400 text-xs font-semibold">
                              <Clock className="w-3.5 h-3.5" /> {dias} días
                            </span>
                          )}
                          <span className="text-slate-500 text-[10px]">restantes</span>
                        </div>
                      ) : lic.estadoPropuesta === 'Presentada' ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <FileText className="w-6 h-6 text-slate-600" />
                      )}

                      <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-sky-400 transition" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
