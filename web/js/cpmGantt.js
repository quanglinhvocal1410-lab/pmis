/**
 * Module Tiến độ Tự động & Sơ đồ Gantt CPM (Critical Path Method & WBS Multi-level).
 * Phân cấp Level 1-5, Nút Hover "+ Thêm công tác", Dấu con mắt 👁️ xem Hồ sơ chi tiết,
 * Double Click cuộn sơ đồ Gantt tới mốc ngày của công tác,
 * Multi-Select Tạo HSCL, Hiệu chỉnh tiến độ trực tiếp & Tự động tính toán CPM Forward Pass vẽ mũi tên SVG,
 * Nhập/Xuất Excel Mẫu.
 */
import { el, fmtDate, toISO } from './core.js';
import { state } from './store.js';
import { btn, toast } from './ui.js';

/** Tải động thư viện SheetJS XLSX nếu chưa có */
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('Không tải được thư viện SheetJS (XLSX)'));
    document.head.appendChild(script);
  });
}

/** Chuyển đổi Google Drive Link sang URL Preview nhúng Viewer */
export function getDrivePreviewUrl(url = '') {
  if (!url) return '';
  const m = url.match(/\/file\/d\/([^\/]+)/) || url.match(/id=([^&]+)/);
  if (m && m[1]) {
    return `https://drive.google.com/file/d/${m[1]}/preview`;
  }
  if (url.startsWith('http')) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  }
  return url;
}

/** Đếm số ngày giữa 2 mốc thời gian (bỏ qua múi giờ) */
function daysDiff(d1, d2) {
  const ms1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const ms2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return Math.round((ms2 - ms1) / 86400000);
}

/** Màu sắc cho từng cấp độ Level WBS (1 - 5) */
export const LEVEL_CONFIG = {
  1: { bg: '#f59e0b', color: '#78350f', label: '1', class: 'lvl-1', icon: '📁' },
  2: { bg: '#2563eb', color: '#ffffff', label: '2', class: 'lvl-2', icon: '📂' },
  3: { bg: '#059669', color: '#ffffff', label: '3', class: 'lvl-3', icon: '🔹' },
  4: { bg: '#475569', color: '#ffffff', label: '4', class: 'lvl-4', icon: '▫️' },
  5: { bg: '#64748b', color: '#ffffff', label: '5', class: 'lvl-5', icon: '•' }
};

/** Phân tích chuỗi Predecessors (Ví dụ: "3FS", "4FS+2", "5SS") */
export function parsePredecessors(raw, seqMap) {
  if (!raw) return [];
  const parts = String(raw).split(',');
  const deps = [];

  parts.forEach((p) => {
    const m = p.trim().match(/^(\d+)(FS|SS|FF|SF)?([+-]\d+)?$/i);
    if (m) {
      const fromSeq = m[1];
      const type = m[2] ? m[2].toUpperCase() : 'FS';
      const lag = parseInt(m[3] || '0', 10);
      const fromId = seqMap.get(fromSeq);
      if (fromId) {
        deps.push({ fromSeq, fromTaskId: fromId, type, lag });
      }
    }
  });
  return deps;
}

/** Tự động nhận diện Level từ tên công việc (Level 1 -> 5) */
export function detectTaskLevel(name = '', existingLevel) {
  if (existingLevel && Number(existingLevel) > 0) return Number(existingLevel);
  const raw = String(name || '').trim();
  if (raw.startsWith('TỔNG') || (raw === raw.toUpperCase() && !raw.includes('.'))) return 1;
  if (/^[IVX]+\.\s/.test(raw)) return 2;
  if (/^[A-Z]\.\s/.test(raw)) return 3;
  if (/^\d+\.\s/.test(raw)) return 4;
  return 3;
}

/** Thuật toán CPM Engine Forward Pass & WBS Rollup */
export function computeCPM(tasks = []) {
  if (!tasks.length) {
    const now = new Date();
    return { computedTasks: [], dependencies: [], timeRange: { minDate: now, maxDate: now, totalDays: 30 } };
  }

  const seqMap = new Map();
  const tList = tasks.map((t, i) => {
    const seq = t.seq || String(i + 1);
    const id = t.id || `task-${i + 1}`;
    seqMap.set(String(seq), id);
    const level = detectTaskLevel(t.name, t.level);
    return { ...t, id, seq: String(seq), level };
  });

  const dependencies = [];
  tList.forEach((t) => {
    const deps = parsePredecessors(t.predecessors, seqMap);
    deps.forEach((d) => {
      if (d.fromTaskId !== t.id) {
        dependencies.push({
          id: `${d.fromTaskId}-${t.id}`,
          fromTaskId: d.fromTaskId,
          toTaskId: t.id,
          type: d.type,
          lag: d.lag
        });
      }
    });
  });

  const today = new Date();
  let baseStart = today;
  if (tList[0] && tList[0].startPlan) {
    const d = new Date(tList[0].startPlan);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2024 && d.getFullYear() <= 2027) {
      baseStart = d;
    }
  }

  // Chạy Forward Pass tính toán mốc ngày thực tế dựa vào Predecessors
  const computedTasksMap = new Map();

  const computedTasks = tList.map((t, idx) => {
    let start = t.startPlan ? new Date(t.startPlan) : new Date(baseStart.getTime() + idx * 86400000 * 2);
    if (isNaN(start.getTime()) || start.getFullYear() > 2028 || start.getFullYear() < 2020) {
      start = new Date(baseStart.getTime() + idx * 86400000 * 2);
    }

    const deps = parsePredecessors(t.predecessors, seqMap);
    deps.forEach((d) => {
      const predTask = computedTasksMap.get(d.fromTaskId);
      if (predTask && predTask.finish) {
        const predFinish = new Date(predTask.finish);
        if (!isNaN(predFinish.getTime())) {
          const lagMs = (d.lag || 0) * 86400000;
          if (d.type === 'FS') {
            const nextStart = new Date(predFinish.getTime() + 86400000 + lagMs);
            if (nextStart > start || !t.startPlan) {
              start = nextStart;
            }
          }
        }
      }
    });

    const dur = Math.max(1, t.duration || 1);
    const finish = new Date(start.getTime() + (dur - 1) * 86400000);
    const isParent = t.level === 1 || t.level === 2 || (t.isLeaf === false);
    const isCritical = !!t.isCritical || (!isParent && (t.progress || 0) < 100 && t.predecessors && t.predecessors.includes('FS'));

    const taskObj = {
      ...t,
      start,
      finish,
      duration: dur,
      isParent,
      isCritical,
      startStr: toISO(start),
      finishStr: toISO(finish)
    };

    computedTasksMap.set(t.id, taskObj);
    return taskObj;
  });

  let minMs = Infinity;
  let maxMs = -Infinity;

  computedTasks.forEach((t) => {
    if (t.start) {
      const ms = t.start.getTime();
      if (ms < minMs) minMs = ms;
    }
    if (t.finish) {
      const ms = t.finish.getTime();
      if (ms > maxMs) maxMs = ms;
    }
  });

  if (minMs === Infinity) minMs = today.getTime();
  if (maxMs === -Infinity || maxMs <= minMs) maxMs = minMs + 30 * 86400000;

  const minDate = new Date(minMs);
  const maxDate = new Date(maxMs);
  const totalDays = Math.max(20, daysDiff(minDate, maxDate) + 10);

  return { computedTasks, dependencies, timeRange: { minDate, maxDate, totalDays } };
}

