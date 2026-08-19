
const ADMIN_KEY="cashHubNgAdmin";
const ADMIN_EMAIL="admin@cashhubng.local";
const ADMIN_PASSWORD="admin123";
function allUsers(){return JSON.parse(localStorage.getItem("cashHubNgUsers")||"[]")}
function saveUsers(u){localStorage.setItem("cashHubNgUsers",JSON.stringify(u))}
function adminLogged(){return sessionStorage.getItem(ADMIN_KEY)==="1"}
function adminLogout(){sessionStorage.removeItem(ADMIN_KEY);location.href="admin-login.html"}
function setupAdminLogin(){
 const f=document.getElementById("admin-login-form"),m=document.getElementById("admin-message");if(!f)return;
 f.addEventListener("submit",e=>{e.preventDefault();if(document.getElementById("admin-email").value===ADMIN_EMAIL&&document.getElementById("admin-password").value===ADMIN_PASSWORD){sessionStorage.setItem(ADMIN_KEY,"1");location.href="admin.html"}else m.textContent="Invalid admin credentials."})
}
function protectAdmin(){if(!adminLogged())location.href="admin-login.html"}
function adminStats(){
 const u=allUsers(),el=id=>document.getElementById(id);
 el("stat-users").textContent=u.length;
 el("stat-earnings").textContent="$"+u.reduce((s,x)=>s+Number(x.earnings||0),0).toFixed(2);
 el("stat-balance").textContent="$"+u.reduce((s,x)=>s+Number(x.balance||0),0).toFixed(2);
 el("stat-referrals").textContent=u.reduce((s,x)=>s+(x.referrals||[]).length,0);
}
function renderAdminUsers(){
 const box=document.getElementById("admin-users"),u=allUsers();
 box.innerHTML=u.length?u.map(x=>`<div class="admin-row"><div><strong>${x.name}</strong><small>${x.email}</small></div><span>${(x.referrals||[]).length} referrals</span><b>$${Number(x.balance||0).toFixed(2)}</b></div>`).join(""):`<div class="empty-state"><span>👥</span><h3>No users yet</h3><p>Registered users will appear here.</p></div>`
}
function renderAdminWithdrawals(){
 const box=document.getElementById("admin-withdrawals"),rows=[];
 allUsers().forEach(u=>(u.withdrawals||[]).forEach(w=>rows.push({...w,user:u})));
 rows.sort((a,b)=>new Date(b.date)-new Date(a.date));
 box.innerHTML=rows.length?rows.map(w=>`<div class="admin-row"><div><strong>${w.user.name}</strong><small>${w.user.email} · ${w.method}</small></div><span class="status pending">${w.status}</span><b>$${Number(w.amount).toFixed(2)}</b></div>`).join(""):`<div class="empty-state"><span>💳</span><h3>No withdrawal requests</h3><p>Requests will appear here for review.</p></div>`
}
function adminRefresh(){adminStats();renderAdminUsers();renderAdminWithdrawals()}
