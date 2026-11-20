// OLYMPUS arena-to-arena transitions (jarvis/transitions.js, 2026-11-04): the effect every time Jarvis goes from one app to another.
// Every app has its own signature (Oracle = Zeus' lightning, Tyche = a sea surge, Prometheus = a fire sweep, Pantheon = marble
// columns, Mind = a constellation, Daphne = laurel leaves, Plutus = golden coins ...), drawn in the app's colour and glyph.
// AGORA (2026-11-09): every colour is warmed toward gold (no neon), the default is a MARBLE WIPE (two marble doors with a gold seam),
// a drift of gold dust floats over every kind, and Zeus' lightning / the warp tunnel / the slash / the shatter are retired from the table.
//
//   * the app -> transition table is DATA (REGISTRY below: kind, duration, extra sound cues); the drawing code is a set of KINDS
//     built from shared blocks (veil, soft iris, warp tunnel, marble columns, push-through frames, shockwave, glyph particles,
//     cell dissolve ...). A new app = one line in REGISTRY; an app without a line gets the DEFAULT (the warp).
//   * it plays OVER the app while it loads (show() has already opened the frame) and never delays it. 600-1100 ms. A tap, Escape
//     or Enter skips it at once. One canvas 2D, reused, released after (1 x 1, out of the page); no WebGL, no render targets.
//   * tiers: full = the signature; LITE (3D effects Low / Off) = a 250 ms colour fade; reduced motion = a 200 ms flat colour fade
//     (no movement). Sound and vibration only on the full tier, through the OLYMPUS kit, guarded by OLYMPUS_QUIET and the mute.
//   * jarvis/portal.js hands every jump to play() here when this file is loaded; if it is not (or play() fails) the old warp plays.
//
//   window.jarvisTransitions.play({ id, name, color, glyph }, { from: {id, color}, at, done })  -> 'warp' | 'fade' | 'none'
//       at = 0..1: hold that one frame until skip() (screenshots, tests)
//   .skip()  .has(id)  .ids()  .registry  .kinds  .tier()
//   window.__jarvisTransitions = { runs, id, kind, from, tier, mode, ms, dur, active, frames, cues, error }   (the tests)

const STYLE_ID = 'jtrans-css', TAU = Math.PI * 2, FADE_LITE = 250, FADE_STATIC = 200, MAX_DPR = 1.25;

// ----------------------------------------------------------------------------------------------------------- the table (data)
// kind: which drawing; ms: 600..1100; cues: [[t 0..1, kit sound]] on top of the 'portal' whoosh that show() plays at the start;
// label: false = the kind draws the glyph itself (no name card over it); n: a count the kind reads (columns, tiles ...)
export const REGISTRY = {
  zenith:     { kind: 'marble',        ms: 900 },
  oracle:     { kind: 'sunburst',      ms: 880,  cues: [[0.17, 'rankup']] },
  odeon:      { kind: 'curtain',       ms: 1000, cues: [[0.34, 'tick']] },
  fates:      { kind: 'threads',       ms: 960,  cues: [[0.5, 'tick']] },
  datacity:   { kind: 'skyline',       ms: 900 },
  cities:     { kind: 'flythrough',    ms: 600 },
  kalshicity: { kind: 'chart',         ms: 880 },
  ledger:     { kind: 'coins',         ms: 940,  cues: [[0.4, 'rankup']] },
  journal:    { kind: 'constellation', ms: 940 },
  inbox:      { kind: 'tiles',         ms: 780 },
  settings:   { kind: 'waves',         ms: 1000 },
  tree:       { kind: 'laurel',        ms: 1000 },
  prometheus: { kind: 'forge',         ms: 960 },
  pantheon:   { kind: 'columns',       ms: 1000, n: 7 },
  planner:    { kind: 'tiles',         ms: 820 },
  hestia:     { kind: 'sunburst',      ms: 900 },
  demeter:    { kind: 'tiles',         ms: 800 },
  apollo:     { kind: 'sunburst',      ms: 950 },
  hera:       { kind: 'coins',         ms: 900 },
  dionysus:   { kind: 'coins',         ms: 900 },
  mint:       { kind: 'columns',       ms: 1000, n: 5 },
  mintcity:   { kind: 'columns',       ms: 1000, n: 5 },
  mercury:    { kind: 'tiles',         ms: 800 },
  chrysos:    { kind: 'columns',       ms: 1000, n: 4 },
  sibyl:      { kind: 'sunburst',      ms: 1000 },
  oikos:      { kind: 'waves',         ms: 1000 },
  arbiter:    { kind: 'tiles',         ms: 800 },
  stoa:       { kind: 'columns',       ms: 1000, n: 6 },
  aegis:      { kind: 'columns',       ms: 1000, n: 3 },
  lyceum:     { kind: 'columns',       ms: 1000, n: 6 },
  nike:       { kind: 'sunburst',      ms: 1000 },
  kronos:     { kind: 'sunburst',      ms: 1000 },
  moirai:     { kind: 'waves',         ms: 1000 },
  epilogue:   { kind: 'tiles',         ms: 800 },
  argo:       { kind: 'waves',         ms: 1000 },
  kratos:     { kind: 'columns',       ms: 1000, n: 4 },
  pythia:     { kind: 'sunburst',      ms: 1000 },
  gallery:    { kind: 'columns',       ms: 1000, n: 5 },
  kairos:     { kind: 'sunburst',      ms: 1000 },
  compass:    { kind: 'sunburst',      ms: 1000 },
  pheme:      { kind: 'tiles',         ms: 800 },
  harmonia:   { kind: 'waves',         ms: 1000 },
  helios:     { kind: 'sunburst',      ms: 1000 },
  ergasterion:{ kind: 'columns',       ms: 1000, n: 5 },
  archive:    { kind: 'scroll',        ms: 600 },
  pinakes:    { kind: 'tiles',         ms: 800 },
  colosseum:  { kind: 'columns',       ms: 1000, n: 5 },
  nq:         { kind: 'columns',       ms: 1000, n: 3 },
  symposium:  { kind: 'door',          ms: 600 },
  herald:     { kind: 'tiles',         ms: 800 },
  polis:      { kind: 'skyline',       ms: 1000 },
  agency:     { kind: 'tiles',         ms: 800 },
  business:   { kind: 'columns',       ms: 1000, n: 5 },
  trading:    { kind: 'chart',         ms: 800 },
  board:      { kind: 'tiles',         ms: 800 },
  why:        { kind: 'tiles',         ms: 800 },
  widget:     { kind: 'tiles',         ms: 800 },
  clio:       { kind: 'scroll',        ms: 600 },
  atlas:      { kind: 'sunburst',      ms: 900 },
  observatory:{ kind: 'sunburst',      ms: 950 },
  delphi:     { kind: 'sunburst',      ms: 1000 },
  pnyx:       { kind: 'columns',       ms: 1000, n: 5 },
  mind:       { kind: 'constellation', ms: 960 },
  arena:      { kind: 'sunburst',      ms: 1000, cues: [[0.46, 'rankup']] },
  kalshi:     { kind: 'chart',         ms: 860 },
  tyche:      { kind: 'waves',         ms: 1000 },
  hermes:     { kind: 'dash',          ms: 700 },
  bridge:     { kind: 'span',          ms: 900 },
  ares:       { kind: 'columns',       ms: 860,  cues: [[0.2, 'tick']] },
  plutus:     { kind: 'coins',         ms: 1000, cues: [[0.4, 'rankup']] },
  athena:     { kind: 'assemble',      ms: 1000, label: false },
  forum:      { kind: 'pushthrough',   ms: 920 },
  labyrinth:  { kind: 'maze',          ms: 1000 },
  argus:      { kind: 'eyes',          ms: 1000, cues: [[0.3, 'tick']] },
  nemesis:    { kind: 'marble',        ms: 900,  cues: [[0.08, 'tick']] },
  chronos:    { kind: 'clock',         ms: 1000, cues: [[0.52, 'tick']] },
  hephaestus: { kind: 'anvil',         ms: 960,  cues: [[0.22, 'tick']] },
};
export const DEFAULT = { kind: 'marble', ms: 850 };

