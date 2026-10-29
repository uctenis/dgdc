import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

const guardado = vi.hoisted(() => ({ blob: null as Blob | null, nombre: '' }));
vi.mock('file-saver', () => ({ saveAs: (blob: Blob, nombre: string) => { guardado.blob = blob; guardado.nombre = nombre; } }));

import { exportarRecintosExcel } from '../utils/exportarRecintos';
import type { FilaExportable } from '../utils/exportarRecintos';

const recinto = (codigo: string, util: number | null, oguc: number | null, extra: Partial<FilaExportable> = {}): FilaExportable => ({
  id: codigo, edificio_codigo: 'CSF01', piso_id: 'p1', codigo, nombre: 'OFICINA', estado: 'Operativo', atributos: {}, origen: 'Planilla',
  superficie_m2: util, superficie_oguc_m2: oguc, piso: { codigo: '1', nombre: 'Piso 1' }, ...extra,
});

describe('descarga de recintos a Excel', () => {
  it('arma el resumen, los recintos y el resumen por tipo, sin contar los eliminados', async () => {
    await exportarRecintosExcel([
      recinto('CSF01_101', 10, 11, { ocupantes: [{ nombre: 'PÉREZ, ANA', cargo: 'SECRETARIA' }, { nombre: 'SOTO, LUIS' }] }),
      recinto('CSF01_102', 52.04, 27.95),
      recinto('CSF01_103', 5, 6, { estado: 'Eliminado' }),
    ], { CSF01: 'Edificio A' }, 'CSF01');
    expect(guardado.nombre).toMatch(/^Recintos CSF01 \d{4}-\d{2}-\d{2}\.xlsx$/);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await guardado.blob!.arrayBuffer());
    expect(libro.worksheets.map(h => h.name)).toEqual(['Resumen', 'Recintos', 'Por tipo']);
    const resumen = libro.getWorksheet('Resumen')!;
    expect(resumen.getRow(2).values).toEqual([undefined, 'CSF01', 'Edificio A', 2, 62.04, 38.95, 2, 1]);
    const recintos = libro.getWorksheet('Recintos')!;
    expect(recintos.rowCount).toBe(4);
    expect(recintos.getRow(2).getCell(13).value).toBe('Pérez, Ana – SECRETARIA; Soto, Luis');
    expect(String(recintos.getRow(3).getCell(14).value)).toMatch(/mayor que la OGUC/);
  });
});
