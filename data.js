async function loadSheetData() {
  const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTkdUqSjD_NDRg5E9m0xKlPn2K7VkmWtyqa5_aK_0C9xF2lZto5PPelZeRml304hRbd4zlZbHtLeahH/pub?gid=0&single=true&output=csv";
  
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error("Gagal mengambil data CSV dari Google Sheets");
    
    const csvText = await response.text();
    const rows = parseCSV(csvText);
    
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, ''));
    const parsedData = [];

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (cols.length === 0 || !cols.some(Boolean)) continue;

      let rowObj = {};
      headers.forEach((h, index) => {
        rowObj[h] = (cols[index] || "").trim();
      });

      const parseCoordStr = (str) => {
        if (!str) return 0;
        return parseFloat(str.replace(',', '.').replace(/[^0-9.-]/g, ''));
      };

      const latVal = parseCoordStr(rowObj.lat || rowObj.latitude);
      const lngVal = parseCoordStr(rowObj.long || rowObj.lng || rowObj.longitude);

      // Mengambil nilai status langsung dari kolom TL PENGAWASAN
      let statusVal = rowObj.tlpengawasan || rowObj.status || "Belum diawasi";

      parsedData.push({
        no: parseInt(rowObj.no || i, 10),
        nama: rowObj.pelakuusaha || rowObj.nama || "-",
        lokasi: rowObj.lokasi || "-",
        indikasi: (rowObj.indikasipelanggaran || rowObj.indikasi || "-").replace(/\\n/g, '\n'),
        upt: rowObj.uptpsdkp || rowObj.upt || "-",
        status: statusVal,
        kegiatan: rowObj.bentukkegiatan || rowObj.kegiatan || "-",
        lat: latVal,
        lng: lngVal
      });
    }

    return parsedData;
  } catch (error) {
    console.error("Error memuat Google Sheets:", error);
    if (typeof toast === 'function') {
      toast("Gagal memuat data dari Spreadsheet.", true, 6000);
    }
    return [];
  }
}

function parseCSV(text) {
  let p = '', row = [''], ret = [row], i = 0, s = true;
  for (let l of text) {
    if (l === '"') {
      if (s && l === p) row[row.length - 1] += '"';
      s = !s;
    } else if (l === ',' && s) {
      row.push(p = '');
    } else if ((l === '\r' || l === '\n') && s) {
      if (l === '\r' && text[i + 1] === '\n') {}
      else { row = [p = '']; ret.push(row); }
    } else {
      row[row.length - 1] += l;
    }
    p = l; i++;
  }
  return ret;
}
