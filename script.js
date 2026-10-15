const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const PAGE = 100;

const UPT_COLORS = {
  'STASIUN PSDKP AMBON':'#3b82f6','STASIUN PSDKP BELAWAN':'#22c55e','STASIUN PSDKP BIAK':'#ef4444',
  'STASIUN PSDKP CILACAP':'#a855f7','STASIUN PSDKP KUPANG':'#f97316','STASIUN PSDKP PONTIANAK':'#06b6d4',
  'STASIUN PSDKP TAHUNA':'#eab308','STASIUN PSDKP TARAKAN':'#94a3b8',
  'PANGKALAN PSDKP BATAM':'#6366f1','PANGKALAN PSDKP BENOA':'#10b981','PANGKALAN PSDKP BITUNG':'#e11d48',
  'PANGKALAN PSDKP JAKARTA':'#8b5cf6','PANGKALAN PSDKP LAMPULO':'#0ea5e9','PANGKALAN PSDKP TUAL':'#ea580c'
};

// --- Coast filter (Turf) globals ---
let garpanGeo = null;
let garpanLines = [];
const COAST_BUFFER_M = 1000; // 1 km

// fetch & prepare garpan lines (call this once at startup)
async function fetchGarpanLines() {
  try {
    const res = await fetch('garpan_web_simplified_05.geojson');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const geo = await res.json();
    garpanGeo = geo;
    garpanLines = [];

    const addLinesFromFeature = (feat) => {
      if (!feat || !feat.geometry) return;
      const t = feat.geometry.type;
      if (t === 'Polygon' || t === 'MultiPolygon') {
        // polygon -> lines
        const lines = turf.polygonToLine(feat);
        if (lines.type === 'FeatureCollection') lines.features.forEach(f => garpanLines.push(f));
        else garpanLines.push(lines);
      } else if (t === 'LineString' || t === 'MultiLineString') {
        garpanLines.push(feat);
      }
    };

    if (geo.type === 'FeatureCollection') geo.features.forEach(f => addLinesFromFeature(f));
    else addLinesFromFeature(geo);

    console.debug('garpan loaded, lines:', garpanLines.length);
    return true;
  } catch (err) {
    console.warn('Failed to load garpan:', err);
    garpanGeo = null;
    garpanLines = [];
    return false;
  }
}

function applyCoastFilterToData() {
  if (!Array.isArray(data) || !data.length) return;
  // if garpan not loaded -> show all valid coords
  const hasGar = Array.isArray(garpanLines) && garpanLines.length > 0 && garpanGeo;
  data.forEach(d => {
    // default: invisible if coordinate not valid
    if (!d._ok) { d._coastVisible = false; d._distToCoast = Infinity; return; }
    if (!hasGar) { d._coastVisible = true; d._distToCoast = 0; return; }

    const pt = turf.point([d.lng, d.lat]); // turf uses [lng,lat]
    // check if point inside any polygon (garpanGeo may be FeatureCollection)
    let inside = false;
    if (garpanGeo.type === 'FeatureCollection') {
      for (const f of garpanGeo.features) {
        if (turf.booleanPointInPolygon(pt, f)) { inside = true; break; }
      }
    } else {
      if (turf.booleanPointInPolygon(pt, garpanGeo)) inside = true;
    }

    if (!inside) {
      d._coastVisible = true;
      d._distToCoast = 0;
      return;
    }

    // inside polygon -> compute min distance to any garpan line (meters)
    let minDist = Infinity;
    for (const lf of garpanLines) {
      const dist = turf.pointToLineDistance(pt, lf, { units: 'meters' });
      if (dist < minDist) minDist = dist;
      if (minDist <= COAST_BUFFER_M) break; // short-circuit
    }
    d._distToCoast = minDist;
    d._coastVisible = (minDist <= COAST_BUFFER_M);
  });
}

const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
const uptColor = n => UPT_COLORS[norm(n)] || '#64748b';
const uptType = n => /stasiun/i.test(n) ? 'Stasiun PSDKP' : /pangkalan/i.test(n) ? 'Pangkalan PSDKP' : 'UPT PSDKP';
const titleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace('Psdkp', 'PSDKP');

