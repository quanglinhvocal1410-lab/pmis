/**
 * Báo cáo tiến độ — dàn sẵn khổ A4, Ctrl+P là ra PDF.
 *
 * Mọi con số ở đây đều được tính lại từ dữ liệu thô trong bảng tính tại
 * thời điểm mở trang, không có số nào gõ tay. Bố cục theo mạch quen thuộc
 * của báo cáo Ban QLDA: thông tin chung → khối lượng → chi phí → tiến độ →
 * giải ngân → hồ sơ → cảnh báo và kiến nghị.
 */
import {
  el, fmtShort, fmtMoney, fmtPct, fmtRatio, fmtDate, fmtMonth, fmtSigned,
  daysBetween, sortBy, groupBy, sum
} from '../core.js';
import { state, packageOptions } from '../store.js';
import {
  evmAt, evmSeries, portfolio, health, latestProgress, progressSummary,
  paymentSummary, disbursementSummary, alerts, timeElapsed
} from '../calc.js';
import { pageHead, table, badge, empty, btn, filterBar } from '../ui.js';
import { lineChart, gantt, PALETTE } from '../charts.js';

export function render(params) {
  const box = el('div');

  const draw = (f) => {
    const pkg = f.pkg ? state.byId.package[f.pkg] : null;
    box.replaceChildren(sheet(pkg));
  };

  const controls = el('div.report-controls.no-print', [
    filterBar([
      {
        type: 'select', key: 'pkg', label: 'Phạm vi báo cáo', value: params.pkg || '',
        allLabel: 'Toàn dự án',
        options: packageOptions().map((p) => ({ value: p.id, label: `${p.id} — ${p.shortName}` }))
      }
    ], draw),
    btn('In / Lưu PDF', () => window.print(), 'primary')
  ]);

  draw({ pkg: params.pkg || '' });

  return el('div.view.report-view', [
    el('div.no-print', pageHead('Báo cáo',
      'Bấm "In / Lưu PDF" rồi chọn máy in "Microsoft Print to PDF" hoặc "Lưu dưới dạng PDF"')),
    controls,
    box
  ]);
}

// --------------------------------------------------------- TỜ BÁO CÁO

function sheet(pkg) {
  const project = state.projects[0];
  const scope = pkg ? [pkg] : state.packages;
  const pf = portfolio(scope);
  const alertList = alerts().filter((a) => !pkg || !a.link || a.link.includes(pkg.id));

  return el('article.report', [
    header(project, pkg),
    block('1. Thông tin chung', generalBlock(project, pkg, scope)),
    block('2. Tổng hợp khối lượng và chi phí', evmBlock(pf, scope)),
    scope.some((p) => p.evm.length) ? block('3. Diễn biến giá trị thu được', curveBlock(scope)) : null,
    block('4. Tiến độ thi công', scheduleBlock(scope)),
    block('5. Giải ngân', disbBlock(scope)),
    block('6. Thanh toán và dòng tiền', cashBlock(scope)),
    block('7. Hồ sơ', docBlock(scope)),
    block('8. Cảnh báo và kiến nghị', alertBlock(alertList, pf)),
    footer()
  ]);
}

function header(project, pkg) {
  return el('header.report-head', [
    el('div.report-org', [
      el('strong', project ? project.owner || '—' : '—'),
      el('span', project ? project.pmu || '' : '')
    ]),
    el('h1.report-title', 'BÁO CÁO TÌNH HÌNH THỰC HIỆN'),
    el('p.report-subject', pkg
      ? `Gói thầu ${pkg.id} — ${pkg.shortName}`
      : (project ? project.name : 'Danh mục dự án')),
    el('p.report-period', `Số liệu chốt đến ngày ${fmtDate(state.asOf)}`)
  ]);
}

function block(title, body) {
  if (!body) return null;
  return el('section.report-block', [el('h2', title), body]);
}

function footer() {
  return el('footer.report-foot', [
    el('div.sign', [el('p', 'NGƯỜI LẬP BIỂU'), el('p.sub', '(Ký, ghi rõ họ tên)')]),
    el('div.sign', [el('p', 'PHỤ TRÁCH BỘ PHẬN'), el('p.sub', '(Ký, ghi rõ họ tên)')]),
    el('div.sign', [el('p', 'GIÁM ĐỐC BAN QLDA'), el('p.sub', '(Ký, ghi rõ họ tên)')])
  ]);
}

