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

      // Share as ordinary text containing the referral link.
      // This keeps Android's share sheet treating the payload as a
      // normal text/link share instead of a file/document.
      const shareText =
        "Join me on Cash Hub NG and use my referral link:\n" +
        url;

      await navigator.share({
        title: "Join Cash Hub NG",
        text: shareText
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

/* =========================================================
   Cash Hub NG — Text-only Referral Share Patch
   Uses Web Share API with text/url only; clipboard fallback.
   ========================================================= */
(function () {
  "use strict";

  function getReferralUrl() {
    var selectors = [
      "#referralLink",
      "#referral-link",
      "[data-referral-link]",
      ".referral-link",
      "input[name='referralLink']",
      "input[name='referral_url']",
      "input[name='referralUrl']"
    ];

    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        var value = el.value || el.getAttribute("href") || el.textContent || el.getAttribute("data-referral-link");
        if (value && String(value).trim()) return String(value).trim();
      }
    }

    var links = document.querySelectorAll("a[href]");
    for (var j = 0; j < links.length; j++) {
      var href = links[j].href || "";
      if (/referr|referal|invite/i.test(href)) return href;
    }

    return "";
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        ok ? resolve() : reject(new Error("Copy failed"));
      } catch (err) {
        document.body.removeChild(area);
        reject(err);
      }
    });
  }

  function notify(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
      return;
    }
    if (typeof window.toast === "function") {
      window.toast(message);
      return;
    }
    window.alert(message);
  }

  async function shareReferral(event) {
    if (event) event.preventDefault();

    var referralUrl = getReferralUrl();
    if (!referralUrl) {
      notify("Referral link is not available yet.");
      return;
    }

    var shareText = "Join me on Cash Hub NG and use my referral link:\n" + referralUrl;

    /* IMPORTANT: text/url only. No files, blobs, attachments, or FormData. */
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Cash Hub NG Referral",
          text: shareText
        });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }

    try {
      await copyText(shareText);
      notify("Referral link copied. You can paste it into any app.");
    } catch (err) {
      notify(shareText);
    }
  }

  function bindReferralShare() {
    var selectors = [
      "#shareReferral",
      "#share-referral",
      ".share-referral",
      "[data-share-referral]",
      "[data-action='share-referral']",
      "button[aria-label*='referral' i][aria-label*='share' i]"
    ];

    var seen = new WeakSet();

    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (button) {
        if (seen.has(button)) return;
        seen.add(button);
        button.addEventListener("click", shareReferral);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindReferralShare);
  } else {
    bindReferralShare();
  }
})();
