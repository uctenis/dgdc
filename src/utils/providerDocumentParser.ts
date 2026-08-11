import { parseCotizacionPdf } from './pdfParser';
import { parseCotizacionExcel } from './excelParser';

export interface ParsedProveedorData {
  rut?: string;
  razonSocial?: string;
  nombreContacto?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  detalles: string[];
}

const limpiar = (valor?: string) => valor?.replace(/\s+/g, ' ').trim();

const limpiarNombreContacto = (valor?: string) => {
  const nombre = limpiar(valor);
  return nombre
    ?.split(/\s+(?=constructora|empresa|sociedad|ingenier[ií]a|servicios|spa\b|ltda\b|eirl\b)/i)[0]
    .trim();
};

export async function parseProveedorDesdeCotizacion(file: File): Promise<ParsedProveedorData> {
  const esPdf = file.name.toLowerCase().endsWith('.pdf');
  const parsed = esPdf ? await parseCotizacionPdf(file) : await parseCotizacionExcel(file);
  const texto = limpiar(parsed.textoExtraido) || '';
  const detalles: string[] = [];

  const email = texto.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  const telefonoConEtiqueta = texto.match(/(?:tel[eé]fono|fono|celular|m[oó]vil)\s*[:;-]?\s*(\+?56[\s-]?(?:9[\s-]?)?[\d\s-]{8,12})/i)?.[1];
  const telefonoCercanoCorreo = email
    ? texto.slice(Math.max(0, texto.indexOf(email) - 40), texto.indexOf(email)).match(/(?:\+?56\s*)?(9\d{8})\s*$/)?.[0]
    : undefined;
  const telefono = limpiar(telefonoConEtiqueta || telefonoCercanoCorreo);

  const contactoEtiqueta = texto.match(/(?:contacto|atenci[oó]n|contactar)\s*[:;-]?\s*([\p{Lu}][\p{L}.]+(?:\s+[\p{Lu}][\p{L}.]+){1,4})/iu)?.[1];
  const contactoFirma = texto.match(/(?:saluda\s+atte\.?|atentamente)\s*[:;-]?\s*([\p{Lu}][\p{L}.]+(?:\s+[\p{Lu}][\p{L}.]+){1,4})/iu)?.[1];
  const nombreContacto = limpiarNombreContacto(contactoEtiqueta || contactoFirma);

  const direccion = limpiar(texto.match(/(?:direcci[oó]n\s*[:;-]?\s*)?((?:avenida|av\.?|calle|pasaje|camino|ruta)\s+[\p{L}\d ,.#-]{4,80}?)(?=\s+(?:rut|tel[eé]fono|fono|email|correo)\b|$)/iu)?.[1]);
  const ciudadExplicita = limpiar(texto.match(/(?:ciudad|comuna)\s*[:;-]?\s*([\p{L}\s]{3,35})/iu)?.[1]);
  const ciudadDireccion = direccion?.match(/,\s*([\p{L}\s]{3,30})$/u)?.[1]?.trim();
  const ciudad = ciudadExplicita || ciudadDireccion;

  if (parsed.rutProveedor) detalles.push(`RUT detectado: ${parsed.rutProveedor}`);
  if (parsed.razonSocialProveedor) detalles.push(`Razón social detectada: ${parsed.razonSocialProveedor}`);
  if (nombreContacto) detalles.push(`Contacto detectado: ${nombreContacto}`);
  if (email) detalles.push(`Correo detectado: ${email}`);
  if (telefono) detalles.push(`Teléfono detectado: ${telefono}`);
  if (direccion) detalles.push(`Dirección detectada: ${direccion}`);

  return {
    rut: parsed.rutProveedor,
    razonSocial: parsed.razonSocialProveedor,
    nombreContacto,
    email,
    telefono,
    direccion,
    ciudad,
    detalles,
  };
}
