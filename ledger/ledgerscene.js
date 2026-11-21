// LEDGER scene (ES module): a golden vault whose pile of coins grows with your net profit, drawn by the OLYMPUS render core (docs/OLYMPUS_RENDER.md).
//   the vault   a dark steel frame, a round gold door ajar (a spoked wheel), a warm glow inside
//   the pile    one InstancedMesh of gold coins in front of the door: 1 coin = `unit` dollars, the pile's width and height follow the count (more profit, a bigger heap)
//   a loss      no coins, a dim vault and a red lamp: the honest picture of a negative net
//   a payout    coins rain onto the pile (burst(n)); still on reduced motion
//   the light   god rays from the library (OLYMPUS_FX.godRays) on a profit; gold dust on every tier above off
// createVault(canvas, { O }) -> { set({ net, unit }), burst(n), coins(), unit(), onQuality(cb), lite(), quality(), stats(), dispose() }
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as M from '../olympus/materials.js';

const TIERS = { ultra: { max: 900, dust: 500, rays: true }, high: { max: 620, dust: 320, rays: true }, low: { max: 260, dust: 120, rays: false }, off: { max: 120, dust: 0, rays: false } };
const GOLD = '#f1c14b';   // day-archive 2026-11-20 (OLYMPUS NIGHT): violet steel and violet light; this bright gold only on the thin rings
const AG_THEME = { sky: '#16131e', fog: '#000000', emissive: '#9d59ee', bloom: '#9d59ee', accent: '#f1c14b' };   // AGORA: warm dusk, no violet rims
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
/** dollars per coin: the pile stays readable from a few hundred dollars to tens of thousands */
export const unitFor = (net) => { const a = Math.abs(net || 0); return a < 500 ? 5 : a < 2000 ? 10 : a < 8000 ? 25 : a < 30000 ? 100 : 500; };
export const coinsFor = (net, unit, max) => (net > 0 ? Math.min(max, Math.max(1, Math.round(net / unit))) : 0);

