// Jarvis home backdrop (jarvis/backdrop.js, 2026-11-03; docs/OLYMPUS_RENDER.md): the 3D space behind the home screen, on the
// OLYMPUS render core. AGORA mood since 2026-11-09 (docs/DESIGN_AGORA.md): a dawn / dusk sky (indigo to amber), warm clouds and gold
// dust, the temple of OLYMPUS on the horizon (marble columns, gold capitals, fading into a warm haze), a dark polished floor that reflects
// the sky, a warm light shaft where the core floats and one faint gold halo in the sky. No neon grid, no glass shards, bloom <= 0.25. It replaces the flat 2D layers of .bgfx (stars canvas, SVG globe, CSS floor) once its first frame is drawn;
// without WebGL or the render core, those stay exactly as they were.
//   self-mounting: <script type="module" src="./backdrop.js"></script>; window.__jarvisBackdrop = its state (tests)
// 2026-11-04: once its scene is built it hands the scene (the `ext` object below: three, the materials, the composer, the camera, the
// parts, a per-frame hook list) to ./home3d.js, which adds the sky by the New York clock, light shafts, the mirrored floor, weather
// from the VIX, the reactive core, the parallax and the constellation lines. It adds objects to THIS scene and THIS composer only;
// without that file (or if it throws) the backdrop is exactly what it was.
// Follows html[data-fx] (ultra / high / low / off: off = one still frame), the theme colours (--c / --c2 / --c3) and the
// home screen: no frame while an app is open, the tab is hidden or the page is not in Jarvis mode. 30 fps (it is a backdrop),
// pixel ratio <= 1.25 (soft by design), so the core in front keeps the GPU.

const root = document.documentElement;
const state = (window.__jarvisBackdrop = { state: 'loading', frames: 0, quality: '', passes: 0, error: '' });
const FPS = 30, STYLE_ID = 'jbackdrop-css';
const CSS = `
.bgfx canvas.jbackdrop { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .9s ease; }
html[data-bg3d="on"] .bgfx canvas.jbackdrop { opacity: 1; }
html[data-bg3d="on"] .bgfx #stars, html[data-bg3d="on"] .bgfx .bgglobe, html[data-bg3d="on"] .bgfx .floor { display: none; }
html[data-bg3d="on"] .bgfx::before, html[data-bg3d="on"] .bgfx::after { display: none; }
`;

function cssVar(name, fallback) {
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
}
const colours = () => ({ c: cssVar('--c', '#c8a24a'), c2: cssVar('--c2', '#9c6b3c'), c3: cssVar('--c3', '#e0b060') });
const level = () => (['ultra', 'high', 'low', 'off'].indexOf(root.dataset.fx) >= 0 ? root.dataset.fx : 'high');
// the home screen is up and the backdrop layer is shown (the shell hides .bgfx outside Jarvis mode)
const onHome = () => { const h = document.getElementById('home'), b = document.querySelector('.bgfx'); return !!h && !h.hidden && !!b && b.getClientRects().length > 0; };

