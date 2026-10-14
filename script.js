// helper: terima format desimal dengan titik atau koma
function parseNumberFlexible(raw) {
  if (raw === undefined || raw === null) return NaN;
  // hilangkan spasi, ganti koma dengan titik
  const s = String(raw).trim().replace(/\s+/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// baca sheet dan buat allData
function parseSheet(rows) {
  allData = [];
  rows.forEach((row, idx) => {
    // Prioritas nama kolom untuk longitude / latitude
    const longRaw = firstDefined(row, ['LONG']);
    const latRaw  = firstDefined(row, ['LAT']);

    // Kategori dari kolom UPT
    const categoryRaw = firstDefined(row, ['UPT PSDKP']);

    // Status dari kolom TL pengawasan (beberapa variasi nama umum)
    const statusRaw = firstDefined(row, ['TL Pengawasan']);

    const name = firstDefined(row, ['name', 'nama', 'Name', 'NAMA', 'PELAKU USAHA']) || `Lokasi ${idx + 1}`;
    const addr = firstDefined(row, ['LOKASI']) || '';

    const lng = parseNumberFlexible(longRaw);
    const lat = parseNumberFlexible(latRaw);

    // jika koordinat tidak valid, skip
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const status = normalizeStatusExtended(statusRaw); // fungsi normalize yang menangani kata 'sudah'/'belum' atau kembalikan teks as-is

    allData.push({
      _id: idx,
      lat,
      lng,
      name,
      addr,
      category: String(categoryRaw || '').trim(),
      status: String(status || '').trim(),
      raw: row,
      _hay: `${name} ${addr} ${categoryRaw || ''} ${status || ''}`.toLowerCase()
    });
  });
}

// makeMarker: tampilkan UPT dan TL pengawasan di popup
function makeMarker(d) {
  const ring = (d.status && d.status.toLowerCase().includes('Sudah Penetapan Sanksi')) ? '#34d399'
             : (d.status && d.status.toLowerCase().includes('Masih Proses Pengawasan')) ? '#f97316'
             : (d.status && d.status.toLowerCase().includes('Belum Diawasi')) ? '#38bdf8';
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
        ${d.category ? `<p><strong>UPT:</strong> ${esc(d.category)}</p>` : ''}
        ${d.status ? `<p><strong>TL pengawasan:</strong> ${esc(d.status)}</p>` : ''}
        <p><strong>Koordinat:</strong> ${d.lat}, ${d.lng}</p>
      </div>
    </div>
  `);

  return m;
}
