import { describe, expect, it } from 'vitest';
import { resumirAlcance, textoAlcanceParaIA } from '../utils/alcanceProyecto';
import type { Piso, Recinto } from '../types/recintos';

const piso = (id: string, orden: number): Piso => ({ id, edificio_codigo: 'CSF02', codigo: String(orden), nombre: `Piso ${orden}`, orden } as Piso);
const recinto = (id: string, pisoId: string, nombre: string, util: number, extra: Partial<Recinto> = {}): Recinto =>
  ({ id, edificio_codigo: 'CSF02', piso_id: pisoId, codigo: `CSF02_${id}`, nombre, superficie_m2: util, superficie_oguc_m2: util * 1.1, estado: 'Operativo', ...extra } as Recinto);

describe('alcance del proyecto en el Gestor de Espacios', () => {
  const pisos = [piso('p1', 1), piso('p2', 2)];
  const recintos = [
    recinto('201', 'p2', 'Oficina', 10), recinto('202', 'p2', 'Oficina', 12), recinto('210', 'p2', 'Sala de clases', 50),
    recinto('299', 'p2', 'Oficina', 9, { estado: 'Eliminado' }), recinto('101', 'p1', 'Hall', 30),
  ];

  it('suma el piso completo (sin lo dado de baja) y los recintos sueltos', () => {
    const r = resumirAlcance({ pisos: ['p2'], recintos: ['101'] }, pisos, recintos);
    expect(r.recintos.map(x => x.codigo)).toEqual(['CSF02_201', 'CSF02_202', 'CSF02_210', 'CSF02_101']);
    expect(r.util).toBe(102);
    expect(r.porTipo[0]).toEqual({ tipo: 'Sala de clases', n: 1, util: 50 });
    expect(r.pisos).toEqual(['Piso 1', 'Piso 2']);
  });

  it('describe el alcance para la IA con superficies y detalle', () => {
    const t = textoAlcanceParaIA('CSF02', resumirAlcance({ pisos: ['p2'], recintos: [] }, pisos, recintos));
    expect(t).toContain('3 recintos, 72 m² útiles');
    expect(t).toContain('Oficina (2, 22 m²)');
    expect(t).toContain('CSF02_210 Sala de clases 50 m²');
  });
});
