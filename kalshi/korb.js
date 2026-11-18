// Kalshi page: the 3D header (tools/web_public/kalshi/korb.js, 2026-11-03). A slowly turning market orb in the K mark: a
// glass shell of mint lines, the Kalshi K floating inside, a ring of points = the open bets (mint YES / UP, rose NO / DOWN),
// and a pulse when new numbers arrive. Light and cheap: one small canvas (about 90 px), at most 30 frames a second, none while
// the tab is hidden or the header is off screen; Jarvis's 3D effects 'off' or reduced motion = one still frame.
// three.js is the site's one copy (../jarvis/three.module.min.js). No WebGL, or the file missing: the SVG K stays, silently.
// It listens to kalshi.js's 'kalshi:data' event ({ bets: [{ side: 'yes'|'no' }], state }) and KFX's 'kalshi:theme'.

const host = document.querySelector('.mark');
const fx = () => { try { return localStorage.getItem('jfx'); } catch (_) { return null; } };
const still = () => fx() === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

async function boot() {
  if (!host || fx() === 'off') return;                    // effects off: the flat K mark, no WebGL at all
  let T;
  try { T = await import('../jarvis/three.module.min.js'); } catch (_) { return; }
  const canvas = document.createElement('canvas');
  canvas.className = 'orb';
  canvas.setAttribute('aria-hidden', 'true');
  let RC;
  try { RC = await import('../olympus/render.js'); } catch (_) { return; }     // the OLYMPUS render core: ACES, a studio environment, bloom, MSAA
  const css = getComputedStyle(document.documentElement);
  const col = (name, dflt) => { const v = css.getPropertyValue(name).trim(); return /^#[0-9a-f]{3,6}$/i.test(v) ? v : dflt; };
  const C = { a: new T.Color(col('--c', '#7f8a52')), b: new T.Color(col('--cy', '#4b7a99')), yes: new T.Color('#4ade80'), no: new T.Color('#ff4d6d') };

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(32, 1, 0.1, 20);
  let rc, renderer;
  cam.position.set(0, 0.35, 5.2);
  cam.lookAt(0, 0, 0);
  const orb = new T.Group();
  scene.add(orb);

  // the shell: an icosphere's edges, and a second, finer one turning the other way
  const shellMat = new T.LineBasicMaterial({ color: C.a, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
  const shell = new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(1.32, 1)), shellMat);
  const innerMat = new T.LineBasicMaterial({ color: C.b, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false });
  const inner = new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(1.05, 0)), innerMat);
  orb.add(shell, inner);

  // the glow: a soft sprite behind everything
  const g = document.createElement('canvas');
  g.width = g.height = 64;
  const gx = g.getContext('2d'), grd = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  gx.fillStyle = grd; gx.fillRect(0, 0, 64, 64);
  const glowTex = new T.CanvasTexture(g);
  const glowMat = new T.SpriteMaterial({ map: glowTex, color: C.a, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
  const glow = new T.Sprite(glowMat);
  glow.scale.set(3.6, 3.6, 1);
  scene.add(glow);

  // the K: three bars, extruded, lit from the front
  const k = new T.Group();
  const kMat = new T.MeshPhysicalMaterial({ color: '#ffffff', emissive: C.a, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.18, clearcoat: 1, envMapIntensity: 1.2 });
  const bar = (w, h, x, y, rot) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, 0.22), kMat);
    m.position.set(x, y, 0);
    m.rotation.z = rot;
    k.add(m);
  };
  bar(0.2, 1.3, -0.3, 0, 0);
  bar(0.2, 0.78, 0.07, 0.3, -0.83);
  bar(0.2, 0.82, 0.09, -0.29, 0.83);
  orb.add(k);
  scene.add(new T.AmbientLight('#ffffff', 0.6));
  const key = new T.DirectionalLight('#ffffff', 1.6);
  key.position.set(2, 3, 4);
  scene.add(key);

  // the open bets: points on a tilted ring
  const MAXB = 24, ringGeo = new T.BufferGeometry();
  const pos = new Float32Array(MAXB * 3), colr = new Float32Array(MAXB * 3);
  ringGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
  ringGeo.setAttribute('color', new T.BufferAttribute(colr, 3));
  ringGeo.setDrawRange(0, 0);
  const ring = new T.Points(ringGeo, new T.PointsMaterial({ size: 0.2, map: glowTex, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = 1.15;
  const orbit = new T.Mesh(new T.TorusGeometry(1.62, 0.008, 4, 96), new T.MeshBasicMaterial({ color: C.b, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
  orbit.rotation.x = 1.15;
  scene.add(ring, orbit);

  function setBets(bets) {
    const n = Math.min(MAXB, bets.length);
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2, c = bets[i].side === 'no' ? C.no : C.yes;
      pos.set([Math.cos(a) * 1.62, Math.sin(a) * 1.62, 0], i * 3);
      colr.set([c.r, c.g, c.b], i * 3);
    }
    ringGeo.setDrawRange(0, n);
    ringGeo.attributes.position.needsUpdate = true;
    ringGeo.attributes.color.needsUpdate = true;
  }

  try {
    const q = fx();
    rc = RC.createRenderer({ canvas, scene, camera: cam, alpha: true, env: 'room', quality: ['ultra', 'high', 'low', 'off'].indexOf(q) >= 0 ? q : undefined,
      adapt: false, autoSize: false, fitCamera: false, maxDpr: 2, exposure: 0.9, bloom: { strength: 0.55, radius: 0.5, threshold: 0.8 }, grade: { vignette: 0, grain: 0, aberration: 0 } });
    renderer = rc.renderer;
  } catch (_) { return; }
  // size: the canvas overflows the mark so the glow bleeds out; the buffer follows the CSS size (pixel ratio at most 2)
  const size = () => {
    const s = Math.max(40, Math.round(canvas.getBoundingClientRect().width || host.clientWidth * 1.7 || 80));
    rc.resize(s, s);
    cam.aspect = 1;
    cam.updateProjectionMatrix();
  };
  host.appendChild(canvas);
  host.classList.add('gl');
  size();

  let pulse = 0, on = true, last = 0, t0 = performance.now(), raf = 0;
  const draw = (now) => {
    const t = (now - t0) / 1000;
    orb.rotation.y = t * 0.45;
    orb.rotation.x = Math.sin(t * 0.3) * 0.18;
    inner.rotation.y = -t * 0.7;
    k.rotation.y = -t * 0.45 + Math.sin(t * 0.8) * 0.35;      // the K keeps facing the front, swaying
    ring.rotation.z = t * 0.25;
    pulse = Math.max(0, pulse - 0.02);
    glowMat.opacity = 0.42 + 0.12 * Math.sin(t * 1.6) + pulse * 0.5;
    shellMat.opacity = 0.5 + pulse * 0.45;
    const s = 1 + pulse * 0.12;
    orb.scale.set(s, s, s);
    rc.render();
  };
  const loop = (now) => {
    raf = 0;
    if (!on || document.hidden) return;
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;                              // 30 fps is plenty for a slow turn
    last = now;
    draw(now);
  };
  const go = () => { if (still()) { draw(performance.now()); return; } if (!raf && on && !document.hidden) raf = requestAnimationFrame(loop); };
  go();
  document.addEventListener('visibilitychange', go);
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { on = es[0].isIntersecting; go(); }).observe(host);
  addEventListener('resize', () => { size(); if (still()) draw(performance.now()); });
  document.addEventListener('kalshi:data', (e) => {
    const dt = e.detail || {};
    setBets(Array.isArray(dt.bets) ? dt.bets : []);
    if (dt.fresh) pulse = 1;
    if (still()) draw(performance.now());
  });
  document.addEventListener('kalshi:theme', (e) => {
    const t = e.detail || {};
    C.a.set(t.accent || col('--c', '#7f8a52'));
    C.b.set(t.accent2 || col('--cy', '#4b7a99'));
    shellMat.color.copy(C.a); glowMat.color.copy(C.a); kMat.emissive.copy(C.a); innerMat.color.copy(C.b); orbit.material.color.copy(C.b);
    draw(performance.now());
  });
  if (window.__kalshiData) setBets(window.__kalshiData.bets || []);
  window.KalshiOrb = { renderer, draw: () => draw(performance.now()) };
}

// Started once the page has drawn its numbers (the first 'kalshi:data'), when the main thread is idle: the WebGL context and its
// shaders never delay the first paint. 4 s at the latest (a page still loading its feed gets its orb anyway).
let started = false;
const start = () => {
  if (started) return;
  started = true;
  const go = () => boot().catch(() => { /* the flat K mark stays */ });
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1200 }); else setTimeout(go, 200);
};
document.addEventListener('kalshi:data', (e) => { if (e.detail && e.detail.shown) start(); });
if (window.__kalshiData && window.__kalshiData.shown) start();
setTimeout(start, 4000);
