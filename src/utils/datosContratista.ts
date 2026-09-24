import type { DatosContratista, RepresentanteLegal } from '../types';

export const PERSONERIA_SUGERIDA =
  'consta en Certificado de Estatuto Actualizado emitido por el Registro de Empresas y Sociedades del Ministerio de Economía, Fomento y Turismo.';

export const representanteVacio = (): RepresentanteLegal => ({ tratamiento: 'don', nombre: '', rut: '' });

export const datosContratistaVacios = (): DatosContratista => ({
  representantes: [representanteVacio()],
  domicilioLegal: '',
  personeria: '',
});

/** Lo mínimo que el contrato necesita del contratista: quién firma, dónde se domicilia y con qué personería. */
export function datosContratistaCompletos(d?: DatosContratista | null): boolean {
  return faltantesDatosContratista(d).length === 0;
}

export function faltantesDatosContratista(d?: DatosContratista | null): string[] {
  const faltan: string[] = [];
  const reps = (d?.representantes || []).filter(r => r.nombre.trim() && r.rut.trim());
  if (reps.length === 0) faltan.push('Representante legal (nombre y cédula de identidad)');
  if (!d?.domicilioLegal?.trim()) faltan.push('Domicilio legal');
  if (!d?.personeria?.trim()) faltan.push('Personería (documento que acredita a los representantes)');
  return faltan;
}

/** "doña Cecilia Ulloa Ibarra, cédula de identidad N° 17.323.808-8 y don Carlos Troncoso Muñoz, cédula de identidad N° 15.231.135-4". */
export function textoRepresentantes(d?: DatosContratista | null): string {
  const reps = (d?.representantes || []).filter(r => r.nombre.trim() && r.rut.trim());
  if (reps.length === 0) return '[representante legal: complete sus datos]';
  const textos = reps.map(r => `${r.tratamiento} ${r.nombre.trim()}, cédula de identidad N° ${r.rut.trim()}`);
  return textos.length === 1 ? textos[0] : `${textos.slice(0, -1).join(', ')} y ${textos[textos.length - 1]}`;
}
