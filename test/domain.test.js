import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, isValidDomain, isPlausibleEmail } from '../src/lib/domain.js';

test('todas las formas de escribir el mismo dominio dan la misma clave', () => {
  // Si esto falla, dos personas de la misma empresa gastan dos ejecuciones
  // en vez de compartir el resultado guardado.
  const esperado = 'freshlycosmetics.es';
  for (const entrada of [
    'freshlycosmetics.es',
    'FreshlyCosmetics.ES',
    'www.freshlycosmetics.es',
    'https://freshlycosmetics.es',
    'https://www.FreshlyCosmetics.es/productos?utm=x',
    '  freshlycosmetics.es/  ',
    'http://freshlycosmetics.es.',
  ]) {
    assert.equal(normalizeDomain(entrada), esperado, `falla con: ${entrada}`);
  }
});

test('conserva los subdominios que no son www', () => {
  assert.equal(normalizeDomain('tienda.marca.es'), 'tienda.marca.es');
  assert.equal(normalizeDomain('www.tienda.marca.es'), 'tienda.marca.es');
});

test('rechaza lo que no es un dominio', () => {
  for (const basura of ['', '   ', 'marca', 'http://', 'localhost', '192.168.1.1', 'con espacios.es', null, undefined]) {
    assert.equal(normalizeDomain(basura), '', `debería rechazar: ${JSON.stringify(basura)}`);
  }
  assert.equal(isValidDomain('marca.es'), true);
  assert.equal(isValidDomain('marca'), false);
});

test('el correo se valida con manga ancha, a propósito', () => {
  // Gmail entra: el brief pide validar el dominio de la marca, no el del
  // correo. Un filtro corporativo estricto cuesta leads legítimos.
  assert.equal(isPlausibleEmail('ana@gmail.com'), true);
  assert.equal(isPlausibleEmail('ana.lopez@marca.es'), true);
  assert.equal(isPlausibleEmail('ana@sub.marca.co.uk'), true);
});

test('pero rechaza lo que no llegaría a ningún buzón', () => {
  for (const malo of ['', 'ana', 'ana@', '@marca.es', 'ana@marca', 'ana con espacio@marca.es', 'a@b@c.es']) {
    assert.equal(isPlausibleEmail(malo), false, `debería rechazar: ${malo}`);
  }
});