let toastTimer;
function toast(msg, err = false, ms = 3500) {
  const t = $('toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => t.className = '', ms);
}

const map = L.map('map', { center: [-2.5, 118], zoom: 5, zoomControl: true, preferCanvas: true });
const carto = (v) => L.tileLayer(`https://{s}.basemaps.cartocdn.com/${v}/{z}/{x}/{y}{r}.png`, { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 });
carto('dark_all').addTo(map);

const baseMaps = {
  'Gelap (Esri Dark)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 16 }),
  'Satelit + Label (Esri)': L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}')
  ]),
  'Peta jalan (OpenStreetMap)': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }),
  'Terang (Esri Light)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 16 }),
  'Topografi (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' })
};

const greenHeatLayer = L.heatLayer([], { radius: 25, blur: 15, maxZoom: 12, minOpacity: 0.60, max: 1.0, gradient: { 0.0: 'transparent', 0.5: '#34d399', 1.0: '#34d399' } });
const yellowHeatLayer = L.heatLayer([], { radius: 25, blur: 15, maxZoom: 12, minOpacity: 0.60, max: 1.0, gradient: { 0.0: 'transparent', 0.5: '#facc15', 1.0: '#facc15' } });
const redHeatLayer = L.heatLayer([], { radius: 25, blur: 15, maxZoom: 12, minOpacity: 0.60, max: 1.0, gradient: { 0.0: 'transparent', 0.5: '#ef4444', 1.0: '#ef4444' } });

const heatGroup = L.layerGroup([greenHeatLayer, yellowHeatLayer, redHeatLayer]).addTo(map);

function updateHeatmapOptions() {
  const z = map.getZoom();
  let dynamicRadius = Math.max(10, Math.min(10 + (z - 5) * 4, 35));
  let dynamicBlur = Math.max(10, Math.min(10 + (z - 5) * 3, 25));
  const opts = { radius: dynamicRadius, blur: dynamicBlur };
  greenHeatLayer.setOptions(opts);
  yellowHeatLayer.setOptions(opts);
  redHeatLayer.setOptions(opts);
}

map.on('zoomend', updateHeatmapOptions);

const clusterGroup = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50 }).addTo(map);
const garpanGroup = L.layerGroup();
const uptGroup = L.layerGroup();

L.control.layers(baseMaps, {
  '🔥 Hotspot / Heatmap Kepadatan': heatGroup,
  '📍 Pengelompokan titik (Cluster)': clusterGroup,
  '🏝️ Garis Pantai Indonesia (Garpan)': garpanGroup,
  '🏢 Wilayah UPT PSDKP': uptGroup
}, { position: 'topright', collapsed: window.innerWidth <= 768 }).addTo(map);

function popupFromProps(props, title) {
  const rows = Object.entries(props || {})
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `<tr><td style="padding:2px 8px 2px 0;color:#64748b;vertical-align:top">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`).join('');
  return `<div style="min-width:260px;max-width:380px">
    <div style="font-weight:700;color:#0f172a;border-bottom:2px solid #38bdf8;padding-bottom:5px;margin-bottom:7px">${esc(title)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:.74rem;color:#334155">${rows || '<tr><td>Informasi tidak tersedia</td></tr>'}</table></div>`;
}

function getUPTName(props = {}) {
  const keys = ['nama_upt','NAMA_UPT','Nama_UPT','nama','NAMA','Nama','upt','UPT','unit','UNIT','nama_upt_psdkp','UPT_PSDKP'];
  for (const k of keys) { const v = String(props[k] ?? '').trim(); if (v) return v; }
  for (const v of Object.values(props)) { const s = String(v ?? '').trim(); if (/(stasiun|pangkalan)\s+psdkp/i.test(s)) return s; }
  return 'UPT PSDKP';
}

const loaders = {};
function loadGeo(key, url, group, label, makeLayer) {
  if (loaders[key]) return;
  loaders[key] = true;
  toast(`Memuat ${label}…`, false, 0);
  fetch(url)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(resData => { group.addLayer(makeLayer(resData)); toast(`${label} berhasil dimuat`); })
    .catch(e => {
      console.error(e); loaders[key] = false;
      toast(`${label} gagal dimuat (${e.message}).`, true, 6000);
    });
}

