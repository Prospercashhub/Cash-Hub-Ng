// Cash Hub NG — Server-backed authentication
// Uses the Render API + Neon PostgreSQL backend.
// Only the login session is stored locally.
// User balances, earnings, referrals, etc. come from the server.

const SESSION_KEY = "cashHubNgSession";

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function setSession(user) {
  if (!user || !user.id) {
    throw new Error("Invalid user session.");
  }

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      id: user.id,
      name: user.full_name || user.name || "",
      email: user.email || ""
    })
  );
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
}


// ================= SIGNUP =================

async function setupSignup() {
  const form = document.getElementById("signup-form");
  const message = document.getElementById("auth-message");

  if (!form) return;

  // Read referral code from the URL.
  const urlRef =
    new URLSearchParams(window.location.search).get("ref") ||
    sessionStorage.getItem("cashHubReferralCode");

  if (urlRef) {
    sessionStorage.setItem(
      "cashHubReferralCode",
      String(urlRef)
    );
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (message) {
      message.textContent = "";
    }

    const fullNameEl = document.getElementById("full-name");
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const confirmEl = document.getElementById("confirm-password");

    if (!fullNameEl || !emailEl || !passwordEl || !confirmEl) {
      if (message) {
        message.textContent = "Signup form is incomplete.";
      }
      return;
    }

    const full_name = fullNameEl.value.trim();
    const email = emailEl.value.trim().toLowerCase();
    const password = passwordEl.value;
    const confirm = confirmEl.value;

    if (!full_name) {
      message.textContent = "Please enter your full name.";
      return;
    }

    if (!email) {
      message.textContent = "Please enter your email address.";
      return;
    }

    if (!password) {
      message.textContent = "Please enter a password.";
      return;
    }

    if (password !== confirm) {
      message.textContent = "Passwords do not match.";
      return;
    }

    if (password.length < 6) {
      message.textContent =
        "Password must be at least 6 characters.";
      return;
    }

    try {
      const body = {
        full_name,
        email,
        password
      };

      const referralCode =
        sessionStorage.getItem("cashHubReferralCode");

      if (referralCode) {
        body.referral_code = referralCode;
      }

      // IMPORTANT:
      // api.js must be loaded before auth.js.
      if (typeof api !== "function") {
        throw new Error(
          "API is not loaded. Please make sure api.js is loaded before auth.js."
        );
      }

      const data = await api("/api/signup", {
        method: "POST",
        body: JSON.stringify(body)
      });

      if (!data || !data.user) {
        throw new Error("Signup succeeded but no user was returned.");
      }

      setSession(data.user);

      sessionStorage.removeItem("cashHubReferralCode");

      window.location.href = "dashboard.html";

    } catch (err) {
      console.error("Signup error:", err);

      if (message) {
        message.textContent =
          err.message || "Unable to create account.";
      }
    }
  });
}


// ================= LOGIN =================

async function setupLogin() {
  const form = document.getElementById("login-form");
  const message = document.getElementById("auth-message");

  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (message) {
      message.textContent = "";
    }

    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");

    if (!emailEl || !passwordEl) {
      if (message) {
        message.textContent = "Login form is incomplete.";
      }
      return;
    }

    const email = emailEl.value.trim().toLowerCase();
    const password = passwordEl.value;

    if (!email || !password) {
      message.textContent =
        "Please enter your email and password.";
      return;
    }

    try {
      // IMPORTANT:
      // api.js must be loaded before auth.js.
      if (typeof api !== "function") {
        throw new Error(
          "API is not loaded. Please make sure api.js is loaded before auth.js."
        );
      }

      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password
        })
      });

      if (!data || !data.user) {
        throw new Error("Login succeeded but no user was returned.");
      }

      setSession(data.user);

      window.location.href = "dashboard.html";

    } catch (err) {
      console.error("Login error:", err);

      if (message) {
        message.textContent =
          err.message || "Login failed.";
      }
    }
  });
}


// ================= PROFILE / DASHBOARD =================

