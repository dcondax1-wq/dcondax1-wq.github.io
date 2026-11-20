/* AGENCY demo sites: the shared 3D stage (tools/web_public/agency/demos/stage.js, day-web-demos 2026-11-20).
 * Each demo's scene.js (loaded by ../../../olympus/lazy3d.js AFTER the page has drawn and the phone is idle) calls
 *   mountStage({ host: '#stage', build(api) { ... }, view: { yaw, pitch, dist, target: [x,y,z] }, auto: true })
 * and gets api = { THREE, scene, camera, renderer, view, flyTo(view, ms), dirty(), onFrame(fn) }.
 * The page never waits for it: the stage box keeps its drawn 2D picture (SVG) at a fixed aspect ratio, the canvas fades in on top
 * when the first frame is drawn (no layout jump), and a phone without WebGL / a lost context just keeps the picture.
 * Touch: a sideways drag turns the model, an up-down swipe still scrolls the page (touch-action: pan-y). Reduced motion: no auto-turn,
 * no camera flights (cuts). Renders only while the stage is on screen and the tab is visible. All geometry is made here in code
 * (no downloaded models), three.js r160 (MIT) from ../../../jarvis/.
 */
import * as THREE from '../../../jarvis/three.module.min.js';
export { THREE };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function mountStage(o) {
  const host = document.querySelector(o.host || '#stage');
  if (!host || host.dataset.three === 'on') return null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (e) { host.dataset.three = 'fail'; return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure || 1;
  if (o.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const cv = renderer.domElement;
  cv.className = 'stage-gl'; cv.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov || 35, 1, 0.05, 200);
  const v0 = o.view || {};
  // mode 'orbit': the camera circles target at dist; mode 'eye': the camera stands AT target and looks out along yaw / pitch (a walk-through)
  const view = { mode: v0.mode || 'orbit', yaw: v0.yaw ?? .6, pitch: v0.pitch ?? .3, dist: v0.dist ?? 6,
    target: new THREE.Vector3().fromArray(v0.target || [0, .5, 0]), minPitch: v0.minPitch ?? .05, maxPitch: v0.maxPitch ?? 1.2 };
  let auto = !reduce && o.auto !== false, autoAt = 0, need = true, fly = null, frames = [];
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  function solve(vw, p, l) {
    const cp = Math.cos(vw.pitch), dir = new THREE.Vector3(Math.sin(vw.yaw) * cp, Math.sin(vw.pitch), Math.cos(vw.yaw) * cp);
    if (vw.mode === 'eye') { p.copy(vw.target); l.copy(vw.target).sub(dir); }
    else { l.copy(vw.target); p.copy(vw.target).addScaledVector(dir, vw.dist); }
  }
  function place() { solve(view, pos, look); camera.position.copy(pos); camera.lookAt(look); }

  const api = {
    THREE, scene, camera, renderer, view, host, reduce,
    dirty() { need = true; },
    onFrame(fn) { frames.push(fn); },
    setAuto(on) { auto = !reduce && !!on; need = true; },
    flyTo(to, ms = 1100) {             // to = { mode, yaw, pitch, dist, target: [x,y,z] }
      const dest = Object.assign({}, view, to, { target: to.target ? new THREE.Vector3().fromArray(to.target) : view.target.clone() });
      const p1 = new THREE.Vector3(), l1 = new THREE.Vector3(); solve(dest, p1, l1);
      if (reduce || ms <= 0) { Object.assign(view, dest); need = true; return; }
      fly = { t0: performance.now(), ms, p0: camera.position.clone(), l0: look.clone(), p1, l1, dest };
      need = true;
    },
  };

  // drag to turn (pointer events; vertical page scroll stays with the browser on touch)
  let drag = null;
  cv.style.touchAction = 'pan-y';
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch }; auto = false; fly = null; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* old browser */ } });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const k = view.mode === 'eye' ? -1 : 1;
    view.yaw = drag.yaw - k * (e.clientX - drag.x) * .008;
    if (e.pointerType === 'mouse') view.pitch = clamp(drag.pitch + k * (e.clientY - drag.y) * .006, view.minPitch, view.maxPitch);
    need = true;
  });
  const up = () => { if (drag) { drag = null; autoAt = performance.now() + 5000; } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  // size: the host box has a fixed aspect ratio; the canvas fills it
  const size = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); need = true;
  };
  if (window.ResizeObserver) new ResizeObserver(size).observe(host); else window.addEventListener('resize', size);

  // only while on screen and visible
  let onScreen = true;
  if (window.IntersectionObserver) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; if (onScreen) kick(); }).observe(host);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); host.dataset.three = 'lost'; host.classList.remove('gl-on'); });

  let last = performance.now(), running = false;
  function tick(now) {
    running = false;
    if (!onScreen || document.hidden) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!auto && autoAt && now > autoAt && !reduce && o.auto !== false) { auto = true; autoAt = 0; }
    if (auto && !fly && view.mode === 'orbit') { view.yaw += dt * (o.spin || .25); need = true; }
    let busy = false;
    for (const f of frames) if (f(dt, now) === true) busy = true;
    if (fly) {
      const t = clamp((now - fly.t0) / fly.ms, 0, 1), k = ease(t);
      camera.position.lerpVectors(fly.p0, fly.p1, k); look.lerpVectors(fly.l0, fly.l1, k); camera.lookAt(look);
      if (t >= 1) { Object.assign(view, fly.dest); fly = null; place(); }
      busy = true;
    } else if (need) place();
    if (need || busy) { renderer.render(scene, camera); need = false; }
    if (auto || busy || drag || fly) kick();
  }
  function kick() { need = true; if (!running) { running = true; requestAnimationFrame(tick); } }
  api.kick = kick;

  o.build(api);
  host.appendChild(cv);
  size(); place(); renderer.render(scene, camera);
  requestAnimationFrame(() => { host.classList.add('gl-on'); host.dataset.three = 'on'; kick(); });
  window.DEMO3D = api;
  try { window.dispatchEvent(new Event('demo3d')); } catch (e) { /* old browser */ }
  return api;
}

/* small helpers the scenes share */
export function lights(api, { hemi = .7, key = 2.2, keyPos = [4, 7, 5], shadow = false } = {}) {
  const { THREE, scene } = api;
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x30261c, hemi));
  const d = new THREE.DirectionalLight(0xffffff, key); d.position.fromArray(keyPos);
  if (shadow) { d.castShadow = true; d.shadow.mapSize.set(1024, 1024); const c = d.shadow.camera; c.left = c.bottom = -6; c.right = c.top = 6; c.near = .5; c.far = 30; d.shadow.bias = -.0005; }
  scene.add(d);
  return d;
}
export function roundedBox(THREE, w, h, d, r = .1, seg = 3) {
  // a box with rounded vertical edges: an extruded rounded rectangle (r160 core only, no addon)
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: r * .6, bevelSize: r * .6, bevelSegments: seg, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0); g.computeVertexNormals();
  return g;
}