/** Bảng 2 cột dùng lại nhiều lần trong báo cáo. */
function facts(pairs) {
  return el('table.report-facts', el('tbody', pairs.filter(Boolean).map(([k, v]) =>
    el('tr', [el('th', k), el('td', v instanceof Node ? v : String(v ?? '—'))])
  )));
}

// ------------------------------------------------------------- KHỐI 1

function generalBlock(project, pkg, scope) {
  if (!project && !scope.length) {
    return empty('Chưa có dữ liệu dự án hoặc gói thầu.', 'Nhập ở trang Nhập liệu rồi mở lại báo cáo.');
  }
  if (pkg) {
    const c = pkg.contract;
    const elapsed = timeElapsed(pkg);
    return facts([
      ['Dự án', project ? project.name : '—'],
      ['Gói thầu', `${pkg.code} — ${pkg.name}`],
      ['Nhà thầu thi công', pkg.contractor ? pkg.contractor.name : '—'],
      ['Tư vấn giám sát', pkg.consultant ? pkg.consultant.name : '—'],
      ['Hình thức lựa chọn', pkg.procurement],
      ['Loại hợp đồng', pkg.contractType],
      ['Số hợp đồng', c ? c.no : '—'],
      ['Giá hợp đồng', fmtMoney(pkg.currentValue) + ' đồng'],
      ['Thời gian thực hiện', `${fmtDate(pkg.start)} — ${fmtDate(pkg.finish)}`],
      ['Thời gian đã dùng', elapsed === null ? '—' : fmtPct(elapsed, 0)],
      ['Giai đoạn', pkg.phase],
      ['Trạng thái', badge(pkg.status, 'Gói thầu')]
    ]);
  }
  return el('div', [
    facts([
      ['Tên dự án', project ? project.name : '—'],
      ['Mã dự án', project ? project.code : '—'],
      ['Chủ đầu tư', project ? project.owner : '—'],
      ['Ban QLDA', project ? project.pmu : '—'],
      ['Nguồn vốn', project ? project.fund : '—'],
      ['Địa điểm', project ? project.location : '—'],
      ['Tổng mức đầu tư', project ? fmtMoney(project.tmdt) + ' đồng' : '—'],
      ['Thời gian thực hiện', project ? `${fmtDate(project.start)} — ${fmtDate(project.finish)}` : '—'],
      ['Số gói thầu', String(scope.length)],
      ['Tổng giá trị hợp đồng', fmtMoney(sum(scope, 'currentValue')) + ' đồng']
    ]),
    scope.length ? packageList(scope) : null
  ]);
}

function packageList(scope) {
  return table([
    { key: 'id', label: 'Mã', width: '8%' },
    { key: 'name', label: 'Tên gói thầu', width: '32%', value: (p) => p.shortName, render: (p) => p.shortName },
    { key: 'contractor', label: 'Nhà thầu', value: (p) => (p.contractor ? p.contractor.name : ''), render: (p) => (p.contractor ? p.contractor.name : '—') },
    { key: 'value', label: 'Giá trị HĐ', align: 'right', value: (p) => p.currentValue, render: (p) => fmtMoney(p.currentValue) },
    { key: 'start', label: 'Khởi công', value: (p) => p.start, render: (p) => fmtDate(p.start) },
    { key: 'finish', label: 'Hoàn thành', value: (p) => p.finish, render: (p) => fmtDate(p.finish) },
    { key: 'status', label: 'Trạng thái', render: (p) => badge(p.status, 'Gói thầu') }
  ], scope, { sortKey: 'id' });
}

// ------------------------------------------------------------- KHỐI 2

