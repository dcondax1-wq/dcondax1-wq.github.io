// Jarvis home, deeper (2026-11-04): what turns the OLYMPUS backdrop (backdrop.js) into a living world. Loaded by backdrop.js once its
// scene is up; it adds to THAT scene and THAT one composer, never a renderer, a composer or a render target of its own (the GPU
// guard in docs/OLYMPUS_RENDER.md and tests/test_olympus_render.py test_gpu stays true).
//
//   sky       a dome whose colours follow the New York clock and the market: night, pre-market dawn (4:00-9:30), the open, the close
//             and dusk (15:30-18:00), the evening; a sun and a moon crossing the sky behind the temple; the stars fade by day
//   light     volumetric shafts that fan from the sun / moon (strongest at dawn and dusk) and dust motes drifting in them
//   floor     the obsidian floor is now glass over a mirrored temple, rings, shards and sun: a real reflection with no extra render pass
//   weather   from the VIX (live.json lit.vix): clear under 14, haze, rain 22+, storm with lightning 28+, severe 35+. No feed = clear
//   reactor   the core's state and voice move the world: the light under it, the beams and the rings pulse with her voice, the colour
//             follows the state (red listening, amber thinking) and the mode (trading / research / business / life), a shockwave per word
//   parallax  the camera leans with the phone (DeviceOrientation, when the owner turned Tilt on and iOS allowed it) or the mouse
//   stars     animated constellation lines from the core to its orbs (the systems), pulses faster when an orb needs attention, with
//             a live status badge on every orb (a check, a dot or an !)
// The pure functions (skyFor, weatherFor, findVix, modeTint, reactFor) run in node (tests/test_jarvis_home.py). LITE (data-fx low):
// 3 shafts, no motes, no rain, a still constellation. Off / reduced motion: one still frame (the backdrop's rule).
// iPhone Safari 16: plain ES2020, no regex lookbehind, no optional chaining.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mixN = (a, b, t) => a + (b - a) * t;
const hex = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const mix3 = (a, b, t) => [mixN(a[0], b[0], t), mixN(a[1], b[1], t), mixN(a[2], b[2], t)];

// ------------------------------------------------------------------------------------------------ the sky by the New York clock
// [ET minute, zenith, horizon, glow, stars 0..1, nebula 0..1, exposure]
const KF = [
  [0, '#0d0b12', '#241a1c', '#7a4a2a', 1.0, 0.5, 1.0],
  [240, '#0e0c16', '#2a1e20', '#8a5230', 1.0, 0.5, 1.0],
  [330, '#332a21', '#6b4a52', '#e0a060', 0.5, 0.45, 1.0],     // pre-dawn: indigo to amber
  [390, '#584839', '#c8845e', '#f0b870', 0.2, 0.35, 1.02],    // dawn, 6:30
  [480, '#826a53', '#e8b890', '#ffd9a0', 0.05, 0.3, 1.05],    // pre-market morning, 8:00
  [570, '#836c54', '#a6bcc8', '#ffe7b8', 0.02, 0.25, 1.05],   // the open, 9:30
  [720, '#8b7259', '#a3bccb', '#fff0cc', 0.02, 0.2, 1.05],    // midday
  [900, '#7e6750', '#b3b3b0', '#ffe2a8', 0.02, 0.25, 1.05],   // afternoon
  [960, '#6d5945', '#d29a70', '#ffbe70', 0.1, 0.3, 1.03],     // the close, 16:00
  [1050, '#4f4133', '#c27a62', '#f09a58', 0.25, 0.4, 1.0],    // dusk, 17:30
  [1110, '#332a21', '#6a4458', '#d08a5a', 0.5, 0.45, 1.0],    // 18:30, the Globex evening
  [1200, '#100e1c', '#2a1e24', '#8a5230', 0.9, 0.5, 1.0],
  [1440, '#0d0b12', '#241a1c', '#7a4a2a', 1.0, 0.5, 1.0],
].map((k) => ({ m: k[0], z: hex(k[1]), h: hex(k[2]), g: hex(k[3]), stars: k[4], neb: k[5], ex: k[6] }));
export const PHASES = [[0, 'night', 'Night'], [240, 'predawn', 'Pre-dawn'], [390, 'premarket', 'Pre-market'], [570, 'open', 'Market open'], [930, 'close', 'The close'], [1050, 'dusk', 'Dusk'], [1110, 'evening', 'Evening'], [1260, 'night', 'Night']];
export function phaseOf(min) {
  let p = PHASES[0];
  for (const x of PHASES) if (min >= x[0]) p = x;
  return { phase: p[1], label: p[2] };
}
// minute: the ET minute of the day; weekend: Sat / Sun; open: the market is open now. Always returns every field.
export function skyFor(min, weekend, open) {
  const m = ((min % 1440) + 1440) % 1440;
  let a = KF[0], b = KF[1];
  for (let i = 0; i < KF.length - 1; i++) if (m >= KF[i].m && m <= KF[i + 1].m) { a = KF[i]; b = KF[i + 1]; break; }
  const t = b.m === a.m ? 0 : (m - a.m) / (b.m - a.m);
  const day = clamp(Math.sin(Math.PI * clamp((m - 390) / 660, 0, 1)), 0, 1);       // 0 at night, 1 at midday
  const dim = weekend ? 0.8 : 1;                                                    // the weekend: calmer
  const sky = {
    zenith: mix3(a.z, b.z, t), horizon: mix3(a.h, b.h, t), glow: mix3(a.g, b.g, t),
    stars: mixN(a.stars, b.stars, t), nebula: mixN(a.neb, b.neb, t), exposure: mixN(a.ex, b.ex, t) * dim, day,
    sunUp: m >= 390 && m <= 1050, ...phaseOf(m),
  };
  // the sun crosses from the east (left) at 6:30 to the west at 17:30; the moon takes the night (17:30 to 6:30)
  const sp = clamp((m - 390) / 660, 0, 1), nm = m >= 1050 ? m - 1050 : m + 390, np = clamp(nm / 780, 0, 1);
  sky.sun = { x: mixN(-1, 1, sp), y: sky.sunUp ? Math.sin(Math.PI * sp) : -0.3, up: sky.sunUp };
  sky.moon = { x: mixN(1, -1, np), y: sky.sunUp ? -0.3 : Math.sin(Math.PI * np), up: !sky.sunUp };
  // the shafts: strongest with a low sun (dawn, dusk), softer at midday, a pale moon-beam at night
  const low = sky.sunUp ? 1 - Math.abs(Math.sin(Math.PI * sp) - 0.18) * 0.9 : 0.3;
  sky.rays = clamp(sky.sunUp ? 0.3 + 0.7 * low : 0.22, 0, 1) * (open ? 1 : 0.85);
  sky.open = !!open; sky.weekend = !!weekend;
  return sky;
}

