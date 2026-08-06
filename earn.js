// Client-side earnings/tasks connected to backend

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

function getSession() { try { return JSON.parse(localStorage.getItem('cashHubNgSession') || 'null'); } catch { return null; } }

let TASKS = [];

async function loadTasks() {
  const data = await apiFetch('/api/tasks');
  if (!data || !data.tasks) return;
  TASKS = data.tasks;
  renderTasks();
}

async function renderStats() {
  const session = getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  const data = await apiFetch(`/api/wallet?userId=${encodeURIComponent(session.id)}`);
  if (!data || !data.user) return;
  const user = data.user;
  const balanceEl = document.getElementById('earn-balance');
  const earningsEl = document.getElementById('earn-total');
  if (balanceEl) balanceEl.textContent = '₦' + Number(user.balance || 0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});
  if (earningsEl) earningsEl.textContent = '₦' + Number(user.earnings || 0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function renderTasks(filter = 'All') {
  const box = document.getElementById('task-list');
  if (!box) return;
  const tasks = filter === 'All' ? TASKS : TASKS.filter(t => t.type === filter);
  box.innerHTML = tasks.map(t => `<article class="task-card"><span class="task-icon">${t.icon}</span><div class="task-main"><div class="task-meta"><span>${t.type}</span><span>${t.time}</span></div><h3>${t.title}</h3><p>${t.desc}</p></div><div class="task-action"><strong>₦${Number(t.reward).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><button onclick="completeTask('${t.id}')">Start Task</button></div></article>`).join('');
}

async function completeTask(id) {
  const session = getSession();
  if (!session) { alert('Please login first.'); window.location.href = 'login.html'; return; }

  // Call backend to mark completion and credit reward
  const res = await apiFetch('/api/complete-task', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: session.id, taskId: id })
  });

  if (!res) { alert('Unable to complete task.'); return; }
  if (res.error) { alert(res.error); return; }

  alert('Task completed! Reward: ₦' + Number(res.reward).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2}));
  await renderStats();
  await loadTasks();
  // Navigate to survey/offers where appropriate
  window.location.href = '/survey.html';
}

function setupEarnPage() {
  const session = getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  renderStats();
  loadTasks();
  document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); renderTasks(btn.dataset.filter);
  }));
}

window.setupEarnPage = setupEarnPage;
window.renderTasks = renderTasks;
window.renderStats = renderStats;
window.completeTask = completeTask;
