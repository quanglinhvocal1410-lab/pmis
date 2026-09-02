/**
 * Các chỉ số phái sinh.
 *
 * Bảng Fact_EVM chỉ lưu 4 đại lượng gốc BAC/PV/EV/AC — cột Ghi_Chu ghi rõ
 * "SV/CV/SPI/CPI/EAC tính bằng DAX trong Power BI". Webapp tính lại đúng
 * các công thức đó ngay ở phía trình duyệt để không phải phụ thuộc Power BI.
 */
import { state } from './store.js';
import { num, sum, daysBetween, sortBy, groupBy } from './core.js';

const div = (a, b) => (b ? a / b : null);

/** Bộ chỉ số EVM đầy đủ từ 4 đại lượng gốc. */
export function evmMetrics(r) {
  if (!r) return null;
  const { bac, pv, ev, ac } = r;
  const cpi = div(ev, ac);
  const spi = div(ev, pv);
  const eac = cpi ? bac / cpi : null;
  return {
    period: r.period,
    bac, pv, ev, ac,
    sv: ev - pv,
    cv: ev - ac,
    spi,
    cpi,
    // Chỉ số hiệu quả tổng hợp — cảnh báo sớm khi cả tiến độ lẫn chi phí lệch
    csi: spi !== null && cpi !== null ? spi * cpi : null,
    eac,
    etc: eac !== null ? eac - ac : null,
    vac: eac !== null ? bac - eac : null,
    // TCPI: hiệu suất chi phí cần đạt cho phần việc còn lại để về đúng BAC
    tcpi: div(bac - ev, bac - ac),
    pctComplete: div(ev, bac),
    pctPlanned: div(pv, bac),
    pctSpent: div(ac, bac),
    dataStatus: r.dataStatus
  };
}

/** Kỳ EVM mới nhất không vượt quá ngày chốt. */
export function evmAt(pkg, asOf = state.asOf) {
  const list = (pkg.evm || []).filter((r) => !asOf || !r.period || r.period <= asOf);
  const latest = sortBy(list, (r) => r.period || 0).pop();
  return evmMetrics(latest || sortBy(pkg.evm || [], (r) => r.period || 0).pop());
}

/** Chuỗi EVM theo thời gian, đã kèm SPI/CPI từng kỳ. */
export function evmSeries(pkg) {
  return sortBy(pkg.evm || [], (r) => r.period || 0).map(evmMetrics);
}

/**
 * Tổng hợp danh mục: cộng dồn BAC/PV/EV/AC của kỳ mới nhất từng gói rồi
 * tính lại chỉ số trên tổng (không lấy trung bình SPI/CPI của các gói —
 * cách đó sai về mặt trọng số).
 */
export function portfolio(packages = state.packages, asOf = state.asOf) {
  const agg = { bac: 0, pv: 0, ev: 0, ac: 0 };
  let covered = 0;
  for (const p of packages) {
    const m = evmAt(p, asOf);
    if (!m) continue;
    covered++;
    agg.bac += m.bac;
    agg.pv += m.pv;
    agg.ev += m.ev;
    agg.ac += m.ac;
  }
  const metrics = evmMetrics({ ...agg, period: asOf });
  return {
    ...metrics,
    packagesTotal: packages.length,
    packagesWithEvm: covered,
    // Giá trị hợp đồng toàn danh mục (kể cả gói chưa có số liệu EVM)
    contractValue: sum(packages, 'currentValue')
  };
}

/** Sức khoẻ gói thầu: xanh / vàng / đỏ theo ngưỡng SPI–CPI thông dụng. */
export function health(m) {
  if (!m || m.spi === null || m.cpi === null) return { tone: 'mute', label: 'Chưa đủ dữ liệu' };
  const worst = Math.min(m.spi, m.cpi);
  if (worst >= 0.98) return { tone: 'ok', label: 'Trong tầm kiểm soát' };
  if (worst >= 0.9) return { tone: 'warn', label: 'Cần theo dõi' };
  return { tone: 'bad', label: 'Rủi ro cao' };
}

// ------------------------------------------------------------ TIẾN ĐỘ

/** Ảnh chụp WBS: mỗi hoạt động lấy kỳ báo cáo mới nhất. */
export function latestProgress(pkg, asOf = state.asOf) {
  const byActivity = groupBy(pkg.progress || [], 'activityId');
  const out = [];
  for (const [, list] of byActivity) {
    const inRange = list.filter((r) => !asOf || !r.period || r.period <= asOf);
    const pick = sortBy(inRange.length ? inRange : list, (r) => r.period || 0).pop();
    if (pick) out.push(pick);
  }
  return sortBy(out, (r) => r.activityId);
}

