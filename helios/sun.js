// HELIOS sun (ES module): a gilded sun-disc engraved with a sunburst rising behind a marble colonnade (five fluted Doric columns, an architrave and a
// painted triglyph frieze on a stepped stylobate), with one long gold ray for each good sign of the morning (0 to 6). The higher the sun, the more is in
// order. Dawn sky, the env-kit marble / gold with the golden HDRI (QA Round 6 bug 8, olympus/hero-stage.js dress), soft shadows on a GPU, motes in the light.
// Reduced motion: the sun stands still at its height. Built on the OLYMPUS render core (../olympus/render.js, three.js r160 from ../jarvis/). Bloom <= .2.
// createSun(canvas, { reduced }) -> { ok, set({ rise, rays }), ... }. If WebGL or the render core is not there, ok is false and the page shows its flat sunrise.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { dress, mat4 } from '../olympus/hero-stage.js';

const MAX_RAYS = 6;

export function createSun(canvas, opts) {
  const o = opts || {};
  let rc = null;
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.3, 0.1, 80);
    scene.background = new THREE.Color('#3a2a1c');
    rc = createRenderer({ canvas, scene, camera, maxDpr: 2, tint: '#c8a24a', env: 'night',
      theme: { sky: '#5a3c22', fog: '#3a2a1c', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, bloom: { strength: 0.2, radius: 0.5, threshold: 1.0 } });
    const q = rc.quality();
    if (q === 'low' || q === 'off') { rc.dispose(); return { ok: false, mode: 'lite', reason: 'quality ' + q }; }
    return build(rc, scene, camera, canvas, o);
  } catch (e) {
    try { if (rc) rc.dispose(); } catch (_) { /* nothing */ }
    return { ok: false, mode: 'lite', reason: String(e && e.message ? e.message : e) };
  }
}

