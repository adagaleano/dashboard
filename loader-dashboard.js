// =========================
//  Loader para el Dashboard pa01
//  Equivalente a load_data_from_gsheet() y get_available_year_sheets() de app.R
// =========================

function hasGoogleApiKey() {
  return typeof GOOGLE_API_KEY !== 'undefined' && GOOGLE_API_KEY;
}

function googleSheetsFetchOptions(accessToken) {
  return accessToken ? { headers: { 'Authorization': `Bearer ${accessToken}` } } : {};
}

function withGoogleApiKey(url) {
  if (!hasGoogleApiKey()) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}key=${encodeURIComponent(GOOGLE_API_KEY)}`;
}

function canUseSheetsApi(accessToken) {
  return !!accessToken || hasGoogleApiKey();
}

function parseGvizRows(text) {
  const jsonText = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const data = JSON.parse(jsonText);
  const cols = data.table?.cols || [];
  const rows = data.table?.rows || [];
  const headers = cols.map((col, idx) => col.label || `col_${idx + 1}`);

  return rows
    .map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        const cell = row.c?.[idx];
        obj[header] = cell?.v ?? '';
      });
      return obj;
    })
    .filter(row => Object.values(row).some(v => String(v).trim() !== ''));
}

async function fetchPublicSheet(spreadsheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Error leyendo hoja publica "${sheetName}": ${res.statusText}`);
  return parseGvizRows(await res.text());
}

async function fetchSheet(accessToken, spreadsheetId, sheetName) {
  if (!canUseSheetsApi(accessToken)) {
    return fetchPublicSheet(spreadsheetId, sheetName);
  }

  const rango = `${sheetName}!A1:Z5000`;
  const url   = withGoogleApiKey(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rango)}`);

  const res = await fetch(url, googleSheetsFetchOptions(accessToken));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Error leyendo "${sheetName}": ${err.error?.message || res.statusText}`);
  }

  const result  = await res.json();
  const valores = result.values || [];
  if (!valores.length) return [];

  const headers = valores[0];
  const filas   = valores.slice(1);
  const nCols   = headers.length;

  return filas
    .map(row => {
      const padded = row.length < nCols ? [...row, ...Array(nCols - row.length).fill('')] : row.slice(0, nCols);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = padded[i] ?? ''; });
      return obj;
    })
    .filter(row => Object.values(row).some(v => String(v).trim() !== ''));
}

// Equivalente a get_available_year_sheets(): detecta hojas pa01_XXXX disponibles
async function getAvailableYears(accessToken, spreadsheetId) {
  if (!canUseSheetsApi(accessToken)) {
    const years = Array.isArray(window.DASHBOARD_PUBLIC_YEARS) ? window.DASHBOARD_PUBLIC_YEARS : [];
    return years
      .filter(y => /^20\d{2}$/.test(String(y)))
      .sort((a, b) => a - b)
      .map(y => ({ sheet: `pa01_${y}`, year: Number(y) }));
  }

  const url = withGoogleApiKey(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`);
  const res = await fetch(url, googleSheetsFetchOptions(accessToken));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`No se pudo obtener metadata del spreadsheet: ${err.error?.message || res.statusText}`);
  }

  const data   = await res.json();
  const sheets = data.sheets || [];

  return sheets
    .map(s => s.properties.title)
    .filter(t => /^pa01_20\d{2}$/.test(t))
    .sort()
    .map(t => ({ sheet: t, year: parseInt(t.replace('pa01_', '')) }));
}

// Equivalente a load_data_from_gsheet(): carga y normaliza la hoja pa01_XXXX
async function loadPa01Data(accessToken, spreadsheetId, sheetName) {
  const filas = await fetchSheet(accessToken, spreadsheetId, sheetName);

  return filas.map(row => {
    // Normalizar monto: manejar "1,234.56" y "1.234,56"
    const montoStr = String(row.monto ?? '');
    let monto;
    if (montoStr.includes(',') && montoStr.includes('.')) {
      monto = parseFloat(montoStr.replace(/,/g, ''));
    } else {
      monto = parseFloat(montoStr.replace(',', '.'));
    }

    return {
      mes:          String(row.mes          ?? '').trim(),
      codigo_imp:   String(row.codigo_imp   ?? '').trim(),
      concepto_imp: String(row.concepto_imp ?? '').trim(),
      concepto_cat: String(row.concepto_cat ?? '').trim(),
      categoria:    String(row.categoria    ?? '').trim(),
      monto:        isNaN(monto) ? 0 : monto
    };
  }).filter(r => r.mes && r.concepto_cat && r.categoria);
}

// Cache en memoria (equivalente al cache en disco de R)
const _cache = {};

async function loadWithCache(key, loaderFn) {
  const CACHE_HORAS = 4;
  const now = Date.now();

  if (_cache[key] && (now - _cache[key].ts) < CACHE_HORAS * 3600 * 1000) {
    console.log(`✅ Cache: ${key}`);
    return _cache[key].data;
  }

  console.log(`🌐 Descargando: ${key}`);
  const data       = await loaderFn();
  _cache[key]      = { data, ts: now };
  return data;
}

function clearCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

// Loads a Departamento_YYYY sheet: normalizes all column names to lowercase,
// parses mes as integer (1-12) and monto as float.
async function loadDepData(accessToken, spreadsheetId, sheetName) {
  const filas = await fetchSheet(accessToken, spreadsheetId, sheetName);
  if (!filas.length) return [];

  return filas.map(row => {
    const r = {};
    Object.entries(row).forEach(([k, v]) => { r[k.toLowerCase().trim()] = v; });

    const mesRaw = String(r.mes || '').trim();
    const mesInt = parseInt(mesRaw);
    if (!isNaN(mesInt) && mesInt >= 1 && mesInt <= 12) {
      r.mes = mesInt;
    } else {
      // Aceptar también nombre de mes en español ("Enero", "enero", etc.)
      const norm = mesRaw.toLowerCase()
        .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e')
        .replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u');
      const mesNombres = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,
                           julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12 };
      r.mes = mesNombres[norm] || null;
    }

    const ms = String(r.monto || '').trim();
    let monto;
    if (ms.includes(',') && ms.includes('.')) {
      monto = parseFloat(ms.replace(/,/g, ''));
    } else {
      monto = parseFloat(ms.replace(',', '.'));
    }
    r.monto = isNaN(monto) ? 0 : monto;

    if ('rtn_unicos' in r) {
      const rtnInt = parseInt(String(r.rtn_unicos).trim());
      r.rtn_unicos = isNaN(rtnInt) ? null : rtnInt;
    }

    return r;
  }).filter(r => r.mes !== null && (r.departamento || r.depto));
}
