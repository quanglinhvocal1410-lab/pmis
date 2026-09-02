/**
 * Trang Gói thầu: Bảng Kanban 6 giai đoạn màu sắc, Thẻ nhỏ gọn, Drag & Drop kéo thả chuyển giai đoạn.
 */
import { el, fmtShort, fmtPct, fmtRatio, fmtDate } from '../core.js';
import { state, distinct, TABLE } from '../store.js';
import { evmAt, health, progressSummary, paymentSummary, timeElapsed } from '../calc.js';
import { pageHead, badge, bar, filterBar, matches, empty, chip, btn, toast } from '../ui.js';
import { addButton, emptyWithAdd, openEditor } from '../editor.js';
import { deleteRow, updateRow } from '../api.js';
import { refreshNow } from '../sync.js';

// 6 Giai đoạn Kanban chuẩn quy trình với icon và màu sắc riêng
export const KANBAN_STAGES = [
  'Chuẩn bị đấu thầu',
  'Đang tổ chức lựa chọn nhà thầu',
  'Thương thảo & Ký hợp đồng',
  'Đang thực hiện',
  'Vận hành, bảo trì',
  'Quyết toán'
];

export const STAGE_CONFIG = {
  'Chuẩn bị đấu thầu': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)', class: 'stg-blue', icon: '📌' },
  'Đang tổ chức lựa chọn nhà thầu': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)', class: 'stg-purple', icon: '🔍' },
  'Thương thảo & Ký hợp đồng': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', class: 'stg-amber', icon: '📝' },
  'Đang thực hiện': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)', class: 'stg-emerald', icon: '🏗️' },
  'Vận hành, bảo trì': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.08)', class: 'stg-cyan', icon: '⚙️' },
  'Quyết toán': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.08)', class: 'stg-pink', icon: '💵' }
};

/** Phân loại gói thầu vào 1 trong 6 cột Kanban dựa theo phase/status */
export function getPackageStage(p) {
  const val = (p.phase || p.status || '').toLowerCase();
  if (val.includes('chuẩn bị') || val.includes('khlcnt') || val.includes('lập')) return KANBAN_STAGES[0];
  if (val.includes('lựa chọn') || val.includes('đấu thầu') || val.includes('mời thầu') || val.includes('dự thầu')) return KANBAN_STAGES[1];
  if (val.includes('thương thảo') || val.includes('ký') || val.includes('hợp đồng')) return KANBAN_STAGES[2];
  if (val.includes('vận hành') || val.includes('bảo trì') || val.includes('bảo hành')) return KANBAN_STAGES[4];
  if (val.includes('quyết toán') || val.includes('thanh lý') || val.includes('nghiệm thu toàn bộ')) return KANBAN_STAGES[5];
  return KANBAN_STAGES[3]; // Đang thực hiện (mặc định)
}

export function render() {
  let viewMode = 'kanban'; // 'kanban' | 'grid'
  let selected = new Set();

  const container = el('div.pkg-view-container');

  const draw = (filters = {}) => {
    const rows = state.packages.filter((p) =>
      matches(filters.q, p.id, p.code, p.name, p.contractor ? p.contractor.name : '') &&
      (!filters.status || p.status === filters.status) &&
      (!filters.phase || p.phase === filters.phase || getPackageStage(p) === filters.phase) &&
      (!filters.risk || p.risk === filters.risk)
    );

    // Toolbar chọn & xoá + Chuyển view
    const selectionBar = el('div.pkg-toolbar', [
      el('div.pkg-select-actions', [
        el('label.select-all-label', [
          el('input', {
            type: 'checkbox',
            checked: rows.length > 0 && selected.size === rows.length,
            onchange: (e) => {
              if (e.target.checked) {
                rows.forEach((r) => selected.add(r.id));
              } else {
                selected.clear();
              }
              draw(filters);
            }
          }),
          el('span', ` Chọn tất cả (${rows.length} gói)`)
        ]),
        selected.size > 0
          ? btn(`🗑️ Xoá ${selected.size} gói đã chọn`, () => deleteSelected(Array.from(selected), draw, filters), 'danger')
          : null
      ]),

      el('div.view-toggle', [
        el('button', {
          class: viewMode === 'kanban' ? 'active' : '',
          onclick: () => { viewMode = 'kanban'; draw(filters); }
        }, '📊 Bảng Kanban'),
        el('button', {
          class: viewMode === 'grid' ? 'active' : '',
          onclick: () => { viewMode = 'grid'; draw(filters); }
        }, '📋 Danh sách thẻ')
      ])
    ]);

    let mainContent;
    if (!rows.length) {
      mainContent = state.packages.length
        ? empty('Không có gói thầu nào khớp bộ lọc.')
        : emptyWithAdd(TABLE.GoiThau, 'Bảng Dim_GoiThau chưa có gói thầu nào.', { label: '+ Thêm gói thầu mới' });
    } else if (viewMode === 'kanban') {
      mainContent = renderKanbanBoard(rows, selected, draw, filters);
    } else {
      mainContent = el('div.pkg-grid', rows.map((p) => card(p, selected, draw, filters, false)));
    }

    container.replaceChildren(selectionBar, mainContent);
  };

  const bar1 = filterBar([
    { type: 'search', key: 'q', label: 'Tìm gói thầu, nhà thầu…' },
    { type: 'select', key: 'phase', label: 'Giai đoạn', options: KANBAN_STAGES },
    { type: 'select', key: 'status', label: 'Trạng thái', options: distinct(state.packages, 'status') },
    { type: 'select', key: 'risk', label: 'Rủi ro', options: distinct(state.packages, 'risk') }
  ], draw);

  draw();

  return el('div.view', [
    pageHead(
      'Gói thầu & Tiến độ Quy trình',
      `${state.packages.length} gói thuộc ${state.projects.length} dự án · Kanban Kéo thả & Phân loại Màu sắc`,
      [addButton(TABLE.GoiThau, {
        label: '+ Thêm gói thầu mới',
        defaults: state.projects[0] ? { ID_Du_An: state.projects[0].id } : {}
      })]
    ),
    bar1,
    container
  ]);
}