const loadGarpan = () => loadGeo('garpan', 'garpan_web_simplified_05.geojson', garpanGroup, 'Garis pantai',
  resData => L.geoJSON(resData, {
    style: { color: '#0284c7', weight: 1.2, opacity: .85 },
    onEachFeature: (f, l) => l.bindPopup(popupFromProps(f.properties, 'Garis Pantai Indonesia (Garpan)'))
  }));

const loadUPT = () => loadGeo('upt', 'upt_psdkp_web.geojson', uptGroup, 'Wilayah UPT PSDKP',
  resData => L.geoJSON(resData, {
    style: f => { const c = uptColor(getUPTName(f.properties)); return { color: c, fillColor: c, weight: 2, opacity: .95, fillOpacity: .14 }; },
    onEachFeature: (f, l) => { const n = getUPTName(f.properties); l.bindPopup(popupFromProps(f.properties, `${uptType(n)} — ${n}`)); }
  }));

uptGroup.addTo(map); loadUPT();
map.on('overlayadd', e => { if (e.layer === garpanGroup) loadGarpan(); if (e.layer === uptGroup) loadUPT(); });

const validCoord = d => Number.isFinite(+d.lat) && Number.isFinite(+d.lng) && +d.lat >= -12 && +d.lat <= 7 && +d.lng >= 94 && +d.lng <= 142;

let data = [];
const state = { q: '', upt: '', status: '' };
let filtered = [], shown = 0;
const markers = new Map();

function getStatusBadgeClass(status) {
  const s = status.toLowerCase();
  if (s.includes('sudah')) return 'b-ok';
  if (s.includes('proses')) return 'b-process';
  return 'b-no';
}

function getStatusRingColor(status) {
  const s = status.toLowerCase();
  if (s.includes('sudah')) return '#34d399'; // Hijau
  if (s.includes('proses')) return '#60a5fa'; // Biru
  return '#f97316'; // Oranye
}

function makeMarker(d) {
  const ring = getStatusRingColor(d.status);
  const m = L.circleMarker([d.lat, d.lng], { radius: 6, fillColor: uptColor(d.upt), color: ring, weight: 2, opacity: 1, fillOpacity: .9 });
  m.bindPopup(`<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:230px;max-width:320px">
    <h3 style="font-size:.9rem;margin-bottom:6px;color:#0f172a;border-bottom:2px solid #38bdf8;padding-bottom:4px">${esc(d.nama)}</h3>
    <div style="font-size:.78rem;color:#334155;line-height:1.5">
      <p><strong>Lokasi:</strong> ${esc(d.lokasi)}</p>
      <p><strong>UPT PSDKP:</strong> ${esc(d.upt)}</p>
      ${d.kegiatan && d.kegiatan !== '-' ? `<p><strong>Kegiatan:</strong> ${esc(d.kegiatan)}</p>` : ''}
      <p><strong>Status:</strong> <span style="font-weight:700;color:${ring}">${esc(d.status)}</span></p>
      <p><strong>Indikasi:</strong> ${esc(d.indikasi).replace(/\n/g, '<br>')}</p>
      <p><strong>Koordinat:</strong> ${d.lat}, ${d.lng}</p>
    </div></div>`);
  return m;
}

function renderList(reset) {
  const ul = $('data-list');
  if (reset) { ul.innerHTML = ''; shown = 0; }
  ul.querySelector('.more-li')?.remove();

  if (!filtered.length) {
    ul.innerHTML = `<li class="empty">${data.length ? 'Tidak ada lokasi yang cocok.' : 'Memuat data atau data kosong.'}</li>`;
    return;
  }
  const frag = document.createDocumentFragment();
  filtered.slice(shown, shown + PAGE).forEach(d => {
    const li = document.createElement('li');
    li.className = 'item'; li.tabIndex = 0; li.dataset.id = d._id;
    const badgeClass = getStatusBadgeClass(d.status);
    const ringColor = getStatusRingColor(d.status);
    li.innerHTML = `<h4><span class="dot" style="background:${uptColor(d.upt)};border-color:${ringColor}"></span>${esc(d.nama)}</h4>
      <p>${esc(d.lokasi)}${d._ok ? '' : ' · koordinat tidak valid'}</p>
      <span class="badge ${badgeClass}">${esc(d.status)}</span>`;
    frag.appendChild(li);
  });
  shown = Math.min(shown + PAGE, filtered.length);
  ul.appendChild(frag);
  if (shown < filtered.length) {
    const li = document.createElement('li'); li.className = 'more-li';
    li.innerHTML = `<button class="more" type="button">Muat lebih banyak (${filtered.length - shown} tersisa)</button>`;
    ul.appendChild(li);
  }
}

