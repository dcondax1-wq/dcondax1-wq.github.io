// NQ PRICE LANDSCAPE (NQ v4 hero, 2026-11-20, owner: "it should look 3D, have crazy effects ... it should look really good"; it must stay fast).
// Today's 5-minute NQ bars as a glowing 3D ridge: the price is the height (normalised to the day's range), up bars warm green / gold, down
// bars coral; a gold light trail runs along the price line toward the newest bar; a glowing beacon stands at every trade (green = a win,
// coral = a loss, pulsing gold = still open); embers drift up; a gold arc on the floor shows the fleet's progress to its next goal (data.goal
// 0..1); the camera sways slowly. burst('win' | 'goal') throws one shower of sparks from the newest trade (or the centre).
// Optional ES module, loaded late by olympus/lazy3d.js. Plain three.js (no HDR, no textures to download, no shadows): one draw per kind
// (one ridge mesh, one line, one instanced beacon mesh, three point clouds). A phone / Save-Data: DPR <= 1.5, no antialias, 150 particles,
// ~30 fps; desktop: DPR <= 2, 400 particles. It stops drawing while off-screen or while the tab is hidden; prefers-reduced-motion = one
// still frame (no sway, no trail motion, no embers, burst does nothing). Empty bars: a calm made-up ridge (it never looks broken; never
// labelled as prices). Read only: no fetch, no storage, no DOM text. Registers window.NQLAND = { mount(box, data), update(data),
// burst(kind), dispose() } and fires 'nqland'. mount returns false (the box untouched) when WebGL cannot be made.
import * as THREE from '../jarvis/three.module.min.js';

const BG = 0x070b14, GOLD = new THREE.Color('#22d3ee'), UP = new THREE.Color('#9fd07a'), UPG = new THREE.Color('#3b82f6'), DN = new THREE.Color('#ef7f62');
const WIN = new THREE.Color('#7ee08a'), LOSS = new THREE.Color('#ff6f5a'), OPEN = new THREE.Color('#ffd36b');
const W = 12, HMAX = 2.6, ROWS = 14, DEPTH = 3.2;
let R = null;

const media = (q) => { try { return matchMedia(q).matches; } catch (_) { return false; } };
const isPhone = () => media('(max-width: 600px)') || !!(navigator.connection && navigator.connection.saveData);
const reduced = () => media('(prefers-reduced-motion: reduce)');

