// OF STRIP (day-ofroom2 2026-11-27): the day's FOOTPRINT as a heat strip, one column per 5-minute bar. A reusable module for any page
// (orderflow.html demo; the live chart can put it under its candles). Market data only, PAPER research view; never trades.
//
//   import { mount } from './ofstrip.js?v=1';          // or window.OFSTRIP.mount (also set when loaded as a module)
//   const strip = mount(el, data, { height: 230, onSelect: (bar, i) => {} });
//   strip.update(newData); strip.select(i); strip.destroy();
//
// data = nq/of_strip.json (tools/build_of_room.py strip_from_summary): { day, tick, bucket, bars: [{ t: "HH:MM", o, h, l, c, v (lots),
//   d (delta = buy - sell lots), big (signed lots of single prints >= 20), cells: [[cell low price, buy lots, sell lots], ...],
//   abs: [{ side: "low"|"high", who: "buyers"|"sellers", px, vz (zone lots), dz (zone delta) }] }] }
// Each cell: green = aggressive buying, red = aggressive selling, brighter = more volume. Gold bracket = absorption at the bar's extreme
// (OF1: delta into the extreme >= 20% of the zone volume and price held). Dots above / below = big prints. The bottom row = bar delta.
// Tap (or the slider) picks a bar: "10:05 · buyers absorbed at 26,685.00 · 1,240 contracts". Text only via textContent; no network.
const NS = 'http://www.w3.org/2000/svg';
const COLW = 12, AXIS_W = 58, DELTA_H = 34, PAD_T = 14, PAD_B = 8;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fmtPx = (v) => (num(v) === null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtN = (v) => (num(v) === null ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v)).toLocaleString('en-US')}`);
const lots = (v) => Math.abs(Math.round(v || 0)).toLocaleString('en-US');
function sv(tag, a, text) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a || {})) e.setAttribute(k, String(v)); if (text != null) e.textContent = String(text); return e; }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }

/** Plain words for one bar (also used by tests / other pages). */
export function describe(b) {
  if (!b) return '';
  const parts = [b.t];
  const ab = (b.abs || []).slice().sort((x, y) => Math.abs(y.dz || 0) - Math.abs(x.dz || 0))[0];
  if (ab) parts.push(`${ab.who} absorbed at ${fmtPx(ab.px)}`, `${lots(ab.vz)} contracts`);
  else {
    const share = b.v ? Math.abs(b.d) / b.v : 0;
    parts.push(share < 0.08 ? 'two-sided, nobody in control' : `${b.d > 0 ? 'buyers' : 'sellers'} in control`);
  }
  parts.push(`delta ${fmtN(b.d)} of ${lots(b.v)}`);
  if (b.big) parts.push(`big prints ${fmtN(b.big)}`);
  return parts.join(' · ');
}

/** The scale of the day (pure): price range, the busiest cell, the biggest delta / big print. */
export function scale(data) {
  const bars = (data && Array.isArray(data.bars)) ? data.bars : [];
  let lo = Infinity, hi = -Infinity, vmax = 1, dmax = 1, bmax = 1;
  for (const b of bars) {
    lo = Math.min(lo, b.l); hi = Math.max(hi, b.h);
    for (const c of b.cells || []) vmax = Math.max(vmax, (c[1] || 0) + (c[2] || 0));
    dmax = Math.max(dmax, Math.abs(b.d || 0)); bmax = Math.max(bmax, Math.abs(b.big || 0));
  }
  if (!bars.length) { lo = 0; hi = 1; }
  if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  return { n: bars.length, lo, hi, vmax, dmax, bmax, bucket: num(data && data.bucket) || 2 };
}

export function mount(root, data, opts) {
  const O = { height: 230, ...(opts || {}) };
  root.classList.add('ofs');
  root.replaceChildren();
  const head = el('div', 'ofs-head');
  const legend = el('div', 'ofs-legend');
  for (const [c, t] of [['buy', 'buying'], ['sell', 'selling'], ['even', 'even'], ['abs', 'absorbed'], ['big', 'big print']]) { const s = el('span'); s.append(el('i', `ofs-k ${c}`), document.createTextNode(t)); legend.append(s); }
  head.append(legend);
  const body = el('div', 'ofs-body');
  const axis = el('div', 'ofs-axis');
  const scroll = el('div', 'ofs-scroll');
  scroll.setAttribute('role', 'img');
  body.append(axis, scroll);
  const info = el('p', 'ofs-info'); info.setAttribute('aria-live', 'polite');
  const slider = el('input', 'ofs-slider'); slider.type = 'range'; slider.min = '0'; slider.step = '1'; slider.setAttribute('aria-label', 'Pick a 5-minute bar');
  root.append(head, body, info, slider);
  let D = data, sel = -1, svg = null, cols = [], hl = null;

  function draw() {
    const S = scale(D), bars = (D && D.bars) || [];
    axis.replaceChildren(); scroll.replaceChildren(); cols = [];
    if (!bars.length) { info.textContent = 'No footprint for this day yet.'; slider.hidden = true; return; }
    slider.hidden = false; slider.max = String(bars.length - 1);
    const H = O.height, plotH = H - DELTA_H - PAD_T - PAD_B, W = bars.length * COLW + 8;
    const Y = (p) => PAD_T + plotH * (1 - (p - S.lo) / (S.hi - S.lo));
    const cellH = Math.max(2, plotH * S.bucket / (S.hi - S.lo));
    // the price axis (fixed at the left)
    const ax = sv('svg', { viewBox: `0 0 ${AXIS_W} ${H}`, width: AXIS_W, height: H, 'aria-hidden': 'true' });
    const step = niceStep((S.hi - S.lo) / 4);
    for (let p = Math.ceil(S.lo / step) * step; p <= S.hi; p += step) ax.append(sv('text', { class: 'ofs-ax', x: AXIS_W - 6, y: Y(p) + 4, 'text-anchor': 'end' }, fmtPx(p).replace('.00', '')));
    ax.append(sv('text', { class: 'ofs-ax dl', x: AXIS_W - 6, y: H - DELTA_H / 2 + 4, 'text-anchor': 'end' }, 'delta'));
    axis.append(ax);
    svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ofs-svg' });
    svg.append(sv('line', { class: 'ofs-zero', x1: 0, x2: W, y1: H - DELTA_H / 2, y2: H - DELTA_H / 2 }));
    bars.forEach((b, i) => {
      const x = 4 + i * COLW, g = sv('g', { class: 'ofs-col', style: `animation-delay:${Math.min(1200, i * 14)}ms` });
      for (const c of b.cells || []) {
        const buy = c[1] || 0, sell = c[2] || 0, tot = buy + sell;
        if (!tot) continue;
        const net = (buy - sell) / tot, a = 0.22 + 0.78 * Math.sqrt(tot / S.vmax);
        const cls = net > 0.12 ? 'buy' : net < -0.12 ? 'sell' : 'even';
        g.append(sv('rect', { class: `ofs-c ${cls}`, x: x + 0.5, y: Y(c[0] + S.bucket), width: COLW - 1, height: Math.max(1.5, cellH - 0.5),
          'fill-opacity': (a * (cls === 'even' ? 0.7 : 0.55 + 0.45 * Math.min(1, Math.abs(net) * 2))).toFixed(3), rx: 1.5 }));
      }
      const bodyTop = Y(Math.max(b.o, b.c)), bodyBot = Y(Math.min(b.o, b.c));
      g.append(sv('line', { class: 'ofs-wick', x1: x + COLW / 2, x2: x + COLW / 2, y1: Y(b.h), y2: Y(b.l) }),
        sv('rect', { class: `ofs-body-r ${b.c >= b.o ? 'up' : 'dn'}`, x: x + COLW / 2 - 1.5, y: bodyTop, width: 3, height: Math.max(1, bodyBot - bodyTop) }));
      for (const ab of b.abs || []) {
        const y = Y(ab.px), st = Math.min(1, Math.abs(ab.dz || 0) / Math.max(1, ab.vz || 1) / 0.6);
        g.append(sv('path', { class: 'ofs-abs', d: ab.side === 'low' ? `M${x} ${y + 3}h${COLW}M${x} ${y + 3}v-5M${x + COLW} ${y + 3}v-5` : `M${x} ${y - 3}h${COLW}M${x} ${y - 3}v5M${x + COLW} ${y - 3}v5`,
          'stroke-opacity': (0.45 + 0.55 * st).toFixed(2) }));
      }
      if (b.big) {
        const r = 1.8 + 3.6 * Math.sqrt(Math.abs(b.big) / S.bmax);
        g.append(sv('circle', { class: `ofs-big ${b.big > 0 ? 'buy' : 'sell'}`, cx: x + COLW / 2, cy: b.big > 0 ? Y(b.h) - r - 4 : Y(b.l) + r + 4, r }));
      }
      const dh = (DELTA_H - 8) / 2 * Math.sqrt(Math.abs(b.d || 0) / S.dmax), dy = H - DELTA_H / 2;
      g.append(sv('rect', { class: `ofs-d ${b.d >= 0 ? 'buy' : 'sell'}`, x: x + 2, y: b.d >= 0 ? dy - dh : dy, width: COLW - 4, height: Math.max(0.8, dh), rx: 1 }));
      svg.append(g); cols.push(g);
    });
    hl = sv('rect', { class: 'ofs-hl', x: 0, y: 1, width: COLW, height: H - 2, rx: 3 });
    hl.style.display = 'none';
    svg.append(hl);
    scroll.append(svg);
    scroll.setAttribute('aria-label', `Order-flow footprint of ${D.day || 'the day'}: ${bars.length} five-minute bars`);
    requestAnimationFrame(() => { scroll.scrollLeft = scroll.scrollWidth; });
    select(sel >= 0 && sel < bars.length ? sel : bars.length - 1, true);
  }

  function select(i, quiet) {
    const bars = (D && D.bars) || [];
    if (!bars.length) return;
    sel = Math.max(0, Math.min(bars.length - 1, i | 0));
    slider.value = String(sel);
    if (hl) { hl.style.display = ''; hl.setAttribute('x', String(4 + sel * COLW)); }
    info.textContent = describe(bars[sel]);
    root.dataset.sel = String(sel);
    if (!quiet && typeof O.onSelect === 'function') { try { O.onSelect(bars[sel], sel); } catch (_) { /* the host's problem */ } }
    const x = 4 + sel * COLW;
    if (x < scroll.scrollLeft + 8 || x > scroll.scrollLeft + scroll.clientWidth - 24) scroll.scrollLeft = Math.max(0, x - scroll.clientWidth / 2);
  }

  const onTap = (ev) => {
    if (!svg) return;
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (svg.viewBox.baseVal.width / r.width);
    select(Math.floor((px - 4) / COLW));
  };
  scroll.addEventListener('click', onTap);
  slider.addEventListener('input', () => select(+slider.value));
  draw();
  return {
    update(d) { D = d; draw(); },
    select: (i) => select(i),
    get selected() { return sel; },
    destroy() { scroll.removeEventListener('click', onTap); root.replaceChildren(); root.classList.remove('ofs'); },
  };
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.25))));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

if (typeof window !== 'undefined') window.OFSTRIP = { mount, describe, scale };
