const telegram = window.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
const initData = telegram?.initData || '';

export async function api(url, options = {}) {
  if (!initData) throw new Error('Open this Admin Panel from your Admin Telegram Bot.');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `tma ${initData}`,
    ...(options.headers || {})
  };
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const raw = await response.text();
    throw new Error(`Server returned a non-JSON response (HTTP ${response.status}): ${raw.slice(0, 160)}`);
  }
  const result = await response.json();
  if (!response.ok || result.success === false) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return result;
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
