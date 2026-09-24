const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function menorQueMil(n: number): string {
  if (n === 100) return 'cien';
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c) partes.push(CENTENAS[c]);
  if (r > 0) {
    if (r < 30) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(' ');
}

/** "uno" → "un", "veintiuno" → "veintiún" cuando precede a "mil" o "millones". */
const apocopar = (texto: string) => texto.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

/** 44864047 → "cuarenta y cuatro millones ochocientos sesenta y cuatro mil cuarenta y siete". */
export function numeroEnPalabras(valor: number): string {
  const n = Math.round(Math.abs(valor));
  if (n === 0) return 'cero';
  if (n >= 1e12) return String(n);
  const partes: string[] = [];
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1e3);
  const resto = n % 1000;
  if (millones) partes.push(millones === 1 ? 'un millón' : `${apocopar(numeroEnPalabras(millones))} millones`);
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocopar(menorQueMil(miles))} mil`);
  if (resto) partes.push(menorQueMil(resto));
  return partes.join(' ');
}

/** 44864047 → "Cuarenta y cuatro millones ochocientos sesenta y cuatro mil cuarenta y siete pesos". */
export function montoEnPalabras(valor: number): string {
  const texto = `${numeroEnPalabras(valor)} pesos`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
