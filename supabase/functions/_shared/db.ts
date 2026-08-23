/**
 * Cliente de Supabase con service_role.
 *
 * Supabase inyecta SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en toda Edge
 * Function: la clave secreta nunca se escribe en el repositorio ni se pasa a
 * mano. Con ella se salta el RLS, que es justo lo que necesita el worker y
 * justo lo que no debe poder hacer el navegador.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * ¿Viene esta petición del propio proyecto?
 *
 * `run-check` gasta dinero en cada llamada, así que solo lo arranca quien
 * presenta la service_role: es decir, `create-check`. Sin esto, cualquiera
 * con la URL de la función podría relanzar checks a tu costa.
 */
export function isInternalCall(request: Request): boolean {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const header = request.headers.get('authorization') || '';
  return secret !== '' && header === `Bearer ${secret}`;
}