/** Render Bảng Kanban 6 Cột Giai Đoạn có Màu Sắc & Kéo Thả Drag & Drop */
function renderKanbanBoard(packages, selected, redraw, filters) {
  const grouped = {};
  KANBAN_STAGES.forEach((stg) => { grouped[stg] = []; });

  packages.forEach((p) => {
    const stg = getPackageStage(p);
    grouped[stg].push(p);
  });

  return el('div.kanban-board', KANBAN_STAGES.map((stg) => {
    const list = grouped[stg] || [];
    const totalVal = list.reduce((sum, p) => sum + (p.currentValue || 0), 0);
    const cfg = STAGE_CONFIG[stg] || { color: '#64748b', bg: 'rgba(100,116,139,0.08)', icon: '📋' };

    const colEl = el('div.kanban-col.' + (cfg.class || ''), {
      style: `border-top: 3px solid ${cfg.color}; background: ${cfg.bg};`,
      ondragover: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        colEl.classList.add('drag-over');
      },
      ondragleave: () => colEl.classList.remove('drag-over'),
      ondrop: (e) => {
        e.preventDefault();
        colEl.classList.remove('drag-over');
        const pkgId = e.dataTransfer.getData('text/plain');
        if (pkgId) {
          movePackageToStage(pkgId, stg, redraw, filters);
        }
      }
    }, [
      el('div.kanban-head', { style: `border-left: 3px solid ${cfg.color};` }, [
        el('div.kanban-title', [
          el('span.kanban-name', `${cfg.icon} ${stg}`),
          el('span.kanban-count', { style: `background: ${cfg.color};` }, String(list.length))
        ]),
        el('span.kanban-sum', totalVal > 0 ? fmtShort(totalVal) : '0đ')
      ]),
      el('div.kanban-cards', list.length > 0
        ? list.map((p) => card(p, selected, redraw, filters, true, cfg))
        : [el('div.kanban-empty', 'Kéo gói thầu vào đây')]
      )
    ]);

    return colEl;
  }));
}

