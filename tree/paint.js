// DAPHNE paint: everything drawn on the canvas, one frame at a time. No DOM, no state of its own beyond sprite caches.
//
//   paint(ctx, S, env)   env = { t: playback ms, now: wall ms, reduced, sway, onLit(k) }
//
// The tree: curved branches drawn as TAPERED filled shapes (thick at the parent, thin at the child, a point at a leaf),
// one fill per colour bucket; a soft glow pass under the living branches; leaves on the surviving branches (TRAIN: score
// > 0 and not cut; TEST: positive out of sample) that flutter; the search sprouts with a ring pulse at each new node; the
// root beats (a ring every PULSE_EVERY ms) while pulses run up the best path. The TRAIN / TEST lens switch sweeps a
// wavefront up from the root: nodes inside it take the new colours, the rest keep the old ones until it passes.
import * as C from './core.js?v=d3';

export const GROW_MS = 6500;            // the whole search grows in this long
export const EDGE_MS = 340;             // one branch grows in this long
export const IGNITE_MS = 1300;          // the best path lights up root to leaf
export const LENS_MS = 1100;            // the lens wavefront climbs the tree in this long
const FADE_MS = 800;                    // a cut branch dims over this long
const PULSE_EVERY = 1150, PULSE_MS = 1800, SPARK_EVERY = 210, SPARK_MS = 1500, SPROUT_MS = 520;
const MAX_LEAVES = 700;
const BG = '#17130f';
// buckets keep the fill count low: every branch of one colour and alpha class goes into one Path2D
export const RGB = { pos: '155,171,99', hot: '236,226,190', dim: '120,130,82', cut: '96,84,62', open: '224,176,96', red: '192,96,63',
  na: '142,131,118', amber: '224,176,96' };

// ------------------------------------------------------------------------------------------------ geometry
export function curve(p, q, n) {
  // a branch leaves its parent going up, then bends out to the child
  const dy = p[1] - q[1], b = n.bend * 14;
  return [p[0], p[1] - dy * 0.55, q[0] - (q[0] - p[0]) * 0.28 + b, q[1] + dy * 0.32];
}
export function bezierAt(p, c, q, t) {
  const u = 1 - t;
  return [u * u * u * p[0] + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * q[0],
    u * u * u * p[1] + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * q[1]];
}
export function positions(S, t, sway) {
  for (const n of S.tree.nodes) {
    const [x, y] = C.place(n, S.geo);
    const k = sway ? Math.sin(t * 0.00055 + n.phase) * n.r * 3.2 : 0;
    n.x = x + k; n.y = y - Math.abs(k) * 0.3;
  }
}
export function ancestry(S, n) {
  if (n.path) return n.path;
  const out = [n];
  while (out[0].parent >= 0 && S.tree.byId.get(out[0].parent)) out.unshift(S.tree.byId.get(out[0].parent));
  n.path = out;
  return out;
}
export function bestPath(S) {
  const leaf = S.tree.bestPath[S.tree.bestPath.length - 1];
  return leaf ? ancestry(S, leaf) : [S.tree.root];
}
function pathPoint(path, f) {
  const L = path.length - 1;
  if (L < 1) return [path[0].x, path[0].y];
  const pos = Math.min(L - 1e-6, Math.max(0, f * L)), i = Math.floor(pos), a = path[i], b = path[i + 1];
  const P = [a.x, a.y], Q = [b.x, b.y];
  return bezierAt(P, curve(P, Q, b), Q, pos - i);
}
/** branch half-width (CSS px at zoom 1): heavier nodes are thicker, every level a little thinner */
const half = (n) => 0.5 * n.width * Math.max(0.45, 1.32 - 0.11 * n.depth);

