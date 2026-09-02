/**
 * Khởi động ứng dụng: nạp dữ liệu một lần, dựng khung và định tuyến bằng
 * hash. Không có bước build — trình duyệt nạp thẳng các ES module này.
 */
import { el, clear, fmtDate } from './core.js';
import { fetchBootstrap, loadConfig, saveConfig, isReadOnly, getCachedBootstrap } from './api.js';
import { state, hydrate } from './store.js';
import { alertCounts } from './calc.js';
import { closeDrawer, isDrawerOpen, onDrawerClose, toast } from './ui.js';
import { sync, startSync, applyPending, refreshNow } from './sync.js';

import * as overview from './views/overview.js';
import * as packages from './views/packages.js';
import * as packageDetail from './views/packageDetail.js';
import * as schedule from './views/schedule.js';
import * as evm from './views/evm.js';
import * as finance from './views/finance.js';
import * as documents from './views/documents.js';
import * as tasks from './views/tasks.js';
import * as directory from './views/directory.js';
import * as entry from './views/entry.js';
import * as report from './views/report.js';
import * as settings from './views/settings.js';

const ROUTES = [
  { path: 'tong-quan', label: 'Tổng quan', icon: '◈', view: overview },
  { path: 'goi-thau', label: 'Gói thầu', icon: '▤', view: packages, detail: packageDetail },
  { path: 'tien-do', label: 'Tiến độ', icon: '▦', view: schedule },
  { path: 'evm', label: 'EVM', icon: '◑', view: evm },
  { path: 'tai-chinh', label: 'Giải ngân', icon: '₫', view: finance },
  { path: 'ho-so', label: 'Hồ sơ', icon: '❐', view: documents },
  { path: 'cong-viec', label: 'Công việc', icon: '☑', view: tasks },
  { path: 'danh-muc', label: 'Danh mục', icon: '☰', view: directory },
  { path: 'bao-cao', label: 'Báo cáo', icon: '🖨', view: report },
  { path: 'nhap-lieu', label: 'Nhập liệu', icon: '✚', view: entry },
  { path: 'cau-hinh', label: 'Cấu hình', icon: '⚙', view: settings }
];

const DEFAULT_ROUTE = 'tong-quan';
const app = document.getElementById('app');

// ------------------------------------------------------------- KHỞI ĐỘNG

let config = loadConfig();

async function boot() {
  config = loadConfig();
  const cached = getCachedBootstrap();

  // NẠP NGAY LẬP TỨC TỪ CACHE (DƯỚI 10MS) NẾU CÓ
  if (cached && cached.tables) {
    hydrate(cached, config);
    applyTheme(localStorage.getItem('pmis.theme') || 'auto');
    render();
    window.addEventListener('hashchange', () => {
      document.body.classList.remove('nav-open');
      closeDrawer();
      render();
    });

    startSync(config, {
      onData: (data) => {
        hydrate(data, config);
        render();
      },
      onStatus: paintSyncStatus,
      shouldDefer: () => isDrawerOpen()
    });

    // Cập nhật ngầm không chặn giao diện
    refreshNow().catch(() => {});
    return;
  }

  // Lần đầu mở chưa có cache: hiển thị màn hình nạp
  showSplash('Đang nạp dữ liệu từ bảng tính…');
  try {
    const data = await fetchBootstrap(config);
    hydrate(data, config);
  } catch (err) {
    showError(err);
    return;
  }
  applyTheme(localStorage.getItem('pmis.theme') || 'auto');
  render();
  window.addEventListener('hashchange', () => {
    document.body.classList.remove('nav-open');
    closeDrawer();
    render();
  });

  startSync(config, {
    onData: (data) => {
      hydrate(data, config);
      render();
    },
    onStatus: paintSyncStatus,
    shouldDefer: () => isDrawerOpen()
  });

  // Đóng biểu mẫu xong thì áp ngay dữ liệu đang chờ
  onDrawerClose(() => {
    if (sync.pendingData) applyPending();
  });
}

function showSplash(msg) {
  clear(app).appendChild(el('div.splash', [el('div.spinner'), el('p', msg)]));
}

