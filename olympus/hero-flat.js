// OLYMPUS painted 2D heroes (tools/web_public/olympus/hero-flat.js, 2026-11-11, QA Round 6 bug 8). ES module, no dependencies, SVG only (createElementNS,
// attributes only: no markup from data). The flat twin of the 3D hero stage for LITE phones, no WebGL and software GL: a painted sky with a sun glow,
// far hills, a small temple and cypresses, a paved ground, and set pieces lit from the left like the 3D scenes: fluted marble / bronze / gold
// columns (cylinder shading), stepped marble bases with a Greek-key band, laurel sprigs, coins, a soft vignette.
//   const P = paint(svg, { w, h, sky: 'dusk' | 'golden' | 'night', horizon, sunX, sunY, temple })   gradients + the backdrop (call first)
//   P.column(x, base, h, w, { mat: 'marble' | 'bronze' | 'gold', cls })  P.steps(x, base, w, n, { band })  P.band(x, y, w, h)  P.laurel(cx, cy, r, { open })
//   P.coin(cx, cy, r, { silver })  P.el(tag, attrs) (a child with attributes)  P.shadow(cx, cy, rx, ry)  P.vignette()
const NS = 'http://www.w3.org/2000/svg';
let UID = 0;

const SKIES = {
  dusk: { top: '#1c1510', mid: '#5a3a24', hor: '#d7955a', glow: '#ffd59a', hills: '#4a3424', hills2: '#6e4a30', ground: '#3a2a1c', ground2: '#5a4430' },
  golden: { top: '#3d4a5e', mid: '#a88466', hor: '#f1c68e', glow: '#fff0c8', hills: '#7a6450', hills2: '#a08468', ground: '#6a5038', ground2: '#8a7058' },
  night: { top: '#0b0f1c', mid: '#1c2438', hor: '#4a4a5c', glow: '#cfd8f0', hills: '#141a26', hills2: '#1e2534', ground: '#1a1810', ground2: '#2a2620' },
};
const MATS = {
  marble: ['#b9ae9b', '#f4eee2', '#e2d9c8', '#a69a86'],
  bronze: ['#5a3a1e', '#c99560', '#9c6b3c', '#4a3018'],
  gold: ['#8a6420', '#fff0b0', '#e0b860', '#7a5418'],
};

