/*
  referrals.js - server-backed referrals rendering
  Replaces localStorage-only referral handling with Supabase-backed API calls.
*/

async function apiFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(body.error || 'Request failed');
    }
    return await res.json();
  } catch (e) {
    console.error('apiFetch', e);
    return null;
  }
}

function getSessionLocal() {
  try { return JSON.parse(localStorage.getItem('cashHubNgSession') || 'null'); } catch { return null; }
}

// Render the referral center using server data
async function renderReferral() {
  const session = getSessionLocal();
  if (!session) { window.location.href = 'login.html'; return; }

  // Fetch authoritative wallet/profile data
  const wallet = await apiFetch(`/api/wallet?userId=${encodeURIComponent(session.id)}`);
  if (!wallet || !wallet.user) {
    console.error('Failed loading wallet data for referrals');
    return;
  }

  const user = wallet.user;
  const code = user.referral_code || user.referralCode || '';
  const link = (location.origin || (window.location.protocol + '//' + window.location.host)) + '/signup.html?ref=' + encodeURIComponent(code);

  const codeEl = document.getElementById('ref-code');
  const linkEl = document.getElementById('ref-link');
  const countEl = document.getElementById('ref-count');
  const earningsEl = document.getElementById('ref-earnings');

  if (codeEl) codeEl.textContent = code;
  if (linkEl) linkEl.value = link;
  if (countEl) countEl.textContent = String(user.active_referrals || user.activeReferrals || 0);
  if (earningsEl) earningsEl.textContent = '₦' + Number(user.referral_earnings || user.referralEarnings || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Fetch referrals list
  const listData = await apiFetch(`/api/referrals/${encodeURIComponent(session.id)}`);
  const listEl = document.getElementById('ref-list') || document.getElementById('admin-users') || null;
  if (listEl) {
    const rows = (listData && listData.referrals) || [];
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><span>👥</span><h3>No referrals yet</h3><p>Invite friends using your referral link to earn bonuses.</p></div>`;
    } else {
      listEl.innerHTML = rows.map(r => {
        const u = r.user;
        const name = u ? (u.full_name || u.name || u.email) : ('User ' + r.referred_user_id);
        const date = new Date(r.created_at).toLocaleDateString();
        return `<div class="admin-row"><div><strong>${name}</strong><small>${u ? u.email : ''}</small></div><span>${date}</span></div>`;
      }).join('');
    }
  }
}

function copyRef(){
  const input = document.getElementById('ref-link');
  if (!input) return;
  if (navigator.clipboard) navigator.clipboard.writeText(input.value);
  else { input.select(); document.execCommand('copy'); }
  const st = document.getElementById('ref-copy-status') || document.getElementById('copy-status');
  if (st) st.textContent = 'Referral link copied!';
}

function shareRef(){
  const input = document.getElementById('ref-link');
  const url = input ? input.value : location.href;
  if (navigator.share) navigator.share({ title: 'Join Cash Hub NG', text: 'Join me on Cash Hub NG', url });
}

// Keep setupReferralSignup for signup flow compatibility
function setupReferralSignup(){
  const code = new URLSearchParams(location.search).get('ref');
  if (!code) return;
  const note = document.getElementById('referral-note');
  if (note) note.textContent = `You were invited! We'll apply the referral when you sign up.`;
  sessionStorage.setItem('cashHubReferralCode', String(code));
}

// attachReferralToNewUser remains for backwards compatibility when local caching is used
function attachReferralToNewUser(user){
  // Nothing required client-side: server will record referrals based on referral_code
  // But keep a local cached copy for UI compatibility
  try {
    const users = JSON.parse(localStorage.getItem('cashHubNgUsers') || '[]');
    const idx = users.findIndex(x => x.id === user.id);
    if (idx >= 0) users[idx] = user; else users.unshift(user);
    localStorage.setItem('cashHubNgUsers', JSON.stringify(users));
  } catch (e) { console.error(e); }
}

window.renderReferral = renderReferral;
window.copyRef = copyRef;
window.shareRef = shareRef;
window.setupReferralSignup = setupReferralSignup;
window.attachReferralToNewUser = attachReferralToNewUser;
