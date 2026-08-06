// Client-side wallet that uses server APIs instead of localStorage

async function apiFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  } catch (e) {
    console.error('apiFetch', e);
    return null;
  }
}

function getSession() {
  try { return JSON.parse(localStorage.getItem('cashHubNgSession') || 'null'); } catch { return null; }
}

async function renderWallet() {
  const session = getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  const data = await apiFetch(`/api/wallet?userId=${encodeURIComponent(session.id)}`);
  if (!data || !data.user) { console.error('Failed to load wallet'); return; }

  const user = data.user;
  const bal = document.getElementById('wallet-balance');
  if (bal) bal.textContent = '₦' + Number(user.balance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const list = document.getElementById('transactions');
  const tx = data.transactions || [];
  if (list) list.innerHTML = tx.length ? tx.map(t => `<div class="transaction"><div><strong>${t.title}</strong><small>${new Date(t.created_at).toLocaleString()}</small></div><b class="${t.amount >= 0 ? 'positive' : 'negative'}">${t.amount >= 0 ? '+' : ''}₦${Number(t.amount).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`).join('') : `<div class="empty-state"><span>📋</span><h3>No transactions yet</h3><p>Your earning and wallet activity will appear here.</p></div>`;

  renderWithdrawals(data.withdrawals || []);
}

function renderWithdrawals(rows) {
  const box = document.getElementById('withdrawals');
  if (!box) return;
  if (!rows || !rows.length) {
    box.innerHTML = `<div class="empty-state"><span>💳</span><h3>No withdrawal requests</h3><p>Requests will appear here for review.</p></div>`;
    return;
  }
  box.innerHTML = rows.map(w => `<div class="admin-row"><div><strong>${w.method}</strong><small>${new Date(w.created_at).toLocaleString()}</small></div><span class="status pending">${w.status}</span><b>₦${Number(w.amount).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`).join('');
}

async function requestWithdrawal(){
  const session = getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  const amount = Number(document.getElementById('withdraw-amount').value);
  const method = document.getElementById('withdraw-method').value;
  const statusEl = document.getElementById('withdraw-message');

  if (!amount || amount <= 0) { if (statusEl) statusEl.textContent = 'Enter a valid withdrawal amount.'; return; }

  const res = await apiFetch('/api/withdraw', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: session.id, amount, method })
  });

  if (!res) { if (statusEl) statusEl.textContent = 'Unable to submit withdrawal request.'; return; }
  if (res.error) { if (statusEl) statusEl.textContent = res.error; return; }

  if (statusEl) statusEl.textContent = 'Withdrawal request submitted for review.';
  document.getElementById('withdraw-amount').value = '';
  await renderWallet();
}

window.renderWallet = renderWallet;
window.requestWithdrawal = requestWithdrawal;
