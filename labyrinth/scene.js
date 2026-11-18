// LABYRINTH scene (ES module): the risk maze, drawn by the OLYMPUS render core (docs/OLYMPUS_RENDER.md).
// A glowing corridor floats over an obsidian labyrinth. x is the trades (left to right), height is your balance.
//   the FLOOR wall   black blocks with a red neon edge: the trailing max-loss line, rising as you win, locked at start + $100
//   the TARGET       a gold line and a gate at the far end: reach it and the eval is passed
//   your run         a cyan light trail with a runner on the end (gold when it passes, red when the floor catches it)
//   ghosts           24 faint paths from random draws of the same trades: the crowd of "what could have happened"
// createMaze(canvas, { O }) -> { setRun({ steps, rules, ghosts, horizon, outcome }), onQuality(cb), lite(), quality(), stats(), dispose() }
// JOB 4+5 (2026-11-04): a polished reflective floor, bronze walls, light shafts through dust, sparks at the gate (and red embers when the floor
// catches the runner), contact shadows under the gate, the DANGER heat strip (setRun({ hazard })) and a walkthrough (walk / stopWalk).
// 30-60 fps on a phone: instanced blocks, one tube, one line set; the maze underneath is built once (seeded). Reduced motion =
// a still scene redrawn only when the run changes.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';
import * as FX from '../olympus/fx-atmos.js';

const W = 22, H = 8.5, XL = -W / 2;
const RED = '#c96a4a', GOLD = '#d4b05a', CYAN = '#efe0bd';   // AGORA: terracotta floor wall, gold gate, a warm ivory trail
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);

function mazeCells(cols, rows, seed) {                    // a seeded depth-first maze: the walls that remain
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const seen = new Uint8Array(cols * rows), open = new Set(), stack = [[0, 0]];
  seen[0] = 1;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1], nb = [];
    if (x > 0 && !seen[y * cols + x - 1]) nb.push([x - 1, y]);
    if (x < cols - 1 && !seen[y * cols + x + 1]) nb.push([x + 1, y]);
    if (y > 0 && !seen[(y - 1) * cols + x]) nb.push([x, y - 1]);
    if (y < rows - 1 && !seen[(y + 1) * cols + x]) nb.push([x, y + 1]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[Math.floor(rnd() * nb.length)];
    open.add(`${Math.min(x, nx)},${Math.min(y, ny)},${x === nx ? 'h' : 'v'}`);
    seen[ny * cols + nx] = 1; stack.push([nx, ny]);
  }
  const walls = [];                                        // [x, z, length, horizontal]
  for (let y = 0; y <= rows; y++) for (let x = 0; x < cols; x++) walls.push([x + 0.5, y, 1, true, y === 0 || y === rows]);
  for (let x = 0; x <= cols; x++) for (let y = 0; y < rows; y++) walls.push([x, y + 0.5, 1, false, x === 0 || x === cols]);
  return walls.filter(([x, y, , h, border]) => {
    if (border) return true;
    // an inner wall is open when the maze carved through it
    return h ? !open.has(`${Math.floor(x)},${y - 1},h`) : !open.has(`${x - 1},${Math.floor(y)},v`);
  });
}

