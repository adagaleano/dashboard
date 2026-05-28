// =========================
//  Segmentación — Domicilio Fiscal (equivalente a mapa.R data processing)
// =========================

// Normalize department name: lowercase, no accents, no spaces, remove prefix
function normDepto(x) {
  if (x == null) return '';
  let s = String(x).toLowerCase().trim();
  s = s.replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e')
       .replace(/[íìïî]/g,'i').replace(/[óòöô]/g,'o')
       .replace(/[úùüû]/g,'u').replace(/ñ/g,'n');
  s = s.replace(/\s+/g, '');
  s = s.replace(/^departamentode/, '');
  return s;
}

// Detect department column (already lowercase after loadDepData)
function getColDep(df) {
  if (!df || !df.length) return null;
  for (const c of ['departamento', 'depto']) {
    if (c in df[0]) return c;
  }
  return null;
}

// Convert month value to integer 1-12 (handles both integers and Spanish names)
function mesANum(x) {
  if (x == null) return null;
  const n = parseInt(String(x).trim());
  if (!isNaN(n) && n >= 1 && n <= 12) return n;
  const s = String(x).toLowerCase().trim()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e')
    .replace(/[íìï]/g,'i').replace(/[óòö]/g,'o')
    .replace(/[úùü]/g,'u').replace(/ñ/g,'n');
  const map = {
    'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,
    'julio':7,'agosto':8,'septiembre':9,'octubre':10,'noviembre':11,'diciembre':12
  };
  return map[s] || null;
}

// Round to 1 decimal
function r1(x) {
  if (x == null || isNaN(x)) return null;
  return Math.round(x * 10) / 10;
}

const IPC_BCH_XLSX_URL = 'https://www.bch.hn/estadisticos/GIE/_layouts/15/download.aspx?UniqueId={46C3242C-464F-47D0-839B-EC8F93FF4E07}';
const IPC_LOCAL_XLSX_URL = 'ipc_bch.xlsx';
const IPC_BASE_YEAR = '2025';

// Cache del IPC (se actualiza desde el Excel del BCH o usa IPC_BCH embebido)
let _ipcCache = (typeof IPC_BCH !== 'undefined' && IPC_BCH) ? rebasarIpc(IPC_BCH) : null;

// Obtener valor IPC para un mes y año dados
function getIpcValor(mesNum, anio) {
  if (!_ipcCache) return null;
  if (!mesNum || !anio) return null;
  const anioStr   = String(anio);
  const mesNombre = MESES_ORDENADOS[mesNum - 1];
  if (!mesNombre) return null;
  const anioData  = _ipcCache[anioStr];
  if (!anioData)  return null;
  const v = anioData[mesNombre];
  return (v !== undefined && v !== null && !isNaN(Number(v))) ? Number(v) : null;
}

function rebasarIpc(ipc, baseYear = IPC_BASE_YEAR) {
  const base = ipc?.[String(baseYear)];
  if (!base) return ipc;

  const valores = Object.values(base)
    .map(v => Number(v))
    .filter(v => !isNaN(v) && v > 0);
  if (!valores.length) return ipc;

  const promedio = valores.reduce((s, v) => s + v, 0) / valores.length;
  const factor = 100 / promedio;
  const out = {};

  Object.entries(ipc).forEach(([anio, meses]) => {
    out[anio] = {};
    Object.entries(meses || {}).forEach(([mes, valor]) => {
      const n = Number(valor);
      if (!isNaN(n)) out[anio][mes] = Math.round(n * factor * 10000) / 10000;
    });
  });

  return out;
}

