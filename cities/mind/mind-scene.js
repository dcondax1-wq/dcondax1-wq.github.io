/* OLYMPUS Strategy Brain, the 3D scene (cities/mind/mind-scene.js, ES module, imported by mind.js after the first paint).
 * three.js r160 from cdnjs (pinned 0.160.0), else the site's own copy (../../jarvis/three.module.min.js, also r160).
 * create(canvas, lobes, { onPick(id|null), reduce, low, onLost }) -> Promise<{ select(id), setGlow(map), stats(), dispose() } | null>
 * Draw calls: a cortex point cloud (two hemispheres with folds), one halo point set for the lobes, one InstancedMesh of lobe cores,
 * synapse lines + travelling pulses, a folded cortex surface (gyri / sulci, key + back + rim light, far side fades). Low power (few cores / little memory / ?lite=1 / slow frames): half the
 * points, pixel ratio 1, no pulses, 30 fps. Paused on a hidden tab. Reduced motion: no auto-turn, frames drawn on interaction only.
 * Colours: OLYMPUS NIGHT (black, violet #3e255e/#4d2e76, glow #9d59ee, gold #f1c14b, mint #77db89). Read only. */
export const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
const THREE_LOCAL = '../../jarvis/three.module.min.js';

async function loadThree() {
  try { return await import(THREE_CDN); } catch (_) { /* offline / blocked: the local copy */ }
  try { return await import(THREE_LOCAL); } catch (_) { return null; }
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const RAD = [1.15, .9, 1.5];

const VS_PTS = `attribute float aSize; attribute float aA; attribute vec3 aC; attribute float aPh; uniform float uT, uPx, uLow, uFocus, uZ; uniform vec3 uFP;
varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
 float tw = uLow > .5 ? 1.0 : .7 + .3 * sin(uT * 1.3 + aPh * 6.283);
 float near = uFocus * exp(-pow(distance(position, uFP) * 2.6, 2.0));
 float dep = clamp(1.0 - (-mv.z - uZ) * .42, .22, 1.35);
 vA = (aA * tw * (1.0 - uFocus * .45) + near * .8) * dep; vC = mix(aC, vec3(1.0,.93,.72), near * .6);
 gl_PointSize = max(1.0, aSize * uPx * (1.0 + near) / max(.1, -mv.z)); }`;
const FS_PTS = `precision mediump float; varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d,d) * 4.0; if (r > 1.0) discard;
 float g = pow(1.0 - r, 2.0); gl_FragColor = vec4(vC * (.55 + g), g * vA); }`;
const VS_LN = `attribute vec3 aC; attribute float aA; varying vec3 vC; varying float vA; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); vC = aC; vA = aA; }`;
const FS_LN = `precision mediump float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC, vA); }`;
// the cortex: lit by a key light (top front left), a gold back light and a violet rim; sulci dark, gyri crests bright; far side fades
const VS_GL = `attribute float aR; uniform float uZ; varying vec3 vN; varying vec3 vV; varying float vR; varying float vD;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vR = aR;
 vD = clamp(1.0 - (-mv.z - uZ) * .38, .25, 1.25); gl_Position = projectionMatrix * mv; }`;
const FS_GL = `precision mediump float; varying vec3 vN; varying vec3 vV; varying float vR; varying float vD;
void main(){ vec3 n = normalize(vN); float ndv = abs(dot(n, vV)); float rim = pow(1.0 - ndv, 2.4);
 float key = max(dot(n, normalize(vec3(-.45,.75,.55))), 0.0); float back = pow(max(dot(n, normalize(vec3(.3,.2,-1.0))), 0.0), 2.0);
 float crest = smoothstep(.15, .95, vR);
 vec3 base = mix(vec3(.05,.025,.09), vec3(.30,.18,.46), crest) * (.35 + .9 * key);
 vec3 col = base + vec3(.62,.35,.93) * rim * 1.35 + vec3(.95,.76,.3) * back * .22 * crest;
 gl_FragColor = vec4(col * vD, (.20 + .38 * crest * key + rim * .55) * vD); }`;
// gyri: a ridged, domain-warped sine field (0 = deep in a sulcus, 1 = on a crest)
function ridge(x, y, z) {
  const f = Math.sin(9.5 * x + 2.4 * Math.sin(7.3 * z + 1.1)) + Math.sin(8.7 * z + 2.1 * Math.sin(6.1 * y)) + Math.sin(10.3 * y + 1.9 * Math.sin(8.2 * x + .7 * z));
  return 1 - Math.min(1, Math.abs(f) / 1.6);
}

export function isLowPower(w) {
  const n = (w && w.navigator) || {}, q = String((w && w.location && w.location.search) || '');
  if (/[?&]lite=1/.test(q)) return true;
  return (+n.hardwareConcurrency > 0 && +n.hardwareConcurrency <= 4) || (+n.deviceMemory > 0 && +n.deviceMemory <= 2) || !!(n.connection && n.connection.saveData);
}

export async function create(canvas, lobes, cfg) {
  cfg = cfg || {};
  const THREE = await loadThree();
  if (!THREE) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !cfg.low, alpha: false, powerPreference: cfg.low ? 'low-power' : 'high-performance' }); } catch (e) { return null; }
  if (!renderer || !renderer.getContext()) return null;
  const low = !!cfg.low, reduce = !!cfg.reduce;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
  scene.fog = new THREE.FogExp2(0x000000, .09);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 60);
  const rig = new THREE.Group(); scene.add(rig);
  const ST = { fit: 5.4, yaw: .3, pitch: .18, vy: 0, vp: 0, zoom: 5.4, zoomT: 5.4, sel: null, focus: 0, focusT: 0, fp: new THREE.Vector3(), t0: performance.now(), last: 0, ema: 16, slow: 0, low, hidden: false, frames: 0, lost: false, dirty: true, running: false };
  const R = rng(20261123);

  // ---- the cortex: points on two folded hemispheres, a midline fissure, a stem ----
  const NA = low ? 1400 : 3200, ap = new Float32Array(NA * 3), aC = new Float32Array(NA * 3), aS = new Float32Array(NA), aA = new Float32Array(NA), aP = new Float32Array(NA);
  const violet = new THREE.Color('#9d59ee'), deep = new THREE.Color('#4d2e76'), gold = new THREE.Color('#f1c14b'), mint = new THREE.Color('#77db89');
  for (let i = 0; i < NA; i++) {
    let x, y, z;
    if (i < NA * .94) {
      const a = R() * 6.283, b = Math.acos(2 * R() - 1), shell = .8 + .2 * Math.pow(R(), .4);
      x = Math.sin(b) * Math.cos(a); y = Math.cos(b); z = Math.sin(b) * Math.sin(a);
      const fold = 1 + .06 * Math.sin(x * 9 + z * 6) * Math.sin(y * 8 + z * 4);   // the gyri
      x *= RAD[0] * shell * fold; y *= RAD[1] * shell * fold; z *= RAD[2] * shell * fold;
      if (y < -.35) y = -.35 + (y + .35) * .55;                                       // flat base
      x += x < 0 ? -.08 : .08;                                                        // the fissure
    } else { const h = R(); x = (R() - .5) * .18; y = -.35 - h * .75; z = -.2 - h * .25 + (R() - .5) * .14; }
    ap.set([x, y, z], i * 3);
    const t = R(), col = t < .06 ? gold : t < .14 ? mint : t < .55 ? violet : deep;
    aC.set([col.r, col.g, col.b], i * 3); aS[i] = .03 + R() * .045; aA[i] = .22 + R() * .4; aP[i] = R();
  }
  const ptsMat = new THREE.ShaderMaterial({ vertexShader: VS_PTS, fragmentShader: FS_PTS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uPx: { value: 300 }, uLow: { value: low || reduce ? 1 : 0 }, uFocus: { value: 0 }, uZ: { value: 5.4 }, uFP: { value: ST.fp } } });
  const g1 = new THREE.BufferGeometry();
  g1.setAttribute('position', new THREE.BufferAttribute(ap, 3)); g1.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
  g1.setAttribute('aSize', new THREE.BufferAttribute(aS, 1)); g1.setAttribute('aA', new THREE.BufferAttribute(aA, 1)); g1.setAttribute('aPh', new THREE.BufferAttribute(aP, 1));
  rig.add(new THREE.Points(g1, ptsMat));

  // ---- the cortex surface: two folded hemispheres, the cerebellum and the stem, merged into one mesh (one draw call) ----
  function part(geo, sx, sy, sz, cx, cy, cz, fold, flatBase) {
    const p = geo.attributes.position, rr = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) * sx, y = p.getY(i) * sy, z = p.getZ(i) * sz;
      if (flatBase && y < -.35 * sy / .9) y = -.35 * sy / .9 + (y + .35 * sy / .9) * .5;
      const r = fold ? ridge(x + cx, y + cy, z + cz) : .6, k = 1 + fold * (r - .55);
      p.setXYZ(i, x * k + cx, y * k + cy, z * k + cz); rr[i] = r;
    }
    geo.setAttribute('aR', new THREE.BufferAttribute(rr, 1)); return geo;
  }
  const segW = low ? 40 : 120, segH = low ? 28 : 84;
  const parts = [
    part(new THREE.SphereGeometry(1, segW, segH), RAD[0] * .56, RAD[1] * .98, RAD[2] * .98, .5, 0, 0, .07, true),     // the hemispheres touch: the fissure
    part(new THREE.SphereGeometry(1, segW, segH), RAD[0] * .56, RAD[1] * .98, RAD[2] * .98, -.5, 0, 0, .07, true),
    part(new THREE.SphereGeometry(1, low ? 24 : 56, low ? 14 : 32), .72, .3, .42, 0, -.5, -1.02, .05, false),
    part(new THREE.CylinderGeometry(.13, .09, .75, low ? 10 : 18, 1, true), 1, 1, 1, 0, -.78, -.45, 0, false),
  ];
  const cortexGeo = mergeParts(parts);
  function mergeParts(list) {
    let nv = 0, ni = 0; list.forEach((g) => { nv += g.attributes.position.count; ni += g.index.count; });
    const pos = new Float32Array(nv * 3), ar = new Float32Array(nv), idx = new Uint32Array(ni); let ov = 0, oi = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, ov * 3); ar.set(g.attributes.aR.array, ov);
      const I = g.index.array; for (let i = 0; i < I.length; i++) idx[oi + i] = I[i] + ov;
      ov += g.attributes.position.count; oi += I.length; g.dispose();
    }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('aR', new THREE.BufferAttribute(ar, 1));
    out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeVertexNormals(); return out;
  }
  const cortexMat = new THREE.ShaderMaterial({ vertexShader: VS_GL, fragmentShader: FS_GL, transparent: true, depthWrite: false, side: THREE.FrontSide, uniforms: { uZ: { value: 5.4 } } });
  const cortex = new THREE.Mesh(cortexGeo, cortexMat); cortex.renderOrder = -1; rig.add(cortex);

  // ---- the lobes: an instanced core each + a halo point set ----
  const NL = lobes.length, P = lobes.map((l) => new THREE.Vector3(l.pos[0], l.pos[1], l.pos[2]));
  const coreGeo = new THREE.IcosahedronGeometry(1, low ? 1 : 3);
  const cores = new THREE.InstancedMesh(coreGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: .95 }), NL);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const glowV = lobes.map(() => .6);
  function placeCores(tS) {
    lobes.forEach((l, i) => {
      const sel = ST.sel === l.id, s = (l.pillar ? .125 : l.kind === 'strategy' ? .07 : l.kind === 'research' ? .05 : .062) * (sel ? 1.45 : 1) * (1 + (reduce ? 0 : .08 * Math.sin(tS * 2 + i)));
      m4.makeScale(s, s, s).setPosition(P[i]); cores.setMatrixAt(i, m4);
      col.set(l.color).multiplyScalar(.55 + .6 * glowV[i]); cores.setColorAt(i, col);
    });
    cores.instanceMatrix.needsUpdate = true; if (cores.instanceColor) cores.instanceColor.needsUpdate = true;
  }
  rig.add(cores);
  // ---- the Strategy Lab neurons: one small core per tested strategy (cfg.neurons from mindcore.labNeurons), one draw call ----
  const NEU = Array.isArray(cfg.neurons) ? cfg.neurons : [], NN = NEU.length, NP3 = NEU.map((q) => new THREE.Vector3(q.pos[0], q.pos[1], q.pos[2]));
  const neu = NN ? new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, low ? 0 : 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: .95 }), NN) : null;
  function placeNeurons(tS) {
    if (!neu) return;
    NEU.forEach((q, i) => {
      const sel = ST.sel === q.id, base = q.verdict === 'live' ? .03 : q.verdict === 'rejected' ? .016 : .024;
      const s = base * (sel ? 2.2 : 1) * (1 + (reduce || q.verdict === 'rejected' ? 0 : .15 * Math.sin(tS * 3 + i * 1.7)));
      m4.makeScale(s, s, s).setPosition(NP3[i]); neu.setMatrixAt(i, m4);
      col.set(q.color).multiplyScalar(ST.sel && !sel && ST.sel !== 'lab' ? .5 : q.verdict === 'rejected' ? .7 : 1.15); neu.setColorAt(i, col);
    });
    neu.instanceMatrix.needsUpdate = true; if (neu.instanceColor) neu.instanceColor.needsUpdate = true;
  }
  if (neu) rig.add(neu);
  const hp = new Float32Array(NL * 3), hc = new Float32Array(NL * 3), hs = new Float32Array(NL), ha = new Float32Array(NL), hph = new Float32Array(NL);
  lobes.forEach((l, i) => { hp.set(l.pos, i * 3); const c = new THREE.Color(l.color); hc.set([c.r, c.g, c.b], i * 3); hs[i] = l.kind === 'strategy' ? 1.2 : .85; ha[i] = .9; hph[i] = i / NL; });
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hp, 3)); hg.setAttribute('aC', new THREE.BufferAttribute(hc, 3));
  hg.setAttribute('aSize', new THREE.BufferAttribute(hs, 1)); hg.setAttribute('aA', new THREE.BufferAttribute(ha, 1)); hg.setAttribute('aPh', new THREE.BufferAttribute(hph, 1));
  const haloMat = ptsMat.clone(); haloMat.uniforms = THREE.UniformsUtils.clone(ptsMat.uniforms); haloMat.uniforms.uFP.value = ST.fp;
  rig.add(new THREE.Points(hg, haloMat));

  // ---- synapses: every strategy lobe to every other + to its research lobe; curved, with pulses ----
  const pairs = [];
  lobes.forEach((a, i) => lobes.forEach((b, j) => { if (j > i && (a.kind === 'strategy' || b.kind === 'strategy' || R() < .35)) pairs.push([i, j]); }));
  const SEG = 14, curves = pairs.map(([i, j]) => { const mid = P[i].clone().add(P[j]).multiplyScalar(.5); mid.multiplyScalar(.55); return new THREE.QuadraticBezierCurve3(P[i], mid, P[j]); });
  const lp = new Float32Array(pairs.length * SEG * 2 * 3), lc = new Float32Array(pairs.length * SEG * 2 * 3), la = new Float32Array(pairs.length * SEG * 2);
  curves.forEach((cv, k) => {
    const pts = cv.getPoints(SEG), ca = new THREE.Color(lobes[pairs[k][0]].color), cb = new THREE.Color(lobes[pairs[k][1]].color);
    for (let s = 0; s < SEG; s++) {
      const o = (k * SEG + s) * 2; [pts[s], pts[s + 1]].forEach((p, e) => { lp.set([p.x, p.y, p.z], (o + e) * 3); const cc = ca.clone().lerp(cb, (s + e) / SEG); lc.set([cc.r, cc.g, cc.b], (o + e) * 3); la[o + e] = .16; });
    }
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('aC', new THREE.BufferAttribute(lc, 3)); lg.setAttribute('aA', new THREE.BufferAttribute(la, 1));
  const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ vertexShader: VS_LN, fragmentShader: FS_LN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  rig.add(lines);
  function lineAlpha() {
    pairs.forEach(([i, j], k) => { const on = ST.sel && (lobes[i].id === ST.sel || lobes[j].id === ST.sel); for (let s = 0; s < SEG * 2; s++) la[k * SEG * 2 + s] = ST.sel ? (on ? .55 : .05) : .16; });
    lg.attributes.aA.needsUpdate = true;
  }
  const NP = low || reduce ? 0 : Math.min(60, pairs.length * 2), pp = new Float32Array(Math.max(1, NP) * 3), pc = new Float32Array(Math.max(1, NP) * 3), ps = new Float32Array(Math.max(1, NP)), pa = new Float32Array(Math.max(1, NP)), pph = new Float32Array(Math.max(1, NP));
  const pulse = []; for (let k = 0; k < NP; k++) { const c = new THREE.Color(R() < .5 ? '#f1c14b' : '#ffffff'); pc.set([c.r, c.g, c.b], k * 3); ps[k] = .5; pa[k] = .9; pulse.push({ c: Math.floor(R() * curves.length), u: R(), v: .12 + R() * .25 }); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aC', new THREE.BufferAttribute(pc, 3));
  pg.setAttribute('aSize', new THREE.BufferAttribute(ps, 1)); pg.setAttribute('aA', new THREE.BufferAttribute(pa, 1)); pg.setAttribute('aPh', new THREE.BufferAttribute(pph, 1));
  const pMat = ptsMat.clone(); pMat.uniforms = THREE.UniformsUtils.clone(ptsMat.uniforms); pMat.uniforms.uLow.value = 1;
  if (NP) rig.add(new THREE.Points(pg, pMat));
  const tmp = new THREE.Vector3();

  // ---- size, input, picking ----
  function size() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight, dpr = Math.min(ST.low ? 1 : 2, devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 54 : 40; camera.updateProjectionMatrix();
    const tn = Math.tan(camera.fov * Math.PI / 360);
    ST.fit = Math.max(3.2, 1.62 / (.88 * tn * camera.aspect), 1.12 / (.92 * tn));   // the brain fills ~85% of the width and fits the height
    const px = h * dpr * .55; [ptsMat, haloMat, pMat].forEach((m) => (m.uniforms.uPx.value = px)); if (!ST.sel) ST.zoomT = ST.fit; ST.dirty = true;
  }
  function projectV(v) {
    tmp.copy(v).applyMatrix4(rig.matrixWorld).project(camera);
    return { x: (tmp.x * .5 + .5) * canvas.clientWidth, y: (-tmp.y * .5 + .5) * canvas.clientHeight, z: tmp.z };
  }
  function project(i) {
    tmp.copy(P[i]).applyMatrix4(rig.matrixWorld).project(camera);
    return { x: (tmp.x * .5 + .5) * canvas.clientWidth, y: (-tmp.y * .5 + .5) * canvas.clientHeight, z: tmp.z };
  }
  const ptr = new Map(); let downAt = null, pinch0 = 0, moved = 0;
  function onDown(e) { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); downAt = [e.clientX, e.clientY, performance.now()]; moved = 0;
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } wake(); }
  function onMove(e) {
    if (!ptr.has(e.pointerId)) return; const prev = ptr.get(e.pointerId), cur = [e.clientX, e.clientY]; ptr.set(e.pointerId, cur);
    if (ptr.size === 1) { const dx = cur[0] - prev[0], dy = cur[1] - prev[1]; moved += Math.abs(dx) + Math.abs(dy); ST.vy = dx * .006; ST.vp = dy * .004; ST.yaw += ST.vy; ST.pitch = Math.max(-.9, Math.min(.9, ST.pitch + ST.vp)); }
    else if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) ST.zoomT = Math.max(2.6, Math.min(12, ST.zoomT * pinch0 / d)); pinch0 = d; moved += 99; }
    wake();
  }
  function onUp(e) {
    ptr.delete(e.pointerId);
    if (downAt && moved < 10 && performance.now() - downAt[2] < 500) pick(e.clientX, e.clientY);
    downAt = null; if (ptr.size < 2) pinch0 = 0;
  }
  function onWheel(e) { e.preventDefault(); ST.zoomT = Math.max(2.6, Math.min(12, ST.zoomT * (1 + Math.sign(e.deltaY) * .08))); wake(); }
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect(); let best = -1, bd = 40;
    for (let i = 0; i < NL; i++) { const p = project(i); if (p.z > 1) continue; const d = Math.hypot(p.x - (cx - r.left), p.y - (cy - r.top)); if (d < bd) { bd = d; best = i; } }
    let id = best >= 0 ? lobes[best].id : null;
    for (let i = 0, nd = Math.min(bd * .7, 22); i < NN; i++) {          // a lab neuron wins only when it is clearly the nearer one
      const p = projectV(NP3[i]); if (p.z > 1) continue; const d = Math.hypot(p.x - (cx - r.left), p.y - (cy - r.top)); if (d < nd) { nd = d; id = NEU[i].id; }
    }
    api.select(id); cfg.onPick && cfg.onPick(id);
  }
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ST.lost = true; cfg.onLost && cfg.onLost(); });
  const onVis = () => { ST.hidden = document.hidden; if (!ST.hidden) wake(); };
  document.addEventListener('visibilitychange', onVis); addEventListener('resize', size);

  // ---- the frame ----
  function frame(now) {
    ST.running = false; if (ST.hidden || ST.lost) return;
    const dt = Math.min(64, now - (ST.last || now)); ST.last = now; ST.ema = ST.ema * .9 + dt * .1;
    if (!ST.low && ST.frames > 90 && ST.ema > 40) { if (++ST.slow > 45) { ST.low = true; size(); } } else ST.slow = 0;
    const tS = (now - ST.t0) / 1000;
    if (!ptr.size) { ST.vy *= .94; ST.vp *= .9; ST.yaw += ST.vy + (reduce || ST.sel ? 0 : .0018 * dt / 16); ST.pitch = Math.max(-.9, Math.min(.9, ST.pitch + ST.vp)); }
    ST.zoom += (ST.zoomT - ST.zoom) * .1; ST.focus += (ST.focusT - ST.focus) * .12;
    rig.rotation.set(ST.pitch, ST.yaw, 0); camera.position.set(0, -.08, ST.zoom); camera.lookAt(0, -.08, 0);
    [ptsMat, haloMat].forEach((m) => { m.uniforms.uT.value = tS; m.uniforms.uFocus.value = ST.focus; m.uniforms.uZ.value = ST.zoom; }); cortexMat.uniforms.uZ.value = ST.zoom;
    placeCores(tS); placeNeurons(tS);
    for (let k = 0; k < NP; k++) { const q = pulse[k]; q.u += q.v * dt / 1000; if (q.u > 1) { q.u = 0; q.c = Math.floor(Math.random() * curves.length); } curves[q.c].getPoint(q.u, tmp); pp.set([tmp.x, tmp.y, tmp.z], k * 3); }
    if (NP) pg.attributes.position.needsUpdate = true;
    renderer.render(scene, camera); ST.frames++; ST.dirty = false;
    if (cfg.onFrame) { rig.updateMatrixWorld(); cfg.onFrame((id) => api.project(id)); }
    const settling = Math.abs(ST.zoomT - ST.zoom) > .01 || Math.abs(ST.focusT - ST.focus) > .01 || Math.abs(ST.vy) + Math.abs(ST.vp) > .0005;
    if (!reduce || settling || ptr.size) schedule();
  }
  function schedule() {
    if (ST.running) return; ST.running = true;
    if (ST.low) setTimeout(() => requestAnimationFrame(frame), 18); else requestAnimationFrame(frame);
  }
  function wake() { schedule(); }

  const api = {
    select(id) {
      ST.sel = id || null; const i = lobes.findIndex((l) => l.id === id), ni = NEU.findIndex((q) => q.id === id);
      if (ni >= 0) { ST.fp.copy(NP3[ni]); ST.focusT = 1; ST.zoomT = ST.fit * .84; }
      else if (i >= 0) { ST.fp.copy(P[i]); ST.focusT = 1; ST.zoomT = ST.fit * .82; const yaw = Math.atan2(-P[i].x, P[i].z); let d = yaw - ST.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); ST.vy = d * .06; /* the inertia (x .94 a frame) turns the lobe to the front */ }
      else { ST.focusT = 0; ST.zoomT = ST.fit; }
      lineAlpha(); wake();
    },
    setGlow(map) { lobes.forEach((l, i) => { if (map && map[l.id] != null) glowV[i] = +map[l.id]; }); wake(); },
    project(id) { const i = lobes.findIndex((l) => l.id === id); if (i >= 0) return project(i); const n = NEU.findIndex((q) => q.id === id); return n < 0 ? null : projectV(NP3[n]); },
    stats() { const info = renderer.info; return { frames: ST.frames, low: ST.low, calls: info.render.calls, points: NA + NL + NP, lobes: NL, neurons: NN, three: THREE.REVISION }; },
    dispose() { document.removeEventListener('visibilitychange', onVis); removeEventListener('resize', size); renderer.dispose(); },
  };
  size(); placeCores(0); placeNeurons(0); lineAlpha(); schedule();
  return api;
}
