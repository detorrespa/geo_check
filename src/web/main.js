import { AGENDA_URL } from '../lib/close.js';
import { availableSectors, SECTOR_LABELS } from '../lib/sectors/index.js';
import { isValidDomain, isPlausibleEmail } from '../lib/domain.js';
import { formatPct } from '../lib/metrics.js';
import { configured, createCheck, getCheck, getReport, saveLead } from './api.js';

export const CONSENT_TEXT =
  'Acepto que Nektiu trate mi correo, empresa y cargo para enviarme el informe del GEO Check y contactarme sobre el Diagnóstico GEO. Entiendo que el análisis consulta modelos de lenguaje de terceros (OpenAI y Google).';

const POLL_MS = 2000;
const readySectors = new Set(availableSectors());

const ui = {
  form: document.querySelector('#screen-form'),
  progress: document.querySelector('#screen-progress'),
  result: document.querySelector('#screen-result'),
  formCheck: document.querySelector('#form-check'),
  formLead: document.querySelector('#form-lead'),
  formError: document.querySelector('#form-error'),
  resultError: document.querySelector('#result-error'),
  wallError: document.querySelector('#wall-error'),
  sector: document.querySelector('#sector'),
  btnCheck: document.querySelector('#btn-check'),
  btnLead: document.querySelector('#btn-lead'),
  progressLabel: document.querySelector('#progress-label'),
  progressBrand: document.querySelector('#progress-brand'),
  progressBar: document.querySelector('#progress-bar'),
  questionList: document.querySelector('#question-list'),
  resultTitle: document.querySelector('#result-title'),
  resultLede: document.querySelector('#result-lede'),
  pctExplicit: document.querySelector('#pct-explicit'),
  fracExplicit: document.querySelector('#frac-explicit'),
  pctDiscovery: document.querySelector('#pct-discovery'),
  fracDiscovery: document.querySelector('#frac-discovery'),
  wall: document.querySelector('#wall'),
  report: document.querySelector('#report'),
  rivalList: document.querySelector('#rival-list'),
  engineList: document.querySelector('#engine-list'),
  consentText: document.querySelector('#consent-text'),
};

let pollTimer = null;
let currentId = null;

function show(screen) {
  ui.form.classList.toggle('hidden', screen !== 'form');
  ui.progress.classList.toggle('hidden', screen !== 'progress');
  ui.result.classList.toggle('hidden', screen !== 'result');
}

function setError(node, message) {
  node.textContent = message || '';
  node.classList.toggle('hidden', !message);
}

function utmFromUrl() {
  const params = new URLSearchParams(location.search);
  const utm = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }
  return utm;
}

function checkIdFromUrl() {
  return new URLSearchParams(location.search).get('c') || '';
}

function setCheckUrl(id) {
  const url = new URL(location.href);
  url.searchParams.set('c', id);
  history.replaceState(null, '', url);
}

function fillSectors() {
  ui.sector.innerHTML = '<option value="">Elige un sector</option>';
  for (const [id, label] of Object.entries(SECTOR_LABELS)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = readySectors.has(id) ? label : `${label} (próximamente)`;
    option.disabled = !readySectors.has(id);
    ui.sector.append(option);
  }
}

function fraction(block) {
  if (!block || block.answers == null) return 'sin datos';
  return `${block.mentions} de ${block.answers} respuestas`;
}

function asFrequency(block) {
  if (!block || block.frequency == null || block.frequency === '') return null;
  return Number(block.frequency);
}

function renderFigures(check) {
  ui.resultTitle.textContent = check.brand ? `${check.brand}, en dos cifras` : 'Tu marca, en dos cifras';
  ui.resultLede.textContent = check.sector ? SECTOR_LABELS[check.sector] || check.sector : '';
  ui.pctExplicit.textContent = formatPct(asFrequency(check.explicit));
  ui.fracExplicit.textContent = fraction(check.explicit);
  ui.pctDiscovery.textContent = formatPct(asFrequency(check.discovery));
  ui.fracDiscovery.textContent = fraction(check.discovery);
}

function marksFor(question, progress) {
  const rows = (progress || []).filter((p) => p.question === question);
  return ['openai', 'google'].map((engine) => {
    const row = rows.find((p) => p.engine === engine);
    if (!row) return '';
    if (!row.answered) return 'fail';
    return row.mentioned ? 'mentioned' : 'missed';
  });
}

function renderQuestions(questions, progress) {
  const items = questions || [];
  ui.questionList.innerHTML = items
    .map((q) => {
      const text = typeof q === 'string' ? q : q.text;
      const [a, b] = marksFor(text, progress);
      return `<li><div class="marks"><i class="dot ${a}" title="ChatGPT"></i><i class="dot ${b}" title="Google"></i></div><div>${text}</div></li>`;
    })
    .join('');
}

function renderProgress(check) {
  const done = Number(check.done || 0);
  const total = Number(check.total || 0) || 1;
  ui.progressBrand.textContent = check.brand || '';
  ui.progressLabel.textContent = `${done} de ${check.total || 0}`;
  ui.progressBar.style.width = `${Math.min(100, (done / total) * 100)}%`;
  renderQuestions(check.questions, check.progress);
}

function engineLabel(id) {
  return id === 'openai' ? 'ChatGPT' : id === 'google' ? 'Google' : id;
}