function parsearIpcWorkbook(buffer) {
  if (typeof XLSX === 'undefined') {
    console.warn('[IPC] SheetJS no esta disponible para leer el Excel del BCH');
    return null;
  }

  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const headerIdx = rows.findIndex(row =>
    row.some(cell => String(cell || '').trim().toLowerCase() === 'meses')
  );
  if (headerIdx < 0) return null;

  const header = rows[headerIdx];
  const mesCol = header.findIndex(cell => String(cell || '').trim().toLowerCase() === 'meses');
  const yearCols = header
    .map((cell, idx) => ({ idx, anio: String(cell || '').trim() }))
    .filter(col => /^20\d{2}$/.test(col.anio));

  const ipc = {};
  rows.slice(headerIdx + 1).forEach(row => {
    const mes = String(row[mesCol] || '').trim();
    if (!MESES_ORDENADOS.includes(mes)) return;

    yearCols.forEach(({ idx, anio }) => {
      const valor = Number(row[idx]);
      if (!isNaN(valor)) {
        if (!ipc[anio]) ipc[anio] = {};
        ipc[anio][mes] = Math.round(valor * 10000) / 10000;
      }
    });
  });

  return Object.keys(ipc).length ? rebasarIpc(ipc) : null;
}

async function cargarIpcDesdeExcel(url, etiqueta) {
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`${etiqueta}: HTTP ${resp.status}`);

  const buffer = await resp.arrayBuffer();
  const ipc = parsearIpcWorkbook(buffer);
  if (!ipc) throw new Error(`${etiqueta}: formato IPC no reconocido`);

  _ipcCache = ipc;
  console.log(`[IPC] Actualizado desde ${etiqueta}; base promedio anual ${IPC_BASE_YEAR}=100`);
  return true;
}

// Actualizar IPC desde JavaScript: BCH directo, archivo local y respaldo embebido.
async function cargarIpcDesdeBancoCentral() {
  const fuentes = [
    [IPC_BCH_XLSX_URL, 'BCH'],
    [IPC_LOCAL_XLSX_URL, 'ipc_bch.xlsx local']
  ];

  for (const [url, etiqueta] of fuentes) {
    try {
      return await cargarIpcDesdeExcel(url, etiqueta);
    } catch(e) {
      console.warn(`[IPC] No se pudo cargar desde ${etiqueta}:`, e.message || e);
    }
  }

  return !!_ipcCache;
}

// Scale dept data to match PA01 totals per month (equiv. ajustar_por_pa01_mensual)
// dep monto is in raw Lempiras; pa01 monto is in millions → factor is dimensionless
function ajustarPorPa01(depData, pa01Data) {
  if (!depData || !depData.length) return depData;
  if (!pa01Data || !pa01Data.length) return depData;

  const pa01ByMes = {};
  pa01Data.forEach(r => {
    if (String(r.categoria   || '').toLowerCase().trim() !== 'observado') return;
    if (String(r.concepto_cat || '').toLowerCase().trim() !== 'total')    return;
    const m = mesANum(r.mes);
    if (!m) return;
    pa01ByMes[m] = (pa01ByMes[m] || 0) + (r.monto || 0);
  });

  if (!Object.keys(pa01ByMes).length) return depData;

  const depTotals = {};
  depData.forEach(r => {
    const m = mesANum(r.mes);
    if (!m) return;
    depTotals[m] = (depTotals[m] || 0) + (parseFloat(r.monto) || 0);
  });

  const factors = {};
  Object.entries(depTotals).forEach(([m, total]) => {
    const mi      = parseInt(m);
    const totalM  = total / 1e6;
    const pa01Tot = pa01ByMes[mi];
    factors[mi]   = (pa01Tot && pa01Tot > 0 && totalM > 0) ? pa01Tot / totalM : 1;
  });

  return depData.map(r => {
    const m = mesANum(r.mes);
    const f = (m && factors[m] !== undefined) ? factors[m] : 1;
    return { ...r, monto: (parseFloat(r.monto) || 0) * f };
  });
}

