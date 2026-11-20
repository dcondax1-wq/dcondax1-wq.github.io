/* OLYMPUS NQ FX: the payout-goal vault in 3D (tools/web_public/olympus/nqvault3d.js, ES module, day-arenas 2026-11-20).
 * Imported by nqfx.js's payoutVault effect after window load + idle; never on its own. mount(host, o) -> { set(v), stop() } | null
 *   o = { value 0..1, tier 'ultra' | 'high' | 'low', pick(u, h, l), tick (fx-core ctx.ticker: the shared frame loop, sleeps off screen and
 *         in a hidden tab), add(cleanup), lost() }
 * A steel vault door on a hinge opens as the goal fills (fully open at 100% with a coin shower once); behind it gold coins stack up with
 * the value. Made in code (no models), three.js r160 from ../jarvis/, RoomEnvironment reflections on ultra / high only.
 */
import * as THREE from '../jarvis/three.module.min.js';
import { RoomEnvironment } from './three-addons/RoomEnvironment.js';

export function mount(host, o) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: o.tier !== 'low', alpha: true, powerPreference: 'low-power' }); } catch (e) { return null; }
  const pick = o.pick || ((u, h, l) => h), low = o.tier === 'low', reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pick(2, 1.5, 1)));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const cv = renderer.domElement; cv.className = 'nqfx-gl'; cv.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .1, 50);
  let pm = null;
  if (!low) { pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; }
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x1a1410, low ? 1.4 : .6));
  const key = new THREE.DirectionalLight(0xffe2b0, 2.4); key.position.set(2, 3, 4); scene.add(key);
  const glow = new THREE.PointLight(0xffc35a, 6, 6, 2); glow.position.set(0, -.1, -.4); scene.add(glow);

  const steel = new THREE.MeshStandardMaterial({ color: 0x5b6070, metalness: .85, roughness: .32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: .7, roughness: .45 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2b84b, metalness: 1, roughness: .26, emissive: 0x3a2600, emissiveIntensity: low ? .6 : .25 });
  // the wall + frame
  const wall = new THREE.Mesh(new THREE.RingGeometry(1.32, 3.2, 48), dark); scene.add(wall);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.3, .09, 12, 48), steel); scene.add(frame);
  const back = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 1 })); back.position.z = -.9; scene.add(back);
  // the coins inside (three stacks), shown up to value
  const N = pick(30, 24, 15), coinG = new THREE.CylinderGeometry(.26, .26, .06, low ? 18 : 28), coins = [];
  for (let i = 0; i < N; i++) {
    const s = i % 3, h = Math.floor(i / 3), c = new THREE.Mesh(coinG, gold);
    c.position.set((s - 1) * .58 + (h % 2 ? .02 : -.02), -.95 + h * .065, -.45 + (s === 1 ? -.12 : 0)); c.rotation.y = h * .7;
    c.userData.y = c.position.y; c.visible = false; scene.add(c); coins.push(c);
  }
  // the door: a thick disc on a hinge at its left edge, a gold ring, bolts, the wheel
  const hinge = new THREE.Group(); hinge.position.set(-1.22, 0, .05); scene.add(hinge);
  const door = new THREE.Group(); door.position.x = 1.22; hinge.add(door);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, .32, low ? 32 : 56), steel); slab.rotation.x = Math.PI / 2; door.add(slab);
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(.98, .035, 8, 48), gold); inlay.position.z = .17; door.add(inlay);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .06, 10), dark); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 1.08, Math.sin(a) * 1.08, .18); door.add(b); }
  const wheel = new THREE.Group(); wheel.position.z = .26; door.add(wheel);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(.42, .045, 10, 40), steel));
  for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.84, .05, .05), steel); sp.rotation.z = i * Math.PI / 3; wheel.add(sp); }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .12, 16).rotateX(Math.PI / 2), gold));
  // the shower (once, at 100%): small coins falling in front
  const shower = [];
  if (!reduceMotion) for (let i = 0; i < pick(26, 18, 8); i++) { const c = new THREE.Mesh(coinG, gold); c.scale.setScalar(.55); c.visible = false; scene.add(c); shower.push(c); }

  let value = Math.max(0, Math.min(1, +o.value || 0)), shown = reduceMotion ? value : 0, t = 0, showerT = -1, dead = false;
  const size = () => { const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.position.set(.5, .35, w / h < 1 ? 7.4 : 5.8); camera.lookAt(0, -.05, 0); camera.updateProjectionMatrix(); };
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(host);
  host.appendChild(cv); size();

  function draw(dt) {
    t += dt;
    shown += (value - shown) * Math.min(1, dt * (reduceMotion ? 99 : 2.2));
    const open = shown >= .999 ? 1.85 : shown * 1.2;
    hinge.rotation.y = -open;
    wheel.rotation.z = -shown * Math.PI * 2;
    const n = Math.round(shown * N);
    coins.forEach((c, i) => { c.visible = i < n; });
    glow.intensity = 2 + shown * 8;
    if (!reduceMotion) { camera.position.x = .5 + Math.sin(t * .4) * .25; camera.lookAt(0, -.05, 0); }
    if (value >= .999 && showerT < 0 && shower.length) showerT = 0;
    if (showerT >= 0) {
      showerT += dt;
      shower.forEach((c, i) => { const k = showerT - i * .06; c.visible = k > 0 && k < 2.2; if (c.visible) { c.position.set(Math.sin(i * 2.3) * 1.1, 1.6 - k * k * 1.6, .6 + Math.cos(i) * .3); c.rotation.set(k * 5 + i, k * 3, 0); } });
      if (showerT > 3.5) { showerT = -2; shower.forEach(c => { c.visible = false; }); }
    }
    renderer.render(scene, camera);
  }
  const k = o.tick((dt) => { if (!dead) draw(dt); }, { el: host });
  k.start();
  draw(0); requestAnimationFrame(() => { if (!dead) cv.classList.add('on'); });
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); if (o.lost) o.lost(); });

  function stop() {
    if (dead) return; dead = true;
    try { k.stop(); } catch (e) { /* gone */ }
    if (ro) ro.disconnect();
    scene.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
    if (scene.environment) scene.environment.dispose(); if (pm) pm.dispose();
    renderer.dispose(); if (cv.parentNode) cv.parentNode.removeChild(cv);
  }
  if (o.add) o.add(stop);
  return { set(v) { value = Math.max(0, Math.min(1, +v || 0)); if (value < .999) showerT = -1; }, stop };
}
