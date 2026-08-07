import type { Proveedor, LicitacionProyecto, Cotizacion, ConfiguracionFirmas } from '../types';
import { INITIAL_PROVEEDORES, INITIAL_LICITACIONES, INITIAL_COTIZACIONES, INITIAL_CONFIG_FIRMAS } from '../data/initialData';

const KEYS = {
  PROVEEDORES: 'infra_app_proveedores_v1',
  LICITACIONES: 'infra_app_licitaciones_v1',
  COTIZACIONES: 'infra_app_cotizaciones_v1',
  CONFIG_FIRMAS: 'infra_app_config_firmas_v1',
};

export const storageService = {
  // PROVEEDORES
  getProveedores(): Proveedor[] {
    const data = localStorage.getItem(KEYS.PROVEEDORES);
    if (!data) {
      this.saveProveedores(INITIAL_PROVEEDORES);
      return INITIAL_PROVEEDORES;
    }
    return JSON.parse(data);
  },

  saveProveedores(proveedores: Proveedor[]): void {
    localStorage.setItem(KEYS.PROVEEDORES, JSON.stringify(proveedores));
  },

  addProveedor(proveedor: Omit<Proveedor, 'id' | 'fechaRegistro'>): Proveedor {
    const proveedores = this.getProveedores();
    const newProveedor: Proveedor = {
      ...proveedor,
      id: 'prov-' + Date.now(),
      fechaRegistro: new Date().toISOString().split('T')[0],
    };
    proveedores.unshift(newProveedor);
    this.saveProveedores(proveedores);
    return newProveedor;
  },

  updateProveedor(id: string, updated: Partial<Proveedor>): void {
    const proveedores = this.getProveedores().map(p => (p.id === id ? { ...p, ...updated } : p));
    this.saveProveedores(proveedores);
  },

  deleteProveedor(id: string): void {
    const proveedores = this.getProveedores().filter(p => p.id !== id);
    this.saveProveedores(proveedores);
  },

  // LICITACIONES
  getLicitaciones(): LicitacionProyecto[] {
    const data = localStorage.getItem(KEYS.LICITACIONES);
    if (!data) {
      this.saveLicitaciones(INITIAL_LICITACIONES);
      return INITIAL_LICITACIONES;
    }
    return JSON.parse(data);
  },

  saveLicitaciones(licitaciones: LicitacionProyecto[]): void {
    localStorage.setItem(KEYS.LICITACIONES, JSON.stringify(licitaciones));
  },

  addLicitacion(licitacion: Omit<LicitacionProyecto, 'id'>): LicitacionProyecto {
    const licitaciones = this.getLicitaciones();
    const newLicitacion: LicitacionProyecto = {
      ...licitacion,
      id: 'lic-' + Date.now(),
    };
    licitaciones.unshift(newLicitacion);
    this.saveLicitaciones(licitaciones);
    return newLicitacion;
  },

  updateLicitacion(id: string, updated: Partial<LicitacionProyecto>): void {
    const licitaciones = this.getLicitaciones().map(l => (l.id === id ? { ...l, ...updated } : l));
    this.saveLicitaciones(licitaciones);
  },

  deleteLicitacion(id: string): void {
    const licitaciones = this.getLicitaciones().filter(l => l.id !== id);
    this.saveLicitaciones(licitaciones);
    // Eliminar también las cotizaciones asociadas
    const cotizaciones = this.getCotizaciones().filter(c => c.licitacionId !== id);
    this.saveCotizaciones(cotizaciones);
  },

  // COTIZACIONES
  getCotizaciones(): Cotizacion[] {
    const data = localStorage.getItem(KEYS.COTIZACIONES);
    if (!data) {
      this.saveCotizaciones(INITIAL_COTIZACIONES);
      return INITIAL_COTIZACIONES;
    }
    return JSON.parse(data);
  },

  getCotizacionesPorLicitacion(licitacionId: string): Cotizacion[] {
    return this.getCotizaciones().filter(c => c.licitacionId === licitacionId);
  },

  saveCotizaciones(cotizaciones: Cotizacion[]): void {
    localStorage.setItem(KEYS.COTIZACIONES, JSON.stringify(cotizaciones));
  },

  addCotizacion(cotizacion: Omit<Cotizacion, 'id' | 'fechaCarga'>): Cotizacion {
    const cotizaciones = this.getCotizaciones();
    const newCotizacion: Cotizacion = {
      ...cotizacion,
      id: 'cot-' + Date.now(),
      fechaCarga: new Date().toISOString().split('T')[0],
    };
    cotizaciones.push(newCotizacion);
    this.saveCotizaciones(cotizaciones);
    return newCotizacion;
  },

  updateCotizacion(id: string, updated: Partial<Cotizacion>): void {
    const cotizaciones = this.getCotizaciones().map(c => (c.id === id ? { ...c, ...updated } : c));
    this.saveCotizaciones(cotizaciones);
  },

  deleteCotizacion(id: string): void {
    const cotizaciones = this.getCotizaciones().filter(c => c.id !== id);
    this.saveCotizaciones(cotizaciones);
  },

  // CONFIGURACIÓN FIRMAS
  getConfigFirmas(): ConfiguracionFirmas {
    const data = localStorage.getItem(KEYS.CONFIG_FIRMAS);
    if (!data) {
      this.saveConfigFirmas(INITIAL_CONFIG_FIRMAS);
      return INITIAL_CONFIG_FIRMAS;
    }
    return JSON.parse(data);
  },

  saveConfigFirmas(config: ConfiguracionFirmas): void {
    localStorage.setItem(KEYS.CONFIG_FIRMAS, JSON.stringify(config));
  },

  resetAllData(): void {
    localStorage.clear();
  },
};
