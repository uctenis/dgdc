// Lógica del importador de recintos desde planillas (sin pantalla, para poder probarla): leer el archivo,
// encontrar la fila de encabezados, adivinar qué columna es cada dato y revisar fila por fila.
import ExcelJS from 'exceljs';
import { ESTADOS_RECINTO, type EstadoRecinto, type Recinto } from '../types/recintos';

export const CAMPOS_IMPORTACION = [
  { id: 'edificio', etiqueta: 'Edificio (código)', obligatorio: false, pistas: ['edificio'] },
  { id: 'piso', etiqueta: 'Piso', obligatorio: true, pistas: ['piso', 'nivel', 'planta'] },
  { id: 'codigo', etiqueta: 'Código del recinto', obligatorio: true, pistas: ['codigo actual', 'codigo ambiente', 'codigo nuevo', 'codigo', 'cod'] },
  { id: 'nombre', etiqueta: 'Nombre o tipo de recinto', obligatorio: true, pistas: ['tipo infra', 'nombre', 'descripcion', 'denominacion', 'recinto'] },
  { id: 'uso', etiqueta: 'Uso', obligatorio: false, pistas: ['tipo sistema', 'uso', 'destino'] },
  { id: 'superficie_m2', etiqueta: 'Superficie interior útil (m²)', obligatorio: false, pistas: ['interna recinto', 'superficie util', 'superficie', 'm2', 'area'] },
  { id: 'superficie_oguc_m2', etiqueta: 'Superficie OGUC (m²)', obligatorio: false, pistas: ['oguc recinto', 'oguc'] },
  { id: 'capacidad', etiqueta: 'Capacidad (personas)', obligatorio: false, pistas: ['capacidad', 'aforo', 'puestos'] },
  { id: 'existe', etiqueta: 'Existe (1 / 0)', obligatorio: false, pistas: ['existe'] },
  { id: 'estado', etiqueta: 'Estado', obligatorio: false, pistas: ['estado'] },
  { id: 'unidad_usuaria', etiqueta: 'Unidad usuaria', obligatorio: false, pistas: ['unidad', 'facultad', 'departamento'] },
  { id: 'observaciones', etiqueta: 'Observaciones', obligatorio: false, pistas: ['observacion', 'obs', 'notas'] },
] as const;
type IdCampo = typeof CAMPOS_IMPORTACION[number]['id'];
export type Asignacion = Partial<Record<IdCampo, number>>;

/** Columnas con datos de personas: no se guardan con el recinto salvo que se pida (el recinto no es un registro de personal). */
export const DATOS_PERSONALES = /\b(rut|nombre persona|cargo|anexo|tipo de ctto|contrato)\b/;

export type Tabla = { hojas: string[]; filasPorHoja: Record<string, string[][]> };

export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();

/** Errores de fórmula de Excel (#N/A, #NAME?, #REF!…): cuentan como celda vacía. */
const esErrorExcel = (t: string) => /^#(N\/A|NAME\?|REF!|VALUE!|DIV\/0!|NUM!|NULL!|SPILL!|CALC!)/i.test(t.trim());

function textoCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    const v = valor as { result?: unknown; text?: unknown; richText?: { text: string }[]; error?: unknown };
    if (v.error !== undefined) return '';
    if (v.richText) return v.richText.map(t => t.text).join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined && v.result !== null && typeof v.result !== 'object') return String(v.result).trim();
    return '';
  }
  const t = String(valor).trim();
  return esErrorExcel(t) ? '' : t;
}

