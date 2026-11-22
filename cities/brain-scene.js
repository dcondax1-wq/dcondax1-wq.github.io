/* OLYMPUS research brain: the 3D scene (cities/brain-scene.js, ES module; local three.js only, imported by brain.js after the first paint).
 * create(canvas, data, { onPick(i|-1), reduce, onLost }) -> { setVisible(mask), select(i), sweep(), project(i), stats(), dispose() } | null
 * One drawing pass per object: ~1,100 ambient glow points + 113 finding halos + one InstancedMesh of neuron cores + 2 LineSegments
 * (synapses, a background web) + a pulse point set + a glass shell. <= ~1,500 things. 30 fps cap on a slow frame, pixel ratio <= 2,
 * paused on a hidden tab or off screen, reduced motion = still frames drawn on interaction. Colours: OLYMPUS NIGHT. All made in code. */
import * as THREE from '../jarvis/three.module.min.js';

const C = { mint: new THREE.Color('#77db89'), rej: new THREE.Color('#d6336c'), gold: new THREE.Color('#f1c14b'), glow: new THREE.Color('#9d59ee'), dim: new THREE.Color('#3e255e') };
const SC = { a: C.mint, r: C.rej, o: C.gold };
// where each family lives in the brain (x across, y up, z front +): frontal, top, temporal, back, cerebellum, side, stem
const CEN = [[0, .38, 1.0], [0, .75, .15], [.82, -.2, .35], [-.02, .45, -.95], [.38, -.62, -.78], [-.78, .15, .55], [0, -.7, .05]];
const RAD = [1.15, .9, 1.5];                      // the brain's half sizes
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function inside(p) { const k = Math.hypot(p[0] / RAD[0], p[1] / RAD[1], p[2] / RAD[2]); if (k > .92) { const f = .92 / k; p[0] *= f; p[1] *= f; p[2] *= f; } return p; }

const VS_PTS = `attribute float aSize; attribute float aA; attribute vec3 aC; attribute float aPh; uniform float uT, uPx, uSweep, uLow; varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
 float tw = uLow > .5 ? 1.0 : .72 + .28 * sin(uT * 1.4 + aPh * 6.283);
 float sw = exp(-pow((position.z - uSweep) * 2.4, 2.0));
 vA = aA * tw + sw * .9; vC = mix(aC, vec3(1.0,.95,.8), clamp(sw, 0., .8));
 gl_PointSize = max(1.0, aSize * uPx * (1.0 + sw * .8) / max(.1, -mv.z)); }`;
const FS_PTS = `precision mediump float; varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
 float g = pow(1.0 - r, 2.2); gl_FragColor = vec4(vC * (.5 + g), g * vA); }`;