// ------------------------------------------------------------------------------------------------ colours
/** the lens a node shows at wall time `now`: the new one inside the climbing wavefront, the old one outside */
export function lensOf(S, n, now) {
  if (!S.lensAt || S.lensPrev === S.lens) return S.lens;
  return n.r <= (now - S.lensAt) / LENS_MS * 1.08 ? S.lens : S.lensPrev;
}
function tone(S, n, t, lens) {
  const age = t - n.appear - EDGE_MS;
  if (lens === 'test') {
    if (n.oos === null || !Number.isFinite(n.oos) || !n.oosN) return ['na', 0.1];
    const a = 0.16 + 0.6 * Math.min(1, Math.abs(n.oos) / S.maxOos);
    return [n.oos > 0 ? 'pos' : 'red', n.status === C.CUT ? a * 0.45 : a];
  }
  if (n.status === C.CUT) return ['cut', 0.55 - 0.45 * Math.min(1, Math.max(0, age / FADE_MS))];   // born bright, fades as the bound cuts it
  if (n.status === C.OPEN) return ['open', 0.16];
  const s = n.score || 0;
  if (s <= 0) return ['dim', 0.16];
  const f = Math.min(1, s / S.maxScore);
  return [f > 0.7 ? 'hot' : 'pos', 0.18 + 0.55 * f];
}
const alive = (n, lens) => !n.kids.length && n.status !== C.CUT && (lens === 'test' ? n.oos > 0 : n.score > 0);

