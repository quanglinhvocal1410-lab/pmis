/**
 * =====================================================================
 * PMIS VUDP-HCM — Google Apps Script API Đọc & Ghi Dữ Liệu 2 Chiều
 * =====================================================================
 * Backend chạy trực tiếp trên bảng tính Google Sheet Star Schema:
 * https://docs.google.com/spreadsheets/d/1Qij6W36SuuxSYGFSzhNUwgy_vpJCQjlxWlwuhTpGxMw
 *
 * TÍNH NĂNG CHÍNH:
 *  1. Tự động nhận diện cấu trúc bảng Star Schema (Row 4: Tiêu đề cột PascalCase,
 *     Row 5: Khai báo kiểu dữ liệu, Row 6+: Dữ liệu thực tế).
 *  2. Đồng bộ 2 chiều (Đọc toàn bộ 27 sheet qua 1 request / Ghi thêm, sửa, xoá từng dòng).
 *  3. Tự sinh mã định danh (Auto ID) thông minh theo tiền tố chuẩn (PKG-, HD-, FPR-, PAY-, TSK-...).
 *  4. Cơ chế khoá LockService chống xung đột khi nhiều người ghi cùng lúc.
 *  5. Tự động đóng dấu phiên bản (onChange Trigger) để webapp phát hiện thay đổi tức thì.
 *  6. Server-side Caching (CacheService) giúp phản hồi bootstrap siêu tốc (< 300ms).
 *
 * CÁCH CÀI ĐẶT LÊN GOOGLE SHEETS:
 *  1. Mở bảng tính Google Sheets → Chọn menu "Tiện ích mở rộng" (Extensions) → "Apps Script".
 *  2. Dán toàn bộ nội dung file này vào `Code.gs` (thay thế mã cũ) và bấm nút Lưu (Ctrl+S).
 *  3. Bấm "Triển khai" (Deploy) → "Tuỳ chọn triển khai mới" (New deployment).
 *  4. Chọn loại: "Ứng dụng web" (Web app).
 *       · Mô tả: PMIS API Star Schema v2.0
 *       · Thực thi dưới dạng (Execute as): Tôi (Me / your email)
 *       · Ai có quyền truy cập (Who has access): Bất kỳ ai (Anyone)
 *  5. Bấm "Triển khai" (Deploy) và cấp quyền truy cập nếu Google yêu cầu.
 *  6. Sao chép URL Web App (kết thúc bằng `/exec`), mở WebApp PMIS tại trang "Cấu hình"
 *     và dán vào ô "URL Google Apps Script" → Bấm "Kiểm tra kết nối".
 * =====================================================================
 */

/** Danh sách các sheet không phải bảng dữ liệu nghiệp vụ (bỏ qua khi xử lý). */
var SKIP_SHEETS = ['_TEMP', 'GUIDE', 'HUONG_DAN', 'GHI_CHU'];

// ---------------------------------------------------------------------
// MENU TIỆN ÍCH TRÊN GOOGLE SHEETS
// ---------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 PMIS Quản Lý')
    .addItem('🔍 Kiểm tra cấu trúc bảng & Dữ liệu', 'showMeta')
    .addSeparator()
    .addItem('⚡ Bật tự động đồng bộ sang WebApp', 'installSyncTrigger')
    .addItem('⏸ Tắt tự động đồng bộ', 'removeSyncTrigger')
    .addSeparator()
    .addItem('🗑 Xoá sạch dữ liệu các bảng Fact_* (Nhập lại từ đầu)', 'clearFactData')
    .addToUi();
}

/**
 * Xoá sạch dữ liệu Fact_* để nhập mới (chỉ chạy từ menu Google Sheet để an toàn, có Ctrl+Z).
 */
