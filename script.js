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

const SHEET_ID = '19XvPDOvnKFobzk45LnqKwvbeAMoxT0N3ob0cLqYPT4k';
const GID = '0';
const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

const map = L.map('map').setView([-6.2, 106.8], 11);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
});

osm.addTo(map);

const baseMaps = {
  'OpenStreetMap': osm,
  'Satelit (Esri)': esriSat
};

L.control.layers(baseMaps).addTo(map);

const markersCluster = L.markerClusterGroup();
let allData = [];

function processRows(rows) {
  allData = [];

  rows.forEach((row, idx) => {
    const latRaw = firstDefined(row, ['LAT', 'Lat', 'lat', 'latitude', 'Latitude']);
    const lngRaw = firstDefined(row, ['LONG', 'Long', 'long', 'longitude', 'Longitude']);
    const name = firstDefined(row, ['PELAKU USAHA', 'PELAKU_USAHA', 'pelaku_usaha', 'NAMA', 'nama', 'name']) || `Lokasi ${idx + 1}`;
    const addr = firstDefined(row, ['LOKASI', 'lokasi', 'ALAMAT', 'alamat', 'address']) || '';
    const category = firstDefined(row, ['UPT PSDKP', 'UPT_PSDKP', 'UPT', 'upt']) || '';
    const status = normalizeStatus(firstDefined(row, ['TL PENGAWASAN', 'TL_PENGAWASAN', 'TL pengawasan', 'TL_pengawasan', 'TL']));

    const lat = parseNumberFlexible(latRaw);
    const lng = parseNumberFlexible(lngRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    allData.push({
      lat,
      lng,
      name,
      addr,
      category,
      status,
      raw: row
    });
  });
}

function renderMarkers(filterText = '', filterCategory = '') {
  markersCluster.clearLayers();

  const ft = (filterText || '').toLowerCase().trim();
  const fc = (filterCategory || '').toLowerCase().trim();
  const bounds = [];

  allData.forEach((d) => {
    const matchesText = !ft || (d.name && d.name.toLowerCase().includes(ft)) || (d.addr && d.addr.toLowerCase().includes(ft));
    const matchesCat = !fc || (d.category && d.category.toLowerCase() === fc);

    if (matchesText && matchesCat) {
      const popup = `
        <strong>${escapeHtml(d.name)}</strong><br/>
        ${escapeHtml(d.addr)}
        ${d.category ? '<br/><em>' + escapeHtml(d.category) + '</em>' : ''}
        ${d.status ? '<br/>TL Pengawasan: ' + escapeHtml(d.status) : ''}
      `;

      const m = L.marker([d.lat, d.lng]);
      m.bindPopup(popup);
      markersCluster.addLayer(m);
      bounds.push([d.lat, d.lng]);
    }
  });

  map.addLayer(markersCluster);

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

function populateCategorySelect() {
  const sel = $('categorySelect');
  sel.innerHTML = '<option value="">Semua Kategori</option>';

  const cats = Array.from(new Set(
    allData.map(d => (d.category || '').trim()).filter(Boolean)
  )).sort();

  cats.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

$('applyBtn').addEventListener('click', () => {
  const txt = $('searchText').value;
  const cat = $('categorySelect').value;
  renderMarkers(txt, cat);
});

$('resetBtn').addEventListener('click', () => {
  $('searchText').value = '';
  $('categorySelect').value = '';
  renderMarkers();

  if (allData.length) {
    const bounds = allData.map(d => [d.lat, d.lng]);
    map.fitBounds(bounds, { padding: [30, 30] });
  }
});

Papa.parse(sheetUrl, {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    console.log('CSV fields:', results.meta.fields);
    console.log('First row:', results.data[0]);

    const rows = results.data || [];
    processRows(rows);
    populateCategorySelect();
    renderMarkers();

    if (allData.length) {
      const bounds = allData.map(d => [d.lat, d.lng]);
      map.fitBounds(bounds, { padding: [30, 30] });
    } else {
      console.warn('Tidak ada koordinat valid ditemukan. Cek header LONG/LAT serta publish CSV.');
    }
  },
  error: function(err) {
    console.error('Gagal memuat sheet:', err);
    alert('Gagal memuat data. Pastikan sheet sudah di-publish (File → Publish to web) dan SHEET_ID/GID benar.');
  }
});
