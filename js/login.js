const LOGIN_SESSION_KEY   = 'dashboard_sar_logged_in';
const LOGIN_SESSION_HORAS = 8; // sesión expira a las 8 horas de inactividad

function getAppUsers() {
  const users = Array.isArray(window.APP_USERS) ? window.APP_USERS : [];
  if (users.length) return users;

  return [
    {
      username: 'sar',
      password: 'sar2026',
      name: 'Usuario SAR'
    }
  ];
}

function cleanLoginValue(value, lower = false) {
  let text = String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  return lower ? text.toLowerCase() : text;
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

function sesionValida() {
  const raw = localStorage.getItem(LOGIN_SESSION_KEY);
  if (!raw) return false;
  try {
    const { loggedAt } = JSON.parse(raw);
    const ms = LOGIN_SESSION_HORAS * 3600 * 1000;
    return (Date.now() - new Date(loggedAt).getTime()) < ms;
  } catch {
    return false;
  }
}

function handleAppLogin(onSuccess) {
  clearLoginError();

  const username = cleanLoginValue(document.getElementById('login-user')?.value, true);
  const password = cleanLoginValue(document.getElementById('login-password')?.value);
  const user = getAppUsers().find(u =>
    cleanLoginValue(u.username, true) === username &&
    cleanLoginValue(u.password) === password
  );

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
  if (sesionValida()) {
    // Renovar timestamp para reiniciar el contador desde el último acceso
    try {
      const raw  = JSON.parse(localStorage.getItem(LOGIN_SESSION_KEY));
      raw.loggedAt = new Date().toISOString();
      localStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(raw));
    } catch {}
    unlockDashboard(onSuccess);
    return;
  }

  // Sesión expirada o inexistente — limpiar y mostrar formulario
  localStorage.removeItem(LOGIN_SESSION_KEY);

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
