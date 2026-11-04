import { useRef, useState } from 'react';
import { Loader2, Upload, CheckCircle2, AlertTriangle, X, History, MinusCircle } from 'lucide-react';
import { crearYSubirLamina, listarLaminasDeCampus, listarPisos, subirLaminaVisor } from '../services/recintos';
import type { DocumentoEdificio, Piso } from '../types/recintos';
import { archivoRegistrado, inferirDatosLamina, inferirLaminaAnterior, laminaDeArchivo, pisoDeLamina } from '../utils/emparejarLaminas';
import { edificioActual } from '../data/codigosAntiguosEdificios';

interface Resultado { archivo: string; destino?: string; error?: string; omitido?: string }
type Modo = 'vigentes' | 'anteriores';

const normalizar = (s: string) => s.toUpperCase().replace(/\.PDF$/i, '').replace(/\s+/g, ' ').trim();

/**
 * Sube de una vez los PDF de las láminas de un campus (descargados de su carpeta en Drive).
 *  • «Láminas vigentes»: cada archivo se asocia a la lámina registrada que le corresponde (o la crea si el nombre
 *    indica el edificio) y queda en el visor como la versión actual.
 *  • «Láminas anteriores» (carpetas «anteriores»): quedan como versiones históricas, con la fecha de su nombre, para
 *    ver cómo era el edificio antes. Los códigos antiguos de edificio («CSF_A Lam01») se traducen a los actuales.
 */
