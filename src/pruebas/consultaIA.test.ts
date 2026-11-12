import { describe, expect, it } from 'vitest';
import { armarPrompt, catalogo, ejecutarPlan, leerPlan } from '../utils/consultaIA';
import type { FilaAnalisis } from '../utils/analisisEspacios';

const fila = (codigo: string, tipo: string, util: number, extra: Partial<FilaAnalisis> = {}): FilaAnalisis => ({
  id: codigo, campus: 'CSF', campusNombre: 'San Francisco', edificio: codigo.split('_')[0], edificioNombre: 'Edificio', piso: 'Piso 3', pisoOrden: 3,
  codigo, tipo, uso: 'Administrativo', unidades: ['Dirección de Gestión y Desarrollo de Campus'], clase: 'Útil', estado: 'Operativo', vigente: true,
  util, oguc: util * 1.1, capacidad: 2, ocupantes: [{ nombre: 'Pérez, Ana' }], ...extra,
});
const filas = [fila('CSF16_301', 'Oficina', 12), fila('CSF16_302', 'Oficina', 10.5), fila('CSF16_303', 'Oficina', 9), fila('CSF16_304', 'Baño', 4),
  fila('CJP01_101', 'Sala de clases', 60, { campus: 'CJP', piso: 'Piso 1' }), fila('CSF16_305', 'Oficina', 20, { vigente: false, estado: 'Eliminado' })];

describe('asistente de consultas', () => {
  it('lee el JSON de la IA aunque venga entre ``` y descarta lo inválido', () => {
    const p = leerPlan('```json\n{"interpretacion":"x","filtros":{"edificio":"CSF16","codigos":["301","302","303"],"inventado":["a"]},"agrupar":"nada","medida":"m3"}\n```');
    expect(p.filtros).toEqual({ edificio: ['CSF16'], codigos: ['301', '302', '303'] });
    expect(p.agrupar).toBeNull();
    expect(p.medida).toBe('util');
  });
  it('suma los m² de tres oficinas nombradas por número', () => {
    const r = ejecutarPlan(filas, leerPlan('{"filtros":{"edificio":["CSF16"],"codigos":["301","302","303"]},"medida":"util"}'));
    expect(r.filas.map(f => f.codigo)).toEqual(['CSF16_301', 'CSF16_302', 'CSF16_303']);
    expect(r.totales.util).toBe(31.5);
  });
  it('empareja valores sin importar mayúsculas ni tildes, agrupa y no cuenta lo dado de baja', () => {
    const r = ejecutarPlan(filas, leerPlan('{"filtros":{"tipo":["oficina"],"campus":["csf"]},"agrupar":"piso","medida":"recintos"}'));
    expect(r.totales.recintos).toBe(3);
    expect(r.grupos[0]).toMatchObject({ clave: 'Piso 3', recintos: 3 });
  });
  it('avisa de lo que no existe', () => {
    const r = ejecutarPlan(filas, leerPlan('{"filtros":{"edificio":["XYZ99"]}}'));
    expect(r.filas).toHaveLength(0);
    expect(r.sinCoincidencia).toContain('XYZ99');
  });
  it('arma la instrucción con el catálogo y la conversación previa', () => {
    const texto = armarPrompt('¿y en el piso 2?', catalogo(filas, { CSF: 'San Francisco' }), [{ pregunta: 'oficinas de CSF16', plan: leerPlan('{"filtros":{"edificio":["CSF16"]}}') }]);
    expect(texto).toContain('CSF16');
    expect(texto).toContain('Conversación previa');
    expect(texto).toContain('¿y en el piso 2?');
  });
  it('con la pregunta, el catálogo se recorta a lo mencionado (instrucción más corta, respuesta más rápida)', () => {
    const muchas = Array.from({ length: 80 }, (_, i) => fila(`CSF16_${400 + i}`, `Tipo ${i}`, 10, { unidades: [`Unidad ${i}`] }));
    const cat = catalogo([...filas, ...muchas], { CSF: 'San Francisco' }, 'recintos de la Dirección de Gestión y Desarrollo de Campus');
    expect(cat.unidades).toContain('Dirección de Gestión y Desarrollo de Campus');
    expect(cat.unidades.length).toBeLessThan(40);
    expect(cat.tipos.length).toBeLessThan(60);
  });
});
