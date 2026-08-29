const BASE = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function headers() {
  return {
    apikey: KEY,
    authorization: `Bearer ${KEY}`,
    'content-type': 'application/json',
  };
}

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `Error ${response.status}`;
    const error = new Error(message);
    error.code = data.error?.code;
    throw error;
  }
  return data;
}

export function configured() {
  return Boolean(BASE && KEY);
}

export function createCheck(payload) {
  return post('/functions/v1/create-check', payload);
}

export function getCheck(id) {
  return post('/rest/v1/rpc/geo_get_check', { p_id: id });
}

export function getReport(id) {
  return post('/rest/v1/rpc/geo_get_report', { p_id: id });
}

export function saveLead(payload) {
  return post('/functions/v1/save-lead', payload);
}
