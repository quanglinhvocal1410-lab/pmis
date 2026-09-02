/**
 * Bộ biểu đồ SVG tối giản, không thư viện ngoài.
 * Mọi biểu đồ vẽ trong viewBox cố định rồi co giãn theo bề rộng khung
 * (`width:100%; height:auto`), nên hoạt động tốt cả trên điện thoại.
 * Màu lấy từ biến CSS để đồng bộ sáng/tối.
 */
import { fmtShort, fmtMonth, toDate } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 800;

export const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];

function s(tag, attrs, children) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    n.setAttribute(k, String(v));
  }
  (Array.isArray(children) ? children : children ? [children] : []).forEach((c) =>
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  );
  return n;
}

function svg(height, children, cls) {
  const root = s('svg', {
    viewBox: `0 0 ${W} ${height}`,
    class: 'chart ' + (cls || ''),
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet'
  }, children);
  return root;
}

function niceMax(v) {
  if (!v || !isFinite(v)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(v))));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

function axisTicks(min, max, count = 4) {
  const out = [];
  for (let i = 0; i <= count; i++) out.push(min + ((max - min) * i) / count);
  return out;
}

/**
 * Biểu đồ đường / đường tích luỹ (đường cong chữ S).
 * series: [{ name, values: number[], color?, area?, dash? }]
 * labels: nhãn trục hoành (mảng chuỗi cùng độ dài values)
 */
