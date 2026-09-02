/**
 * Lớp truy cập dữ liệu. Hai nguồn:
 *   · live     — Apps Script Web App gắn với chính bảng tính PMIS_Data_Demo
 *   · snapshot — data/snapshot.json kết xuất sẵn (chạy offline, chỉ đọc)
 *
 * Cấu hình lưu ở localStorage nên mỗi máy tự chỉ định URL của mình.
 */

const LS_KEY = 'pmis.config.v1';

const DEFAULTS = {
  scriptUrl: '',
  token: '',
  // Ngày chốt số liệu. Dữ liệu demo dừng ở 31/08/2026 nên mặc định lấy
  // kỳ báo cáo mới nhất tìm được trong dữ liệu thay vì ngày hệ thống.
  asOf: '',
  autoAsOf: true,
  // Tự hỏi bảng tính "có gì đổi không?" sau mỗi bấy nhiêu giây (0 = tắt)
  syncSeconds: 15
};

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  return next;
}

export function resetConfig() {
  localStorage.removeItem(LS_KEY);
}

/** GET qua query string — không kích hoạt preflight CORS. */
async function get(url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  const res = await fetch(u.toString(), { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi Apps Script`);
  return parse(await res.text());
}

/**
 * POST với Content-Type text/plain: Apps Script không trả lời request
 * preflight OPTIONS, nên phải giữ request ở dạng "simple".
 */
async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi Apps Script`);
  return parse(await res.text());
}

function parse(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    // Apps Script trả về trang HTML khi chưa cấp quyền hoặc URL sai
    throw new Error('Phản hồi không phải JSON — kiểm tra URL /exec và quyền "Bất kỳ ai".');
  }
  if (payload.status !== 'success') throw new Error(payload.message || 'Apps Script báo lỗi');
  return payload.data;
}

const CACHE_KEY = 'pmis.bootstrap.cache.v2';

export function getCachedBootstrap() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCachedBootstrap(data) {
  try {
    if (data && data.tables) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }
  } catch (err) {
    console.warn('Không lưu được cache local:', err);
  }
}

/** Tải toàn bộ dữ liệu. Trả về { source, tables, meta, ... }. */
export async function fetchBootstrap(config = loadConfig()) {
  let result;
  if (config.scriptUrl) {
    const data = await get(config.scriptUrl, { action: 'bootstrap', token: config.token });
    result = { ...data, source: 'live' };
  } else {
    const res = await fetch('data/snapshot.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Không đọc được data/snapshot.json — chạy `node pmis/tools/build-snapshot.js`.');
    const data = await res.json();
    result = { ...data, source: 'snapshot' };
  }
  setCachedBootstrap(result);
  return result;
}

export async function ping(config = loadConfig()) {
  if (!config.scriptUrl) throw new Error('Chưa nhập URL Apps Script');
  return get(config.scriptUrl, { action: 'ping', token: config.token });
}

/**
 * Dấu hiệu phiên bản dữ liệu — gọi được liên tục vì phía máy chủ không
 * đọc nội dung ô nào. Ở chế độ offline luôn trả về cùng một giá trị.
 */
export async function fetchRev(config = loadConfig()) {
  if (!config.scriptUrl) return { rev: 'snapshot', autoSync: false };
  return get(config.scriptUrl, { action: 'rev', token: config.token });
}

/** Bật/tắt trigger onChange trên bảng tính, gọi thẳng từ trang Cấu hình. */
export async function setAutoSync(on, config = loadConfig()) {
  requireLive(config);
  return get(config.scriptUrl, {
    action: on ? 'installTrigger' : 'removeTrigger',
    token: config.token
  });
}

function requireLive(config) {
  if (!config.scriptUrl) {
    throw new Error('Chế độ snapshot chỉ đọc. Nhập URL Apps Script ở trang Cấu hình để ghi dữ liệu.');
  }
}

export async function createRow(table, row, config = loadConfig()) {
  requireLive(config);
  return post(config.scriptUrl, { action: 'create', table, row, token: config.token });
}

export async function updateRow(table, row, config = loadConfig()) {
  requireLive(config);
  return post(config.scriptUrl, { action: 'update', table, row, token: config.token });
}

export async function deleteRow(table, id, config = loadConfig()) {
  requireLive(config);
  return post(config.scriptUrl, { action: 'delete', table, id, token: config.token });
}

export function isReadOnly(config = loadConfig()) {
  return !config.scriptUrl;
}