function evmBlock(pf, scope) {
  const rows = scope.map((p) => ({ p, m: evmAt(p) })).filter((r) => r.m);
  if (!rows.length) {
    return empty('Chưa có kỳ EVM nào trong Fact_EVM.',
      'Nhập BAC, PV, EV, AC cho từng kỳ — các chỉ số còn lại sẽ tự sinh.');
  }
  return el('div', [
    facts([
      ['BAC — Ngân sách khi hoàn thành', fmtMoney(pf.bac) + ' đồng'],
      ['PV — Giá trị kế hoạch', `${fmtMoney(pf.pv)} đồng (${fmtPct(pf.pctPlanned)} BAC)`],
      ['EV — Giá trị thu được', `${fmtMoney(pf.ev)} đồng (${fmtPct(pf.pctComplete)} BAC)`],
      ['AC — Chi phí thực tế', `${fmtMoney(pf.ac)} đồng (${fmtPct(pf.pctSpent)} BAC)`],
      ['SV — Sai lệch tiến độ', signed(pf.sv)],
      ['CV — Sai lệch chi phí', signed(pf.cv)],
      ['SPI / CPI', `${fmtRatio(pf.spi)} / ${fmtRatio(pf.cpi)}`],
      ['EAC — Dự báo chi phí hoàn thành', fmtMoney(pf.eac) + ' đồng'],
      ['VAC — Chênh so với ngân sách', signed(pf.vac)],
      ['TCPI — Hiệu suất cần đạt phần còn lại', fmtRatio(pf.tcpi)],
      ['Đánh giá chung', el('strong', health(pf).label)]
    ]),
    rows.length > 1 ? table([
      { key: 'id', label: 'Gói', value: (r) => r.p.id, render: (r) => r.p.id },
      { key: 'period', label: 'Kỳ', value: (r) => r.m.period, render: (r) => fmtMonth(r.m.period) },
      { key: 'bac', label: 'BAC', align: 'right', value: (r) => r.m.bac, render: (r) => fmtMoney(r.m.bac) },
      { key: 'ev', label: 'EV', align: 'right', value: (r) => r.m.ev, render: (r) => fmtMoney(r.m.ev) },
      { key: 'ac', label: 'AC', align: 'right', value: (r) => r.m.ac, render: (r) => fmtMoney(r.m.ac) },
      { key: 'spi', label: 'SPI', align: 'right', value: (r) => r.m.spi, render: (r) => fmtRatio(r.m.spi) },
      { key: 'cpi', label: 'CPI', align: 'right', value: (r) => r.m.cpi, render: (r) => fmtRatio(r.m.cpi) },
      { key: 'eac', label: 'EAC', align: 'right', value: (r) => r.m.eac, render: (r) => fmtMoney(r.m.eac) },
      { key: 'done', label: '% hoàn thành', align: 'right', value: (r) => r.m.pctComplete, render: (r) => fmtPct(r.m.pctComplete) }
    ], rows, { sortKey: 'id' }) : null
  ]);
}

function signed(v) {
  if (v === null || v === undefined) return '—';
  return el('span.num.' + (v >= 0 ? 'ok' : 'bad'), fmtSigned(v) + ' đồng');
}

// ------------------------------------------------------------- KHỐI 3

function curveBlock(scope) {
  const all = scope.flatMap((p) => evmSeries(p)).filter((r) => r.period);
  if (!all.length) return null;
  const byPeriod = groupBy(all, (r) => r.period.getTime());
  const periods = sortBy([...byPeriod.keys()], (t) => t);
  const pick = (f) => periods.map((t) => sum(byPeriod.get(t), f));
  return lineChart({
    labels: periods.map((t) => fmtMonth(new Date(t))),
    height: 260,
    series: [
      { name: 'PV — kế hoạch', values: pick('pv'), color: PALETTE[0], dash: '6 4' },
      { name: 'EV — thu được', values: pick('ev'), color: PALETTE[1], area: true },
      { name: 'AC — chi phí thực tế', values: pick('ac'), color: PALETTE[2] }
    ]
  });
}

// ------------------------------------------------------------- KHỐI 4