function glowTex() {                                   // a soft round dot, drawn here (nothing downloaded)
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(200,240,255,.75)'); r.addColorStop(1, 'rgba(150,220,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function points(n, size, tex) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}

/** the day as heights: [{x, y, up}] (x across the width, y 0.15..HMAX) + a price -> y map; no bars = a calm made-up ridge */
function shape(data) {
  const cs = (data && Array.isArray(data.candles) ? data.candles : []).filter((c) => c && Number.isFinite(+c.close));
  if (cs.length < 2) {
    const pts = []; for (let i = 0; i < 90; i++) { const t = i / 89; pts.push({ x: (t - 0.5) * W, y: 0.9 + 0.45 * Math.sin(t * 5.1) + 0.25 * Math.sin(t * 13.7 + 1), up: Math.sin(t * 9) > 0, time: null }); }
    return { pts, y: () => 1.2, placeholder: true };
  }
  let lo = Infinity, hi = -Infinity;
  for (const c of cs) { lo = Math.min(lo, +c.low || +c.close, +c.close); hi = Math.max(hi, +c.high || +c.close, +c.close); }
  const span = Math.max(hi - lo, 1e-6), y = (p) => 0.15 + ((p - lo) / span) * (HMAX - 0.15), n = cs.length;
  return { pts: cs.map((c, i) => ({ x: (i / (n - 1) - 0.5) * W, y: y(+c.close), up: +c.close >= +c.open, time: c.time })), y, placeholder: false };
}

function ridgeGeo(pts) {                               // a terrain strip: the price line is the crest (z = 0), falling away front and back
  const n = pts.length, pos = new Float32Array(n * ROWS * 3), col = new Float32Array(n * ROWS * 3), idx = [], c = new THREE.Color();
  for (let i = 0; i < n; i++) for (let j = 0; j < ROWS; j++) {
    const z = (j / (ROWS - 1) - 0.5) * 2 * DEPTH, f = Math.exp(-(z * z) / 2.2), k = (i * ROWS + j) * 3;
    const wob = 0.05 * Math.sin(i * 0.7 + j * 1.3);
    pos[k] = pts[i].x; pos[k + 1] = Math.max(0, pts[i].y * f + wob * (1 - f)); pos[k + 2] = z;
    c.copy(pts[i].up ? UP : DN).lerp(UPG, pts[i].up ? 0.35 : 0).multiplyScalar(0.3 + 0.95 * f);
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < ROWS - 1; j++) { const a = i * ROWS + j, b = a + ROWS; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function mount(box, data) {
  if (R) dispose();
  if (!box) return false;
  const phone = isPhone(), still = reduced();
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: !phone, alpha: false, powerPreference: 'low-power' }); } catch (e) { return false; }
  if (!renderer || !renderer.getContext || !renderer.getContext()) return false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(BG, 1);
  const cv = renderer.domElement; cv.style.display = 'block'; cv.style.width = '100%'; cv.style.height = '100%'; cv.setAttribute('aria-hidden', 'true');
  box.appendChild(cv);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(BG, 14, 34);
  const camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 60);
  scene.add(new THREE.HemisphereLight(0xfff0d0, 0x2a1d0c, 1.3));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.6); sun.position.set(-4, 6, 5); scene.add(sun);
  const tex = glowTex(), NP = phone ? 150 : 400;
  // the floor: a faint gold grid, and the goal arc on it
  const grid = new THREE.GridHelper(26, 26, 0x4a3a1e, 0x2a2014); grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);
  const ridgeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25, flatShading: true, emissive: 0x2a1a08, emissiveIntensity: 1 });
  const ridge = new THREE.Mesh(new THREE.BufferGeometry(), ridgeMat); scene.add(ridge);
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(line);
  const beaconG = new THREE.CylinderGeometry(0.035, 0.07, 1, 8, 1, true); beaconG.translate(0, 0.5, 0);
  const beacons = new THREE.InstancedMesh(beaconG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), 24);
  beacons.count = 0; beacons.frustumCulled = false; scene.add(beacons);
  const caps = points(24, phone ? 0.75 : 0.6, tex); scene.add(caps);            // the glow on top of each beacon
  const trail = points(28, 0.42, tex); scene.add(trail);                         // the light trail's head and its fading tail
  const embers = points(NP, 0.13, tex); scene.add(embers);
  const sparks = points(phone ? 90 : 160, 0.22, tex); scene.add(sparks);
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  arc.rotation.x = -Math.PI / 2; arc.position.set(0, 0.01, -1.2); scene.add(arc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.2, 6.28, 96), new THREE.MeshBasicMaterial({ color: 0x5a4524, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.005, -1.2); scene.add(ring);
  // embers: random spots over the ridge, drifting up and fading
  const eP = embers.geometry.attributes.position.array, eV = new Float32Array(NP), eL = new Float32Array(NP);
  const seed = (i) => { eP[i * 3] = (Math.random() - 0.5) * W; eP[i * 3 + 1] = Math.random() * 0.6; eP[i * 3 + 2] = (Math.random() - 0.5) * 3; eV[i] = 0.25 + Math.random() * 0.5; eL[i] = Math.random(); };
  for (let i = 0; i < NP; i++) seed(i);
  const sN = sparks.geometry.attributes.position.count, sV = new Float32Array(sN * 3), sL = new Float32Array(sN);

  R = { box, renderer, scene, camera, ridge, line, beacons, caps, trail, embers, sparks, arc, tex, phone, still, eV, eL, seed, sV, sL, sN, NP,
    shape: null, trades: [], t0: performance.now(), last: 0, raf: 0, onScreen: true, io: null, ro: null, goal: 0 };
  const size = () => { const w = Math.max(1, box.clientWidth), h = Math.max(1, box.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); frame(performance.now(), true); };
  R.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null; if (R.ro) R.ro.observe(box);
  R.io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { if (!R) return; R.onScreen = es.some((e) => e.isIntersecting); kick(); }) : null;
  if (R.io) R.io.observe(box);
  R.vis = () => kick(); document.addEventListener('visibilitychange', R.vis);
  update(data);
  size();
  kick();
  return true;
}

