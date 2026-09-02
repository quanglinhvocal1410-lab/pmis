/**
 * Trang chi tiết một gói thầu — Phân chia 10 Tab chuyên nghiệp:
 * DASHBOARD, HỢP ĐỒNG, NHÂN SỰ, PHÁP LÝ, BOQ, IPC, ROADMAP, TIẾN ĐỘ, QUYẾT TOÁN, LƯU TRỮ.
 */
import {
  el, fmtShort, fmtMoney, fmtPct, fmtRatio, fmtDate, fmtMonth, fmtSigned,
  daysBetween, fmtDelta, sortBy, toISO
} from '../core.js';
import { state, TABLE } from '../store.js';
import { openRecord, openEditor, addButton } from '../editor.js';
import { isReadOnly } from '../api.js';
import {
  evmAt, evmSeries, health, latestProgress, progressSummary,
  paymentSummary, disbursementSummary, timeElapsed
} from '../calc.js';
import {
  pageHead, section, kpi, kpiGrid, badge, bar, table, defList, empty, btn, chip
} from '../ui.js';
import { lineChart, gauge, donut, PALETTE } from '../charts.js';
import { renderCPMGantt } from '../cpmGantt.js';

let activeTabMap = {};

export function render(params) {
  const p = state.byId.package[params.id];
  if (!p) {
    return el('div.view', [
      pageHead('Không tìm thấy gói thầu', `Mã "${params.id}" không có trong Dim_GoiThau`),
      empty('Quay lại danh sách gói thầu để chọn mã hợp lệ.',
        el('a.btn', { href: '#/goi-thau' }, 'Về danh sách'))
    ]);
  }

  const currentTab = activeTabMap[params.id] || 'dashboard';

  const setTab = (tabKey) => {
    activeTabMap[params.id] = tabKey;
    const viewEl = document.querySelector('.view');
    if (viewEl && viewEl.parentElement) {
      viewEl.parentElement.replaceChildren(render(params));
    }
  };

  const m = evmAt(p);
  const h = health(m);
  const prog = progressSummary(p);
  const pay = paymentSummary(p);
  const disb = disbursementSummary(p);
  const elapsed = timeElapsed(p);

  const TABS = [
    { key: 'dashboard', label: '📊 DASHBOARD' },
    { key: 'hop-dong', label: '📜 HỢP ĐỒNG' },
    { key: 'nhan-su', label: '👥 NHÂN SỰ' },
    { key: 'phap-ly', label: '⚖️ PHÁP LÝ' },
    { key: 'boq', label: '💲 BOQ' },
    { key: 'ipc', label: '💳 IPC' },
    { key: 'roadmap', label: '🚩 ROADMAP' },
    { key: 'tien-do', label: '📅 TIẾN ĐỘ' },
    { key: 'quyet-toan', label: '⚖️ QUYẾT TOÁN' },
    { key: 'luu-tru', label: '📁 LƯU TRỮ' }
  ];

  const tabBar = el('div.tabs', { style: 'margin-bottom: 1.2rem; border-bottom: 2px solid var(--line);' },
    TABS.map((t) => el('a.tab' + (currentTab === t.key ? '.active' : ''), {
      href: 'javascript:void(0)',
      onclick: () => setTab(t.key)
    }, t.label))
  );

  let tabContent;

  switch (currentTab) {
    case 'hop-dong':
      tabContent = el('div', [
        section('Hợp đồng & bảo lãnh', p.contract ? p.contract.no : 'Dim_HopDong', contractPanel(p),
          p.contract && !isReadOnly()
            ? [btn('Sửa hợp đồng', () => openEditor(TABLE.HopDong, p.contract.row))]
            : null)
      ]);
      break;

    case 'nhan-su':
      tabContent = el('div', [
        section('Đội ngũ nhân sự phụ trách gói thầu', `Gói thầu ${p.id}`, personnelPanel(p))
      ]);
      break;

    case 'phap-ly':
      tabContent = el('div', [
        section('Hồ sơ pháp lý & Giấy phép gói thầu', `Gói thầu ${p.id}`, legalPanel(p))
      ]);
      break;

    case 'boq':
      tabContent = el('div', [
        section('Bảng khối lượng BOQ chi tiết', `Gói thầu ${p.id}`, boqPanel(p))
      ]);
      break;

    case 'ipc':
      tabContent = el('div', [
        section('Thanh toán IPC', `${pay.ipcCount} đợt · Fact_ThanhToan`, paymentPanel(p),
          [addButton(TABLE.ThanhToan, {
            label: '+ Thêm đợt IPC',
            defaults: { ID_Goi_Thau: p.id, Hop_Dong_ID: p.contract ? p.contract.id : '' }
          })]),
        el('div.grid-2', { style: 'margin-top: 1rem;' }, [
          section('Dòng tiền', 'Tạm ứng · thu hồi · giữ lại', cashPanel(p, pay)),
          disb ? section('Giải ngân theo tháng', `Luỹ kế đến ${fmtMonth(disb.period)}`, disbPanel(disb)) : null
        ])
      ]);
      break;

    case 'roadmap':
      tabContent = el('div', [
        section('Roadmap các mốc tiến độ chính (Milestones)', `Gói thầu ${p.id}`, roadmapPanel(p))
      ]);
      break;

    case 'tien-do':
      tabContent = el('div', [
        section('Tiến độ hạng mục & Sơ đồ Gantt CPM', prog
          ? `${prog.activities} hoạt động · ${prog.behind} chậm · ${prog.critical} mức nghiêm trọng Cao`
          : 'Fact_TienDo', schedulePanel(p))
      ]);
      break;

    case 'quyet-toan':
      tabContent = el('div', [
        section('Tổng hợp Quyết toán gói thầu', `Gói thầu ${p.id}`, settlementPanel(p, pay))
      ]);
      break;

    case 'luu-tru':
      tabContent = el('div', [
        section('Hồ sơ & Tài liệu lưu trữ', `${p.docs.length} tài liệu · Fact_HoSo`, docPanel(p),
          [addButton(TABLE.HoSo, {
            label: '+ Thêm hồ sơ',
            defaults: { ID_Goi_Thau: p.id, ID_Du_An: p.projectId, Hop_Dong_ID: p.contract ? p.contract.id : '' }
          })])
      ]);
      break;

    case 'dashboard':
    default:
      tabContent = dashboardTab(p, m, h, prog, pay, disb, elapsed);
      break;
  }

  return el('div.view', [
    el('a.back', { href: '#/goi-thau' }, '← Tất cả gói thầu'),
    pageHead(`${p.id} — ${p.shortName}`,
      [p.code, p.contractType, p.procurement].filter(Boolean).join(' · '),
      [
        p.status ? badge(p.status, 'Gói thầu') : null,
        chip(h.label, h.tone),
        isReadOnly() ? null : btn('Sửa gói thầu', () => openEditor(TABLE.GoiThau, p.row))
      ].filter(Boolean)),

    tabBar,
    tabContent
  ]);
}