function clearFactData() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = factSheets_(ss);
  if (!sheets.length) {
    ui.alert('Không tìm thấy bảng nào có tiền tố Fact_.');
    return;
  }
  var names = sheets.map(function (sh) {
    var layout = sheetLayout_(sh);
    var rowCount = Math.max(0, sh.getLastRow() - layout.firstDataRow + 1);
    return '· ' + sh.getName() + ' (' + rowCount + ' dòng dữ liệu)';
  }).join('\n');

  var answer = ui.alert(
    'Xác nhận xoá dữ liệu Fact',
    'Thao tác này sẽ xoá dữ liệu phát sinh của các bảng:\n\n' + names +
    '\n\nToàn bộ tiêu đề cột, định dạng và các bảng danh mục Dim_* được GIỮ NGUYÊN.\n' +
    'Nếu lỡ bấm nhầm, bạn có thể nhấn Ctrl+Z ngay trên Google Sheet để hoàn tác.\n\nBạn có muốn tiếp tục?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  var result = clearFacts_(ss);
  ui.alert('Đã xoá ' + result.rows + ' dòng dữ liệu ở ' + result.tables + ' bảng Fact.\n\nBây giờ bạn có thể nhập liệu mới từ WebApp!');
}

function factSheets_(ss) {
  return dataSheets_(ss).filter(function (sh) {
    return sh.getName().indexOf('Fact_') === 0;
  });
}

function clearFacts_(ss) {
  var rows = 0, tables = 0;
  factSheets_(ss).forEach(function (sh) {
    rows += clearSheetData_(sh);
    tables++;
  });
  touchRev_();
  return { rows: rows, tables: tables };
}

/** Xoá nội dung từ dòng dữ liệu đầu tiên trở xuống, bảo vệ hàng 1-5 (tiêu đề, ghi chú, kiểu cột). */
function clearSheetData_(sheet) {
  var layout = sheetLayout_(sheet);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < layout.firstDataRow || lastCol < 1) return 0;
  
  var rowsToDelete = lastRow - layout.firstDataRow + 1;
  try {
    sheet.getRange(layout.firstDataRow, 1, rowsToDelete, lastCol).clearContent();
  } catch (err) {
    for (var c = 1; c <= lastCol; c++) {
      try { sheet.getRange(layout.firstDataRow, c, rowsToDelete, 1).clearContent(); } catch (e) {}
    }
  }
  return rowsToDelete;
}

function showMeta() {
  var m = metaInfo_(SpreadsheetApp.getActiveSpreadsheet());
  var lines = m.tables.map(function (t) {
    return t.name + ': ' + t.rows + ' dòng (Header hàng ' + t.headerRow + ', Khoá: ' + t.idField + ')';
  });
  lines.push('');
  lines.push('Tự động đồng bộ: ' + (hasSyncTrigger_() ? 'ĐANG BẬT ✅' : 'Đang tắt ⏸'));
  SpreadsheetApp.getUi().alert('Cấu Trúc Bảng Dữ Liệu PMIS', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---------------------------------------------------------------------
// TỰ ĐỘNG ĐỒNG BỘ GOOGLE SHEETS → WEBAPP (TRIGGER ONCHANGE)
// ---------------------------------------------------------------------
var REV_KEY = 'PMIS_REV_V2';

function pmisOnChange(e) {
  PropertiesService.getScriptProperties()
    .setProperty(REV_KEY, String(Date.now()) + ':' + ((e && e.changeType) || 'EDIT'));
}

function hasSyncTrigger_() {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'pmisOnChange';
  });
}

function installSyncTrigger() {
  if (hasSyncTrigger_()) return { installed: true, created: false };
  ScriptApp.newTrigger('pmisOnChange')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();
  pmisOnChange({ changeType: 'INSTALL' });
  return { installed: true, created: true };
}

function removeSyncTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pmisOnChange') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return { installed: false, removed: removed };
}

function revInfo_(ss) {
  var stamp = PropertiesService.getScriptProperties().getProperty(REV_KEY) || '';
  var shape = dataSheets_(ss).map(function (sh) {
    return sh.getName() + ':' + sh.getLastRow() + 'x' + sh.getLastColumn();
  }).join(',');
  var auto = false;
  try { auto = hasSyncTrigger_(); } catch (err) {}
  return {
    rev: stamp + '|' + shape,
    stamp: stamp,
    autoSync: auto,
    time: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------
// HTTP CONTROLLERS (doGet / doPost)
// ---------------------------------------------------------------------
function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ status: 'error', message: 'Body không phải JSON hợp lệ: ' + String(err) });
  }
  if (e && e.parameter && e.parameter.token && !body.token) body.token = e.parameter.token;
  return handle_(body);
}

