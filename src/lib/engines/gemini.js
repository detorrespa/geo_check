/**
 * Motor 2 · Google (Gemini con búsqueda).
 *
 * Port de `query_gemini` de GEO Monitor. Primero con `google_search` activado
 * —así la respuesta se apoya en el índice de Google y devuelve las fuentes— y
 * si eso falla, reintento sin grounding recorriendo una cadena de modelos.
 *
 * No es el AI Overview del buscador: Google no ofrece API para eso. En el
 * informe se llama «Google (Gemini con búsqueda)» y no de otra manera.
 */
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Retirados para cuentas nuevas: devuelven 404 aunque ListModels los liste.
// Comprobado contra la API en agosto de 2026; conviene revisarlo de vez en
// cuando, porque Google retira modelos sin quitarlos del listado.
const DEPRECATED = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'];
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];

// Host del redirector de Google en las citas: nunca es la fuente real.
const REDIRECT_HOST = 'vertexaisearch.cloud.google.com';

export const id = 'google';
export const label = 'Google (Gemini con búsqueda)';

export function configured() {
  return Boolean(process.env.GOOGLE_API_KEY);
}

function useGrounding() {
  return (process.env.GEMINI_USE_GROUNDING || 'true').toLowerCase() !== 'false';
}

function timeoutMs() {
  return Number(process.env.ENGINE_TIMEOUT_MS || 45000);
}

export function modelChain() {
  const preferred = (process.env.GOOGLE_MODEL || '').trim();
  // Un modelo retirado en la configuración se sustituye por el primero de la
  // cadena, nunca por otro nombre fijo: así al retirar uno basta con moverlo
  // de FALLBACK_MODELS a DEPRECATED y no queda un destino muerto.
  const normalized = DEPRECATED.some((d) => preferred === d || preferred.startsWith(`${d}-`))
    ? FALLBACK_MODELS[0]
    : preferred;
  return [...new Set([normalized, ...FALLBACK_MODELS].filter(Boolean))];
}

const DOMAIN_SHAPE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * Dominio real de una cita.
 *
 * Ojo con `web.uri`: Google no devuelve la URL de la fuente sino un
 * redirector propio (`vertexaisearch.cloud.google.com/grounding-api-redirect/…`),
 * así que parsearlo daría ese mismo host para las once fuentes de una
 * respuesta. El dominio bueno viene en `web.title`.
 */
export function sourceDomain(web = {}) {
  const title = (web.title || '').trim().toLowerCase();
  if (DOMAIN_SHAPE.test(title)) return title;

  try {
    const host = new URL(web.uri || '').hostname.toLowerCase();
    return host === REDIRECT_HOST ? '' : host;
  } catch {
    return '';
  }
}

/** Texto y dominios citados, o null si la respuesta no trae nada aprovechable. */
function parse(data) {
  if (data?.error) return { apiError: data.error.message || String(data.error) };

  const candidate = data?.candidates?.[0];
  if (!candidate) return null;

  const parts = candidate?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('');
  if (!text.trim()) return null;

  const sources = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks || []) {
    const domain = sourceDomain(chunk?.web);
    if (domain && !sources.includes(domain)) sources.push(domain);
  }

  return { text, sources };
}

async function post(modelId, body, key) {
  const response = await fetch(`${BASE_URL}/${modelId}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs()),
  });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

export async function ask(question) {
  const started = Date.now();
  const key = process.env.GOOGLE_API_KEY;
  const models = modelChain();

  if (!key) {
    return { engine: id, model: models[0], text: '', sources: [], ok: false, error: 'GOOGLE_API_KEY no configurada', latencyMs: 0, grounded: false };
  }

  const body = {
    contents: [{ parts: [{ text: question }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
  };

  const done = (parsed, modelId, grounded) => ({
    engine: id,
    model: grounded ? `${modelId} (grounded)` : modelId,
    text: parsed.text,
    sources: parsed.sources,
    ok: true,
    error: null,
    latencyMs: Date.now() - started,
    grounded,
  });

  // 1) Con búsqueda de Google.
  if (useGrounding()) {
    try {
      const primary = models[0];
      const res = await post(primary, { ...body, tools: [{ google_search: {} }] }, key);
      const parsed = res.ok ? parse(res.data) : null;
      if (parsed?.text) return done(parsed, primary, true);
    } catch {
      // Sin ruido: el reintento sin grounding cubre el caso.
    }
  }

  // 2) Sin búsqueda, probando la cadena de modelos.
  //
  // Se guarda el error del PRIMER modelo, no el del último: el último de la
  // cadena es el más viejo y su "modelo no encontrado" tapa la causa real.
  // Depurar por qué falla el modelo que sí pediste cuesta media hora si el
  // mensaje habla de otro.
  let firstError = '';
  for (const modelId of models) {
    try {
      const res = await post(modelId, body, key);
      const parsed = res.ok ? parse(res.data) : null;
      if (parsed?.text) return done(parsed, modelId, false);
      firstError ||= `${modelId}: ${parsed?.apiError || res.data?.error?.message || `HTTP ${res.status}`}`;
    } catch (error) {
      firstError ||= `${modelId}: ${error.message || error}`;
    }
  }

  return {
    engine: id,
    model: models[0],
    text: '',
    sources: [],
    ok: false,
    error: firstError || 'Gemini no disponible: revisa GOOGLE_API_KEY y cuota',
    latencyMs: Date.now() - started,
    grounded: false,
  };
}
