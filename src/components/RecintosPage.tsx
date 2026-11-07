import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2, Layers, Plus, Pencil, Trash2, History, FileSpreadsheet, FileText, Loader2, AlertTriangle, X, ExternalLink, Copy, DoorOpen, ChevronRight, ChevronDown, Trees, LayoutGrid, Table2, ArrowRightLeft, Search, Download, ClipboardCheck, BarChart3,
} from 'lucide-react';
import { getCampusList, saveCampusList, obtenerEdificiosDeCampus, etiquetaEdificio, obtenerInfoEdificio } from '../data/campusData';
import { useAuth } from '../context/AuthContext';
import { SUPABASE_CONFIGURADO } from '../lib/supabase';
import {
  listarPisos, listarEdificiosConDatos, obtenerFichaEdificio, listarUsos, guardarPiso, eliminarPiso, listarRecintos, guardarRecinto, eliminarRecinto, historialRecinto,
  listarDocumentos, registrarDocumento, listarRecintosDeCampus, separarUnidades, abrirArchivoDocumento,
} from '../services/recintos';
import {
  ESTADOS_RECINTO, TENENCIAS, MOTIVOS_ALTA, MOTIVOS_BAJA, TIPOS_DOCUMENTO, ESPECIALIDADES, FORMATOS_DOCUMENTO,
  type Piso, type Recinto, type Tenencia, type DocumentoEdificio, type CambioRecinto, type FichaEdificio, type Ocupante,
} from '../types/recintos';
import { ImportarRecintosModal } from './ImportarRecintosModal';
import { BuscadorEspacios } from './BuscadorEspacios';
import { ExploradorEdificio } from './ExploradorEdificio';
import { SubirLaminasCampus } from './SubirLaminasCampus';
import { RevisionCampus } from './RevisionCampus';
import { MoverPersonaModal } from './MoverPersonaModal';
import { alertasRecinto, observacionesSinNotas } from '../utils/alertasRecinto';
import { formatoFecha } from '../utils/fechas';
import { comoTitulo } from '../utils/texto';
import { getConfigEspacios } from '../data/espaciosConfig';
import { formatoTipo, formatoUnidad } from '../utils/formatoNombres';
import { hoyISO, resumenSuperficie, textoVigencia, vigenteEn } from '../utils/vigenciaRecinto';

