// Exporta una propuesta de Asignación a Excel para analizarla: resumen, cambios, recintos antes y después (con m² por
// persona), efecto por unidad y bitácora del control de cambios.
import type { EventoPropuesta, Movimiento, Propuesta, ResumenPropuesta } from './asignacion';
import { clavePersona } from '../utils/analisisEspacios';
import { m2PorPersona } from '../utils/densidad';
import { comoTitulo } from '../utils/texto';

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const redondear = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/** Indicadores de la propuesta (también se muestran en pantalla). */
export function indicadoresPropuesta(filas: ResumenPropuesta) {
  const suma = (f: (r: ResumenPropuesta[number]) => number) => filas.reduce((s, r) => s + f(r), 0);
  const superficieOcupada = (cuando: 'antes' | 'despues') => suma(r => (r[cuando].length ? Number(r.superficie_m2) || 0 : 0));
  const personas = (cuando: 'antes' | 'despues') => suma(r => r[cuando].length);
  return {
    recintos: filas.length,
    personasAntes: personas('antes'),
    personasDespues: personas('despues'),
    m2PersonaAntes: redondear(m2PorPersona(superficieOcupada('antes'), personas('antes'))),
    m2PersonaDespues: redondear(m2PorPersona(superficieOcupada('despues'), personas('despues'))),
    recintosVacios: filas.filter(r => r.antes.length && !r.despues.length).length,
    recintosNuevos: filas.filter(r => !r.antes.length && r.despues.length).length,
  };
}

