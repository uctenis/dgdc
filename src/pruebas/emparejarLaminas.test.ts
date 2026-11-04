import { describe, expect, it } from 'vitest';
import { archivoRegistrado, laminaDeArchivo } from '../utils/emparejarLaminas';
import type { DocumentoEdificio } from '../types/recintos';

const doc = (id: string, edificio_codigo: string, codigo_lamina: string, observaciones?: string, vigente = true): DocumentoEdificio => ({
  id, edificio_codigo, codigo_lamina, observaciones, vigente, titulo: 'Plano', tipo: 'Plano', especialidad: 'Arquitectura', version: '1', drive_url: 'x',
});

const indice = [
  doc('a', 'CSN11', 'L01', 'Archivo en Drive: CSN11-L01 260113.pdf'),
  doc('b', 'CSN17', 'CSN17-L01'),
  doc('c', 'CSN', 'L01', 'Archivo en Drive: CSN_Campus 260113.pdf'),
  doc('d', 'CSN', 'L01-40x60', 'Archivo en Drive: CSN_Campus 40x60 260111.pdf'),
  doc('e', 'CSN12', 'L01', undefined, false),
];

describe('emparejar láminas subidas con el índice de planos', () => {
  it('lee el nombre de archivo anotado al registrar la lámina', () => {
    expect(archivoRegistrado(indice[0])).toBe('CSN11-L01 260113.pdf');
    expect(archivoRegistrado(indice[1])).toBeNull();
  });

  it('prefiere el archivo anotado y, si no, el edificio y código de lámina del nombre', () => {
    expect(laminaDeArchivo('csn11-l01 260113.PDF', indice)?.id).toBe('a');
    expect(laminaDeArchivo('CSN_Campus 260113.pdf', indice)?.id).toBe('c');
    expect(laminaDeArchivo('CSN_Campus 40x60 260111.pdf', indice)?.id).toBe('d');
    expect(laminaDeArchivo('CSN17-L01 260112.pdf', indice)?.id).toBe('b');
  });

  it('no empareja láminas no vigentes ni archivos sin código reconocible', () => {
    expect(laminaDeArchivo('CSN12-L01 260113.pdf', indice)).toBeUndefined();
    expect(laminaDeArchivo('foto terreno.pdf', indice)).toBeUndefined();
  });
});

describe('láminas nuevas desde el nombre del archivo', () => {
  it('reconoce nombres con espacio (repositorio de CML)', async () => {
    const { inferirDatosLamina } = await import('../utils/emparejarLaminas');
    expect(inferirDatosLamina('CML01 L02 220912.pdf', 'CML')).toMatchObject({ edificio_codigo: 'CML01', codigo_lamina: 'L02' });
    expect(inferirDatosLamina('CML03 L01 230601.pdf', 'CML')).toMatchObject({ edificio_codigo: 'CML03', codigo_lamina: 'L01' });
    expect(inferirDatosLamina('CSN11-L01 260113.pdf', 'CSN')).toMatchObject({ edificio_codigo: 'CSN11', codigo_lamina: 'L01' });
  });

  it('el plano general queda en el campus, no en un edificio inventado', async () => {
    const { inferirDatosLamina } = await import('../utils/emparejarLaminas');
    expect(inferirDatosLamina('CML_Campus 260713.pdf', 'CML')).toEqual({ edificio_codigo: 'CML', codigo_lamina: 'L01', titulo: 'Plano general del campus' });
    expect(inferirDatosLamina('CSN_Campus 260113.pdf', 'CML')).toBeNull();
  });

  it('empareja con espacio una lámina ya registrada', () => {
    expect(laminaDeArchivo('CSN11 L01 otra fecha.pdf', indice)?.id).toBe('a');
  });

  it('asigna el piso según el número de la lámina', async () => {
    const { pisoDeLamina } = await import('../utils/emparejarLaminas');
    const pisos = [{ id: 'p1', orden: 1 }, { id: 'p2', orden: 2 }, { id: 'p3', orden: 3 }];
    expect(pisoDeLamina('L02', pisos)).toBe('p2');
    expect(pisoDeLamina('L04', pisos)).toBeNull();
    expect(pisoDeLamina(null, [{ id: 'x', orden: 1 }])).toBe('x');
    expect(pisoDeLamina(null, pisos)).toBeNull();
  });
});

describe('láminas de San Francisco', () => {
  it('con subterráneos, L01 es el nivel más bajo (rótulos de CSF11 y CSF17)', async () => {
    const { pisoDeLamina } = await import('../utils/emparejarLaminas');
    const csf11 = [1, 2, 3, 4, 5, -1, -2].map(n => ({ id: `n${n}`, orden: n }));
    expect(pisoDeLamina('L01', csf11)).toBe('n-2');
    expect(pisoDeLamina('L03', csf11)).toBe('n1');
    expect(pisoDeLamina('L07', csf11)).toBe('n5');
    const csf17 = [1, -1, 2].map(n => ({ id: `n${n}`, orden: n }));
    expect(pisoDeLamina('L01', csf17)).toBe('n-1');
    expect(pisoDeLamina('L03', csf17)).toBe('n2');
  });

  it('planos generales escritos con espacio y sus variantes', async () => {
    const { inferirDatosLamina } = await import('../utils/emparejarLaminas');
    expect(inferirDatosLamina('CSF Campus 260713.pdf', 'CSF')).toEqual({ edificio_codigo: 'CSF', codigo_lamina: 'L01', titulo: 'Plano general del campus' });
    expect(inferirDatosLamina('CSF Campus areas comunes 260713 LR.pdf', 'CSF')).toEqual({
      edificio_codigo: 'CSF', codigo_lamina: 'L01-AREAS-COMUNES', titulo: 'Plano general del campus (areas comunes)',
    });
    expect(inferirDatosLamina('CSF162 L01 240813.pdf', 'CSF')).toMatchObject({ edificio_codigo: 'CSF162', codigo_lamina: 'L01' });
  });
});