/** "1.234,5" → 1234.5; "12,5" → 12.5; "12.5" → 12.5; vacío o no numérico → null. */
export function numero(texto: string): number | null {
  const t = texto.replace(/\s|m2|m²/gi, '');
  if (!t || t === '-') return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Letra de una columna de Excel: 0 → A, 26 → AA. */
export const letraColumna = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letraColumna(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

export async function leerLibro(datos: ArrayBuffer, nombreArchivo: string): Promise<Tabla> {
  if (/\.csv$/i.test(nombreArchivo)) {
    const texto = new TextDecoder().decode(datos);
    const primera = texto.split('\n')[0];
    const separador = (primera.match(/;/g)?.length || 0) > (primera.match(/,/g)?.length || 0) ? ';' : ',';
    const filas = texto.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(separador).map(c => c.replace(/^"|"$/g, '').trim()));
    return { hojas: ['CSV'], filasPorHoja: { CSV: filas } };
  }
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(datos);
  const filasPorHoja: Record<string, string[][]> = {};
  libro.worksheets.forEach(hoja => {
    const filas: string[][] = [];
    hoja.eachRow({ includeEmpty: false }, fila => {
      // Array.from rellena los huecos de las celdas vacías (con .map quedarían huecos sin texto).
      const valores = Array.from((fila.values as ExcelJS.CellValue[]).slice(1), textoCelda);
      if (valores.some(Boolean)) filas.push(valores);
    });
    if (filas.length) filasPorHoja[hoja.name] = filas;
  });
  return { hojas: Object.keys(filasPorHoja), filasPorHoja };
}

/** Columna que mejor calza con cada campo, según su encabezado. */
export function asignarAutomatico(encabezados: string[]): Asignacion {
  const asignacion: Asignacion = {};
  const usadas = new Set<number>();
  const normales = Array.from(encabezados, c => sinTildes(c || ''));
  CAMPOS_IMPORTACION.forEach(campo => {
    for (const pista of campo.pistas) {
      const p = sinTildes(pista);
      // Primero coincidencia exacta, después que el encabezado contenga la pista.
      let i = normales.findIndex((c, idx) => !usadas.has(idx) && c === p);
      if (i < 0) i = normales.findIndex((c, idx) => !usadas.has(idx) && c.includes(p));
      if (i >= 0) { asignacion[campo.id] = i; usadas.add(i); break; }
    }
  });
  return asignacion;
}

/** Qué tan bien calza una fila como encabezado: cuenta los campos reconocidos, y el doble los obligatorios. */
function puntajeEncabezado(fila: string[]): number {
  const asignacion = asignarAutomatico(fila);
  return CAMPOS_IMPORTACION.reduce((s, c) => s + (asignacion[c.id] !== undefined ? (c.obligatorio ? 2 : 1) : 0), 0);
}

/** Fila de encabezados (desde 1): la que mejor calza entre las 15 primeras (las de arriba suelen ser títulos o filtros). */
export function detectarFilaEncabezado(filas: string[][]): number {
  let mejor = 0;
  let mejorPuntaje = -1;
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const p = puntajeEncabezado(filas[i]);
    if (p > mejorPuntaje) { mejor = i; mejorPuntaje = p; }
  }
  return mejor + 1;
}

/** Hoja que más parece un listado de recintos (la de mejor encabezado; a igualdad, la de más filas). */
export function elegirHoja(tabla: Tabla): string {
  const puntaje = (h: string) => puntajeEncabezado(tabla.filasPorHoja[h][detectarFilaEncabezado(tabla.filasPorHoja[h]) - 1] || []);
  return [...tabla.hojas].sort((a, b) => puntaje(b) - puntaje(a) || tabla.filasPorHoja[b].length - tabla.filasPorHoja[a].length)[0];
}

export interface FilaRevisada {
  n: number;
  edificio: string;
  piso: string;
  problemasGraves: string[];
  avisos: string[];
  /** Repite un código ya visto en el mismo edificio (p. ej. una fila por cada ocupante): se omite sin ser error. */
  repetida: boolean;
  recinto: Omit<Recinto, 'id' | 'piso_id' | 'edificio_codigo' | 'origen'>;
}

