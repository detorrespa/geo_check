import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENDA_URL, reportEmail } from '../src/lib/close.js';

test('el correo enseña las dos cifras y el enlace de agenda', () => {
  const mail = reportEmail({
    brand: 'Freshly Cosmetics',
    sector: 'belleza',
    explicit: { mentions: 21, answers: 22, frequency: 0.9545 },
    discovery: { mentions: 0, answers: 22, frequency: 0 },
  });

  assert.match(mail.subject, /Freshly Cosmetics/);
  assert.match(mail.text, /21 de 22/);
  assert.match(mail.text, /0 de 22/);
  assert.equal(mail.text.includes(AGENDA_URL), true);
  assert.match(mail.html, /95,5 %/);
  assert.match(mail.html, /0,0 %/);
  assert.equal(mail.html.includes(AGENDA_URL), true);
  assert.match(mail.html, /Reservar 30 minutos/);
  assert.equal(mail.html.includes('<script'), false);
});
