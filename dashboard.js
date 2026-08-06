function money(n){
  return "₦" + Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function fetchWalletData(userId){
  try{
    const res = await fetch(`/api/wallet?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      const err = await res.json().catch(()=>({error:'Failed to fetch'}));
      throw new Error(err.error || 'Failed to fetch wallet data');
    }
    return await res.json();
  }catch(e){
    console.error('fetchWalletData error', e);
    return null;
  }
}

async function renderRecentTransactions(transactions){
  const container = document.getElementById('recent-transactions');
  if (!container) return;
  if (!transactions || transactions.length === 0){
    container.innerHTML = `<div class="empty-state"><span>📋</span><h3>No transactions yet</h3><p>Your earning and wallet activity will appear here.</p></div>`;
    return;
  }

  container.innerHTML = transactions.slice(0,5).map(t => {
    const date = new Date(t.created_at || t.createdAt || t.date || Date.now()).toLocaleString();
    const amount = (typeof t.amount === 'number') ? t.amount : Number(t.amount || 0);
    return `<div class="transaction"><div><strong>${t.title || t.type || 'Activity'}</strong><small>${date}</small></div><b class="${amount>=0? 'positive':'negative'}">${amount>=0?'+':''}${money(amount)}</b></div>`;
  }).join('');
}

async function loadDashboard(){
  try{
    if (typeof getSession !== 'function') {
      console.error('getSession() not available from auth.js');
      return;
    }

    const session = getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    const data = await fetchWalletData(session.id);
    if (!data) {
      const c = document.getElementById('recent-transactions');
      if (c) c.innerHTML = `<div class="empty-state"><span>⚠️</span><h3>Unable to load dashboard</h3><p>Check your connection or try again later.</p></div>`;
      return;
    }

    const user = data.user || {};

    const userBalance = document.getElementById('user-balance');
    const userEarnings = document.getElementById('user-earnings');
    const userReferral = document.getElementById('user-referral-earnings');
    const refCount = document.getElementById('dashboard-ref-count');

    if (userBalance) userBalance.textContent = money(user.balance);
    if (userEarnings) userEarnings.textContent = "₦" + Number(user.earnings || 0).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2});
    if (userReferral) userReferral.textContent = "₦" + Number(user.referral_earnings || user.referralEarnings || 0).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2});
    if (refCount) refCount.textContent = String(user.active_referrals || user.activeReferrals || 0);

    await renderRecentTransactions(data.transactions || []);
  }catch(e){
    console.error('loadDashboard error', e);
  }
}

// Expose for manual refresh and call on load
window.refreshDashboard = loadDashboard;

// Delay until DOM is ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadDashboard);
else loadDashboard();