function update(data) {
  if (!R) return;
  const S = shape(data), pts = S.pts;
  R.shape = S;
  R.ridge.geometry.dispose(); R.ridge.geometry = ridgeGeo(pts);
  const lp = new Float32Array(pts.length * 3); pts.forEach((p, i) => { lp[i * 3] = p.x; lp[i * 3 + 1] = p.y + 0.03; lp[i * 3 + 2] = 0; });
  R.line.geometry.dispose(); R.line.geometry = new THREE.BufferGeometry(); R.line.geometry.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  // trades: the bar at (or just before) each trade's time; its price on the same height scale
  const tr = S.placeholder ? [] : (Array.isArray(data && data.trades) ? data.trades : []).filter((t) => t && Number.isFinite(+t.time)).slice(-24);
  R.trades = tr.map((t) => {
    let i = 0; for (let k = 0; k < pts.length; k++) if (pts[k].time <= +t.time) i = k;
    const y = Number.isFinite(+t.price) ? S.y(+t.price) : pts[i].y;
    return { x: pts[i].x, y: Math.max(0.1, y), col: t.open ? OPEN : (+t.usd || 0) >= 0 ? WIN : LOSS, open: !!t.open };
  });
  R.beacons.count = R.trades.length;
  const cp = R.caps.geometry.attributes.position.array, cc = R.caps.geometry.attributes.color.array;
  cp.fill(0); cc.fill(0);
  R.trades.forEach((b, i) => { R.beacons.setColorAt(i, b.col); cp[i * 3] = b.x; cp[i * 3 + 1] = b.y + 0.9; cp[i * 3 + 2] = 0; cc[i * 3] = b.col.r; cc[i * 3 + 1] = b.col.g; cc[i * 3 + 2] = b.col.b; });
  if (R.beacons.instanceColor) R.beacons.instanceColor.needsUpdate = true;
  R.caps.geometry.attributes.position.needsUpdate = R.caps.geometry.attributes.color.needsUpdate = true;
  R.caps.geometry.setDrawRange(0, R.trades.length);
  const g = Math.max(0, Math.min(1, +(data && data.goal) || 0)); R.goal = g;
  R.arc.geometry.dispose(); R.arc.geometry = g > 0.002 ? new THREE.RingGeometry(6.1, 6.4, 96, 1, Math.PI / 2, -g * Math.PI * 2) : new THREE.BufferGeometry();
  frame(performance.now(), true);
}

function burst(kind) {
  if (!R || R.still) return;
  const b = R.trades[R.trades.length - 1], o = b ? [b.x, b.y + 0.9, 0] : [0, 1.6, 0];
  const p = R.sparks.geometry.attributes.position.array, c = R.sparks.geometry.attributes.color.array, col = kind === 'goal' ? GOLD : WIN;
  for (let i = 0; i < R.sN; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = 1.6 + Math.random() * 2.6, r = Math.sqrt(1 - u * u);
    p[i * 3] = o[0]; p[i * 3 + 1] = o[1]; p[i * 3 + 2] = o[2];
    R.sV[i * 3] = Math.cos(a) * r * s; R.sV[i * 3 + 1] = Math.abs(u) * s + 1.2; R.sV[i * 3 + 2] = Math.sin(a) * r * s; R.sL[i] = 1;
    const k = i % 3 ? col : GOLD; c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
  }
  kick();
}

