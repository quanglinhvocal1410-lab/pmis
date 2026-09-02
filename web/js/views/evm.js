/**
 * Trang EVM: tính lại toàn bộ chỉ số phái sinh từ BAC/PV/EV/AC.
 * Cột Ghi_Chu trong Fact_EVM ghi các chỉ số này được tính bằng DAX trong
 * Power BI — trang này thay thế bước đó.
 */
import { el, fmtShort, fmtMoney, fmtPct, fmtRatio, fmtMonth, fmtSigned } from '../core.js';
import { state, packageOptions } from '../store.js';
import { evmSeries, evmAt, portfolio, health } from '../calc.js';
import { pageHead, section, kpi, kpiGrid, table, badge, filterBar, empty, defList } from '../ui.js';
import { emptyWithAdd, addButton } from '../editor.js';
import { TABLE } from '../store.js';
import { lineChart, barChart, gauge, PALETTE } from '../charts.js';

export function render(params) {
  const withEvm = state.packages.filter((p) => p.evm.length);
  const box = el('div');
  const initial = params.pkg || (withEvm.length === 1 ? withEvm[0].id : '');

  const draw = (f) => {
    const pkg = f.pkg ? state.byId.package[f.pkg] : null;
    box.replaceChildren(...(pkg ? single(pkg) : all(withEvm)));
  };

  const bar1 = filterBar([
    {
      type: 'select', key: 'pkg', label: 'Gói thầu', value: initial,
      allLabel: 'Toàn danh mục',
      options: packageOptions().map((p) => ({ value: p.id, label: `${p.id} — ${p.shortName}` }))
    }
  ], draw);

  draw({ pkg: initial });

  return el('div.view', [
    pageHead('Quản lý giá trị thu được (EVM)',
      `Fact_EVM · ${state.evm.length} kỳ báo cáo · ${withEvm.length}/${state.packages.length} gói có số liệu`),
    el('p.notice', 'SV, CV, SPI, CPI, EAC, ETC, VAC và TCPI được tính trực tiếp trong trình duyệt từ bốn đại lượng gốc BAC / PV / EV / AC.'),
    bar1,
    box
  ]);
}

// ------------------------------------------------------- TOÀN DANH MỤC

function all(withEvm) {
  if (!withEvm.length) {
    return [emptyWithAdd(TABLE.EVM, 'Bảng Fact_EVM chưa có dòng nào.',
      { label: '+ Thêm kỳ EVM' })];
  }
  const pf = portfolio(withEvm);
  const rows = withEvm.map((p) => ({ p, m: evmAt(p) })).filter((r) => r.m);

  return [
    kpiGrid([
      kpi({ label: 'BAC', value: fmtShort(pf.bac), hint: 'Ngân sách khi hoàn thành' }),
      kpi({ label: 'PV', value: fmtShort(pf.pv), hint: fmtPct(pf.pctPlanned) + ' BAC' }),
      kpi({ label: 'EV', value: fmtShort(pf.ev), hint: fmtPct(pf.pctComplete) + ' BAC', tone: pf.sv >= 0 ? 'ok' : 'warn' }),
      kpi({ label: 'AC', value: fmtShort(pf.ac), hint: fmtPct(pf.pctSpent) + ' BAC', tone: pf.cv >= 0 ? 'ok' : 'bad' }),
      kpi({ label: 'EAC dự báo', value: fmtShort(pf.eac), hint: `VAC ${fmtSigned(pf.vac)}`, tone: pf.vac >= 0 ? 'ok' : 'bad' }),
      kpi({ label: 'TCPI', value: fmtRatio(pf.tcpi), hint: 'Hiệu suất cần đạt cho phần còn lại', tone: pf.tcpi <= 1.05 ? 'ok' : 'warn' })
    ]),
    section('So sánh giữa các gói thầu', 'Chỉ số kỳ mới nhất của từng gói', compareTable(rows)),
    section('Bảng chỉ số đầy đủ', 'Mọi kỳ báo cáo trong Fact_EVM', fullTable(state.evm.map((r) => r)))
  ];
}

