import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Persona } from './analisisEspacios';
import { comoTitulo } from './texto';

/** Lista de personas a Excel: una fila por persona, con cargo, unidad, edificios, recintos y superficie que ocupa. */
export async function exportarPersonasExcel(personas: Persona[], nombreEdificio: (c: string) => string, titulo: string): Promise<void> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Personas');
  hoja.columns = [
    { header: 'Nombre', key: 'nombre', width: 36 },
    { header: 'Cargo', key: 'cargo', width: 28 },
    { header: 'Unidad', key: 'unidad', width: 40 },
    { header: 'Edificio(s)', key: 'edificios', width: 40 },
    { header: 'Recinto(s)', key: 'recintos', width: 34 },
    { header: 'N° de recintos', key: 'n', width: 14 },
    { header: 'm² útiles de sus recintos', key: 'util', width: 22 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  for (const p of personas) {
    hoja.addRow({
      nombre: comoTitulo(p.nombre), cargo: p.cargos.join(' / '), unidad: p.unidades.join(' / '),
      edificios: p.edificios.map(nombreEdificio).join(' / '),
      recintos: p.recintos.map(f => `${f.codigo} (${f.tipo})`).join(' / '),
      n: p.recintos.length, util: Math.round(p.util * 100) / 100,
    });
  }
  hoja.autoFilter = { from: 'A1', to: 'G1' };
  const datos = await libro.xlsx.writeBuffer();
  saveAs(new Blob([datos]), `Personas ${titulo} ${new Date().toISOString().slice(0, 10)}.xlsx`);
}