/** Component Render Sơ đồ Gantt CPM chuyên nghiệp */
export function renderCPMGantt(initialTasks = [], options = {}) {
  let tasksList = [...initialTasks];
  let pxPerDay = options.pxPerDay || 28;
  let filterStatus = 'all';
  let selectedIds = [];
  let isEditMode = false;
  const today = new Date();

  const container = el('div.cpm-gantt-wrapper');

  // Chèn hạng mục mới vào ngay dưới công tác được chọn
  const addTaskBelow = (afterId) => {
    const idx = tasksList.findIndex((t) => t.id === afterId);
    if (idx < 0) return;
    const ref = tasksList[idx];
    const newTask = {
      id: `task-${Date.now()}`,
      seq: String(idx + 2),
      name: `Công tác thi công mới (dưới ${ref.seq})`,
      level: Math.min(5, (ref.level || 3) + (ref.isParent ? 1 : 0)),
      isLeaf: true,
      startPlan: toISO(ref.finish || ref.start || today),
      finishPlan: toISO(new Date((ref.finish ? ref.finish.getTime() : today.getTime()) + 5 * 86400000)),
      duration: 5,
      progress: 0,
      predecessors: `${ref.seq || idx + 1}FS`,
      isCritical: false
    };

    tasksList.splice(idx + 1, 0, newTask);
    tasksList.forEach((t, i) => { t.seq = String(i + 1); });
    toast(`Đã chèn công tác mới bên dưới #${ref.seq}`, 'ok');
    redraw();
  };

  // Xóa các công tác đã chọn
  const batchDeleteTasks = (ids = []) => {
    if (!ids.length) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa ${ids.length} công tác đã chọn không?`)) return;

    tasksList = tasksList.filter((t) => !ids.includes(t.id));
    tasksList.forEach((t, i) => { t.seq = String(i + 1); });
    toast(`Đã xóa ${ids.length} công tác thành công`, 'ok');
    selectedIds = [];
    redraw();
  };

  // Gộp nhiều công tác thành Nhóm tổng hợp (Parent Summary Task)
  const batchGroupTasks = (ids = []) => {
    if (!ids.length) return;
    const selectedTasks = tasksList.filter((t) => ids.includes(t.id));
    const firstIdx = tasksList.findIndex((t) => ids.includes(t.id));
    if (firstIdx < 0) return;

    const groupName = prompt(`Nhập tên Nhóm công tác gộp (${selectedTasks.length} hạng mục):`, `Nhóm công tác tổng hợp (${selectedTasks.length} mục)`);
    if (!groupName || !groupName.trim()) return;

    let minMs = Infinity;
    let maxMs = -Infinity;
    let sumProg = 0;

    selectedTasks.forEach((t) => {
      const s = new Date(t.startPlan || t.start || today).getTime();
      const f = new Date(t.finishPlan || t.finish || today).getTime();
      if (!isNaN(s) && s < minMs) minMs = s;
      if (!isNaN(f) && f > maxMs) maxMs = f;
      sumProg += (t.progress || 0);
    });

    const minStart = minMs === Infinity ? today : new Date(minMs);
    const maxFinish = maxMs === -Infinity ? today : new Date(maxMs);
    const parentLevel = Math.max(1, Math.min(...selectedTasks.map((t) => t.level || 3)) - 1);

    const parentTask = {
      id: `group-${Date.now()}`,
      seq: '',
      name: groupName.trim(),
      level: parentLevel,
      isParent: true,
      isLeaf: false,
      startPlan: toISO(minStart),
      finishPlan: toISO(maxFinish),
      duration: Math.max(1, daysDiff(minStart, maxFinish)),
      progress: Math.round(sumProg / selectedTasks.length),
      predecessors: ''
    };

    tasksList = tasksList.filter((t) => !ids.includes(t.id));
    const updatedChildren = selectedTasks.map((t) => ({
      ...t,
      level: Math.max(parentLevel + 1, t.level || 3)
    }));

    tasksList.splice(firstIdx, 0, parentTask, ...updatedChildren);
    tasksList.forEach((t, i) => { t.seq = String(i + 1); });

    toast(`Đã gộp ${selectedTasks.length} công tác thành nhóm "${groupName.trim()}"!`, 'ok');
    selectedIds = [];
    redraw();
  };

  // Xuất Excel mẫu
  const exportSampleExcel = async () => {
    try {
      const XLSX = await loadXLSX();
      const exportData = tasksList.map((t, i) => ({
        'STT': t.seq || String(i + 1),
        'Level': t.level || 3,
        'Mã WBS': t.id || `WBS-${i + 1}`,
        'Tên công việc (WBS)': t.name || '',
        'Thời gian (ngày)': t.duration || 1,
        'Ngày bắt đầu (YYYY-MM-DD)': toISO(t.start || today),
        'Ngày kết thúc (YYYY-MM-DD)': toISO(t.finish || today),
        '% Hoàn thành': t.progress || 0,
        'Tiền đề (Predecessors)': t.predecessors || ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tien_Do_WBS');
      XLSX.writeFile(wb, 'Mau_Tien_Do_Thi_Cong_WBS.xlsx');
      toast('Đã tải xuống file mẫu Excel tiến độ chuẩn', 'ok');
    } catch (err) {
      toast('Lỗi khi xuất Excel mẫu: ' + err.message, 'bad');
    }
  };

  // Nhập dữ liệu từ Excel mẫu
  const importExcelFile = async (file) => {
    try {
      const XLSX = await loadXLSX();
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);

        if (!json.length) {
          toast('File Excel không có dữ liệu!', 'bad');
          return;
        }

        const newTasks = json.map((r, i) => ({
          id: String(r['Mã WBS'] || `task-excel-${i + 1}`),
          seq: String(r['STT'] || i + 1),
          name: String(r['Tên công việc (WBS)'] || r['Tên công việc'] || `Công tác ${i + 1}`),
          level: Number(r['Level'] || detectTaskLevel(r['Tên công việc (WBS)'], 3)),
          duration: Number(r['Thời gian (ngày)'] || r['Thời gian'] || 1),
          startPlan: r['Ngày bắt đầu (YYYY-MM-DD)'] || r['Bắt đầu'] || toISO(today),
          finishPlan: r['Ngày kết thúc (YYYY-MM-DD)'] || r['Kết thúc'] || toISO(today),
          progress: Number(r['% Hoàn thành'] || r['%C'] || 0),
          predecessors: String(r['Tiền đề (Predecessors)'] || r['Tiền đề'] || ''),
          isCritical: false
        }));

        tasksList = newTasks;
        selectedIds = [];
        toast(`Đã nạp ${newTasks.length} hạng mục từ Excel thành công!`, 'ok');
        redraw();
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      toast('Lỗi khi đọc file Excel: ' + err.message, 'bad');
    }
  };

  const redraw = () => {
    const { computedTasks, dependencies, timeRange } = computeCPM(tasksList);
    const { minDate, maxDate, totalDays } = timeRange;

    // Lọc công tác
    const filteredTasks = computedTasks.filter((t) => {
      if (filterStatus === 'critical') return t.isCritical;
      if (filterStatus === 'overdue') return t.finish < today && (t.progress || 0) < 100;
      if (filterStatus === 'upcoming') {
        const days = daysDiff(today, t.finish);
        return days >= 0 && days <= 7 && (t.progress || 0) < 100;
      }
      if (filterStatus === 'done') return (t.progress || 0) >= 100;
      return true;
    });

    const fileInput = el('input', {
      type: 'file',
      accept: '.xlsx, .xls',
      style: 'display: none;',
      onchange: (e) => {
        if (e.target.files && e.target.files[0]) {
          importExcelFile(e.target.files[0]);
        }
      }
    });

    // Control Bar
    const controlBar = el('div.cpm-controls', [
      el('div.cpm-filter-group', [
        el('span.cpm-label', 'Bộ lọc:'),
        el('select.cpm-select', {
          value: filterStatus,
          onchange: (e) => { filterStatus = e.target.value; redraw(); }
        }, [
          el('option', { value: 'all' }, `Tất cả ${computedTasks.length} hạng mục`),
          el('option', { value: 'critical' }, '🔴 Đường găng (Critical Path)'),
          el('option', { value: 'overdue' }, '⚠️ Trễ hạn'),
          el('option', { value: 'upcoming' }, '⏳ Sắp hết hạn (7 ngày)'),
          el('option', { value: 'done' }, '✅ Đã hoàn thành')
        ]),

        // Thao tác hàng loạt cho các hạng mục đã chọn
        selectedIds.length > 0
          ? el('div.cpm-batch-actions', [
              btn(`📑 Tạo HSCL (${selectedIds.length})`, () => openBatchCreateDocModal(selectedIds, computedTasks), 'primary-sm'),
              btn(`🔗 Gộp Nhóm (${selectedIds.length})`, () => batchGroupTasks(selectedIds), 'primary-sm'),
              btn(`🗑️ Xóa (${selectedIds.length})`, () => batchDeleteTasks(selectedIds), 'danger-sm')
            ])
          : null,

        // Nút Bật/Tắt Hiệu chỉnh tiến độ trực tiếp
        btn(isEditMode ? '✓ Xong hiệu chỉnh' : '✏️ Hiệu chỉnh tiến độ', () => {
          isEditMode = !isEditMode;
          toast(isEditMode ? 'Đã bật chế độ hiệu chỉnh ngày & tiền đề trực tiếp' : 'Đã tắt hiệu chỉnh', 'info');
          redraw();
        }, isEditMode ? 'ok-sm' : 'sm')
      ]),

      el('div.cpm-zoom-group', [
        btn('📥 File mẫu Excel', exportSampleExcel, 'sm'),
        btn('📤 Nhập Excel', () => fileInput.click(), 'sm'),
        fileInput,
        el('span.cpm-label', 'Zoom:'),
        btn('−', () => { pxPerDay = Math.max(16, pxPerDay - 4); redraw(); }, 'icon-sm'),
        el('span.cpm-val', `${pxPerDay}px/ngày`),
        btn('+', () => { pxPerDay = Math.min(60, pxPerDay + 4); redraw(); }, 'icon-sm'),
        btn('📅 Hôm nay', () => scrollToToday(minDate, maxDate, filteredTasks, pxPerDay), 'primary-sm')
      ])
    ]);

    // Timeline Header 2 tầng: Tầng 1 Tháng/Năm + Tầng 2 Ngày/Thứ
    const timelineWidth = totalDays * pxPerDay;
    const monthGroups = [];
    let currentMonthKey = null;
    let currentMonthObj = null;

    const daysHeader = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(minDate.getTime() + i * 86400000);
      const mKey = `${d.getMonth() + 1}/${d.getFullYear()}`;
      
      if (mKey !== currentMonthKey) {
        currentMonthKey = mKey;
        currentMonthObj = {
          label: `THÁNG ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
          count: 1
        };
        monthGroups.push(currentMonthObj);
      } else {
        currentMonthObj.count++;
      }

      const isSun = d.getDay() === 0;
      const isToday = d.toDateString() === today.toDateString();

      daysHeader.push(el('div.cpm-day-cell' + (isSun ? '.weekend' : '') + (isToday ? '.today' : ''), {
        style: `width: ${pxPerDay}px;`
      }, [
        el('span.day-num', String(d.getDate())),
        el('span.day-name', ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()])
      ]));
    }

    const monthHeaderCells = monthGroups.map((mg) =>
      el('div.cpm-month-cell', {
        style: `width: ${mg.count * pxPerDay}px;`
      }, mg.label)
    );

    const todayDays = daysDiff(minDate, today);
    const todayOffset = todayDays * pxPerDay;

    // Body: Left WBS Table + Right Gantt Timeline
    const leftTableRows = filteredTasks.map((t, idx) => {
      const lvlCfg = LEVEL_CONFIG[t.level] || LEVEL_CONFIG[3];
      const isParent = t.isParent;
      const isDone = (t.progress || 0) >= 100;
      const isSelected = selectedIds.includes(t.id);
      const parentClass = t.level === 1 ? 'parent-l1' : t.level === 2 ? 'parent-l2' : isParent ? 'parent' : '';

      return el('div.cpm-table-row' + (parentClass ? '.' + parentClass : '') + (t.isCritical ? '.critical' : '') + (isSelected ? '.selected' : ''), {
        title: 'Nhấp đôi để cuộn sơ đồ Gantt tới mốc ngày & vị trí dòng công tác này',
        onclick: () => scrollToTask(t, minDate, pxPerDay, idx),
        ondblclick: () => scrollToTask(t, minDate, pxPerDay, idx)
      }, [
        el('div.col-seq', String(t.seq || idx + 1)),
        el('div.col-lvl', [
          el('span.lvl-badge', {
            style: `background: ${lvlCfg.bg}; color: ${lvlCfg.color};`
          }, lvlCfg.label)
        ]),
        // Ô chọn Checkbox multi-select (Đúng vị trí ô đỏ trong hình)
        el('div.col-check', [
          el('input', {
            type: 'checkbox',
            checked: isSelected,
            onclick: (e) => {
              e.stopPropagation();
              if (e.target.checked) selectedIds.push(t.id);
              else selectedIds = selectedIds.filter((id) => id !== t.id);
              redraw();
            }
          })
        ]),
        el('div.col-name', { style: `padding-left: ${(t.level - 1) * 14}px;` }, [
          // Dấu con mắt 👁️ xem Hồ sơ chi tiết
          el('button.btn-view-doc-eye', {
            title: 'Xem Chi Tiết Công Tác & Hồ Sơ Thi Công Chất Lượng',
            onclick: (e) => {
              e.stopPropagation();
              openTaskDetailModal(t);
            }
          }, '👁️'),
          el('span.wbs-icon', lvlCfg.icon),
          isEditMode
            ? el('input.input-edit-inline', {
                value: t.name,
                onchange: (e) => {
                  t.name = e.target.value;
                  const item = tasksList.find((x) => x.id === t.id);
                  if (item) item.name = e.target.value;
                  redraw();
                }
              })
            : el('span.t-name' + (isParent ? '.bold' : ''), { title: t.name }, t.name),
          isDone ? el('span.done-badge', '✔ Xong') : null,
          el('button.btn-add-task-hover', {
            title: 'Chèn công tác mới bên dưới',
            onclick: (e) => {
              e.stopPropagation();
              addTaskBelow(t.id);
            }
          }, '+ Thêm công tác')
        ]),
        el('div.col-dur', t.duration ? `${t.duration}d` : '—'),

        // Ô Bắt đầu (cho phép sửa khi bật Edit mode)
        el('div.col-date', isEditMode
          ? el('input.input-date-inline', {
              type: 'date',
              value: t.startStr,
              onchange: (e) => {
                t.startPlan = e.target.value;
                const item = tasksList.find((x) => x.id === t.id);
                if (item) item.startPlan = e.target.value;
                redraw();
              }
            })
          : fmtDate(t.start)
        ),

        // Ô Kết thúc (cho phép sửa khi bật Edit mode)
        el('div.col-date', isEditMode
          ? el('input.input-date-inline', {
              type: 'date',
              value: t.finishStr,
              onchange: (e) => {
                t.finishPlan = e.target.value;
                const item = tasksList.find((x) => x.id === t.id);
                if (item) item.finishPlan = e.target.value;
                redraw();
              }
            })
          : fmtDate(t.finish)
        ),

        // Ô Progress % (cho phép sửa khi bật Edit mode)
        el('div.col-prog', isEditMode
          ? el('input.input-prog-inline', {
              type: 'number',
              min: '0',
              max: '100',
              value: t.progress || 0,
              onchange: (e) => {
                const val = Math.min(100, Math.max(0, parseInt(e.target.value || '0', 10)));
                t.progress = val;
                const item = tasksList.find((x) => x.id === t.id);
                if (item) item.progress = val;
                redraw();
              }
            })
          : `${t.progress || 0}`
        ),

        // Ô Tiền đề (cho phép sửa khi bật Edit mode -> Tự động tính lại CPM Forward Pass & vẽ lại đường mũi tên SVG)
        el('div.col-pred', isEditMode
          ? el('input.input-pred-inline', {
              value: t.predecessors || '',
              placeholder: '3FS,4SS',
              onchange: (e) => {
                t.predecessors = e.target.value;
                const item = tasksList.find((x) => x.id === t.id);
                if (item) item.predecessors = e.target.value;
                toast(`Đã cập nhật tiền đề ${t.seq} → vẽ lại đường nối Gantt`, 'ok');
                redraw();
              }
            })
          : (t.predecessors || '—')
        )
      ]);
    });

    const taskRowMap = new Map();
    filteredTasks.forEach((t, idx) => taskRowMap.set(t.id, idx));

    // Gantt Timeline Rows & SVG Dependencies
    const ganttTimelineRows = filteredTasks.map((t) => {
      const startOffset = Math.max(0, daysDiff(minDate, t.start)) * pxPerDay;
      const barWidth = Math.max(pxPerDay, (t.duration || 1) * pxPerDay);
      const isDone = (t.progress || 0) >= 100;
      const isParent = t.isParent;

      let barClass = 'cpm-bar-normal';
      if (t.level === 1) barClass = 'cpm-bar-parent-l1';
      else if (t.level === 2 || isParent) barClass = 'cpm-bar-parent-l2';
      else if (t.isCritical) barClass = 'cpm-bar-critical';
      else if (isDone) barClass = 'cpm-bar-done';

      return el('div.cpm-gantt-row' + (isParent ? '.parent' : ''), {
        ondblclick: () => openTaskDetailModal(t)
      }, [
        el('div.cpm-bar-wrapper', {
          style: `left: ${startOffset}px; width: ${barWidth}px;`
        }, [
          el('div.cpm-bar.' + barClass, [
            el('div.cpm-bar-progress', { style: `width: ${t.progress || 0}%;` }),
            el('span.cpm-bar-label', `${t.name} (${t.progress || 0}%)`)
          ])
        ])
      ]);
    });

    // SVG Elbow Dependency Links (Tự động vẽ lại chuẩn từng mốc)
    const svgLinks = [];
    dependencies.forEach((d) => {
      const fromIdx = taskRowMap.get(d.fromTaskId);
      const toIdx = taskRowMap.get(d.toTaskId);
      if (fromIdx !== undefined && toIdx !== undefined) {
        const fromTask = filteredTasks[fromIdx];
        const toTask = filteredTasks[toIdx];

        const x1 = (Math.max(0, daysDiff(minDate, fromTask.finish)) + 1) * pxPerDay;
        const y1 = fromIdx * 34 + 17;
        const x2 = Math.max(0, daysDiff(minDate, toTask.start)) * pxPerDay;
        const y2 = toIdx * 34 + 17;

        const midX = x1 + Math.max(8, (x2 - x1) / 2);
        const pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
        svgLinks.push(
          el('path', {
            d: pathD,
            stroke: fromTask.isCritical ? '#ef4444' : '#3b82f6',
            'stroke-width': fromTask.isCritical ? '2' : '1.5',
            fill: 'none',
            'marker-end': 'url(#arrow)'
          })
        );
      }
    });

    const svgCanvas = el('svg.cpm-svg-overlay', {
      style: `width: ${timelineWidth}px; height: ${filteredTasks.length * 34}px;`
    }, [
      el('defs', [
        el('marker', {
          id: 'arrow',
          viewBox: '0 0 10 10',
          refX: '6',
          refY: '5',
          markerWidth: '6',
          markerHeight: '6',
          orient: 'auto-start-reverse'
        }, [
          el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#3b82f6' })
        ])
      ]),
      ...svgLinks
    ]);

    // Cột Đỏ Hôm Nay Dọc Xuống Toàn Bộ Sơ Đồ
    const todayColumnOverlay = (todayOffset >= 0 && todayOffset <= timelineWidth)
      ? el('div.cpm-today-column', {
          style: `left: ${todayOffset}px; width: ${pxPerDay}px; height: ${filteredTasks.length * 34}px;`
        }, [
          el('div.today-line-solid'),
          el('div.today-badge', `📅 HÔM NAY (${fmtDate(today)})`)
        ])
      : null;

    const mainLayout = el('div.cpm-main-layout', [
      // Bảng WBS bên trái
      el('div.cpm-left-panel', { id: 'cpm-left-scroll' }, [
        el('div.cpm-table-head-2tier', [
          el('div.cpm-table-head-top', 'BẢNG CẤU TRÚC PHÂN CHIA CÔNG VIỆC WBS'),
          el('div.cpm-table-head-bottom', [
            el('div.col-seq', 'STT'),
            el('div.col-lvl', 'Lv.'),
            el('div.col-check', [
              el('input', {
                type: 'checkbox',
                title: 'Chọn tất cả',
                onchange: (e) => {
                  if (e.target.checked) selectedIds = filteredTasks.map((t) => t.id);
                  else selectedIds = [];
                  redraw();
                }
              })
            ]),
            el('div.col-name', 'TÊN CÔNG VIỆC (WBS)'),
            el('div.col-dur', 'T.Gian'),
            el('div.col-date', 'Bắt đầu'),
            el('div.col-date', 'Kết thúc'),
            el('div.col-prog', '%C'),
            el('div.col-pred', 'Tiền đề')
          ])
        ]),
        el('div.cpm-table-body', leftTableRows)
      ]),

      // Timeline Gantt bên phải
      el('div.cpm-right-panel', { id: 'cpm-right-scroll' }, [
        el('div.cpm-timeline-head-2tier', { style: `width: ${timelineWidth}px;` }, [
          el('div.cpm-month-row', monthHeaderCells),
          el('div.cpm-days-row', daysHeader)
        ]),
        el('div.cpm-timeline-body', { style: `width: ${timelineWidth}px;` }, [
          ...ganttTimelineRows,
          svgCanvas,
          todayColumnOverlay
        ])
      ])
    ]);

    // Đồng bộ cuộn dọc 2 chiều (2-Way Vertical Scroll Sync) giữa Bảng WBS & Timeline Gantt
    setTimeout(() => {
      const leftEl = mainLayout.querySelector('#cpm-left-scroll');
      const rightEl = mainLayout.querySelector('#cpm-right-scroll');

      if (leftEl && rightEl) {
        let isSyncing = false;
        leftEl.addEventListener('scroll', () => {
          if (!isSyncing) {
            isSyncing = true;
            rightEl.scrollTop = leftEl.scrollTop;
            requestAnimationFrame(() => { isSyncing = false; });
          }
        });
        rightEl.addEventListener('scroll', () => {
          if (!isSyncing) {
            isSyncing = true;
            leftEl.scrollTop = rightEl.scrollTop;
            requestAnimationFrame(() => { isSyncing = false; });
          }
        });
      }
    }, 50);

    container.replaceChildren(controlBar, mainLayout);
  };

  redraw();
  return container;
}

