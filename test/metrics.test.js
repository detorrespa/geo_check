import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brandNameInText,
  stripLeadingPromptEcho,
  brandInAnswer,
  competitorsInAnswer,
  mentionRank,
  summarizeBlock,
  summarize,
  formatPct,
} from '../src/lib/metrics.js';

test('detecta la marca ignorando mayúsculas y puntuación alrededor', () => {
  assert.equal(brandNameInText('Nektiu', 'Te recomiendo NEKTIU, sin duda.'), true);
  assert.equal(brandNameInText('Nektiu', '¿Conoces Nektiu?'), true);
  assert.equal(brandNameInText('Nektiu', 'No hay nada parecido.'), false);
});

test('respeta acentos y ñ como parte de la palabra', () => {
  assert.equal(brandNameInText('Beñat', 'La marca Beñat es conocida.'), true);
  assert.equal(brandNameInText('Iman', 'Su imán es fuerte.'), false);
});

test('no cuenta la marca cuando es parte de otra palabra', () => {
  // El falso positivo que la versión con subcadena de metrics.py sí comete.
  assert.equal(brandNameInText('Natura', 'Busca cosmética natural certificada.'), false);
  assert.equal(brandNameInText('Natura', 'Natura tiene buena reputación.'), true);
});

test('marcas de dos palabras cuentan aunque aparezcan separadas', () => {
  assert.equal(brandNameInText('Laboratorios Vidal', 'Vidal, de los laboratorios de siempre.'), true);
  assert.equal(brandNameInText('Laboratorios Vidal', 'Solo menciona a Vidal.'), false);
});

test('recorta el eco de la pregunta al principio de la respuesta', () => {
  const prompt = '¿Qué opinas de Nektiu como consultora de IA?';
  const answer = `${prompt}\n\n— Es una empresa española.`;
  assert.equal(stripLeadingPromptEcho(answer, prompt), 'Es una empresa española.');
});

test('recorta el eco aunque el motor reformule el final de la pregunta', () => {
  const prompt = 'Cuéntame qué marcas de cosmética natural están mejor valoradas en España este año';
  const answer = `${prompt.slice(0, 96)} y en Portugal: destacan varias.`;
  assert.equal(stripLeadingPromptEcho(answer, prompt).startsWith('y en Portugal'), true);
});

test('el eco no puede inflar la cifra', () => {
  // Sin recortar, la marca "aparecería" solo porque el motor repitió la pregunta.
  const prompt = '¿Qué opinas de Nektiu?';
  const answer = '¿Qué opinas de Nektiu? No tengo información sobre esa empresa.';
  assert.equal(brandNameInText('Nektiu', answer), true);
  assert.equal(brandInAnswer('Nektiu', prompt, answer), false);
});

test('detecta competidores y su orden de aparición', () => {
  const prompt = '¿Qué cosmética natural me recomiendas?';
  const answer = 'Destacan Sesderma e Isdin, y también Nektiu.';
  assert.deepEqual(competitorsInAnswer(['Sesderma', 'Isdin', 'Babé'], prompt, answer), ['Sesderma', 'Isdin']);
  assert.equal(mentionRank('Nektiu', ['Sesderma', 'Isdin'], prompt, answer), 3);
  assert.equal(mentionRank('Nektiu', [], prompt, answer), 1);
  assert.equal(mentionRank('Nektiu', [], prompt, 'Aquí no sale.'), null);
});

test('las respuestas sin datos quedan fuera del denominador', () => {
  const responses = [
    { question: 'p1', text: 'Sale Nektiu.', ok: true },
    { question: 'p2', text: 'No sale nadie.', ok: true },
    { question: 'p3', text: '', ok: false, error: 'timeout' },
  ];
  const block = summarizeBlock('Nektiu', responses);

  assert.equal(block.answers, 2, 'el fallo no cuenta como respuesta');
  assert.equal(block.attempted, 3);
  assert.equal(block.mentions, 1);
  assert.equal(block.frequency, 0.5, 'un fallo no puede hundir la frecuencia');
  assert.equal(block.fraction, '1 de 2');
});

test('sin ninguna respuesta usable la frecuencia es nula, no cero', () => {
  const block = summarizeBlock('Nektiu', [{ question: 'p', text: '', ok: false }]);
  assert.equal(block.frequency, null, '0 % afirmaría algo que no hemos medido');
  assert.equal(block.fraction, 'sin datos');
  assert.equal(formatPct(block.frequency), '—');
});

test('separa las dos cifras y las desglosa por motor', () => {
  const responses = [
    { question: 'a', block: 'explicit', engine: 'openai', text: 'Nektiu es española.', ok: true },
    { question: 'b', block: 'explicit', engine: 'google', text: 'No la conozco.', ok: true },
    { question: 'c', block: 'discovery', engine: 'openai', text: 'Te recomiendo otras.', ok: true },
    { question: 'd', block: 'discovery', engine: 'google', text: 'Otras opciones.', ok: true },
  ];
  const summary = summarize('Nektiu', responses);

  assert.equal(summary.explicit.frequency, 0.5);
  assert.equal(summary.discovery.frequency, 0);
  assert.equal(summary.byEngine.openai.explicit.fraction, '1 de 1');
  assert.equal(summary.byEngine.google.explicit.fraction, '0 de 1');
});

test('el porcentaje se formatea en castellano', () => {
  assert.equal(formatPct(18 / 22), '81,8 %');
  assert.equal(formatPct(1 / 22), '4,5 %');
  assert.equal(formatPct(0), '0,0 %');
});
