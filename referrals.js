// Cash Hub NG — Server-backed referrals

function getReferralSession() {
  try {
    return JSON.parse(
      localStorage.getItem("cashHubNgSession") || "null"
    );
  } catch {
    return null;
  }
}

async function referralApi(path, options = {}) {
  if (typeof api !== "function") {
    throw new Error(
      "API is not loaded. Make sure api.js is loaded before referrals.js."
    );
  }

  return await api(path, options);
}


// ================= REFERRAL CENTER =================

async function renderReferral() {
  const session = getReferralSession();

  if (!session || !session.id) {
    window.location.href = "login.html";
    return;
  }

  try {
    // Get authoritative user data from server
    const walletData = await referralApi(
      `/api/wallet?userId=${encodeURIComponent(session.id)}`
    );

    if (!walletData || !walletData.user) {
      throw new Error("Unable to load referral information.");
    }

    const user = walletData.user;

    const referralCode =
      user.referral_code ||
      user.referralCode ||
      "";

    const activeReferrals = Number(
      user.active_referrals ||
      user.activeReferrals ||
      0
    );

    const referralEarnings = Number(
      user.referral_earnings ||
      user.referralEarnings ||
      0
    );

    const baseUrl =
      window.location.origin ||
      (
        window.location.protocol +
        "//" +
        window.location.host
      );

    const referralLink =
      baseUrl +
      "/signup.html?ref=" +
      encodeURIComponent(referralCode);


    // Display referral information

    const codeEl =
      document.getElementById("ref-code");

    const linkEl =
      document.getElementById("ref-link");

    const countEl =
      document.getElementById("ref-count");

    const earningsEl =
      document.getElementById("ref-earnings");

    const progressEl =
      document.getElementById("ref-progress");

    if (codeEl) {
      codeEl.textContent = referralCode;
    }

    if (linkEl) {
      linkEl.value = referralLink;
    }

    if (countEl) {
      countEl.textContent =
        String(activeReferrals);
    }

    if (earningsEl) {
      earningsEl.textContent =
        "₦" +
        referralEarnings.toLocaleString(
          "en-NG",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }
        );
    }

    if (progressEl) {
      progressEl.value =
        Math.min(activeReferrals, 5);

      progressEl.max = 5;
    }


    // Load referral list from server

    const listData = await referralApi(
      `/api/referrals/${encodeURIComponent(session.id)}`
    );

    const listEl =
      document.getElementById("ref-list");

    if (!listEl) return;

    const referrals =
      (listData && listData.referrals) || [];

    if (!referrals.length) {

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


    listEl.innerHTML =
      referrals.map(function (referral) {

        const referredUser =
          referral.user || {};

        const name =
          referredUser.full_name ||
          referredUser.name ||
          referredUser.email ||
          "Member";

        const email =
          referredUser.email || "";

        const date =
          referral.created_at
            ? new Date(
                referral.created_at
              ).toLocaleDateString("en-NG")
            : "";

        return `
          <div class="admin-row">
            <div>
              <strong>${escapeReferralHtml(name)}</strong>
              <small>${escapeReferralHtml(email)}</small>
            </div>

            <span>${escapeReferralHtml(date)}</span>
          </div>
        `;

      }).join("");


  } catch (error) {

    console.error(
      "renderReferral error:",
      error
    );

    const listEl =
      document.getElementById("ref-list");

    if (listEl) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span>⚠️</span>
          <h3>Unable to load referrals</h3>
          <p>
            Please check your connection and try again.
          </p>
        </div>
      `;
    }
  }
}


// Basic HTML escaping for referral names/emails
function escapeReferralHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ================= COPY REFERRAL LINK =================

async function copyRef() {

  const input =
    document.getElementById("ref-link");

  if (!input) return;

  try {

    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {

      await navigator.clipboard.writeText(
        input.value
      );

    } else {

      input.focus();
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

  } catch (error) {

    console.error(
      "copyRef error:",
      error
    );
  }
}


// ================= SHARE REFERRAL =================

async function shareRef() {

  const input =
    document.getElementById("ref-link");

  const url =
    input ? input.value : window.location.href;

  try {

    if (navigator.share) {

      await navigator.share({
        title: "Join Cash Hub NG",
        text: "Join me on Cash Hub NG",
        url: url
      });

    } else {

      await copyRef();

    }

  } catch (error) {

    // User cancelling the share dialog is harmless.
    console.log(
      "Share cancelled or unavailable."
    );
  }
}


// ================= SIGNUP REFERRAL =================

function setupReferralSignup() {

  const code =
    new URLSearchParams(
      window.location.search
    ).get("ref");

  if (!code) return;

  const note =
    document.getElementById(
      "referral-note"
    );

  if (note) {
    note.textContent =
      "You were invited! Your referral will be applied when you sign up.";
  }

  sessionStorage.setItem(
    "cashHubReferralCode",
    String(code)
  );
}


// ================= GLOBAL EXPORTS =================

window.renderReferral =
  renderReferral;

window.copyRef =
  copyRef;

window.shareRef =
  shareRef;

window.setupReferralSignup =
  setupReferralSignup;