// ---------------------------------------------------------------------------------------------------------------- small maths
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ss = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const eo = (x) => 1 - Math.pow(1 - clamp(x), 3);
const ei = (x) => { x = clamp(x); return x * x * x; };
const lerp = (a, b, t) => a + (b - a) * t;
const fract = (x) => x - Math.floor(x);
const bell = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
const hash = (a, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
function seeded(str) {                                           // mulberry32: the same app always draws the same
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let s = h >>> 0;
  return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const GOLD = [200, 162, 74];
const rgbOf = (h) => {
  const n = parseInt(String(h || '#c8a24a').replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return isNaN(n) ? GOLD.slice() : [n >> 16 & 255, n >> 8 & 255, n & 255];
};
// AGORA: an app's colour leans toward gold, so no transition is neon
const warmRgb = (c) => [0, 1, 2].map((i) => Math.round(c[i] * 0.4 + GOLD[i] * 0.6));
const hexOf = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
// colour c (0..255 x3) scaled by k, lifted toward white by l, alpha a
const col = (c, a = 1, k = 1, l = 0) => {
  const f = (v) => Math.round(Math.min(255, v * k + (255 - v * k) * l));
  return `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${a})`;
};
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------------------------------------------------------------------------------------------------------- shared building blocks
/** the dark, app-tinted cover; its rim leans toward the colour of the app we come from */
function veil(E, a, k = 0.12) {
  if (a <= 0.003) return;
  const { g } = E;
  const gr = g.createRadialGradient(E.cx, E.cy, 0, E.cx, E.cy, E.R * 1.1);
  gr.addColorStop(0, col(E.rgb, 1, k * 1.7));
  gr.addColorStop(1, E.from ? col(E.from, 1, 0.1) : 'rgb(20,17,14)');
  g.globalAlpha = a; g.fillStyle = gr; g.fillRect(0, 0, E.W, E.H); g.globalAlpha = 1;
}
/** cut a soft-edged round hole in what is drawn so far (the app shows through) */
function iris(E, x, y, r, soft = 0.1) {
  if (r <= 1) return;
  const { g } = E;
  g.globalCompositeOperation = 'destination-out';
  const gr = g.createRadialGradient(x, y, Math.max(0, r * (1 - soft)), x, y, r);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-over';
}
function cutRect(E, x, y, w, h, a = 1) {
  const { g } = E;
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'source-over';
}
const add = (E) => { E.g.globalCompositeOperation = 'lighter'; };
const norm = (E) => { E.g.globalCompositeOperation = 'source-over'; E.g.globalAlpha = 1; };
/** a shockwave ring: radius r, thickness grows then thins, alpha a */
function ring(E, x, y, r, a, w = 6, lift = 0.5) {
  if (a <= 0.01 || r <= 1) return;
  const { g } = E;
  add(E); g.lineWidth = w; g.strokeStyle = col(E.rgb, a, 1, lift);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.lineWidth = w * 3.2; g.strokeStyle = col(E.rgb, a * 0.18, 1, 0); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  norm(E);
}
function flash(E, a, x = E.cx, y = E.cy, r = E.R * 0.9, white = 1) {
  if (a <= 0.01) return;
  const { g } = E, gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col(E.rgb, a, 1, white)); gr.addColorStop(1, col(E.rgb, 0, 1, 0));
  add(E); g.fillStyle = gr; g.fillRect(0, 0, E.W, E.H); norm(E);
}
/** warp tunnel streaks rushing outward from the centre (lanes: [{a, h, w, l}]) */
function tunnel(E, lanes, t, power = 1, from = 0) {
  const { g } = E, travel = t * t * 5 + t * 0.8;
  add(E); g.lineCap = 'round';
  for (const L of lanes) {
    const p = fract(L.h + travel * (0.5 + L.h * 0.9));
    const r0 = Math.pow(p, 2.2) * E.R * 1.15 + from, r1 = r0 + L.l * (0.2 + t * 2) * E.R * (0.15 + p);
    const c = Math.cos(L.a), s = Math.sin(L.a);
    g.strokeStyle = col(E.rgb, clamp(power * (0.25 + p * 0.9)), 1, 0.35);
    g.lineWidth = L.w * (0.5 + p * 2.2);
    g.beginPath(); g.moveTo(E.cx + c * r0, E.cy + s * r0); g.lineTo(E.cx + c * r1, E.cy + s * r1); g.stroke();
  }
  norm(E);
}
/** a marble column: fluted, with a capital and a base, in the app's tint */
function marble(E, x, y, w, h) {
  const { g } = E, tint = mixc([244, 236, 214], E.rgb, 0.18);
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, col(tint, 1, 0.62)); gr.addColorStop(0.18, col(tint, 1, 0.98)); gr.addColorStop(0.42, col(tint, 1, 1.08));
  gr.addColorStop(0.72, col(tint, 1, 0.9)); gr.addColorStop(1, col(tint, 1, 0.55));
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(40,30,20,.16)'; g.lineWidth = 1; g.beginPath();
  for (let i = 1; i < 6; i++) { const fx = x + (w * i) / 6; g.moveTo(fx, y); g.lineTo(fx, y + h); }
  g.stroke();
  g.fillStyle = col(tint, 1, 0.92); g.fillRect(x - 2, y, w + 4, Math.max(6, h * 0.035)); g.fillRect(x - 2, y + h - Math.max(6, h * 0.035), w + 4, Math.max(6, h * 0.035));
}
function archPath(g, cx, cy, a, b) {                              // a Roman arch, a wide, b tall, centred
  const top = cy - b / 2 + a / 2;
  g.beginPath(); g.moveTo(cx - a / 2, cy + b / 2); g.lineTo(cx - a / 2, top); g.arc(cx, top, a / 2, Math.PI, 0); g.lineTo(cx + a / 2, cy + b / 2); g.closePath();
}
function leaf(g, x, y, len, rot, c1, c2) {                         // a lens-shaped leaf with a midrib
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(len * 0.42, len);
  g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(1, 0, 0, 1); g.quadraticCurveTo(-1, 0, 0, -1); g.fillStyle = c1; g.fill();
  g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(0.9, 0, 0, 1); g.lineTo(0, -1); g.fillStyle = c2; g.fill();
  g.restore();
}
function bolt(r, x0, y0, x1, y1, disp, depth, out) {               // midpoint displacement
  if (depth === 0) { out.push([x1, y1]); return; }
  const mx = (x0 + x1) / 2 + (r() - 0.5) * disp, my = (y0 + y1) / 2 + (r() - 0.5) * disp * 0.4;
  bolt(r, x0, y0, mx, my, disp / 2, depth - 1, out); bolt(r, mx, my, x1, y1, disp / 2, depth - 1, out);
}
function polyline(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }

// the glyph as points: drawn once into a tiny scratch canvas (never in the page), read back, released
let scratch = null;
function glyphPoints(glyph, want, r) {
  try {
    if (!scratch) scratch = document.createElement('canvas');
    scratch.width = scratch.height = 96;
    const s = scratch.getContext('2d', { willReadFrequently: true });
    s.clearRect(0, 0, 96, 96); s.fillStyle = '#fff'; s.textAlign = 'center'; s.textBaseline = 'middle';
    s.font = '700 74px system-ui, -apple-system, "Segoe UI Symbol", sans-serif';
    s.fillText(glyph || 'O', 48, 52);
    const d = s.getImageData(0, 0, 96, 96).data, pts = [];
    for (let y = 0; y < 96; y += 2) for (let x = 0; x < 96; x += 2) if (d[(y * 96 + x) * 4 + 3] > 120) pts.push([x - 48, y - 48]);
    scratch.width = scratch.height = 1;
    if (pts.length < 8) return ringPoints(want);
    while (pts.length > want) pts.splice(Math.floor(r() * pts.length), 1);
    return pts;
  } catch (e) { return ringPoints(want); }
}
function ringPoints(n) { return Array.from({ length: n }, (_, i) => [Math.cos((i / n) * TAU) * 34, Math.sin((i / n) * TAU) * 34]); }

/** AGORA: a slow drift of gold dust over every transition (a few dozen specks, no streaks, no flicker) */
function dust(E, t) {
  const { g } = E, n = Math.round(40 * E.q), a0 = bell(t, 0.45, 0.3);
  if (a0 < 0.02) return;
  add(E);
  for (let i = 0; i < n; i++) {
    const x = hash(i, 1) * E.W + Math.sin(t * 3 + i) * 6, y = ((hash(i, 2) * E.H - t * E.H * (0.1 + 0.28 * hash(i, 3))) % E.H + E.H) % E.H;
    g.fillStyle = col(GOLD, a0 * (0.25 + 0.5 * hash(i, 4)), 1, 0.3);
    g.beginPath(); g.arc(x, y, 0.8 + hash(i, 5) * 1.8, 0, TAU); g.fill();
  }
  norm(E);
}

// -------------------------------------------------------------------------------------------------------------- the signatures
// Each kind: init(E) -> S (built once per play, seeded by the app id), draw(E, S, t) with t 0..1. Every kind ends fully clear.
export const KINDS = {

  // AGORA's default: two marble doors slide together over the screen, a gold seam, the app's glyph in a gold ring, then they part
  marble: {
    init: (E) => ({ veins: Array.from({ length: 9 }, () => ({ x: E.rnd(), y: E.rnd(), a: (E.rnd() - 0.5) * 1.6, l: 0.25 + E.rnd() * 0.6 })) }),
    draw(E, S, t) {
      const { g } = E, p = eo(t / 0.34) * (1 - ei((t - 0.54) / 0.38)), w = (E.W / 2 + 2) * p;
      if (w > 1) {
        for (const side of [0, 1]) {
          g.save();
          if (side) { g.translate(E.W, 0); g.scale(-1, 1); }
          const gr = g.createLinearGradient(0, 0, w, 0);
          gr.addColorStop(0, '#1b1712'); gr.addColorStop(0.7, '#2b251d'); gr.addColorStop(1, '#3a3228');
          g.fillStyle = gr; g.fillRect(0, 0, w, E.H);
          g.strokeStyle = 'rgba(200,162,74,.13)'; g.lineWidth = 1.2; g.beginPath();
          for (const v of S.veins) { const x = v.x * w, y = v.y * E.H; g.moveTo(x, y); g.quadraticCurveTo(x + w * 0.2 * v.a, y + E.H * 0.08, x + w * v.l * Math.cos(v.a), y + E.H * 0.22 * v.l); }
          g.stroke();
          g.fillStyle = col(GOLD, 0.95); g.fillRect(w - 3, 0, 3, E.H);
          g.fillStyle = col(GOLD, 0.35); g.fillRect(w - 9, 0, 2, E.H);
          g.restore();
        }
      }
      const m = ss(0.2, 0.38, t) * (1 - ss(0.5, 0.64, t));
      if (m > 0.01) {
        g.save(); g.globalAlpha = m; g.strokeStyle = col(GOLD, 1); g.lineWidth = 2;
        g.beginPath(); g.arc(E.cx, E.cy, E.u * 0.17, 0, TAU); g.stroke();
        g.beginPath(); g.arc(E.cx, E.cy, E.u * 0.15, 0, TAU); g.globalAlpha = m * 0.4; g.stroke(); g.globalAlpha = m;
        g.restore();
      }
    },
  },

  // the classic: a tunnel of streaks, a hot ring opening at the centre, the app revealed through it
  warp: {
    init: (E) => ({ lanes: Array.from({ length: Math.round(90 * E.q) }, () => ({ a: E.rnd() * TAU, h: E.rnd(), w: 0.6 + E.rnd() * 1.6, l: 0.08 + E.rnd() * 0.3 })) }),
    draw(E, S, t) {
      veil(E, ss(0, 0.18, t));
      const Rh = E.R * 1.15 * Math.pow(ss(0.46, 0.92, t), 1.3);
      iris(E, E.cx, E.cy, Rh, 0.12);
      tunnel(E, S.lanes, t, (0.35 + t) * (1 - ss(0.6, 0.9, t)));
      ring(E, E.cx, E.cy, Rh, 0.95 * (1 - ss(0.8, 0.95, t)), 3 + 8 * (1 - t));
      flash(E, 0.75 * bell(t, 0.5, 0.07));
    },
  },

  // ORACLE: Zeus' bolt strikes the middle of the screen, the white flash, the shockwave opens the app
  lightning: {
    init(E) {
      const bolts = [], main = [[E.cx + (E.rnd() - 0.5) * E.W * 0.3, -20]];
      bolt(E.rnd, main[0][0], -20, E.cx, E.cy, E.u * 0.34, 6, main);
      bolts.push({ pts: main, w: 1 });
      for (let i = 0; i < 6; i++) {
        const k = 4 + Math.floor(E.rnd() * (main.length - 12)), o = main[k], b = [o];
        bolt(E.rnd, o[0], o[1], o[0] + (E.rnd() - 0.5) * E.W * 0.9, o[1] + E.H * (0.12 + E.rnd() * 0.22), E.u * 0.18, 4, b);
        bolts.push({ pts: b, w: 0.5 });
      }
      return { bolts };
    },
    draw(E, S, t) {
      const { g } = E;
      veil(E, ss(0, 0.12, t) * 0.9 * (1 - ss(0.72, 0.95, t)), 0.07);
      iris(E, E.cx, E.cy, E.R * 1.2 * ss(0.3, 0.82, t), 0.16);
      const k = (t - 0.16) / 0.42;
      const vis = k < 0 || k > 1 ? 0 : k < 0.12 ? 1 : k < 0.2 ? 0.1 : k < 0.4 ? 1 : k < 0.55 ? 0.35 : 0.6 * (1 - ss(0.55, 1, k));
      if (vis > 0.01) {
        add(E); g.lineJoin = 'round'; g.lineCap = 'round';
        for (const b of S.bolts) {
          g.lineWidth = 34 * b.w; g.strokeStyle = col(E.rgb, 0.1 * vis); polyline(g, b.pts);
          g.lineWidth = 12 * b.w; g.strokeStyle = col(E.rgb, 0.4 * vis, 1, 0.4); polyline(g, b.pts);
          g.lineWidth = 3.6 * b.w; g.strokeStyle = `rgba(255,255,255,${vis})`; polyline(g, b.pts);
        }
        norm(E);
      }
      flash(E, 0.9 * bell(t, 0.175, 0.03) + 0.3 * bell(t, 0.3, 0.05), E.cx, E.cy, E.R * 1.2, 0.8);
      ring(E, E.cx, E.cy, E.R * 1.15 * eo((t - 0.18) / 0.55), 0.9 * (1 - ss(0.5, 0.85, t)), 9 * (1 - t) + 2);
    },
  },

  // ODEON: the theatre curtains close, a spotlight, then they part
  curtain: {
    init: () => ({}),
    draw(E, S, t) {
      const { g } = E, close = eo(t / 0.3), open = ss(0.5, 0.92, t), wl = (E.W / 2 + 4) * close * (1 - open);
      if (wl > 1) {
        for (const side of [0, 1]) {
          g.save();
          if (side) { g.translate(E.W, 0); g.scale(-1, 1); }
          const gr = g.createLinearGradient(0, 0, wl, 0);
          for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, col(E.rgb, 1, i % 2 ? 0.2 : 0.34));
          g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(wl, 0);
          for (let y = 0; y <= E.H + 40; y += 40) g.lineTo(wl + Math.sin(y / 70 + t * 9) * 5 * close, y);
          g.lineTo(0, E.H); g.closePath(); g.fill();
          add(E); g.strokeStyle = col(E.rgb, 0.8, 1, 0.55); g.lineWidth = 2.5; g.beginPath();
          for (let y = 0; y <= E.H + 40; y += 40) { const x = wl + Math.sin(y / 70 + t * 9) * 5 * close; y ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke(); norm(E);
          g.restore();
        }
      }
      const sp = ss(0.22, 0.38, t) * (1 - ss(0.52, 0.68, t));
      if (sp > 0.01) {
        const gr = g.createRadialGradient(E.cx, E.cy, 0, E.cx, E.cy, E.u * 0.62);
        gr.addColorStop(0, col(E.rgb, 0.65 * sp, 1, 0.7)); gr.addColorStop(1, col(E.rgb, 0, 1, 0));
        add(E); g.fillStyle = gr; g.fillRect(0, 0, E.W, E.H); norm(E);
      }
    },
  },

  // FATES: golden threads weave across in rows, cross at the middle, a snip, and they are pulled away
  threads: {
    init: (E) => ({ n: 9, ph: Array.from({ length: 3 }, () => E.rnd() * TAU) }),
    draw(E, S, t) {
      const { g } = E, h = E.H / S.n;
      for (let i = 0; i < S.n; i++) {
        const dir = i % 2 ? 1 : -1, inP = eo((t - i * 0.016) / 0.3), outP = ei((t - 0.52 - i * 0.02) / 0.36);
        const a = inP * E.W, b = outP * E.W, x0 = dir > 0 ? E.W - a : b, x1 = dir > 0 ? E.W - b : a;
        if (x1 - x0 < 1) continue;
        g.fillStyle = col(E.rgb, 1, 0.1 + 0.03 * (i % 3)); g.fillRect(x0, i * h, x1 - x0, h + 1);
        add(E); g.strokeStyle = col(E.rgb, 0.45, 1, 0.3); g.lineWidth = 1.2; g.beginPath();
        g.moveTo(x0, i * h + h * 0.33); g.lineTo(x1, i * h + h * 0.33); g.moveTo(x0, i * h + h * 0.66); g.lineTo(x1, i * h + h * 0.66); g.stroke();
        const ex = dir > 0 ? x0 : x1;
        g.fillStyle = col(E.rgb, 0.8, 1, 0.7); g.beginPath(); g.arc(ex, i * h + h / 2, 3 + (i % 3), 0, TAU); g.fill();
        norm(E);
      }
      const w = ss(0.12, 0.34, t) * (1 - ss(0.5, 0.62, t));
      if (w > 0.01) {
        add(E); g.lineWidth = 2.4;
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = col(E.rgb, 0.85 * w, 1, 0.45); g.beginPath();
          for (let x = 0; x <= E.W; x += 10) { const y = E.cy + Math.sin((x / E.W) * TAU * (1 + k * 0.5) + S.ph[k] + t * 6) * E.H * 0.2 * (1 - k * 0.15); x ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
        norm(E);
      }
      const sn = ss(0.46, 0.55, t) * (1 - ss(0.55, 0.7, t));
      if (sn > 0.01) { add(E); g.fillStyle = `rgba(255,255,255,${sn})`; g.fillRect(E.cx - E.W * sn / 2, E.cy - 1.5, E.W * sn, 3); norm(E); }
    },
  },

  // DATA CITY: a skyline rises from the bottom, windows lit, and sinks again
  skyline: {
    init: (E) => ({ n: 13, d: Array.from({ length: 13 }, () => E.rnd()), hh: Array.from({ length: 13 }, () => 1.02 + E.rnd() * 0.12) }),
    draw(E, S, t) {
      const { g } = E, bw = E.W / S.n;
      for (let i = 0; i < S.n; i++) {
        const up = eo((t - S.d[i] * 0.2) / 0.32), dn = ei((t - 0.5 - S.d[i] * 0.22) / 0.32), hgt = E.H * S.hh[i] * up * (1 - dn);
        if (hgt < 2) continue;
        const x = i * bw, y = E.H - hgt;
        g.fillStyle = col(E.rgb, 1, 0.11 + 0.05 * hash(i)); g.fillRect(x, y, bw + 1, hgt);
        add(E); g.fillStyle = col(E.rgb, 0.85, 1, 0.5); g.fillRect(x, y, bw + 1, 2);
        for (let wy = y + 14, j = 0; wy < E.H - 6; wy += 22, j++) {
          for (let k = 0; k < 3; k++) if (hash(i * 9 + k, j) > 0.5) { g.fillStyle = col(E.rgb, 0.55 + 0.4 * hash(j, k), 1, 0.45); g.fillRect(x + 5 + k * (bw - 10) / 3, wy, (bw - 10) / 3 - 4, 9); }
        }
        norm(E);
      }
    },
  },

  // DAPHNE: laurel leaves swirl in to the centre and out again around a wreath
  laurel: {
    init: (E) => ({
      L: Array.from({ length: Math.round(64 * E.q) }, () => ({ a: E.rnd() * TAU, ph: E.rnd() * 0.22, s: 0.7 + E.rnd() * 0.7, d: E.rnd() < 0.5 ? 1 : -1, sh: E.rnd() })),
      wreath: Array.from({ length: 26 }, (_, i) => (i / 26) * TAU),
    }),
    draw(E, S, t) {
      const { g } = E;
      veil(E, ss(0.04, 0.36, t) * (1 - ss(0.62, 0.92, t)), 0.1);
      const maxR = E.R * 1.15;
      for (const L of S.L) {
        const u = clamp((t - L.ph) / 0.72);
        if (u <= 0 || u >= 1) continue;
        const rr = maxR * Math.pow(Math.abs(1 - 2 * u), 1.3), ang = L.a + u * 3.4 * L.d, sz = E.u * 0.085 * L.s * (0.6 + 0.8 * (1 - Math.abs(1 - 2 * u)));
        leaf(g, E.cx + Math.cos(ang) * rr, E.cy + Math.sin(ang) * rr, sz, ang + Math.PI / 2 + u * 4, col(E.rgb, 0.95, 0.55 + 0.35 * L.sh, 0.05), col(E.rgb, 0.95, 0.9, 0.35));
      }
      const w = bell(t, 0.5, 0.15);
      if (w > 0.02) for (const a of S.wreath) leaf(g, E.cx + Math.cos(a) * E.u * 0.22, E.cy + Math.sin(a) * E.u * 0.22, E.u * 0.07 * w, a + Math.PI, col(E.rgb, w, 0.8, 0.3), col(E.rgb, w, 1, 0.6));
    },
  },

  // PROMETHEUS: a wall of fire sweeps up the screen, burns through from the bottom, embers rise
  forge: {
    init: (E) => ({ em: Array.from({ length: Math.round(46 * E.q) }, () => ({ x: E.rnd(), v: 0.5 + E.rnd() * 1.1, r: 1 + E.rnd() * 2.4, d: E.rnd() * 0.3, w: E.rnd() * TAU })) }),
    draw(E, S, t) {
      const { g } = E, H = E.H;
      const wob = (x, k) => (Math.sin(x * 0.035 + t * 14 + k) * 0.5 + Math.sin(x * 0.083 - t * 21 + k) * 0.35 + Math.sin(x * 0.17 + t * 33) * 0.15) * H * 0.035;
      const top = (x) => H * (1.1 - 1.3 * eo(t / 0.52)) + wob(x, 0), bot = (x) => H * (1.12 - 1.3 * ei((t - 0.4) / 0.52)) + wob(x, 2) * 0.7;
      const xs = []; for (let x = -10; x <= E.W + 10; x += 10) xs.push(x);
      g.fillStyle = col(E.rgb, 1, 0.2); g.beginPath(); g.moveTo(xs[0], top(xs[0]));
      xs.forEach((x) => g.lineTo(x, top(x))); for (let i = xs.length - 1; i >= 0; i--) g.lineTo(xs[i], Math.max(top(xs[i]), bot(xs[i]))); g.closePath(); g.fill();
      add(E); g.lineJoin = 'round';
      for (const [edge, dirn] of [[top, 1], [bot, -1]]) {                       // the heat under the front, and above the burn-through
        const y0 = edge(E.W / 2), gr = g.createLinearGradient(0, y0, 0, y0 + dirn * H * 0.4);
        gr.addColorStop(0, col(E.rgb, 0.6, 1, 0.25)); gr.addColorStop(0.5, col(E.rgb, 0.22)); gr.addColorStop(1, col(E.rgb, 0));
        g.fillStyle = gr; g.fillRect(0, dirn > 0 ? y0 : y0 - H * 0.4, E.W, H * 0.4);
      }
      for (const [edge, scale] of [[top, 1], [bot, 0.7]]) {
        for (const [lw, a, l] of [[70, 0.1, 0], [34, 0.22, 0.1], [14, 0.55, 0.45], [4, 0.95, 0.9]]) {
          g.lineWidth = lw * scale; g.strokeStyle = col(E.rgb, a, 1, l); g.beginPath();
          xs.forEach((x, i) => (i ? g.lineTo(x, edge(x)) : g.moveTo(x, edge(x)))); g.stroke();
        }
      }
      for (const e of S.em) {
        const u = clamp((t - e.d) / 0.7); if (u <= 0 || u >= 1) continue;
        const y = H * (1.05 - u * 1.2 * e.v), x = e.x * E.W + Math.sin(e.w + u * 7) * 14;
        g.fillStyle = col(E.rgb, 0.9 * (1 - u), 1, 0.6); g.beginPath(); g.arc(x, y, e.r * (1 - u * 0.5), 0, TAU); g.fill();
      }
      norm(E);
    },
  },

  // PANTHEON: marble columns slide in from above and below, hold, and slide on through
  columns: {
    init: (E) => ({ d: Array.from({ length: 12 }, (_, i) => i) }),
    draw(E, S, t, o) {
      const { g } = E, n = o.n || 7, cw = E.W / n;
      for (let i = 0; i < n; i++) {
        const dd = Math.abs(i - (n - 1) / 2), dir = i % 2 ? 1 : -1;
        const inP = eo((t - dd * 0.025) / 0.3), outP = ei((t - 0.52 - dd * 0.03) / 0.38);
        const y = dir * E.H * (1 - inP) - dir * E.H * outP;
        if (Math.abs(y) >= E.H) continue;
        marble(E, i * cw, y, cw + 0.6, E.H);
        const lead = dir > 0 ? y : y + E.H;
        add(E); const gl = g.createLinearGradient(0, lead - 40, 0, lead + 40);
        gl.addColorStop(0, col(E.rgb, 0, 1, 0.3)); gl.addColorStop(0.5, col(E.rgb, 0.5 * (1 - Math.abs(inP - 0.5) * 0.4), 1, 0.5)); gl.addColorStop(1, col(E.rgb, 0, 1, 0.3));
        g.fillStyle = gl; g.fillRect(i * cw, lead - 40, cw, 80); norm(E);
      }
    },
  },

  // ---- the cinematic three (2026-11-11, the effects pass): each made to read in under 600 ms ----
  // DOOR: two tall marble doors close over the screen, a thin gold seam, then swing open toward us in perspective with warm light
  // spilling through the widening gap (no glow: a soft gold wash that fades)
  door: {
    init: (E) => ({ veins: Array.from({ length: 6 }, () => ({ x: E.rnd(), y: E.rnd(), a: (E.rnd() - 0.5) * 1.4, l: 0.3 + E.rnd() * 0.5 })) }),
    draw(E, S, t) {
      const { g } = E, close = eo(t / 0.24), open = ss(0.36, 0.96, t), ang = open * 1.45;            // the swing angle (radians, 0 = shut)
      if (close <= 0.01) return;
      const half = E.W / 2 + 1, cosA = Math.cos(ang), grow = 1 + Math.sin(ang) * 0.22;           // the free edge comes nearer: taller
      // the light behind the doors: warm, strongest as the gap opens, gone by the end
      const spill = open > 0 ? bell(open, 0.35, 0.3) * (1 - ss(0.8, 1, t)) : 0;
      for (const side of [0, 1]) {
        g.save();
        if (side) { g.translate(E.W, 0); g.scale(-1, 1); }
        const x1 = half * cosA, top1 = -E.H * (grow - 1) / 2, bot1 = E.H + E.H * (grow - 1) / 2;
        g.globalAlpha = close;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(x1, top1); g.lineTo(x1, bot1); g.lineTo(0, E.H); g.closePath();
        const shade = 0.55 + 0.45 * cosA, gr = g.createLinearGradient(0, 0, Math.max(2, x1), 0);
        gr.addColorStop(0, col([214, 204, 182], 1, 0.62 * shade)); gr.addColorStop(0.6, col([232, 222, 200], 1, 0.82 * shade)); gr.addColorStop(1, col([240, 230, 208], 1, 0.95 * shade));
        g.fillStyle = gr; g.fill();
        if (x1 > 6) {
          // two inset panels and the veins, mapped onto the leaf (u across, v down)
          const P = (u, v) => [u * x1, lerp(v * E.H, lerp(top1, bot1, v), u)];
          g.strokeStyle = 'rgba(90,70,45,.28)'; g.lineWidth = 1.4;
          for (const [v0, v1] of [[0.08, 0.46], [0.54, 0.92]]) {
            const a = P(0.16, v0), b = P(0.84, v0), c = P(0.84, v1), d = P(0.16, v1);
            g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.stroke();
          }
          g.strokeStyle = 'rgba(120,100,80,.16)'; g.lineWidth = 1; g.beginPath();
          for (const v of S.veins) { const a = P(v.x * 0.9, v.y), b = P(Math.min(1, v.x * 0.9 + v.l * 0.4), v.y + v.a * 0.12); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, a[1] + 18, b[0], b[1]); }
          g.stroke();
          const ring = P(0.86, 0.5);                                                                    // a bronze ring pull
          g.strokeStyle = col([156, 107, 60], 0.9); g.lineWidth = 2.2 * grow; g.beginPath(); g.arc(ring[0], ring[1], 9 * grow * Math.max(0.3, cosA), 0, TAU); g.stroke();
          g.fillStyle = col(GOLD, 0.9 * (1 - open)); g.fillRect(x1 - 2, top1, 2, bot1 - top1);          // the gold seam while shut
        }
        g.restore();
      }
      if (spill > 0.01) {
        const gap = half * (1 - cosA), wash = g.createLinearGradient(E.cx - gap - 80, 0, E.cx + gap + 80, 0);
        wash.addColorStop(0, 'rgba(224,176,96,0)'); wash.addColorStop(0.5, col([255, 214, 150], 0.32 * spill)); wash.addColorStop(1, 'rgba(224,176,96,0)');
        g.globalCompositeOperation = 'lighter'; g.fillStyle = wash; g.fillRect(0, 0, E.W, E.H); norm(E);
      }
    },
  },

  // SCROLL: a papyrus scroll unrolls down over the screen (a shaded roller leads), the glyph is inked in the middle, then it rolls up
  scroll: {
    init: (E) => ({ fib: Array.from({ length: 26 }, () => ({ y: E.rnd(), a: 0.04 + E.rnd() * 0.08 })) }),
    draw(E, S, t) {
      const { g } = E, down = eo(t / 0.36), up = ei((t - 0.52) / 0.44);
      const top = E.H * up, bottom = E.H * down * 1.02;
      if (bottom - top < 1) return;
      const paper = g.createLinearGradient(0, 0, E.W, 0);
      paper.addColorStop(0, '#cdbb94'); paper.addColorStop(0.08, '#e6d6b2'); paper.addColorStop(0.5, '#efe2c2'); paper.addColorStop(0.92, '#e6d6b2'); paper.addColorStop(1, '#cdbb94');
      g.fillStyle = paper; g.fillRect(0, top, E.W, bottom - top);
      g.strokeStyle = 'rgba(120,96,60,.10)'; g.lineWidth = 1; g.beginPath();                          // the papyrus fibres
      for (const f of S.fib) { const y = f.y * E.H; if (y > top && y < bottom) { g.moveTo(0, y); g.lineTo(E.W, y + E.W * f.a * 0.2); } }
      g.stroke();
      g.fillStyle = col([201, 106, 74], 0.75); g.fillRect(14, top, 2, bottom - top); g.fillRect(E.W - 16, top, 2, bottom - top);   // terracotta margin rules
      const ink = ss(0.22, 0.4, t) * (1 - ss(0.5, 0.62, t));
      if (ink > 0.01 && E.glyph) {
        g.save(); g.globalAlpha = ink; g.fillStyle = '#3a2a1c'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `700 ${Math.round(E.u * 0.2)}px 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif`; g.fillText(E.glyph, E.cx, E.cy);
        g.restore();
      }
      const roller = (y) => {                                                                          // a wooden roller with bronze ends
        const rg = g.createLinearGradient(0, y - 9, 0, y + 9);
        rg.addColorStop(0, '#5a3d24'); rg.addColorStop(0.45, '#9c6b3c'); rg.addColorStop(1, '#3e2a18');
        g.fillStyle = rg; g.fillRect(0, y - 9, E.W, 18);
        g.fillStyle = col(GOLD, 0.95); g.fillRect(0, y - 11, 10, 22); g.fillRect(E.W - 10, y - 11, 10, 22);
        g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, y + 9, E.W, 6);
      };
      if (down < 1 || up <= 0) roller(Math.min(E.H - 9, bottom));
      if (up > 0) roller(Math.max(9, top));
    },
  },

  // FLYTHROUGH: the camera rushes down a colonnade toward a sunlit doorway; the doorway opens into the app
  flythrough: {
    init: (E) => ({ n: 6 }),
    draw(E, S, t) {
      const { g } = E, fade = ss(0, 0.14, t) * (1 - ss(0.84, 0.98, t));
      if (fade <= 0.01) return;
      g.globalAlpha = fade;
      const sky = g.createLinearGradient(0, 0, 0, E.H);
      sky.addColorStop(0, '#3a2c22'); sky.addColorStop(0.45, '#8a5c3a'); sky.addColorStop(0.55, '#5a4030'); sky.addColorStop(1, '#2a2018');
      g.fillStyle = sky; g.fillRect(0, 0, E.W, E.H);
      const travel = ei(t * 0.9) * 2.6;                                                              // the camera's distance along the colonnade
      const hy = E.cy, focal = E.u * 0.9;
      for (let i = S.n - 1; i >= 0; i--) {                                                              // far to near, both sides
        const z = i + 1.2 - (travel % 1);
        if (z <= 0.12) continue;
        const s = focal / (z * 3.2), w = 0.55 * s, h = 7 * s, x = 1.9 * s, depthFade = clamp(1.25 - z / S.n);
        for (const dir of [-1, 1]) {
          const cx = E.cx + dir * x;
          g.globalAlpha = fade * depthFade;
          marble(E, cx - w / 2, hy - h * 0.55, w, h);
        }
        g.globalAlpha = fade * depthFade * 0.9; g.fillStyle = '#d9cfbb'; g.fillRect(E.cx - x - w, hy - h * 0.55 - s * 0.35, x * 2 + w * 2, s * 0.35);   // the beam
      }
      g.globalAlpha = 1;
      const R = E.R * 1.15 * Math.pow(ss(0.42, 0.96, t), 1.4);                                          // the sunlit doorway: the app shows through it
      const door = E.u * 0.08 * (1 + travel * 0.6);
      add(E); const lg = g.createRadialGradient(E.cx, hy, 0, E.cx, hy, door * 3);
      lg.addColorStop(0, col([255, 222, 170], 0.55 * fade)); lg.addColorStop(1, 'rgba(255,222,170,0)'); g.fillStyle = lg; g.fillRect(0, 0, E.W, E.H); norm(E);
      iris(E, E.cx, hy, Math.max(R, door * ss(0.1, 0.3, t)), 0.25);
      g.globalAlpha = 1;
    },
  },

  // PLANNER: calendar tiles flip over in a wave, then flip away
  tiles: {
    init: (E) => { const s = E.W / 6; return { s, cols: 6, rows: Math.ceil(E.H / s) }; },
    draw(E, S, t) {
      const { g } = E, s = S.s;
      for (let j = 0; j < S.rows; j++) for (let i = 0; i < S.cols; i++) {
        const d = i + j, a = clamp((t - d * 0.012) / 0.22), b = clamp((t - 0.5 - d * 0.012) / 0.22);
        const sx = b > 0 ? Math.cos(b * Math.PI / 2) : Math.sin(a * Math.PI / 2);
        if (sx < 0.02) continue;
        const w = (s - 3) * sx, x = i * s + s / 2, y = j * s + s / 2;
        g.fillStyle = col(E.rgb, 1, 0.13 + 0.05 * hash(i, j)); g.fillRect(x - w / 2, y - s / 2 + 1.5, w, s - 3);
        g.fillStyle = col(E.rgb, 0.9, 0.55); g.fillRect(x - w / 2, y - s / 2 + 1.5, w, 7);
        add(E); g.fillStyle = col(E.rgb, 0.55, 1, 0.5); g.fillRect(x - w * 0.3, y, w * 0.6, 2); g.fillRect(x - w * 0.3, y + 9, w * 0.35, 2); norm(E);
      }
    },
  },

  // MIND: stars streak in from the dark, join into a constellation, then it flies past the camera
  constellation: {
    init(E) {
      const st = Array.from({ length: Math.round(54 * E.q) }, () => {
        const x = E.W * (0.04 + E.rnd() * 0.92), y = E.H * (0.04 + E.rnd() * 0.92), a = Math.atan2(y - E.cy, x - E.cx);
        return { x, y, sx: x + Math.cos(a) * E.R * 1.2, sy: y + Math.sin(a) * E.R * 1.2, ph: E.rnd() * 0.15, r: 1 + E.rnd() * 2.2 };
      });
      const pairs = [];
      st.forEach((a, i) => st.map((b, j) => [j, Math.hypot(a.x - b.x, a.y - b.y)]).filter((p) => p[0] > i && p[1] < E.u * 0.4).sort((p, q) => p[1] - q[1]).slice(0, 2).forEach((p) => pairs.push([i, p[0]])));
      return { st, pairs };
    },
    draw(E, S, t) {
      const { g } = E;
      veil(E, ss(0, 0.3, t) * (1 - ss(0.55, 0.92, t)), 0.1);
      const z = 1 + 3 * ei((t - 0.55) / 0.4), fade = 1 - ss(0.7, 0.95, t);
      g.save(); g.translate(E.cx, E.cy); g.scale(z, z); g.translate(-E.cx, -E.cy); add(E);
      const pos = S.st.map((s) => { const e = eo((t - s.ph) / 0.34); return [lerp(s.sx, s.x, e), lerp(s.sy, s.y, e), e]; });
      const la = ss(0.28, 0.46, t) * fade;
      if (la > 0.01) { g.strokeStyle = col(E.rgb, 0.55 * la, 1, 0.35); g.lineWidth = 1.1 / z; g.beginPath(); for (const [i, j] of S.pairs) { g.moveTo(pos[i][0], pos[i][1]); g.lineTo(pos[j][0], pos[j][1]); } g.stroke(); }
      S.st.forEach((s, i) => {
        const p = pos[i], e = p[2];
        if (e < 1) { g.strokeStyle = col(E.rgb, 0.7 * fade, 1, 0.5); g.lineWidth = s.r * 0.8; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(lerp(p[0], s.sx, 0.22 * (1 - e)), lerp(p[1], s.sy, 0.22 * (1 - e))); g.stroke(); }
        g.fillStyle = col(E.rgb, fade, 1, 0.75); g.beginPath(); g.arc(p[0], p[1], s.r, 0, TAU); g.fill();
        if (s.r > 2.4) { g.fillStyle = col(E.rgb, 0.18 * fade, 1, 0.2); g.beginPath(); g.arc(p[0], p[1], s.r * 4, 0, TAU); g.fill(); }
      });
      g.restore(); norm(E);
    },
  },

  // ARENA: a sunburst of golden rays, rank chevrons rise, shockwaves, then the arena opens through an iris
  sunburst: {
    init: () => ({}),
    draw(E, S, t) {
      const { g } = E;
      veil(E, ss(0, 0.2, t), 0.13);
      iris(E, E.cx, E.cy, E.R * 1.2 * ss(0.56, 0.95, t), 0.14);
      const a = ss(0.05, 0.3, t) * (1 - ss(0.62, 0.9, t)), n = 22;
      if (a > 0.01) {
        const gr = g.createRadialGradient(E.cx, E.cy, 0, E.cx, E.cy, E.R);
        gr.addColorStop(0, col(E.rgb, 0.7 * a, 1, 0.6)); gr.addColorStop(1, col(E.rgb, 0, 1, 0));
        add(E); g.fillStyle = gr;
        for (let i = 0; i < n; i++) { const th = (i / n) * TAU + t * 1.3, w = (TAU / n) * 0.26; g.beginPath(); g.moveTo(E.cx, E.cy); g.arc(E.cx, E.cy, E.R * 1.05, th - w, th + w); g.closePath(); g.fill(); }
        norm(E);
      }
      const ch = bell(t, 0.42, 0.15);
      if (ch > 0.02) {
        add(E); g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
        for (let k = 0; k < 3; k++) {
          const y = E.cy + E.u * (0.16 - k * 0.11) + (1 - eo(t / 0.4)) * E.u * 0.5;
          g.strokeStyle = col(E.rgb, ch * (1 - k * 0.2), 1, 0.55); g.beginPath(); g.moveTo(E.cx - E.u * 0.2, y - E.u * 0.07); g.lineTo(E.cx, y + E.u * 0.03); g.lineTo(E.cx + E.u * 0.2, y - E.u * 0.07); g.stroke();
        }
        norm(E);
      }
      ring(E, E.cx, E.cy, E.R * eo((t - 0.3) / 0.5), 0.85 * (1 - ss(0.55, 0.85, t)), 6);
      ring(E, E.cx, E.cy, E.R * eo((t - 0.4) / 0.5), 0.6 * (1 - ss(0.6, 0.9, t)), 4);
      flash(E, 0.6 * bell(t, 0.34, 0.05));
    },
  },

  // KALSHI: a probability line draws itself across, fills, and a scan line sweeps the cover away
  chart: {
    init(E) {
      let v = 0.55; const pts = Array.from({ length: 24 }, (_, i) => { v = clamp(v + (E.rnd() - 0.42) * 0.14, 0.08, 0.92); return [i / 23, v]; });
      return { pts };
    },
    draw(E, S, t) {
      const { g } = E;
      veil(E, ss(0.02, 0.4, t));
      const xr = (E.W + 60) * ss(0.5, 0.95, t) - 30;
      if (xr > -30) { const gr = g.createLinearGradient(xr - 70, 0, xr + 6, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(0, 0, Math.max(0, xr - 70), E.H); g.fillStyle = gr; g.fillRect(Math.max(0, xr - 70), 0, 76, E.H); g.globalCompositeOperation = 'source-over'; }
      g.save(); g.beginPath(); g.rect(Math.max(0, xr + 6), 0, E.W, E.H); g.clip();
      const p = ss(0.04, 0.46, t) * (S.pts.length - 1), Y = (v) => E.H * (0.78 - v * 0.55), X = (u) => E.W * (0.04 + u * 0.92);
      add(E); g.strokeStyle = col(E.rgb, 0.12, 1, 0.3); g.lineWidth = 1; g.beginPath();
      for (let i = 1; i < 7; i++) { g.moveTo(0, E.H * i / 7); g.lineTo(E.W, E.H * i / 7); } g.stroke();
      const line = []; for (let i = 0; i <= Math.floor(p); i++) line.push([X(S.pts[i][0]), Y(S.pts[i][1])]);
      if (p < S.pts.length - 1 && line.length) { const a = S.pts[Math.floor(p)], b = S.pts[Math.floor(p) + 1], f = p - Math.floor(p); line.push([X(lerp(a[0], b[0], f)), Y(lerp(a[1], b[1], f))]); }
      if (line.length > 1) {
        const fill = g.createLinearGradient(0, E.H * 0.2, 0, E.H); fill.addColorStop(0, col(E.rgb, 0.5)); fill.addColorStop(1, col(E.rgb, 0));
        g.fillStyle = fill; g.beginPath(); g.moveTo(line[0][0], E.H); line.forEach((q) => g.lineTo(q[0], q[1])); g.lineTo(line[line.length - 1][0], E.H); g.closePath(); g.fill();
        g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = col(E.rgb, 0.18); polyline(g, line); g.lineWidth = 3; g.strokeStyle = col(E.rgb, 1, 1, 0.55); polyline(g, line);
        const hd = line[line.length - 1]; g.fillStyle = '#fff'; g.beginPath(); g.arc(hd[0], hd[1], 5, 0, TAU); g.fill();
      }
      norm(E); g.restore();
      if (xr > -20 && xr < E.W + 20) { add(E); g.fillStyle = col(E.rgb, 0.9, 1, 0.7); g.fillRect(xr, 0, 2, E.H); const gl = g.createLinearGradient(xr - 30, 0, xr + 30, 0); gl.addColorStop(0, col(E.rgb, 0)); gl.addColorStop(0.5, col(E.rgb, 0.35, 1, 0.3)); gl.addColorStop(1, col(E.rgb, 0)); g.fillStyle = gl; g.fillRect(xr - 30, 0, 60, E.H); norm(E); }
    },
  },

  // TYCHE: a sea surge, wave on wave, rises over the screen and falls back
  waves: {
    init: () => ({ L: 5 }),
    draw(E, S, t) {
      const { g } = E, H = E.H, amp = E.u * 0.045;
      for (let k = 0; k < S.L; k++) {
        const lvl = H * 1.06 - H * 1.3 * eo((t - k * 0.025) / 0.46) + H * 1.5 * ss(0.52 + k * 0.02, 0.97, t);
        if (lvl > H + amp * 2) continue;
        const f = 0.02 * (1 + k * 0.15), sp = 9 * (1 + k * 0.2);
        const y = (x) => lvl + Math.sin(x * f + t * sp + k * 1.7) * amp * (1 - k * 0.12) + Math.sin(x * 0.045 - t * 13 + k) * amp * 0.4;
        g.fillStyle = col(E.rgb, 1, 0.14 + 0.1 * (S.L - k) / S.L, 0.04 * (S.L - k)); g.beginPath(); g.moveTo(0, H + 10);
        for (let x = 0; x <= E.W + 12; x += 12) g.lineTo(x, y(x)); g.lineTo(E.W, H + 10); g.closePath(); g.fill();
        if (k < 3) { add(E); g.strokeStyle = col(E.rgb, 0.55 - k * 0.12, 1, 0.65); g.lineWidth = 3 - k * 0.6; g.beginPath(); for (let x = 0; x <= E.W + 12; x += 12) (x ? g.lineTo(x, y(x)) : g.moveTo(x, y(x))); g.stroke(); norm(E); }
      }
      const top0 = H * 1.06 - H * 1.3 * eo(t / 0.46) + H * 1.5 * ss(0.52, 0.97, t);               // light caustics drifting through the water
      if (top0 < H - 20) {
        add(E); g.lineWidth = 2; g.strokeStyle = col(E.rgb, 0.2, 1, 0.5);
        for (let c = 0; c < 7; c++) { g.beginPath(); for (let x = 0; x <= E.W + 14; x += 14) { const yy = top0 + amp * 3 + (H - top0 - amp * 3) * (0.08 + c * 0.14) + Math.sin(x * 0.03 + t * 6 + c * 2.1) * 12; x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
        norm(E);
      }
    },
  },

  // HERMES: a golden slab whips across, speed lines and feathers in its wake
  dash: {
    init: (E) => ({
      sp: Array.from({ length: Math.round(56 * E.q) }, () => ({ y: E.rnd(), ph: E.rnd(), l: 0.1 + E.rnd() * 0.3 })),
      fe: Array.from({ length: 12 }, () => ({ y: E.rnd(), o: E.rnd() * 0.25, s: 0.6 + E.rnd() * 0.8 })),
    }),
    draw(E, S, t) {
      const { g } = E, sk = E.H * 0.35, span = E.W + sk * 2.4;
      const f = -sk * 1.2 + span * eo(t / 0.5), b = -sk * 1.2 + span * ei((t - 0.36) / 0.56);
      if (f - b > 1) {
        const gr = g.createLinearGradient(b, 0, f, 0); gr.addColorStop(0, col(E.rgb, 1, 0.12)); gr.addColorStop(1, col(E.rgb, 1, 0.34));
        g.fillStyle = gr; g.beginPath(); g.moveTo(b - sk / 2, 0); g.lineTo(f - sk / 2, 0); g.lineTo(f + sk / 2, E.H); g.lineTo(b + sk / 2, E.H); g.closePath(); g.fill();
        add(E); g.lineCap = 'round';
        for (const s of S.sp) {
          const x = lerp(b, f, fract(s.ph + t * 2.6)) + (s.y - 0.5) * -sk, len = E.W * s.l;
          g.strokeStyle = col(E.rgb, 0.7, 1, 0.6); g.lineWidth = 2; g.beginPath(); g.moveTo(x - len, s.y * E.H); g.lineTo(x, s.y * E.H); g.stroke();
        }
        g.strokeStyle = col(E.rgb, 0.95, 1, 0.8); g.lineWidth = 5; g.beginPath(); g.moveTo(f - sk / 2, 0); g.lineTo(f + sk / 2, E.H); g.stroke();
        norm(E);
        for (const w of S.fe) { const fx = f + (w.y - 0.5) * -sk - E.W * w.o; if (fx < -40 || fx > E.W + 40) continue; leaf(g, fx, w.y * E.H, E.u * 0.07 * w.s, Math.PI / 2 + 0.2, col(E.rgb, 0.8, 1, 0.55), col(E.rgb, 0.8, 1, 0.8)); }
      }
    },
  },

  // BRIDGE: a cable arch of light is strung across, the two decks meet, then fold up like a drawbridge
  span: {
    init: () => ({}),
    draw(E, S, t) {
      const { g } = E, close = eo(t / 0.3), o = ss(0.5, 0.92, t), xi = (E.W / 2 + 2) * close * (1 - o * o), a = E.H * 0.5 * Math.pow(o, 1.2);
      if (xi > 1) for (const side of [0, 1]) {
        g.save(); if (side) { g.translate(E.W, 0); g.scale(-1, 1); }
        const gr = g.createLinearGradient(0, 0, xi, 0); gr.addColorStop(0, col(E.rgb, 1, 0.1)); gr.addColorStop(1, col(E.rgb, 1, 0.26));
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(xi, a); g.lineTo(xi, E.H - a); g.lineTo(0, E.H); g.closePath(); g.fill();
        add(E); g.strokeStyle = col(E.rgb, 0.9, 1, 0.5); g.lineWidth = 2.5; g.beginPath(); g.moveTo(xi, a); g.lineTo(xi, E.H - a); g.stroke(); norm(E);
        g.restore();
      }
      const cab = ss(0.02, 0.3, t) * (1 - ss(0.5, 0.78, t)), dk = E.H * 0.58;
      if (cab > 0.01) {
        add(E); g.lineWidth = 3; g.strokeStyle = col(E.rgb, cab, 1, 0.6);
        const prog = ss(0.02, 0.3, t); g.beginPath();
        for (let i = 0; i <= 40 * prog; i++) { const u = i / 40, x = u * E.W, y = dk - Math.sin(u * Math.PI) * E.H * 0.42; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.lineWidth = 1.4; g.beginPath();
        for (let i = 1; i < 14; i++) { const u = i / 14; if (u > prog) break; const x = u * E.W, y = dk - Math.sin(u * Math.PI) * E.H * 0.42; g.moveTo(x, y); g.lineTo(x, dk); }
        g.moveTo(0, dk); g.lineTo(E.W * prog, dk); g.stroke();
        for (let i = 1; i < 14; i++) { const u = i / 14; if (u > prog) break; g.fillStyle = col(E.rgb, cab, 1, 0.8); g.beginPath(); g.arc(u * E.W, dk - Math.sin(u * Math.PI) * E.H * 0.42, 3, 0, TAU); g.fill(); }
        norm(E);
      }
    },
  },

  // ARES: blade cuts flash across, then diagonal steel strips slam shut and split apart
  slash: {
    init(E) {
      return {
        cuts: Array.from({ length: 5 }, (_, i) => ({ y: (i - 2) * E.u * 0.2 + (E.rnd() - 0.5) * 30, a: (E.rnd() - 0.5) * 0.5, t0: 0.01 + i * 0.025 })),
        sp: Array.from({ length: Math.round(36 * E.q) }, () => ({ x: (E.rnd() - 0.5) * E.W, a: E.rnd() * TAU, v: 0.4 + E.rnd() * 1.1 })),
      };
    },
    draw(E, S, t) {
      const { g } = E, shake = bell(t, 0.2, 0.05) * 7;
      g.save(); g.translate((hash(Math.floor(t * 90)) - 0.5) * shake, (hash(Math.floor(t * 90), 1) - 0.5) * shake);
      g.translate(E.cx, E.cy); g.rotate(-0.32);
      const Ln = Math.hypot(E.W, E.H) + 40, n = 7, sw = Ln / n;
      for (let i = 0; i < n; i++) {
        const dir = i % 2 ? 1 : -1, inP = ei((t - 0.12 - i * 0.012) / 0.14), outP = ei((t - 0.56 - i * 0.015) / 0.3), y = dir * Ln * (1 - inP) - dir * Ln * outP;
        if (Math.abs(y) >= Ln) continue;
        const gr = g.createLinearGradient(-Ln / 2 + i * sw, 0, -Ln / 2 + (i + 1) * sw, 0); gr.addColorStop(0, col(E.rgb, 1, 0.1)); gr.addColorStop(0.5, col(E.rgb, 1, 0.24)); gr.addColorStop(1, col(E.rgb, 1, 0.09));
        g.fillStyle = gr; g.fillRect(-Ln / 2 + i * sw, y - Ln / 2, sw + 1, Ln);
        add(E); g.fillStyle = col(E.rgb, 0.8, 1, 0.5); g.fillRect(-Ln / 2 + i * sw, y - Ln / 2, 2, Ln); norm(E);
      }
      g.restore();
      add(E); g.lineCap = 'round';
      for (const c of S.cuts) {
        const k = (t - c.t0) / 0.1; if (k < 0 || k > 1.6) continue;
        const len = E.W * 1.3 * eo(k), a = 1 - ss(1, 1.6, k);
        g.save(); g.translate(E.cx, E.cy + c.y); g.rotate(-0.5 + c.a); g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 3; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
        g.strokeStyle = col(E.rgb, 0.35 * a); g.lineWidth = 12; g.stroke(); g.restore();
      }
      const sp = t - 0.2;
      if (sp > 0 && sp < 0.5) for (const s of S.sp) { const d = sp * s.v * E.u * 1.5, x = E.cx + s.x * 0.2 + Math.cos(s.a) * d, y = E.cy + Math.sin(s.a) * d + sp * sp * E.H * 1.2; g.strokeStyle = col(E.rgb, 1 - sp * 2, 1, 0.7); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(s.a) * 8, y - Math.sin(s.a) * 8); g.stroke(); }
      norm(E);
      flash(E, 0.6 * bell(t, 0.2, 0.025), E.cx, E.cy, E.R, 0.6);
    },
  },

  // PLUTUS: golden coins pour down the screen, the cover drains away behind them
  coins: {
    init: (E) => ({ c: Array.from({ length: Math.round(46 * E.q) }, () => ({ x: E.rnd(), ph: E.rnd() * 0.3, r: E.rnd(), s: 0.7 + E.rnd() * 0.6 })) }),
    draw(E, S, t) {
      const { g } = E, G = 8.8 * E.H, gold = mixc([245, 196, 60], E.rgb, 0.3);
      veil(E, ss(0.06, 0.36, t), 0.12);
      const ye = E.H * 1.08 * ss(0.54, 0.96, t); if (ye > 2) { const gr = g.createLinearGradient(0, ye - 80, 0, ye); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(0, 0, E.W, Math.max(0, ye - 80)); g.fillStyle = gr; g.fillRect(0, Math.max(0, ye - 80), E.W, 80); g.globalCompositeOperation = 'source-over'; }
      for (const c of S.c) {
        const tau = t - c.ph; if (tau <= 0) continue;
        const y = -40 + 0.5 * G * tau * tau; if (y > E.H + 40) continue;
        const rot = c.r * 10 + tau * 16, wx = Math.abs(Math.cos(rot)), sz = E.u * 0.075 * c.s;
        g.fillStyle = col(gold, 1, 0.55 + 0.45 * wx); g.beginPath(); g.ellipse(c.x * E.W, y, sz * Math.max(0.12, wx), sz, 0, 0, TAU); g.fill();
        g.strokeStyle = col(gold, 1, 1, 0.55); g.lineWidth = 2; g.stroke();
        g.strokeStyle = col(gold, 0.8, 0.6); g.lineWidth = 1.5; g.beginPath(); g.ellipse(c.x * E.W, y, sz * 0.62 * Math.max(0.1, wx), sz * 0.62, 0, 0, TAU); g.stroke();
      }
    },
  },

  // ATHENA: particles gather into the owl (the glyph), it glows, bursts, and opens the app
  assemble: {
    init(E) {
      const pts = glyphPoints(E.glyph, Math.round(150 * E.q), E.rnd), gs = (E.u * 0.5) / 96;
      return { p: pts.map((q) => { const a = E.rnd() * TAU, r = E.R * (0.6 + E.rnd() * 0.6); return { tx: E.cx + q[0] * gs, ty: E.cy + q[1] * gs, sx: E.cx + Math.cos(a) * r, sy: E.cy + Math.sin(a) * r, ph: E.rnd() * 0.2, a }; }) };
    },
    draw(E, S, t) {
      const { g } = E;
      veil(E, ss(0, 0.25, t) * 0.92, 0.1);
      iris(E, E.cx, E.cy, E.R * 1.2 * ss(0.62, 0.95, t), 0.14);
      add(E);
      for (let k = 0; k < 3; k++) { const r = E.u * (0.12 + k * 0.1) * (0.6 + 0.4 * eo(t / 0.4)); g.strokeStyle = col(E.rgb, 0.2 * (1 - ss(0.55, 0.8, t)), 1, 0.3); g.lineWidth = 1.4; g.beginPath(); g.arc(E.cx, E.cy, r, 0, TAU); g.stroke(); }
      for (const p of S.p) {
        const e = eo((t - p.ph) / 0.36), b = Math.max(0, t - 0.64), x = lerp(p.sx, p.tx, e) + Math.cos(p.a) * b * E.R * 3, y = lerp(p.sy, p.ty, e) + Math.sin(p.a) * b * E.R * 3;
        g.fillStyle = col(E.rgb, (0.35 + 0.65 * e) * (1 - ss(0.7, 0.92, t)), 1, 0.7); g.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
      }
      const ga = ss(0.4, 0.54, t) * (1 - ss(0.62, 0.78, t));
      if (ga > 0.01) { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(E.u * 0.5)}px system-ui, -apple-system, sans-serif`; g.fillStyle = col(E.rgb, 0.3 * ga, 1, 0.6); g.fillText(E.glyph || '', E.cx, E.cy + E.u * 0.02); g.fillText(E.glyph || '', E.cx, E.cy + E.u * 0.02); }
      norm(E);
      flash(E, 0.5 * bell(t, 0.62, 0.05));
    },
  },

  // FORUM: arch after arch rushes past the camera, and the last one opens onto the app
  pushthrough: {
    init: () => ({}),
    draw(E, S, t) {
      const { g } = E, N = 9;
      veil(E, 0.96 * ss(0, 0.12, t), 0.1);
      const sc = 0.06 * Math.exp(5.3 * ss(0.3, 0.96, t));
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,1)'; archPath(g, E.cx, E.cy + E.u * 0.04, E.u * 0.55 * sc, E.u * 0.85 * sc); g.fill(); g.globalCompositeOperation = 'source-over';
      add(E); g.lineJoin = 'round';
      for (let i = 0; i < N; i++) {
        const z = fract(i / N + t * t * 3.2 + t * 0.7), s = 0.06 * Math.exp(5.3 * z), a = Math.pow(1 - z, 0.6) * ss(0, 0.1, z) * (1 - ss(0.82, 0.96, t));
        if (a < 0.02) continue;
        g.lineWidth = 1.5 + z * 5; g.strokeStyle = col(E.rgb, a, 1, 0.45); archPath(g, E.cx, E.cy + E.u * 0.04, E.u * 0.55 * s, E.u * 0.85 * s); g.stroke();
      }
      norm(E);
      flash(E, 0.28 * (1 - ss(0.3, 0.9, t)));
    },
  },

  // LABYRINTH: the maze walls light up, a runner spirals to the heart, the cells fall away from the middle out
  maze: {
    init(E) {
      const cols = 8, s = E.W / cols, rows = Math.ceil(E.H / s), order = [];
      let x0 = 0, y0 = 0, x1 = cols - 1, y1 = rows - 1;                       // rectangular spiral, outside in
      while (x0 <= x1 && y0 <= y1) {
        for (let x = x0; x <= x1; x++) order.push([x, y0]);
        for (let y = y0 + 1; y <= y1; y++) order.push([x1, y]);
        if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) order.push([x, y1]);
        if (x0 < x1) for (let y = y1 - 1; y > y0; y--) order.push([x0, y]);
        x0++; y0++; x1--; y1--;
      }
      const idx = {}; order.forEach((c, i) => { idx[c[0] + ',' + c[1]] = i; });
      return { cols, rows, s, order, idx };
    },
    draw(E, S, t) {
      const { g } = E, s = S.s, len = S.order.length;
      veil(E, ss(0, 0.14, t) * 0.96, 0.08);
      for (let j = 0; j < S.rows; j++) for (let i = 0; i < S.cols; i++) {
        const k = S.idx[i + ',' + j], tr = 0.5 + 0.4 * (1 - k / len) + hash(i, j) * 0.04, a = clamp((t - tr) / 0.07);
        if (a > 0) cutRect(E, i * s - 0.5, j * s - 0.5, s + 1, s + 1, a);
      }
      add(E); g.lineWidth = 1.4; g.strokeStyle = col(E.rgb, 0.5 * (1 - ss(0.5, 0.8, t)), 1, 0.2); g.beginPath();
      for (let j = 0; j < S.rows; j++) for (let i = 0; i < S.cols; i++) {
        const k = S.idx[i + ',' + j]; if (t > 0.5 + 0.4 * (1 - k / len) + 0.04) continue;
        if (hash(i, j) > 0.42) { g.moveTo((i + 1) * s, j * s); g.lineTo((i + 1) * s, (j + 1) * s); }
        if (hash(j, i + 7) > 0.42) { g.moveTo(i * s, (j + 1) * s); g.lineTo((i + 1) * s, (j + 1) * s); }
      }
      g.stroke();
      const run = ss(0.04, 0.5, t) * (len - 1), n = Math.floor(run);
      g.lineWidth = 3.4; g.lineJoin = 'round'; g.strokeStyle = col(E.rgb, 0.9 * (1 - ss(0.5, 0.7, t)), 1, 0.55); g.beginPath();
      for (let i = 0; i <= n; i++) { const c = S.order[i], x = (c[0] + 0.5) * s, y = (c[1] + 0.5) * s; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      const hd = S.order[n]; g.fillStyle = col(E.rgb, 1 - ss(0.5, 0.7, t), 1, 0.9); g.beginPath(); g.arc((hd[0] + 0.5) * s, (hd[1] + 0.5) * s, 6, 0, TAU); g.fill();
      norm(E);
    },
  },

  // ARGUS: a hundred eyes open, all turn to the middle, then they close
  eyes: {
    init: (E) => ({ cols: 4, rows: 9, ph: Array.from({ length: 36 }, () => E.rnd()) }),
    draw(E, S, t) {
      const { g } = E, sx = E.W / S.cols, sy = E.H / S.rows;
      veil(E, ss(0, 0.2, t) * (1 - ss(0.62, 0.95, t)), 0.08);
      for (let j = 0; j < S.rows; j++) for (let i = 0; i < S.cols; i++) {
        const p = S.ph[j * S.cols + i], op = ss(0.04 + p * 0.2, 0.3 + p * 0.2, t) * (1 - ss(0.56 + p * 0.12, 0.8 + p * 0.12, t));
        if (op < 0.03) continue;
        const x = (i + 0.5) * sx, y = (j + 0.5) * sy, w = sx * 0.42, h = sy * 0.3 * op;
        g.save(); g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - h * 1.35, x + w, y); g.quadraticCurveTo(x, y + h * 1.35, x - w, y); g.closePath();
        g.fillStyle = col(E.rgb, 0.95, 0.25, 0.78); g.fill(); g.clip();
        const look = ss(0.34, 0.5, t), px = x + clamp((E.cx - x) * 0.002, -1, 1) * w * 0.5 * look, py = y + clamp((E.cy - y) * 0.002, -1, 1) * h * 0.5 * look;
        g.fillStyle = col(E.rgb, 1, 1, 0); g.beginPath(); g.arc(px, py, Math.min(h, w) * 0.95, 0, TAU); g.fill();
        g.fillStyle = '#04040a'; g.beginPath(); g.arc(px, py, Math.min(h, w) * 0.46, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(px - h * 0.2, py - h * 0.22, Math.max(1.2, h * 0.14), 0, TAU); g.fill();
        g.restore();
        add(E); g.strokeStyle = col(E.rgb, 0.7, 1, 0.4); g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - h * 1.35, x + w, y); g.quadraticCurveTo(x, y + h * 1.35, x - w, y); g.stroke(); norm(E);
      }
    },
  },

  // NEMESIS: a crack runs through the screen and the shards fall away
  shatter: {
    init(E) {
      const rs = [0, 0.12, 0.28, 0.5, 0.8, 1.3], K = 12, V = rs.map((r, j) => Array.from({ length: K }, (_, k) => { const a = ((k + (j ? (E.rnd() - 0.5) * 0.6 : 0)) / K) * TAU; return [Math.cos(a) * rs[j] * E.R * (1 + (j ? (E.rnd() - 0.5) * 0.18 : 0)), Math.sin(a) * rs[j] * E.R * (1 + (j ? (E.rnd() - 0.5) * 0.18 : 0))]; }));
      const sh = [];
      for (let j = 0; j < rs.length - 1; j++) for (let k = 0; k < K; k++) {
        const pts = [V[j][k], V[j][(k + 1) % K], V[j + 1][(k + 1) % K], V[j + 1][k]], cxs = pts.reduce((s, p) => s + p[0], 0) / 4, cys = pts.reduce((s, p) => s + p[1], 0) / 4;
        sh.push({ pts, cx: cxs, cy: cys, td: 0.2 + 0.07 * j + E.rnd() * 0.05, vx: (E.rnd() - 0.5) * 0.8, rot: (E.rnd() - 0.5) * 3, j, k });
      }
      return { sh };
    },
    draw(E, S, t) {
      const { g } = E, a = ss(0, 0.08, t);
      for (const s of S.sh) {
        const tau = clamp((t - s.td) / 0.42), al = a * (1 - ss(0.7, 1, tau)); if (al < 0.01) continue;
        g.save(); g.translate(E.cx + s.cx + s.vx * tau * E.R * 0.6, E.cy + s.cy + tau * tau * E.H * 1.5); g.rotate(s.rot * tau); g.globalAlpha = al;
        g.fillStyle = col(E.rgb, 1, 0.09 + 0.05 * hash(s.j, s.k)); g.beginPath(); s.pts.forEach((p, i) => (i ? g.lineTo(p[0] - s.cx, p[1] - s.cy) : g.moveTo(p[0] - s.cx, p[1] - s.cy))); g.closePath(); g.fill();
        g.strokeStyle = col(E.rgb, 0.9, 1, 0.35); g.lineWidth = 1.6 * (1 - tau * 0.5); g.stroke(); g.restore();
      }
      norm(E);
      flash(E, 0.9 * bell(t, 0.08, 0.025), E.cx, E.cy, E.R * 0.7, 0.8);
      ring(E, E.cx, E.cy, E.R * eo((t - 0.08) / 0.4), 0.7 * (1 - ss(0.2, 0.5, t)), 3);
    },
  },

  // CHRONOS: a clock ring spins up, its hand comes to rest at twelve, and a clockwise sweep wipes the cover away
  clock: {
    init: () => ({}),
    draw(E, S, t) {
      const { g } = E, th = TAU * ss(0.52, 0.95, t), a0 = -Math.PI / 2;
      veil(E, ss(0, 0.2, t), 0.1);
      if (th > 0.01) { g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,1)'; g.beginPath(); g.moveTo(E.cx, E.cy); g.arc(E.cx, E.cy, E.R * 1.15, a0, a0 + th); g.closePath(); g.fill(); g.globalCompositeOperation = 'source-over'; }
      g.save(); g.beginPath(); g.moveTo(E.cx, E.cy); g.arc(E.cx, E.cy, E.R * 1.2, a0 + th, a0 + TAU); g.closePath(); g.clip();
      const r = E.u * 0.36, spin = TAU * 3 * eo(t / 0.55), vis = 1 - ss(0.9, 1, t);
      add(E); g.lineCap = 'round';
      g.strokeStyle = col(E.rgb, 0.8 * vis, 1, 0.4); g.lineWidth = 3; g.beginPath(); g.arc(E.cx, E.cy, r, 0, TAU); g.stroke();
      g.lineWidth = 1.6; g.beginPath();
      for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU, l = i % 5 ? 6 : 14; g.moveTo(E.cx + Math.cos(a) * (r - 4), E.cy + Math.sin(a) * (r - 4)); g.lineTo(E.cx + Math.cos(a) * (r - 4 - l), E.cy + Math.sin(a) * (r - 4 - l)); }
      g.stroke();
      g.strokeStyle = col(E.rgb, vis, 1, 0.7); g.lineWidth = 4; g.beginPath(); g.moveTo(E.cx, E.cy); g.lineTo(E.cx + Math.cos(a0 + spin) * r * 0.86, E.cy + Math.sin(a0 + spin) * r * 0.86); g.stroke();
      g.lineWidth = 6; g.beginPath(); g.moveTo(E.cx, E.cy); g.lineTo(E.cx + Math.cos(a0 + spin / 12) * r * 0.55, E.cy + Math.sin(a0 + spin / 12) * r * 0.55); g.stroke();
      g.fillStyle = `rgba(255,255,255,${vis})`; g.beginPath(); g.arc(E.cx, E.cy, 5, 0, TAU); g.fill();
      norm(E); g.restore();
      if (th > 0.01 && th < TAU - 0.01) { add(E); g.strokeStyle = col(E.rgb, 0.9, 1, 0.7); g.lineWidth = 3; g.beginPath(); g.moveTo(E.cx, E.cy); g.lineTo(E.cx + Math.cos(a0 + th) * E.R * 1.15, E.cy + Math.sin(a0 + th) * E.R * 1.15); g.stroke(); norm(E); }
    },
  },

  // HEPHAESTUS: two iron plates slam together, sparks fly, the seam glows and they part
  anvil: {
    init: (E) => ({ sp: Array.from({ length: Math.round(70 * E.q) }, () => ({ a: -Math.PI * (0.05 + E.rnd() * 0.9) + (E.rnd() < 0.5 ? 0 : Math.PI * 0.1), v: 0.3 + E.rnd() * 1.2 })) }),
    draw(E, S, t) {
      const { g } = E, P = ei((t - 0.04) / 0.18), o = ss(0.52, 0.9, t), shake = bell(t, 0.23, 0.04) * 8;
      g.save(); g.translate((hash(Math.floor(t * 80)) - 0.5) * shake, (hash(Math.floor(t * 80), 3) - 0.5) * shake);
      const hh = (E.H / 2 + 2) * P;
      if (hh > 1) for (const side of [0, 1]) {
        const py = side ? E.H - hh + o * (E.H / 2) : hh - (E.H / 2 + 2) - o * (E.H / 2);
        const gr = g.createLinearGradient(0, 0, E.W, 0); gr.addColorStop(0, col(E.rgb, 1, 0.12)); gr.addColorStop(0.5, col(E.rgb, 1, 0.26)); gr.addColorStop(1, col(E.rgb, 1, 0.12));
        g.fillStyle = gr; g.fillRect(0, py, E.W, E.H / 2 + 2);
        g.fillStyle = col(E.rgb, 0.6, 0.6);
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(E.W * (i + 0.5) / 6, side ? py + 14 : py + E.H / 2 + 2 - 14, 3, 0, TAU); g.fill(); }
      }
      g.restore();
      const seam = ss(0.2, 0.26, t) * (1 - ss(0.5, 0.56, t)) + o * (1 - ss(0.82, 0.96, t));
      if (seam > 0.01) { const sh = 6 + o * E.H * 0.5, gr = g.createLinearGradient(0, E.cy - sh, 0, E.cy + sh); gr.addColorStop(0, col(E.rgb, 0, 1, 0.6)); gr.addColorStop(0.5, col(E.rgb, 0.95 * seam, 1, 0.7)); gr.addColorStop(1, col(E.rgb, 0, 1, 0.6)); add(E); g.fillStyle = gr; g.fillRect(0, E.cy - sh, E.W, sh * 2); norm(E); }
      const tau = t - 0.22;
      if (tau > 0 && tau < 0.55) {
        add(E); g.lineCap = 'round';
        for (const s of S.sp) { const d = tau * s.v * E.u * 1.6, x = E.cx + Math.cos(s.a) * d, y = E.cy + Math.sin(s.a) * d + tau * tau * E.H * 1.4; g.strokeStyle = col(mixc([255, 190, 90], E.rgb, 0.4), 1 - tau / 0.55, 1, 0.3); g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(s.a) * 9, y - Math.sin(s.a) * 9 - 3); g.stroke(); }
        norm(E);
      }
      ring(E, E.cx, E.cy, E.R * eo((t - 0.22) / 0.4), 0.8 * (1 - ss(0.3, 0.6, t)), 7);
      flash(E, 0.7 * bell(t, 0.225, 0.02), E.cx, E.cy, E.R, 0.7);
    },
  },
};

// ------------------------------------------------------------------------------------------------------------------ the engine
const CSS = `
.jtrans { position: fixed; inset: 0; z-index: 9000; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; }
.jtrans canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.jtrans-fade { position: fixed; inset: 0; z-index: 9000; pointer-events: none; opacity: .6; transition: opacity var(--jt-fade, .25s) ease-out;
  background: radial-gradient(circle at 50% 46%, var(--jt-c) 0%, #14110e 62%); }
.jtrans-fade.flat { background: var(--jt-c); opacity: .45; }
.jtrans-name { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; pointer-events: none; opacity: 0;
  font: 600 15px/1.4 "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; letter-spacing: .06em; color: #f3ece0;
  animation: jtrans-name var(--jt-ms, 900ms) cubic-bezier(.3, .7, .2, 1) forwards; }
.jtrans-name b { display: block; font-size: 34px; letter-spacing: .08em; margin-bottom: 6px; }
@keyframes jtrans-name { 0% { opacity: 0; transform: translateY(-50%) scale(.7); } 32% { opacity: 1; } 60% { opacity: 1; transform: translateY(-50%) scale(1.02); }
  100% { opacity: 0; transform: translateY(-50%) scale(1.4); } }
`;
const state = (window.__jarvisTransitions = { runs: 0, id: '', kind: '', from: '', tier: '', mode: '', ms: 0, dur: 0, active: false, frames: 0, cues: [], error: '', px: 0, paintMs: 0 });
let canvas = null, g2 = null, wrap = null, raf = 0, wd = 0, t0 = 0, dur = 0, E = null, S = null, entry = null, cues = [], onDone = null;

const fx = () => document.documentElement.dataset.fx;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
/** 'full' | 'lite' (3D effects Low / Off: a short colour fade) | 'static' (reduced motion: a flat colour fade, nothing moves) */
export const tier = () => (reducedMotion() ? 'static' : fx() === 'low' || fx() === 'off' ? 'lite' : 'full');

function css() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
function cue(name) {                                              // the kit's sound (+ its haptics), guarded; else a vibration where there is one
  try {
    if (window.OLYMPUS_QUIET && window.OLYMPUS_QUIET()) return false;
    if (window.jarvisSfx) { if (window.jarvisSfx(name)) return true; }
    else { const k = window.OLYMPUS_SFX; if (k && k.play(name)) return true; }
    const k = window.OLYMPUS_SFX, muted = k && k.state && k.state().muted;
    if (!muted && navigator.vibrate) return !!navigator.vibrate(name === 'thunder' ? [30, 40, 60] : name === 'rankup' ? [15, 40, 15] : 5);
  } catch (e) { /* the sound layer is optional */ }
  return false;
}

function setup() {
  if (canvas && g2) return true;
  try {
    canvas = document.createElement('canvas'); g2 = canvas.getContext('2d');
    if (!g2) { canvas = null; return false; }
    return true;
  } catch (e) { canvas = g2 = null; return false; }
}
function frame(now) {
  raf = 0;
  if (!state.active) return;
  const t = clamp((now - t0) / dur);
  try {
    paint(t);
    state.frames++;
    while (cues.length && cues[0][0] <= t) { const c = cues.shift(); state.cues.push(c[1]); cue(c[1]); }
  } catch (e) { state.error = String(e && e.message || e); finish(); return; }
  if (t >= 1) { finish(); return; }
  raf = requestAnimationFrame(frame);
}
function paint(t) {
  const g = g2;
  g.setTransform(E.d, 0, 0, E.d, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, E.W, E.H);
  const p0 = performance.now();
  if (t < 0.992) KINDS[entry.kind].draw(E, S, t, entry);
  if (t < 0.992 && E.dust) dust(E, t);
  state.paintMs = Math.round((performance.now() - p0) * 10) / 10;
}
function finish() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (wd) clearTimeout(wd);
  wd = 0;
  const was = state.active, ms = was ? Math.round(performance.now() - t0) : 0;
  if (was) state.ms = ms;
  state.active = false;
  if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
  wrap = null;
  if (canvas) { canvas.width = canvas.height = 1; state.px = 1; }  // the full-screen backing store goes back
  E = S = null; cues = [];
  const cb = onDone; onDone = null;
  if (was && cb) { try { cb(ms); } catch (e) { /* the caller's hook */ } }
}
const skip = (e) => { if (e && e.preventDefault) e.preventDefault(); finish(); };

function fade(color, kind) {                                       // LITE: 250 ms colour fade; reduced motion: 200 ms flat colour, nothing moves
  css();
  const f = document.createElement('div'), ms = kind === 'static' ? FADE_STATIC : FADE_LITE;
  f.className = 'jportal-fade jtrans-fade' + (kind === 'static' ? ' flat' : ''); f.setAttribute('aria-hidden', 'true');
  f.style.setProperty('--jt-c', color); f.style.setProperty('--jt-fade', ms + 'ms');
  document.body.appendChild(f);
  requestAnimationFrame(() => { f.style.opacity = '0'; });
  setTimeout(() => f.remove(), ms + 60);
  state.ms = ms; state.dur = ms;
}

/** play this app's transition over whatever is on screen; returns 'warp' (the full signature) | 'fade' | 'none'. Never throws. */
export function play(app, opts) {
  const a = app || {}, o = opts || {}, id = String(a.id || ''), color = hexOf(warmRgb(rgbOf(a.color || a.accent || '#c8a24a')));
  const at = typeof o.at === 'number' ? clamp(o.at) : null;
  try {
    state.runs++; state.id = id; state.ms = 0; state.frames = 0; state.cues = []; state.error = '';
    state.from = (o.from && o.from.id) || '';
    if (!document.body) return (state.mode = 'none');
    finish();                                                        // a second transition replaces the first
    state.tier = tier();
    // o.kind / o.ms: a level change inside an app (level() below): one of the KINDS, 300-600 ms
    entry = o.kind && KINDS[o.kind] ? { kind: o.kind, ms: o.ms || LEVEL_MS, label: o.label === undefined ? false : o.label } : REGISTRY[id] || DEFAULT; state.kind = entry.kind;
    if (state.tier !== 'full' || !KINDS[entry.kind] || !setup()) { fade(color, state.tier === 'static' ? 'static' : 'lite'); return (state.mode = 'fade'); }
    css();
    const W = innerWidth, H = innerHeight, d = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * d); canvas.height = Math.round(H * d); state.px = canvas.width * canvas.height;
    const fx0 = fx();
    E = {
      g: g2, W, H, d, cx: W / 2, cy: H * 0.46, u: Math.min(W, H), R: Math.hypot(W, H) / 2, q: fx0 === 'ultra' ? 1.25 : 1,
      dust: true, rgb: rgbOf(color), from: o.from && o.from.color ? warmRgb(rgbOf(o.from.color)) : null, glyph: a.glyph || (a.name || '').slice(0, 1), name: a.name || '', rnd: seeded(id || 'x'),
    };
    S = KINDS[entry.kind].init(E);
    dur = o.kind && KINDS[o.kind] ? clamp(entry.ms, 300, 600) : clamp(entry.ms || DEFAULT.ms, 600, 1100); state.dur = dur;
    wrap = document.createElement('div');
    wrap.className = 'jportal jtrans'; wrap.setAttribute('aria-hidden', 'true'); wrap.style.setProperty('--jt-c', color); wrap.style.setProperty('--jt-ms', dur + 'ms');
    wrap.appendChild(canvas);
    const name = document.createElement('div');
    name.className = 'jtrans-name';
    if (entry.label !== false) {
      if (a.glyph) { const gl = document.createElement('b'); gl.textContent = a.glyph; name.appendChild(gl); }
      name.appendChild(document.createTextNode(String(a.name || '')));
    }
    wrap.appendChild(name);
    wrap.addEventListener('pointerdown', skip);
    onDone = typeof o.done === 'function' ? o.done : null;
    css(); document.body.appendChild(wrap);
    state.active = true; state.mode = 'warp';
    t0 = performance.now();
    if (at !== null) { name.style.animation = 'none'; name.style.opacity = at > 0.15 && at < 0.8 ? '1' : '0'; paint(at); return 'warp'; }
    cues = (entry.cues || []).map((c) => [c[0], c[1]]);
    paint(0);
    raf = requestAnimationFrame(frame);
    wd = setTimeout(() => { wd = 0; if (state.active) finish(); }, dur + 350);      // a starved frame loop (busy phone) never leaves the overlay stuck
    return 'warp';
  } catch (e) {
    state.error = String(e && e.message || e); finish();
    try { fade(color, 'lite'); } catch (_) { /* nothing more to do */ }
    return (state.mode = 'fade');
  }
}

document.addEventListener('keydown', (e) => { if (state.active && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) skip(e); });
document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
/** a level change INSIDE an app (a hall to the next, the hub to a city, a scroll of records): 'door' | 'scroll' | 'flythrough' (or any
 *  kind), 300-600 ms (default 560), no name card; LITE = the 250 ms fade, reduced motion = the 200 ms flat fade. Never throws. */
export const LEVEL_MS = 560, LEVEL_KINDS = Object.freeze(['door', 'scroll', 'flythrough']);
export function level(kind, opts) {
  const o = opts || {};
  return play({ id: o.id || 'level', name: o.name || '', color: o.color || '#c8a24a', glyph: o.glyph || '' },
    { kind: KINDS[kind] ? kind : 'door', ms: o.ms || LEVEL_MS, at: o.at, done: o.done, from: o.from, label: o.label });
}
window.jarvisTransitions = { play, level, skip: () => skip(), has: (id) => !!REGISTRY[id], ids: () => Object.keys(REGISTRY), registry: REGISTRY, kinds: Object.keys(KINDS), levelKinds: LEVEL_KINDS, tier };
