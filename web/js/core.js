/**
 * Tiện ích dùng chung: định dạng số/ngày kiểu Việt Nam và helper tạo DOM.
 * Không phụ thuộc vào bất kỳ thư viện ngoài nào.
 */

// ---------------------------------------------------------------- SỐ

export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;
  // Chuỗi từ bảng tính có thể là "2.728.300.000.000" (vi) hoặc "15,0%"
  let s = String(v).trim().replace(/\s/g, '');
  const pct = s.endsWith('%');
  if (pct) s = s.slice(0, -1);
  if (s.includes('.') && s.includes(',')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  } else if ((s.match(/,/g) || []).length > 1) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return pct ? n / 100 : n;
}

/** Có giá trị số thật sự hay không (phân biệt 0 với ô trống). */
export function hasNum(v) {
  return v !== '' && v !== null && v !== undefined && isFinite(num(v));
}

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtInt(v) {
  return nf0.format(Math.round(num(v)));
}

export function fmtMoney(v) {
  if (!hasNum(v)) return '—';
  return nf0.format(Math.round(num(v)));
}

/** Rút gọn tiền tệ: 25.500.000.000 → "25,5 tỷ". */
export function fmtShort(v) {
  if (!hasNum(v)) return '—';
  const n = num(v);
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e12) return s + trimZero(a / 1e12) + ' nghìn tỷ';
  if (a >= 1e9) return s + trimZero(a / 1e9) + ' tỷ';
  if (a >= 1e6) return s + trimZero(a / 1e6) + ' tr';
  if (a >= 1e3) return s + trimZero(a / 1e3) + ' ng';
  return s + nf0.format(a);
}

function trimZero(x) {
  const r = x >= 100 ? Math.round(x) : Math.round(x * 10) / 10;
  return nf0.format(Math.trunc(r)) + (r % 1 ? ',' + String(Math.round((r % 1) * 10)) : '');
}

/** 0.82 → "82,0%" */
export function fmtPct(v, digits = 1) {
  if (!hasNum(v)) return '—';
  return (num(v) * 100).toFixed(digits).replace('.', ',') + '%';
}

/** 1.05 → "1,05" (dùng cho SPI/CPI) */
export function fmtRatio(v, digits = 2) {
  if (!hasNum(v)) return '—';
  return num(v).toFixed(digits).replace('.', ',');
}

export function fmtSigned(v) {
  if (!hasNum(v)) return '—';
  const n = num(v);
  return (n > 0 ? '+' : '') + fmtMoney(n);
}

// -------------------------------------------------------------- NGÀY

/** Chuỗi ISO / dd-MM-yyyy / Date → đối tượng Date (00:00 giờ địa phương). */
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

const p2 = (n) => String(n).padStart(2, '0');

/** → "31/08/2026" */
export function fmtDate(v) {
  const d = toDate(v);
  if (!d) return '—';
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** → "T8/2026" */
export function fmtMonth(v) {
  const d = toDate(v);
  if (!d) return '—';
  return `T${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function toISO(v) {
  const d = toDate(v);
  if (!d) return '';
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function daysBetween(a, b) {
  const da = toDate(a), db = toDate(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

export function addDays(v, n) {
  const d = toDate(v);
  if (!d) return null;
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** "còn 45 ngày" / "quá hạn 12 ngày" */
export function fmtDelta(days) {
  if (days === null || days === undefined) return '—';
  if (days === 0) return 'hôm nay';
  return days > 0 ? `còn ${days} ngày` : `quá hạn ${-days} ngày`;
}

// --------------------------------------------------------------- DOM

/**
 * el('div.card', { onclick }, [child, 'text'])
 * Tag hỗ trợ cú pháp CSS rút gọn: 'button.btn.primary#save'
 */
export function el(spec, attrs, children) {
  // Tham số thứ hai có thể là nội dung thay vì thuộc tính:
  // el('p', 'chữ') · el('div', [a, b]) · el('div', someNode)
  if (children === undefined && isChildLike(attrs)) {
    children = attrs;
    attrs = null;
  }
  const m = /^([a-zA-Z0-9-]+)?([.#][^\s]*)?$/.exec(spec) || [];
  const tag = m[1] || 'div';
  const node = document.createElement(tag);
  const rest = m[2] || '';
  rest.split(/(?=[.#])/).forEach((tok) => {
    if (tok.startsWith('.')) node.classList.add(tok.slice(1));
    else if (tok.startsWith('#')) node.id = tok.slice(1);
  });

  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(node, children);
  return node;
}

function isChildLike(v) {
  return Array.isArray(v)
    || typeof v === 'string'
    || typeof v === 'number'
    || (v instanceof Node);
}

export function append(node, children) {
  if (children === null || children === undefined || children === false) return node;
  if (Array.isArray(children)) {
    children.forEach((c) => append(node, c));
    return node;
  }
  node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// ------------------------------------------------------------- KHÁC

export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = typeof keyFn === 'function' ? keyFn(r) : r[keyFn];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

export function sum(rows, field) {
  return rows.reduce((s, r) => s + num(typeof field === 'function' ? field(r) : r[field]), 0);
}

export function uniq(arr) {
  return [...new Set(arr.filter((x) => x !== '' && x !== null && x !== undefined))];
}

export function sortBy(rows, keyFn, dir = 1) {
  return rows.slice().sort((a, b) => {
    const x = keyFn(a), y = keyFn(b);
    if (x === y) return 0;
    return (x > y ? 1 : -1) * dir;
  });
}

// Dải dấu thanh/dấu phụ tổ hợp sinh ra sau khi normalize('NFD').
const COMBINING = /[̀-ͯ]/g;

/** So khớp không dấu, không phân biệt hoa thường. */
export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/đ/g, 'd');
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