function handle_(p) {
  try {
    checkToken_(p.token);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = p.action || 'bootstrap';

    switch (action) {
      case 'ping':
        return json_({ status: 'success', data: { ok: true, name: ss.getName(), time: new Date().toISOString() } });
      case 'meta':
        return json_({ status: 'success', data: metaInfo_(ss) });
      case 'rev':
        return json_({ status: 'success', data: revInfo_(ss) });
      case 'installTrigger':
        return json_({ status: 'success', data: installSyncTrigger() });
      case 'removeTrigger':
        return json_({ status: 'success', data: removeSyncTrigger() });
      case 'bootstrap':
        return json_({ status: 'success', data: bootstrap_(ss) });
      case 'list':
        return json_({ status: 'success', data: readTable_(ss, requireTable_(ss, p.table)) });
      case 'create':
        return json_({ status: 'success', data: createRow_(ss, requireTable_(ss, p.table), p.row) });
      case 'update':
        return json_({ status: 'success', data: updateRow_(ss, requireTable_(ss, p.table), p.row) });
      case 'delete':
        return json_({ status: 'success', data: deleteRow_(ss, requireTable_(ss, p.table), p.id) });
      case 'bulkUpsert':
        return json_({ status: 'success', data: bulkUpsert_(ss, requireTable_(ss, p.table), p.rows || []) });
      default:
        return json_({ status: 'error', message: 'Action không hợp lệ: ' + action });
    }
  } catch (err) {
    return json_({ status: 'error', message: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (expected && token !== expected) throw new Error('Mã API_TOKEN không chính xác.');
}

function requireTable_(ss, table) {
  if (!table) throw new Error('Thiếu tham số tên bảng `table`');
  if (!ss.getSheetByName(table)) throw new Error('Không tìm thấy bảng trong Google Sheets: ' + table);
  return table;
}

// ---------------------------------------------------------------------
// CƠ CHẾ NHẬN DIỆN CẤU TRÚC BẢNG STAR SCHEMA
// ---------------------------------------------------------------------

function dataSheets_(ss) {
  return ss.getSheets().filter(function (sh) {
    var n = sh.getName();
    var upper = n.toUpperCase();
    return n.charAt(0) !== '_' && SKIP_SHEETS.indexOf(upper) === -1 && sh.getLastColumn() > 0;
  });
}

/**
 * Tự động tìm vị trí hàng tiêu đề (Headers) và hàng dữ liệu đầu tiên (FirstDataRow):
 * - Bảng Star Schema mới: Hàng 4 là Header (IDDuAn, MaDuAn, TenDuAn...), Hàng 5 là Type, Hàng 6+ là Data.
 * - Bảng truyền thống: Hàng 1 là Header, Hàng 2+ là Data.
 */
function sheetLayout_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return { headerRow: 1, firstDataRow: 2, lastCol: 0, headers: [], idField: '' };
  }

  var maxSearchRows = Math.min(8, lastRow);
  var sampleValues = sheet.getRange(1, 1, maxSearchRows, lastCol).getValues();

  var headerRow = 1;
  var firstDataRow = 2;

  for (var r = 0; r < sampleValues.length; r++) {
    var row = sampleValues[r];
    var firstCell = String(row[0] || '').trim();
    
    // Tuyệt đối bỏ qua dòng rỗng, dòng ghi chú PK/FK/PFK, dòng tiêu đề mô tả bảng
    if (!firstCell || firstCell === 'PK' || firstCell === 'FK' || firstCell === 'PFK') continue;
    if (firstCell.indexOf('—') !== -1 || firstCell.indexOf('(') !== -1 || /^BẢNG|^DANH MỤC|^MÔ HÌNH|^ERD/i.test(firstCell)) continue;

    // Đếm số cột có tên thuộc tính hợp lệ (PascalCase / snake_case)
    var validHeaderCount = 0;
    for (var c = 0; c < row.length; c++) {
      var cellVal = String(row[c] || '').trim();
      if (/^[A-Za-z][A-Za-z0-9_]{1,50}$/.test(cellVal) && cellVal !== 'PK' && cellVal !== 'FK' && cellVal !== 'PFK') {
        validHeaderCount++;
      }
    }

    // Nếu cột 1 bắt đầu bằng ID/Ma/So/STT hoặc có từ 3 cột tên biến chuẩn trở lên
    if ((/^(ID[A-Z]|Ma[A-Z]|So[A-Z]|STT|Ten[A-Z]|ID_|Ma_|So_)/.test(firstCell) && validHeaderCount >= 2) || validHeaderCount >= 4) {
      headerRow = r + 1; // 1-indexed
      break;
    }
  }

  // Thu thập danh sách tên cột thật từ hàng headerRow
  var headerCells = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var headers = [];
  var actualColCount = 0;
  for (var i = 0; i < headerCells.length; i++) {
    var h = String(headerCells[i] || '').trim();
    if (h && h !== 'PK' && h !== 'FK' && h !== 'PFK' && !h.startsWith('Col_')) {
      headers.push(h);
      actualColCount = i + 1;
    } else if (actualColCount > 0 && i < actualColCount) {
      headers.push('Col_' + (i + 1));
    }
  }

  if (actualColCount > 0 && headers.length > actualColCount) {
    headers = headers.slice(0, actualColCount);
  }

  // Kiểm tra nếu dòng kế tiếp là dòng khai báo kiểu dữ liệu (TEXT PK, MONEY_VND, DATE, VARCHAR...)
  if (headerRow < lastRow) {
    var nextRow = sampleValues[headerRow] || [];
    var typeMatches = 0;
    for (var c = 0; c < Math.min(nextRow.length, headers.length); c++) {
      var v = String(nextRow[c] || '').trim().toUpperCase();
      if (/^(TEXT|VARCHAR|INT|BIGINT|MONEY|DATE|PERCENT|DECIMAL|BOOLEAN|ENUM|JSON|URL)/.test(v) || v.indexOf('PK') !== -1 || v.indexOf('FK') !== -1) {
        typeMatches++;
      }
    }
    if (typeMatches >= 2) {
      firstDataRow = headerRow + 2; // Bỏ qua dòng kiểu dữ liệu
    } else {
      firstDataRow = headerRow + 1;
    }
  } else {
    firstDataRow = headerRow + 1;
  }

  var idField = headers[0] || '';

  return {
    headerRow: headerRow,
    firstDataRow: firstDataRow,
    lastCol: headers.length || lastCol,
    headers: headers,
    idField: idField
  };
}

function fmtDate_(d, tz) {
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

/**
 * Đọc bảng thành danh sách Object JSON chuẩn hoá.
 */
function readTable_(ss, table) {
  var sheet = ss.getSheetByName(table);
  if (!sheet) return [];
  var layout = sheetLayout_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < layout.firstDataRow || !layout.headers.length) return [];

  var numRows = lastRow - layout.firstDataRow + 1;
  var values = sheet.getRange(layout.firstDataRow, 1, numRows, layout.headers.length).getValues();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var out = [];

  for (var i = 0; i < values.length; i++) {
    var obj = {}, hasData = false;
    for (var j = 0; j < layout.headers.length; j++) {
      var key = layout.headers[j];
      if (!key) continue;
      var v = values[i][j];
      if (v instanceof Date) v = fmtDate_(v, tz);
      else if (typeof v === 'number') { /* Giữ nguyên định dạng số */ }
      else if (v === null || v === undefined) v = '';
      else v = String(v).trim();
      obj[key] = v;
      if (v !== '') hasData = true;
    }
    if (hasData) {
      obj.__row = i + layout.firstDataRow;
      out.push(obj);
    }
  }
  return out;
}

function metaInfo_(ss) {
  var tables = dataSheets_(ss).map(function (sh) {
    var layout = sheetLayout_(sh);
    var rowCount = Math.max(0, sh.getLastRow() - layout.firstDataRow + 1);
    return {
      name: sh.getName(),
      headerRow: layout.headerRow,
      firstDataRow: layout.firstDataRow,
      idField: layout.idField,
      headers: layout.headers,
      rows: rowCount
    };
  });
  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    name: ss.getName(),
    tables: tables,
    time: new Date().toISOString()
  };
}