function renderReport(report) {
  const counts = new Map();
  const byEngine = {};
  for (const row of report.responses || []) {
    for (const name of row.competitors || []) counts.set(name, (counts.get(name) || 0) + 1);
    byEngine[row.engine] ||= { explicit: { mentions: 0, answers: 0 }, discovery: { mentions: 0, answers: 0 } };
    if (!row.answered) continue;
    const block = byEngine[row.engine][row.block];
    if (!block) continue;
    block.answers += 1;
    if (row.mentioned) block.mentions += 1;
  }

  const rivals = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  ui.rivalList.innerHTML = rivals.length
    ? rivals.map(([name, n]) => `<li>${name} · ${n} menciones</li>`).join('')
    : '<li>En este análisis no ha salido ningún competidor del formulario.</li>';

  ui.engineList.innerHTML = Object.entries(byEngine)
    .map(([engine, blocks]) => {
      const explicit = `${blocks.explicit.mentions} de ${blocks.explicit.answers}`;
      const discovery = `${blocks.discovery.mentions} de ${blocks.discovery.answers}`;
      return `<li>${engineLabel(engine)} · nombrada ${explicit} · discovery ${discovery}</li>`;
    })
    .join('');
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function showFinished(check) {
  stopPolling();
  renderFigures(check);
  show('result');
  if (check.hasLead) {
    ui.wall.classList.add('hidden');
    const report = await getReport(check.id);
    if (report) {
      ui.report.classList.remove('hidden');
      renderReport(report);
    }
  } else {
    ui.report.classList.add('hidden');
    ui.wall.classList.remove('hidden');
  }
}

async function refreshCheck(id) {
  const check = await getCheck(id);
  if (!check) throw new Error('No encontramos ese análisis.');
  if (check.status === 'failed') {
    stopPolling();
    show('result');
    renderFigures(check);
    ui.wall.classList.add('hidden');
    setError(ui.resultError, check.error || 'El análisis no ha podido terminar.');
    return;
  }
  if (check.status === 'done') {
    await showFinished(check);
    return;
  }
  renderProgress(check);
  show('progress');
}

function startPolling(id) {
  stopPolling();
  currentId = id;
  pollTimer = setInterval(() => {
    refreshCheck(id).catch((error) => {
      stopPolling();
      show('form');
      setError(ui.formError, error.message);
    });
  }, POLL_MS);
}

async function onCreate(event) {
  event.preventDefault();
  setError(ui.formError, '');

  const data = new FormData(ui.formCheck);
  const brand = String(data.get('brand') || '').trim();
  const domain = String(data.get('domain') || '').trim();
  const sector = String(data.get('sector') || '').trim();
  const competitors = ['rival1', 'rival2', 'rival3']
    .map((key) => String(data.get(key) || '').trim())
    .filter(Boolean);

  if (brand.length < 2) return setError(ui.formError, 'El nombre de la marca debe tener al menos 2 caracteres.');
  if (!domain || !isValidDomain(domain)) return setError(ui.formError, 'Indica la web de la marca (tu-marca.es).');
  if (!readySectors.has(sector)) return setError(ui.formError, 'Elige un sector disponible.');

  ui.btnCheck.disabled = true;
  try {
    const created = await createCheck({ brand, domain, sector, competitors, utm: utmFromUrl() });
    currentId = created.id;
    setCheckUrl(created.id);
    if (created.questions) renderProgress({ ...created, brand, done: 0, progress: [] });
    show('progress');
    await refreshCheck(created.id);
    if (created.cached) return;
    startPolling(created.id);
  } catch (error) {
    setError(ui.formError, error.message);
    show('form');
  } finally {
    ui.btnCheck.disabled = false;
  }
}

async function onLead(event) {
  event.preventDefault();
  setError(ui.wallError, '');
  const data = new FormData(ui.formLead);
  const email = String(data.get('email') || '').trim();
  const company = String(data.get('company') || '').trim();
  const role = String(data.get('role') || '').trim();
  const consent = document.querySelector('#consent').checked;

  if (!isPlausibleEmail(email)) return setError(ui.wallError, 'Ese correo no parece válido.');
  if (!consent) return setError(ui.wallError, 'Hace falta aceptar la política de privacidad.');
  if (!currentId) return setError(ui.wallError, 'Falta el análisis.');

  ui.btnLead.disabled = true;
  try {
    await saveLead({
      checkId: currentId,
      email,
      company,
      role,
      consent: true,
      consentText: CONSENT_TEXT,
      utm: utmFromUrl(),
    });
    await refreshCheck(currentId);
  } catch (error) {
    setError(ui.wallError, error.message);
  } finally {
    ui.btnLead.disabled = false;
  }
}

async function boot() {
  fillSectors();
  ui.consentText.textContent = CONSENT_TEXT;
  ui.formCheck.addEventListener('submit', onCreate);
  ui.formLead.addEventListener('submit', onLead);
  document.querySelector('#btn-print')?.addEventListener('click', () => window.print());
  const agenda = document.querySelector('#agenda-link');
  if (agenda) agenda.href = AGENDA_URL;

  if (!configured()) {
    setError(ui.formError, 'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el entorno.');
    return;
  }

  const existing = checkIdFromUrl();
  if (!existing) return;
  currentId = existing;
  try {
    await refreshCheck(existing);
    if (!ui.progress.classList.contains('hidden')) startPolling(existing);
  } catch (error) {
    setError(ui.formError, error.message);
    show('form');
  }
}

boot();
