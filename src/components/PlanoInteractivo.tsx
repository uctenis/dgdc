import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2, Upload, FileText, ExternalLink, AlertTriangle, Plus, Trash2, Layers } from 'lucide-react';
import type { DocumentoEdificio, Piso, Recinto } from '../types/recintos';
import { archivarLamina, asignarPisoALamina, crearYSubirLamina, listarPisos, subirLaminaVisor } from '../services/recintos';

// El visor (con el lector de PDF) se carga solo cuando se abre un plano.
const VisorPlano = lazy(() => import('./VisorPlano').then(m => ({ default: m.VisorPlano })));

interface Props {
  edificioCodigo?: string;
  pisos?: Piso[];
  documentos: DocumentoEdificio[];
  recintos: Recinto[];
  destacado?: string | null;
  onEditarRecinto: (r: Recinto) => void;
  onRecargar: () => Promise<void> | void;
}

/** Pestaña «Plano interactivo»: elige la lámina vigente del edificio, la vincula a su piso y permite subir PDFs en 1 paso. */
export function PlanoInteractivo({ edificioCodigo: codigoProp, pisos: pisosProp, documentos, recintos, destacado, onEditarRecinto, onRecargar }: Props) {
  const edificioCodigo = codigoProp || documentos[0]?.edificio_codigo || recintos[0]?.edificio_codigo || '';
  const todasLasLaminas = documentos.filter(d => d.vigente && d.tipo === 'Plano');

  const [pisosInternos, setPisosInternos] = useState<Piso[]>([]);
  const pisos = pisosProp || pisosInternos;

  const [filtroPiso, setFiltroPiso] = useState<string>('');
  const laminas = filtroPiso
    ? todasLasLaminas.filter(d => d.piso_id === filtroPiso)
    : todasLasLaminas;

  const [elegida, setElegida] = useState(laminas.find(d => d.archivo_visor)?.id || laminas[0]?.id || '');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const entradaReemplazo = useRef<HTMLInputElement>(null);
  const entradaNueva = useRef<HTMLInputElement>(null);
  const lamina = todasLasLaminas.find(d => d.id === elegida);

  useEffect(() => {
    if (pisosProp || !edificioCodigo) return;
    listarPisos(edificioCodigo).then(setPisosInternos).catch(() => {});
  }, [edificioCodigo, pisosProp]);

  useEffect(() => {
    if (!laminas.some(d => d.id === elegida)) {
      setElegida(laminas.find(d => d.archivo_visor)?.id || laminas[0]?.id || '');
    }
  }, [documentos, filtroPiso]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si hay un recinto destacado al entrar, selecciona automáticamente la lámina de su piso si existe.
  useEffect(() => {
    if (!destacado) return;
    const rec = recintos.find(r => r.id === destacado);
    if (!rec?.piso_id) return;
    const laminaDelPiso = todasLasLaminas.find(d => d.piso_id === rec.piso_id && d.archivo_visor);
    if (laminaDelPiso) setElegida(laminaDelPiso.id);
  }, [destacado]); // eslint-disable-line react-hooks/exhaustive-deps

  const subirReemplazo = async (archivo?: File) => {
    if (!archivo || !lamina) return;
    setSubiendo(true); setError('');
    try {
      await subirLaminaVisor(lamina, archivo);
      await onRecargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
      if (entradaReemplazo.current) entradaReemplazo.current.value = '';
    }
  };

  const subirNuevas = async (archivos: File[]) => {
    if (!archivos.length || !edificioCodigo) return;
    setSubiendo(true); setError('');
    try {
      let ultimaId = '';
      for (const archivo of archivos) {
        const creada = await crearYSubirLamina({
          edificio_codigo: edificioCodigo,
          archivo,
          piso_id: filtroPiso || (pisos.length === 1 ? pisos[0].id : null),
        });
        ultimaId = creada.id;
      }
      await onRecargar();
      if (ultimaId) setElegida(ultimaId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
      if (entradaNueva.current) entradaNueva.current.value = '';
    }
  };

  const cambiarPisoDeLamina = async (pisoId: string) => {
    if (!lamina) return;
    setError('');
    try {
      await asignarPisoALamina(lamina.id, pisoId || null);
      await onRecargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const quitarLaminaActual = async () => {
    if (!lamina) return;
    if (!window.confirm(`¿Quitar la lámina "${lamina.codigo_lamina || lamina.titulo}" del visor?`)) return;
    setSubiendo(true); setError('');
    try {
      await archivarLamina(lamina.id);
      await onRecargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
    }
  };

  if (!todasLasLaminas.length) {
    return (
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); void subirNuevas([...(e.dataTransfer.files || [])]); }}
        className="bg-white border-2 border-dashed border-teal-300 rounded-2xl p-8 text-center space-y-3">
        <FileText className="w-10 h-10 mx-auto text-teal-600" />
        <p className="font-bold text-slate-800">Este edificio aún no tiene láminas cargadas</p>
        <p className="text-slate-500 max-w-lg mx-auto">
          Arrastre aquí uno o varios archivos PDF de los planos del edificio (o elíjalos desde su computador) para registrarlos y abrirlos en el visor en un solo paso.
        </p>
        {error && <p className="flex items-center justify-center gap-2 text-rose-700 font-medium"><AlertTriangle className="w-4 h-4" /> {error}</p>}
        {edificioCodigo ? (
          <>
            <button type="button" disabled={subiendo} onClick={() => entradaNueva.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold disabled:opacity-50">
              {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir PDF de plano
            </button>
            <input ref={entradaNueva} type="file" accept="application/pdf" multiple className="hidden" onChange={e => void subirNuevas([...(e.target.files || [])])} />
          </>
        ) : (
          <p className="text-xs text-slate-400">Seleccione un edificio para cargar sus planos.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
        {pisos.length > 0 && (
          <label className="font-bold text-slate-700 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-teal-700" /> Piso
            <select value={filtroPiso} onChange={e => setFiltroPiso(e.target.value)} className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-normal">
              <option value="">Todos ({todasLasLaminas.length})</option>
              {pisos.map(p => {
                const cant = todasLasLaminas.filter(d => d.piso_id === p.id).length;
                return <option key={p.id} value={p.id}>{p.codigo} · {p.nombre} ({cant})</option>;
              })}
            </select>
          </label>
        )}

        <label className="font-bold text-slate-700 flex items-center gap-1.5">Lámina
          <select value={elegida} onChange={e => setElegida(e.target.value)} className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-normal min-w-[240px]">
            {laminas.map(d => {
              const pisoDoc = pisos.find(p => p.id === d.piso_id);
              return (
                <option key={d.id} value={d.id}>
                  {[pisoDoc ? `[${pisoDoc.codigo}]` : '', d.codigo_lamina, d.titulo, d.especialidad].filter(Boolean).join(' · ')}
                  {d.archivo_visor ? '' : ' (sin copia para el visor)'}
                </option>
              );
            })}
          </select>
        </label>

        {lamina && pisos.length > 0 && (
          <label className="text-slate-600 flex items-center gap-1">
            Piso de esta lámina:
            <select value={lamina.piso_id || ''} onChange={e => void cambiarPisoDeLamina(e.target.value)} className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700">
              <option value="">Todo el edificio</option>
              {pisos.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
            </select>
          </label>
        )}

        {lamina?.drive_url && (
          <a href={lamina.drive_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-700 font-bold hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> Original en Drive
          </a>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {edificioCodigo && (
            <button type="button" disabled={subiendo} onClick={() => entradaNueva.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold disabled:opacity-50">
              {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Nueva lámina PDF
            </button>
          )}
          {lamina?.archivo_visor && (
            <button type="button" disabled={subiendo} onClick={() => entradaReemplazo.current?.click()}
              title="Sube un nuevo PDF manteniendo todas las oficinas ya dibujadas sobre esta lámina"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-600 hover:bg-slate-50">
              {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Reemplazar PDF
            </button>
          )}
          {lamina && (
            <button type="button" disabled={subiendo} onClick={() => void quitarLaminaActual()}
              title="Quitar esta lámina del visor"
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <input ref={entradaReemplazo} type="file" accept="application/pdf" className="hidden" onChange={e => void subirReemplazo(e.target.files?.[0])} />
        <input ref={entradaNueva} type="file" accept="application/pdf" multiple className="hidden" onChange={e => void subirNuevas([...(e.target.files || [])])} />
      </div>

      {error && <p className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800"><AlertTriangle className="w-4 h-4" /> {error}</p>}

      {!laminas.length && filtroPiso && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center space-y-2">
          <p className="text-slate-600 font-medium">No hay láminas asociadas a este piso todavía.</p>
          <button type="button" onClick={() => entradaNueva.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 text-white rounded-lg font-bold">
            <Upload className="w-4 h-4" /> Subir lámina para este piso
          </button>
        </div>
      )}

      {lamina && !lamina.archivo_visor && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); void subirReemplazo(e.dataTransfer.files?.[0]); }}
          className="bg-white border-2 border-dashed border-teal-300 rounded-2xl p-8 text-center space-y-3">
          <FileText className="w-10 h-10 mx-auto text-teal-600" />
          <p className="font-bold text-slate-800">Suba la lámina en PDF para verla en el sistema</p>
          <p className="text-slate-500 max-w-lg mx-auto">
            Descárguela de Drive{lamina.drive_url ? ' (enlace «Original en Drive»)' : ''} y arrástrela aquí. Se guarda una copia privada, solo para personal UCT;
            el original sigue en Drive. Use el PDF tal como sale del plotter, a tamaño real, para que el sistema pueda medir superficies.
          </p>
          <button type="button" disabled={subiendo} onClick={() => entradaReemplazo.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold disabled:opacity-50">
            {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Elegir PDF
          </button>
        </div>
      )}

      {lamina?.archivo_visor && (
        <Suspense fallback={<div className="h-[60vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-teal-700" /></div>}>
          <VisorPlano key={lamina.id + lamina.archivo_visor} documento={lamina} pisos={pisos} recintos={recintos} destacado={destacado}
            onEditarRecinto={onEditarRecinto} onEscalaGuardada={() => void onRecargar()} />
        </Suspense>
      )}
    </div>
  );
}
