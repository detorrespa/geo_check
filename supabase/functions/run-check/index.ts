/**
 * POST /run-check  { checkId }
 *
 * El worker. Lanza las 22 preguntas contra los dos motores con un pool de
 * concurrencia y escribe cada respuesta en cuanto llega, para que la barra de
 * progreso del navegador avance de verdad.
 *
 * Solo lo arranca `create-check`, presentando la service_role: cada ejecución
 * cuesta dinero y esta URL es pública.
 */
import { json, fail } from '../_shared/http.ts';
import { serviceClient, isInternalCall } from '../_shared/db.ts';
import { runQuestions } from '../../../src/lib/check.js';
import { summarize } from '../../../src/lib/metrics.js';

const CONCURRENCY = 6;

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return fail(request, 'method_not_allowed', 'Usa POST.', 405);
  if (!isInternalCall(request)) return fail(request, 'forbidden', 'No autorizado.', 403);

  const { checkId } = await request.json().catch(() => ({ checkId: null }));
  if (!checkId) return fail(request, 'bad_request', 'Falta checkId.');

  const db = serviceClient();

  const { data: check, error } = await db
    .from('geo_checks')
    .select('id, status, brand_name, competitors, questions, engines')
    .eq('id', checkId)
    .single();

  if (error || !check) return fail(request, 'not_found', 'Check no encontrado.', 404);

  // Idempotencia: si otra invocación ya lo cogió, no se paga dos veces.
  if (check.status !== 'queued') {
    return json(request, { id: checkId, status: check.status, skipped: true });
  }

  await db.from('geo_checks').update({ status: 'running' }).eq('id', checkId);

  try {
    const responses = await runQuestions({
      brand: check.brand_name,
      questions: check.questions,
      competitors: check.competitors,
      engines: check.engines,
      concurrency: CONCURRENCY,
      onProgress: async ({ record }) => {
        // Upsert y no insert: si el worker se reintenta, la respuesta se
        // sobrescribe en vez de duplicar la pregunta en el informe.
        const { error: writeError } = await db.from('geo_check_responses').upsert(
          {
            check_id: checkId,
            question: record.question,
            block: record.block,
            engine: record.engine,
            model: record.model,
            response: record.text || null,
            has_answer: record.ok,
            brand_mentioned: record.brandMentioned,
            brand_rank: record.rank,
            competitors_mentioned: record.competitorsMentioned,
            sources: record.sources,
            latency_ms: record.latencyMs,
            error: record.error,
          },
          { onConflict: 'check_id,question,engine' },
        );
        if (writeError) console.error('No se pudo guardar una respuesta:', writeError.message);
      },
    });

    const summary = summarize(check.brand_name, responses);

    await db
      .from('geo_checks')
      .update({
        status: 'done',
        finished_at: new Date().toISOString(),
        mentions_explicit: summary.explicit.mentions,
        answers_explicit: summary.explicit.answers,
        freq_explicit: summary.explicit.frequency,
        mentions_discovery: summary.discovery.mentions,
        answers_discovery: summary.discovery.answers,
        freq_discovery: summary.discovery.frequency,
      })
      .eq('id', checkId);

    return json(request, { id: checkId, status: 'done', summary });
  } catch (thrown) {
    const message = String((thrown as Error)?.message || thrown);
    console.error('run-check falló:', message);
    await db
      .from('geo_checks')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error: message.slice(0, 500) })
      .eq('id', checkId);
    return fail(request, 'run_failed', message, 500);
  }
});
