// LYCEUM scene (ES module, optional): the peripatos, Aristotle's covered walk, seen from the door at golden hour. Eight column places stand in two
// rows on a marble walk with a mosaic runner; the hall starts with two columns and every rank adds one (the empty places show a bare bronze
// ring), each standing row carries its architrave, and from the fourth rank each new column wears an olive laurel. At the far end a lectern with an
// open scroll waits on marble steps before a plastered wall with an oxblood dado and a painted Greek key, braziers either side.
// QA Round 6 bug 8: env-kit marble / mosaic / plaster scans, HDRI light and a painted golden sky via olympus/hero-stage.js (createStage on the page's
// canvas). If WebGL is missing the canvas is hidden and the page works without it. Reduced motion or LITE draws still frames only; a hidden tab or
// an off-screen canvas draws (almost) nothing. three.js is Jarvis's copy.
import * as THREE from '../jarvis/three.module.min.js';
import { createStage, shaftGeo, latheGeo, boxGeo, laurelGeo, mergeParts, mat4 } from '../olympus/hero-stage.js';

const O = window.OLYMPUS || null;
const cv = document.getElementById('stage'), box = cv ? cv.parentElement : null;
const st = { H: null, slots: [], beams: [], still: false, dead: false, ready: false, columns: -1, laurels: 0 };
const CH = 3.4, R0 = 0.3, XS = 2.4, Z0 = 2.2, DZ = 2.6;

function build() {
  const lite = !!(O && O.lite && O.lite()), reduced = !!(O && O.reduced && O.reduced());
  st.still = lite || reduced;
  const H = createStage(box, { canvas: cv, reduce: st.still, tier: lite ? 'low' : undefined, palette: 'golden', hdri: 'golden', target: [0, 2.0, -2.6], dist: 13.6, height: 1.0, fov: 44, sway: 0.07, swayPeriod: 52, aspectK: 0.7,
    sunDir: [-0.55, 0.55, 0.62], shadowExt: 9, key: 2.6, sky: { sunX: 0.3, sunY: 0.75, templeX: 0.85, horizon: 0.66 }, fogNear: 20, fogFar: 46 });
  if (!H) throw new Error('no WebGL');
  const { kit, B } = H;
  H.key.color.setHex(0xffd7a0);                                   // the warm (about 3000 K) key light
  H.scene.fog = new THREE.Fog(H.scene.fog.color.getHex(), 20, 46);     // warm fog into the painted sky
  H.ground({ mat: 'paving', color: '#8f7d64', r: 30 });
  // the walk: a marble floor with a mosaic runner and key borders
  B.box('marble:uv', 0, 0.06, -2.4, 6.6, 0.12, 15, 0, '#d9cfbd');
  B.box('mosaic:uv', 0, 0.125, -2.4, 2.2, 0.01, 14.4, 0, '#8a6a52');
  H.paint('meander', { bg: '#e2d4b6', fg: '#7a3a22' });
  for (const sx of [-1.18, 1.18]) { const g = new THREE.PlaneGeometry(0.2, 14.4).rotateX(-Math.PI / 2); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 14.4 / (0.2 * 8), uv.getX(i)); B.add('paint:meander', g, mat4(sx, 0.132, -2.4, Math.PI / 2 * 0)); }
  // the far end: steps, the lectern with an open scroll, the wall
  B.steps({ x: 0, z: -8.0, w: 3.0, d: 1.3, n: 3, h: 0.42, run: 0.26, mat: 'marble:uv', color: '#e2d9c8' });
  B.lathe('marble:uv', [[0.32, 0], [0.32, 0.08], [0.2, 0.16], [0.16, 0.9], [0.24, 0.98], [0.34, 1.02], [0.0001, 1.02]], 0, 0.42, -8.0, 1, 20, '#ece4d6');
  B.add('wood:uv', boxGeo(0.95, 0.06, 0.62), mat4(0, 1.5, -7.98, 0, 1, -0.28), '#6b4a2a');
  B.add('cloth:uv', boxGeo(0.74, 0.012, 0.44), mat4(0, 1.54, -7.97, 0, 1, -0.28), '#efe3c4');
  for (const sx of [-1, 1]) B.add('cloth:uv', new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10), mat4(sx * 0.39, 1.56, -7.97, 0, 1, -0.28 + Math.PI / 2, 0), '#e6d6b0');
  const wz = -9.2;
  B.box('ashlar:uv', 0, 0.25, wz, 7.4, 0.5, 0.4, 0, '#c4b398');
  B.box('plaster:uv', 0, 0.5 + 0.6, wz, 7.4, 1.2, 0.36, 0, '#7a3122');
  B.box('plaster:uv', 0, 1.7 + 1.45, wz, 7.4, 2.9, 0.36, 0, '#d8c6a2');
  B.box('ashlar:uv', 0, 4.75, wz, 7.6, 0.3, 0.5, 0, '#c4b398');
  { const g = new THREE.PlaneGeometry(7.4, 0.32); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 7.4 / (0.32 * 8)); B.add('paint:meander', g, mat4(0, 1.88, wz + 0.185)); }
  for (const sx of [-1, 1]) B.brazier({ x: sx * 1.55, z: -7.4, h: 1.0, r: 0.24 });
  // the eight column places: a bronze ring (always), the column (fluted marble shaft, capital), a gold laurel
  for (let n = 0; n < 8; n++) { const row = n >> 1, x = (n & 1 ? 1 : -1) * XS, z = Z0 - row * DZ; B.lathe('bronze', [[0.0001, 0], [R0 * 1.55, 0], [R0 * 1.55, 0.08], [R0 * 1.3, 0.14], [0.0001, 0.14]], x, 0.12, z, 1, 24); }
  H.build(H.root);
  const geo = kit.geoLite;
  const colG = mergeParts([[shaftGeo({ h: CH - 0.32, r: R0, flutes: 20, lite: geo, rows: 2 }), mat4(0, 0, 0)],
    [latheGeo([[R0 * 0.82, 0], [R0 * 0.86, 0.04], [R0 * 1.02, 0.1], [R0 * 1.24, 0.17], [R0 * 1.3, 0.2], [0.0001, 0.2]], geo ? 12 : 24), mat4(0, CH - 0.32, 0)],
    [boxGeo(R0 * 2.75, 0.12, R0 * 2.75), mat4(0, CH - 0.06, 0)]]);
  const cols = new THREE.InstancedMesh(colG, kit.mat('marble', { color: '#eee7d9' }), 8);
  const lg = mergeParts(laurelGeo(0.36, { leaves: 22, gap: 0.7 }).map((g) => [g, null]));
  const laurels = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: 0x7f8a52, roughness: 0.6, metalness: 0.05 }), 8);      // olive laurels
  const beamG = boxGeo(0.62, 0.42, 1);
  const beams = new THREE.InstancedMesh(beamG, kit.mat('marble', { color: '#e8e0d0' }), 2);
  [cols, laurels, beams].forEach((m) => { m.frustumCulled = false; H.shade(m); H.root.add(m); });
  for (let n = 0; n < 8; n++) { const row = n >> 1, x = (n & 1 ? 1 : -1) * XS, z = Z0 - row * DZ; st.slots.push({ x, z, k: 1, on: false, wreath: false }); }
  st.cols = cols; st.laurelM = laurels; st.beamM = beams;
  H.blobs(st.slots.map((s) => [s.x, s.z, 0.55, 0.9, 0.135]), { opacity: 0.4 });
  st.motes = H.motes({ n: 40, center: [0, 2.2, -2], box: [6, 3.6, 12], size: 4, alpha: 0.4 });
  st.H = H;
}

