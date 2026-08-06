// Profile editing client

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showMessage(msg, elId="profile-message", timeout=5000) {
  let el = document.getElementById(elId);
  if (!el) {
    el = document.createElement('div');
    el.id = elId;
    const container = document.querySelector('main') || document.body;
    container.insertBefore(el, container.firstChild);
  }
  el.textContent = msg;
  el.style.color = msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed') ? 'crimson' : 'green';
  setTimeout(()=>{ if (el) el.textContent = ''; }, timeout);
}

function enterEditMode() {
  const full = document.getElementById('profile-fullname');
  const email = document.getElementById('profile-email');
  if (!full || !email) return;

  const nameVal = full.textContent || '';
  const emailVal = email.textContent || '';

  full.innerHTML = `<input id="edit-fullname" value="${nameVal}" />`;
  email.innerHTML = `<input id="edit-email" value="${emailVal}" />`;

  const actions = document.getElementById('profile-actions');
  if (actions) actions.innerHTML = `<button onclick="saveProfile()" class="primary-btn">Save</button> <button onclick="cancelEdit()" class="secondary-btn">Cancel</button>`;
}

function cancelEdit(){
  // reload profile to reset UI
  if (typeof protectDashboard === 'function') protectDashboard();
}

async function saveProfile(){
  const session = getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  const fullInput = document.getElementById('edit-fullname');
  const emailInput = document.getElementById('edit-email');
  if (!fullInput || !emailInput) return;

  const full_name = (fullInput.value || '').trim();
  const email = (emailInput.value || '').trim().toLowerCase();

  if (!full_name) { showMessage('Full name is required.', 'profile-message'); return; }
  if (!email || !isValidEmail(email)) { showMessage('Enter a valid email address.', 'profile-message'); return; }

  try{
    const res = await fetch(`/api/profile/${encodeURIComponent(session.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, email })
    });

    const data = await res.json();
    if (!res.ok) { showMessage(data.error || 'Failed to update profile.', 'profile-message'); return; }

    // Update session and local cache
    if (typeof setSession === 'function') setSession(data.user);

    // Re-render profile fields using protectDashboard logic
    if (typeof protectDashboard === 'function') protectDashboard();

    showMessage('Profile updated successfully.', 'profile-message');

    const actions = document.getElementById('profile-actions');
    if (actions) actions.innerHTML = `<button class="primary-btn" onclick="enterEditMode()">Edit Profile</button>`;
  }catch(e){
    console.error(e); showMessage('Unable to connect to server.', 'profile-message');
  }
}

// expose
window.enterEditMode = enterEditMode;
window.saveProfile = saveProfile;
window.cancelEdit = cancelEdit;
