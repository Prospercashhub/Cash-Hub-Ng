// Cash Hub NG client-side earnings/tasks
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

let TASKS = [];

async function loadTasks() {
  try {
    const data = await api("/api/tasks");

    if (!data || !data.tasks) {
      throw new Error("Unable to load tasks.");
    }

    TASKS = data.tasks;
    renderTasks();
  } catch (error) {
    console.error("Task loading error:", error);

    const box = document.getElementById("task-list");

    if (box) {
      box.innerHTML = `
        <div class="empty-state">
          <span>⚠️</span>
          <h3>Unable to load tasks</h3>
          <p>${error.message || "Please try again later."}</p>
        </div>
      `;
    }
  }
}

async function renderStats() {
  const session = getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  try {
    const data = await api(
      `/api/wallet?userId=${encodeURIComponent(session.id)}`
    );

    if (!data || !data.user) return;

    const user = data.user;

    const balanceEl = document.getElementById("earn-balance");
    const earningsEl = document.getElementById("earn-total");

    if (balanceEl) {
      balanceEl.textContent =
        "₦" +
        Number(user.balance || 0).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }

    if (earningsEl) {
      earningsEl.textContent =
        "₦" +
        Number(user.earnings || 0).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    }
  } catch (error) {
    console.error("Earnings stats error:", error);
  }
}

function renderTasks(filter = "All") {
  const box = document.getElementById("task-list");

  if (!box) return;

  const tasks =
    filter === "All"
      ? TASKS
      : TASKS.filter(task => task.type === filter);

  if (!tasks.length) {
    box.innerHTML = `
      <div class="empty-state">
        <span>🎯</span>
        <h3>No tasks available</h3>
        <p>Check back later for new earning opportunities.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = tasks
    .map(
      task => `
        <article class="task-card">
          <span class="task-icon">${task.icon || "🎯"}</span>

          <div class="task-main">
            <div class="task-meta">
              <span>${task.type || "Task"}</span>
              <span>${task.time || ""}</span>
            </div>

            <h3>${task.title || "Earning Task"}</h3>
            <p>${task.desc || ""}</p>
          </div>

          <div class="task-action">
            <strong>
              ₦${Number(task.reward || 0).toLocaleString("en-NG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </strong>

            <button onclick="completeTask('${task.id}')">
              Start Task
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

async function completeTask(id) {
  const session = getSession();

  if (!session) {
    alert("Please login first.");
    window.location.href = "login.html";
    return;
  }

  try {
    const result = await api("/api/complete-task", {
      method: "POST",
      body: JSON.stringify({
        userId: session.id,
        taskId: id
      })
    });

    if (result && result.error) {
      alert(result.error);
      return;
    }

    alert(
      result.message ||
      "Task completed successfully and your reward has been credited."
    );

    await renderStats();
    await loadTasks();
  } catch (error) {
    console.error("Task completion error:", error);

    alert(
      error.message ||
      "Unable to complete task. Please try again."
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadTasks();
  renderStats();
});

window.loadTasks = loadTasks;
window.renderStats = renderStats;
window.renderTasks = renderTasks;
window.completeTask = completeTask;

let secs=300;
setInterval(()=>{
 const el=document.getElementById('popadsCooldown');
 if(!el)return;
 el.textContent=String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
 if(secs>0)secs--;
},1000);