const VS_LN = `attribute vec3 aC; attribute float aA; uniform float uSweep; varying vec3 vC; varying float vA;
void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); float sw = exp(-pow((position.z - uSweep) * 2.0, 2.0)); vA = aA + sw * .7; vC = mix(aC, vec3(1.0,.93,.75), clamp(sw,0.,.7)); }`;
const FS_LN = `precision mediump float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC, vA); }`;
const VS_GL = `varying vec3 vN; varying vec3 vV; uniform float uT; void main(){ vec3 p = position; float w = sin(p.x * 7.0 + p.z * 5.0) * sin(p.y * 6.0 + p.x * 3.0) * .035; p += normal * w;
 vec4 mv = modelViewMatrix * vec4(p,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const FS_GL = `precision mediump float; varying vec3 vN; varying vec3 vV; uniform float uSweep; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6);
 gl_FragColor = vec4(vec3(.62,.35,.93) * (.35 + f * 1.3), f * .55 + .03); }`;

export function create(canvas, data, cfg) {
  cfg = cfg || {};
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' }); } catch (e) { return null; }
  if (!renderer || !renderer.getContext()) return null;
  const reduce = !!cfg.reduce, N = data.n.length;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 60);
  const rig = new THREE.Group(); scene.add(rig);
  const ST = { level: 0, frames: 0, running: false, hidden: false, off: false, dpr: 1, sweepT: -1, sel: -1, zoom: 5.6, last: 0, ema: 16, slow: 0, lost: false };

  // ---- neuron positions (family regions) ----
  const R = rng(20261122), pos = [];
  data.n.forEach((n, i) => {
    const c = CEN[n.f] || CEN[6], sx = (n.f === 2 || n.f === 4) ? (i % 2 ? 1 : -1) : 1;
    const a = R() * 6.283, b = Math.acos(2 * R() - 1), r = .12 + Math.cbrt(R()) * .42;
    pos.push(inside([c[0] * sx + r * Math.sin(b) * Math.cos(a) * 1.1, c[1] + r * Math.cos(b) * .8, c[2] + r * Math.sin(b) * Math.sin(a) * 1.2]));
  });

  // ---- ambient glow points (the cortex) ----
  const NA = 1100, apos = new Float32Array(NA * 3), aC = new Float32Array(NA * 3), aS = new Float32Array(NA), aAl = new Float32Array(NA), aPh = new Float32Array(NA), ap = [];
  for (let i = 0; i < NA; i++) {
    const a = R() * 6.283, b = Math.acos(2 * R() - 1), r = .6 + .4 * Math.sqrt(R());
    const p = [Math.sin(b) * Math.cos(a) * RAD[0] * r, Math.cos(b) * RAD[1] * r, Math.sin(b) * Math.sin(a) * RAD[2] * r];
    if (Math.abs(p[0]) < .06) p[0] += p[0] < 0 ? -.07 : .07;               // the midline fissure
    ap.push(p); apos.set(p, i * 3);
    const t = R(), col = t < .1 ? C.gold : t < .25 ? C.mint : C.glow; aC.set([col.r, col.g, col.b], i * 3);
    aS[i] = .035 + R() * .05; aAl[i] = .28 + R() * .4; aPh[i] = R();
  }
  const uni = { uT: { value: 0 }, uPx: { value: 400 }, uSweep: { value: -9 }, uLow: { value: 0 } };
  const mkPts = (P, Cc, Sz, Al, Ph) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aC', new THREE.BufferAttribute(Cc, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(Sz, 1)); g.setAttribute('aA', new THREE.BufferAttribute(Al, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(Ph, 1));
    const m = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VS_PTS, fragmentShader: FS_PTS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const o = new THREE.Points(g, m); o.frustumCulled = false; rig.add(o); return o;
  };
  const ambient = mkPts(apos, aC, aS, aAl, aPh);

  // ---- finding halos (glow) + cores (instanced spheres) ----
  const hP = new Float32Array(N * 3), hC = new Float32Array(N * 3), hS = new Float32Array(N), hA = new Float32Array(N), hPh = new Float32Array(N), base = new Float32Array(N);
  data.n.forEach((n, i) => { hP.set(pos[i], i * 3); const c = SC[n.s] || C.glow; hC.set([c.r, c.g, c.b], i * 3); base[i] = n.x ? .15 : .21; hS[i] = base[i] * 1.7; hA[i] = .9; hPh[i] = i / N; });
  const halos = mkPts(hP, hC, hS, hA, hPh);
  const core = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  core.frustumCulled = false; rig.add(core);
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color(), vis = new Array(N).fill(1);
  function paintCores() {
    for (let i = 0; i < N; i++) {
      const on = vis[i] !== 0, sel = ST.sel === i;
      const s = (on ? (sel ? .05 * 1.9 : .04) : .014) * (data.n[i].x ? .8 : 1);
      dummy.position.set(pos[i][0], pos[i][1], pos[i][2]); dummy.scale.setScalar(s); dummy.updateMatrix(); core.setMatrixAt(i, dummy.matrix);
      tmpC.copy(SC[data.n[i].s] || C.glow); if (!on) tmpC.multiplyScalar(.25); else tmpC.lerp(new THREE.Color(1, 1, 1), sel ? .6 : .25);
      core.setColorAt(i, tmpC);
      hA[i] = on ? (sel ? 1 : .85) : .08; hS[i] = base[i] * (on ? (sel ? 3.2 : 1.7) : 1);
    }
    core.instanceMatrix.needsUpdate = true; if (core.instanceColor) core.instanceColor.needsUpdate = true;
    halos.geometry.attributes.aA.needsUpdate = true; halos.geometry.attributes.aSize.needsUpdate = true;
  }

  // ---- synapses: the findings' links (bright) + a faint web through the cortex ----
  const segs = [];                                          // [ax,ay,az,bx,by,bz]
  const eP = [], eC = [], eA = [];
  const push = (a, b, ca, cb, al) => { eP.push(a[0], a[1], a[2], b[0], b[1], b[2]); eC.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b); eA.push(al, al); segs.push([a, b]); };
  data.e.forEach(([a, b]) => push(pos[a], pos[b], SC[data.n[a].s], SC[data.n[b].s], .75));
  const NE = segs.length;
  for (let k = 0; k < 260; k++) {
    const i = (R() * NA) | 0; let best = -1, bd = 9;
    for (let t = 0; t < 14; t++) { const j = (R() * NA) | 0; if (j === i) continue; const d = Math.hypot(ap[i][0] - ap[j][0], ap[i][1] - ap[j][1], ap[i][2] - ap[j][2]); if (d < bd && d > .05) { bd = d; best = j; } }
    if (best >= 0 && bd < .6) push(ap[i], ap[best], C.dim, C.glow, .3);
  }
  // each finding also reaches into its cortex: 2 short fibres, so a lone neuron is never floating
  for (let i = 0; i < N; i++) for (let t = 0; t < 2; t++) { let best = -1, bd = 9; for (let u = 0; u < 10; u++) { const j = (R() * NA) | 0; const d = Math.hypot(pos[i][0] - ap[j][0], pos[i][1] - ap[j][1], pos[i][2] - ap[j][2]); if (d < bd) { bd = d; best = j; } } if (best >= 0) push(pos[i], ap[best], SC[data.n[i].s], C.dim, .28); }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(eP, 3)); lg.setAttribute('aC', new THREE.Float32BufferAttribute(eC, 3)); lg.setAttribute('aA', new THREE.Float32BufferAttribute(eA, 1));
  const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VS_LN, fragmentShader: FS_LN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lines.frustumCulled = false; rig.add(lines);

  // ---- pulses along the synapses (a handful of bright dots, CPU-moved) ----
  const NP = 90, pP = new Float32Array(NP * 3), pS = new Float32Array(NP).fill(.075), pA = new Float32Array(NP).fill(1), pC = new Float32Array(NP * 3), pPh = new Float32Array(NP), pulses = [];
  for (let i = 0; i < NP; i++) { pC.set([1, .93, .7], i * 3); pulses.push({ s: (R() < .5 ? (R() * NE) | 0 : (R() * segs.length) | 0), t: R(), v: .12 + R() * .2 }); }
  const pulse = mkPts(pP, pC, pS, pA, pPh);
  function movePulses(dt) {
    for (let i = 0; i < NP; i++) {
      const p = pulses[i]; p.t += p.v * dt;
      if (p.t >= 1) { p.t = 0; p.s = R() < .5 ? ((R() * NE) | 0) : ((R() * segs.length) | 0); }
      const a = segs[p.s][0], b = segs[p.s][1];
      pP[i * 3] = a[0] + (b[0] - a[0]) * p.t; pP[i * 3 + 1] = a[1] + (b[1] - a[1]) * p.t; pP[i * 3 + 2] = a[2] + (b[2] - a[2]) * p.t;
    }
    pulse.geometry.attributes.position.needsUpdate = true;
  }

  // ---- the glass shell ----
  const shellMat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VS_GL, fragmentShader: FS_GL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const sg = new THREE.SphereGeometry(1, 40, 30);
  // two hemispheres with a fissure between them, a cerebellum behind and below, and a stem
  [[-.56, .05, .02, .62, .92, 1.5], [.56, .05, .02, .62, .92, 1.5], [0, -.62, -1.15, .6, .3, .38]].forEach((q) => {
    const m = new THREE.Mesh(sg, shellMat); m.position.set(q[0], q[1], q[2]); m.scale.set(q[3], q[4], q[5]); rig.add(m);
  });

  // ---- view, size, loop ----
  rig.rotation.x = .95; rig.rotation.y = -.35;
  let vy = reduce ? 0 : .0016, vx = 0, dragging = false;
  function size() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    ST.dpr = Math.min(window.devicePixelRatio || 1, ST.level >= 1 ? 1.25 : 2, ST.level >= 2 ? 1 : 2);
    renderer.setPixelRatio(ST.dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // portrait phone: the brain's long axis fills the height; wide screens pull back less
    ST.fit = Math.max(4.2, Math.min(7.5, 2.25 / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect * 1.75)));
    if (!ST.userZoom) ST.zoom = ST.fit;
    uni.uPx.value = h * ST.dpr * .55;
  }
  function draw() {
    camera.position.set(0, 0, ST.zoom); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera); ST.frames++;
  }
  function frame(now) {
    ST.raf = 0; if (!ST.running) return;
    ST.raf = requestAnimationFrame(frame);
    const gap = now - ST.last, minGap = ST.level >= 1 ? 32 : 0;
    if (gap < minGap) return;
    const dt = Math.min(.06, gap / 1000); ST.last = now;
    ST.ema = ST.ema * .92 + gap * .08;                        // the drop-effects rule: slow for a second -> a lighter level
    if (ST.frames > 40 && ST.ema > (ST.level ? 52 : 36) && ++ST.slow > 50 && ST.level < 2) { ST.level++; ST.slow = 0; ST.ema = 16; applyLevel(); }
    uni.uT.value += dt;
    if (ST.sweepT >= 0) { ST.sweepT += dt; uni.uSweep.value = -2.2 + ST.sweepT * 2.0; if (ST.sweepT > 2.4) { ST.sweepT = -1; uni.uSweep.value = -9; } }
    if (!dragging) { rig.rotation.y += vy; rig.rotation.x += vx; vx *= .94; if (Math.abs(vy) > .0016 && !reduce) vy += ((.0016) - vy) * .02; }
    if (ST.level < 1 && !reduce) movePulses(dt);
    draw();
  }
  function applyLevel() {
    uni.uLow.value = ST.level >= 1 ? 1 : 0; pulse.visible = ST.level < 1; size();
    if (ST.level >= 2) { lines.visible = true; ambient.geometry.setDrawRange(0, 600); }
  }
  function run() { if (ST.running || ST.hidden || ST.off || ST.lost) return; if (reduce) { draw(); return; } ST.running = true; ST.last = performance.now(); ST.raf = requestAnimationFrame(frame); }
  function stop() { ST.running = false; if (ST.raf) cancelAnimationFrame(ST.raf); ST.raf = 0; }
  const redraw = () => { if (reduce || !ST.running) draw(); };
  const onVis = () => { ST.hidden = document.hidden; if (ST.hidden) stop(); else run(); };
  document.addEventListener('visibilitychange', onVis);
  let io = null; try { io = new IntersectionObserver((es) => { ST.off = !es[0].isIntersecting; if (ST.off) stop(); else run(); }); io.observe(canvas); } catch (e) {}
  const ro = new ResizeObserver(() => { size(); redraw(); }); ro.observe(canvas);
  const lost = (e) => { e.preventDefault(); ST.lost = true; stop(); if (cfg.onLost) cfg.onLost(); };
  canvas.addEventListener('webglcontextlost', lost);

  // ---- touch: drag = turn, pinch = zoom, tap = the nearest neuron ----
  const ptr = new Map(); let down = null, pinch0 = 0, zoom0 = 0;
  const v3 = new THREE.Vector3();
  function projectAll(i) {
    v3.set(pos[i][0], pos[i][1], pos[i][2]); rig.localToWorld(v3); v3.project(camera);
    const w = canvas.clientWidth, h = canvas.clientHeight; return { x: (v3.x * .5 + .5) * w, y: (-v3.y * .5 + .5) * h, z: v3.z };
  }
  function pickAt(x, y) {
    camera.updateMatrixWorld(); rig.updateMatrixWorld(true); let best = -1, bd = 1e9;
    for (let i = 0; i < N; i++) { if (vis[i] === 0) continue; const p = projectAll(i); const d = Math.hypot(p.x - x, p.y - y) + p.z * 6; if (Math.hypot(p.x - x, p.y - y) < 30 && d < bd) { bd = d; best = i; } }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => {
    ptr.set(e.pointerId, [e.clientX, e.clientY]); try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    if (ptr.size === 1) { down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; dragging = true; }
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = ST.zoom; down = null; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptr.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0 > 0) { ST.userZoom = true; ST.zoom = Math.max(2.6, Math.min(9, zoom0 * pinch0 / d)); } redraw(); return; }
    if (down) { down.moved += Math.abs(dx) + Math.abs(dy); rig.rotation.y += dx * .0065; rig.rotation.x = Math.max(-1.5, Math.min(1.5, rig.rotation.x + dy * .0055)); vy = dx * .0035; vx = 0; redraw(); }
  });
  const up = (e) => {
    const had = ptr.has(e.pointerId); ptr.delete(e.pointerId); if (!had) return;
    if (ptr.size === 0) { dragging = false; if (down && down.moved < 9 && performance.now() - down.t < 500 && e.type === 'pointerup') { const r = canvas.getBoundingClientRect(); const i = pickAt(e.clientX - r.left, e.clientY - r.top); if (cfg.onPick) cfg.onPick(i); } down = null; vy = reduce ? 0 : Math.max(-.02, Math.min(.02, vy)) || .0016; }
    if (ptr.size === 1) pinch0 = 0;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); ST.userZoom = true; ST.zoom = Math.max(2.6, Math.min(9, ST.zoom * (1 + e.deltaY * .0012))); redraw(); }, { passive: false });

  size(); paintCores(); run(); draw();
  return {
    setVisible(mask) { for (let i = 0; i < N; i++) vis[i] = mask && mask[i] === 0 ? 0 : 1; paintCores(); redraw(); },
    select(i) { ST.sel = i; paintCores(); redraw(); },
    sweep() { if (reduce) { uni.uSweep.value = 0; draw(); setTimeout(() => { uni.uSweep.value = -9; draw(); }, 900); return; } ST.sweepT = 0; run(); },
    project(i) { camera.updateMatrixWorld(); rig.updateMatrixWorld(true); const p = projectAll(i), r = canvas.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; },
    stats() { return { neurons: N, synapses: data.e.length, ambient: NA, drawn: NA + N * 2 + NP + 2, level: ST.level, frames: ST.frames, running: ST.running, reduce, dpr: ST.dpr, fps: ST.ema ? Math.round(1000 / ST.ema) : 0, calls: renderer.info.render.calls }; },
    dispose() {
      stop(); document.removeEventListener('visibilitychange', onVis); if (io) io.disconnect(); ro.disconnect(); canvas.removeEventListener('webglcontextlost', lost);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); renderer.dispose();
    },
  };
}
