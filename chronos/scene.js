// CHRONOS scene (ES module): a Greek clock tower on the OLYMPUS render core (docs/OLYMPUS_RENDER.md).
// In front of the tower the price path of one bot trade is drawn as a glowing ribbon, left to right = time, up = price.
//   the ribbon      grows with the playhead (a tube whose draw range follows it); a dim ghost shows the whole path so the scrub bar means something
//   candle dust     a thin bar per minute (low to high), revealed with the playhead
//   LIT levels      violet lines from the minute each level was made
//   the bot's steps small jewels at the price of each step (sweep, inducement, CISD...), popping in at their time
//   the trade       entry (green), stop (red), target (gold) lines from the entry, and a ring at the exit
//   the clock       the hands show the New York time of the playhead; a ring of light turns with it
// createChronos(canvas, { O }) -> { setTrade(trade, L), setU(u, tt, trade), onQuality(cb), lite(), quality(), stats(), dispose() }
// Reduced motion = a still scene redrawn only when something changes.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';
import * as SC from '../olympus/scenery.js';
import { dress } from './dress.js';
const AG_THEME = { sky: '#3a2c1e', fog: '#2a2118', emissive: '#c8a24a', bloom: '#c8a24a', accent: '#c8a24a' };   // AGORA: warm dusk, no violet rims

