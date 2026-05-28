// =========================
//  App principal — equivalente a server() y observeEvent() de app.R
// =========================

const AppState = {
  accessToken:  null,
  dataActual:   null,
  dataPrev:     null,
  anioActual:   null,
  aniosPrev:    null,
  years:        [],
  currentTab:   'dashboard',
  modo:         'anual',
  mesCorte:     null,
  mesMensual:   null
};

// ── Navegación ────────────────────────────────────────────────────────────────
function switchTab(tab) {
  AppState.currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const tabEl = document.getElementById(`tab-${tab}`);
  const btnEl = document.getElementById(`btn-${tab}`);
  if (tabEl) tabEl.classList.add('active');
  if (btnEl) btnEl.classList.add('active');

  if (tab === 'pagina2' && AppState.dataActual) renderPagina2();
}

// ── Loading overlay ───────────────────────────────────────────────────────────
function showLoading(msg) {
  document.getElementById('loading-msg').textContent = msg || 'Cargando…';
  document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

// ── Cargar datos del año seleccionado ─────────────────────────────────────────
async function cargarAnio(sheetName, anio, fromRefresh = false) {
  showLoading(`Cargando datos ${anio}…`);

  try {
    const cacheKey = fromRefresh ? null : sheetName;

    AppState.dataActual = await loadWithCache(
      cacheKey || sheetName,
      () => loadPa01Data(AppState.accessToken, DASHBOARD_SPREADSHEET_ID, sheetName)
    );
    AppState.anioActual = anio;

    // Año anterior
    const prevSheet = `pa01_${anio - 1}`;
    try {
      AppState.dataPrev = await loadWithCache(
        prevSheet,
        () => loadPa01Data(AppState.accessToken, DASHBOARD_SPREADSHEET_ID, prevSheet)
      );
    } catch {
      AppState.dataPrev = null;
    }

    actualizarUltimoMesControles();
    renderDashboard();

  } finally {
    hideLoading();
  }
}

// ── Pre-seleccionar último mes disponible en los controles ────────────────────
function actualizarUltimoMesControles() {
  const ultimo = getUltimoMes(AppState.dataActual);
  if (!ultimo) return;

  const idx           = MESES_ORDENADOS.indexOf(ultimo);
  const mesesDisp     = MESES_ORDENADOS.slice(0, idx + 1);

  const selCorte      = document.getElementById('sel-mes-corte');
  const selMensual    = document.getElementById('sel-mes-mensual');

  [selCorte, selMensual].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = mesesDisp.map(m => `<option value="${m}" ${m === ultimo ? 'selected' : ''}>${m}</option>`).join('');
  });

  AppState.mesCorte   = ultimo;
  AppState.mesMensual = ultimo;
}

// ── Renderizar todo el Dashboard ─────────────────────────────────────────────
function renderDashboard() {
  if (!AppState.dataActual) return;
  const data = AppState.dataActual;
  const anio = AppState.anioActual;

  // KPI Cards
  const cumpl    = calcCumplimiento(data);
  const cumplMes = calcCumplimientoMes(data);

  setCard('kpi-cumplimiento-anual',  `${fmt(cumpl.pct)}%`,    'Cumplimiento de Meta Anual',            '📈');
  setCard('kpi-cumplimiento-mes',    `${fmt(cumplMes.pct)}%`, `Cumplimiento ${cumplMes.mes || ''}`,    '📅');
  setCard('kpi-total-recaudado',     fmt(cumpl.observado),    'Total Recaudado (Mill. Lempiras)',       '✅');
  setCard('kpi-total-meta',          fmt(cumpl.meta),         'Total Meta (Mill. Lempiras)',            '🎯');

  // Gráficos
  renderHistograma(data, 'chart-histograma');
  renderGraficoPastel(data, 'chart-pastel');
  renderVelocimetro(data, 'chart-velocimetro');

  // Tablas
  renderTablaImpuestos(data, 'container-tabla-impuestos', anio);
  renderTablaAcumulado(data, 'container-tabla-acumulado');
  renderTablaVariaciones(data, AppState.dataPrev, anio, AppState.modo, AppState.mesCorte, AppState.mesMensual, 'container-tabla-variaciones');

  // Visibilidad de controles de modo
  actualizarVisibilidadControles();
}

function setCard(id, valor, label, icon) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `
    <div class="kpi-icon">${icon}</div>
    <div class="kpi-value">${valor}</div>
    <div class="kpi-label">${label}</div>`;
}

function actualizarVisibilidadControles() {
  const modo = AppState.modo;
  document.getElementById('control-mes-corte')  .style.display = modo === 'acumulado' ? 'block' : 'none';
  document.getElementById('control-mes-mensual') .style.display = modo === 'mensual'   ? 'block' : 'none';
}

