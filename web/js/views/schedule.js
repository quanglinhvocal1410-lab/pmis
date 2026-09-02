/** Trang Tiến độ: Gantt + bảng WBS toàn danh mục, lọc theo gói thầu. */
import { el, fmtDate, fmtPct, fmtMonth, daysBetween, sortBy, toISO } from '../core.js';
import { state, distinct, packageOptions } from '../store.js';
import { latestProgress, progressSummary } from '../calc.js';
import { pageHead, section, kpi, kpiGrid, badge, bar, table, filterBar, matches, empty } from '../ui.js';
import { openRecord, addButton, emptyWithAdd } from '../editor.js';
import { TABLE } from '../store.js';
import { gantt } from '../charts.js';
import { renderCPMGantt } from '../cpmGantt.js';

export function render(params) {
  const box = el('div');
  const pkgIds = packageOptions().map((p) => ({ value: p.id, label: `${p.id} — ${p.shortName}` }));
  const withData = state.packages.filter((p) => p.progress.length);

  const initial = params.pkg || (withData[0] ? withData[0].id : '');

  const draw = (f) => {
    const pkgs = f.pkg ? state.packages.filter((p) => p.id === f.pkg) : state.packages;
    const acts = pkgs.flatMap((p) =>
      latestProgress(p).map((a) => ({ ...a, pkg: p }))
    ).filter((a) =>
      matches(f.q, a.activityId, a.name, a.owner) &&
      (!f.severity || a.severity === f.severity)
    );
    box.replaceChildren(...body(acts, pkgs, f));
  };

  const bar1 = filterBar([
    { type: 'select', key: 'pkg', label: 'Gói thầu', options: pkgIds, value: initial },
    { type: 'search', key: 'q', label: 'Tìm hạng mục, người phụ trách…' },
    { type: 'select', key: 'severity', label: 'Mức nghiêm trọng', options: distinct(state.progress, 'severity') }
  ], draw);

  draw({ pkg: initial });

  return el('div.view', [
    pageHead('Tiến độ thi công',
      `Fact_TienDo · ${state.progress.length} bản ghi · kỳ báo cáo mới nhất ${fmtMonth(state.asOf)}`,
      [addButton(TABLE.TienDo, {
        label: '+ Cập nhật tiến độ',
        defaults: { ID_Goi_Thau: initial, Ky_Bao_Cao: toISO(state.asOf) }
      })]),
    withData.length < state.packages.length
      ? el('p.notice', `Chỉ ${withData.length}/${state.packages.length} gói thầu đã có dữ liệu tiến độ trong bảng Fact_TienDo.`)
      : null,
    bar1,
    box
  ]);
}

