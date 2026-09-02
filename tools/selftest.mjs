/**
 * Tự kiểm tra webapp mà không cần trình duyệt.
 *
 * Dựng một lớp DOM giả đủ dùng, nạp thật các module trong `web/js`, render
 * lần lượt mọi màn hình rồi kiểm tra kết quả — bắt được lỗi cú pháp, lỗi
 * import và lỗi logic tính toán ngay từ dòng lệnh.
 *
 *   node pmis/tools/selftest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, '..', 'web');

// ------------------------------------------------------------ DOM GIẢ

class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...c) { c.filter(Boolean).forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  toggle(c) { this.set.has(c) ? this.set.delete(c) : this.set.add(c); }
  contains(c) { return this.set.has(c); }
  get value() { return [...this.set].join(' '); }
}

class Node_ {
  constructor(type) {
    this.nodeType = type;
    this.childNodes = [];
    this.parentNode = null;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) { this.childNodes = [new TextNode(String(v))]; }
  appendChild(c) {
    if (!c) return c;
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i > -1) this.childNodes.splice(i, 1);
    return c;
  }
  replaceChild(next, old) {
    const i = this.childNodes.indexOf(old);
    if (i > -1) {
      this.childNodes[i] = next;
      next.parentNode = this;
    }
    return old;
  }
  replaceChildren(...kids) {
    this.childNodes = [];
    kids.flat().filter(Boolean).forEach((k) => this.appendChild(k));
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener() {}
  removeEventListener() {}
  scrollIntoView() {}
  closest() { return null; }
  querySelector() { return null; }
}

class TextNode extends Node_ {
  constructor(text) { super(3); this.text = text; }
  get textContent() { return this.text; }
  set textContent(v) { this.text = String(v); }
}

class Element extends Node_ {
  constructor(tag, ns) {
    super(1);
    this.tagName = String(tag).toUpperCase();
    this.localName = String(tag);
    this.namespaceURI = ns || null;
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this.classList = new ClassList(this);
    this.id = '';
    this.disabled = false;
    this.value = '';
    this.checked = false;
  }
  get className() { return this.classList.value; }
  set className(v) {
    this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = v;
    if (k === 'id') this.id = String(v);
    if (k === 'value') this.value = String(v);
  }
  getAttribute(k) { return this.attributes[k] ?? null; }
  hasAttribute(k) { return k in this.attributes; }
  set innerHTML(v) { this.textContent = String(v).replace(/<[^>]*>/g, ''); }
}

function makeDocument() {
  const doc = new Element('#document');
  doc.createElement = (t) => new Element(t);
  doc.createElementNS = (ns, t) => new Element(t, ns);
  doc.createTextNode = (t) => new TextNode(String(t));
  doc.documentElement = new Element('html');
  doc.documentElement.setAttribute_ = doc.documentElement.setAttribute;
  doc.documentElement.removeAttribute = function (k) { delete this.attributes[k]; };
  doc.body = new Element('body');
  doc.head = new Element('head');
  doc.title = '';
  doc.getElementById = (id) => find(doc.body, (n) => n.id === id) || find(doc.documentElement, (n) => n.id === id);
  doc.addEventListener = () => {};
  return doc;
}

function find(root, pred) {
  if (!root || root.nodeType !== 1) return null;
  if (pred(root)) return root;
  for (const c of root.childNodes) {
    const hit = find(c, pred);
    if (hit) return hit;
  }
  return null;
}

function findAll(root, pred, out = []) {
  if (!root) return out;
  if (root.nodeType === 1 && pred(root)) out.push(root);
  (root.childNodes || []).forEach((c) => findAll(c, pred, out));
  return out;
}

// -------------------------------------------------------- MÔI TRƯỜNG

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const document = makeDocument();
globalThis.document = document;
// core.js/ui.js dùng `x instanceof Node` để phân biệt phần tử với chuỗi
globalThis.Node = Node_;

const appRoot = new Element('div');
appRoot.id = 'app';
document.body.appendChild(appRoot);

globalThis.location = {
  hash: '#/tong-quan',
  reload() {},
  toString() { return 'http://localhost/'; }
};

globalThis.window = {
  addEventListener: () => {},
  scrollTo: () => {},
  location: globalThis.location
};

const snapshot = JSON.parse(fs.readFileSync(path.join(WEB, 'data', 'snapshot.json'), 'utf8'));
globalThis.fetch = async (url) => {
  if (String(url).includes('snapshot.json')) {
    return { ok: true, status: 200, json: async () => snapshot, text: async () => JSON.stringify(snapshot) };
  }
  throw new Error('selftest: không cho phép gọi mạng tới ' + url);
};

// ------------------------------------------------------------- CHẠY

const mod = (p) => pathToFileURL(path.join(WEB, 'js', p)).href;

let failures = 0;
const results = [];

function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  if (!cond) failures++;
}

function near(a, b, tol = 1e-6) {
  return a !== null && a !== undefined && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

const { fetchBootstrap, loadConfig } = await import(mod('api.js'));
const storeMod = await import(mod('store.js'));
const calc = await import(mod('calc.js'));

const cfg = loadConfig();

// `snapshot.json` là dữ liệu đang chạy (có thể đã bị xoá trắng để nhập tay),
// còn các phép kiểm tra công thức bám vào bộ demo cố định để luôn so được số.
const data = await fetchBootstrap(cfg);
const demo = JSON.parse(fs.readFileSync(path.join(WEB, 'data', 'snapshot.demo.json'), 'utf8'));

storeMod.hydrate(demo, cfg);
const S = storeMod.state;

// --- Tầng dữ liệu
check('Nạp đủ 12 bảng', Object.keys(S.tables).length === 12, Object.keys(S.tables).length + ' bảng');
check('Dim_GoiThau có 5 gói', S.packages.length === 5);
check('Dim_HopDong khớp từng gói', S.packages.every((p) => p.contract),
  S.packages.filter((p) => !p.contract).map((p) => p.id).join(','));
check('Nhà thầu được nối vào gói thầu', S.packages.every((p) => p.contractor));
check('Ngày chốt = 31/08/2026',
  storeMod.isoAsOf() === '2026-08-31', storeMod.isoAsOf());

const cw05 = S.byId.package['CW-05'];
check('CW-05 có 13 hạng mục tiến độ', storeMod.state.progress.filter((r) => r.packageId === 'CW-05').length === 13);
check('CW-05 có 8 kỳ EVM', cw05.evm.length === 8);
check('Ngày khởi công CW-01 không lệch múi giờ',
  S.byId.package['CW-01'].start.getDate() === 1 && S.byId.package['CW-01'].start.getMonth() === 10,
  S.byId.package['CW-01'].start.toDateString());

// --- EVM: đối chiếu tay với kỳ 31/08/2026 của CW-05
const m = calc.evmAt(cw05);
check('BAC = 25,5 tỷ', near(m.bac, 25.5e9));
check('SV = EV − PV = +1,1 tỷ', near(m.sv, 1.1e9));
check('CV = EV − AC = +2,2 tỷ', near(m.cv, 2.2e9));
check('SPI = 18,4/17,3 ≈ 1,0636', near(m.spi, 18.4 / 17.3, 1e-9), m.spi);
check('CPI = 18,4/16,2 ≈ 1,1358', near(m.cpi, 18.4 / 16.2, 1e-9), m.cpi);
check('EAC = BAC/CPI ≈ 22,45 tỷ', near(m.eac, 25.5e9 / (18.4 / 16.2), 1e-9), m.eac);
check('VAC = BAC − EAC > 0', m.vac > 0, m.vac);
check('TCPI = (BAC−EV)/(BAC−AC)', near(m.tcpi, (25.5 - 18.4) / (25.5 - 16.2), 1e-9), m.tcpi);
check('% hoàn thành ≈ 72,2%', near(m.pctComplete, 18.4 / 25.5, 1e-9), m.pctComplete);

// --- Dòng tiền: tạm ứng 20% của 25,5 tỷ = 5,1 tỷ, đã thu hồi 2,14 tỷ
const pay = calc.paymentSummary(cw05);
check('Tạm ứng CW-05 = 5,1 tỷ', near(pay.advance, 5.1e9), pay.advance);
check('Đã thu hồi tạm ứng = 2,14 tỷ', near(pay.advanceRecovered, 2.14e9), pay.advanceRecovered);
check('Tạm ứng còn lại = 2,96 tỷ', near(pay.advanceOutstanding, 2.96e9), pay.advanceOutstanding);
check('Cắt giảm khi thẩm tra = 500 triệu', near(pay.deducted, 0.5e9), pay.deducted);

// --- Tổng hợp danh mục
const pf = calc.portfolio();
check('Giá trị hợp đồng danh mục = 662,5 tỷ', near(pf.contractValue, 662.5e9), pf.contractValue);
check('Chỉ 1/5 gói có số liệu EVM', pf.packagesWithEvm === 1, pf.packagesWithEvm);

// --- Cảnh báo
const al = calc.alerts();
check('Sinh được danh sách cảnh báo', al.length > 0, al.length + ' mục');
check('Bắt được công việc quá hạn',
  al.some((a) => a.kind === 'Công việc' && a.level === 'bad'));
check('Không báo quá hạn nhầm cho bảo lãnh còn hiệu lực',
  !al.some((a) => a.title.includes('Bảo lãnh thực hiện đã hết hiệu lực') && a.detail.includes('HD-2024/CW-05')));

// --- Render mọi màn hình
const routes = [
  ['tong-quan', 'views/overview.js', {}],
  ['bao-cao', 'views/report.js', {}],
  ['nhap-lieu', 'views/entry.js', {}],
  ['goi-thau', 'views/packages.js', {}],
  ['goi-thau/CW-05', 'views/packageDetail.js', { id: 'CW-05' }],
  ['goi-thau/SAI', 'views/packageDetail.js', { id: 'KHONG-CO' }],
  ['tien-do', 'views/schedule.js', {}],
  ['tien-do?pkg=CW-05', 'views/schedule.js', { pkg: 'CW-05' }],
  ['evm', 'views/evm.js', {}],
  ['evm?pkg=CW-05', 'views/evm.js', { pkg: 'CW-05' }],
  ['tai-chinh', 'views/finance.js', {}],
  ['tai-chinh?pkg=CW-05', 'views/finance.js', { pkg: 'CW-05' }],
  ['ho-so', 'views/documents.js', {}],
  ['cong-viec', 'views/tasks.js', {}],
  ['danh-muc', 'views/directory.js', {}],
  ['danh-muc?tab=nha-thau', 'views/directory.js', { tab: 'nha-thau' }],
  ['danh-muc?tab=trang-thai', 'views/directory.js', { tab: 'trang-thai' }],
  ['cau-hinh', 'views/settings.js', {}]
];

for (const [label, file, params] of routes) {
  try {
    const v = await import(mod(file));
    const node = v.render(params);
    const text = node.textContent;
    const svgs = findAll(node, (n) => n.localName === 'svg').length;
    const ok = text.length > 40 && !text.includes('undefined') && !text.includes('NaN');
    check(`Render #/${label}`, ok, `${text.length} ký tự · ${svgs} biểu đồ`
      + (text.includes('undefined') ? ' · CÓ "undefined"' : '')
      + (text.includes('NaN') ? ' · CÓ "NaN"' : ''));
  } catch (e) {
    check(`Render #/${label}`, false, e.message + '\n    ' + String(e.stack).split('\n')[1]);
  }
}

// --- Trình sửa bản ghi: kiểu ô phải suy đúng từ tên cột và dữ liệu
const editor = await import(mod('editor.js'));
const fm = (t, h) => editor.fieldMeta(t, h).type;

check('Khoá chính là cột đầu tiên', editor.idFieldOf('Fact_CongViec') === 'ID_Cong_Viec');
check('Ngay_Han → ô chọn ngày', fm('Fact_CongViec', 'Ngay_Han') === 'date', fm('Fact_CongViec', 'Ngay_Han'));
check('Ky_Bao_Cao → ô chọn ngày', fm('Fact_EVM', 'Ky_Bao_Cao') === 'date', fm('Fact_EVM', 'Ky_Bao_Cao'));
check('Tam_Ung_Pct → phần trăm', fm('Dim_HopDong', 'Tam_Ung_Pct') === 'percent', fm('Dim_HopDong', 'Tam_Ung_Pct'));
check('Gia_Hop_Dong → tiền', fm('Dim_HopDong', 'Gia_Hop_Dong') === 'money', fm('Dim_HopDong', 'Gia_Hop_Dong'));
check('Trang_Thai công việc → danh sách chọn', fm('Fact_CongViec', 'Trang_Thai') === 'select');
check('ID_Goi_Thau → khoá ngoại', fm('Fact_CongViec', 'ID_Goi_Thau') === 'ref');
check('Hop_Dong_ID_LQ cũng là khoá ngoại', fm('Fact_CongViec', 'Hop_Dong_ID_LQ') === 'ref');
check('Google_Drive_URL → ô URL', fm('Fact_HoSo', 'Google_Drive_URL') === 'url');
check('ID_Cong_Viec là khoá, không phải khoá ngoại', fm('Fact_CongViec', 'ID_Cong_Viec') === 'id');
// Dim_TrangThai khai 3 trạng thái công việc, nhưng dữ liệu còn dùng "Chờ xử lý"
check('Danh sách trạng thái gộp cả giá trị chưa khai báo',
  editor.fieldMeta('Fact_CongViec', 'Trang_Thai').options.includes('Chờ xử lý'),
  editor.fieldMeta('Fact_CongViec', 'Trang_Thai').options.join(' / '));
check('Đọc được đủ 15 cột của Fact_CongViec',
  editor.headersOf('Fact_CongViec').length === 15, editor.headersOf('Fact_CongViec').length);

// --- Đồng bộ: chế độ offline không được dựng bộ đếm giờ
const syncMod = await import(mod('sync.js'));
syncMod.startSync(cfg, { onData: () => {}, onStatus: () => {}, shouldDefer: () => false });
check('Chế độ offline báo đúng trạng thái', syncMod.sync.status === 'offline', syncMod.sync.status);
check('Offline thì refreshNow không gọi mạng', (await syncMod.refreshNow()) === false);

// --- Soát dữ liệu
const audit0 = calc.dataAudit();
check('Soát dữ liệu chạy được', Array.isArray(audit0), audit0.length + ' điểm');
check('Không báo lỗi tham chiếu với bộ demo',
  !audit0.some((a) => a.level === 'bad'),
  audit0.filter((a) => a.level === 'bad').map((a) => a.msg).join(' | '));

// --- Dữ liệu ĐANG CHẠY trong snapshot.json (có thể đã xoá trắng để nhập tay)
storeMod.hydrate(data, cfg);
for (const [label, file, params] of routes) {
  try {
    const v = await import(mod(file));
    const text = v.render(params).textContent;
    check(`Dữ liệu hiện tại · render #/${label}`,
      !text.includes('NaN') && !text.includes('undefined'),
      text.includes('NaN') ? 'CÓ "NaN"' : text.includes('undefined') ? 'CÓ "undefined"' : `${text.length} ký tự`);
  } catch (e) {
    check(`Dữ liệu hiện tại · render #/${label}`, false, e.message + '\n    ' + String(e.stack).split('\n')[1]);
  }
}

// --- BẢNG TRỐNG: mọi màn hình phải render được, không được ném lỗi
// (đây chính là trạng thái sau khi chạy lệnh "Xoá sạch dữ liệu Fact_*")
const wiped = {
  ...demo,
  tables: Object.fromEntries(Object.entries(demo.tables)
    .map(([k, v]) => [k, k.startsWith('Fact_') ? [] : v]))
};
storeMod.hydrate(wiped, cfg);
for (const [label, file, params] of routes) {
  try {
    const v = await import(mod(file));
    const text = v.render(params).textContent;
    check(`Bảng trống · render #/${label}`,
      text.length > 20 && !text.includes('NaN') && !text.includes('undefined'),
      text.includes('NaN') ? 'CÓ "NaN"' : text.includes('undefined') ? 'CÓ "undefined"' : `${text.length} ký tự`);
  } catch (e) {
    check(`Bảng trống · render #/${label}`, false, e.message + '\n    ' + String(e.stack).split('\n')[1]);
  }
}
const auditEmpty = calc.dataAudit();
check('Bảng trống · soát ra thiếu EVM và tiến độ',
  auditEmpty.some((a) => a.table === 'Fact_EVM') && auditEmpty.some((a) => a.table === 'Fact_TienDo'),
  auditEmpty.length + ' điểm');

// --- HOÀN TOÀN TRỐNG: kể cả Dim_* cũng rỗng
storeMod.hydrate({ ...demo, tables: Object.fromEntries(Object.keys(demo.tables).map((k) => [k, []])) }, cfg);
for (const [label, file, params] of routes) {
  try {
    const v = await import(mod(file));
    const text = v.render(params).textContent;
    check(`Trắng hoàn toàn · render #/${label}`, !text.includes('NaN'), text.includes('NaN') ? 'CÓ "NaN"' : 'ok');
  } catch (e) {
    check(`Trắng hoàn toàn · render #/${label}`, false, e.message + '\n    ' + String(e.stack).split('\n')[1]);
  }
}

// Nạp lại bộ demo cho các phép kiểm tra còn lại
storeMod.hydrate(demo, cfg);

// --- Khung ứng dụng + định tuyến
try {
  await import(mod('main.js'));
  await new Promise((r) => setTimeout(r, 60));
  const nav = findAll(appRoot, (n) => n.classList.contains('nav-item'));
  check('main.js dựng được khung', nav.length === 11, nav.length + ' mục điều hướng');
  check('Trang mặc định là Tổng quan', appRoot.textContent.includes('Cảnh báo & việc cần xử lý'));
} catch (e) {
  check('main.js dựng được khung', false, e.message);
}

// ------------------------------------------------------------- BÁO CÁO

console.log('\nPMIS — tự kiểm tra\n' + '='.repeat(62));
for (const r of results) {
  console.log(`${r.ok ? ' OK ' : 'FAIL'}  ${r.name}${r.detail ? '  ·  ' + r.detail : ''}`);
}
console.log('='.repeat(62));
console.log(`${results.length - failures}/${results.length} phép kiểm tra đạt`);
process.exit(failures ? 1 : 0);
