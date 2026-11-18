// AEGIS shield (ES module): Athena's round bronze aspis on a marble stand at golden hour. The gold band round its rim is the drawdown you still have:
// it runs clockwise from the top and shrinks as the max loss is used (a full gold rim = the whole max loss left, no gold = the floor); the rest of
// the rim is dark, worn bronze. A gilded owl in relief on the boss, a painted Greek key round the face, a laurel at its foot.
// QA Round 6 bug 8: env-kit bronze / gold / marble with the golden HDRI and a painted sky (olympus/hero-stage.js dress) on the OLYMPUS render core
// (../olympus/render.js, three.js r160 from ../jarvis/). Bloom <= .2, about a dozen draws: light enough for a phone. createShield(canvas) -> { ok, set(model), ... }.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { dress, paintCoin, paintMeander, mat4 } from '../olympus/hero-stage.js';

const SEG = 120, RAD = 8, R = 1.42, RIM = 1.5;

export function createShield(canvas, opts) {
  const o = opts || {};
  let rc = null;
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.3, 0.1, 80);
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

/** the face: bronze with a painted key ring and fine hammer marks (an alpha-free texture on the dome) */
function paintFace(g, w, h) {
  const c = w / 2;
  const gr = g.createRadialGradient(c * 0.8, c * 0.7, 0, c, c, c); gr.addColorStop(0, '#d39a5c'); gr.addColorStop(0.7, '#a8703e'); gr.addColorStop(1, '#7a4e2a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(60,30,10,0.07)'; for (let i = 0; i < 700; i++) { const a = i * 2.39996, r = Math.sqrt(i / 700) * c; g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 3 + (i % 3), 0, Math.PI * 2); g.fill(); }
  // the key ring: a band near the edge
  const ring = document.createElement('canvas'); ring.width = 512; ring.height = 32; paintMeander(ring.getContext('2d'), 512, 32, { bg: 'rgba(0,0,0,0)', fg: '#3a2010' });
  g.save(); g.translate(c, c); const r0 = c * 0.8;
  for (let i = 0; i < 48; i++) { g.save(); g.rotate((i / 48) * Math.PI * 2); g.drawImage(ring, (i % 16) * 32, 0, 32, 32, -r0 * 0.07, -r0 - 6, r0 * 0.14, 14); g.restore(); }
  g.restore();
  g.strokeStyle = 'rgba(60,30,10,0.6)'; g.lineWidth = 3; for (const r of [c * 0.72, c * 0.86]) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
}

