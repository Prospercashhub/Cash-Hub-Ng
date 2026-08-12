// Cash Hub NG API adapter
// Central connection to the deployed backend.

const API_BASE = "https://cash-hub-ng2.onrender.com";

async function api(path, options = {}) {
  const fetchOptions = {
    ...options,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  const response = await fetch(
    API_BASE + path,
    fetchOptions
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || "Request failed"
    );
  }

  return data;
}

window.api = api;
