// NQ LIVE CHART, 3D VIEW (optional ES module; owner 2026-11-20 15:50 ET: "The chart looks terrible. It needs some 3D, it needs some effects").
// The same 5-minute bars as the 2D chart, as a 3D candlestick landscape: glowing instanced candles (mint up, red down, an additive halo),
// thin wicks, a lavender price ribbon over the closes, a pulsing GOLD marker on the last price, trade beacons (light pillars: mint = a winning
// exit, red = a losing exit, violet = an entry, gold-tipped and pulsing = an open trade) on a black floor with a violet grid fading into the fog.
// Palette "OLYMPUS NIGHT" (owner 16:00 ET): black, violet #9d59ee / lavender #dacbf0, gold #f1c14b only as the small last-price accent.
// The camera orbits slowly; a swipe / drag turns it (the auto orbit comes back ~4 s later). Loaded only when the owner taps the chart's 3D toggle
// (nqchart.js adds the module tag). Phone (<= 600 px or Save-Data): antialiased, pixel ratio <= 2, ~30 fps. Paused off-screen / in a hidden
// tab; reduced motion = a still frame (a drag still turns it). Read only: no fetch, no storage, no DOM text (the page sets the aria label).
// Registers window.NQCHART3D = { mount(box, data) -> bool, update(data), dispose() } and fires 'nqchart3d'. mount returns false (the box
// untouched) when WebGL cannot be made. data = { candles: [{time, open, high, low, close}], markers: [{time, kind, usd, open}], last }.
import * as THREE from '../jarvis/three.module.min.js';

const C = { up: new THREE.Color('#77db89'), dn: new THREE.Color('#ef4444'), violet: new THREE.Color('#9d59ee'), lav: new THREE.Color('#dacbf0'),
  gold: new THREE.Color('#f1c14b'), grid: 0x7a4bc0, grid2: 0x3a2260 };
const W = 12, H0 = 0.25, H1 = 4.2, D = 0.7, BEAM = 0.7, MAXB = 240, MAXK = 24;   // D: a candle's depth (a 3D bar, not a line)
let R = null;

const media = (q) => { try { return matchMedia(q).matches; } catch (_) { return false; } };
const isPhone = () => media('(max-width: 600px)') || !!(navigator.connection && navigator.connection.saveData);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function inst(geo, mat, n) { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return m; }

/** the day as bars: x across W, prices mapped into H0..H1 (no bars = a calm made-up row of flat violet bars) */
function shape(data) {
  const cs = (data && Array.isArray(data.candles) ? data.candles : []).filter((c) => c && [c.open, c.high, c.low, c.close].every((v) => num(v) !== null)).slice(-MAXB);
  if (cs.length < 2) {
    const fake = Array.from({ length: 36 }, (_, i) => { const v = 100 + Math.sin(i / 5) * 0.6; return { time: i, open: v, close: v + 0.05, high: v + 0.3, low: v - 0.3 }; });
    return { cs: fake, calm: true, ...range(fake) };
  }
  return { cs, calm: false, ...range(cs) };
}
function range(cs) {
  let lo = Infinity, hi = -Infinity;
  for (const c of cs) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
  if (!(hi > lo)) { hi = lo + 1; }
  const n = cs.length, step = W / n, y = (p) => H0 + ((p - lo) / (hi - lo)) * (H1 - H0), x = (i) => -W / 2 + (i + 0.5) * step;
  return { lo, hi, n, step, y, x };
}

