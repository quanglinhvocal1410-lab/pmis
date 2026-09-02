/** Trang Tài chính: giải ngân theo tháng và các đợt thanh toán IPC. */
import { el, fmtShort, fmtMoney, fmtPct, fmtMonth, fmtDate, fmtSigned, sortBy, sum, groupBy } from '../core.js';
import { state, packageOptions } from '../store.js';
import { paymentSummary } from '../calc.js';
import { pageHead, section, kpi, kpiGrid, table, badge, filterBar, empty, defList } from '../ui.js';
import { openRecord, openEditor, addButton, emptyWithAdd } from '../editor.js';
import { TABLE } from '../store.js';
import { lineChart, barChart, PALETTE } from '../charts.js';

export function render(params) {
  const box = el('div');
  const draw = (f) => {
    const pkg = f.pkg ? state.byId.package[f.pkg] : null;
    box.replaceChildren(...body(pkg));
  };

  const bar1 = filterBar([
    {
      type: 'select', key: 'pkg', label: 'Gói thầu', value: params.pkg || '',
      allLabel: 'Toàn danh mục',
      options: packageOptions().map((p) => ({ value: p.id, label: `${p.id} — ${p.shortName}` }))
    }
  ], draw);

  draw({ pkg: params.pkg || '' });

  return el('div.view', [
    pageHead('Giải ngân & thanh toán',
      `Fact_GiaiNgan (${state.disbursement.length} kỳ) · Fact_ThanhToan (${state.payments.length} đợt)`),
    bar1,
    box
  ]);
}

function body(pkg) {
  const disb = pkg ? pkg.disbursement : state.disbursement;
  const pays = pkg ? pkg.payments : state.payments;
  const pkgs = pkg ? [pkg] : state.packages;

  const cash = pkgs.reduce((acc, p) => {
    const s = paymentSummary(p);
    acc.advance += s.advance;
    acc.recovered += s.advanceRecovered;
    acc.outstanding += s.advanceOutstanding;
    acc.paid += s.paid;
    acc.retention += s.retentionHeld;
    acc.deducted += s.deducted;
    acc.value += s.contractValue;
    return acc;
  }, { advance: 0, recovered: 0, outstanding: 0, paid: 0, retention: 0, deducted: 0, value: 0 });
  const cashOut = cash.advance + cash.paid;

  const out = [
    kpiGrid([
      kpi({ label: 'Giá trị hợp đồng', value: fmtShort(cash.value), hint: `${pkgs.length} gói thầu` }),
      kpi({ label: 'Đã chi', value: fmtShort(cashOut), hint: `${fmtPct(cash.value ? cashOut / cash.value : 0)} giá trị HĐ` }),
      kpi({ label: 'Tạm ứng còn phải thu hồi', value: fmtShort(cash.outstanding), hint: `Đã cấp ${fmtShort(cash.advance)} · thu hồi ${fmtShort(cash.recovered)}`, tone: cash.outstanding ? 'warn' : 'ok' }),
      kpi({ label: 'Đang giữ lại', value: fmtShort(cash.retention), hint: 'Retention theo hợp đồng' }),
      kpi({ label: 'Cắt giảm khi thẩm tra', value: fmtShort(cash.deducted), hint: 'Đề nghị − chứng nhận', tone: cash.deducted ? 'warn' : 'ok' }),
      kpi({ label: 'Còn lại của hợp đồng', value: fmtShort(Math.max(0, cash.value - cashOut)) })
    ])
  ];

  if (disb.length) {
    out.push(section('Giải ngân luỹ kế',
      pkg ? `${pkg.id} · ${disb.length} kỳ` : 'Cộng dồn mọi gói thầu có số liệu',
      disbCharts(disb)));
    out.push(section('Chi tiết theo tháng', 'Fact_GiaiNgan', disbTable(disb, !pkg)));
  } else {
    out.push(section('Giải ngân luỹ kế', 'Fact_GiaiNgan',
      emptyWithAdd(TABLE.GiaiNgan, 'Chưa có dữ liệu giải ngân cho lựa chọn này.', {
        label: '+ Thêm kỳ giải ngân',
        defaults: pkg ? { ID_Goi_Thau: pkg.id, ID_Du_An: pkg.projectId } : {}
      })));
  }

  out.push(section('Các đợt thanh toán IPC',
    `${pays.length} đợt · ${pays.filter((p) => !p.paidDate).length} đợt chưa thanh toán`,
    pays.length ? payTable(pays, !pkg) : emptyWithAdd(TABLE.ThanhToan, 'Chưa có đợt thanh toán nào.', {
      label: '+ Thêm đợt IPC',
      defaults: pkg ? { ID_Goi_Thau: pkg.id, Hop_Dong_ID: pkg.contract ? pkg.contract.id : '' } : {}
    }),
    [addButton(TABLE.ThanhToan, {
      label: '+ Thêm đợt IPC',
      defaults: pkg ? { ID_Goi_Thau: pkg.id, Hop_Dong_ID: pkg.contract ? pkg.contract.id : '' } : {}
    })]));

  if (pkg && pkg.contract) out.push(section('Điều khoản tiền của hợp đồng', pkg.contract.no, terms(pkg)));

  return out;
}

