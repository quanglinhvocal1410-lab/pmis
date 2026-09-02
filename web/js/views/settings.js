/** Trang Cấu hình: nguồn dữ liệu, ngày chốt số liệu và trình xem bảng thô. */
import { el, fmtDate, toISO, sortBy } from '../core.js';
import { state } from '../store.js';
import { loadConfig, saveConfig, resetConfig, ping, isReadOnly, setAutoSync } from '../api.js';
import { sync, refreshNow } from '../sync.js';
import { pageHead, section, table, empty, btn, filterBar } from '../ui.js';
import { openRecord, openEditor } from '../editor.js';

const SHEET_ID = '1Qij6W36SuuxSYGFSzhNUwgy_vpJCQjlxWlwuhTpGxMw';

export function render() {
  const cfg = loadConfig();

  return el('div.view', [
    pageHead('Cấu hình & dữ liệu thô',
      `Nguồn hiện tại: ${state.source === 'live' ? 'Apps Script (đọc/ghi trực tiếp)' : 'snapshot.json (chỉ đọc)'}`),
    section('Nguồn dữ liệu', 'Để trống URL thì webapp chạy bằng bản kết xuất offline', sourceForm(cfg)),
    section('Đồng bộ tự động', 'Sheet đổi → webapp tự cập nhật mà không cần tải lại trang', syncForm(cfg)),
    section('Ngày chốt số liệu',
      'Mọi tính toán "quá hạn", "còn lại", "kỳ mới nhất" đều so với mốc này', asOfForm(cfg)),
    section('Các bảng đang nạp', `${Object.keys(state.tables).length} bảng từ bảng tính`, tableList()),
    section('Xem dữ liệu thô', 'Đúng như trên bảng tính, kể cả cột bạn tự thêm', rawViewer())
  ]);
}

// ----------------------------------------------------------- NGUỒN

function sourceForm(cfg) {
  const url = el('input', {
    type: 'url', value: cfg.scriptUrl, placeholder: 'https://script.google.com/macros/s/.../exec',
    spellcheck: 'false'
  });
  const token = el('input', { type: 'text', value: cfg.token, placeholder: 'để trống nếu không đặt API_TOKEN' });
  const status = el('p.form-status');

  return el('div', [
    el('div.form-grid', [
      el('label.field', [el('span', 'URL Apps Script (/exec)'), url]),
      el('label.field', [el('span', 'API token'), token])
    ]),
    el('div.form-actions', [
      btn('Kiểm tra kết nối', async () => {
        status.textContent = 'Đang gọi…';
        status.className = 'form-status';
        try {
          const r = await ping({ ...cfg, scriptUrl: url.value.trim(), token: token.value.trim() });
          status.textContent = 'Kết nối tốt · máy chủ trả về ' + new Date(r.time).toLocaleString('vi-VN');
          status.className = 'form-status ok';
        } catch (e) {
          status.textContent = e.message;
          status.className = 'form-status bad';
        }
      }),
      btn('Lưu và tải lại', () => {
        saveConfig({ scriptUrl: url.value.trim(), token: token.value.trim() });
        location.reload();
      }, 'primary'),
      btn('Về chế độ offline', () => {
        saveConfig({ scriptUrl: '', token: '' });
        location.reload();
      })
    ]),
    status,
    el('div.hint-box', [
      el('h4', 'Cách lấy URL'),
      el('ol', [
        el('li', ['Mở ', el('a', { href: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, target: '_blank', rel: 'noopener' }, 'bảng tính PMIS_Data_Demo'), ' → Tiện ích mở rộng → Apps Script.']),
        el('li', 'Dán nội dung pmis/apps-script/Code.gs vào, lưu lại.'),
        el('li', 'Triển khai → Tuỳ chọn triển khai mới → Ứng dụng web: thực thi dưới dạng "Tôi", quyền truy cập "Bất kỳ ai".'),
        el('li', 'Copy URL kết thúc bằng /exec rồi dán vào ô trên.')
      ]),
      el('p.sub', isReadOnly()
        ? 'Đang ở chế độ chỉ đọc. Kết nối Apps Script để sửa dữ liệu ngay trên webapp.'
        : 'Đang kết nối trực tiếp — các thay đổi sẽ ghi thẳng vào bảng tính.')
    ])
  ]);
}

// ------------------------------------------------------- ĐỒNG BỘ

function syncForm(cfg) {
  const seconds = el('input', { type: 'number', min: '0', step: '5', value: cfg.syncSeconds });
  const status = el('p.form-status');

  const trigger = el('div.sync-state', [
    el('span', 'Trigger onChange trên bảng tính: '),
    el('strong', sync.autoSync ? 'đang bật' : 'chưa bật')
  ]);

  return el('div', [
    el('p.sub', 'Webapp hỏi bảng tính "có gì đổi không?" theo nhịp dưới đây. Câu hỏi này rất nhẹ vì phía Apps Script không đọc ô nào — chỉ khi có thay đổi thật mới tải lại toàn bộ dữ liệu.'),
    el('div.form-grid', [
      el('label.field', [el('span', 'Nhịp kiểm tra (giây, 0 = tắt)'), seconds])
    ]),
    el('div.form-actions', [
      btn('Lưu nhịp', () => {
        saveConfig({ syncSeconds: Math.max(0, Number(seconds.value) || 0) });
        location.reload();
      }, 'primary'),
      btn('Tải lại ngay', async () => {
        status.className = 'form-status';
        status.textContent = 'Đang tải…';
        try {
          await refreshNow();
          status.className = 'form-status ok';
          status.textContent = 'Đã tải lại lúc ' + new Date().toLocaleTimeString('vi-VN');
        } catch (e) {
          status.className = 'form-status bad';
          status.textContent = e.message;
        }
      })
    ]),
    trigger,
    isReadOnly() ? null : el('div.form-actions', [
      btn('Bật trigger onChange', () => toggleTrigger(true, status)),
      btn('Tắt trigger', () => toggleTrigger(false, status))
    ]),
    status,
    el('div.hint-box', [
      el('h4', 'Vì sao nên bật trigger'),
      el('p', 'Chưa bật: webapp chỉ nhận ra thay đổi khi số dòng của sheet đổi, còn sửa nội dung trong ô thì phải chờ nhịp tải lại toàn bộ (2 phút).'),
      el('p', 'Đã bật: mọi thao tác sửa trên Google Sheets được đóng dấu ngay, webapp cập nhật ở nhịp kiểm tra kế tiếp.'),
      el('p.sub', 'Có thể bật bằng nút trên, hoặc trong bảng tính: menu PMIS → "Bật tự động đồng bộ sang webapp". Google sẽ hỏi thêm quyền tạo trigger ở lần đầu.')
    ])
  ]);
}

