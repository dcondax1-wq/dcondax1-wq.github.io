// NIKE scene (ES module, no DOM, no WebGL): four small trophies (cup, laurel crown, owl, shield) as flat-shaded meshes drawn onto a 2D canvas context that the page passes in.
// Light on purpose: a few hundred faces, painter's sort, warm light. Same code draws the shelf tiles (still) and the inspector (turns). Locked trophies are drawn in plain stone.
// Pure maths, so tests/test_nike_page.py can build every mesh and draw it onto a fake context in node.

const TAU = Math.PI * 2;
export const SEG = { high: 28, low: 14 };
const GOLD = [200, 162, 74], BRONZE = [156, 107, 60], MARBLE = [214, 205, 188], OLIVE = [127, 138, 82], IVORY = [243, 236, 224], STONE = [118, 108, 94];

function lathe(profile, seg, col, y0) {
  const f = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r1, y1] = profile[i], [r2, y2] = profile[i + 1];
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * TAU, b = ((s + 1) / seg) * TAU;
      f.push({ p: [[r1 * Math.cos(a), y1 + (y0 || 0), r1 * Math.sin(a)], [r2 * Math.cos(a), y2 + (y0 || 0), r2 * Math.sin(a)], [r2 * Math.cos(b), y2 + (y0 || 0), r2 * Math.sin(b)], [r1 * Math.cos(b), y1 + (y0 || 0), r1 * Math.sin(b)]], c: col });
    }
  }
  return f;
}
function disc(cx, cy, cz, r, seg, col, nz) {            // a flat disc facing +z (nz 1) or -z
  const f = [];
  for (let s = 0; s < seg; s++) {
    const a = (s / seg) * TAU, b = ((s + 1) / seg) * TAU, p0 = [cx, cy, cz], p1 = [cx + r * Math.cos(a), cy + r * Math.sin(a), cz], p2 = [cx + r * Math.cos(b), cy + r * Math.sin(b), cz];
    f.push({ p: nz > 0 ? [p0, p1, p2] : [p0, p2, p1], c: col });
  }
  return f;
}
function tube(path, rad, sides, col) {                  // a tube along a path that lies in the XY plane
  const rings = path.map((q, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = -ty, ny = tx, ring = [];
    for (let s = 0; s < sides; s++) { const t = (s / sides) * TAU, c = Math.cos(t) * rad, z = Math.sin(t) * rad; ring.push([q[0] + nx * c, q[1] + ny * c, z]); }
    return ring;
  });
  const f = [];
  for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < sides; s++) { const t = (s + 1) % sides; f.push({ p: [rings[i][s], rings[i + 1][s], rings[i + 1][t], rings[i][t]], c: col, two: true }); }
  return f;
}
function plinth(seg) { return lathe([[0.01, 0], [0.62, 0], [0.62, 0.07], [0.5, 0.1], [0.5, 0.14], [0.01, 0.14]], seg, MARBLE, -0.15); }

