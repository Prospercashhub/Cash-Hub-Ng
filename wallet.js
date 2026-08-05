
function walletUser() {
  const session = JSON.parse(localStorage.getItem("cashHubNgSession") || "null");
  if (!session) return null;
  const users = JSON.parse(localStorage.getItem("cashHubNgUsers") || "[]");
  return users.find(u => u.id === session.id);
}
function saveWalletUser(user) {
  const users = JSON.parse(localStorage.getItem("cashHubNgUsers") || "[]");
  const i = users.findIndex(u => u.id === user.id);
  if (i >= 0) users[i] = user;
  localStorage.setItem("cashHubNgUsers", JSON.stringify(users));
}
function money(n){
  return "₦" + Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function renderWallet() {
  const user = walletUser();
  if (!user) { window.location.href = "login.html"; return; }
  const bal = document.getElementById("wallet-balance");
  if (bal) bal.textContent = money(user.balance);
  const list = document.getElementById("transactions");
  const tx = user.transactions || [];
  if (list) list.innerHTML = tx.length ? tx.map(t => `<div class="transaction"><div><strong>${t.title}</strong><small>${new Date(t.date).toLocaleString()}</small></div><b class="${t.amount >= 0 ? "positive" : "negative"}">${t.amount >= 0 ? "+" : ""}${money(t.amount)}</b></div>`).join("") : `<div class="empty-state"><span>📋</span><h3>No transactions yet</h3><p>Your earning and wallet activity will appear here.</p></div>`;
}
function requestWithdrawal(){
  const user = walletUser();
  const amount = Number(document.getElementById("withdraw-amount").value);
  const method = document.getElementById("withdraw-method").value;
  const referrals = Number(user.activeReferrals || 0);

if (referrals < 5) {
  message.textContent =
    "You need 5 active referrals before you can withdraw.";
  return;
}
  if (!amount || amount <= 0) return message.textContent = "Enter a valid withdrawal amount.";
  if (amount > Number(user.balance || 0)) return message.textContent = "Insufficient available balance.";
  if (amount < 10000) return message.textContent = "Minimum withdrawal is ₦10,000.";
  user.withdrawals = user.withdrawals || [];
  user.withdrawals.unshift({id:Date.now().toString(), amount, method, status:"Pending", date:new Date().toISOString()});
  user.transactions = user.transactions || [];
  user.transactions.unshift({id:Date.now().toString()+"w", type:"withdrawal", title:"Withdrawal request", amount:-amount, date:new Date().toISOString()});
  user.balance = Number(user.balance || 0) - amount;
  saveWalletUser(user);
  message.textContent = "Withdrawal request submitted for review.";
  document.getElementById("withdraw-amount").value = "";
  renderWallet();
  renderWithdrawals();
}
function renderWithdrawals(){
  const user = walletUser();
  const box = document.getElementById("withdrawals");
  if (!box) return;
  const rows = user.withdrawals || [];
  box.innerHTML = rows.length ? rows.map(w => `<div class="transaction"><div><strong>${w.method} withdrawal</strong><small>${new Date(w.date).toLocaleString()}</small></div><span class="status pending">${w.status}</span><b>${money(w.amount)}</b></div>`).join("") : `<div class="empty-state"><span>💳</span><h3>No withdrawal requests</h3><p>Your withdrawal requests will appear here.</p></div>`;
}