function scheduleBlock(scope) {
  const acts = scope.flatMap((p) => latestProgress(p).map((a) => ({ ...a, pkg: p })));
  if (!acts.length) return empty('Chưa có dữ liệu tiến độ trong Fact_TienDo.');

  const behind = sortBy(acts.filter((a) => a.variancePct < 0), (a) => a.variancePct);
  const single = scope.length === 1 ? progressSummary(scope[0]) : null;

  return el('div', [
    facts([
      ['Số hạng mục theo dõi', String(acts.length)],
      ['Tiến độ kế hoạch bình quân', fmtPct(acts.reduce((s, a) => s + a.plannedPct, 0) / acts.length)],
      ['Tiến độ thực tế bình quân', fmtPct(acts.reduce((s, a) => s + a.actualPct, 0) / acts.length)],
      ['Số hạng mục chậm', `${behind.length} / ${acts.length}`],
      ['Số hạng mục mức nghiêm trọng Cao', String(acts.filter((a) => a.severity === 'Cao').length)],
      single ? ['Trượt tiến độ lớn nhất', `${single.maxSlipDays} ngày`] : null
    ]),
    gantt({
      rows: sortBy(acts, (a) => a.planStart || 0).map((a) => ({
        name: (scope.length > 1 ? a.pkg.id + ' · ' : '') + a.name,
        planStart: a.planStart, planFinish: a.planFinish,
        actStart: a.actStart, actFinish: a.actFinish,
        forecastFinish: a.forecastFinish, actualPct: a.actualPct,
        tone: a.variancePct >= 0 ? 'ok' : a.severity === 'Cao' ? 'bad' : 'warn'
      })),
      asOf: state.asOf
    }),
    behind.length ? el('div', [
      el('h3.report-sub', 'Các hạng mục đang chậm'),
      table([
        { key: 'activityId', label: 'Mã WBS', width: '13%' },
        { key: 'name', label: 'Hạng mục', width: '28%' },
        { key: 'planFinish', label: 'KH hoàn thành', value: (r) => r.planFinish, render: (r) => fmtDate(r.planFinish) },
        { key: 'forecastFinish', label: 'Dự báo', value: (r) => r.forecastFinish, render: (r) => fmtDate(r.forecastFinish) },
        {
          key: 'slip', label: 'Trượt (ngày)', align: 'right',
          value: (r) => daysBetween(r.planFinish, r.forecastFinish) || 0,
          render: (r) => {
            const d = daysBetween(r.planFinish, r.forecastFinish);
            return d === null ? '—' : (d > 0 ? `+${d}` : String(d));
          }
        },
        { key: 'plannedPct', label: 'KH %', align: 'right', render: (r) => fmtPct(r.plannedPct, 0) },
        { key: 'actualPct', label: 'TT %', align: 'right', render: (r) => fmtPct(r.actualPct, 0) },
        { key: 'variancePct', label: 'Lệch', align: 'right', render: (r) => fmtPct(r.variancePct, 0) },
        { key: 'severity', label: 'Mức', render: (r) => badge(r.severity, 'Tiến độ') },
        { key: 'owner', label: 'Phụ trách' }
      ], behind, { sortKey: 'variancePct' })
    ]) : null
  ]);
}

// ------------------------------------------------------------- KHỐI 5

function disbBlock(scope) {
  const list = scope.flatMap((p) => p.disbursement).filter((r) => r.period);
  if (!list.length) return empty('Chưa có dữ liệu giải ngân trong Fact_GiaiNgan.');

  const byPeriod = groupBy(list, (r) => r.period.getTime());
  const periods = sortBy([...byPeriod.keys()], (t) => t);
  const rows = periods.map((t) => {
    const g = byPeriod.get(t);
    return {
      period: new Date(t),
      planMonth: sum(g, 'planMonth'),
      actMonth: sum(g, 'actMonth'),
      planCum: sum(g, 'planCum'),
      actCum: sum(g, 'actCum'),
      budgetLeft: sum(g, 'budgetLeft')
    };
  });
  const last = rows[rows.length - 1];
  const single = scope.length === 1 ? disbursementSummary(scope[0]) : null;

  return el('div', [
    facts([
      ['Kỳ gần nhất', fmtMonth(last.period)],
      ['Kế hoạch luỹ kế', fmtMoney(last.planCum) + ' đồng'],
      ['Thực hiện luỹ kế', fmtMoney(last.actCum) + ' đồng'],
      ['Chênh lệch', signed(last.actCum - last.planCum)],
      ['Tỉ lệ đạt kế hoạch', fmtPct(last.planCum ? last.actCum / last.planCum : 0)],
      ['Ngân sách còn lại', fmtMoney(last.budgetLeft) + ' đồng'],
      single && single.forecast ? ['Dự báo cả năm', fmtMoney(single.forecast) + ' đồng'] : null
    ]),
    lineChart({
      labels: rows.map((r) => fmtMonth(r.period)),
      height: 220,
      series: [
        { name: 'Kế hoạch luỹ kế', values: rows.map((r) => r.planCum), color: PALETTE[0], dash: '6 4' },
        { name: 'Thực hiện luỹ kế', values: rows.map((r) => r.actCum), color: PALETTE[1], area: true }
      ]
    }),
    table([
      { key: 'period', label: 'Kỳ', value: (r) => r.period, render: (r) => fmtMonth(r.period) },
      { key: 'planMonth', label: 'KH tháng', align: 'right', render: (r) => fmtMoney(r.planMonth) },
      { key: 'actMonth', label: 'TH tháng', align: 'right', render: (r) => fmtMoney(r.actMonth) },
      { key: 'planCum', label: 'KH luỹ kế', align: 'right', render: (r) => fmtMoney(r.planCum) },
      { key: 'actCum', label: 'TH luỹ kế', align: 'right', render: (r) => fmtMoney(r.actCum) },
      {
        key: 'rate', label: 'Đạt KH', align: 'right',
        value: (r) => (r.planCum ? r.actCum / r.planCum : 0),
        render: (r) => fmtPct(r.planCum ? r.actCum / r.planCum : 0, 0)
      }
    ], rows, { sortKey: 'period' })
  ]);
}

