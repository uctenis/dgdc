/**
 * Calcula el Dígito Verificador (DV) esperado según el algoritmo chileno Módulo 11.
 */
export function calcularDV(rutBody: string): string {
  const clean = String(rutBody).replace(/[^0-9]/g, '');
  if (!clean) return '';
  let sum = 0;
  let mul = 2;
  for (let i = clean.length - 1; i >= 0; i--) {
    sum += parseInt(clean.charAt(i), 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  if (res === 11) return '0';
  if (res === 10) return 'K';
  return String(res);
}

/**
 * Formatea un RUT con separador de miles (puntos) y guion cuando el usuario ingresa el DV.
 * NO auto-genera el DV (el usuario ingresa el DV manualmente).
 * 
 * Ejemplos:
 *  '76892410'    → '76.892.410'      (sin DV automático)
 *  '768924104'   → '76.892.410-4'    (con DV ingresado)
 *  '76.892.410-4'→ '76.892.410-4'
 *  '76892410K'   → '76.892.410-K'
 */
export function formatearRUT(rawInput: string): string {
  if (!rawInput) return '';

  const rawClean = String(rawInput).trim();
  const hasExplicitHyphen = rawClean.includes('-');

  // Si el usuario ingresó un guion explícito
  if (hasExplicitHyphen) {
    const parts = rawClean.split('-');
    const bodyDigits = parts[0].replace(/[^0-9]/g, '');
    const dvPart = parts[1] ? parts[1].replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 1) : '';

    if (!bodyDigits) return dvPart ? '-' + dvPart : '';
    const bodyFormatted = new Intl.NumberFormat('es-CL').format(Number(bodyDigits));
    return dvPart ? `${bodyFormatted}-${dvPart}` : bodyFormatted;
  }

  // Si no hay guion explícito:
  const clean = rawClean.replace(/[^0-9kK]/g, '');
  if (!clean) return '';

  const hasK = clean.toUpperCase().endsWith('K');
  const digitsOnly = clean.replace(/[^0-9]/g, '');

  if (hasK) {
    const bodyDigits = clean.slice(0, -1).replace(/[^0-9]/g, '');
    if (!bodyDigits) return 'K';
    const bodyFormatted = new Intl.NumberFormat('es-CL').format(Number(bodyDigits));
    return `${bodyFormatted}-K`;
  }

  // Si se ingresaron 9 o 10 dígitos (cuerpo 7 u 8 dígitos + 1 dígito DV)
  if (digitsOnly.length === 9) {
    const bodyDigits = digitsOnly.slice(0, 8);
    const dvPart = digitsOnly.slice(8);
    const bodyFormatted = new Intl.NumberFormat('es-CL').format(Number(bodyDigits));
    return `${bodyFormatted}-${dvPart}`;
  } else if (digitsOnly.length === 8 && digitsOnly.startsWith('1') && digitsOnly.length > 8) {
    const bodyDigits = digitsOnly.slice(0, 7);
    const dvPart = digitsOnly.slice(7);
    const bodyFormatted = new Intl.NumberFormat('es-CL').format(Number(bodyDigits));
    return `${bodyFormatted}-${dvPart}`;
  }

  if (!digitsOnly) return '';
  const bodyFormatted = new Intl.NumberFormat('es-CL').format(Number(digitsOnly));
  return bodyFormatted;
}

export const formatearRut = formatearRUT;

/**
 * Valida si un RUT ingresado es matemáticamente válido con su DV (Módulo 11).
 */
export function validarRUT(rutCompleto: string): { esValido: boolean; mensaje: string; dvEsperado?: string } {
  if (!rutCompleto) return { esValido: false, mensaje: '' };

  const clean = rutCompleto.replace(/[^0-9kK]/g, '');
  if (clean.length < 8) return { esValido: false, mensaje: 'Ingrese el RUT completo con dígito verificador' };

  let body = '';
  let dv = '';

  if (rutCompleto.includes('-')) {
    const parts = rutCompleto.split('-');
    body = parts[0].replace(/[^0-9]/g, '');
    dv = parts[1] ? parts[1].trim().toUpperCase() : '';
  } else {
    dv = clean.slice(-1).toUpperCase();
    body = clean.slice(0, -1).replace(/[^0-9]/g, '');
  }

  if (!body || !dv) return { esValido: false, mensaje: 'RUT incompleto' };

  const dvEsperado = calcularDV(body);
  const esValido = dv === dvEsperado;

  return {
    esValido,
    dvEsperado,
    mensaje: esValido
      ? '✓ RUT Válido (Módulo 11)'
      : `✗ Dígito verificador incorrecto (el DV calculado para ${new Intl.NumberFormat('es-CL').format(Number(body))} es ${dvEsperado})`,
  };
}

/**
 * Formatea un número entero con separador de miles es-CL mientras el usuario escribe en un campo de texto.
 * Ej: '15000000' -> '15.000.000'
 */
export function formatearEnteroConMiles(val: number | string | undefined | null): string {
  if (val === '' || val === null || val === undefined) return '';
  const clean = String(val).replace(/[^0-9]/g, '');
  if (!clean) return '';
  return new Intl.NumberFormat('es-CL').format(Number(clean));
}

/**
 * Convierte un texto formateado con separadores de miles de vuelta a un número primitivo.
 * Ej: '15.000.000' -> 15000000
 */
export function desformatearEntero(val: string | number | undefined | null): number {
  if (val === '' || val === null || val === undefined) return 0;
  const clean = String(val).replace(/[^0-9]/g, '');
  return clean ? Number(clean) : 0;
}

/**
 * Igual que `formatearEnteroConMiles`, pero admite decimales (formato es-CL: punto de
 * miles, coma decimal) — para cantidades de obra que no son enteras (ej. 12,5 m3).
 * Ej: '12500,5' -> '12.500,5'. Deja la coma final mientras el usuario la está escribiendo.
 */
export function formatearNumeroConMiles(val: number | string | undefined | null): string {
  if (val === '' || val === null || val === undefined) return '';
  const limpio = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
  if (!limpio) return '';
  const [entero, ...resto] = limpio.split('.');
  const decimales = resto.join('').slice(0, 2);
  const enteroFormateado = entero ? new Intl.NumberFormat('es-CL').format(Number(entero)) : '';
  return limpio.includes('.') ? `${enteroFormateado},${decimales}` : enteroFormateado;
}

/**
 * Convierte un texto formateado con `formatearNumeroConMiles` de vuelta a un número.
 * Ej: '12.500,5' -> 12500.5
 */
export function desformatearNumero(val: string | number | undefined | null): number {
  if (val === '' || val === null || val === undefined) return 0;
  const limpio = String(val).replace(/[^0-9,]/g, '').replace(',', '.');
  const num = parseFloat(limpio);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Validador booleano simple.
 */
export function esRUTValido(rutCompleto: string): boolean {
  return validarRUT(rutCompleto).esValido;
}