var BOOT_CACHE_KEY = 'PMIS_BOOT_STAR_SCHEMA_V2';

/**
 * Tải toàn bộ 27 sheet trong 1 lần gọi, tích hợp bộ nhớ đệm CacheService.
 */
function bootstrap_(ss) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(BOOT_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  var meta = metaInfo_(ss);
  var tables = {};
  meta.tables.forEach(function (t) {
    var rows = readTable_(ss, t.name);
    tables[t.name] = rows;
    t.rows = rows.length;
  });

  var result = {
    source: 'live',
    spreadsheetId: meta.spreadsheetId,
    spreadsheetUrl: meta.spreadsheetUrl,
    generatedAt: new Date().toISOString(),
    meta: meta.tables,
    tables: tables
  };

  try {
    cache.put(BOOT_CACHE_KEY, JSON.stringify(result), 300); // Lưu cache 5 phút
  } catch (err) {}

  return result;
}

// ---------------------------------------------------------------------
// CƠ CHẾ GHI DỮ LIỆU (CREATE / UPDATE / DELETE / BULK UPSERT)
// ---------------------------------------------------------------------

function touchRev_() {
  try {
    CacheService.getScriptCache().remove(BOOT_CACHE_KEY);
  } catch (e) {}
  try {
    PropertiesService.getScriptProperties().setProperty(REV_KEY, String(Date.now()) + ':API');
  } catch (err) {}
}