/** Gộp các kỳ cùng tháng của nhiều gói lại thành một chuỗi. */
function mergePeriods(disb) {
  const byPeriod = groupBy(disb.filter((r) => r.period), (r) => r.period.getTime());
  const keys = sortBy([...byPeriod.keys()], (t) => t);
  return keys.map((t) => {
    const list = byPeriod.get(t);
    return {
      period: new Date(t),
      planMonth: sum(list, 'planMonth'),
      actMonth: sum(list, 'actMonth'),
      planCum: sum(list, 'planCum'),
      actCum: sum(list, 'actCum'),
      budgetLeft: sum(list, 'budgetLeft')
    };
  });
}

function disbCharts(disb) {
  const s = mergePeriods(disb);
  const labels = s.map((r) => fmtMonth(r.period));
  const last = s[s.length - 1];
  return el('div', [
    lineChart({
      labels, height: 280,
      series: [
        { name: 'Kế hoạch luỹ kế', values: s.map((r) => r.planCum), color: PALETTE[0], dash: '6 4' },
        { name: 'Thực tế luỹ kế', values: s.map((r) => r.actCum), color: PALETTE[1], area: true }
      ]
    }),
    barChart({
      labels, height: 220,
      series: [
        { name: 'Kế hoạch tháng', values: s.map((r) => r.planMonth), color: PALETTE[0] },
        { name: 'Thực hiện tháng', values: s.map((r) => r.actMonth), color: PALETTE[1] }
      ]
    }),
    last ? el('p.sub', `Đến ${fmtMonth(last.period)}: thực hiện ${fmtMoney(last.actCum)} / kế hoạch ${fmtMoney(last.planCum)} `
      + `(${fmtPct(last.planCum ? last.actCum / last.planCum : 0)}), chênh ${fmtSigned(last.actCum - last.planCum)}.`) : null
  ]);
}

function disbTable(disb, showPkg) {
  const cols = [];
  if (showPkg) cols.push({ key: 'packageId', label: 'Gói', render: (r) => el('a', { href: `#/goi-thau/${r.packageId}` }, r.packageId) });
  cols.push(
    { key: 'period', label: 'Kỳ', value: (r) => r.period, render: (r) => fmtMonth(r.period) },
    { key: 'planMonth', label: 'KH tháng', align: 'right', render: (r) => fmtMoney(r.planMonth) },
    { key: 'actMonth', label: 'TT tháng', align: 'right', render: (r) => fmtMoney(r.actMonth) },
    { key: 'planCum', label: 'KH luỹ kế', align: 'right', render: (r) => fmtMoney(r.planCum) },
    { key: 'actCum', label: 'TT luỹ kế', align: 'right', render: (r) => fmtMoney(r.actCum) },
    {
      key: 'variance', label: 'Sai lệch', align: 'right',
      render: (r) => el('span.num.' + (r.variance >= 0 ? 'ok' : 'bad'), fmtSigned(r.variance))
    },
    {
      key: 'achieve', label: 'Đạt KH', align: 'right',
      value: (r) => (r.planCum ? r.actCum / r.planCum : 0),
      render: (r) => fmtPct(r.planCum ? r.actCum / r.planCum : 0, 0)
    },
    { key: 'budgetLeft', label: 'Ngân sách còn', align: 'right', render: (r) => fmtMoney(r.budgetLeft) }
  );
  return table(cols, disb, {
    sortKey: 'period', sortDir: -1,
    onRow: (r) => openRecord(TABLE.GiaiNgan, r.row, { title: fmtMonth(r.period), subtitle: r.id }),
    onEdit: (r) => openEditor(TABLE.GiaiNgan, r.row)
  });
}

