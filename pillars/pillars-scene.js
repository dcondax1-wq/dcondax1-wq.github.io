/* THE FOUR PILLARS in 3D (pillars/pillars-scene.js, ES module, loaded after the first paint by pillars.js).
 * three.js r160 from cdnjs (pinned 0.160.0), else the site's own r160 copy (../jarvis/three.module.min.js).
 * create(canvas, cols, { onPick(id|null), reduce, low, onFrame(project) }) -> Promise<{ select(id), setFill(map), project(id), stats(), dispose() } | null>
 * cols = [{ id, name, color, fill 0..1 (how far the energy has risen: live = full, BLITZ off = low, ORDER FLOW = tick days / 60), dim }]
 * Each column: a fluted shaft (24 flutes in the vertex shader) with an energy level, fresnel rim, a capital and a plinth; light motes
 * rise inside the lit part; a mirror-dark floor with a glow under each column. 1 draw call per part type (InstancedMesh / merged).
 * Low power: fewer segments, no motes, dpr 1, 30 fps. Paused on a hidden tab. Reduced motion: drawn on interaction only. */
export const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
const THREE_LOCAL = '../jarvis/three.module.min.js';
async function loadThree() {
  try { return await import(THREE_CDN); } catch (_) { /* offline / blocked */ }
  try { return await import(THREE_LOCAL); } catch (_) { return null; }
}
export function isLowPower(w) {
  const n = (w && w.navigator) || {}, q = String((w && w.location && w.location.search) || '');
  if (/[?&]lite=1/.test(q)) return true;
  return (+n.hardwareConcurrency > 0 && +n.hardwareConcurrency <= 4) || (+n.deviceMemory > 0 && +n.deviceMemory <= 2) || !!(n.connection && n.connection.saveData);
}

const H = 2.4, R = .2;                       // shaft height and radius (world units)
const VS = `uniform float uT; varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
attribute float aFill; attribute vec3 aCol; attribute float aDim; varying float vFill; varying vec3 vCol; varying float vDim;
void main(){ vec3 p = position; float a = atan(p.z, p.x); vA = a; float fl = 1.0 + .06 * cos(a * 24.0); p.xz *= fl;
 vec4 w = instanceMatrix * vec4(p, 1.0); vec4 mv = modelViewMatrix * w; vV = normalize(-mv.xyz);
 vec3 n = normal; n.xz += -.25 * sin(a * 24.0) * vec2(-sin(a), cos(a)); vN = normalize(normalMatrix * mat3(instanceMatrix) * n);
 vY = position.y / ${H.toFixed(2)} + .5; vFill = aFill; vCol = aCol; vDim = aDim; gl_Position = projectionMatrix * mv; }`;
const FS = `precision mediump float; uniform float uT; uniform float uSel; varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
varying float vFill; varying vec3 vCol; varying float vDim;
void main(){ float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
 float flute = .55 + .45 * cos(vA * 24.0);
 float lit = 1.0 - smoothstep(vFill - .015, vFill + .015, vY);                          // below the energy level = lit
 float wave = .5 + .5 * sin(vY * 18.0 - uT * 2.2);
 vec3 glass = vec3(.12,.07,.2) * (.6 + .5 * flute) + vec3(.62,.35,.93) * rim * .9;
 vec3 energy = vCol * (.55 + .45 * flute) * (1.0 + .35 * wave * (1.0 - vDim)) + vCol * rim * 1.6;
 float edge = exp(-pow((vY - vFill) * 60.0, 2.0)) * (1.0 - vDim * .6);           // the bright line at the level
 vec3 col = mix(glass, energy * (1.0 - vDim * .55), lit) + vec3(1.0,.95,.8) * edge * 1.4;
 gl_FragColor = vec4(col, .88 + rim * .12); }`;
