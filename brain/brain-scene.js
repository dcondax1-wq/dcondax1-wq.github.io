/* THE BRAIN, the 3D scene (brain/brain-scene.js, ES module, loaded after the first paint by brain.js; day-brain-app 2026-11-24).
 * One huge living brain at night: two folded hemispheres + a cerebellum and stem of glowing neurons (additive point sprites, OLYMPUS NIGHT),
 * cut into six regions (each a brain of its own: LIT, ATLAS, BLITZ, ORDER FLOW, MARKET LEARN, RISK). Synapses link nearby neurons; signals
 * run along them (more when a region is busier), a region FIRES (a wave from its centre) on every new thinking line, and the camera flies
 * into a region on a tap. A soft core glow, dust and a violet floor halo do the bloom's job without a post pass (one draw per layer).
 * three.js r160 from cdnjs (pinned 0.160.0), else the site's own copy (../jarvis/three.module.min.js), as pillars/pillars-scene.js does.
 *   create(canvas, regions, cfg) -> Promise<api | null>
 *     regions = [{ id, color }]   cfg = { onPick(id), reduce, low, localFirst, onFrame() }
 *     api = { fly(id | null), fire(id, n), setPulse({id: 0..1}), project(id) -> {x, y, z, vis}, stats(), dispose(), THREE }
 * Quality: 'hq' (DPR <= 2, ~7,000 neurons, 60 fps) / 'low' (DPR 1, ~2,600 neurons, 30 fps): starts at hq unless the phone asks for less
 * (Save-Data, ?lite=1, <= 2 cores / 2 GB) and steps down by itself on slow frames. ?fx=hq pins hq. Reduced motion: no drift, no signals,
 * a still frame redrawn on touch. Paused on a hidden tab or when the canvas is off screen. Read only: draws, sends nothing. */
export const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
const THREE_LOCAL = '../jarvis/three.module.min.js';
async function loadThree(localFirst) {
  for (const u of localFirst ? [THREE_LOCAL, THREE_CDN] : [THREE_CDN, THREE_LOCAL]) { try { const m = await import(u); if (m && m.WebGLRenderer) return m; } catch (_) { /* the next */ } }
  return null;
}
export function isLowPower(w) {
  const n = (w && w.navigator) || {}, q = String((w && w.location && w.location.search) || '');
  if (/[?&]fx=(hq|3d)/.test(q)) return false;
  if (/[?&]lite=1/.test(q)) return true;
  return (+n.hardwareConcurrency > 0 && +n.hardwareConcurrency <= 2) || (+n.deviceMemory > 0 && +n.deviceMemory <= 2) || !!(n.connection && n.connection.saveData);
}