function payTable(pays, showPkg) {
  const cols = [];
  if (showPkg) cols.push({ key: 'packageId', label: 'Gói', render: (r) => el('a', { href: `#/goi-thau/${r.packageId}` }, r.packageId) });
  cols.push(
    { key: 'ipc', label: 'Đợt', width: '9%' },
    { key: 'requestDate', label: 'Đề nghị', value: (r) => r.requestDate, render: (r) => fmtDate(r.requestDate) },
    { key: 'certDate', label: 'Chứng nhận', value: (r) => r.certDate, render: (r) => fmtDate(r.certDate) },
    { key: 'paidDate', label: 'Thanh toán', value: (r) => r.paidDate, render: (r) => fmtDate(r.paidDate) },
    {
      key: 'lead', label: 'Số ngày xử lý', align: 'right',
      value: (r) => (r.requestDate && r.paidDate ? (r.paidDate - r.requestDate) / 86400000 : 0),
      render: (r) => (r.requestDate && r.paidDate ? `${Math.round((r.paidDate - r.requestDate) / 86400000)} ngày` : '—')
    },
    { key: 'requested', label: 'Đề nghị', align: 'right', render: (r) => fmtMoney(r.requested) },
    { key: 'certified', label: 'Chứng nhận', align: 'right', render: (r) => fmtMoney(r.certified) },
    { key: 'paid', label: 'Thực trả', align: 'right', render: (r) => el('strong', fmtMoney(r.paid)) },
    { key: 'advanceRecovery', label: 'Thu hồi TƯ', align: 'right', render: (r) => fmtMoney(r.advanceRecovery) },
    { key: 'retention', label: 'Giữ lại', align: 'right', render: (r) => fmtMoney(r.retention) },
    { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Thanh toán') }
  );
  return table(cols, pays, {
    sortKey: 'ipc', sortDir: -1,
    onRow: (r) => openRecord(TABLE.ThanhToan, r.row, {
      title: `Đợt thanh toán ${r.ipc || '?'}`, subtitle: r.id
    }),
    onEdit: (r) => openEditor(TABLE.ThanhToan, r.row)
  });
}

function terms(pkg) {
  const c = pkg.contract;
  const s = paymentSummary(pkg);
  return defList([
    ['Tạm ứng theo hợp đồng', `${fmtPct(c.advancePct, 0)} = ${fmtMoney(s.advance)}`],
    ['Đã thu hồi', fmtMoney(s.advanceRecovered)],
    ['Còn phải thu hồi', el('strong', fmtMoney(s.advanceOutstanding))],
    ['Tỉ lệ giữ lại', fmtPct(c.retentionPct, 0)],
    ['Bảo lãnh thực hiện', `${fmtPct(c.perfBondPct, 0)} = ${fmtMoney(c.value * c.perfBondPct)} · hiệu lực đến ${fmtDate(c.perfBondExpiry)}`],
    ['Phạt chậm tiến độ', `${fmtPct(c.ldPctPerDay, 2)} giá trị hợp đồng mỗi ngày`],
    ['Thời hạn thông báo sai sót (DNP)', `${c.dnpMonths} tháng`]
  ]);
}
