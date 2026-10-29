import { describe, expect, it } from 'vitest';
import { avisosNombre, formatoTipo, formatoUnidad } from '../utils/formatoNombres';

describe('formato de nombres (criterio RAE)', () => {
  it('tipos de recinto: mayúscula inicial, tildes y el «de» que falta', () => {
    expect(formatoTipo('SALA CATEDRA')).toBe('Sala cátedra');
    expect(formatoTipo('SALA REUNIONES')).toBe('Sala de reuniones');
    expect(formatoTipo('HALL RECEPCION')).toBe('Hall de recepción');
    expect(formatoTipo('LABORATORIO QUÍMICA')).toBe('Laboratorio de química');
    expect(formatoTipo('CANCHA FUTBOL')).toBe('Cancha de fútbol');
    expect(formatoTipo('OFICINA QUINTUPLE')).toBe('Oficina quíntuple');
    expect(formatoTipo('SALA ESTAR A')).toBe('Sala de estar A');
    expect(formatoTipo('OFICINA CCEE')).toBe('Oficina CCEE');
    expect(formatoTipo('GARITA 3 EL BOSQUE CSF21')).toBe('Garita 3 el bosque CSF21');
    expect(formatoTipo('LABORATORIO COMPUTACION (IDIOMAS)')).toBe('Laboratorio de computación (idiomas)');
    expect(formatoTipo('BAÑO')).toBe('Baño');
  });

  it('unidades: formato título, abreviaturas completas y siglas', () => {
    expect(formatoUnidad('DIR.GESTION Y DESARROLLO DE CAMPUS')).toBe('Dirección de Gestión y Desarrollo de Campus');
    expect(formatoUnidad('DIR. GESTIÓN Y DESARROLLO DE CAMPUS')).toBe('Dirección de Gestión y Desarrollo de Campus');
    expect(formatoUnidad('DEPTO. DE CS. VETERINARIAS Y SALUD PUBLICA')).toBe('Departamento de Ciencias Veterinarias y Salud Pública');
    expect(formatoUnidad('CARRERA ING.EN PREVENCION DE RIESGOS')).toBe('Carrera de Ingeniería en Prevención de Riesgos');
    expect(formatoUnidad('CARRERA ING. REC. NATURALES')).toBe('Carrera de Ingeniería en Recursos Naturales');
    expect(formatoUnidad('VICERRECTORIA ACADEMICA')).toBe('Vicerrectoría Académica');
    expect(formatoUnidad('DIRECCION GENERAL DE DOCENCIA')).toBe('Dirección General de Docencia');
    expect(formatoUnidad('DAI - PACE')).toBe('DAI - PACE');
    expect(formatoUnidad('USP PACE 2022 UCT2278')).toBe('USP PACE 2022 UCT2278');
    expect(formatoUnidad('DIREC. ASUNT. EST.')).toBe('Dirección de Asuntos Estudiantiles');
  });

  it('avisa lo que necesita una persona', () => {
    expect(avisosNombre('DEPARTAMENTO DE CIENCIAS MATEMATICAS Y F', 'unidad')[0]).toMatch(/cortado/);
    expect(avisosNombre('SIN USO', 'unidad')).toEqual(['No es una unidad: es un estado o una nota']);
    expect(avisosNombre('SALA DE REUNIONES', 'unidad', new Set(['sala de reuniones']))).toEqual(['Parece un tipo de recinto, no una unidad']);
    expect(avisosNombre('CARRERA DE MEDICINA', 'unidad')).toEqual([]);
  });
});
