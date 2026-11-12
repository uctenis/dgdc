import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, History, Loader2, LogOut, UserCircle2, UserPlus, Users, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LogoInicioDGDC, SelectorModulos } from '../components/SelectorModulos';
import { ContextoAsignacion, type DatosAsignacion } from '../components/asignacion/comun';
import { PorUbicar } from '../components/asignacion/PorUbicar';
import { Propuestas } from '../components/asignacion/Propuestas';
import { HistorialAsignacion } from '../components/asignacion/HistorialAsignacion';
import { listarPropuestas, listarRecintosAsignables, type Propuesta } from '../services/asignacion';
import { listarEdificiosConDatos } from '../services/recintos';
import { useNomina } from '../services/nomina';
import { clavePersona } from '../utils/analisisEspacios';
import { personasConRecinto, type RecintoAsignable } from '../utils/asignacion';
import { formatoFecha } from '../utils/fechas';

type Pestana = 'ubicar' | 'propuestas' | 'historial';

/**
 * Asignación de Espacios: ubicar en recintos a los funcionarios vigentes que aún no tienen uno, plantear cambios
 * (propuestas con su antes y después) y llevar el historial de cada movimiento. Trabaja sobre los mismos recintos del
 * Gestor de Espacios.
 */
export function AsignacionApp() {
  const { user, profile, logout } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const pestana = (parametros.get('vista') as Pestana) || 'ubicar';
  const propuestaAbierta = parametros.get('propuesta');
  const ir = (cambios: Record<string, string | null>) => {
    const nuevo = new URLSearchParams(parametros);
    for (const [k, v] of Object.entries(cambios)) if (v) nuevo.set(k, v); else nuevo.delete(k);
    setParametros(nuevo);
  };

  const nomina = useNomina();
  const [recintos, setRecintos] = useState<RecintoAsignable[]>([]);
  const [nombresEdificio, setNombresEdificio] = useState<Record<string, string>>({});
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null);

  const avisar = useCallback((texto: string, tipo: 'ok' | 'error' = 'ok') => {
    setAviso({ texto, tipo });
    window.setTimeout(() => setAviso(a => (a?.texto === texto ? null : a)), tipo === 'error' ? 9000 : 4500);
  }, []);
  const recargar = useCallback(async () => {
    try {
      setRecintos(await listarRecintosAsignables());
      setVersion(v => v + 1);
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
  }, [avisar]);
  const recargarPropuestas = useCallback(async () => {
    try { setPropuestas(await listarPropuestas()); } catch (e) { avisar(e instanceof Error ? e.message : String(e), 'error'); }
  }, [avisar]);

  useEffect(() => {
    void Promise.all([
      recargar(), recargarPropuestas(),
      listarEdificiosConDatos().then(d => setNombresEdificio(d.nombres)).catch(() => {}),
    ]).finally(() => setCargando(false));
  }, [recargar, recargarPropuestas]);

  const datos: DatosAsignacion = useMemo(() => ({
    recintos, porId: new Map(recintos.map(r => [r.id, r])), codigos: new Map(recintos.map(r => [r.id, r.codigo])),
    nombresEdificio, usuario: user?.email || 'desconocido', recargar, avisar,
  }), [recintos, nombresEdificio, user?.email, recargar, avisar]);

  // Indicadores: vigentes de la nómina con y sin recinto, y propuestas abiertas.
  const conRecinto = useMemo(() => personasConRecinto(recintos), [recintos]);
  const vigentes = nomina.size;
  const ubicados = useMemo(() => [...nomina.values()].filter(f => conRecinto.has(clavePersona(f.nombre))).length, [nomina, conRecinto]);
  const borradores = propuestas.filter(p => p.estado === 'Borrador').length;
  const fechaNomina = nomina.size ? formatoFecha([...nomina.values()][0].nomina) : '';

  const pestanas: { id: Pestana; texto: string; icono: typeof Users; contador?: number }[] = [
    { id: 'ubicar', texto: 'Por ubicar', icono: UserPlus, contador: vigentes - ubicados },
    { id: 'propuestas', texto: 'Propuestas de cambio', icono: ClipboardList, contador: borradores || undefined },
    { id: 'historial', texto: 'Historial', icono: History },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 text-white" style={{ background: 'linear-gradient(135deg, #2e1065 0%, #5b21b6 60%, #7c3aed 100%)', boxShadow: '0 4px 24px -4px rgba(46,16,101,0.55)' }}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-[60px] lg:h-[72px] gap-3">
          <div className="flex items-center gap-3 lg:gap-4 min-w-0">
            <LogoInicioDGDC tono="violeta" />
            <div className="min-w-0">
              <span className="hidden sm:inline-block text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded mb-0.5"
                style={{ background: 'rgba(196,181,253,0.15)', color: '#ddd6fe', border: '1px solid rgba(196,181,253,0.25)' }}>UCT · Infraestructura · DGDC</span>
              <SelectorModulos actual="asignacion" onInicioModulo={() => setParametros(new URLSearchParams())} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden lg:flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[10px] text-violet-50">
              <UserCircle2 className="h-4 w-4 text-violet-200" />
              <span><strong className="block text-white">{profile?.displayName || user?.displayName || 'Usuario UCT'}</strong>{user?.email}</span>
            </div>
            <button onClick={() => void logout()} title="Cerrar sesión" className="rounded-lg bg-white/5 p-2.5 text-violet-50 transition hover:bg-white/15 hover:text-white"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Indicadores */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {[
            { t: 'Funcionarios vigentes', v: vigentes, d: fechaNomina ? `Nómina de Personas al ${fechaNomina}` : 'Sin nómina cargada' },
            { t: 'Con recinto', v: ubicados, d: vigentes ? `${Math.round((ubicados / vigentes) * 100)} % de los vigentes` : '' },
            { t: 'Por ubicar', v: vigentes - ubicados, d: 'Vigentes sin recinto asignado', destacado: true },
            { t: 'Propuestas en borrador', v: borradores, d: `${propuestas.filter(p => p.estado === 'Aplicada').length} aplicada(s)` },
          ].map(k => (
            <div key={k.t} className={`rounded-2xl border p-3 sm:p-4 shadow-sm ${k.destacado ? 'bg-violet-700 border-violet-700 text-white' : 'bg-white border-slate-200'}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${k.destacado ? 'text-violet-200' : 'text-slate-500'}`}>{k.t}</p>
              <p className="text-2xl sm:text-3xl font-black mt-0.5">{cargando ? '…' : k.v.toLocaleString('es-CL')}</p>
              <p className={`text-[11px] ${k.destacado ? 'text-violet-100' : 'text-slate-500'}`}>{k.d}</p>
            </div>
          ))}
        </div>

        <nav className="flex flex-wrap gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm w-fit">
          {pestanas.map(p => (
            <button key={p.id} type="button" onClick={() => ir({ vista: p.id === 'ubicar' ? null : p.id })}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold transition ${pestana === p.id ? 'bg-violet-700 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
              <p.icono className="w-4 h-4" /> {p.texto}
              {!!p.contador && <span className={`px-1.5 rounded-full text-[11px] ${pestana === p.id ? 'bg-white/20' : 'bg-violet-100 text-violet-800'}`}>{p.contador}</span>}
            </button>
          ))}
        </nav>

        {cargando ? (
          <div className="flex items-center gap-2 text-slate-500 p-8"><Loader2 className="w-5 h-5 animate-spin" /> Cargando recintos y nómina…</div>
        ) : (
          <ContextoAsignacion.Provider value={datos}>
            {pestana === 'ubicar' && <PorUbicar nomina={nomina} propuestas={propuestas} onIrAPropuesta={id => ir({ vista: 'propuestas', propuesta: id })} />}
            {pestana === 'propuestas' && <Propuestas propuestas={propuestas} abiertaId={propuestaAbierta} onAbrir={id => ir({ propuesta: id })} onCambio={recargarPropuestas} />}
            {pestana === 'historial' && <HistorialAsignacion propuestas={propuestas} version={version} />}
          </ContextoAsignacion.Provider>
        )}
      </main>

      {aviso && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold max-w-[90vw] ${aviso.tipo === 'error' ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white'}`}>
          {aviso.tipo === 'error' ? <XCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300" />} {aviso.texto}
        </div>
      )}
    </div>
  );
}