// Sum monto by dept group, optionally filtered by month number (null = all months)
function agregarPorGrupo(df, colGrupo, mesNum = null) {
  if (!df || !df.length || !colGrupo) return [];
  const map = {};
  df.forEach(r => {
    const grupo = String(r[colGrupo] || '').trim();
    if (!grupo) return;
    const m = mesANum(r.mes);
    if (mesNum !== null && m !== mesNum) return;
    const key = normDepto(grupo);
    if (!map[key]) map[key] = { key, label: grupo, valor: 0 };
    map[key].valor += (parseFloat(r.monto) || 0);
  });
  return Object.values(map);
}

// Year-over-year aggregation (equiv. agregar_interanual)
// anioActual / anioP: usados para calcular varReal con IPC
function agregarInteranual(dfActual, dfPrev, colGrupo, mesNum = null, anioActual = null, anioP = null) {
  if (!dfActual || !colGrupo) return [];
  const actual = agregarPorGrupo(dfActual, colGrupo, mesNum);
  if (!actual.length) return [];

  const prevMap = {};
  if (dfPrev && dfPrev.length) {
    const colPrev = getColDep(dfPrev) || colGrupo;
    agregarPorGrupo(dfPrev, colPrev, mesNum).forEach(r => { prevMap[r.key] = r.valor; });
  }

  // IPC para variación real (mes de referencia = mes seleccionado o último disponible)
  const mesIpc = mesNum || (getMesesDisponibles(dfActual).slice(-1)[0] || null);
  const ipcAct  = getIpcValor(mesIpc, anioActual);
  const ipcPrev = getIpcValor(mesIpc, anioP);
  const hayIpc  = ipcAct && ipcPrev && ipcAct > 0 && ipcPrev > 0;

  return actual.map(r => {
    const vPrev    = prevMap.hasOwnProperty(r.key) ? prevMap[r.key] : null;
    const varAbs   = vPrev !== null ? r.valor - vPrev : null;
    const varPct   = (vPrev !== null && vPrev !== 0) ? (r.valor - vPrev) / vPrev * 100 : null;
    let varReal    = null;
    let varAbsReal = null;
    if (hayIpc && vPrev !== null && vPrev !== 0) {
      varReal    = r1(((r.valor / ipcAct) / (vPrev / ipcPrev) - 1) * 100);
      varAbsReal = r1((r.valor - vPrev * (ipcAct / ipcPrev)) / 1e6);
    }
    return { ...r, valorPrev: vPrev, varAbs, varPct, varReal, varAbsReal };
  });
}

// Available month numbers sorted
function getMesesDisponibles(df) {
  if (!df || !df.length) return [];
  const set = new Set();
  df.forEach(r => { const m = mesANum(r.mes); if (m) set.add(m); });
  return [...set].sort((a, b) => a - b);
}

// Build flat table rows for DataTable
function buildTablaSegmentacion(dfActual, dfPrev, anio, mesNum) {
  const col = getColDep(dfActual);
  if (!col) return [];

  const anioP = anio ? anio - 1 : null;
  const agg   = agregarInteranual(dfActual, dfPrev, col, mesNum, anio, anioP);
  if (!agg.length) return [];

  const baseCol = `Base ${anioP || 'Ant.'} (mill. L)`;

  const rows = agg.map(r => ({
    'Departamento':              r.label,
    'Monto (mill. L)':           r1(r.valor / 1e6),
    [baseCol]:                   r.valorPrev !== null ? r1(r.valorPrev / 1e6) : null,
    'Var. abs. (mill. L)':       r.varAbs    !== null ? r1(r.varAbs    / 1e6) : null,
    'Var. nom. (%)':             r.varPct    !== null ? r1(r.varPct)          : null,
    'Var. abs. real (mill. L)':  r.varAbsReal !== null ? r.varAbsReal         : null,
    'Var. real (%)':             r.varReal   !== null ? r.varReal             : null
  }));

  rows.sort((a, b) => (a['Monto (mill. L)'] || 0) - (b['Monto (mill. L)'] || 0));

  const totActual    = rows.reduce((s, r) => s + (r['Monto (mill. L)'] || 0), 0);
  const totPrev      = rows.reduce((s, r) => s + (r[baseCol]            || 0), 0);
  const varTotNom    = totPrev > 0 ? r1((totActual - totPrev) / totPrev * 100) : null;

  // IPC total (mismo mes de referencia)
  const mesIpc = mesNum || (getMesesDisponibles(dfActual).slice(-1)[0] || null);
  const ipcAct  = getIpcValor(mesIpc, anio);
  const ipcPrev = getIpcValor(mesIpc, anioP);
  const hayIpc  = ipcAct && ipcPrev && ipcAct > 0 && ipcPrev > 0;
  const varTotReal    = (hayIpc && totPrev > 0) ? r1(((totActual / ipcAct) / (totPrev / ipcPrev) - 1) * 100) : null;
  const varAbsRealTot = (hayIpc && totPrev > 0) ? r1(totActual - totPrev * (ipcAct / ipcPrev)) : null;

  rows.push({
    'Departamento':              'TOTAL',
    'Monto (mill. L)':           r1(totActual),
    [baseCol]:                   totPrev > 0 ? r1(totPrev) : null,
    'Var. abs. (mill. L)':       totPrev > 0 ? r1(totActual - totPrev) : null,
    'Var. nom. (%)':             varTotNom,
    'Var. abs. real (mill. L)':  varAbsRealTot,
    'Var. real (%)':             varTotReal
  });

  return rows;
}

