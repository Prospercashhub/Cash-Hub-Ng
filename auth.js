const STORAGE_KEY = "cashHubNgUsers";
const SESSION_KEY = "cashHubNgSession";

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
function setSession(user) { localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, name: user.full_name || user.name, email: user.email })); }
function logout() { localStorage.removeItem(SESSION_KEY); window.location.href = "index.html"; }

async function setupSignup() {
  const form = document.getElementById("signup-form");
  const message = document.getElementById("auth-message");
  if (!form) return;

  // If the visitor arrived with a referral code, keep it and include on signup
  const urlRef = new URLSearchParams(location.search).get("ref") || sessionStorage.getItem("cashHubReferralCode");
  if (urlRef) sessionStorage.setItem("cashHubReferralCode", urlRef);

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
      const body = { full_name, email, password };
      const ref = sessionStorage.getItem('cashHubReferralCode');
      if (ref) body.referral_code = ref;

      const res = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        message.textContent = data.error || 'Signup failed.';
        return;
      }

      setSession(data.user);

      // Clear referral code after use
      sessionStorage.removeItem('cashHubReferralCode');

      window.location.href = "dashboard.html";

    } catch (err) {
      console.error(err);
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
        message.textContent = data.error || 'Login failed.';
        return;
      }

      setSession(data.user);

      window.location.href = "dashboard.html";

    } catch (err) {
      console.error(err);
      message.textContent = "Unable to connect to server.";
    }
  });
}

async function fetchProfile(userId){
  try{
    const res = await fetch(`/api/profile/${userId}`);
    if (!res.ok) return null;
    return await res.json();
  }catch(e){ return null; }
}

async function protectDashboard() {
  const session = getSession();
  if (!session) { window.location.href = "login.html"; return; }

  // Fetch fresh profile from server
  const profile = await fetchProfile(session.id);
  if (!profile) { logout(); return; }

  const nameEl = document.getElementById("user-name");
  const emailEl = document.getElementById("user-email");
  if (nameEl) nameEl.textContent = profile.full_name || profile.name || session.name;
  if (emailEl) emailEl.textContent = profile.email || session.email;

  const balance = document.getElementById("user-balance");
  const earnings = document.getElementById("user-earnings");
  const referrals = document.getElementById("user-referral-earnings");
  if (balance) balance.textContent = "₦" + Number(profile.balance || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (earnings) earnings.textContent = "₦" + Number(profile.earnings || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (referrals) referrals.textContent = "₦" + Number(profile.referral_earnings || profile.referralEarnings || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