async function fetchProfile(userId) {
  if (!userId) return null;

  try {
    if (typeof api !== "function") {
      throw new Error("API is not loaded.");
    }

    return await api(
      `/api/profile/${encodeURIComponent(userId)}`
    );

  } catch (e) {
    console.error("fetchProfile error:", e);
    return null;
  }
}


async function protectDashboard() {
  const session = getSession();

  if (!session || !session.id) {
    window.location.href = "login.html";
    return;
  }

  const profile = await fetchProfile(session.id);

  if (!profile) {
    logout();
    return;
  }

  // Keep the session name/email current.
  setSession(profile);

  const name =
    profile.full_name ||
    profile.name ||
    session.name ||
    "Member";

  const email =
    profile.email ||
    session.email ||
    "";

  // Dashboard user information
  const userName = document.getElementById("user-name");
  const userEmail = document.getElementById("user-email");

  if (userName) {
    userName.textContent = name;
  }

  if (userEmail) {
    userEmail.textContent = email;
  }


  // Dashboard balance
  const balanceEl =
    document.getElementById("user-balance");

  const earningsEl =
    document.getElementById("user-earnings");

  const referralEarningsEl =
    document.getElementById("user-referral-earnings");

  if (balanceEl) {
    balanceEl.textContent =
      "₦" +
      Number(profile.balance || 0).toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }

  if (earningsEl) {
    earningsEl.textContent =
      "₦" +
      Number(profile.earnings || 0).toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }

  if (referralEarningsEl) {
    referralEarningsEl.textContent =
      "₦" +
      Number(
        profile.referral_earnings ||
        profile.referralEarnings ||
        0
      ).toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }


  // ================= PROFILE PAGE =================

  const profileFullName =
    document.getElementById("profile-fullname");

  const profileEmail =
    document.getElementById("profile-email");

  const profileId =
    document.getElementById("profile-id");

  const profileBalance =
    document.getElementById("profile-balance");

  const profileTotal =
    document.getElementById("profile-total");

  const profileReferral =
    document.getElementById("profile-referral");

  if (profileFullName) {
    profileFullName.textContent = name;
  }

  if (profileEmail) {
    profileEmail.textContent = email;
  }

  if (profileId) {
    profileId.textContent = profile.id || session.id;
  }

  if (profileBalance) {
    profileBalance.textContent =
      "₦" +
      Number(profile.balance || 0).toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }

  if (profileTotal) {
    profileTotal.textContent =
      "₦" +
      Number(profile.earnings || 0).toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }

  if (profileReferral) {
    profileReferral.textContent =
      "₦" +
      Number(
        profile.referral_earnings ||
        profile.referralEarnings ||
        0
      ).toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }


  // ================= REFERRAL INFORMATION =================

  const refCode =
    document.getElementById("ref-code");

  const refLink =
    document.getElementById("ref-link");

  const refCount =
    document.getElementById("ref-count");

  const refProgress =
    document.getElementById("ref-progress");

  const withdrawStatus =
    document.getElementById("withdraw-status");

  const withdrawMessage =
    document.getElementById("withdraw-message");

  const referralCode =
    profile.referral_code ||
    profile.referralCode ||
    "";

  const activeRefs = Number(
    profile.active_referrals ||
    profile.activeReferrals ||
    0
  );

  if (refCode) {
    refCode.textContent = referralCode;
  }

  if (refLink) {
    refLink.value =
      window.location.origin +
      "/signup.html?ref=" +
      encodeURIComponent(referralCode);
  }

  if (refCount) {
    refCount.textContent =
      String(activeRefs);
  }

  if (refProgress) {
    refProgress.value =
      Math.min(activeRefs, 5);
    refProgress.max = 5;
  }

  if (withdrawStatus) {
    withdrawStatus.textContent = "🔓 Available";
  }

  if (withdrawMessage) {
    withdrawMessage.innerHTML =
      "Withdrawals do not require active referrals. Minimum withdrawal is ₦1,000.";
  }
}


// ================= GLOBAL FUNCTIONS =================

window.getSession = getSession;
window.setSession = setSession;
window.logout = logout;
window.setupSignup = setupSignup;
window.setupLogin = setupLogin;
window.fetchProfile = fetchProfile;
window.protectDashboard = protectDashboard;
