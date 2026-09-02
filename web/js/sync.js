/**
 * Đồng bộ sheet → webapp.
 *
 * Apps Script không đẩy được sự kiện xuống trình duyệt, nên webapp hỏi
 * định kỳ action `rev` — một câu trả lời rất nhẹ vì phía máy chủ không đọc
 * nội dung ô nào. Chỉ khi dấu hiệu phiên bản đổi mới tải lại toàn bộ dữ liệu.
 *
 * Nguyên tắc: không bao giờ vẽ lại màn hình khi người dùng đang mở biểu mẫu.
 * Gặp trường hợp đó thì giữ dữ liệu mới ở dạng "chờ" và báo trên thanh trên.
 */
import { fetchRev, fetchBootstrap, loadConfig, isReadOnly } from './api.js';

/** Khoảng cách giữa hai lần tải lại toàn bộ dù dấu hiệu phiên bản không đổi. */
const FULL_RELOAD_WITH_TRIGGER = 15 * 60 * 1000;
const FULL_RELOAD_WITHOUT_TRIGGER = 2 * 60 * 1000;

export const sync = {
  status: 'offline',   // offline | idle | checking | loading | stale | error
  autoSync: false,     // trigger onChange đã bật trên bảng tính chưa
  lastSyncAt: null,
  lastCheckAt: null,
  error: '',
  pendingData: null
};

let timer = null;
let cfg = null;
let hooks = { onData: () => {}, onStatus: () => {}, shouldDefer: () => false };
let lastRev = null;
let lastFullAt = 0;
let busy = false;

export function startSync(config, callbacks) {
  cfg = config || loadConfig();
  hooks = { ...hooks, ...callbacks };
  lastFullAt = Date.now();

  if (isReadOnly(cfg)) {
    setStatus('offline');
    return;
  }
  setStatus('idle');
  schedule();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
}

export function stopSync() {
  clearTimeout(timer);
  timer = null;
}

function schedule() {
  clearTimeout(timer);
  const seconds = Number(cfg.syncSeconds) || 0;
  if (seconds <= 0) return;
  timer = setTimeout(tick, Math.max(5, seconds) * 1000);
}

function setStatus(s, err) {
  sync.status = s;
  sync.error = err || '';
  hooks.onStatus(sync);
}

/** Một nhịp kiểm tra. Bỏ qua khi tab đang ẩn để không tiêu hạn ngạch. */
async function tick() {
  if (busy || document.hidden) {
    schedule();
    return;
  }
  busy = true;
  try {
    setStatus('checking');
    const info = await fetchRev(cfg);
    sync.autoSync = !!info.autoSync;
    sync.lastCheckAt = new Date();

    const changed = lastRev !== null && info.rev !== lastRev;
    const stale = Date.now() - lastFullAt >
      (sync.autoSync ? FULL_RELOAD_WITH_TRIGGER : FULL_RELOAD_WITHOUT_TRIGGER);

    if (lastRev === null) lastRev = info.rev;

    if (changed || stale) {
      lastRev = info.rev;
      await reload();
    } else {
      setStatus(sync.pendingData ? 'stale' : 'idle');
    }
  } catch (e) {
    setStatus('error', e.message);
  } finally {
    busy = false;
    schedule();
  }
}

async function reload() {
  setStatus('loading');
  const data = await fetchBootstrap(cfg);
  lastFullAt = Date.now();
  sync.lastSyncAt = new Date();

  if (hooks.shouldDefer()) {
    // Người dùng đang mở biểu mẫu — giữ lại, đừng vẽ đè lên việc họ đang làm
    sync.pendingData = data;
    setStatus('stale');
    return;
  }
  sync.pendingData = null;
  hooks.onData(data);
  setStatus('idle');
}

/** Áp dữ liệu đang chờ (gọi khi người dùng đóng biểu mẫu hoặc bấm tải lại). */
export function applyPending() {
  if (!sync.pendingData) return false;
  const data = sync.pendingData;
  sync.pendingData = null;
  hooks.onData(data);
  setStatus('idle');
  return true;
}

/** Tải lại ngay lập tức, dùng cho nút làm mới và sau mỗi lần ghi. */
export async function refreshNow() {
  if (isReadOnly(cfg || loadConfig())) return false;
  clearTimeout(timer);
  busy = true;
  try {
    const info = await fetchRev(cfg);
    lastRev = info.rev;
    sync.autoSync = !!info.autoSync;
    sync.pendingData = null;
    const data = await fetchBootstrap(cfg);
    lastFullAt = Date.now();
    sync.lastSyncAt = new Date();
    hooks.onData(data);
    setStatus('idle');
    return true;
  } catch (e) {
    setStatus('error', e.message);
    throw e;
  } finally {
    busy = false;
    schedule();
  }
}