export function progressSummary(pkg, asOf = state.asOf) {
  const list = latestProgress(pkg, asOf);
  if (!list.length) return null;
  const planned = list.reduce((s, r) => s + r.plannedPct, 0) / list.length;
  const actual = list.reduce((s, r) => s + r.actualPct, 0) / list.length;
  const behind = list.filter((r) => r.variancePct < 0);
  const critical = list.filter((r) => r.severity === 'Cao');
  const finished = list.filter((r) => r.actualPct >= 1 || r.actFinish);
  const slipDays = list
    .map((r) => (r.forecastFinish && r.planFinish ? daysBetween(r.planFinish, r.forecastFinish) : 0))
    .filter((d) => d && d > 0);
  return {
    activities: list.length,
    planned,
    actual,
    variance: actual - planned,
    behind: behind.length,
    critical: critical.length,
    finished: finished.length,
    maxSlipDays: slipDays.length ? Math.max(...slipDays) : 0
  };
}

// ---------------------------------------------------- THANH TOÁN / VỐN

export function paymentSummary(pkg) {
  const pays = pkg.payments || [];
  const c = pkg.contract;
  const advance = c ? c.value * c.advancePct : 0;
  const recovered = sum(pays, 'advanceRecovery');
  const paid = sum(pays, 'paid');
  const certified = sum(pays, 'certified');
  const requested = sum(pays, 'requested');
  const value = pkg.currentValue || (c ? c.value : 0);
  return {
    ipcCount: pays.length,
    requested,
    certified,
    paid,
    // Chênh giữa đề nghị và chứng nhận = phần TVGS/CĐT cắt giảm
    deducted: requested - certified,
    retentionHeld: sum(pays, 'retention'),
    advance,
    advanceRecovered: recovered,
    advanceOutstanding: Math.max(0, advance - recovered),
    // Tổng tiền đã ra khỏi ngân sách = tạm ứng + các đợt IPC đã trả
    cashOut: advance + paid,
    contractValue: value,
    paidPct: value ? (advance + paid) / value : null,
    pending: pays.filter((p) => !p.paidDate).length
  };
}

export function disbursementSummary(pkg, asOf = state.asOf) {
  const list = sortBy((pkg.disbursement || []).filter((r) => !asOf || !r.period || r.period <= asOf),
    (r) => r.period || 0);
  const last = list[list.length - 1];
  if (!last) return null;
  return {
    period: last.period,
    planCum: last.planCum,
    actCum: last.actCum,
    variance: last.variance !== 0 ? last.variance : last.actCum - last.planCum,
    achievement: last.planCum ? last.actCum / last.planCum : null,
    planYear: last.planYear,
    yearProgress: last.planYear ? last.actCum / last.planYear : null,
    budgetLeft: last.budgetLeft,
    forecast: last.forecast,
    series: list
  };
}

// ------------------------------------------------------------- CẢNH BÁO

const ALERT_WINDOW_DAYS = 90;

/**
 * Gom mọi vấn đề cần xử lý về một danh sách xếp theo mức độ.
 * Mốc thời gian đo theo `state.asOf` (ngày chốt số liệu), không phải ngày
 * hệ thống — xem ghi chú ở store.resolveAsOf.
 */
