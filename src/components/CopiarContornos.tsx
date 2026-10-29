import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Copy, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { DocumentoEdificio, Recinto, ZonaRecinto } from '../types/recintos';
import { descargarLamina, guardarZona, listarLaminasDeCampus, listarRecintos, listarZonas } from '../services/recintos';
import { alinearLaminas, cajaDeContornos, emparejarRecintos, imagenDeTrazos, trasladarContorno } from '../utils/copiarContornos';
import { recortarContraVecinos } from '../utils/sinSuperposicion';

interface Props {
  documento: DocumentoEdificio;
  pdf: pdfjsLib.PDFDocumentProxy | null;
  pagina: number;
  /** Contornos de esta página de la lámina, que se copian. */
  zonas: ZonaRecinto[];
  recintos: Recinto[];
}

interface Resultado { lamina: string; texto: string; ok: boolean }

const nombreLamina = (d: DocumentoEdificio) => `${d.edificio_codigo} · ${d.codigo_lamina || d.titulo}`;

/**
 * Copia los contornos ya dibujados en esta lámina a otras láminas iguales del campus (por ejemplo, cabañas del mismo
 * modelo): cada recinto pasa al de igual número en el otro edificio, ubicado donde calza el dibujo de esa lámina.
 */
export function CopiarContornos({ documento, pdf, pagina, zonas, recintos }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [laminas, setLaminas] = useState<DocumentoEdificio[] | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [copiando, setCopiando] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [error, setError] = useState('');

  const abrir = async () => {
    setAbierto(true); setResultados([]); setError('');
    if (laminas) return;
    try {
      const campus = /^[A-Z]+/.exec(documento.edificio_codigo.toUpperCase())?.[0] || '';
      const todas = await listarLaminasDeCampus(campus);
      setLaminas(todas.filter(d => d.id !== documento.id && d.archivo_visor)
        .sort((a, b) => nombreLamina(a).localeCompare(nombreLamina(b), 'es', { numeric: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const copiar = async () => {
    if (!pdf || !laminas) return;
    const lista: Resultado[] = [];
    try {
      setCopiando('Leyendo esta lámina…');
      const origen = await imagenDeTrazos(await pdf.getPage(pagina));
      const caja = cajaDeContornos(zonas.map(z => z.poligono), origen);
      for (const destino of laminas.filter(d => elegidas.has(d.id))) {
        const nombre = nombreLamina(destino);
        setCopiando(`Copiando a ${nombre}…`);
        try {
          const [datos, recintosDestino, zonasDestino] = await Promise.all([
            descargarLamina(destino.archivo_visor!), listarRecintos(destino.edificio_codigo), listarZonas(destino.id),
          ]);
          const doc = await pdfjsLib.getDocument({ data: datos, isEvalSupported: false }).promise;
          const paginaDestino = Math.min(pagina, doc.numPages);
          const imagen = await imagenDeTrazos(await doc.getPage(paginaDestino));
          const calce = alinearLaminas(origen, imagen, caja);
          if (!calce) { lista.push({ lamina: nombre, ok: false, texto: 'el dibujo no calza con esta lámina (no parece del mismo modelo); no se copió nada' }); continue; }
          const pares = emparejarRecintos(recintos, recintosDestino);
          const copiar = zonas.filter(z => pares.has(z.recinto_id));
          const reemplazados = new Set(copiar.map(z => pares.get(z.recinto_id)!.id));
          // Los contornos no se superponen con los que ya tenía la lámina de destino.
          const ocupados = zonasDestino.filter(z => z.pagina === paginaDestino && !reemplazados.has(z.recinto_id)).map(z => z.poligono);
          let hechos = 0;
          for (const z of copiar) {
            const poligono = recortarContraVecinos(trasladarContorno(z.poligono, origen, imagen, calce.dx, calce.dy), ocupados);
            if (!poligono) continue;
            ocupados.push(poligono);
            await guardarZona({ documento_id: destino.id, recinto_id: pares.get(z.recinto_id)!.id, pagina: paginaDestino, poligono });
            hechos++;
          }
          const sinPar = zonas.length - copiar.length;
          lista.push({
            lamina: nombre, ok: hechos > 0,
            texto: `${hechos} contorno(s) copiado(s)${sinPar ? `; ${sinPar} sin recinto equivalente en ${destino.edificio_codigo}` : ''}`,
          });
        } catch (e) {
          lista.push({ lamina: nombre, ok: false, texto: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCopiando('');
      setResultados(lista);
    }
  };

  return (
    <>
      <button type="button" disabled={!pdf || !zonas.length} onClick={() => (abierto ? setAbierto(false) : void abrir())}
        title="Copia los contornos de esta lámina a otras láminas iguales (por ejemplo, cabañas del mismo modelo)"
        className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold disabled:opacity-40 ${abierto ? 'bg-teal-700 border-teal-700 text-white' : 'border-teal-300 text-teal-800 hover:bg-teal-50'}`}>
        <Copy className="w-3.5 h-3.5" /> Copiar a láminas iguales
      </button>
      {abierto && (
        <div className="order-last basis-full bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="font-bold text-slate-800">Copiar los {zonas.length} contorno(s) de esta lámina a:</p>
            <button type="button" onClick={() => setAbierto(false)} className="ml-auto text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-slate-500">
            Cada recinto pasa al de igual número en el otro edificio (o, si no hay, al de igual nombre). Se ubica donde calza el
            dibujo de esa lámina y reemplaza el contorno que tuviera. Revise después cada lámina.
          </p>
          {!laminas && !error && <p className="flex items-center gap-1.5 text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando láminas del campus…</p>}
          {laminas && !laminas.length && <p className="text-slate-500">No hay otras láminas del campus con el PDF subido al visor.</p>}
          {laminas && laminas.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 max-h-40 overflow-auto">
              {laminas.map(d => (
                <label key={d.id} className="flex items-center gap-1.5 text-slate-700">
                  <input type="checkbox" checked={elegidas.has(d.id)} disabled={!!copiando}
                    onChange={e => setElegidas(prev => { const n = new Set(prev); if (e.target.checked) n.add(d.id); else n.delete(d.id); return n; })} />
                  {nombreLamina(d)}
                </label>
              ))}
            </div>
          )}
          <button type="button" disabled={!elegidas.size || !!copiando} onClick={() => void copiar()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 font-bold text-white hover:bg-teal-800 disabled:opacity-40">
            {copiando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            {copiando || `Copiar a ${elegidas.size} lámina(s)`}
          </button>
          {error && <p className="flex items-center gap-1.5 text-rose-700"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}</p>}
          {resultados.map(r => (
            <p key={r.lamina} className={`flex items-center gap-1.5 ${r.ok ? 'text-slate-700' : 'text-rose-700'}`}>
              {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
              <span className="font-bold">{r.lamina}</span>: {r.texto}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
