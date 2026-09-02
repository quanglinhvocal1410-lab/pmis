/** Trang Công việc: bảng Kanban theo trạng thái + danh sách chi tiết. */
import { el, fmtDate, fmtDelta, sortBy, groupBy, toISO } from '../core.js';
import { state, distinct, statusesOf, packageOptions, TABLE } from '../store.js';
import { taskBoard } from '../calc.js';
import {
  pageHead, section, kpi, kpiGrid, table, badge, filterBar, matches, empty,
  drawer, closeDrawer, chip, btn, toast
} from '../ui.js';
import { updateRow, isReadOnly } from '../api.js';
import { openEditor, addButton, emptyWithAdd } from '../editor.js';
import { refreshNow } from '../sync.js';

export function render(params) {
  const box = el('div');

  const draw = (f) => {
    const rows = taskBoard(state.tasks).filter((t) =>
      (!f.pkg || t.packageId === f.pkg) &&
      (!f.owner || t.owner === f.owner) &&
      (!f.priority || t.priority === f.priority) &&
      matches(f.q, t.id, t.title, t.desc, t.owner)
    );
    box.replaceChildren(...body(rows));
  };

  const bar1 = filterBar([
    { type: 'search', key: 'q', label: 'Tìm công việc, người phụ trách…' },
    {
      type: 'select', key: 'pkg', label: 'Gói thầu', value: params.pkg || '',
      options: packageOptions().map((p) => ({ value: p.id, label: p.id }))
    },
    { type: 'select', key: 'owner', label: 'Phụ trách', options: distinct(state.tasks, 'owner') },
    { type: 'select', key: 'priority', label: 'Ưu tiên', options: distinct(state.tasks, 'priority') }
  ], draw);

  draw({ pkg: params.pkg || '' });

  return el('div.view', [
    pageHead('Công việc',
      `Fact_CongViec · ${state.tasks.length} đầu việc · đối chiếu hạn theo ngày chốt ${fmtDate(state.asOf)}`,
      [addButton(TABLE.CongViec, {
        label: '+ Thêm công việc',
        defaults: {
          ...(params.pkg ? { ID_Goi_Thau: params.pkg } : {}),
          Trang_Thai: 'Chờ xử lý',
          Ngay_Tao: toISO(state.asOf)
        }
      })]),
    bar1,
    box
  ]);
}

function body(rows) {
  if (!rows.length) {
    return [state.tasks.length
      ? empty('Không có công việc nào khớp bộ lọc.')
      : emptyWithAdd(TABLE.CongViec, 'Bảng Fact_CongViec chưa có đầu việc nào.', { label: '+ Thêm công việc' })];
  }

  const overdue = rows.filter((t) => t.overdue);
  const done = rows.filter((t) => t.status === 'Hoàn thành');
  const soon = rows.filter((t) => !t.overdue && t.status !== 'Hoàn thành' && t.daysLeft !== null && t.daysLeft <= 7);

  return [
    kpiGrid([
      kpi({ label: 'Tổng công việc', value: String(rows.length) }),
      kpi({ label: 'Quá hạn', value: String(overdue.length), tone: overdue.length ? 'bad' : 'ok', hint: overdue.length ? 'Cần xử lý ngay' : 'Không có việc quá hạn' }),
      kpi({ label: 'Đến hạn trong 7 ngày', value: String(soon.length), tone: soon.length ? 'warn' : 'ok' }),
      kpi({ label: 'Đã hoàn thành', value: `${done.length}/${rows.length}`, tone: 'ok' })
    ]),
    section('Bảng Kanban', 'Cột lấy theo nhóm "Công việc" trong Dim_TrangThai', kanban(rows)),
    section('Danh sách chi tiết', `${rows.length} công việc`, taskTable(rows))
  ];
}

function kanban(rows) {
  // Thứ tự cột do bảng Dim_TrangThai quy định, cộng thêm trạng thái lạ ở cuối
  const declared = statusesOf('Công việc').map((s) => s.name);
  const present = [...new Set(rows.map((t) => t.status))];
  const columns = [...declared.filter((s) => present.includes(s)), ...present.filter((s) => !declared.includes(s))];
  const byStatus = groupBy(rows, 'status');

  return el('div.kanban', columns.map((col) => {
    const list = sortBy(byStatus.get(col) || [], (t) => t.due || 0);
    return el('div.kanban-col', [
      el('header.kanban-head', [
        badge(col, 'Công việc'),
        el('span.kanban-count', String(list.length))
      ]),
      el('div.kanban-body', list.length
        ? list.map(taskCard)
        : el('p.sub.kanban-empty', 'Trống'))
    ]);
  }));
}

