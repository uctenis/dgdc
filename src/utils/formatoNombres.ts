// Formato de los nombres del Gestor de Espacios (criterio acordado el 2026-10-29, según la RAE):
//   · Tipos de recinto y usos (sustantivos comunes): mayúscula solo al inicio → «Sala de reuniones».
//   · Unidades (nombres propios de organismos): formato título, con artículos y preposiciones en minúscula →
//     «Dirección de Gestión y Desarrollo de Campus». Las siglas quedan en mayúscula (UAS, DAI - PACE).
// Además: tildes que faltan, abreviaturas escritas completas, el «de» que el catastro suele omitir y avisos de lo que
// necesita revisión de una persona (nombres cortados, valores que no son unidades).

/** Palabras sin tilde (como vienen del catastro) → con tilde, cuando la regla general por terminación no alcanza. */
const TILDES: Record<string, string> = {
  academico: 'académico', academica: 'académica', academicos: 'académicos', academicas: 'académicas', acustica: 'acústica',
  acuicolas: 'acuícolas', agronomia: 'agronomía', analisis: 'análisis', artesania: 'artesanía', artistica: 'artística',
  asesoria: 'asesoría', auditoria: 'auditoría', basica: 'básica', basicas: 'básicas', biologica: 'biológica', biologicas: 'biológicas',
  biomedicas: 'biomédicas', cafeteria: 'cafetería', camarin: 'camarín', capellania: 'capellanía', carpinteria: 'carpintería',
  catedra: 'cátedra', catolica: 'católica', cientifica: 'científica', cientificas: 'científicas', clinica: 'clínica', clinicas: 'clínicas',
  clinico: 'clínico', clinicos: 'clínicos', comun: 'común', conserjeria: 'conserjería', credito: 'crédito', cuadruple: 'cuádruple',
  deposito: 'depósito', diseno: 'diseño', economia: 'economía', economica: 'económica', economicas: 'económicas', electrica: 'eléctrica',
  electricas: 'eléctricas', electrico: 'eléctrico', electronica: 'electrónica', energia: 'energía', enfermeria: 'enfermería',
  estadistica: 'estadística', etica: 'ética', fernandez: 'fernández', fisica: 'física', fisicas: 'físicas', fisico: 'físico',
  futbol: 'fútbol', galeria: 'galería', genero: 'género', gastronomia: 'gastronomía', historica: 'histórica', ingenieria: 'ingeniería',
  informatica: 'informática', informatico: 'informático', jardin: 'jardín', juridica: 'jurídica', juridicas: 'jurídicas',
  lavanderia: 'lavandería', libreria: 'librería', logistica: 'logística', matematica: 'matemática', matematicas: 'matemáticas',
  maquina: 'máquina', maquinas: 'máquinas', medica: 'médica', medico: 'médico', musica: 'música', mecanica: 'mecánica',
  organica: 'orgánica', organico: 'orgánico', pedagogia: 'pedagogía', pedagogica: 'pedagógica', politica: 'política',
  politicas: 'políticas', porteria: 'portería', practica: 'práctica', practicas: 'prácticas', practico: 'práctico', publica: 'pública',
  publicas: 'públicas', publico: 'público', quimica: 'química', quimicas: 'químicas', quintuple: 'quíntuple', sextuple: 'séxtuple',
  sicologia: 'psicología', tecnica: 'técnica', tecnicas: 'técnicas', tecnico: 'técnico', tecnicos: 'técnicos', tecnologico: 'tecnológico',
  tecnologica: 'tecnológica', tecnologicas: 'tecnológicas', terapeutica: 'terapéutica', tesoreria: 'tesorería', ultimo: 'último',
  unico: 'único', vicerrectoria: 'vicerrectoría', vehiculos: 'vehículos', energetica: 'energética', farmacologia: 'farmacología',
};
/** Terminaciones que en castellano siempre llevan tilde (-ción, -sión, -logía, -grafía, -nomía…). */
const TERMINACIONES: [RegExp, string][] = [
  [/cion$/, 'ción'], [/sion$/, 'sión'], [/tion$/, 'tión'], [/logia$/, 'logía'], [/logias$/, 'logías'], [/grafia$/, 'grafía'], [/grafias$/, 'grafías'],
  [/nomia$/, 'nomía'], [/tecnologias$/, 'tecnologías'], [/metria$/, 'metría'],
];