function renderPagina2() {
  if (!AppState.dataActual) return;
  renderTablaPagina2(AppState.dataActual, 'container-tabla-pagina2', AppState.anioActual);
}

// ── Inicio ────────────────────────────────────────────────────────────────────
async function initApp() {
  showLoading('Autenticando…');

  const hasServiceAccount = typeof SERVICE_ACCOUNT_KEY !== 'undefined' && typeof SCOPES !== 'undefined';
  const hasApiKey = typeof GOOGLE_API_KEY !== 'undefined' && GOOGLE_API_KEY;
  const hasPublicYears = Array.isArray(window.DASHBOARD_PUBLIC_YEARS) && window.DASHBOARD_PUBLIC_YEARS.length > 0;
  const hasSpreadsheetId = typeof DASHBOARD_SPREADSHEET_ID !== 'undefined' && DASHBOARD_SPREADSHEET_ID;

  if (!hasSpreadsheetId) {
    hideLoading();
    document.getElementById('error-msg').textContent = 'Falta DASHBOARD_SPREADSHEET_ID en config.js o config.public.js.';
    document.getElementById('error-msg').style.display = 'block';
    return;
  }

  if (hasServiceAccount) {
    try {
      AppState.accessToken = await getAccessToken(SERVICE_ACCOUNT_KEY, SCOPES);
    } catch (e) {
      hideLoading();
      document.getElementById('error-msg').textContent = `Error de autenticación: ${e.message}`;
      document.getElementById('error-msg').style.display = 'block';
      return;
    }
  } else if (hasApiKey || hasPublicYears) {
    AppState.accessToken = null;
  } else {
    hideLoading();
    document.getElementById('error-msg').textContent = 'Falta configurar GOOGLE_API_KEY, DASHBOARD_PUBLIC_YEARS o SERVICE_ACCOUNT_KEY.';
    document.getElementById('error-msg').style.display = 'block';
    return;
  }

  showLoading('Detectando años disponibles…');

  try {
    AppState.years = await loadWithCache('available_years',
      () => getAvailableYears(AppState.accessToken, DASHBOARD_SPREADSHEET_ID)
    );
  } catch (e) {
    hideLoading();
    document.getElementById('error-msg').textContent = `Error obteniendo hojas: ${e.message}`;
    document.getElementById('error-msg').style.display = 'block';
    return;
  }

  if (!AppState.years.length) {
    hideLoading();
    document.getElementById('error-msg').textContent = 'No se encontraron hojas pa01_XXXX en el spreadsheet.';
    document.getElementById('error-msg').style.display = 'block';
    return;
  }

  // Poblar selector de años
  const sel = document.getElementById('year-select');
  sel.innerHTML = AppState.years.map(y =>
    `<option value="${y.sheet}" data-year="${y.year}">${y.year}</option>`
  ).join('');

  // Seleccionar el año más reciente
  const ultimo = AppState.years[AppState.years.length - 1];
  sel.value = ultimo.sheet;
  await cargarAnio(ultimo.sheet, ultimo.year);
}

// ── Event listeners (se enganchan desde el HTML) ─────────────────────────────
function onYearChange() {
  const sel    = document.getElementById('year-select');
  const opt    = sel.options[sel.selectedIndex];
  const sheet  = sel.value;
  const anio   = parseInt(opt.dataset.year);
  cargarAnio(sheet, anio);
}

async function onRefresh() {
  clearCache();
  const sel   = document.getElementById('year-select');
  const opt   = sel.options[sel.selectedIndex];
  const sheet = sel.value;
  const anio  = parseInt(opt.dataset.year);
  await cargarAnio(sheet, anio, true);
}

function onModoChange() {
  AppState.modo = document.getElementById('sel-modo-variacion').value;
  actualizarVisibilidadControles();
  if (AppState.dataActual) {
    renderTablaVariaciones(AppState.dataActual, AppState.dataPrev, AppState.anioActual,
      AppState.modo, AppState.mesCorte, AppState.mesMensual, 'container-tabla-variaciones');
  }
}

function onMesCorteChange() {
  AppState.mesCorte = document.getElementById('sel-mes-corte').value;
  if (AppState.dataActual) {
    renderTablaVariaciones(AppState.dataActual, AppState.dataPrev, AppState.anioActual,
      AppState.modo, AppState.mesCorte, AppState.mesMensual, 'container-tabla-variaciones');
  }
}

function onMesMensualChange() {
  AppState.mesMensual = document.getElementById('sel-mes-mensual').value;
  if (AppState.dataActual) {
    renderTablaVariaciones(AppState.dataActual, AppState.dataPrev, AppState.anioActual,
      AppState.modo, AppState.mesCorte, AppState.mesMensual, 'container-tabla-variaciones');
  }
}

// Lanzar al cargar la página
window.addEventListener('DOMContentLoaded', initApp);
