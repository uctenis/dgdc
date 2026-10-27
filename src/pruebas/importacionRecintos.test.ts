import { describe, expect, it } from 'vitest';
import {
  asignarAutomatico, datosDePiso, DATOS_PERSONALES, detectarFilaEncabezado, numero, revisarFilas, sinTildes,
} from '../utils/importacionRecintos';

// Planilla inventada con las particularidades del catastro real: títulos arriba del encabezado, una fila por
// ocupante (código repetido), celdas con guion, recintos que ya no existen y datos de personas.
const FILAS = [
  ['CATASTRO INFRAESTRUCTURA', '', '', '', '', '', '', '', ''],
  ['', 'FILTRO EDIFICIOS', '', '', '', '', '', '', ''],
  ['CAMPUS', 'EDIFICIO', 'PISO', 'CODIGO ACTUAL', 'EXISTE', 'TIPO INFRA', 'NOMBRE PERSONA', 'RUT', 'INTERNA RECINTO', 'OGUC RECINTO', 'UNIDAD'],
  ['CML', 'CML01', '1', 'CML01_100', '1', 'BODEGA', '-', '-', '43,03', '46.58', '-'],
  ['CML', 'CML01', '1', 'CML01_101', '1', 'OFICINA', 'PÉREZ, ANA', '11.111.111-1', '12.5', '13', 'CONTABILIDAD'],
  ['CML', 'CML01', '1', 'CML01_101', '1', 'OFICINA', 'SOTO, LUIS', '22.222.222-2', '12.5', '13', 'CONTABILIDAD'],
  ['CML', 'CML01', '2', 'CML01_200', '0', 'SALA', '', '', '30', '33', ''],
  ['CML', 'CML01', '2', 'CML01_201', '1', '', '', '', 'n/d', '', ''],
  ['CDS', 'CDS01', '-1', 'CDS01_001', '1', 'BAÑO', '', '', '4', '5', ''],
];

describe('importador de recintos', () => {
  it('encuentra la fila de encabezados aunque arriba haya títulos y filtros', () => {
    expect(detectarFilaEncabezado(FILAS)).toBe(3);
  });

  it('asigna solo las columnas reconocibles', () => {
    const a = asignarAutomatico(FILAS[2]);
    expect(a).toMatchObject({ edificio: 1, piso: 2, codigo: 3, existe: 4, nombre: 5, superficie_m2: 8, superficie_oguc_m2: 9, unidad_usuaria: 10 });
  });

  it('revisa cada fila: repetidas por ocupante, eliminados, guiones y datos faltantes', () => {
    const encabezados = FILAS[2];
    const r = revisarFilas(encabezados, FILAS.slice(3), 3, asignarAutomatico(encabezados), { edificioPorDefecto: 'X', guardarResto: true, incluirDatosPersonales: false });
    const porCodigo = (c: string) => r.filter(x => x.recinto.codigo === c);
    // Mismo código dos veces (dos ocupantes): la segunda fila se omite sin ser error.
    expect(porCodigo('CML01_101').map(x => x.repetida)).toEqual([false, true]);
    // EXISTE = 0 queda como recinto eliminado.
    expect(porCodigo('CML01_200')[0].recinto.estado).toBe('Eliminado');
    // Sin nombre ni uso: no se carga; la superficie "n/d" se avisa.
    expect(porCodigo('CML01_201')[0].problemasGraves).toEqual(['sin nombre']);
    expect(porCodigo('CML01_201')[0].avisos).toContain('superficie no numérica');
    // Superficies con coma o punto decimal, y un guion cuenta como vacío.
    expect(porCodigo('CML01_100')[0].recinto).toMatchObject({ superficie_m2: 43.03, superficie_oguc_m2: 46.58, unidad_usuaria: null });
    // Cada fila conserva su edificio.
    expect(porCodigo('CDS01_001')[0].edificio).toBe('CDS01');
  });

  it('no guarda datos de personas salvo que se pida', () => {
    const encabezados = FILAS[2];
    const opciones = { edificioPorDefecto: 'X', guardarResto: true };
    const sin = revisarFilas(encabezados, FILAS.slice(4, 5), 3, asignarAutomatico(encabezados), { ...opciones, incluirDatosPersonales: false });
    expect(Object.keys(sin[0].recinto.atributos)).toEqual(['CAMPUS']);
    const con = revisarFilas(encabezados, FILAS.slice(4, 5), 3, asignarAutomatico(encabezados), { ...opciones, incluirDatosPersonales: true });
    expect(con[0].recinto.atributos).toMatchObject({ 'NOMBRE PERSONA': 'PÉREZ, ANA', RUT: '11.111.111-1' });
    expect(DATOS_PERSONALES.test(sinTildes('Nombre Persona'))).toBe(true);
  });

  it('lee números con coma o punto decimal y nombra los pisos', () => {
    expect([numero('1.234,5'), numero('12,5'), numero('12.5'), numero('-'), numero('abc'), numero('20 m2')]).toEqual([1234.5, 12.5, 12.5, null, null, 20]);
    expect(datosDePiso('1')).toEqual({ nombre: 'Piso 1', orden: 1 });
    expect(datosDePiso('-2')).toEqual({ nombre: 'Subterráneo 2', orden: -2 });
    expect(datosDePiso('ENT').nombre).toBe('Piso ENT');
  });
});
