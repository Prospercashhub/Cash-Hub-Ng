// Cash Hub NG V9 API adapter
// Set API_BASE to your deployed API URL, then migrate frontend pages from localStorage to these functions.
const API_BASE = "https://cash-hub-ng.onrender.com";
async function api(path, options={}) {
  const r = await fetch(API_BASE + path, {credentials:"include", headers:{"Content-Type":"application/json",...(options.headers||{})}, ...options});
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
}