export function alerts(asOf = state.asOf) {
  const out = [];
  const push = (level, kind, title, detail, link) =>
    out.push({ level, kind, title, detail, link });

  for (const c of state.contracts) {
    const pkgName = c.package ? c.package.id : c.packageId;
    for (const [label, date] of [
      ['Bảo lãnh thực hiện', c.perfBondExpiry],
      ['Bảo hiểm công trình', c.insuranceExpiry]
    ]) {
      const d = daysBetween(asOf, date);
      if (d === null) continue;
      if (d < 0) push('bad', 'Hợp đồng', `${label} đã hết hiệu lực`, `${c.no} · quá ${-d} ngày`, `#/goi-thau/${c.packageId}`);
      else if (d <= ALERT_WINDOW_DAYS) push('warn', 'Hợp đồng', `${label} sắp hết hiệu lực`, `${c.no} · còn ${d} ngày`, `#/goi-thau/${c.packageId}`);
    }
    const dFinish = daysBetween(asOf, c.forecastFinish || c.finish);
    if (dFinish !== null && dFinish < 0 && c.status !== 'Đã nghiệm thu') {
      push('bad', 'Hợp đồng', 'Quá thời hạn hoàn thành hợp đồng', `${pkgName} · quá ${-dFinish} ngày`, `#/goi-thau/${c.packageId}`);
    }
  }

  for (const t of state.tasks) {
    if (t.status === 'Hoàn thành') continue;
    const d = daysBetween(asOf, t.due);
    if (d === null) continue;
    if (d < 0) push('bad', 'Công việc', t.title, `${t.owner || 'Chưa giao'} · quá hạn ${-d} ngày`, '#/cong-viec');
    else if (d <= 7) push('warn', 'Công việc', t.title, `${t.owner || 'Chưa giao'} · còn ${d} ngày`, '#/cong-viec');
  }

  for (const p of state.packages) {
    const m = evmAt(p, asOf);
    if (m && m.spi !== null && m.spi < 0.95) {
      push(m.spi < 0.9 ? 'bad' : 'warn', 'Tiến độ', `${p.id} chậm tiến độ`,
        `SPI ${m.spi.toFixed(2)} · SV ${Math.round(m.sv / 1e6).toLocaleString('vi-VN')} tr`, `#/goi-thau/${p.id}`);
    }
    if (m && m.cpi !== null && m.cpi < 0.95) {
      push(m.cpi < 0.9 ? 'bad' : 'warn', 'Chi phí', `${p.id} vượt chi phí`,
        `CPI ${m.cpi.toFixed(2)} · dự báo EAC ${Math.round(m.eac / 1e9).toLocaleString('vi-VN')} tỷ`, `#/goi-thau/${p.id}`);
    }
    for (const a of latestProgress(p, asOf)) {
      if (a.severity === 'Cao') {
        push('warn', 'Tiến độ', a.name, `${p.id} · lệch ${(a.variancePct * 100).toFixed(0)}% · ${a.owner || ''}`.trim(), `#/tien-do?pkg=${p.id}`);
      }
    }
  }

  for (const d of state.docs) {
    if (/(cần bổ sung|chờ|đang thẩm tra|đang xem)/i.test(d.status || '')) {
      push('warn', 'Hồ sơ', d.content, `${d.status} · ${d.party || ''}`.trim(), '#/ho-so');
    }
  }

  const rank = { bad: 0, warn: 1, ok: 2 };
  return sortBy(out, (a) => rank[a.level] ?? 3);
}

export function alertCounts(list = alerts()) {
  return {
    total: list.length,
    bad: list.filter((a) => a.level === 'bad').length,
    warn: list.filter((a) => a.level === 'warn').length
  };
}

// --------------------------------------------------------------- KHÁC

/** % thời gian hợp đồng đã trôi qua tính đến ngày chốt. */
export function timeElapsed(pkg, asOf = state.asOf) {
  const s = pkg.start || (pkg.contract && pkg.contract.ntp);
  const f = pkg.finish || (pkg.contract && pkg.contract.finish);
  if (!s || !f || f <= s) return null;
  if (asOf <= s) return 0;
  if (asOf >= f) return 1;
  return (asOf - s) / (f - s);
}

export function taskBoard(tasks, asOf = state.asOf) {
  return tasks.map((t) => ({
    ...t,
    overdue: t.status !== 'Hoàn thành' && t.due && t.due < asOf,
    daysLeft: daysBetween(asOf, t.due)
  }));
}

/**
 * Soát dữ liệu: những gì còn thiếu hoặc trỏ sai, để biết cần nhập tiếp cái gì.
 * Đây là phần bù cho việc bảng tính không có ràng buộc khoá ngoại.
 */
