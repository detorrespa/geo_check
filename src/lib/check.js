/**
 * Orquestador de un check.
 *
 * Lanza cada pregunta contra cada motor con un pool de concurrencia, marca la
 * mención de forma determinista según llega cada respuesta, y devuelve las dos
 * cifras. En la aplicación web esta misma función corre en el worker y cada
 * respuesta se escribe en Supabase desde `onProgress`.
 */
import { buildQuestions, allQuestions } from './questions.js';
import { DEFAULT_ENGINES, getEngine } from './engines/index.js';
import { brandInAnswer, competitorsInAnswer, mentionRank, summarize } from './metrics.js';

/** Ejecuta `worker` sobre `items` con como mucho `limit` en vuelo. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/**
 * Ejecuta una lista de preguntas ya construida.
 *
 * El worker de la Edge Function entra por aquí: las preguntas se calcularon y
 * se guardaron al crear el check, así que la barra de progreso puede
 * enseñarlas antes de que exista ninguna respuesta. Volver a generarlas en el
 * worker las haría distintas de las que el navegador ya está mostrando.
 */
export async function runQuestions({
  brand,
  questions,
  competitors = [],
  engines = DEFAULT_ENGINES,
  concurrency = 6,
  onProgress,
}) {
  const rivals = competitors.map((c) => (c || '').trim()).filter(Boolean).slice(0, 3);

  const tasks = [];
  for (const q of questions) {
    for (const engineId of engines) tasks.push({ ...q, engineId });
  }

  let done = 0;
  const responses = await pool(tasks, concurrency, async (task) => {
    const engine = getEngine(task.engineId);
    const raw = await engine.ask(task.text);

    // La mención se decide aquí, sobre el texto devuelto por la API y sin el
    // eco de la pregunta. Nunca se la preguntamos a un modelo: sería otra
    // llamada, otro coste y un resultado menos fiable que un match literal.
    const mentioned = raw.ok ? brandInAnswer(brand, task.text, raw.text) : false;

    const record = {
      question: task.text,
      block: task.block,
      engine: raw.engine,
      model: raw.model,
      text: raw.text,
      sources: raw.sources,
      ok: raw.ok,
      error: raw.error,
      latencyMs: raw.latencyMs,
      brandMentioned: mentioned,
      rank: mentioned ? mentionRank(brand, rivals, task.text, raw.text) : null,
      competitorsMentioned: raw.ok ? competitorsInAnswer(rivals, task.text, raw.text) : [],
    };

    done += 1;
    await onProgress?.({ done, total: tasks.length, record });
    return record;
  });

  return responses;
}

export async function runCheck({
  brand,
  domain = '',
  sector,
  competitors = [],
  engines = DEFAULT_ENGINES,
  perBlock,
  concurrency = 6,
  onProgress,
}) {
  const startedAt = Date.now();
  const built = buildQuestions({ brand, sector, competitors, perBlock });
  const questions = allQuestions(built);

  const responses = await runQuestions({ brand, questions, competitors, engines, concurrency, onProgress });

  return {
    brand,
    domain,
    sector,
    competitors: competitors.map((c) => (c || '').trim()).filter(Boolean).slice(0, 3),
    engines,
    questions,
    responses,
    summary: summarize(brand, responses),
    warnings: built.warnings,
    startedAt,
    elapsedMs: Date.now() - startedAt,
  };
}

/** Competidores que más aparecen, para el "y estos salen en tu lugar". */
export function competitorRanking(result) {
  const counts = new Map();
  for (const r of result.responses) {
    for (const c of r.competitorsMentioned) counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, mentions]) => ({ name, mentions }));
}
