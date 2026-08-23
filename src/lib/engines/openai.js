/**
 * Motor 1 · OpenAI.
 *
 * El motor que la persona al otro lado usa personalmente, que es parte de por
 * qué la cifra le resulta creíble.
 */
import { env, envNumber } from '../env.js';

const API_URL = 'https://api.openai.com/v1/chat/completions';

export const id = 'openai';
export const label = 'ChatGPT (OpenAI)';

export function configured() {
  return Boolean(env('OPENAI_API_KEY'));
}

function model() {
  return env('OPENAI_MODEL', 'gpt-4o-mini');
}

function timeoutMs() {
  return envNumber('ENGINE_TIMEOUT_MS', 45000);
}

export async function ask(question) {
  const started = Date.now();
  const key = env('OPENAI_API_KEY');
  if (!key) {
    return { engine: id, model: model(), text: '', sources: [], ok: false, error: 'OPENAI_API_KEY no configurada', latencyMs: 0 };
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model(),
        messages: [{ role: 'user', content: question }],
        temperature: 0.7,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';

    return {
      engine: id,
      model: data?.model || model(),
      text,
      sources: [],
      ok: Boolean(text.trim()),
      error: text.trim() ? null : 'respuesta vacía',
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      engine: id,
      model: model(),
      text: '',
      sources: [],
      ok: false,
      error: String(error.message || error),
      latencyMs: Date.now() - started,
    };
  }
}
