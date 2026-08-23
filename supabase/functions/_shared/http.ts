/**
 * CORS y respuestas JSON.
 *
 * El frontend vive en Cloudflare Pages y las funciones en Supabase, así que
 * son orígenes distintos y el navegador exige preflight en todas las
 * peticiones POST con cuerpo JSON.
 */
import { env } from '../../../src/lib/env.js';

/** Orígenes permitidos, separados por comas. Vacío = cualquiera (desarrollo). */
function allowedOrigins(): string[] {
  return env('ALLOWED_ORIGINS')
    .split(',')
    .map((o: string) => o.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowed = allowedOrigins();
  // Sin lista configurada se acepta cualquiera: conveniente en desarrollo,
  // pero define ALLOWED_ORIGINS antes de publicar o cualquier web podrá
  // lanzar checks a tu costa desde el navegador de sus visitantes.
  const value = allowed.length === 0 ? origin || '*' : allowed.includes(origin) ? origin : allowed[0];

  return {
    'access-control-allow-origin': value,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'content-type': 'application/json; charset=utf-8' },
  });
}

export function fail(request: Request, code: string, message: string, status = 400): Response {
  return json(request, { error: { code, message } }, status);
}

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
