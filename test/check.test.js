import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, competitorRanking } from '../src/lib/check.js';
import { ENGINES } from '../src/lib/engines/index.js';

/**
 * Motor de mentira: responde según lo que diga la pregunta, sin red. Permite
 * probar el pool, el progreso y el cableado de las cifras sin gastar llamadas.
 */
function fakeEngine(id, respond) {
  return {
    id,
    label: id,
    configured: () => true,
    ask: async (question) => {
      await new Promise((r) => setTimeout(r, 1));
      const text = respond(question);
      return { engine: id, model: `${id}-test`, text, sources: [], ok: Boolean(text), error: text ? null : 'vacía', latencyMs: 1 };
    },
  };
}

// Nombra la marca cuando la pregunta la nombra; en discovery, nunca.
ENGINES.leal = fakeEngine('leal', (q) =>
  q.includes('Nektiu') ? 'Sí, Nektiu es una buena opción.' : 'Te recomiendo Sesderma y también Isdin.',
);
// Se cae siempre: sirve para comprobar que no contamina el denominador.
ENGINES.roto = fakeEngine('roto', () => '');

const BASE = { brand: 'Nektiu', sector: 'belleza', competitors: ['Sesderma', 'Isdin'] };

test('ejecuta pregunta × motor y separa las dos cifras', async () => {
  const result = await runCheck({ ...BASE, engines: ['leal'], perBlock: 5 });

  assert.equal(result.questions.length, 10);
  assert.equal(result.responses.length, 10, 'una respuesta por pregunta y motor');
  assert.equal(result.summary.explicit.frequency, 1, 'la nombran cuando la nombras');
  assert.equal(result.summary.discovery.frequency, 0, 'no aparece cuando no la nombras');
  assert.equal(result.summary.discovery.fraction, '0 de 5');
});

test('un motor caído no cuenta como "no te mencionan"', async () => {
  const result = await runCheck({ ...BASE, engines: ['leal', 'roto'], perBlock: 5 });

  assert.equal(result.responses.length, 20, 'se intentan todas');
  assert.equal(result.summary.explicit.attempted, 10);
  assert.equal(result.summary.explicit.answers, 5, 'solo entran las que respondieron');
  assert.equal(result.summary.explicit.frequency, 1, 'el motor caído no baja la frecuencia');
  assert.equal(result.summary.byEngine.roto.explicit.frequency, null);
});

test('informa del progreso en cada respuesta, sin saltarse ninguna', async () => {
  const vistos = [];
  const result = await runCheck({
    ...BASE,
    engines: ['leal'],
    perBlock: 4,
    concurrency: 3,
    onProgress: ({ done, total, record }) => vistos.push({ done, total, question: record.question }),
  });

  assert.equal(vistos.length, 8);
  assert.deepEqual(vistos.map((v) => v.done), [1, 2, 3, 4, 5, 6, 7, 8], 'el contador no se pisa');
  assert.equal(vistos.at(-1).total, 8);
  assert.equal(new Set(vistos.map((v) => v.question)).size, result.questions.length);
});

test('la concurrencia no altera el orden de los resultados', async () => {
  const result = await runCheck({ ...BASE, engines: ['leal'], perBlock: 6, concurrency: 5 });
  const esperado = [];
  for (const q of result.questions) esperado.push(q.text);

  assert.deepEqual([...new Set(result.responses.map((r) => r.question))], esperado);
});

test('cuenta qué competidores aparecen en tu lugar', async () => {
  const result = await runCheck({ ...BASE, engines: ['leal'], perBlock: 5 });
  const ranking = competitorRanking(result);

  assert.deepEqual(ranking.map((r) => r.name).sort(), ['Isdin', 'Sesderma']);
  assert.equal(ranking[0].mentions, 5, 'una vez por cada respuesta discovery');
});

test('arrastra los avisos de construcción de preguntas', async () => {
  const result = await runCheck({ brand: 'Natural', sector: 'belleza', engines: ['leal'], perBlock: 11 });
  assert.ok(result.warnings.length > 0);
});
