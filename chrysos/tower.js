// CHRYSOS tower (ES module): the 3D scene of the gold. Per account a marble plinth, a bronze column (the fees paid so far) and a stack of gold coins (the payouts received so far).
// A thin olive line at the top of the bronze column shows "fees paid back": when the coins climb past it, the account is in profit. The towers RISE when the month moves.
// Built on the OLYMPUS render core (../olympus/render.js, three.js r160 from ../jarvis/). Warm sun, marble floor, bloom <= .25. Draws nothing from data except heights.
// createTower(canvas) -> { ok, set(model), tick settled, dispose() }. If WebGL or the render core is not there, ok is false and the page shows its flat tower drawing instead.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { dress, shaftGeo, latheGeo, mergeParts, mat4 } from '../olympus/hero-stage.js';
// QA Round 6 bug 8: env-kit marble / bronze, owl-coin gold, the golden HDRI and a painted sky (olympus/hero-stage.js dress), soft shadows on a GPU.

const COIN_H = 0.16, MAX_COINS = 40, COL_R = 0.38, GAP = 1.9;

export function createTower(canvas, opts) {
  const o = opts || {};
  let rc = null;
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1.4, 0.1, 80);
    scene.background = new THREE.Color('#2a2118');
    scene.fog = new THREE.Fog('#2a2118', 14, 34);
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
  const D = dress({ rc, scene, camera, palette: 'golden', hdri: 'golden', envI: 0.85, sunDir: [0.55, 0.6, 0.6], key: 2.5, shadowExt: 7, metalEnv: 1.8, sky: { sunX: 0.8, sunY: 0.78, templeX: 0.16, horizon: 0.6 }, fogNear: 18, fogFar: 44 });
  const { kit } = D;
  D.ground({ mat: 'paving', color: '#8a7860', r: 30 }); D.build(scene);
  const marble = kit.mat('marble', { color: '#e6ddcc' });
  const bronzeM = kit.mat('bronze', { color: '#a87445' });
  const goldM = D.paint('coin'); goldM.metalness = 0.9; goldM.envMapIntensity = 1.8;
  const oliveM = new THREE.MeshStandardMaterial({ color: '#7f8a52', roughness: 0.5, metalness: 0.1 });
  const coinG = new THREE.CylinderGeometry(COL_R, COL_R, COIN_H * 0.86, 28);
  const colG = mergeParts([[shaftGeo({ h: 1, r: COL_R * 1.02, flutes: 16, lite: kit.geoLite, rows: 1, taper: 0.95 })]]);
  const plinthG = mergeParts([[latheGeo([[0.0001, 0], [1.12, 0], [1.12, 0.07], [1.0, 0.09], [1.0, 0.18], [0.95, 0.2], [0.0001, 0.2]], 40), mat4(0, -0.1, 0)]]);
  const ringG = new THREE.TorusGeometry(COL_R * 1.5, 0.03, 8, 40);
  D.tune();
  const group = new THREE.Group(); scene.add(group);
  let items = [], target = { unit: 100, towers: [] }, yaw = 0.35, drag = null, settled = true, lastW = 0, lastH = 0;
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });

  function clear() { for (const it of items) { group.remove(it.g); } items = []; }
  function layout(n) {
    clear();
    const w = (n - 1) * GAP;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(); g.position.set(i * GAP - w / 2, 0, 0);
      const plinth = new THREE.Mesh(plinthG, marble); plinth.position.set(0, 0.09, 0); g.add(plinth);
      const bronze = new THREE.Mesh(colG, bronzeM); bronze.position.set(-0.46, 0.2, 0); g.add(bronze);   // fluted, base at y
      const coins = new THREE.InstancedMesh(coinG, goldM, MAX_COINS); coins.position.set(0.46, 0.2, 0); coins.count = 0; g.add(coins);
      const ring = new THREE.Mesh(ringG, oliveM); ring.rotation.x = Math.PI / 2; ring.position.set(-0.46, 0.2, 0); g.add(ring);
      D.shade(g); group.add(g); items.push({ g, bronze, coins, ring, h: 0, c: 0, dummy: new THREE.Object3D() });
    }
    const span = Math.max(4.2, w + 3.2);
    camera.userData.dist = span * 1.0 + 1.8;
  }
  function frame() {
    const d = camera.userData.dist || 9;
    camera.position.set(Math.sin(yaw) * d, d * 0.42 + 1.2, Math.cos(yaw) * d);
    camera.lookAt(0, 1.7, 0);
  }

  const api = {
    ok: true, mode: '3d', rc,
    set(model) {
      if (!model || !Array.isArray(model.towers)) return;
      if (items.length !== model.towers.length) layout(model.towers.length);
      target = model; settled = false;
    },
    get settled() { return settled; },
    get towers() { return items.length; },
    get yaw() { return yaw; },
    stats: () => D.stats(),
    dispose() { try { rc.stop(); D.dispose(); rc.dispose(); } catch (_) { /* nothing */ } },
  };

  // drag to turn the plinths; the page still scrolls up and down (touch-action: pan-y)
  const down = (e) => { drag = { x: e.clientX, yaw }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } };
  const move = (e) => { if (drag) { yaw = drag.yaw - (e.clientX - drag.x) * 0.008; settled = false; } };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  rc.start((dt) => {
    let moving = !!drag;
    const k = reduced ? 1 : Math.min(1, dt * 3.2);              // slow ease-out: the towers rise over about a second
    items.forEach((it, i) => {
      const t = target.towers[i]; if (!t) return;
      const hGoal = Math.max(0.05, Math.min(7, (t.fees / target.unit) * COIN_H)), cGoal = Math.min(MAX_COINS, t.coins);
      it.h += (hGoal - it.h) * k; it.c += (cGoal - it.c) * k;
      if (Math.abs(hGoal - it.h) > 0.004 || Math.abs(cGoal - it.c) > 0.04) moving = true; else { it.h = hGoal; it.c = cGoal; }
      it.bronze.scale.y = it.h; it.bronze.position.y = 0.2;
      it.ring.position.y = 0.2 + it.h; it.ring.visible = it.c > 0;
      const n = Math.round(it.c); it.coins.count = n;
      for (let j = 0; j < n; j++) { it.dummy.position.set(0, j * COIN_H + COIN_H / 2, 0); it.dummy.rotation.y = j * 0.7; it.dummy.updateMatrix(); it.coins.setMatrixAt(j, it.dummy.matrix); }
      it.coins.instanceMatrix.needsUpdate = true;
    });
    if (!reduced && !drag && !moving) yaw += dt * 0.12;
    if (reduced && !moving) { /* still */ }
    settled = !moving;
    frame();
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1; if (cw !== lastW || ch !== lastH) { lastW = cw; lastH = ch; D.backdrop(cw, ch); }
    camera.aspect = cw / ch; camera.updateProjectionMatrix();
    rc.render();
  });
  layout(1); frame();
  return api;
}