/**
 * Tự động tạo ID kế tiếp theo tiền tố thông minh của bảng.
 */
function nextId_(sheet, layout) {
  var lastRow = sheet.getLastRow();
  var defaultPrefixes = {
    Dim_DuAn: 'PRJ-',
    Dim_GoiThau: 'PKG-CW',
    Dim_HopDong: 'HD-2024-',
    Dim_NhaThau: 'CTR-',
    Dim_TuVan: 'CON-',
    Dim_HoSo: 'DOC-',
    Dim_BOQ: 'BOQ-',
    Dim_HoatDong: 'ACT-',
    Dim_DieuKhoan: 'CLS-',
    Dim_CongViec: 'TSK-',
    Dim_TrangThai: 'ST-',
    Dim_RuiRo: 'RSK-',
    Fact_TienDo: 'FPR-',
    Fact_ThanhToan: 'PAY-',
    Fact_GiaiNgan: 'DIS-',
    Fact_NganSach: 'BDG-',
    Fact_EVM: 'EVM-',
    Fact_CongViec: 'EVT-TSK-',
    Fact_HopDong_Event: 'EVT-HD-',
    Fact_PhatSinh: 'VAR-',
    Fact_RuiRo: 'EVT-RSK-',
    Fact_TrangThai_HoSo: 'EVT-DOC-'
  };

  var tableName = sheet.getName();
  var defPrefix = defaultPrefixes[tableName] || (tableName.replace(/^(Dim_|Fact_)/, '').substring(0, 3).toUpperCase() + '-');

  if (lastRow < layout.firstDataRow) return defPrefix + '001';

  var idCol = layout.headers.indexOf(layout.idField);
  if (idCol === -1) idCol = 0;

  var numRows = lastRow - layout.firstDataRow + 1;
  var ids = sheet.getRange(layout.firstDataRow, idCol + 1, numRows, 1).getValues();

  var prefix = defPrefix, width = 3, max = 0;
  for (var i = 0; i < ids.length; i++) {
    var raw = String(ids[i][0] || '').trim();
    if (!raw) continue;
    var m = /^(.*?)(\d+)$/.exec(raw);
    if (!m) continue;
    prefix = m[1];
    width = Math.max(width, m[2].length);
    max = Math.max(max, Number(m[2]));
  }

  var next = String(max + 1);
  while (next.length < width) next = '0' + next;
  return prefix + next;
}

/**
 * Chuyển đổi kiểu dữ liệu tương thích với Google Sheets.
 */
function coerce_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') {
    var trimmed = v.trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(trimmed);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return v;
}

function rowToLine_(headers, row, current) {
  return headers.map(function (h, idx) {
    if (Object.prototype.hasOwnProperty.call(row, h)) return coerce_(row[h]);
    return current ? current[idx] : '';
  });
}

