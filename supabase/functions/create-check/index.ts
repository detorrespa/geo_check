/**
 * POST /create-check
 *
 * Valida, aplica las tres barreras de coste (interruptor, caché de 30 días y
 * límite por IP), guarda el check con sus 22 preguntas ya calculadas y
 * devuelve el id en menos de un segundo. La ejecución sigue en segundo plano.
 *
 * El navegador no espera aquí: se lleva el id y pregunta por el progreso.
 * Así un refresh o un túnel de metro no tiran el análisis.
 */
import { preflight, json, fail } from '../_shared/http.ts';
import { serviceClient } from '../_shared/db.ts';
import { buildQuestions, allQuestions } from '../../../src/lib/questions.js';
import { SECTOR_LABELS, availableSectors } from '../../../src/lib/sectors/index.js';
import { domainExists, normalizeDomain } from '../../../src/lib/domain.js';
import { clientIp, hashIp } from '../../../src/lib/privacy.js';
import { DEFAULT_ENGINES } from '../../../src/lib/engines/index.js';

const MAX_BRAND = 80;
const MAX_COMPETITORS = 3;

Deno.serve(async (request: Request) => {
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== 'POST') return fail(request, 'method_not_allowed', 'Usa POST.', 405);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(request, 'bad_json', 'El cuerpo no es JSON válido.');
  }

  const brand = String(body.brand || '').trim();
  const sector = String(body.sector || '').trim();
  const domain = normalizeDomain(body.domain);
  const competitors = Array.isArray(body.competitors)
    ? body.competitors.map((c: unknown) => String(c || '').trim()).filter(Boolean).slice(0, MAX_COMPETITORS)
    : [];

  if (brand.length < 2 || brand.length > MAX_BRAND) {
    return fail(request, 'bad_brand', 'El nombre de la marca debe tener entre 2 y 80 caracteres.');
  }
  if (!SECTOR_LABELS[sector]) {
    return fail(request, 'bad_sector', 'Sector no reconocido.');
  }
  if (!availableSectors().includes(sector)) {
    return fail(request, 'sector_pendiente', `«${SECTOR_LABELS[sector]}» aún no está disponible.`, 503);
  }
  if (!domain) {
    return fail(request, 'bad_domain', 'Indica la web de la marca.');
  }

  const db = serviceClient();

  // 1 · Interruptor. Se apaga desde SQL, sin desplegar.
  const { data: enabled, error: switchError } = await db.rpc('geo_is_enabled');
  if (switchError) return fail(request, 'db_error', switchError.message, 500);
  if (enabled === false) {
    return fail(request, 'disabled', 'El análisis está temporalmente fuera de servicio.', 503);
  }

  // 2 · Caché de 30 días por dominio. Si otra persona de la misma empresa ya
  //     lo pidió, se le sirve aquel y no se gasta ni una llamada.
  const { data: cachedId } = await db.rpc('geo_find_cached', { p_domain: domain });
  if (cachedId) return json(request, { id: cachedId, cached: true });

  // 2b · La web tiene que existir. Después de la caché: si ya analizamos
  //      ese dominio, no hace falta volver a golpearlo.
  if (!(await domainExists(domain))) {
    return fail(request, 'unknown_domain', 'No hemos podido abrir esa web. Revisa el dominio.');
  }

  // 3 · Límite por IP. Va después de la caché a propósito: servir un
  //     resultado guardado no cuesta nada, así que no debe gastar cupo.
  const ipHash = await hashIp(clientIp(request.headers));
  if (ipHash) {
    const { data: allowed } = await db.rpc('geo_touch_rate_limit', { p_ip_hash: ipHash });
    if (allowed === false) {
      return fail(request, 'rate_limited', 'Has lanzado varios análisis hoy. Prueba mañana.', 429);
    }
  }

  let built;
  try {
    built = buildQuestions({ brand, sector, competitors });
  } catch (error) {
    return fail(request, 'bad_request', String((error as Error).message));
  }
  const questions = allQuestions(built);

  const { data: check, error: insertError } = await db
    .from('geo_checks')
    .insert({
      brand_name: brand,
      brand_domain: String(body.domain || '').trim().slice(0, 255),
      brand_domain_normalized: domain,
      sector,
      competitors,
      questions,
      engines: DEFAULT_ENGINES,
      warnings: built.warnings,
      total_calls: questions.length * DEFAULT_ENGINES.length,
      ip_hash: ipHash || null,
      utm: typeof body.utm === 'object' && body.utm !== null ? body.utm : {},
    })
    .select('id')
    .single();

  if (insertError) return fail(request, 'db_error', insertError.message, 500);

  // Arranca el worker sin esperarlo. waitUntil mantiene viva la invocación
  // lo justo para que la petición salga; el trabajo largo es del otro lado.
  const runUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/run-check`;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const kickoff = fetch(runUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ checkId: check.id }),
  }).catch((error) => console.error('No se pudo arrancar run-check:', error));

  // @ts-ignore EdgeRuntime lo aporta el runtime de Supabase.
  globalThis.EdgeRuntime?.waitUntil?.(kickoff);

  return json(request, {
    id: check.id,
    cached: false,
    questions,
    total: questions.length * DEFAULT_ENGINES.length,
    warnings: built.warnings,
  });
});
