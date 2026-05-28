// =========================
//  Procesamiento de datos — equivalente a data_processing.R y graphs_module.R
// =========================

const MESES_ORDENADOS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                         'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun',
                      'Jul','Ago','Sep','Oct','Nov','Dic'];

function mesIndex(mes) {
  return MESES_ORDENADOS.indexOf(mes);
}

// Último mes con Observado != 0 para concepto_cat = "Total"
function getUltimoMes(data) {
  const mesesConDatos = data
    .filter(r => r.concepto_cat === 'Total' && r.categoria === 'Observado' && r.monto !== 0 && !isNaN(r.monto))
    .map(r => r.mes)
    .filter(m => mesIndex(m) >= 0);

  if (!mesesConDatos.length) return null;
  return mesesConDatos.reduce((max, m) => mesIndex(m) > mesIndex(max) ? m : max);
}

// Suma de montos filtrada
function sumar(data, filtros) {
  return data
    .filter(r => Object.entries(filtros).every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v))
    .reduce((s, r) => s + (r.monto || 0), 0);
}

// ── Cálculos para KPI Cards ──────────────────────────────────────────────────

function calcCumplimiento(data) {
  const meta      = sumar(data, { concepto_cat: 'Total', categoria: 'Meta' });
  const observado = sumar(data, { concepto_cat: 'Total', categoria: 'Observado' });
  return { meta, observado, pct: meta > 0 ? (observado / meta) * 100 : 0 };
}

function calcCumplimientoMes(data) {
  const ultimo = getUltimoMes(data);
  if (!ultimo) return { mes: null, meta: 0, observado: 0, pct: 0 };
  const meta      = sumar(data, { concepto_cat: 'Total', categoria: 'Meta',      mes: ultimo });
  const observado = sumar(data, { concepto_cat: 'Total', categoria: 'Observado', mes: ultimo });
  return { mes: ultimo, meta, observado, pct: meta > 0 ? (observado / meta) * 100 : 0 };
}

// ── Tabla Mensual (ISR, ISV, Resto, Total × meses × Meta/Observado/Brecha) ──

function buildTablaImpuestos(data) {
  const conceptos  = ['ISR', 'ISV', 'Resto', 'Total'];
  const categorias = ['Meta', 'Observado', 'Brecha'];

  // Meses presentes en los datos
  const mesesPresentes = MESES_ORDENADOS.filter(m =>
    data.some(r => r.mes === m && conceptos.includes(r.concepto_cat))
  );

  // Agrupa por concepto_cat, mes, categoria → suma
  const map = {};
  data.filter(r => conceptos.includes(r.concepto_cat)).forEach(r => {
    const key = `${r.concepto_cat}|${r.mes}|${r.categoria}`;
    map[key]  = (map[key] || 0) + r.monto;
  });

  // Construir filas
  const rows = conceptos.map(concepto => {
    const cols = {};
    mesesPresentes.forEach(mes => {
      categorias.forEach(cat => {
        const meta      = map[`${concepto}|${mes}|Meta`]      || 0;
        const observado = map[`${concepto}|${mes}|Observado`] || 0;
        cols[`${mes}_Meta`]      = meta;
        cols[`${mes}_Observado`] = observado;
        cols[`${mes}_Brecha`]    = map[`${concepto}|${mes}|Brecha`] !== undefined
          ? map[`${concepto}|${mes}|Brecha`]
          : observado - meta;
      });
    });
    return { concepto, ...cols };
  });

  return { meses: mesesPresentes, rows };
}

// ── Tabla Acumulado (Observado, Meta, Brecha, Brecha%, Composición%) ─────────

function buildTablaAcumulado(data) {
  const conceptos = ['ISR', 'ISV', 'Resto', 'Total'];
  const ultimo    = getUltimoMes(data);
  if (!ultimo) return conceptos.map(c => ({ concepto: c, observado: 0, meta: 0, brecha: 0, brechaPct: 0, composicion: c === 'Total' ? 100 : 0 }));

  const idxCorte   = mesIndex(ultimo);
  const mesesHasta = MESES_ORDENADOS.slice(0, idxCorte + 1);

  const df = conceptos.map(concepto => {
    const obs  = sumar(data, { concepto_cat: concepto, categoria: 'Observado', mes: mesesHasta });
    const meta = sumar(data, { concepto_cat: concepto, categoria: 'Meta',      mes: mesesHasta });
    return { concepto, observado: obs, meta };
  });

  const totalObs = df.find(r => r.concepto === 'Total')?.observado || 0;

  return df.map(r => {
    const brecha    = r.observado - r.meta;
    const brechaPct = r.meta !== 0 ? (brecha / r.meta) * 100 : 0;
    const composicion = r.concepto === 'Total' ? 100
      : totalObs !== 0 ? (r.observado / totalObs) * 100 : 0;
    return { ...r, brecha, brechaPct, composicion };
  });
}

// ── Tabla Variaciones (anual / acumulado / mensual) ───────────────────────────

function buildTablaVariaciones(dataActual, dataPrev, anioActual, modo, mesCorte, mesMensual) {
  const conceptos = ['ISR', 'ISV', 'Resto', 'Total'];
  const ultimo    = getUltimoMes(dataActual);
  const anioPrev  = anioActual ? anioActual - 1 : null;

  function acumular(data, corte) {
    if (!data || !corte) return {};
    const idx = mesIndex(corte);
    if (idx < 0) return {};
    const mesesHasta = MESES_ORDENADOS.slice(0, idx + 1);
    const result = {};
    conceptos.forEach(c => {
      result[c] = sumar(data, { concepto_cat: c, categoria: 'Observado', mes: mesesHasta });
    });
    return result;
  }

  function porMes(data, mes) {
    if (!data || !mes) return {};
    const result = {};
    conceptos.forEach(c => {
      result[c] = sumar(data, { concepto_cat: c, categoria: 'Observado', mes });
    });
    return result;
  }

  let valsActual, valsPrev;
  let mesRef = ultimo;

  if (modo === 'mensual') {
    const mes = mesMensual || ultimo;
    mesRef = mes;
    valsActual = porMes(dataActual, mes);
    valsPrev   = porMes(dataPrev,   mes);
  } else {
    const corte = (modo === 'acumulado' && mesCorte) ? mesCorte : ultimo;
    mesRef = corte;
    valsActual  = acumular(dataActual, corte);
    valsPrev    = acumular(dataPrev,   corte);
  }

  const mesNum = mesIndex(mesRef) + 1;
  const ipcAct = (typeof getIpcValor === 'function') ? getIpcValor(mesNum, anioActual) : null;
  const ipcPrev = (typeof getIpcValor === 'function') ? getIpcValor(mesNum, anioPrev) : null;
  const hayIpc = ipcAct && ipcPrev && ipcAct > 0 && ipcPrev > 0;

  return conceptos.map(c => {
    const obsActual = valsActual[c] || 0;
    const obsPrev   = valsPrev  [c] || 0;
    const varPct    = obsPrev !== 0 ? ((obsActual - obsPrev) / obsPrev) * 100 : null;
    const varReal   = (hayIpc && obsPrev !== 0) ? ((obsActual / ipcAct) / (obsPrev / ipcPrev) - 1) * 100 : null;
    return { concepto: c, obsActual, obsPrev, varPct, varReal };
  });
}

// Número formateado con separador de miles
function fmt(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return 'N/D';
  return val.toLocaleString('es-HN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return 'N/D';
  return val.toLocaleString('es-HN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
}