function mount(box, data) {
  if (R) dispose();
  if (!box) return false;
  const phone = isPhone(), still = media('(prefers-reduced-motion: reduce)');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); } catch (_) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 1);
  const cv = renderer.domElement; cv.style.display = 'block'; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.touchAction = 'none';
  box.appendChild(cv);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, 0.055);
  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.1, 80);
  const tex = glowTex();
  // the floor: a violet grid fading into the fog, a soft violet pool of light under the day
  const grid = new THREE.GridHelper(40, 40, C.grid, C.grid2); grid.material.transparent = true; grid.material.opacity = 0.75; scene.add(grid);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), new THREE.MeshBasicMaterial({ color: C.violet, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.01; scene.add(pool);
  // the day (candles, ribbon, beacons, last price) in one group: the camera fit stretches it in y to fill the box; no fog on it (it halved them)
  const day = new THREE.Group(); scene.add(day);
  // candles: bodies (unlit, glowing colours), their additive halos, wicks; one draw each
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const bodies = inst(boxG, new THREE.MeshBasicMaterial({ toneMapped: false }), MAXB);
  const halos = inst(boxG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAXB);
  const wicks = inst(boxG, new THREE.MeshBasicMaterial({ toneMapped: false }), MAXB);
  for (const m of [halos, bodies, wicks]) { m.setColorAt(0, C.violet); m.instanceColor.setUsage(THREE.DynamicDrawUsage); day.add(m); }
  // the price ribbon over the closes + its glow dots
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: C.lav, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  day.add(line);
  const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: tex, color: C.lav, size: 0.26, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  day.add(dots);
  // trade beacons: pillars (one draw) + their glowing tips (points with colours)
  const pillars = inst(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAXK);
  pillars.setColorAt(0, C.violet); day.add(pillars);
  const tipG = new THREE.BufferGeometry(); tipG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXK * 3), 3)); tipG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXK * 3), 3));
  const tips = new THREE.Points(tipG, new THREE.PointsMaterial({ map: tex, size: 0.7, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  tips.frustumCulled = false; day.add(tips);
  // night-nq-chart 2026-11-27: the levels behind the candles (session highs / lows lavender, the PC's levels gold) and each open trade's entry
  // (gold), stop (rose) and target (mint) across the whole day: one LineSegments, vertex colours
  const lv = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  day.add(lv);
  // the last price: a small pulsing gold marker + halo (the one gold accent)
  const lastM = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: C.gold, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const lastC = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: C.gold, toneMapped: false }));
  day.add(lastM); day.add(lastC);
  day.traverse((o) => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) m.fog = false; });

  R = { box, cv, renderer, scene, camera, tex, grid, day, pool, bodies, halos, wicks, line, dots, pillars, tips, lastM, lastC, phone, still, lv,
    S: null, opens: [], yaw: 0, pitch: 0.32, drag: null, userUntil: 0, userYaw: 0, userPitch: 0, t0: performance.now(), last: 0, raf: 0, onScreen: true, io: null, ro: null, fns: {} };
  update(data);
  const size = () => { if (!R) return; const w = Math.max(1, box.clientWidth), h = Math.max(1, box.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); frame(performance.now(), true); };
  R.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null; if (R.ro) R.ro.observe(box);
  R.io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { if (!R) return; R.onScreen = es.some((e) => e.isIntersecting); kick(); }) : null;
  if (R.io) R.io.observe(box);
  // swipe / drag to turn: the canvas alone takes the touch (touch-action none on it), the page still scrolls around it
  const F = R.fns;
  F.down = (e) => { R.drag = { x: e.clientX, y: e.clientY, yaw: R.userYaw, pitch: R.userPitch, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } };
  F.move = (e) => {
    if (!R || !R.drag || e.pointerId !== R.drag.id) return;
    R.userYaw = R.drag.yaw + (e.clientX - R.drag.x) * 0.008; R.userPitch = Math.max(-0.22, Math.min(0.45, R.drag.pitch + (e.clientY - R.drag.y) * 0.004));
    R.userUntil = performance.now() + 4000; kick(); if (R.still) frame(performance.now(), true);
  };
  F.up = () => { if (R) { R.drag = null; R.userUntil = performance.now() + 4000; } };
  cv.addEventListener('pointerdown', F.down); cv.addEventListener('pointermove', F.move); cv.addEventListener('pointerup', F.up); cv.addEventListener('pointercancel', F.up);
  F.vis = () => kick(); document.addEventListener('visibilitychange', F.vis);
  size();
  kick();
  return true;
}

