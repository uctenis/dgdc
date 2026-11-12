import { useEffect, useState } from 'react';
import { supabase, SUPABASE_CONFIGURADO } from '../lib/supabase';

/**
 * Nómina vigente de funcionarios (planilla DDPER de Personas, tabla funcionarios, migración 0020). Sirve para saber
 * si un ocupante sigue en la universidad, sugerir nombres al editar un recinto y ver quiénes aún no tienen recinto.
 * No trae RUT: la persona se reconoce por su nombre normalizado.
 */
export interface Funcionario {
  clave: string;
  nombre: string;
  tipo_contrato: string | null;
  telefono: string | null;
  campus: string | null;
  edificio_codigo: string | null;
  edificio: string | null;
  unidad: string | null;
  nomina: string;
}

/** Nombre en mayúsculas, sin tildes ni signos y con la coma normalizada: «Pérez  Soto ,Ana» → «PEREZ SOTO, ANA». */
export function claveNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z ,]/g, '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

/** Los ocupantes con nombre de persona vienen como «Apellidos, Nombres»; el resto son unidades o textos genéricos. */
export const esNombreDePersona = (nombre: string) => /^[^,]+,\s*\S/.test(nombre.trim());

/** Distancia de edición (para reconocer el mismo nombre con una letra cambiada o incompleto). */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const actual = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = actual;
    }
  }
  return fila[b.length];
}

export type EstadoEnNomina =
  | { estado: 'vigente'; funcionario: Funcionario }
  | { estado: 'parecido'; funcionario: Funcionario }   // mismo nombre con diferencias de escritura
  | { estado: 'no-figura' }
  | { estado: 'no-aplica' };                           // no es un nombre de persona, o no hay nómina cargada

/** Busca a un ocupante en la nómina: por nombre exacto o, si no está, por uno casi igual (88 % de parecido). */
export function buscarEnNomina(nomina: Map<string, Funcionario>, nombre: string): EstadoEnNomina {
  if (!nomina.size || !esNombreDePersona(nombre)) return { estado: 'no-aplica' };
  const clave = claveNombre(nombre);
  const exacto = nomina.get(clave);
  if (exacto) return { estado: 'vigente', funcionario: exacto };
  let mejor: Funcionario | undefined;
  let mejorParecido = 0;
  for (const f of nomina.values()) {
    if (Math.abs(f.clave.length - clave.length) > 12) continue;
    const parecido = 1 - distancia(clave, f.clave) / Math.max(clave.length, f.clave.length);
    if (parecido > mejorParecido) { mejorParecido = parecido; mejor = f; }
  }
  // Nombre incompleto en el catastro («Pérez Soto, Ana» frente a «Pérez Soto, Ana María»).
  if ((!mejor || mejorParecido < 0.88)) {
    const prefijo = [...nomina.values()].filter(f => f.clave.startsWith(clave + ' '));
    if (prefijo.length === 1) return { estado: 'parecido', funcionario: prefijo[0] };
  }
  return mejor && mejorParecido >= 0.88 ? { estado: 'parecido', funcionario: mejor } : { estado: 'no-figura' };
}

let cargando: Promise<Map<string, Funcionario>> | null = null;

/** Nómina completa (se lee una vez por sesión). Sin acceso o sin la migración 0020, devuelve una nómina vacía. */
export function obtenerNomina(): Promise<Map<string, Funcionario>> {
  if (!SUPABASE_CONFIGURADO) return Promise.resolve(new Map());
  cargando ??= (async () => {
    const filas: Funcionario[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase.from('funcionarios').select('*').order('clave').range(desde, desde + 999);
      if (error) { cargando = null; return new Map<string, Funcionario>(); }
      filas.push(...(data as Funcionario[]));
      if (!data || data.length < 1000) break;
    }
    return new Map(filas.map(f => [f.clave, f]));
  })();
  return cargando;
}

/** La nómina para un componente (vacía mientras carga). */
export function useNomina(): Map<string, Funcionario> {
  const [nomina, setNomina] = useState<Map<string, Funcionario>>(new Map());
  useEffect(() => { let vigente = true; void obtenerNomina().then(n => { if (vigente) setNomina(n); }); return () => { vigente = false; }; }, []);
  return nomina;
}
