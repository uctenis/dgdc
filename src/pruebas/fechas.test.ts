import { describe, expect, it } from 'vitest';
import { formatoFecha } from '../utils/fechas';

const DIA = { day: 'numeric', month: 'numeric', year: 'numeric' } as const;

describe('fechas para mostrar', () => {
  it('un día sin hora se muestra ese mismo día, no el anterior', () => {
    expect(formatoFecha('2026-03-10', DIA)).toBe(new Date(2026, 2, 10).toLocaleDateString('es-CL', DIA));
  });

  it('una medianoche UTC (como queda un día tras toISOString) también se muestra ese día', () => {
    expect(formatoFecha('2026-03-10T00:00:00.000Z', DIA)).toBe(new Date(2026, 2, 10).toLocaleDateString('es-CL', DIA));
  });

  it('un instante con hora se respeta tal cual', () => {
    const instante = '2026-03-10T15:30:00.000Z';
    expect(formatoFecha(instante, DIA)).toBe(new Date(instante).toLocaleDateString('es-CL', DIA));
  });

  it('sin fecha, o con un texto que no es fecha, muestra el reemplazo', () => {
    expect(formatoFecha(undefined)).toBe('—');
    expect(formatoFecha('')).toBe('—');
    expect(formatoFecha('no es fecha', undefined, 'sin fecha')).toBe('sin fecha');
  });
});