function compareTable(rows) {
  return table([
    { key: 'id', label: 'Gói thầu', value: (r) => r.p.id, render: (r) => el('a', { href: `#/goi-thau/${r.p.id}` }, `${r.p.id} — ${r.p.shortName}`) },
    { key: 'period', label: 'Kỳ', value: (r) => r.m.period, render: (r) => fmtMonth(r.m.period) },
    { key: 'bac', label: 'BAC', align: 'right', value: (r) => r.m.bac, render: (r) => fmtMoney(r.m.bac) },
    { key: 'ev', label: 'EV', align: 'right', value: (r) => r.m.ev, render: (r) => fmtMoney(r.m.ev) },
    { key: 'ac', label: 'AC', align: 'right', value: (r) => r.m.ac, render: (r) => fmtMoney(r.m.ac) },
    { key: 'sv', label: 'SV', align: 'right', value: (r) => r.m.sv, render: (r) => num(r.m.sv) },
    { key: 'cv', label: 'CV', align: 'right', value: (r) => r.m.cv, render: (r) => num(r.m.cv) },
    { key: 'spi', label: 'SPI', align: 'right', value: (r) => r.m.spi, render: (r) => ratio(r.m.spi) },
    { key: 'cpi', label: 'CPI', align: 'right', value: (r) => r.m.cpi, render: (r) => ratio(r.m.cpi) },
    { key: 'eac', label: 'EAC', align: 'right', value: (r) => r.m.eac, render: (r) => fmtMoney(r.m.eac) },
    { key: 'health', label: 'Đánh giá', value: (r) => health(r.m).label, render: (r) => el('span.badge.' + health(r.m).tone, health(r.m).label) }
  ], rows, { sortKey: 'id' });
}

// ------------------------------------------------------------ MỘT GÓI

function single(pkg) {
  const series = evmSeries(pkg);
  if (!series.length) {
    return [emptyWithAdd(TABLE.EVM, `Gói ${pkg.id} chưa có dòng nào trong Fact_EVM.`, {
      label: '+ Thêm kỳ EVM',
      defaults: { ID_Goi_Thau: pkg.id, BAC: pkg.currentValue }
    })];
  }
  const m = series[series.length - 1];
  const labels = series.map((r) => fmtMonth(r.period));
  const h = health(m);

  return [
    kpiGrid([
      kpi({ label: 'BAC', value: fmtShort(m.bac) }),
      kpi({ label: 'Hoàn thành', value: fmtPct(m.pctComplete), hint: `Kế hoạch ${fmtPct(m.pctPlanned)}`, tone: h.tone }),
      kpi({ label: 'SV', value: fmtShort(m.sv), hint: `SPI ${fmtRatio(m.spi)}`, tone: m.sv >= 0 ? 'ok' : 'bad' }),
      kpi({ label: 'CV', value: fmtShort(m.cv), hint: `CPI ${fmtRatio(m.cpi)}`, tone: m.cv >= 0 ? 'ok' : 'bad' }),
      kpi({ label: 'EAC', value: fmtShort(m.eac), hint: `ETC ${fmtShort(m.etc)}` }),
      kpi({ label: 'VAC', value: fmtShort(m.vac), hint: m.vac >= 0 ? 'Dự kiến dư ngân sách' : 'Dự kiến vượt ngân sách', tone: m.vac >= 0 ? 'ok' : 'bad' })
    ]),
    section(`${pkg.id} — Đường cong chữ S`, `${labels[0]} → ${labels[labels.length - 1]}`,
      lineChart({
        labels, height: 300,
        series: [
          { name: 'PV — Giá trị kế hoạch', values: series.map((r) => r.pv), color: PALETTE[0], dash: '6 4' },
          { name: 'EV — Giá trị thu được', values: series.map((r) => r.ev), color: PALETTE[1], area: true },
          { name: 'AC — Chi phí thực tế', values: series.map((r) => r.ac), color: PALETTE[2] }
        ]
      })),
    el('div.grid-2', [
      section('Sai lệch theo kỳ', 'SV = EV − PV · CV = EV − AC',
        barChart({
          labels, height: 250,
          series: [
            { name: 'SV — sai lệch tiến độ', values: series.map((r) => r.sv), color: PALETTE[3] },
            { name: 'CV — sai lệch chi phí', values: series.map((r) => r.cv), color: PALETTE[4] }
          ]
        })),
      section('Chỉ số hiệu suất theo kỳ', 'Mốc an toàn 1,00',
        lineChart({
          labels, height: 250, yFmt: (v) => v.toFixed(2).replace('.', ','),
          series: [
            { name: 'SPI', values: series.map((r) => r.spi ?? 0), color: PALETTE[1] },
            { name: 'CPI', values: series.map((r) => r.cpi ?? 0), color: PALETTE[2] },
            { name: 'Mốc 1,00', values: series.map(() => 1), color: 'var(--muted)', dash: '4 4' }
          ]
        }))
    ]),
    el('div.grid-2', [
      section('Đồng hồ chỉ số', h.label, el('div.gauge-row', [
        gauge({ value: m.spi, label: 'SPI' }),
        gauge({ value: m.cpi, label: 'CPI' })
      ])),
      section('Diễn giải', `Kỳ ${fmtMonth(m.period)}`, defList([
        ['SV — Sai lệch tiến độ', signed(m.sv)],
        ['CV — Sai lệch chi phí', signed(m.cv)],
        ['SPI = EV / PV', fmtRatio(m.spi)],
        ['CPI = EV / AC', fmtRatio(m.cpi)],
        ['CSI = SPI × CPI', fmtRatio(m.csi)],
        ['EAC = BAC / CPI', fmtMoney(m.eac)],
        ['ETC = EAC − AC', fmtMoney(m.etc)],
        ['VAC = BAC − EAC', signed(m.vac)],
        ['TCPI = (BAC−EV)/(BAC−AC)', fmtRatio(m.tcpi)],
        ['Trạng thái dữ liệu', badge(m.dataStatus, 'Dữ liệu')]
      ]))
    ]),
    section('Bảng chỉ số đầy đủ', `${series.length} kỳ`, fullTable(pkg.evm))
  ];
}