function update(data) {
  if (!R) return;
  const S = shape(data), { cs, n, step, x, y } = S, bw = Math.max(0.025, step * 0.62), dummy = new THREE.Object3D(), col = new THREE.Color();
  R.S = S;
  const put = (m, i, px, py, pz, sx, sy, sz, c) => { dummy.position.set(px, py, pz); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, c); };
  for (let i = 0; i < n; i++) {
    const k = cs[i], up = k.close >= k.open, yo = y(k.open), yc = y(k.close), yl = y(k.low), yh = y(k.high);
    col.copy(S.calm ? C.violet : up ? C.up : C.dn);
    const bh = Math.max(0.035, Math.abs(yc - yo)), by = (yo + yc) / 2;
    put(R.bodies, i, x(i), by, 0, bw, bh, D, col);
    put(R.halos, i, x(i), by, 0, bw * 1.35, bh + 0.06, D * 1.15, col);   // night-nq-chart: a tight halo (2.2x blurred the candles)
    put(R.wicks, i, x(i), (yl + yh) / 2, 0, Math.max(0.012, bw * 0.16), Math.max(0.02, yh - yl), Math.max(0.012, bw * 0.16), col);
  }
  for (const m of [R.bodies, R.halos, R.wicks]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  // the ribbon just in front of the candles, a glow dot every few bars
  const pts = cs.map((k, i) => new THREE.Vector3(x(i), y(k.close) + 0.02, D * 0.6));
  R.line.geometry.setFromPoints(pts);
  R.dots.geometry.setFromPoints(pts);            // a glow dot on every close: the ribbon reads as a thick glowing line
  // the last price (the data's own, else the last close)
  const lp = num(data && data.last), ly = lp !== null && !S.calm ? y(Math.max(S.lo, Math.min(S.hi, lp))) : y(cs[n - 1].close);
  R.lastM.position.set(x(n - 1) + step * 0.9, ly, D * 0.6); R.lastC.position.copy(R.lastM.position);
  R.lastM.visible = R.lastC.visible = !S.calm;
  // the levels and the open trades' lines (only those inside the day's price range: the camera fit is the candles')
  const segs = [], cols = [], addL = (p, c, z) => { const v = num(p); if (v === null || S.calm || v < S.lo || v > S.hi) return; const yy = y(v); segs.push(-W / 2, yy, z, W / 2, yy, z); cols.push(c.r, c.g, c.b, c.r, c.g, c.b); };
  const LAVL = new THREE.Color('#b9a6dc'), ROSE = new THREE.Color('#ff5d73');
  for (const L of (data && Array.isArray(data.levels) ? data.levels : [])) addL(L.price, L.src === 'pc' ? C.gold : LAVL, -D * 0.8);
  for (const z of (data && Array.isArray(data.zones) ? data.zones : [])) { addL(z.e, C.gold, D * 0.7); addL(z.sl, ROSE, D * 0.7); addL(z.tp, C.up, D * 0.7); }
  R.lv.geometry.dispose(); R.lv.geometry = new THREE.BufferGeometry();
  R.lv.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3)); R.lv.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  // beacons at the trades (the bar at or before the marker's time)
  const mk = S.calm ? [] : (data && Array.isArray(data.markers) ? data.markers : []).filter((m) => m && num(m.time) !== null).slice(-MAXK);
  const idxOf = (t) => { let j = 0; for (let i = 0; i < n; i++) if (cs[i].time <= t) j = i; return j; };
  const tp = R.tips.geometry.attributes.position.array, tc = R.tips.geometry.attributes.color.array;
  R.opens = [];
  mk.forEach((m, i) => {
    const j = idxOf(+m.time), top = y(cs[j].high) + 0.15, hgt = BEAM, kind = m.open ? 'open' : m.kind === 'exit' ? (num(m.usd) !== null && m.usd < 0 ? 'loss' : 'win') : 'entry';
    const c = kind === 'win' ? C.up : kind === 'loss' ? C.dn : kind === 'open' ? C.violet : C.violet;
    put(R.pillars, i, x(j), top + hgt / 2, 0, 1, hgt, 1, c);
    const tcol = kind === 'open' ? C.gold : kind === 'entry' ? C.lav : c;
    tp[i * 3] = x(j); tp[i * 3 + 1] = top + hgt; tp[i * 3 + 2] = 0; tc[i * 3] = tcol.r; tc[i * 3 + 1] = tcol.g; tc[i * 3 + 2] = tcol.b;
    if (kind === 'open') R.opens.push(i);
  });
  R.pillars.count = mk.length; R.pillars.instanceMatrix.needsUpdate = true; if (R.pillars.instanceColor) R.pillars.instanceColor.needsUpdate = true;
  R.tips.geometry.setDrawRange(0, mk.length); R.tips.geometry.attributes.position.needsUpdate = R.tips.geometry.attributes.color.needsUpdate = true;
  kick(); frame(performance.now(), true);
}

