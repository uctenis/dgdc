import { guardarConfigCompartida } from '../services/configCompartida';
export interface TipoObraInfo {
  id: string;
  nombre: string;
  descripcion?: string;
  estado: 'Activo' | 'Inactivo';
  /** Rubros de proveedor que suelen ejecutar este tipo de obra (nombres del catálogo de rubrosData);
   * el PRIMERO es el principal y se preselecciona al elegir el tipo. Vacío = cualquier rubro. */
  rubrosSugeridos?: string[];
}

// Nombres de rubros (deben coincidir con rubrosData.ts).
const R = {
  civiles: 'Obras Civiles y Estructuras',
  electricas: 'Instalaciones Eléctricas',
  sanitarias: 'Instalaciones Sanitarias y Gas',
  clima: 'Climatización y Ventilación (HVAC)',
  terminaciones: 'Tabiquería, Cielos y Terminaciones',
  carpinteria: 'Carpintería, Puertas y Ventanas',
  materiales: 'Áridos, Materiales y Ferretería',
  maquinaria: 'Arriendo de Maquinaria y Equipos',
  consultoria: 'Consultoría y Especialidades',
  mobiliario: 'Equipamiento y Mobiliario',
  senaletica: 'Diseño, Señalética y Demarcaciones',
  exteriores: 'Obras Exteriores, Pavimentos y Paisajismo',
  cubiertas: 'Cubiertas e Impermeabilización',
};

export const INITIAL_TIPOS_OBRA: TipoObraInfo[] = [
  { id: 'tipo-1', nombre: 'OBRA NUEVA', estado: 'Activo', descripcion: 'Construcciones y edificaciones nuevas desde cimientos', rubrosSugeridos: [R.civiles, R.electricas, R.sanitarias, R.clima] },
  // Aumento de obra: lo ejecuta el mismo contratista del contrato original → sin sugerencia fija.
  { id: 'tipo-2', nombre: 'AUMENTO DE OBRA', estado: 'Activo', descripcion: 'Obras adicionales o aumentos de contrato sobre un proyecto ya adjudicado (mismo rubro del contrato original)', rubrosSugeridos: [] },
  { id: 'tipo-3', nombre: 'AMPLIACION', estado: 'Activo', descripcion: 'Ampliación de superficie o dependencias existentes', rubrosSugeridos: [R.civiles, R.terminaciones, R.cubiertas] },
  { id: 'tipo-4', nombre: 'REMODELACION', estado: 'Activo', descripcion: 'Remodelaciones y redistribución de recintos', rubrosSugeridos: [R.terminaciones, R.carpinteria, R.electricas, R.cubiertas] },
  { id: 'tipo-5', nombre: 'AREAS VERDES', estado: 'Activo', descripcion: 'Paisajismo, jardines y riego', rubrosSugeridos: [R.exteriores] },
  { id: 'tipo-13', nombre: 'OBRAS EXTERIORES', estado: 'Activo', descripcion: 'Pavimentos, veredas, estacionamientos, cierres perimetrales y aguas lluvia', rubrosSugeridos: [R.exteriores, R.civiles, R.senaletica] },
  { id: 'tipo-6', nombre: 'ALHAJAMIENTO', estado: 'Activo', descripcion: 'Mobiliario y equipamiento de espacios ya construidos (instalación incluida)', rubrosSugeridos: [R.mobiliario, R.carpinteria] },
  { id: 'tipo-7', nombre: 'REGULARIZACION', estado: 'Activo', descripcion: 'Regularización ante Dirección de Obras Municipales', rubrosSugeridos: [R.consultoria] },
  { id: 'tipo-8', nombre: 'COMPRA ELEMENTOS', estado: 'Activo', descripcion: 'Adquisición directa de materiales o insumos, sin obra de instalación asociada', rubrosSugeridos: [R.materiales, R.mobiliario] },
  { id: 'tipo-9', nombre: 'DEMOLICION', estado: 'Activo', descripcion: 'Desarme y demolición de estructuras', rubrosSugeridos: [R.civiles, R.maquinaria] },
  // Instalaciones es amplio: se sugieren las especialidades pero el usuario elige (sin preselección).
  { id: 'tipo-10', nombre: 'INSTALACIONES', estado: 'Activo', descripcion: 'Obras eléctricas, sanitarias, climatización y redes (elegir la especialidad)', rubrosSugeridos: [R.electricas, R.sanitarias, R.clima] },
  { id: 'tipo-11', nombre: 'DISEÑO', estado: 'Activo', descripcion: 'Diseño arquitectónico, de ingeniería, eléctrico u otras especialidades (etapa de proyecto, sin ejecución de obra)', rubrosSugeridos: [R.consultoria, R.senaletica] },
  { id: 'tipo-12', nombre: 'OTROS', estado: 'Activo', descripcion: 'Obras especiales y requerimientos generales', rubrosSugeridos: [] },
];

