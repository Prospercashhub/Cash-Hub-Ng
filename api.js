// Cash Hub NG central API adapter
// Centralizes backend calls and exposes window.api for legacy scripts
const API_BASE = "https://cash-hub-ng2.onrender.com";

async function api(path, options = {}) {
  const isFull = typeof path === 'string' && (path.startsWith('http://') || path.startsWith('https://'));
  const url = isFull ? path : (API_BASE + path);

  const merged = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  };

  const res = await fetch(url, merged);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Expose for legacy scripts
window.api = api;
