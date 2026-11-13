import { useEffect, useState, type CSSProperties } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, DoorOpen, FolderKanban, Loader2, LogOut, Lock, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ilusCJP from '../assets/campus/cjp.webp';
import ilusCSF from '../assets/campus/csf.webp';
import ilusCRC from '../assets/campus/crc.webp';
import ilusCSL from '../assets/campus/csl.webp';
import ilusCML from '../assets/campus/cml.webp';
import ilusCEC from '../assets/campus/cec.webp';
import ilusCSC from '../assets/campus/csc.webp';
import ilusCSN from '../assets/campus/csn.webp';

/**
 * Ilustraciones de los campus que recorren el panel del inicio (versiones limpias, sin números ni títulos).
 * `foco` es el punto de la ilustración que se mantiene a la vista cuando el panel la recorta.
 */
const CAMPUS_PORTADA = [
  { sigla: 'CJP', nombre: 'Campus San Juan Pablo II', ciudad: 'Temuco', src: ilusCJP, foco: '42% 55%' },
  { sigla: 'CSF', nombre: 'Campus San Francisco', ciudad: 'Temuco', src: ilusCSF, foco: '52% 45%' },
  { sigla: 'CRC', nombre: 'Campus Dr. Luis Rivas del Canto', ciudad: 'Temuco', src: ilusCRC, foco: '45% 40%' },
  { sigla: 'CSL', nombre: 'Campus Nuestra Señora de Lourdes', ciudad: 'Temuco', src: ilusCSL, foco: '38% 55%' },
  { sigla: 'CML', nombre: 'Campus Mons. Alejandro Menchaca Lira', ciudad: 'Temuco', src: ilusCML, foco: '35% 60%' },
  { sigla: 'CEC', nombre: 'Campus Educación Continua', ciudad: 'Temuco', src: ilusCEC, foco: '58% 45%' },
  { sigla: 'CSC', nombre: 'Campus Mons. Sergio Contreras Navia', ciudad: 'Temuco', src: ilusCSC, foco: '50% 65%' },
  { sigla: 'CSN', nombre: 'Campus San Nicolás', ciudad: 'Curacautín', src: ilusCSN, foco: '62% 45%' },
] as const;
const DURACION_CAMPUS = 7000;

/** Módulos a los que se puede entrar desde el inicio. Comparten el mismo inicio de sesión. */
const MODULOS = [
  {
    id: 'adjudicaciones',
    nombre: 'Proyectos',
    titulo: 'Gestor de Proyectos',
    detalle: 'Cartera de proyectos, presupuestos, procesos de licitación, evaluación de ofertas, actas y seguimiento de obras.',
    temas: ['Cartera', 'Evaluación', 'Actas', 'Proveedores'],
    ruta: '/proyectos',
    icono: FolderKanban,
    color: '#1d4ed8',
    suave: '#eff6ff',
  },
  {
    id: 'espacios',
    nombre: 'Espacios',
    titulo: 'Gestor de Espacios',
    detalle: 'Catastro de campus, edificios y recintos, con superficies y planos interactivos.',
    temas: ['Campus', 'Edificios', 'Recintos', 'Planos'],
    ruta: '/espacios',
    icono: DoorOpen,
    color: '#0f766e',
    suave: '#f0fdfa',
  },
  {
    id: 'asignacion',
    nombre: 'Asignación',
    titulo: 'Asignación de Espacios',
    detalle: 'Ubicar a los funcionarios en sus recintos, plantear cambios con su antes y después, y el historial de movimientos.',
    temas: ['Por ubicar', 'Propuestas', 'Antes y después', 'Historial'],
    ruta: '/asignacion',
    icono: Users,
    color: '#6d28d9',
    suave: '#f5f3ff',
  },
] as const;

/** Si el ingreso con Google termina en redirección (ventana emergente bloqueada), aquí se recuerda el módulo elegido. */
const MODULO_PENDIENTE_KEY = 'dgdc.inicio.moduloPendiente';

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