const m2 = (n?: number | null) => (n ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} m²` : '—');
/** Superficie para las tablas: siempre con dos decimales, para que las cifras queden alineadas. */
const m2Tabla = (n?: number | null) => (n || n === 0 ? Number(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const COLOR_ESTADO: Record<string, string> = {
  Operativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'En obra': 'bg-amber-50 text-amber-800 border-amber-200',
  'Fuera de servicio': 'bg-rose-50 text-rose-700 border-rose-200',
  Eliminado: 'bg-slate-100 text-slate-500 border-slate-200',
};
const campo = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-400';

type RecintoEditable = Omit<Recinto, 'id'> & { id?: string };
type Vista = 'general' | 'recintos' | 'plano' | 'documentos';
type DocumentoNuevo = Omit<DocumentoEdificio, 'id' | 'vigente' | 'creado_en' | 'creado_por'>;

/** Módulo de control documental: pisos y recintos de cada edificio, y el índice de sus planos (los archivos siguen en Drive). */
export function RecintosPage() {
  const [enBase, setEnBase] = useState<string[]>([]);
  const [nombresCatastro, setNombresCatastro] = useState<Record<string, string>>({});
  const [categorias, setCategorias] = useState<Record<string, string>>({});
  const [pisosContraidos, setPisosContraidos] = useState<Set<string>>(new Set());
  const [usos, setUsos] = useState<string[]>([]);
  // Campus y edificios de la configuración, más los que solo existen en la base (códigos del catastro aún no configurados).
  const configurados = getCampusList();
  const siglasConfiguradas = new Set(configurados.map(c => c.sigla));
  const campus = [
    ...configurados.map(c => ({ sigla: c.sigla, nombre: c.nombre })),
    ...[...new Set(enBase.map(e => e.slice(0, 3)))].filter(s => !siglasConfiguradas.has(s)).sort()
      .map(s => ({ sigla: s, nombre: 'sin configurar (solo en el catastro)' })),
  ];
  // Se navega por niveles: primero el campus (tarjetas), luego el edificio (tarjetas) y recién ahí su contenido.
  // Campus, edificio y pestaña viven en la dirección (?campus=CSN&edificio=CSN11&vista=plano): así el botón «atrás» del
  // navegador vuelve un paso (del edificio al campus, del campus a la lista) en vez de salir del módulo.
  const [parametros, setParametros] = useSearchParams();
  const campusSigla = parametros.get('campus') || '';
  const [resaltado, setResaltado] = useState<string | null>(null);
  const delCampus = obtenerEdificiosDeCampus(campusSigla);
  const sinConfigurar = enBase.filter(e => e.startsWith(campusSigla) && !delCampus.includes(e) && !configurados.some(c => c.edificios.includes(e)))
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const edificios = [...delCampus, ...sinConfigurar];
  const [filtroEdificios, setFiltroEdificios] = useState('');
  const [verComunes, setVerComunes] = useState(false);
  const edificio = parametros.get('edificio') || '';
  // Nombre del edificio: el del catastro y, si no tiene, el de la configuración de campus.
  // Un solo nombre para cada edificio en todo el sistema: el de la configuración compartida (el mismo que muestran
  // las licitaciones); el del catastro solo si la configuración no tiene uno.
  const nombreEdificio = (e: string) => obtenerInfoEdificio(e)?.nombre || nombresCatastro[e] || '';
  // Espacio común del catastro (categoría 3: camping, accesos, áreas verdes) o zona exterior de la configuración.
  const esEspacioComun = (e: string) => categorias[e] === '3' || !!obtenerInfoEdificio(e)?.esExterior;
  const etiqueta = (e: string) => (nombreEdificio(e) ? `${e} · ${nombreEdificio(e)}` : etiquetaEdificio(e));
  const edificiosFiltrados = edificios.filter(e => {
    const q = filtroEdificios.trim().toLowerCase();
    return !q || e.toLowerCase().includes(q) || (nombreEdificio(e) || '').toLowerCase().includes(q);
  });
  // Sin «vista» en la dirección se abre la vista general (árbol, plano y ficha); «recintos» es la tabla por piso.
  const vista = (['recintos', 'plano', 'documentos'].includes(parametros.get('vista') || '') ? parametros.get('vista') : 'general') as Vista;
  /**
   * Cambia de campus, edificio o pestaña. Elegir un campus parte sin edificio, y elegir un edificio parte en sus recintos.
   * Cambiar de campus o edificio deja un paso en el historial; cambiar de pestaña, no.
   */
  const ir = (destino: { campus?: string; edificio?: string; vista?: Vista }) => {
    const nuevo = new URLSearchParams(parametros);
    const poner = (clave: string, valor?: string) => (valor ? nuevo.set(clave, valor) : nuevo.delete(clave));
    if (destino.campus !== undefined) { poner('campus', destino.campus); if (destino.edificio === undefined) nuevo.delete('edificio'); }
    if (destino.edificio !== undefined) { poner('edificio', destino.edificio); if (destino.vista === undefined) nuevo.delete('vista'); }
    if (destino.vista !== undefined) poner('vista', destino.vista === 'general' ? '' : destino.vista);
    // Abrir o cerrar el editor de planos sí deja un paso: «atrás» lo cierra y vuelve a la vista general.
    const soloPestana = destino.campus === undefined && destino.edificio === undefined && destino.vista !== 'plano' && vista !== 'plano';
    setParametros(nuevo, { replace: soloPestana });
  };
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [recintos, setRecintos] = useState<Recinto[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoEdificio[]>([]);
  const [ficha, setFicha] = useState<FichaEdificio | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [pisoEditando, setPisoEditando] = useState<(Omit<Piso, 'id'> & { id?: string }) | null>(null);
  const [recintoEditando, setRecintoEditando] = useState<RecintoEditable | null>(null);
  const [historial, setHistorial] = useState<{ recinto: Recinto; cambios: CambioRecinto[] } | null>(null);
  const [fichaRecinto, setFichaRecinto] = useState<Recinto | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [fichaPorAbrir, setFichaPorAbrir] = useState<string | null>(null);   // recinto cuya ficha se abre al cargar su edificio
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());   // recintos marcados para sumar sus superficies
  const [documentoNuevo, setDocumentoNuevo] = useState<DocumentoNuevo | null>(null);
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [importando, setImportando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [moviendo, setMoviendo] = useState<{ origen: Recinto; ocupante: Ocupante } | null>(null);
  const [avisoCambio, setAvisoCambio] = useState('');

  // Los edificios que en la configuración compartida no tienen nombre toman el del catastro, para que las licitaciones
  // los muestren igual que el Gestor (solo el administrador publica la configuración).
  const { isAdmin } = useAuth();
  useEffect(() => {
    if (!isAdmin || !Object.keys(nombresCatastro).length) return;
    let cambio = false;
    const nueva = getCampusList().map(c => {
      const info = { ...(c.edificiosInfo || {}) };
      for (const e of c.edificios) {
        if (!info[e]?.nombre?.trim() && nombresCatastro[e]?.trim()) { info[e] = { ...(info[e] || {}), nombre: comoTitulo(nombresCatastro[e]) }; cambio = true; }
      }
      return { ...c, edificiosInfo: info };
    });
    if (cambio) saveCampusList(nueva);
  }, [isAdmin, nombresCatastro]);

  useEffect(() => {
    if (!SUPABASE_CONFIGURADO) return;
    listarEdificiosConDatos().then(d => { setEnBase(d.codigos); setNombresCatastro(d.nombres); setCategorias(d.categorias); }).catch(() => {});
    listarUsos().then(setUsos).catch(() => {});
  }, []);

  // Abre el edificio de un resultado del buscador y marca el recinto encontrado.
  const irA = (codigoEdificio: string, recintoId?: string) => {
    ir({ campus: configurados.find(c => c.edificios.includes(codigoEdificio))?.sigla || codigoEdificio.slice(0, 3), edificio: codigoEdificio, vista: 'general' });
    setResaltado(recintoId || null);
  };
  /** Nombre de cada edificio para los reportes: el del catastro o el de la configuración. */
  const nombresEdificios = () => Object.fromEntries([...new Set([...enBase, ...edificios])].map(e => [e, nombreEdificio(e)]));
  /** Descarga a Excel los recintos de un edificio (con los datos ya cargados) o de todo el campus. */
  const descargar = async (alcance: 'edificio' | 'campus') => {
    setDescargando(true); setError('');
    try {
      const { exportarRecintosExcel } = await import('../utils/exportarRecintos');
      if (alcance === 'edificio') {
        const porPiso = new Map(pisos.map(p => [p.id, p]));
        await exportarRecintosExcel(recintos.map(r => ({ ...r, piso: porPiso.get(r.piso_id) })), nombresEdificios(), etiqueta(edificio));
      } else {
        const nombreCampus = campus.find(c => c.sigla === campusSigla)?.nombre || campusSigla;
        await exportarRecintosExcel(await listarRecintosDeCampus(campusSigla), nombresEdificios(), `${campusSigla} ${nombreCampus}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDescargando(false);
    }
  };

  const cargar = useCallback(async () => {
    if (!edificio || !SUPABASE_CONFIGURADO) return;
    setCargando(true);
    setError('');
    try {
      const [p, r, d, f] = await Promise.all([listarPisos(edificio), listarRecintos(edificio), listarDocumentos(edificio), obtenerFichaEdificio(edificio)]);
      setPisos(p); setRecintos(r); setDocumentos(d); setFicha(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [edificio]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (resaltado && !cargando) document.getElementById(`recinto-${resaltado}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [resaltado, cargando, recintos]);

  const accion = async (fn: () => Promise<unknown>, alTerminar?: () => void) => {
    setGuardando(true);
    setError('');
    try {
      await fn();
      alTerminar?.();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const alternarPiso = (id: string) => setPisosContraidos(prev => {
    const nuevo = new Set(prev);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    return nuevo;
  });
  // Al cambiar de edificio, todos los pisos parten desplegados.
  useEffect(() => { setPisosContraidos(new Set()); setSeleccion(new Set()); }, [edificio]);
  useEffect(() => {
    const recinto = parametros.get('recinto');
    if (!recinto) return;
    setResaltado(recinto); setFichaPorAbrir(recinto);
    const nuevo = new URLSearchParams(parametros); nuevo.delete('recinto');
    setParametros(nuevo, { replace: true });
  }, [parametros]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Abre «Consultas y análisis» con filtros ya puestos (el campus o el edificio en que se está). */
  const analizar = (consulta: object) => setParametros(new URLSearchParams({ seccion: 'analisis', consulta: JSON.stringify(consulta) }));
  useEffect(() => {
    if (!fichaPorAbrir || cargando) return;
    const r = recintos.find(x => x.id === fichaPorAbrir);
    if (r) { setFichaRecinto(r); setFichaPorAbrir(null); }
  }, [fichaPorAbrir, cargando, recintos]);
  const marcar = (ids: string[], marcado: boolean) => setSeleccion(prev => {
    const nuevo = new Set(prev);
    ids.forEach(id => (marcado ? nuevo.add(id) : nuevo.delete(id)));
    return nuevo;
  });
  const abrirHistorial = async (r: Recinto) => {
    try { setHistorial({ recinto: r, cambios: await historialRecinto(r.id) }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  // El recinto encontrado con el buscador queda a la vista aunque su piso estuviera contraído.
  useEffect(() => {
    const piso = recintos.find(r => r.id === resaltado)?.piso_id;
    if (piso) setPisosContraidos(prev => { if (!prev.has(piso)) return prev; const nuevo = new Set(prev); nuevo.delete(piso); return nuevo; });
  }, [resaltado, recintos]);

  const recintosPorPiso = useMemo(() => {
    const mapa = new Map<string, Recinto[]>();
    recintos.forEach(r => mapa.set(r.piso_id, [...(mapa.get(r.piso_id) || []), r]));
    return mapa;
  }, [recintos]);
  const activos = recintos.filter(r => r.estado !== 'Eliminado');
  const porRevisar = activos.filter(r => alertasRecinto(r).length).length;
  // Totales de hoy: solo lo que existe y está a cargo de la UCT (sin las obras por entregar ni lo dado de baja).
  const resumenHoy = resumenSuperficie(recintos);
  const superficieTotal = resumenHoy.util;
  const superficieOguc = resumenHoy.oguc;
  const documentosVisibles = documentos.filter(d => verAnteriores || d.vigente);
  // CAD (DWG) vigente del edificio, guardado en el sistema: se descarga desde cualquier lámina.
  const cadVigente = documentos.find(d => d.vigente && d.formato === 'DWG' && d.archivo);
  const abrirArchivo = async (d: DocumentoEdificio, cad = false) => {
    try { await abrirArchivoDocumento(d, cad); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const porEspecialidad = ESPECIALIDADES.map(e => ({ especialidad: e, lista: documentosVisibles.filter(d => d.especialidad === e) })).filter(g => g.lista.length);

  const nuevoRecinto = (pisoId: string): RecintoEditable => ({
    edificio_codigo: edificio, piso_id: pisoId, codigo: '', nombre: '', uso: '', superficie_m2: null, superficie_oguc_m2: null, capacidad: null,
    estado: 'Operativo', unidad_usuaria: '', foto_url: '', observaciones: '', atributos: {}, origen: 'Manual',
  });
  const nuevoDocumento = (base?: DocumentoEdificio): DocumentoNuevo => base
    ? { ...base, version: siguienteVersion(base.version), fecha_documento: null, drive_url: '', reemplaza_a: base.id, observaciones: '' }
    : { edificio_codigo: edificio, piso_id: null, titulo: '', tipo: 'Plano', especialidad: 'Arquitectura', formato: 'PDF', codigo_lamina: '', version: '1', fecha_documento: null, reemplaza_a: null, drive_url: '', proyecto_codigo: '', observaciones: '' };

  if (!SUPABASE_CONFIGURADO) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-900 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>El módulo de recintos y planos aún no está conectado a su base de datos en este ambiente. Avise al administrador del sistema.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {/* Encabezado: buscador y una sola ruta de navegación (Campus › campus › edificio), con selectores en cada nivel. */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 shrink-0"><Building2 className="w-5 h-5 text-teal-700" /> Recintos y planos</h2>
          <div className="flex-1 min-w-[240px]"><BuscadorEspacios onElegir={irA} /></div>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Ubicación">
          <button type="button" onClick={() => { ir({ campus: '' }); setResaltado(null); }}
            className={`px-2.5 py-1.5 rounded-lg font-bold ${campusSigla ? 'text-teal-800 hover:bg-teal-50' : 'bg-slate-900 text-white'}`}>Todos los campus</button>
          {campusSigla && <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <select value={campusSigla} onChange={e => { ir({ campus: e.target.value }); setResaltado(null); }} aria-label="Campus"
              className={`max-w-[70vw] sm:max-w-xs px-2.5 py-1.5 rounded-lg border font-bold ${edificio ? 'border-slate-300 bg-white text-teal-800' : 'border-slate-900 bg-slate-900 text-white'}`}>
              {campus.map(c => <option key={c.sigla} value={c.sigla}>{c.sigla} · {c.nombre}</option>)}
            </select>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <select value={edificio} onChange={e => { ir({ edificio: e.target.value }); setResaltado(null); }} aria-label="Edificio"
              className={`max-w-[85vw] sm:max-w-sm px-2.5 py-1.5 rounded-lg border font-bold ${edificio ? 'border-slate-900 bg-slate-900 text-white' : 'border-dashed border-slate-300 bg-white text-slate-500'}`}>
              <option value="">Elegir edificio…</option>
              {edificios.map(e => <option key={e} value={e}>{etiqueta(e)}{sinConfigurar.includes(e) ? ' (sin configurar)' : ''}{enBase.includes(e) ? '' : ' · sin datos'}</option>)}
            </select>
          </>}
        </nav>
      </div>

      {!campusSigla && (
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {campus.map(c => {
            const conDatos = enBase.filter(e => (configurados.find(k => k.edificios.includes(e))?.sigla || e.slice(0, 3)) === c.sigla).length;
            return (
              <button key={c.sigla} type="button" onClick={() => ir({ campus: c.sigla })}
                className="text-left bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm hover:border-teal-400 hover:shadow-md transition">
                <span className="font-mono font-extrabold text-teal-800">{c.sigla}</span>
                <span className="block font-bold text-slate-800 leading-tight mt-0.5">{c.nombre}</span>
                <span className="block text-slate-500 mt-1">{conDatos ? `${conDatos} edificio(s) con datos` : 'Sin datos aún'}</span>
              </button>
            );
          })}
        </div>
      )}


      {campusSigla && !edificio && (
        edificios.length ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => analizar({ f: { campus: [campusSigla] }, g: 'edificio', m: 'util', cf: 'edificio', cc: 'tipo' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 font-bold text-white">
                <BarChart3 className="w-3.5 h-3.5" /> Analizar campus
              </button>
              <button type="button" onClick={() => setRevisando(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-50">
                <ClipboardCheck className="w-3.5 h-3.5" /> Por revisar
              </button>
              <button type="button" disabled={descargando} onClick={() => void descargar('campus')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {descargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Descargar Excel del campus
              </button>
              <SubirLaminasCampus siglaCampus={campusSigla} />
            </div>
            {edificios.length > 8 && (
              <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-teal-400 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input value={filtroEdificios} onChange={e => setFiltroEdificios(e.target.value)} placeholder={`Filtrar los ${edificios.length} edificios por código o nombre…`} className="flex-1 min-w-0 outline-none" />
                {filtroEdificios && <button type="button" onClick={() => setFiltroEdificios('')}><X className="w-3.5 h-3.5 text-slate-400" /></button>}
              </label>
            )}
            {[
              { titulo: 'Edificios y construcciones', lista: edificiosFiltrados.filter(e => !esEspacioComun(e)), plegable: false },
              { titulo: 'Espacios comunes y exteriores', lista: edificiosFiltrados.filter(esEspacioComun), plegable: true },
            ].filter(g => g.lista.length).map(g => {
              // Los espacios comunes parten plegados (son muchos y se consultan poco), salvo al filtrar.
              const abierta = !g.plegable || verComunes || !!filtroEdificios.trim();
              return (
              <section key={g.titulo} className="space-y-2">
                <button type="button" disabled={!g.plegable} onClick={() => setVerComunes(v => !v)}
                  className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-500 disabled:cursor-default">
                  {g.plegable && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${abierta ? '' : '-rotate-90'}`} />}
                  {g.titulo} <span className="font-normal">({g.lista.length})</span>
                </button>
                {abierta && <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
                  {g.lista.map(e => {
                    const info = obtenerInfoEdificio(e);
                    const conDatos = enBase.includes(e);
                    const Icono = esEspacioComun(e) ? Trees : Building2;
                    return (
                      <button key={e} type="button" onClick={() => { ir({ edificio: e }); setResaltado(null); }}
                        className={`text-left bg-white border rounded-xl sm:rounded-2xl px-3 py-2 sm:p-4 shadow-sm hover:border-teal-400 hover:shadow-md transition ${conDatos ? 'border-slate-200' : 'border-dashed border-slate-300'}`}>
                        <span className="flex items-center gap-1.5">
                          <Icono className={`w-4 h-4 ${conDatos ? 'text-teal-700' : 'text-slate-400'}`} />
                          <span className="font-mono font-extrabold text-teal-800">{e}</span>
                        </span>
                        <span className="block font-bold text-slate-800 leading-tight mt-1">{nombreEdificio(e) || (info?.esExterior ? info.nombre : sinConfigurar.includes(e) ? 'Sin configurar (solo en el catastro)' : 'Sin nombre')}</span>
                        <span className={`hidden sm:block mt-1 ${conDatos ? 'text-emerald-700' : 'text-slate-400'}`}>{conDatos ? 'Con datos del catastro' : 'Sin datos aún'}</span>
                      </button>
                    );
                  })}
                </div>}
              </section>
              );
            })}
            {!edificiosFiltrados.length && <p className="text-slate-500">Ningún edificio coincide con «{filtroEdificios}».</p>}
          </div>
        ) : (
          <p className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">Este campus aún no tiene edificios registrados.</p>
        )
      )}

      {campusSigla && edificio && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {/* Pestañas con el mismo formato que las de una licitación. El editor de planos no es pestaña: se abre desde
                «Editar contornos» en la vista general, sobre el piso que se está mirando. */}
            <nav className="flex flex-wrap gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
              {([
                { id: 'general', texto: 'Vista general', Icono: LayoutGrid },
                { id: 'recintos', texto: `Tabla de recintos (${activos.length})`, Icono: Table2 },
                { id: 'documentos', texto: `Planos y documentos (${documentos.filter(d => d.vigente).length})`, Icono: FileText },
              ] as const).map(({ id, texto, Icono }) => (
                <button key={id} type="button" onClick={() => ir({ vista: id })}
                  className={`shrink-0 px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition ${(vista === id || (id === 'general' && vista === 'plano')) ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                  <Icono className="w-4 h-4" /> {texto}
                </button>
              ))}
            </nav>
            {/* En la vista general los indicadores ya muestran superficie y pendientes. */}
            {vista !== 'general' && vista !== 'plano' && <span className="ml-auto text-slate-500">
              {pisos.length} piso(s) · útil <strong className="text-slate-800">{m2(superficieTotal)}</strong> · OGUC <strong className="text-slate-800">{m2(superficieOguc)}</strong>
              {resumenHoy.porVenir.recintos > 0 && <> · <span className="text-amber-700" title="Obras registradas con fecha de entrega futura: no suman en el total de hoy">por venir <strong>{m2(resumenHoy.porVenir.util)}</strong></span></>}
              {resumenHoy.noPropia.recintos > 0 && <> · <span className="text-sky-700" title="Parte del total que es arrendada, en comodato o en concesión">no propia <strong>{m2(resumenHoy.noPropia.util)}</strong></span></>}
            </span>}
            {(vista === 'general' || vista === 'plano') && <span className="ml-auto" />}
            {porRevisar > 0 && vista === 'recintos' && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-bold" title="Recintos con superficies faltantes o dudosas, sin tipo o con una nota «Por revisar»">
                <AlertTriangle className="w-3.5 h-3.5" /> {porRevisar} por revisar
              </span>
            )}
            <button type="button" disabled={descargando || !recintos.length} onClick={() => void descargar('edificio')} title="Descargar los recintos de este edificio en Excel"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {descargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Excel
            </button>
            <button type="button" onClick={() => analizar({ f: { edificio: [edificio] }, g: 'tipo', m: 'util', cf: 'piso', cc: 'tipo' })} title="Cruces de superficies de este edificio por piso, tipo y unidad"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 font-bold text-white">
              <BarChart3 className="w-3.5 h-3.5" /> Analizar edificio
            </button>
            {cargando && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>

          {ficha && vista !== 'general' && <TarjetaFicha ficha={ficha} sumaUtil={superficieTotal} sumaOguc={superficieOguc} />}

          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0" /> <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError('')}><X className="w-4 h-4" /></button>
            </div>
          )}

          {vista === 'recintos' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPisoEditando({ edificio_codigo: edificio, codigo: '', nombre: '', orden: (pisos.at(-1)?.orden ?? 0) + 1, observaciones: '' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"><Layers className="w-3.5 h-3.5" /> Agregar piso</button>
                <button type="button" onClick={() => setImportando(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"><FileSpreadsheet className="w-3.5 h-3.5" /> Importar planilla</button>
              </div>
              {!cargando && !pisos.length && (
                <p className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">
                  {ficha?.superficie_m2
                    ? `Este edificio no tiene recintos detallados; el catastro informa ${m2(ficha.superficie_m2)} útiles para el edificio completo. Puede agregar sus pisos y recintos a mano o importarlos.`
                    : 'Este edificio aún no tiene pisos ni recintos. Agréguelos a mano o importe la planilla del edificio.'}
                </p>
              )}
              {pisos.length > 1 && (
                <div className="flex justify-end">
                  <button type="button" onClick={() => setPisosContraidos(pisosContraidos.size ? new Set() : new Set(pisos.map(p => p.id)))}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-600 hover:bg-slate-50">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${pisosContraidos.size ? '-rotate-90' : ''}`} />
                    {pisosContraidos.size ? 'Desplegar todos los pisos' : 'Contraer todos los pisos'}
                  </button>
                </div>
              )}
              {pisos.map(piso => {
                const lista = recintosPorPiso.get(piso.id) || [];
                const vigentes = lista.filter(r => r.estado !== 'Eliminado');
                const hoy = hoyISO();
                const sup = vigentes.filter(r => vigenteEn(r, hoy)).reduce((s, r) => s + (Number(r.superficie_m2) || 0), 0);
                const supOguc = vigentes.filter(r => vigenteEn(r, hoy)).reduce((s, r) => s + (Number(r.superficie_oguc_m2) || 0), 0);
                const marcadosPiso = vigentes.filter(r => seleccion.has(r.id)).length;
                const contraido = pisosContraidos.has(piso.id);
                return (
                  <div key={piso.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 bg-slate-50 ${contraido ? '' : 'border-b border-slate-200'}`}>
                      <button type="button" onClick={() => alternarPiso(piso.id)} aria-expanded={!contraido} title={contraido ? 'Desplegar' : 'Contraer'}
                        className="flex items-center gap-2 -ml-1 pl-1 pr-2 py-0.5 rounded-lg hover:bg-slate-200/60">
                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${contraido ? '-rotate-90' : ''}`} />
                        <span className="font-mono font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">{piso.codigo}</span>
                        <span className="font-bold text-slate-800">{piso.nombre}</span>
                        <span className="text-slate-500">· {lista.length} recinto(s) · útil <strong className="text-slate-700">{m2(sup)}</strong> · OGUC <strong className="text-slate-700">{m2(supOguc)}</strong></span>
                      </button>
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => setRecintoEditando(nuevoRecinto(piso.id))} className="flex items-center gap-1 px-2 py-1 text-teal-700 hover:bg-teal-50 rounded-md font-bold"><Plus className="w-3.5 h-3.5" /> Recinto</button>
                        <button type="button" title="Editar piso" onClick={() => setPisoEditando(piso)} className="p-1.5 text-slate-500 hover:bg-slate-200 rounded-md"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" title="Eliminar piso (debe estar vacío)" onClick={() => confirm(`¿Eliminar el piso ${piso.codigo}? Solo se puede si no tiene recintos.`) && accion(() => eliminarPiso(piso.id))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {lista.length > 0 && !contraido && (
                      <div className="overflow-x-auto">
                        {/* Anchos fijos: las columnas quedan iguales en todos los pisos. */}
                        <table className="w-full min-w-[1150px] table-fixed">
                          <colgroup>
                            <col className="w-9" /><col className="w-[9.5rem]" /><col className="w-[22%]" /><col className="w-[16%]" /><col className="w-[6.5rem]" /><col className="w-[6.5rem]" />
                            <col className="w-[5.5rem]" /><col className="w-[8.5rem]" /><col className="w-[15%]" /><col /><col className="w-[6.5rem]" />
                          </colgroup>
                          <thead className="text-slate-500 text-[10px] uppercase tracking-wide bg-white border-b border-slate-100">
                            <tr>
                              <th className="pl-3 py-2">
                                <input type="checkbox" title="Marcar todo el piso" checked={vigentes.length > 0 && marcadosPiso === vigentes.length}
                                  ref={el => { if (el) el.indeterminate = marcadosPiso > 0 && marcadosPiso < vigentes.length; }}
                                  onChange={e => marcar(vigentes.map(r => r.id), e.target.checked)} className="accent-teal-600" />
                              </th>
                              <th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">Uso</th>
                              <th className="px-3 py-2 text-right">m² útil</th><th className="px-3 py-2 text-right">m² OGUC</th><th className="px-3 py-2 text-right">Capacidad</th>
                              <th className="px-3 py-2 text-left">Estado</th><th className="px-3 py-2 text-left">Unidad</th><th className="px-3 py-2 text-left">Ocupantes</th><th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {lista.map(r => (
                              <tr key={r.id} id={`recinto-${r.id}`} onClick={() => setFichaRecinto(r)} title="Ver la ficha del recinto"
                                className={`cursor-pointer hover:bg-teal-50/60 ${seleccion.has(r.id) ? 'bg-teal-50' : ''} ${r.estado === 'Eliminado' ? 'text-slate-400 line-through' : ''} ${r.id === resaltado ? 'bg-amber-100 outline outline-2 outline-amber-400' : ''}`}>
                                <td className="pl-3 py-2" onClick={e => e.stopPropagation()}>
                                  <input type="checkbox" checked={seleccion.has(r.id)} onChange={e => marcar([r.id], e.target.checked)} className="accent-teal-600" title="Marcar para sumar su superficie" />
                                </td>
                                <td className="px-3 py-2 font-mono font-bold truncate" title={[r.codigo, ...alertasRecinto(r).map(a => `• ${a}`)].join('\n')}>
                                  {alertasRecinto(r).length > 0 && <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-amber-500" />}{r.codigo}
                                </td>
                                <td className="px-3 py-2 truncate" title={r.nombre}>{r.nombre}{r.foto_url && <a href={r.foto_url} target="_blank" rel="noreferrer" className="ml-1.5 text-sky-700 no-underline" title="Ver foto">📷</a>}
                                  <EtiquetasVigencia r={r} /></td>
                                <td className="px-3 py-2 truncate text-slate-600" title={r.uso || ''}>{r.uso || '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{m2Tabla(r.superficie_m2)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{m2Tabla(r.superficie_oguc_m2)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.capacidad ?? '—'}</td>
                                <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold no-underline ${COLOR_ESTADO[r.estado] || COLOR_ESTADO.Eliminado}`}>{r.estado}</span></td>
                                <td className="px-3 py-2 truncate text-slate-600" title={r.unidad_usuaria || ''}>{r.unidad_usuaria || '—'}</td>
                                <td className="px-3 py-2 truncate text-slate-600" title={(r.ocupantes || []).map(textoOcupante).join('\n')}>
                                  {r.ocupantes?.length ? <>{comoTitulo(r.ocupantes[0].nombre)}{r.ocupantes.length > 1 && <span className="ml-1 px-1.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px]">+{r.ocupantes.length - 1}</span>}</> : '—'}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                  <button type="button" title="Editar" onClick={() => setRecintoEditando(r)} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button type="button" title="Historial de cambios" onClick={() => void abrirHistorial(r)} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><History className="w-3.5 h-3.5" /></button>
                                  <button type="button" title="Eliminar" onClick={() => confirm(`¿Eliminar el recinto ${r.codigo}? Si dejó de existir por una obra, es mejor cambiar su estado a "Eliminado" para conservar su historia.`) && accion(() => eliminarRecinto(r.id))} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(vista === 'general' || vista === 'plano') && (
            <ExploradorEdificio editando={vista === 'plano'} onEditar={abrir => ir({ vista: abrir ? 'plano' : 'general' })} edificioCodigo={edificio} nombreEdificio={nombreEdificio(edificio)} pisos={pisos} recintos={activos} documentos={documentos} todosLosRecintos={recintos}
              destacado={resaltado} edificiosCampus={edificios.filter(e => enBase.includes(e)).map(e => ({ codigo: e, etiqueta: etiqueta(e) }))}
              onIrEdificio={e => { ir({ edificio: e }); setResaltado(null); }} onVerFicha={r => setFichaRecinto(r)} onEditarRecinto={r => setRecintoEditando(r)}
              onVerDocumentos={() => ir({ vista: 'documentos' })} onRecargar={cargar} />
          )}

          {vista === 'documentos' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setDocumentoNuevo(nuevoDocumento())} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold"><Plus className="w-3.5 h-3.5" /> Registrar plano o documento</button>
                <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={verAnteriores} onChange={e => setVerAnteriores(e.target.checked)} /> Mostrar versiones anteriores</label>
                {cadVigente
                  ? <button type="button" onClick={() => void abrirArchivo(cadVigente, true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold"><Download className="w-3.5 h-3.5" /> Descargar CAD (DWG)</button>
                  : <span className="ml-auto text-slate-400" title="Súbalo con «Subir láminas y CAD del campus» en la página del campus">Sin CAD (DWG) en el sistema</span>}
              </div>
              {!cargando && !porEspecialidad.length && (
                <p className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">
                  Sin planos registrados para este edificio. Registre cada lámina con el enlace a su archivo en Drive.
                </p>
              )}
              {porEspecialidad.map(g => (
                <div key={g.especialidad} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <h3 className="px-4 py-2 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-800">{g.especialidad}</h3>
                  <div className="divide-y divide-slate-100">
                    {g.lista.map(d => (
                      <div key={d.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 ${d.vigente ? '' : 'bg-slate-50 text-slate-400'}`}>
                        <FileText className="w-4 h-4 shrink-0 text-slate-400" />
                        {d.codigo_lamina && <span className="font-mono font-bold">{d.codigo_lamina}</span>}
                        <span className="font-semibold">{d.titulo}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">v{d.version}</span>
                        {d.formato && <span className="text-[10px] text-slate-500">{d.formato}</span>}
                        {d.piso_id && <span className="text-[10px] text-slate-500">· piso {pisos.find(p => p.id === d.piso_id)?.codigo}</span>}
                        {d.fecha_documento && <span className="text-[10px] text-slate-500">· {formatoFecha(d.fecha_documento)}</span>}
                        <span className={`text-[10px] font-bold ${d.vigente ? 'text-emerald-700' : 'text-slate-400'}`}>{d.vigente ? 'Vigente' : 'Reemplazado'}</span>
                        <div className="ml-auto flex items-center gap-1">
                          {/* Cada botón lleva a un archivo que existe: la lámina guardada en el sistema, el CAD del edificio o Drive. */}
                          {d.archivo_visor && <button type="button" onClick={() => void abrirArchivo(d)} className="flex items-center gap-1 px-2 py-1 text-sky-700 hover:bg-sky-50 rounded-md font-bold"><FileText className="w-3.5 h-3.5" /> Ver PDF</button>}
                          {(d.archivo || (d.formato === 'PDF' && cadVigente)) && (
                            <button type="button" onClick={() => void abrirArchivo(d.archivo ? d : cadVigente!, true)} title={d.archivo ? 'Descargar este CAD' : `Descargar el CAD vigente del edificio (${cadVigente?.titulo.replace(/^CAD del edificio · /, '')})`}
                              className="flex items-center gap-1 px-2 py-1 text-emerald-700 hover:bg-emerald-50 rounded-md font-bold"><Download className="w-3.5 h-3.5" /> DWG</button>
                          )}
                          {/^https:\/\//.test(d.drive_url || '') && <a href={d.drive_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 text-slate-600 hover:bg-slate-50 rounded-md font-bold"><ExternalLink className="w-3.5 h-3.5" /> Drive</a>}
                          {d.vigente && <button type="button" onClick={() => setDocumentoNuevo(nuevoDocumento(d))} className="flex items-center gap-1 px-2 py-1 text-teal-700 hover:bg-teal-50 rounded-md font-bold" title="Registrar una versión nueva de este plano: la actual queda como reemplazada"><Copy className="w-3.5 h-3.5" /> Nueva versión</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {pisoEditando && (
        <Ventana titulo={pisoEditando.id ? `Editar piso ${pisoEditando.codigo}` : 'Agregar piso'} onClose={() => { setPisoEditando(null); setError(''); }} guardando={guardando} error={error}
          onGuardar={() => {
            if (!pisoEditando.codigo.trim() || !pisoEditando.nombre.trim()) return setError('El piso necesita código y nombre.');
            accion(() => guardarPiso({ ...pisoEditando, codigo: pisoEditando.codigo.trim().toUpperCase() }), () => setPisoEditando(null));
          }}>
          <div className="grid grid-cols-3 gap-2">
            <label className="font-bold">Código *<input value={pisoEditando.codigo} onChange={e => setPisoEditando({ ...pisoEditando, codigo: e.target.value })} placeholder="P1, S1…" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold col-span-2">Nombre *<input value={pisoEditando.nombre} onChange={e => setPisoEditando({ ...pisoEditando, nombre: e.target.value })} placeholder="Primer piso" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Orden<input type="number" value={pisoEditando.orden} onChange={e => setPisoEditando({ ...pisoEditando, orden: Number(e.target.value) || 0 })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold col-span-2">Observaciones<input value={pisoEditando.observaciones || ''} onChange={e => setPisoEditando({ ...pisoEditando, observaciones: e.target.value })} className={`mt-1 ${campo} font-normal`} /></label>
          </div>
          <p className="text-slate-500 mt-2">El orden define cómo se listan los pisos, de abajo hacia arriba (subterráneo -1, primer piso 1…).</p>
        </Ventana>
      )}

      {recintoEditando && (
        <Ventana titulo={recintoEditando.id ? `Editar recinto ${recintoEditando.codigo}` : 'Agregar recinto'} onClose={() => { setRecintoEditando(null); setError(''); }} guardando={guardando} error={error}
          onGuardar={() => {
            if (!recintoEditando.codigo.trim() || !recintoEditando.nombre.trim()) return setError('El recinto necesita código y nombre.');
            // Lo escrito todo en mayúsculas (como en el catastro) se guarda con el formato acordado; lo demás, tal cual.
            const enMayusculas = (t?: string | null) => !!t && /\p{Lu}/u.test(t) && t === t.toUpperCase();
            accion(() => guardarRecinto({
              ...recintoEditando,
              codigo: recintoEditando.codigo.trim().toUpperCase(),
              // Con la fecha de baja ya cumplida, el recinto deja de estar vigente.
              estado: recintoEditando.fecha_baja && recintoEditando.fecha_baja <= hoyISO() ? 'Eliminado' : recintoEditando.estado,
              nombre: enMayusculas(recintoEditando.nombre) ? formatoTipo(recintoEditando.nombre) : recintoEditando.nombre.trim(),
              uso: enMayusculas(recintoEditando.uso) ? formatoTipo(recintoEditando.uso) : recintoEditando.uso,
              unidad_usuaria: enMayusculas(recintoEditando.unidad_usuaria) ? separarUnidades(recintoEditando.unidad_usuaria).map(formatoUnidad).join(' / ') : recintoEditando.unidad_usuaria,
            }), () => setRecintoEditando(null));
          }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="font-bold">Código *<input value={recintoEditando.codigo} onChange={e => setRecintoEditando({ ...recintoEditando, codigo: e.target.value })} placeholder="A102" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold sm:col-span-2">Nombre (tipo de recinto) *<input list="tipos-oficiales" value={recintoEditando.nombre} onChange={e => setRecintoEditando({ ...recintoEditando, nombre: e.target.value })} placeholder="Sala de clases" className={`mt-1 ${campo} font-normal`} /></label>
            <datalist id="tipos-oficiales">{getConfigEspacios().tipos.map(t => <option key={t.nombre} value={t.nombre} />)}</datalist>
            <label className="font-bold">Piso
              <select value={recintoEditando.piso_id} onChange={e => setRecintoEditando({ ...recintoEditando, piso_id: e.target.value })} className={`mt-1 ${campo} font-normal`}>
                {pisos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
              </select>
            </label>
            <label className="font-bold">Uso<SelectorUso valor={recintoEditando.uso || ''} usos={getConfigEspacios().usos.length ? getConfigEspacios().usos : usos} onChange={uso => setRecintoEditando({ ...recintoEditando, uso })} /></label>
            <label className="font-bold">Estado
              <select value={recintoEditando.estado} onChange={e => setRecintoEditando({ ...recintoEditando, estado: e.target.value as Recinto['estado'] })} className={`mt-1 ${campo} font-normal`}>
                {ESTADOS_RECINTO.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="font-bold">Superficie útil (m²)<input type="number" min={0} step="0.01" value={recintoEditando.superficie_m2 ?? ''} onChange={e => setRecintoEditando({ ...recintoEditando, superficie_m2: e.target.value === '' ? null : Number(e.target.value) })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Superficie OGUC (m²)<input type="number" min={0} step="0.01" value={recintoEditando.superficie_oguc_m2 ?? ''} onChange={e => setRecintoEditando({ ...recintoEditando, superficie_oguc_m2: e.target.value === '' ? null : Number(e.target.value) })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Capacidad (personas)<input type="number" min={0} value={recintoEditando.capacidad ?? ''} onChange={e => setRecintoEditando({ ...recintoEditando, capacidad: e.target.value === '' ? null : Number(e.target.value) })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Tenencia
              <select value={recintoEditando.tenencia || 'Propia'} onChange={e => setRecintoEditando({ ...recintoEditando, tenencia: e.target.value as Tenencia })} className={`mt-1 ${campo} font-normal`}>
                {TENENCIAS.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="font-bold">Opera desde<input type="date" value={recintoEditando.fecha_alta || ''} onChange={e => setRecintoEditando({ ...recintoEditando, fecha_alta: e.target.value || null })} className={`mt-1 ${campo} font-normal`}
              title="Vacía si existe desde antes del registro. Si es futura (una obra por entregar), no suma en los totales de hoy." /></label>
            <label className="font-bold">Motivo del alta<input list="motivos-alta" value={recintoEditando.motivo_alta || ''} onChange={e => setRecintoEditando({ ...recintoEditando, motivo_alta: e.target.value || null })} placeholder="Construcción, arriendo…" className={`mt-1 ${campo} font-normal`} /></label>
            <datalist id="motivos-alta">{MOTIVOS_ALTA.map(m => <option key={m} value={m} />)}</datalist>
            <label className="font-bold">De baja desde<input type="date" value={recintoEditando.fecha_baja || ''} onChange={e => setRecintoEditando({ ...recintoEditando, fecha_baja: e.target.value || null })} className={`mt-1 ${campo} font-normal`}
              title="Desde cuándo dejó de existir o de estar a cargo de la UCT. Si ya pasó, el recinto queda «Eliminado» y sale de los totales de hoy, pero sigue en su historia." /></label>
            <label className="font-bold sm:col-span-2">Motivo de la baja<input list="motivos-baja" value={recintoEditando.motivo_baja || ''} onChange={e => setRecintoEditando({ ...recintoEditando, motivo_baja: e.target.value || null })} placeholder="Demolición, fin de arriendo…" className={`mt-1 ${campo} font-normal`} /></label>
            <datalist id="motivos-baja">{MOTIVOS_BAJA.map(m => <option key={m} value={m} />)}</datalist>
            <label className="font-bold">Unidad usuaria<input list="unidades-oficiales" value={recintoEditando.unidad_usuaria || ''} onChange={e => setRecintoEditando({ ...recintoEditando, unidad_usuaria: e.target.value })} placeholder="Fac. de Ingeniería" className={`mt-1 ${campo} font-normal`} /></label>
            <datalist id="unidades-oficiales">{getConfigEspacios().unidades.map(u => <option key={u} value={u} />)}</datalist>
            <label className="font-bold sm:col-span-3">Foto de referencia (enlace de Drive)<input value={recintoEditando.foto_url || ''} onChange={e => setRecintoEditando({ ...recintoEditando, foto_url: e.target.value.trim() })} placeholder="https://drive.google.com/…" className={`mt-1 ${campo} font-normal`} /></label>
            <EditorOcupantes ocupantes={recintoEditando.ocupantes || []} onChange={ocupantes => setRecintoEditando({ ...recintoEditando, ocupantes })} />
            <label className="font-bold sm:col-span-3">Observaciones<textarea rows={2} value={recintoEditando.observaciones || ''} onChange={e => setRecintoEditando({ ...recintoEditando, observaciones: e.target.value })} className={`mt-1 ${campo} font-normal`} /></label>
          </div>
          {Object.keys(recintoEditando.atributos || {}).length > 0 && (
            <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              <p className="font-bold text-slate-700 mb-1">Datos adicionales de la planilla</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {Object.entries(recintoEditando.atributos).map(([k, v]) => <div key={k} className="flex gap-1.5"><dt className="text-slate-500">{k}:</dt><dd>{v}</dd></div>)}
              </dl>
            </div>
          )}
        </Ventana>
      )}

      {documentoNuevo && (
        <Ventana titulo={documentoNuevo.reemplaza_a ? `Nueva versión de ${documentoNuevo.codigo_lamina || documentoNuevo.titulo}` : 'Registrar plano o documento'} onClose={() => { setDocumentoNuevo(null); setError(''); }} guardando={guardando} error={error}
          onGuardar={() => {
            if (!documentoNuevo.titulo.trim()) return setError('El documento necesita un título.');
            if (!/^https:\/\//.test(documentoNuevo.drive_url.trim())) return setError('Pegue el enlace al archivo en Drive (debe empezar con https://).');
            accion(() => registrarDocumento({ ...documentoNuevo, drive_url: documentoNuevo.drive_url.trim() }), () => setDocumentoNuevo(null));
          }}>
          {documentoNuevo.reemplaza_a && <p className="mb-2 text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">Al guardar, la versión actual queda como reemplazada y esta pasa a ser la vigente.</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="font-bold sm:col-span-2">Título *<input value={documentoNuevo.titulo} onChange={e => setDocumentoNuevo({ ...documentoNuevo, titulo: e.target.value })} placeholder="Planta arquitectura primer piso" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Lámina<input value={documentoNuevo.codigo_lamina || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, codigo_lamina: e.target.value })} placeholder="A-02" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Tipo<select value={documentoNuevo.tipo} onChange={e => setDocumentoNuevo({ ...documentoNuevo, tipo: e.target.value as DocumentoNuevo['tipo'] })} className={`mt-1 ${campo} font-normal`}>{TIPOS_DOCUMENTO.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="font-bold">Especialidad<select value={documentoNuevo.especialidad} onChange={e => setDocumentoNuevo({ ...documentoNuevo, especialidad: e.target.value as DocumentoNuevo['especialidad'] })} className={`mt-1 ${campo} font-normal`}>{ESPECIALIDADES.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="font-bold">Formato<select value={documentoNuevo.formato || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, formato: (e.target.value || null) as DocumentoNuevo['formato'] })} className={`mt-1 ${campo} font-normal`}>{FORMATOS_DOCUMENTO.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="font-bold">Versión<input value={documentoNuevo.version} onChange={e => setDocumentoNuevo({ ...documentoNuevo, version: e.target.value })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Fecha del plano<input type="date" value={documentoNuevo.fecha_documento || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, fecha_documento: e.target.value || null })} className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Piso<select value={documentoNuevo.piso_id || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, piso_id: e.target.value || null })} className={`mt-1 ${campo} font-normal`}><option value="">Todo el edificio</option>{pisos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}</select></label>
            <label className="font-bold sm:col-span-3">Enlace al archivo en Drive *<input value={documentoNuevo.drive_url} onChange={e => setDocumentoNuevo({ ...documentoNuevo, drive_url: e.target.value })} placeholder="https://drive.google.com/file/d/…" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold">Proyecto que lo generó<input value={documentoNuevo.proyecto_codigo || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, proyecto_codigo: e.target.value })} placeholder="2026_017" className={`mt-1 ${campo} font-normal`} /></label>
            <label className="font-bold sm:col-span-2">Observaciones<input value={documentoNuevo.observaciones || ''} onChange={e => setDocumentoNuevo({ ...documentoNuevo, observaciones: e.target.value })} className={`mt-1 ${campo} font-normal`} /></label>
          </div>
        </Ventana>
      )}

      {revisando && (
        <RevisionCampus prefijo={campusSigla} titulo={campus.find(c => c.sigla === campusSigla)?.nombre || campusSigla} nombres={nombresEdificios()}
          onClose={() => setRevisando(false)}
          onAbrir={(e, id) => { setRevisando(false); irA(e, id); setFichaPorAbrir(id); }} />
      )}

      {fichaRecinto && (
        <FichaRecinto recinto={fichaRecinto} piso={pisos.find(p => p.id === fichaRecinto.piso_id)} onClose={() => setFichaRecinto(null)}
          onEditar={() => { setRecintoEditando(fichaRecinto); setFichaRecinto(null); }}
          onHistorial={() => void abrirHistorial(fichaRecinto)}
          onVerEnPlano={() => { setResaltado(fichaRecinto.id); setFichaRecinto(null); ir({ vista: 'general' }); }}
          onMover={ocupante => setMoviendo({ origen: fichaRecinto, ocupante })} />
      )}

      {moviendo && (
        <MoverPersonaModal origen={moviendo.origen} ocupante={moviendo.ocupante} onClose={() => setMoviendo(null)}
          onListo={destino => {
            setAvisoCambio(`${comoTitulo(moviendo.ocupante.nombre)} quedó en ${destino}. El cambio está en el historial de ambos recintos.`);
            setMoviendo(null); setFichaRecinto(null); void cargar();
          }} />
      )}

      {avisoCambio && (
        <div className="fixed bottom-4 right-4 z-[95] flex items-start gap-2 max-w-sm bg-emerald-700 text-white rounded-xl px-4 py-3 shadow-2xl">
          <span className="flex-1">{avisoCambio}</span>
          <button type="button" onClick={() => setAvisoCambio('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {seleccion.size > 0 && vista === 'recintos' && (() => {
        const marcados = recintos.filter(r => seleccion.has(r.id));
        const total = (k: 'superficie_m2' | 'superficie_oguc_m2') => marcados.reduce((s, r) => s + (Number(r[k]) || 0), 0);
        const capacidad = marcados.reduce((s, r) => s + (Number(r.capacidad) || 0), 0);
        return (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-900 text-white rounded-2xl px-5 py-3 shadow-2xl text-xs">
            <span className="font-bold">{marcados.length} recinto(s) marcado(s)</span>
            <span>Útil <strong className="text-base tabular-nums">{m2(total('superficie_m2'))}</strong></span>
            <span>OGUC <strong className="text-base tabular-nums">{m2(total('superficie_oguc_m2'))}</strong></span>
            {capacidad > 0 && <span>Capacidad <strong className="tabular-nums">{capacidad}</strong></span>}
            <button type="button" onClick={() => setSeleccion(new Set())} className="ml-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 font-bold">Desmarcar</button>
          </div>
        );
      })()}

      {historial && (
        <Ventana titulo={`Historial de ${historial.recinto.codigo} — ${historial.recinto.nombre}`} onClose={() => setHistorial(null)}>
          {!historial.cambios.length ? <p className="text-slate-500">Sin cambios registrados.</p> : (
            <ul className="space-y-2">
              {historial.cambios.map(c => (
                <li key={c.id} className="border border-slate-200 rounded-lg p-2.5">
                  <p className="font-bold text-slate-700">{c.accion} · {formatoFecha(c.fecha, { dateStyle: 'medium' })} · {c.usuario}</p>
                  {c.accion === 'Modificó' && <p className="text-slate-600 mt-0.5">{diferencias(c.antes, c.despues) || 'Sin cambios en los datos visibles.'}</p>}
                </li>
              ))}
            </ul>
          )}
        </Ventana>
      )}

      {importando && (
        <ImportarRecintosModal edificioCodigo={edificio} etiquetaEdificio={etiqueta(edificio)} onClose={() => setImportando(false)} onImportado={cargar} />
      )}
    </div>
  );
}

/** "2" → "3"; "B" → "C"; cualquier otra cosa se deja para que la escriban. */
function siguienteVersion(v: string): string {
  if (/^\d+$/.test(v)) return String(Number(v) + 1);
  if (/^[A-Ya-y]$/.test(v)) return String.fromCharCode(v.charCodeAt(0) + 1);
  return v;
}

const ETIQUETAS: Partial<Record<keyof Recinto, string>> = {
  codigo: 'código', nombre: 'nombre', uso: 'uso', superficie_m2: 'superficie', capacidad: 'capacidad', estado: 'estado',
  unidad_usuaria: 'unidad', piso_id: 'piso', foto_url: 'foto', observaciones: 'observaciones', superficie_oguc_m2: 'superficie OGUC',
  ocupantes: 'ocupantes',
};
const valorHistorial = (v: unknown) => (Array.isArray(v) ? (v.length ? v.map(o => comoTitulo((o as Ocupante).nombre)).join(', ') : '—') : String(v ?? '—'));
function diferencias(antes?: Partial<Recinto> | null, despues?: Partial<Recinto> | null): string {
  if (!antes || !despues) return '';
  return (Object.keys(ETIQUETAS) as (keyof Recinto)[])
    .filter(k => JSON.stringify(antes[k] ?? '') !== JSON.stringify(despues[k] ?? ''))
    .map(k => `${ETIQUETAS[k]}: ${valorHistorial(antes[k])} → ${valorHistorial(despues[k])}`)
    .join(' · ');
}

function Ventana({ titulo, children, onClose, onGuardar, guardando, error }: { titulo: string; children: ReactNode; onClose: () => void; onGuardar?: () => void; guardando?: boolean; error?: string }) {
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200 text-xs">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><DoorOpen className="w-4 h-4 text-teal-600" /> {titulo}</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 text-slate-700">{children}</div>
        {error && <p className="mx-5 mb-2 flex items-start gap-2 text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</p>}
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">{onGuardar ? 'Cancelar' : 'Cerrar'}</button>
          {onGuardar && (
            <button type="button" onClick={onGuardar} disabled={guardando} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Datos del edificio completo según el catastro (hoja de edificios): superficies, terreno, rol, año y permisos. */
function TarjetaFicha({ ficha, sumaUtil, sumaOguc }: { ficha: FichaEdificio; sumaUtil: number; sumaOguc: number }) {
  // Si el catastro no trae la superficie del edificio (en la planilla es una suma de sus recintos), se muestra esa suma.
  // El sistema es el registro oficial: la superficie del edificio es la suma de sus recintos. La del catastro anterior
  // se muestra solo si difiere, como referencia.
  const util = sumaUtil || ficha.superficie_m2 || null;
  const oguc = sumaOguc || ficha.superficie_oguc_m2 || null;
  const difiere = (catastro?: number | null, suma?: number) => !!catastro && !!suma && Math.abs(catastro - suma) > 0.5;
  const datos: [string, ReactNode][] = [
    ['Superficie útil', <>{m2(util)}{difiere(ficha.superficie_m2, sumaUtil) && <span className="block text-[10px] font-normal text-slate-400">catastro anterior: {m2(ficha.superficie_m2)}</span>}</>],
    ['Superficie OGUC', <>{m2(oguc)}{difiere(ficha.superficie_oguc_m2, sumaOguc) && <span className="block text-[10px] font-normal text-slate-400">catastro anterior: {m2(ficha.superficie_oguc_m2)}</span>}</>],
    ['Terreno', m2(ficha.superficie_terreno_m2)],
    ['Uso principal', ficha.uso_principal || '—'],
    ['Año de construcción', ficha.anio_construccion || '—'],
    ['Ascensor / rampa', [ficha.anio_ascensor && `Ascensor ${ficha.anio_ascensor}`, ficha.rampa && ficha.rampa !== '0' && `Rampa ${ficha.rampa}`].filter(Boolean).join(' · ') || '—'],
    ['Dirección', ficha.direccion || '—'],
    ['Rol', ficha.rol || '—'],
  ];
  const permisos = Object.entries(ficha.regularizacion || {});
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-extrabold text-slate-900">{ficha.codigo} · {ficha.nombre || 'Sin nombre'}</h3>
        {ficha.nombre_anterior && <span className="text-slate-400">antes {ficha.nombre_anterior}</span>}
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400">Ficha del catastro</span>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
        {datos.map(([k, v]) => (
          <div key={k}><dt className="text-[10px] font-bold uppercase text-slate-400">{k}</dt><dd className="font-semibold text-slate-800">{v}</dd></div>
        ))}
      </dl>
      {(permisos.length > 0 || ficha.comentarios) && (
        <div className="border-t border-slate-100 pt-2 space-y-1 text-slate-600">
          {permisos.map(([k, p]) => <p key={k}><strong className="text-slate-700">{k}:</strong> {[p.valor, p.fecha && formatoFecha(p.fecha)].filter(Boolean).join(' · ')}</p>)}
          {ficha.comentarios && <p className="italic">{ficha.comentarios}</p>}
        </div>
      )}
    </div>
  );
}

/** Lista desplegable de usos (los mismos del catastro, para que no se escriban de mil formas), con la opción de agregar uno nuevo. */
function SelectorUso({ valor, usos, onChange }: { valor: string; usos: string[]; onChange: (uso: string) => void }) {
  const [escribiendo, setEscribiendo] = useState(false);
  const opciones = valor && !usos.includes(valor) ? [valor, ...usos] : usos;
  if (escribiendo) {
    return (
      <span className="mt-1 flex gap-1.5">
        <input autoFocus value={valor} onChange={e => onChange(e.target.value.toUpperCase())} placeholder="Nuevo uso" className={`${campo} font-normal`} />
        <button type="button" onClick={() => setEscribiendo(false)} className="px-2 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50">Lista</button>
      </span>
    );
  }
  return (
    <select value={valor} onChange={e => (e.target.value === '__otro' ? (onChange(''), setEscribiendo(true)) : onChange(e.target.value))} className={`block mt-1 ${campo} font-normal`}>
      <option value="">— Sin uso definido —</option>
      {opciones.map(u => <option key={u} value={u}>{u}</option>)}
      <option value="__otro">Otro… (escribir uno nuevo)</option>
    </select>
  );
}

/** Ocupante en una línea: «Nombre · cargo · unidad». */
function textoOcupante(o: Ocupante): string {
  return [comoTitulo(o.nombre), o.cargo, o.unidad].filter(Boolean).join(' · ');
}

/** Lista editable de ocupantes de un recinto (personas o unidades, según el catastro). */
function EditorOcupantes({ ocupantes, onChange }: { ocupantes: Ocupante[]; onChange: (o: Ocupante[]) => void }) {
  const cambiar = (i: number, campo: keyof Ocupante, valor: string) => onChange(ocupantes.map((o, k) => (k === i ? { ...o, [campo]: valor } : o)));
  return (
    <div className="sm:col-span-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-bold">Ocupantes <span className="font-normal text-slate-500">({ocupantes.length})</span></span>
        <button type="button" onClick={() => onChange([...ocupantes, { nombre: '', cargo: '', unidad: '' }])}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-teal-700 hover:bg-teal-50 font-bold"><Plus className="w-3.5 h-3.5" /> Agregar</button>
      </div>
      {ocupantes.length === 0 && <p className="text-slate-400">Sin ocupantes registrados.</p>}
      {ocupantes.map((o, i) => (
        <div key={i} className="grid grid-cols-[1.4fr_1fr_1.2fr_auto] gap-1.5">
          <input value={o.nombre} onChange={e => cambiar(i, 'nombre', e.target.value)} placeholder="Nombre de la persona o unidad" className={campo} />
          <input value={o.cargo || ''} onChange={e => cambiar(i, 'cargo', e.target.value)} placeholder="Cargo" className={campo} />
          <input value={o.unidad || ''} onChange={e => cambiar(i, 'unidad', e.target.value)} placeholder="Unidad" className={campo} />
          <button type="button" title="Quitar" onClick={() => onChange(ocupantes.filter((_, k) => k !== i))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

/** Ficha de un recinto: todos sus datos, ocupantes y lo que trae el catastro, con accesos para editar o verlo en el plano. */
function FichaRecinto({ recinto: r, piso, onClose, onEditar, onHistorial, onVerEnPlano, onMover }: {
  recinto: Recinto; piso?: Piso; onClose: () => void; onEditar: () => void; onHistorial: () => void; onVerEnPlano: () => void;
  onMover: (o: Ocupante) => void;
}) {
  const dato = (etiqueta: string, valor: ReactNode) => (
    <div><dt className="text-[10px] font-bold uppercase text-slate-400">{etiqueta}</dt><dd className="font-semibold text-slate-800">{valor || '—'}</dd></div>
  );
  // «Revisar en el catastro» se destaca aparte del resto de las observaciones.
  const revisar = alertasRecinto(r);
  const otras = observacionesSinNotas(r.observaciones);
  const atributos = Object.entries(r.atributos || {}).filter(([, v]) => v !== '' && v != null);
  return (
    <Ventana titulo={`${r.codigo} — ${r.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${COLOR_ESTADO[r.estado] || COLOR_ESTADO.Eliminado}`}>{r.estado}</span>
          <span className="text-slate-500">{r.edificio_codigo}{piso ? ` · ${piso.nombre}` : ''}</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <button type="button" onClick={onVerEnPlano} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-teal-300 font-bold text-teal-800 hover:bg-teal-50"><Layers className="w-3.5 h-3.5" /> Ver en el plano</button>
            <button type="button" onClick={onHistorial} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"><History className="w-3.5 h-3.5" /> Historial</button>
            <button type="button" onClick={onEditar} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 font-bold text-white"><Pencil className="w-3.5 h-3.5" /> Editar</button>
          </div>
        </div>

        {revisar.length > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Por revisar</p>
              {revisar.map((l, i) => <p key={i}>• {l.charAt(0).toUpperCase() + l.slice(1)}</p>)}
              <p className="text-amber-700 mt-1">Corríjalo con «Editar». Las notas escritas se borran desde las observaciones.</p>
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          {dato('Superficie útil', m2(r.superficie_m2))}
          {dato('Superficie OGUC', m2(r.superficie_oguc_m2))}
          {dato('Capacidad', r.capacidad != null ? `${r.capacidad} personas` : '')}
          {dato('Uso', r.uso)}
          <div className="col-span-2 sm:col-span-4">{dato('Unidad usuaria', r.unidad_usuaria)}</div>
          {(r.tenencia && r.tenencia !== 'Propia') && dato('Tenencia', r.tenencia)}
          {r.fecha_alta && dato('Opera desde', `${formatoFecha(r.fecha_alta)}${r.motivo_alta ? ` · ${r.motivo_alta}` : ''}`)}
          {r.fecha_baja && dato('De baja desde', `${formatoFecha(r.fecha_baja)}${r.motivo_baja ? ` · ${r.motivo_baja}` : ''}`)}
        </dl>

        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Ocupantes ({r.ocupantes?.length || 0})</p>
          {r.ocupantes?.length ? (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {r.ocupantes.map((o, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold text-slate-800">{comoTitulo(o.nombre)}</span>
                    {(o.cargo || o.unidad) && <span className="text-slate-500"> · {[o.cargo, o.unidad].filter(Boolean).join(' · ')}</span>}
                  </span>
                  <button type="button" onClick={() => onMover(o)} title="Cambiar a esta persona a otro recinto (o agregarla a otro sin quitarla de este)"
                    className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md border border-teal-300 font-bold text-teal-800 hover:bg-teal-50">
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Cambiar de recinto
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-slate-400">Sin ocupantes registrados.</p>}
        </div>

        {otras.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Observaciones</p>
            {otras.map((l, i) => <p key={i} className="text-slate-700">{l}</p>)}
          </div>
        )}

        {r.foto_url && <a href={r.foto_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 font-bold hover:underline"><ExternalLink className="w-3.5 h-3.5" /> Ver foto</a>}

        {atributos.length > 0 && (
          <details className="border border-slate-200 rounded-lg">
            <summary className="px-3 py-1.5 cursor-pointer font-bold text-slate-600">Otros datos del catastro ({atributos.length})</summary>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 pb-2">
              {atributos.flatMap(([k, v]) => [
                <dt key={`k-${k}`} className="text-slate-400">{k}</dt>,
                <dd key={`v-${k}`} className="text-slate-700">{String(v)}</dd>,
              ])}
            </dl>
          </details>
        )}

        <p className="text-[11px] text-slate-400">
          Origen: {r.origen}{r.modificado_en ? ` · última modificación ${formatoFecha(r.modificado_en, { dateStyle: 'medium' })}${r.modificado_por ? ` por ${r.modificado_por}` : ''}` : ''}
        </p>
      </div>
    </Ventana>
  );
}

/** Avisos junto al nombre: obra por entregar, fecha de baja y tenencia no propia. */
function EtiquetasVigencia({ r }: { r: Recinto }) {
  const vigencia = textoVigencia(r);
  return (<>
    {vigencia && <span className="ml-1.5 px-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold no-underline">{vigencia}</span>}
    {r.tenencia && r.tenencia !== 'Propia' && <span className="ml-1.5 px-1.5 rounded-full bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-bold no-underline">{r.tenencia}</span>}
  </>);
}