/** Revisa cada fila de datos con la asignación de columnas. `edificioPorDefecto` se usa si no hay columna de edificio. */
export function revisarFilas(
  encabezados: string[], datos: string[][], filaEncabezado: number, asignacion: Asignacion,
  opciones: { edificioPorDefecto: string; guardarResto: boolean; incluirDatosPersonales: boolean },
): FilaRevisada[] {
  // Un guion solo ("-") es la forma habitual de dejar una celda vacía en las planillas.
  const col = (fila: string[], campo: IdCampo) => {
    const v = asignacion[campo] !== undefined ? (fila[asignacion[campo]!] || '').trim() : '';
    return v === '-' ? '' : v;
  };
  const asignadas = new Set(Object.values(asignacion));
  const vistos = new Set<string>();
  // Encabezados repetidos ("COMENTARIO" dos veces) se distinguen por su columna.
  const limpios = Array.from(encabezados, c => (c || '').replace(/\s+/g, ' ').trim());
  const nombres = limpios.map((c, i) => (limpios.indexOf(c) !== i || limpios.lastIndexOf(c) !== i ? `${c} (col. ${letraColumna(i)})` : c));
  return datos.map((fila, i) => {
    const problemas: string[] = [];
    const avisos: string[] = [];
    const edificio = (col(fila, 'edificio') || opciones.edificioPorDefecto).toUpperCase();
    const piso = col(fila, 'piso');
    const codigo = col(fila, 'codigo').toUpperCase();
    // Sin nombre, se usa el uso (en los catastros el tipo de recinto a veces viene solo en esa columna).
    const nombre = col(fila, 'nombre') || col(fila, 'uso');
    if (!edificio) problemas.push('sin edificio');
    if (!piso) problemas.push('sin piso');
    if (!codigo) problemas.push('sin código');
    if (!nombre) problemas.push('sin nombre');
    const clave = `${edificio}|${codigo}`;
    const repetida = Boolean(codigo) && vistos.has(clave);
    if (codigo) vistos.add(clave);
    const textoSup = col(fila, 'superficie_m2');
    const superficie = numero(textoSup);
    if (textoSup && superficie === null) avisos.push('superficie no numérica');
    const textoOguc = col(fila, 'superficie_oguc_m2');
    const oguc = numero(textoOguc);
    const capacidad = numero(col(fila, 'capacidad'));
    const textoEstado = col(fila, 'estado');
    let estado = ESTADOS_RECINTO.find(e => sinTildes(e) === sinTildes(textoEstado)) as EstadoRecinto | undefined;
    if (textoEstado && !estado) avisos.push(`estado "${textoEstado}" no reconocido`);
    const existe = col(fila, 'existe');
    if (existe && /^(0|no|n|false)$/i.test(existe)) estado = 'Eliminado';
    const atributos: Record<string, string> = {};
    if (opciones.guardarResto) {
      encabezados.forEach((cab, idx) => {
        if (asignadas.has(idx) || !cab || !fila[idx] || fila[idx] === '-') return;
        if (!opciones.incluirDatosPersonales && DATOS_PERSONALES.test(sinTildes(cab))) return;
        atributos[nombres[idx]] = fila[idx];
      });
    }
    return {
      n: filaEncabezado + i + 1,
      edificio,
      piso,
      problemasGraves: problemas,
      avisos,
      repetida,
      recinto: {
        codigo, nombre,
        uso: col(fila, 'uso') || null,
        superficie_m2: superficie,
        superficie_oguc_m2: oguc,
        capacidad: capacidad !== null ? Math.round(capacidad) : null,
        estado: estado || 'Operativo',
        unidad_usuaria: col(fila, 'unidad_usuaria') || null,
        observaciones: col(fila, 'observaciones') || null,
        atributos,
      },
    };
  });
}

/** Nombre y orden de un piso a partir de su código: "1" → Piso 1, "-1" → Subterráneo 1, "0" → Piso 0 (zócalo). */
export function datosDePiso(codigo: string): { nombre: string; orden: number } {
  const n = Number(codigo);
  if (Number.isInteger(n)) return { nombre: n < 0 ? `Subterráneo ${-n}` : `Piso ${n}`, orden: n };
  return { nombre: `Piso ${codigo}`, orden: 100 };
}