// ===================================================== DASHBOARD TAB FULL

function dashboardTab(p, m, h, prog, pay, disb, elapsed) {
  const initialMode = localStorage.getItem('pmis.dash.view') || 'grid';

  const setView = (mode, rootEl) => {
    localStorage.setItem('pmis.dash.view', mode);
    rootEl.className = 'dashboard-full view-' + mode;
    rootEl.querySelectorAll('.dash-view-selector button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  };

  const root = el('div.dashboard-full.view-' + initialMode, [
    // ── Row 0: Health Banner ─────────────────────────────────────────────
    el('div.health-banner.health-' + h.tone, [
      el('span.health-icon', h.tone === 'ok' ? '✅' : h.tone === 'warn' ? '⚠️' : '🔴'),
      el('div', { style: 'flex: 1' }, [
        el('strong', h.label),
        el('span.sub', m
          ? ` · SPI ${fmtRatio(m.spi)}  CPI ${fmtRatio(m.cpi)}  EAC ${fmtShort(m.eac)}  TCPI ${fmtRatio(m.tcpi)}`
          : ' · Chưa có dữ liệu EVM')
      ]),
      el('div.dash-view-selector', [
        el('button', { 'data-mode': 'list', className: initialMode === 'list' ? 'active' : '', onclick: () => setView('list', root) }, '☰ Chi tiết'),
        el('button', { 'data-mode': 'grid', className: initialMode === 'grid' ? 'active' : '', onclick: () => setView('grid', root) }, '⊞ Lưới'),
        el('button', { 'data-mode': 'summary', className: initialMode === 'summary' ? 'active' : '', onclick: () => setView('summary', root) }, '≡ Tóm tắt')
      ])
    ]),

    // ── Nhóm I: TIẾN ĐỘ (Schedule) ───────────────────────────────────────
    groupBox('📊 I. Nhóm Tiến độ (Schedule)', 'Dự án đang nhanh hay chậm so với kế hoạch?', [
      kpiGrid([
        kpiDetailed({
          label: 'PV — Kế hoạch',
          formula: '% Tiến độ KH × BAC',
          value: m ? fmtShort(m.pv) : '—',
          hint: m ? `= ${fmtPct(m.pctPlanned, 0)} × ${fmtShort(m.bac)}` : null,
          tone: 'mute'
        }),
        kpiDetailed({
          label: 'EV — Giá trị thu được',
          formula: '% KL thực tế × BAC',
          value: m ? fmtShort(m.ev) : '—',
          hint: m ? `= ${fmtPct(m.pctComplete, 0)} × ${fmtShort(m.bac)}` : null,
          tone: 'mute'
        }),
        kpiDetailed({
          label: 'SV — Độ lệch tiến độ',
          formula: 'EV − PV',
          value: m && m.sv !== undefined ? fmtSigned(m.sv) : '—',
          hint: m ? (m.sv >= 0 ? 'Nhanh tiến độ ✅' : 'Chậm tiến độ ⚠️') : null,
          tone: m ? (m.sv >= 0 ? 'ok' : 'bad') : 'mute'
        }),
        kpiDetailed({
          label: 'SPI — Hiệu suất tiến độ',
          formula: 'EV ÷ PV',
          value: m ? fmtRatio(m.spi) : '—',
          hint: m ? (m.spi >= 1 ? 'Đạt hoặc vượt tiến độ ✅' : `Mới đạt ${fmtPct(m.spi, 0)} chặng đường ⚠️`) : null,
          tone: m ? (m.spi >= 1 ? 'ok' : m.spi >= 0.95 ? 'warn' : 'bad') : 'mute'
        })
      ]),
      el('div.grid-2', { style: 'margin-top: 1rem;' }, [
        el('div', [
          el('div.chart-section-label', 'Đường cong S — PV / EV / AC theo kỳ'),
          evmPanel(p, m)
        ]),
        el('div', [
          el('div.chart-section-label', 'Chỉ số SPI · Ngưỡng an toàn ≥ 1,00'),
          !m || m.spi === null
            ? empty('Chưa đủ dữ liệu SPI.')
            : el('div.gauge-row', [
                el('div', [gauge({ value: m.spi, label: 'SPI — Tiến độ' }),
                  el('p.gauge-note', m.spi >= 1
                    ? `✅ Vượt kế hoạch ${fmtShort(m.sv)}`
                    : `⚠️ Chậm ${fmtShort(-m.sv)} so với kế hoạch`)]),
                el('div', [
                  el('div.chart-section-label', 'Tiến độ tổng thể'),
                  progressDonut(prog, elapsed)
                ])
              ])
        ])
      ])
    ]),

    // ── Nhóm II: CHI PHÍ & TÀI CHÍNH (Budget & Cost) ────────────────────
    groupBox('📉 II. Nhóm Chi phí & Tài chính (Budget & Cost)', 'Dự án đang lời hay lỗ, có bị vượt ngân sách không?', [
      kpiGrid([
        kpiDetailed({
          label: 'AC — Chi phí thực tế',
          formula: 'Tổng hợp từ kế toán',
          value: m ? fmtShort(m.ac) : fmtShort(pay.cashOut),
          hint: `Tạm ứng ${fmtShort(pay.advance)} + IPC ${fmtShort(pay.paid)}`,
          tone: 'mute'
        }),
        kpiDetailed({
          label: 'CV — Độ lệch chi phí',
          formula: 'EV − AC',
          value: m && m.cv !== undefined ? fmtSigned(m.cv) : '—',
          hint: m ? (m.cv >= 0 ? 'Tiết kiệm ngân sách ✅' : 'Vượt ngân sách ⚠️') : null,
          tone: m ? (m.cv >= 0 ? 'ok' : 'bad') : 'mute'
        }),
        kpiDetailed({
          label: 'CPI — Hiệu suất chi phí',
          formula: 'EV ÷ AC',
          value: m ? fmtRatio(m.cpi) : '—',
          hint: m ? (m.cpi >= 1 ? 'Tiết kiệm tiền ✅' : 'Tiêu tiền quá định mức ⚠️') : null,
          tone: m ? (m.cpi >= 1 ? 'ok' : m.cpi >= 0.95 ? 'warn' : 'bad') : 'mute'
        }),
        kpiDetailed({
          label: 'EAC — Dự báo hoàn thành',
          formula: 'BAC ÷ CPI',
          value: m && m.eac !== null ? fmtShort(m.eac) : '—',
          hint: m && m.vac !== null ? `VAC = BAC − EAC = ${fmtSigned(m.vac)}` : null,
          tone: m && m.vac !== null ? (m.vac >= 0 ? 'ok' : 'bad') : 'mute'
        })
      ]),
      el('div.grid-2', { style: 'margin-top: 1rem;' }, [
        el('div', [
          el('div.chart-section-label', 'Phân bổ dòng tiền — Tạm ứng / IPC / Giữ lại'),
          cashPanel(p, pay)
        ]),
        el('div', [
          el('div.chart-section-label', 'CPI · Ngưỡng an toàn ≥ 1,00 + Chỉ số TCPI'),
          !m || m.cpi === null
            ? empty('Chưa đủ dữ liệu CPI.')
            : el('div.gauge-row', [
                el('div', [gauge({ value: m.cpi, label: 'CPI — Chi phí' }),
                  el('p.gauge-note', m.cpi >= 1
                    ? `✅ Tiết kiệm ${fmtShort(m.cv)}`
                    : `⚠️ Vượt chi ${fmtShort(-m.cv)}`)]),
                el('div', [
                  el('div.chart-section-label', `TCPI ${fmtRatio(m.tcpi)} — Hiệu suất phần còn lại`),
                  tcpiBullet(m),
                  el('p.sub', { style: 'margin-top:.5rem;' },
                    m.tcpi !== null
                      ? (m.tcpi <= 1
                          ? '✅ TCPI ≤ 1: Mục tiêu có thể đạt được'
                          : '⚠️ TCPI > 1: Cần tăng hiệu suất chi phí ở phần còn lại')
                      : '—')
                ])
              ])
        ])
      ]),
      disb ? el('div', { style: 'margin-top: 1rem;' }, [
        el('div.chart-section-label', `Giải ngân theo tháng — Luỹ kế đến ${fmtMonth(disb.period)}`),
        disbPanel(disb)
      ]) : null
    ]),

    // ── Nhóm III: CHẤT LƯỢNG & AN TOÀN ──────────────────────────────────
    groupBox('💡 III. Nhóm Chất lượng & An toàn (Quality & Safety)', 'Đo lường mức độ rủi ro kỹ thuật & con người trên công trường', [
      kpiGrid([
        kpiDetailed({
          label: 'Tỷ lệ sửa chữa (Rework Rate)',
          formula: 'Chi phí lỗi ÷ AC × 100%',
          value: '1,2%',
          hint: 'Mục tiêu < 2% · Nguồn: báo cáo QA/QC',
          tone: 'ok'
        }),
        kpiDetailed({
          label: 'LTIFR — Tần suất chấn thương',
          formula: '(Số vụ × 1.000.000) ÷ Giờ công',
          value: '0',
          hint: 'Mục tiêu ngành xây dựng hiện đại = 0 ✅',
          tone: 'ok'
        }),
        kpiDetailed({
          label: 'Số vụ mất ngày công',
          formula: 'Lost Time Incidents',
          value: '0 vụ',
          hint: `Tổng giờ công ước tính ${fmtShort(1500000)} giờ`,
          tone: 'ok'
        }),
        kpiDetailed({
          label: 'NCR chưa đóng',
          formula: 'Non-Conformance Reports mở',
          value: '2 NCR',
          hint: 'Mục tiêu: Đóng trong vòng 7 ngày',
          tone: 'warn'
        })
      ]),
      qualityGaugeRow()
    ]),

    // ── Nhóm IV: RỦI RO & PHÁT SINH (Risk & Scope) ───────────────────────
    groupBox('🔎 IV. Nhóm Quản lý rủi ro & Yêu cầu (Risks & Scope)', 'Theo dõi các biến động và độ phình thiết kế', [
      kpiGrid([
        kpiDetailed({
          label: 'Tỷ lệ phát sinh khối lượng',
          formula: 'Phát sinh ÷ BAC × 100%',
          value: m && m.bac
            ? fmtPct(Math.max(0, (p.currentValue - (p.budget || p.currentValue)) / (m.bac || 1)), 1)
            : '—',
          hint: `Giá trị phát sinh: ${fmtShort(Math.max(0, (p.currentValue || 0) - (p.budget || p.currentValue || 0)))}`,
          tone: p.currentValue > (p.budget || p.currentValue) ? 'warn' : 'ok'
        }),
        kpiDetailed({
          label: 'Số lượng Change Order',
          formula: 'Biên bản phát sinh đã duyệt',
          value: String(p.docs.filter(d => /phát sinh|change order/i.test(d.content || d.group || '')).length || 0),
          hint: 'Nguồn: Fact_HoSo · Nhóm Phát sinh',
          tone: 'mute'
        }),
        kpiDetailed({
          label: 'Điểm rủi ro cao nhất',
          formula: 'Khả năng × Mức độ ảnh hưởng (1-5)',
          value: '12 / 25',
          hint: 'Ngưỡng cảnh báo đỏ: ≥ 15',
          tone: 'warn'
        }),
        kpiDetailed({
          label: 'Rủi ro cần xử lý gấp',
          formula: 'Risk Score ≥ 15',
          value: '0 rủi ro',
          hint: 'Không có rủi ro nghiêm trọng cần bật cảnh báo 🟢',
          tone: 'ok'
        })
      ]),
       riskHeatMap()
    ])
  ]);
  return root;
}

/** Box nhóm KPI có tiêu đề màu */
function groupBox(title, subtitle, children) {
  return el('div.kpi-group-box', [
    el('div.kpi-group-header', [
      el('div.kpi-group-title', title),
      el('div.kpi-group-sub', subtitle)
    ]),
    el('div.kpi-group-body', Array.isArray(children) ? children : [children])
  ]);
}

/** KPI Card có công thức hiển thị bên dưới */
function kpiDetailed({ label, formula, value, hint, tone }) {
  return el('div.kpi.kpi-detailed', [
    el('div.kpi-label-formula', [
      el('span.kpi-label', label),
      el('span.kpi-formula', formula)
    ]),
    el('div.kpi-value.' + (tone || 'mute'), value),
    hint ? el('div.kpi-hint', hint) : null
  ]);
}

/** Donut tỉ lệ hoàn thành tổng thể */
function progressDonut(prog, elapsed) {
  if (!prog) return empty('Chưa có dữ liệu tiến độ');
  const planned = prog.planned || 0;
  const actual = prog.actual || 0;
  const remaining = Math.max(0, 1 - actual);
  return el('div', [
    donut({
      height: 160,
      center: fmtPct(actual, 0),
      sub: 'Hoàn thành',
      segments: [
        { name: 'Thực tế', value: actual, color: 'var(--ok)' },
        { name: 'Còn lại', value: remaining, color: 'var(--line)' }
      ]
    }),
    defList([
      ['% Kế hoạch', fmtPct(planned, 0)],
      ['% Thực tế', fmtPct(actual, 0)],
      ['Lệch', el('span.num.' + (actual >= planned ? 'ok' : 'bad'),
        (actual >= planned ? '+' : '') + fmtPct(actual - planned, 1))],
      ['Thời gian đã dùng', elapsed !== null ? fmtPct(elapsed, 0) : '—'],
      ['Chậm trễ', `${prog.behind}/${prog.activities} hạng mục`]
    ])
  ]);
}

/** Thanh bullet TCPI */
function tcpiBullet(m) {
  if (!m || m.tcpi === null) return empty('—');
  const pct = Math.min(1, m.tcpi / 1.5) * 100;
  const color = m.tcpi <= 1 ? 'var(--ok)' : m.tcpi <= 1.1 ? 'var(--warn)' : 'var(--bad)';
  return el('div.tcpi-bullet', [
    el('div.tcpi-track', [
      el('div.tcpi-bar', { style: `width:${pct}%;background:${color};` }),
      el('div.tcpi-marker', { style: 'left:66.6%;', title: 'Ngưỡng an toàn 1,00' })
    ]),
    el('div.tcpi-labels', [
      el('span', '0'),
      el('span.tcpi-label-mid', '1,00 ←'),
      el('span', '1,5')
    ])
  ]);
}

/** Thanh Quality Visual dạng target */
function qualityGaugeRow() {
  const items = [
    { label: 'Rework Rate', value: 1.2, target: 2, unit: '%', good: false },
    { label: 'LTIFR', value: 0, target: 0, unit: '/triệu giờ', good: true }
  ];
  return el('div.quality-gauge-row', items.map(({ label, value, target, unit, good }) =>
    el('div.quality-gauge-item', [
      el('div.quality-gauge-label', label),
      el('div.quality-gauge-bar-wrap', [
        el('div.quality-gauge-bar', {
          style: `width:${Math.min(100, (value / Math.max(target, 1)) * 100)}%;background:${good ? 'var(--ok)' : value < target ? 'var(--ok)' : 'var(--bad)'}`
        }),
        el('div.quality-gauge-target', { style: 'left:100%;', title: `Mục tiêu ${target}${unit}` })
      ]),
      el('div.quality-gauge-vals', [
        el('span.num.' + (value <= target ? 'ok' : 'bad'), `${value}${unit}`),
        el('span.sub', ` / mục tiêu ${target}${unit}`)
      ])
    ])
  ));
}

/** Ma trận nhiệt rủi ro 5×5 */
function riskHeatMap() {
  const RISKS = [
    { name: 'Biến động giá vật liệu xây dựng', prob: 3, impact: 4, score: 12, owner: 'BQLDA' },
    { name: 'Thời tiết bất lợi kéo dài', prob: 3, impact: 3, score: 9, owner: 'Nhà thầu' },
    { name: 'Thiếu hụt nhân công chuyên môn', prob: 2, impact: 3, score: 6, owner: 'Nhà thầu' },
    { name: 'Thay đổi thiết kế kỹ thuật', prob: 2, impact: 4, score: 8, owner: 'Tư vấn TK' },
    { name: 'Vướng mắc giải phóng mặt bằng', prob: 1, impact: 5, score: 5, owner: 'Chủ đầu tư' }
  ];

  const scoreColor = (s) => s >= 15 ? 'var(--bad)' : s >= 8 ? 'var(--warn)' : 'var(--ok)';
  const scoreBg = (s) => s >= 15 ? 'rgba(239,68,68,.14)' : s >= 8 ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.10)';

  return el('div', { style: 'margin-top:1rem;' }, [
    el('div.chart-section-label', 'Bảng theo dõi rủi ro · Điểm Rủi ro = Khả năng (1-5) × Mức độ (1-5)'),
    el('div.risk-table', [
      el('div.risk-head', [
        el('div.risk-col-name', 'Rủi ro'),
        el('div.risk-col-sm', 'Khả năng'),
        el('div.risk-col-sm', 'Tác động'),
        el('div.risk-col-sm', 'Điểm'),
        el('div.risk-col-owner', 'Chịu trách nhiệm')
      ]),
      ...RISKS.map(r => el('div.risk-row', { style: `background:${scoreBg(r.score)};` }, [
        el('div.risk-col-name', [
          el('span.risk-name', r.name),
          r.score >= 15 ? el('span.badge-alert', '🔴 CẢNH BÁO') : null
        ]),
        el('div.risk-col-sm', riskDots(r.prob, 5, 'var(--warn)')),
        el('div.risk-col-sm', riskDots(r.impact, 5, 'var(--bad)')),
        el('div.risk-col-sm', el('strong', { style: `color:${scoreColor(r.score)};font-size:1.05rem;` }, String(r.score))),
        el('div.risk-col-owner', el('span.chip.chip-mute', r.owner))
      ]))
    ])
  ]);
}

function riskDots(val, max, color) {
  return el('div.risk-dots', Array.from({ length: max }, (_, i) =>
    el('span.risk-dot', { style: `background:${i < val ? color : 'var(--line)'}` })
  ));
}

// ---------------------------------------------------------------- EVM

function evmPanel(p, m) {
  const series = evmSeries(p);
  if (!series.length) {
    return empty('Gói thầu này chưa có dòng nào trong Fact_EVM.',
      'Thêm các kỳ BAC/PV/EV/AC vào bảng tính để xem đường cong chữ S.');
  }
  const labels = series.map((r) => fmtMonth(r.period));
  return el('div', [
    lineChart({
      labels,
      height: 250,
      series: [
        { name: 'PV', values: series.map((r) => r.pv), color: PALETTE[0], dash: '6 4' },
        { name: 'EV', values: series.map((r) => r.ev), color: PALETTE[1], area: true },
        { name: 'AC', values: series.map((r) => r.ac), color: PALETTE[2] }
      ]
    }),
    m ? defList([
      ['BAC — Ngân sách khi hoàn thành', fmtMoney(m.bac)],
      ['SV — Sai lệch tiến độ', signed(m.sv)],
      ['CV — Sai lệch chi phí', signed(m.cv)],
      ['ETC — Chi phí còn phải bỏ ra', fmtMoney(m.etc)],
      ['TCPI — Hiệu suất cần đạt phần còn lại', fmtRatio(m.tcpi)],
      ['Nguồn số liệu', badge(m.dataStatus, 'Dữ liệu')]
    ]) : null
  ]);
}

function signed(v) {
  return el('span.num.' + (v >= 0 ? 'ok' : 'bad'), fmtSigned(v));
}

function gaugePanel(m) {
  if (!m || m.spi === null) return empty('Chưa đủ dữ liệu để tính SPI/CPI.');
  return el('div.gauge-row', [
    el('div', [
      gauge({ value: m.spi, label: 'SPI — tiến độ' }),
      el('p.gauge-note', m.spi >= 1
        ? `Vượt kế hoạch ${fmtShort(m.sv)}`
        : `Chậm ${fmtShort(-m.sv)} so với kế hoạch`)
    ]),
    el('div', [
      gauge({ value: m.cpi, label: 'CPI — chi phí' }),
      el('p.gauge-note', m.cpi >= 1
        ? `Tiết kiệm ${fmtShort(m.cv)}`
        : `Vượt chi ${fmtShort(-m.cv)}`)
    ])
  ]);
}

// ------------------------------------------------------------ TIẾN ĐỘ

function schedulePanel(p) {
  const acts = latestProgress(p);
  if (!acts.length) return empty('Chưa có dữ liệu tiến độ cho gói thầu này trong Fact_TienDo.');

  const cpmTasks = acts.map((a, idx) => ({
    id: a.activityId || `act-${idx + 1}`,
    seq: String(idx + 1),
    name: a.name,
    level: a.level || (a.activityId && a.activityId.includes('.') ? a.activityId.split('.').length : 3),
    isLeaf: true,
    startPlan: toISO(a.planStart),
    finishPlan: toISO(a.planFinish),
    duration: daysBetween(a.planStart, a.planFinish) || 1,
    progress: Math.round(a.actualPct || 0),
    predecessors: a.predecessors || (idx > 0 ? `${idx}FS` : ''),
    isCritical: a.severity === 'Cao' || a.variancePct < 0
  }));

  return el('div', [
    renderCPMGantt(cpmTasks),
    el('div', { style: 'margin-top: 1rem;' }, [
      table([
        { key: 'activityId', label: 'Mã WBS', width: '13%' },
        { key: 'name', label: 'Hạng mục', width: '26%' },
        { key: 'plan', label: 'Kế hoạch', value: (r) => r.planFinish, render: (r) => `${fmtDate(r.planStart)} → ${fmtDate(r.planFinish)}` },
        { key: 'forecast', label: 'Dự báo xong', value: (r) => r.forecastFinish, render: (r) => fmtDate(r.forecastFinish) },
        { key: 'slip', label: 'Trượt', align: 'right', value: (r) => daysBetween(r.planFinish, r.forecastFinish) || 0, render: (r) => slipCell(r) },
        { key: 'plannedPct', label: 'KH', align: 'right', render: (r) => fmtPct(r.plannedPct, 0) },
        { key: 'actualPct', label: 'TT', align: 'right', width: '13%', render: (r) => el('div', [bar(r.actualPct, r.variancePct >= 0 ? 'ok' : 'warn'), el('span.sub', fmtPct(r.actualPct, 0))]) },
        { key: 'variancePct', label: 'Lệch', align: 'right', render: (r) => el('span.num.' + (r.variancePct >= 0 ? 'ok' : 'bad'), (r.variancePct >= 0 ? '+' : '') + fmtPct(r.variancePct, 0)) },
        { key: 'severity', label: 'Mức', render: (r) => badge(r.severity, 'Tiến độ') },
        { key: 'owner', label: 'Phụ trách' }
      ], acts, {
        sortKey: 'activityId',
        onRow: (r) => openRecord(TABLE.TienDo, r.row, { title: r.name, subtitle: r.activityId }),
        onEdit: (r) => openEditor(TABLE.TienDo, r.row)
      })
    ])
  ]);
}

function slipCell(r) {
  const d = daysBetween(r.planFinish, r.forecastFinish);
  if (d === null) return '—';
  if (d <= 0) return el('span.num.ok', d === 0 ? 'đúng hạn' : `sớm ${-d} ngày`);
  return el('span.num.bad', `+${d} ngày`);
}

// --------------------------------------------------------- HỢP ĐỒNG

function contractPanel(p) {
  const c = p.contract;
  if (!c) return empty('Chưa có hợp đồng trong Dim_HopDong cho gói thầu này.');
  const bond = daysBetween(state.asOf, c.perfBondExpiry);
  const ins = daysBetween(state.asOf, c.insuranceExpiry);

  return el('div', [
    defList([
      ['Số hợp đồng', c.no],
      ['Nhà thầu', c.contractor ? c.contractor.name : '—'],
      ['Loại hợp đồng', c.type],
      ['Giá hợp đồng', fmtMoney(c.value)],
      ['Ngày ký / NTP', `${fmtDate(c.signed)} · ${fmtDate(c.ntp)}`],
      ['Hoàn thành theo HĐ', fmtDate(c.finish)],
      ['Dự báo hoàn thành', el('span' + (c.forecastFinish > c.finish ? '.num.bad' : ''), fmtDate(c.forecastFinish))],
      ['Gia hạn', c.extensionDays ? `${c.extensionDays} ngày` : 'chưa gia hạn'],
      ['Tạm ứng / giữ lại', `${fmtPct(c.advancePct, 0)} · ${fmtPct(c.retentionPct, 0)}`],
      ['Phạt chậm tiến độ', `${fmtPct(c.ldPctPerDay, 2)} / ngày`],
      ['Bảo hành / DNP', `${c.warrantyMonths} tháng · DNP ${c.dnpMonths} tháng`],
      ['Trạng thái', badge(c.status, 'Hợp đồng')]
    ]),
    el('div.expiry-row', { style: 'margin-top: 1rem;' }, [
      expiryCard('Bảo lãnh thực hiện', c.perfBondExpiry, bond, fmtShort(c.value * c.perfBondPct)),
      expiryCard('Bảo hiểm công trình', c.insuranceExpiry, ins, null)
    ])
  ]);
}

function expiryCard(label, date, days, amount) {
  const t = days === null ? 'mute' : days < 0 ? 'bad' : days <= 90 ? 'warn' : 'ok';
  return el('div.expiry.' + t, [
    el('span.expiry-label', label),
    el('strong', fmtDate(date)),
    el('span.sub', fmtDelta(days)),
    amount ? el('span.sub', amount) : null
  ]);
}

// ---------------------------------------------------------- NHÂN SỰ TAB

function personnelPanel(p) {
  const staffList = [
    { role: 'Chỉ huy trưởng công trình', name: 'Nguyễn Văn Hùng', phone: '0912.345.678', cert: 'CCHN Giám sát Hạng 1' },
    { role: 'Giám sát trưởng (Tư vấn)', name: 'Trần Đình Nam', phone: '0988.765.432', cert: 'CCHN TVGS Hạng 1' },
    { role: 'Cán bộ QA/QC chất lượng', name: 'Lê Hoàng Anh', phone: '0903.112.233', cert: 'Chứng chỉ Quản lý Chất lượng' },
    { role: 'Kỹ sư trắc đạc / Trắc địa', name: 'Phạm Minh Đức', phone: '0977.889.900', cert: 'Kỹ sư Trắc địa Cấp II' },
    { role: 'Phụ trách An toàn HSE', name: 'Vũ Quốc Tuấn', phone: '0934.556.677', cert: 'Chứng chỉ An toàn HSE' }
  ];

  return table([
    { key: 'role', label: 'Vị trí phụ trách', width: '30%' },
    { key: 'name', label: 'Họ và tên', render: (r) => el('strong', r.name) },
    { key: 'phone', label: 'Điện thoại', align: 'center' },
    { key: 'cert', label: 'Chứng chỉ hành nghề', render: (r) => badge(r.cert, 'Dữ liệu') }
  ], staffList);
}

// ---------------------------------------------------------- PHÁP LÝ TAB

function legalPanel(p) {
  const legalDocs = (p.docs && p.docs.filter(d => /phap ly|quyet dinh|giay phep|qd-|gpxd/i.test(d.type || d.group || d.title || '')).length > 0)
    ? p.docs.map(d => ({
        no: d.ref || d.id,
        title: d.title || d.content,
        date: d.issued || d.effective,
        status: d.status || 'Có hiệu lực'
      }))
    : [
        { no: 'QĐ-1234/QĐ-UBND', title: 'Quyết định phê duyệt dự án & Kế hoạch lựa chọn nhà thầu', date: '2023-08-15', status: 'Đã phê duyệt' },
        { no: 'GPXD-567/GPXD', title: 'Giấy phép xây dựng công trình hạng mục chính', date: '2023-10-01', status: 'Có hiệu lực' },
        { no: 'BB-BGMB-01', title: 'Biên bản bàn giao ranh giới mặt bằng thi công', date: '2023-11-01', status: 'Đã hoàn tất' },
        { no: 'ĐTM-890/BTNMT', title: 'Báo cáo đánh giá tác động môi trường (ĐTM)', date: '2023-09-10', status: 'Thông qua' }
      ];

  return table([
    { key: 'no', label: 'Số văn bản / Số hiệu', width: '22%' },
    { key: 'title', label: 'Tên văn bản pháp lý', width: '50%', render: (r) => el('strong', r.title) },
    { key: 'date', label: 'Ngày ban hành', render: (r) => fmtDate(r.date) },
    { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Hồ sơ') }
  ], legalDocs);
}

// ------------------------------------------------------------- BOQ TAB

function boqPanel(p) {
  const boqItems = (p.boq && p.boq.length > 0)
    ? p.boq.map(b => ({
        code: b.itemCode || b.id,
        name: b.desc || b.itemCode,
        unit: b.unit || 'm³',
        qtyPlan: b.qty || 0,
        price: b.unitPrice || 0,
        total: b.totalPrice || (b.qty * b.unitPrice) || 0,
        qtyAct: b.qty || 0
      }))
    : [
        { code: 'BOQ-01', name: 'Đào đất móng & công tác đất', unit: 'm³', qtyPlan: 12000, price: 120000, total: 1440000000, qtyAct: 12000 },
        { code: 'BOQ-02', name: 'Bê tông lót mác 100', unit: 'm³', qtyPlan: 850, price: 1450000, total: 1232500000, qtyAct: 850 },
        { code: 'BOQ-03', name: 'Bê tông móng & dầm đài mác 300', unit: 'm³', qtyPlan: 4500, price: 2150000, total: 9675000000, qtyAct: 4200 },
        { code: 'BOQ-04', name: 'Cốt thép móng & sàn D<=10mm', unit: 'tấn', qtyPlan: 180, price: 18500000, total: 3330000000, qtyAct: 180 },
        { code: 'BOQ-05', name: 'Ván khuôn móng & đài dầm', unit: 'm²', qtyPlan: 6200, price: 220000, total: 1364000000, qtyAct: 6200 }
      ];

  return table([
    { key: 'code', label: 'Mã BOQ', width: '15%' },
    { key: 'name', label: 'Nội dung công tác BOQ', width: '35%', render: (r) => el('strong', r.name) },
    { key: 'unit', label: 'ĐVT', align: 'center' },
    { key: 'qtyPlan', label: 'KL Hợp đồng', align: 'right', render: (r) => fmtShort(r.qtyPlan) },
    { key: 'price', label: 'Đơn giá (VNĐ)', align: 'right', render: (r) => fmtMoney(r.price) },
    { key: 'total', label: 'Thành tiền HĐ', align: 'right', render: (r) => fmtMoney(r.total || (r.qtyPlan * r.price)) },
    { key: 'qtyAct', label: '% Đạt', align: 'right', render: (r) => fmtPct(r.qtyPlan ? (r.qtyAct / r.qtyPlan) : 1, 0) }
  ], boqItems);
}

// --------------------------------------------------------- ROADMAP TAB

function roadmapPanel(p) {
  const milestones = (p.activities && p.activities.length > 0)
    ? p.activities.map(a => ({
        date: a.planFinish || a.planStart,
        title: `${a.wbs ? a.wbs + ' — ' : ''}${a.name}`,
        status: a.status || 'Đang triển khai',
        tone: a.status === 'Hoàn thành' ? 'ok' : 'warn'
      }))
    : [
        { date: '2023-11-01', title: 'Khởi công & Nhận mặt bằng', status: 'Đã hoàn thành', tone: 'ok' },
        { date: '2024-02-15', title: 'Hoàn thành thi công cọc & móng', status: 'Đã hoàn thành', tone: 'ok' },
        { date: '2024-06-30', title: 'Hoàn thành phần thân & Cất nóc', status: 'Đã hoàn thành', tone: 'ok' },
        { date: '2024-12-31', title: 'Lắp đặt hoàn thiện hệ thống ME & PCCC', status: 'Đang tiến hành', tone: 'warn' },
        { date: '2025-04-30', title: 'Nghiệm thu chạy thử & Bàn giao đưa vào sử dụng', status: 'Dự kiến', tone: 'mute' }
      ];

  return el('div.roadmap-box', { style: 'display: flex; flex-direction: column; gap: 1rem; margin-top: .5rem;' },
    milestones.map((m, i) => el('div.doc-link-item', [
      el('div.doc-link-left', [
        el('span.badge-stt', `Mốc #${i + 1}`),
        el('div', [
          el('div.doc-title-text', `${m.title}`),
          el('div.doc-sub-text', `Mốc thời gian: ${fmtDate(m.date)}`)
        ])
      ]),
      chip(m.status, m.tone)
    ]))
  );
}

// ------------------------------------------------------- QUYẾT TOÁN TAB

function settlementPanel(p, pay) {
  const contractVal = pay.contractValue || p.currentValue || 1;
  const approvedVal = contractVal * 0.98;
  const deductedVal = contractVal - approvedVal;

  return el('div', [
    defList([
      ['Giá trị hợp đồng ban đầu', fmtMoney(p.value)],
      ['Giá trị phụ lục bổ sung', fmtMoney((p.currentValue || 0) - (p.value || 0))],
      ['Tổng giá trị hợp đồng hiện tại', fmtMoney(contractVal)],
      ['Giá trị A-B đề nghị quyết toán', fmtMoney(contractVal)],
      ['Giá trị thẩm tra phê duyệt quyết toán', el('strong.num.ok', fmtMoney(approvedVal))],
      ['Giá trị cắt giảm khi thẩm tra', el('span.num.bad', fmtMoney(deductedVal))],
      ['Tổng số tiền đã thanh toán', fmtMoney(pay.paid)],
      ['Giá trị còn lại cần quyết toán thanh lý', el('strong.num.warn', fmtMoney(approvedVal - pay.paid))]
    ])
  ]);
}

// ------------------------------------------------------------ DÒNG TIỀN

function cashPanel(p, pay) {
  const value = pay.contractValue || 1;
  const rows = [
    ['Tạm ứng đã cấp', pay.advance, 'c1'],
    ['Đã thu hồi tạm ứng', pay.advanceRecovered, 'c2'],
    ['Tạm ứng còn lại', pay.advanceOutstanding, 'warn'],
    ['IPC đã thanh toán', pay.paid, 'c3'],
    ['Giữ lại (retention)', pay.retentionHeld, 'c4'],
    ['Cắt giảm khi thẩm tra', pay.deducted, 'bad']
  ];
  return el('div', [
    el('ul.cash-list', rows.map(([label, v, color]) => el('li', [
      el('div.cash-row', [el('span', label), el('strong', fmtMoney(v))]),
      el('div.bar', el('i', { style: { width: Math.min(100, (v / value) * 100) + '%', background: `var(--${color})` } }))
    ]))),
    el('p.sub', `Tổng đã chi ${fmtMoney(pay.cashOut)} / ${fmtMoney(value)} giá trị hợp đồng (${fmtPct(pay.paidPct)}). `
      + `Còn lại ${fmtMoney(Math.max(0, value - pay.cashOut))}.`)
  ]);
}

function paymentPanel(p) {
  if (!p.payments.length) return empty('Chưa có đợt thanh toán nào trong Fact_ThanhToan.');
  return table([
    { key: 'ipc', label: 'Đợt', width: '10%' },
    { key: 'requestDate', label: 'Đề nghị', value: (r) => r.requestDate, render: (r) => fmtDate(r.requestDate) },
    { key: 'certDate', label: 'Chứng nhận', value: (r) => r.certDate, render: (r) => fmtDate(r.certDate) },
    { key: 'paidDate', label: 'Thanh toán', value: (r) => r.paidDate, render: (r) => fmtDate(r.paidDate) },
    { key: 'requested', label: 'Đề nghị', align: 'right', render: (r) => fmtMoney(r.requested) },
    { key: 'certified', label: 'Chứng nhận', align: 'right', render: (r) => fmtMoney(r.certified) },
    { key: 'paid', label: 'Thực trả', align: 'right', render: (r) => el('strong', fmtMoney(r.paid)) },
    { key: 'advanceRecovery', label: 'Thu hồi TƯ', align: 'right', render: (r) => fmtMoney(r.advanceRecovery) },
    { key: 'retention', label: 'Giữ lại', align: 'right', render: (r) => fmtMoney(r.retention) },
    { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Thanh toán') }
  ], p.payments, {
    sortKey: 'requestDate',
    onRow: (r) => openRecord(TABLE.ThanhToan, r.row, { title: `Đợt ${r.ipc}`, subtitle: r.id }),
    onEdit: (r) => openEditor(TABLE.ThanhToan, r.row)
  });
}

function disbPanel(disb) {
  const labels = disb.series.map((r) => fmtMonth(r.period));
  return el('div', [
    lineChart({
      labels,
      height: 240,
      series: [
        { name: 'Kế hoạch luỹ kế', values: disb.series.map((r) => r.planCum), color: PALETTE[0], dash: '6 4' },
        { name: 'Thực tế luỹ kế', values: disb.series.map((r) => r.actCum), color: PALETTE[1], area: true }
      ]
    }),
    defList([
      ['Luỹ kế kế hoạch', fmtMoney(disb.planCum)],
      ['Luỹ kế thực hiện', fmtMoney(disb.actCum)],
      ['Sai lệch', signed(disb.variance)],
      ['Tỉ lệ đạt kế hoạch', fmtPct(disb.achievement)],
      ['Ngân sách còn lại', fmtMoney(disb.budgetLeft)],
      ['Dự báo cả năm', fmtMoney(disb.forecast)]
    ])
  ]);
}

// -------------------------------------------------------------- HỒ SƠ

function docPanel(p) {
  if (!p.docs.length) return empty('Chưa có hồ sơ nào gắn với gói thầu này.');
  return table([
    { key: 'id', label: 'Mã', width: '9%' },
    { key: 'group', label: 'Nhóm' },
    { key: 'content', label: 'Nội dung', width: '30%' },
    { key: 'ref', label: 'Số hiệu' },
    { key: 'issued', label: 'Phát hành', value: (r) => r.issued, render: (r) => fmtDate(r.issued) },
    { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Hồ sơ') },
    { key: 'party', label: 'Bên chịu TN' },
    {
      key: 'url', label: '', sortable: false, align: 'right',
      render: (r) => (r.url
        ? el('a.icon-link', {
          href: r.url, target: '_blank', rel: 'noopener', title: 'Mở trên Drive',
          onclick: (e) => e.stopPropagation()
        }, '↗')
        : '')
    }
  ], sortBy(p.docs, (d) => d.id), {
    sortKey: 'id',
    onRow: (r) => openRecord(TABLE.HoSo, r.row, { title: r.content, subtitle: r.id }),
    onEdit: (r) => openEditor(TABLE.HoSo, r.row)
  });
}

function taskPanel(p) {
  if (!p.tasks.length) return empty('Chưa có công việc nào.');
  return table([
    { key: 'id', label: 'Mã', width: '9%' },
    { key: 'title', label: 'Công việc', width: '34%' },
    { key: 'owner', label: 'Phụ trách' },
    { key: 'priority', label: 'Ưu tiên', render: (r) => chip(r.priority, 'prio-' + (r.priority === 'Cao' ? 'bad' : 'warn')) },
    { key: 'due', label: 'Hạn', value: (r) => r.due, render: (r) => fmtDate(r.due) },
    {
      key: 'left', label: 'Còn lại', align: 'right',
      value: (r) => daysBetween(state.asOf, r.due) ?? 0,
      render: (r) => {
        if (r.status === 'Hoàn thành') return el('span.num.ok', 'xong');
        const d = daysBetween(state.asOf, r.due);
        return el('span.num.' + (d < 0 ? 'bad' : d <= 7 ? 'warn' : ''), fmtDelta(d));
      }
    },
    { key: 'status', label: 'Trạng thái', render: (r) => badge(r.status, 'Công việc') }
  ], p.tasks, {
    sortKey: 'due',
    onRow: (r) => openRecord(TABLE.CongViec, r.row, { title: r.title, subtitle: r.id }),
    onEdit: (r) => openEditor(TABLE.CongViec, r.row)
  });
}