/** Tipos con varias especialidades igual de probables: se sugieren, pero no se preselecciona ninguna. */
const TIPOS_SIN_PRESELECCION = new Set(['INSTALACIONES']);

/** Completa las listas ya guardadas en el navegador con lo nuevo del catálogo base (tipos agregados y
 * rubros sugeridos de tipos que aún no los tenían), sin pisar lo que el usuario editó. */
function completarConCatalogo(lista: TipoObraInfo[]): TipoObraInfo[] {
  let cambio = false;
  const porId = new Map(INITIAL_TIPOS_OBRA.map(t => [t.id, t]));
  const porNombre = new Map(INITIAL_TIPOS_OBRA.map(t => [t.nombre.toUpperCase(), t]));
  const completada = lista.map(t => {
    const base = porId.get(t.id) || porNombre.get(t.nombre.toUpperCase());
    if (t.rubrosSugeridos === undefined && base?.rubrosSugeridos) {
      cambio = true;
      return { ...t, rubrosSugeridos: base.rubrosSugeridos };
    }
    return t;
  });
  const ids = new Set(lista.map(t => t.id));
  const nombres = new Set(lista.map(t => t.nombre.toUpperCase()));
  const faltantes = INITIAL_TIPOS_OBRA.filter(t => !ids.has(t.id) && !nombres.has(t.nombre.toUpperCase()));
  if (faltantes.length) cambio = true;
  return cambio ? [...completada, ...faltantes] : lista;
}

/** Rubros sugeridos para un tipo de obra (primero el principal). */
export function obtenerRubrosSugeridos(tipoObra?: string): string[] {
  if (!tipoObra) return [];
  const tipo = getTiposObraList().find(t => t.nombre.toUpperCase() === tipoObra.trim().toUpperCase());
  return tipo?.rubrosSugeridos || [];
}

/** Rubro que se preselecciona al elegir el tipo de obra (undefined si no corresponde preseleccionar). */
export function obtenerRubroPrincipal(tipoObra?: string): string | undefined {
  if (!tipoObra || TIPOS_SIN_PRESELECCION.has(tipoObra.trim().toUpperCase())) return undefined;
  return obtenerRubrosSugeridos(tipoObra)[0];
}

const STORAGE_KEY = 'infra_app_tipos_obra_v2';

export function getTiposObraList(): TipoObraInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TIPOS_OBRA));
      return INITIAL_TIPOS_OBRA;
    }
    const lista: TipoObraInfo[] = JSON.parse(raw);
    const completa = completarConCatalogo(lista);
    if (completa !== lista) guardarConfigCompartida(STORAGE_KEY, completa);
    return completa;
  } catch {
    return INITIAL_TIPOS_OBRA;
  }
}

export function saveTiposObraList(list: TipoObraInfo[]): void {
  try {
    guardarConfigCompartida(STORAGE_KEY, list);
  } catch (e) {
    console.error('Error al guardar tipos de obra:', e);
  }
}

export function getTiposObraNombres(): string[] {
  return getTiposObraList()
    .filter(t => t.estado === 'Activo')
    .map(t => t.nombre);
}

/**
 * Rubro a usar al cambiar el Tipo de Obra: si el rubro actual está vacío o era el principal
 * sugerido del tipo anterior (o sea, lo puso el sistema), se reemplaza por el principal del nuevo
 * tipo; si el usuario eligió otro a mano, se respeta.
 */
export function rubroAlCambiarTipo(tipoAnterior: string | undefined, tipoNuevo: string, rubroActual: string | undefined): string {
  const principalAnterior = obtenerRubroPrincipal(tipoAnterior);
  const puestoPorSistema = !rubroActual || rubroActual === principalAnterior;
  if (!puestoPorSistema) return rubroActual || '';
  return obtenerRubroPrincipal(tipoNuevo) || '';
}