// ------------------------------------------------------------------------------------------------ weather from the VIX
export function weatherFor(vix) {
  const v = Number.isFinite(+vix) && vix !== null && vix !== '' ? +vix : null;
  if (v == null || v <= 0) return { name: 'clear', label: 'No VIX reading', vix: null, fog: 1, haze: 0, rain: 0, lightning: 0 };
  if (v < 14) return { name: 'clear', label: 'Clear: VIX ' + v.toFixed(1), vix: v, fog: 0.85, haze: 0, rain: 0, lightning: 0 };
  if (v < 18) return { name: 'calm', label: 'Calm: VIX ' + v.toFixed(1), vix: v, fog: 1, haze: 0.1, rain: 0, lightning: 0 };
  if (v < 22) return { name: 'haze', label: 'Haze: VIX ' + v.toFixed(1), vix: v, fog: 1.3, haze: 0.35, rain: 0, lightning: 0 };
  if (v < 28) return { name: 'rain', label: 'Rain: VIX ' + v.toFixed(1), vix: v, fog: 1.6, haze: 0.55, rain: 0.35 + (v - 22) / 6 * 0.2, lightning: 0 };
  if (v < 35) return { name: 'storm', label: 'Storm: VIX ' + v.toFixed(1), vix: v, fog: 1.9, haze: 0.7, rain: 0.7, lightning: 0.4 + (v - 28) / 7 * 0.3 };
  return { name: 'severe', label: 'Severe storm: VIX ' + v.toFixed(1), vix: v, fog: 2.3, haze: 0.85, rain: 1, lightning: 0.9 };
}
// the VIX from whatever the feed carries (live.json "lit" block: engine/lit.py day context), or a plain number; null when absent
export function findVix(f) {
  const ok = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isFinite(+x) && +x > 3 && +x < 150 ? +x : null;
  if (typeof f === 'number') return ok(f);
  const o = f && typeof f === 'object' ? f : {}, lv = o.live && typeof o.live === 'object' ? o.live : {}, raw = lv.raw && typeof lv.raw === 'object' ? lv.raw : {};
  const board = raw.board && typeof raw.board === 'object' ? raw.board : {};
  for (const c of [raw.lit && raw.lit.vix, board.lit && board.lit.vix, lv.lit && lv.lit.vix, raw.vix, lv.vix, o.vix, raw.market && raw.market.vix]) { const v = ok(c); if (v != null) return v; }
  return null;
}

// ------------------------------------------------------------------------------------------------ the reactor: state, voice, mode
export const STATE_TINT = { idle: null, listening: '#c96a4a', thinking: '#e0b060', speaking: null, alert: '#c96a4a' };
export const MODE_TINT = { auto: null, trading: '#8b7259', research: '#9c8f6a', business: '#e0b060', life: '#b8714a' };
export const modeTint = (m) => (Object.prototype.hasOwnProperty.call(MODE_TINT, m) ? MODE_TINT[m] : null);
// the energy 0..1 the world should have now
export function reactFor(state, level) {
  const l = clamp(+level || 0, 0, 1);
  if (state === 'speaking') return clamp(0.3 + 0.7 * l, 0, 1);
  if (state === 'listening') return clamp(0.4 + 0.5 * l, 0, 1);
  if (state === 'thinking') return 0.5;
  if (state === 'alert') return 0.85;
  return 0.06;
}

