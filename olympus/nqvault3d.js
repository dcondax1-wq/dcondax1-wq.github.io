/* OLYMPUS NQ FX: the payout-goal vault in 3D (tools/web_public/olympus/nqvault3d.js, ES module, day-arenas 2026-11-20).
 * Imported by nqfx.js's payoutVault effect after window load + idle; never on its own. mount(host, o) -> { set(v), stop() } | null
 *   o = { value 0..1, tier 'ultra' | 'high' | 'low', pick(u, h, l), tick (fx-core ctx.ticker: the shared frame loop, sleeps off screen and
 *         in a hidden tab), add(cleanup), lost(), theme { base, cyan, blue, violet, steel } (NQFX.theme, CSS colours) }
 * The NQ look (owner 2026-11-20: no gold): a brushed titanium vault door with a cyan light seam on a deep navy wall opens as the goal fills;
 * behind it glowing cyan / blue crystal bars stack up with the value; at 100% the door is fully open and a cyan / violet spark shower plays
 * once. Made in code (no models), three.js r160 from ../jarvis/, RoomEnvironment reflections on ultra / high only.
 */
import * as THREE from '../jarvis/three.module.min.js';
import { RoomEnvironment } from './three-addons/RoomEnvironment.js';

export function mount(host, o) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: o.tier !== 'low', alpha: true, powerPreference: 'low-power' }); } catch (e) { return null; }
  const T = Object.assign({ base: '#000000', cyan: '#9d59ee', blue: '#4d2e76', violet: '#f1c14b', steel: '#8d8a9a' }, o.theme || {});   // OLYMPUS NIGHT defaults (nqfx.js passes its theme)
  const col = (c) => new THREE.Color(c);
  const pick = o.pick || ((u, h, l) => h), low = o.tier === 'low', reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pick(2, 1.5, 1)));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const cv = renderer.domElement; cv.className = 'nqfx-gl'; cv.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .1, 50);
  let pm = null;
  if (!low) { pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; }
  scene.add(new THREE.HemisphereLight(0xdbeafe, col(T.base), low ? 1.4 : .55));
  const key = new THREE.DirectionalLight(0xe0f2fe, 2.2); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(col(T.violet), 1.2); rim.position.set(-3, 1, 2); scene.add(rim);
  const glow = new THREE.PointLight(col(T.cyan), 6, 6, 2); glow.position.set(0, -.1, -.4); scene.add(glow);

  const titanium = new THREE.MeshStandardMaterial({ color: col(T.steel), metalness: .9, roughness: .34 });
  const dark = new THREE.MeshStandardMaterial({ color: col(T.base), metalness: .6, roughness: .5 });
  const seamM = new THREE.MeshStandardMaterial({ color: col(T.cyan), emissive: col(T.cyan), emissiveIntensity: 2.2, roughness: .3 });
  const violetM = new THREE.MeshStandardMaterial({ color: col(T.violet), emissive: col(T.violet), emissiveIntensity: 1.6, roughness: .3 });
  const barM = [T.cyan, T.blue].map(c => new THREE.MeshStandardMaterial({ color: col(c), emissive: col(c), emissiveIntensity: low ? 1.1 : .8,
    metalness: .2, roughness: .15, transparent: true, opacity: .9 }));
  // the wall + frame
  scene.add(new THREE.Mesh(new THREE.RingGeometry(1.32, 3.2, 48), dark));
  scene.add(new THREE.Mesh(new THREE.TorusGeometry(1.3, .09, 12, 48), titanium));
  const frameSeam = new THREE.Mesh(new THREE.TorusGeometry(1.39, .012, 6, 64), seamM); scene.add(frameSeam);
  const back = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshStandardMaterial({ color: col(T.base), roughness: 1 })); back.position.z = -.9; scene.add(back);
  // the crystal bars inside (three stacks, alternating cyan / blue), shown up to value
  const N = pick(30, 24, 15), barG = new THREE.BoxGeometry(.5, .07, .2), bars = [];
  for (let i = 0; i < N; i++) {
    const s = i % 3, h = Math.floor(i / 3), c = new THREE.Mesh(barG, barM[(s + h) % 2]);
    c.position.set((s - 1) * .58, -.95 + h * .078, -.45 + (s === 1 ? -.12 : 0)); c.rotation.y = (h % 2 ? .12 : -.12);
    c.visible = false; scene.add(c); bars.push(c);
  }
  // the door: a thick titanium disc on a hinge at its left edge, a cyan light seam, bolts, the wheel with a violet hub
  const hinge = new THREE.Group(); hinge.position.set(-1.22, 0, .05); scene.add(hinge);
  const door = new THREE.Group(); door.position.x = 1.22; hinge.add(door);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, .32, low ? 32 : 56), titanium); slab.rotation.x = Math.PI / 2; door.add(slab);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(.98, .02, 8, 64), seamM); seam.position.z = .17; door.add(seam);
  const seamV = new THREE.Mesh(new THREE.BoxGeometry(.02, 1.5, .02), seamM); seamV.position.z = .17; door.add(seamV);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .06, 10), dark); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 1.08, Math.sin(a) * 1.08, .18); door.add(b); }
  const wheel = new THREE.Group(); wheel.position.z = .26; door.add(wheel);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(.42, .045, 10, 40), titanium));
  for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.84, .05, .05), titanium); sp.rotation.z = i * Math.PI / 3; wheel.add(sp); }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .12, 16).rotateX(Math.PI / 2), violetM));
  // the shower (once, at 100%): cyan / violet sparks falling in front
  const shower = [], sparkG = new THREE.OctahedronGeometry(.06, 0);
  if (!reduceMotion) for (let i = 0; i < pick(30, 22, 10); i++) { const c = new THREE.Mesh(sparkG, i % 2 ? violetM : seamM); c.visible = false; scene.add(c); shower.push(c); }

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
    bars.forEach((c, i) => { c.visible = i < n; });
    glow.intensity = 2 + shown * 8;
    seamM.emissiveIntensity = 1.8 + (reduceMotion ? 0 : Math.sin(t * 2.4) * .5);
    if (!reduceMotion) { camera.position.x = .5 + Math.sin(t * .4) * .25; camera.lookAt(0, -.05, 0); }
    if (value >= .999 && showerT < 0 && shower.length) showerT = 0;
    if (showerT >= 0) {
      showerT += dt;
      shower.forEach((c, i) => { const k = showerT - i * .05; c.visible = k > 0 && k < 2.2; if (c.visible) { c.position.set(Math.sin(i * 2.3) * 1.1, 1.6 - k * k * 1.6, .6 + Math.cos(i) * .3); c.rotation.set(k * 5 + i, k * 3, 0); } });
      if (showerT > 3.5) { showerT = -2; shower.forEach(c => { c.visible = false; }); }
    }
    renderer.render(scene, camera);
    if (!painted) seen();
  }
  // QA #3 (night-nq-accounts 2026-11-27): the 2D vault fades out ONLY once a frame really drew something. A phone whose WebGL makes a
  // context but never paints (driver, memory, a blocked GPU) used to leave a black box. Read one pixel right after the render (same task,
  // so the buffer is still there): any alpha = drawn -> o.frame() once. Nothing drawn: no call, nqfx.js keeps the 2D and stops us after ~2 s.
  let painted = false;
  function seen() {
    try {
      const gl = renderer.getContext();
      if (!gl || gl.isContextLost()) return;
      const px = new Uint8Array(4), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      gl.readPixels(w >> 1, h >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (px[3] > 0 || px[0] + px[1] + px[2] > 0) { painted = true; cv.classList.add('on'); if (o.frame) o.frame(); }
    } catch (e) { /* not drawn: the 2D stays */ }
  }
  const k = o.tick((dt) => { if (!dead) draw(dt); }, { el: host });
  k.start();
  try { draw(0); } catch (e) { stop(); if (o.lost) o.lost(); return null; }     // a render that throws = no 3D (the 2D stays)
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
