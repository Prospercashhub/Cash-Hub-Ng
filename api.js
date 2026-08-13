// Cash Hub NG API adapter

const API_BASE = "https://cash-hub-ng2.onrender.com";

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
          }