export function dataAudit() {
  const out = [];
  const add = (level, table, msg, hint) => out.push({ level, table, msg, hint });

  const ids = (list) => new Set(list.map((x) => x.id));
  const projectIds = ids(state.projects);
  const packageIds = ids(state.packages);
  const contractIds = ids(state.contracts);
  const contractorIds = ids(state.contractors);
  const consultantIds = ids(state.consultants);

  if (!state.projects.length) add('bad', 'Dim_DuAn', 'Chưa có dự án nào', 'Nhập dự án trước, mọi bảng khác đều tham chiếu tới nó.');
  if (!state.packages.length) add('bad', 'Dim_GoiThau', 'Chưa có gói thầu nào', 'Gói thầu là trục chính của toàn bộ báo cáo.');
  if (!state.statuses.length) add('warn', 'Dim_TrangThai', 'Chưa khai báo danh mục trạng thái', 'Thiếu bảng này thì nhãn trạng thái mất màu và cột Kanban mất thứ tự.');

  for (const p of state.packages) {
    if (p.projectId && !projectIds.has(p.projectId)) add('bad', 'Dim_GoiThau', `${p.id} trỏ tới dự án không tồn tại: ${p.projectId}`);
    if (!p.projectId) add('warn', 'Dim_GoiThau', `${p.id} chưa gán dự án`);
    if (p.contractorId && !contractorIds.has(p.contractorId)) add('bad', 'Dim_GoiThau', `${p.id} trỏ tới nhà thầu không tồn tại: ${p.contractorId}`);
    if (p.consultantId && !consultantIds.has(p.consultantId)) add('bad', 'Dim_GoiThau', `${p.id} trỏ tới tư vấn không tồn tại: ${p.consultantId}`);
    if (!p.contract) add('warn', 'Dim_HopDong', `${p.id} chưa có hợp đồng`, 'Thiếu hợp đồng thì không tính được tạm ứng, giữ lại và mốc bảo lãnh.');
    if (!p.currentValue) add('warn', 'Dim_GoiThau', `${p.id} chưa có giá trị hợp đồng`, 'Không có giá trị thì không tính được tỉ lệ giải ngân.');
    if (!p.evm.length) add('warn', 'Fact_EVM', `${p.id} chưa có kỳ EVM nào`, 'Thiếu BAC/PV/EV/AC thì không có SPI, CPI, EAC.');
    if (!p.progress.length) add('warn', 'Fact_TienDo', `${p.id} chưa có hạng mục tiến độ nào`);
  }

  const checkRef = (rows, table, field, valid, label) => {
    for (const r of rows) {
      const v = r[field];
      if (v && !valid.has(v)) add('bad', table, `${r.id}: ${label} "${v}" không có trong danh mục`);
    }
  };
  checkRef(state.contracts, 'Dim_HopDong', 'packageId', packageIds, 'gói thầu');
  checkRef(state.contracts, 'Dim_HopDong', 'contractorId', contractorIds, 'nhà thầu');
  checkRef(state.progress, 'Fact_TienDo', 'packageId', packageIds, 'gói thầu');
  checkRef(state.payments, 'Fact_ThanhToan', 'packageId', packageIds, 'gói thầu');
  checkRef(state.payments, 'Fact_ThanhToan', 'contractId', contractIds, 'hợp đồng');
  checkRef(state.disbursement, 'Fact_GiaiNgan', 'packageId', packageIds, 'gói thầu');
  checkRef(state.evm, 'Fact_EVM', 'packageId', packageIds, 'gói thầu');
  checkRef(state.tasks, 'Fact_CongViec', 'packageId', packageIds, 'gói thầu');
  checkRef(state.docs, 'Fact_HoSo', 'packageId', packageIds, 'gói thầu');

  for (const e of state.evm) {
    if (!e.bac) add('warn', 'Fact_EVM', `${e.id} thiếu BAC`, 'Không có BAC thì không tính được EAC, VAC, TCPI.');
    if (!e.period) add('warn', 'Fact_EVM', `${e.id} thiếu kỳ báo cáo`);
  }
  for (const t of state.progress) {
    if (t.planStart && t.planFinish && t.planFinish < t.planStart) {
      add('bad', 'Fact_TienDo', `${t.id}: kế hoạch kết thúc trước ngày bắt đầu`);
    }
  }
  for (const pay of state.payments) {
    if (pay.certified > pay.requested && pay.requested) {
      add('warn', 'Fact_ThanhToan', `${pay.id}: giá trị chứng nhận lớn hơn giá trị đề nghị`);
    }
  }

  const rank = { bad: 0, warn: 1 };
  return sortBy(out, (a) => rank[a.level] ?? 2);
}

export function docStats(docs) {
  const byGroup = groupBy(docs, 'group');
  return sortBy(
    [...byGroup].map(([group, list]) => ({
      group: group || '(chưa phân nhóm)',
      total: list.length,
      ocr: list.filter((d) => /đã ocr/i.test(d.ocr || '')).length,
      ai: list.filter((d) => /đã trích xuất/i.test(d.ai || '')).length,
      pending: list.filter((d) => /(cần bổ sung|chờ|đang)/i.test(d.status || '')).length
    })),
    (g) => -g.total
  );
}
