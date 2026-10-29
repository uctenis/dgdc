import { useRef, useState } from 'react';
import { Loader2, Upload, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { crearYSubirLamina, listarLaminasDeCampus, subirLaminaVisor } from '../services/recintos';
import { inferirDatosLamina, laminaDeArchivo } from '../utils/emparejarLaminas';

interface Resultado { archivo: string; destino?: string; error?: string }

/**
 * Sube de una vez los PDF de las láminas de un campus (descargados de su carpeta en Drive). Cada archivo se asocia a
 * la lámina registrada que le corresponde (o la crea automáticamente si el nombre indica el edificio) y queda en el visor.
 */
export function SubirLaminasCampus({ siglaCampus, onListo }: { siglaCampus: string; onListo?: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);

  const subir = async (archivos: File[]) => {
    if (!archivos.length) return;
    const lista: Resultado[] = [];
    try {
      setSubiendo('Leyendo las láminas registradas…');
      const documentos = await listarLaminasDeCampus(siglaCampus);
      for (const archivo of archivos) {
        const documento = laminaDeArchivo(archivo.name, documentos);
        setSubiendo(`Subiendo ${archivo.name}…`);
        try {
          if (documento) {
            await subirLaminaVisor(documento, archivo);
            lista.push({ archivo: archivo.name, destino: `${documento.edificio_codigo} · ${documento.codigo_lamina || documento.titulo}` });
          } else {
            const inferido = inferirDatosLamina(archivo.name, siglaCampus);
            if (!inferido) {
              lista.push({ archivo: archivo.name, error: 'No se pudo identificar el edificio (nombre esperado: EDIFICIO-L01.pdf)' });
              continue;
            }
            const creada = await crearYSubirLamina({
              edificio_codigo: inferido.edificio_codigo,
              archivo,
              codigo_lamina: inferido.codigo_lamina,
              titulo: inferido.titulo,
            });
            documentos.push(creada);
            lista.push({ archivo: archivo.name, destino: `${creada.edificio_codigo} · ${creada.codigo_lamina || creada.titulo} (nueva)` });
          }
        } catch (e) {
          lista.push({ archivo: archivo.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (e) {
      lista.push({ archivo: '—', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubiendo(null);
      setResultados(lista);
      if (entrada.current) entrada.current.value = '';
      if (lista.some(r => r.destino)) onListo?.();
    }
  };

  return (
    <>
      <button type="button" disabled={!!subiendo} onClick={() => entrada.current?.click()}
        title="Elija los PDF de las láminas del campus (descargados de su carpeta en Drive); cada uno se asocia a su lámina registrada"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 bg-white font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-50">
        {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {subiendo || 'Subir láminas del campus (PDF)'}
      </button>
      <input ref={entrada} type="file" accept="application/pdf" multiple className="hidden" onChange={e => void subir([...(e.target.files || [])])} />
      {resultados && (
        <div className="basis-full bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-slate-800">
              {resultados.filter(r => r.destino).length} de {resultados.length} lámina(s) quedaron en el visor.
              {resultados.some(r => r.destino) && <span className="font-normal text-slate-500"> Al abrir el plano de cada edificio se predibujan sus recintos.</span>}
            </p>
            <button type="button" onClick={() => setResultados(null)} className="ml-auto text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          {resultados.map(r => (
            <p key={r.archivo} className={`flex items-center gap-1.5 ${r.error ? 'text-rose-700' : 'text-slate-600'}`}>
              {r.error ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />}
              <span className="font-mono">{r.archivo}</span> → {r.destino || r.error}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
