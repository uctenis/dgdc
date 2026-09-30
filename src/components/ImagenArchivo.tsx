import { useEffect, useState } from 'react';
import { idDesdeUrl, obtenerBlobArchivo } from '../services/archivosService';

/**
 * Imagen que puede venir de un enlace del sistema (/archivo/:id, guardada en la base de datos) o de una URL común.
 * Las del sistema se cargan con la sesión actual y se muestran desde la memoria del navegador.
 */
export function ImagenArchivo({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const propia = Boolean(idDesdeUrl(src));
  const [url, setUrl] = useState<string | undefined>(propia ? undefined : src);

  useEffect(() => {
    if (!src || !idDesdeUrl(src)) { setUrl(src); return; }
    let vigente = true;
    let objeto: string | undefined;
    obtenerBlobArchivo(src)
      .then(({ blob }) => { if (vigente) { objeto = URL.createObjectURL(blob); setUrl(objeto); } })
      .catch(() => { if (vigente) setUrl(undefined); });
    return () => { vigente = false; if (objeto) URL.revokeObjectURL(objeto); };
  }, [src]);

  if (!url) return <div className={`${className || ''} bg-slate-100 animate-pulse`} aria-label={alt} />;
  return <img src={url} alt={alt} className={className} />;
}