export async function exportarPropuestaExcel(p: {
  propuesta: Propuesta; movimientos: Movimiento[]; filas: ResumenPropuesta; eventos: EventoPropuesta[]; nombresEdificio: Record<string, string>;
}): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestor de Espacios · DGDC UCT';
  const encabezado = (ws: import('exceljs').Worksheet) => {
    const fila = ws.getRow(1);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B21B6' } };
    fila.alignment = { vertical: 'middle', wrapText: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };
  const { propuesta: pr, movimientos, filas, eventos, nombresEdificio } = p;
  const ind = indicadoresPropuesta(filas);

  // 1. Resumen
  const r = wb.addWorksheet('Resumen');
  r.columns = [{ width: 34 }, { width: 70 }];
  const datos: [string, string | number | null][] = [
    ['Propuesta', pr.nombre], ['Descripción', pr.descripcion || ''], ['Estado', pr.estado],
    ['Creada', `${fecha(pr.creado_en)} · ${pr.creado_por || ''}`],
    ['Enviada a revisión', pr.enviado_en ? `${fecha(pr.enviado_en)} · ${pr.enviado_por || ''}` : ''],
    ['Aprobada', pr.aprobado_en ? `${fecha(pr.aprobado_en)} · ${pr.aprobado_por || ''}` : ''],
    ['Aplicada', pr.aplicado_en ? `${fecha(pr.aplicado_en)} · ${pr.aplicado_por || ''}` : ''],
    ['Cambios', movimientos.length], ['Recintos afectados', ind.recintos],
    ['Personas en esos recintos (antes → después)', `${ind.personasAntes} → ${ind.personasDespues}`],
    ['m² por persona en esos recintos (antes → después)', `${ind.m2PersonaAntes ?? '—'} → ${ind.m2PersonaDespues ?? '—'}`],
    ['Recintos que quedan vacíos', ind.recintosVacios], ['Recintos que pasan a ocuparse', ind.recintosNuevos],
    ['Exportado', fecha(new Date().toISOString())],
  ];
  r.addRow(['Propuesta de asignación de espacios', '']).font = { bold: true, size: 14 };
  r.addRow([]);
  datos.forEach(([k, v]) => { const f = r.addRow([k, v]); f.getCell(1).font = { bold: true }; });

  // 2. Cambios
  const c = wb.addWorksheet('Cambios');
  c.columns = [
    { header: 'N°', width: 5 }, { header: 'Persona', width: 32 }, { header: 'Cargo', width: 24 }, { header: 'Unidad anterior', width: 32 },
    { header: 'Unidad nueva', width: 32 }, { header: 'Desde', width: 14 }, { header: 'Hacia', width: 14 }, { header: 'Conserva su recinto', width: 12 }, { header: 'Estado', width: 11 },
  ];
  movimientos.forEach((m, i) => c.addRow([i + 1, comoTitulo(m.persona.nombre), m.persona.cargo || '', comoTitulo(m.unidad_anterior || m.persona.unidad || ''),
    m.unidad_nueva ? comoTitulo(m.unidad_nueva) : '', m.desde_codigo || 'sin recinto', m.hacia_codigo || 'sale', m.conservar_origen ? 'sí' : '', m.estado]));
  encabezado(c);

  // 3. Recintos antes y después
  const re = wb.addWorksheet('Recintos');
  re.columns = [
    { header: 'Código', width: 14 }, { header: 'Recinto', width: 26 }, { header: 'Edificio', width: 28 }, { header: 'm² útil', width: 9 },
    { header: 'Personas antes', width: 9 }, { header: 'Personas después', width: 9 }, { header: 'm²/persona antes', width: 10 }, { header: 'm²/persona después', width: 10 },
    { header: 'Entran', width: 40 }, { header: 'Salen', width: 40 }, { header: 'Quedan', width: 40 },
  ];
  for (const f of filas) {
    const antes = new Set(f.antes.map(o => clavePersona(o.nombre))), despues = new Set(f.despues.map(o => clavePersona(o.nombre)));
    const nombres = (l: typeof f.antes) => l.map(o => comoTitulo(o.nombre)).join('; ');
    re.addRow([f.codigo, comoTitulo(f.nombre), `${f.edificio_codigo} · ${nombresEdificio[f.edificio_codigo] || ''}`, Number(f.superficie_m2) || null,
      f.antes.length, f.despues.length, redondear(m2PorPersona(f.superficie_m2, f.antes.length)), redondear(m2PorPersona(f.superficie_m2, f.despues.length)),
      nombres(f.despues.filter(o => !antes.has(clavePersona(o.nombre)))), nombres(f.antes.filter(o => !despues.has(clavePersona(o.nombre)))),
      nombres(f.despues.filter(o => antes.has(clavePersona(o.nombre))))]);
  }
  encabezado(re);

  // 4. Por unidad: personas de cada unidad en los recintos afectados, antes y después
  const u = wb.addWorksheet('Por unidad');
  u.columns = [{ header: 'Unidad', width: 44 }, { header: 'Personas antes', width: 11 }, { header: 'Personas después', width: 11 }, { header: 'Diferencia', width: 10 }];
  const porUnidad = new Map<string, { antes: number; despues: number }>();
  for (const f of filas) for (const [cuando, lista] of [['antes', f.antes], ['despues', f.despues]] as const) for (const o of lista) {
    const k = comoTitulo(o.unidad || 'Sin unidad'); const v = porUnidad.get(k) || { antes: 0, despues: 0 }; v[cuando]++; porUnidad.set(k, v);
  }
  [...porUnidad.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).forEach(([k, v]) => u.addRow([k, v.antes, v.despues, v.despues - v.antes]));
  encabezado(u);

  // 5. Bitácora
  const b = wb.addWorksheet('Bitácora');
  b.columns = [{ header: 'Fecha', width: 22 }, { header: 'Paso', width: 30 }, { header: 'Por', width: 28 }, { header: 'Comentario', width: 60 }];
  eventos.forEach(e => b.addRow([fecha(e.en), `${e.estado_anterior ? `${e.estado_anterior} → ` : ''}${e.estado_nuevo}`, e.por || '', e.comentario || '']));
  encabezado(b);

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Propuesta ${pr.nombre.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60)} (${pr.estado}).xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
