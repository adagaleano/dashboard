// =========================
//  Mapa Leaflet — Segmentación por Departamento
// =========================

let _mapaInstance = null;
let _mapaLayer    = null;
let _mapaLegend   = null;
let _hnGeojson    = null;

async function cargarGeojson(path) {
  if (_hnGeojson) return _hnGeojson;
  // Usar la variable embebida si está disponible (funciona con file:// sin servidor)
  if (typeof HN_GEOJSON !== 'undefined' && HN_GEOJSON) {
    _hnGeojson = HN_GEOJSON;
    return _hnGeojson;
  }
  // Fallback: fetch desde el servidor HTTP
  const resp = await fetch(path);
  if (!resp.ok) throw new Error('No se pudo cargar el GeoJSON');
  _hnGeojson = await resp.json();
  return _hnGeojson;
}

function crearMapaBase(containerId) {
  if (_mapaInstance) { _mapaInstance.remove(); _mapaInstance = null; }
  _mapaInstance = L.map(containerId, { minZoom: 5 }).setView([14.8, -86.5], 7);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> &copy; CartoDB',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(_mapaInstance);
  return _mapaInstance;
}

// ── Color utilities ───────────────────────────────────────────────────────────

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b]
    .map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2,'0'))
    .join('');
}

function lerpColor(c1, c2, t) {
  const [r1,g1,b1] = hexToRgb(c1), [r2,g2,b2] = hexToRgb(c2);
  return rgbToHex(r1+(r2-r1)*t, g1+(g2-g1)*t, b1+(b2-b1)*t);
}

function scaleColor(val, min, max, palette) {
  if (val == null || isNaN(val)) return '#D9D9D9';
  if (max === min) return palette[Math.floor(palette.length / 2)];
  const t   = Math.min(Math.max((val - min) / (max - min), 0), 1);
  const pos = t * (palette.length - 1);
  const lo  = Math.floor(pos);
  const hi  = Math.min(Math.ceil(pos), palette.length - 1);
  return lo === hi ? palette[lo] : lerpColor(palette[lo], palette[hi], pos - lo);
}

function divergeColor(val, lim) {
  if (val == null || isNaN(val)) return '#D9D9D9';
  const t = Math.min(Math.max((val + lim) / (2 * lim), 0), 1);
  if (t < 0.5) return lerpColor('#93c5fd', '#f8fafc', t * 2);
  return lerpColor('#f8fafc', '#1e3a8a', (t - 0.5) * 2);
}

function getColorForFeature(r, mode, domain) {
  if (!r) return '#D9D9D9';
  if (mode === 'recaudacion') {
    return scaleColor(r.valor / 1e6, domain[0], domain[1],
      ['#dbeafe','#93c5fd','#3b82f6','#2563eb','#1e3a8a']);
  }
  const val = mode === 'variacion' ? r.varPct : r.varReal;
  if (val == null) return '#c0c0c0';
  const lim = Math.max(Math.abs(domain[0]), Math.abs(domain[1]), 1);
  return divergeColor(val, lim);
}

// ── Popup HTML ────────────────────────────────────────────────────────────────

function colorSigno(x) {
  if (x == null || isNaN(x)) return '#6b7280';
  return x > 0 ? '#16a34a' : x < 0 ? '#dc2626' : '#6b7280';
}

function signoPlu(x) { return x != null && x > 0 ? '+' : ''; }