// ------------------------------------------------------------------------------------------------ sprites (drawn once, stamped)
const SPR = {};
function sprite(rgb) {
  if (SPR[rgb]) return SPR[rgb];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},1)`); grad.addColorStop(0.35, `rgba(${rgb},.45)`); grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return (SPR[rgb] = c);
}
function ringSprite(rgb) {
  const k = 'ring' + rgb;
  if (SPR[k]) return SPR[k];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 18, 32, 32, 31);
  grad.addColorStop(0, `rgba(${rgb},0)`); grad.addColorStop(0.55, `rgba(${rgb},.9)`); grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return (SPR[k] = c);
}
const LEAF_ANGLES = 16;
function leafSprite(rgb, k) {                  // an almond leaf with a midrib, pre-rotated to one of 16 angles
  const key = `leaf${rgb}|${k}`;
  if (SPR[key]) return SPR[key];
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.translate(16, 16); g.rotate((k / LEAF_ANGLES) * Math.PI * 2);
  const grad = g.createLinearGradient(0, 0, 14, 0);
  grad.addColorStop(0, `rgba(${rgb},.95)`); grad.addColorStop(1, `rgba(${rgb},.35)`);
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(7, -6, 14, 0); g.quadraticCurveTo(7, 6, 0, 0); g.fill();
  g.strokeStyle = 'rgba(243, 236, 224,.55)'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(1, 0); g.lineTo(12, 0); g.stroke();
  return (SPR[key] = c);
}
function glow(ctx, x, y, r, rgb, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite(rgb), x - r, y - r, 2 * r, 2 * r);
  ctx.globalAlpha = 1;
}
function ring(ctx, x, y, r, rgb, alpha) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(ringSprite(rgb), x - r, y - r, 2 * r, 2 * r);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ the frame
export function paint(ctx, S, env) {
  const { t, now } = env, { s, x, y } = S.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = S.bg || BG;                              // an OLYMPUS theme's background, else DAPHNE's own
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!S.tree || !S.tree.root) return;
  ctx.setTransform(S.dpr * s, 0, 0, S.dpr * s, S.dpr * x, S.dpr * y);
  positions(S, t, env.sway);
  drawGround(ctx, S);
  ctx.globalCompositeOperation = 'lighter';
  drawBranches(ctx, S, t, now, s, env);
  drawBest(ctx, S, t, s, env);
  if (!env.reduced) drawPulses(ctx, S, t, s);
  drawWave(ctx, S, now, s);
  drawSelection(ctx, S, s);
}

function drawGround(ctx, S) {
  const { cx, baseY, rx } = S.geo, s = S.view.s;
  const g = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, Math.min(rx, 260));
  const rgb = S.lens === 'test' ? RGB.amber : RGB.pos;
  g.addColorStop(0, `rgba(${rgb},.16)`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - 280, baseY - 280, 560, 300);
  ctx.strokeStyle = `rgba(${rgb},.22)`;
  ctx.lineWidth = 1 / s;
  ctx.beginPath(); ctx.moveTo(cx - rx, baseY + 0.5); ctx.lineTo(cx + rx, baseY + 0.5); ctx.stroke();
  label(ctx, s, `${S.root.key} · ${C.variant(S.root)}`, cx + 18 / s, baseY - 5 / s, 'left', 'rgba(155, 171, 99,.7)');
}
function label(ctx, s, text, x, y, align, color) {
  ctx.font = `600 ${9.5 / s}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawBranches(ctx, S, t, now, s, env) {
  const fills = new Map(), glows = new Map(), growing = [], leaves = [];
  const taper = S.quality >= 1;
  for (const n of S.tree.nodes) {
    if (n.parent < 0 || t < n.appear) continue;
    const p = S.tree.byId.get(n.parent);
    if (!p) continue;
    const g = Math.min(1, (t - n.appear) / EDGE_MS);
    const P = [p.x, p.y], Q = [n.x, n.y], c = curve(P, Q, n);
    if (g < 1) { growing.push([P, c, Q, g, n]); continue; }
    const lens = lensOf(S, n, now);
    const [col, alpha] = tone(S, n, t, lens);
    const key = `${col}|${Math.round(alpha * 10)}`;
    let path = fills.get(key);
    if (!path) { path = new Path2D(); fills.set(key, path); }
    if (taper) {
      // the tapered branch: two offset curves, thick at the parent, thin at the child (a point at a leaf)
      const w0 = half(p) / s, w1 = (n.kids.length ? half(n) : half(n) * 0.3) / s;
      let dx = c[0] - P[0], dy = c[1] - P[1], L = Math.hypot(dx, dy) || 1;
      const n0x = -dy / L, n0y = dx / L;
      dx = Q[0] - c[2]; dy = Q[1] - c[3]; L = Math.hypot(dx, dy) || 1;
      const n1x = -dy / L, n1y = dx / L;
      path.moveTo(P[0] + n0x * w0, P[1] + n0y * w0);
      path.bezierCurveTo(c[0] + n0x * w0, c[1] + n0y * w0, c[2] + n1x * w1, c[3] + n1y * w1, Q[0] + n1x * w1, Q[1] + n1y * w1);
      path.lineTo(Q[0] - n1x * w1, Q[1] - n1y * w1);
      path.bezierCurveTo(c[2] - n1x * w1, c[3] - n1y * w1, c[0] - n0x * w0, c[1] - n0y * w0, P[0] - n0x * w0, P[1] - n0y * w0);
      path.closePath();
    } else {
      path.moveTo(P[0], P[1]);
      path.bezierCurveTo(c[0], c[1], c[2], c[3], Q[0], Q[1]);
    }
    if ((col === 'hot' || col === 'pos') && S.quality >= 1) {       // the glow pass: living branches only
      let gp = glows.get(col);
      if (!gp) { gp = new Path2D(); glows.set(col, gp); }
      gp.moveTo(P[0], P[1]);
      gp.bezierCurveTo(c[0], c[1], c[2], c[3], Q[0], Q[1]);
    }
    if (alive(n, lens)) leaves.push([n, c, lens]);
  }
  for (const [col, gp] of glows) {
    ctx.strokeStyle = `rgba(${RGB[col]},${col === 'hot' ? 0.09 : 0.05})`;
    ctx.lineWidth = (col === 'hot' ? 7 : 5) / s;
    ctx.stroke(gp);
  }
  for (const [key, path] of fills) {
    const [col, ak] = key.split('|');
    if (taper) { ctx.fillStyle = `rgba(${RGB[col]},${ak / 10})`; ctx.fill(path); } else { ctx.strokeStyle = `rgba(${RGB[col]},${ak / 10})`; ctx.lineWidth = 0.7 / s; ctx.stroke(path); }
  }
  drawLeaves(ctx, S, leaves, t, s, env);
  // branches still growing: a bright tip runs out along the curve (one stroke for all of them)
  const shoots = new Path2D();
  for (const [P, c, Q, g] of growing) {
    shoots.moveTo(P[0], P[1]);
    for (let i = 1; i <= 10; i++) { const [px, py] = bezierAt(P, c, Q, (i / 10) * g); shoots.lineTo(px, py); }
  }
  ctx.strokeStyle = 'rgba(155, 171, 99,.7)';
  ctx.lineWidth = 0.9 / s;
  ctx.stroke(shoots);
  for (const [P, c, Q, g] of growing) { const [tx, ty] = bezierAt(P, c, Q, g); glow(ctx, tx, ty, 6 / s, '243,236,224', 0.9); }
  glow(ctx, S.tree.root.x, S.tree.root.y, 18 / s, S.lens === 'test' ? RGB.amber : RGB.pos, 0.9);
  S.leafCount = leaves.length;
}