const VS_P = `attribute float aS; attribute vec3 aC; attribute float aA; uniform float uPx; varying vec3 vC; varying float vAl;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; vC = aC; vAl = aA; gl_PointSize = max(1.0, aS * uPx / max(.1, -mv.z)); }`;
const FS_P = `precision mediump float; varying vec3 vC; varying float vAl; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d,d) * 4.0; if (r > 1.0) discard;
 float g = pow(1.0 - r, 2.0); gl_FragColor = vec4(vC * (.6 + g), g * vAl); }`;
const VS_F = `varying vec2 vU; void main(){ vU = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FS_F = `precision mediump float; varying vec2 vU; uniform vec3 uC[4]; uniform vec2 uP[4]; uniform float uF[4];
void main(){ vec3 c = vec3(0.0); for (int i = 0; i < 4; i++) { float d = length(vU - uP[i]); c += uC[i] * uF[i] * exp(-d * d * 7.0) * .55; }
 float grid = (1.0 - smoothstep(.0, .02, abs(fract(vU.x * 2.0) - .5) - .47)) + (1.0 - smoothstep(.0, .02, abs(fract(vU.y * 2.0) - .5) - .47));
 float fade = exp(-dot(vU, vU) * .12); c += vec3(.24,.14,.36) * grid * .18 * fade; gl_FragColor = vec4(c * fade, 1.0); }`;

export async function create(canvas, cols, cfg) {
  cfg = cfg || {};
  const THREE = await loadThree(); if (!THREE) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !cfg.low, alpha: false, powerPreference: cfg.low ? 'low-power' : 'high-performance' }); } catch (_) { return null; }
  if (!renderer || !renderer.getContext()) return null;
  const low = !!cfg.low, reduce = !!cfg.reduce, N = cols.length;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000'); scene.fog = new THREE.FogExp2(0x000000, .07);
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 60);
  const ST = { yaw: 0, vy: 0, t0: performance.now(), last: 0, ema: 16, slow: 0, low, frames: 0, hidden: false, lost: false, running: false, sel: null, selT: 0, sel01: 0, zoom: 7 };
  const X = cols.map((_, i) => (i - (N - 1) / 2) * 1.02), P = X.map((x) => new THREE.Vector3(x, 0, 0));

  // ---- shafts (one InstancedMesh, the shader flutes them) ----
  const shaftGeo = new THREE.CylinderGeometry(R, R * 1.08, H, low ? 48 : 96, low ? 24 : 64, true);
  const fill = new Float32Array(N), colA = new Float32Array(N * 3), dim = new Float32Array(N);
  cols.forEach((c, i) => { const k = new THREE.Color(c.color); colA.set([k.r, k.g, k.b], i * 3); fill[i] = c.fill; dim[i] = c.dim ? 1 : 0; });
  shaftGeo.setAttribute('aFill', new THREE.InstancedBufferAttribute(fill, 1)); shaftGeo.setAttribute('aCol', new THREE.InstancedBufferAttribute(colA, 3));
  shaftGeo.setAttribute('aDim', new THREE.InstancedBufferAttribute(dim, 1));
  const shaftMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, uniforms: { uT: { value: 0 }, uSel: { value: 0 } } });
  const shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, N);
  const m4 = new THREE.Matrix4();
  cols.forEach((c, i) => { m4.makeTranslation(X[i], 0, 0); shafts.setMatrixAt(i, m4); });
  scene.add(shafts);
  // ---- capitals + plinths (two InstancedMeshes, lit by a simple standard material) ----
  const stone = new THREE.MeshStandardMaterial({ color: 0x1d1530, roughness: .35, metalness: .6, emissive: 0x3e255e, emissiveIntensity: .35 });
  const capGeo = new THREE.CylinderGeometry(R * 1.55, R * 1.15, .16, low ? 24 : 48), baseGeo = new THREE.BoxGeometry(R * 3.1, .16, R * 3.1);
  const caps = new THREE.InstancedMesh(capGeo, stone, N), bases = new THREE.InstancedMesh(baseGeo, stone, N);
  cols.forEach((c, i) => { m4.makeTranslation(X[i], H / 2 + .08, 0); caps.setMatrixAt(i, m4); m4.makeTranslation(X[i], -H / 2 - .08, 0); bases.setMatrixAt(i, m4); });
  scene.add(caps, bases);
  scene.add(new THREE.AmbientLight(0x4d2e76, 1.2)); const key = new THREE.DirectionalLight(0xffe2a8, 1.4); key.position.set(-2, 4, 3); scene.add(key);
  const rimL = new THREE.DirectionalLight(0x9d59ee, 2.2); rimL.position.set(2, 1, -3); scene.add(rimL);
  // ---- floor ----
  const floorMat = new THREE.ShaderMaterial({ vertexShader: VS_F, fragmentShader: FS_F, uniforms: {
    uC: { value: cols.map((c) => new THREE.Color(c.color)) }, uP: { value: X.map((x) => new THREE.Vector2(x, 0)) }, uF: { value: cols.map((c) => Math.max(.15, c.fill) * (c.dim ? .4 : 1)) } } });
  while (floorMat.uniforms.uC.value.length < 4) { floorMat.uniforms.uC.value.push(new THREE.Color(0)); floorMat.uniforms.uP.value.push(new THREE.Vector2(99, 99)); floorMat.uniforms.uF.value.push(0); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), floorMat); floor.position.y = -H / 2 - .16; scene.add(floor);
  // ---- halos on the capitals + rising motes ----
  const NM = low || reduce ? 0 : 60 * N, NHALO = N, NP = NM + NHALO;
  const pp = new Float32Array(NP * 3), pc = new Float32Array(NP * 3), ps = new Float32Array(NP), pa = new Float32Array(NP), mote = [];
  cols.forEach((c, i) => { const k = new THREE.Color(c.color); pp.set([X[i], H / 2 + .2, 0], i * 3); pc.set([k.r, k.g, k.b], i * 3); ps[i] = 3.2; pa[i] = c.dim ? .25 : .75; });
  for (let j = 0; j < NM; j++) { const i = j % N, k = new THREE.Color(cols[i].color); pc.set([k.r, k.g, k.b], (NHALO + j) * 3); ps[NHALO + j] = .1 + Math.random() * .12;
    mote.push({ i, a: Math.random() * 6.283, r: R * (.4 + Math.random() * .9), y: Math.random(), v: .05 + Math.random() * .12 }); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aC', new THREE.BufferAttribute(pc, 3)); pg.setAttribute('aS', new THREE.BufferAttribute(ps, 1)); pg.setAttribute('aA', new THREE.BufferAttribute(pa, 1));
  const pMat = new THREE.ShaderMaterial({ vertexShader: VS_P, fragmentShader: FS_P, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 300 } } });
  scene.add(new THREE.Points(pg, pMat));
  // ---- light shafts: a soft additive beam rising from each lit capital (a cheap bloom), one InstancedMesh ----
  const shaftQ = new THREE.PlaneGeometry(R * 3.2, H * .9); shaftQ.translate(0, H * .45, 0);
  const beamCol = new Float32Array(N * 3), beamA = new Float32Array(N);
  cols.forEach((c, i) => { const k = new THREE.Color(c.color); beamCol.set([k.r, k.g, k.b], i * 3); beamA[i] = c.dim ? .12 : .42 * Math.max(.2, c.fill); });
  shaftQ.setAttribute('aC', new THREE.InstancedBufferAttribute(beamCol, 3)); shaftQ.setAttribute('aA', new THREE.InstancedBufferAttribute(beamA, 1));
  const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 } },
    vertexShader: `attribute vec3 aC; attribute float aA; varying vec3 vC; varying float vA; varying vec2 vU; void main(){ vC = aC; vA = aA; vU = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
    fragmentShader: `precision mediump float; uniform float uT; varying vec3 vC; varying float vA; varying vec2 vU; void main(){ float x = 1.0 - abs(vU.x - .5) * 2.0; float a = pow(x, 3.0) * pow(1.0 - vU.y, 1.6) * vA * (.85 + .15 * sin(uT * 1.7 + vU.y * 9.0)); gl_FragColor = vec4(vC * a, a); }` });
  const beams = new THREE.InstancedMesh(shaftQ, beamMat, N);
  cols.forEach((c, i) => { m4.makeTranslation(X[i], H / 2 + .16, 0); beams.setMatrixAt(i, m4); });
  if (!low) scene.add(beams);
  // ---- parallax: the phone's tilt and the finger / mouse nudge the camera a little (never with reduced motion) ----
  let tiltX = 0, tiltY = 0;
  const onTilt = (e) => { if (reduce || e.gamma == null) return; tiltX = Math.max(-1, Math.min(1, e.gamma / 30)); tiltY = Math.max(-1, Math.min(1, (e.beta - 45) / 40)); wake(); };
  const onHover = (e) => { if (reduce || e.pointerType === 'touch') return; const r = canvas.getBoundingClientRect(); tiltX = ((e.clientX - r.left) / r.width - .5) * 1.4; tiltY = ((e.clientY - r.top) / r.height - .5) * 1.2; wake(); };
  addEventListener('deviceorientation', onTilt); canvas.addEventListener('pointermove', onHover);
  const tmp = new THREE.Vector3();

  function size() {
    const w = canvas.clientWidth || 390, h = canvas.clientHeight || 300, dpr = Math.min(ST.low ? 1 : 2, devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const span = (X[N - 1] - X[0]) / 2 + R * 2.2, tn = Math.tan(camera.fov * Math.PI / 360);
    ST.zoom = Math.max(span / (.86 * tn * camera.aspect), (H / 2 + (cfg.compact ? .45 : .95)) / (.92 * tn));   // headroom for the names over the capitals (the hero has none)
    pMat.uniforms.uPx.value = h * dpr * .5; wake();
  }
  function project(i, y) {
    tmp.set(X[i], y == null ? H / 2 + .22 : y, 0).project(camera);
    return { x: (tmp.x * .5 + .5) * canvas.clientWidth, y: (-tmp.y * .5 + .5) * canvas.clientHeight, z: tmp.z };
  }
  // input: drag turns the colonnade a little; a tap picks the nearest column
  let down = null, moved = 0;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY, performance.now()]; moved = 0; wake(); });
  canvas.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down[0]; moved += Math.abs(dx); ST.vy = dx * .0025; down[0] = e.clientX; ST.yaw = Math.max(-.6, Math.min(.6, ST.yaw + ST.vy)); wake(); });
  const up = (e) => {
    if (down && moved < 10 && performance.now() - down[2] < 500) {
      const r = canvas.getBoundingClientRect(); let best = -1, bd = 1e9;
      for (let i = 0; i < N; i++) { const top = project(i, H / 2), bot = project(i, -H / 2), x = (top.x + bot.x) / 2, cx = e.clientX - r.left, cy = e.clientY - r.top;
        const d = Math.abs(cx - x) + (cy < top.y - 30 || cy > bot.y + 20 ? 200 : 0); if (d < bd) { bd = d; best = i; } }
      const id = best >= 0 && bd < 60 ? cols[best].id : null; api.select(id); cfg.onPick && cfg.onPick(id);
    }
    down = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ST.lost = true; cfg.onLost && cfg.onLost(); });
  const onVis = () => { ST.hidden = document.hidden; if (!ST.hidden) wake(); };
  document.addEventListener('visibilitychange', onVis); addEventListener('resize', size);

  function frame(now) {
    ST.running = false; if (ST.hidden || ST.lost) return;
    const dt = Math.min(64, now - (ST.last || now)); ST.last = now; ST.ema = ST.ema * .9 + dt * .1;
    if (!ST.low && ST.frames > 90 && ST.ema > 40) { if (++ST.slow > 45) { ST.low = true; size(); } } else ST.slow = 0;
    const tS = (now - ST.t0) / 1000;
    if (!down) { ST.vy *= .92; ST.yaw = Math.max(-.6, Math.min(.6, ST.yaw + ST.vy)); if (!reduce) ST.yaw += (Math.sin(tS * .25) * .18 - ST.yaw) * .01; }
    const target = ST.sel ? X[cols.findIndex((c) => c.id === ST.sel)] * .35 : 0; ST.selT += (target - ST.selT) * .08;
    ST.px = (ST.px || 0) + (tiltX * .22 - (ST.px || 0)) * .06; ST.py = (ST.py || 0) + (tiltY * .18 - (ST.py || 0)) * .06;
    camera.position.set(Math.sin(ST.yaw + ST.px) * ST.zoom + ST.selT, .35 + ST.py, Math.cos(ST.yaw + ST.px) * ST.zoom); camera.lookAt(ST.selT, .12, 0);
    beamMat.uniforms.uT.value = reduce ? 0 : tS;
    shaftMat.uniforms.uT.value = reduce ? 0 : tS;
    for (let j = 0; j < NM; j++) { const q = mote[j], c = cols[q.i]; q.y += q.v * dt / 1000 * (c.dim ? .3 : 1); if (q.y > Math.max(.05, c.fill)) q.y = 0;
      const a = q.a + tS * .6; pp.set([X[q.i] + Math.cos(a) * q.r, -H / 2 + q.y * H, Math.sin(a) * q.r], (NHALO + j) * 3); pa[NHALO + j] = (c.dim ? .25 : .8) * (1 - q.y / Math.max(.05, c.fill)); }
    cols.forEach((c, i) => { const s = ST.sel === c.id; ps[i] = (s ? 4.6 : 3.2) * (1 + (reduce ? 0 : .08 * Math.sin(tS * 2 + i))); pa[i] = (c.dim ? .25 : .75) * (ST.sel && !s ? .4 : 1); });
    pg.attributes.position.needsUpdate = true; pg.attributes.aS.needsUpdate = true; pg.attributes.aA.needsUpdate = true;
    renderer.render(scene, camera); ST.frames++;
    if (cfg.onFrame) cfg.onFrame((id) => { const i = cols.findIndex((c) => c.id === id); return i < 0 ? null : project(i); });
    if (!reduce || down || Math.abs(ST.vy) > .0005 || Math.abs(target - ST.selT) > .002 || Math.abs(tiltX * .22 - ST.px) > .002) schedule();
  }
  function schedule() { if (ST.running) return; ST.running = true; if (ST.low) setTimeout(() => requestAnimationFrame(frame), 30); else requestAnimationFrame(frame); }
  function wake() { schedule(); }
  const api = {
    select(id) { ST.sel = id || null; wake(); },
    setFill(map) {
      cols.forEach((c, i) => { if (map && map[c.id] != null) { c.fill = Math.max(.02, Math.min(1, +map[c.id])); fill[i] = c.fill; floorMat.uniforms.uF.value[i] = Math.max(.15, c.fill) * (c.dim ? .4 : 1); } });
      shaftGeo.attributes.aFill.needsUpdate = true; wake();
    },
    project(id) { const i = cols.findIndex((c) => c.id === id); return i < 0 ? null : project(i); },
    stats() { return { frames: ST.frames, low: ST.low, calls: renderer.info.render.calls, cols: N, motes: NM, beams: !low, ema: Math.round(ST.ema * 10) / 10, three: THREE.REVISION }; },
    dispose() { document.removeEventListener('visibilitychange', onVis); removeEventListener('resize', size); removeEventListener('deviceorientation', onTilt); renderer.dispose(); },
  };
  size(); schedule();
  return api;
}
