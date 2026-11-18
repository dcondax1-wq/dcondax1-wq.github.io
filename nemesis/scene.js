// NEMESIS scene (ES module): a dark underworld arena drawn by the OLYMPUS render core (docs/OLYMPUS_RENDER.md).
// Every losing trade is a fallen warrior lying on an obsidian floor, lit by its own ember: a small glowing pool under it.
//   size of the figure   how big the loss was ($)
//   ember colour         amber = a plain plan loss, gold = the plan but with a leak, crimson = a rule break
//   bright / dim         bright = the week you are looking at, dim = every other week
//   tap a figure         picks it (an autopsy opens); a gold beam and a ring mark the chosen one and the camera drifts to it
// createUnderworld(canvas, { O }) -> { setFigures(list), select(id|null), onPick(cb), screenOf(id), onQuality(cb), lite(), quality(), stats(), dispose() }
// list = [{ id, usd, tone: 'plan' | 'soft' | 'break', week: bool }], newest first (the newest lies nearest the centre).
// Four instanced meshes carry every figure (body, head, shield, broken spear) + one for the ember pools: a handful of draw calls.
// Reduced motion = a still scene redrawn only when something changes. LITE = no bloom (the core) and fewer embers.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';
import * as SC from '../olympus/scenery.js';
import { dress } from './dress.js';
const AG_THEME = { sky: '#3a2c1e', fog: '#2a2118', emissive: '#c8a24a', bloom: '#c8a24a', accent: '#c8a24a' };   // AGORA: warm dusk, no violet rims

const TONES = { plan: '#e0b060', soft: '#e0b060', break: '#e0b060' };
const GOLD = '#e0b060';
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const MAXF = 64;

