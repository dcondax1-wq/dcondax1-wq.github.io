// KRATOS column (ES module): a fluted bronze column on a stepped round marble plinth with a painted Greek-key band; its height is the day's discipline
// score (0-100), a gilded capital on top, and two olive laurel rings round the shaft's path at 55 and 75 (the marks to clear). The column rises slowly
// when the score changes. Golden-hour sky and the env-kit marble / bronze / gold with the golden HDRI (QA Round 6 bug 8, olympus/hero-stage.js dress),
// soft shadows on a GPU, motes in the light. Built on the OLYMPUS render core (../olympus/render.js, three.js r160 from ../jarvis/). Bloom <= .2.
// createColumn(canvas) -> { ok, set({ score }), ... }. If WebGL or the render core is not there, ok is false and the page shows its flat column.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { dress, shaftGeo, latheGeo, boxGeo, laurelGeo, mergeParts, mat4 } from '../olympus/hero-stage.js';

const H = 4.2;     // the column's height at a score of 100

export function createColumn(canvas, opts) {
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

function build(rc, scene, camera, canvas, o) {
  const reduced = !!o.reduced;
  const D = dress({ rc, scene, camera, palette: 'golden', hdri: 'golden', envI: 0.85, sunDir: [0.6, 0.55, 0.6], key: 2.5, shadowExt: 4, metalEnv: 1.8, sky: { sunX: 0.75, sunY: 0.8, templeX: 0.2, horizon: 0.66 }, fogNear: 14, fogFar: 36 });
  const { kit, B } = D;
  D.ground({ mat: 'paving', color: '#8a7860', r: 28 });
  const base = D.plinth({ r: 1.05, steps: 2, stepH: 0.13, run: 0.24, drum: 0.3 });           // the top of the plinth
  B.lathe('marble:uv', [[0.0001, 0], [0.72, 0], [0.72, 0.06], [0.64, 0.1], [0.66, 0.15], [0.58, 0.19], [0.0001, 0.19]], 0, base, 0, 1, 32, '#ece4d5');
  D.build(scene);
  const y0 = base + 0.19;
  const shaft = new THREE.Mesh(shaftGeo({ h: 1, r: 0.52, flutes: 20, lite: kit.geoLite, rows: 1, taper: 0.86 }), kit.mat('bronze', { color: '#a87445' })); scene.add(shaft);
  const capG = mergeParts([[latheGeo([[0.45, 0], [0.5, 0.05], [0.62, 0.14], [0.74, 0.22], [0.78, 0.25], [0.0001, 0.25]], 32)], [boxGeo(1.6, 0.14, 1.6), mat4(0, 0.32, 0)]]);
  const cap = new THREE.Mesh(capG, kit.mat('gold')); scene.add(cap);
  const lg = mergeParts(laurelGeo(0.74, { leaves: 30, gap: 0.35 }).map((g) => [g, mat4(0, 0, 0, 0, 1, -Math.PI / 2)]));
  const olive = new THREE.MeshStandardMaterial({ color: '#7f8a52', roughness: 0.55, metalness: 0.1 });
  const marks = [55, 75].map((s) => { const m = new THREE.Mesh(lg, olive); m.position.y = y0 + (s / 100) * H; m.rotation.y = s * 0.05; scene.add(m); return m; });
  D.shade(shaft); D.shade(cap); marks.forEach((m) => D.shade(m)); D.tune();
  D.blobs([[0, 0, 1.6, 0.7, 0.01]], { opacity: 0.4 });
  const motes = D.motes({ n: 30, center: [0, 2.6, 0], box: [5, 4, 4], size: 3.5, alpha: 0.4 });
  let want = 0, shown = 0, yaw = 0.4, drag = null, settled = true, t = 0, lastW = 0, lastH = 0;
  function place(score) {
    const h = Math.max(0.05, (score / 100) * H);
    shaft.scale.set(1, h, 1); shaft.position.y = y0; cap.position.y = y0 + h;
  }
  place(0);
  const api = {
    ok: true, mode: '3d', rc, stats: () => D.stats(),
    set(model) { if (model && typeof model.score === 'number') { want = Math.max(0, Math.min(100, model.score)); settled = false; } },
    get settled() { return settled; }, get score() { return shown; }, get yaw() { return yaw; },
    dispose() { try { rc.stop(); D.dispose(); rc.dispose(); } catch (_) { /* nothing */ } },
  };
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });
  const down = (e) => { drag = { x: e.clientX, yaw }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } };
  const move = (e) => { if (drag) yaw = drag.yaw - (e.clientX - drag.x) * 0.008; };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  rc.start((dt) => {
    t += dt;
    const k = reduced ? 1 : Math.min(1, dt * 2.2);                       // slow ease-out: the column rises over about a second
    shown += (want - shown) * k; if (Math.abs(want - shown) < 0.05) { shown = want; settled = true; }
    place(shown);
    if (!reduced && !drag) yaw += dt * 0.12;
    if (!reduced) motes.tick(t);
    const w = canvas.clientWidth || 1, hh = canvas.clientHeight || 1; if (w !== lastW || hh !== lastH) { lastW = w; lastH = hh; D.backdrop(w, hh); }
    camera.aspect = w / hh; camera.updateProjectionMatrix();
    const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), d = Math.max(3.25 / Math.tan(vf / 2), 2.1 / Math.tan(hf / 2)) + 1.2;
    camera.position.set(Math.sin(yaw) * d, 2.9, Math.cos(yaw) * d); camera.lookAt(0, 2.55, 0);
    rc.render();
  });
  return api;
}
