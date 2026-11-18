// ARGO scene (ES module, no DOM, no WebGL): a marble trireme riding low waves toward the next island, drawn onto a 2D canvas context the page passes in. Light: about 300 flat-shaded faces, painter's sort, warm light.
// The island on the horizon grows as the goal gets closer (frac 0..1). draw(ctx, w, h, t, frac, quality) paints one frame; the page animates t, LITE / reduced motion paint a single frame.
// Pure maths on a context, so tests/test_argo_page.py can run it in node on a fake context.

const MARBLE = [226, 217, 200], BRONZE = [156, 107, 60], GOLD = [200, 162, 74], IVORY = [243, 236, 224], TERRA = [201, 106, 74], OLIVE = [127, 138, 82], WATER = [62, 106, 138], ROCK = [150, 134, 108];
const LIGHT = (() => { const v = [-0.4, 0.8, 0.5], l = Math.hypot(...v); return v.map((x) => x / l); })();

function quad(a, b, c, d, col) { return { p: [a, b, c, d], c: col }; }
function box(cx, cy, cz, sx, sy, sz, col) {
  const x0 = cx - sx, x1 = cx + sx, y0 = cy - sy, y1 = cy + sy, z0 = cz - sz, z1 = cz + sz, P = (x, y, z) => [x, y, z];
  return [quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col), quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), col), quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), col), quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), col), quad(P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1), col)];
}
export function hullAt(x) {                      // half width, deck height and keel height at x (-1.25 .. 1.25)
  const u = Math.abs(x) / 1.25;
  return { w: 0.34 * Math.pow(Math.max(0, 1 - Math.pow(x / 1.3, 2)), 0.6) + 0.03, deck: 0.2 + 0.14 * Math.pow(u, 3), keel: -0.14 + 0.1 * u * u };
}
export function trireme(t, bob) {
  const f = [], S = 8, sec = [];
  for (let i = 0; i <= S; i++) {
    const x = -1.25 + (2.5 * i) / S, h = hullAt(x);
    sec.push([[x, h.deck, -h.w], [x, h.keel + 0.06, -h.w * 0.72], [x, h.keel, 0], [x, h.keel + 0.06, h.w * 0.72], [x, h.deck, h.w]]);
  }
  for (let i = 0; i < S; i++) for (let k = 0; k < 4; k++) f.push(quad(sec[i][k], sec[i + 1][k], sec[i + 1][k + 1], sec[i][k + 1], k === 0 || k === 3 ? BRONZE : MARBLE));
  for (let i = 0; i < S; i++) f.push(quad(sec[i][0], sec[i + 1][0], sec[i + 1][4], sec[i][4], IVORY));
  for (let i = 1; i <= 6; i++) {                                   // oars: two banks, rowing
    const x = -1.0 + (i - 1) * 0.36, h = hullAt(x), sw = 0.22 * Math.sin(t * 2.2 + i * 0.7);
    for (const s of [-1, 1]) f.push(quad([x - 0.025, h.deck - 0.02, s * h.w], [x + 0.025, h.deck - 0.02, s * h.w], [x + sw + 0.025, -0.2, s * (h.w + 0.85)], [x + sw - 0.025, -0.2, s * (h.w + 0.85)], BRONZE));
  }
  f.push(...box(0.1, 0.85, 0, 0.035, 0.65, 0.035, BRONZE));      // the mast
  const sx = (y) => 0.1 + 0.16 * Math.sin(((y - 0.7) / 0.8) * Math.PI);
  for (let j = 0; j < 3; j++) {                                    // the sail: three bands, the middle one terracotta, billowing
    const y0 = 0.7 + j * 0.27, y1 = y0 + 0.27, col = j === 1 ? TERRA : IVORY;
    f.push(quad([sx(y0), y0, -0.62], [sx(y0), y0, 0.62], [sx(y1), y1, 0.62], [sx(y1), y1, -0.62], col));
  }
  f.push({ p: [[1.22, -0.02, -0.07], [1.22, -0.02, 0.07], [1.62, -0.1, 0]], c: GOLD });   // the ram
  f.push({ p: [[1.22, -0.02, 0.07], [1.22, -0.12, 0], [1.62, -0.1, 0]], c: GOLD });
  for (const s of [-1, 1]) { const h = hullAt(1.0); f.push({ p: [[1.0, h.deck - 0.03, s * (h.w + 0.002)], [1.06, h.deck - 0.03, s * (h.w + 0.002)], [1.03, h.deck - 0.09, s * (h.w + 0.002)]], c: IVORY, two: true }); }
  for (const q of f) { q.two = true; for (const p of q.p) p[1] += bob; }
  return f;
}
export function island(cx, cz, s) {
  const prof = [[0.01, 1.0], [0.3, 0.9], [0.62, 0.55], [0.95, 0.18], [1.2, 0.0], [1.4, -0.12]], seg = 12, f = [];
  for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2, b = ((k + 1) / seg) * Math.PI * 2, [r1, y1] = prof[i], [r2, y2] = prof[i + 1];
    f.push({ p: [[cx + s * r1 * Math.cos(a), s * y1 * 0.9, cz + s * r1 * Math.sin(a)], [cx + s * r2 * Math.cos(a), s * y2 * 0.9, cz + s * r2 * Math.sin(a)], [cx + s * r2 * Math.cos(b), s * y2 * 0.9, cz + s * r2 * Math.sin(b)], [cx + s * r1 * Math.cos(b), s * y1 * 0.9, cz + s * r1 * Math.sin(b)]], c: i < 2 ? OLIVE : i < 4 ? ROCK : MARBLE, two: true });
  }
  for (let k = 0; k < 3; k++) f.push(...box(cx + s * (k - 1) * 0.12, s * 1.1, cz, 0.03 * s, 0.14 * s, 0.03 * s, MARBLE).map((q) => ({ ...q, two: true })));   // a tiny temple: three columns
  return f;
}
export function waves(t, cols, rows) {
  const f = [], X0 = -5.5, Z0 = -4.5, dx = 11 / cols, dz = 9 / rows;
  const hgt = (x, z) => 0.09 * Math.sin(x * 0.9 + t * 1.3) + 0.07 * Math.sin(z * 1.2 - t + x * 0.3);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = X0 + i * dx, z = Z0 + j * dz, p = (a, b) => [a, hgt(a, b) - 0.02, b];
    f.push({ p: [p(x, z), p(x + dx, z), p(x + dx, z + dz), p(x, z + dz)], c: WATER, two: true });
  }
  return f;
}
export function scene(t, frac, quality) {
  const lo = quality === 'low', f = waves(t, lo ? 10 : 18, lo ? 7 : 12), bob = 0.05 * Math.sin(t * 1.5);
  f.push(...trireme(t, bob), ...island(4.6, -2.6, 0.35 + 0.85 * Math.max(0, Math.min(1, frac))));
  return f;
}
export function project(faces, yaw, pitch, w, h) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), k = (w / 9.2), out = [];
  const rot = (p) => { const x = p[0] - 0.4, y = p[1] - 0.2, z = p[2] + 0.4; const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
  for (const q of faces) {
    const v = q.p.map(rot), a = v[0], b = v[1], c = v[2];
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nz < 0) { if (!q.two) continue; nx = -nx; ny = -ny; nz = -nz; }
    out.push({ pts: v.map((p) => [w * 0.5 + p[0] * k, h * 0.66 - p[1] * k]), z: v.reduce((s, p) => s + p[2], 0) / v.length, n: [nx, ny, nz], c: q.c });
  }
  return out.sort((x, y) => x.z - y.z);
}
function shade(c, n, water) {
  const d = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]), k = 0.42 + 0.58 * d, spec = water ? Math.pow(Math.max(0, n[1] * 0.8 + n[2] * 0.4 - 0.55), 2) * 0.9 : Math.pow(Math.max(0, n[2] * 0.7 + n[1] * 0.5), 14) * 0.2;
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k + spec * 255)));
  return `rgb(${ch(c[0])},${ch(c[1])},${ch(c[2])})`;
}
export function draw(ctx, w, h, t, frac, quality) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.7);                 // dawn: indigo to amber
  g.addColorStop(0, '#2a2547'); g.addColorStop(0.55, '#7a5a5a'); g.addColorStop(1, '#e0b060');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const sea = ctx.createLinearGradient(0, h * 0.42, 0, h); sea.addColorStop(0, '#6d8fa0'); sea.addColorStop(1, '#274a62'); ctx.fillStyle = sea; ctx.fillRect(0, h * 0.42, w, h * 0.58);
  ctx.beginPath(); ctx.arc(w * 0.22, h * 0.34, h * 0.09, 0, Math.PI * 2); ctx.fillStyle = 'rgba(243,214,150,0.85)'; ctx.fill();
  const faces = project(scene(t, frac, quality), -0.62, 0.3, w, h);
  ctx.lineJoin = 'round';
  for (const f of faces) {
    const col = shade(f.c, f.n, f.c === WATER);
    ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]); for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]); ctx.closePath();
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.fill(); ctx.stroke();
  }
  return faces.length;
}
