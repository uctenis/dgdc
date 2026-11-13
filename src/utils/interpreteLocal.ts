// Intérprete local de preguntas del asistente de espacios: resuelve al instante (sin IA, sin costo) las preguntas
// típicas — códigos de edificio y recinto, siglas de unidades, tipos de recinto, pisos, campus, «por piso», «cuántos»,
// «superficie»… Si queda alguna palabra que no entiende, devuelve null y la pregunta pasa a la IA.
import type { Dimension, FilaAnalisis, Medida } from './analisisEspacios';
import { esSiglaDe, type PlanConsulta } from './consultaIA';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const palabrasDe = (s: string) => norm(s).replace(/m²|m2/g, ' m2 ').split(/[^a-z0-9_]+/).filter(Boolean);

// Palabras propias de una pregunta que no son datos (si solo quedan estas, la pregunta se entendió completa).
const VOCABULARIO = new Set(`
cuanto cuanta cuantos cuantas cual cuales que quien quienes donde como cuando tiene tienen tenemos hay habia total totales suma sumar
superficie superficies metro metros cuadrado cuadrados m2 util utiles area areas construida construidos oguc
de del la las lo los el en y e o u a al por para con sin cada entre son es esta estan este estos estas ese esos esas su sus mi
campus edificio edificios piso pisos nivel niveles recinto recintos espacio espacios ocupa ocupan ocupado ocupados usa usan
unidad unidades persona personas ocupante ocupantes funcionario funcionarios gente capacidad aforo cupo cupos
lista listar listado muestra muestrame mostrar dame dime quiero saber ver cantidad numero cuenta contar todo todos toda todas
segun desglose desglosado detalle comparacion compara comparar mayor menor mas menos tengo tenga
trabaja trabajan trabajando ubicado ubicada ubicados ubicadas mide miden medida mediante tamano grande ocupada ocupadas existe existen
`.split(/\s+/).filter(Boolean));
// Formas habituales de nombrar un tipo de recinto que no coinciden con su nombre en el catastro.
const SINONIMOS: [string, string][] = [
  ['sala de clases', 'Sala cátedra'], ['sala de clase', 'Sala cátedra'], ['aula', 'Sala cátedra'], ['salas catedra', 'Sala cátedra'],
  ['sala de reunion', 'Sala de reuniones'], ['bano', 'Baño'], ['banos', 'Baño'],
];
const DIMENSION_DE: Record<string, Dimension> = {
  campus: 'campus', edificio: 'edificio', edificios: 'edificio', piso: 'piso', pisos: 'piso', nivel: 'piso', tipo: 'tipo', tipos: 'tipo',
  uso: 'uso', usos: 'uso', unidad: 'unidad', unidades: 'unidad', estado: 'estado',
};

/** ¿Aparece la secuencia de palabras `frase` seguida en `q` (aceptando plurales)? Devuelve sus posiciones. */
function buscarFrase(q: string[], frase: string[]): number[] | null {
  const igual = (a: string, b: string) => a === b || a === `${b}s` || a === `${b}es` || b === `${a}s`;
  for (let i = 0; i + frase.length <= q.length; i++) {
    if (frase.every((w, k) => igual(q[i + k], w))) return frase.map((_, k) => i + k);
  }
  return null;
}

