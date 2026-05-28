// =========================
//  Loader para el Dashboard pa01
//  Equivalente a load_data_from_gsheet() y get_available_year_sheets() de app.R
// =========================

async function fetchSheet(accessToken, spreadsheetId, sheetName) {
  const rango = `${sheetName}!A1:Z5000`;
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rango)}`;

  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
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
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('No se pudo obtener metadata del spreadsheet');

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
    r.mes = (!isNaN(mesInt) && mesInt >= 1 && mesInt <= 12) ? mesInt : null;

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