export function createMaze(canvas, { O = null } = {}) {
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b1f17');
  scene.fog = new THREE.FogExp2(0x3a2a20, 0.017);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
  let fxList = [], lite = false, dirty = true, qcb = null, drawn = 0, frames = 0, stopped = false, raf = 0;
  const rc = createRenderer({ canvas, scene, camera, env: 'night', tint: GOLD, theme: { sky: '#4a3626', fog: '#2a1d14', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, exposure: 1.0, maxDpr: 1.75, bloom: { strength: 0.2, radius: 0.5, threshold: 0.96 },
    onQuality: (l) => { lite = l === 'low' || l === 'off'; dirty = true; FX.setQuality(fxList, l); if (qcb) qcb(l); } });
  lite = rc.quality() === 'low' || rc.quality() === 'off';

  scene.add(new THREE.HemisphereLight('#e8c89a', '#3a281a', 0.85));
  const key = new THREE.DirectionalLight('#ffd9a8', 1.2); key.position.set(-8, 14, 10); scene.add(key);
  const rimLight = new THREE.DirectionalLight('#f0c890', 0.6); rimLight.position.set(10, 6, -14); scene.add(rimLight);          // a cool rim from behind: bronze edges read against the dark
  const warmFill = new THREE.PointLight('#ffb36b', 30, 36, 1.7); warmFill.position.set(-8, 5, 6); scene.add(warmFill);
  const redLight = new THREE.PointLight(RED, 26, 40, 1.6); redLight.position.set(0, 1, 2); scene.add(redLight);
  const gate = new THREE.PointLight(GOLD, 28, 30, 1.6); gate.position.set(W / 2, 7, 0); scene.add(gate);

  // ---- sky and the labyrinth underneath (built once)
  const stars = { update() {} };           // no stars: a warm dusk
  const neb = { update() {} };
  const floorFx = FX.polishedFloor({ size: 220, color: '#4a382a', y: -1.6, roughness: 0.4 }); scene.add(floorFx.object);
  // the room's light: shafts falling through the haze onto the maze, dust in them, a bronze-lit rim
  const shaftFx = FX.shafts({ count: 5, from: [-3, 22, 8], to: [0, -1.6, 0], width: 7, spread: [16, 0, 10], color: '#ffd9a8', strength: 0.1 });
  const dustFx = FX.dust({ count: 260, box: [34, 14, 26], color: '#ffe6c0', size: 4.5, strength: 0.9 });
  dustFx.object.position.set(0, -1.2, 0);
  const gateEmb = FX.embers({ count: 120, origin: [W / 2 + 0.2, 0, 0], spread: [1.4, 0, 2.8], rise: 6, colors: ['#fff1b8', '#ffc247', '#ff7a1f'], size: 6, wind: -0.2 });
  const bustEmb = FX.embers({ count: 90, origin: [0, 0, 0], spread: [0.6, 0, 0.6], rise: 4.5, colors: ['#ffd0c8', '#ff4d57', '#7a1020'], size: 6, seed: 21 });
  bustEmb.object.visible = false;
  scene.add(shaftFx.object, dustFx.object, gateEmb.object, bustEmb.object);
  const aoGate = [-1.6, 1.6].map((z) => { const a = FX.contactAO({ radius: 0.9, strength: 0.8 }); a.object.position.set(W / 2 + 0.2, -1.58, z); scene.add(a.object); return a; });
  fxList = [floorFx, shaftFx, dustFx, gateEmb, bustEmb, ...aoGate]; FX.setQuality(fxList, rc.quality());
  const CELL = 2.2, COLS = 13, ROWS = 8, walls = mazeCells(COLS, ROWS, 41);
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const wm = new THREE.InstancedMesh(wallGeo, FX.bronze({ color: '#a2714a', roughness: 0.36 }), walls.length);
  const em = new THREE.InstancedMesh(wallGeo, new THREE.MeshBasicMaterial({ color: hdr('#b9895a', 0.9) }), walls.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  walls.forEach(([x, z, , horiz], i) => {
    const wx = (x - COLS / 2) * CELL, wz = (z - ROWS / 2) * CELL - 1;
    p3.set(wx, -1.6 + 0.7, wz); s3.set(horiz ? CELL + 0.16 : 0.16, 1.4, horiz ? 0.16 : CELL + 0.16); m4.compose(p3, q, s3); wm.setMatrixAt(i, m4);
    p3.y = -1.6 + 1.42; s3.y = 0.04; m4.compose(p3, q, s3); em.setMatrixAt(i, m4);
  });
  scene.add(wm, em);

  // ---- the corridor frame: the start line, the target, the gate
  const yOf = { v: (b) => 0, ymin: 0, ymax: 1 };
  const yScale = (b) => ((b - yOf.ymin) / (yOf.ymax - yOf.ymin)) * H;
  const xAt = (i, L) => XL + (W * i) / L;
  const startLine = new THREE.Mesh(new THREE.BoxGeometry(W, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: hdr('#e8d9b8', 0.8) })); scene.add(startLine);
  const targetLine = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: hdr(GOLD, 1.3) })); scene.add(targetLine);
  const targetSheet = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.6), new THREE.MeshBasicMaterial({ color: hdr(GOLD, 0.6), transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  scene.add(targetSheet);
  const gateGroup = new THREE.Group(); scene.add(gateGroup);
  const gold = M.metal({ kind: 'gold' });
  for (const z of [-1.6, 1.6]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 5, 14), gold); c.position.set(0, 0, z); gateGroup.add(c); }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 10, 28, Math.PI), gold); arch.rotation.set(0, Math.PI / 2, 0); arch.position.y = 2.5; gateGroup.add(arch);
  const gateGlow = new THREE.Mesh(new THREE.CircleGeometry(1.45, 28, 0, Math.PI), new THREE.MeshBasicMaterial({ color: hdr(GOLD, 0.9), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  gateGlow.rotation.y = Math.PI / 2; gateGlow.position.y = 2.5; gateGroup.add(gateGlow);

  // ---- the floor wall: blocks under the floor line, a red neon edge
  const MAXL = 40;
  const blockMat = M.marble({ color: '#c9bba5', gold: false, scale: 0.6, roughness: 0.55 });
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 2.6), blockMat, MAXL + 1);
  const edges = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.16), new THREE.MeshBasicMaterial({ color: hdr(RED, 1.35) }), MAXL + 1);
  blocks.count = edges.count = 0; scene.add(blocks, edges);
  let floorTube = null, pathTube = null, pathGlow = null, ghostLines = null;
  const threadFx = FX.threadGlow({ color: CYAN, strength: 0.6, speed: 0.5 });          // fibre light around the runner's trail: a fresnel halo with a pulse running along it
  const floorMat = new THREE.MeshBasicMaterial({ color: hdr(RED, 1.4) }), pathMat = new THREE.MeshBasicMaterial({ color: hdr(CYAN, 1.2) });
  const runner = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), new THREE.MeshBasicMaterial({ color: hdr(CYAN, 1.6) }));
  const runnerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: hdr(CYAN, 1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
  runnerGlow.scale.set(2.6, 2.6, 1); runner.add(runnerGlow); scene.add(runner);

  // ---- the DANGER strip: one quad per trade number on the floor in front of the corridor, red where more runs end at the floor
  const heat = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 }), MAXL + 1);
  heat.count = 0; heat.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((MAXL + 1) * 3), 3); scene.add(heat);
  const heatCol = (k) => { const c = new THREE.Color(); c.setRGB(0.15 + 2.6 * k, 0.9 * (1 - k) * (k < 0.5 ? 0.9 : 0.4) + 0.08, 0.28 * (1 - k) + 0.05); return c; };
  const walkSt = { on: false, p: 0, speed: 0.11, last: -1, cb: null, curve: null, total: 0, radial: 7 };
  const run = { steps: [], L: 15, outcome: 'open', t0: 0, rules: null };
  function disposeObj(o) { if (!o) return; scene.remove(o); o.geometry && o.geometry.dispose(); }

  function setRun(r) {
    const { steps, rules, horizon } = r, L = Math.max(4, Math.min(MAXL, horizon | 0 || 15));
    Object.assign(run, { steps, L, outcome: r.outcome, rules, t0: performance.now() });
    yOf.ymin = rules.start - rules.mll - 350; yOf.ymax = rules.start + rules.target + 450;
    const tY = yScale(rules.start + rules.target), sY = yScale(rules.start);
    startLine.position.set(0, sY, 0); targetLine.position.set(0, tY, 0); targetSheet.position.set(0, tY + 0.8, 0);
    gateGroup.position.set(W / 2 + 0.2, tY - 2.5 + 0.0, 0); gate.position.set(W / 2, tY, 0);
    // the floor: one block per step; after the run ends the floor holds
    const n = steps.length, floorY = (i) => yScale((steps[Math.min(i, n - 1)] || steps[n - 1]).floor);
    blocks.count = edges.count = L + 1;
    const bw = W / L + 0.02;
    for (let i = 0; i <= L; i++) {
      const fy = floorY(i), bot = -1.5, hgt = Math.max(0.1, fy - bot);
      p3.set(xAt(i, L), bot + hgt / 2, 0); s3.set(bw, hgt, 1); m4.compose(p3, q, s3); blocks.setMatrixAt(i, m4);
      p3.set(xAt(i, L), fy - 0.03, 1.28); s3.set(bw, 0.09, 1); m4.compose(p3, q, s3); edges.setMatrixAt(i, m4);
    }
    blocks.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = true;
    disposeObj(floorTube); disposeObj(pathTube); disposeObj(pathGlow); disposeObj(ghostLines);
    const fp = []; for (let i = 0; i <= L; i++) fp.push(new THREE.Vector3(xAt(i, L), floorY(i) + 0.06, 1.35));
    floorTube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fp, false, 'catmullrom', 0.0), L * 4, 0.05, 5), floorMat); scene.add(floorTube);
    const pp = steps.map((s, i) => new THREE.Vector3(xAt(i, L), yScale(s.bal), 0));
    if (pp.length < 2) pp.push(new THREE.Vector3(pp[0].x + 0.01, pp[0].y, 0));
    pathTube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pp, false, 'catmullrom', 0.2), Math.max(8, pp.length * 8), 0.11, 7), pathMat); scene.add(pathTube);
    pathGlow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pp, false, 'catmullrom', 0.2), Math.max(8, pp.length * 8), 0.3, 8), threadFx.material); pathGlow.renderOrder = 6; scene.add(pathGlow);
    // ghosts: line segments, gold when that run passes, red when it busts
    const gs = r.ghosts || [], pos = [], col = [];
    gs.forEach((g) => {
      const c = new THREE.Color(g.outcome === 'pass' ? GOLD : g.outcome === 'bust' ? RED : '#d8c9a8').multiplyScalar(0.9);
      for (let i = 0; i < g.bal.length - 1; i++) {
        pos.push(xAt(i, L), yScale(g.bal[i]), -0.4, xAt(i + 1, L), yScale(g.bal[i + 1]), -0.4); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ghostLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(ghostLines);
    // the danger strip
    const hz = r.hazard || [];
    heat.count = hz.length ? Math.min(MAXL + 1, hz.length) : 0;
    for (let i = 0; i < heat.count; i++) {
      p3.set(xAt(i, L), -1.57, 3.1); s3.set(bw * 0.92, 1, 1.2); m4.compose(p3, q, s3); heat.setMatrixAt(i, m4);
      const c = heatCol(hz[i].heat || 0); heat.setColorAt(i, c);
    }
    heat.instanceMatrix.needsUpdate = true; if (heat.instanceColor) heat.instanceColor.needsUpdate = true;
    walkSt.curve = pathTube ? new THREE.CatmullRomCurve3(pp, false, 'catmullrom', 0.2) : null;
    walkSt.total = pathTube && pathTube.geometry.index ? pathTube.geometry.index.count : 0;
    walkSt.n = pp.length;
    if (!walkSt.on && pathTube) pathTube.geometry.setDrawRange(0, Infinity);
    // the runner and the colours of the ending
    const last = pp[pp.length - 1], tint = r.outcome === 'pass' ? GOLD : r.outcome === 'bust' ? RED : CYAN;
    runner.position.copy(last); runner.material.color.copy(hdr(tint, 1.6)); runnerGlow.material.color.copy(hdr(tint, 1.4));
    pathMat.color.copy(hdr(tint, 1.3)); threadFx.material.uniforms.uColor.value.copy(hdr(tint, 1.1));
    bustEmb.object.visible = r.outcome === 'bust' && FX.QUALITY[rc.quality()].particles > 0; bustEmb.object.position.set(last.x, last.y, 0);
    gateEmb.object.visible = FX.QUALITY[rc.quality()].particles > 0 && r.outcome !== 'bust';
    const room = steps[n - 1].bal - steps[n - 1].floor;
    redLight.intensity = 12 + 24 * Math.max(0, 1 - room / (rules.mll || 2000));        // the nearer the floor, the redder the corridor
    dirty = true;
  }

  // ---- camera: a gentle sway (still under reduced motion), a drag to look around
  const cam = { th: -0.2, ph: 0.34, dist: 26, drag: null };
  function placeCamera(t) {
    const th = cam.th + (reduced() || cam.drag ? 0 : Math.sin(t * 0.16) * 0.14);
    camera.position.set(Math.sin(th) * Math.cos(cam.ph) * cam.dist, 4.3 + Math.sin(cam.ph) * cam.dist, Math.cos(th) * Math.cos(cam.ph) * cam.dist);
    camera.lookAt(walkSt.on ? runner.position.x * 0.4 : 0, 4.0, 0);
  }
  canvas.addEventListener('pointerdown', (e) => { cam.drag = { x: e.clientX, y: e.clientY, t: cam.th, p: cam.ph }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!cam.drag) return;
    cam.th = Math.max(-1.2, Math.min(1.2, cam.drag.t - (e.clientX - cam.drag.x) * 0.006));
    cam.ph = Math.max(0.12, Math.min(0.9, cam.drag.p + (e.clientY - cam.drag.y) * 0.004)); dirty = true;
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
    cam.dist = a < 0.6 ? 40 : a < 1 ? 30 : 21;
    const fov = a < 0.6 ? 68 : a < 1 ? 56 : 46; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (still && !dirty) return;
    const dt = Math.min(0.25, Math.max(0, t - (frame.t0 || t))); frame.t0 = t;
    stars.update(t, rc.renderer.getPixelRatio()); neb.update(t);
    FX.update(fxList, still ? 0 : t, rc.renderer.getPixelRatio()); threadFx.update(still ? 0 : t);
    if (walkSt.on && walkSt.curve) {                                     // the walkthrough: the runner follows its own trail, the trail draws behind it
      walkSt.p = Math.min(1, walkSt.p + dt * walkSt.speed);
      runner.position.copy(walkSt.curve.getPoint(walkSt.p));
      const per = walkSt.radial * 6, dr = Math.max(per, Math.floor((walkSt.total * walkSt.p) / per) * per); pathTube.geometry.setDrawRange(0, dr);
      if (pathGlow) pathGlow.geometry.setDrawRange(0, Math.max(8 * 6, Math.floor((pathGlow.geometry.index.count * walkSt.p) / 48) * 48));
      const k = Math.min(walkSt.n - 1, Math.floor(walkSt.p * (walkSt.n - 1) + 1e-6));
      if (k !== walkSt.last) { walkSt.last = k; if (walkSt.cb) walkSt.cb(k, false); }
      if (walkSt.p >= 1) { walkSt.on = false; pathTube.geometry.setDrawRange(0, Infinity); if (pathGlow) pathGlow.geometry.setDrawRange(0, Infinity); if (walkSt.cb) walkSt.cb(walkSt.n - 1, true); }
      dirty = true;
    }
    // the runner breathes; the gate glow pulses
    const k = 1 + (still ? 0 : Math.sin(t * 4) * 0.12);
    runner.scale.setScalar(k); gateGlow.material.opacity = 0.3 + (still ? 0 : Math.sin(t * 1.6) * 0.08);
    placeCamera(t);
    if (rc.render()) drawn++;
    frames++; dirty = false;
  }
  placeCamera(0);
  raf = requestAnimationFrame(frame);
  return {
    setRun,
    /** walk the runner along its trail: cb(stepIndex, done) on every trade; reduced motion jumps to the end */
    walk(cb, speed) {
      if (!walkSt.curve) return false;
      walkSt.cb = typeof cb === 'function' ? cb : null; walkSt.speed = speed || 0.11; walkSt.last = -1;
      if (reduced()) { walkSt.on = false; runner.position.copy(walkSt.curve.getPoint(1)); if (walkSt.cb) walkSt.cb(walkSt.n - 1, true); dirty = true; return true; }
      walkSt.p = 0; walkSt.on = true; dirty = true; return true;
    },
    stopWalk() { walkSt.on = false; if (pathTube) pathTube.geometry.setDrawRange(0, Infinity); if (pathGlow) pathGlow.geometry.setDrawRange(0, Infinity); if (walkSt.curve) runner.position.copy(walkSt.curve.getPoint(1)); dirty = true; },
    isWalking: () => walkSt.on,
    onQuality(cb) { qcb = typeof cb === 'function' ? cb : null; }, lite: () => lite, quality: () => rc.quality(),
    stats: () => ({ frames, drawn, quality: rc.quality(), heat: heat.count, fx: fxList.length, walking: walkSt.on, calls: rc.renderer.info.render.calls, passes: rc.passes().length, blocks: blocks.count, ghosts: ghostLines ? ghostLines.geometry.attributes.position.count / 2 : 0,
      walls: walls.length, outcome: run.outcome, steps: run.steps.length, L: run.L }),
    dispose() { stopped = true; cancelAnimationFrame(raf); rc.dispose(); },
  };
}