const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), SC = new THREE.Vector3();
function frame(now, force) {
  if (!R) return;
  const t = R.still ? 0 : (now - R.t0) / 1000, dt = R.still ? 0 : Math.min(0.1, (now - (R.last || now)) / 1000);
  R.last = now;
  // the distance that fits the whole day across the box (a phone is narrow), then a slow sway around it
  const hf = Math.atan(Math.tan((R.camera.fov * Math.PI) / 360) * R.camera.aspect), d = Math.max(8.5, ((W / 2) * 1.04) / Math.tan(hf) + 1.2);
  const yaw = R.still ? 0.1 : 0.1 + Math.sin(t * 0.21) * 0.16;
  R.camera.position.set(Math.sin(yaw) * d, d * 0.42 + (R.still ? 0 : Math.sin(t * 0.13) * 0.25), Math.cos(yaw) * d); R.camera.lookAt(0, 0.9, 0);
  // the beacons: open ones pulse
  R.trades.forEach((b, i) => { const s = b.open ? 1 + 0.25 * Math.sin(t * 4) : 1; M4.compose(V.set(b.x, 0, 0), Q, SC.set(s, b.y + 0.9, s)); R.beacons.setMatrixAt(i, M4); });
  R.beacons.instanceMatrix.needsUpdate = true;
  // the light trail: a head running along the last ~45% of the day and a fading tail behind it
  const pts = R.shape ? R.shape.pts : [], n = pts.length, tp = R.trail.geometry.attributes.position.array, tc = R.trail.geometry.attributes.color.array, TN = tp.length / 3;
  if (n > 1) {
    const from = Math.floor(n * 0.55), span = n - 1 - from, head = from + (R.still ? span : ((t * 0.12) % 1) * span);
    for (let k = 0; k < TN; k++) {
      const f = Math.max(0, head - k * 0.55), i = Math.floor(f), w = f - i, a = pts[i], b = pts[Math.min(n - 1, i + 1)], fade = Math.pow(1 - k / TN, 1.6);
      tp[k * 3] = a.x + (b.x - a.x) * w; tp[k * 3 + 1] = a.y + (b.y - a.y) * w + 0.05; tp[k * 3 + 2] = 0;
      tc[k * 3] = GOLD.r * fade * 1.4; tc[k * 3 + 1] = GOLD.g * fade * 1.3; tc[k * 3 + 2] = GOLD.b * fade;
    }
    R.trail.geometry.attributes.position.needsUpdate = R.trail.geometry.attributes.color.needsUpdate = true;
  }
  // embers (none on reduced motion)
  const ep = R.embers.geometry.attributes.position.array, ec = R.embers.geometry.attributes.color.array;
  for (let i = 0; i < R.NP; i++) {
    if (R.still) { ec[i * 3] = ec[i * 3 + 1] = ec[i * 3 + 2] = 0; continue; }
    R.eL[i] += dt * 0.18; ep[i * 3 + 1] += R.eV[i] * dt; ep[i * 3] += Math.sin(t + i) * dt * 0.08;
    if (R.eL[i] > 1) { R.seed(i); R.eL[i] = 0; }
    const a = Math.sin(Math.PI * R.eL[i]) * 0.55; ec[i * 3] = 1 * a; ec[i * 3 + 1] = 0.72 * a; ec[i * 3 + 2] = 0.36 * a;
  }
  R.embers.geometry.attributes.position.needsUpdate = R.embers.geometry.attributes.color.needsUpdate = true;
  // the burst sparks: gravity, fade
  const sp = R.sparks.geometry.attributes.position.array, sc = R.sparks.geometry.attributes.color.array;
  let live = false;
  for (let i = 0; i < R.sN; i++) {
    if (R.sL[i] <= 0) { sc[i * 3] = sc[i * 3 + 1] = sc[i * 3 + 2] = 0; continue; }
    live = true; const k = i * 3, l0 = R.sL[i];
    R.sL[i] = Math.max(0, l0 - dt * 0.75); R.sV[k + 1] -= 3.2 * dt;
    sp[k] += R.sV[k] * dt; sp[k + 1] += R.sV[k + 1] * dt; sp[k + 2] += R.sV[k + 2] * dt;
    const f = l0 > 0 ? R.sL[i] / l0 : 0; sc[k] *= f; sc[k + 1] *= f; sc[k + 2] *= f;
  }
  R.sparksLive = live;
  R.sparks.geometry.attributes.position.needsUpdate = R.sparks.geometry.attributes.color.needsUpdate = true;
  R.arc.material.opacity = R.still ? 0.6 : 0.45 + 0.2 * Math.sin(t * 1.7);
  R.renderer.render(R.scene, R.camera);
  if (force) return;
}

function loop(now) {
  if (!R) return;
  R.raf = 0;
  if (!R.onScreen || document.hidden) return;                                  // asleep; kick() wakes it
  if (R.phone && now - (R.lastDraw || 0) < 32) { R.raf = requestAnimationFrame(loop); return; }   // ~30 fps on a phone
  R.lastDraw = now;
  frame(now);
  if (!R.still) R.raf = requestAnimationFrame(loop);
}
function kick() { if (R && !R.raf && R.onScreen && !document.hidden) { R.last = performance.now(); R.raf = requestAnimationFrame(loop); } }

function dispose() {
  if (!R) return;
  const r = R; R = null;
  if (r.raf) cancelAnimationFrame(r.raf);
  if (r.ro) r.ro.disconnect(); if (r.io) r.io.disconnect();
  document.removeEventListener('visibilitychange', r.vis);
  r.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
  r.tex.dispose();
  r.renderer.dispose(); try { r.renderer.forceContextLoss(); } catch (_) { /* gone */ }
  if (r.renderer.domElement.parentNode) r.renderer.domElement.parentNode.removeChild(r.renderer.domElement);
}

window.NQLAND = { mount, update, burst, dispose };
window.dispatchEvent(new Event('nqland'));