function drawLeaves(ctx, S, leaves, t, s, env) {
  if (!leaves.length || S.quality < 1) return;
  if (leaves.length > MAX_LEAVES) leaves.sort((a, b) => (b[0].score || 0) - (a[0].score || 0)).length = MAX_LEAVES;
  for (const [n, c, lens] of leaves) {
    const age = Math.min(1, (t - n.appear - EDGE_MS) / 600);
    if (age <= 0) continue;
    const v = lens === 'test' ? Math.min(1, Math.abs(n.oos) / S.maxOos) : Math.min(1, (n.score || 0) / S.maxScore);
    const flutter = env.sway ? Math.sin(t * 0.0021 + n.phase * 3) * 0.35 : 0;
    const base = Math.atan2(n.y - c[3], n.x - c[2]);          // the tip's direction
    const sz = (5 + 6 * v) * age / s;
    const rgb = v > 0.7 ? RGB.hot : lens === 'test' ? '155,171,99' : RGB.pos;
    for (const side of [-0.65, 0.65]) {                       // a pair of leaves, one each side of the tip
      const a = base + side + flutter, k = ((Math.round(a / (Math.PI * 2) * LEAF_ANGLES) % LEAF_ANGLES) + LEAF_ANGLES) % LEAF_ANGLES;
      ctx.globalAlpha = 0.35 + 0.55 * v;
      ctx.drawImage(leafSprite(rgb, k), n.x - sz, n.y - sz, 2 * sz, 2 * sz);
    }
  }
  ctx.globalAlpha = 1;
}

function strokePath(ctx, path, upto, width, color) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath();
  const steps = Math.max(1, Math.ceil(upto * (path.length - 1) * 14));
  for (let i = 0; i <= steps; i++) {
    const [px, py] = pathPoint(path, (i / steps) * upto);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
}

function drawBest(ctx, S, t, s, env) {
  const path = bestPath(S);
  if (path.length < 2) return;
  const ig = Math.min(1, Math.max(0, (t - GROW_MS) / IGNITE_MS));
  if (ig <= 0) return;
  const testFail = S.lens === 'test' && !(C.holds(S.root, path[path.length - 1], S.model.meta.min_test_n || 10, S.model.meta.sessions || {}));
  const rgb = testFail ? RGB.red : '155,171,99';
  strokePath(ctx, path, ig, 14 / s, `rgba(${rgb},.05)`);
  strokePath(ctx, path, ig, 6 / s, `rgba(${rgb},.18)`);
  strokePath(ctx, path, ig, 1.9 / s, testFail ? 'rgba(224, 144, 122,.95)' : 'rgba(243, 236, 224,.95)');
  const head = pathPoint(path, ig);
  glow(ctx, head[0], head[1], 20 / s, rgb, 0.85);
  const lit = Math.floor(ig * (path.length - 1) + 1e-6);
  if (lit !== S.lit) { S.lit = lit; env.onLit && env.onLit(lit); }
  if (ig >= 1) {
    const leaf = path[path.length - 1];
    glow(ctx, leaf.x, leaf.y, (26 + 5 * Math.sin(t * 0.004)) / s, rgb, 0.9);
    const right = leaf.x < S.geo.cx;
    const tag = S.lens === 'test' ? `TEST ${C.usd(S.root.best.test.mean)} · ${testFail ? 'FAILS' : 'HOLDS'}` : `BEST ${(leaf.score || 0).toFixed(2)}`;
    label(ctx, s, tag, leaf.x + (right ? 14 : -14) / s, leaf.y - 10 / s, right ? 'left' : 'right', testFail ? 'rgba(224, 144, 122,.95)' : 'rgba(243, 236, 224,.95)');
  }
}

