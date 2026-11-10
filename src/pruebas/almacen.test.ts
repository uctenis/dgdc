import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
import {
  aplanarParaMezcla, arrayUnion, clavesDeDocumento, codificar, collection, destinoDeColeccion, doc, increment,
  normalizarLeido, serverTimestamp, db,
} from '../lib/almacen';

describe('almacén de documentos en Supabase', () => {
  it('traduce las rutas de Firestore a tablas y claves', () => {
    expect(clavesDeDocumento(['proyectos', 'p1'])).toEqual({ tabla: 'proyectos', claves: { id: 'p1' } });
    expect(clavesDeDocumento(['licitaciones', 'L', 'invitados', 'prov'])).toEqual({ tabla: 'licitacion_invitados', claves: { licitacion_id: 'L', proveedor_id: 'prov' } });
    expect(clavesDeDocumento(['licitaciones', 'L', 'control', 'aclaraciones'])).toEqual({ tabla: 'licitacion_subcolecciones', claves: { licitacion_id: 'L', tipo: 'control', id: 'aclaraciones' } });
    expect(clavesDeDocumento(['licitaciones', 'L', 'libroObra', 'E', 'fotos', '2'])).toEqual({ tabla: 'licitacion_subcolecciones', claves: { licitacion_id: 'L', tipo: 'libroObraFotos', id: 'E/2' } });
    expect(clavesDeDocumento(['proyectos', 'p1', 'bitacoraDesarrollo', 'h'])).toEqual({ tabla: 'proyecto_subcolecciones', claves: { proyecto_id: 'p1', tipo: 'bitacoraDesarrollo', id: 'h' } });
    expect(clavesDeDocumento(['_counters', 'proyectos']).tabla).toBe('contadores');
    expect(destinoDeColeccion(['inscripcionesProveedores']).columnaId).toBe('codigo');
    expect(() => destinoDeColeccion(['configuracion'])).toThrow(/RUTA_NO_MIGRADA/);
  });

  it('arma referencias como Firestore (id nuevo, subcolecciones y padres)', () => {
    const col = collection(db, 'licitaciones', 'L', 'libroObra');
    const nueva = doc(col);
    expect(nueva.id).toHaveLength(20);
    const foto = doc(nueva, 'fotos', '1');
    expect(foto.path).toBe(`licitaciones/L/libroObra/${nueva.id}/fotos/1`);
    expect(doc(db, 'licitaciones/L/garantias/g1').parent.parent?.id).toBe('L');
  });

  it('codifica valores especiales, fechas y quita lo indefinido', () => {
    expect(codificar({ a: undefined, b: 1, c: new Date('2026-01-02T00:00:00Z'), d: [undefined, 2] })).toEqual({ b: 1, c: '2026-01-02T00:00:00.000Z', d: [null, 2] });
    expect(codificar(increment(2))).toEqual({ __op: 'increment', n: 2 });
    expect(codificar(arrayUnion('x'))).toEqual({ __op: 'arrayUnion', v: ['x'] });
    // Dentro de un objeto anidado, la hora del servidor se resuelve en el navegador.
    expect(typeof (codificar({ x: { t: serverTimestamp() } }) as { x: { t: unknown } }).x.t).toBe('string');
  });

  it('aplana los objetos al mezclar (set con merge) para no borrar lo que ya había', () => {
    expect(aplanarParaMezcla({ last: 3, porAnio: { 2027: 1 }, vacio: {} })).toEqual({ last: 3, 'porAnio.2027': 1, vacio: {} });
  });

  it('convierte las fechas copiadas de Firestore a texto ISO', () => {
    expect(normalizarLeido({ _createdAt: { seconds: 1, nanoseconds: 500000000 }, x: [{ seconds: 0, nanoseconds: 0, type: 'firestore/timestamp/1.1' }] }))
      .toEqual({ _createdAt: '1970-01-01T00:00:01.500Z', x: ['1970-01-01T00:00:00.000Z'] });
  });
});
