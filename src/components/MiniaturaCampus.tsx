import { useEffect, useId, useState } from 'react';
import { Map as IconoMapa } from 'lucide-react';
import { obtenerMarcadoresCampus, obtenerPlanoGeneralCampus, type MarcadorCampus, type PlanoGeneralCampus } from '../services/recintos';

// La ilustración y los marcadores de cada campus se guardan un rato en memoria: al pasar de un edificio a otro no se
// vuelven a pedir (el enlace firmado de la imagen dura una hora).
const cache = new Map<string, { cuando: number; datos: Promise<{ plano: PlanoGeneralCampus | null; marcadores: MarcadorCampus[] }> }>();
function datosCampus(sigla: string) {
  const previo = cache.get(sigla);
  if (previo && Date.now() - previo.cuando < 45 * 60_000) return previo.datos;
  const datos = Promise.all([obtenerPlanoGeneralCampus(sigla), obtenerMarcadoresCampus(sigla)])
    .then(([plano, marcadores]) => ({ plano, marcadores }))
    .catch(() => ({ plano: null, marcadores: [] }));
  cache.set(sigla, { cuando: Date.now(), datos });
  return datos;
}

const ASPECTO = 220 / 140;

/**
 * Miniatura de la ilustración del campus centrada en un edificio, con el edificio destacado: da contexto de dónde está
 * y lleva a la vista del campus. No aparece si el campus no tiene ilustración o el edificio no está ubicado en ella.
 */
export function MiniaturaCampus({ sigla, edificio, nombreCampus, onAbrir, className = '' }: {
  sigla: string; edificio: string; nombreCampus: string; onAbrir: () => void; className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const [info, setInfo] = useState<{ url: string; W: number; H: number; marcador: MarcadorCampus } | null>(null);

  useEffect(() => {
    let vigente = true;
    setInfo(null);
    datosCampus(sigla).then(({ plano, marcadores }) => {
      const marcador = marcadores.find(m => m.edificio === edificio);
      if (!vigente || !plano || plano.esPdf || !marcador) return;
      // Se necesita el tamaño real de la imagen para recortar sin deformar.
      const img = new Image();
      img.onload = () => { if (vigente) setInfo({ url: plano.url, W: img.naturalWidth, H: img.naturalHeight, marcador }); };
      img.src = plano.url;
    });
    return () => { vigente = false; };
  }, [sigla, edificio]);

  if (!info) return null;
  const { url, W, H, marcador } = info;
  const puntos = (marcador.contorno?.length ? marcador.contorno : [[marcador.x, marcador.y]] as [number, number][]).map(([x, y]) => [x * W, y * H] as const);
  const xs = puntos.map(p => p[0]), ys = puntos.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  // Recorte: el edificio con aire alrededor (al menos 1/5 del ancho de la ilustración), con la proporción de la miniatura.
  let ancho = Math.max((Math.max(...xs) - Math.min(...xs)) * 2.4, (Math.max(...ys) - Math.min(...ys)) * 2.4 * ASPECTO, W * 0.2);
  ancho = Math.min(ancho, W, H * ASPECTO);
  const alto = ancho / ASPECTO;
  const x0 = Math.min(Math.max(cx - ancho / 2, 0), W - ancho);
  const y0 = Math.min(Math.max(cy - alto / 2, 0), H - alto);
  const poligono = marcador.contorno?.length ? puntos.map(p => p.join(',')).join(' ') : null;

  return (
    <button type="button" onClick={onAbrir} title={`Ver ${edificio} en la vista del campus ${nombreCampus}`}
      className={`group relative block overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm hover:shadow-md hover:border-teal-400 transition ${className}`}>
      <svg viewBox={`${x0} ${y0} ${ancho} ${alto}`} preserveAspectRatio="xMidYMid slice" className="block w-full h-full" aria-hidden>
        <defs>
          <mask id={`fuera-${id}`}>
            <rect x={0} y={0} width={W} height={H} fill="white" />
            {poligono && <polygon points={poligono} fill="black" />}
          </mask>
        </defs>
        <image href={url} x={0} y={0} width={W} height={H} />
        {/* El entorno un poco apagado; el edificio, aclarado como en la vista del campus. */}
        {poligono && <rect x={0} y={0} width={W} height={H} fill="rgba(15, 23, 42, 0.28)" mask={`url(#fuera-${id})`} />}
        {poligono && <polygon points={poligono} fill="rgba(255, 236, 179, 0.5)" stroke="rgba(255, 255, 255, 0.95)" strokeWidth={ancho / 220 * 1.5} style={{ mixBlendMode: 'screen' }} />}
        {!poligono && <circle cx={marcador.x * W} cy={marcador.y * H} r={ancho * 0.06} fill="none" stroke="#fcd34d" strokeWidth={ancho / 220 * 2.5} />}
      </svg>
      <span className="absolute left-1.5 bottom-1.5 flex items-center gap-1 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm group-hover:bg-teal-800/90">
        <IconoMapa className="w-3 h-3" /> Ver en la vista del campus
      </span>
    </button>
  );
}