function showError(err) {
  clear(app).appendChild(el('div.splash.error', [
    el('h1', 'Không nạp được dữ liệu'),
    el('p', err.message),
    el('div.form-actions', [
      el('button.btn.primary', { onclick: () => location.reload() }, 'Thử lại'),
      el('button.btn', {
        onclick: () => { saveConfig({ scriptUrl: '' }); location.reload(); }
      }, 'Dùng bản offline')
    ]),
    el('p.sub', 'Nếu chưa có snapshot.json, chạy: node pmis/tools/build-snapshot.js')
  ]));
}

// -------------------------------------------------------------- ĐỊNH TUYẾN

/** '#/goi-thau/CW-05?tab=x' → { path:'goi-thau', id:'CW-05', tab:'x' } */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { path: segs[0] || DEFAULT_ROUTE, id: segs[1] ? decodeURIComponent(segs[1]) : null, params };
}

let lastPath = '';

function render() {
  const { path, id, params } = parseHash();
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];
  const view = id && route.detail ? route.detail : route.view;
  const key = path + '/' + (id || '');
  // Vẽ lại do đồng bộ thì giữ nguyên vị trí cuộn; chỉ nhảy lên đầu khi đổi trang
  const keepScroll = key === lastPath;
  const y = window.scrollY || 0;

  clear(app);
  app.appendChild(shell(route, view.render({ ...params, id })));
  document.title = `${route.label} · PMIS ${state.projects[0] ? state.projects[0].code : ''}`.trim();
  window.scrollTo({ top: keepScroll ? y : 0 });
  lastPath = key;
  paintSyncStatus(sync);
}

// -------------------------------------------------------------- KHUNG

function shell(active, content) {
  return el('div.app', [
    sidebar(active),
    el('div.nav-backdrop', {
      onclick: () => document.body.classList.remove('nav-open')
    }),
    el('div.main', [topbar(), el('main.content', content)])
  ]);
}

function sidebar(active) {
  const counts = alertCounts();
  const isPinned = localStorage.getItem('pmis.sidebar.pinned') !== 'false';

  return el('aside.sidebar' + (isPinned ? '.pinned' : '.collapsed'), [
    el('div.brand', [
      el('a.brand-left', {
        href: '#/tong-quan',
        onclick: () => document.body.classList.remove('nav-open')
      }, [
        el('span.brand-mark', 'PM'),
        el('span.brand-text', [
          el('strong', 'PMIS'),
          el('span', state.projects[0] ? state.projects[0].code : 'Quản lý dự án')
        ])
      ]),
      el('button.pin-btn', {
        title: isPinned ? 'Thu gọn menu' : 'Ghim cố định menu',
        onclick: (e) => {
          e.stopPropagation();
          const next = !isPinned;
          localStorage.setItem('pmis.sidebar.pinned', String(next));
          render();
        }
      }, isPinned ? '«' : '»')
    ]),

    el('nav.nav', ROUTES.map((r) => el('a.nav-item' + (r === active ? '.active' : ''), {
      href: '#/' + r.path,
      title: r.label,
      onclick: () => document.body.classList.remove('nav-open')
    }, [
      el('span.nav-icon', r.icon),
      el('span.nav-label', r.label),
      navBadge(r.path, counts)
    ]))),

    el('div.sidebar-foot', [
      el('span.source-tag' + (state.source === 'live' ? '.live' : ''),
        state.source === 'live' ? 'Trực tiếp' : 'Offline'),
      el('span.sub', `Chốt ${fmtDate(state.asOf)}`)
    ])
  ]);
}

function overdueTasks() {
  return state.tasks.filter((t) => t.status !== 'Hoàn thành' && t.due && t.due < state.asOf).length;
}

function emptyTables() {
  return Object.values(state.tables).filter((rows) => !rows.length).length;
}

function navBadge(path, counts) {
  if (path === 'tong-quan' && counts.bad) return el('span.nav-badge', String(counts.bad));
  if (path === 'cong-viec' && overdueTasks()) return el('span.nav-badge', String(overdueTasks()));
  // Nhắc còn bảng nào chưa có dữ liệu — hữu ích khi đang nhập tay từ đầu
  if (path === 'nhap-lieu' && emptyTables()) return el('span.nav-badge.warn', String(emptyTables()));
  return null;
}

