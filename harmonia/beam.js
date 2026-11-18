// HARMONIA beam (ES module): a bronze balance beam on a fluted marble column, with weights of stacked owl coins (gold and silver). The left pan holds the money machines that depend on the NQ bots, the right pan the ones that do not; each weight is one stream,
// sized by its monthly estimate. The beam tilts toward the heavier side, slowly. Built on the OLYMPUS render core (../olympus/render.js, three.js r160 from ../jarvis/). Warm sun, bloom <= .2, about twenty meshes:
// light enough for a phone. createBeam(canvas) -> { ok, set({ left: [{usd}], right: [{usd}], tilt }), ... }. If WebGL or the render core is not there, ok is false and the page shows its flat balance.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { dress, latheGeo, mat4 } from '../olympus/hero-stage.js';
// QA Round 6 bug 8: a golden-hour agora (painted sky, env-kit marble / bronze / gold, HDRI light, soft shadows on a GPU) via olympus/hero-stage.js dress.

const HALF = 2.3, DROP = 1.25;

export function createBeam(canvas, opts) {
  const o = opts || {};
  let rc = null;
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.3, 0.1, 60);
    scene.background = new THREE.Color('#2a2118');
    rc = createRenderer({ canvas, scene, camera, maxDpr: 2, tint: '#c8a24a', env: 'night',
      theme: { sky: '#3a2c1c', fog: '#2a2118', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, bloom: { strength: 0.2, radius: 0.5, threshold: 1.0 } });
    const q = rc.quality();
    if (q === 'low' || q === 'off') { rc.dispose(); return { ok: false, mode: 'lite', reason: 'quality ' + q }; }
    return build(rc, scene, camera, canvas, o);
  } catch (e) {
    try { if (rc) rc.dispose(); } catch (_) { /* nothing */ }
    return { ok: false, mode: 'lite', reason: String(e && e.message ? e.message : e) };
  }
}

