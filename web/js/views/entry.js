/**
 * Trang Nhập liệu — chỗ duy nhất để đi tới mọi bảng và thêm bản ghi.
 *
 * Thứ tự nhập có ý nghĩa: bảng tính không có ràng buộc khoá ngoại, nên
 * phải có mã dự án trước rồi mới chọn được nó ở gói thầu, có gói thầu rồi
 * mới gắn được tiến độ / thanh toán. Trang này bày đúng thứ tự đó và soát
 * lại những chỗ đang trỏ sai.
 */
import { el, fmtDate } from '../core.js';
import { state, TABLE } from '../store.js';
import { dataAudit } from '../calc.js';
import { pageHead, section, kpi, kpiGrid, empty, btn, table } from '../ui.js';
import { openEditor, headersOf, idFieldOf } from '../editor.js';
import { isReadOnly } from '../api.js';

/** Thứ tự nhập liệu và mô tả từng bảng. */
const STEPS = [
  {
    group: 'Bước 1 — Khung danh mục',
    note: 'Nhập trước, vì các bảng sau chọn mã từ đây.',
    tables: [
      { name: TABLE.DuAn, label: 'Dự án', desc: 'Tổng mức đầu tư, chủ đầu tư, thời gian thực hiện.' },
      { name: TABLE.NhaThau, label: 'Nhà thầu', desc: 'Pháp nhân, mã số thuế, người đại diện, tài khoản.' },
      { name: TABLE.TuVan, label: 'Đơn vị tư vấn', desc: 'Tư vấn giám sát, thiết kế.' },
      { name: TABLE.TrangThai, label: 'Danh mục trạng thái', desc: 'Quy định màu sắc nhãn và thứ tự cột Kanban của cả webapp.' }
    ]
  },
  {
    group: 'Bước 2 — Gói thầu & hợp đồng',
    note: 'Trục chính của mọi báo cáo.',
    tables: [
      { name: TABLE.GoiThau, label: 'Gói thầu', desc: 'Giá hợp đồng, dự toán, giai đoạn, mức rủi ro.' },
      { name: TABLE.HopDong, label: 'Hợp đồng', desc: 'Tạm ứng, giữ lại, bảo lãnh, phạt chậm tiến độ, mốc hoàn thành.' }
    ]
  },
  {
    group: 'Bước 3 — Số liệu theo kỳ',
    note: 'Phần bạn cập nhật định kỳ hằng tháng.',
    tables: [
      { name: TABLE.EVM, label: 'EVM', desc: 'Chỉ nhập BAC, PV, EV, AC — SPI/CPI/EAC/VAC/TCPI webapp tự tính.' },
      { name: TABLE.TienDo, label: 'Tiến độ hạng mục', desc: 'WBS: kế hoạch, thực tế, dự báo, % hoàn thành.' },
      { name: TABLE.GiaiNgan, label: 'Giải ngân', desc: 'Kế hoạch và thực hiện từng tháng, luỹ kế.' },
      { name: TABLE.ThanhToan, label: 'Thanh toán IPC', desc: 'Từng đợt: đề nghị, chứng nhận, thực trả, thu hồi tạm ứng.' }
    ]
  },
  {
    group: 'Bước 4 — Vận hành hằng ngày',
    note: 'Nhập tới đâu dùng tới đó.',
    tables: [
      { name: TABLE.CongViec, label: 'Công việc', desc: 'Đầu việc, người phụ trách, hạn xử lý.' },
      { name: TABLE.HoSo, label: 'Hồ sơ', desc: 'Tài liệu pháp lý, trình duyệt, thi công, thanh toán.' }
    ]
  }
];

/** Trang xem tương ứng của từng bảng, để bấm sang xem kết quả. */
const VIEW_OF = {
  [TABLE.DuAn]: '#/tong-quan',
  [TABLE.GoiThau]: '#/goi-thau',
  [TABLE.HopDong]: '#/danh-muc?tab=hop-dong',
  [TABLE.NhaThau]: '#/danh-muc?tab=nha-thau',
  [TABLE.TuVan]: '#/danh-muc?tab=tu-van',
  [TABLE.TrangThai]: '#/danh-muc?tab=trang-thai',
  [TABLE.TienDo]: '#/tien-do',
  [TABLE.EVM]: '#/evm',
  [TABLE.GiaiNgan]: '#/tai-chinh',
  [TABLE.ThanhToan]: '#/tai-chinh',
  [TABLE.CongViec]: '#/cong-viec',
  [TABLE.HoSo]: '#/ho-so'
};