/** Tự động cuộn sơ đồ Gantt cả chiều Dọc (tới dòng) & chiều Ngang (tới ngày bắt đầu) */
function scrollToTask(task, minDate, pxPerDay = 28, taskIdx = -1) {
  const rightEl = document.getElementById('cpm-right-scroll');
  const leftEl = document.getElementById('cpm-left-scroll');

  if (task && task.start) {
    const daysFromMin = daysDiff(minDate, task.start);
    const targetX = Math.max(0, daysFromMin * pxPerDay - 100);
    const targetY = taskIdx >= 0 ? Math.max(0, taskIdx * 34 - 100) : (leftEl ? leftEl.scrollTop : 0);

    if (rightEl) {
      rightEl.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
    }
    if (leftEl && taskIdx >= 0) {
      leftEl.scrollTo({ top: targetY, behavior: 'smooth' });
    }
    toast(`Gantt tự động cuộn tới dòng #${task.seq} • ngày ${fmtDate(task.start)} (${task.name})`, 'ok');
  }
}

/** Định vị chính xác vị trí Hôm Nay & Cuộn mượt màn hình */
function scrollToToday(minDate, maxDate, tasks = [], pxPerDay = 28) {
  const rightEl = document.getElementById('cpm-right-scroll');
  const leftEl = document.getElementById('cpm-left-scroll');
  const today = new Date();

  const todayDays = daysDiff(minDate, today);
  const totalDays = daysDiff(minDate, maxDate);

  if (rightEl) {
    if (todayDays >= 0 && todayDays <= totalDays) {
      const targetX = Math.max(0, todayDays * pxPerDay - rightEl.clientWidth / 2 + pxPerDay / 2);
      rightEl.scrollTo({ left: targetX, behavior: 'smooth' });
      toast(`Đã định vị mốc Hôm nay (${fmtDate(today)})`, 'ok');
    } else if (todayDays > totalDays) {
      rightEl.scrollTo({ left: rightEl.scrollWidth, behavior: 'smooth' });
      toast(`Hôm nay nằm sau ngày kết thúc dự án — đã cuộn tới mốc mới nhất`, 'info');
    } else {
      rightEl.scrollTo({ left: 0, behavior: 'smooth' });
      toast(`Hôm nay nằm trước ngày khởi công — đã cuộn về ngày bắt đầu`, 'info');
    }
  }

  if (leftEl && tasks.length) {
    const activeIdx = tasks.findIndex((t) => t.start <= today && t.finish >= today && (t.progress || 0) < 100);
    if (activeIdx !== -1) {
      leftEl.scrollTo({ top: Math.max(0, activeIdx * 34 - 100), behavior: 'smooth' });
    }
  }
}

