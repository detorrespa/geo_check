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

// Retirados para cuentas nuevas: devuelven 404.
const DEPRECATED = ['gemini-2.0-flash'];
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];

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

function modelChain() {
  const preferred = (process.env.GOOGLE_MODEL || '').trim();
  const normalized = DEPRECATED.some((d) => preferred === d || preferred.startsWith(`${d}-`))
    ? 'gemini-2.5-flash'
    : preferred;
  return [...new Set([normalized, ...FALLBACK_MODELS].filter(Boolean))];
}

function domainOf(uri) {
  try {
    return new URL(uri).hostname.toLowerCase();
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
    const domain = domainOf(chunk?.web?.uri || '');
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
  let lastError = '';
  for (const modelId of models) {
    try {
      const res = await post(modelId, body, key);
      const parsed = res.ok ? parse(res.data) : null;
      if (parsed?.text) return done(parsed, modelId, false);
      lastError = parsed?.apiError || res.data?.error?.message || `HTTP ${res.status}`;
    } catch (error) {
      lastError = String(error.message || error);
    }
  }

  return {
    engine: id,
    model: models[0],
    text: '',
    sources: [],
    ok: false,
    error: lastError || 'Gemini no disponible: revisa GOOGLE_API_KEY y cuota',
    latencyMs: Date.now() - started,
    grounded: false,
  };
}