/** Abreviaturas frecuentes en los nombres de unidades → palabra completa. */
const ABREVIATURAS: [RegExp, string][] = [
  [/\bVICERRECT\.?(?=\s|$)/gi, 'Vicerrectoría'],
  [/\bSUBDIR\.\s*/gi, 'Subdirección '],
  [/\bDIREC\.?(?=\s|$)|\bDIR\.\s*/gi, 'Dirección '],
  [/\bDEPTO\.?\s*|\bDPTO\.?\s*/gi, 'Departamento '],
  [/\bCS\.\s*/gi, 'Ciencias '],
  [/\bING\.\s*(?=EN\b)/gi, 'Ingeniería '],
  [/\bING\.\s*/gi, 'Ingeniería en '],
  [/\bREC\.\s*/gi, 'Recursos '],
  [/\bPROY\.\s*/gi, 'Proyectos '],
  [/\bADM\.\s*/gi, 'Administrativos '],
  [/\bASUNT\.\s*/gi, 'Asuntos '],
  [/\bEST\.(?=\s|$)/gi, 'Estudiantiles'],
  [/\bFAC\.?(?=\s)/gi, 'Facultad'],
  [/\bUNIV\.\s*/gi, 'Universidad '],
  [/\bCOORD\.\s*/gi, 'Coordinación '],
  [/\bINF\.\s*/gi, 'Información '],
];

/** Siglas conocidas que siempre van en mayúscula (además de las que no tienen vocales y las que llevan números). */
const SIGLAS = new Set(['UCT', 'DGDC', 'UAS', 'DAI', 'PACE', 'CEFIC', 'CCEE', 'TI', 'RRHH', 'DDPER', 'USP', 'MINEDUC', 'CIDE', 'CFT', 'ONG',
  'PIE', 'TIC', 'SAE', 'DTI', 'CIT', 'CADE', 'PDI', 'OTEC', 'NN', 'SSHH', 'CEDETEC', 'UCTEC', 'CEETU', 'CEDIT', 'CINAP', 'MECESUP', 'LPT',
  'VRAE', 'RESPEL', 'CEDID', 'EDI', 'FONDECYT', 'ANID', 'CORFO', 'SENCE', 'FID', 'FIC', 'GORE', 'INIA', 'SAG', 'DDE', 'UACH', 'II', 'III', 'IV',
  'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);
/** Palabras que en un título van en minúscula (salvo al comienzo). */
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'a', 'al', 'por', 'para', 'con', 'sin', 'su']);
/** Adjetivos que siguen directo a un sustantivo (no llevan «de» antes): «Vicerrectoría Académica», «Oficina doble». */
const ADJETIVOS = new Set(['general', 'académica', 'académico', 'ejecutiva', 'ejecutivo', 'nacional', 'regional', 'técnica', 'técnico',
  'administrativa', 'administrativo', 'financiera', 'jurídica', 'estudiantil', 'superior', 'central', 'principal', 'cultural',
  'deportivo', 'médico', 'clínico', 'comunitario', 'universitario', 'universitaria', 'docente', 'doble', 'triple', 'cuádruple',
  'quíntuple', 'séxtuple', 'cátedra', 'taller', 'eléctrica', 'tutorial', 'multiuso', 'compartida', 'compartido', 'menor', 'mayor',
  'magna', 'abierto', 'abierta', 'común', 'privada', 'privado', 'individual', 'grupal', 'húmedo', 'seco', 'auxiliar', 'virtual',
  'interactiva', 'climatizada', 'técnicas', 'temporal']);
/** Encabezados de tipo de recinto que suelen omitir el «de»: «Sala estar» → «Sala de estar». */
const CABEZAS_TIPO = /^(Sala|Laboratorio|Hall|Taller|Bodega|Cancha|Box) (?=\p{Ll})/u;
/** Encabezados de unidad que suelen omitir el «de»: «Carrera Agronomía» → «Carrera de Agronomía». */
const CABEZAS_UNIDAD = /^(Dirección|Subdirección|Departamento|Carrera|Unidad|Coordinación|Facultad|Escuela|Instituto|Centro|Programa|Decanato) (?=\p{Lu})/u;

/** Valores que aparecen en la columna de unidad pero no son una unidad (son un estado o una nota). */
export const NO_SON_UNIDADES = /^(sin uso|no existe|no disponible|arriendo|desocupad[oa]|vac[ií]o|en obra|disponible)$/i;

