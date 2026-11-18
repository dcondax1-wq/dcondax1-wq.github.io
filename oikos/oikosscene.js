// OIKOS scene (ES module): a marble amphora that fills with gold coins as the buckets fill (three r160, ../jarvis/three.module.min.js, no post passes).
//   the vase    one lathe-turned shell of translucent marble, a bronze foot ring, a gold band, two handles
//   the coins   one InstancedMesh, laid in layers from the bottom like a liquid: layer k holds as many coins as fit the vase's width at that height, so fill 0..1 is the real share of the volume
//   the light   a warm sun from the left and a soft hemisphere (2700-3500 K feel); no glow, no bloom
//   motion      a slow turn of the camera (still on reduced motion); the coins settle in 450 ms when the fill changes (instant on reduced motion)
// createAmphora(canvas, { O }) -> { set(fill), fill(), coins(), capacity(), onFrame(), dispose() } or null when WebGL is not available (the page then draws its flat vase)
import * as THREE from '../jarvis/three.module.min.js';

// profile of the vase: [radius, height]
const PROFILE = [[0, 0], [0.55, 0], [0.6, 0.12], [0.95, 0.5], [1.25, 1.2], [1.3, 1.8], [1.15, 2.5], [0.75, 3.0], [0.5, 3.35], [0.48, 3.9], [0.62, 4.1], [0.7, 4.25]];
const WALL = 0.08, COIN_R = 0.2, COIN_T = 0.07, LAYER = 0.085, FILL_TOP = 3.0;
export function radiusAt(y) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1], [r1, y1] = PROFILE[i];
    if (y <= y1) return y1 === y0 ? r1 : r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  }
  return PROFILE[PROFILE.length - 1][0];
}
/** where every coin goes when the vase is full: layer by layer, a sunflower spiral inside the wall */
export function plan() {
  const out = [];
  for (let k = 0, y = 0.1; y < FILL_TOP; k++, y += LAYER) {
    const R = Math.max(0, radiusAt(y) - WALL - COIN_R), cap = Math.max(1, Math.floor((R / (COIN_R * 1.05)) * (R / (COIN_R * 1.05)) * 0.85));
    for (let j = 0; j < cap; j++) {
      const rho = R * Math.sqrt((j + 0.5) / cap), a = j * 2.39996 + k * 1.3;
      out.push({ x: Math.cos(a) * rho, y, z: Math.sin(a) * rho, tx: ((((j * 53 + k * 17) % 19) / 19) - 0.5) * 0.5, tz: ((((j * 29 + k * 7) % 13) / 13) - 0.5) * 0.5, ry: a });
    }
  }
  return out;
}

export function createAmphora(canvas, { O = null } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (_) { return null; }
  if (!renderer || !renderer.getContext || !renderer.getContext()) return null;
  const reduced = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
  const lite = () => { try { return !!(O && O.lite && O.lite()); } catch (_) { return false; } };
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  scene.add(new THREE.HemisphereLight('#f0dcb4', '#3a2c1e', 0.85));
  const sun = new THREE.DirectionalLight('#ffd9a0', 1.6); sun.position.set(-5, 7, 6); scene.add(sun);
  const fillL = new THREE.DirectionalLight('#9bb6c8', 0.35); fillL.position.set(6, 3, -4); scene.add(fillL);

  const marble = new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.38, metalness: 0.05, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const shell = new THREE.Mesh(new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 56), marble); shell.renderOrder = 2;
  const bronze = new THREE.MeshStandardMaterial({ color: '#9c6b3c', roughness: 0.45, metalness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.32, metalness: 0.85, emissive: '#3a2a08', emissiveIntensity: 0.25 });
  const vase = new THREE.Group(); vase.add(shell);
  const band = (y, w, mat) => { const m = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(y) + 0.01, w, 10, 56), mat); m.rotation.x = Math.PI / 2; m.position.y = y; m.renderOrder = 3; vase.add(m); };
  band(0.14, 0.05, bronze); band(1.8, 0.04, gold); band(3.3, 0.035, gold); band(4.22, 0.05, bronze);
  for (const s of [-1, 1]) { const hnd = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 10, 28, Math.PI), bronze); hnd.position.set(0.52 * s, 3.05, 0); hnd.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2; vase.add(hnd); }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.1, 40), bronze); base.position.y = -0.05; vase.add(base);
  scene.add(vase);

  const slots = plan(), MAX = slots.length;
  const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_T, 20);
  const mesh = new THREE.InstancedMesh(coinGeo, gold, MAX); mesh.frustumCulled = false; mesh.count = 0; vase.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
  slots.forEach((c, i) => { p3.set(c.x, c.y + COIN_T / 2, c.z); e.set(c.tx, c.ry, c.tz); q.setFromEuler(e); m4.compose(p3, q, s3); mesh.setMatrixAt(i, m4); });
  mesh.instanceMatrix.needsUpdate = true;

  let target = 0, shown = 0, dirty = true, raf = 0, stopped = false, frames = 0, th = 0.5, last = 0;
  const setCount = (f) => { mesh.count = Math.round(Math.max(0, Math.min(1, f)) * MAX); };
  function size() {
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 300, dpr = Math.min(window.devicePixelRatio || 1, lite() ? 1 : 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
  }
  function place() {
    const asp = camera.aspect, d = asp < 0.9 ? 15.5 : 13;
    camera.position.set(Math.sin(th) * d, 3.2, Math.cos(th) * d); camera.lookAt(0, 2.0, 0);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped) return;
    const still = reduced();
    if (document.hidden) return;
    const r = canvas.getBoundingClientRect();
    if (r.bottom < -40 || r.top > innerHeight + 40) return;                    // scrolled away: no frames for a vase nobody sees
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    size();
    if (shown !== target) { shown = still ? target : shown + (target - shown) * Math.min(1, dt / 0.15); if (Math.abs(shown - target) < 0.002) shown = target; setCount(shown); dirty = true; }
    if (!still) { th = 0.5 + Math.sin(now / 1000 * 0.25) * 0.5; dirty = true; }
    if (!dirty) return;
    place(); renderer.render(scene, camera); dirty = false; frames++;
  }
  raf = requestAnimationFrame(frame);
  return {
    set(f) { target = Math.max(0, Math.min(1, +f || 0)); if (reduced()) { shown = target; setCount(shown); } dirty = true; },
    fill: () => target, coins: () => mesh.count, capacity: () => MAX, frames: () => frames,
    dispose() { stopped = true; cancelAnimationFrame(raf); try { renderer.dispose(); coinGeo.dispose(); } catch (_) { /* gone */ } },
  };
}
