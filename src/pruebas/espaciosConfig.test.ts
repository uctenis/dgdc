import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/configCompartida', () => ({ guardarConfigCompartida: (clave: string, datos: unknown) => localStorage.setItem(clave, JSON.stringify(datos)) }));

import { CLAVE_CONFIG_ESPACIOS, getConfigEspacios, PARAMETROS_POR_DEFECTO, saveConfigEspacios, tipoConfigurado } from '../data/espaciosConfig';
import { alertasRecinto } from '../utils/alertasRecinto';

// Almacenamiento en memoria (el entorno de pruebas no trae localStorage).
const memoria = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, v),
  removeItem: (k: string) => void memoria.delete(k),
});

describe('configuración del Gestor de Espacios', () => {
  beforeEach(() => memoria.clear());

  it('sin configuración guardada usa listas vacías y los parámetros por defecto', () => {
    expect(getConfigEspacios()).toEqual({ tipos: [], usos: [], unidades: [], parametros: PARAMETROS_POR_DEFECTO });
  });

  it('completa los parámetros que falten y encuentra el tipo sin distinguir mayúsculas', () => {
    memoria.set(CLAVE_CONFIG_ESPACIOS, JSON.stringify({ tipos: [{ nombre: 'OFICINA', color: '#0f766e', clase: 'Útil' }], parametros: { factorOguc: 2 } }));
    const c = getConfigEspacios();
    expect(c.parametros).toEqual({ ...PARAMETROS_POR_DEFECTO, factorOguc: 2 });
    expect(tipoConfigurado(' oficina ')?.color).toBe('#0f766e');
    expect(tipoConfigurado('Bodega')).toBeUndefined();
  });

  it('las alertas usan los umbrales configurados', () => {
    const recinto = { codigo: 'X_1', edificio_codigo: 'X', nombre: 'OFICINA', estado: 'Operativo' as const, observaciones: null, superficie_m2: 10, superficie_oguc_m2: 17 };
    expect(alertasRecinto(recinto)).toHaveLength(1);   // 17 > 10 × 1,6 y la diferencia supera 3 m²
    saveConfigEspacios({ ...getConfigEspacios(), parametros: { ...PARAMETROS_POR_DEFECTO, factorOguc: 1.8 } });
    expect(alertasRecinto(recinto)).toHaveLength(0);
  });
});