export function createVault(canvas, { O = null } = {}) {
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  scene.fog = new THREE.FogExp2(0x000000, 0.035);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  let lite = false, dirty = true, qcb = null, drawn = 0, frames = 0, stopped = false, raf = 0, net = 0, unit = 5, count = 0, tier = TIERS.low, th = 0.2, ph = 0.28, dist = 15, drag = null, rain = [], rayFx = null, t0 = performance.now() / 1000;
  const rc = createRenderer({ canvas, scene, camera, env: 'night', theme: AG_THEME, tint: GOLD, exposure: 0.95, maxDpr: 1.6, bloom: { strength: 0.22, radius: 0.5, threshold: 1.0 },
    onQuality: (l) => { lite = l === 'low' || l === 'off'; applyTier(); dirty = true; if (qcb) qcb(l); } });
  lite = rc.quality() === 'low' || rc.quality() === 'off';
  // the OLYMPUS look (2026-11-14, team T2): the vault's night and fog lean toward the look's (by its mix; the default AGORA: untouched)
  try { if (O && O.themeScene) O.themeScene({ scene, renderer: rc.renderer, redraw: () => { dirty = true; } }); } catch (e) { /* the vault's own colours */ }

  scene.add(new THREE.HemisphereLight('#9d59ee', '#16131e', 0.8));
  const key = new THREE.DirectionalLight('#9d59ee', 0.9); key.position.set(-6, 10, 8); scene.add(key);
  const glow = new THREE.PointLight('#9d59ee', 30, 22, 1.5); glow.position.set(0, 2.4, -1.5); scene.add(glow);
  const lamp = new THREE.PointLight('#8b5cf6', 0, 14, 1.6); lamp.position.set(-4.5, 5.4, -1); scene.add(lamp);

  // ---- the room and the vault
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), M.marble({ color: '#1c1430', roughness: 0.4, scale: 0.5, envMapIntensity: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; scene.add(floor);
  const steel = M.marble({ color: '#898497', vein: '#f1c14b', roughness: 0.35, scale: 0.6, envMapIntensity: 0.9 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 1.2), steel); wall.position.set(0, 4.5, -4); scene.add(wall);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 1.3, 48), new THREE.MeshBasicMaterial({ color: hdr('#9d59ee', 1.6) }));
  hole.rotation.x = Math.PI / 2; hole.position.set(0, 4.3, -3.55); scene.add(hole);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.28, 16, 64), M.metal({ kind: 'chrome', color: GOLD, roughness: 0.22, envMapIntensity: 1.4 })); rim.position.set(0, 4.3, -3.3); scene.add(rim);
  const door = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.15, 0.55, 56), M.metal({ kind: 'chrome', color: '#9d59ee', roughness: 0.25, clearcoat: 0.8, envMapIntensity: 1.5 })); slab.rotation.x = Math.PI / 2; door.add(slab);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 32), M.metal({ kind: 'chrome', color: '#dacbf0', roughness: 0.12 })); hub.rotation.x = Math.PI / 2; hub.position.z = 0.4; door.add(hub);
  const spokes = new THREE.Group();
  for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 10), M.metal({ kind: 'chrome', color: '#dacbf0', roughness: 0.15 })); sp.position.z = 0.4; sp.rotation.z = (i / 6) * Math.PI; spokes.add(sp); }
  door.add(spokes);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.09, 12, 64), M.metal({ kind: 'chrome', color: '#f1c14b', roughness: 0.3 })); ring.position.z = 0.32; door.add(ring);
  for (const [r, k] of [[1.9, 0.07], [1.25, 0.06]]) { const g = new THREE.Mesh(new THREE.TorusGeometry(r, k, 10, 56), M.metal({ kind: 'chrome', color: '#f1c14b', roughness: 0.35 })); g.position.z = 0.3; door.add(g); }
  door.position.set(3.1, 4.3, -2.7); door.rotation.y = -1.05; door.userData.hinge = 3.1;       // ajar: swung out on the right
  scene.add(door);

  // ---- the coin pile
  const MAX = 900;
  const coinGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.11, 24);
  const coinMat = M.metal({ kind: 'chrome', color: GOLD, roughness: 0.2, clearcoat: 0.9, envMapIntensity: 1.6 });
  const pile = new THREE.InstancedMesh(coinGeo, coinMat, MAX); pile.frustumCulled = false; scene.add(pile);
  const rainMesh = new THREE.InstancedMesh(coinGeo, coinMat, 90); rainMesh.frustumCulled = false; rainMesh.count = 0; scene.add(rainMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
  function layout(n) {                                           // a heap: coins spiral out from the middle, the cone grows with the count
    const R = 0.9 + Math.pow(n, 0.42) * 0.38, H = 0.35 + Math.pow(n, 0.5) * 0.12;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, rho = R * Math.sqrt((Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.94 + 0.03), hgt = Math.max(0, H * (1 - (rho / R) * (rho / R)));
      p3.set(Math.cos(a) * rho, 0.06 + hgt + ((i * 37) % 11) * 0.012, 1.1 + Math.sin(a) * rho * 0.8);
      e.set((((i * 53) % 17) / 17 - 0.5) * 0.9, a * 3, (((i * 29) % 13) / 13 - 0.5) * 0.9); q.setFromEuler(e);
      m4.compose(p3, q, s3); pile.setMatrixAt(i, m4);
    }
    pile.count = n; pile.instanceMatrix.needsUpdate = true;
  }

  // ---- gold dust
  const dust = M.starfield({ count: 520, radius: 22, size: 2.4, color: GOLD, seed: 21 }); dust.position.y = 4; scene.add(dust);

  function applyTier() {
    tier = TIERS[rc.quality()] || TIERS.low;
    dust.visible = tier.dust > 0;
    if (dust.geometry) dust.geometry.setDrawRange(0, tier.dust);
    setRays();
    count = coinsFor(net, unit, tier.max); layout(count);
  }
  function setRays() {
    const FXL = window.OLYMPUS_FX;
    const want = tier.rays && net > 0 && !reduced() && FXL && FXL.has && FXL.has('godRays');
    if (want && !rayFx) { try { rayFx = FXL.godRays({ scene, camera, renderer: rc.renderer }, { position: [0, 17, -10], length: 22, intensity: 0.22, color: GOLD, count: 4 }); } catch (_) { rayFx = null; } }
    else if (!want && rayFx) { try { rayFx.stop(); } catch (_) { /* gone */ } rayFx = null; }
  }
  if (window.OLYMPUS_FX && window.OLYMPUS_FX.load) window.OLYMPUS_FX.load('3d').then(() => { setRays(); dirty = true; }).catch(() => {});

  function set(o) {
    net = o && typeof o.net === 'number' && Number.isFinite(o.net) ? o.net : 0;
    unit = o && o.unit > 0 ? o.unit : unitFor(net);
    count = coinsFor(net, unit, tier.max); layout(count);
    const win = net > 0, loss = net < 0;
    glow.intensity = win ? 22 + Math.min(30, count / 25) : 6; glow.color.set(win ? '#9d59ee' : '#475569');
    lamp.intensity = loss ? 26 : 0;
    hole.material.color.copy(hdr(loss ? '#475569' : '#9d59ee', loss ? 0.8 : 1.6 + Math.min(1.2, count / 500)));
    door.rotation.y = loss ? -0.2 : -1.05;
    setRays(); dirty = true;
  }
  function burst(n) {
    if (reduced() || tier.max < 200) return 0;
    const k = Math.min(60, Math.max(8, Math.round(n || 20)));
    for (let i = 0; i < k && rain.length < 90; i++) rain.push({ x: (Math.random() - 0.5) * 2.2, z: 1.1 + (Math.random() - 0.5) * 1.6, y: 9 + Math.random() * 5, v: 0, r: Math.random() * 6, d: i * 0.025 });
    dirty = true; return k;
  }
  const mid = () => Math.max(1, (pile.count ? 0.9 + Math.pow(pile.count, 0.5) * 0.12 : 0.4));

  // ---- the camera: a slow turn, a drag to look round
  function placeCamera(t) {
    const a = th + (reduced() || drag ? 0 : Math.sin(t * 0.18) * 0.12);
    camera.position.set(Math.sin(a) * Math.cos(ph) * dist, 2.4 + Math.sin(ph) * dist * 0.7, 1 + Math.cos(a) * Math.cos(ph) * dist);
    camera.lookAt(0, 3.0 + mid() * 0.3, -0.6);
  }
  canvas.addEventListener('pointerdown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, th, ph }; });
  addEventListener('pointermove', (ev) => { if (!drag) return; th = Math.max(-1.1, Math.min(1.1, drag.th - (ev.clientX - drag.x) * 0.006)); ph = Math.max(0.08, Math.min(0.6, drag.ph + (ev.clientY - drag.y) * 0.003)); dirty = true; });
  const end = () => { drag = null; };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped) return;
    const still = reduced(), t = now / 1000, dt = 0.016;
    const a = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    dist = a < 0.7 ? 25 : a < 1.2 ? 21 : 17;
    const fov = a < 0.7 ? 50 : 40; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (still && !dirty && !rain.length) return;
    if (canvas.getBoundingClientRect().bottom < -20) return;          // scrolled away: no frames for a vault nobody sees
    dust.update(t, rc.renderer.getPixelRatio());
    if (!still) { spokes.rotation.z = Math.sin(t * 0.3) * 0.08; glow.intensity += Math.sin(t * 2) * 0.08; }
    if (rain.length) {                                              // the payout shower
      let live = 0;
      for (const c of rain) {
        c.d -= dt; if (c.d > 0) { continue; }
        c.v += 24 * dt; c.y -= c.v * dt;
        const top = 0.3 + Math.max(0, mid() * 0.7);
        if (c.y < top) { c.y = top; c.done = true; }
        p3.set(c.x, c.y, c.z); e.set(c.r + t * 4, c.r, c.r * 2); q.setFromEuler(e); m4.compose(p3, q, s3); rainMesh.setMatrixAt(live++, m4);
      }
      rain = rain.filter((c) => !c.done); rainMesh.count = live; rainMesh.instanceMatrix.needsUpdate = true;
    } else rainMesh.count = 0;
    placeCamera(t);
    if (rc.render()) drawn++;
    frames++; dirty = false;
  }
  applyTier(); set({ net: 0 }); placeCamera(0);
  raf = requestAnimationFrame(frame);
  return {
    set, burst, coins: () => count, unit: () => unit, onQuality(cb) { qcb = typeof cb === 'function' ? cb : null; }, lite: () => lite, quality: () => rc.quality(),
    stats: () => ({ frames, drawn, quality: rc.quality(), passes: rc.passes().length, coins: count, unit, max: tier.max, net, rays: !!rayFx, raining: rain.length, dust: tier.dust, pile: pile.count }),
    dispose() { stopped = true; cancelAnimationFrame(raf); if (rayFx) { try { rayFx.stop(); } catch (_) { /* gone */ } } coinGeo.dispose(); rc.dispose(); },
  };
}