async function toggleTrigger(on, status) {
  status.className = 'form-status';
  status.textContent = 'Đang gọi Apps Script…';
  try {
    const r = await setAutoSync(on);
    sync.autoSync = !!r.installed;
    status.className = 'form-status ok';
    status.textContent = on
      ? (r.created ? 'Đã tạo trigger onChange.' : 'Trigger đã có sẵn.')
      : `Đã gỡ ${r.removed || 0} trigger.`;
  } catch (e) {
    status.className = 'form-status bad';
    status.textContent = e.message
      + ' — nếu báo thiếu quyền, hãy bật bằng menu PMIS ngay trên bảng tính.';
  }
}

// ------------------------------------------------------- NGÀY CHỐT

function asOfForm(cfg) {
  const auto = el('input', { type: 'checkbox', checked: cfg.autoAsOf });
  const date = el('input', { type: 'date', value: cfg.asOf || toISO(state.asOf), disabled: cfg.autoAsOf });
  auto.addEventListener('change', () => { date.disabled = auto.checked; });

  return el('div', [
    el('p', ['Đang dùng: ', el('strong', fmtDate(state.asOf)),
      cfg.autoAsOf ? ' (kỳ báo cáo mới nhất tìm thấy trong dữ liệu)' : ' (do bạn ghim)']),
    el('div.form-grid', [
      el('label.field.field-check', [auto, el('span', 'Tự lấy kỳ báo cáo mới nhất trong dữ liệu')]),
      el('label.field', [el('span', 'Hoặc ghim một ngày cụ thể'), date])
    ]),
    el('div.form-actions', [
      btn('Áp dụng', () => {
        saveConfig({ autoAsOf: auto.checked, asOf: date.value });
        location.reload();
      }, 'primary'),
      btn('Xoá toàn bộ cấu hình', () => {
        resetConfig();
        location.reload();
      })
    ]),
    el('p.sub', 'Dữ liệu mẫu dừng ở kỳ 31/08/2026. Nếu dùng ngày hệ thống thật, mọi mốc hợp đồng sẽ hiện "quá hạn" — vì vậy mặc định webapp bám theo kỳ báo cáo mới nhất của chính bảng tính.')
  ]);
}

// ------------------------------------------------------------ BẢNG

function tableList() {
  const meta = state.meta && state.meta.length
    ? state.meta
    : Object.entries(state.tables).map(([name, rows]) => ({
      name, rows: rows.length, headers: rows[0] ? Object.keys(rows[0]) : [], idField: rows[0] ? Object.keys(rows[0])[0] : ''
    }));

  return el('div', [
    table([
      { key: 'name', label: 'Bảng', width: '20%', render: (r) => el('strong', r.name) },
      { key: 'idField', label: 'Khoá chính', width: '16%' },
      { key: 'rows', label: 'Số dòng', align: 'right', value: (r) => r.rows },
      {
        key: 'headers', label: 'Cột', sortable: false,
        value: (r) => (r.headers || []).length,
        render: (r) => el('div.pill-row', (r.headers || []).map((h) => el('span.mini-pill', h)))
      }
    ], meta, { sortKey: 'name' }),
    el('p.sub', state.generatedAt
      ? `Dữ liệu kết xuất lúc ${new Date(state.generatedAt).toLocaleString('vi-VN')}.`
      : ''),
    state.spreadsheetUrl
      ? el('p', el('a.btn', { href: state.spreadsheetUrl, target: '_blank', rel: 'noopener' }, 'Mở bảng tính nguồn ↗'))
      : null
  ]);
}

function rawViewer() {
  const names = sortBy(Object.keys(state.tables), (n) => n);
  if (!names.length) return empty('Chưa nạp được bảng nào.');
  const box = el('div');

  const draw = (f) => {
    const name = f.table || names[0];
    const rows = state.tables[name] || [];
    if (!rows.length) {
      box.replaceChildren(empty(`Bảng ${name} không có dòng dữ liệu nào.`));
      return;
    }
    const cols = Object.keys(rows[0])
      .filter((k) => k !== '__row')
      .map((k) => ({ key: k, label: k.replace(/_/g, ' ') }));
    box.replaceChildren(
      el('p.sub', `${name} · ${rows.length} dòng · ${cols.length} cột`),
      table(cols, rows, { onRow: (r) => openRecord(name, r, { title: name }), onEdit: (r) => openEditor(name, r) })
    );
  };

  const bar1 = filterBar([
    { type: 'select', key: 'table', label: 'Bảng', value: names[0], options: names, noAll: true }
  ], draw);

  draw({ table: names[0] });
  return el('div', [bar1, box]);
}
