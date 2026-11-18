// MINT 3D scene (optional ES module): five fluted marble pillars on a round marble plinth, one per money stream, height = the stream's
// estimated dollars a month (the tallest = the biggest stream), each crowned with a gilded capital (gold 0xc8a24a = an ok stream, bronze =
// stale, plain stone = no monthly number) and a bronze tablet with its dollars. Owl coins lie on the plinth, a laurel rests at the foot of
// the tallest, dust drifts in the light. Round 6 (QA bug 8): real CC0 marble / paving scans and the golden HDRI from olympus/env-kit.js via
// olympus/hero-stage.js (painted dusk sky, warm key light, soft shadows on a GPU). No bloom, no neon, no network.
// It registers window.MINT3D = { mount(box, pillars), update(pillars), dispose() } and fires 'mint3d'.
// mint.js draws the 2D pillars first and only hides them when mount() returns true (WebGL present); any failure here leaves the 2D picture in place.
import * as THREE from '../jarvis/three.module.min.js';
import { createStage, shaftGeo, latheGeo, boxGeo, mergeParts, mat4 } from '../olympus/hero-stage.js';

const GOLD = 0xc8a24a, BRONZE = 0x9c6b3c, STONE = 0xb8ad9a;
const MAXH = 3.3, MINH = 0.5, R0 = 0.3;
let R = null;

const CAPC = new THREE.Color('#d4ae58'), ratio = (hex) => { const c = new THREE.Color(hex); return new THREE.Color(c.r / CAPC.r, c.g / CAPC.g, c.b / CAPC.b); };
const tintFor = (st) => (st === 'ok' ? new THREE.Color(1, 1, 1) : ratio(st === 'stale' ? BRONZE : STONE));
const target = (p) => MINH + Math.max(0.02, Math.min(1, p.h)) * MAXH;
const money = (v) => (v == null || !isFinite(v) ? 'no estimate' : '$' + Math.round(v).toLocaleString('en-US'));
// the tallest stands in the middle at the back, the next two either side, the smallest in front at the ends: a podium arc open to the camera
const SLOTS = [[0, -0.55], [-1.35, -0.2], [1.35, -0.2], [-2.45, 0.55], [2.45, 0.55]];
let ORDER = [0, 1, 2, 3, 4];
const rankOrder = (list) => { const r = list.map((p, i) => [p.to != null ? p.to : target(p), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]); const o = []; r.forEach((e, k) => { o[e[1]] = k; }); return o; };
const spot = (i) => SLOTS[ORDER[i] != null ? ORDER[i] : i] || SLOTS[0];

