/*
  Cash Hub NG referrals
  Uses the central API adapter from api.js.
  Referral data is server-backed.
*/

function getSessionLocal() {
  try {
    return JSON.parse(
      localStorage.getItem("cashHubNgSession") || "null"
    );
  } catch {
    return null;
  }
}

async function renderReferral() {
  const session = getSessionLocal();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  try {
    const wallet = await api(
      `/api/wallet?userId=${encodeURIComponent(session.id)}`
    );

    if (!wallet || !wallet.user) {
      throw new Error("Unable to load referral information.");
    }

    const user = wallet.user;

    const code =
      user.referral_code ||
      user.referralCode ||
      "";

    const link =
      location.origin +
      "/signup.html?ref=" +
      encodeURIComponent(code);

    const codeEl = document.getElementById("ref-code");
    const linkEl = document.getElementById("ref-link");
    const countEl = document.getElementById("ref-count");
    const earningsEl = document.getElementById("ref-earnings");

    if (codeEl) {
      codeEl.textContent = code;
    }

    if (linkEl) {
      linkEl.value = link;
    }

    if (countEl) {
      countEl.textContent = String(
        user.active_referrals ||
        user.activeReferrals ||
        0
      );
    }

    if (earningsEl) {
      earningsEl.textContent =
        "₦" +
        Number(
          user.referral_earnings ||
          user.referralEarnings ||
          0
        ).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }

    const listData = await api(
      `/api/referrals/${encodeURIComponent(session.id)}`
    );

    const listEl =
      document.getElementById("ref-list") ||
      document.getElementById("admin-users");

    if (!listEl) return;

    const rows =
      (listData && listData.referrals) || [];

    if (!rows.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span>👥</span>
          <h3>No referrals yet</h3>
          <p>
            Invite friends using your referral link
            to earn bonuses.
          </p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = rows
      .map(r => {
        const u = r.user;

        const name = u
          ? (u.full_name || u.name || u.email)
          : ("User " + r.referred_user_id);

        const date = r.created_at
          ? new Date(r.created_at).toLocaleDateString()
          : "";

        return `
          <div class="admin-row">
            <div>
              <strong>${name}</strong>
              <small>${u ? u.email : ""}</small>
            </div>
            <span>${date}</span>
          </div>
        `;
      })
      .join("");

  } catch (error) {
    console.error(
      "Referral loading error:",
      error
    );

    const listEl =
      document.getElementById("ref-list") ||
      document.getElementById("admin-users");

    if (listEl) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span>⚠️</span>
          <h3>Unable to load referrals</h3>
          <p>
            ${error.message || "Please try again later."}
          </p>
        </div>
      `;
    }
  }
}

function copyRef() {
  const input =
    document.getElementById("ref-link");

  if (!input) return;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(input.value);
  } else {
    input.select();
    document.execCommand("copy");
  }

  const status =
    document.getElementById("ref-copy-status") ||
    document.getElementById("copy-status");

  if (status) {
    status.textContent =
      "Referral link copied!";
  }
}

function shareRef() {
  const input =
    document.getElementById("ref-link");

  const url = input
    ? input.value
    : location.href;

  if (navigator.share) {
    navigator.share({
      title: "Join Cash Hub NG",
      text: "Join me on Cash Hub NG",
      url
    }).catch(() => {});
  }
}

function setupReferralSignup() {
  const code =
    new URLSearchParams(location.search).get("ref");

  if (!code) return;

  const note =
    document.getElementById("referral-note");

  if (note) {
    note.textContent =
      "You were invited! We'll apply the referral when you sign up.";
  }

  /*
    The referral code is temporarily stored only
    for the signup flow. The actual referral relationship
    is created by the server and stored in Supabase.
  */
  sessionStorage.setItem(
    "cashHubReferralCode",
    String(code)
  );
}

window.renderReferral =
  renderReferral;

window.copyRef =
  copyRef;

window.shareRef =
  shareRef;

window.setupReferralSignup =
  setupReferralSignup;
