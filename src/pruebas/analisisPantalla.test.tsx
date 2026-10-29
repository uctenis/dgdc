import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type { FilaAnalisis } from '../utils/analisisEspacios';

const fila = (codigo: string, extra: Partial<FilaAnalisis>): FilaAnalisis => ({
  id: codigo, campus: 'CJP', campusNombre: 'Campus San Juan Pablo II', edificio: 'CJP08', edificioNombre: 'EDIFICIO 8', piso: 'Piso 3', pisoOrden: 3,
  codigo, tipo: 'SALA CATEDRA', uso: 'SALA', unidades: ['CARRERA DE DERECHO'], clase: 'Útil', estado: 'Operativo', util: 50, oguc: 55, capacidad: 40, ocupantes: [], ...extra,
});
vi.mock('../services/analisisEspacios', () => ({
  cargarDatosAnalisis: async () => ({
    filas: [
      fila('CJP08_301', {}),
      fila('CJP08_302', { util: 60, oguc: 66 }),
      fila('CJP08_310', { tipo: 'OFICINA', util: 12, oguc: 13, capacidad: 0, ocupantes: [{ nombre: 'PÉREZ, ANA', cargo: 'SECRETARIA' }] }),
      fila('CJP08_201', { piso: 'Piso 2', pisoOrden: 2, tipo: 'OFICINA', util: 20, oguc: 22, capacidad: 0 }),
      fila('CJP01_101', { edificio: 'CJP01', edificioNombre: 'EDIFICIO 1', piso: 'Piso 1', pisoOrden: 1, util: 70, oguc: 77 }),
    ],
    nombresEdificio: { CJP08: 'EDIFICIO 8', CJP01: 'EDIFICIO 1' },
    leidoEn: new Date(),
  }),
}));

import { AnalisisEspacios } from '../components/AnalisisEspacios';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function montar(consulta: object) {
  const contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  const raiz = createRoot(contenedor);
  const url = `/espacios?seccion=analisis&consulta=${encodeURIComponent(JSON.stringify(consulta))}`;
  await act(async () => { raiz.render(<MemoryRouter initialEntries={[url]}><AnalisisEspacios onAbrirRecinto={() => {}} onCerrar={() => {}} /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return { contenedor, desmontar: () => act(() => raiz.unmount()) };
}

describe('pantalla de consultas y análisis', () => {
  it('responde «salas del piso 3 de CJP08» con frase, cifras, ranking, composición, cruce y detalle', async () => {
    const { contenedor, desmontar } = await montar({ f: { edificio: ['CJP08'], piso: ['Piso 3'], tipo: ['SALA CATEDRA'] }, g: 'tipo', m: 'util', cf: 'piso', cc: 'tipo' });
    const texto = contenedor.textContent || '';
    expect(texto).toContain('En CJP08 Edificio 8 · Piso 3 hay 2 recintos de tipo SALA CATEDRA, que suman 110 m² útiles (121 m² OGUC)');
    expect(texto).toContain('Superficie útil');
    expect(texto).toContain('Cómo se reparte');
    expect(texto).toContain('Cruce');
    expect(texto).toContain('Recintos (2)');
    expect(contenedor.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(2);
    await desmontar();
  });

  it('una pregunta frecuente arma la consulta con un clic', async () => {
    const { contenedor, desmontar } = await montar({ f: { edificio: ['CJP08'] } });
    const boton = [...contenedor.querySelectorAll('button')].find(b => b.textContent?.startsWith('¿Cómo se reparten oficinas y salas'));
    expect(boton).toBeTruthy();
    await act(async () => { boton!.click(); });
    expect(contenedor.textContent).toContain('de tipo OFICINA, SALA CATEDRA');
    await desmontar();
  });
});
