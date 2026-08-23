/**
 * Lectura de configuración independiente del entorno.
 *
 * La misma librería corre en tres sitios: Node (la CLI), Deno (las Edge
 * Functions de Supabase) y, si algún día hiciera falta, un Worker. Cada uno
 * expone las variables de otra manera, así que se pregunta por todas y se
 * usa la primera que conteste.
 */
export function env(name, fallback = '') {
  const fromNode = globalThis.process?.env?.[name];
  if (fromNode) return fromNode;

  const fromDeno = globalThis.Deno?.env?.get?.(name);
  if (fromDeno) return fromDeno;

  return fallback;
}

export function envNumber(name, fallback) {
  const value = Number(env(name, ''));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function envFlag(name, fallback = true) {
  const value = env(name, '').toLowerCase();
  if (!value) return fallback;
  return !['false', '0', 'no', 'off'].includes(value);
}