// where each region sits in the brain (x right, y up, z to the viewer: the front of the brain faces +z)
export const CENTERS = {
  lit: [-1.15, 0.55, 1.05],      // left frontal lobe
  atlas: [1.15, 0.55, 1.05],     // right frontal lobe
  blitz: [1.25, 0.35, -0.95],    // right parietal / occipital
  of: [-1.25, 0.35, -0.95],      // left parietal / occipital
  learn: [0, 1.45, 0],           // the crown (the shared learner sits over both hemispheres)
  risk: [0, -1.05, -0.85],       // cerebellum + stem (the oldest part: keeps the body alive)
};
const RS = [1.62, 1.28, 1.95];   // a hemisphere's radii

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** the neurons: on a folded surface (gyri) of two hemispheres + a cerebellum + a stem, each tagged with its nearest region */
function neurons(n, R, ids) {
  const P = [], reg = [], ph = [];
  const fold = (x, y, z) => 1 + 0.075 * Math.sin(x * 5.1 + Math.sin(z * 3.3) * 1.6) * Math.cos(y * 4.4 + z * 2.1) + 0.04 * Math.sin(z * 7.7 + y * 3.1);
  const nearest = (x, y, z) => { let b = 0, bd = 1e9; ids.forEach((id, i) => { const c = CENTERS[id]; const d = (x - c[0]) ** 2 + (y - c[1]) ** 2 * 1.2 + (z - c[2]) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  for (let i = 0; i < n; i++) {
    const kind = R();
    let x, y, z;
    if (kind < 0.86) {                                  // a hemisphere: a point on the ellipsoid, pushed in / out by the folds, a few inside
      const side = R() < 0.5 ? -1 : 1, u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      let dx = s * Math.cos(a), dy = u, dz = s * Math.sin(a);
      if (dx * side < -0.15) dx = -dx;                  // keep to its own side (the fissure between)
      const depth = R() < 0.82 ? 1 : 0.55 + R() * 0.4, f = fold(dx, dy, dz) * depth;
      x = side * 0.1 + dx * RS[0] * f * 0.62 + side * 0.58; y = dy * RS[1] * f + 0.25; z = dz * RS[2] * f;
      if (y < -0.55) y = -0.55 - (y + 0.55) * 0.25;   // a flatter base
    } else if (kind < 0.96) {                           // the cerebellum: a small folded ball under the back
      const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), f = 1 + 0.08 * Math.sin(u * 22);
      x = s * Math.cos(a) * 0.95 * f; y = u * 0.42 * f - 0.95; z = s * Math.sin(a) * 0.62 * f - 1.05;
    } else {                                            // the stem
      const a = R() * Math.PI * 2, h = R();
      x = Math.cos(a) * 0.22 * (1 - h * 0.3); y = -0.6 - h * 1.15; z = Math.sin(a) * 0.22 - 0.35 - h * 0.25;
    }
    P.push(x, y, z); reg.push(nearest(x, y, z)); ph.push(R() * Math.PI * 2);
  }
  return { P: new Float32Array(P), reg: new Float32Array(reg), ph: new Float32Array(ph) };
}

/** synapses: each neuron to 1-2 neighbours of its own region within reach (a coarse grid keeps it fast) */
function synapses(P, reg, maxE, R) {
  const n = P.length / 3, cell = 0.34, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < n; i++) { const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  const E = [];
  for (let s = 0; s < n * 3 && E.length < maxE; s++) {
    const i = Math.floor(R() * n), x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = -1, bd = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const j of grid.get(`${cx + a},${cy + b},${cz + c}`) || []) {
        if (j === i || reg[j] !== reg[i]) continue;
        const d = (P[j * 3] - x) ** 2 + (P[j * 3 + 1] - y) ** 2 + (P[j * 3 + 2] - z) ** 2;
        if (d > 0.012 && d < bd && R() < 0.7) { bd = d; best = j; }
      }
    }
    if (best >= 0 && bd < 0.11) E.push(i, best);
  }
  return E;
}