// ------------------------------------------------------------- CHUNG

function fullTable(rawRows) {
  const rows = rawRows.map((r) => ({
    raw: r,
    ...(evmSeries({ evm: [r] })[0])
  }));
  return table([
    { key: 'pkg', label: 'Gói', value: (r) => r.raw.packageId, render: (r) => el('a', { href: `#/goi-thau/${r.raw.packageId}` }, r.raw.packageId) },
    { key: 'period', label: 'Kỳ', value: (r) => r.period, render: (r) => fmtMonth(r.period) },
    { key: 'bac', label: 'BAC', align: 'right', render: (r) => fmtMoney(r.bac) },
    { key: 'pv', label: 'PV', align: 'right', render: (r) => fmtMoney(r.pv) },
    { key: 'ev', label: 'EV', align: 'right', render: (r) => fmtMoney(r.ev) },
    { key: 'ac', label: 'AC', align: 'right', render: (r) => fmtMoney(r.ac) },
    { key: 'sv', label: 'SV', align: 'right', render: (r) => num(r.sv) },
    { key: 'cv', label: 'CV', align: 'right', render: (r) => num(r.cv) },
    { key: 'spi', label: 'SPI', align: 'right', render: (r) => ratio(r.spi) },
    { key: 'cpi', label: 'CPI', align: 'right', render: (r) => ratio(r.cpi) },
    { key: 'eac', label: 'EAC', align: 'right', render: (r) => fmtMoney(r.eac) },
    { key: 'tcpi', label: 'TCPI', align: 'right', render: (r) => fmtRatio(r.tcpi) }
  ], rows, { sortKey: 'period', sortDir: -1 });
}

function num(v) {
  return el('span.num.' + (v >= 0 ? 'ok' : 'bad'), fmtSigned(v));
}

function ratio(v) {
  if (v === null || v === undefined) return '—';
  return el('span.num.' + (v >= 1 ? 'ok' : v >= 0.95 ? 'warn' : 'bad'), fmtRatio(v));
}

function signed(v) {
  return num(v);
}
