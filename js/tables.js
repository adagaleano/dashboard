// =========================
//  Tablas DataTables — equivalente a data_processing.R
// =========================

// Destruye un DataTable existente antes de recrearlo
function destroyDT(tableId) {
  if ($.fn.DataTable.isDataTable(`#${tableId}`)) {
    $(`#${tableId}`).DataTable().destroy();
    $(`#${tableId}`).empty();
  }
}

// ── Tabla Mensual (render_impuestos_tabla) ────────────────────────────────────
function renderTablaImpuestos(data, containerId, anio) {
  const { meses, rows } = buildTablaImpuestos(data);
  destroyDT('dt-impuestos');

  // Construir HTML de la tabla
  const tituloStr = anio ? `📊 Recaudación ${anio} — Millones de Lempiras` : '📊 Recaudación — Millones de Lempiras';

  let thead = `<thead>
    <tr>
      <th rowspan="2">Concepto</th>
      ${meses.map(m => `<th colspan="3">${m}</th>`).join('')}
    </tr>
    <tr>
      ${meses.map(() => '<th>Meta</th><th>Observado</th><th>Brecha</th>').join('')}
    </tr>
  </thead>`;

  let tbody = '<tbody>';
  rows.forEach(row => {
    const isTotal = row.concepto === 'Total';
    tbody += `<tr class="${isTotal ? 'row-total' : ''}">`;
    tbody += `<td>${row.concepto}</td>`;
    meses.forEach(mes => {
      tbody += `<td>${fmt(row[`${mes}_Meta`])}</td>`;
      tbody += `<td>${fmt(row[`${mes}_Observado`])}</td>`;
      const brecha = row[`${mes}_Brecha`];
      const cls    = brecha < 0 ? 'brecha-neg' : (brecha > 0 ? 'brecha-pos' : '');
      tbody += `<td class="${cls}">${fmt(brecha)}</td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h3 style="text-align:center;font-weight:700;color:#19488C;margin-bottom:10px">${tituloStr}</h3>
    <div class="table-scroll">
      <table id="dt-impuestos" class="display compact">${thead}${tbody}</table>
    </div>`;

  $('#dt-impuestos').DataTable({
    paging: false, searching: true, info: false,
    scrollX: true,
    dom: 'ft',
    language: { search: 'Buscar:', zeroRecords: 'Sin datos' },
    columnDefs: [{ className: 'dt-right', targets: '_all' }, { className: 'dt-left', targets: 0 }]
  });
}

// ── Tabla Acumulado (render_acumulado_observado) ──────────────────────────────
function renderTablaAcumulado(data, containerId) {
  const filas = buildTablaAcumulado(data);
  destroyDT('dt-acumulado');

  const thead = `<thead><tr>
    <th>Concepto</th><th>Observado Acum.</th><th>Meta Acum.</th>
    <th>Brecha Acum.</th><th>Brecha (%)</th><th>Composición (%)</th>
  </tr></thead>`;

  let tbody = '<tbody>';
  filas.forEach(r => {
    const isTotal = r.concepto === 'Total';
    const bCls    = r.brecha < 0 ? 'brecha-neg' : (r.brecha > 0 ? 'brecha-pos' : '');
    const pCls    = r.brechaPct < 0 ? 'var-neg' : 'var-pos';
    tbody += `<tr class="${isTotal ? 'row-total' : ''}">
      <td>${r.concepto}</td>
      <td class="dt-right">${fmt(r.observado)}</td>
      <td class="dt-right">${fmt(r.meta)}</td>
      <td class="dt-right ${bCls}">${fmt(r.brecha)}</td>
      <td class="dt-right ${pCls}">${fmtPct(r.brechaPct)}</td>
      <td class="dt-right">${fmtPct(r.composicion)}</td>
    </tr>`;
  });
  tbody += '</tbody>';

  document.getElementById(containerId).innerHTML =
    `<div class="table-scroll"><table id="dt-acumulado" class="display compact">${thead}${tbody}</table></div>`;

  $('#dt-acumulado').DataTable({
    paging: false, searching: false, info: false,
    dom: 't',
    language: { zeroRecords: 'Sin datos' },
    columnDefs: [{ className: 'dt-right', targets: '_all' }, { className: 'dt-left', targets: 0 }]
  });
}

// ── Tabla Variaciones (render_variaciones_tabla) ──────────────────────────────
function renderTablaVariaciones(dataActual, dataPrev, anioActual, modo, mesCorte, mesMensual, containerId) {
  const filas     = buildTablaVariaciones(dataActual, dataPrev, anioActual, modo, mesCorte, mesMensual);
  const prevLabel = anioActual ? anioActual - 1 : 'Ant.';
  const colActual = `Obs. ${anioActual || 'Actual'}`;
  const colPrev   = `Obs. ${prevLabel}`;

  const ultimo  = getUltimoMes(dataActual);
  const mesLabel = modo === 'acumulado' ? ` (Ene–${mesCorte || ultimo || ''})` : (modo === 'mensual' ? ` – ${mesMensual || ultimo || ''}` : '');
  const modoTxt  = { anual: 'Anual', acumulado: 'Acumulado', mensual: 'Mensual' }[modo] || 'Anual';
  const titulo   = `📈 Variaciones ${modoTxt}${mesLabel} ${prevLabel} vs ${anioActual || ''} — Mill. Lempiras`;

  destroyDT('dt-variaciones');

  const thead = `<thead><tr>
    <th>Concepto</th><th>${colActual}</th><th>${colPrev}</th><th>Var. (%)</th><th>Var. Real (%)</th>
  </tr></thead>`;

  let tbody = '<tbody>';
  filas.forEach(r => {
    const isTotal = r.concepto === 'Total';
    const pCls    = r.varPct !== null && r.varPct < 0 ? 'var-neg' : (r.varPct > 0 ? 'var-pos' : '');
    const realCls = r.varReal !== null && r.varReal < 0 ? 'var-neg' : (r.varReal > 0 ? 'var-pos' : '');
    tbody += `<tr class="${isTotal ? 'row-total' : ''}">
      <td>${r.concepto}</td>
      <td class="dt-right">${fmt(r.obsActual)}</td>
      <td class="dt-right">${fmt(r.obsPrev)}</td>
      <td class="dt-right ${pCls}">${r.varPct !== null ? fmtPct(r.varPct) : 'N/D'}</td>
      <td class="dt-right ${realCls}">${r.varReal !== null ? fmtPct(r.varReal) : 'N/D'}</td>
    </tr>`;
  });
  tbody += '</tbody>';

  const container = document.getElementById(containerId);
  container.innerHTML = `
    <p style="font-weight:700;color:#19488C;font-size:13px;margin-bottom:8px">${titulo}</p>
    <div class="table-scroll"><table id="dt-variaciones" class="display compact">${thead}${tbody}</table></div>`;

  $('#dt-variaciones').DataTable({
    paging: false, searching: false, info: false,
    dom: 't',
    language: { zeroRecords: 'Sin datos' },
    columnDefs: [{ className: 'dt-right', targets: '_all' }, { className: 'dt-left', targets: 0 }]
  });
}

// ── Tabla Página 2 / PA01 (render_impuestos_tabla_) ──────────────────────────
function renderTablaPagina2(data, containerId, anio) {
  const DIRECTOS   = ['1.1','11100','11101','11102','11103','11104','11105','11106',
                       '11107','11108','11109','11110','11111','11112','11113','11114','11115','11116',
                       '11200','11201','11202','11203','11204'];
  const INDIRECTOS = ['1.2','11300','11301','11302','11303','11304','11305','11306','11307','11308',
                       '11309','11310','11314','11315','11400','11401','11402','11403','11404','11405',
                       '11406','11407','11408','11409','11410','11411','11412','11413','11414','11415',
                       '11416','11417','11418','11500','11501','11502','11503','11504','11600','11601','11602','11603'];
  const TODOS = [...DIRECTOS, ...INDIRECTOS];

  const df = data.filter(r => TODOS.includes(r.codigo_imp));
  if (!df.length) {
    document.getElementById(containerId).innerHTML = '<p>Sin datos para mostrar.</p>';
    return;
  }

  // Meses con datos
  const meses = MESES_ORDENADOS.filter(m => df.some(r => r.mes === m));

  // Agrupación: {codigo_imp|concepto_imp} → {mes → {Meta, Observado, Brecha}}
  const map = {};
  df.forEach(r => {
    const key = `${r.codigo_imp}|||${r.concepto_imp}`;
    if (!map[key]) map[key] = { codigo_imp: r.codigo_imp, concepto_imp: r.concepto_imp };
    meses.forEach(m => {
      if (!map[key][m]) map[key][m] = { Meta: 0, Observado: 0, Brecha: 0 };
    });
    if (r.mes in (map[key])) {
      if (r.categoria === 'Meta')      map[key][r.mes].Meta      += r.monto;
      if (r.categoria === 'Observado') map[key][r.mes].Observado += r.monto;
      if (r.categoria === 'Brecha')    map[key][r.mes].Brecha    += r.monto;
    }
  });

  // Calcular brecha cuando no está en datos
  Object.values(map).forEach(row => {
    meses.forEach(m => {
      if (!row[m]) row[m] = { Meta: 0, Observado: 0, Brecha: 0 };
      if (row[m].Brecha === 0 && (row[m].Observado !== 0 || row[m].Meta !== 0)) {
        row[m].Brecha = row[m].Observado - row[m].Meta;
      }
    });
  });

  // Ordenar: Directos primero, luego Indirectos
  const orden = (cod) => DIRECTOS.includes(cod) ? 0 : 1;
  const filas = Object.values(map).sort((a, b) => {
    const dif = orden(a.codigo_imp) - orden(b.codigo_imp);
    return dif !== 0 ? dif : a.codigo_imp.localeCompare(b.codigo_imp);
  });

  destroyDT('dt-pagina2');

  const tituloStr = anio ? `Distribución Mensual ${anio} — Millones de Lempiras` : 'Distribución Mensual — Millones de Lempiras';

  const thead = `<thead>
    <tr>
      <th rowspan="2">Código</th>
      <th rowspan="2">Concepto</th>
      ${meses.map(m => `<th colspan="3">${m}</th>`).join('')}
    </tr>
    <tr>${meses.map(() => '<th>Meta</th><th>Obs.</th><th>Brecha</th>').join('')}</tr>
  </thead>`;

  let tbody = '<tbody>';
  filas.forEach(row => {
    tbody += '<tr>';
    tbody += `<td>${row.codigo_imp}</td><td>${row.concepto_imp}</td>`;
    meses.forEach(m => {
      const cel  = row[m] || { Meta: 0, Observado: 0, Brecha: 0 };
      const bCls = cel.Brecha < 0 ? 'brecha-neg' : (cel.Brecha > 0 ? 'brecha-pos' : '');
      tbody += `<td class="dt-right">${fmt(cel.Meta)}</td>`;
      tbody += `<td class="dt-right">${fmt(cel.Observado)}</td>`;
      tbody += `<td class="dt-right ${bCls}">${fmt(cel.Brecha)}</td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  document.getElementById(containerId).innerHTML = `
    <h3 style="color:#19488C;font-weight:700;margin-bottom:10px">${tituloStr}</h3>
    <div class="table-scroll">
      <table id="dt-pagina2" class="display compact">${thead}${tbody}</table>
    </div>`;

  $('#dt-pagina2').DataTable({
    paging: true, pageLength: 25, searching: true, info: true,
    scrollX: true,
    dom: 'ftip',
    language: { search: 'Buscar:', zeroRecords: 'Sin datos', info: 'Mostrando _START_ a _END_ de _TOTAL_' },
    columnDefs: [{ className: 'dt-right', targets: '_all' }, { className: 'dt-left', targets: [0, 1] }]
  });
}

// ── Excel export con SheetJS ──────────────────────────────────────────────────
function exportarExcel(data, filename) {
  if (typeof XLSX === 'undefined') { alert('SheetJS no está disponible.'); return; }
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, filename);
}

function exportarTablaImpuestosExcel(data, anio) {
  const { meses, rows } = buildTablaImpuestos(data);
  const flat = rows.map(r => {
    const obj = { Concepto: r.concepto };
    meses.forEach(m => {
      obj[`${m}_Meta`]      = r[`${m}_Meta`];
      obj[`${m}_Observado`] = r[`${m}_Observado`];
      obj[`${m}_Brecha`]    = r[`${m}_Brecha`];
    });
    return obj;
  });
  exportarExcel(flat, `recaudacion_${anio || 'data'}_tabla.xlsx`);
}

function exportarTablaAcumuladoExcel(data, anio) {
  const filas = buildTablaAcumulado(data).map(r => ({
    Concepto: r.concepto,
    'Observado Acumulado': r.observado,
    'Meta Acumulada':      r.meta,
    'Brecha Acumulada':    r.brecha,
    'Brecha (%)':          r.brechaPct,
    'Composición (%)':     r.composicion
  }));
  exportarExcel(filas, `recaudacion_${anio || 'data'}_acumulado.xlsx`);
}

function exportarVariacionesExcel(dataActual, dataPrev, anioActual, modo, mesCorte, mesMensual) {
  const filas = buildTablaVariaciones(dataActual, dataPrev, anioActual, modo, mesCorte, mesMensual)
    .map(r => ({
      Concepto:               r.concepto,
      [`Obs. ${anioActual}`]: r.obsActual,
      [`Obs. ${anioActual - 1}`]: r.obsPrev,
      'Var. (%)':             r.varPct,
      'Var. Real (%)':        r.varReal
    }));
  exportarExcel(filas, `variaciones_${modo}_${anioActual || 'data'}.xlsx`);
}

function exportarPagina2Excel(data, mes, anio) {
  const filtrado = mes ? data.filter(r => r.mes === mes) : data;
  const plano = filtrado.map(r => ({
    Mes:          r.mes,
    Código:       r.codigo_imp,
    Concepto:     r.concepto_imp,
    Categoría:    r.concepto_cat,
    Tipo:         r.categoria,
    Monto:        r.monto
  }));
  const sufijo = mes ? mes : 'completo';
  exportarExcel(plano, `datos_${sufijo}_${anio || 'data'}.xlsx`);
}
