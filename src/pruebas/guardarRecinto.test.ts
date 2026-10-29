import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { datosParaGuardar } from '../services/recintos';

describe('guardar un recinto', () => {
  it('envía solo las columnas editables (no la de búsqueda ni las fechas) y quita ocupantes vacíos', () => {
    const leido = {
      id: 'x', edificio_codigo: 'CSF01', piso_id: 'p1', codigo: 'CSF01_101', nombre: 'Oficina', estado: 'Operativo' as const,
      atributos: {}, origen: 'Planilla' as const, unidad_usuaria: 'Dirección de Informática',
      ocupantes: [{ nombre: ' Solís, Juan ', cargo: 'Analista' }, { nombre: '', cargo: '', unidad: '' }],
      busqueda: 'csf01_101 oficina …', creado_en: '2026-10-27', creado_por: 'a@uct.cl', modificado_en: '2026-10-28', modificado_por: 'b@uct.cl',
    };
    const datos = datosParaGuardar(leido);
    expect(Object.keys(datos).sort()).toEqual(['atributos', 'codigo', 'edificio_codigo', 'estado', 'nombre', 'ocupantes', 'origen', 'piso_id', 'unidad_usuaria'].sort());
    expect(datos.ocupantes).toEqual([{ nombre: 'Solís, Juan', cargo: 'Analista', unidad: null }]);
  });
});