function body(acts, pkgs, f) {
  if (!acts.length) {
    return [state.progress.length
      ? empty('Không có hạng mục nào khớp bộ lọc.')
      : emptyWithAdd(TABLE.TienDo, 'Bảng Fact_TienDo chưa có hạng mục nào.', {
        label: '+ Thêm hạng mục',
        defaults: f.pkg ? { ID_Goi_Thau: f.pkg } : {}
      })];
  }

  const summary = pkgs.length === 1 ? progressSummary(pkgs[0]) : null;
  const behind = acts.filter((a) => a.variancePct < 0);
  const slips = acts
    .map((a) => daysBetween(a.planFinish, a.forecastFinish) || 0)
    .filter((d) => d > 0);

  const cpmTasks = acts.map((a, idx) => ({
    id: a.activityId || `act-${idx + 1}`,
    seq: String(idx + 1),
    name: (pkgs.length > 1 ? a.pkg.id + ' · ' : '') + a.name,
    level: a.level || (a.activityId && a.activityId.includes('.') ? a.activityId.split('.').length : 3),
    isLeaf: true,
    startPlan: toISO(a.planStart),
    finishPlan: toISO(a.planFinish),
    duration: daysBetween(a.planStart, a.planFinish) || 1,
    progress: Math.round(a.actualPct || 0),
    predecessors: a.predecessors || (idx > 0 ? `${idx}FS` : ''),
    isCritical: a.severity === 'Cao' || a.variancePct < 0
  }));

  const out = [
    kpiGrid([
      kpi({ label: 'Hạng mục theo dõi', value: String(acts.length) }),
      kpi({
        label: 'Tiến độ trung bình',
        value: fmtPct(acts.reduce((s, a) => s + a.actualPct, 0) / acts.length),
        hint: `Kế hoạch ${fmtPct(acts.reduce((s, a) => s + a.plannedPct, 0) / acts.length)}`,
        tone: summary && summary.variance >= 0 ? 'ok' : 'warn'
      }),
      kpi({
        label: 'Hạng mục chậm',
        value: String(behind.length),
        hint: `${acts.filter((a) => a.severity === 'Cao').length} ở mức nghiêm trọng Cao`,
        tone: behind.length ? 'warn' : 'ok'
      }),
      kpi({
        label: 'Trượt tiến độ lớn nhất',
        value: slips.length ? `${Math.max(...slips)} ngày` : '0 ngày',
        hint: 'So kế hoạch với dự báo hoàn thành',
        tone: slips.length ? 'bad' : 'ok'
      })
    ]),
    section('Sơ đồ Tiến độ CPM & Đường găng', 'Mối nối phụ thuộc FS/SS/FF/SF, phân tích đường găng và tỷ lệ Zoom',
      renderCPMGantt(cpmTasks)),
    section('Bảng theo dõi WBS', `${acts.length} hạng mục`, wbsTable(acts, pkgs.length > 1))
  ];
  return out;
}

function wbsTable(acts, showPkg) {
  const cols = [];
  if (showPkg) cols.push({ key: 'pkgId', label: 'Gói', width: '8%', value: (r) => r.pkg.id, render: (r) => el('a', { href: `#/goi-thau/${r.pkg.id}` }, r.pkg.id) });
  cols.push(
    { key: 'activityId', label: 'Mã WBS', width: '13%' },
    { key: 'name', label: 'Hạng mục', width: '24%' },
    { key: 'planStart', label: 'KH bắt đầu', value: (r) => r.planStart, render: (r) => fmtDate(r.planStart) },
    { key: 'planFinish', label: 'KH kết thúc', value: (r) => r.planFinish, render: (r) => fmtDate(r.planFinish) },
    { key: 'forecastFinish', label: 'Dự báo xong', value: (r) => r.forecastFinish, render: (r) => fmtDate(r.forecastFinish) },
    {
      key: 'slip', label: 'Trượt', align: 'right',
      value: (r) => daysBetween(r.planFinish, r.forecastFinish) || 0,
      render: (r) => {
        const d = daysBetween(r.planFinish, r.forecastFinish);
        if (d === null) return '—';
        return d > 0 ? el('span.num.bad', `+${d}`) : el('span.num.ok', d === 0 ? '0' : String(d));
      }
    },
    { key: 'plannedPct', label: 'KH %', align: 'right', render: (r) => fmtPct(r.plannedPct, 0) },
    {
      key: 'actualPct', label: 'Thực tế', width: '13%',
      render: (r) => el('div', [bar(r.actualPct, r.variancePct >= 0 ? 'ok' : 'warn'), el('span.sub', fmtPct(r.actualPct, 0))])
    },
    {
      key: 'variancePct', label: 'Lệch', align: 'right',
      render: (r) => el('span.num.' + (r.variancePct >= 0 ? 'ok' : 'bad'),
        (r.variancePct >= 0 ? '+' : '') + fmtPct(r.variancePct, 0))
    },
    { key: 'severity', label: 'Mức', render: (r) => badge(r.severity, 'Tiến độ') },
    { key: 'owner', label: 'Phụ trách' }
  );

  return table(cols, acts, {
    sortKey: 'activityId',
    onRow: (r) => openRecord(TABLE.TienDo, r.row, {
      title: r.name, subtitle: `${r.pkg.id} · ${r.activityId}`
    })
  });
}
