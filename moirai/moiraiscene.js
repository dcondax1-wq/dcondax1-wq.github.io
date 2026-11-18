// MOIRAI scene (ES module): the loom of the three fates. A marble spindle with three threads braided round it: olive (pass), terracotta (bust) and gold (still open).
// Each thread is as thick as its chance, so the thickest thread is the likeliest fate. Warm sun, no bloom, one small mesh set: light on a phone, still on reduced motion.
// createLoom(canvas, { O }) -> { set({ pass, bust, open }), radii(), frames(), dispose() } or null when WebGL is not available (the page then draws three flat bars)
import * as THREE from '../jarvis/three.module.min.js';

const COLORS = { pass: '#7f8a52', bust: '#c96a4a', open: '#c8a24a' };
export const threadRadius = (share) => 0.05 + 0.34 * Math.sqrt(Math.max(0, Math.min(1, share || 0)));

export function createLoom(canvas, { O = null } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (_) { return null; }
  if (!renderer || !renderer.getContext || !renderer.getContext()) return null;
  const reduced = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
  const lite = () => { try { return !!(O && O.lite && O.lite()); } catch (_) { return false; } };
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  scene.add(new THREE.HemisphereLight('#f0dcb4', '#3a2c1e', 0.9));
  const sun = new THREE.DirectionalLight('#ffd9a0', 1.5); sun.position.set(-4, 6, 6); scene.add(sun);
  const group = new THREE.Group(); scene.add(group);
  const marble = new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.4, metalness: 0.05 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#9c6b3c', roughness: 0.45, metalness: 0.7 });
  const spindle = new THREE.Mesh(new THREE.LatheGeometry([[0.05, 0], [0.16, 0.4], [0.12, 1.2], [0.1, 3], [0.12, 4.8], [0.16, 5.6], [0.05, 6]].map(([r, y]) => new THREE.Vector2(r, y)), 28), marble); group.add(spindle);
  const whorl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.16, 36), bronze); whorl.position.y = 0.6; group.add(whorl);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), bronze); cap.position.y = 6.05; group.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.18, 44), marble); base.position.y = -0.1; group.add(base);
  group.position.y = -3;

  const seg = () => (lite() ? 70 : 130), rad = () => (lite() ? 6 : 12);
  const keys = ['pass', 'bust', 'open'], meshes = {}, radii = { pass: 0.05, bust: 0.05, open: 0.05 };
  const curve = (k) => {
    const ph = (keys.indexOf(k) / 3) * Math.PI * 2, pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = ph + t * Math.PI * 5; pts.push(new THREE.Vector3(Math.cos(a) * 0.62, 0.35 + t * 5.3, Math.sin(a) * 0.62)); }
    return new THREE.CatmullRomCurve3(pts);
  };
  const curves = { pass: curve('pass'), bust: curve('bust'), open: curve('open') };
  const mats = {}; for (const k of keys) mats[k] = new THREE.MeshStandardMaterial({ color: COLORS[k], roughness: 0.5, metalness: 0.1 });
  let dirty = true, raf = 0, stopped = false, frames = 0, th = 0, last = 0;
  function build() {
    for (const k of keys) { if (meshes[k]) { group.remove(meshes[k]); meshes[k].geometry.dispose(); } meshes[k] = new THREE.Mesh(new THREE.TubeGeometry(curves[k], seg(), radii[k], rad(), false), mats[k]); group.add(meshes[k]); }
    dirty = true;
  }
  build();
  function size() {
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 300, dpr = Math.min(window.devicePixelRatio || 1, lite() ? 1 : 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (stopped || document.hidden) return;
    const r = canvas.getBoundingClientRect(); if (r.bottom < -40 || r.top > innerHeight + 40) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    size();
    if (!reduced()) { th += dt * 0.35; group.rotation.y = th; dirty = true; }
    if (!dirty) return;
    const d = camera.aspect < 0.9 ? 17 : 14; camera.position.set(0, 1.2, d); camera.lookAt(0, 0.2, 0);
    renderer.render(scene, camera); dirty = false; frames++;
  }
  raf = requestAnimationFrame(frame);
  return {
    set(f) { let ch = false; for (const k of keys) { const r = threadRadius(f && f[k]); if (Math.abs(r - radii[k]) > 1e-4) { radii[k] = r; ch = true; } } if (ch) build(); },
    radii: () => ({ ...radii }), frames: () => frames,
    dispose() { stopped = true; cancelAnimationFrame(raf); try { for (const k of keys) meshes[k].geometry.dispose(); renderer.dispose(); } catch (_) { /* gone */ } },
  };
}
