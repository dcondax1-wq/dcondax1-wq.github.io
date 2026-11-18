// PHEME's marble scroll rack (three.js r160 from ../jarvis/, the OLYMPUS render core): up to eight fluted marble columns on a stepped marble
// base with a painted Greek-key band, each crowned with a gilded capital and a rolled papyrus scroll. A column's height is how far NQ travelled
// on one past release day (oldest on the left); the gilded rail on two bronze posts behind them is an ordinary day, so a tall column rose above
// it. HISTORY, not a forecast. Tap a column to open that day's row (the chosen one stands on a gold ring).
// QA Round 6 bug 8: the env-kit marble / cloth scans and HDRI light via olympus/hero-stage.js (dress), a painted hall backdrop, contact shadows.
// Light by design: 8 columns in three instanced draws, bloom <= .25, a dpr cap of 1.5, no frame while hidden. If WebGL or the render core is
// missing, the page draws the flat twin.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { dress, shaftGeo, latheGeo, boxGeo, mergeParts, mat4 } from '../olympus/hero-stage.js';

const GOLD = '#c8a24a', BRONZE = '#9c6b3c';
const MAXH = 2.3, R0 = 0.24;

function createRack(canvas, opts) {
  const o = opts || {}, O = window.OLYMPUS || null, RM = o.reduced === true;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a140e');
  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.1, 80);
  const rc = createRenderer({ canvas, scene, camera, maxDpr: 1.5, tint: GOLD, theme: { sky: '#2b2018', fog: '#2a2018', emissive: GOLD, bloom: '#e0b060', accent: GOLD }, bloom: { strength: 0.2, radius: 0.4, threshold: 1.0 } });
  const lite = rc.quality() === 'low' || rc.quality() === 'off';
  const D = dress({ rc, scene, camera, palette: 'hall', hdri: 'golden', envI: 0.8, sunDir: [-0.45, 0.7, 0.6], key: 2.4, rim: 0.9, shadowExt: 5, sky: { sunX: 0.5, sunY: 0.55, temple: false, cypress: false, disc: false }, fogNear: 12, fogFar: 30 });
  const { kit, B } = D;
  const N = 8, GAP = 0.92, x0 = -((N - 1) * GAP) / 2;
  // the base: a stepped marble block with a key band; a mosaic floor around it
  D.ground({ mat: 'mosaic', color: '#6e5642', r: 16 });
  const top = D.block({ w: N * GAP + 0.5, d: 1.6, steps: 2, stepH: 0.12, run: 0.22, drum: 0.3, bandFg: '#6e2f1c' });
  // the ordinary-day rail stands on two bronze posts behind the columns; posts are built once at full height, the rail moves
  for (const sx of [-1, 1]) { B.cyl('bronze', sx * (N * GAP / 2 + 0.05), top + 1.6, -0.62, 0.035, 0.045, 3.2, 10); B.lathe('gold', [[0.0001, 0], [0.07, 0], [0.07, 0.03], [0.0001, 0.09]], sx * (N * GAP / 2 + 0.05), top + 3.2, -0.62, 1, 12); }
  D.build(scene);
  const geo = kit.geoLite;
  const capG = mergeParts([[latheGeo([[R0 * 0.82, 0], [R0 * 1.02, 0.05], [R0 * 1.26, 0.1], [R0 * 1.34, 0.12], [0.0001, 0.12]], geo ? 12 : 22)], [boxGeo(R0 * 2.7, 0.07, R0 * 2.7), mat4(0, 0.155, 0)]]);
  const scrollG = mergeParts([[new THREE.CylinderGeometry(0.11, 0.11, 0.62, geo ? 10 : 16), mat4(0, 0, 0, 0, 1, 0, Math.PI / 2)],
    [new THREE.CylinderGeometry(0.035, 0.035, 0.76, 8), mat4(0, 0, 0, 0, 1, 0, Math.PI / 2)]]);
  const shafts = new THREE.InstancedMesh(shaftGeo({ h: 1, r: R0, flutes: 16, lite: geo, rows: 1 }), kit.mat('marble', { color: '#efe8da' }), N);
  const caps = new THREE.InstancedMesh(capG, kit.mat('gold'), N);
  const scrolls = new THREE.InstancedMesh(scrollG, kit.mat('cloth', { color: '#e3cf9c' }), N);
  [shafts, caps, scrolls].forEach((m) => { m.frustumCulled = false; D.shade(m); scene.add(m); });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R0 * 1.55, 0.03, 8, 32).rotateX(Math.PI / 2), kit.mat('gold')); ring.visible = false; scene.add(ring);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, N * GAP + 0.1, 12).rotateZ(Math.PI / 2), kit.mat('gold')); rail.position.set(0, top + 0.5, -0.62); scene.add(rail);
  const blobs = D.blobs(Array.from({ length: N }, (x, i) => [x0 + i * GAP, 0, 0.36, 1, top + 0.01]), { opacity: 0.4 });
  D.tune();
  const cols = [];
  for (let i = 0; i < N; i++) cols.push({ position: new THREE.Vector3(x0 + i * GAP, 0, 0), visible: false, userData: { i, h: 0, want: 0 } });

  let sel = -1, dirty = true, disposed = false, lineWant = 0.5, lineH = 0.5;
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hitP = new THREE.Vector3();
  function layout() {
    cols.forEach((g, j) => {
      const u = g.userData, h = Math.max(0.05, u.h), on = g.visible ? 1 : 0.0001, k = u.i === sel ? 1.08 : 1, x = g.position.x;
      shafts.setMatrixAt(j, mat4(x, top, 0, 0, [on * k, h, on * k]));
      caps.setMatrixAt(j, mat4(x, top + h, 0, 0, on * k));
      scrolls.setMatrixAt(j, mat4(x, top + h + 0.3, 0.02, 0.12, on * k));
    });
    shafts.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; scrolls.instanceMatrix.needsUpdate = true;
    rail.position.y = top + lineH;
    const s = cols.find((g) => g.visible && g.userData.i === sel); ring.visible = !!s; if (s) ring.position.set(s.position.x, top + 0.04, 0);
    if (blobs) { cols.forEach((g, i) => blobs.setMatrixAt(i, mat4(g.position.x, top + 0.01, 0, 0, [g.visible ? 0.72 : 0.0001, 1, g.visible ? 0.72 : 0.0001]))); blobs.instanceMatrix.needsUpdate = true; }
  }
  function frame() {
    // the subject: the rack's width and the tallest column (the camera steps back on a narrow canvas so it always fits)
    const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), w = N * GAP + 1.2, hgt = top + MAXH + 0.6;
    const d = Math.max((hgt / 2) / Math.tan(vf / 2), (w / 2) / Math.tan(hf / 2)) * 1.06 + 1.0;
    camera.position.set(0, hgt / 2 + d * 0.16, d); camera.lookAt(0, hgt / 2 - 0.05, 0);
  }
  function resize() { const w = canvas.clientWidth || 320, h = canvas.clientHeight || 200; camera.aspect = w / h; camera.updateProjectionMatrix(); rc.resize(w, h); D.backdrop(w, h); frame(); dirty = true; }
  function pick(ev) {
    const r = canvas.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1)); ray.setFromCamera(ptr, camera);
    if (!ray.ray.intersectPlane(plane, hitP)) return;
    const g = cols.find((c) => c.visible && Math.abs(c.position.x - hitP.x) < GAP / 2 && hitP.y > top - 0.2 && hitP.y < top + c.userData.h + 0.6);
    if (g && o.onPick) o.onPick(g.userData.i);
  }
  canvas.addEventListener('pointerup', pick);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; if (ro) ro.observe(canvas);
  resize(); layout();
  D.envReady.then(() => { dirty = true; }); setTimeout(() => { dirty = true; }, 1500); setTimeout(() => { dirty = true; }, 4000);

  let last = performance.now(), lastTick = 0;
  function loop(now) {
    if (disposed) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    const gap = O && O.frameGap ? O.frameGap() : 0;
    if ((O ? O.hidden() : document.hidden) || (gap && now - lastTick < gap - 3)) return;
    lastTick = now;
    let moving = false; const k = RM ? 1 : Math.min(1, dt * 4);
    for (const g of cols) { const u = g.userData; if (Math.abs(u.want - u.h) > 0.002) { u.h += (u.want - u.h) * k; moving = true; } }
    if (Math.abs(lineWant - lineH) > 0.002) { lineH += (lineWant - lineH) * k; moving = true; }
    if (moving || dirty) { layout(); rc.render(); dirty = false; }
  }
  requestAnimationFrame(loop);
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });
  return {
    lite, count: () => cols.filter((g) => g.visible).length, quality: () => rc.quality(), passes: () => rc.passes(), stats: () => D.stats(),
    /** values = the day ranges oldest first (up to 8), typical = an ordinary day: both in points */
    set(values, typical) {
      const v = (values || []).slice(-N), top0 = Math.max(1, ...v, typical || 0), scale = MAXH / top0;
      cols.forEach((g, i) => { const slot = i - (N - v.length); g.visible = slot >= 0; if (slot >= 0) { g.userData.want = v[slot] * scale; g.userData.src = slot; if (RM) g.userData.h = g.userData.want; } g.userData.i = slot >= 0 ? slot : -1; });
      lineWant = Math.max(0.05, (typical || 0) * scale); if (RM) lineH = lineWant; dirty = true;
    },
    select(i) { sel = i; dirty = true; }, get selected() { return sel; },
    heights() { return cols.filter((g) => g.visible).map((g) => Math.round(g.userData.want * 1000) / 1000); },
    line() { return Math.round(lineWant * 1000) / 1000; },
    screenOf(i) { const g = cols.find((x) => x.visible && x.userData.i === i); if (!g) return null; const v = new THREE.Vector3(g.position.x, top + g.userData.want / 2, 0).project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, front: v.z < 1 }; },
    dispose() { disposed = true; canvas.removeEventListener('pointerup', pick); if (ro) ro.disconnect(); try { D.dispose(); rc.dispose(); } catch (_) { /* gone */ } },
  };
}
window.PHEME_RACK = { createRack };   // read by pheme.js (a second module tag, so a failed 3D load never stops the page)
