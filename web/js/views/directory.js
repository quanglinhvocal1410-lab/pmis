/** Trang Danh mục: hợp đồng, nhà thầu, tư vấn và bảng trạng thái dùng chung. */
import { el, fmtMoney, fmtDate, fmtPct, fmtDelta, daysBetween, sortBy } from '../core.js';
import { state, TABLE } from '../store.js';
import { pageHead, section, table, badge, empty, defList, chip, btn } from '../ui.js';
import { openRecord, openEditor, addButton } from '../editor.js';
import { isReadOnly } from '../api.js';

const TABS = [
  { key: 'hop-dong', label: 'Hợp đồng', render: contracts },
  { key: 'nha-thau', label: 'Nhà thầu', render: contractors },
  { key: 'tu-van', label: 'Tư vấn', render: consultants },
  { key: 'trang-thai', label: 'Bảng trạng thái', render: statuses }
];

export function render(params) {
  const active = TABS.find((t) => t.key === params.tab) || TABS[0];
  const body = el('div', active.render());

  return el('div.view', [
    pageHead('Danh mục', 'Dim_HopDong · Dim_NhaThau · Dim_TuVan · Dim_TrangThai'),
    el('nav.tabs', TABS.map((t) => el('a.tab' + (t === active ? '.active' : ''), {
      href: `#/danh-muc?tab=${t.key}`
    }, t.label))),
    body
  ]);
}

// --------------------------------------------------------- HỢP ĐỒNG

function contracts() {
  if (!state.contracts.length) return empty('Bảng Dim_HopDong chưa có dữ liệu.');
  return section('Hợp đồng', `${state.contracts.length} hợp đồng`, table([
    { key: 'id', label: 'Mã', width: '9%' },
    { key: 'no', label: 'Số hợp đồng', width: '16%' },
    { key: 'packageId', label: 'Gói', render: (r) => el('a', { href: `#/goi-thau/${r.packageId}` }, r.packageId) },
    { key: 'contractor', label: 'Nhà thầu', value: (r) => (r.contractor ? r.contractor.name : ''), render: (r) => (r.contractor ? r.contractor.name : '—') },
    { key: 'value', label: 'Giá trị', align: 'right', render: (r) => fmtMoney(r.value) },
    { key: 'signed', label: 'Ngày ký', value: (r) => r.signed, render: (r) => fmtDate(r.signed) },
    { key: 'finish', label: 'Hoàn thành', value: (r) => r.finish, render: (r) => fmtDate(r.finish) },
    {
      key: 'bond', label: 'Bảo lãnh TH hết hạn', value: (r) => r.perfBondExpiry,
      render: (r) => expiry(r.perfBondExpiry)
    },
    {
      key: 'ins', label: 'Bảo hiểm hết hạn', value: (r) => r.insuranceExpiry,
      render: (r) => expiry(r.insuranceExpiry)
    },
    { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Hợp đồng') }
  ], state.contracts, { sortKey: 'id', onRow: openContract }), [addButton(TABLE.HopDong, { label: '+ Thêm hợp đồng' })]);
}

function expiry(date) {
  const d = daysBetween(state.asOf, date);
  if (d === null) return '—';
  const t = d < 0 ? 'bad' : d <= 90 ? 'warn' : 'ok';
  return el('div.cell-main', [
    el('span', fmtDate(date)),
    el('span.sub.' + t, fmtDelta(d))
  ]);
}

function openContract(c) {
  openRecord(TABLE.HopDong, c.row, { title: c.no, subtitle: `${c.id} · ${c.packageId}` });
}

// ---------------------------------------------------------- NHÀ THẦU

function contractors() {
  if (!state.contractors.length) return empty('Bảng Dim_NhaThau chưa có dữ liệu.');
  return el('div', state.contractors.map((n) => {
    const pkgs = state.packages.filter((p) => p.contractorId === n.id);
    const value = pkgs.reduce((s, p) => s + p.currentValue, 0);
    return el('article.party-card', [
      el('header', [
        el('div', [el('h3', n.name), el('p.sub', `${n.id} · MST ${n.taxCode || '—'} · ${n.country || ''}`)]),
        el('div.party-value', [
          el('strong', fmtMoney(value)),
          el('span.sub', `${pkgs.length} gói thầu`),
          isReadOnly() ? null : btn('Sửa', () => openEditor(TABLE.NhaThau, n.row))
        ])
      ]),
      el('div.party-body', [
        defList([
          ['Người đại diện', n.rep],
          ['Điện thoại', n.phone],
          ['Email', n.email ? el('a', { href: 'mailto:' + n.email }, n.email) : '—'],
          ['Địa chỉ', n.address],
          ['Tài khoản NH', n.bankAccount || '—'],
          ['Mã CITAD', n.citad || '—']
        ]),
        el('div.party-pkgs', pkgs.map((p) =>
          el('a.pkg-pill', { href: `#/goi-thau/${p.id}` }, [
            el('strong', p.id),
            el('span', fmtMoney(p.currentValue)),
            badge(p.status, 'Gói thầu')
          ])))
      ])
    ]);
  }));
}

function consultants() {
  if (!state.consultants.length) return empty('Bảng Dim_TuVan chưa có dữ liệu.');
  return section('Đơn vị tư vấn', `${state.consultants.length} đơn vị`, table([
    { key: 'id', label: 'Mã', width: '8%' },
    { key: 'name', label: 'Tên đơn vị', width: '30%' },
    { key: 'type', label: 'Loại tư vấn', render: (r) => chip(r.type) },
    { key: 'rep', label: 'Người đại diện' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'email', label: 'Email', render: (r) => (r.email ? el('a', { href: 'mailto:' + r.email }, r.email) : '—') },
    {
      key: 'pkgs', label: 'Gói thầu phụ trách', sortable: false,
      render: (r) => el('div.pill-row', state.packages
        .filter((p) => p.consultantId === r.id)
        .map((p) => el('a.mini-pill', { href: `#/goi-thau/${p.id}` }, p.id)))
    }
  ], state.consultants, {
    sortKey: 'id',
    onRow: (r) => openRecord(TABLE.TuVan, r.row, { title: r.name, subtitle: r.id })
  }), [addButton(TABLE.TuVan, { label: '+ Thêm đơn vị' })]);
}

// -------------------------------------------------------- TRẠNG THÁI

function statuses() {
  if (!state.statuses.length) return empty('Bảng Dim_TrangThai chưa có dữ liệu.');
  const groups = [...new Set(state.statuses.map((s) => s.group))];
  return el('div', [
    el('p.notice', 'Màu sắc của mọi nhãn trạng thái trên toàn bộ webapp được lấy từ cột Mau_Sac của bảng này — sửa trên bảng tính là giao diện đổi theo.'),
    ...groups.map((g) => section(g, `${state.statuses.filter((s) => s.group === g).length} trạng thái`,
      el('div.status-row', sortBy(state.statuses.filter((s) => s.group === g), (s) => s.order).map((s) =>
        el('div.status-item', [
          badge(s.name, s.group),
          el('span.sub', `${s.code} · ${s.color} · thứ tự ${s.order}`)
        ])))))
  ]);
}
