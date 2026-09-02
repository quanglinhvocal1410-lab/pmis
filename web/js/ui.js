/**
 * Các mảnh giao diện dùng lại: thẻ KPI, nhãn trạng thái, bảng có sắp xếp,
 * thanh lọc, ngăn kéo chi tiết, thông báo.
 */
import { el, clear, fold, fmtDate, fmtMoney, fmtPct, sortBy } from './core.js';
import { tone } from './store.js';

// ------------------------------------------------------------- CƠ BẢN

export function section(title, subtitle, body, actions) {
  return el('section.card', [
    el('header.card-head', [
      el('div', [
        el('h2', title),
        subtitle ? el('p.sub', subtitle) : null
      ]),
      actions ? el('div.card-actions', actions) : null
    ]),
    el('div.card-body', body)
  ]);
}

export function pageHead(title, subtitle, actions) {
  return el('div.page-head', [
    el('div', [el('h1', title), subtitle ? el('p.sub', subtitle) : null]),
    actions ? el('div.page-actions', actions) : null
  ]);
}

/**
 * Thẻ chỉ số.
 * @param {{label:string, value:string, hint?:string, tone?:string, trend?:string}} o
 */
export function kpi({ label, value, hint, tone: t, trend, onclick }) {
  return el('div.kpi' + (t ? '.' + t : '') + (onclick ? '.clickable' : ''), { onclick }, [
    el('span.kpi-label', label),
    el('strong.kpi-value', value),
    hint ? el('span.kpi-hint', hint) : null,
    trend ? el('span.kpi-trend', trend) : null
  ]);
}

export function kpiGrid(items) {
  return el('div.kpi-grid', items.filter(Boolean));
}

/** Nhãn trạng thái, màu tra từ bảng Dim_TrangThai. */
export function badge(text, group) {
  if (!text) return el('span.badge.mute', '—');
  return el('span.badge.' + tone(text, group), text);
}

export function chip(text, cls) {
  return el('span.chip' + (cls ? '.' + cls : ''), text);
}

export function bar(pct, t) {
  const p = Math.max(0, Math.min(1, pct || 0));
  return el('div.bar', { title: fmtPct(pct) }, [
    el('i' + (t ? '.' + t : ''), { style: { width: (p * 100).toFixed(1) + '%' } })
  ]);
}

export function empty(msg, hint) {
  return el('div.empty', [el('p', msg), hint ? el('p.sub', hint) : null]);
}

export function btn(label, onclick, cls) {
  return el('button.btn' + (cls ? '.' + cls : ''), { onclick, type: 'button' }, label);
}

export function link(label, href, cls) {
  return el('a' + (cls ? '.' + cls : ''), { href }, label);
}

// ------------------------------------------------------------- BẢNG

/**
 * Bảng dữ liệu có sắp xếp bằng cách bấm tiêu đề.
 * cols: [{ key, label, render?(row), value?(row), align?, width?, sortable? }]
 */
export function table(cols, rows, opts = {}) {
  const st = { key: opts.sortKey || null, dir: opts.sortDir || 1 };
  const wrap = el('div.table-wrap');
  const tbl = el('table.tbl');
  const thead = el('thead');
  const tbody = el('tbody');

  const valueOf = (c, r) => (c.value ? c.value(r) : r[c.key]);

  function head() {
    const tr = el('tr');
    cols.forEach((c) => {
      const sortable = c.sortable !== false;
      const th = el('th' + (c.align ? '.' + c.align : '') + (sortable ? '.sortable' : ''), {
        style: c.width ? { width: c.width } : null,
        onclick: sortable ? () => {
          st.dir = st.key === c.key ? -st.dir : 1;
          st.key = c.key;
          draw();
        } : null
      }, [c.label, st.key === c.key ? el('span.sort', st.dir > 0 ? ' ▲' : ' ▼') : null]);
      tr.appendChild(th);
    });
    clear(thead).appendChild(tr);
  }

  function draw() {
    head();
    let data = rows;
    if (st.key) {
      const col = cols.find((c) => c.key === st.key);
      data = sortBy(rows, (r) => {
        const v = valueOf(col, r);
        return v instanceof Date ? v.getTime() : typeof v === 'number' ? v : fold(v);
      }, st.dir);
    }
    clear(tbody);
    if (!data.length) {
      tbody.appendChild(el('tr', el('td', { colspan: cols.length }, empty(opts.emptyText || 'Không có dữ liệu'))));
      return;
    }
    data.forEach((r) => {
      const tr = el('tr' + (opts.rowClass ? '.' + opts.rowClass(r) : ''), {
        onclick: opts.onRow ? () => opts.onRow(r) : null,
        class: opts.onRow ? 'clickable' : null
      });
      cols.forEach((c) => {
        const out = c.render ? c.render(r) : fallback(valueOf(c, r));
        tr.appendChild(el('td' + (c.align ? '.' + c.align : ''), out));
      });
      tbody.appendChild(tr);
    });
  }

  tbl.appendChild(thead);
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  draw();
  return wrap;
}

