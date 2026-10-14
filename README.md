# Koordinat_Pelaku_Usaha_PRL<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>WebGIS - Pelaku Usaha (Google Sheets)</title>

  <!-- Leaflet CSS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha512-some-placeholder" crossorigin=""/>
  <!-- MarkerCluster CSS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />

  <style>
    html,body { height:100%; margin:0; padding:0; font-family: sans-serif; }
    #map { height:100vh; }
    .controls {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 1000;
      background: rgba(255,255,255,0.95);
      padding: 8px;
      border-radius: 6px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      min-width: 220px;
    }
    .controls input, .controls select, .controls button { width: 100%; margin:4px 0; padding:6px; box-sizing: border-box; }
    .small { font-size: 0.9rem; color:#444; margin-top:6px; }
  </style>
</head>
<body>
  <div class="controls" id="controls">
    <strong>Filter / Pencarian</strong>
    <input id="searchText" placeholder="Cari nama atau alamat..." />
    <select id="categorySelect">
      <option value="">Semua Kategori</option>
    </select>
    <button id="applyBtn">Terapkan</button>
    <button id="resetBtn">Reset & Zoom</button>
    <div class="small">Pastikan sheet sudah di-publish (File → Publish to web → CSV)</div>
  </div>

  <div id="map"></div>

  <!-- Leaflet JS -->
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha512-some-placeholder" crossorigin=""></script>
  <!-- PapaParse for CSV parsing -->
  <script src="https://unpkg.com/papaparse@5.4.1/papaparse.min.js"></script>
  <!-- MarkerCluster -->
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>

  <script>
    // ===========================
    // Konfigurasi: ganti jika perlu
    // ===========================
    const SHEET_ID = "[19XvPDOvnKFobzk45LnqKwvbeAMoxT0N3ob0cLqYPT4k](https://docs.google.com/spreadsheets/d/e/2PACX-1vTkdUqSjD_NDRg5E9m0xKlPn2K7VkmWtyqa5_aK_0C9xF2lZto5PPelZeRml304hRbd4zlZbHtLeahH/pub?gid=0&single=true&output=csv)";
    const GID = "0"; // dari URL sheet Anda (#gid=0)
    // URL export CSV publik (butuh Publish to web)
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

    // Inisialisasi peta
    const map = L.map('map').setView([-6.2, 106.8], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const markersCluster = L.markerClusterGroup();
    let allData = []; // array objek: {lat,lng,name,addr,phone,category,raw}
    let markerRefs = []; // untuk referensi marker per data index

    // Ambil CSV dan parse
    Papa.parse(sheetUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        const rows = results.data || [];
        processRows(rows);
        populateCategorySelect();
        renderMarkers();
        if (allData.length) {
          const bounds = allData.map(d => [d.lat, d.lng]);
          map.fitBounds(bounds, {padding: [40,40]});
        } else {
          console.warn('Tidak ada koordinat valid ditemukan.');
        }
      },
      error: function(err) {
        console.error('Gagal memuat sheet:', err);
        alert('Gagal memuat data. Pastikan sheet sudah di-publish (File → Publish to web) dan SHEET_ID/GID benar.');
      }
    });

    // Proses baris fleksibel: deteksi nama kolom umum
    function processRows(rows) {
      allData = [];
      rows.forEach((row, idx) => {
        const name = row.name || row.nama || row.NAMA || row.Name || '';
        const latRaw = row.latitude || row.lat || row.Latitude || row.Lat || row.LAT;
        const lngRaw = row.longitude || row.lon || row.lng || row.Longitude || row.Lon || row.LNG;
        const addr = row.address || row.alamat || row.Alamat || '';
        const phone = row.phone || row.telepon || row.nohp || row.telp || '';
        const category = row.category || row.kategori || row.tipe || row.type || '';

        const lat = parseFloat((latRaw || '').toString().trim());
        const lng = parseFloat((lngRaw || '').toString().trim());

        if (!isNaN(lat) && !isNaN(lng)) {
          allData.push({
            lat, lng,
            name: name || ('Lokasi ' + (idx+1)),
            addr: addr || '',
            phone: phone || '',
            category: category || '',
            raw: row
          });
        }
      });
    }

    // Render markers berdasarkan filter saat ini
    function renderMarkers(filterText = '', filterCategory = '') {
      markersCluster.clearLayers();
      markerRefs = [];
      const ft = (filterText || '').toLowerCase().trim();
      const fc = (filterCategory || '').toLowerCase().trim();
      const bounds = [];

      allData.forEach((d, i) => {
        const matchesText = !ft || (d.name && d.name.toLowerCase().includes(ft)) || (d.addr && d.addr.toLowerCase().includes(ft));
        const matchesCat = !fc || (d.category && d.category.toLowerCase() === fc);
        if (matchesText && matchesCat) {
          const popup = `<strong>${escapeHtml(d.name)}</strong><br/>${escapeHtml(d.addr)}${d.phone ? '<br/>Tel: ' + escapeHtml(d.phone) : ''}${d.category ? '<br/><em>' + escapeHtml(d.category) + '</em>' : ''}`;
          const m = L.marker([d.lat, d.lng]);
          m.bindPopup(popup);
          markersCluster.addLayer(m);
          markerRefs.push(m);
          bounds.push([d.lat, d.lng]);
        }
      });

      map.addLayer(markersCluster);
      if (bounds.length) {
        map.fitBounds(bounds, {padding: [40,40]});
      }
    }

    // Isi pilihan kategori unik
    function populateCategorySelect() {
      const sel = document.getElementById('categorySelect');
      const cats = Array.from(new Set(allData.map(d => (d.category || '').trim()).filter(Boolean))).sort();
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
      });
    }

    // Kontrol UI
    document.getElementById('applyBtn').addEventListener('click', () => {
      const txt = document.getElementById('searchText').value;
      const cat = document.getElementById('categorySelect').value;
      renderMarkers(txt, cat);
    });
    document.getElementById('resetBtn').addEventListener('click', () => {
      document.getElementById('searchText').value = '';
      document.getElementById('categorySelect').value = '';
      renderMarkers();
      if (allData.length) {
        const bounds = allData.map(d => [d.lat, d.lng]);
        map.fitBounds(bounds, {padding: [40,40]});
      }
    });

    // Escape untuk popup
    function escapeHtml(text) {
      if (!text) return '';
      return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  </script>
</body>
</html>
