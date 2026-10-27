import { createClient } from '@supabase/supabase-js';
import { auth } from './firebase';

// Base de datos Postgres (Supabase) de los módulos nuevos (recintos y planos). No hay un segundo inicio de sesión:
// cada consulta viaja con la sesión de Firebase del sitio, que Supabase verifica (autenticación de terceros);
// las reglas de la base solo dejan pasar a cuentas @uct.cl verificadas (ver supabase/migrations).
//
// La dirección y la clave pública del proyecto no son secretas (identifican el proyecto, como la configuración
// de Firebase): lo que protege los datos son las reglas de la base.
const URL_SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://etjoutfnzqqjrudosjkg.supabase.co';
const CLAVE_PUBLICA = import.meta.env.VITE_SUPABASE_CLAVE_PUBLICA as string | undefined;

/** true si el módulo de recintos tiene base de datos configurada en este ambiente. */
export const SUPABASE_CONFIGURADO = Boolean(CLAVE_PUBLICA);

export const supabase = createClient(URL_SUPABASE, CLAVE_PUBLICA || 'sin-configurar', {
  accessToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
});