/** MODAL BẠCH BỘ TẠO HỒ SƠ CHẤT LƯỢNG CHO CÁC CÔNG TÁC ĐÃ CHỌN */
export function openBatchCreateDocModal(selectedIds = [], allTasks = []) {
  const selectedTasks = allTasks.filter((t) => selectedIds.includes(t.id));
  const backdrop = el('div.task-modal-backdrop', {
    onclick: (e) => {
      if (e.target === backdrop) backdrop.remove();
    }
  });

  let docType = 'Phiếu YCNT (Yêu cầu nghiệm thu)';
  let docRef = `RFA/2026/CW05-0${selectedTasks[0] ? selectedTasks[0].seq : '1'}`;
  let docDriveUrl = 'https://drive.google.com/file/d/1DemoDriveScanDoc/view';
  let docStatus = 'Khởi tạo từ Nhà thầu';
  let previewContainer = el('div.drive-preview-box');

  const updatePreview = () => {
    const embedUrl = getDrivePreviewUrl(docDriveUrl);
    if (embedUrl) {
      previewContainer.replaceChildren(
        el('iframe.drive-iframe', {
          src: embedUrl,
          title: 'Google Drive Viewer Preview'
        })
      );
    } else {
      previewContainer.replaceChildren(
        el('div.preview-placeholder', 'Nhập link Google Drive PDF bên trên để xem trước tài liệu scan')
      );
    }
  };

  const modal = el('div.task-modal', { style: 'max-width: 780px;' }, [
    el('div.task-modal-head', [
      el('div.task-modal-head-title', [
        el('span.badge-stt', `TẠO HSCL (${selectedTasks.length})`),
        el('span', `Tạo & Gán Hồ Sơ Chất Lượng Cho ${selectedTasks.length} Công Tác`)
      ]),
      el('button.btn.icon-sm', { onclick: () => backdrop.remove() }, '✕')
    ]),

    el('div.task-modal-body', [
      el('div.notice', `Hồ sơ chất lượng này sẽ được tự động liên kết với ${selectedTasks.length} công tác đã chọn bên dưới:`),
      el('div', { style: 'display: flex; flex-wrap: wrap; gap: .4rem;' },
        selectedTasks.map((t) => el('span.badge-stt', `#${t.seq} - ${t.name}`))
      ),

      el('div.form-grid', [
        el('label.field', [
          el('span', 'Loại hồ sơ chất lượng'),
          el('select', {
            value: docType,
            onchange: (e) => { docType = e.target.value; }
          }, [
            el('option', { value: 'Phiếu YCNT (Yêu cầu nghiệm thu)' }, 'Phiếu YCNT (Yêu cầu nghiệm thu)'),
            el('option', { value: 'BBNT (Biên bản nghiệm thu)' }, 'BBNT (Biên bản nghiệm thu)'),
            el('option', { value: 'RFA (Request for Approval)' }, 'RFA (Request for Approval)'),
            el('option', { value: 'CO/CQ (Chứng chỉ chất lượng)' }, 'CO/CQ (Chứng chỉ chất lượng vật liệu)'),
            el('option', { value: 'Ảnh nghiệm thu công trường' }, 'Ảnh nghiệm thu công trường'),
            el('option', { value: 'Nhật ký thi công' }, 'Nhật ký thi công')
          ])
        ]),

        el('label.field', [
          el('span', 'Số hiệu / Tiêu đề hồ sơ'),
          el('input', {
            value: docRef,
            placeholder: 'Ví dụ: RFA/2026/CW05-01',
            oninput: (e) => { docRef = e.target.value; }
          })
        ])
      ]),

      el('label.field', [
        el('span', 'Link Google Drive PDF File Scan / Ảnh công trường'),
        el('div', { style: 'display: flex; gap: .5rem;' }, [
          el('input', {
            value: docDriveUrl,
            placeholder: 'Dán đường dẫn https://drive.google.com/file/d/... vào đây',
            oninput: (e) => {
              docDriveUrl = e.target.value;
              updatePreview();
            }
          }),
          btn('👁 Xem trước PDF', updatePreview, 'primary-sm')
        ])
      ]),

      // Khung Preview PDF Google Viewer
      el('div.modal-section', [
        el('div.modal-sec-title', '📄 Xem trước PDF Scan (Google Viewer)'),
        previewContainer
      ])
    ]),

    el('div.task-modal-foot', [
      btn('Hủy bỏ', () => backdrop.remove(), 'secondary'),
      btn('💾 Lưu & Gán Hồ Sơ', () => {
        if (!docRef.trim()) {
          toast('Vui lòng nhập Số hiệu / Tiêu đề hồ sơ!', 'bad');
          return;
        }

        const newDoc = {
          id: `HS-${Date.now()}`,
          ref: docRef,
          type: docType.split(' ')[0],
          content: `${docRef}.pdf`,
          status: docStatus,
          issued: new Date(),
          driveUrl: docDriveUrl
        };

        if (state && state.docs) {
          state.docs.push(newDoc);
        }

        selectedTasks.forEach((t) => {
          t.docId = newDoc.id;
        });

        toast(`Đã tạo & liên kết hồ sơ "${docRef}" tới ${selectedTasks.length} công tác thành công!`, 'ok');
        backdrop.remove();
      }, 'primary')
    ])
  ]);

  updatePreview();
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}

