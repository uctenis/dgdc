// Gestión de Rubros de Proveedores con Persistencia en LocalStorage

export interface RubroProveedor {
  id: string;
  nombre: string;
  descripcion?: string;
  estado: 'Activo' | 'Inactivo';
}

const STORAGE_KEY = 'infra_app_rubros_v3';

export const INITIAL_RUBROS: RubroProveedor[] = [
  { id: 'rub-01', nombre: 'Obras Civiles y Estructuras', descripcion: 'Hormigón, fundaciones y movimiento de tierra', estado: 'Activo' },
  { id: 'rub-02', nombre: 'Instalaciones Eléctricas', descripcion: 'Cableado, tableros, corrientes débiles e iluminación', estado: 'Activo' },
  { id: 'rub-03', nombre: 'Instalaciones Sanitarias y Gas', descripcion: 'Agua potable, alcantarillado, gasfitería y gas', estado: 'Activo' },
  { id: 'rub-04', nombre: 'Climatización y Ventilación (HVAC)', descripcion: 'Instalación y mantención de equipos de climatización', estado: 'Activo' },
  { id: 'rub-05', nombre: 'Tabiquería, Cielos y Terminaciones', descripcion: 'Drywall, pintura, pisos y revestimientos', estado: 'Activo' },
  { id: 'rub-06', nombre: 'Carpintería, Puertas y Ventanas', descripcion: 'Madera, aluminio, PVC y cubiertas', estado: 'Activo' },
  { id: 'rub-07', nombre: 'Áridos, Materiales y Ferretería', descripcion: 'Suministro de insumos de construcción', estado: 'Activo' },
  { id: 'rub-08', nombre: 'Arriendo de Maquinaria y Equipos', descripcion: 'Arriendo de maquinaria pesada y equipos de obra', estado: 'Activo' },
  { id: 'rub-09', nombre: 'Servicios Generales', descripcion: 'Aseo, jardinería, seguridad y extinción de incendios', estado: 'Activo' },
  { id: 'rub-10', nombre: 'Consultoría y Especialidades', descripcion: 'Arquitectura, ingeniería, topografía y diseño', estado: 'Activo' },
  { id: 'rub-11', nombre: 'Equipamiento y Mobiliario', descripcion: 'Equipamiento deportivo, mobiliario institucional y de laboratorio', estado: 'Activo' },
  { id: 'rub-12', nombre: 'Diseño, Señalética y Demarcaciones', descripcion: 'Diseño gráfico, señalética institucional y demarcación de pavimentos/pisos', estado: 'Activo' },
];

export function getRubrosList(): RubroProveedor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_RUBROS));
      return INITIAL_RUBROS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return INITIAL_RUBROS;
  } catch (e) {
    console.error('Error leyendo rubros de proveedores:', e);
    return INITIAL_RUBROS;
  }
}

export function saveRubrosList(list: RubroProveedor[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Error guardando rubros de proveedores:', e);
  }
}

export function addRubro(nuevo: Omit<RubroProveedor, 'id'>): RubroProveedor[] {
  const current = getRubrosList();
  const item: RubroProveedor = {
    ...nuevo,
    id: `rub-${Date.now()}`,
  };
  const updated = [...current, item];
  saveRubrosList(updated);
  return updated;
}

export function updateRubro(id: string, datos: Partial<Omit<RubroProveedor, 'id'>>): RubroProveedor[] {
  const current = getRubrosList();
  const updated = current.map(r => (r.id === id ? { ...r, ...datos } : r));
  saveRubrosList(updated);
  return updated;
}

export function deleteRubro(id: string): RubroProveedor[] {
  const current = getRubrosList();
  const updated = current.filter(r => r.id !== id);
  saveRubrosList(updated);
  return updated;
}
