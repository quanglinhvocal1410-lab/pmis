#!/usr/bin/env node
/**
 * Tải Google Sheet "PMIS_Data_Demo" về dạng XLSX rồi kết xuất ra
 * `pmis/web/data/snapshot.json` để webapp chạy được ở chế độ offline
 * (không cần triển khai Apps Script).
 *
 *   node pmis/tools/build-snapshot.js
 *   node pmis/tools/build-snapshot.js --id <SPREADSHEET_ID>
 *   node pmis/tools/build-snapshot.js --file duong/dan/toi/file.xlsx
 *   node pmis/tools/build-snapshot.js --empty-facts   (giữ Dim_*, bỏ mọi dòng Fact_*)
 *
 * Sheet phải được chia sẻ "Bất kỳ ai có đường liên kết" thì mới tải được.
 * Kiểu dữ liệu gốc (số / ngày / phần trăm) được giữ nguyên: ngày đổi sang
 * chuỗi ISO yyyy-MM-dd, số giữ nguyên number, ô trống thành ''.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_ID = '1Qij6W36SuuxSYGFSzhNUwgy_vpJCQjlxWlwuhTpGxMw';
const OUT = path.join(__dirname, '..', 'web', 'data', 'snapshot.json');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : null;
}

async function loadWorkbook() {
  const file = arg('file');
  if (file) {
    console.log('Đọc file cục bộ: ' + file);
    return XLSX.readFile(file, { cellDates: true });
  }
  const id = arg('id') || DEFAULT_ID;
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  console.log('Tải từ Google Sheets: ' + id);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(
      `Không tải được (HTTP ${res.status}). Kiểm tra quyền chia sẻ "Anyone with the link".`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.slice(0, 2).toString() !== 'PK') {
    throw new Error('Nội dung trả về không phải file XLSX — nhiều khả năng sheet chưa mở quyền xem.');
  }
  return XLSX.read(buf, { cellDates: true });
}

const p2 = (n) => String(n).padStart(2, '0');

/**
 * Ô ngày trong file XLSX do Google xuất ra được lưu lệch múi giờ (UTC),
 * nên đọc bằng getFullYear() cục bộ sẽ lùi 1 ngày. Ưu tiên chuỗi hiển thị
 * `w` (dd/MM/yyyy) vì đó đúng là giá trị người dùng thấy trên bảng tính.
 */
function dateCell(c) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(c.w || '').trim());
  if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  const d = c.v instanceof Date ? c.v : new Date(c.v);
  if (isNaN(d)) return String(c.w || '').trim();
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

function cellValue(c) {
  if (!c || c.v === undefined || c.v === null) return '';
  if (c.t === 'd') return dateCell(c);
  if (c.t === 'n') return c.v;
  if (c.t === 'b') return c.v ? 'TRUE' : '';
  return String(c.v).trim();
}

/** Đọc 1 worksheet thành { headers, rows } giữ nguyên kiểu số / ngày ISO. */
function readSheet(ws, sheetName = '') {
  if (!ws || !ws['!ref']) return { headers: [], rows: [] };
  const range = XLSX.utils.decode_range(ws['!ref']);
  const at = (r, c) => cellValue(ws[XLSX.utils.encode_cell({ r, c })]);

  // Tìm hàng chứa header: trong Star Schema của sheet mới, header nằm ở hàng 4 (r = 3)
  let headerR = range.s.r;
  for (let r = range.s.r; r <= Math.min(range.s.r + 5, range.e.r); r++) {
    const firstVal = String(at(r, range.s.c) || '').trim();
    if (/^(ID[A-Z]|STT|Ma[A-Z]|So[A-Z]|Ten[A-Z]|ID_|[A-Z][a-zA-Z0-9_]+$)/.test(firstVal) &&
        !firstVal.includes(' — ') &&
        !firstVal.startsWith('Dim_') &&
        !firstVal.startsWith('Fact_') &&
        firstVal !== 'PK' &&
        firstVal !== 'FK') {
      headerR = r;
      break;
    }
  }

  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const hName = String(at(headerR, c) || '').trim();
    if (hName) headers.push({ name: hName, col: c });
  }
  if (!headers.length) return { headers: [], rows: [] };

  // Nếu dòng ngay sau header là định nghĩa Type (TEXT PK, MONEY_VND, DATE...) thì bỏ qua
  let startDataR = headerR + 1;
  if (startDataR <= range.e.r) {
    const nextFirst = String(at(startDataR, headers[0].col) || '').trim();
    if (/^(TEXT|MONEY|DATE|INT|PERCENT|NUMBER|BOOL|URL)/i.test(nextFirst)) {
      startDataR++;
    }
  }

  const rows = [];
  for (let r = startDataR; r <= range.e.r; r++) {
    const obj = {};
    let hasData = false;
    for (const h of headers) {
      const v = at(r, h.col);
      obj[h.name] = v;
      if (v !== '') hasData = true;
    }
    if (hasData) rows.push(obj);
  }
  return { headers: headers.map((h) => h.name), rows };
}

(async () => {
  const wb = await loadWorkbook();
  const tables = {};
  const meta = [];

  const emptyFacts = process.argv.includes('--empty-facts');

  for (const name of wb.SheetNames) {
    const { headers, rows: read } = readSheet(wb.Sheets[name]);
    if (!headers.length) continue;
    // Giữ nguyên cấu trúc cột (webapp dựng biểu mẫu từ đó), chỉ bỏ các dòng
    const data = emptyFacts && name.startsWith('Fact_') ? [] : read;
    tables[name] = data;
    meta.push({ name, idField: headers[0], headers, rows: data.length });
    console.log(`  ${name.padEnd(16)} ${String(data.length).padStart(4)} dòng · khoá ${headers[0]}`);
  }

  const payload = {
    source: 'snapshot',
    spreadsheetId: arg('id') || DEFAULT_ID,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${arg('id') || DEFAULT_ID}/edit`,
    generatedAt: new Date().toISOString(),
    meta,
    tables
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log('\nĐã ghi ' + path.relative(process.cwd(), OUT));
})().catch((e) => {
  console.error('LỖI: ' + e.message);
  process.exit(1);
});