export function interpretarLocal(pregunta: string, filas: FilaAnalisis[], nombresCampus: Record<string, string>): PlanConsulta | null {
  const original = pregunta.trim();
  if (!original) return null;
  // Preguntas encadenadas («¿y en el piso 2?», «de esas…») necesitan la conversación: van a la IA.
  if (/^[\s¿¡"'(]*(y|e)\b|\b(esas?|esos?|aquellas?|aquellos?|anterior|mismas?|mismos?)\b/i.test(norm(original))) return null;
  const q = palabrasDe(original);
  const usadas = new Set<number>();
  const marcar = (pos: number[] | null) => { pos?.forEach(p => usadas.add(p)); return !!pos; };
  const filtros: PlanConsulta['filtros'] = {};
  const agregar = (d: Dimension, v: string) => { filtros[d] = [...new Set([...(filtros[d] || []), v])]; };

  const edificios = new Set(filas.map(f => f.edificio));
  const codigosRecinto = new Set(filas.map(f => norm(f.codigo)));
  // Códigos completos de recinto (CSF16_301) y de edificio (CSF16).
  q.forEach((w, i) => {
    if (codigosRecinto.has(w)) { filtros.codigos = [...(filtros.codigos || []), w.toUpperCase()]; usadas.add(i); }
    else if (edificios.has(w.toUpperCase())) { agregar('edificio', w.toUpperCase()); usadas.add(i); }
  });
  // Edificio por su nombre («edificio Ricardo Ferrando»), si el nombre tiene al menos dos palabras con contenido.
  const nombresEdificio = new Map<string, string>();
  for (const f of filas) if (f.edificioNombre && !nombresEdificio.has(f.edificio)) nombresEdificio.set(f.edificio, f.edificioNombre);
  for (const [codigo, nombre] of nombresEdificio) {
    const frase = palabrasDe(nombre).filter(w => !VOCABULARIO.has(w) || w === 'de');
    if (frase.filter(w => w.length > 2).length < 2) continue;
    const pos = buscarFrase(q, frase);
    if (pos && !pos.some(x => usadas.has(x))) { marcar(pos); agregar('edificio', codigo); }
  }
  // Piso: «piso 2», «tercer piso», «subterráneo».
  const pisos = [...new Set(filas.map(f => f.piso))];
  const ORDINALES: Record<string, string> = { primer: '1', primero: '1', segundo: '2', tercer: '3', tercero: '3', cuarto: '4', quinto: '5', sexto: '6', septimo: '7', octavo: '8' };
  q.forEach((w, i) => {
    const n = (w === 'piso' || w === 'nivel') && /^-?\d+$/.test(q[i + 1] || '') ? q[i + 1] : ORDINALES[w] && q[i + 1] === 'piso' ? ORDINALES[w] : null;
    if (n) {
      const p = pisos.find(x => palabrasDe(x).includes(n) && /piso|nivel/i.test(x));
      if (p) { agregar('piso', p); usadas.add(i); usadas.add(i + 1); }
    }
    if (/^subterraneo/.test(w)) { pisos.filter(x => /subterr/i.test(x)).forEach(p => agregar('piso', p)); usadas.add(i); }
  });
  // Números de recinto junto a un edificio («oficinas 301, 302 y 303 del CSF16»): se buscan aunque no existan, para
  // avisar «No encontré» en vez de responder por otra cosa.
  if (filtros.edificio?.length) {
    q.forEach((w, i) => {
      if (!usadas.has(i) && /^\d{3,4}[a-z]?$/.test(w)) { filtros.codigos = [...(filtros.codigos || []), w]; usadas.add(i); }
    });
  }
  // Campus: sigla (CJP) o nombre («San Francisco», «Menchaca Lira»).
  for (const [sigla, nombre] of Object.entries(nombresCampus)) {
    const i = q.indexOf(norm(sigla));
    if (i >= 0) { agregar('campus', sigla); usadas.add(i); continue; }
    const frase = palabrasDe(nombre).filter(w => w !== 'campus' && w.length > 2);
    for (let largo = frase.length; largo >= 2; largo--) {
      let hallado = false;
      for (let ini = 0; ini + largo <= frase.length; ini++) {
        if (marcar(buscarFrase(q, frase.slice(ini, ini + largo)))) { agregar('campus', sigla); hallado = true; break; }
      }
      if (hallado) break;
    }
  }
  // Unidades (antes que los tipos: «DDPER» es una unidad aunque algún recinto se llame así): por sigla o nombre.
  const unidades = [...new Set(filas.flatMap(f => f.unidades))];
  original.split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/).forEach(w => {
    if (w.length < 3 || w !== w.toUpperCase()) return;
    const i = q.indexOf(norm(w));
    if (i < 0 || usadas.has(i)) return;
    const coinciden = unidades.filter(u => norm(u) === norm(w) || esSiglaDe(w, u));
    if (coinciden.length) { coinciden.forEach(u => agregar('unidad', u)); usadas.add(i); }
  });
  const nombresTipo = new Set(filas.map(f => norm(f.tipo)));
  for (const u of unidades.sort((a, b) => palabrasDe(b).length - palabrasDe(a).length)) {
    const frase = palabrasDe(u);
    // Una «unidad» que se llama igual que un tipo de recinto («Sala de reuniones») se lee como tipo.
    if (frase.length < 2 || nombresTipo.has(norm(u))) continue;
    const pos = buscarFrase(q, frase);
    if (pos && !pos.some(x => usadas.has(x))) { marcar(pos); agregar('unidad', u); }
  }
  // Tipos de recinto (con plurales y sinónimos); un tipo de una palabra trae sus variantes («Oficina» → «Oficina doble»).
  const tipos = [...new Set(filas.map(f => f.tipo).filter(Boolean))].sort((a, b) => palabrasDe(b).length - palabrasDe(a).length);
  for (const [dicho, tipo] of SINONIMOS) {
    const pos = buscarFrase(q, palabrasDe(dicho));
    if (pos && !pos.some(x => usadas.has(x)) && tipos.includes(tipo)) { marcar(pos); agregar('tipo', tipo); }
  }
  for (const t of tipos) {
    const frase = palabrasDe(t);
    const pos = buscarFrase(q, frase);
    if (!pos || pos.some(p => usadas.has(p))) continue;
    marcar(pos);
    agregar('tipo', t);
    // Sus variantes: «Oficina» → «Oficina doble»; «Laboratorio de computación» → «… (idiomas)».
    tipos.filter(x => { const w = palabrasDe(x); return w.length > frase.length && frase.every((p, k) => w[k] === p); }).forEach(x => agregar('tipo', x));
  }
  // Con códigos puntuales, el tipo nombrado («las oficinas 301 y 302») solo los describe: no filtra.
  if (filtros.codigos?.length) delete filtros.tipo;

  // Agrupación: «por piso», «cada campus», «por tipo de recinto».
  let agrupar: Dimension | null = null;
  q.forEach((w, i) => {
    if ((w === 'por' || w === 'cada' || w === 'segun') && DIMENSION_DE[q[i + 1]]) { agrupar = DIMENSION_DE[q[i + 1]]; usadas.add(i + 1); }
  });
  // Medida.
  const tiene = (...ws: string[]) => ws.some(w => q.includes(w));
  // «m² por persona», «superficie por funcionario», «densidad»: superficie útil de los recintos ocupados por ocupante.
  const porPersona = tiene('densidad') || q.some((w, i) => w === 'por' && ['persona', 'funcionario', 'ocupante', 'cabeza'].includes(q[i + 1]));
  if (porPersona) q.forEach((w, i) => { if (['persona', 'funcionario', 'ocupante', 'cabeza', 'densidad'].includes(w)) usadas.add(i); });
  const medida: Medida = porPersona ? 'porPersona'
    : tiene('oguc') ? 'oguc'
    : tiene('capacidad', 'aforo', 'cupo', 'cupos') ? 'capacidad'
    : tiene('persona', 'personas', 'ocupante', 'ocupantes', 'funcionario', 'funcionarios', 'gente') ? 'ocupantes'
    : tiene('superficie', 'superficies', 'metros', 'm2', 'area', 'util', 'utiles') ? 'util'
    : tiene('cuantos', 'cuantas', 'cantidad', 'numero', 'contar') ? 'recintos' : 'util';

  // ¿Entendió todo? Si queda una palabra con contenido que no reconoce, mejor que responda la IA.
  const sobrantes = q.filter((w, i) => !usadas.has(i) && !VOCABULARIO.has(w) && !DIMENSION_DE[w] && !/^\d+$/.test(w) && w.length > 2);
  const hayFiltro = Object.keys(filtros).length > 0;
  if (sobrantes.length || !hayFiltro) return null;

  const listar = tiene('cuales', 'lista', 'listar', 'listado', 'muestra', 'muestrame', 'mostrar', 'detalle') || !!filtros.codigos?.length;
  const partes: string[] = [];
  if (filtros.codigos?.length) partes.push(`recintos ${filtros.codigos.join(', ')}`);
  if (filtros.tipo?.length) partes.push(filtros.tipo.length > 3 ? `${filtros.tipo[0]} y similares` : filtros.tipo.join(', '));
  if (filtros.unidad?.length) partes.push(`de ${filtros.unidad.join(' / ')}`);
  if (filtros.piso?.length) partes.push(`en ${filtros.piso.join(', ')}`);
  if (filtros.edificio?.length) partes.push(`del ${filtros.edificio.join(', ')}`);
  if (filtros.campus?.length) partes.push(`campus ${filtros.campus.join(', ')}`);
  const nombreMedida = { util: 'Superficie útil', oguc: 'Superficie OGUC', recintos: 'Cantidad de recintos', capacidad: 'Capacidad', ocupantes: 'Personas', porPersona: 'Superficie por persona' }[medida];
  return {
    interpretacion: `${nombreMedida}: ${partes.join(' ')}${agrupar ? `, por ${agrupar}` : ''}.`,
    filtros, agrupar, medida, listar, noAplica: null,
  };
}
