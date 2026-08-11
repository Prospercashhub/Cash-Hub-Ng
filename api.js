// Cash Hub NG V9 API adapter
// Central API connection for the deployed backend.

const API_BASE = "https://cash-hub-ng2.onrender.com";

async function api(path, options = {}) {
  const r = await fetch(API_BASE + path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

window.api = api;
