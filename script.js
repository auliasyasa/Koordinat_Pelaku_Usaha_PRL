/* ==== UTIL ==== */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[c]));
const SUDAH = 'Sudah diawasi';
const BELUM = 'Belum diawasi';
const PAGE = 100;

const colorMap = {
  'A': '#38bdf8',
  'B': '#34d399',
  'C': '#f97316',
  'D': '#facc15',
  'E': '#8b5cf6',
  'F': '#fb7185'
};

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
const colorByCategory = (name) => {
  const key = norm(name).slice(0, 1) || 'A';
  return colorMap[key] || '#64748b';
};

const normalizeStatus = (v) => {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('sudah')) return SUDAH;
  if (s.includes('belum')) return BELUM;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

let toastTimer;
function toast(msg, err = false, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => t.className = '', ms);
}

/* ==== PETA ==== */
const map = L.map('map', { center: [-2.5, 118], zoom: 5, zoomControl: true, preferCanvas: true });

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

const baseMaps = {
  'OpenStreetMap': osm,
  'Satelit (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri'
  }),
  'Peta Jalan (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
  })
};

L.control.layers(baseMaps).addTo(map);

const clusterGroup = L.markerClusterGroup({
  chunkedLoading: true,
  showCoverageOnHover: false,
  maxClusterRadius: 50
}).addTo(map);

/* ==== DATA ==== */
const SHEET_ID = '19XvPDOvnKFobzk45LnqKwvbeAMoxT0N3ob0cLqYPT4k';
const GID = '0';
const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

let allData = [];
const state = { q: '', category: '', status: '' };
let filtered = [], shown = 0;
const markers = new Map();

const firstDefined = (obj, keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return '';
};

function parseSheet(rows) {
  allData = [];
  rows.forEach((row, idx) => {
    const latRaw = firstDefined(row, ['latitude', 'lat', 'Latitude', 'LAT', 'Lat', 'y']);
    const lngRaw = firstDefined(row, ['longitude', 'lng', 'lon', 'long', 'Longitude', 'LNG', 'Lon', 'Long', 'x']);
    const name = firstDefined(row, ['name', 'nama', 'Name', 'NAMA', 'pelaku_usaha']) || `Lokasi ${idx + 1}`;
    const addr = firstDefined(row, ['address', 'alamat', 'Address', 'ALAMAT', 'lokasi']) || '';
    const category = firstDefined(row, ['category', 'kategori', 'Category', 'KATEGORI', 'jenis', 'type']) || '';
    const status = normalizeStatus(firstDefined(row, ['status', 'Status', 'kondisi', 'status_pengawasan', 'pengawasan']));

    const lat = Number(String(latRaw).trim());
    const lng = Number(String(lngRaw).trim());

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    allData.push({
      _id: idx,
      lat,
      lng,
      name,
      addr,
      category,
      status,
      _hay: `${name} ${addr} ${category}`.toLowerCase()
    });
  });
}

function makeMarker(d) {
  const ring = d.status === SUDAH ? '#34d399' : (d.status === BELUM ? '#f97316' : '#38bdf8');
  const fill = colorByCategory(d.category || d.name);
  const m = L.circleMarker([d.lat, d.lng], {
    radius: 7,
    fillColor: fill,
    color: ring,
    weight: 2,
    opacity: 1,
    fillOpacity: 0.9
  });

  m.bindPopup(`
    <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:220px;max-width:320px">
      <h3 style="font-size:.9rem;margin-bottom:6px;color:#0f172a;border-bottom:2px solid #38bdf8;padding-bottom:4px">${esc(d.name)}</h3>
      <div style="font-size:.78rem;color:#334155;line-height:1.5">
        ${d.addr ? `<p><strong>Alamat:</strong> ${esc(d.addr)}</p>` : ''}
        ${d.category ? `<p><strong>Kategori:</strong> ${esc(d.category)}</p>` : ''}
        ${d.status ? `<p><strong>Status:</strong> <span style="font-weight:700;color:${ring}">${esc(d.status)}</span></p>` : ''}
        <p><strong>Koordinat:</strong> ${d.lat}, ${d.lng}</p>
      </div>
    </div>
  `);

  return m;
}