export function SubirLaminasCampus({ siglaCampus, onListo }: { siglaCampus: string; onListo?: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const modo = useRef<Modo>('vigentes');
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [resultados, setResultados] = useState<{ modo: Modo; lista: Resultado[] } | null>(null);

  const pisosPorEdificio = new Map<string, Piso[]>();
  const pisosDe = async (edificio: string) => {
    if (!pisosPorEdificio.has(edificio)) pisosPorEdificio.set(edificio, await listarPisos(edificio).catch(() => []));
    return pisosPorEdificio.get(edificio)!;
  };

  const subirVigente = async (archivo: File, documentos: DocumentoEdificio[]): Promise<Resultado> => {
    const documento = laminaDeArchivo(archivo.name, documentos);
    if (documento) {
      await subirLaminaVisor(documento, archivo);
      return { archivo: archivo.name, destino: `${documento.edificio_codigo} · ${documento.codigo_lamina || documento.titulo}` };
    }
    const inferido = inferirDatosLamina(archivo.name, siglaCampus);
    if (!inferido) return { archivo: archivo.name, error: 'No se pudo identificar el edificio (nombre esperado: EDIFICIO-L01.pdf)' };
    // Cada lámina queda en el piso que le toca por su número (L01 es el nivel más bajo), si el edificio lo tiene.
    const esCampus = inferido.edificio_codigo === siglaCampus.toUpperCase();
    const pisos = esCampus ? [] : await pisosDe(inferido.edificio_codigo);
    const pisoId = esCampus ? null : pisoDeLamina(inferido.codigo_lamina, pisos);
    const creada = await crearYSubirLamina({ edificio_codigo: inferido.edificio_codigo, archivo, piso_id: pisoId, codigo_lamina: inferido.codigo_lamina, titulo: inferido.titulo });
    documentos.push(creada);
    const piso = pisos.find(p => p.id === pisoId);
    return { archivo: archivo.name, destino: `${creada.edificio_codigo} · ${creada.codigo_lamina || creada.titulo}${piso ? ` · ${piso.nombre}` : ''} (nueva)` };
  };

  const subirAnterior = async (archivo: File, documentos: DocumentoEdificio[], vistas: Set<string>): Promise<Resultado> => {
    if (documentos.some(d => normalizar(archivoRegistrado(d) || '') === normalizar(archivo.name))) {
      return { archivo: archivo.name, omitido: 'ya estaba registrada' };
    }
    const inferido = inferirLaminaAnterior(archivo.name, siglaCampus, edificioActual);
    if (!inferido) return { archivo: archivo.name, error: 'No se reconoce el edificio (código antiguo sin equivalencia en el catastro)' };
    // La misma lámina y fecha en otro formato (LR, 40x60): basta una.
    const clave = `${inferido.edificio_codigo}|${inferido.codigo_lamina}|${inferido.fecha}`;
    const repetida = vistas.has(clave) || documentos.some(d => !d.vigente && d.edificio_codigo === inferido.edificio_codigo
      && d.codigo_lamina === inferido.codigo_lamina && d.fecha_documento === inferido.fecha);
    if (repetida) return { archivo: archivo.name, omitido: 'misma lámina y fecha que otra (otro formato)' };
    vistas.add(clave);
    const esCampus = inferido.edificio_codigo === siglaCampus.toUpperCase();
    const pisos = esCampus ? [] : await pisosDe(inferido.edificio_codigo);
    const pisoId = esCampus ? null : pisoDeLamina(inferido.codigo_lamina, pisos);
    const creada = await crearYSubirLamina({
      edificio_codigo: inferido.edificio_codigo, archivo, piso_id: pisoId, codigo_lamina: inferido.codigo_lamina, titulo: inferido.titulo,
      fecha_documento: inferido.fecha, vigente: false,
    });
    documentos.push(creada);
    const piso = pisos.find(p => p.id === pisoId);
    return { archivo: archivo.name, destino: `${creada.edificio_codigo} · ${creada.codigo_lamina}${piso ? ` · ${piso.nombre}` : ''} · ${inferido.fecha || 'sin fecha'}` };
  };

  const subir = async (archivos: File[]) => {
    if (!archivos.length) return;
    const elegido = modo.current;
    const lista: Resultado[] = [];
    try {
      setSubiendo('Leyendo las láminas registradas…');
      const documentos = await listarLaminasDeCampus(siglaCampus, elegido === 'anteriores');
      const vistas = new Set<string>();
      for (const [i, archivo] of archivos.entries()) {
        setSubiendo(`Subiendo ${i + 1} de ${archivos.length}: ${archivo.name}…`);
        try {
          lista.push(elegido === 'anteriores' ? await subirAnterior(archivo, documentos, vistas) : await subirVigente(archivo, documentos));
        } catch (e) {
          lista.push({ archivo: archivo.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (e) {
      lista.push({ archivo: '—', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubiendo(null);
      setResultados({ modo: elegido, lista });
      if (entrada.current) entrada.current.value = '';
      if (lista.some(r => r.destino)) onListo?.();
    }
  };

  const abrir = (m: Modo) => { modo.current = m; entrada.current?.click(); };
  const subidas = resultados?.lista.filter(r => r.destino).length || 0;
  const omitidas = resultados?.lista.filter(r => r.omitido).length || 0;
  const errores = resultados?.lista.filter(r => r.error) || [];

  return (
    <>
      <button type="button" disabled={!!subiendo} onClick={() => abrir('vigentes')}
        title="Elija los PDF de las láminas actuales del campus (descargados de su carpeta en Drive); cada uno se asocia a su lámina registrada"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 bg-white font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-50">
        {subiendo && modo.current === 'vigentes' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {subiendo && modo.current === 'vigentes' ? subiendo : 'Subir láminas del campus (PDF)'}
      </button>
      <button type="button" disabled={!!subiendo} onClick={() => abrir('anteriores')}
        title="Elija los PDF de la carpeta «anteriores» del campus: quedan como versiones históricas, con la fecha de su nombre"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {subiendo && modo.current === 'anteriores' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
        {subiendo && modo.current === 'anteriores' ? subiendo : 'Subir láminas anteriores (historia)'}
      </button>
      <input ref={entrada} type="file" accept="application/pdf" multiple className="hidden" onChange={e => void subir([...(e.target.files || [])])} />
      {resultados && (
        <div className="basis-full bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-slate-800">
              {subidas} de {resultados.lista.length} lámina(s) {resultados.modo === 'anteriores' ? 'quedaron como versiones anteriores' : 'quedaron en el visor'}
              {omitidas > 0 && <span className="font-normal text-slate-500"> · {omitidas} omitida(s)</span>}
              {errores.length > 0 && <span className="font-normal text-rose-700"> · {errores.length} sin reconocer</span>}
              {resultados.modo === 'vigentes' && subidas > 0 && <span className="font-normal text-slate-500">. Al abrir el plano de cada edificio se predibujan sus recintos.</span>}
              {resultados.modo === 'anteriores' && subidas > 0 && <span className="font-normal text-slate-500">. Se ven en la vista general de cada edificio, eligiendo la fecha del plano.</span>}
            </p>
            <button type="button" onClick={() => setResultados(null)} className="ml-auto text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {[...errores, ...resultados.lista.filter(r => !r.error)].map(r => (
              <p key={r.archivo} className={`flex items-center gap-1.5 ${r.error ? 'text-rose-700' : r.omitido ? 'text-slate-400' : 'text-slate-600'}`}>
                {r.error ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : r.omitido ? <MinusCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />}
                <span className="font-mono">{r.archivo}</span> → {r.destino || r.omitido || r.error}
              </p>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