function writeLine_(sheet, rowIndex, headers, line) {
  try {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([line]);
    return [];
  } catch (err) {
    var skipped = [];
    for (var i = 0; i < headers.length; i++) {
      try {
        sheet.getRange(rowIndex, i + 1).setValue(line[i]);
      } catch (e2) {
        skipped.push(headers[i] || ('Cột ' + (i + 1)));
      }
    }
    if (skipped.length === headers.length) throw err;
    return skipped;
  }
}

function findRowIndex_(sheet, layout, id) {
  var idCol = layout.headers.indexOf(layout.idField);
  var lastRow = sheet.getLastRow();
  if (idCol === -1 || lastRow < layout.firstDataRow) return -1;

  var numRows = lastRow - layout.firstDataRow + 1;
  var ids = sheet.getRange(layout.firstDataRow, idCol + 1, numRows, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id).trim()) {
      return i + layout.firstDataRow;
    }
  }
  return -1;
}

function firstEmptyRow_(sheet, layout) {
  var lastRow = sheet.getLastRow();
  if (lastRow < layout.firstDataRow) return layout.firstDataRow;

  var numRows = lastRow - layout.firstDataRow + 1;
  var values = sheet.getRange(layout.firstDataRow, 1, numRows, layout.headers.length).getValues();
  for (var i = 0; i < values.length; i++) {
    var empty = values[i].every(function (v) { return v === '' || v === null; });
    if (empty) return i + layout.firstDataRow;
  }
  return lastRow + 1;
}

function createRow_(ss, table, row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sheet = ss.getSheetByName(table);
    var layout = sheetLayout_(sheet);
    row = row || {};
    if (!row[layout.idField]) row[layout.idField] = nextId_(sheet, layout);

    if (findRowIndex_(sheet, layout, row[layout.idField]) !== -1) {
      throw new Error('Đã tồn tại bản ghi với ' + layout.idField + ' = ' + row[layout.idField]);
    }

    var target = firstEmptyRow_(sheet, layout);
    row.__skipped = writeLine_(sheet, target, layout.headers, rowToLine_(layout.headers, row, null));
    row.__row = target;
    touchRev_();
    return row;
  } finally {
    lock.releaseLock();
  }
}

function updateRow_(ss, table, row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sheet = ss.getSheetByName(table);
    var layout = sheetLayout_(sheet);
    if (!row || !row[layout.idField]) throw new Error('Thiếu khoá chính ' + layout.idField + ' để cập nhật');

    var target = findRowIndex_(sheet, layout, row[layout.idField]);
    if (target === -1) {
      lock.releaseLock();
      return createRow_(ss, table, row);
    }

    var current = sheet.getRange(target, 1, 1, layout.headers.length).getValues()[0];
    row.__skipped = writeLine_(sheet, target, layout.headers, rowToLine_(layout.headers, row, current));
    row.__row = target;
    touchRev_();
    return row;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function deleteRow_(ss, table, id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sheet = ss.getSheetByName(table);
    var layout = sheetLayout_(sheet);
    var target = findRowIndex_(sheet, layout, id);
    if (target === -1) return { deleted: 0, id: id };

    var skipped = writeLine_(sheet, target, layout.headers, layout.headers.map(function () { return ''; }));
    touchRev_();
    return { deleted: 1, id: id, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function bulkUpsert_(ss, table, rows) {
  var lock = LockService.getScriptLock();
  lock.waitLock(35000);
  try {
    var sheet = ss.getSheetByName(table);
    var layout = sheetLayout_(sheet);
    var created = 0, updated = 0;
    var skipped = {};

    rows.forEach(function (r) {
      if (!r[layout.idField]) r[layout.idField] = nextId_(sheet, layout);
      var target = findRowIndex_(sheet, layout, r[layout.idField]);
      var out;
      if (target === -1) {
        target = firstEmptyRow_(sheet, layout);
        out = writeLine_(sheet, target, layout.headers, rowToLine_(layout.headers, r, null));
        created++;
      } else {
        var current = sheet.getRange(target, 1, 1, layout.headers.length).getValues()[0];
        out = writeLine_(sheet, target, layout.headers, rowToLine_(layout.headers, r, current));
        updated++;
      }
      out.forEach(function (c) { skipped[c] = true; });
    });

    touchRev_();
    return { table: table, created: created, updated: updated, skipped: Object.keys(skipped) };
  } finally {
    lock.releaseLock();
  }
}
