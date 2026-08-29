/**
 * POST /save-lead
 *
 * El muro: datos una sola vez, y a cambio el informe completo. Sin teléfono,
 * sin doble muro, y siempre DESPUÉS de haber enseñado las dos cifras.
 *
 * Guardar el lead es lo que desbloquea `geo_get_report`, así que el muro vive
 * en la base de datos y no en el JavaScript del navegador.
 */
import { preflight, json, fail } from '../_shared/http.ts';
import { serviceClient } from '../_shared/db.ts';
import { isPlausibleEmail } from '../../../src/lib/domain.js';
import { sendReportEmail } from '../../../src/lib/close.js';

Deno.serve(async (request: Request) => {
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== 'POST') return fail(request, 'method_not_allowed', 'Usa POST.', 405);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(request, 'bad_json', 'El cuerpo no es JSON válido.');
  }

  const checkId = String(body.checkId || '').trim();
  const email = String(body.email || '').trim();
  const company = String(body.company || '').trim().slice(0, 160);
  const jobRole = String(body.role || '').trim().slice(0, 120);
  const consentText = String(body.consentText || '').trim();

  if (!checkId) return fail(request, 'bad_request', 'Falta checkId.');
  // Permisivo a propósito: el brief pide recomendar el correo profesional, no
  // exigirlo. Se valida el dominio de la MARCA, no el del correo.
  if (!isPlausibleEmail(email)) return fail(request, 'bad_email', 'Ese correo no parece válido.');
  if (body.consent !== true) {
    return fail(request, 'consent_required', 'Hace falta aceptar la política de privacidad.');
  }
  if (consentText.length < 10) {
    // Sin el texto literal no se puede demostrar qué aceptó esta persona.
    return fail(request, 'consent_text_required', 'Falta el texto del consentimiento.');
  }

  const db = serviceClient();

  const { data: check, error: checkError } = await db
    .from('geo_checks')
    .select(
      'id, status, brand_name, sector, mentions_explicit, answers_explicit, freq_explicit, mentions_discovery, answers_discovery, freq_discovery',
    )
    .eq('id', checkId)
    .single();

  if (checkError || !check) return fail(request, 'not_found', 'Check no encontrado.', 404);
  if (check.status !== 'done') {
    return fail(request, 'not_ready', 'El análisis todavía no ha terminado.', 409);
  }

  const { error: insertError } = await db.from('geo_leads').upsert(
    {
      check_id: checkId,
      email,
      company: company || null,
      job_role: jobRole || null,
      consent: true,
      consent_at: new Date().toISOString(),
      consent_text: consentText,
      utm: typeof body.utm === 'object' && body.utm !== null ? body.utm : {},
    },
    { onConflict: 'check_id' },
  );

  if (insertError) return fail(request, 'db_error', insertError.message, 500);

  // El lead ya está guardado: si Resend falla, la persona sigue viendo el
  // informe en pantalla. El correo no puede ser la única copia.
  let mailed = false;
  try {
    const result = await sendReportEmail({
      to: email,
      brand: check.brand_name,
      sector: check.sector,
      explicit: {
        mentions: check.mentions_explicit,
        answers: check.answers_explicit,
        frequency: check.freq_explicit,
      },
      discovery: {
        mentions: check.mentions_discovery,
        answers: check.answers_discovery,
        frequency: check.freq_discovery,
      },
    });
    mailed = Boolean(result.sent);
  } catch (error) {
    console.error('No se pudo enviar el informe:', (error as Error).message);
  }

  return json(request, { ok: true, checkId, mailed });
});
