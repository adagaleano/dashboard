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
  depData:       null,
  depPrev:       null,
  segModo:       'recaudacion',
  segMes:        null,
  segRanking:    null,
  segRankingPos: 1,
  segTablaData:  null
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

  if (tab === 'pagina2'      && AppState.dataActual) renderPagina2();
  if (tab === 'segmentacion' && AppState.dataActual) renderSegmentacion();
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

  // Limpiar estado de segmentación al cambiar de año
  AppState.depData       = null;
  AppState.depPrev       = null;
  AppState.segRanking    = null;
  AppState.segRankingPos = 1;
  AppState.segTablaData  = null;

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

  } catch (e) {
    const errEl = document.getElementById('error-msg');
    if (errEl) {
      errEl.textContent = `Error cargando datos ${anio}: ${e.message}`;
      errEl.style.display = 'block';
    }
    console.error('cargarAnio error:', e);
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
  // Si no hay filas (hoja vacía o año sin datos), mostrar aviso en lugar de gráficas vacías
  if (!data.length) {
    const el = document.getElementById('error-msg');
    if (el) {
      el.textContent = `No hay datos de recaudación para ${AppState.anioActual}. Selecciona otro año.`;
      el.style.display = 'block';
    }
    return;
  }
  const anio = AppState.anioActual;

  // KPI Cards
  const cumpl    = calcCumplimiento(data);
  const cumplMes = calcCumplimientoMes(data);

  setCard('kpi-cumplimiento-anual',  `${fmt(cumpl.pct)}%`,    'Cumplimiento de Meta Anual',            '📈');
  setCard('kpi-cumplimiento-mes',    `${fmt(cumplMes.pct)}%`, `Cumplimiento ${cumplMes.mes || ''}`,    '📅');
  setCard('kpi-total-recaudado',     fmt(cumpl.observado),    'Total Recaudado (Mill. Lempiras)',       '✅');
  setCard('kpi-total-meta',          fmt(cumpl.meta),         'Total Meta (Mill. Lempiras)',            '🎯');

  const pasos = [
    ['Histograma',   () => renderHistograma(data, 'chart-histograma')],
    ['Pastel',       () => renderGraficoPastel(data, 'chart-pastel')],
    ['Velocímetro',  () => renderVelocimetro(data, 'chart-velocimetro')],
    ['TablaImpuestos', () => renderTablaImpuestos(data, 'container-tabla-impuestos', anio)],
    ['TablaAcumulado', () => renderTablaAcumulado(data, 'container-tabla-acumulado')],
    ['TablaVariaciones', () => renderTablaVariaciones(data, AppState.dataPrev, anio, AppState.modo, AppState.mesCorte, AppState.mesMensual, 'container-tabla-variaciones')],
    ['Controles',    () => actualizarVisibilidadControles()]
  ];

  for (const [nombre, fn] of pasos) {
    try { fn(); }
    catch (e) {
      console.error(`[renderDashboard] Error en ${nombre}:`, e);
      throw new Error(`Fallo en ${nombre}: ${e.message}`);
    }
  }
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
  const modo    = AppState.modo;
  const corteEl   = document.getElementById('control-mes-corte');
  const mensualEl = document.getElementById('control-mes-mensual');
  if (corteEl)   corteEl.style.display   = modo === 'acumulado' ? 'block' : 'none';
  if (mensualEl) mensualEl.style.display = modo === 'mensual'   ? 'block' : 'none';
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

  // Actualizar IPC en background sin bloquear la carga principal
  if (typeof cargarIpcDesdeBancoCentral === 'function') {
    cargarIpcDesdeBancoCentral().catch(() => {});
  }

  // Seleccionar el año más reciente del selector.
  // Solo se retrocede si el año lanza error (hoja inexistente / sin acceso);
  // un año vacío (sin filas) es válido y se muestra igualmente.
  let inicialIdx = AppState.years.length - 1;
  for (let i = AppState.years.length - 1; i >= 0; i--) {
    const y = AppState.years[i];
    try {
      await loadWithCache(
        y.sheet,
        () => loadPa01Data(AppState.accessToken, DASHBOARD_SPREADSHEET_ID, y.sheet)
      );
      inicialIdx = i; // la hoja existe (aunque esté vacía) → usar este año
      break;
    } catch { /* hoja inaccesible → probar año anterior */ }
  }
  const inicial = AppState.years[inicialIdx];
  sel.value = inicial.sheet;
  await cargarAnio(inicial.sheet, inicial.year);
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

// ── Segmentación: carga de datos por departamento ────────────────────────────
// Posibles nombres de hoja para datos de departamento (se prueban en orden)
const DEP_SHEET_PATTERNS = [
  anio => `Departamento_${anio}`,
  anio => `departamento_${anio}`,
  anio => `Depto_${anio}`,
  anio => `depto_${anio}`,
  anio => `Dep_${anio}`
];

async function tryLoadDepSheet(anio) {
  for (const pattern of DEP_SHEET_PATTERNS) {
    const sheetName = pattern(anio);
    try {
      const data = await loadWithCache(
        sheetName,
        () => loadDepData(AppState.accessToken, DASHBOARD_SPREADSHEET_ID, sheetName)
      );
      if (data && data.length > 0) {
        console.log(`[Seg] Hoja encontrada: ${sheetName} (${data.length} filas)`);
        return { data, sheetName };
      }
      console.log(`[Seg] ${sheetName}: sin datos`);
    } catch (e) {
      console.log(`[Seg] ${sheetName}: error – ${e.message}`);
    }
  }
  return { data: null, sheetName: null };
}

async function cargarDepData() {
  if (!AppState.anioActual) return;
  const anio = AppState.anioActual;

  // Buscar hoja del año actual hacia atrás (igual que el R app con anio_max)
  let depAnio = null;
  for (let y = anio; y >= anio - 3 && !depAnio; y--) {
    const { data, sheetName } = await tryLoadDepSheet(y);
    if (data && data.length > 0) {
      AppState.depData      = data;
      AppState.depSheetName = sheetName;
      depAnio = y;
    }
  }

  if (!depAnio) {
    AppState.depData      = null;
    AppState.depSheetName = null;
  }

  // Hoja del año anterior al que encontramos con datos
  const { data: prev } = await tryLoadDepSheet((depAnio || anio) - 1);
  AppState.depPrev = prev || null;
}

// ── Poblar selector de mes para segmentación ──────────────────────────────────
function poblarSelectorMesSeg() {
  const sel = document.getElementById('sel-mes-seg');
  if (!sel) return;

  const meses = AppState.depData ? getMesesDisponibles(AppState.depData) : [];
  sel.innerHTML = '<option value="">Todos los meses</option>'
    + meses.map(m => {
        const nombre = MESES_ORDENADOS[m - 1] || `Mes ${m}`;
        return `<option value="${m}">${nombre}</option>`;
      }).join('');

  if (meses.length) {
    const ultimo = meses[meses.length - 1];
    sel.value       = String(ultimo);
    AppState.segMes = ultimo;
  } else {
    AppState.segMes = null;
  }
}

// ── Render segmentación completa ─────────────────────────────────────────────
async function renderSegmentacion() {
  if (!AppState.dataActual) return;

  // Cargar datos de departamento si aún no están disponibles
  if (!AppState.depData) {
    showLoading('Cargando datos por departamento…');
    try { await cargarDepData(); }
    finally { hideLoading(); }
  }

  if (!AppState.depData) {
    const intentados = DEP_SHEET_PATTERNS.map(p => p(AppState.anioActual)).join(', ');
    console.warn('[Seg] Hojas buscadas:', intentados);

    // Determinar si es probable que las hojas existan pero estén ocultas
    // (cuando la app R funciona pero el dashboard web no, la causa casi siempre
    //  es que las hojas Departamento_YYYY están ocultas en Google Sheets —
    //  el endpoint gviz no accede a hojas ocultas; la API v4 sí)
    const hayApiKey = typeof GOOGLE_API_KEY !== 'undefined' && GOOGLE_API_KEY;
    const hayServiceAccount = typeof SERVICE_ACCOUNT_KEY !== 'undefined';

    const el = document.getElementById('ranking-cards');
    if (el) {
      el.innerHTML = `
        <div style="background:#fff8e1;border-left:4px solid #ffa000;border-radius:6px;
                    padding:16px 18px;max-width:620px;margin:10px 0;font-size:13px;line-height:1.6;">
          <p style="margin:0 0 10px;font-weight:700;color:#e65100;font-size:14px;">
            ⚠️ Datos de segmentación no disponibles en línea
          </p>
          <p style="margin:0 0 8px;color:#5d4037;">
            Las hojas <strong>Departamento_${AppState.anioActual}</strong> muy probablemente están
            <strong>ocultas</strong> en Google Sheets. La app de escritorio (R) puede acceder a ellas
            porque usa la Sheets API v4 con autenticación; el dashboard web cae en el endpoint
            <em>gviz</em> que <strong>no lee hojas ocultas</strong>.
          </p>
          <p style="margin:0 0 6px;font-weight:600;color:#4e342e;">Solución más simple:</p>
          <ol style="margin:0 0 10px;padding-left:20px;color:#5d4037;">
            <li>Abre el spreadsheet en Google Sheets.</li>
            <li>Haz clic derecho en la pestaña <strong>Departamento_${AppState.anioActual}</strong>
                (si aparece en la lista de hojas ocultas).</li>
            <li>Elige <em>Mostrar hoja</em> y repite para todos los años.</li>
            <li>Recarga el dashboard (<strong>Actualizar datos</strong>).</li>
          </ol>
          <p style="margin:0 0 6px;font-weight:600;color:#4e342e;">Alternativa (sin cambiar el spreadsheet):</p>
          <p style="margin:0;color:#5d4037;">
            Añade una Google Sheets API Key en <code>config.public.js</code>:<br>
            <code style="background:#f5f5f5;padding:2px 6px;border-radius:3px;">
              window.GOOGLE_API_KEY = 'AIza...tu-clave...';
            </code>
          </p>
        </div>`;
    }
    return;
  }

  // Poblar selector de mes si aún está vacío
  const sel = document.getElementById('sel-mes-seg');
  if (sel && sel.options.length <= 1) poblarSelectorMesSeg();

  const anio   = AppState.anioActual;
  const anioP  = anio ? anio - 1 : null;
  const mesNum = AppState.segMes ? Number(AppState.segMes) : null;
  const mode   = AppState.segModo || 'recaudacion';
  const mesLbl = mesNum ? (MESES_ORDENADOS[mesNum - 1] || `Mes ${mesNum}`) : 'Acumulado';

  // Ajustar montos departamentales al total PA01 por mes
  const adjActual = ajustarPorPa01(AppState.depData, AppState.dataActual);
  const adjPrev   = ajustarPorPa01(AppState.depPrev, AppState.dataPrev);
  const col       = getColDep(adjActual);
  if (!col) return;

  // Agregación interanual (mapa + ranking)
  const agg = agregarInteranual(adjActual, adjPrev, col, mesNum, anio, anioP);

  // Ranking menor → mayor (como en Shiny)
  AppState.segRanking    = [...agg].sort((a, b) => (a.valor || 0) - (b.valor || 0));
  AppState.segRankingPos = AppState.segRankingPos || 1;

  // Datos de tabla para exportar
  AppState.segTablaData = buildTablaSegmentacion(adjActual, adjPrev, anio, mesNum);

  // Actualizar títulos
  const modeLabel = { recaudacion: 'Recaudación', variacion: 'Var. nominal', var_real: 'Var. real' }[mode] || mode;
  const mapTitleEl  = document.getElementById('seg-map-title');
  const rankTitleEl = document.getElementById('seg-ranking-title');
  if (mapTitleEl)  mapTitleEl.textContent  = `Mapa por Departamento — ${modeLabel} ${mesLbl} ${anio || ''}`;
  if (rankTitleEl) rankTitleEl.textContent = `Ranking Departamentos — Recaudación ${mesLbl} ${anio || ''}`;

  // Inicializar mapa Leaflet si aún no existe (requiere que el contenedor sea visible)
  if (!_mapaInstance) crearMapaBase('mapa-departamentos');

  // Asegurar que el GeoJSON esté cargado antes de renderizar el mapa
  if (!_hnGeojson) {
    try { await cargarGeojson('hn_departamentos.geojson'); } catch (e) {}
  }

  await renderMapaSegmentacion(agg, mode, mesLbl, anio, anioP);
  renderRankingDep(AppState.segRanking, 'ranking-cards', AppState.segRankingPos);
  renderTablaSegmentacion(AppState.segTablaData, 'container-tabla-seg', anio);
}

// ── Event handlers de segmentación ───────────────────────────────────────────
function onMesSegChange() {
  const val = document.getElementById('sel-mes-seg')?.value;
  AppState.segMes        = val ? Number(val) : null;
  AppState.segRankingPos = 1;
  renderSegmentacion();
}

function onModeSegChange(mode) {
  AppState.segModo = mode;
  ['recaudacion', 'variacion', 'var_real'].forEach(m => {
    const btn = document.getElementById(`btn-seg-${m}`);
    if (btn) btn.classList.toggle('viz-btn-active', m === mode);
  });
  renderSegmentacion();
}

function onRankingPrev() {
  AppState.segRankingPos = Math.max(1, (AppState.segRankingPos || 1) - 5);
  if (AppState.segRanking) {
    renderRankingDep(AppState.segRanking, 'ranking-cards', AppState.segRankingPos);
  }
}

function onRankingNext() {
  const n      = AppState.segRanking ? AppState.segRanking.length : 0;
  const newPos = (AppState.segRankingPos || 1) + 5;
  if (newPos <= n) {
    AppState.segRankingPos = newPos;
    renderRankingDep(AppState.segRanking, 'ranking-cards', AppState.segRankingPos);
  }
}

// Lanzar al cargar la página — primero el login, luego la carga de datos
window.addEventListener('DOMContentLoaded', () => {
  initLogin(initApp);
});
