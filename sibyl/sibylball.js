// SIBYL's marble ball (three.js r160 from ../jarvis/, the OLYMPUS render core): a polished marble sphere on a small bronze amphora-style base, ringed by floating gold odds tokens
// (one per ranked pick; the token shows the break-even price in cents, bigger = higher score). Light by design: one sphere, a lathe base, up to 8 tokens, bloom <= .25, a dpr cap.
// Tap a token to pick that row. If WebGL or the render core is not there, the caller shows the 2D fallback. Text is drawn on small canvases only (no markup from data).
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { marble, metal } from '../olympus/materials.js';
import { tokenLayout } from './sibylcore.js';
import { dress } from '../olympus/hero-stage.js';
// QA Round 6 bug 8: the oracle's hall at night (painted sky, the env-kit HDRI for reflections on the marble ball and gold tokens, a mosaic floor) via olympus/hero-stage.js dress.

const GOLD = '#c8a24a', BRONZE = '#9c6b3c', TERRA = '#c96a4a', OLIVE = '#7f8a52';

function tokenTexture(text, ring) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d6b45c'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = ring; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#2b2012'; g.font = '700 38px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function createBall(canvas, items, opts) {
  const o = opts || {}, O = window.OLYMPUS || null, RM = o.reduced === true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a140e');
  const camera = new THREE.PerspectiveCamera(38, 1.4, 0.1, 40);
  camera.position.set(0, 0.35, 6.2); camera.lookAt(0, 0.05, 0);
  const rc = createRenderer({ canvas, scene, camera, maxDpr: 1.5, tint: GOLD, theme: { sky: '#2b2018', fog: '#2a2018', emissive: GOLD, bloom: '#e0b060', accent: GOLD }, bloom: { strength: 0.2, radius: 0.4, threshold: 1.0 } });
  const lite = rc.quality() === 'low' || rc.quality() === 'off';

  // warm light, 3000 K feel: a low sun, a soft hemisphere
  const D = dress({ rc, scene, camera, palette: 'night', hdri: 'dusk', envI: 1.0, sunDir: [-0.55, 0.6, 0.6], key: 2.2, hemi: 0.7, rim: 1.0, shadows: false, metalEnv: 1.8, sky: { sunX: 0.8, sunY: 0.3, templeX: 0.2, horizon: 0.78 }, fogNear: 10, fogFar: 26 });
  if (!lite) { const warm = new THREE.PointLight(0xe0a060, 12, 14, 1.4); warm.position.set(2.5, 1.2, 3); scene.add(warm); }

  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, lite ? 36 : 64, lite ? 24 : 40), marble({ color: '#e8e1d2', vein: '#6d6252', roughness: 0.22, clearcoat: 0.8 }));
  ball.position.y = 0.55; scene.add(ball);
  const bronze = metal({ kind: 'gold', color: BRONZE });
  const profile = [[0.0, 0], [0.62, 0], [0.7, 0.06], [0.52, 0.2], [0.34, 0.42], [0.3, 0.62], [0.46, 0.78], [0.78, 0.9], [0.86, 0.96], [0.0, 0.96]].map(([x, y]) => new THREE.Vector2(x, y));
  const base = new THREE.Mesh(new THREE.LatheGeometry(profile, lite ? 20 : 36), bronze); base.position.y = -1.15; scene.add(base);   // an amphora-shaped cradle
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.018, 8, lite ? 48 : 96), metal({ kind: 'gold' })); band.position.y = 0.55; band.rotation.x = Math.PI / 2 - 0.35; scene.add(band);   // a thin gold ring

  const lay = tokenLayout(items, 8), toks = [];
  const side = new THREE.MeshStandardMaterial({ color: '#b08a36', roughness: 0.4, metalness: 0.8 });
  const geo = new THREE.CylinderGeometry(1, 1, 0.14, 32);
  for (const L of lay) {
    const ring = L.tier === 'worthy' ? OLIVE : L.tier === 'avoid' ? TERRA : BRONZE;
    const face = new THREE.MeshStandardMaterial({ map: tokenTexture(L.label, ring), roughness: 0.45, metalness: 0.5 });
    const mesh = new THREE.Mesh(geo, [side, face, side]); mesh.rotation.x = Math.PI / 2;
    const grp = new THREE.Group(); grp.add(mesh); grp.scale.setScalar(L.size * 2.2); grp.userData = { i: L.i, L, base: L.size * 2.2 };
    scene.add(grp); toks.push(grp);
  }

  let sel = -1, yaw = 0, t = 0, dirty = true, disposed = false;
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function place() {
    for (const g of toks) {
      const L = g.userData.L, a = L.phase + t * L.speed;
      g.position.set(Math.cos(a) * L.radius, 0.55 + Math.sin(a) * L.radius * Math.sin(L.tilt) + Math.sin(t * 0.8 + L.phase) * 0.04, Math.sin(a) * L.radius * Math.cos(L.tilt));
      g.lookAt(camera.position);
      const want = g.userData.base * (g.userData.i === sel ? 1.35 : 1); g.scale.setScalar(g.scale.x + (want - g.scale.x) * 0.25);
    }
  }
  function resize() { const w = canvas.clientWidth || 320, h = canvas.clientHeight || 220; camera.aspect = w / h; camera.updateProjectionMatrix(); rc.resize(w, h); D.backdrop(w, h); dirty = true; }
  D.tune(); D.envReady.then(() => { dirty = true; });
  window.__heroStats = () => Object.assign(D.stats(), { calls: rc.renderer.info.render.calls });
  function pick(ev) {
    const r = canvas.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1)); ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(toks, true)[0]; if (!hit) return;
    let g = hit.object; while (g && !(g.userData && g.userData.L)) g = g.parent;
    if (g && o.onPick) o.onPick(g.userData.i);
  }
  canvas.addEventListener('pointerup', pick);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; if (ro) ro.observe(canvas);
  resize(); place();

  let last = performance.now(), lastTick = 0;
  function loop(now) {
    if (disposed) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    const gap = O && O.frameGap ? O.frameGap() : 0;
    if ((O ? O.hidden() : document.hidden) || (gap && now - lastTick < gap - 3)) return;
    lastTick = now;
    if (!RM) { t += dt; yaw += dt * 0.12; ball.rotation.y = yaw; dirty = true; }
    place(); if (dirty) { rc.render(); dirty = RM ? toks.some((g) => Math.abs(g.scale.x - g.userData.base * (g.userData.i === sel ? 1.35 : 1)) > 0.002) : true; }
  }
  requestAnimationFrame(loop);

  return {
    lite, count: toks.length, quality: () => rc.quality(), passes: () => rc.passes(),
    select(i) { sel = i; dirty = true; }, get selected() { return sel; },
    screenOf(i) { const g = toks.find((x) => x.userData.i === i); if (!g) return null; const v = g.position.clone().project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, front: v.z < 1 }; },
    stats: () => D.stats(),
    dispose() { disposed = true; canvas.removeEventListener('pointerup', pick); if (ro) ro.disconnect(); try { D.dispose(); rc.dispose(); } catch (_) { /* gone */ } },
  };
}
window.SIBYL_BALL = { createBall };   // read by sibyl.js (a second module tag, so a failed 3D load never stops the page)