/** Pone la tilde que falta: primero las palabras conocidas, luego las terminaciones que siempre la llevan. */
function tilde(palabra: string): string {
  const min = palabra.toLowerCase();
  if (TILDES[min]) return TILDES[min];
  if (/[áéíóú]/.test(min)) return min;
  for (const [fin, conTilde] of TERMINACIONES) if (fin.test(min)) return min.replace(fin, conTilde);
  return min;
}

/** Separa en palabras conservando la puntuación («SALA (IDIOMAS)», «DAI - PACE»). */
const partes = (texto: string) => texto.trim().replace(/\s+/g, ' ').split(/([\p{L}\p{N}]+)/u);

/** Sigla: conocida, corta y sin vocales («RRHH»), o letras con números («UCT2278», «CSF21»). */
const esSigla = (original: string) =>
  SIGLAS.has(original.toUpperCase()) || (/^[A-ZÑ]{2,5}$/.test(original) && !/[AEIOU]/.test(original)) || (/\p{L}/u.test(original) && /\d/.test(original));

function formatear(texto: string, titulo: boolean): string {
  let primera = true;
  const lista = partes(texto);
  const ultima = lista.map((p, i) => (/[\p{L}\p{N}]/u.test(p) ? i : -1)).filter(i => i >= 0).pop();
  return lista.map((p, i) => {
    if (!/[\p{L}\p{N}]/u.test(p)) return p;
    // Una letra sola al final distingue recintos iguales: «Sala de estar A».
    if (!primera && i === ultima && /^\p{L}$/u.test(p)) return p.toUpperCase();
    if (esSigla(p)) { primera = false; return p.toUpperCase(); }
    const w = tilde(p);
    const mayuscula = primera || (titulo && !MENORES.has(w));
    primera = false;
    return mayuscula ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }).join('');
}

/** Agrega el «de» que falta tras el encabezado, salvo que siga un adjetivo o una sigla. */
function agregarDe(texto: string, cabezas: RegExp): string {
  const m = cabezas.exec(texto);
  if (!m) return texto;
  const siguiente = texto.slice(m[0].length).split(/[\s(/-]/)[0];
  if (!siguiente || ADJETIVOS.has(siguiente.toLowerCase()) || MENORES.has(siguiente.toLowerCase()) || /\d/.test(siguiente) || siguiente === siguiente.toUpperCase()) return texto;
  return `${m[1]} de ${texto.slice(m[0].length)}`;
}

/** Tipo de recinto o uso: «SALA CATEDRA» → «Sala cátedra»; «LABORATORIO QUIMICA» → «Laboratorio de química». */
export function formatoTipo(texto?: string | null): string {
  if (!texto?.trim()) return '';
  return agregarDe(formatear(texto, false), CABEZAS_TIPO);
}

/** Unidad: «DIR.GESTION Y DESARROLLO DE CAMPUS» → «Dirección de Gestión y Desarrollo de Campus». */
export function formatoUnidad(texto?: string | null): string {
  if (!texto?.trim()) return '';
  let t = texto.trim().replace(/\s+/g, ' ');
  for (const [abreviatura, completa] of ABREVIATURAS) t = t.replace(abreviatura, completa);
  return agregarDe(formatear(t.replace(/\s+/g, ' ').trim(), true), CABEZAS_UNIDAD);
}

/** Avisos de lo que la regla no resuelve sola y conviene que revise una persona. */
export function avisosNombre(original: string, tipo: 'tipo' | 'unidad', tiposConocidos?: Set<string>): string[] {
  const avisos: string[] = [];
  const t = original.trim();
  // El sistema de origen corta los nombres en 40 caracteres.
  if (t.length === 40) avisos.push('Parece cortado (tiene justo 40 caracteres): completar el nombre');
  if (tipo === 'unidad' && NO_SON_UNIDADES.test(t)) avisos.push('No es una unidad: es un estado o una nota');
  else if (tipo === 'unidad' && tiposConocidos?.has(formatoTipo(t).toLowerCase())) avisos.push('Parece un tipo de recinto, no una unidad');
  const formateado = tipo === 'unidad' ? formatoUnidad(t) : formatoTipo(t);
  if (/\b\p{L}{1,5}\.(?=\s|$)/u.test(formateado)) avisos.push('Queda una abreviatura');
  if (/\?/.test(t)) avisos.push('Tiene signos de duda');
  return avisos;
}