function buildPopupHTML(name, r, mesLbl, anio, anioP) {
  if (!r) {
    return `<div style="font-family:sans-serif;min-width:210px;">
      <div style="background:#1a252f;color:white;padding:7px 10px;border-radius:6px 6px 0 0;font-weight:bold;font-size:13px;">${name}</div>
      <div style="background:#f8f9fa;padding:10px;border-radius:0 0 6px 6px;color:#6b7280;font-size:12px;">Sin datos</div>
    </div>`;
  }

  const val    = r1(r.valor    / 1e6);
  const prev   = r.valorPrev !== null ? r1(r.valorPrev / 1e6) : null;
  const varAbs = r.varAbs    !== null ? r1(r.varAbs    / 1e6) : null;
  const vp     = r.varPct    !== null ? r1(r.varPct)          : null;

  const vr      = r.varReal    !== null ? r1(r.varReal)    : null;
  const varAR   = r.varAbsReal !== null ? r1(r.varAbsReal) : null;

  const bloqueNom = varAbs !== null ? `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:2px;">
      <span style="font-size:11px;color:#6b7280;">Var. nominal</span>
      <span style="font-size:13px;font-weight:bold;color:${colorSigno(vp)};">
        ${signoPlu(varAbs)}${fmt(varAbs)} M &nbsp;(${signoPlu(vp)}${fmt(vp)}%)
      </span>
    </div>` : '';

  const bloqueReal = vr !== null ? `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:2px;">
      <span style="font-size:11px;color:#6b7280;">Var. real (IPC)</span>
      <span style="font-size:13px;font-weight:bold;color:${colorSigno(vr)};">
        ${signoPlu(varAR)}${fmt(varAR)} M &nbsp;(${signoPlu(vr)}${fmt(vr)}%)
      </span>
    </div>` :
    varAbs !== null ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">Var. real: IPC no disponible</div>` : '';

  const bloqueVar = varAbs !== null ? `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Variación interanual vs ${anioP}</div>
      ${bloqueNom}${bloqueReal}
    </div>` : `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
      <div style="font-size:11px;color:#6b7280;">Sin base comparable en ${anioP}</div>
    </div>`;

  return `<div style="font-family:sans-serif;min-width:250px;">
    <div style="background:#1a252f;color:white;padding:7px 10px;border-radius:6px 6px 0 0;font-weight:bold;font-size:13px;">${name}</div>
    <div style="background:#f8f9fa;padding:10px;border-radius:0 0 6px 6px;">
      <div style="font-size:11px;color:#6b7280;">Monto ${mesLbl} ${anio || ''}</div>
      <div style="font-size:21px;font-weight:bold;color:#2c3e50;line-height:1.15;">${fmt(val)} mill. L</div>
      ${prev !== null ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">${mesLbl} ${anioP}: ${fmt(prev)} mill. L</div>` : ''}
      ${bloqueVar}
    </div>
  </div>`;
}

// ── Main map render ───────────────────────────────────────────────────────────

async function renderMapaSegmentacion(agg, mode, mesLbl, anio, anioP) {
  if (!_mapaInstance) return;

  if (!_hnGeojson) {
    try { await cargarGeojson('hn_departamentos.geojson'); }
    catch (e) { console.error('GeoJSON no disponible:', e); return; }
  }

  if (_mapaLayer)  { _mapaInstance.removeLayer(_mapaLayer);  _mapaLayer  = null; }
  if (_mapaLegend) { _mapaLegend.remove();                    _mapaLegend = null; }

  const lookup = {};
  agg.forEach(r => { lookup[r.key] = r; });

  let vals;
  if (mode === 'recaudacion') {
    vals = agg.map(r => r.valor / 1e6).filter(v => !isNaN(v));
  } else if (mode === 'variacion') {
    vals = agg.map(r => r.varPct).filter(v => v !== null && !isNaN(v));
  } else {
    vals = agg.map(r => r.varReal).filter(v => v !== null && !isNaN(v));
  }
  const domain = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];

  _mapaLayer = L.geoJSON(_hnGeojson, {
    style(feature) {
      const key = normDepto(feature.properties.NAME_1);
      return {
        fillColor:   getColorForFeature(lookup[key], mode, domain),
        fillOpacity: 0.75, weight: 1.5, color: 'white', smoothFactor: 0.5
      };
    },
    onEachFeature(feature, layer) {
      const key  = normDepto(feature.properties.NAME_1);
      const name = feature.properties.NAME_1;
      layer.bindPopup(buildPopupHTML(name, lookup[key], mesLbl, anio, anioP));
      layer.on({
        mouseover(e) { e.target.setStyle({ weight: 2.5, color: '#333', fillOpacity: 0.92 }); },
        mouseout(e)  { _mapaLayer.resetStyle(e.target); }
      });
    }
  }).addTo(_mapaInstance);

  // Legend
  _mapaLegend = L.control({ position: 'bottomright' });
  _mapaLegend.onAdd = function() {
    const div = L.DomUtil.create('div');
    div.style.cssText = 'background:white;padding:8px 12px;border-radius:6px;font-size:12px;line-height:1.9;box-shadow:0 1px 5px rgba(0,0,0,.2);min-width:140px;';

    if (mode === 'recaudacion') {
      const pal = ['#dbeafe','#93c5fd','#3b82f6','#2563eb','#1e3a8a'];
      let html  = `<b style="font-size:11px;">${mesLbl} ${anio || ''} (mill. L)</b><br>`;
      for (let i = 5; i >= 0; i--) {
        const t = i / 5;
        const v = domain[0] + t * (domain[1] - domain[0]);
        const c = scaleColor(v, domain[0], domain[1], pal);
        html += `<i style="display:inline-block;width:14px;height:14px;background:${c};border-radius:2px;margin-right:5px;vertical-align:middle;"></i>${fmt(r1(v))}<br>`;
      }
      div.innerHTML = html;
    } else {
      const lim   = Math.max(Math.abs(domain[0]), Math.abs(domain[1]), 1);
      const title = mode === 'variacion' ? `Var. nom. % vs ${anioP}` : `Var. real % vs ${anioP}`;
      div.innerHTML = `<b style="font-size:11px;">${title}</b><br>
        <i style="display:inline-block;width:14px;height:14px;background:#1e3a8a;border-radius:2px;margin-right:5px;vertical-align:middle;"></i>+${fmt(r1(lim))}%<br>
        <i style="display:inline-block;width:14px;height:14px;background:#f8fafc;border:1px solid #ccc;border-radius:2px;margin-right:5px;vertical-align:middle;"></i>0%<br>
        <i style="display:inline-block;width:14px;height:14px;background:#93c5fd;border-radius:2px;margin-right:5px;vertical-align:middle;"></i>-${fmt(r1(lim))}%<br>`;
    }
    return div;
  };
  _mapaLegend.addTo(_mapaInstance);
}