// ------------------------------------------------------------- KHỐI 6

function cashBlock(scope) {
  const agg = scope.reduce((a, p) => {
    const s = paymentSummary(p);
    a.value += s.contractValue; a.advance += s.advance;
    a.recovered += s.advanceRecovered; a.outstanding += s.advanceOutstanding;
    a.paid += s.paid; a.certified += s.certified; a.requested += s.requested;
    a.retention += s.retentionHeld; a.deducted += s.deducted; a.ipc += s.ipcCount;
    return a;
  }, { value: 0, advance: 0, recovered: 0, outstanding: 0, paid: 0, certified: 0, requested: 0, retention: 0, deducted: 0, ipc: 0 });
  const cashOut = agg.advance + agg.paid;
  const pays = scope.flatMap((p) => p.payments);

  return el('div', [
    facts([
      ['Giá trị hợp đồng', fmtMoney(agg.value) + ' đồng'],
      ['Tạm ứng đã cấp', fmtMoney(agg.advance) + ' đồng'],
      ['Đã thu hồi tạm ứng', fmtMoney(agg.recovered) + ' đồng'],
      ['Tạm ứng còn phải thu hồi', el('strong', fmtMoney(agg.outstanding) + ' đồng')],
      ['Số đợt IPC', String(agg.ipc)],
      ['Giá trị đề nghị', fmtMoney(agg.requested) + ' đồng'],
      ['Giá trị chứng nhận', fmtMoney(agg.certified) + ' đồng'],
      ['Cắt giảm khi thẩm tra', fmtMoney(agg.deducted) + ' đồng'],
      ['Đã thanh toán (IPC)', fmtMoney(agg.paid) + ' đồng'],
      ['Đang giữ lại (retention)', fmtMoney(agg.retention) + ' đồng'],
      ['Tổng đã chi', `${fmtMoney(cashOut)} đồng (${fmtPct(agg.value ? cashOut / agg.value : 0)})`],
      ['Còn lại của hợp đồng', fmtMoney(Math.max(0, agg.value - cashOut)) + ' đồng']
    ]),
    pays.length ? table([
      { key: 'pkg', label: 'Gói', value: (r) => r.packageId, render: (r) => r.packageId },
      { key: 'ipc', label: 'Đợt' },
      { key: 'requestDate', label: 'Đề nghị', value: (r) => r.requestDate, render: (r) => fmtDate(r.requestDate) },
      { key: 'paidDate', label: 'Thanh toán', value: (r) => r.paidDate, render: (r) => fmtDate(r.paidDate) },
      { key: 'requested', label: 'Đề nghị', align: 'right', render: (r) => fmtMoney(r.requested) },
      { key: 'certified', label: 'Chứng nhận', align: 'right', render: (r) => fmtMoney(r.certified) },
      { key: 'paid', label: 'Thực trả', align: 'right', render: (r) => fmtMoney(r.paid) },
      { key: 'advanceRecovery', label: 'Thu hồi TƯ', align: 'right', render: (r) => fmtMoney(r.advanceRecovery) },
      { key: 'retention', label: 'Giữ lại', align: 'right', render: (r) => fmtMoney(r.retention) },
      { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Thanh toán') }
    ], pays, { sortKey: 'requestDate' }) : empty('Chưa có đợt thanh toán nào trong Fact_ThanhToan.')
  ]);
}

// ------------------------------------------------------------- KHỐI 7

function docBlock(scope) {
  const docs = scope.flatMap((p) => p.docs);
  if (!docs.length) return empty('Chưa có hồ sơ nào trong Fact_HoSo.');
  const byGroup = groupBy(docs, 'group');
  const rows = [...byGroup].map(([group, list]) => ({
    group: group || '(chưa phân nhóm)',
    total: list.length,
    done: list.filter((d) => !/(cần bổ sung|chờ|đang)/i.test(d.status || '')).length,
    pending: list.filter((d) => /(cần bổ sung|chờ|đang)/i.test(d.status || '')).length
  }));
  const pending = docs.filter((d) => /(cần bổ sung|chờ|đang)/i.test(d.status || ''));

  return el('div', [
    table([
      { key: 'group', label: 'Nhóm hồ sơ', width: '40%' },
      { key: 'total', label: 'Tổng', align: 'right' },
      { key: 'done', label: 'Đã hoàn tất', align: 'right' },
      { key: 'pending', label: 'Đang chờ', align: 'right' }
    ], rows, { sortKey: 'total', sortDir: -1 }),
    pending.length ? el('div', [
      el('h3.report-sub', 'Hồ sơ cần xử lý'),
      table([
        { key: 'id', label: 'Mã', width: '9%' },
        { key: 'content', label: 'Nội dung', width: '36%' },
        { key: 'ref', label: 'Số hiệu' },
        { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Hồ sơ') },
        { key: 'party', label: 'Bên chịu trách nhiệm' }
      ], pending, { sortKey: 'id' })
    ]) : null
  ]);
}

// ------------------------------------------------------------- KHỐI 8

function alertBlock(list, pf) {
  const advice = [];
  if (pf.spi !== null && pf.spi < 1) {
    advice.push(`Tiến độ đang chậm (SPI ${fmtRatio(pf.spi)}, tương đương ${fmtShort(-pf.sv)} khối lượng). Đề nghị nhà thầu lập lại tiến độ chi tiết cho các hạng mục găng và bổ sung nhân lực.`);
  }
  if (pf.cpi !== null && pf.cpi < 1) {
    advice.push(`Chi phí vượt kế hoạch (CPI ${fmtRatio(pf.cpi)}). Dự báo chi phí khi hoàn thành ${fmtShort(pf.eac)}, vượt ${fmtShort(-pf.vac)} so với ngân sách — cần rà soát khối lượng phát sinh trước khi phê duyệt đợt thanh toán tiếp theo.`);
  }
  if (pf.tcpi !== null && pf.tcpi > 1.1) {
    advice.push(`Để về đúng ngân sách, phần việc còn lại phải đạt hiệu suất chi phí ${fmtRatio(pf.tcpi)} — cao hơn năng lực hiện tại, nên cân nhắc điều chỉnh ngân sách hoặc phạm vi.`);
  }
  const bonds = list.filter((a) => a.kind === 'Hợp đồng');
  if (bonds.length) advice.push(`Có ${bonds.length} mốc hợp đồng (bảo lãnh, bảo hiểm) sắp hoặc đã hết hiệu lực — yêu cầu nhà thầu gia hạn trước khi trình đợt thanh toán kế tiếp.`);
  if (!advice.length) advice.push('Các chỉ số tiến độ và chi phí đều trong ngưỡng kiểm soát. Duy trì nhịp báo cáo và cập nhật số liệu hằng tháng.');

  return el('div', [
    list.length ? table([
      { key: 'kind', label: 'Nhóm', width: '13%' },
      { key: 'level', label: 'Mức', width: '10%', render: (r) => el('span.badge.' + r.level, r.level === 'bad' ? 'Nghiêm trọng' : 'Theo dõi') },
      { key: 'title', label: 'Nội dung', width: '40%' },
      { key: 'detail', label: 'Chi tiết' }
    ], list, { sortKey: 'level' }) : empty('Không có cảnh báo nào.'),
    el('h3.report-sub', 'Kiến nghị'),
    el('ol.report-advice', advice.map((a) => el('li', a)))
  ]);
}