function place() {
  const { cols, laurelM, beamM } = st;
  st.slots.forEach((s, n) => {
    const k = s.on ? Math.max(0.01, s.k) : 0.0001;
    cols.setMatrixAt(n, mat4(s.x, 0.26, s.z, n * 0.37, [s.on ? 1 : 0.0001, k, s.on ? 1 : 0.0001]));
    laurelM.setMatrixAt(n, mat4(s.x + (s.x < 0 ? 0.31 : -0.31), 0.26 + CH * 0.72 * k, s.z, s.x < 0 ? Math.PI / 2 : -Math.PI / 2, s.wreath && s.k > 0.98 ? 1 : 0.0001));
  });
  // each side's architrave spans its standing columns (front to back)
  [0, 1].forEach((side) => {
    const n = st.slots.filter((s, i) => (i & 1) === side && s.on && s.k > 0.98).length, x = (side ? 1 : -1) * XS;
    if (n < 1) { beamM.setMatrixAt(side, mat4(x, -5, 0, 0, 0.0001)); return; }
    const z0 = Z0 + 0.45, z1 = Z0 - (n - 1) * DZ - 0.45, len = z0 - z1;
    beamM.setMatrixAt(side, mat4(x, 0.26 + CH + 0.21, (z0 + z1) / 2, 0, [1, 1, len]));
  });
  cols.instanceMatrix.needsUpdate = true; laurelM.instanceMatrix.needsUpdate = true; beamM.instanceMatrix.needsUpdate = true;
}

/** columns = how many stand (2..8), laurels = how many of them wear a laurel */
function setHall(columns, laurels) {
  if (!st.H) return;
  const first = st.columns < 0, was = st.columns;
  st.columns = Math.max(0, Math.min(8, columns | 0)); st.laurels = Math.max(0, Math.min(8, laurels | 0));
  st.slots.forEach((s, n) => {
    const on = n < st.columns;
    s.on = on; s.wreath = on && n < st.laurels;
    s.k = on && !first && n >= was && !st.still ? 0 : 1;
  });
  place(); st.H.poke(2500);
}

function start() {
  if (!cv || !box) return;
  try { build(); } catch (_) { box.classList.add('off'); return; }
  st.H.start((dt, t) => {
    let moving = false;
    for (const s of st.slots) if (s.on && s.k < 1) { s.k = Math.min(1, s.k + dt * 1.5); moving = true; }
    if (moving) place();
    st.motes.tick(t);
    if (!st.ready) { st.ready = true; document.documentElement.setAttribute('data-stage', 'on'); }
    return moving;
  });
  window.addEventListener('lyceum:model', (e) => { try { const d = e.detail || {}; setHall(d.columns, d.laurels); } catch (_) { /* keep the last picture */ } });
  window.addEventListener('pagehide', () => { st.dead = true; try { st.H.dispose(); } catch (_) { /* gone */ } });
  const m = window.LYCEUM;
  if (m && m.S && m.S.ready) { const hall = m.C.hallFor(m.C.rankFor(m.C.totalXp(m.S.prog)).index); setHall(hall.columns, hall.laurels); } else setHall(2, 0);
  window.LYCEUM3D = { ready: () => st.ready, columns: () => st.columns, laurels: () => st.laurels, still: () => st.still, stats: () => (st.H ? st.H.stats() : null) };
  window.__heroStats = () => (st.H ? st.H.stats() : null);
}
start();