function render() {
  const q = state.q.trim().toLowerCase();
  filtered = data.filter(d => {
  const matchQ = !q || d._hay.includes(q);
  const matchUpt = !state.upt || d.upt === state.upt;
  let matchStatus = true;
  if (state.status) {
    matchStatus = d.status.toLowerCase().includes(state.status.toLowerCase());
  }
  // only include if coast filter allows it
  const coastOk = (d._coastVisible !== false); // true if undefined or true
  return matchQ && matchUpt && matchStatus && coastOk;
});

  const plotted = filtered.filter(d => d._ok);
  clusterGroup.clearLayers(); markers.clear();
  const ms = plotted.map(d => { const m = makeMarker(d); markers.set(d._id, m); return m; });
  clusterGroup.addLayers(ms);

  const cellMap = new Map();
  plotted.forEach(d => {
    const cx = Math.floor((d.lng * 111.32) / 15);
    const cy = Math.floor((d.lat * 110.574) / 15);
    const key = `${cx},${cy}`;
    if (!cellMap.has(key)) cellMap.set(key, { sumLat: 0, sumLng: 0, count: 0 });
    const cell = cellMap.get(key);
    cell.sumLat += d.lat;
    cell.sumLng += d.lng;
    cell.count += 1;
  });

  const greenPoints = [], yellowPoints = [], redPoints = [];
  cellMap.forEach(cell => {
    if (cell.count >= 5) {
      const lat = cell.sumLat / cell.count;
      const lng = cell.sumLng / cell.count;
      if (cell.count > 15) redPoints.push([lat, lng, 1.0]);
      else if (cell.count >= 10) yellowPoints.push([lat, lng, 1.0]);
      else greenPoints.push([lat, lng, 1.0]);
    }
  });

  greenHeatLayer.setLatLngs(greenPoints);
  yellowHeatLayer.setLatLngs(yellowPoints);
  redHeatLayer.setLatLngs(redPoints);
  updateHeatmapOptions();

  const countSudah = filtered.filter(d => d.status.toLowerCase().includes('sudah')).length;
  const countProses = filtered.filter(d => d.status.toLowerCase().includes('proses')).length;
  const countBelum = filtered.filter(d => d.status.toLowerCase().includes('belum')).length;

  // Update nilai pada card statistik baru
  if ($('n-sudah')) $('n-sudah').textContent = countSudah;
  if ($('n-proses')) $('n-proses').textContent = countProses;
  if ($('n-belum')) $('n-belum').textContent = countBelum;

  $('n-show').textContent = filtered.length;

  const uptCountData = data.filter(d => !state.upt || d.upt === state.upt);
  $('n-upt-pelaku').textContent = uptCountData.length;

  const pct = filtered.length ? Math.round((countSudah / filtered.length) * 100) : 0;
  $('bar').style.width = pct + '%';
  const skipped = filtered.length - plotted.length;
  $('bar-note').textContent = filtered.length ? `${pct}% sudah penetapan sanksi${skipped ? ` · ${skipped} titik tanpa koordinat valid` : ''}` : '';
  renderList(true);
}

function focusItem(id) {
  const d = data.find(item => item._id === id), m = markers.get(id);
  if (!d || !m) { toast('Titik ini tidak memiliki koordinat valid.', true); return; }
  if (innerWidth <= 768) closeSidebar();
  clusterGroup.zoomToShowLayer(m, () => { map.setView([d.lat, d.lng], Math.max(map.getZoom(), 12)); m.openPopup(); });
}

let deb;
$('q').addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { state.q = e.target.value; render(); }, 200); });
$('f-upt').addEventListener('change', e => { state.upt = e.target.value; render(); });$('f-status').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.status = b.dataset.v;
  $('f-status').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  render();
});
$('reset').addEventListener('click', () => {
  Object.assign(state, { q: '', upt: '', status: '' });
  $('q').value = ''; $('f-upt').value = '';$('f-status').querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', i === 0));
  render();
});
$('data-list').addEventListener('click', e => { if (e.target.closest('.more')) return renderList(false); const li = e.target.closest('.item'); if (li) focusItem(+li.dataset.id); });$('data-list').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { const li = e.target.closest('.item'); if (li) { e.preventDefault(); focusItem(+li.dataset.id); } }
});

