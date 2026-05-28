// =========================
//  Gráficos Plotly — equivalente a graphs_module.R
// =========================

function renderHistograma(data, containerId) {
  const mesesConDatos = MESES_ORDENADOS.filter(m =>
    data.some(r => r.mes === m && r.concepto_cat === 'Total')
  );
  const mesesCortos = mesesConDatos.map(m => MESES_CORTOS[MESES_ORDENADOS.indexOf(m)]);

  const metaDatos      = mesesConDatos.map(m => sumar(data, { concepto_cat: 'Total', categoria: 'Meta',      mes: m }));
  const observadoDatos = mesesConDatos.map(m => sumar(data, { concepto_cat: 'Total', categoria: 'Observado', mes: m }));

  const trazaMeta = {
    x: mesesCortos, y: metaDatos, name: 'Meta',
    type: 'bar', marker: { color: '#9eb3cc' },
    hovertemplate: '%{x}<br>Meta: %{y:,.1f}<extra></extra>'
  };
  const trazaObs = {
    x: mesesCortos, y: observadoDatos, name: 'Observado',
    type: 'bar', marker: { color: '#19488C' },
    hovertemplate: '%{x}<br>Observado: %{y:,.1f}<extra></extra>'
  };

  const layout = {
    title: { text: 'Meta vs Observado', font: { size: 14 }, x: 0.5, xanchor: 'center' },
    barmode: 'group', bargap: 0.15,
    margin: { l: 45, r: 10, t: 50, b: 40 },
    xaxis: { title: '', tickangle: -40, tickfont: { size: 10 } },
    yaxis: { title: '', tickfont: { size: 10 } },
    legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: 1.12, font: { size: 11 } },
    plot_bgcolor: '#fff', paper_bgcolor: '#fff'
  };

  Plotly.newPlot(containerId, [trazaMeta, trazaObs], layout, { responsive: true, displayModeBar: false });
}

function renderGraficoPastel(data, containerId) {
  const conceptos = ['ISV', 'ISR', 'Resto'];
  const colores   = { ISV: '#FFB236', ISR: '#FF6F6F', Resto: '#4CE100' };

  const valores = conceptos.map(c => sumar(data, { concepto_cat: c, categoria: 'Observado' }));

  const traza = {
    labels: conceptos,
    values: valores,
    type: 'pie',
    textinfo: 'label+percent',
    insidetextfont: { color: '#fff', size: 13 },
    marker: { colors: conceptos.map(c => colores[c]), line: { color: '#000', width: 1.5 } }
  };

  const layout = {
    title: { text: 'Distribución ISV, ISR y Resto', font: { size: 14 }, x: 0.5, xanchor: 'center' },
    margin: { l: 10, r: 10, t: 50, b: 20 },
    showlegend: true,
    legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.1, font: { size: 11 } },
    plot_bgcolor: '#fff', paper_bgcolor: '#fff'
  };

  Plotly.newPlot(containerId, [traza], layout, { responsive: true, displayModeBar: false });
}

function renderVelocimetro(data, containerId) {
  const { meta, observado, pct } = calcCumplimiento(data);
  const maxPct     = 105;
  const valPct     = Math.min(Math.max(pct, 0), maxPct);
  const brecha     = observado - meta;
  const deltaColor = brecha < 0 ? 'red' : 'green';
  const deltaSym   = brecha < 0 ? '▼' : '▲';

  const detalleTxt = `<b>Detalle:</b><br>Recaudado: Mill ${fmt(observado)}<br>Meta: Mill ${fmt(meta)}<br>Cumplimiento: ${fmtPct(pct)}`;
  const deltaTxt   = `<span style="font-size:17px;color:${deltaColor}">${deltaSym} ${fmt(Math.abs(brecha))}</span>`;

  const traza = {
    type: 'indicator', mode: 'gauge+number',
    value: valPct,
    title: { text: 'Recaudación frente a Meta', font: { size: 15 } },
    number: { suffix: '%', valueformat: ',.1f' },
    gauge: {
      axis: { range: [null, maxPct], ticksuffix: '%' },
      steps: [{ range: [0, maxPct], color: '#19488C' }],
      bar: { color: '#fff', thickness: 0.35 },
      threshold: { line: { color: '#000', width: 4 }, thickness: 0.75, value: 100 }
    }
  };

  const layout = {
    margin: { l: 40, r: 180, t: 60, b: 30 },
    annotations: [
      { x: 1.08, y: 0.70, xref: 'paper', yref: 'paper', text: detalleTxt, showarrow: false, align: 'left', font: { size: 12, color: '#111' } },
      { x: 0.50, y: 0.34, xref: 'paper', yref: 'paper', text: deltaTxt,   showarrow: false, align: 'center' }
    ],
    plot_bgcolor: '#fff', paper_bgcolor: '#fff'
  };

  Plotly.newPlot(containerId, [traza], layout, { responsive: true, displayModeBar: false });
}
