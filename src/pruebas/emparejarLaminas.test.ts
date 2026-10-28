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