const sb = $('sidebar');
function closeSidebar() { sb.classList.remove('open'); sb.classList.add('collapsed'); $('sb-open').classList.add('show'); setTimeout(() => map.invalidateSize(), 280); }
function openSidebar() { sb.classList.add('open'); sb.classList.remove('collapsed'); $('sb-open').classList.remove('show'); setTimeout(() => map.invalidateSize(), 280); }
$('sb-close').addEventListener('click', closeSidebar);$('sb-open').addEventListener('click', openSidebar);
if (innerWidth <= 768) { sb.classList.remove('open'); }

const legend = L.control({ position: 'bottomright' });
legend.onAdd = () => {
  const wrap = L.DomUtil.create('div', 'legend-wrap');
  const btn = L.DomUtil.create('button', 'legend-btn', wrap);
  btn.type = 'button'; btn.setAttribute('aria-label', 'Tampilkan legenda');
  btn.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
  const panel = L.DomUtil.create('div', 'legend-panel', wrap);
  const list = prefix => Object.keys(UPT_COLORS).filter(k => k.startsWith(prefix)).map(k =>
    `<div class="lg"><span class="sw" style="background:${UPT_COLORS[k]};border-color:${UPT_COLORS[k]}"></span>${esc(titleCase(k))}</div>`).join('');
  panel.innerHTML = `
    <div class="legend-sec"><h5>Hotspot Pengawasan</h5>
      <div class="lg"><span class="sw" style="border-color:#34d399"></span>Hijau: Sudah sanksi</div>
      <div class="lg"><span class="sw" style="border-color:#60a5fa"></span>Biru: Proses pengawasan</div>
      <div class="lg"><span class="sw" style="border-color:#f97316"></span>Oranye: Belum diawasi</div>
      <div class="lg"><span class="sw" style="border-color:#64748b;background:#64748b"></span>Warna isi: UPT penanggung jawab</div></div>
    <div class="legend-sec"><h5>Stasiun PSDKP</h5>${list('STASIUN')}</div>
    <div class="legend-sec"><h5>Pangkalan PSDKP</h5>${list('PANGKALAN')}</div>
    <div class="legend-sec"><h5>Kepadatan Hotspot (Solid Blur)</h5><div class="heat-bar"></div>
      <div class="heat-lbl"><span>Rendah</span><span>Sedang</span><span>Tinggi</span></div>
      <div class="heat-ranges"><span>5–10 titik</span><span>10–15 titik</span><span>&gt;15 titik</span></div></div>`;
  L.DomEvent.disableClickPropagation(wrap);
  L.DomEvent.disableScrollPropagation(panel);
  btn.addEventListener('click', () => {
    const open = panel.classList.toggle('show');
    btn.setAttribute('aria-label', open ? 'Sembunyikan legenda' : 'Tampilkan legenda');
    btn.innerHTML = `<i class="fa-solid ${open ? 'fa-xmark' : 'fa-circle-info'}"></i>`;
  });
  return wrap;
};
legend.addTo(map);

async function initApp() {
  if (typeof toast === 'function') toast("Memuat data dari Google Sheets...", false, 0);

  // load garpan in background (await so filter is ready)
  await fetchGarpanLines();

  const fetchedData = await loadSheetData();
  window.rawData = fetchedData;

  data = fetchedData.map((d, i) => ({
    ...d,
    _id: i,
    lat: +d.lat,
    lng: +d.lng,
    _ok: validCoord(d),
    _hay: `${d.nama} ${d.lokasi} ${d.indikasi}`.toLowerCase()
  }));

  // apply coast rule (requires garpanLines)
  applyCoastFilterToData();

  // populate UPT dropdown
  const fUpt = $('f-upt');
  fUpt.innerHTML = '<option value="">Semua UPT</option>';
  [...new Set(data.map(d => d.upt).filter(Boolean))].sort().forEach(u => {
    const o = document.createElement('option'); o.value = u; o.textContent = u; fUpt.appendChild(o);
  });

  if (typeof toast === 'function') toast("Data berhasil dimuat dari Spreadsheet!");
  render();
}

initApp();
