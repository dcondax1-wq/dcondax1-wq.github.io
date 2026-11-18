// COMPASS rose (ES module): a gilded compass rose on a painted marble dial (a sixteen-point wind rose, the four meanings written round the edge, a Greek-key rim) set in a stepped marble drum. Four gold points mark north (money at risk now), east (money to gain), south (habits) and west (feeds); the needle swings to the bearing of the top action.
// Built on the OLYMPUS render core (../olympus/render.js, three.js r160 from ../jarvis/). Warm sun, bloom <= .2, about ten meshes: light enough for a phone. createRose(canvas) -> { ok, set({ bearing }), ... }.
// If WebGL or the render core is not there, ok is false and the page shows its flat compass.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { dress, mat4 } from '../olympus/hero-stage.js';
// QA Round 6 bug 8: env-kit marble / bronze / gold, the golden HDRI and a painted sky (olympus/hero-stage.js dress), soft shadows on a GPU.

export function createRose(canvas, opts) {
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
  const D = dress({ rc, scene, camera, palette: 'golden', hdri: 'golden', envI: 0.85, sunDir: [0.45, 0.8, 0.4], key: 2.4, shadowExt: 4, metalEnv: 1.9, sky: { sunX: 0.8, sunY: 0.7, templeX: 0.2, horizon: 0.35 }, fogNear: 12, fogFar: 30 });
  const { kit, B } = D;
  D.ground({ mat: 'paving', color: '#8a7860', y: -0.5, r: 24 });
  B.add('marble:uv', new THREE.CylinderGeometry(3.25, 3.3, 0.18, 72), mat4(0, -0.41, 0), '#cfc5b0');
  B.add('marble:uv', new THREE.CylinderGeometry(2.95, 3.0, 0.18, 72), mat4(0, -0.23, 0), '#ddd3c1');
  B.add('marble:uv', new THREE.CylinderGeometry(2.6, 2.7, 0.2, 72), mat4(0, -0.04, 0), '#ece4d5');
  B.add('bronze', new THREE.TorusGeometry(2.62, 0.06, 10, 96), mat4(0, 0.07, 0, 0, 1, Math.PI / 2));
  D.build(scene);
  // the painted dial: a wind rose, the degree ticks, the four meanings, a key rim (one transparent decal)
  const dial = kit.painted('paint:windrose', 1024, 1024, (g, w) => {
    const c = w / 2, k = w / 5.2; g.clearRect(0, 0, w, w); g.save(); g.translate(c, c);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, L = (i % 4 === 0 ? 2.05 : i % 2 === 0 ? 1.5 : 1.05) * k, W = (i % 4 === 0 ? 0.0 : i % 2 === 0 ? 0.13 : 0.09) * k;
      if (i % 4 === 0) continue; g.save(); g.rotate(a); g.fillStyle = i % 2 === 0 ? 'rgba(120,80,40,0.55)' : 'rgba(150,110,60,0.4)'; g.beginPath(); g.moveTo(0, -L); g.lineTo(W, -W * 1.2); g.lineTo(0, 0); g.lineTo(-W, -W * 1.2); g.closePath(); g.fill(); g.restore(); }
    g.strokeStyle = 'rgba(90,60,25,0.65)'; for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r0 = (i % 9 === 0 ? 2.1 : 2.18) * k; g.lineWidth = i % 9 === 0 ? 4 : 2; g.beginPath(); g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); g.lineTo(Math.sin(a) * 2.3 * k, -Math.cos(a) * 2.3 * k); g.stroke(); }
    g.lineWidth = 3; for (const r of [1.2, 2.32, 2.5]) { g.beginPath(); g.arc(0, 0, r * k, 0, Math.PI * 2); g.stroke(); }
    const words = [['N', 'RISK NOW'], ['E', 'TO GAIN'], ['S', 'HABITS'], ['W', 'FEEDS']];
    words.forEach((wd, i) => { g.save(); g.rotate((i * Math.PI) / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#5a3a18'; g.font = '700 ' + Math.round(0.26 * k) + 'px Georgia, serif'; g.fillText(wd[0], 0, -1.86 * k);
      g.fillStyle = 'rgba(90,60,25,0.85)'; g.font = '600 ' + Math.round(0.13 * k) + 'px Georgia, serif'; g.fillText(wd[1], 0, -2.41 * k); g.restore(); });
    g.restore();
  }, { rough: 0.5 });
  dial.transparent = true; dial.depthWrite = false; dial.polygonOffset = true; dial.polygonOffsetFactor = -2;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2), dial); face.position.y = 0.062; face.renderOrder = 2; face.receiveShadow = D.shadows; scene.add(face);
  const bronze = kit.mat('bronze'), gold = kit.mat('gold'), terra = new THREE.MeshStandardMaterial({ color: '#c96a4a', roughness: 0.4, metalness: 0.3, envMapIntensity: 1.2 });
  // four points: a bevelled diamond each, lying on the disc, pointing outward (north is -z, east is +x); north is gold
  const pt = () => { const sh = new THREE.Shape(); sh.moveTo(0, 2.1); sh.lineTo(0.28, 0.35); sh.lineTo(0, 0); sh.lineTo(-0.28, 0.35); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2 }); };
  const geo = pt();
  [0, 90, 180, 270].forEach((deg) => {
    const m = new THREE.Mesh(geo, deg === 0 ? gold : bronze); m.rotation.x = -Math.PI / 2; m.position.y = 0.1;
    const g = new THREE.Group(); g.add(m); g.rotation.y = -deg * Math.PI / 180; scene.add(g); D.shade(g);
  });
  // the needle: a long faceted diamond, gold at the head, terracotta at the tail, on a gold hub
  const needle = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.9, 4), gold); head.rotation.x = -Math.PI / 2; head.position.set(0, 0.36, -0.95); head.scale.set(1, 1, 0.45);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.3, 4), terra); tail.rotation.x = Math.PI / 2; tail.position.set(0, 0.36, 0.65); tail.scale.set(1, 1, 0.45);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 32), gold); hub.position.y = 0.36;
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), bronze); pin.position.y = 0.48;
  needle.add(head, tail, hub, pin); scene.add(needle); D.shade(needle);
  D.tune();
  D.blobs([[0, 0, 3.6, 0.7, -0.49]], { opacity: 0.4 });
  let want = 45, shown = 45, drag = null, settled = true, t = 0, tilt = 0, lastW = 0, lastH = 0;
  const api = {
    ok: true, mode: '3d', rc, stats: () => D.stats(),
    set(model) { if (model && typeof model.bearing === 'number') { want = ((model.bearing % 360) + 360) % 360; settled = false; } },
    get settled() { return settled; }, get bearing() { return shown; },
    dispose() { try { rc.stop(); D.dispose(); rc.dispose(); } catch (_) { /* nothing */ } },
  };
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });
  const down = (e) => { drag = { y: e.clientY, tilt }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } };
  const move = (e) => { if (drag) tilt = Math.max(-0.35, Math.min(0.35, drag.tilt + (e.clientY - drag.y) * 0.004)); };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  rc.start((dt) => {
    t += dt;
    // swing the short way round, slow and smooth (about a second)
    let d = ((want - shown + 540) % 360) - 180;
    const k = reduced ? 1 : Math.min(1, dt * 2.4);
    shown = (shown + d * k + 360) % 360; if (Math.abs(d) < 0.3) { shown = want; settled = true; }
    needle.rotation.y = -shown * Math.PI / 180 + (reduced || !settled ? 0 : Math.sin(t * 1.3) * 0.02);       // a tiny settle wobble once it has arrived
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; if (w !== lastW || h !== lastH) { lastW = w; lastH = h; D.backdrop(w, h); }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), dd = Math.max(3.0 / Math.tan(vf / 2), 3.75 / Math.tan(hf / 2)) + 0.8;
    const pitch = 0.9 - tilt; camera.position.set(0, Math.sin(pitch) * dd, Math.cos(pitch) * dd); camera.lookAt(0, -0.1, 0.2);
    rc.render();
  });
  return api;
}
