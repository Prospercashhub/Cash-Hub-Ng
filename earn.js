
const EARN_TASKS = [
  {id:"survey1", type:"Surveys", icon:"📝", title:"Quick Opinion Survey", desc:"Answer a short survey and earn a reward.", reward:1.50, time:"5 min"},
  {id:"task1", type:"Tasks", icon:"🎯", title:"Starter Task", desc:"Complete a simple eligible activity.", reward:2.00, time:"10 min"},
  {id:"game1", type:"Games", icon:"🎮", title:"Game Challenge", desc:"Complete an eligible game activity.", reward:2.50, time:"15 min"},
  {id:"offer1", type:"Offers", icon:"🎁", title:"Welcome Offer", desc:"Complete an eligible offer from the available list.", reward:3.00, time:"10 min"}
];

function currentUser() {
  const session = JSON.parse(localStorage.getItem("cashHubNgSession") || "null");
  if (!session) return null;
  const users = JSON.parse(localStorage.getItem("cashHubNgUsers") || "[]");
  return users.find(u => u.id === session.id);
}
function saveCurrentUser(user) {
  const users = JSON.parse(localStorage.getItem("cashHubNgUsers") || "[]");
  const i = users.findIndex(u => u.id === user.id);
  if (i >= 0) users[i] = user;
  localStorage.setItem("cashHubNgUsers", JSON.stringify(users));
}
function completedTasks(user) { return user.completedTasks || []; }
function addTransaction(user, task) {
  user.transactions = user.transactions || [];
  user.transactions.unshift({
    id: Date.now().toString(),
    type: "earning",
    title: task.title,
    amount: task.reward,
    date: new Date().toISOString()
  });
}
function completeTask(id) {
  const user = currentUser();
  const task = EARN_TASKS.find(t => t.id === id);
  if (!user || !task) return;
  user.completedTasks = completedTasks(user);
  if (user.completedTasks.includes(id)) return alert("You have already completed this demo task.");
  user.completedTasks.push(id);
  user.balance = Number(user.balance || 0) + task.reward;
  user.earnings = Number(user.earnings || 0) + task.reward;
  addTransaction(user, task);
  saveCurrentUser(user);
  renderTasks();
  renderStats();
  window.location.href = "/survey.html";
}
function renderStats() {
  const user = currentUser();
  if (!user) return;
  const balance = document.getElementById("earn-balance");
  const earnings = document.getElementById("earn-total");
  if (balance) balance.textContent = "$" + Number(user.balance || 0).toFixed(2);
  if (earnings) earnings.textContent = "$" + Number(user.earnings || 0).toFixed(2);
}
function renderTasks(filter="All") {
  const box = document.getElementById("task-list");
  if (!box) return;
  const user = currentUser();
  const done = completedTasks(user || {});
  const tasks = filter === "All" ? EARN_TASKS : EARN_TASKS.filter(t => t.type === filter);
  box.innerHTML = tasks.map(t => {
    const completed = done.includes(t.id);
    return `<article class="task-card">
      <span class="task-icon">${t.icon}</span>
      <div class="task-main"><div class="task-meta"><span>${t.type}</span><span>${t.time}</span></div>
      <h3>${t.title}</h3><p>${t.desc}</p></div>
      <div class="task-action"><strong>$${t.reward.toFixed(2)}</strong>
      <button ${completed ? "disabled" : ""} onclick="completeTask('${t.id}')">${completed ? "Completed" : "Start Task"}</button></div>
    </article>`;
  }).join("");
}
function setupEarnPage() {
  const session = localStorage.getItem("cashHubNgSession");
  if (!session) { window.location.href = "login.html"; return; }
  renderStats(); renderTasks();
  document.querySelectorAll(".filter-btn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); renderTasks(btn.dataset.filter);
  }));
}