// pulses, sound-free: sprouts ring out as nodes appear, the root beats, pulses climb the best path, sparks climb the others
function drawPulses(ctx, S, t, s) {
  const nodes = S.tree.nodes, rgbL = S.lens === 'test' ? RGB.amber : '155,171,99';
  if (t < GROW_MS + EDGE_MS) {
    const big = 0.45 * S.maxScore;
    for (const n of nodes) {
      const a = t - n.appear - EDGE_MS;
      if (a < 0 || a > SPROUT_MS || !(n.depth <= 2 || (n.score || 0) > big)) continue;
      const f = a / SPROUT_MS;
      ring(ctx, n.x, n.y, (3 + 13 * f) / s, rgbL, 0.55 * (1 - f));
    }
  }
  const root = S.tree.root, beat = (t % PULSE_EVERY) / PULSE_EVERY;      // the heartbeat at the root
  ring(ctx, root.x, root.y, (8 + 46 * beat) / s, rgbL, 0.45 * (1 - beat) * (1 - beat));
  const path = bestPath(S), after = t - GROW_MS - IGNITE_MS;
  if (path.length > 1 && after > 0) {
    const first = Math.floor(Math.max(0, after - PULSE_MS) / PULSE_EVERY);
    for (let k = first; k * PULSE_EVERY <= after; k++) {
      const f = (after - k * PULSE_EVERY) / PULSE_MS;
      if (f < 0 || f > 1) continue;
      const [px, py] = pathPoint(path, f);
      glow(ctx, px, py, 11 / s, '243,236,224', 0.95);
      if (f > 0.9) { const leaf = path[path.length - 1]; ring(ctx, leaf.x, leaf.y, (10 + 120 * (f - 0.9)) / s, '243,236,224', (1 - f) * 6); }
    }
  }
  const leaves = S.positiveLeaves;
  if (!leaves.length || t < 600) return;
  const first = Math.floor(Math.max(0, t - SPARK_MS) / SPARK_EVERY);
  for (let k = first; k * SPARK_EVERY <= t; k++) {
    const leaf = leaves[Math.floor(C.hash01(k, 19) * leaves.length)];
    if (leaf.appear + EDGE_MS > k * SPARK_EVERY) continue;
    const f = (t - k * SPARK_EVERY) / SPARK_MS;
    if (f < 0 || f > 1) continue;
    const [px, py] = pathPoint(ancestry(S, leaf), f);
    glow(ctx, px, py, 6 / s, '155,171,99', 0.55 * (1 - f));
  }
}

// the lens wavefront: an arc climbing from the root while the new colours take over
function drawWave(ctx, S, now, s) {
  if (!S.lensAt) return;
  const f = (now - S.lensAt) / LENS_MS;
  if (f < 0 || f > 1.15) return;
  const { cx, baseY, rx, ry, spread } = S.geo, r = Math.min(1, f) * 1.05, rgb = S.lens === 'test' ? RGB.amber : RGB.pos;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48 * 2 - 1) * spread, px = cx + Math.sin(a) * r * rx, py = baseY - Math.cos(a) * r * ry;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  const fade = f > 1 ? Math.max(0, 1 - (f - 1) / 0.15) : 1;
  ctx.strokeStyle = `rgba(${rgb},${0.12 * fade})`; ctx.lineWidth = 16 / s; ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb},${0.8 * fade})`; ctx.lineWidth = 1.6 / s; ctx.stroke();
}

function drawSelection(ctx, S, s) {
  const n = S.selected;
  if (!n || n.x === undefined) return;
  strokePath(ctx, ancestry(S, n), 1, 1.4 / s, 'rgba(224, 160, 96,.85)');
  ctx.strokeStyle = 'rgba(224, 160, 96,.95)';
  ctx.lineWidth = 1.2 / s;
  ctx.beginPath(); ctx.arc(n.x, n.y, 7 / s, 0, Math.PI * 2); ctx.stroke();
}
