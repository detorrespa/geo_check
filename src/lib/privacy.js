/**
 * Tratamiento de la IP para el límite por visitante.
 *
 * Una IP es un dato personal y aquí no hace ninguna falta: solo se necesita
 * contar cuántas veces ha venido *el mismo* visitante hoy. Se guarda el hash
 * con una sal de servidor, nunca la IP.
 *
 * La sal importa: sin ella, el espacio de direcciones IPv4 es tan pequeño que
 * cualquiera con la tabla delante recupera las IPs probándolas todas.
 */
import { env } from './env.js';

/** Primera IP de la cadena de proxies: la del visitante. */
export function clientIp(headers) {
  const forwarded = headers.get?.('x-forwarded-for') || '';
  const first = forwarded.split(',')[0]?.trim();
  return first || headers.get?.('cf-connecting-ip') || headers.get?.('x-real-ip') || '';
}

export async function hashIp(ip) {
  const value = String(ip || '').trim();
  if (!value) return '';

  const salt = env('RATE_LIMIT_SALT');
  if (!salt) {
    // Sin sal el hash no protege nada. Antes de guardar algo reversible,
    // preferimos no limitar: se avisa y se sigue.
    console.warn('RATE_LIMIT_SALT sin definir: no se aplica el límite por IP');
    return '';
  }

  const bytes = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