export function paint(svg, o) {
  const opt = o || {}, w = opt.w || 320, h = opt.h || 200, S = SKIES[opt.sky] || SKIES.dusk, id = 'hf' + (++UID) + '-';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, String(attrs[k])); (parent || svg).appendChild(e); return e; };
  const defs = el('defs', {});
  const lin = (name, stops, a) => { const g = el('linearGradient', Object.assign({ id: id + name }, a || { x1: 0, y1: 0, x2: 0, y2: 1 }), defs); stops.forEach((s) => el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }, g)); return 'url(#' + id + name + ')'; };
  const rad = (name, stops, a) => { const g = el('radialGradient', Object.assign({ id: id + name }, a || {}), defs); stops.forEach((s) => el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }, g)); return 'url(#' + id + name + ')'; };
  const F = {
    sky: lin('sky', [[0, S.top], [0.6, S.mid], [1, S.hor]]),
    glow: rad('glow', [[0, S.glow, 0.95], [0.12, S.glow, 0.6], [0.45, S.glow, 0.12], [1, S.glow, 0]]),
    ground: lin('ground', [[0, S.ground2], [1, S.ground]]),
    vig: rad('vig', [[0.4, '#000', 0], [1, '#0a0603', 0.6]], { cx: 0.5, cy: 0.48, r: 0.62 }),
    shadow: rad('shadow', [[0, '#1a1008', 0.55], [1, '#1a1008', 0]]),
    coin: rad('coin', [[0, '#fff0b8'], [0.6, '#d8b050'], [1, '#7a5a18']], { cx: 0.38, cy: 0.35, r: 0.75 }),
    silver: rad('silver', [[0, '#ffffff'], [0.6, '#b8b4ac'], [1, '#5a5650']], { cx: 0.38, cy: 0.35, r: 0.75 }),
  };
  for (const m in MATS) { const c = MATS[m]; F[m] = lin(m, [[0, c[0]], [0.3, c[1]], [0.55, c[2]], [1, c[3]]], { x1: 0, y1: 0, x2: 1, y2: 0 }); F[m + 'Top'] = lin(m + 'Top', [[0, c[1]], [1, c[2]]]); }
  const hz = h * (opt.horizon ?? 0.7), sx = w * (opt.sunX ?? 0.72), sy = opt.sunY != null ? h * opt.sunY : hz * 0.8;
  if (opt.sky !== false) {
    el('rect', { x: -w, y: -h, width: w * 3, height: hz + h + 1, fill: F.sky });        // bleeds past the viewBox: a wider stage shows sky, not bars
    el('circle', { cx: sx, cy: sy, r: Math.max(w, h) * 0.55, fill: F.glow });
    if (opt.disc !== false) el('circle', { cx: sx, cy: sy, r: Math.max(3, w * 0.022), fill: S.glow, opacity: 0.9 });
    // far hills, a temple, near hills, cypresses
    const ridge = (base, amp, col, seed) => { let s = seed, y = base, d = 'M' + -w + ' ' + h * 2 + ' L' + -w + ' ' + base; for (let x = -w; x <= 2 * w; x += 10) { s = (s * 1664525 + 1013904223) >>> 0; y = Math.max(base - amp, Math.min(base + amp * 0.3, y + ((s / 4294967296) - 0.5) * amp * 0.6)); d += ' L' + x + ' ' + y.toFixed(1); } el('path', { d: d + ' L' + 2 * w + ' ' + h * 2 + ' Z', fill: col }); };
    ridge(hz - h * 0.04, h * 0.05, S.hills2, 7);
    if (opt.temple !== false) {
      const tx = w * (opt.templeX ?? 0.2), ty = hz - h * 0.035, tw = w * 0.1, th = tw * 0.45, g = el('g', { fill: S.glow, opacity: 0.45 });
      el('rect', { x: tx - tw / 2, y: ty - th * 0.16, width: tw, height: th * 0.12 }, g);
      for (let i = 0; i < 6; i++) el('rect', { x: tx - tw / 2 + tw * 0.03 + (i * tw * 0.9) / 5, y: ty - th * 0.7, width: tw * 0.045, height: th * 0.56 }, g);
      el('path', { d: `M${tx - tw * 0.55} ${ty - th * 0.7} L${tx} ${ty - th * 1.05} L${tx + tw * 0.55} ${ty - th * 0.7} Z` }, g);
    }
    ridge(hz + h * 0.005, h * 0.03, S.hills, 19);
    for (let i = 0; i < 9; i++) { const x = (((i * 97 + 31) % 100) / 100) * w * 2 - w * 0.5, ch = h * (0.05 + (i % 3) * 0.02); el('ellipse', { cx: x, cy: hz - ch / 2 + h * 0.01, rx: ch * 0.13, ry: ch / 2, fill: '#1a1008', opacity: 0.5 }); }
    el('rect', { x: -w, y: hz, width: w * 3, height: h - hz + h, fill: F.ground });
  }
  const P = {
    svg, el, F, w, h, hz,
    /** a soft contact shadow */
    shadow(cx, cy, rx, ry) { return el('ellipse', { cx, cy, rx, ry, fill: F.shadow }); },
    /** a fluted column standing on base (y), h tall, w wide; cls on the shaft (tests read it) */
    column(x, base, hh, ww, co) {
      const c = co || {}, mat = c.mat || 'marble', g = el('g', {}), top = base - hh;
      const shaft = el('rect', { x: x - ww / 2, y: top, width: ww, height: hh, fill: F[mat], class: c.cls }, g);
      for (let i = 1; i < 6; i++) el('line', { x1: x - ww / 2 + (i * ww) / 6, x2: x - ww / 2 + (i * ww) / 6, y1: top + 1, y2: base - 1, stroke: MATS[mat][3], 'stroke-opacity': 0.35, 'stroke-width': Math.max(0.6, ww / 22) }, g);
      if (c.capital !== false) { el('rect', { x: x - ww * 0.62, y: top - ww * 0.12, width: ww * 1.24, height: ww * 0.14, rx: ww * 0.06, fill: F[c.capMat || mat] }, g); el('rect', { x: x - ww * 0.72, y: top - ww * 0.3, width: ww * 1.44, height: ww * 0.18, fill: F[(c.capMat || mat) + 'Top'] }, g); }
      if (c.base !== false) el('rect', { x: x - ww * 0.66, y: base - ww * 0.12, width: ww * 1.32, height: ww * 0.12, rx: ww * 0.05, fill: F[mat] }, g);
      return shaft;
    },
    /** stepped marble base: n steps, the top one w wide at y = base; optional key band on the top step */
    steps(x, base, ww, n, so) {
      const s = so || {}, sh = s.stepH || 6;
      for (let i = n - 1; i >= 0; i--) { const sw = ww + i * (s.run || 12) * 2; el('rect', { x: x - sw / 2, y: base + i * sh, width: sw, height: sh, fill: F.marble }); el('rect', { x: x - sw / 2, y: base + i * sh, width: sw, height: 1.2, fill: '#fff8ec', opacity: 0.6 }); }
      if (s.band) P.band(x - ww / 2 + 2, base + 1, ww - 4, sh - 2);
    },
    /** a Greek-key band (dark key on cream) */
    band(x, y, ww, hh, bo) {
      const b = bo || {}, g = el('g', {}); el('rect', { x, y, width: ww, height: hh, fill: b.bg || '#e6d8bb' }, g);
      const u = hh / 10; let d = '';
      for (let x0 = 0; x0 + hh <= ww + 0.1; x0 += hh) { const P2 = [[0, 8], [0, 2], [7, 2], [7, 7], [3, 7], [3, 4.5], [5, 4.5]]; d += P2.map((p, i) => (i ? 'L' : 'M') + (x + x0 + (p[0] + 1) * u).toFixed(1) + ' ' + (y + p[1] * u).toFixed(1)).join(' ') + ' M' + (x + x0 + u).toFixed(1) + ' ' + (y + 8 * u).toFixed(1) + ' L' + (x + x0 + 11 * u).toFixed(1) + ' ' + (y + 8 * u).toFixed(1) + ' '; }
      el('path', { d, fill: 'none', stroke: b.fg || '#6e2f1c', 'stroke-width': u * 0.9 }, g);
      return g;
    },
    /** a laurel sprig pair round (cx, cy) of radius r (gold by default), open at the top */
    laurel(cx, cy, r, lo) {
      const l = lo || {}, g = el('g', { fill: l.color || '#d4ae58', stroke: 'none' }), n = l.leaves || 9;
      for (const sd of [-1, 1]) for (let i = 0; i < n; i++) { const a = Math.PI / 2 + sd * (0.35 + (i / (n - 1)) * 2.3), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, rot = (a * 180) / Math.PI + (sd > 0 ? 60 : -60);
        el('ellipse', { cx: x.toFixed(1), cy: y.toFixed(1), rx: r * 0.2, ry: r * 0.08, transform: `rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})` }, g); }
      return g;
    },
    /** an owl coin seen from the front */
    coin(cx, cy, r, co) { const g = el('g', {}); el('circle', { cx, cy, r, fill: co && co.silver ? F.silver : F.coin, stroke: '#6a4a14', 'stroke-width': Math.max(0.6, r * 0.08) }, g); el('circle', { cx, cy, r: r * 0.72, fill: 'none', stroke: '#6a4a14', 'stroke-opacity': 0.4, 'stroke-width': Math.max(0.5, r * 0.05) }, g); return g; },
    vignette() { return el('rect', { x: -w * 0.6, y: -h * 0.15, width: w * 2.2, height: h * 1.3, fill: F.vig, 'pointer-events': 'none' }); },
  };
  return P;
}
