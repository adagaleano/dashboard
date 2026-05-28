const LOGIN_SESSION_KEY = 'dashboard_sar_logged_in';

function getAppUsers() {
  return Array.isArray(window.APP_USERS) ? window.APP_USERS : (typeof APP_USERS !== 'undefined' ? APP_USERS : []);
}

function showLoginError(message) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}

function clearLoginError() {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

function unlockDashboard(onSuccess) {
  document.body.classList.remove('auth-locked');
  document.body.classList.add('auth-ready');

  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) loginScreen.style.display = 'none';

  if (typeof onSuccess === 'function') onSuccess();
}

function handleAppLogin(onSuccess) {
  clearLoginError();

  const username = document.getElementById('login-user')?.value.trim() || '';
  const password = document.getElementById('login-password')?.value || '';
  const user = getAppUsers().find(u => u.username === username && u.password === password);

  if (!user) {
    showLoginError('Usuario o contraseña incorrectos.');
    return;
  }

  localStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify({
    username: user.username,
    name: user.name || user.username,
    loggedAt: new Date().toISOString()
  }));

  unlockDashboard(onSuccess);
}

function initLogin(onSuccess) {
  const saved = localStorage.getItem(LOGIN_SESSION_KEY);
  if (saved) {
    unlockDashboard(onSuccess);
    return;
  }

  const form = document.getElementById('login-form');
  if (!form) {
    unlockDashboard(onSuccess);
    return;
  }

  document.body.classList.add('auth-locked');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleAppLogin(onSuccess);
  });
}

function onLogout() {
  localStorage.removeItem(LOGIN_SESSION_KEY);
  window.location.reload();
}