export function render() {
  const audit = dataAudit();
  const counts = Object.fromEntries(
    Object.keys(state.tables).map((t) => [t, (state.tables[t] || []).length])
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const emptyTables = Object.entries(counts).filter(([, n]) => !n).length;

  return el('div.view', [
    pageHead('Nhập liệu', 'Thêm bản ghi vào bất kỳ bảng nào của PMIS_Data_Demo'),
    isReadOnly() ? readOnlyNotice() : null,

    kpiGrid([
      kpi({ label: 'Tổng số bản ghi', value: String(total), hint: `${Object.keys(counts).length} bảng` }),
      kpi({
        label: 'Bảng còn trống',
        value: String(emptyTables),
        tone: emptyTables ? 'warn' : 'ok',
        hint: emptyTables ? 'Xem danh sách bên dưới' : 'Mọi bảng đều đã có dữ liệu'
      }),
      kpi({
        label: 'Điểm cần xử lý',
        value: String(audit.length),
        tone: audit.some((a) => a.level === 'bad') ? 'bad' : audit.length ? 'warn' : 'ok',
        hint: `${audit.filter((a) => a.level === 'bad').length} lỗi tham chiếu`
      }),
      kpi({ label: 'Ngày chốt số liệu', value: fmtDate(state.asOf) })
    ]),

    ...STEPS.map((step) => section(step.group, step.note,
      el('div.entry-grid', step.tables.map((t) => tableCard(t, counts[t.name])))
    )),

    section('Soát dữ liệu', audit.length
      ? `${audit.length} điểm cần xử lý — sửa xong là mọi chỉ số tự tính lại`
      : 'Không phát hiện vấn đề nào', auditPanel(audit))
  ]);
}

function readOnlyNotice() {
  return el('div.notice.notice-bad', [
    el('strong', 'Đang ở chế độ chỉ đọc — chưa nhập được. '),
    'Webapp đang đọc bản snapshot offline. Để nhập tay vào bảng tính, mở ',
    el('a', { href: '#/cau-hinh' }, 'trang Cấu hình'),
    ' và dán URL Apps Script (/exec).'
  ]);
}

function tableCard(t, count) {
  const headers = headersOf(t.name);
  const missing = !count;
  return el('article.entry-card' + (missing ? '.missing' : ''), [
    el('header.entry-head', [
      el('div', [
        el('h3', t.label),
        el('code.entry-table', t.name)
      ]),
      el('span.entry-count' + (missing ? '.warn' : ''), missing ? 'trống' : `${count} dòng`)
    ]),
    el('p.entry-desc', t.desc),
    el('p.sub', `Khoá: ${idFieldOf(t.name) || '—'} · ${headers.length} cột`),
    el('div.entry-actions', [
      isReadOnly()
        ? null
        : btn('+ Thêm', () => openEditor(t.name, null, { defaults: defaultsFor(t.name) }), 'primary'),
      VIEW_OF[t.name] ? el('a.btn', { href: VIEW_OF[t.name] }, 'Xem') : null
    ])
  ]);
}

/** Điền sẵn những trường suy được từ dữ liệu đang có, đỡ phải gõ lại. */
function defaultsFor(tableName) {
  const project = state.projects[0];
  const d = {};
  if (project) {
    if (headersOf(tableName).includes('ID_Du_An')) d.ID_Du_An = project.id;
  }
  if (state.packages.length === 1 && headersOf(tableName).includes('ID_Goi_Thau')) {
    d.ID_Goi_Thau = state.packages[0].id;
  }
  return d;
}

function auditPanel(audit) {
  if (!audit.length) {
    return empty('Dữ liệu nhất quán.', 'Mọi tham chiếu giữa các bảng đều trỏ đúng.');
  }
  return table([
    {
      key: 'level', label: 'Mức', width: '9%',
      render: (r) => el('span.badge.' + r.level, r.level === 'bad' ? 'Lỗi' : 'Thiếu')
    },
    {
      key: 'table', label: 'Bảng', width: '15%',
      render: (r) => el('code.entry-table', r.table)
    },
    { key: 'msg', label: 'Vấn đề', width: '38%' },
    { key: 'hint', label: 'Vì sao quan trọng', render: (r) => r.hint || '—' }
  ], audit, { sortKey: 'level' });
}
