// Cash Hub NG - Profile editing client
// Uses the central api.js adapter.

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showMessage(
  msg,
  elId = "profile-message",
  timeout = 5000
) {
  let el = document.getElementById(elId);

  if (!el) {
    el = document.createElement("div");
    el.id = elId;

    const container =
      document.querySelector("main") ||
      document.body;

    container.insertBefore(
      el,
      container.firstChild
    );
  }

  el.textContent = msg;

  el.style.color =
    msg.toLowerCase().includes("error") ||
    msg.toLowerCase().includes("failed")
      ? "crimson"
      : "green";

  setTimeout(() => {
    if (el) el.textContent = "";
  }, timeout);
}

function enterEditMode() {
  const full =
    document.getElementById("profile-fullname");

  const email =
    document.getElementById("profile-email");

  if (!full || !email) return;

  const nameVal =
    full.textContent.trim();

  const emailVal =
    email.textContent.trim();

  full.innerHTML = `
    <input
      id="edit-fullname"
      value="${nameVal.replace(/"/g, "&quot;")}"
      autocomplete="name">
  `;

  email.innerHTML = `
    <input
      id="edit-email"
      value="${emailVal.replace(/"/g, "&quot;")}"
      autocomplete="email">
  `;

  const actions =
    document.getElementById("profile-actions");

  if (actions) {
    actions.innerHTML = `
      <button
        onclick="saveProfile()"
        class="primary-btn">
        Save
      </button>

      <button
        onclick="cancelEdit()"
        class="secondary-btn">
        Cancel
      </button>
    `;
  }
}

function cancelEdit() {
  if (
    typeof protectDashboard ===
    "function"
  ) {
    protectDashboard();
  }
}

async function saveProfile() {
  if (
    typeof getSession !==
    "function"
  ) {
    showMessage(
      "Unable to access your session.",
      "profile-message"
    );
    return;
  }

  const session = getSession();

  if (!session) {
    window.location.href =
      "login.html";
    return;
  }

  const fullInput =
    document.getElementById(
      "edit-fullname"
    );

  const emailInput =
    document.getElementById(
      "edit-email"
    );

  if (!fullInput || !emailInput) {
    return;
  }

  const full_name =
    (fullInput.value || "").trim();

  const email =
    (emailInput.value || "")
      .trim()
      .toLowerCase();

  if (!full_name) {
    showMessage(
      "Full name is required.",
      "profile-message"
    );
    return;
  }

  if (
    !email ||
    !isValidEmail(email)
  ) {
    showMessage(
      "Enter a valid email address.",
      "profile-message"
    );
    return;
  }

  try {
    const data = await api(
      `/api/profile/${encodeURIComponent(
        session.id
      )}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          full_name,
          email
        })
      }
    );

    if (!data || !data.user) {
      throw new Error(
        "Profile update failed."
      );
    }

    if (
      typeof setSession ===
      "function"
    ) {
      setSession(data.user);
    }

    showMessage(
      "Profile updated successfully.",
      "profile-message"
    );

    if (
      typeof protectDashboard ===
      "function"
    ) {
      await protectDashboard();
    }

    const actions =
      document.getElementById(
        "profile-actions"
      );

    if (actions) {
      actions.innerHTML = `
        <button
          class="primary-btn"
          onclick="enterEditMode()">
          Edit Profile
        </button>
      `;
    }

  } catch (e) {
    console.error(
      "saveProfile error:",
      e
    );

    showMessage(
      e.message ||
      "Unable to update profile.",
      "profile-message"
    );
  }
}

window.enterEditMode =
  enterEditMode;

window.saveProfile =
  saveProfile;

window.cancelEdit =
  cancelEdit;