// ------------------------------------------------------------------------------------------------ the scene (browser only)
export function attach(ext) {
  const { T, M, rc, scene, camera, root } = ext;
  const home = (ext.state.home = { sky: null, weather: weatherFor(null), energy: 0, stateTint: '', modeTint: '', parallax: { x: 0, y: 0, src: '' }, rays: 0, rain: 0, flashes: 0, reflect: 0, constellation: 0, badges: 0, clock: 0 });
  const FLOOR_Y = -2.6;
  // software GL (SwiftShader / llvmpipe: no GPU, the tests, a phone with no hardware GL) gets the LITE extras too: the fill-rate of
  // shafts, a see-through floor and mirrors would be a slideshow there. ?gpu=1 lifts it (the same switch as the render core's)
  const soft = !!(ext.RC && typeof ext.RC.softwareGL === 'function' && ext.RC.softwareGL(rc.renderer.getContext())) && !/[?&]gpu=1/.test(location.search);
  home.soft = soft;
  const lite = () => soft || root.dataset.fx === 'low' || root.dataset.fx === 'off';
  const moving = () => root.dataset.fx !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const col = (h) => new T.Color(h);

  // --- the sky dome (opaque, drawn first, never writes depth)
  const skyU = { uZ: { value: new T.Color() }, uH: { value: new T.Color() }, uG: { value: new T.Color() }, uSun: { value: new T.Vector3(0, 0.3, -1) }, uSunI: { value: 1 }, uFlash: { value: 0 }, uHaze: { value: 0 } };
  const dome = new T.Mesh(new T.SphereGeometry(300, 32, 16), new T.ShaderMaterial({ uniforms: skyU, side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uZ, uH, uG, uSun; uniform float uSunI, uFlash, uHaze; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uH, uZ, pow(h, 0.5));
        c = mix(c, uH * 1.1 + 0.03, uHaze * (1.0 - h));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += uG * (pow(s, 6.0) * 0.28 + pow(s, 48.0) * 0.55) * uSunI;
        c += uG * 0.2 * exp(-abs(d.y) * 7.0) * uSunI;
        c += vec3(0.55, 0.65, 1.0) * uFlash * (0.35 + 0.65 * (1.0 - h));
        gl_FragColor = vec4(c * 0.5, 1.0); }` }));
  dome.renderOrder = -100; dome.frustumCulled = false; scene.add(dome);

  // --- the sun and the moon: soft additive discs behind the temple (and their mirror in the floor)
  const discGeo = new T.PlaneGeometry(1, 1);
  const discMat = (c) => new T.ShaderMaterial({ uniforms: { uC: { value: new T.Color(c) }, uI: { value: 1 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uC; uniform float uI; varying vec2 vU; void main(){ float d = length(vU - 0.5) * 2.0; float core = smoothstep(0.34, 0.26, d); float halo = pow(max(0.0, 1.0 - d), 2.6);\n gl_FragColor = vec4(uC * (core * 1.35 + halo * 0.55) * uI, 1.0); }' });
  const sun = new T.Mesh(discGeo, discMat('#ffe3a8')), moon = new T.Mesh(discGeo, discMat('#efe3c8'));
  const sunR = new T.Mesh(discGeo, sun.material), moonR = new T.Mesh(discGeo, moon.material);   // the reflections share the material
  for (const d of [sun, moon, sunR, moonR]) { d.scale.setScalar(26); d.renderOrder = -50; d.frustumCulled = false; scene.add(d); }
  moon.scale.setScalar(18); moonR.scale.setScalar(18);

  // --- light shafts from the sun / moon, in one plane in front of the temple; dust motes in them
  const shaftN = 7, shafts = [];
  const shaftGeo = new T.PlaneGeometry(1, 1);
  for (let i = 0; i < shaftN; i++) {
    const m = new T.Mesh(shaftGeo, new T.ShaderMaterial({ uniforms: { uC: { value: new T.Color('#ffd9a0') }, uI: { value: 0.12 }, uT: { value: 0 }, uSeed: { value: i * 0.77 } },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uC; uniform float uI, uT, uSeed; varying vec2 vU;
        void main(){ float x = abs(vU.x - 0.5) * 2.0, e = pow(max(0.0, 1.0 - x), 2.0), along = 1.0 - vU.y;
          float fade = smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.5, 1.0, along));
          float fl = 0.72 + 0.28 * sin(uT * 0.35 + uSeed * 6.2832 + along * 3.0) * sin(uT * 0.21 + uSeed * 3.0);
          gl_FragColor = vec4(uC * uI * e * fade * fl, 1.0); }` }));
    m.renderOrder = 6; m.frustumCulled = false; m.userData.i = i; scene.add(m); shafts.push(m);
  }
  const moteN = 150, motePos = new Float32Array(moteN * 3), moteSeed = new Float32Array(moteN);
  for (let i = 0; i < moteN; i++) { motePos.set([(Math.random() - 0.5) * 30, -2 + Math.random() * 12, -2 - Math.random() * 30], i * 3); moteSeed[i] = Math.random(); }
  const moteGeo = new T.BufferGeometry(); moteGeo.setAttribute('position', new T.BufferAttribute(motePos, 3)); moteGeo.setAttribute('aSeed', new T.BufferAttribute(moteSeed, 1));
  const moteU = { uT: { value: 0 }, uPix: { value: 1 }, uC: { value: new T.Color('#ffe9c0') }, uI: { value: 0.4 } };
  const motes = new T.Points(moteGeo, new T.ShaderMaterial({ uniforms: moteU, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
    vertexShader: `attribute float aSeed; uniform float uT, uPix; varying float vA;
      void main(){ vec3 p = position; p.y = -2.0 + mod(p.y + 2.0 + uT * (0.12 + aSeed * 0.2), 12.0); p.x += sin(uT * 0.2 + aSeed * 30.0) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = 0.35 + 0.65 * sin(uT * (0.5 + aSeed) + aSeed * 40.0) * 0.5 + 0.3;
        gl_PointSize = clamp((2.5 + aSeed * 3.0) * uPix * 9.0 / max(1.0, -mv.z), 1.0, 7.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform vec3 uC; uniform float uI; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uC * a * a * vA * uI, 1.0); }' }));
  motes.frustumCulled = false; motes.renderOrder = -30; scene.add(motes);

  // --- the floor becomes glass over a mirrored world
  const floor = ext.floor, fm = floor && floor.material;
  if (fm && !soft) { fm.transparent = true; fm.opacity = 0.66; fm.depthWrite = false; floor.renderOrder = 1; }
  if (ext.grid) ext.grid.renderOrder = 2;
  if (ext.pool) ext.pool.renderOrder = 3;
  const mir = [];
  const flipY = (y) => 2 * FLOOR_Y - y;
  if (!soft && ext.columns && ext.capitals) {
    // the reflections are drawn bright and flat (a mirror image is dim anyway once the glass floor has dimmed it); fog still fades the far ones
    const mc = new T.InstancedMesh(ext.columns.geometry, new T.MeshBasicMaterial({ color: col('#eadfca'), fog: true }), ext.columns.count);
    const mp = new T.InstancedMesh(ext.capitals.geometry, new T.MeshBasicMaterial({ color: col('#f6d890'), fog: true }), ext.capitals.count);
    const m4 = new T.Matrix4(), v3 = new T.Vector3();
    for (const [src, dst] of [[ext.columns, mc], [ext.capitals, mp]]) {
      for (let i = 0; i < src.count; i++) { src.getMatrixAt(i, m4); v3.setFromMatrixPosition(m4); m4.setPosition(v3.x, flipY(v3.y), v3.z); dst.setMatrixAt(i, m4); }
      dst.instanceMatrix.needsUpdate = true; dst.frustumCulled = false; scene.add(dst);
    }
    mir.push(mc, mp);
  }
  const ringMirror = (r) => { if (!r) return null; const c = r.clone(); c.position.y = flipY(r.position.y); scene.add(c); mir.push(c); return c; };
  const ringAm = soft ? null : ringMirror(ext.ringA), ringBm = soft ? null : ringMirror(ext.ringB);
  const shardM = soft ? [] : (ext.shards || []).map((s) => { const c = s.clone(); scene.add(c); mir.push(c); return c; });
  home.reflect = soft ? 0 : mir.length + 2;

  // --- weather: rain streaks and lightning
  const RAIN = 360;
  const rainPos = new Float32Array(RAIN * 6), rainEnd = new Float32Array(RAIN * 2), rainSeed = new Float32Array(RAIN * 2);
  for (let i = 0; i < RAIN; i++) {
    const x = (Math.random() - 0.5) * 36, y = Math.random() * 16, z = -34 + Math.random() * 37, sd = Math.random();
    rainPos.set([x, y, z, x, y, z], i * 6); rainEnd[i * 2] = 0; rainEnd[i * 2 + 1] = 1; rainSeed[i * 2] = sd; rainSeed[i * 2 + 1] = sd;
  }
  const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3)); rainGeo.setAttribute('aEnd', new T.BufferAttribute(rainEnd, 1)); rainGeo.setAttribute('aSeed', new T.BufferAttribute(rainSeed, 1));
  const rainU = { uT: { value: 0 }, uC: { value: new T.Color('#b9a98a') }, uI: { value: 0.4 } };
  const rain = new T.LineSegments(rainGeo, new T.ShaderMaterial({ uniforms: rainU, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
    vertexShader: `attribute float aEnd, aSeed; uniform float uT; varying float vA;
      void main(){ vec3 p = position; float fall = mod(p.y - uT * (16.0 + aSeed * 8.0), 16.0); p.y = fall - 2.6 + aEnd * 0.9; p.x += aEnd * 0.12; vA = 0.3 + 0.7 * aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: 'uniform vec3 uC; uniform float uI; varying float vA; void main(){ gl_FragColor = vec4(uC * vA * uI, 1.0); }' }));
  rain.frustumCulled = false; rain.renderOrder = 4; rain.visible = false; scene.add(rain);

  // --- the shockwave under the core: one ring, thrown when she starts a word
  const wave = new T.Mesh(new T.RingGeometry(0.92, 1, 96), new T.MeshBasicMaterial({ color: col('#c8a24a'), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
  wave.rotation.x = -Math.PI / 2; wave.position.set(0, FLOOR_Y + 0.03, -30); wave.renderOrder = 5; wave.visible = false; wave.frustumCulled = false; scene.add(wave);
  const waveRise = new T.Mesh(new T.RingGeometry(0.97, 1, 96), wave.material);          // the same wave in the sky behind the core
  waveRise.position.set(0, 2.2, -26); waveRise.renderOrder = 5; waveRise.visible = false; waveRise.frustumCulled = false; scene.add(waveRise);
  let waveAge = 9, wavePrevLevel = 0, waveState = 'idle';

  // --- the clock, the weather and the reactor: refreshed about every 1.5 s (never per frame)
  const base = { exposure: ext.baseExposure || 0.8, fogDensity: 0.03, lampI: 22, lampC: col('#e0b060'), poolC: new T.Color(), beamI: 0.12 };
  const tmpC = new T.Color(), tmpC2 = new T.Color();
  let skyNow = null, slowWall = 0, lastSlow = -9, flash = 0, nextFlash = 6 + Math.random() * 8, clockAt = 0;
  const ET = (ms) => {
    try {
      const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(ms))) p[x.type] = x.value;
      return { min: (+p.hour % 24) * 60 + +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
    } catch (_) { const d = new Date(ms); return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: d.getUTCDay() }; }
  };
  const factsNow = () => { try { return window.__jarvis && window.__jarvis.facts ? window.__jarvis.facts() : null; } catch (_) { return null; } };
  const modeNow = () => { try { return localStorage.getItem('jarvis.mode') || 'auto'; } catch (_) { return 'auto'; } };
  const themeCols = () => ext.colours();

  function slow(t) {
    const ms = typeof window.__homeClock === 'number' ? window.__homeClock : Date.now();
    const e = ET(ms), f = factsNow(), open = !!(f && f.market && f.market.open), weekend = e.wd === 0 || e.wd === 6;
    skyNow = skyFor(e.min, weekend, open);
    const vix = typeof window.__homeVix !== 'undefined' ? window.__homeVix : findVix(f);
    const w = weatherFor(vix);
    home.sky = skyNow; home.weather = w; home.clock = e.min; home.open = open;
    const K = themeCols();
    // the dome: the time-of-day colours with a little of the theme's own bronze kept in
    const th = tmpC2.set(K.c2);
    skyU.uZ.value.setRGB(...skyNow.zenith).lerp(th, 0.1);
    skyU.uH.value.setRGB(...skyNow.horizon).lerp(th, 0.14);
    skyU.uG.value.setRGB(...skyNow.glow);
    skyU.uHaze.value = w.haze;
    // sun and moon: x across, y by height; the layer sits 150 back; the visible half-width on a phone is about 38
    const place = (disc, mirror, b, k) => {
      disc.visible = mirror.visible = b.up || b.y > -0.05;
      const x = b.x * 32, y = FLOOR_Y + 3 + Math.max(0, b.y) * 52;
      disc.position.set(x, y, -150); mirror.position.set(x, flipY(y), -150);
      disc.material.uniforms.uI.value = k * (b.up ? 1 : 0);
    };
    place(sun, sunR, { ...skyNow.sun, up: skyNow.sunUp }, skyNow.sunUp ? 1 - 0.55 * w.haze : 0);
    place(moon, moonR, { ...skyNow.moon, up: !skyNow.sunUp }, !skyNow.sunUp ? 0.75 * (1 - 0.6 * w.haze) : 0);
    const light = skyNow.sunUp ? skyNow.sun : skyNow.moon;
    skyU.uSun.value.set(light.x * 32, FLOOR_Y + 3 + Math.max(0, light.y) * 52, -150);
    skyU.uSunI.value = (skyNow.sunUp ? 1 : 0.35) * (1 - 0.5 * w.haze);
    // the stars and the nebula fade by day and in weather
    const sg = skyNow.stars * (1 - 0.7 * w.haze);
    if (ext.stars) { const c = ext.stars.material.uniforms.uColor.value; c.setRGB(1, 0.92, 0.78).multiplyScalar(Math.max(0.02, sg)); }
    if (ext.nebula) ext.nebula.children.forEach((s) => { s.material.opacity = (s.userData.o0 || (s.userData.o0 = s.material.opacity)) * (0.35 + 0.65 * skyNow.nebula); });
    // fog, exposure
    ext.fog.density = base.fogDensity * w.fog;
    ext.fog.color.setRGB(...skyNow.horizon).multiplyScalar(0.27).lerp(th.clone().multiplyScalar(0.12), 0.25);
    rc.renderer.toneMappingExposure = base.exposure * skyNow.exposure;
    // the shafts: fan from the light toward the floor in front of the temple
    // the shafts live in one plane 20 units out (the visible half-width there is about 5, the half-height 11); the light is projected into it
    const PK = 20 / 150, lx = light.x * 32 * PK, ly = camera.position.y + (FLOOR_Y + 3 + Math.max(0, light.y) * 52 - camera.position.y) * PK, lz = -20;
    const n = lite() ? 3 : shaftN, shaftC = skyNow.sunUp ? skyNow.glow : mix3(hex('#d8c8a0'), skyNow.glow, 0.25);
    shafts.forEach((m, i) => {
      m.visible = i < n && skyNow.rays * (1 - 0.6 * w.haze) > 0.04;
      const spread = (i - (n - 1) / 2) * (lite() ? 3.4 : 2.1), tx = lx * 0.3 + spread, ty = camera.position.y - 10, dx = tx - lx, dy = ty - ly, L = Math.hypot(dx, dy);
      m.position.set((lx + tx) / 2, (ly + ty) / 2, lz); m.rotation.z = Math.atan2(dy, dx) - Math.PI / 2; m.scale.set(1.5 + (i % 3) * 0.9, L, 1);
      m.material.uniforms.uC.value.setRGB(...shaftC);
      m.material.uniforms.uI.value = 0.11 * skyNow.rays * (0.8 + 0.4 * ((i * 7) % 5) / 4);
    });
    home.rays = shafts.filter((m) => m.visible).length;
    moteU.uC.value.setRGB(...shaftC); moteU.uI.value = 0.55 * skyNow.rays; motes.visible = !lite() && moving() && skyNow.rays > 0.1;
    // the rain: how many streaks, how bright
    const nRain = lite() ? 0 : Math.round(RAIN * w.rain);
    rainGeo.setDrawRange(0, nRain * 2); rain.visible = nRain > 0 && moving(); rainU.uI.value = 0.35 + 0.35 * w.rain; home.rain = nRain;
    // the horizon ring shines with the market
    const hz = ext.horizon;
    if (hz) hz.userData.k = open ? 1.15 : weekend ? 0.55 : 0.8;
    lastSlow = t;
  }

  function reactive(dt, t) {
    const st = root.dataset.state || 'idle';
    let level = 0;
    try { const s = window.__jarvis && window.__jarvis.core ? window.__jarvis.core() : null; if (s && typeof s.level === 'number') level = s.level; } catch (_) { level = 0; }
    const target = reactFor(st, level);
    home.energy += (target - home.energy) * Math.min(1, dt * (target > home.energy ? 9 : 3.5));
    const E = home.energy, K = themeCols();
    // colour: the theme, pulled toward the mode's colour a little and toward the state's colour while it is not idle
    const mt = modeTint(modeNow()), stt = STATE_TINT[st];
    if ((mt || '') !== (window.__jarvisModeTint || '')) { window.__jarvisModeTint = mt || null; try { window.dispatchEvent(new CustomEvent('jarvis:mode', { detail: { tint: mt || null } })); } catch (_) { /* old browser */ } }
    home.stateTint = stt || ''; home.modeTint = mt || '';
    tmpC.set(K.c3);
    if (mt) tmpC.lerp(tmpC2.set(mt), 0.4);
    if (stt) tmpC.lerp(tmpC2.set(stt), 0.55);
    ext.lamp.color.copy(tmpC); ext.lamp.intensity = base.lampI * (1 + 1.6 * E);
    ext.pool.material.uniforms.uC.value.copy(tmpC).multiplyScalar(1.2 + 1.6 * E);
    ext.shaft.material.uniforms.uColor.value.copy(tmpC);
    if (ext.shaft.material.uniforms.uPower) ext.shaft.material.uniforms.uPower.value = base.beamI + 0.38 * E;
    ext.ringA.material.color.copy(tmpC).multiplyScalar(3.5 + 3 * E); ext.ringB.material.color.copy(tmpC).multiplyScalar(2.2 + 2.2 * E);
    ext.ringA.userData.spin = 0.05 + 0.5 * E; ext.ringB.userData.spin = 0.03 + 0.35 * E;
    if (ext.horizon) { tmpC2.set(K.c2); ext.horizon.material.color.copy(tmpC2).lerp(tmpC, 0.35 * E).multiplyScalar(2.5 * (ext.horizon.userData.k || 1)); }
    // a shockwave when she starts a state or a word hits
    if ((st !== waveState && (st === 'speaking' || st === 'listening')) || (st === 'speaking' && level - wavePrevLevel > 0.22 && waveAge > 0.35)) { waveAge = 0; wave.material.color.copy(tmpC); }
    waveState = st; wavePrevLevel = level;
    if (waveAge < 1.4) {
      waveAge += dt; const u = clamp(waveAge / 1.4, 0, 1), s = 1.5 + u * 22;
      wave.visible = waveRise.visible = true; wave.scale.setScalar(s); waveRise.scale.setScalar(2 + u * 9); wave.material.opacity = 0.55 * (1 - u) * (1 - u);
    } else wave.visible = waveRise.visible = false;
  }

  // --- parallax: the camera leans with the phone (Tilt on) or the mouse
  const par = home.parallax;
  let tx = 0, ty = 0, gyro = false;
  const onOrient = (e) => { if (e.gamma == null) return; tx = clamp(e.gamma / 25, -1, 1); ty = clamp(((e.beta == null ? 45 : e.beta) - 45) / 25, -1, 1); par.src = 'gyro'; };
  const onMouse = (e) => { if (e.pointerType && e.pointerType !== 'mouse') return; tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; par.src = 'mouse'; };
  window.addEventListener('pointermove', onMouse, { passive: true });
  const tiltPref = () => { try { return localStorage.getItem('jp3dtilt') === '1'; } catch (_) { return false; } };
  const syncGyro = () => { const on = tiltPref(); if (on && !gyro) { window.addEventListener('deviceorientation', onOrient, { passive: true }); gyro = true; } else if (!on && gyro) { window.removeEventListener('deviceorientation', onOrient); gyro = false; if (par.src === 'gyro') { tx = ty = 0; par.src = ''; } } };
  syncGyro(); const gyroT = setInterval(syncGyro, 2000); home.stop = () => clearInterval(gyroT);
  const cam = ext.cam;
  function parallax(dt) {
    const k = Math.min(1, dt * 4);
    par.x += (tx - par.x) * k; par.y += (ty - par.y) * k;
    cam.x = par.x * 1.5; cam.y = -par.y * 0.5; cam.lx = par.x * 0.7; cam.ly = par.y * 0.25;
  }

  // --- the frame hook: backdrop.js calls this after its own step
  ext.onStep.push((dt, t) => {
    if (performance.now() - slowWall > 1500 || lastSlow < 0) { slowWall = performance.now(); slow(t); if (home.trim) home.trim(); }       // on the wall clock: the frame clock slows with the phone
    parallax(dt); reactive(dt, t);
    const mv = moving() && dt > 0;
    for (const m of shafts) if (m.visible) m.material.uniforms.uT.value = t;
    moteU.uT.value = t; moteU.uPix.value = rc.renderer.getPixelRatio();
    if (rain.visible) rainU.uT.value = t;
    // lightning: a flash in the sky and on the lamp now and then
    const w = home.weather;
    if (mv && w.lightning > 0) {
      nextFlash -= dt;
      if (nextFlash <= 0) { flash = 1; home.flashes++; nextFlash = (5 + Math.random() * 12) / (0.5 + w.lightning); }
    }
    flash = Math.max(0, flash - dt * 3.2);
    skyU.uFlash.value = flash * (0.55 + 0.45 * Math.sin(t * 60)) * w.lightning;
    ext.lamp.intensity += flash * 40 * w.lightning;
    // the mirrors follow what they mirror
    if (ringAm) ringAm.rotation.set(-ext.ringA.rotation.x, ext.ringA.rotation.y, ext.ringA.rotation.z);
    if (ringBm) ringBm.rotation.set(-ext.ringB.rotation.x, ext.ringB.rotation.y, ext.ringB.rotation.z);
    shardM.forEach((c, i) => { const s = ext.shards[i]; c.position.set(s.position.x, flipY(s.position.y), s.position.z); c.rotation.set(-s.rotation.x, s.rotation.y, s.rotation.z); });
  });
  ext.onTheme.push(() => { const K = themeCols(); base.lampC.set(K.c3); lastSlow = -9; });
  slow(0);
  home.ready = true;

  // --- the courtyard: five marble doorways, one per Atlas district (courtyard.js; never stops the home if it fails)
  import('./courtyard.js?v=q6d').then((m) => { m.attach(ext, home); home.trim(); frameCourt(); }).catch((e) => { home.courtyardError = String((e && e.message) || e); });

  // --- home v2 (2026-11-11): the scene's budget. At most 25 draw calls for the whole scene (the post passes are the render core's own): what is
  // counted is every visible mesh / points / sprite; when the count is over, the least important extras go first (far clouds, dust, mirrors, shafts).
  const BUDGET = 25;
  home.budget = BUDGET;
  home.sceneDraws = () => { let n = 0; scene.traverseVisible((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) n += Array.isArray(o.material) ? o.material.length : 1; }); return n; };
  home.trim = () => {
    const spare = [].concat(ext.nebula ? ext.nebula.children.slice(2).reverse() : [], [motes], shafts.slice(4).reverse(), mir.slice().reverse(), ext.nebula ? ext.nebula.children.slice(0, 2) : [],
      shafts.slice(2, 4).reverse(), [ext.ringA, ext.horizon, ext.stars]).filter(Boolean);
    let n = home.sceneDraws(), cut = 0;
    for (const o of spare) { if (n <= BUDGET) break; if (o.visible) { o.visible = false; cut++; n = home.sceneDraws(); } }
    home.draws = n; home.trimmed = (home.trimmed || 0) + cut;
    return n;
  };

  // --- home v2: the courtyard stands in the hero's window. The lens is shifted (camera.view), so the perspective stays natural and nothing in the
  // scene has to move; the doorways' feet land on the rail under the window (#court) and the whole world drifts at half the page's speed when the
  // home scrolls (parallax). Reduced motion / effects off: one still frame, so no drift. A short phone has no window: the scene stays behind the scrim.
  const lens = (home.lens = { s: 0, k: 1, feet: 0, on: false });
  const homeEl = document.getElementById('home'), v3l = new T.Vector3();
  let scrollTop = 0;
  if (homeEl) homeEl.addEventListener('scroll', () => { scrollTop = homeEl.scrollTop; }, { passive: true });
  const setLens = (sh) => {
    if (Math.abs(sh - lens.s) < 0.0004 && lens.on) return;
    lens.s = sh; lens.on = true;
    camera.view = { enabled: true, fullWidth: 1, fullHeight: 1, offsetX: 0, offsetY: sh, width: 1, height: 1 };
    camera.updateProjectionMatrix();
  };
  function frameCourt() {
    const c = home.courtyard;
    if (!c || c.lite || !c.group) return;
    const Hpx = window.innerHeight || 1, el = document.getElementById('court'), r = el ? el.getBoundingClientRect() : null;
    const win = r && r.height > 60;                                        // the window is there (a tall enough phone)
    const feet0 = win ? r.bottom - 44 + scrollTop : Hpx * 0.30, art = win ? r.height - 44 : Hpx * 0.2;
    camera.updateMatrixWorld();
    const fy = (y) => { v3l.set(0, y, c.dims.z).project(camera); return (1 - (v3l.y - 2 * lens.s)) / 2; };          // where a height on the doorways' line falls on the screen (0 top .. 1 bottom), lens shift taken out
    const feetF = fy(c.dims.floorY), topF = fy(c.dims.top), doorPx = Math.max(1, (feetF - topF) * Hpx);
    const k = Math.max(0.4, Math.min(1, (art - (win ? 16 : 6)) / doorPx));    // the doorways fit the window (scaled about their feet), with a little sky above them
    if (Math.abs(k - lens.k) > 0.002 || !lens.on) { lens.k = k; c.group.scale.setScalar(k); c.group.position.set(0, c.dims.floorY * (1 - k), c.dims.z * (1 - k)); }
    // QA6: each doorway stands over its own name on the rail (five equal columns): the row is spread sideways to the rail's spacing (a phone at 390 px
    // showed five thin pale bars squeezed into the middle); the columns then stand in the gaps
    if (win && c.spread && c.doors && c.doors.length > 1) {
      const sx = (x) => { v3l.set(x * k, 0, c.dims.z).project(camera); return (v3l.x + 1) / 2 * (window.innerWidth || 1); };
      const now = Math.abs(sx(c.doors[1].x * (c.dims.spread || 1)) - sx(c.doors[0].x * (c.dims.spread || 1))), want = r.width / c.doors.length;
      if (now > 1) c.spread((c.dims.spread || 1) * want / now);
    }
    const drift = moving() ? scrollTop * 0.5 : 0;
    lens.feet = feet0 - drift;
    setLens(Math.max(-0.2, Math.min(0.62, feetF - lens.feet / Hpx)));
  }
  ext.onStep.push(() => frameCourt());
  window.addEventListener('resize', () => { try { frameCourt(); } catch (_) { /* the next frame */ } }, { passive: true });

  // =========================================================================================== constellation lines + badges (2D, over the stage)
  mountConstellation(home, ext);

  // FX HOOK (olympus/fx-cine.js, optional; 2026-11-11 effects pass): the time-of-day colour grade (dawn / golden / day / dusk / night LUT
  // in the one finish pass), birds wheeling behind the temple by day, warm fireflies by night. No light, shadow map or render target of its
  // own (the GPU guard stays true); LITE / software GL keep only the grade. The home is the same without it.
  import('../olympus/fx-cine.js').then((C) => {
    home.cine = C.cinema(rc, { time: 'clock', sun: false, bursts: false, birds: lite() ? false : { center: [0, 0, -40], radius: 34, height: 16, size: 0.6, count: 10 },
      fireflies: lite() ? false : { box: [24, 4, 12], center: [0, -1, -6], count: 40 } });
    // night-3d (2026-11-17): a soft depth of field on HD (cinema's focus is high / ultra only): the reactor and the temple stay sharp, the far
    // sky, the shafts' tails and the birds fall softly out of focus. It rides the one finish pass: no draw call, LITE untouched.
    if (!lite() && ext.T && home.cine.focus) home.cine.focus(new ext.T.Vector3(0, 1.6, 0), { r: 0.26, amount: 2.6 });
  }).catch(() => { /* optional */ });
}

