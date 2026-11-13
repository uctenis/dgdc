import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Un archivo guardado con la codificación equivocada (UTF-8 leído como Windows-1252) muestra «Ã³» en vez de «ó» o
// «ðŸ”´» en vez de 🔴. Pasó el 2026-11-10 en la Cartera de proyectos: esta prueba lo detiene antes de publicar.
const RAIZ = join(__dirname, '..');
const MAL_CODIFICADO = /Ã[\u0080-¿]|ðŸ|â€[\u0080-¿Œ-™]?|Â[ -¿]/;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.(tsx?|css|html)$/.test(n) ? [p] : [];
  });
}

describe('codificación del código fuente', () => {
  it('ningún archivo tiene texto mal codificado (Ã³, ðŸ…)', () => {
    const malos = archivos(RAIZ)
      .filter(p => !p.endsWith('codificacion.test.ts'))
      .flatMap(p => readFileSync(p, 'utf8').split('\n').map((l, i) => ({ p, i: i + 1, l })))
      .filter(x => MAL_CODIFICADO.test(x.l))
      .map(x => `${x.p.slice(RAIZ.length + 1)}:${x.i}`);
    expect(malos).toEqual([]);
  });
});
