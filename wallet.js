// Cash Hub NG client-side wallet
// Uses the central API adapter from api.js.

function getSession() {
  try {
    return JSON.parse(
      localStorage.getItem("cashHubNgSession") || "null"
    );
  } catch {
    return null;
  }
}

async function renderWallet() {
  const session = getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  try {
    const data = await api(
      `/api/wallet?userId=${encodeURIComponent(session.id)}`
    );

    if (!data || !data.user) {
      throw new Error("Unable to load wallet.");
    }

    const user = data.user;

    const balanceEl = document.getElementById("wallet-balance");

    if (balanceEl) {
      balanceEl.textContent =
        "₦" +
        Number(user.balance || 0).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }

    renderTransactions(data.transactions || []);
    renderWithdrawals(data.withdrawals || []);
  } catch (error) {
    console.error("Wallet loading error:", error);

    const transactions = document.getElementById("transactions");

    if (transactions) {
      transactions.innerHTML = `
        <div class="empty-state">
          <span>⚠️</span>
          <h3>Unable to load wallet</h3>
          <p>${error.message || "Please try again later."}</p>
        </div>
      `;
    }
  }
}

function renderTransactions(rows) {
  const box = document.getElementById("transactions");

  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `
      <div class="empty-state">
        <span>📋</span>
        <h3>No transactions yet</h3>
        <p>Your earning and wallet activity will appear here.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = rows.map(t => {
    const amount = Number(t.amount || 0);
    const positive = amount >= 0;

    return `
      <div class="transaction">
        <div>
          <strong>${t.title || "Transaction"}</strong>
          <small>${t.created_at ? new Date(t.created_at).toLocaleString() : ""}</small>
        </div>
        <b class="${positive ? "positive" : "negative"}">
          ${positive ? "+" : "-"}₦${Math.abs(amount).toLocaleString("en-NG", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </b>
      </div>
    `;
  }).join("");
}

function renderWithdrawals(rows) {
  const box = document.getElementById("withdrawals");

  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `
      <div class="empty-state">
        <span>💳</span>
        <h3>No withdrawal requests</h3>
        <p>Your withdrawal requests will appear here.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = rows.map(w => `
    <div class="admin-row">
      <div>
        <strong>${w.method || "Withdrawal"}</strong>
        <small>${w.created_at ? new Date(w.created_at).toLocaleString() : ""}</small>
      </div>
      <span class="status pending">${w.status || "Pending"}</span>
      <b>
        ₦${Number(w.amount || 0).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}
      </b>
    </div>
  `).join("");
}

async function requestWithdrawal() {
  const session = getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  const amountEl = document.getElementById("withdraw-amount");
  const methodEl = document.getElementById("withdraw-method");
  const accountNameEl = document.getElementById("withdraw-account-name");
  const accountNumberEl = document.getElementById("withdraw-account-number");
  const statusEl = document.getElementById("withdraw-message");

  const amount = Number(amountEl ? amountEl.value : 0);
  const method = methodEl ? methodEl.value : "";
  const accountName = accountNameEl ? accountNameEl.value.trim() : "";
  const accountNumber = accountNumberEl ? accountNumberEl.value.trim() : "";

  if (!amount || amount <= 0) {
    if (statusEl) {
      statusEl.textContent = "Enter a valid withdrawal amount.";
    }
    return;
  }

  if (amount < 70000) {
    if (statusEl) statusEl.textContent = "Minimum withdrawal is ₦70,000.";
    return;
  }

  if (!method) {
    if (statusEl) statusEl.textContent = "Select a payment method.";
    return;
  }

  if (!accountName) {
    if (statusEl) statusEl.textContent = "Enter the account name.";
    return;
  }

  if (!/^\d{10}$/.test(accountNumber)) {
    if (statusEl) statusEl.textContent = "Enter a valid 10-digit account number.";
    return;
  }

  try {
    await api("/api/withdraw", {
      method: "POST",
      body: JSON.stringify({
        userId: session.id,
        amount,
        method,
        accountName,
        accountNumber
      })
    });

    if (statusEl) {
      statusEl.textContent =
        "Withdrawal request submitted for review.";
    }

    if (amountEl) amountEl.value = "";
    if (accountNameEl) accountNameEl.value = "";
    if (accountNumberEl) accountNumberEl.value = "";

    await renderWallet();
  } catch (error) {
    console.error("Withdrawal error:", error);

    if (statusEl) {
      statusEl.textContent =
        error.message || "Unable to submit withdrawal request.";
    }
  }
}

window.renderWallet = renderWallet;
window.renderWithdrawals = renderWithdrawals;
window.requestWithdrawal = requestWithdrawal;
