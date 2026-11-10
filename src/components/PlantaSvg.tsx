import { memo } from 'react';
import type { PlantaVectorial } from '../services/recintos';

/**
 * Color y grosor de cada grupo de capas. El grosor está en píxeles de pantalla (no crece con el zoom), así la planta se
 * lee igual de lejos que de cerca, como en un visor de CAD.
 */
export const ESTILO_CAPA: Record<string, { color: string; px: number }> = {
  muros: { color: '#1f2937', px: 1.6 },
  tabiques: { color: '#374151', px: 1.1 },
  vanos: { color: '#0f766e', px: 0.9 },
  mobiliario: { color: '#94a3b8', px: 0.6 },
  proyecciones: { color: '#cbd5e1', px: 0.5 },
  pavimentos: { color: '#d1d5db', px: 0.5 },
  instalaciones: { color: '#d97706', px: 0.7 },
  ejes: { color: '#f87171', px: 0.5 },
  textos: { color: '#475569', px: 0.5 },
  otros: { color: '#cbd5e1', px: 0.5 },
};

/** Planta vectorial de una lámina, en sus mismas coordenadas (puntos del PDF): calza con los contornos. */
export const PlantaSvg = memo(function PlantaSvg({ planta, ancho, alto, ocultas }: {
  planta: PlantaVectorial; ancho: number; alto: number; ocultas: Set<string>;
}) {
  return (
    <svg className="absolute inset-0 pointer-events-none overflow-hidden" width={ancho} height={alto} viewBox={`0 0 ${planta.W} ${planta.H}`} aria-hidden>
      <rect width={planta.W} height={planta.H} fill="#ffffff" />
      {planta.capas.filter(c => !ocultas.has(c.id)).map(c => {
        const e = ESTILO_CAPA[c.id] || ESTILO_CAPA.otros;
        return (
          <g key={c.id}>
            {c.relleno && <path d={c.relleno} fill={e.color} fillRule="evenodd" />}
            {c.d && <path d={c.d} fill="none" stroke={e.color} strokeWidth={e.px} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      })}
      {!ocultas.has('textos') && planta.textos.map((t, i) => (
        <text key={i} x={t.x} y={t.y} fontSize={t.h} fill={ESTILO_CAPA.textos.color} fontFamily="Arial, sans-serif"
          transform={t.r ? `rotate(${t.r} ${t.x} ${t.y})` : undefined}>{t.t}</text>
      ))}
    </svg>
  );
});
