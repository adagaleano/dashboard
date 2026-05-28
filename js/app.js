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
  mesMensual:   null,
  // Segmentación
  depActual:    null,
  depPrev:      null,
  mesSeg:       null,
  modeSeg:      'recaudacion',
  rankingPos:   1,
  _rankingData: null,
  segTablaData: null
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

  if (tab === 'segmentacion') {
    if (!_mapaInstance) {
      crearMapaBase('mapa-departamentos');
    } else {
      _mapaInstance.invalidateSize();
    }
    if (AppState.depActual) renderSegmentacion();
  }
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

    // PA01 año anterior
    const prevSheet = `pa01_${anio - 1}`;
    try {
      AppState.dataPrev = await loadWithCache(
        prevSheet,
        () => loadPa01Data(AppState.accessToken, DASHBOARD_SPREADSHEET_ID, prevSheet)
      );
    } catch {
      AppState.dataPrev = null;
    }

    // Departamento año actual
    const depSheet = `Departamento_${anio}`;
    try {
      const rawDep = await loadWithCache(
        `dep_${anio}`,
        () => loadDepData(AppState.accessToken, DASHBOARD_SPREADSHEET_ID, depSheet)
      );
      AppState.depActual = ajustarPorPa01(rawDep, AppState.dataActual);
    } catch {
      AppState.depActual = null;
    }

    // Departamento año anterior
    const depPrevSheet = `Departamento_${anio - 1}`;
    try {
      const rawDepPrev = await loadWithCache(
        `dep_${anio - 1}`,
        () => loadDepData(AppState.accessToken, DASHBOARD_SPREADSHEET_ID, depPrevSheet)
      );
      AppState.depPrev = ajustarPorPa01(rawDepPrev, AppState.dataPrev);
    } catch {
      AppState.depPrev = null;
    }

    actualizarUltimoMesControles();
    actualizarMesesSeg();
    renderDashboard();

    if (AppState.currentTab === 'segmentacion' && AppState.depActual) renderSegmentacion();

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

  const selCorte  = document.getElementById('sel-mes-corte');
  const selMensual = document.getElementById('sel-mes-mensual');

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

  // Intentar obtener IPC fresco desde el Excel del BCH en background (no bloquea el inicio)
  cargarIpcDesdeBancoCentral().then(actualizado => {
    if (!actualizado) return;
    if (AppState.dataActual) {
      renderDashboard();
    }
    if (AppState.currentTab === 'segmentacion' && AppState.depActual) {
      renderSegmentacion();
    }
  });

  try {
    AppState.accessToken = await getAccessToken(SERVICE_ACCOUNT_KEY, SCOPES);
  } catch (e) {
    hideLoading();
    document.getElementById('error-msg').textContent = `Error de autenticación: ${e.message}`;
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
  await cargarIpcDesdeBancoCentral();
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

// ── Segmentación ─────────────────────────────────────────────────────────────

function actualizarMesesSeg() {
  const meses = getMesesDisponibles(AppState.depActual);
  const sel   = document.getElementById('sel-mes-seg');
  if (!sel) return;

  const ultimo  = meses.length ? meses[meses.length - 1] : null;
  sel.innerHTML = '<option value="">Todos los meses</option>' +
    meses.map(m => {
      const nombre = MESES_ORDENADOS[m - 1] || m;
      return `<option value="${m}" ${m === ultimo ? 'selected' : ''}>${nombre}</option>`;
    }).join('');

  AppState.mesSeg = ultimo;
}

async function renderSegmentacion() {
  const anio  = AppState.anioActual;
  const anioP = anio ? anio - 1 : null;
  const mes   = AppState.mesSeg;
  const mode  = AppState.modeSeg;

  const mesLbl = mes ? (MESES_ORDENADOS[mes - 1] || String(mes)) : 'Año completo';

  const mapTitleEl     = document.getElementById('seg-map-title');
  const rankTitleEl    = document.getElementById('seg-ranking-title');
  if (mapTitleEl)  mapTitleEl.textContent  = `Mapa por Departamento — ${mesLbl}${anio ? ' ' + anio : ''}`;
  if (rankTitleEl) rankTitleEl.textContent = `Ranking Departamentos — ${mesLbl}${anio ? ' ' + anio : ''}`;

  if (!AppState.depActual) {
    document.getElementById('ranking-cards').innerHTML       = '<p style="color:#888;padding:10px;">Sin datos de segmentación.</p>';
    document.getElementById('container-tabla-seg').innerHTML = '<p style="color:#888;padding:10px;">Sin datos de segmentación.</p>';
    return;
  }

  const col = getColDep(AppState.depActual);
  if (!col) return;

  const agg = agregarInteranual(AppState.depActual, AppState.depPrev, col, mes, anio, anioP);

  // Map
  await renderMapaSegmentacion(agg, mode, mesLbl, anio, anioP);

  // Asegurar que el GeoJSON está disponible para los mini-mapas aunque el mapa principal haya fallado
  if (!_hnGeojson) {
    try { await cargarGeojson('hn_departamentos.geojson'); } catch(e) { /* mini-mapas quedarán en blanco */ }
  }

  // Ranking (ascending = lowest first, like R)
  const totalValor = agg.reduce((s, r) => s + (r.valor || 0), 0);
  const rankingData = agg
    .map(r => ({ ...r, pct: totalValor > 0 ? r.valor / totalValor * 100 : 0 }))
    .sort((a, b) => a.valor - b.valor);

  AppState._rankingData = rankingData;
  AppState.rankingPos   = 1;
  renderRankingDep(rankingData, 'ranking-cards', 1);

  // Table
  const tablaData = buildTablaSegmentacion(AppState.depActual, AppState.depPrev, anio, mes);
  AppState.segTablaData = tablaData;
  renderTablaSegmentacion(tablaData, 'container-tabla-seg', anio);
}

function onMesSegChange() {
  const val     = document.getElementById('sel-mes-seg').value;
  AppState.mesSeg = val ? parseInt(val) : null;
  if (AppState.currentTab === 'segmentacion') renderSegmentacion();
}

function onModeSegChange(mode) {
  AppState.modeSeg = mode;
  ['recaudacion', 'variacion', 'var_real'].forEach(m => {
    const btn = document.getElementById(`btn-seg-${m}`);
    if (btn) {
      btn.classList.toggle('viz-btn-active', m === mode);
    }
  });
  if (AppState.currentTab === 'segmentacion') renderSegmentacion();
}

function onRankingPrev() {
  if (!AppState._rankingData) return;
  AppState.rankingPos = Math.max(1, AppState.rankingPos - 5);
  renderRankingDep(AppState._rankingData, 'ranking-cards', AppState.rankingPos);
}

function onRankingNext() {
  if (!AppState._rankingData) return;
  const n = AppState._rankingData.length;
  AppState.rankingPos = Math.min(Math.max(1, n - 4), AppState.rankingPos + 5);
  renderRankingDep(AppState._rankingData, 'ranking-cards', AppState.rankingPos);
}

// Lanzar al cargar la página
window.addEventListener('DOMContentLoaded', () => {
  if (typeof initLogin === 'function') {
    initLogin(initApp);
  } else {
    initApp();
  }
});
