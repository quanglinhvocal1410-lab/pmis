/** Trang Hồ sơ: tra cứu tài liệu theo nhóm, loại, trạng thái và tình trạng OCR/AI. */
import { el, fmtDate, fmtPct, sortBy } from '../core.js';
import { state, distinct, packageOptions } from '../store.js';
import { docStats } from '../calc.js';
import { pageHead, section, kpi, kpiGrid, table, badge, bar, filterBar, matches, empty, chip } from '../ui.js';
import { openRecord, openEditor, addButton, emptyWithAdd, headersOf } from '../editor.js';
import { TABLE } from '../store.js';

export function render(params) {
  const box = el('div');

  const draw = (f) => {
    const rows = state.docs.filter((d) =>
      (!f.pkg || d.packageId === f.pkg) &&
      (!f.group || d.group === f.group) &&
      (!f.type || d.type === f.type) &&
      (!f.status || d.status === f.status) &&
      matches(f.q, d.id, d.content, d.ref, d.party, d.type, d.group)
    );
    box.replaceChildren(...body(rows));
  };

  const bar1 = filterBar([
    { type: 'search', key: 'q', label: 'Tìm nội dung, số hiệu, bên chịu trách nhiệm…' },
    {
      type: 'select', key: 'pkg', label: 'Gói thầu', value: params.pkg || '',
      options: packageOptions().map((p) => ({ value: p.id, label: p.id }))
    },
    { type: 'select', key: 'group', label: 'Nhóm hồ sơ', options: distinct(state.docs, 'group') },
    { type: 'select', key: 'type', label: 'Loại', options: distinct(state.docs, 'type') },
    { type: 'select', key: 'status', label: 'Trạng thái', options: distinct(state.docs, 'status') }
  ], draw);

  draw({ pkg: params.pkg || '' });

  return el('div.view', [
    pageHead('Hồ sơ dự án', `Fact_HoSo · ${state.docs.length} tài liệu`,
      [addButton(TABLE.HoSo, {
        label: '+ Thêm hồ sơ',
        defaults: {
          ID_Du_An: state.projects[0] ? state.projects[0].id : '',
          ...(params.pkg ? { ID_Goi_Thau: params.pkg } : {})
        }
      })]),
    bar1,
    box
  ]);
}

function body(rows) {
  if (!rows.length) {
    return [state.docs.length
      ? empty('Không có hồ sơ nào khớp bộ lọc.')
      : emptyWithAdd(TABLE.HoSo, 'Bảng Fact_HoSo chưa có tài liệu nào.', { label: '+ Thêm hồ sơ' })];
  }

  const pending = rows.filter((d) => /(cần bổ sung|chờ|đang)/i.test(d.status || ''));
  const ocr = rows.filter((d) => /đã ocr/i.test(d.ocr || ''));
  const ai = rows.filter((d) => /đã trích xuất/i.test(d.ai || ''));
  const linked = rows.filter((d) => d.url);
  const cols = digitalColumns();

  return [
    kpiGrid([
      kpi({ label: 'Tài liệu', value: String(rows.length), hint: `${linked.length} có liên kết Drive` }),
      kpi({ label: 'Đang chờ xử lý', value: String(pending.length), hint: 'Cần bổ sung / đang thẩm tra', tone: pending.length ? 'warn' : 'ok' }),
      cols.ocr ? kpi({ label: 'Đã OCR', value: fmtPct(ocr.length / rows.length, 0), hint: `${ocr.length}/${rows.length} tài liệu` }) : null,
      cols.ai ? kpi({ label: 'Đã trích xuất AI', value: fmtPct(ai.length / rows.length, 0), hint: `${ai.length}/${rows.length} tài liệu` }) : null,
      kpi({ label: 'Nhóm hồ sơ', value: String(new Set(rows.map((d) => d.group)).size) })
    ]),
    section('Theo nhóm hồ sơ', cols.ocr || cols.ai ? 'Tình trạng số hoá từng nhóm' : 'Số lượng và tình trạng xử lý', groupPanel(rows)),
    pending.length
      ? section('Cần xử lý', `${pending.length} tài liệu chưa hoàn tất`, docTable(pending))
      : null,
    section('Danh mục hồ sơ', `${rows.length} tài liệu`, docTable(rows))
  ].filter(Boolean);
}

/** Các cột số hoá là tuỳ chọn — người dùng có thể đã bỏ khỏi sheet. */
function digitalColumns() {
  const h = headersOf(TABLE.HoSo);
  return { ocr: h.includes('Trang_Thai_OCR'), ai: h.includes('Trang_Thai_AI') };
}

function groupPanel(rows) {
  const stats = docStats(rows);
  const cols = digitalColumns();
  return el('div.group-grid', stats.map((g) => el('div.group-card', [
    el('h4', g.group),
    el('p.group-count', [el('strong', String(g.total)), ' tài liệu']),
    cols.ocr ? el('div.group-metric', [
      el('span', 'Đã OCR'),
      bar(g.ocr / g.total, 'ok'),
      el('span.sub', `${g.ocr}/${g.total}`)
    ]) : null,
    cols.ai ? el('div.group-metric', [
      el('span', 'Đã trích xuất AI'),
      bar(g.ai / g.total, 'ok'),
      el('span.sub', `${g.ai}/${g.total}`)
    ]) : null,
    g.pending
      ? el('p.group-pending', chip(`${g.pending} chờ xử lý`, 'warn'))
      : el('p.group-pending', chip('Hoàn tất', 'ok'))
  ])));
}

function docTable(rows) {
  return table([
    { key: 'id', label: 'Mã', width: '8%' },
    { key: 'packageId', label: 'Gói', width: '7%', render: (r) => (r.packageId ? el('a', { href: `#/goi-thau/${r.packageId}` }, r.packageId) : '—') },
    { key: 'group', label: 'Nhóm' },
    { key: 'type', label: 'Loại' },
    { key: 'content', label: 'Nội dung', width: '24%' },
    { key: 'ref', label: 'Số hiệu' },
    { key: 'rev', label: 'Rev', width: '5%' },
    { key: 'issued', label: 'Phát hành', value: (r) => r.issued, render: (r) => fmtDate(r.issued) },
    { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Hồ sơ') },
    { key: 'party', label: 'Bên chịu TN' },
    ...(digitalColumns().ocr || digitalColumns().ai ? [{
      key: 'digital', label: 'Số hoá', sortable: false,
      render: (r) => el('div.dot-row', [
        digitalColumns().ocr
          ? el('span.dot' + (/đã ocr/i.test(r.ocr || '') ? '.ok' : '.mute'), { title: 'OCR: ' + (r.ocr || '—') }, 'OCR')
          : null,
        digitalColumns().ai
          ? el('span.dot' + (/đã trích xuất/i.test(r.ai || '') ? '.ok' : '.mute'), { title: 'AI: ' + (r.ai || '—') }, 'AI')
          : null
      ])
    }] : []),
    {
      key: 'url', label: '', sortable: false, align: 'right',
      render: (r) => (r.url
        ? el('a.icon-link', { href: r.url, target: '_blank', rel: 'noopener', title: 'Mở trên Google Drive', onclick: (e) => e.stopPropagation() }, '↗')
        : '')
    }
  ], sortBy(rows, (r) => r.id), {
    sortKey: 'id',
    onRow: (r) => openRecord(TABLE.HoSo, r.row, { title: r.content, subtitle: `${r.id} · ${r.group}` }),
    onEdit: (r) => openEditor(TABLE.HoSo, r.row)
  });
}