function taskCard(t) {
  return el('article.task-card' + (t.overdue ? '.overdue' : ''), {
    onclick: () => openTask(t)
  }, [
    el('div.task-top', [
      el('span.task-id', t.id),
      chip(t.priority, t.priority === 'Cao' ? 'prio-bad' : 'prio-warn')
    ]),
    el('h4', t.title),
    el('div.task-meta', [
      el('span', t.owner || 'Chưa giao'),
      el('span.' + (t.overdue ? 'bad' : t.daysLeft !== null && t.daysLeft <= 7 ? 'warn' : ''),
        t.status === 'Hoàn thành' ? fmtDate(t.done || t.due) : fmtDelta(t.daysLeft))
    ]),
    t.packageId ? el('a.task-pkg', {
      href: `#/goi-thau/${t.packageId}`,
      onclick: (e) => e.stopPropagation()
    }, t.packageId) : null
  ]);
}

function taskTable(rows) {
  return table([
    { key: 'id', label: 'Mã', width: '8%' },
    { key: 'title', label: 'Công việc', width: '28%' },
    { key: 'packageId', label: 'Gói', render: (r) => (r.packageId ? el('a', { href: `#/goi-thau/${r.packageId}` }, r.packageId) : '—') },
    { key: 'owner', label: 'Phụ trách' },
    { key: 'priority', label: 'Ưu tiên', render: (r) => chip(r.priority, r.priority === 'Cao' ? 'prio-bad' : 'prio-warn') },
    { key: 'start', label: 'Bắt đầu', value: (r) => r.start, render: (r) => fmtDate(r.start) },
    { key: 'due', label: 'Hạn', value: (r) => r.due, render: (r) => fmtDate(r.due) },
    {
      key: 'left', label: 'Còn lại', align: 'right',
      value: (r) => (r.daysLeft ?? 0),
      render: (r) => (r.status === 'Hoàn thành'
        ? el('span.num.ok', 'xong')
        : el('span.num.' + (r.overdue ? 'bad' : r.daysLeft <= 7 ? 'warn' : ''), fmtDelta(r.daysLeft)))
    },
    { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Công việc') }
  ], rows, { sortKey: 'due', onRow: openTask, onEdit: (r) => openEditor(TABLE.CongViec, r.row) });
}

/** Ngăn kéo chi tiết; ở chế độ có Apps Script thì cho đổi trạng thái. */
function openTask(t) {
  const statuses = statusesOf('Công việc').map((s) => s.name);
  const body = el('div', [
    el('p.task-desc', t.desc || t.title),
    el('div.task-facts', [
      fact('Gói thầu', t.packageId), fact('Phụ trách', t.owner),
      fact('Ưu tiên', t.priority), fact('Trạng thái', badge(t.status, 'Công việc')),
      fact('Bắt đầu', fmtDate(t.start)), fact('Hạn', fmtDate(t.due)),
      fact('Hoàn thành', fmtDate(t.done)), fact('Hợp đồng LQ', t.contractId)
    ])
  ]);

  if (isReadOnly()) {
    body.appendChild(el('p.sub', 'Chế độ chỉ đọc — kết nối Apps Script ở trang Cấu hình để sửa.'));
  } else {
    // Đổi trạng thái là thao tác hay dùng nhất nên để ngay đây, khỏi mở biểu mẫu đầy đủ
    const sel = el('select', statuses.map((s) =>
      el('option', { value: s, selected: s === t.status }, s)));
    body.appendChild(el('div.task-edit', [
      el('label', [el('span', 'Đổi trạng thái'), sel]),
      btn('Lưu', async (e) => {
        e.target.disabled = true;
        try {
          const patch = { [firstKey(t.row)]: t.id, Trang_Thai: sel.value };
          // Đánh dấu hoàn thành thì ghi luôn ngày hoàn thành nếu còn trống
          if (sel.value === 'Hoàn thành' && !t.row.Ngay_Hoan_Thanh) {
            patch.Ngay_Hoan_Thanh = toISO(state.asOf);
          }
          await updateRow(TABLE.CongViec, patch);
          closeDrawer();
          toast('Đã cập nhật ' + t.id);
          await refreshNow();
        } catch (err) {
          toast(err.message, 'bad');
          e.target.disabled = false;
        }
      }, 'primary'),
      btn('Sửa đầy đủ', () => openEditor(TABLE.CongViec, t.row))
    ]));
  }

  drawer(t.title, body, `${t.id}${t.packageId ? ' · ' + t.packageId : ''}`);
}

function firstKey(row) {
  return Object.keys(row)[0];
}

function fact(label, value) {
  return el('div.fact', [
    el('span.fact-label', label),
    el('span.fact-value', value instanceof Node ? value : (value || '—'))
  ]);
}
