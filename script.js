/* ==== UTIL ==== */
const $ = (id) => document.getElementById(id);

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])
  );

function firstDefined(obj, keys) {
  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] !== undefined &&
      obj[key] !== null &&
      String(obj[key]).trim() !== ''
    ) {
      return obj[key];
    }
  }
  return null;
}

function parseNumberFlexible(raw) {
  if (raw === undefined || raw === null) return NaN;
  const s = String(raw).trim().replace(/\s+/g, '').replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeStatus(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low.includes('sudah')) return 'Sudah diawasi';
  if (low.includes('belum')) return 'Belum diawasi';
  return s;
}

/* ==== GEODESIC HELP ==== */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function colorForDensity(count, max) {
  const h = 210;
  const s = 75;
  const light = 86;
  const dark = 24;
  const ratio = max > 0 ? count / max : 0;
  const l = Math.round(light - ratio * (light - dark));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function radiusForDensity(count, max) {
  const base = 6;
  const extra = max > 0 ? Math.round((count / max) * 8) : 0;
  return base + extra;
}

/* ==== MAP CONFIG ==== */
const SHEET_ID = '19XvPDOvnKFobzk45LnqKwvbeAMoxT0N3ob0cLqYPT4k';
const GID = '0';
const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

const map = L.map('map').setView([-2.5, 118], 5);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri'
});

L.control.layers({ 'OpenStreetMap': osm, 'Satelit (Esri)': esriSat }).addTo(map);

const markersCluster = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 50
});

let allData = [];
let densityRadiusMeters = 5000;

function processRows(rows) {
  allData = [];

  rows.forEach((row, idx) => {
    const longRaw = firstDefined(row, ['LONG', 'Long', 'long', 'longitude', 'Longitude', 'LON']);
    const latRaw = firstDefined(row, ['LAT', 'Lat', 'lat', 'latitude', 'Latitude', 'LATITUDE']);

    const name = firstDefined(row, ['PELAKU USAHA', 'PELAKU_USAHA', 'pelaku_usaha', 'NAMA', 'nama', 'name']) || `Lokasi ${idx + 1}`;
    const addr = firstDefined(row, ['LOKASI', 'lokasi', 'ALAMAT', 'alamat', 'address', 'ALAMAT LENGKAP']) || '';
    const indikasi = firstDefined(row, ['INDIKASI PELANGGARAN', 'INDIKASI', 'indikasi', 'indikasi_pelanggaran']) || '';
    const category = firstDefined(row, ['UPT PSDKP', 'UPT_PSDKP', 'UPT', 'upt']) || '';
    const status = normalizeStatus(firstDefined(row, ['TL PENGAWASAN', 'TL_PENGAWASAN', 'TL pengawasan', 'TL_pengawasan', 'TL']));

    const lng = parseNumberFlexible(longRaw);
    const lat = parseNumberFlexible(latRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    allData.push({
      _id: idx,
      lat,
      lng,
      name,
      addr,
      indikasi,
      category,
      status,
      raw: row,
      density: 0
    });
  });

  if (allData.length) {
    const n = allData.length;
    for (let i = 0; i < n; i++) {
      let count = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = distanceMeters(allData[i].lat, allData[i].lng, allData[j].lat, allData[j].lng);
        if (d <= densityRadiusMeters) count++;
      }
      allData[i].density = count;
    }
    window._maxDensity = Math.max(...allData.map(d => d.density));
  }
}

function popupFromItem(d) {
  const rows = [];
  rows.push(['Pelaku Usaha', d.name]);
  if (d.addr) rows.push(['Lokasi', d.addr]);
  if (d.indikasi) rows.push(['Indikasi Pelanggaran', d.indikasi]);
  if (d.category) rows.push(['UPT PSDKP', d.category]);
  if (d.status) rows.push(['TL Pengawasan', d.status]);
  rows.push(['Koordinat', `${d.lat}, ${d.lng}`]);

  const usedKeys = new Set([
    'PELAKU USAHA', 'PELAKU_USAHA', 'pelaku_usaha', 'NAMA', 'nama', 'name',
    'LOKASI', 'lokasi', 'ALAMAT', 'alamat', 'address', 'ALAMAT LENGKAP',
    'INDIKASI PELANGGARAN', 'INDIKASI', 'indikasi', 'indikasi_pelanggaran',
    'UPT PSDKP', 'UPT_PSDKP', 'UPT', 'upt',
    'TL PENGAWASAN', 'TL_PENGAWASAN', 'TL pengawasan', 'TL_pengawasan', 'TL',
    'LONG', 'Long', 'long', 'longitude', 'Longitude', 'LON',
    'LAT', 'Lat', 'lat', 'latitude', 'Latitude', 'LATITUDE'
  ]);

  for (const k of Object.keys(d.raw || {})) {
    if (usedKeys.has(k)) continue;
    const v = d.raw[k];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    rows.push([k, String(v)]);
  }

  let html = '<table style="border-collapse:collapse; font-size:13px; min-width:220px;">';
  for (const row of rows) {
    html += `
      <tr>
        <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #eee; color:#0f172a; width:44%;">${esc(row[0])}</th>
        <td style="padding:6px 8px; border-bottom:1px solid #f5f6f8; color:#0f172a;">${esc(row[1])}</td>
      </tr>
    `;
  }
  html += '</table>';
  return html;
}

function renderMarkers(filtered = allData) {
  markersCluster.clearLayers();

  const max = Math.max(...filtered.map(d => d.density), 0);

  filtered.forEach((d) => {
    const color = colorForDensity(d.density, max);
    const rad = radiusForDensity(d.density, max);
    const m = L.circleMarker([d.lat, d.lng], {
      radius: rad,
      fillColor: color,
      color: '#07203a',
      weight: 0.8,
      opacity: 1,
      fillOpacity: 0.85
    });
    m.bindPopup(popupFromItem(d));
    markersCluster.addLayer(m);
  });

  map.addLayer(markersCluster);
}

function buildLegendControl() {
  const max = window._maxDensity || 0;
  const legend = L.control({ position: 'bottomright' });

  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'density-legend');
    div.style.background = 'rgba(15,23,42,0.9)';
    div.style.color = '#fff';
    div.style.padding = '8px 10px';
    div.style.borderRadius = '8px';
    div.style.fontSize = '13px';

    div.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">Intensitas titik</div>
      <div style="height:10px; border-radius:6px; background:linear-gradient(90deg, hsl(210,75%,86%) 0%, hsl(210,75%,50%) 0%, hsl(210,75%,24%) 100%);"></div>
      <div style="display:flex; justify-content:space-between; margin-top:6px;">
        <span>0</span><span>${max}</span>
      </div>
    `;
    return div;
  };

  legend.addTo(map);
}

function populateCategorySelect() {
  const sel = $('categorySelect');
  if (!sel) return;

  sel.innerHTML = '<option value="">Semua Kategori</option>';
  const cats = Array.from(new Set(allData.map(d => (d.category || '').trim()).filter(Boolean))).sort();

  cats.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

$('applyBtn')?.addEventListener('click', () => {
  const searchText = $('searchText').value.trim().toLowerCase();
  const category = $('categorySelect').value;

  const filtered =`*