function glowTex(THREE, soft) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(soft ? 0.12 : 0.22, 'rgba(255,255,255,.75)'); r.addColorStop(soft ? 0.45 : 0.5, 'rgba(255,255,255,.16)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const NEURON_VS = `attribute float aReg; attribute float aPh; uniform float uTime; uniform float uPx; uniform float uPulse[6]; uniform vec4 uFire[6]; uniform float uFocus; uniform float uSel;
varying vec3 vCol; varying float vA; uniform vec3 uCol[6];
void main(){
  int r = int(aReg + .5); float pulse = uPulse[r]; vec4 F = uFire[r];
  vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
  float flick = .55 + .45 * sin(uTime * (1.3 + pulse * 2.6) + aPh * 3.);
  float wave = 0.; if (F.w > 0.) { float d = distance(position, F.xyz); float front = (uTime - F.w) * 2.4; wave = exp(-pow((d - front) * 3.2, 2.)) * max(0., 1. - (uTime - F.w) / 1.6); }
  float dim = (uSel >= 0. && abs(float(r) - uSel) > .5) ? (1. - .62 * uFocus) : 1.;
  vA = (.2 + .45 * pulse * flick + 1.5 * wave) * dim * (1. - .12 * uFocus);
  vCol = mix(uCol[r], vec3(1.), clamp(wave * .7, 0., .7));
  gl_PointSize = uPx * (1. + 1.6 * wave + .3 * pulse) * min(3.2 / -mv.z, .82);   // capped: a region seen up close stays a field of points, not a blur
}`;
const NEURON_FS = `uniform sampler2D uTex; varying vec3 vCol; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol * vA * 1.35, t.a * min(1., vA)); }`;

export async function create(canvas, regions, cfg) {
  const C = cfg || {}, THREE = await loadThree(!!C.localFirst);
  if (!THREE || !canvas) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' }); } catch (_) { return null; }
  if (!renderer.getContext()) return null;
  const pinned = /[?&]fx=hq/.test(location.search);
  let tier = C.low ? 'low' : 'hq';
  const ids = regions.map((r) => r.id), R = rng(20261124);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000'); scene.fog = new THREE.FogExp2(0x050208, 0.06);
  const cam = new THREE.PerspectiveCamera(46, 1, 0.05, 80);
  const brain = new THREE.Group(); scene.add(brain);
  const tex = glowTex(THREE, false), soft = glowTex(THREE, true);
  const cols = regions.map((r) => new THREE.Color(r.color));
  const pulse = Object.fromEntries(ids.map((id) => [id, 0.35]));
  const fire = ids.map(() => new THREE.Vector4(0, 0, 0, -1));
  let layers = null, calls = 0;

  function buildLayers() {
    if (layers) { for (const o of layers.objs) { brain.remove(o); o.geometry.dispose(); o.material.dispose(); } }
    const N = tier === 'hq' ? 7000 : 2600, NE = tier === 'hq' ? 2600 : 900, NS = tier === 'hq' ? 70 : 24;
    const { P, reg, ph } = neurons(N, R, ids);
    // neurons
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aReg', new THREE.BufferAttribute(reg, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const um = { uTime: { value: 0 }, uPx: { value: 1 }, uTex: { value: tex }, uPulse: { value: ids.map((id) => pulse[id]) }, uFire: { value: fire }, uCol: { value: cols }, uFocus: { value: 0 }, uSel: { value: -1 } };
    const mat = new THREE.ShaderMaterial({ uniforms: um, vertexShader: NEURON_VS, fragmentShader: NEURON_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
    // synapses: faint lines in the region's colour
    const E = synapses(P, reg, NE, R), lp = new Float32Array(E.length * 3), lc = new Float32Array(E.length * 3);
    E.forEach((i, k) => { lp.set(P.subarray(i * 3, i * 3 + 3), k * 3); const c = cols[reg[i]]; lc.set([c.r * 0.32, c.g * 0.32, c.b * 0.32], k * 3); });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    // signals running along the synapses
    const sg = new THREE.BufferGeometry(), sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const sigs = new THREE.Points(sg, new THREE.PointsMaterial({ size: tier === 'hq' ? 0.16 : 0.2, map: soft, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    sigs.frustumCulled = false;
    const S = Array.from({ length: NS }, () => ({ e: -1, t: 0, v: 1 }));
    // the core glow + the halo under the brain + dust
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0x6a34b8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.set(6.4, 5.2, 1); core.position.set(0, 0.3, 0);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ map: soft, color: 0x3e255e, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -2.05;
    const nd = tier === 'hq' ? 420 : 140, dp = new Float32Array(nd * 3);
    for (let i = 0; i < nd; i++) dp.set([(R() - 0.5) * 14, (R() - 0.5) * 8, (R() - 0.5) * 14], i * 3);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.05, color: 0x9d59ee, map: soft, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    // the gold ring that marks the region in focus
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.012, 8, 72), new THREE.MeshBasicMaterial({ color: 0xf1c14b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const objs = [halo, core, dust, lines, pts, sigs, ring];
    for (const o of objs) brain.add(o);
    layers = { objs, um, E, P, reg, S, sigs, sp, sc, ring, core };
    calls = objs.length;
  }
  buildLayers();

  // camera: an orbit around the whole brain, or a fly-in to a region
  const home = { pos: new THREE.Vector3(0, 3.5, 6.7), at: new THREE.Vector3(0, -0.05, 0) };   // from above the brow: the back lobes sit higher on screen than the front ones
  const camPos = home.pos.clone(), camAt = home.at.clone(), toPos = home.pos.clone(), toAt = home.at.clone();
  let sel = null, yaw = 0.0, drag = null, lastTouch = 0, focus = 0;
  function aim(id) {
    sel = ids.includes(id) ? id : null;
    if (!sel) { toPos.copy(home.pos); toAt.copy(home.at); return; }
    const c = new THREE.Vector3(...CENTERS[sel]), out = c.clone().setY(c.y * 0.6).normalize();
    if (sel === 'learn') out.set(0, 0.75, 0.66).normalize(); if (sel === 'risk') out.set(0, -0.15, -1).normalize();
    toAt.copy(c); toPos.copy(c).addScaledVector(out, 3.4).add(new THREE.Vector3(0, 0.35, 0));
    yaw = 0;
  }
  const size = () => {
    const w = canvas.clientWidth || 390, h = canvas.clientHeight || 420;
    renderer.setPixelRatio(tier === 'hq' ? Math.min(2, window.devicePixelRatio || 1) : 1);
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.fov = w / h < 0.8 ? 54 : 46; cam.updateProjectionMatrix();
    if (layers) layers.um.uPx.value = (tier === 'hq' ? 0.11 : 0.16) * h * renderer.getPixelRatio() / 2;
  };
  size();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null; if (ro) ro.observe(canvas); else window.addEventListener('resize', size);

  // pointer: drag turns, a tap picks the nearest region centre on screen
  const proj = (id) => { const v = new THREE.Vector3(...CENTERS[id]).applyMatrix4(brain.matrixWorld).project(cam); const r = canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, z: v.z, vis: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 }; };
  const down = (e) => { drag = { x: e.clientX, y: e.clientY, yaw, moved: 0 }; lastTouch = performance.now(); kick(); };
  const move = (e) => { if (!drag) return; const dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(e.clientY - drag.y)); yaw = drag.yaw + dx * 0.008; lastTouch = performance.now(); kick(); };
  const up = (e) => {
    if (drag && drag.moved < 8 && C.onPick) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 1e9; for (const id of ids) { const p = proj(id); if (!p.vis) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = id; } }
      if (best && bd < Math.max(70, r.width * 0.2)) C.onPick(best);
    }
    drag = null;
  };
  canvas.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);

  // the frame loop
  let raf = 0, last = performance.now(), t0 = last, slow = 0, frames = 0, visible = true, onScreen = true, need = true;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es.some((x) => x.isIntersecting); kick(); }) : null; if (io) io.observe(canvas);
  const vis = () => { visible = document.visibilityState !== 'hidden'; kick(); }; document.addEventListener('visibilitychange', vis);
  function kick() { need = true; if (!raf && visible && onScreen) raf = requestAnimationFrame(frame); }
  function stepSignals(dt, time) {
    const L = layers; if (C.reduce || !L.E.length) { L.sigs.visible = false; return; }
    const nE = L.E.length / 2;
    L.S.forEach((s, k) => {
      if (s.e < 0 || s.t >= 1) {                       // a new signal: busier regions get more of them
        const r = ids[Math.floor(R() * ids.length)];
        if (R() > 0.25 + pulse[r] * 0.75 && !(sel && r === sel)) { s.e = -1; L.sp.set([0, -99, 0], k * 3); return; }
        for (let tries = 0; tries < 12; tries++) { const e = Math.floor(R() * nE); if (ids[L.reg[L.E[e * 2]]] === r) { s.e = e; break; } }
        s.t = 0; s.v = 0.9 + R() * 1.6;
      }
      if (s.e < 0) return;
      s.t += dt * s.v;
      const a = L.E[s.e * 2] * 3, b = L.E[s.e * 2 + 1] * 3, P = L.P, f = Math.min(1, s.t);
      L.sp.set([P[a] + (P[b] - P[a]) * f, P[a + 1] + (P[b + 1] - P[a + 1]) * f, P[a + 2] + (P[b + 2] - P[a + 2]) * f], k * 3);
      const c = cols[L.reg[L.E[s.e * 2]]], w = Math.sin(Math.PI * f); L.sc.set([0.4 + c.r * w, 0.4 + c.g * w, 0.4 + c.b * w], k * 3);
    });
    L.sigs.visible = true; L.sigs.geometry.attributes.position.needsUpdate = true; L.sigs.geometry.attributes.color.needsUpdate = true;
  }
  function frame(now) {
    raf = 0;
    if (!visible || !onScreen) return;
    const dt = Math.min(0.1, (now - last) / 1000), time = (now - t0) / 1000;
    if (tier === 'low' && now - last < 30 && !need) { raf = requestAnimationFrame(frame); return; }
    if (!pinned && dt > 0.045 && frames > 30) { slow++; if (slow > 40) { slow = 0; if (renderer.getPixelRatio() > 1.2) { renderer.setPixelRatio(1); size(); } else if (tier === 'hq') { tier = 'low'; buildLayers(); size(); } } } else slow = Math.max(0, slow - 1);
    last = now; frames++;
    const k = C.reduce ? 1 : 1 - Math.pow(0.0025, dt);
    camPos.lerp(toPos, k); camAt.lerp(toAt, k);
    if (!C.reduce && !drag && now - lastTouch > 4000) yaw += dt * (sel ? 0.02 : 0.09);
    brain.rotation.y = sel ? yaw * 0.35 : yaw;
    brain.position.y = C.reduce ? 0 : Math.sin(time * 0.6) * 0.05;
    cam.position.copy(camPos); cam.lookAt(camAt);
    focus += ((sel ? 1 : 0) - focus) * Math.min(1, dt * 3);
    const L = layers; L.um.uTime.value = time; L.um.uFocus.value = focus; L.um.uSel.value = sel ? ids.indexOf(sel) : -1;
    L.um.uPulse.value = ids.map((id) => pulse[id]);
    stepSignals(dt, time);
    L.core.material.opacity = 0.42 + 0.1 * Math.sin(time * 0.9);
    if (sel) { L.ring.position.set(...CENTERS[sel]); L.ring.lookAt(cam.position.clone().applyMatrix4(brain.matrixWorld.clone().invert())); L.ring.material.opacity = 0.75 * focus * (0.75 + 0.25 * Math.sin(time * 3)); L.ring.scale.setScalar(1 + 0.06 * Math.sin(time * 2)); }
    else L.ring.material.opacity = Math.max(0, L.ring.material.opacity - dt);
    renderer.render(scene, cam);
    if (C.onFrame) C.onFrame();
    need = false;
    const moving = camPos.distanceTo(toPos) > 0.01 || fire.some((f) => f.w > 0 && time - f.w < 1.8);
    if (!C.reduce || moving || drag) raf = requestAnimationFrame(frame);
  }
  kick();
  document.documentElement.dataset.three = THREE.REVISION;
  return {
    THREE,
    fly(id) { aim(id); kick(); },
    fire(id, n) { const i = ids.indexOf(id); if (i < 0) return; const c = CENTERS[id]; fire[i].set(c[0], c[1], c[2], (performance.now() - t0) / 1000); pulse[id] = Math.min(1, pulse[id] + 0.15 * (n || 1)); kick(); },
    setPulse(map) { for (const [k, v] of Object.entries(map || {})) if (k in pulse && Number.isFinite(+v)) pulse[k] = Math.max(0, Math.min(1, +v)); kick(); },
    project(id) { brain.updateMatrixWorld(); return CENTERS[id] ? proj(id) : null; },
    stats() { const i = renderer.info; return { three: THREE.REVISION, tier, neurons: layers.P.length / 3, synapses: layers.E.length / 2, calls: i.render.calls, layers: calls, dpr: renderer.getPixelRatio(), sel }; },
    dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', vis); canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); renderer.dispose(); },
  };
}