/** Retraso escalonado para la animación de entrada. */
const retraso = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MarcaDGDC({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/25 backdrop-blur-md`}>
      <svg viewBox="0 0 40 40" className="h-[60%] w-[60%]" fill="none" aria-hidden>
        <path d="M20 4L36 12V28L20 36L4 28V12L20 4Z" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M20 4V36M4 12L36 12M4 28L36 28" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
        <circle cx="20" cy="20" r="4" fill="white" />
      </svg>
    </div>
  );
}

const sinMovimiento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Recorrido por las ilustraciones de los campus: fundido entre una y otra, con un acercamiento lento. */
function useCarruselCampus() {
  const [actual, setActual] = useState(0);
  const [anterior, setAnterior] = useState<number | null>(null);
  const [todas, setTodas] = useState(false);   // las demás ilustraciones se cargan después de la primera
  const [vuelta, setVuelta] = useState(0);     // reinicia la barra de avance al elegir un campus a mano
  const ir = (i: number) => {
    setActual(a => { if (a !== i) setAnterior(a); return i; });
    setVuelta(v => v + 1);
  };
  useEffect(() => {
    if (!todas || sinMovimiento()) return;
    const t = setTimeout(() => {
      setAnterior(actual);
      setActual(a => (a + 1) % CAMPUS_PORTADA.length);
    }, DURACION_CAMPUS);
    return () => clearTimeout(t);
  }, [actual, todas, vuelta]);
  return { actual, anterior, todas, ir, cargada: () => setTodas(true), vuelta };
}

/** Inicio del sistema DGDC: formas de ingreso y elección de módulo (Licitaciones o Espacios). */
export function InternalLoginPage() {
  const { user, profile, isInternalUser, loading, loginInternalWithGoogle, loginDevBypass, logout, error, clearError } = useAuth();
  const navigate = useNavigate();
  const volverA = (useLocation().state as { volverA?: string } | null)?.volverA;
  const [ingresando, setIngresando] = useState<string | null>(null);
  const carrusel = useCarruselCampus();
  const campus = CAMPUS_PORTADA[carrusel.actual];
  const conectado = !loading && !!user && isInternalUser;
  const nombre = profile?.displayName || user?.displayName || 'Usuario UCT';
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');

  // Al volver de la redirección de Google, se entra al módulo que se había elegido.
  useEffect(() => {
    if (!conectado) return;
    const pendiente = sessionStorage.getItem(MODULO_PENDIENTE_KEY);
    if (pendiente) {
      sessionStorage.removeItem(MODULO_PENDIENTE_KEY);
      navigate(pendiente, { replace: true });
    }
  }, [conectado, navigate]);

  // Si se llegó aquí desde una página protegida (ej. el libro de obra en el celular), se vuelve a ella.
  if (conectado && volverA && volverA !== '/' && volverA !== '/login') return <Navigate to={volverA} replace />;

  const ingresarConGoogle = async (ruta?: string) => {
    clearError();
    setIngresando(ruta || 'general');
    if (ruta) sessionStorage.setItem(MODULO_PENDIENTE_KEY, ruta);
    try {
      await loginInternalWithGoogle();
      sessionStorage.removeItem(MODULO_PENDIENTE_KEY);
      if (ruta) navigate(ruta, { replace: true });
    } catch {
      // El contexto entrega el mensaje específico al usuario.
      sessionStorage.removeItem(MODULO_PENDIENTE_KEY);
    } finally {
      setIngresando(null);
    }
  };

  const abrirModulo = (ruta: string) => {
    if (conectado) navigate(ruta);
    else void ingresarConGoogle(ruta);
  };

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-900 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ── Panel institucional ───────────────────────────────────── */}
      <aside className="relative h-64 overflow-hidden bg-slate-950 sm:h-80 lg:sticky lg:top-0 lg:h-screen">
        {CAMPUS_PORTADA.map((c, i) => (i === 0 || carrusel.todas) && (
          <img
            key={c.sigla}
            src={c.src}
            alt=""
            decoding="async"
            onLoad={i === 0 ? carrusel.cargada : undefined}
            style={{ objectPosition: c.foco }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1600ms] ease-out ${
              i === carrusel.actual ? 'opacity-100' : 'opacity-0'
            } ${i === carrusel.actual || i === carrusel.anterior ? 'inicio-deriva' : ''}`}
          />
        ))}
        {/* Sombras solo arriba (marca) y abajo (texto): el centro deja ver la ilustración con su color. */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-950/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent lg:h-[72%] lg:from-slate-950 lg:via-slate-950/75" />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950/35 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-6 text-white sm:p-10 xl:p-14">
          <div className="inicio-aparecer flex items-center gap-3" style={retraso(50)}>
            <MarcaDGDC />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Universidad Católica de Temuco</p>
              <p className="text-[11px] text-white/60">Dirección de Gestión y Desarrollo de Campus · DGDC</p>
            </div>
          </div>

          <div>
            <div className="hidden lg:block">
              <p className="inicio-aparecer text-[11px] font-semibold uppercase tracking-[.28em] text-sky-200/80" style={retraso(150)}>
                Plataforma de gestión
              </p>
              <h2 className="inicio-aparecer mt-4 max-w-md text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.03em] xl:text-5xl" style={retraso(250)}>
                Infraestructura universitaria, gestionada con rigor.
              </h2>
              <p className="inicio-aparecer mt-5 max-w-sm text-sm leading-relaxed text-white/65" style={retraso(350)}>
                Un solo acceso para la cartera de proyectos, los procesos de licitación y el catastro de espacios de la Universidad.
              </p>
            </div>

            {/* Campus a la vista y avance del recorrido */}
            <div className="inicio-aparecer lg:mt-10 lg:border-t lg:border-white/15 lg:pt-6" style={retraso(450)}>
              <p key={campus.sigla} className="inicio-rotulo flex items-baseline gap-2 text-sm" aria-live="polite">
                <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-white/90 ring-1 ring-white/20 backdrop-blur-sm">{campus.sigla}</span>
                <span className="truncate font-medium text-white">{campus.nombre}</span>
                <span className="hidden shrink-0 text-white/50 sm:inline">· {campus.ciudad}</span>
              </p>
              <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Campus de la Universidad">
                {CAMPUS_PORTADA.map((c, i) => (
                  <button
                    key={c.sigla}
                    type="button"
                    role="tab"
                    aria-selected={i === carrusel.actual}
                    aria-label={c.nombre}
                    title={c.nombre}
                    onClick={() => carrusel.ir(i)}
                    className="group relative h-4 flex-1 max-w-12"
                  >
                    <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition group-hover:bg-white/35">
                      {i === carrusel.actual && (
                        <span
                          key={carrusel.vuelta}
                          className={`absolute inset-y-0 left-0 rounded-full bg-white ${carrusel.todas ? 'inicio-avance' : 'w-0'}`}
                          style={{ animationDuration: `${DURACION_CAMPUS}ms` }}
                        />
                      )}
                      {i < carrusel.actual && <span className="absolute inset-0 rounded-full bg-white/55" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Contenido ─────────────────────────────────────────────── */}
      <section className="flex min-h-[calc(100vh-16rem)] flex-col px-5 py-8 sm:px-10 sm:py-12 lg:min-h-screen xl:px-20">
        {/* Barra superior: sesión */}
        <div className="inicio-aparecer flex min-h-10 flex-wrap items-center justify-between gap-3" style={retraso(100)}>
          <img src={`${import.meta.env.BASE_URL}logo-uct.png`} alt="Universidad Católica de Temuco" className="h-10 sm:h-12 w-auto object-contain" />
          {conectado ? (
            <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-1.5 shadow-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">{iniciales || 'U'}</span>
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block max-w-[14rem] truncate text-xs font-semibold text-slate-800">{nombre}</span>
                <span className="block max-w-[14rem] truncate text-[11px] text-slate-500">{user?.email}</span>
              </span>
              <button
                id="inicio-cerrar-sesion"
                type="button"
                onClick={() => void logout()}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Lock className="h-3.5 w-3.5" /> Acceso restringido a personal autorizado
            </span>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-10">
          <header>
            <p className="inicio-aparecer text-sm font-medium text-slate-500" style={retraso(150)}>
              {conectado ? `${saludo()}, ${nombre.split(' ')[0]}` : 'Bienvenido'}
            </p>
            <h1 className="inicio-aparecer mt-1.5 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2.5rem] sm:leading-tight" style={retraso(220)}>
              Dirección de Gestión y Desarrollo de Campus
            </h1>
            <p className="inicio-aparecer mt-3 max-w-lg text-[15px] leading-relaxed text-slate-500" style={retraso(290)}>
              {conectado
                ? 'Seleccione el módulo con el que desea trabajar.'
                : 'Seleccione un módulo para ingresar con su cuenta institucional de Google.'}
            </p>
          </header>

          {/* Módulos */}
          <div className="mt-9 space-y-4" role="list" aria-label="Módulos del sistema">
            {MODULOS.map((m, i) => {
              const Icono = m.icono;
              const cargando = ingresando === m.ruta;
              return (
                <button
                  key={m.id}
                  id={`inicio-modulo-${m.id}`}
                  role="listitem"
                  type="button"
                  onClick={() => abrirModulo(m.ruta)}
                  disabled={loading || !!ingresando}
                  style={{ ...retraso(380 + i * 90), '--acento': m.color } as CSSProperties}
                  className="inicio-aparecer group relative flex w-full items-start gap-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[color:var(--acento)]/30 hover:shadow-[0_18px_40px_-18px_rgba(15,23,42,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--acento)] disabled:cursor-wait disabled:hover:translate-y-0 sm:p-6"
                >
                  {/* Línea de acento */}
                  <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100" style={{ background: m.color }} />

                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105" style={{ background: m.suave, color: m.color }}>
                    {cargando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icono className="h-5 w-5" strokeWidth={1.75} />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold tracking-tight text-slate-950">{m.nombre}</span>
                      <span className="hidden text-xs text-slate-400 sm:inline">{m.titulo}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-500">
                      {cargando ? 'Validando su cuenta institucional…' : m.detalle}
                    </span>
                    <span className="mt-3.5 flex flex-wrap gap-1.5">
                      {m.temas.map(t => (
                        <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{t}</span>
                      ))}
                    </span>
                  </span>

                  <span className="relative mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-all duration-300 group-hover:border-transparent group-hover:text-white">
                    <span className="absolute h-9 w-9 scale-0 rounded-full transition-transform duration-300 group-hover:scale-100" style={{ background: m.color }} />
                    <ArrowUpRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <div role="alert" className="mt-5 flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs leading-relaxed text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          {/* Formas de ingreso */}
          {!conectado && (
            <div className="inicio-aparecer mt-9" style={retraso(600)}>
              <div className="flex items-center gap-4 text-[11px] font-medium uppercase tracking-[.18em] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> o ingrese primero <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div className={`mt-5 grid gap-3 ${import.meta.env.DEV ? 'sm:grid-cols-2' : ''}`}>
                <button
                  id="inicio-ingresar-google"
                  type="button"
                  onClick={() => void ingresarConGoogle()}
                  disabled={loading || !!ingresando}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
                >
                  {ingresando === 'general' || loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : <LogoGoogle />}
                  {ingresando === 'general' ? 'Validando su cuenta…' : 'Continuar con Google'}
                </button>
                {import.meta.env.DEV && (
                  <button
                    id="inicio-ingreso-rapido"
                    type="button"
                    onClick={() => loginDevBypass?.()}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Ingreso rápido
                    <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">Desarrollo</span>
                  </button>
                )}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Use su cuenta <strong className="font-semibold text-slate-700">@uct.cl</strong> incluida en la nómina autorizada. Si su navegador tiene
                abierta otra cuenta (por ejemplo, un Gmail personal), elija la institucional o use “Usar otra cuenta”.
              </p>
            </div>
          )}
        </div>

        <footer className="mx-auto flex w-full max-w-2xl flex-col gap-1 border-t border-slate-200 pt-5 text-[11px] text-slate-400 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Universidad Católica de Temuco</span>
          <span>Soporte: <a href="mailto:dsilva@uct.cl" className="font-medium text-slate-500 hover:text-slate-800">dsilva@uct.cl</a></span>
        </footer>
      </section>
    </main>
  );
}
