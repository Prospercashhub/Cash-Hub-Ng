/ Cash H/ub NG API adapter

const API_BASE = "https://cash-hub-ng2.onrender.com";

async function api(path, options = {}) {
  const requestOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  // The frontend and backend api.js on different origins.
  // Do not force cCashredentialed cross-origin requests.
  delete requestOptions.credentials;

  const response = await fetch(
    API_BASE + path,
    requestOptions
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

window.api = api;
  