/** Render Card Gói Thầu (Có thiết kế Compact Nhỏ Gọn cho Kanban) */
function card(p, selected, redraw, filters, isKanban = false, stageCfg = null) {
  const m = evmAt(p);
  const h = health(m);
  const prog = progressSummary(p);
  const pay = paymentSummary(p);
  const done = m ? m.pctComplete : prog ? prog.actual : null;
  const isSelected = selected.has(p.id);

  if (isKanban) {
    // ---------------- THẺ GÓI THẦU NHỎ GỌN (COMPACT KANBAN CARD) ----------------
    const compactCard = el('article.pkg-card.compact.' + h.tone + (isSelected ? '.selected' : ''), {
      draggable: 'true',
      ondragstart: (e) => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'move';
        compactCard.classList.add('dragging');
      },
      ondragend: () => compactCard.classList.remove('dragging')
    }, [
      el('div.pkg-card-top', [
        el('label.pkg-check', [
          el('input', {
            type: 'checkbox',
            checked: isSelected,
            onchange: (e) => {
              if (e.target.checked) selected.add(p.id);
              else selected.delete(p.id);
              redraw(filters);
            }
          })
        ]),
        el('a.pkg-link-compact', { href: `#/goi-thau/${p.id}` }, [
          el('span.pkg-code-compact', p.code || p.id),
          el('h4.pkg-title-compact', { title: p.shortName || p.name }, p.shortName || p.name)
        ]),
        el('div.pkg-card-actions-compact', [
          btn('✏️', () => openEditor(TABLE.GoiThau, p), 'icon-sm', 'Sửa gói thầu'),
          btn('🗑️', () => deleteSelected([p.id], redraw, filters), 'icon-sm danger', 'Xoá gói thầu')
        ])
      ]),

      el('div.pkg-sub-meta', [
        el('span.contractor-name', { title: p.contractor ? p.contractor.name : 'Chưa có NT' },
          p.contractor ? p.contractor.name : 'Chưa có nhà thầu'
        )
      ]),

      el('div.pkg-compact-progress', [
        el('div.progress-row-sm', [
          el('span.muted', 'Khối lượng:'),
          el('strong.pct', done === null ? '—' : fmtPct(done, 1))
        ]),
        bar(done || 0, h.tone)
      ]),

      el('footer.pkg-compact-foot', [
        el('span.val', fmtShort(p.currentValue)),
        el('a.more-link', { href: `#/goi-thau/${p.id}` }, 'Chi tiết →')
      ])
    ]);

    return compactCard;
  }

  // ---------------- THẺ GÓI THẦU DẠNG LƯỚI ĐẦY ĐỦ (GRID VIEW CARD) ----------------
  const elapsed = timeElapsed(p);

  return el('article.pkg-card.' + h.tone + (isSelected ? '.selected' : ''), [
    el('div.pkg-card-top', [
      el('label.pkg-check', [
        el('input', {
          type: 'checkbox',
          checked: isSelected,
          onchange: (e) => {
            if (e.target.checked) selected.add(p.id);
            else selected.delete(p.id);
            redraw(filters);
          }
        })
      ]),
      el('a.pkg-link', { href: `#/goi-thau/${p.id}` }, [
        el('div', [
          el('span.pkg-code', p.code || p.id),
          el('h3', p.shortName || p.name)
        ])
      ]),
      el('div.pkg-card-actions', [
        btn('✏️', () => openEditor(TABLE.GoiThau, p), 'icon', 'Sửa gói thầu'),
        btn('🗑️', () => deleteSelected([p.id], redraw, filters), 'icon danger', 'Xoá gói thầu')
      ])
    ]),

    el('div.pkg-meta', [
      badge(p.status || 'Gói thầu', 'Gói thầu'),
      chip(p.phase || getPackageStage(p)),
      chip('Rủi ro: ' + p.risk, 'risk-' + h.tone)
    ]),

    el('p.pkg-contractor', p.contractor ? p.contractor.name : 'Chưa có nhà thầu'),

    el('div.pkg-progress', [
      el('div.pkg-progress-row', [
        el('span', 'Khối lượng'),
        el('strong', done === null ? 'chưa có số liệu' : fmtPct(done))
      ]),
      bar(done || 0, h.tone),
      elapsed !== null
        ? el('div.pkg-progress-row.sub', [
          el('span', 'Thời gian đã dùng'),
          el('span', fmtPct(elapsed, 0))
        ])
        : null
    ]),

    el('dl.pkg-stats', [
      stat('Giá trị HĐ', fmtShort(p.currentValue)),
      stat('Đã chi', fmtShort(pay.cashOut)),
      stat('SPI', m && m.spi !== null ? fmtRatio(m.spi) : '—', m && m.spi !== null ? toneOf(m.spi) : null),
      stat('CPI', m && m.cpi !== null ? fmtRatio(m.cpi) : '—', m && m.cpi !== null ? toneOf(m.cpi) : null)
    ]),

    el('footer.pkg-foot', [
      el('span', `${fmtDate(p.start)} → ${fmtDate(p.finish)}`),
      el('a.more', { href: `#/goi-thau/${p.id}` }, 'Chi tiết →')
    ])
  ]);
}

/** Chuyển giai đoạn gói thầu qua Kéo Thả Drag & Drop */
async function movePackageToStage(packageId, newStage, redraw, filters) {
  const p = state.packages.find((item) => item.id === packageId);
  if (!p) return;
  const currentStage = getPackageStage(p);
  if (currentStage === newStage) return;

  // Tải tạm thời trên UI (Optimistic update)
  p.phase = newStage;
  p.status = newStage;
  toast(`Đang chuyển ${p.code || p.id} sang "${newStage}"…`, 'info');
  redraw(filters);

  try {
    await updateRow(TABLE.GoiThau, {
      ID_Goi_Thau: p.id,
      Giai_Doan_Vong_Doi: newStage,
      Trang_Thai: newStage
    });
    toast(`Đã chuyển gói thầu ${p.code || p.id} sang "${newStage}" thành công!`, 'ok');
    await refreshNow();
    redraw(filters);
  } catch (err) {
    toast(`Lỗi khi cập nhật giai đoạn: ${err.message}`, 'bad');
  }
}

/** Xoá các gói thầu đã chọn */
async function deleteSelected(ids, redraw, filters) {
  if (!ids.length) return;
  if (!confirm(`Bạn có chắc chắn muốn xoá ${ids.length} gói thầu đã chọn khỏi bảng Dim_GoiThau?`)) return;

  toast(`Đang xoá ${ids.length} gói thầu…`, 'info');
  try {
    for (const id of ids) {
      await deleteRow(TABLE.GoiThau, id);
    }
    toast(`Đã xoá ${ids.length} gói thầu thành công`, 'ok');
    await refreshNow();
    redraw(filters);
  } catch (err) {
    toast(`Lỗi khi xoá gói thầu: ${err.message}`, 'bad');
  }
}

function toneOf(v) {
  return v >= 1 ? 'ok' : v >= 0.95 ? 'warn' : 'bad';
}

function stat(label, value, t) {
  return el('div.pkg-stat', [
    el('dt', label),
    el('dd' + (t ? '.' + t : ''), value)
  ]);
}
