const normalizeStatusExtended = (v) => {
  const s = String(v || '').trim();
  const low = s.toLowerCase();
  if (!s) return '';
  if (low.includes('sudah')) return 'Sudah diawasi';
  if (low.includes('belum')) return 'Belum diawasi';
  return s;
};

function parseNumberFlexible(raw) {
  if (raw === undefined || raw === null) return NaN;
  const s = String(raw).trim().replace(/\s+/g, '').replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseSheet(rows) {
  allData = [];
  rows.forEach((row, idx) => {
    const longRaw = firstDefined(row, ['LONG','Long','long','longitude','Longitude','lon','LON']);
    const latRaw  = firstDefined(row, ['LAT','Lat','lat','latitude','Latitude']);

    const categoryRaw = firstDefined(row, ['UPT PSDKP','UPT_PSDKP','UPT','upt']);
    const statusRaw   = firstDefined(row, ['TL PENGAWASAN','TL_PENGAWASAN','TL pengawasan','TL_pengawasan','TL']);

    const name = firstDefined(row, ['PELAKU USAHA','PELAKU_USAHA','pelaku_usaha','name','nama']) || `Lokasi ${idx + 1}`;
    const addr = firstDefined(row, ['LOKASI','lokasi','address','alamat']) || '';

    const lng = parseNumberFlexible(longRaw);
    const lat = parseNumberFlexible(latRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const status = normalizeStatusExtended(statusRaw);

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

function makeMarker(d) {
  const ring = (d.status && d.status.toLowerCase().includes('sudah')) ? '#34d399'
             : (d.status && d.status.toLowerCase().includes('belum')) ? '#f97316'
             : '#38bdf8';

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
        ${d.addr ? `<p><strong>Lokasi:</strong> ${esc(d.addr)}</p>` : ''}
        ${d.category ? `<p><strong>UPT PSDKP:</strong> ${esc(d.category)}</p>` : ''}
        ${d.status ? `<p><strong>TL pengawasan:</strong> ${esc(d.status)}</p>` : ''}
        <p><strong>Koordinat:</strong> ${d.lat}, ${d.lng}</p>
      </div>
    </div>
  `);

  return m;
}
