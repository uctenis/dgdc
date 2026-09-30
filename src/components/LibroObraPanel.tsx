import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck, Camera, CloudOff, Loader2, MapPin, Printer, Send, TrendingUp, X, Image as ImageIcon, CornerDownRight, Wifi,
} from 'lucide-react';
import { addEntradaLibroObra, getFotosLibroObra, subscribeToEstadosPago, subscribeToLibroObra } from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { comprimirImagen, sha256Hex } from '../utils/imagenes';
import { calcularAvanceObra, programadoEn, UMBRAL_ATRASO_PTS, type AvanceObra } from '../utils/avanceObra';
import {
  TIPOS_ANOTACION_LIBRO,
  type EntradaLibroObra, type EstadoPago, type FotoLibroObra, type LicitacionProyecto, type TipoAnotacionLibro,
} from '../types';

const MAX_FOTOS = 4;
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
const escaparHtml = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return enLinea;
}

/** Curva S de la obra: programado (línea) vs avances reales informados (puntos). */
function GraficoAvance({ avance }: { avance: AvanceObra }) {
  if (!avance.inicio || !avance.plazoDias || !avance.termino) return null;
  const W = 320, H = 120, P = 18;
  const t0 = avance.inicio.getTime();
  const t1 = Math.max(avance.termino.getTime(), Date.now(), ...avance.reales.map(r => new Date(r.fecha).getTime()));
  const x = (t: number) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (pct: number) => H - P - (pct / 100) * (H - 2 * P);
  const puntos = Array.from({ length: 41 }, (_, i) => {
    const t = t0 + (i / 40) * (t1 - t0);
    return `${x(t).toFixed(1)},${y(programadoEn(avance.inicio as Date, avance.plazoDias as number, new Date(t))).toFixed(1)}`;
  }).join(' ');
  const reales = avance.reales.map(r => ({ cx: x(new Date(r.fecha).getTime()), cy: y(r.pct), r }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" role="img" aria-label="Curva S de la obra: programado contra real">
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#cbd5e1" />
      <line x1={P} y1={P} x2={P} y2={H - P} stroke="#cbd5e1" />
      <text x={P + 3} y={P - 5} fontSize="8" textAnchor="start" fill="#64748b">100%</text>
      <polyline points={puntos} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="4 3" />
      {reales.length > 1 && <polyline points={reales.map(p => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')} fill="none" stroke="#10b981" strokeWidth="2" />}
      {reales.map((p, i) => <circle key={i} cx={p.cx} cy={p.cy} r="3" fill="#10b981"><title>{`${fechaHora(p.r.fecha)}: ${p.r.pct}% (${p.r.origen === 'libro' ? 'libro de obra' : 'estado de pago'})`}</title></circle>)}
      <line x1={x(Date.now())} y1={P} x2={x(Date.now())} y2={H - P} stroke="#f59e0b" strokeDasharray="2 2" />
      <text x={x(Date.now())} y={P - 5} fontSize="8" textAnchor="middle" fill="#b45309">hoy</text>
    </svg>
  );
}

/**
 * Libro de obra digital: anotaciones numeradas y sin edición posible (un error se corrige con otra anotación),
 * con fotos, ubicación y avance físico. Funciona sin señal: lo escrito queda en el teléfono y se sube solo.
 */
export function LibroObraPanel({ licitacion, compacto = false }: { licitacion: LicitacionProyecto; compacto?: boolean }) {
  const { user, profile } = useAuth();
  const enLinea = useEnLinea();
  const [entradas, setEntradas] = useState<EntradaLibroObra[]>([]);
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());
  const [estadosPago, setEstadosPago] = useState<EstadoPago[]>([]);
  const [tipo, setTipo] = useState<TipoAnotacionLibro>('Avance');
  const [texto, setTexto] = useState('');
  const [avancePct, setAvancePct] = useState('');
  const [clima, setClima] = useState('');
  const [fotos, setFotos] = useState<{ dataUrl: string; nombre: string }[]>([]);
  const [procesandoFotos, setProcesandoFotos] = useState(false);
  const [ubicacion, setUbicacion] = useState<EntradaLibroObra['ubicacion']>();
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [corrigeA, setCorrigeA] = useState<EntradaLibroObra | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [fotosAbiertas, setFotosAbiertas] = useState<Record<string, FotoLibroObra[] | 'cargando'>>({});

  useEffect(() => subscribeToLibroObra(licitacion.id, (e, p) => { setEntradas(e); setPendientes(p); }), [licitacion.id]);
  useEffect(() => subscribeToEstadosPago(licitacion.id, setEstadosPago), [licitacion.id]);

  const folio = useMemo(() => new Map(entradas.map((e, i) => [e.id, i + 1])), [entradas]);
  const avance = useMemo(() => calcularAvanceObra(licitacion, entradas, estadosPago), [licitacion, entradas, estadosPago]);

  const agregarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setProcesandoFotos(true);
    try {
      const disponibles = MAX_FOTOS - fotos.length;
      const nuevas = await Promise.all(Array.from(files).slice(0, disponibles).map(async f => ({ dataUrl: await comprimirImagen(f), nombre: f.name })));
      setFotos(prev => [...prev, ...nuevas]);
      if (files.length > disponibles) setMensaje(`Máximo ${MAX_FOTOS} fotos por anotación.`);
    } catch (err) {
      console.error('Error procesando fotos:', err);
      setMensaje('No se pudo procesar una de las fotos.');
    } finally {
      setProcesandoFotos(false);
    }
  };

  const tomarUbicacion = () => {
    if (!navigator.geolocation) { setMensaje('Este dispositivo no entrega ubicación.'); return; }
    setBuscandoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisionM: Math.round(pos.coords.accuracy) });
        setBuscandoUbicacion(false);
      },
      () => { setMensaje('No se pudo obtener la ubicación (revise el permiso del navegador).'); setBuscandoUbicacion(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje('');
    const contenido = texto.trim();
    if (!contenido) { setMensaje('Escriba la anotación.'); return; }
    const pct = avancePct.trim() === '' ? undefined : Number(avancePct.replace(',', '.'));
    if (pct !== undefined && (!Number.isFinite(pct) || pct < 0 || pct > 100)) { setMensaje('El avance debe ser un porcentaje entre 0 y 100.'); return; }
    if (!user?.email) { setMensaje('Debe iniciar sesión.'); return; }
    setGuardando(true);
    try {
      const fecha = new Date().toISOString();
      const autorNombre = profile?.displayName || user.displayName || user.email;
      const huellasFotos = await Promise.all(fotos.map(f => sha256Hex(f.dataUrl)));
      const huella = await sha256Hex(JSON.stringify({ tipo, texto: contenido, fecha, autor: user.email, pct, ubicacion, fotos: huellasFotos, corrigeA: corrigeA?.id }));
      const { sincronizado } = addEntradaLibroObra(licitacion.id, {
        tipo,
        texto: contenido,
        fecha,
        autorEmail: user.email,
        autorNombre,
        ...(pct !== undefined ? { avanceFisicoPct: pct } : {}),
        ...(ubicacion ? { ubicacion } : {}),
        ...(clima.trim() ? { clima: clima.trim() } : {}),
        cantidadFotos: fotos.length,
        ...(corrigeA ? { corrigeA: corrigeA.id } : {}),
        huella,
      }, fotos.map((f, i) => ({ dataUrl: f.dataUrl, nombre: f.nombre, orden: i + 1 })));
      sincronizado.catch(err => {
        console.error('Error sincronizando la anotación:', err);
        setMensaje('Una anotación no se pudo subir al servidor. Avise al administrador del sistema.');
      });
      setTexto(''); setAvancePct(''); setClima(''); setFotos([]); setUbicacion(undefined); setCorrigeA(null);
      setMensaje(navigator.onLine ? 'Anotación guardada.' : 'Anotación guardada en el teléfono: se subirá sola cuando vuelva la señal.');
    } catch (err) {
      console.error('Error guardando la anotación:', err);
      setMensaje('No se pudo guardar la anotación.');
    } finally {
      setGuardando(false);
    }
  };

  const verFotos = async (entrada: EntradaLibroObra) => {
    if (fotosAbiertas[entrada.id]) {
      setFotosAbiertas(prev => { const n = { ...prev }; delete n[entrada.id]; return n; });
      return;
    }
    setFotosAbiertas(prev => ({ ...prev, [entrada.id]: 'cargando' }));
    try {
      const lista = await getFotosLibroObra(licitacion.id, entrada.id);
      setFotosAbiertas(prev => ({ ...prev, [entrada.id]: lista }));
    } catch {
      setFotosAbiertas(prev => { const n = { ...prev }; delete n[entrada.id]; return n; });
      setMensaje('No se pudieron cargar las fotos (¿sin señal?).');
    }
  };

  const imprimir = async () => {
    const v = window.open('', '_blank');
    if (!v) return;
    v.document.write('<p style="font-family:Arial">Preparando el libro de obra…</p>');
    const fotosPorEntrada = await Promise.all(entradas.map(e => (e.cantidadFotos ? getFotosLibroObra(licitacion.id, e.id).catch(() => []) : Promise.resolve([]))));
    const filas = entradas.map((e, i) => `
      <div class="folio">
        <p class="cab"><strong>Folio N° ${i + 1}</strong> · ${fechaHora(e.fecha)} · ${escaparHtml(e.tipo)} · ${escaparHtml(e.autorNombre)} (${escaparHtml(e.autorEmail)})</p>
        ${e.corrigeA ? `<p class="nota">Corrige el folio N° ${folio.get(e.corrigeA) ?? '?'}</p>` : ''}
        <p>${escaparHtml(e.texto).replace(/\n/g, '<br>')}</p>
        <p class="nota">${[
          typeof e.avanceFisicoPct === 'number' ? `Avance físico informado: ${e.avanceFisicoPct}%` : '',
          e.clima ? `Clima: ${escaparHtml(e.clima)}` : '',
          e.ubicacion ? `Ubicación: ${e.ubicacion.lat.toFixed(5)}, ${e.ubicacion.lng.toFixed(5)}` : '',
        ].filter(Boolean).join(' · ')}</p>
        <div>${fotosPorEntrada[i].map(f => `<img src="${f.dataUrl}">`).join('')}</div>
        <p class="huella">Huella SHA-256: ${e.huella}</p>
      </div>`).join('');
    v.document.open();
    v.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Libro de obra ${escaparHtml(licitacion.codigoProyecto || '')}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;margin:28px}h1{font-size:16px}.folio{border:1px solid #cbd5e1;border-radius:6px;padding:10px;margin:10px 0;page-break-inside:avoid}.cab{margin:0 0 6px}.nota{color:#475569;font-size:11px}.huella{color:#94a3b8;font-size:9px;word-break:break-all}img{max-width:220px;max-height:160px;margin:4px 4px 0 0;border-radius:4px}</style></head><body>
      <h1>Libro de obra digital</h1>
      <p><strong>${escaparHtml(licitacion.nombreProyecto)}</strong><br>Código de proyecto: ${escaparHtml(licitacion.codigoProyecto || '—')} · Contratista: ${escaparHtml(licitacion.proveedorAdjudicadoNombre || '—')}<br>
      Emitido el ${fechaHora(new Date().toISOString())} · ${entradas.length} folios</p>
      ${filas || '<p>Sin anotaciones.</p>'}
      <p style="margin-top:20px;color:#64748b">Las anotaciones no se pueden editar ni borrar: las correcciones se registran como nuevos folios.</p>
      </body></html>`);
    v.document.close();
    // Las fotos van incrustadas: un momento para que se dibujen antes de abrir la impresión.
    window.setTimeout(() => { v.focus(); v.print(); }, 500);
  };

  const campo = 'w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400';
  const colorEstado = avance.estado === 'atrasada' ? 'text-red-700' : avance.estado === 'adelantada' ? 'text-emerald-700' : 'text-slate-700';

  return (
    <div className="space-y-4">
      {fotoGrande && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3" onClick={() => setFotoGrande(null)}>
          <img src={fotoGrande} alt="Foto ampliada" className="max-w-full max-h-full rounded-lg" />
          <button type="button" className="absolute top-3 right-3 text-white" title="Cerrar"><X className="w-7 h-7" /></button>
        </div>
      )}
      {!enLinea && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-100 border border-amber-300 px-4 py-2.5 text-xs font-semibold text-amber-900">
          <CloudOff className="w-4 h-4" /> Sin señal: puede seguir anotando. Todo se sube solo cuando vuelva la conexión.
        </div>
      )}
      {enLinea && pendientes.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-200 px-4 py-2.5 text-xs font-semibold text-sky-900">
          <Wifi className="w-4 h-4" /> Subiendo {pendientes.size} {pendientes.size === 1 ? 'anotación' : 'anotaciones'} guardadas sin señal…
        </div>
      )}

      {/* Curva S de la obra */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-sky-600" /> Avance de la obra</h3>
        {avance.estado === 'sin-programa' ? (
          <p className="text-xs text-slate-500">
            Para comparar con lo programado falta la fecha de inicio de la obra y su plazo (se definen en la pestaña Estados de pago).
            {avance.realHoy && ` Último avance informado: ${avance.realHoy.pct}%.`}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <span>Programado a hoy: <strong>{avance.programadoHoy}%</strong></span>
              <span>Real: <strong>{avance.realHoy ? `${avance.realHoy.pct}%` : 'sin informar'}</strong>{avance.realHoy && <span className="text-slate-400"> ({fechaHora(avance.realHoy.fecha)})</span>}</span>
              {avance.diferenciaPts !== undefined && (
                <span className={`font-bold ${colorEstado}`}>
                  {avance.estado === 'atrasada' ? `Atrasada ${-avance.diferenciaPts} pts` : avance.estado === 'adelantada' ? `Adelantada ${avance.diferenciaPts} pts` : 'Al día'}
                </span>
              )}
              <span className="text-slate-500">Plazo {avance.plazoDias} días · término {avance.termino?.toLocaleDateString('es-CL')}</span>
            </div>
            <GraficoAvance avance={avance} />
            <p className="text-[10px] text-slate-400">Línea celeste: programado (Curva S). Puntos verdes: avance real del libro de obra y de los estados de pago. Se marca atraso desde {UMBRAL_ATRASO_PTS} puntos bajo lo programado.</p>
          </>
        )}
      </div>

      {/* Nueva anotación */}
      <form onSubmit={guardar} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><BookOpenCheck className="w-4 h-4 text-sky-600" /> Nueva anotación</h3>
          {!compacto && (
            <a href={`${import.meta.env.BASE_URL}libro-obra/${licitacion.id}`} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-sky-700 hover:underline">
              Abrir versión celular ↗
            </a>
          )}
        </div>
        {corrigeA && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            <CornerDownRight className="w-4 h-4 shrink-0" />
            <span className="flex-1">Corrige el folio N° {folio.get(corrigeA.id)}: «{corrigeA.texto.slice(0, 80)}{corrigeA.texto.length > 80 ? '…' : ''}»</span>
            <button type="button" onClick={() => setCorrigeA(null)} title="Quitar"><X className="w-4 h-4" /></button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <select className={`${campo} col-span-2 sm:col-span-1`} value={tipo} onChange={e => setTipo(e.target.value as TipoAnotacionLibro)}>
            {TIPOS_ANOTACION_LIBRO.map(t => <option key={t}>{t}</option>)}
          </select>
          <input className={campo} inputMode="decimal" value={avancePct} onChange={e => setAvancePct(e.target.value)} placeholder="Avance físico %" />
          <input className={`${campo} sm:col-span-1`} value={clima} onChange={e => setClima(e.target.value)} placeholder="Clima (opcional)" />
        </div>
        <textarea className={campo} rows={4} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Qué se hizo hoy, instrucciones al contratista, observaciones…" />

        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${fotos.length >= MAX_FOTOS ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
            {procesandoFotos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Foto
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={fotos.length >= MAX_FOTOS} onChange={e => { void agregarFotos(e.target.files); e.target.value = ''; }} />
          </label>
          <label className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer border ${fotos.length >= MAX_FOTOS ? 'border-slate-200 text-slate-400' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            <ImageIcon className="w-4 h-4" /> Galería
            <input type="file" accept="image/*" multiple className="hidden" disabled={fotos.length >= MAX_FOTOS} onChange={e => { void agregarFotos(e.target.files); e.target.value = ''; }} />
          </label>
          <button type="button" onClick={tomarUbicacion} className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border ${ubicacion ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            {buscandoUbicacion ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {ubicacion ? `Ubicación ±${ubicacion.precisionM} m` : 'Ubicación'}
          </button>
        </div>
        {fotos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fotos.map((f, i) => (
              <div key={i} className="relative">
                <img src={f.dataUrl} alt={f.nombre} className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                <button type="button" onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-slate-300 p-0.5" title="Quitar">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {mensaje && <p className="text-xs font-semibold text-slate-700">{mensaje}</p>}
        <button type="submit" disabled={guardando || procesandoFotos} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold disabled:opacity-60">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Firmar y guardar anotación
        </button>
        <p className="text-[10px] text-slate-400">Al guardar, la anotación queda firmada con su sesión ({user?.email}) y no se puede editar ni borrar.</p>
      </form>

      {/* Libro */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800">Libro de obra ({entradas.length} folios)</h3>
          {entradas.length > 0 && (
            <button type="button" onClick={() => void imprimir()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </button>
          )}
        </div>
        {entradas.length === 0 && <p className="text-xs text-slate-400 italic">Aún no hay anotaciones.</p>}
        {[...entradas].reverse().map(e => {
          const abiertas = fotosAbiertas[e.id];
          return (
            <div key={e.id} className="rounded-xl border border-slate-200 p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-black text-slate-800">Folio {folio.get(e.id)}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">{e.tipo}</span>
                <span className="text-slate-500">{fechaHora(e.fecha)} · {e.autorNombre}</span>
                {pendientes.has(e.id) && <span className="flex items-center gap-1 text-amber-700 font-bold"><CloudOff className="w-3 h-3" /> pendiente de subir</span>}
              </div>
              {e.corrigeA && <p className="text-[11px] text-amber-800 flex items-center gap-1"><CornerDownRight className="w-3 h-3" /> Corrige el folio N° {folio.get(e.corrigeA) ?? '?'}</p>}
              <p className="text-sm text-slate-800 whitespace-pre-line">{e.texto}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {typeof e.avanceFisicoPct === 'number' && <span className="font-semibold text-emerald-700">Avance {e.avanceFisicoPct}%</span>}
                {e.clima && <span>Clima: {e.clima}</span>}
                {e.ubicacion && (
                  <a href={`https://www.google.com/maps?q=${e.ubicacion.lat},${e.ubicacion.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-sky-700 hover:underline">
                    <MapPin className="w-3 h-3" /> Ver ubicación
                  </a>
                )}
                {e.cantidadFotos > 0 && (
                  <button type="button" onClick={() => void verFotos(e)} className="flex items-center gap-0.5 text-sky-700 hover:underline">
                    <ImageIcon className="w-3 h-3" /> {abiertas ? 'Ocultar fotos' : `Ver ${e.cantidadFotos} foto${e.cantidadFotos === 1 ? '' : 's'}`}
                  </button>
                )}
                <button type="button" onClick={() => { setCorrigeA(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="ml-auto text-slate-400 hover:text-slate-700">
                  Corregir con nueva anotación
                </button>
              </div>
              {abiertas === 'cargando' && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
              {Array.isArray(abiertas) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {abiertas.map(f => (
                    <button key={f.id} type="button" onClick={() => setFotoGrande(f.dataUrl)} title="Ampliar">
                      <img src={f.dataUrl} alt={f.nombre} className="w-28 h-28 object-cover rounded-lg border border-slate-200" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