function populateCategorySelect() {
  const select = $('f-category');
  select.innerHTML = '<option value="">Semua kategori</option>';
  const cats = [...new Set(allData.map(d => String(d.category || '').trim()).filter(Boolean))].sort();
  cats.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function renderList(reset) {
  const ul = $('data-list');
  if (reset) { ul.innerHTML = ''; shown = 0; }

  ul.querySelector('.more-li')?.remove();

  if (!filtered.length) {
    ul.innerHTML = '<li class="empty">Tidak ada lokasi yang cocok. Ubah kata kunci atau reset filter.</li>';
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.slice(shown, shown + PAGE).forEach((d) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.tabIndex = 0;
    li.dataset.id = d._id;
    li.innerHTML = `
      <h4><span class="dot" style="background:${colorByCategory(d.category || d.name)};border-color:${d.status === SUDAH ? '#34d399' : (d.status === BELUM ? '#f97316' : '#38bdf8')}"></span>${esc(d.name)}</h4>
      <p>${esc(d.addr || 'Alamat tidak tersedia')}</p>
      <span class="badge ${d.status === SUDAH ? 'b-ok' : (d.status === BELUM ? 'b-no' : 'b-ok')}">${esc(d.status || 'Status tidak ada')}</span>
    `;
    frag.appendChild(li);
  });

  shown = Math.min(shown + PAGE, filtered.length);
  ul.appendChild(frag);

  if (shown < filtered.length) {
    const li = document.createElement('li');
    li.className = 'more-li';
    li.innerHTML = `<button class="more" type="button">Muat lebih banyak (${filtered.length - shown} tersisa)</button>`;
    ul.appendChild(li);
  }
}

function render() {
  const q = state.q.trim().toLowerCase();
  filtered = allData.filter((d) => {
    const okQ = !q || d._hay.includes(q);
    const okCat = !state.category || d.category === state.category;
    const okStatus = !state.status || d.status === state.status;
    return okQ && okCat && okStatus;
  });

  clusterGroup.clearLayers();
  markers.clear();
  filtered.forEach((d) => {
    const m = makeMarker(d);
    markers.set(d._id, m);
    clusterGroup.addLayer(m);
  });

  const okCount = filtered.filter((d) => d.status === SUDAH).length;
  const pct = filtered.length ? Math.round((okCount / filtered.length) * 100) : 0;

  $('n-total').textContent = filtered.length;
  $('n-ok').textContent = okCount;
  $('n-no').textContent = filtered.length - okCount;
  $('n-show').textContent = filtered.length;
  $('bar').style.width = pct + '%';
  $('bar-note').textContent = filtered.length ? `${pct}% status sudah terdata` : 'Belum ada data';

  renderList(true);

  if (filtered.length) {
    const bounds = filtered.map((d) => [d.lat, d.lng]);
    const group = L.featureGroup(filtered.map((d) => L.marker([d.lat, d.lng])));
    map.fitBounds(group.getBounds(), { padding: [40, 40] });
  }
}

function focusItem(id) {
  const d = allData[id];
  const m = markers.get(id);
  if (!d || !m) {
    toast('Titik ini tidak memiliki koordinat valid.', true);
    return;
  }
  if (window.innerWidth <= 768) closeSidebar();
  clusterGroup.zoomToShowLayer(m, () => {
    map.setView([d.lat, d.lng], Math.max(map.getZoom(), 12));
    m.openPopup();
  });
}

function closeSidebar() {
  const sb = $('sidebar');
  sb.classList.remove('open');
  sb.classList.add('collapsed');
  $('sb-open').classList.add('show');
  setTimeout(() => map.invalidateSize(), 280);
}

function openSidebar() {
  const sb = $('sidebar');
  sb.classList.add('open');
  sb.classList.remove('collapsed');
  $('sb-open').classList.remove('show');
  setTimeout(() => map.invalidateSize(), 280);
}

function bindEvents() {
  $('q').addEventListener('input', (e) => {
    state.q = e.target.value;
    render();
  });

  $('f-category').addEventListener('change', (e) => {
    state.category = e.target.value;
    render();
  });

  $('f-status').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.status = btn.dataset.v;
    $('f-status').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === btn));
    render();
  });

  $('reset').addEventListener('click', () => {
    state.q = '';
    state.category = '';
    state.status = '';
    $('q').value = '';
    $('f-category').value = '';
    $('f-status').querySelectorAll('button').forEach((x, idx) => x.setAttribute('aria-pressed', idx === 0));
    render();
  });

  $('data-list').addEventListener('click', (e) => {
    const more = e.target.closest('.more');
    if (more) return renderList(false);
    const li = e.target.closest('.item');
    if (li) focusItem(Number(li.dataset.id));
  });

  $('data-list').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const li = e.target.closest('.item');
      if (li) {
        e.preventDefault();
        focusItem(Number(li.dataset.id));
      }
    }
  });

  $('sb-close').addEventListener('click', closeSidebar);
  $('sb-open').addEventListener('click', openSidebar);
}

function buildLegend() {
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const wrap = L.DomUtil.create('div', 'legend-wrap');
    const btn = L.DomUtil.create('button', 'legend-btn', wrap);
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Tampilkan legenda');
    btn.innerHTML = '<i class="fa-solid fa-circle-info"></i>';

    const panel = L.DomUtil.create('div', 'legend-panel', wrap);
    panel.innerHTML = `
      <div class="legend-sec">
        <h5>Legenda</h5>
        <div class="lg"><span class="sw" style="background:#38bdf8;border-color:#38bdf8"></span>Warna marker: kategori</div>
        <div class="lg"><span class="sw" style="background:#34d399;border-color:#34d399"></span>Sudah diawasi</div>
        <div class="lg"><span class="sw" style="background:#f97316;border-color:#f97316"></span>Belum diawasi</div>
      </div>
    `;

    btn.addEventListener('click', () => {
      const open = panel.classList.toggle('show');
      btn.setAttribute('aria-label', open ? 'Sembunyikan legenda' : 'Tampilkan legenda');
      btn.innerHTML = `<i class="fa-solid ${open ? 'fa-xmark' : 'fa-circle-info'}"></i>`;
    });

    return wrap;
  };
  legend.addTo(map);
}

Papa.parse(sheetUrl, {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: (results) => {
    parseSheet(results.data || []);
    populateCategorySelect();
    bindEvents();
    buildLegend();
    if (allData.length) {
      render();
      const bounds = allData.map((d) => [d.lat, d.lng]);
      const group = L.featureGroup(allData.map((d) => L.marker([d.lat, d.lng])));
      map.fitBounds(group.getBounds(), { padding: [40, 40] });
    } else {
      toast('Data koordinat tidak ditemukan di sheet. Pastikan kolom latitude/longitude sudah benar.', true, 6000);
    }
  },
  error: (err) => {
    console.error(err);
    toast('Gagal memuat data dari Google Sheet. Pastikan sheet sudah di-publish ke web dan CSV bisa diakses.', true, 8000);
  }
});

if (window.innerWidth <= 768) {
  $('sidebar').classList.remove('open');
}

render();
