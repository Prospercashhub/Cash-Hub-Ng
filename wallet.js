function money(n){
  return "₦" + Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

let _cachedWallet = null; // store last fetched wallet response

function walletUser() {
  // Use the session from auth.js to identify current user
  const session = getSession();
  if (!session) return null;
  return session; // wallet operations use server data; session contains id/email
}

async function fetchWallet(userId){
  try{
    const res = await fetch(`/api/wallet?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    _cachedWallet = data;
    return data;
  }catch(e){ console.error(e); return null; }
}

async function renderWallet(){
  const session = walletUser();
  if (!session) { window.location.href = "login.html"; return; }

  const data = await fetchWallet(session.id);
  if (!data || !data.user) { document.getElementById('wallet-balance').textContent = money(0); return; }

  const user = data.user;
  const bal = document.getElementById("wallet-balance");
  if (bal) bal.textContent = money(user.balance);

  const list = document.getElementById("transactions");
  const tx = data.transactions || [];
  if (list) {
    list.innerHTML = tx.length ? tx.map(t => `<div class="transaction"><div><strong>${t.title}</strong><small>${new Date(t.created_at || t.createdAt || t.date).toLocaleString()}</small></div><b class="${t.amount >= 0 ? "positive" : "negative"}">${t.amount >= 0 ? "+" : ""}${money(t.amount)}</b></div>`).join("") : `<div class="empty-state"><span>📋</span><h3>No transactions yet</h3><p>Your earning and wallet activity will appear here.</p></div>`;
  }
}

async function requestWithdrawal(){
  const session = walletUser();
  const msgEl = document.getElementById('withdraw-message');
  if (!session) { window.location.href = 'login.html'; return; }

  const amount = Number(document.getElementById("withdraw-amount").value);
  const method = document.getElementById("withdraw-method").value;

  // Use latest cached wallet to check referrals and balance; if not available, fetch
  if (!_cachedWallet) await fetchWallet(session.id);
  const profile = _cachedWallet && _cachedWallet.user ? _cachedWallet.user : null;
  const referrals = Number((profile && (profile.active_referrals || profile.activeReferrals)) || 0);

  if (referrals < 5) {
    if (msgEl) msgEl.textContent = "You need 5 active referrals before you can withdraw.";
    return;
  }

  if (!amount || amount <= 0) { if (msgEl) msgEl.textContent = "Enter a valid withdrawal amount."; return; }
  if (amount < 10000) { if (msgEl) msgEl.textContent = "Minimum withdrawal is ₦10,000."; return; }
  if (profile && amount > Number(profile.balance || 0)) { if (msgEl) msgEl.textContent = "Insufficient available balance."; return; }

  try{
    if (msgEl) msgEl.textContent = "Processing...";
    const res = await fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: session.id, amount, method })
    });

    const data = await res.json();
    if (!res.ok) {
      if (msgEl) msgEl.textContent = data.error || 'Withdrawal request failed.';
      return;
    }

    if (msgEl) msgEl.textContent = 'Withdrawal request submitted for review.';
    document.getElementById('withdraw-amount').value = '';

    // Refresh wallet display
    await renderWallet();
    await renderWithdrawals();
  }catch(e){
    console.error(e);
    if (msgEl) msgEl.textContent = 'Unable to connect to server.';
  }
}

async function renderWithdrawals(){
  const session = walletUser();
  if (!session) { window.location.href = "login.html"; return; }

  if (!_cachedWallet) await fetchWallet(session.id);
  const rows = (_cachedWallet && _cachedWallet.withdrawals) || [];
  const box = document.getElementById("withdrawals");
  if (!box) return;
  box.innerHTML = rows.length ? rows.map(w => `<div class="transaction"><div><strong>${w.method} withdrawal</strong><small>${new Date(w.created_at || w.createdAt || w.date).toLocaleString()}</small></div><span class="status pending">${w.status}</span><b>${money(w.amount)}</b></div>`).join("") : `<div class="empty-state"><span>💳</span><h3>No withdrawal requests</h3><p>Your withdrawal requests will appear here.</p></div>`;
}

// Expose functions globally for existing inline calls in HTML
window.renderWallet = renderWallet;
window.renderWithdrawals = renderWithdrawals;
window.requestWithdrawal = requestWithdrawal;