function build(rc, scene, camera, canvas, o) {
  const reduced = !!o.reduced;
  const D = dress({ rc, scene, camera, palette: 'golden', hdri: 'golden', envI: 0.9, sunDir: [0.5, 0.6, 0.75], key: 2.6, rim: 0.9, shadowExt: 3.5, metalEnv: 1.9, sky: { sunX: 0.8, sunY: 0.72, templeX: 0.18, horizon: 0.7 }, fogNear: 10, fogFar: 26 });
  const { kit, B } = D;
  const yb = -2.25;
  D.ground({ mat: 'paving', color: '#8a7860', y: yb, r: 20 });
  // the stand: a stepped marble block with a key band and a bronze cradle
  const top = D.block({ y: yb, w: 2.6, d: 1.0, steps: 2, stepH: 0.1, run: 0.18, drum: 0.24, bandFg: '#6e2f1c' });
  for (const sx of [-1, 1]) B.add('bronze', new THREE.CylinderGeometry(0.045, 0.06, 0.7, 10), mat4(sx * 0.9, top + 0.3, -0.25, 0, 1, 0, sx * 0.35));
  D.laurel({ x: 0, y: top + 0.02, z: 0.42, r: 0.42, flat: true, gap: 0.9, leaves: 22, mat: 'gold' });
  D.build(scene);
  // the shield: a shallow bronze dome (lathe) with a flat rim, the painted face, the boss with the owl
  const shield = new THREE.Group(); shield.position.set(0, top + RIM + 0.02, 0.05); shield.rotation.x = -0.08; scene.add(shield);
  const prof = [[0.0001, 0.34], [0.3, 0.33], [0.7, 0.28], [1.05, 0.18], [R, 0.04], [RIM, 0.02], [RIM + 0.03, -0.03], [RIM - 0.02, -0.08], [0.0001, -0.1]].map((p) => new THREE.Vector2(p[0], p[1]));
  const domeG = new THREE.LatheGeometry(prof, 64); domeG.rotateX(Math.PI / 2);
  { const p = domeG.getAttribute('position'), uv = domeG.getAttribute('uv'); for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * RIM), 0.5 + p.getY(i) / (2 * RIM)); }
  const faceMat = kit.painted('paint:aspis', 512, 512, paintFace, { rough: 0.4 }); faceMat.metalness = 0.85; faceMat.envMapIntensity = 1.6;
  const dome = new THREE.Mesh(domeG, faceMat); shield.add(dome);
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.12, 40).rotateX(Math.PI / 2), kit.mat('gold')); boss.position.z = 0.38; shield.add(boss);
  const owl = new THREE.Mesh(new THREE.CircleGeometry(0.33, 40), kit.painted('paint:owl', 128, 128, (g, w, h) => paintCoin(g, w, h), { rough: 0.3 })); owl.material.metalness = 0.9; owl.material.envMapIntensity = 1.8; owl.position.z = 0.445; shield.add(owl);
  // the rim: a dark bronze track all round and the gold band (a tube drawn up to the fraction left), clockwise from the top
  const pts = []; for (let i = 0; i < SEG; i++) { const a = (i / SEG) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * (RIM - 0.04), Math.cos(a) * (RIM - 0.04), 0.05)); }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const tubeGeo = new THREE.TubeGeometry(curve, SEG, 0.075, RAD, true);
  const rimMat = new THREE.MeshStandardMaterial({ color: '#f0c860', roughness: 0.26, metalness: 1.0, envMapIntensity: 2.0, emissive: new THREE.Color('#5a3c08'), emissiveIntensity: 0.35 });
  const rim = new THREE.Mesh(tubeGeo, rimMat); rim.position.z = 0.012;
  const track = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({ color: '#3e2c1c', roughness: 0.7, metalness: 0.6 })); track.scale.setScalar(0.996);
  shield.add(track, rim);
  D.shade(shield); D.tune();
  D.blobs([[0, 0.1, 1.5, 0.8, yb + 0.012, 0.6]], { opacity: 0.45 });
  const motes = D.motes({ n: 26, center: [0, 0.4, 0.5], box: [5, 3.5, 2], size: 3.5, alpha: 0.35 });
  const total = tubeGeo.index.count;
  let want = 1, shown = 1, yaw = 0, drag = null, settled = true;
  function setRim(f) { const segs = Math.round(Math.max(0, Math.min(1, f)) * SEG); rim.visible = segs > 0; tubeGeo.setDrawRange(0, Math.min(total, segs * RAD * 6)); }
  setRim(1);
  function frameCam() {
    const asp = (canvas.clientWidth || 1) / (canvas.clientHeight || 1); camera.aspect = asp; camera.updateProjectionMatrix();
    const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * asp), hh = 2.45, hw = 2.0;
    const d = Math.max(hh / Math.tan(vf / 2), hw / Math.tan(hf / 2)) * 1.04 + 0.5;
    camera.position.set(0, top + 1.1 + d * 0.06, d); camera.lookAt(0, top + 1.05, 0);
  }
  let lastW = 0, lastH = 0;

  const api = {
    ok: true, mode: '3d', rc, stats: () => D.stats(),
    set(model) { if (model && typeof model.rim === 'number') { want = Math.max(0, Math.min(1, model.rim)); settled = false; } },
    get settled() { return settled; }, get rim() { return shown; }, get yaw() { return yaw; },
    dispose() { try { rc.stop(); D.dispose(); rc.dispose(); } catch (_) { /* nothing */ } },
  };
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });
  const down = (e) => { drag = { x: e.clientX, yaw }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } };
  const move = (e) => { if (drag) { yaw = Math.max(-0.9, Math.min(0.9, drag.yaw + (e.clientX - drag.x) * 0.008)); } };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  let t = 0;
  rc.start((dt) => {
    t += dt;
    const k = reduced ? 1 : Math.min(1, dt * 2.6);                       // the rim eases over about a second, slow and smooth
    shown += (want - shown) * k; if (Math.abs(want - shown) < 0.002) { shown = want; settled = true; }
    setRim(shown);
    shield.rotation.y = yaw + (reduced || drag ? 0 : Math.sin(t * 0.5) * 0.22);
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; if (w !== lastW || h !== lastH) { lastW = w; lastH = h; D.backdrop(w, h); }
    frameCam(); if (!reduced) motes.tick(t);
    rc.render();
  });
  return api;
}