function cup(seg) {
  const body = lathe([[0.01, 0], [0.5, 0], [0.5, 0.06], [0.14, 0.12], [0.11, 0.4], [0.2, 0.46], [0.5, 0.62], [0.62, 0.85], [0.6, 1.02], [0.54, 1.04], [0.5, 0.9], [0.3, 0.7], [0.01, 0.64]], seg, GOLD);
  const arc = (side) => { const p = []; for (let i = 0; i <= 10; i++) { const t = -1.2 + (i / 10) * 2.7; p.push([side * (0.6 + 0.3 * Math.cos(t)), 0.78 + 0.3 * Math.sin(t)]); } return p; };
  return [...plinth(seg), ...body, ...tube(arc(1), 0.045, 6, GOLD), ...tube(arc(-1), 0.045, 6, GOLD)];
}
function laurel(seg) {
  const f = [...plinth(seg)], R = 0.62, base = 0.5;
  // the ring lies in the XZ plane: a thin band
  f.push(...lathe([[R + 0.04, base - 0.04], [R + 0.04, base + 0.04], [R - 0.04, base + 0.04], [R - 0.04, base - 0.04]], seg, BRONZE));
  const n = Math.max(10, Math.round(seg * 0.9));
  for (let i = 0; i < n; i++) {
    const a = 0.45 + (i / (n - 1)) * (TAU - 0.9), side = i % 2 ? 1 : -1;       // open at the back, leaves in pairs
    const cx = R * Math.cos(a), cz = R * Math.sin(a), tx = -Math.sin(a), tz = Math.cos(a), ox = Math.cos(a), oz = Math.sin(a), col = i % 2 ? GOLD : OLIVE;
    const L = 0.2, W = 0.07, lift = 0.22 * (0.4 + 0.6 * Math.sin((i / (n - 1)) * Math.PI));
    const b = [cx, base, cz], tip = [cx + tx * L * 0.5 + ox * 0.14 * side, base + lift + 0.12, cz + tz * L * 0.5 + oz * 0.14 * side];
    const m1 = [cx + tx * W + ox * 0.05 * side, base + lift * 0.5 + 0.05, cz + tz * W + oz * 0.05 * side], m2 = [cx - tx * W + ox * 0.05 * side, base + lift * 0.5 + 0.05, cz - tz * W + oz * 0.05 * side];
    f.push({ p: [b, m1, tip, m2], c: col, two: true });
  }
  return f;
}
function owl(seg) {
  const body = lathe([[0.01, 0], [0.38, 0.02], [0.52, 0.2], [0.56, 0.5], [0.5, 0.8], [0.46, 0.98], [0.5, 1.12], [0.46, 1.26], [0.3, 1.34], [0.01, 1.36]], seg, BRONZE);
  const f = [...plinth(seg), ...body], z = 0.44;
  const ear = (sx) => { const c = [sx * 0.3, 1.34, 0.02], q = []; for (let s = 0; s < 4; s++) { const a = (s / 4) * TAU, b = ((s + 1) / 4) * TAU; q.push({ p: [[c[0] + 0.1 * Math.cos(a), c[1], c[2] + 0.1 * Math.sin(a)], [c[0] + 0.1 * Math.cos(b), c[1], c[2] + 0.1 * Math.sin(b)], [c[0] + sx * 0.05, c[1] + 0.22, c[2]]], c: GOLD }); } return q; };
  f.push(...ear(1), ...ear(-1));
  for (const sx of [-1, 1]) { f.push(...disc(sx * 0.2, 1.12, z + 0.05, 0.15, 12, IVORY, 1), ...disc(sx * 0.2, 1.12, z + 0.06, 0.07, 10, [40, 32, 24], 1)); }
  f.push({ p: [[-0.06, 1.0, z + 0.08], [0.06, 1.0, z + 0.08], [0, 0.86, z + 0.16]], c: GOLD });
  for (let i = 0; i < 3; i++) f.push(...disc(-0.18 + i * 0.18, 0.62 - i * 0.0, z + 0.08, 0.07, 8, GOLD, 1), ...disc(-0.09 + i * 0.18 - 0.09 * 0, 0.46, z + 0.1, 0.07, 8, GOLD, 1));
  return f;
}
function shield(seg) {
  const out = [[-0.5, 1.0], [0.5, 1.0], [0.52, 0.55], [0.4, 0.22], [0.0, -0.02], [-0.4, 0.22], [-0.52, 0.55]];
  const f = [...plinth(seg)], zf = 0.07, y0 = 0.26, c = [0, 0.58];
  const P = (q, z, k) => [q[0] * (k || 1), (q[1] - c[1]) * (k || 1) + c[1] + y0, z];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    f.push({ p: [P(c, zf + 0.02), P(a, zf), P(b, zf)], c: GOLD });
    f.push({ p: [P(c, -zf - 0.02), P(b, -zf), P(a, -zf)], c: GOLD });
    f.push({ p: [P(a, zf), P(a, -zf), P(b, -zf), P(b, zf)], c: BRONZE, two: true });
    const ia = [a[0] * 0.78, (a[1] - c[1]) * 0.78 + c[1]], ib = [b[0] * 0.78, (b[1] - c[1]) * 0.78 + c[1]];
    f.push({ p: [P(ia, zf + 0.03), P(ib, zf + 0.03), P(b, zf), P(a, zf)], c: BRONZE, two: true });
  }
  f.push({ p: [P([0, 0.9], zf + 0.045), P([0.14, 0.58], zf + 0.045), P([0, 0.2], zf + 0.045), P([-0.14, 0.58], zf + 0.045)], c: IVORY, two: true });
  return f;
}
export const BUILD = { cup, laurel, owl, shield };
export function makeMesh(shape, quality) {
  const seg = quality === 'low' ? SEG.low : SEG.high, fn = BUILD[shape] || cup, faces = fn(seg);
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const f of faces) for (const p of f.p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { shape, faces, lo, hi };
}

const LIGHT = (() => { const v = [-0.45, 0.75, 0.6], l = Math.hypot(...v); return v.map((x) => x / l); })();
export function project(mesh, yaw, pitch, w, h, pad) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const mid = [(mesh.lo[0] + mesh.hi[0]) / 2, (mesh.lo[1] + mesh.hi[1]) / 2, (mesh.lo[2] + mesh.hi[2]) / 2];
  const rot = (p) => { const x = p[0] - mid[0], y = p[1] - mid[1], z = p[2] - mid[2]; const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
  const ext = Math.max(mesh.hi[1] - mesh.lo[1], (mesh.hi[0] - mesh.lo[0]) * 1.1, 0.5), k = (Math.min(w, h) * (1 - (pad == null ? 0.12 : pad))) / ext * 0.95;
  const out = [];
  for (const f of mesh.faces) {
    const q = f.p.map(rot), a = q[0], b = q[1], c = q[2];
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nz < 0) { if (!f.two) continue; nx = -nx; ny = -ny; nz = -nz; }
    out.push({ pts: q.map((p) => [w / 2 + p[0] * k, h * 0.5 - p[1] * k]), z: (q[0][2] + q[1][2] + q[2][2]) / 3, n: [nx, ny, nz], c: f.c });
  }
  out.sort((x, y) => x.z - y.z);
  return out;
}
function shade(c, n, locked) {
  const base = locked ? [STONE[0] * (0.55 + c[0] / 600), STONE[1] * (0.55 + c[1] / 600), STONE[2] * (0.55 + c[2] / 600)] : c;
  const d = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]), spec = locked ? 0 : Math.pow(Math.max(0, n[2] * 0.7 + n[1] * 0.5), 14) * 0.3, k = 0.38 + 0.62 * d;
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k + spec * 255)));
  return `rgb(${ch(base[0])},${ch(base[1])},${ch(base[2])})`;
}
export function draw(ctx, mesh, w, h, yaw, locked, pad) {
  ctx.clearRect(0, 0, w, h);
  const faces = project(mesh, yaw, 0.28, w, h, pad);
  ctx.save(); ctx.globalAlpha = locked ? 0.9 : 1; ctx.lineJoin = 'round';
  for (const f of faces) {
    const col = shade(f.c, f.n, locked);
    ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]); for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]); ctx.closePath();
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  return faces.length;
}