// Render segmentation DataTable
function renderTablaSegmentacion(rows, containerId, anio) {
  destroyDT('dt-segmentacion');
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!rows || !rows.length) {
    container.innerHTML = '<p style="color:#888;padding:10px;">Sin datos</p>';
    return;
  }

  const headers = Object.keys(rows[0]);
  const varCols = ['Var. abs. (mill. L)', 'Var. nom. (%)', 'Var. real (%)'];
  const titulo  = `Datos por Departamento${anio ? ' — ' + anio : ''} — Mill. Lempiras`;

  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  let tbody   = '<tbody>';
  rows.forEach(r => {
    const isTotal = r['Departamento'] === 'TOTAL';
    tbody += `<tr class="${isTotal ? 'row-total' : ''}">`;
    headers.forEach(h => {
      const v = r[h];
      if (h === 'Departamento') {
        tbody += `<td>${v}</td>`;
      } else if (v === null || v === undefined) {
        tbody += '<td class="dt-right" style="color:#9ca3af;">N/D</td>';
      } else {
        const num = parseFloat(v);
        let cls   = 'dt-right';
        if (varCols.includes(h) && !isNaN(num) && !isTotal) {
          cls += num < 0 ? ' var-neg' : (num > 0 ? ' var-pos' : '');
        }
        tbody += `<td class="${cls}">${fmt(num)}</td>`;
      }
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  container.innerHTML = `
    <h3 style="color:#19488C;font-weight:700;margin-bottom:10px;">${titulo}</h3>
    <div class="table-scroll">
      <table id="dt-segmentacion" class="display compact">${thead}${tbody}</table>
    </div>`;

  $('#dt-segmentacion').DataTable({
    paging: false, searching: true, info: false, scrollX: true,
    dom: 'ft',
    language: { search: 'Buscar:', zeroRecords: 'Sin datos' },
    columnDefs: [
      { className: 'dt-right', targets: '_all' },
      { className: 'dt-left',  targets: 0 }
    ]
  });
}

// ── SVG mini-map (no Leaflet — instant, no network) ───────────────────────────

function makeMiniMapSVG(geojson, highlightKey, fillColor, w, h) {
  if (!geojson) return '';
  const minLon = -90.2, maxLon = -82.9, minLat = 12.9, maxLat = 16.5;
  const pad = 3;

  function proj(lon, lat) {
    return [
      pad + (lon - minLon) / (maxLon - minLon) * (w - 2 * pad),
      pad + (maxLat - lat) / (maxLat - minLat) * (h - 2 * pad)
    ];
  }

  function ringToD(ring) {
    return ring.map((pt, i) => {
      const [x, y] = proj(pt[0], pt[1]);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join('') + 'Z';
  }

  function geomToD(geom) {
    if (geom.type === 'Polygon')
      return geom.coordinates.map(ringToD).join(' ');
    if (geom.type === 'MultiPolygon')
      return geom.coordinates.flatMap(p => p.map(ringToD)).join(' ');
    return '';
  }

  const paths = geojson.features.map(feat => {
    const key  = normDepto(feat.properties.NAME_1);
    const isHL = key === highlightKey;
    const fill = isHL ? fillColor : '#e0e7ef';
    const op   = isHL ? '0.9' : '0.45';
    const d    = geomToD(feat.geometry);
    return `<path d="${d}" fill="${fill}" fill-opacity="${op}" stroke="white" stroke-width="0.5"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"
    style="display:block;width:100%;height:100%;">${paths}</svg>`;
}

// Color interpolation from light-blue to dark-blue based on rank position
function rankingColor(posGlobal, n) {
  const t  = n > 1 ? posGlobal / (n - 1) : 0.5;
  const lo = [191, 219, 254], hi = [30, 58, 138];
  const r  = Math.round(lo[0] + (hi[0] - lo[0]) * t);
  const g  = Math.round(lo[1] + (hi[1] - lo[1]) * t);
  const b  = Math.round(lo[2] + (hi[2] - lo[2]) * t);
  return `rgb(${r},${g},${b})`;
}

// Render ranking cards with SVG mini-maps
function renderRankingDep(rankingData, containerId, pos) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!rankingData || !rankingData.length) {
    container.innerHTML = '<p style="color:#888;padding:10px;">Sin datos de ranking</p>';
    return;
  }

  const n     = rankingData.length;
  const start = pos - 1;
  const end   = Math.min(start + 5, n);
  const slice = rankingData.slice(start, end);

  const etiquetaPos = start === 0 ? 'menor recaudación'
    : end === n      ? 'mayor recaudación'
    : `posición ${pos}–${end} de ${n}`;

  const paginEl = document.getElementById('ranking-pagination');
  const infoEl  = document.getElementById('ranking-info');
  if (paginEl) paginEl.style.display = n > 5 ? 'flex' : 'none';
  if (infoEl)  infoEl.textContent    = `${pos}–${end} de ${n} — ${etiquetaPos}`;

  const btnPrev = document.getElementById('btn-ranking-prev');
  const btnNext = document.getElementById('btn-ranking-next');
  if (btnPrev) btnPrev.disabled = pos <= 1;
  if (btnNext) btnNext.disabled = end >= n;

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';
  container.appendChild(wrap);

  slice.forEach((dept, i) => {
    const posGlobal = start + i;
    const col       = rankingColor(posGlobal, n);
    const svg       = makeMiniMapSVG(_hnGeojson, dept.key, col, 140, 100);
    const card      = document.createElement('div');
    card.className  = 'ranking-card';
    card.innerHTML  = `
      <div style="height:4px;background:${col};"></div>
      <div class="ranking-mini-map">${svg || '<div style="height:100%;background:#f1f5f9;"></div>'}</div>
      <div class="ranking-card-body">
        <strong style="color:${col};font-size:11.5px;display:block;line-height:1.3;margin-bottom:3px;">
          #${posGlobal + 1} ${dept.label}
        </strong>
        <span style="font-size:11px;color:#444;">${fmt(r1(dept.valor / 1e6))} M</span>
        <span class="ranking-badge" style="background:${col};">${fmt(r1(dept.pct))}%</span>
      </div>`;
    wrap.appendChild(card);
  });
}

// Excel export
function exportarSegExcel() {
  const data = AppState.segTablaData;
  if (!data || !data.length) { alert('Sin datos'); return; }
  exportarExcel(data, `segmentacion_dep_${AppState.anioActual || 'data'}.xlsx`);
}
