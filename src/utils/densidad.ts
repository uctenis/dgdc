/** Superficie útil por persona de un recinto ocupado (m²), o null si no tiene ocupantes o superficie. */
export function m2PorPersona(superficie: number | string | null | undefined, ocupantes: number): number | null {
  const s = Number(superficie);
  return ocupantes > 0 && s > 0 ? s / ocupantes : null;
}

/** «8,4 m²/persona», o null. */
export function textoM2PorPersona(superficie: number | string | null | undefined, ocupantes: number): string | null {
  const v = m2PorPersona(superficie, ocupantes);
  return v == null ? null : `${v.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m²/persona`;
}