// ------------------------------------------------------------------------------------------------ lines from the core to its orbs
function mountConstellation(home, ext) {
  const stage = document.getElementById('stage'), sats = document.getElementById('sats');
  if (!stage || !sats) return;
  const root = ext.root;
  const cv = document.createElement('canvas'); cv.className = 'jconst'; cv.setAttribute('aria-hidden', 'true');
  stage.insertBefore(cv, stage.firstChild);
  const g = cv.getContext('2d');
  const LV = { ok: '160,176,96', warn: '224,176,96', bad: '201,106,74', off: '154,143,125' };   // AGORA: olive, sunrise, terracotta, stone
  let raf = 0, last = 0, t0 = performance.now(), W = 0, H = 0, dpr = 1, drawn = 0;
  const live = () => !document.hidden && root.dataset.mode === 'jarvis' && stage.getClientRects().length > 0;
  const animated = () => (root.dataset.fx === 'high' || root.dataset.fx === 'ultra') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    W = r.width; H = r.height; return r;
  }
  // the canvas reaches 30% beyond the stage on every side: the lines run out of the core's glow into the dark around it, where they show
  function draw(now) {
    const sr = size(); if (W < 20) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const t = (now - t0) / 1000, cx = W / 2, cy = H / 2, anim = animated(), E = home.energy || 0, sw = stage.getBoundingClientRect().width || W / 1.6;
    const pts = [];
    for (const b of sats.querySelectorAll('.sat')) {
      const r = b.getBoundingClientRect(); if (!r.width) continue;
      const lv = b.classList.contains('bad') ? 'bad' : b.classList.contains('warn') ? 'warn' : b.classList.contains('off') ? 'off' : 'ok';
      const x = r.left - sr.left + r.width / 2, y = r.top - sr.top + r.height / 2;
      pts.push({ x, y, lv, a: Math.atan2(y - cy, x - cx), d: Math.hypot(x - cx, y - cy) });
    }
    pts.sort((p1, p2) => p1.a - p2.a);
    g.globalCompositeOperation = 'lighter';
    // the orbit between neighbours: a dashed curve bulging outward, a light travelling along it
    if (pts.length > 2) {
      pts.forEach((p1, i) => {
        const p2 = pts[(i + 1) % pts.length], c = LV[p1.lv];
        let am = (p1.a + p2.a) / 2; if (p2.a < p1.a) am += Math.PI;
        const rm = (p1.d + p2.d) / 2 + sw * 0.1, qx = cx + Math.cos(am) * rm, qy = cy + Math.sin(am) * rm;
        g.setLineDash([2, 6]); g.lineWidth = 1; g.strokeStyle = `rgba(${c},${0.35 + 0.1 * Math.sin(t * 0.8 + i)})`;
        g.beginPath(); g.moveTo(p1.x, p1.y); g.quadraticCurveTo(qx, qy, p2.x, p2.y); g.stroke(); g.setLineDash([]);
        const u = anim ? (t * (0.08 + 0.1 * E) + i * 0.29) % 1 : 0.5, v = 1 - u;
        const bx = v * v * p1.x + 2 * v * u * qx + u * u * p2.x, by = v * v * p1.y + 2 * v * u * qy + u * u * p2.y;
        const rg = g.createRadialGradient(bx, by, 0, bx, by, 5); rg.addColorStop(0, `rgba(${c},.9)`); rg.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = rg; g.beginPath(); g.arc(bx, by, 5, 0, 6.2832); g.fill();
      });
    }
    pts.forEach((p, i) => {
      const ux = Math.cos(p.a), uy = Math.sin(p.a), c = LV[p.lv];
      const sx = cx + ux * sw * 0.2, sy = cy + uy * sw * 0.2, ex = p.x - ux * 14, ey = p.y - uy * 14;      // the spoke from the core
      const grad = g.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, `rgba(${c},0)`); grad.addColorStop(0.5, `rgba(${c},${0.35 + 0.25 * E})`); grad.addColorStop(1, `rgba(${c},${0.85 + 0.15 * E})`);
      g.strokeStyle = grad; g.lineWidth = 1.6; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      const sp = (p.lv === 'bad' ? 0.55 : p.lv === 'warn' ? 0.3 : 0.14) * (1 + 1.8 * E), u = anim ? ((t * sp + i * 0.37) % 1) : 0.62;
      const px = sx + (ex - sx) * u, py = sy + (ey - sy) * u;
      const rg = g.createRadialGradient(px, py, 0, px, py, 7); rg.addColorStop(0, `rgba(${c},1)`); rg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = rg; g.beginPath(); g.arc(px, py, 7, 0, 6.2832); g.fill();
      // a star out beyond the orb, on its own line: the constellation's far end
      const fx = p.x + ux * (22 + 6 * Math.sin(t * 0.6 + i)), fy = p.y + uy * (22 + 6 * Math.sin(t * 0.6 + i)), tw = 0.5 + 0.5 * Math.sin(t * 1.9 + i * 2.3);
      g.strokeStyle = `rgba(${c},0.45)`; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x + ux * 16, p.y + uy * 16); g.lineTo(fx, fy); g.stroke();
      g.fillStyle = `rgba(243,236,224,${0.45 + 0.3 * tw})`; g.beginPath(); g.arc(fx, fy, 1.4 + tw * 0.6, 0, 6.2832); g.fill();
    });
    g.globalCompositeOperation = 'source-over';
    drawn++; home.constellation = pts.length; home.constellationDraws = drawn;
  }
  function frame(now) {
    raf = 0;
    if (!live() || !animated()) { draw(now); return; }
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / 24) return;
    last = now; draw(now);
  }
  const kick = () => { if (raf) return; raf = requestAnimationFrame(frame); };
  // the orbs' badges: a check, a dot or an !, from the System view (data.js systemStatus rows); redrawn with the orbs
  function badges() {
    const f = (() => { try { return window.__jarvis.facts(); } catch (_) { return null; } })(), rows = f && f.system && Array.isArray(f.system.rows) ? f.system.rows : [];
    let n = 0;
    for (const b of sats.querySelectorAll('.sat')) {
      const row = rows.find((r) => r.id === b.dataset.sat), lv = b.classList.contains('bad') ? 'bad' : b.classList.contains('warn') ? 'warn' : b.classList.contains('off') ? 'off' : 'ok';
      const host = b.querySelector('i') || b;
      let s = host.querySelector('.sb');
      if (!s) { s = document.createElement('b'); s.className = 'sb'; s.setAttribute('aria-hidden', 'true'); host.appendChild(s); }
      s.textContent = lv === 'bad' ? '!' : lv === 'warn' ? '•' : lv === 'off' ? '–' : '✓';
      if (row) { b.title = `${row.name}: ${row.value || ''}${row.text ? ' · ' + row.text : ''}`.slice(0, 160); b.setAttribute('aria-label', b.title); }
      n++;
    }
    home.badges = n;
  }
  new MutationObserver(() => { badges(); kick(); }).observe(sats, { childList: true });
  new MutationObserver(kick).observe(root, { attributes: true, attributeFilter: ['data-fx', 'data-mode', 'data-theme'] });
  document.addEventListener('visibilitychange', kick);
  window.addEventListener('resize', kick);
  setInterval(() => { if (live()) { badges(); if (!animated()) kick(); } }, 4000);
  badges(); kick();
  home.constellationKick = kick;
}