const W = 9.6, H = 6.6, X0 = -W / 2, Y0 = 0.2, ZC = 0;
const ACC = '#8b7259', CYAN = '#e0b060', GREEN = '#c8a24a', RED = '#c96a4a', GOLD = '#e0b060', VIOLET = '#e0b060';
const KIND = { sweep: '#c96a4a', idm: '#e0b060', disp: '#e0b060', cisd5: CYAN, limit: VIOLET, tap: '#e6dbca', cisd1: CYAN, entry: GREEN, be: '#f3ece0', setup: '#e0b060', session: '#8b7259', level: VIOLET };
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export function createChronos(canvas, { O = null } = {}) {
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#13100d');
  scene.fog = new THREE.FogExp2(0x171410, 0.018);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  let lite = false, dirty = true, qcb = null, dr = null, drawn = 0, frames = 0, stopped = false, raf = 0;
  const rc = createRenderer({ canvas, scene, camera, env: 'night', theme: AG_THEME, grade: { aberration: 0, saturation: 0.92 }, tint: ACC, exposure: 0.9, maxDpr: 1.75, bloom: { strength: 0.22, radius: 0.55, threshold: 0.95 },
    onQuality: (l) => { lite = l === 'low' || l === 'off'; if (dr) dr.setLite(lite); dirty = true; if (qcb) qcb(l); } });
  lite = rc.quality() === 'low' || rc.quality() === 'off';

  scene.add(new THREE.HemisphereLight('#8b7259', '#1b1713', 0.55));
  const key = new THREE.DirectionalLight('#e0b060', 0.95); key.position.set(-6, 12, 10); scene.add(key);
  const glow = new THREE.PointLight(ACC, 60, 40, 1.6); glow.position.set(0, 4, 3); scene.add(glow);
  const faceLight = new THREE.PointLight(GOLD, 40, 30, 1.6); faceLight.position.set(0, 8.2, -6); scene.add(faceLight);

  // ---- the sky and the temple (built once)
  const stars = M.starfield({ count: lite ? 500 : 1100, radius: 150, size: 2, color: '#f0e2c4' }); scene.add(stars);
  const neb = M.nebula({ colors: ['#8b7259', '#9c6b3c', '#e0b060'], count: 6, radius: 80, size: 90, opacity: 0.13 }); neb.position.y = 14; scene.add(neb);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), M.marble({ color: '#d8cfc1', vein: '#9c6b3c', gold: '#e0b060', scale: 0.5, roughness: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.6; scene.add(floor);
  const marble = M.marble({ color: '#ece3d7', vein: '#78726a', scale: 1.1 }), goldM = M.metal({ kind: 'gold' });
  // the tower: a stepped base, a shaft, the clock block, a pediment
  const TZ = -11;
  const tower = new THREE.Group(); tower.position.set(0, -0.6, TZ); scene.add(tower);
  const box = (w, h, d, y, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.y = y + h / 2; tower.add(m); return m; };
  box(9, 0.4, 5, 0, marble); box(7.8, 0.4, 4.2, 0.4, marble); box(6.6, 0.4, 3.6, 0.8, marble);
  box(3.6, 6.2, 2.6, 1.2, marble);
  box(4.4, 0.45, 3.2, 7.4, marble);                                     // the cornice under the clock block
  box(3.6, 3.6, 2.6, 7.85, marble);
  box(4.4, 0.4, 3.2, 11.45, marble);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2.6, 3, 1), marble); ped.rotation.set(Math.PI / 2, 0, Math.PI / 2); ped.scale.set(1, 1, 0.55);
  ped.position.set(0, 12.9, 0); ped.rotation.set(Math.PI / 2, Math.PI, 0); tower.add(ped);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2, 16), goldM); spire.position.y = 15.2; tower.add(spire);
  // the clock face on the +z side of the clock block
  const FZ = 1.36, FY = 9.65, face = new THREE.Group(); face.position.set(0, FY, FZ); tower.add(face);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), new THREE.MeshStandardMaterial({ color: '#191512', roughness: 0.35, metalness: 0.2, emissive: '#43392f', emissiveIntensity: 0.9 }));
  face.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 12, 56), goldM); face.add(rim);
  const tickGeo = new THREE.BoxGeometry(0.06, 0.26, 0.05), ticks = new THREE.InstancedMesh(tickGeo, M.neon({ color: GOLD, intensity: 2.2 }), 12), m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), e3 = new THREE.Euler();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 1.2;
    q.setFromEuler(e3.set(0, 0, -a)); p3.set(Math.sin(a) * r, Math.cos(a) * r, 0.04); m4.compose(p3, q, s3); ticks.setMatrixAt(i, m4);
  }
  face.add(ticks);
  const hand = (len, w, color) => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.05), M.neon({ color, intensity: 2.6 })); m.position.y = len / 2 - 0.1; g.add(m); g.position.z = 0.07; face.add(g); return g; };
  const hourH = hand(0.78, 0.1, GOLD), minH = hand(1.14, 0.065, CYAN);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), goldM); hub.position.z = 0.1; face.add(hub);
  // a ring of light that turns with the playhead, behind the tower
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.05, 6, lite ? 64 : 140), M.neon({ color: ACC, intensity: 2, fog: true }));
  ring.position.set(0, 8, TZ - 2.5); scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.03, 6, lite ? 56 : 120), M.neon({ color: '#e0b060', intensity: 1.4, fog: true }));
  ring2.position.copy(ring.position); scene.add(ring2);
  // colonnade: two rows of fluted columns going back
  const colGeo = new THREE.CylinderGeometry(0.34, 0.4, 7, lite ? 10 : 18), cols = new THREE.InstancedMesh(colGeo, marble, 12);
  const capGeo = new THREE.BoxGeometry(1.1, 0.3, 1.1), caps = new THREE.InstancedMesh(capGeo, marble, 12);
  let ci = 0;
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
    const x = sx * (5.6 + k * 0.15), z = 1 - k * 3.2;
    p3.set(x, 2.9, z); q.identity(); m4.compose(p3, q, s3); cols.setMatrixAt(ci, m4);
    p3.y = 6.5; m4.compose(p3, q, s3); caps.setMatrixAt(ci++, m4);
  }
  scene.add(cols, caps);

  // ---- the trade (rebuilt on setTrade)
  const dyn = new THREE.Group(); scene.add(dyn);
  const MAXB = 520;
  const dust = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: hdr(VIOLET, 1.3), transparent: true, opacity: 0.5 }), MAXB);
  dust.count = 0; dyn.add(dust);
  const ribbonMat = new THREE.MeshBasicMaterial({ color: hdr(CYAN, 3.4) });
  const headMat = new THREE.MeshBasicMaterial({ color: hdr(CYAN, 5) });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), headMat);
  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: hdr(CYAN, 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
  headGlow.scale.set(2.2, 2.2, 1); head.add(headGlow); scene.add(head);
  const playhead = new THREE.Mesh(new THREE.PlaneGeometry(0.03, H + 1), new THREE.MeshBasicMaterial({ color: hdr(ACC, 1.6), transparent: true, opacity: 0.35, depthWrite: false }));
  playhead.position.z = -0.1; scene.add(playhead);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.12, 2.4), M.metal({ kind: 'gunmetal', color: '#2c251f', roughness: 0.3, clearcoat: 1 }));
  pad.position.set(0, Y0 - 0.1, -0.2); scene.add(pad);

  const T = { trade: null, L: null, pts: [], tubSeg: 1, radial: 6, ribbon: null, ghost: null, marks: [], lines: [], exitRing: null, tt: 0, u: 0, shown: 0 };
  const matCache = {};
  const neon = (c, k = 3) => matCache[c + k] || (matCache[c + k] = M.neon({ color: c, intensity: k, fog: true }));
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const gx = (L, tt) => X0 + W * L.x(tt), gy = (L, p) => Y0 + H * L.y(p);

  function clearDyn() {
    for (const o of [T.ribbon, T.ghost, T.exitRing, ...T.marks.map((m) => m.mesh), ...T.lines.map((l) => l.mesh)]) {
      if (!o) continue;
      dyn.remove(o);
      if (o.geometry && o.geometry !== unitBox) o.geometry.dispose();
    }
    T.ribbon = T.ghost = T.exitRing = null; T.marks = []; T.lines = [];
  }
  function line(L, x0, x1, price, color, k, th, tMin, kind) {
    const mesh = new THREE.Mesh(unitBox, neon(color, k)), y = gy(L, price);
    mesh.scale.set(Math.max(0.05, x1 - x0), th, th); mesh.position.set((x0 + x1) / 2, y, ZC + 0.02); mesh.visible = false; dyn.add(mesh);
    T.lines.push({ mesh, tMin, kind, x0, x1 });
  }

  function setTrade(trade, L) {
    clearDyn();
    Object.assign(T, { trade, L });
    const b = trade.bars, n = b.t.length, step = Math.max(1, Math.ceil(n / 260));
    // the ribbon through the closes (thinned past ~260 points)
    const pts = [];
    for (let i = 0; i < n; i += step) pts.push(new THREE.Vector3(gx(L, b.t[i]), gy(L, b.c[i]), ZC));
    if (pts[pts.length - 1].x !== gx(L, b.t[n - 1])) pts.push(new THREE.Vector3(gx(L, b.t[n - 1]), gy(L, b.c[n - 1]), ZC));
    T.pts = pts;
    T.cum = [0]; for (let i = 1; i < pts.length; i++) T.cum.push(T.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    T.tubSeg = Math.max(8, pts.length * 2);
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), T.tubSeg, 0.11, T.radial);
    T.ribbon = new THREE.Mesh(geo, ribbonMat); dyn.add(T.ribbon);
    T.ghost = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: hdr(VIOLET, 1.2), transparent: true, opacity: 0.16 })); dyn.add(T.ghost);
    // candle dust
    const bw = Math.max(0.012, (W / n) * 0.5);
    dust.count = Math.min(n, MAXB);
    for (let i = 0; i < dust.count; i++) {
      const hi = gy(L, b.h[i]), lo = gy(L, b.l[i]);
      p3.set(gx(L, b.t[i]), (hi + lo) / 2, ZC - 0.12); s3.set(bw, Math.max(0.012, hi - lo), 0.02); m4.compose(p3, q.identity(), s3); dust.setMatrixAt(i, m4);
    }
    s3.set(1, 1, 1); dust.instanceMatrix.needsUpdate = true; dust.userData.t = b.t; dust.count = 0;
    // levels, then the trade's lines
    const xEnd = gx(L, L.T1);
    for (const lv of trade.levels) if (lv.px >= L.lo && lv.px <= L.hi) line(L, gx(L, Math.max(lv.t, L.T0)), xEnd, lv.px, VIOLET, 1.5, 0.018, lv.t, 'level');
    const xe = gx(L, trade.entry.t);
    line(L, xe, xEnd, trade.entry.px, GREEN, 2.4, 0.03, trade.entry.t, 'entry');
    if (trade.stop != null) line(L, xe, xEnd, trade.stop, RED, 3, 0.04, trade.entry.t, 'stop');
    if (trade.target != null) line(L, xe, xEnd, Math.max(L.lo, Math.min(L.hi, trade.target)), GOLD, L.targetShown ? 3.2 : 1.2, L.targetShown ? 0.045 : 0.025, trade.entry.t, 'target');
    // the bot's steps as jewels
    for (const e of trade.events) {
      if (!e.text || e.k === 'levels' || e.k === 'session') continue;
      const px = e.px != null ? e.px : trade.bars.c[Math.min(n - 1, Math.max(0, trade.bars.t.findIndex((t) => t >= e.t)))] ;
      const col = KIND[e.k] || VIOLET, big = e.k === 'entry' || e.k === 'exit';
      const mesh = new THREE.Mesh(big ? new THREE.OctahedronGeometry(0.2, 0) : new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: hdr(e.k === 'exit' ? (trade.exit.outcome === 'win' ? GOLD : RED) : col, 4) }));
      mesh.position.set(gx(L, e.t), gy(L, Number.isFinite(px) ? px : trade.entry.px), ZC + 0.06); mesh.visible = false; dyn.add(mesh);
      T.marks.push({ mesh, t: e.t, big });
    }
    const exitCol = trade.exit.outcome === 'win' ? GOLD : RED;
    T.exitRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: hdr(exitCol, 4) }));
    T.exitRing.position.set(gx(L, trade.exit.t), gy(L, trade.exit.px), ZC + 0.08); T.exitRing.visible = false; dyn.add(T.exitRing);
    const tint = trade.exit.outcome === 'win' ? GOLD : RED;
    T.tint = tint; T.exitCol = exitCol;
    setU(T.u, L.T0, trade);
  }

  function arcFrac(x) {
    const p = T.pts, c = T.cum, tot = c[c.length - 1] || 1;
    if (x <= p[0].x) return 0;
    if (x >= p[p.length - 1].x) return 1;
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].x <= x) lo = m; else hi = m; }
    const f = (x - p[lo].x) / Math.max(1e-9, p[hi].x - p[lo].x);
    return (c[lo] + (c[hi] - c[lo]) * f) / tot;
  }

  function setU(u, tt, trade) {
    const L = T.L;
    if (!L || !T.trade) return;
    T.u = u; T.tt = tt;
    const tr = trade || T.trade, b = tr.bars;
    // ribbon: draw range by playhead (tubular segments)
    const g = arcFrac(gx(L, tt));                                            // TubeGeometry is spaced by arc length, not by x
    const segs = Math.floor(g * T.tubSeg + 0.0001);
    T.ribbon.geometry.setDrawRange(0, segs * T.radial * 6);
    let k = 0; while (k < b.t.length && b.t[k] <= tt) k++;
    dust.count = Math.min(k, MAXB);
    // the head rides the path
    let i = Math.max(0, Math.min(b.t.length - 1, k - 1)), j = Math.min(b.t.length - 1, i + 1);
    const fr = j > i ? Math.max(0, Math.min(1, (tt - b.t[i]) / (b.t[j] - b.t[i]))) : 0, price = b.c[i] + (b.c[j] - b.c[i]) * fr;
    head.position.set(gx(L, Math.min(tt, b.t[b.t.length - 1])), gy(L, price), ZC);
    playhead.position.x = head.position.x;
    T.shown = 0;
    for (const m of T.marks) {
      const a = ease((tt - m.t) / 300);
      m.mesh.visible = tt >= m.t;
      if (m.mesh.visible) { m.mesh.scale.setScalar(0.2 + 0.8 * a + (m.big ? 0.4 : 0)); m.mesh.rotation.y = tt / 500; T.shown++; }
    }
    for (const l of T.lines) {
      const on = tt >= l.tMin;
      l.mesh.visible = on;
      if (on) { const w = Math.max(0.05, (l.kind === 'level' ? 1 : ease((tt - l.tMin) / 400)) * (l.x1 - l.x0)); l.mesh.scale.x = w; l.mesh.position.x = l.x0 + w / 2; }
    }
    T.exitRing.visible = tt >= tr.exit.t; T.exitRing.rotation.y = tt / 300;
    // the end tints the ribbon and the head
    const done = tt >= tr.exit.t, tint = done ? T.exitCol : CYAN;
    ribbonMat.color.copy(hdr(tint, 3.4)); headMat.color.copy(hdr(tint, 5)); headGlow.material.color.copy(hdr(tint, 1.5));
    // the clock: the New York time of the playhead; the ring turns with it
    const sec = (((tt + tr.off) % 86400) + 86400) % 86400, hrs = (sec / 3600) % 12;
    hourH.rotation.z = -(hrs / 12) * Math.PI * 2; minH.rotation.z = -((sec % 3600) / 3600) * Math.PI * 2;
    ring.rotation.z = (tt / 1800) * 0.5; ring2.rotation.z = -(tt / 1800) * 0.8;
    faceLight.color.set(done ? T.exitCol : GOLD);
    if (dr) dr.setTime(tt);
    dirty = true;
  }

  // ---- camera: a gentle sway (still under reduced motion), a drag to look around
  const cam = { th: 0, ph: 0.1, dist: 22, drag: null };
  function placeCamera(t) {
    const th = cam.th + (reduced() || cam.drag ? 0 : Math.sin(t * 0.14) * 0.1);
    camera.position.set(Math.sin(th) * Math.cos(cam.ph) * cam.dist, 3.2 + Math.sin(cam.ph) * cam.dist, Math.cos(th) * Math.cos(cam.ph) * cam.dist);
    camera.lookAt(0, 4.4, -2);
  }
  canvas.addEventListener('pointerdown', (e) => { cam.drag = { x: e.clientX, y: e.clientY, t: cam.th, p: cam.ph }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!cam.drag) return;
    cam.th = Math.max(-0.9, Math.min(0.9, cam.drag.t - (e.clientX - cam.drag.x) * 0.005));
    cam.ph = Math.max(0, Math.min(0.5, cam.drag.p + (e.clientY - cam.drag.y) * 0.003)); dirty = true;
  });
  const end = () => { cam.drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  let gapAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || (O && O.hidden())) return;                            // hidden / covered: no JS, no frame (docs/OLYMPUS_PERF.md)
    const gap = O && O.frameGap ? O.frameGap() : 0;                       // idle 30 / 15 fps, battery saver, 3D Off 2 fps; a touch = full rate
    if (gap && now - gapAt < gap - 3) return;
    gapAt = now;
    const still = reduced(), t = now / 1000;
    const a = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    cam.dist = a < 0.6 ? 25 : a < 1 ? 20 : 15;
    const fov = a < 0.6 ? 62 : a < 1 ? 54 : 46; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (still && !dirty) return;
    stars.update(t, rc.renderer.getPixelRatio()); neb.update(t);
    if (dr) { try { dr.update(t, still); } catch (e) { dr = null; } }
    const k = 1 + (still ? 0 : Math.sin(t * 4) * 0.14); head.scale.setScalar(k);
    placeCamera(t);
    if (rc.render()) drawn++;
    frames++; dirty = false;
  }
  try { dr = dress({ scene, camera, tower, face, rim, spire, FZ, FY, TZ, lite, marble }); } catch (e) { dr = null; /* the plain tower */ }
  placeCamera(0);
  raf = requestAnimationFrame(frame);
  return {
    setTrade, setU, onQuality(cb) { qcb = typeof cb === 'function' ? cb : null; }, lite: () => lite, quality: () => rc.quality(),
    stats: () => ({ dress: dr ? dr.stats() : null, frames, drawn, quality: rc.quality(), passes: rc.passes().length, marks: T.marks.length, marksShown: T.shown, lines: T.lines.length, linesShown: T.lines.filter((l) => l.mesh.visible).length,
      dust: dust.count, ribbonSegs: T.ribbon ? T.ribbon.geometry.drawRange.count / (T.radial * 6) : 0, tubSeg: T.tubSeg, exitShown: !!(T.exitRing && T.exitRing.visible),
      hands: [hourH.rotation.z, minH.rotation.z], head: [head.position.x, head.position.y] }),
    dispose() { stopped = true; cancelAnimationFrame(raf); if (dr) dr.dispose(); rc.dispose(); },
  };
}