function build(rc, scene, camera, canvas, o) {
  const reduced = !!o.reduced;
  const D = dress({ rc, scene, camera, palette: 'golden', hdri: 'golden', envI: 0.85, sunDir: [0.5, 0.6, 0.65], key: 2.5, shadowExt: 5, metalEnv: 1.8, sky: { sunX: 0.82, sunY: 0.78, templeX: 0.14, horizon: 0.64 }, fogNear: 16, fogFar: 40 });
  const { kit, B } = D;
  D.ground({ mat: 'paving', color: '#8a7860', r: 28 });
  const top = D.plinth({ r: 1.05, steps: 2, stepH: 0.12, run: 0.24, drum: 0.26 });
  B.column({ x: 0, y: top, z: 0, h: 3.3 - top - 0.18, r: 0.2, flutes: 18, color: '#ece4d5', base: true });
  D.laurel({ x: 0, y: top + 0.02, z: 0.75, r: 0.36, flat: true, gap: 0.9, leaves: 20, mat: 'gold' });
  D.build(scene);
  const bronze = kit.mat('bronze'), gold = kit.mat('gold');
  const coinG = D.paint('coin'), silverG = D.paint('silvercoin');
  coinG.metalness = 0.9; coinG.envMapIntensity = 1.7; silverG.metalness = 0.9; silverG.envMapIntensity = 1.7;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), gold); hub.position.y = 3.3; scene.add(hub);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, HALF * 2, 16).rotateZ(Math.PI / 2), bronze); bar.position.y = 3.3;
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), gold); f.position.x = s * HALF; bar.add(f); }
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7, 10), gold); pointer.position.y = 0.4; bar.add(pointer);
  const pivot = new THREE.Group(); pivot.position.y = 0; pivot.add(bar); scene.add(pivot);
  const panG = latheGeo([[0.0001, 0], [0.5, 0.01], [0.78, 0.08], [0.86, 0.14], [0.82, 0.15], [0.0001, 0.06]], 32), wireG = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
  const mkPan = () => {
    const g = new THREE.Group(), pan = new THREE.Mesh(panG, bronze); pan.position.y = -0.06; g.add(pan);
    for (const a of [0, 2.094, 4.189]) {                                           // three chains from the rim up to the hook
      const w = new THREE.Mesh(wireG, bronze), p0 = new THREE.Vector3(Math.sin(a) * 0.72, 0.08, Math.cos(a) * 0.72), dir = new THREE.Vector3(0, DROP, 0).sub(p0);
      w.scale.y = dir.length(); w.position.copy(p0).addScaledVector(dir, 0.5); w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); g.add(w);
    }
    const load = new THREE.Group(); load.position.y = 0.05; g.add(load); scene.add(g); return { g, load };
  };
  const L = mkPan(), R = mkPan();
  const wgeo = new THREE.CylinderGeometry(1, 1, 1, 32);
  let want = 0, shown = 0, yaw = 0, drag = null, settled = true, t = 0, count = [0, 0], lastW = 0, lastH = 0;
  function fill(pan, list, mat) {
    while (pan.load.children.length) pan.load.remove(pan.load.children[0]);
    const tot = list.reduce((s, x) => s + Math.max(0, x.usd || 0), 0) || 1; let y = 0;
    list.filter((x) => (x.usd || 0) > 0).forEach((x, i) => {
      const r = 0.22 + 0.4 * Math.sqrt(Math.max(0, x.usd) / tot), h = 0.16 + 0.22 * Math.sqrt(Math.max(0, x.usd) / tot);
      const m = new THREE.Mesh(wgeo, i % 2 ? mat : coinG); m.scale.set(r, h, r); m.position.set((i % 2 ? 0.08 : -0.08), y + h / 2, 0); m.rotation.y = i * 0.7; m.castShadow = D.shadows; pan.load.add(m); y += h;
    });
    return pan.load.children.length;
  }
  function place() {
    const c = Math.cos(shown), sn = Math.sin(shown);
    bar.rotation.z = shown;                                                       // the bar turns about its own middle (the hub); the pans hang straight down from its ends
    L.g.position.set(-HALF * c, 3.3 - HALF * sn - DROP, 0); R.g.position.set(HALF * c, 3.3 + HALF * sn - DROP, 0);
  }
  D.shade(pivot); D.shade(L.g); D.shade(R.g); D.tune();
  D.blobs([[0, 0, 1.6, 0.6, 0.01]], { opacity: 0.4 });
  const motes = D.motes({ n: 30, center: [0, 2.4, 0], box: [7, 3.5, 3], size: 3.5, alpha: 0.4 });
  const api = {
    ok: true, mode: '3d', rc, stats: () => D.stats(),
    set(model) {
      if (!model) return;
      if (Array.isArray(model.left) && Array.isArray(model.right)) count = [fill(L, model.left, silverG), fill(R, model.right, silverG)];
      if (typeof model.tilt === 'number') want = Math.max(-0.45, Math.min(0.45, model.tilt));
      settled = false;
    },
    get settled() { return settled; }, get tilt() { return shown; }, get weights() { return count; },
    dispose() { try { rc.stop(); D.dispose(); rc.dispose(); } catch (_) { /* nothing */ } },
  };
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });
  const down = (e) => { drag = { x: e.clientX, yaw }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } };
  const move = (e) => { if (drag) yaw = Math.max(-0.7, Math.min(0.7, drag.yaw + (e.clientX - drag.x) * 0.006)); };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  place();
  rc.start((dt) => {
    t += dt;
    const k = reduced ? 1 : Math.min(1, dt * 1.8);                       // the beam swings slowly: about a second and a half
    shown += (want - shown) * k; if (Math.abs(want - shown) < 0.002) { shown = want; settled = true; }
    place(); if (!reduced) motes.tick(t);
    const sway = reduced || drag ? 0 : Math.sin(t * 0.4) * 0.12;
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; if (w !== lastW || h !== lastH) { lastW = w; lastH = h; D.backdrop(w, h); }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), d = Math.max(2.25 / Math.tan(vf / 2), 3.6 / Math.tan(hf / 2)) + 1.0;
    camera.position.set(Math.sin(yaw + sway) * d, 2.6, Math.cos(yaw + sway) * d); camera.lookAt(0, 2.05, 0);
    rc.render();
  });
  return api;
}
