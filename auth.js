
const STORAGE_KEY = "cashHubNgUsers";
const SESSION_KEY = "cashHubNgSession";

function getUsers() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveUsers(users) { localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); }
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
function setSession(user) { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function logout() { localStorage.removeItem(SESSION_KEY); window.location.href = "index.html"; }

function setupSignup() {
  const form = document.getElementById("signup-form");
  const message = document.getElementById("auth-message");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("full-name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirm-password").value;
    if (password !== confirm) return message.textContent = "Passwords do not match.";
    const users = getUsers();
    if (users.some(u => u.email === email)) return message.textContent = "An account with this email already exists.";
    const user = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, email, password, balance: 0, earnings: 0, referralEarnings: 0, createdAt: new Date().toISOString() };
    users.push(user); saveUsers(users); if(typeof attachReferralToNewUser==="function") attachReferralToNewUser(user); setSession({id:user.id,name:user.name,email:user.email});
    window.location.href = "dashboard.html";
  });
}

function setupLogin() {
  const form = document.getElementById("login-form");
  const message = document.getElementById("auth-message");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const user = getUsers().find(u => u.email === email && u.password === password);
    if (!user) return message.textContent = "Invalid email or password.";
    setSession({id:user.id,name:user.name,email:user.email});
    window.location.href = "dashboard.html";
  });
}

function protectDashboard() {
  const session = getSession();
  if (!session) { window.location.href = "login.html"; return; }
  const nameEl = document.getElementById("user-name");
  const emailEl = document.getElementById("user-email");
  if (nameEl) nameEl.textContent = session.name;
  if (emailEl) emailEl.textContent = session.email;
  const user = getUsers().find(u => u.id === session.id);
  if (user) {
    const balance = document.getElementById("user-balance");
    const earnings = document.getElementById("user-earnings");
    const referrals = document.getElementById("user-referral-earnings");
    if (balance) balance.textContent = "$" + Number(user.balance || 0).toFixed(2);
    if (earnings) earnings.textContent = "$" + Number(user.earnings || 0).toFixed(2);
    if (referrals) referrals.textContent = "$" + Number(user.referralEarnings || 0).toFixed(2);
  }
}