/** the sun's face: a sunburst engraved in gold (radial gradient, sixteen long and short engraved rays, a ring) */
function paintSun(g, w, h) {
  const c = w / 2, gr = g.createRadialGradient(c * 0.85, c * 0.8, 0, c, c, c);
  gr.addColorStop(0, '#fff2c0'); gr.addColorStop(0.45, '#f0c460'); gr.addColorStop(1, '#b07a26'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.save(); g.translate(c, c);
  for (let i = 0; i < 32; i++) { const long = i % 2 === 0; g.rotate(Math.PI / 16); g.fillStyle = long ? 'rgba(120,70,10,0.35)' : 'rgba(255,240,200,0.35)'; g.beginPath(); g.moveTo(-c * 0.03, c * 0.3); g.lineTo(0, c * (long ? 0.92 : 0.78)); g.lineTo(c * 0.03, c * 0.3); g.fill(); }
  g.restore();
  g.strokeStyle = 'rgba(110,64,10,0.55)'; g.lineWidth = w * 0.012; for (const r of [0.28, 0.94]) { g.beginPath(); g.arc(c, c, c * r, 0, Math.PI * 2); g.stroke(); }
  const core = g.createRadialGradient(c * 0.92, c * 0.9, 0, c, c, c * 0.27); core.addColorStop(0, '#fffbe6'); core.addColorStop(1, '#e8b850'); g.fillStyle = core; g.beginPath(); g.arc(c, c, c * 0.26, 0, Math.PI * 2); g.fill();
}

function build(rc, scene, camera, canvas, o) {
  const reduced = !!o.reduced;
  const D = dress({ rc, scene, camera, palette: 'dusk', hdri: 'dusk', envI: 0.85, sunDir: [0.0, 0.35, -1.0], key: 1.6, rim: 0.5, hemi: 0.6, shadowExt: 6, metalEnv: 1.8, sky: { sunX: 0.5, sunY: 0.95, temple: false, horizon: 0.74 }, fogNear: 16, fogFar: 40 });
  const { kit, B } = D;
  // a warm front light so the colonnade reads (the key sits behind with the sun)
  const front = new THREE.DirectionalLight(0xffd9a0, 1.2); front.position.set(3, 4, 8); scene.add(front);
  D.ground({ mat: 'paving', color: '#7d6a54', r: 30 });
  B.steps({ x: 0, z: 0.4, w: 10.8, d: 2.0, n: 3, h: 0.45, run: 0.3, mat: 'marble:uv', color: '#d8cebd' });
  const top = 0.45;
  [-4.4, -2.2, 0, 2.2, 4.4].forEach((x) => B.column({ x, y: top, z: 0.4, h: 2.55, r: 0.27, flutes: 20, color: '#ece4d5' }));
  B.entablature({ x: 0, y: top + 2.55, z: 0.4, w: 10.0, d: 1.0, ah: 0.26, fh: 0.28, ch: 0.12, bay: 1.1, color: '#e8e0d0', metope: '#b5563c', triglyph: '#3d4152' });
  D.build(scene);
  // the sun: an engraved gold disc with a thick gold rim, behind the columns
  const sun = new THREE.Group(); sun.position.z = -1.6; scene.add(sun);
  const face = kit.painted('paint:sunface', 512, 512, paintSun, { rough: 0.3 }); face.metalness = 0.9; face.envMapIntensity = 1.6; face.emissive = new THREE.Color('#5a3a08'); face.emissiveIntensity = 0.5; face.emissiveMap = face.map;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 64), face); disc.position.z = 0.075; sun.add(disc);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 64).rotateX(Math.PI / 2), kit.mat('gold')); sun.add(back);
  const rimM = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.08, 12, 72), kit.mat('gold')); rimM.position.z = 0.05; sun.add(rimM);
  // the rays: tapered gold blades in a fan over the top half (22 to 158 degrees), one per good sign
  const blade = new THREE.Shape(); blade.moveTo(-0.12, 0); blade.lineTo(0, 1.25); blade.lineTo(0.12, 0); blade.closePath();
  const bladeG = new THREE.ExtrudeGeometry(blade, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  const rays = [];
  for (let i = 0; i < MAX_RAYS; i++) {
    const r = new THREE.Mesh(bladeG, kit.mat('gold')), a = Math.PI * (0.12 + 0.76 * i / (MAX_RAYS - 1));
    const g = new THREE.Group(); g.rotation.z = a - Math.PI / 2; r.position.y = 1.2; g.add(r); g.visible = false; sun.add(g); rays.push(g);
  }
  D.shade(sun, true, false); D.tune();
  const halo = D.flames([[0, 0, -2.0]], { glow: 520, glowColor: '#ffb860', size: 0.0001 });
  const motes = D.motes({ n: 40, center: [0, 2.4, -0.4], box: [10, 4, 3], size: 3.5, alpha: 0.4 });
  D.blobs([-4.4, -2.2, 0, 2.2, 4.4].map((x) => [x, 0.4, 0.5, 1, top + 0.012]), { opacity: 0.4 });
  let want = { rise: 0.5, rays: 0 }, shown = { rise: reduced ? 0.5 : 0, rays: 0 }, yaw = 0, drag = null, settled = true, lastW = 0, lastH = 0;
  function place() {
    sun.position.y = -0.8 + shown.rise * 6.0;                              // below the floor line at 0, clear over the frieze at 1
    const n = Math.round(shown.rays);
    rays.forEach((g, i) => { g.visible = i < n; });
    halo.set(0, 0.6 + shown.rise * 0.6, 0); halo.glow.geometry.attributes.position.setY(0, sun.position.y - 0.35); halo.commit();
  }
  place();
  const api = {
    ok: true, mode: '3d', rc, stats: () => D.stats(),
    set(m) { if (m && typeof m.rise === 'number') { want = { rise: Math.max(0, Math.min(1, m.rise)), rays: Math.max(0, Math.min(MAX_RAYS, Math.round(m.rays || 0))) }; settled = false; if (reduced) { shown = { ...want }; place(); settled = true; } } },
    get settled() { return settled; }, get rise() { return shown.rise; }, get rays() { return Math.round(shown.rays); },
    dispose() { try { rc.stop(); D.dispose(); rc.dispose(); } catch (_) { /* nothing */ } },
  };
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });
  const down = (e) => { drag = { x: e.clientX, yaw }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } };
  const move = (e) => { if (drag) yaw = Math.max(-0.5, Math.min(0.5, drag.yaw + (e.clientX - drag.x) * 0.005)); };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  let t = 0;
  rc.start((dt) => {
    t += dt;
    if (!reduced) {
      const k = Math.min(1, dt * 1.4);                                    // the sun rises slowly: about two seconds
      shown.rise += (want.rise - shown.rise) * k; shown.rays += (want.rays - shown.rays) * Math.min(1, dt * 3);
      if (Math.abs(want.rise - shown.rise) < 0.002 && Math.abs(want.rays - shown.rays) < 0.05) { shown = { ...want }; settled = true; }
      place(); motes.tick(t); sun.rotation.z = Math.sin(t * 0.3) * 0.03;
    }
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; if (w !== lastW || h !== lastH) { lastW = w; lastH = h; D.backdrop(w, h); }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), d = Math.max(3.4 / Math.tan(vf / 2), 5.7 / Math.tan(hf / 2)) + 1.0;
    camera.position.set(Math.sin(yaw) * d, 2.6 + d * 0.04, Math.cos(yaw) * d); camera.lookAt(0, 2.75, 0);
    rc.render();
  });
  return api;
}
