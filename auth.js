const STORAGE_KEY = "cashHubNgUsers";
const SESSION_KEY = "cashHubNgSession";

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

function normalizeServerUser(user) {
  // Map server user shape to the local in-browser shape used across the app
  return {
    id: user.id,
    name: user.full_name || user.name || "",
    full_name: user.full_name || user.name || "",
    email: user.email || "",
    balance: Number(user.balance || 0),
    earnings: Number(user.earnings || 0),
    referral_earnings: Number(user.referral_earnings || user.referralEarnings || 0),
    active_referrals: Number(user.active_referrals || user.activeReferrals || 0),
    // legacy UI expects `activeReferrals` camelCase in some places
    activeReferrals: Number(user.active_referrals || user.activeReferrals || 0),
    referral_code: user.referral_code || user.referralCode || "",
    referrals: user.referrals || [],
    transactions: user.transactions || [],
    withdrawals: user.withdrawals || [],
    completedTasks: user.completedTasks || []
  };
}

function saveLocalUser(user) {
  try {
    const users = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user;
    else users.unshift(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.error("Failed to save local user:", e);
  }
}

function setSession(user) {
  // Keep the small session object (used by pages to check login)
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, name: user.full_name || user.name, email: user.email }));

  // Also sync a local cached user entry so existing UI modules that read
  // cashHubNgUsers from localStorage keep working without requiring changes.
  try {
    const localUser = normalizeServerUser(user);
    saveLocalUser(localUser);
  } catch (e) {
    console.error("Failed to sync user to local cache:", e);
  }
}

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

      // Server returns the created user object. Use it to create a session
      // and keep a local cache so existing pages remain compatible.
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

      // Server returns user object. Persist session and sync a local cache entry
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

  // Populate profile page fields when present (keeps behavior consistent)
  const pfFull = document.getElementById('profile-fullname');
  const pfEmail = document.getElementById('profile-email');
  const pfId = document.getElementById('profile-id');
  const pfBal = document.getElementById('profile-balance');
  const pfTotal = document.getElementById('profile-total');
  const pfReferral = document.getElementById('profile-referral');
  const refCode = document.getElementById('ref-code');
  const refLink = document.getElementById('ref-link');
  const refCount = document.getElementById('ref-count');
  const refProgress = document.getElementById('ref-progress');
  const withdrawStatus = document.getElementById('withdraw-status');
  const withdrawMessage = document.getElementById('withdraw-message');

  if (pfFull) pfFull.textContent = profile.full_name || profile.name || session.name;
  if (pfEmail) pfEmail.textContent = profile.email || session.email;
  if (pfId) pfId.textContent = profile.id || session.id;
  if (pfBal) pfBal.textContent = "₦" + Number(profile.balance || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (pfTotal) pfTotal.textContent = "₦" + Number(profile.earnings || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (pfReferral) pfReferral.textContent = "₦" + Number(profile.referral_earnings || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (refCode) refCode.textContent = profile.referral_code || profile.referralCode || "";
  if (refLink) refLink.value = (location.origin || window.location.protocol + '//' + window.location.host) + '/signup.html?ref=' + (profile.referral_code || profile.referralCode || '');

  const activeRefs = Number(profile.active_referrals || profile.activeReferrals || 0);
  if (refCount) refCount.textContent = String(activeRefs);
  if (refProgress) { refProgress.value = activeRefs; refProgress.max = 5; }

  if (withdrawStatus) withdrawStatus.textContent = activeRefs >= 5 ? '🔓 Unlocked' : '🔒 Locked';
  if (withdrawMessage) withdrawMessage.innerHTML = activeRefs >= 5 ? 'Withdrawals unlocked.' : 'You need <strong>5 active referrals</strong> to unlock withdrawals.';

  // Update local cache with freshest profile from server
  try {
    saveLocalUser(normalizeServerUser(profile));
  } catch (e) { /* non-fatal */ }
}
