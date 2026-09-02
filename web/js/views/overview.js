/** Trang Tổng quan: bức tranh danh mục trong một màn hình. */
import { el, fmtShort, fmtMoney, fmtPct, fmtRatio, fmtDate, fmtMonth, sortBy, groupBy, sum } from '../core.js';
import { state } from '../store.js';
import { evmAt, portfolio, health, alerts, alertCounts, progressSummary, paymentSummary } from '../calc.js';
import { kpi, kpiGrid, section, pageHead, badge, bar, empty, table } from '../ui.js';
import { lineChart, donut, PALETTE } from '../charts.js';

export function render() {
  const project = state.projects[0];
  const pf = portfolio();
  const alertList = alerts();
  const counts = alertCounts(alertList);

  return el('div.view', [
    pageHead(
      project ? project.name : 'Danh mục dự án',
      project
        ? `${project.code} · ${project.fund} · ${project.owner} · số liệu chốt ${fmtDate(state.asOf)}`
        : `Số liệu chốt ${fmtDate(state.asOf)}`
    ),
    projectStrip(project, pf),
    kpiGrid([
      kpi({
        label: 'Giá trị hợp đồng',
        value: fmtShort(pf.contractValue),
        hint: `${pf.packagesTotal} gói thầu · TMĐT ${fmtShort(project ? project.tmdt : 0)}`
      }),
      kpi({
        label: 'Giá trị thu được (EV)',
        value: fmtShort(pf.ev),
        hint: `${fmtPct(pf.pctComplete)} khối lượng · kế hoạch ${fmtPct(pf.pctPlanned)}`,
        tone: pf.sv >= 0 ? 'ok' : 'warn'
      }),
      kpi({
        label: 'Chi phí thực tế (AC)',
        value: fmtShort(pf.ac),
        hint: `${fmtPct(pf.pctSpent)} BAC · CV ${fmtShort(pf.cv)}`,
        tone: pf.cv >= 0 ? 'ok' : 'bad'
      }),
      kpi({
        label: 'SPI · CPI',
        value: `${fmtRatio(pf.spi)} · ${fmtRatio(pf.cpi)}`,
        hint: health(pf).label,
        tone: health(pf).tone
      }),
      kpi({
        label: 'Cảnh báo đang mở',
        value: String(counts.total),
        hint: `${counts.bad} nghiêm trọng · ${counts.warn} cần theo dõi`,
        tone: counts.bad ? 'bad' : counts.warn ? 'warn' : 'ok',
        onclick: () => document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth' })
      })
    ]),
    el('div.grid-2', [
      section('Đường cong chữ S toàn danh mục',
        pf.packagesWithEvm < pf.packagesTotal
          ? `Cộng dồn từ ${pf.packagesWithEvm}/${pf.packagesTotal} gói đã có số liệu EVM trong Fact_EVM`
          : 'Cộng dồn toàn bộ gói thầu',
        sCurve()),
      section('Cơ cấu giá trị hợp đồng', 'Theo gói thầu · Dim_GoiThau', splitDonut())
    ]),
    section('Gói thầu', 'Bấm vào dòng để mở trang chi tiết', packageTable()),
    alertsSection(alertList)
  ]);
}

function projectStrip(p, pf) {
  if (!p) return null;
  return el('div.strip', [
    stripItem('Chủ đầu tư', p.owner),
    stripItem('Ban QLDA', p.pmu),
    stripItem('Nguồn vốn', p.fund),
    stripItem('Địa điểm', p.location),
    stripItem('Thời gian', `${fmtDate(p.start)} – ${fmtDate(p.finish)}`),
    stripItem('Trạng thái', badge(p.status, 'Dự án')),
    stripItem('Đã giải ngân', `${fmtShort(pf.ac)} / ${fmtShort(pf.contractValue)}`)
  ]);
}

function stripItem(label, value) {
  return el('div.strip-item', [
    el('span.strip-label', label),
    el('span.strip-value', value instanceof Node ? value : String(value || '—'))
  ]);
}

/** Cộng dồn PV/EV/AC của mọi gói theo từng kỳ báo cáo. */
function sCurve() {
  if (!state.evm.length) return empty('Bảng Fact_EVM chưa có dữ liệu.');
  const byPeriod = groupBy(state.evm.filter((r) => r.period), (r) => r.period.getTime());
  const periods = sortBy([...byPeriod.keys()], (t) => t);
  const labels = periods.map((t) => fmtMonth(new Date(t)));
  const pick = (f) => periods.map((t) => sum(byPeriod.get(t), f));

  return lineChart({
    labels,
    height: 280,
    series: [
      { name: 'PV — Giá trị kế hoạch', values: pick('pv'), color: PALETTE[0], dash: '6 4' },
      { name: 'EV — Giá trị thu được', values: pick('ev'), color: PALETTE[1], area: true },
      { name: 'AC — Chi phí thực tế', values: pick('ac'), color: PALETTE[2] }
    ]
  });
}