function mount(box, pillars) {
  if (R) dispose();
  const list = (pillars || []).slice(0, 5), n = list.length;
  ORDER = rankOrder(list);
  const H = createStage(box, { palette: 'golden', hdri: 'golden', fit: { center: [0, 2.2, 0.2], size: [8.2, 4.6, 5.4], pitch: 0.16, margin: 1.0 }, fov: 32, sway: 0.2, sunDir: [0.6, 0.55, 0.62], shadowExt: 5, sky: { sunX: 0.78, sunY: 0.8, templeX: 0.16, horizon: 0.6 }, fogNear: 18, fogFar: 46 });
  if (!H) return false;
  const { kit, B } = H;
  H.ground({ mat: 'paving', color: '#a39176' });
  const top = H.plinth({ r: 3.2, steps: 2, stepH: 0.14, run: 0.3, drum: 0.34 });
  H.amphora({ x: -4.6, z: 0.6, s: 1.3, ry: 0.5 }); H.amphora({ x: 4.5, z: 0.9, s: 1.1, ry: -0.4 });
  for (const sx of [-1, 1]) B.brazier({ x: sx * 4.4, z: -1.8, h: 1.1, r: 0.3 });
  // an inlaid ring of darker marble and a key band on the plinth top
  B.add('marble:uv', new THREE.RingGeometry(2.9, 3.15, 64).rotateX(-Math.PI / 2), mat4(0, top + 0.004, 0), '#a89a84');
  H.build(H.root);
  // the pillars: three instanced draws (fluted marble shafts, gilded capitals, bronze bases), scaled to the dollars
  const shaft = new THREE.InstancedMesh(shaftGeo({ h: 1, r: R0, flutes: 20, lite: kit.geoLite, rows: 1 }), kit.mat('marble', { color: '#efe8da' }), Math.max(1, n));
  const capG = mergeParts([[latheGeo([[R0 * 0.82, 0], [R0 * 0.86, 0.04], [R0 * 1.02, 0.1], [R0 * 1.24, 0.17], [R0 * 1.32, 0.2], [0.0001, 0.2]], kit.geoLite ? 12 : 24)], [boxGeo(R0 * 2.8, 0.11, R0 * 2.8), mat4(0, 0.255, 0)]]);
  const cap = new THREE.InstancedMesh(capG, kit.mat('gold', { color: '#d4ae58' }), Math.max(1, n));
  const baseG = latheGeo([[0.0001, 0], [R0 * 1.42, 0], [R0 * 1.42, 0.06], [R0 * 1.26, 0.1], [R0 * 1.3, 0.15], [R0 * 1.08, 0.2], [0.0001, 0.2]], kit.geoLite ? 12 : 24);
  const base = new THREE.InstancedMesh(baseG, kit.mat('bronze'), Math.max(1, n));
  [shaft, cap, base].forEach((m) => { m.frustumCulled = false; m.castShadow = H.shadows; m.receiveShadow = H.shadows; H.root.add(m); });
  for (let i = 0; i < n; i++) { const p = spot(i); base.setMatrixAt(i, mat4(p[0], top, p[1])); }
  base.instanceMatrix.needsUpdate = true;
  // owl coins on the plinth (one draw) and a gold laurel at the foot of the tallest pillar
  const coinMat = H.paint('coin');
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, kit.geoLite ? 16 : 28), coinMat, 9);
  [[-1.3, 1.7, 0.3], [-1.05, 1.95, 1.9], [-0.7, 1.55, 0.9], [1.2, 1.75, 2.4], [1.45, 1.5, 0.2], [0.9, 2.05, 1.1], [0.15, 2.5, 0.7], [-0.4, 2.35, 2.6], [0.45, 2.75, 1.7]]
    .forEach((c, i) => coins.setMatrixAt(i, mat4(c[0], top + 0.03 + (i % 3 === 2 ? 0.035 : 0), c[1], c[2], 1, (i % 4) * 0.04, 0)));
  coins.instanceMatrix.needsUpdate = true; coins.castShadow = H.shadows; H.root.add(coins);
  // the bronze tablets with each stream's dollars, and the stream's name
  const labels = list.map((p, i) => { const s = H.label(money(p.usd), { sub: p.name || '', scale: 0.46, w: 256, h: 112 }); H.root.add(s); return s; });
  const blobs = []; for (let i = 0; i < n; i++) { const p = spot(i); blobs.push([p[0], p[1], 0.62, 1, top + 0.016]); }
  H.blobs(blobs, { opacity: 0.45 });
  const motes = H.motes({ n: 46, center: [0, 2.6, 0.6], box: [8, 4.4, 5], size: 4.5, alpha: 0.42 });
  const g = { shaft, cap, base, labels, coins, top, list: list.map((p) => ({ to: target(p), h: H.reduce ? target(p) : MINH, st: p.status, usd: p.usd, name: p.name })) };
  const place = () => {
    for (let i = 0; i < n; i++) {
      const u = g.list[i], p = spot(i), h = u.h;
      shaft.setMatrixAt(i, mat4(p[0], top + 0.2, p[1], i * 0.4, [1, h, 1]));
      cap.setMatrixAt(i, mat4(p[0], top + 0.2 + h, p[1], i * 0.4));
      g.labels[i].position.set(p[0], top + 0.2 + h + 0.72, p[1]);
    }
    shaft.instanceMatrix.needsUpdate = true; cap.instanceMatrix.needsUpdate = true;
  };
  const tint = () => { for (let i = 0; i < n; i++) cap.setColorAt(i, tintFor(g.list[i].st)); if (cap.instanceColor) cap.instanceColor.needsUpdate = true; };
  tint(); place();
  R = { H, g, n, dead: false };
  H.start((dt, t) => {
    let moving = false;
    for (const u of g.list) { const d = u.to - u.h; if (Math.abs(d) > 0.004) { u.h += d * Math.min(1, dt * 3.2); moving = true; } else u.h = u.to; }
    place(); motes.tick(t);
    return moving;
  });
  return true;
}

function update(pillars) {
  if (!R) return;
  (pillars || []).slice(0, 5).forEach((p, i) => {
    const u = R.g.list[i]; if (!u) return;
    u.to = target(p); u.st = p.status; u.usd = p.usd; u.name = p.name;
    R.g.labels[i].userData.set(money(p.usd), p.name || '');
    R.g.cap.setColorAt(i, tintFor(p.status));
  });
  if (R.g.cap.instanceColor) R.g.cap.instanceColor.needsUpdate = true;
  R.H.poke(2500);
}

function dispose() {
  if (!R) return;
  R.dead = true;
  try { R.H.dispose(); } catch (_) { /* nothing */ }
  R = null;
}

window.MINT3D = { mount, update, dispose, frames: () => (R ? R.H.frames : 0), pillars: () => (R ? R.g.list.map((u) => Math.round(u.to * 100) / 100) : []), stats: () => (R ? R.H.stats() : null), gold: GOLD, stone: STONE };
window.__heroStats = () => (R ? R.H.stats() : null);
window.dispatchEvent(new Event('mint3d'));