export function lineChart({ labels, series, height = 260, yFmt = fmtShort, yMin = 0, legend = true }) {
  const pad = { t: 16, r: 16, b: 34, l: 66 };
  const h = height;
  const iw = W - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const n = labels.length;

  const all = series.flatMap((x) => x.values).filter((v) => isFinite(v));
  const rawMax = all.length ? Math.max(...all) : 1;
  const rawMin = Math.min(yMin, ...(all.length ? all : [0]));
  const max = niceMax(rawMax * 1.05) || 1;
  const min = rawMin < 0 ? -niceMax(-rawMin * 1.05) : 0;

  const x = (i) => pad.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v) => pad.t + ih - ((v - min) / (max - min || 1)) * ih;

  const kids = [];

  for (const t of axisTicks(min, max)) {
    kids.push(s('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: 'grid' }));
    kids.push(s('text', { x: pad.l - 8, y: y(t) + 4, class: 'tick tick-y' }, yFmt(t)));
  }

  const every = Math.max(1, Math.ceil(n / 8));
  labels.forEach((lb, i) => {
    if (i % every && i !== n - 1) return;
    kids.push(s('text', { x: x(i), y: h - pad.b + 20, class: 'tick tick-x' }, lb));
  });

  series.forEach((ser, si) => {
    const color = ser.color || PALETTE[si % PALETTE.length];
    const pts = ser.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    if (ser.area) {
      kids.push(s('polygon', {
        points: `${x(0)},${y(min)} ${pts} ${x(n - 1)},${y(min)}`,
        fill: color,
        opacity: 0.12
      }));
    }
    kids.push(s('polyline', {
      points: pts,
      fill: 'none',
      stroke: color,
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'stroke-dasharray': ser.dash || null
    }));
    ser.values.forEach((v, i) => {
      const dot = s('circle', { cx: x(i), cy: y(v), r: 3.5, fill: color });
      dot.appendChild(s('title', {}, `${ser.name} · ${labels[i]}: ${yFmt(v)}`));
      kids.push(dot);
    });
  });

  const node = svg(h, kids, 'chart-line');
  return legend ? withLegend(node, series) : node;
}

/**
 * Biểu đồ cột nhóm.
 * series: [{ name, values, color? }]
 */
export function barChart({ labels, series, height = 260, yFmt = fmtShort, legend = true }) {
  const pad = { t: 16, r: 16, b: 34, l: 66 };
  const h = height;
  const iw = W - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const n = labels.length;

  const all = series.flatMap((x) => x.values).filter((v) => isFinite(v));
  const max = niceMax(Math.max(...(all.length ? all : [1])) * 1.05) || 1;
  const min = Math.min(0, ...(all.length ? all : [0]));
  const lo = min < 0 ? -niceMax(-min * 1.05) : 0;

  const y = (v) => pad.t + ih - ((v - lo) / (max - lo || 1)) * ih;
  const band = iw / Math.max(1, n);
  const bw = Math.min(34, (band * 0.7) / series.length);

  const kids = [];
  for (const t of axisTicks(lo, max)) {
    kids.push(s('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: 'grid' }));
    kids.push(s('text', { x: pad.l - 8, y: y(t) + 4, class: 'tick tick-y' }, yFmt(t)));
  }

  labels.forEach((lb, i) => {
    const cx = pad.l + band * i + band / 2;
    kids.push(s('text', { x: cx, y: h - pad.b + 20, class: 'tick tick-x' }, lb));
    series.forEach((ser, si) => {
      const v = ser.values[i];
      if (!isFinite(v)) return;
      const color = ser.color || PALETTE[si % PALETTE.length];
      const x0 = cx - (bw * series.length) / 2 + bw * si;
      const top = Math.min(y(v), y(0));
      const bh = Math.max(1, Math.abs(y(v) - y(0)));
      const rect = s('rect', { x: x0, y: top, width: bw - 2, height: bh, rx: 2, fill: color });
      rect.appendChild(s('title', {}, `${ser.name} · ${lb}: ${yFmt(v)}`));
      kids.push(rect);
    });
  });

  if (lo < 0) kids.push(s('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), class: 'axis' }));

  const node = svg(h, kids, 'chart-bar');
  return legend ? withLegend(node, series) : node;
}

/** Đồng hồ đo chỉ số quanh mốc 1,00 — dùng cho SPI / CPI. */
export function gauge({ value, label, good = 1, lo = 0.7, hi = 1.3, height = 130 }) {
  const cx = W / 2, cy = height - 14, r = 96;
  const clamp = Math.max(lo, Math.min(hi, value ?? lo));
  const frac = (clamp - lo) / (hi - lo);
  const a = Math.PI * (1 - frac);
  const arc = (from, to, cls, color) => {
    const a0 = Math.PI * (1 - from), a1 = Math.PI * (1 - to);
    return s('path', {
      d: `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`,
      fill: 'none',
      stroke: color,
      'stroke-width': 14,
      'stroke-linecap': 'butt',
      class: cls
    });
  };
  const goodFrac = (good - lo) / (hi - lo);
  const kids = [
    arc(0, goodFrac * 0.85, 'gauge-zone', 'var(--bad)'),
    arc(goodFrac * 0.85, goodFrac, 'gauge-zone', 'var(--warn)'),
    arc(goodFrac, 1, 'gauge-zone', 'var(--ok)'),
    s('line', {
      x1: cx, y1: cy,
      x2: cx + (r - 20) * Math.cos(a), y2: cy - (r - 20) * Math.sin(a),
      stroke: 'var(--fg)', 'stroke-width': 3, 'stroke-linecap': 'round'
    }),
    s('circle', { cx, cy, r: 6, fill: 'var(--fg)' }),
    s('text', { x: cx, y: cy - 34, class: 'gauge-value' }, value === null || value === undefined ? '—' : value.toFixed(2).replace('.', ',')),
    s('text', { x: cx, y: cy + 2, class: 'gauge-label' }, label)
  ];
  return svg(height, kids, 'chart-gauge');
}

/** Vòng tròn tỉ lệ hoàn thành. */
export function donut({ segments, center, sub, height = 200 }) {
  const cx = W / 2, cy = height / 2, r = 74, thick = 22;
  const total = segments.reduce((a, b) => a + Math.max(0, b.value), 0) || 1;
  let acc = 0;
  const kids = [
    s('circle', { cx, cy, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': thick })
  ];
  segments.forEach((seg, i) => {
    const frac = Math.max(0, seg.value) / total;
    if (frac <= 0) return;
    const c = 2 * Math.PI * r;
    const el = s('circle', {
      cx, cy, r,
      fill: 'none',
      stroke: seg.color || PALETTE[i % PALETTE.length],
      'stroke-width': thick,
      'stroke-dasharray': `${c * frac} ${c}`,
      'stroke-dashoffset': -c * acc,
      transform: `rotate(-90 ${cx} ${cy})`
    });
    el.appendChild(s('title', {}, `${seg.name}: ${fmtShort(seg.value)}`));
    kids.push(el);
    acc += frac;
  });
  if (center) kids.push(s('text', { x: cx, y: cy + 2, class: 'donut-center' }, center));
  if (sub) kids.push(s('text', { x: cx, y: cy + 26, class: 'donut-sub' }, sub));
  return svg(height, kids, 'chart-donut');
}

/**
 * Sơ đồ Gantt: mỗi dòng vẽ 2 thanh — kế hoạch (nhạt) và thực tế/dự báo
 * (đậm), kèm vạch đứng đánh dấu ngày chốt số liệu.
 */
export function gantt({ rows, asOf, height }) {
  const rowH = 30;
  const pad = { t: 26, r: 16, b: 26, l: 250 };
  const h = height || pad.t + pad.b + rows.length * rowH;
  const iw = W - pad.l - pad.r;

  const dates = rows.flatMap((r) => [r.planStart, r.planFinish, r.actStart, r.forecastFinish])
    .map(toDate).filter(Boolean);
  if (asOf) dates.push(asOf);
  if (!dates.length) return svg(60, [s('text', { x: 20, y: 34, class: 'tick' }, 'Không có dữ liệu tiến độ')]);

  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const span = Math.max(1, max - min);
  const x = (d) => pad.l + ((toDate(d) - min) / span) * iw;

  const kids = [];

  // Vạch năm
  for (let yr = min.getFullYear(); yr <= max.getFullYear(); yr++) {
    const d = new Date(yr, 0, 1);
    if (d < min || d > max) continue;
    kids.push(s('line', { x1: x(d), x2: x(d), y1: pad.t - 8, y2: h - pad.b, class: 'grid' }));
    kids.push(s('text', { x: x(d) + 4, y: pad.t - 12, class: 'tick tick-x', 'text-anchor': 'start' }, String(yr)));
  }

  rows.forEach((r, i) => {
    const yTop = pad.t + i * rowH;
    const cy = yTop + rowH / 2;
    kids.push(s('text', {
      x: pad.l - 10, y: cy + 4, class: 'gantt-label', 'text-anchor': 'end'
    }, r.name.length > 34 ? r.name.slice(0, 33) + '…' : r.name));

    if (r.planStart && r.planFinish) {
      const bar = s('rect', {
        x: x(r.planStart), y: cy - 11, width: Math.max(2, x(r.planFinish) - x(r.planStart)),
        height: 9, rx: 3, fill: 'var(--c1)', opacity: 0.28
      });
      bar.appendChild(s('title', {}, `Kế hoạch: ${r.planLabel || ''}`));
      kids.push(bar);
    }
    const aStart = r.actStart || r.planStart;
    const aEnd = r.forecastFinish || r.actFinish || r.planFinish;
    if (aStart && aEnd) {
      const w = Math.max(2, x(aEnd) - x(aStart));
      const bar = s('rect', {
        x: x(aStart), y: cy + 1, width: w, height: 9, rx: 3, fill: `var(--${r.tone || 'c1'})`
      });
      bar.appendChild(s('title', {}, `Thực tế/dự báo: ${r.actLabel || ''}`));
      kids.push(bar);
      // Vạch mức hoàn thành thực tế bên trong thanh
      if (r.actualPct > 0) {
        kids.push(s('rect', {
          x: x(aStart), y: cy + 3, width: Math.max(1, w * Math.min(1, r.actualPct)),
          height: 5, rx: 2, fill: 'var(--fg)', opacity: 0.35
        }));
      }
    }
  });

  if (asOf) {
    kids.push(s('line', { x1: x(asOf), x2: x(asOf), y1: pad.t - 8, y2: h - pad.b, class: 'asof' }));
    kids.push(s('text', { x: x(asOf), y: h - pad.b + 16, class: 'tick asof-label' }, fmtMonth(asOf)));
  }

  return svg(h, kids, 'chart-gantt');
}

function withLegend(node, series) {
  const box = document.createElement('div');
  box.className = 'chart-box';
  box.appendChild(node);
  const lg = document.createElement('div');
  lg.className = 'legend';
  series.forEach((ser, i) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('i');
    dot.style.background = ser.color || PALETTE[i % PALETTE.length];
    if (ser.dash) dot.classList.add('dashed');
    item.appendChild(dot);
    item.appendChild(document.createTextNode(ser.name));
    lg.appendChild(item);
  });
  box.appendChild(lg);
  return box;
}
