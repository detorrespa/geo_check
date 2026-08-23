import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceDomain, modelChain } from '../src/lib/engines/gemini.js';

test('la fuente sale del título, no del redirector de Google', () => {
  // Comprobado contra la API: `uri` es siempre un enlace de
  // vertexaisearch.cloud.google.com, así que parsearlo daría ese mismo host
  // para las once fuentes de una respuesta.
  const chunk = {
    uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQESxqvn1Pa2',
    title: 'laboratoriosvesna.es',
  };
  assert.equal(sourceDomain(chunk), 'laboratoriosvesna.es');
});

test('descarta el redirector cuando no hay título aprovechable', () => {
  assert.equal(
    sourceDomain({ uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x', title: 'Guía de compra' }),
    '',
  );
});

test('usa el host real cuando la cita trae una URL de verdad', () => {
  assert.equal(sourceDomain({ uri: 'https://www.Vogue.ES/belleza/articulo', title: 'Vogue España' }), 'www.vogue.es');
});

test('tolera citas incompletas sin romper el análisis', () => {
  assert.equal(sourceDomain({}), '');
  assert.equal(sourceDomain(), '');
  assert.equal(sourceDomain({ uri: 'no-es-una-url' }), '');
});

test('un modelo retirado en la configuración se sustituye por uno vivo', () => {
  const previo = process.env.GOOGLE_MODEL;
  try {
    process.env.GOOGLE_MODEL = 'gemini-2.5-flash';
    const chain = modelChain();
    assert.equal(chain.includes('gemini-2.5-flash'), false, 'no puede quedar un modelo retirado en la cadena');
    assert.ok(chain.length > 0);

    process.env.GOOGLE_MODEL = 'gemini-3.6-flash';
    assert.equal(modelChain()[0], 'gemini-3.6-flash', 'el modelo pedido va primero');

    delete process.env.GOOGLE_MODEL;
    assert.ok(modelChain().length >= 3, 'sin configuración quedan los de reserva');
  } finally {
    if (previo === undefined) delete process.env.GOOGLE_MODEL;
    else process.env.GOOGLE_MODEL = previo;
  }
});