/** MODAL CHI TIẾT CÔNG TÁC (Liên kết với Fact_HoSo) */
export function openTaskDetailModal(task) {
  const backdrop = el('div.task-modal-backdrop', {
    onclick: (e) => {
      if (e.target === backdrop) backdrop.remove();
    }
  });

  const allDocs = (state && state.docs) || [];

  let linkedDocs = allDocs.filter((d) =>
    (task.docId && d.id === task.docId) ||
    (d.packageId && d.packageId === task.packageId) ||
    (d.ref && d.ref.includes(String(task.seq)))
  );

  if (!linkedDocs.length) {
    linkedDocs = [{
      id: `HS-${task.seq || '10'}`,
      type: 'RFA',
      ref: `RFA/${task.seq || '10'}`,
      content: `Bien_Ban_Nghiem_Thu_${task.seq || '10'}.pdf`,
      status: 'Khởi tạo từ Nhà thầu',
      issued: task.start || new Date(),
      driveUrl: 'https://drive.google.com/file/d/1DemoDriveScanDoc/view'
    }];
  }

  const renderDocsList = () => {
    return linkedDocs.map((d) => el('div.doc-link-item', [
      el('div.doc-link-left', [
        el('input', { type: 'checkbox', checked: true }),
        el('span.doc-type-badge', d.type || 'HSCL'),
        el('div', [
          el('div.doc-title-text', `${d.ref || d.id} • ${d.content || 'Bien_Ban_Nghiem_Thu.pdf'}`),
          el('div.doc-sub-text', `Trạng thái: ${d.status || 'Khởi tạo từ Nhà thầu'} • Ngày: ${fmtDate(d.issued || task.start)}`)
        ])
      ]),
      el('div.doc-link-actions', [
        el('button.btn-doc-scan', {
          onclick: () => {
            const previewUrl = getDrivePreviewUrl(d.driveUrl || 'https://drive.google.com/file/d/1DemoDriveScanDoc/view');
            openPdfViewerModal(d.ref || d.content, previewUrl);
          }
        }, '👁 Scan'),
        el('button.btn-doc-view', {
          onclick: () => {
            const previewUrl = getDrivePreviewUrl(d.driveUrl || 'https://drive.google.com/file/d/1DemoDriveScanDoc/view');
            openPdfViewerModal(d.ref || d.content, previewUrl);
          }
        }, 'Xem tệp'),
        el('button.btn-doc-del', {
          onclick: () => {
            linkedDocs = linkedDocs.filter((item) => item !== d);
            updateModalBody();
            toast('Đã hủy liên kết hồ sơ', 'info');
          }
        }, '🗑')
      ])
    ]));
  };

  const updateModalBody = () => {
    modalBody.replaceChildren(
      // Banner Trạng Thái & Tiến Độ
      el('div.modal-status-banner', [
        el('div.modal-status-left', [
          el('span', { style: 'font-size: 1.5rem;' }, (task.progress || 0) >= 100 ? '✔' : '⏳'),
          el('div', [
            el('div.modal-status-title', (task.progress || 0) >= 100 ? 'Đã hoàn thành 100%' : `Đang tiến hành (${task.progress || 0}%)`),
            el('div.modal-status-sub', (task.progress || 0) >= 100 ? 'Công tác đã nghiệm thu và hoàn thành.' : 'Công tác đang trong giai đoạn thi công.')
          ])
        ]),
        el('div.modal-status-right', [
          el('div.modal-status-pct', `${task.progress || 0}%`),
          el('div.modal-status-lbl', 'TIẾN ĐỘ')
        ])
      ]),

      // Grid Ngày Tháng Kế Hoạch & Thực Tế
      el('div.modal-date-grid', [
        el('div.date-card', [
          el('div.date-card-lbl', '📅 Ngày Bắt Đầu KH'),
          el('div.date-card-val', fmtDate(task.start))
        ]),
        el('div.date-card', [
          el('div.date-card-lbl', '📅 Ngày Kết Thúc KH'),
          el('div.date-card-val', fmtDate(task.finish))
        ]),
        el('div.date-card', [
          el('div.date-card-lbl', '✔ Ngày Hoàn Thành Thực Tế'),
          el('div.date-card-val.done', fmtDate(task.finishActual || task.finish))
        ])
      ]),

      // Progress bar khối lượng thực tế
      el('div.modal-section', [
        el('div.modal-sec-head', [
          el('span.modal-sec-title', 'Khối lượng hoàn thành thực tế'),
          el('span', { style: 'font-family: var(--mono); font-weight: 700; font-size: .85rem;' }, `${task.progress || 0}% / 100% (${task.duration || 1}d)`)
        ]),
        el('div.prog-bar-mini', { style: 'height: 10px;' }, [
          el('div.prog-fill-mini', { style: `width: ${task.progress || 0}%;` })
        ])
      ]),

      // BOQ Section
      el('div.modal-section', [
        el('div.modal-sec-head', [
          el('span.modal-sec-title', '💲 Khối Lượng BOQ Gắn Với Công Tác'),
          el('span.sub', '2 mục')
        ]),
        el('div', { style: 'display: flex; flex-direction: column; gap: .5rem; margin-top: .5rem;' }, [
          el('div.doc-link-item', [
            el('div', [
              el('strong', { style: 'font-size: .84rem;' }, `BOQ-${task.seq || '10'}.1 - Khối lượng ${task.name} (Giai đoạn 1)`),
              el('div.doc-sub-text', 'Đơn vị: m³ | Đã nghiệm thu: 120 / 120 m³')
            ]),
            el('span.done-badge', '100%')
          ]),
          el('div.doc-link-item', [
            el('div', [
              el('strong', { style: 'font-size: .84rem;' }, `BOQ-${task.seq || '10'}.2 - Nhân công & Ca máy thi công`),
              el('div.doc-sub-text', 'Đơn vị: Ca | Đã nghiệm thu: 15 / 15 Ca')
            ]),
            el('span.done-badge', '100%')
          ])
        ])
      ]),

      // Hồ Sơ Thi Công & Chất Lượng (Linked to Fact_HoSo)
      el('div.modal-section', [
        el('div.modal-sec-head', [
          el('span.modal-sec-title', '📄 Hồ Sơ Thi Công & Chất Lượng'),
          el('select.cpm-select', {
            style: 'font-size: .78rem; border-radius: 6px;',
            onchange: (e) => {
              const val = e.target.value;
              if (val) {
                const found = allDocs.find((doc) => doc.id === val);
                if (found && !linkedDocs.includes(found)) {
                  linkedDocs.push(found);
                  updateModalBody();
                  toast(`Đã liên kết hồ sơ ${found.ref || found.id}`, 'ok');
                }
                e.target.value = '';
              }
            }
          }, [
            el('option', { value: '' }, '+ Thêm từ Bảng Hồ sơ thi công...'),
            ...allDocs.map((doc) => el('option', { value: doc.id }, `${doc.ref || doc.id} — ${doc.content || doc.type}`))
          ])
        ]),
        el('div', renderDocsList())
      ])
    );
  };

  const modalBody = el('div.task-modal-body');
  updateModalBody();

  const modal = el('div.task-modal', [
    el('div.task-modal-head', [
      el('div.task-modal-head-title', [
        el('span.badge-stt', `STT #${task.seq || '10'}`),
        el('span.badge-lvl', `Level ${task.level || 4}`),
        el('span', task.name)
      ]),
      el('button.btn.icon-sm', { onclick: () => backdrop.remove() }, '✕')
    ]),
    modalBody,
    el('div.task-modal-foot', [
      btn('Đóng', () => backdrop.remove(), 'secondary')
    ])
  ]);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}

/** MODAL XEM TRƯỚC FILE PDF SCAN BẰNG GOOGLE VIEWER */
export function openPdfViewerModal(title, embedUrl) {
  const backdrop = el('div.task-modal-backdrop', {
    onclick: (e) => {
      if (e.target === backdrop) backdrop.remove();
    }
  });

  const modal = el('div.task-modal', { style: 'max-width: 900px; height: 85vh;' }, [
    el('div.task-modal-head', [
      el('div.task-modal-head-title', [
        el('span.badge-stt', 'XEM FILE PDF'),
        el('span', `File Scan: ${title}`)
      ]),
      el('button.btn.icon-sm', { onclick: () => backdrop.remove() }, '✕')
    ]),
    el('div.task-modal-body', { style: 'flex: 1; padding: 0;' }, [
      el('iframe.drive-iframe', {
        src: embedUrl,
        title: title,
        style: 'width: 100%; height: 100%; border: none;'
      })
    ]),
    el('div.task-modal-foot', [
      btn('Mở cửa sổ mới 🔗', () => window.open(embedUrl, '_blank'), 'primary-sm'),
      btn('Đóng', () => backdrop.remove(), 'secondary')
    ])
  ]);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}