function place(t) {
  const cam = R.camera, auto = R.still ? 0 : Math.sin(((t - R.t0) / 1000) * (Math.PI * 2 / 26)) * 0.42;
  if (!R.drag && performance.now() > R.userUntil) { R.userYaw *= 0.97; R.userPitch *= 0.97; }   // the auto orbit comes back gently
  const yaw = auto + R.userYaw, pitch = 0.2 + R.userPitch;
  // the fit (coordinator 2026-11-20: "too small and dim"): the bars fill ~80% of the box width and the day's price range ~55% of its height;
  // the day group is stretched in y to that height, the camera looks at its middle (a little above, so the beacons have room)
  const vf = (cam.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
  const d = (W / 0.8 / 2) / Math.tan(hf / 2) + D / 2, visH = 2 * d * Math.tan(vf / 2), sy = (0.74 * visH) / (H1 - H0);   // lead 2026-11-20: fill the card (was 55%: the bottom third sat empty)
  R.day.scale.y = sy; R.day.position.y = -H0 * sy + 0.05;
  const ty = ((H0 + H1) / 2) * sy + R.day.position.y + 0.02 * visH;
  cam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, ty + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
  cam.lookAt(0, ty, 0);
}
function frame(t, force) {
  if (!R) return;
  const phase = (t - R.t0) / 1000, beat = R.still ? 1 : 1 + 0.35 * Math.sin(phase * 3.2);
  place(t);
  const sy = R.day.scale.y || 1; R.lastM.scale.set(0.85 * beat, 0.85 * beat / sy, 1); R.lastC.scale.set(1, 1 / sy, 1);   // round in the stretched group
  R.tips.material.size = 0.7 * (R.still ? 1 : 1 + 0.12 * Math.sin(phase * 2.4));
  if (R.opens.length && !R.still) R.pillars.material.opacity = 0.7 + 0.25 * Math.sin(phase * 4);
  R.renderer.render(R.scene, R.camera);
  R.last = t;
}
function kick() {
  if (!R || R.raf) return;
  const loop = (t) => {
    if (!R) return;
    R.raf = 0;
    const live = R.onScreen && !document.hidden;
    if (!live) return;                                     // woken again by the observer / visibilitychange
    if (R.still && !R.drag) { frame(t, true); return; }   // reduced motion: one still frame (a drag renders itself)
    if (!R.phone || t - R.last >= 32) frame(t);          // ~30 fps on a phone
    R.raf = requestAnimationFrame(loop);
  };
  R.raf = requestAnimationFrame(loop);
}

function dispose() {
  if (!R) return;
  const r = R; R = null;
  if (r.raf) cancelAnimationFrame(r.raf);
  if (r.ro) r.ro.disconnect(); if (r.io) r.io.disconnect();
  const F = r.fns, cv = r.cv;
  cv.removeEventListener('pointerdown', F.down); cv.removeEventListener('pointermove', F.move); cv.removeEventListener('pointerup', F.up); cv.removeEventListener('pointercancel', F.up);
  document.removeEventListener('visibilitychange', F.vis);
  r.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) m.dispose(); });
  r.tex.dispose();
  r.renderer.dispose(); try { r.renderer.forceContextLoss(); } catch (_) { /* gone */ }
  if (cv.parentNode) cv.parentNode.removeChild(cv);
}

window.NQCHART3D = { mount, update, dispose, frames: () => (R ? R.last : 0) };
try { window.dispatchEvent(new Event('nqchart3d')); } catch (_) { /* the page asks again */ }