// a phone: wait for 2.5 s without a touch, a key or a scroll (then an idle slice); checked again before each heavy step
function quiet() {
  return new Promise((ok) => {
    const chk = () => {
      const w = Math.max(QUIET_MS - (Date.now() - lastInput), 6000 - performance.now());   // a phone: never in the first 6 s (the first taps)
      if (phoneNow() && w > 0) { setTimeout(chk, w + 50); return; }
      if (window.requestIdleCallback) requestIdleCallback(() => (phoneNow() && Date.now() - lastInput < QUIET_MS ? chk() : ok()), { timeout: 2000 }); else setTimeout(ok, 30);
    };
    chk();
  });
}
async function mount() {
  await quiet();
  const host = document.querySelector('.bgfx');
  if (!host) { state.state = 'off'; return; }
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) { state.state = 'off'; return; }     // no WebGL2: the 2D layers stay
  const [T, RC, M] = await Promise.all([import('./three.module.min.js'), import('../olympus/render.js'), import('../olympus/materials.js')]);
  await quiet();                                                     // the module parse and the scene build in separate tasks (a tap in between wins)
  const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; document.head.appendChild(style);
  probe.className = 'jbackdrop'; probe.setAttribute('aria-hidden', 'true');
  host.insertBefore(probe, host.firstChild);

  const scene = new T.Scene(), camera = new T.PerspectiveCamera(58, 1, 0.1, 400);
  camera.position.set(0, 1.5, 10); camera.lookAt(0, 1.6, 0);
  const fog = new T.FogExp2(0x2a2118, 0.03); scene.fog = fog;      // a warm umber haze: far things fade into colour, not black
  const K = colours();
  const rc = RC.createRenderer({ canvas: probe, scene, camera, quality: level(), env: 'night', tint: K.c, maxDpr: 1.25, msaa: false, adapt: false, exposure: 0.85,
    theme: null, bloom: { strength: 0.22, radius: 0.6, threshold: 0.9 }, grade: { vignette: 0.35, grain: 0.015, aberration: 0 } });
  await quiet();                                                     // the renderer + its environment, then the scene: separate tasks

  // sky: nebula + stars (both added light, no fog)
  const nebula = M.nebula({ colors: [K.c, K.c2, K.c3, '#4b3a52'], count: 10, radius: 70, size: 85, opacity: 0.10 }); nebula.position.y = 12; scene.add(nebula);
  const stars = M.starfield({ count: level() === 'ultra' ? 900 : level() === 'high' ? 600 : 300, radius: 160, size: 2.0, color: '#f0dcae' }); scene.add(stars);

  // the floor: polished obsidian (env reflections), a neon grid fading into the fog, a pool of light under the core
  const floor = new T.Mesh(new T.PlaneGeometry(400, 400), M.metal({ kind: 'gunmetal', color: '#1a1511', roughness: 0.34, clearcoat: 1, envMapIntensity: 0.45 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.6; scene.add(floor);
  const gridU = { uC: { value: new T.Color(K.c).multiplyScalar(1.6) }, uT: { value: 0 } };
  const grid = new T.Mesh(new T.PlaneGeometry(400, 400), new T.ShaderMaterial({ uniforms: gridU, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, extensions: { derivatives: true },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uC; uniform float uT; varying vec3 vW;
      void main(){ vec2 p = vW.xz / 2.4 + vec2(0.0, uT * 0.35); vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        float l = 1.0 - min(min(g.x, g.y), 1.0); float d = length(vW.xz);
        gl_FragColor = vec4(uC * l * 0.55 * exp(-d * 0.045) * smoothstep(1.5, 5.0, d), 1.0); }` }));
  grid.rotation.x = -Math.PI / 2; grid.position.y = -2.59; grid.visible = false; scene.add(grid);       // AGORA: no neon grid (kept as an object for home3d.js)
  const pool = new T.Mesh(new T.CircleGeometry(16, 64), new T.ShaderMaterial({ uniforms: { uC: { value: new T.Color(K.c3).multiplyScalar(1.2) } },
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uC; varying vec2 vU; void main(){ float d = length(vU - 0.5) * 2.0; gl_FragColor = vec4(uC * pow(max(0.0, 1.0 - d), 2.6), 1.0); }' }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, -2.58, -30); scene.add(pool);   // far out: on screen it lies just under the core

  // the light shaft from above, two halo rings in the sky, a horizon ring
  const shaft = M.energyBeam({ color: K.c3, length: 40, radius: 5, taper: 0.3, intensity: 0.12, speed: 0.25 }); shaft.position.set(0, -2.6, -30); scene.add(shaft);
  const haloMat = (c, o) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, fog: true, depthWrite: false });
  const ringA = new T.Mesh(new T.TorusGeometry(9, 0.03, 8, 220), haloMat(K.c, 0.3));
  ringA.position.set(0, 7.5, -14); ringA.rotation.set(1.25, 0, 0.12); scene.add(ringA);
  const ringB = new T.Mesh(new T.TorusGeometry(12.5, 0.02, 8, 260), haloMat(K.c3, 0.2)); ringB.visible = false;
  ringB.position.set(0, 7.5, -14); ringB.rotation.set(1.4, 0.2, -0.3); scene.add(ringB);
  const horizon = new T.Mesh(new T.TorusGeometry(40, 0.08, 8, 320), haloMat(K.c2, 0.18)); horizon.visible = false;
  horizon.rotation.x = Math.PI / 2; horizon.position.y = -2.55; scene.add(horizon);

  // the temple of OLYMPUS on the horizon: an arc of polished marble columns with gold capitals, fading into the fog
  const N = 14, colGeo = new T.CylinderGeometry(0.55, 0.62, 10, 20, 1), capGeo = new T.BoxGeometry(1.5, 0.35, 1.5);
  const columns = new T.InstancedMesh(colGeo, M.marble({ color: '#efe6d4', vein: '#8a7a60', gold: true, scale: 0.6 }), N);
  const capitals = new T.InstancedMesh(capGeo, M.metal({ kind: 'gold', roughness: 0.25 }), N * 2);
  const at = new T.Object3D();
  for (let i = 0; i < N; i++) {
    const a = Math.PI * (0.12 + 0.76 * i / (N - 1)), x = Math.cos(a) * 30, z = -Math.sin(a) * 30 - 8;
    at.position.set(x, 2.4, z); at.rotation.set(0, 0, 0); at.updateMatrix(); columns.setMatrixAt(i, at.matrix);
    at.position.set(x, 7.55, z); at.updateMatrix(); capitals.setMatrixAt(i * 2, at.matrix);
    at.position.set(x, -2.4, z); at.updateMatrix(); capitals.setMatrixAt(i * 2 + 1, at.matrix);
  }
  scene.add(columns, capitals);
  const moon = new T.DirectionalLight(0xffd9a0, 2.0); moon.position.set(4, 12, 10); scene.add(moon);   // the temple's key light: warm sun, about 3000 K

  // drifting glass shards (env reflections + iridescence: the light catches them as they turn)
  const shardMat = M.glass({ color: '#f0e4c8', rim: K.c3, opacity: 0.22 }), chromeMat = M.metal({ kind: 'chrome' });
  const shards = [];
  for (let i = 0; i < 0; i++) {       // AGORA: no drifting glass shards
    const m = new T.Mesh(new T.OctahedronGeometry(0.22 + (i % 3) * 0.12, 0), i % 3 ? shardMat : chromeMat);
    const a = i / 9 * Math.PI * 2;
    m.position.set(Math.cos(a) * (6 + (i % 4) * 1.5), 0.2 + (i % 5) * 1.2, -7 - Math.sin(a) * 4);
    m.userData.s = 0.2 + (i % 4) * 0.12; m.userData.y = m.position.y;
    scene.add(m); shards.push(m);
  }
  const lamp = new T.PointLight(new T.Color(K.c3), 22, 30, 2); lamp.position.set(0, 2.5, -3); scene.add(lamp);

  // what home3d.js may use (see its header); the per-frame hooks run inside step(), the theme hooks inside theme()
  const ext = { T, M, RC, rc, scene, camera, fog, root, state, nebula, stars, floor, grid, pool, shaft, ringA, ringB, horizon, columns, capitals, shards, lamp, moon,
    colours, level, baseExposure: 0.8, cam: { x: 0, y: 0, lx: 0, ly: 0 }, onStep: [], onTheme: [] };
  state.ext = ext;
  let themeKey = '';
  function theme() {
    const k = colours(), sig = k.c + k.c2 + k.c3;
    if (sig === themeKey) return;                         // the environment is rebuilt only when the colours change
    themeKey = sig;
    gridU.uC.value.set(k.c).multiplyScalar(1.6);
    pool.material.uniforms.uC.value.set(k.c3).multiplyScalar(1.2);
    shaft.material.uniforms.uColor.value.set(k.c3);
    ringA.material.color.set(k.c); ringB.material.color.set(k.c3); horizon.material.color.set(k.c2);
    lamp.color.set(k.c3);
    nebula.children.forEach((s, i) => s.material.color.set([k.c, k.c2, k.c3, '#4b3a52'][i % 4]));
    if (shardMat.userData.rim) shardMat.userData.rim.uRim.value.set(k.c3).multiplyScalar(1.2);
    rc.setTheme({ sky: '#3a2a1c', fog: '#2a2118', emissive: k.c, bloom: k.c3, accent: k.c });
    for (const f of ext.onTheme) { try { f(); } catch (_) { /* an extra never stops the backdrop */ } }
  }
  theme();

  let raf = 0, last = 0, t = 0, drawn = false, scrolling = false, scrollT = 0;
  // revamp 2026-11-20 (owner: "lag"): Battery (low) is a still sky too, not a 30 fps one; a phone draws the sky at 20 fps; while a finger
  // scrolls, the sky holds its last frame (no WebGL frame under the moving, blurred panels) and comes back 250 ms after the scroll stops
  const still = () => level() === 'off' || level() === 'low' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const fpsCap = () => (phone && level() !== 'ultra' ? 20 : FPS);
  document.addEventListener('scroll', () => {
    if (!scrolling) { scrolling = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    clearTimeout(scrollT); scrollT = setTimeout(() => { scrolling = false; kick(); }, 250);
  }, { capture: true, passive: true });
  function step(dt) {
    t += dt;
    nebula.update(t); stars.update(t, rc.renderer.getPixelRatio()); shaft.update(t);
    gridU.uT.value = t;
    ringA.rotation.z += dt * (ringA.userData.spin || 0.05); ringB.rotation.z -= dt * (ringB.userData.spin || 0.03);
    shards.forEach((m, i) => { m.rotation.x += dt * m.userData.s; m.rotation.y += dt * m.userData.s * 0.7; m.position.y = m.userData.y + Math.sin(t * 0.4 + i) * 0.25; });
    camera.position.x = Math.sin(t * 0.05) * 0.6 + ext.cam.x; camera.position.y = 1.5 + ext.cam.y; camera.lookAt(ext.cam.lx, 1.6 + ext.cam.ly, 0);
    for (const f of ext.onStep) { try { f(dt, t); } catch (e) { ext.onStep.length = 0; state.extError = String((e && e.stack) || e); } }       // a broken extra drops out, the backdrop goes on
  }
  function draw() {
    if (!rc.render()) return;
    state.frames++;
    if (!drawn) { drawn = true; root.dataset.bg3d = 'on'; state.state = 'on'; }
  }
  function frame(now) {
    raf = 0;
    if (!live()) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / fpsCap() - 2) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / fpsCap();
    last = now;
    step(dt); draw();
  }
  const live = () => onHome() && !document.hidden && !still() && !scrolling;
  // an app open over Jarvis (the home is hidden): release the composer's buffers and the environment, not just the loop
  function kick() {
    if (!onHome()) { if (raf) cancelAnimationFrame(raf); raf = 0; rc.suspend(); state.asleep = true; return; }
    if (rc.asleep()) { rc.resume(); state.asleep = false; themeKey = ''; theme(); }
    if (live()) { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } return; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (onHome() && !document.hidden && still()) { step(0); draw(); }      // off / low / reduced motion: one still frame
  }
  // follow the effects level, the theme and the home screen (attributes the shell already sets)
  new MutationObserver(() => {
    const q = level();
    if (q !== rc.quality()) { rc.setQuality(q); state.quality = q; state.passes = rc.stats().passes; }
    theme(); kick();
  }).observe(root, { attributes: true, attributeFilter: ['data-fx', 'data-theme', 'data-oly-theme', 'data-mode', 'style'] });
  const home = document.getElementById('home');
  if (home) new MutationObserver(kick).observe(home, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', kick);
  probe.addEventListener('webglcontextlost', (e) => { e.preventDefault(); delete root.dataset.bg3d; state.state = 'lost'; if (raf) cancelAnimationFrame(raf); raf = 0; });
  state.quality = rc.quality(); state.passes = rc.stats().passes; state.stats = () => rc.stats();
  kick();
  // the living home's objects compile in the background (perf v2: rc.warm()) instead of holding the home on their first frame
  import('./home3d.js').then((m) => { m.attach(ext); if (rc.warm) rc.warm(); state.extra = 'on'; kick(); }).catch((e) => { state.extra = 'off'; state.extError = String((e && e.stack) || e); });
}

// once Jarvis has booted (the boot log or the OLYMPUS intro gone) and the page is idle: compiling the shaders and the
// environment takes the main thread for a moment, and that must never hold up the boot screen or the intro
const start = () => {
  // effects off = the flat 2D sky: the 3D scene is never built (day-jarvis 2026-11-20: it was built anyway and drew one still frame,
  // ~2 s of main thread on a phone-speed CPU for nothing)
  if (level() === 'off') { state.state = 'off'; state.why = 'effects off'; return; }
  // a phone: the scene is built only after 2.5 s without a touch, a key or a scroll, so a first tap is never stuck behind the
  // shader compile (the owner's first taps: the business chips, the mic)
  mount().catch((e) => { state.state = 'off'; state.error = String((e && (e.stack || e.message)) || e); delete root.dataset.bg3d; });
};
const QUIET_MS = 2500;
let lastInput = Date.now();
const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const phoneNow = () => COARSE && Math.min(innerWidth, innerHeight) < 600;
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchmove']) window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
const booted = () => !document.getElementById('bootfx') && (!window.__olyIntro || window.__olyIntro.done);
const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 600));
let waited = 0;
const whenBooted = () => { if (booted() || (waited += 250) > 15000) setTimeout(idle, 400); else setTimeout(whenBooted, 250); };
if (document.readyState === 'complete') whenBooted(); else window.addEventListener('load', whenBooted, { once: true });
