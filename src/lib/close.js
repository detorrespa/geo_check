/**
 * Cierre comercial del Check: agenda y correo.
 *
 * El remitente vive en el dominio que ya tiene el Scan en Resend. El reply-to
 * es clientes@nektiu.com, que es donde debe responder la persona.
 */
import { env } from './env.js';
import { formatPct } from './metrics.js';
import { SECTOR_LABELS } from './sectors/index.js';

export const AGENDA_URL = 'https://calendly.com/adetorres/reunion-nektiu';

export const DEFAULT_FROM = 'GEO Check · Nektiu <geo@contacto.nektiu.com>';
export const DEFAULT_REPLY_TO = 'clientes@nektiu.com';

function fraction(block) {
  if (!block || block.answers == null) return 'sin datos';
  return `${block.mentions} de ${block.answers} respuestas`;
}

function freq(block) {
  if (!block || block.frequency == null || block.frequency === '') return null;
  return Number(block.frequency);
}

export function reportEmail({ brand, sector, explicit, discovery }) {
  const name = brand || 'tu marca';
  const sectorLabel = SECTOR_LABELS[sector] || sector || '';
  const named = `${formatPct(freq(explicit))} (${fraction(explicit)})`;
  const hidden = `${formatPct(freq(discovery))} (${fraction(discovery)})`;
  const subject = `Tu GEO Check: ${name}`;

  const text = [
    `GEO Check · ${name}`,
    sectorLabel,
    '',
    `Cuando te nombran: ${named}`,
    `Cuando NO te nombran: ${hidden}`,
    '',
    'Esto no es un diagnóstico. Si quieres saber por qué no apareces y qué cambiar:',
    AGENDA_URL,
    '',
    `Baja: escribe a ${DEFAULT_REPLY_TO} con el asunto Baja GEO Check.`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f7f4ee;font-family:Segoe UI,Arial,sans-serif;color:#1c2430;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #d9d2c5;border-radius:12px;">
    <tr><td style="padding:24px 24px 8px;font-size:14px;color:#1a3c5e;font-weight:700;">GEO Check · Nektiu</td></tr>
    <tr><td style="padding:0 24px 8px;font-size:22px;color:#1a3c5e;font-weight:700;">${escapeHtml(name)}, en dos cifras</td></tr>
    <tr><td style="padding:0 24px 20px;font-size:14px;color:#5c6b7a;">${escapeHtml(sectorLabel)}</td></tr>
    <tr><td style="padding:0 24px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td width="50%" style="padding:12px;border:1px solid #d9d2c5;border-radius:10px;vertical-align:top;">
            <div style="font-size:12px;color:#5c6b7a;">Cuando te nombran</div>
            <div style="font-size:26px;color:#1a3c5e;font-weight:700;margin-top:6px;">${escapeHtml(formatPct(freq(explicit)))}</div>
            <div style="font-size:13px;margin-top:6px;">${escapeHtml(fraction(explicit))}</div>
          </td>
          <td width="12"></td>
          <td width="50%" style="padding:12px;border:1px solid #e8741a;background:#fff6ee;border-radius:10px;vertical-align:top;">
            <div style="font-size:12px;color:#5c6b7a;">Cuando NO te nombran</div>
            <div style="font-size:26px;color:#1a3c5e;font-weight:700;margin-top:6px;">${escapeHtml(formatPct(freq(discovery)))}</div>
            <div style="font-size:13px;margin-top:6px;">${escapeHtml(fraction(discovery))}</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:8px 24px 20px;font-size:14px;line-height:1.5;">
      Esto no es un diagnóstico. Si quieres saber por qué no apareces y qué cambiar, reserva 30 minutos.
    </td></tr>
    <tr><td style="padding:0 24px 24px;">
      <a href="${AGENDA_URL}" style="display:inline-block;background:#e8741a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">Reservar 30 minutos</a>
    </td></tr>
    <tr><td style="padding:0 24px 24px;font-size:12px;color:#5c6b7a;">
      Si no quieres más correos de GEO Check, escribe a
      <a href="mailto:${DEFAULT_REPLY_TO}?subject=Baja%20GEO%20Check" style="color:#2e86ab;">${DEFAULT_REPLY_TO}</a>.
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export async function sendReportEmail({ to, brand, sector, explicit, discovery }) {
  const key = env('RESEND_API_KEY');
  if (!key) {
    console.warn('RESEND_API_KEY sin definir: el informe no se envía por correo');
    return { sent: false, skipped: true };
  }

  const message = reportEmail({ brand, sector, explicit, discovery });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env('MAIL_FROM', DEFAULT_FROM),
      to: [to],
      reply_to: env('MAIL_REPLY_TO', DEFAULT_REPLY_TO),
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Resend HTTP ${response.status}: ${detail}`);
  }

  return { sent: true, skipped: false };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
