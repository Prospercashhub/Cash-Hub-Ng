
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

async function setupSignup() {
  const form = document.getElementById("signup-form");
  const message = document.getElementById("auth-message");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("full-name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirm-password").value;

    if (password !== confirm) {
      message.textContent = "Passwords do not match.";
      return;
    }

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          full_name,
          email,
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        message.textContent = data.error;
        return;
      }

      setSession({
        id: data.user.id,
        name: data.user.full_name,
        email: data.user.email
      });

      window.location.href = "dashboard.html";

    } catch (err) {
      message.textContent = "Unable to connect to server.";
    }
  });
      }

async function setupLogin() {
  const form = document.getElementById("login-form");
  const message = document.getElementById("auth-message");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        message.textContent = data.error;
        return;
      }

      setSession({
        id: data.user.id,
        name: data.user.full_name,
        email: data.user.email
      });

      window.location.href = "dashboard.html";

    } catch (err) {
      message.textContent = "Unable to connect to server.";
    }
  });
    }
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