function fallback(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === 'number') return fmtMoney(v);
  return String(v);
}

/** Bảng 2 cột nhãn–giá trị. */
export function defList(pairs) {
  return el('dl.deflist', pairs.filter(Boolean).map(([k, v]) =>
    el('div.def-row', [el('dt', k), el('dd', v instanceof Node ? v : fallback(v))])
  ));
}

// ------------------------------------------------------------ BỘ LỌC

/**
 * Thanh lọc. fields: [{ type:'search'|'select', key, label, options?, value? }]
 * onChange nhận object { key: value }.
 */
export function filterBar(fields, onChange) {
  const values = {};
  fields.forEach((f) => { values[f.key] = f.value ?? ''; });
  const emit = () => onChange({ ...values });

  const nodes = fields.map((f) => {
    if (f.type === 'search') {
      const input = el('input', {
        type: 'search',
        placeholder: f.label || 'Tìm kiếm…',
        value: values[f.key],
        oninput: (e) => { values[f.key] = e.target.value; emit(); }
      });
      return el('label.field.field-search', [el('span', f.label || 'Tìm'), input]);
    }
    const sel = el('select', {
      onchange: (e) => { values[f.key] = e.target.value; emit(); }
    }, [
      // `noAll` dùng cho bộ chọn bắt buộc phải có một giá trị
      f.noAll ? null : el('option', { value: '' }, f.allLabel || 'Tất cả'),
      ...f.options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const lb = typeof o === 'string' ? o : o.label;
        return el('option', { value: val, selected: values[f.key] === val }, lb);
      })
    ]);
    return el('label.field', [el('span', f.label), sel]);
  });

  return el('div.filter-bar', nodes);
}

/** Khớp chuỗi tìm kiếm với nhiều trường (không dấu). */
export function matches(query, ...parts) {
  if (!query) return true;
  const q = fold(query);
  return fold(parts.join(' ')).includes(q);
}

// -------------------------------------------------------- NGĂN KÉO

let drawerEl = null;

export function drawer(title, body, subtitle) {
  closeDrawer();
  drawerEl = el('div.drawer-backdrop', {
    onclick: (e) => { if (e.target === drawerEl) closeDrawer(); }
  }, [
    el('aside.drawer', { role: 'dialog', 'aria-label': title }, [
      el('header.drawer-head', [
        el('div', [el('h2', title), subtitle ? el('p.sub', subtitle) : null]),
        el('button.icon-btn', { onclick: closeDrawer, 'aria-label': 'Đóng' }, '✕')
      ]),
      el('div.drawer-body', body)
    ])
  ]);
  document.body.appendChild(drawerEl);
  document.body.classList.add('no-scroll');
  return drawerEl;
}

export function closeDrawer() {
  if (drawerEl) drawerEl.remove();
  drawerEl = null;
  document.body.classList.remove('no-scroll');
  onCloseHooks.forEach((fn) => fn());
}

/** Có biểu mẫu đang mở không — dùng để hoãn việc vẽ lại khi đồng bộ. */
export function isDrawerOpen() {
  return !!drawerEl;
}

const onCloseHooks = [];
export function onDrawerClose(fn) {
  onCloseHooks.push(fn);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

/** Hiển thị toàn bộ cột gốc của một dòng sheet — kể cả cột mới thêm tay. */
export function rawRecord(row) {
  const pairs = Object.entries(row)
    .filter(([k]) => k !== '__row')
    .map(([k, v]) => [k.replace(/_/g, ' '), v === '' ? '—' : v]);
  return el('div.raw-record', [
    el('p.sub', row.__row ? `Dòng ${row.__row} trên bảng tính` : 'Bản ghi gốc trên bảng tính'),
    defList(pairs)
  ]);
}

// ------------------------------------------------------------ THÔNG BÁO

export function toast(msg, kind = 'ok') {
  const t = el('div.toast.' + kind, msg);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3600);
}
