// Gestión de Rubros de Proveedores con Persistencia en LocalStorage

export interface RubroProveedor {
  id: string;
  nombre: string;
  descripcion?: string;
  estado: 'Activo' | 'Inactivo';
}

const STORAGE_KEY = 'infra_app_rubros_v1';

export const INITIAL_RUBROS: RubroProveedor[] = [
  { id: 'rub-01', nombre: 'Obras Menores y Remodelaciones', descripcion: 'Remodelaciones generales, terminaciones y pintura', estado: 'Activo' },
  { id: 'rub-02', nombre: 'Climatización y Electricidad', descripcion: 'Instalación de HVAC, cableado eléctrico y tableros', estado: 'Activo' },
  { id: 'rub-03', nombre: 'Obras Civiles y Tabiquería', descripcion: 'Hormigón, estructuras soportantes y tabiques vulcometal', estado: 'Activo' },
  { id: 'rub-04', nombre: 'Pintura e Iluminación', descripcion: 'Pintura interior/exterior, luminarias LED e instalaciones', estado: 'Activo' },
  { id: 'rub-05', nombre: 'Carpintería y Estructuras', descripcion: 'Mueblería institucional, puertas, ventanas y cubiertas', estado: 'Activo' },
  { id: 'rub-06', nombre: 'Sanitario y Plomería', descripcion: 'Redes de agua potable, alcantarillado y grifería', estado: 'Activo' },
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
