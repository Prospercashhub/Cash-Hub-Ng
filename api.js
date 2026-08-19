// Cash Hub NG API adapter

const API_BASE = "https://cash-hub-ng2.onrender.com";

async function api(path, options = {}) {
  const requestOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  // Do not send browser credentials across origins.
  delete requestOptions.credentials;

  let response;

  try {
    response = await fetch(
      API_BASE + path,
      requestOptions
    );
  } catch (error) {
    console.error("API network error:", error);

    throw new Error(
      "Unable to connect to Cash Hub NG server."
    );
  }

  let data = {};

  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

window.api = api;