function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function createUnderworld(canvas, { O = null } = {}) {
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#13100d');
  scene.fog = new THREE.FogExp2(0x13100d, 0.021);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  let embers = null, dr = null, lite = false, dirty = true, qcb = null, pickcb = null, drawn = 0, frames = 0, stopped = false, raf = 0;
  const rc = createRenderer({ canvas, scene, camera, env: 'night', theme: AG_THEME, grade: { aberration: 0, saturation: 0.92 }, tint: '#c96a4a', exposure: 0.95, maxDpr: 1.75, bloom: { strength: 0.22, radius: 0.6, threshold: 0.95 },
    onQuality: (l) => { lite = l === 'low' || l === 'off'; if (embers) embers.geometry.setDrawRange(0, lite ? 110 : 280); if (dr) dr.setLite(lite); dirty = true; if (qcb) qcb(l); } });
  lite = rc.quality() === 'low' || rc.quality() === 'off';

  // ---- light: a cold violet sky and warm embers from below
  scene.add(new THREE.HemisphereLight('#4b7a99', '#1b1713', 0.55));
  const key = new THREE.DirectionalLight('#e0b060', 0.7); key.position.set(-6, 16, 8); scene.add(key);
  const e1 = new THREE.PointLight('#c96a4a', 55, 34, 1.5); e1.position.set(0, 1.6, 0); scene.add(e1);
  const e2 = new THREE.PointLight('#e0b060', 30, 30, 1.6); e2.position.set(-8, 1.2, -6); scene.add(e2);
  const e3 = new THREE.PointLight('#4b7a99', 26, 30, 1.6); e3.position.set(8, 1.2, 7); scene.add(e3);
  const selLight = new THREE.PointLight(GOLD, 0, 14, 1.8); selLight.position.set(0, 2, 0); scene.add(selLight);

  // ---- the sky of the underworld and the arena
  const stars = M.starfield({ count: 700, radius: 160, size: 1.8, color: '#c96a4a' }); scene.add(stars);
  const neb = M.nebula({ colors: ['#c96a4a', '#e0b060', '#3d342b'], count: 6, radius: 90, size: 100, opacity: 0.16 }); neb.position.y = 12; scene.add(neb);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(15, 64), M.metal({ kind: 'gunmetal', color: '#1d1915', roughness: 0.32, clearcoat: 1, envMapIntensity: 0.55 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  try { floor.material = SC.basalt({ color: '#221d18', glow: '#c96a4a', repeat: [1.5, 1.5], intensity: 0.85, veins: 4 }); } catch (e) { /* the plain obsidian stays */ }
  const outer = new THREE.Mesh(new THREE.RingGeometry(15, 90, 64), new THREE.MeshStandardMaterial({ color: '#13100d', roughness: 0.9, metalness: 0.1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; scene.add(outer);
  for (const [r, k, c] of [[4.5, 1.4, '#c96a4a'], [9, 1.6, '#e0b060'], [14.7, 2.4, '#4b7a99']]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.04, r + 0.04, 96), M.neon({ color: c, intensity: k, fog: true }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; scene.add(ring);
  }
  const spokes = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; spokes.push(Math.cos(a) * 2.2, 0.014, Math.sin(a) * 2.2, Math.cos(a) * 14.7, 0.014, Math.sin(a) * 14.7); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3));
  scene.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: hdr('#c96a4a', 1.2), transparent: true, opacity: 0.35 })));
  // broken columns around the rim, an ember seam on each
  const colN = 16, colMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.9, 1, 8), M.metal({ kind: 'gunmetal', color: '#372e26', roughness: 0.55 }), colN);
  const seam = new THREE.InstancedMesh(new THREE.TorusGeometry(0.78, 0.035, 6, 20), M.neon({ color: '#c96a4a', intensity: 2.2, fog: true }), colN);
  try { colMesh.material = SC.stone({ color: '#4e463d', tint: '#c96a4a', repeat: [3, 2], blocks: 4, bump: 2.2 }); } catch (e) { /* the plain columns stay */ }
  const rr = rnd(17), dm = new THREE.Object3D();
  for (let i = 0; i < colN; i++) {
    const a = (i / colN) * Math.PI * 2 + 0.1, h = 2.2 + rr() * 4.8;
    dm.position.set(Math.cos(a) * 17, h / 2, Math.sin(a) * 17); dm.rotation.set(0, rr() * 3, (rr() - 0.5) * 0.12); dm.scale.set(1, h, 1); dm.updateMatrix(); colMesh.setMatrixAt(i, dm.matrix);
    dm.position.y = h * 0.62; dm.rotation.set(Math.PI / 2, 0, 0); dm.scale.set(1, 1, 1); dm.updateMatrix(); seam.setMatrixAt(i, dm.matrix);
  }
  scene.add(colMesh, seam);

  // ---- embers rising
  const EN = 280, ep = new Float32Array(EN * 3), es = new Float32Array(EN), er = rnd(5);
  for (let i = 0; i < EN; i++) { const a = er() * 6.283, r = 2 + er() * 15; ep.set([Math.cos(a) * r, er() * 9, Math.sin(a) * r], i * 3); es[i] = er(); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('aSeed', new THREE.BufferAttribute(es, 1));
  const emat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uPix: { value: 1 } },
    vertexShader: `attribute float aSeed; uniform float uT, uPix; varying float vA;
      void main() { vec3 p = position; float h = mod(p.y + uT * (0.35 + aSeed * 0.7), 9.0); p.y = h; p.x += sin(uT * 0.6 + aSeed * 30.0) * 0.4; p.z += cos(uT * 0.5 + aSeed * 20.0) * 0.4;
        vA = smoothstep(0.0, 1.0, h) * (1.0 - h / 9.0) * (0.5 + 0.5 * aSeed);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (2.0 + 3.0 * aSeed) * uPix; }`,
    fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0, 0.45, 0.14) * 2.4 * vA * a, 1.0); }` });
  embers = new THREE.Points(eg, emat); embers.frustumCulled = false; scene.add(embers);
  embers.geometry.setDrawRange(0, lite ? 110 : 280);

  // ---- the fallen: four instanced parts + the ember pools
  const bodyMat = M.metal({ kind: 'gold', color: '#9c6b3c', roughness: 0.42, clearcoat: 0.4 });
  const headMat = M.metal({ kind: 'gold', color: '#c8a24a', roughness: 0.3, clearcoat: 0.6 });
  const shieldMat = M.metal({ kind: 'chrome', color: '#888178', roughness: 0.28 });
  const spearMat = new THREE.MeshStandardMaterial({ color: '#4e4236', roughness: 0.7, metalness: 0.2 });
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 0.95, 4, 10), bodyMat, MAXF);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.25, 14, 10), headMat, MAXF);
  const shield = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.52, 0.52, 0.07, 18), shieldMat, MAXF);
  const spear = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), spearMat, MAXF);
  const poolGeo = new THREE.CircleGeometry(1.35, 28), poolMat = new THREE.MeshBasicMaterial({ color: 0xf3ece0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, map: (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.4)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() });
  const pool = new THREE.InstancedMesh(poolGeo, poolMat, MAXF);
  try {                                                  // real armour: aged bronze, a steel shield, an ember rim on the bronze (they glow where they lie)
    body.material = SC.bronze({ color: '#9c6b3c', patina: 0.25, rough: 0.5 }); head.material = SC.bronze({ color: '#c8a24a', patina: 0.1, rough: 0.34 });
    shield.material = SC.bronze({ color: '#9c9589', patina: 0, kind: 'steel', rough: 0.3 });
    M.fresnelRim(body.material, { color: '#c96a4a', power: 2.4, strength: 1.5 }); M.fresnelRim(shield.material, { color: '#c96a4a', power: 3, strength: 1 });
  } catch (e) { /* the plain metal stays */ }
  const parts = [body, head, shield, spear, pool];
  for (const m of parts) { m.count = 0; m.frustumCulled = false; scene.add(m); }
  const selRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.045, 8, 48), new THREE.MeshBasicMaterial({ color: hdr(GOLD, 3.4) })); selRing.rotation.x = Math.PI / 2; selRing.visible = false; scene.add(selRing);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: hdr(GOLD, 1.8), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); beam.visible = false; scene.add(beam);

  let figs = [], layout = [], sel = null, selIdx = -1;
  const g = new THREE.Object3D(), part = new THREE.Object3D();
  g.add(part);
  function placePart(mesh, i, px, py, pz, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
    part.position.set(px, py, pz); part.rotation.set(rx, ry, rz); part.scale.set(sx, sy, sz); g.updateMatrixWorld(true);
    mesh.setMatrixAt(i, part.matrixWorld);
  }
  const c = new THREE.Color();
  function setFigures(list) {
    figs = (list || []).slice(0, MAXF);
    const phi = 2.39996;
    layout = figs.map((f, i) => {
      const a = i * phi + 0.4, r = 1.9 + 1.5 * Math.sqrt(i);
      const s = 0.72 + 0.5 * Math.min(1, Math.abs(f.usd) / 900);
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, s, ry: ((i * 2.1) % 6.283), id: f.id };
    });
    figs.forEach((f, i) => {
      const L = layout[i];
      g.position.set(L.x, 0, L.z); g.rotation.set(0, L.ry, 0); g.scale.setScalar(L.s); g.updateMatrixWorld(true);
      placePart(body, i, 0, 0.3, 0, 0, 0, Math.PI / 2 + 0.06);
      placePart(head, i, 0.98, 0.3, 0.05, 0, 0, 0);
      placePart(shield, i, -0.15, 0.1, 0.78, 0.18, 0.5, 0.12);
      placePart(spear, i, 0.2, 0.2, -0.65, 0.12, 0, Math.PI / 2 - 0.35);
      placePart(pool, i, 0, 0.03, 0, -Math.PI / 2, 0, 0, 1, 1, 1);
      const bright = f.week !== false;
      c.set(TONES[f.tone] || TONES.plan).multiplyScalar(bright ? 2.4 : 0.55); pool.setColorAt(i, c);
      c.set('#f3ece0').multiplyScalar(bright ? 1 : 0.38); for (const m of [body, head, shield, spear]) m.setColorAt(i, c);
    });
    for (const m of parts) {
      m.count = figs.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.boundingSphere = null; m.computeBoundingSphere();
    }
    // the pool is flat on the floor: re-place it without the figure's yaw tilt (done above with g's matrix, which is a yaw only)
    select(sel);
    dirty = true;
  }

  function select(id) {
    sel = id == null ? null : id;
    selIdx = sel == null ? -1 : figs.findIndex((f) => f.id === sel);
    const L = selIdx >= 0 ? layout[selIdx] : null;
    selRing.visible = beam.visible = !!L;
    if (L) {
      selRing.position.set(L.x, 0.06, L.z); selRing.scale.setScalar(L.s * 0.95); beam.position.set(L.x, 7, L.z);
      selLight.position.set(L.x, 2.2, L.z); selLight.color.set(TONES[figs[selIdx].tone] || GOLD); selLight.intensity = 30;
      cam.goal.set(L.x * 0.35, 0, L.z * 0.35);
    } else { selLight.intensity = 0; cam.goal.set(0, 0, 0); }
    if (reduced()) cam.target.copy(cam.goal);
    dirty = true;
  }

  // ---- camera: an orbit you can drag, a slow sway, and a drift toward the chosen figure
  const cam = { th: 0.3, ph: 0.92, dist: 30, drag: null, sway: 0, t0: 0, lastT: 0, target: new THREE.Vector3(), goal: new THREE.Vector3() };
  function placeCamera(t) {
    // the slow idle sway restarts from 0 after a touch (cam.t0) and is folded into th when a finger lands, so the scene never jumps under a tap
    cam.sway = reduced() || cam.drag ? 0 : Math.sin((t - cam.t0) * 0.12) * 0.12; cam.lastT = t;
    const th = cam.th + cam.sway;
    camera.position.set(cam.target.x + Math.sin(th) * Math.cos(cam.ph) * cam.dist, cam.target.y + Math.sin(cam.ph) * cam.dist, cam.target.z + Math.cos(th) * Math.cos(cam.ph) * cam.dist);
    camera.lookAt(cam.target);
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([body, head, shield, pool], false);
    for (const h of hits) if (h.instanceId != null && h.instanceId < figs.length) return h.instanceId;
    // a finger is wider than a small figure: the nearest figure within 30 px of the tap counts too
    let best = -1, bd = 30;
    for (let i = 0; i < figs.length; i++) { const q = screenOf(figs[i].id); if (!q || !q.on) continue; const d = Math.hypot(q.x - clientX, q.y - clientY); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { cam.th += cam.sway; cam.sway = 0; down = { x: e.clientX, y: e.clientY, t: performance.now(), th: cam.th, ph: cam.ph, moved: false }; cam.drag = down; });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) down.moved = true;
    if (!down.moved) return;
    cam.th = down.th - dx * 0.006; cam.ph = Math.max(0.35, Math.min(1.35, down.ph + dy * 0.004)); dirty = true;
  });
  const up = (e) => {
    const d = down; down = null; cam.drag = null; cam.t0 = cam.lastT;
    if (d && !d.moved && e.type === 'pointerup' && performance.now() - d.t < 600) {
      const i = pickAt(e.clientX, e.clientY);
      if (i >= 0 && pickcb) pickcb(figs[i].id);
    }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  function screenOf(id) {
    const i = figs.findIndex((f) => f.id === id);
    if (i < 0) return null;
    camera.updateMatrixWorld(); const v = new THREE.Vector3(layout[i].x, 0.35, layout[i].z).project(camera), r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, on: v.z < 1 };
  }

  let gapAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || (O && O.hidden())) return;                            // hidden / covered: no JS, no frame (docs/OLYMPUS_PERF.md)
    const gap = O && O.frameGap ? O.frameGap() : 0;                       // idle 30 / 15 fps, battery saver, 3D Off 2 fps; a touch = full rate
    if (gap && now - gapAt < gap - 3) return;
    gapAt = now;
    const still = reduced(), t = now / 1000;
    const a = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const nd = a < 0.6 ? 29 : a < 1 ? 25 : 20, nf = a < 0.6 ? 62 : a < 1 ? 56 : 48;
    if (cam.dist !== nd || camera.fov !== nf) { cam.dist = nd; camera.fov = nf; camera.updateProjectionMatrix(); dirty = true; }
    if (!still) { cam.target.lerp(cam.goal, 0.06); }
    else if (cam.target.distanceToSquared(cam.goal) > 1e-6) { cam.target.copy(cam.goal); dirty = true; }
    if (still && !dirty) return;
    stars.update(t, rc.renderer.getPixelRatio()); neb.update(t);
    emat.uniforms.uT.value = still ? 3 : t; emat.uniforms.uPix.value = rc.renderer.getPixelRatio();
    const k = still ? 0 : Math.sin(t * 2.4);
    e1.intensity = 55 + k * 8; e2.intensity = 30 + Math.sin(t * 1.7) * (still ? 0 : 6);
    if (selIdx >= 0) { selRing.scale.setScalar(layout[selIdx].s * (0.95 + (still ? 0 : 0.08 * Math.sin(t * 3))));  beam.material.opacity = 0.42 + (still ? 0 : 0.12 * Math.sin(t * 2)); }
    if (dr) { try { dr.update(t, still); } catch (e) { dr = null; } }
    placeCamera(t);
    if (rc.render()) drawn++;
    frames++; dirty = false;
  }
  try { dr = dress({ scene, camera, lite }); } catch (e) { dr = null; /* the plain underworld */ }
  placeCamera(0);
  raf = requestAnimationFrame(frame);
  return {
    setFigures, select, onPick(cb) { pickcb = typeof cb === 'function' ? cb : null; }, screenOf, pickAt,
    onQuality(cb) { qcb = typeof cb === 'function' ? cb : null; }, lite: () => lite, quality: () => rc.quality(),
    stats: () => ({ dress: dr ? dr.stats() : null, frames, drawn, quality: rc.quality(), passes: rc.passes().length, figures: figs.length, selected: sel, columns: colN, embers: embers.geometry.drawRange.count, bright: figs.filter((f) => f.week !== false).length }),
    dispose() { stopped = true; cancelAnimationFrame(raf); if (dr) dr.dispose(); rc.dispose(); },
  };
}