function splitDonut() {
  const segs = sortBy(state.packages, (p) => -p.currentValue).map((p, i) => ({
    name: p.id,
    value: p.currentValue,
    color: PALETTE[i % PALETTE.length]
  }));
  const total = segs.reduce((a, b) => a + b.value, 0);
  return el('div', [
    donut({ segments: segs, center: fmtShort(total), sub: `${segs.length} gói thầu`, height: 210 }),
    el('ul.legend-list', segs.map((sgm, i) => el('li', [
      el('i', { style: { background: sgm.color } }),
      el('span.legend-name', sgm.name),
      el('span.legend-val', `${fmtShort(sgm.value)} · ${fmtPct(sgm.value / total, 0)}`)
    ])))
  ]);
}

function packageTable() {
  const rows = state.packages.map((p) => {
    const m = evmAt(p);
    const prog = progressSummary(p);
    const pay = paymentSummary(p);
    return { p, m, prog, pay, h: health(m) };
  });

  return table([
    {
      key: 'id', label: 'Gói thầu', width: '26%',
      value: (r) => r.p.id,
      render: (r) => el('div.cell-main', [
        el('strong', r.p.id),
        el('span.sub', r.p.shortName)
      ])
    },
    {
      key: 'contractor', label: 'Nhà thầu',
      value: (r) => (r.p.contractor ? r.p.contractor.name : ''),
      render: (r) => (r.p.contractor ? r.p.contractor.name : '—')
    },
    {
      key: 'value', label: 'Giá trị HĐ', align: 'right',
      value: (r) => r.p.currentValue,
      render: (r) => fmtMoney(r.p.currentValue)
    },
    {
      key: 'progress', label: 'Khối lượng', width: '14%',
      value: (r) => (r.m ? r.m.pctComplete : r.prog ? r.prog.actual : 0),
      render: (r) => {
        const v = r.m ? r.m.pctComplete : r.prog ? r.prog.actual : null;
        if (v === null) return el('span.muted', 'chưa có');
        return el('div', [bar(v, r.h.tone), el('span.sub', fmtPct(v))]);
      }
    },
    {
      key: 'spi', label: 'SPI', align: 'right',
      value: (r) => (r.m && r.m.spi !== null ? r.m.spi : -1),
      render: (r) => (r.m && r.m.spi !== null
        ? el('span.num.' + (r.m.spi >= 1 ? 'ok' : r.m.spi >= 0.95 ? 'warn' : 'bad'), fmtRatio(r.m.spi))
        : '—')
    },
    {
      key: 'cpi', label: 'CPI', align: 'right',
      value: (r) => (r.m && r.m.cpi !== null ? r.m.cpi : -1),
      render: (r) => (r.m && r.m.cpi !== null
        ? el('span.num.' + (r.m.cpi >= 1 ? 'ok' : r.m.cpi >= 0.95 ? 'warn' : 'bad'), fmtRatio(r.m.cpi))
        : '—')
    },
    {
      key: 'paid', label: 'Đã chi', align: 'right',
      value: (r) => r.pay.cashOut,
      render: (r) => el('div.cell-main.right', [
        el('span', fmtShort(r.pay.cashOut)),
        el('span.sub', r.pay.paidPct !== null ? fmtPct(r.pay.paidPct, 0) : '—')
      ])
    },
    {
      key: 'status', label: 'Trạng thái',
      value: (r) => r.p.status,
      render: (r) => badge(r.p.status, 'Gói thầu')
    }
  ], rows, {
    sortKey: 'id',
    onRow: (r) => { location.hash = `#/goi-thau/${r.p.id}`; }
  });
}

function alertsSection(list) {
  const box = el('div#alerts');
  const body = list.length
    ? el('ul.alert-list', list.slice(0, 40).map((a) => el('li.alert.' + a.level, [
      el('span.alert-kind', a.kind),
      el('div.alert-main', [
        a.link ? el('a.alert-title', { href: a.link }, a.title) : el('span.alert-title', a.title),
        el('span.sub', a.detail)
      ])
    ])))
    : empty('Không có cảnh báo nào.', 'Mọi mốc hợp đồng, tiến độ và hồ sơ đều trong ngưỡng cho phép.');

  box.appendChild(section(
    'Cảnh báo & việc cần xử lý',
    `Đối chiếu theo ngày chốt ${fmtDate(state.asOf)}` + (list.length > 40 ? ` · hiển thị 40/${list.length}` : ''),
    body
  ));
  return box;
}