function topbar() {
  const theme = localStorage.getItem('pmis.theme') || 'auto';
  const nextTheme = { auto: 'light', light: 'dark', dark: 'auto' };
  const themeLabel = { auto: 'Tự động', light: 'Sáng', dark: 'Tối' };

  return el('header.topbar', [
    el('button.icon-btn.menu-btn', {
      onclick: () => document.body.classList.toggle('nav-open'),
      'aria-label': 'Menu'
    }, '☰'),
    el('div.topbar-title', state.projects[0] ? state.projects[0].name : 'PMIS'),
    el('div.topbar-actions', [
      syncPill(),
      isReadOnly() ? el('span.tag', 'chỉ đọc') : el('span.tag.live', 'đọc/ghi'),
      state.spreadsheetUrl
        ? el('a.icon-btn', { href: state.spreadsheetUrl, target: '_blank', rel: 'noopener', title: 'Mở bảng tính nguồn' }, '↗')
        : null,
      el('button.icon-btn', {
        title: 'Giao diện: ' + themeLabel[theme],
        onclick: () => {
          const t = nextTheme[localStorage.getItem('pmis.theme') || 'auto'];
          localStorage.setItem('pmis.theme', t);
          applyTheme(t);
          render(); // vẽ lại để biểu tượng khớp chế độ mới
          toast('Giao diện: ' + themeLabel[t]);
        }
      }, theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐')
    ])
  ]);
}

// ------------------------------------------------------------ ĐỒNG BỘ

const SYNC_TEXT = {
  offline: 'Bản offline',
  idle: 'Đã đồng bộ',
  checking: 'Đang kiểm tra…',
  loading: 'Đang tải dữ liệu mới…',
  stale: 'Có dữ liệu mới — bấm để tải',
  error: 'Mất kết nối bảng tính'
};

/**
 * Chỉ báo đồng bộ ở thanh trên. Bấm vào là tải lại ngay, không phải chờ
 * hết nhịp kiểm tra.
 */
function syncPill() {
  const s = sync.status;
  return el('button.sync-pill.' + s, {
    id: 'sync-pill',
    type: 'button',
    title: syncTitle(),
    onclick: async () => {
      if (sync.pendingData) { applyPending(); return; }
      if (isReadOnly()) { location.reload(); return; }
      try {
        await refreshNow();
        toast('Đã tải lại từ bảng tính');
      } catch (e) {
        toast(e.message, 'bad');
      }
    }
  }, [el('i.sync-dot'), el('span.sync-text', SYNC_TEXT[s] || s)]);
}

function syncTitle() {
  if (sync.status === 'error') return sync.error;
  if (isReadOnly()) return 'Đang đọc snapshot.json. Bấm để tải lại trang.';
  const when = sync.lastSyncAt ? sync.lastSyncAt.toLocaleTimeString('vi-VN') : 'chưa';
  return `Lần tải gần nhất: ${when}`
    + `\nTự động đồng bộ trên bảng tính: ${sync.autoSync ? 'đang bật' : 'chưa bật'}`
    + `\nNhịp kiểm tra: ${config.syncSeconds || 0}s · bấm để tải lại ngay`;
}

/** Cập nhật riêng cái chỉ báo, không vẽ lại cả trang. */
function paintSyncStatus(s) {
  const old = document.getElementById('sync-pill');
  if (!old || !old.parentNode) return;
  old.parentNode.replaceChild(syncPill(), old);
  if (s.status === 'error' && !s.__reported) {
    s.__reported = true;
    toast('Không hỏi được bảng tính: ' + s.error, 'bad');
  }
  if (s.status !== 'error') s.__reported = false;
}

function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

// Đóng menu trên di động sau khi chọn mục
document.addEventListener('click', (e) => {
  if (e.target.closest('.nav-item')) document.body.classList.remove('nav-open');
});

boot();
