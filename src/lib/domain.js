/**
 * Normalización del dominio de la marca.
 *
 * Es la clave de la caché de 30 días, así que tiene que dar el mismo valor
 * para "https://www.Marca.es/productos", "marca.es" y "MARCA.ES/". Si no,
 * dos personas de la misma empresa gastan dos ejecuciones.
 */

// Exige al menos un punto y un TLD alfabético. Lo segundo es lo que descarta
// las IPs: "192.168.1.1" encaja en la forma de un dominio pero no es la web de
// ninguna marca, y como clave de caché sería un desastre.
const DOMAIN_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

export function normalizeDomain(input) {
  let value = String(input || '').trim().toLowerCase();
  if (!value) return '';

  // Con o sin protocolo: URL solo parsea si lo lleva, así que se lo ponemos.
  if (!value.includes('://')) value = `https://${value}`;

  let host;
  try {
    host = new URL(value).hostname;
  } catch {
    return '';
  }

  host = host.replace(/^www\./, '').replace(/\.$/, '');
  return DOMAIN_SHAPE.test(host) ? host : '';
}

export function isValidDomain(input) {
  return normalizeDomain(input) !== '';
}

/**
 * Correo con pinta de correo. Deliberadamente permisivo: el brief pide
 * recomendar el correo profesional, no filtrarlo. Mucha pyme española usa
 * Gmail y un filtro estricto cuesta leads legítimos.
 */
export function isPlausibleEmail(input) {
  const value = String(input || '').trim();
  if (value.length < 6 || value.length > 254) return false;
  const [local, ...rest] = value.split('@');
  if (rest.length !== 1) return false;
  return Boolean(local) && !/\s/.test(value) && isValidDomain(rest[0]);
}
