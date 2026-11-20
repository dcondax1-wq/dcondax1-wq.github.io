// Jarvis core: the animated centrepiece of Jarvis mode on the owner's phone.
// Default design "reactor": the owner's violet Gimbal Reactor, ported from his old Jarvis (specs/old_jarvis_ui/reactor_r3d2.html):
// a faceted plasma core with lightning, 3 chrome gimbal rings with energy strips, orbiting cubes, a particle disk, a glass and
// hex shell, a hologram globe and a projector dial on a grid floor. "singularity": a black hole with a white-violet accretion
// ring. Real 3D with Three.js (./three.module.min.js, r160, loaded on demand) through the OLYMPUS render core
// (../olympus/render.js: real bloom, 4x MSAA / FXAA, the film finish; docs/OLYMPUS_RENDER.md). A 2D canvas draws the ticked HUD ring on top
// (clock, state, level gauge) at once, and is the whole core (a flat arc-reactor) when WebGL or three is missing.
//   mountCore(el, {size, design: 'reactor'|'singularity', theme: {c, c2, c3, tint} or an old key ('eclipse', 'reactor',
//                  'reactor-stark', 'reactor-ice', 'reactor-emerald'), effects: 'ultra'|'high'|'low'|'off',
//                  adapt: true (step effects down on slow frames), motion: 'always' (ignore the OS reduce-motion switch), webgl: true})
//     -> {setState(s), setLevel(v), setTheme(theme), setDesign(name), destroy(), stats()}
//   idle: calm breathing · listening: faster, the core turns red, rings flare with the level · thinking: fast orbit, lightning
//   speaking: pulses with setLevel, shock rings · alert: red / amber flare
// setLevel(0..1) drives the voice pulse; with no call for 0.6 s a built-in envelope per state keeps it alive.
// devicePixelRatio capped at 2; slow frames step the effects down to 'low'; pauses when the page is hidden or the core is
// off-screen; one static frame under prefers-reduced-motion or effects 'off'; no gyro, no sway. iPhone Safari 16 safe.

const STATES = ['idle', 'listening', 'thinking', 'speaking', 'alert'];
const WORD = ['STANDBY', 'LISTENING', 'THINKING', 'SPEAKING', 'ALERT'];
const LETTERING = false;      // AGORA: the core has no HUD text ring, no projector dial, no grid floor, no hologram globe
const SUB = ['CORE ONLINE', 'VOICE IN', 'PROCESSING', 'VOICE OUT', 'ATTENTION'];
const EFFECTS = ['off', 'low', 'high', 'ultra'];
const DESIGNS = ['reactor', 'singularity'];
const VIOLET = { c: '#9c6b3c', c2: '#9c6b3c', c3: '#c9a06a', tint: '#e9ddff' };      // Eclipse, the owner's violet
const NAMED = { eclipse: VIOLET, reactor: { c: '#9c6b3c', c2: '#9c6b3c', c3: '#4b7a99', tint: '#f5d0fe' },   // the old theme keys
  'reactor-stark': { c: '#ffbe3d', c2: '#d6281f', c3: '#7fa6bd', tint: '#fff1d0' }, 'reactor-ice': { c: '#4b7a99', c2: '#4b7a99', c3: '#7fa6bd', tint: '#e6fbff' },
  'reactor-emerald': { c: '#7f8a52', c2: '#059669', c3: '#b4ff3c', tint: '#dcfff0' } };
const themeOf = (th) => Object.assign({}, VIOLET, typeof th === 'string' ? NAMED[th] : th);
const BAD = [255, 77, 109], WARN = [251, 191, 36], WHITE = [255, 255, 255];
const TAU = Math.PI * 2;
// per state: spin, scan rev/s, breath, wave gain, particle speed, brightness, pulse Hz (old core: 3 s / .8 s / 1 s / .5 s), bolts/s
const PRM = [
  [1, 0.09, 1, 0.1, 1, 0.9, 1 / 3, 1.1],
  [2, 0.2, 0.3, 0.45, 1.6, 1, 1.25, 2.2],
  [8, 1.4, 0.15, 0.08, 7, 1, 1, 9],
  [1.8, 0.3, 0.2, 1, 2, 1.1, 2, 3],
  [3, 0.7, 0, 0.3, 3.5, 1.15, 1.25, 6],
];
const SEG = [0, 0.19, 0.23, 0.07, 0.34, 0.15, 0.53, 0.04, 0.61, 0.2, 0.85, 0.1];   // segmented ring: start, length (turns)
const NP = [24, 50, 90, 150], NB = [36, 48, 72, 96], NT = [60, 72, 120, 120];     // 2D detail per tier
const STATIC_L = [0.08, 0.5, 0.35, 0.75, 0.6];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rgb = (h) => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
// colours per state: [rings, accent, hot centre, core body, deep]; listening turns the core red as the old Jarvis did
function palette(th) {
  const c = rgb(th.c), c3 = rgb(th.c3), ti = rgb(th.tint), deep = mix(rgb(th.c2), [0, 0, 0], 0.45);
  return [
    [c, c3, ti, c, deep],
    [c, c3, [255, 150, 172], BAD, [110, 8, 38]],
    [mix(c, [90, 120, 255], 0.45), mix(c3, [150, 175, 255], 0.5), ti, mix(c3, [110, 140, 255], 0.4), deep],
    [c, mix(c3, WHITE, 0.3), mix(ti, WHITE, 0.5), c3, deep],
    [BAD, WARN, [255, 190, 150], [255, 90, 60], [96, 12, 12]],
  ];
}

export function mountCore(el, opts) {
  if (!el || !el.appendChild) throw new TypeError('mountCore(el): an element is required');
  opts = opts || {};
  const size = +opts.size > 0 ? +opts.size : 0;
  let theme = themeOf(opts.theme), PAL = palette(theme);
  let design = DESIGNS.indexOf(opts.design) > 0 ? opts.design : 'reactor';
  const eff = EFFECTS.indexOf(opts.effects) >= 0 ? EFFECTS.indexOf(opts.effects) : 2;
  const cap = eff || 2, auto = opts.adapt !== false;
  const box = document.createElement('div');
  box.className = 'jcore'; box.setAttribute('aria-hidden', 'true');
  const fade = 'radial-gradient(closest-side,#000 86%,transparent 100%)';    // glows and the floor fade out round, no square edge
  box.style.cssText = 'position:relative;margin:0 auto;max-width:100%;aspect-ratio:1/1;-webkit-mask-image:' + fade + ';mask-image:' + fade + ';width:' + (size ? size + 'px' : '100%');
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;pointer-events:none';
  box.appendChild(cv); el.appendChild(box);
  const g = cv.getContext('2d'), lab = document.createElement('canvas'), lg = lab.getContext('2d');
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const always = opts.motion === 'always';                 // the old Jarvis ignored the OS reduce-motion switch; opt-in here
  let reduced = !!(mq && mq.matches) && !always, dead = false, raf = 0, last = 0, t = 0, onScreen = true, still = reduced || eff === 0;
  let S = 0, dpr = 1, tier = cap, st = 0, lvIn = 0, lvAt = -1e9, L = 0, flareAt = -9, frames = 0, frames3 = 0, pph = 0, pulse = 0;
  let acc = 0, nAcc = 0, good = 0, drops = 0, warm = 0, fps = 0, rAcc = 0, ms0 = 0, labKey = '', gaps = [];
  let r3 = null, cv3 = null, three = 'loading';
  const W = [1, 0, 0, 0, 0], P = [0, 0, 0, 0, 0, 0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const rot = [0, 0, 0, 0, 0, 0, 0], orb = [0, 2.1, 4.2], rip = [], tips = new Float32Array(NB[3] * 2), lit4 = new Float32Array(NT[3] * 4);
  const F = { t: 0, dt: 0, W, L: 0, P, C, pulse: 0, stb: 0, fl: 0, tier };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const N = NP[3], pr = new Float32Array(N), pa = new Float32Array(N), pw = new Float32Array(N), ps = new Float32Array(N);
  for (let i = 0; i < N; i++) { pr[i] = 0.3 + 0.7 * rnd(); pa[i] = rnd() * TAU; pw[i] = (0.04 + 0.22 * rnd()) * (rnd() < 0.7 ? 1 : -1); ps[i] = 0.6 + 1.5 * rnd(); }
  const col = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + clamp(a, 0, 1).toFixed(3) + ')';

  // ---------------------------------------------------------------- size, visibility, motion preference
  function fit() {
    const w = box.clientWidth || size || 300, d = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(1, Math.round(w * d * (tier ? 1 : 0.75)));
    if (cv.width !== px || cv.height !== px) { cv.width = cv.height = lab.width = lab.height = px; labKey = ''; }
    S = w; dpr = px / w;
    if (r3) r3.size(w, Math.min(d, tier > 1 ? 2 : tier ? 1.5 : 1));
  }
  let scrolling = false, scrollT = 0;       // revamp 2026-11-20: no core frame while a finger scrolls the page (the owner's "lag"); back 250 ms after
  const live = () => !dead && !still && !document.hidden && onScreen && !scrolling;
  const onScroll = () => { if (!scrolling) { scrolling = true; kick(); } clearTimeout(scrollT); scrollT = setTimeout(() => { scrolling = false; kick(); }, 250); };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  // off-screen (an app open over Jarvis): the render core releases its buffers (MSAA scene buffer, bloom chain), not just the loop
  function kick() {
    if (r3) {
      if (!onScreen && !dead) r3.sleep();
      else if (onScreen && r3.asleep()) { r3.wake(); if (still) snap(); }
    }
    if (live()) { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function snap() {                        // one static frame: the state as it settles, no loop
    for (let i = 0; i < 5; i++) W[i] = i === st ? 1 : 0;
    L = STATIC_L[st]; t = 1.9; pulse = 0.6; flareAt = -9; rip.length = 0; blend(); fit(); render();
  }
  const onVis = () => kick();
  const onMq = () => { reduced = !!mq.matches && !always; still = reduced || eff === 0; if (still) { kick(); snap(); } else kick(); };
  document.addEventListener('visibilitychange', onVis);
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; kick(); }) : null;
  if (io) io.observe(box);
  const resized = () => { const w = box.clientWidth; if (!w || Math.abs(w - S) < 0.5) return; if (still) snap(); else fit(); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resized) : null;
  if (ro) ro.observe(box);

  // ---------------------------------------------------------------- the 3D reactor (three loads on demand; WebGL missing -> 2D)
  // WebGL2 is probed first (no context: the 2D core stays, three is never fetched); three then renders into that context.
  // A lost context (iOS drops them in the background) falls back to the 2D core and tries the reactor again, 3 times at most.
  let tries = 0, retry = 0;
  const onLost = (e) => { e.preventDefault(); drop3D(); if (!dead && tries < 3) retry = setTimeout(start3D, 1500); };
  function drop3D() {
    const r = r3, c = cv3;
    r3 = cv3 = null; three = 'off'; labKey = '';
    if (c) { c.removeEventListener('webglcontextlost', onLost); c.remove(); }
    if (r) { try { r.dispose(); } catch (e) { /* the context is already gone */ } }
    else if (c && c.gl) { const x = c.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }   // destroyed while three loaded
    if (still && !dead) snap();
  }
  function start3D() {
    retry = 0;
    if (dead || opts.webgl === false) { three = 'off'; return; }
    tries++;
    // no context antialias: the render core anti-aliases its own buffer (an MSAA screen buffer would be wasted memory)
    const c = document.createElement('canvas'), A = { alpha: true, antialias: false, premultipliedAlpha: true, depth: true, stencil: false, powerPreference: 'high-performance' };
    try { c.gl = c.getContext('webgl2', A); } catch (e) { c.gl = null; }
    if (!c.gl) { three = 'off'; return; }
    three = 'loading'; cv3 = c;
    // the render core is optional: missing (an old cached shell), the reactor draws straight to the screen as before
    Promise.all([import('./three.module.min.js'), import('../olympus/render.js').catch(() => null)]).then(([T, RC]) => {
      if (dead || cv3 !== c) return;
      c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;opacity:0' + (still ? '' : ';transition:opacity .8s ease');
      try { r3 = makeReactor(T, RC, c, c.gl, A, design, tier, theme); } catch (e) { r3 = null; drop3D(); return; }
      c.addEventListener('webglcontextlost', onLost);
      box.insertBefore(c, cv); three = 'on'; labKey = ''; fit(); rewarm();
      if (still) snap(); else kick();
      void c.offsetWidth; c.style.opacity = '1';
    }, () => { if (cv3 === c) drop3D(); });
  }
  start3D();

  // ---------------------------------------------------------------- per frame
  function frame(now) {
    raf = 0;
    if (!live()) return;
    let ms = last ? now - last : 16.7;
    last = now;
    if (ms > 250) ms = 16.7; else adapt(ms);
    step(Math.min(ms, 50) / 1000);
    const a = performance.now();
    render();
    ms0 += (performance.now() - a - ms0) * 0.1;
    raf = requestAnimationFrame(frame);
  }
  function render() {
    const stb = W[4] * Math.pow(0.5 + 0.5 * Math.sin(t * TAU * 1.25), 6), fe = (t - flareAt) / 1.6;
    F.t = t; F.L = L; F.pulse = pulse; F.stb = stb; F.fl = W[4] * (fe >= 0 && fe < 1 ? (1 - fe) * (1 - fe) : 0); F.tier = tier;
    draw(!r3);
    if (r3) { r3.render(F); frames3++; }
  }
  // quality: every 30 frames look at the mean frame time; under ~45 fps step down, a steady 58+ fps for ~3 s climbs back
  function rewarm() { warm = acc = nAcc = good = 0; }   // shader compiles and uploads are not a slow device
  // the governor can still lower this canvas's pixel ratio (render core stats: dpr above its range's floor, frames not CPU-bound)
  function roomy() {
    let s = null;
    try { s = r3 && r3.post ? r3.post() : null; } catch (e) { s = null; }
    return !!(s && s.range && s.rq && s.dpr > s.range.floor + 0.01 && !/cpu/.test(s.rq.why || ''));
  }
  function adapt(ms) {
    if (warm < 20) { warm++; return; }
    acc += ms; nAcc++;
    if (nAcc < 30) return;
    const avg = acc / nAcc; acc = nAcc = 0; fps = Math.round(1000 / avg);
    if (!auto) return;
    // perf v2: on the render core the page's render-scale governor lowers the resolution first (one controller, no two stepping on the same
    // slow frames); the effects step down once it is at its floor, or when the frames are slow for the page's own JavaScript
    if (avg > 22 && tier > 0 && roomy()) { good = 0; return; }
    if (avg > 22 && tier > 0) { tier--; drops++; good = 0; fit(); if (r3) r3.quality(tier); }
    else if (avg < 17.5 && tier < cap && drops < 4) { if (++good >= 6) { tier++; good = 0; fit(); if (r3) r3.quality(tier); } }
    else good = 0;
  }
  function blend() {
    for (let k = 0; k < 8; k++) { let v = 0; for (let i = 0; i < 5; i++) v += W[i] * PRM[i][k]; P[k] = v; }
    for (let c = 0; c < 5; c++) for (let j = 0; j < 3; j++) { let v = 0; for (let i = 0; i < 5; i++) v += W[i] * PAL[i][c][j]; C[c][j] = v; }
  }
  function synth() {                      // a built-in level per state when the page sends none
    const syl = Math.max(0, Math.sin(t * 7.3)) * (0.6 + 0.4 * Math.sin(t * 1.7)), pause = Math.sin(t * 0.6) > -0.6 ? 1 : 0.15;
    return clamp(W[0] * (0.06 + 0.04 * Math.sin(t * 1.3))
      + W[1] * (0.32 + 0.22 * Math.sin(t * 5.1) * Math.sin(t * 2.3) + 0.08 * Math.sin(t * 13))
      + W[2] * (0.35 + 0.1 * Math.sin(t * 2.2))
      + W[3] * (0.12 + 0.8 * syl * pause) * (0.85 + 0.15 * Math.sin(t * 23))
      + W[4] * (0.45 + 0.55 * Math.pow(Math.max(0, Math.sin(t * TAU * 1.25)), 4)), 0, 1);
  }
  function step(dt) {
    t += dt; F.dt = dt;
    const k = 1 - Math.exp(-dt * 8);
    let sum = 0;
    for (let i = 0; i < 5; i++) { W[i] += ((i === st ? 1 : 0) - W[i]) * k; sum += W[i]; }
    for (let i = 0; i < 5; i++) W[i] /= sum;
    blend();
    const want = performance.now() - lvAt < 600 ? lvIn : synth();
    L += (want - L) * (1 - Math.exp(-dt * (want > L ? 30 : 7)));
    pph += dt * P[6]; pulse = 0.5 - 0.5 * Math.cos(TAU * pph);
    const sp = P[0] * dt;
    rot[0] -= sp * 0.02; rot[1] += sp * 0.05; rot[2] += sp * 0.11; rot[3] -= sp * 0.08; rot[4] += sp * 0.16; rot[5] -= sp * 0.3;
    rot[6] += dt * P[1] * TAU;
    for (let i = 0; i < 3; i++) orb[i] += dt * (2.2 + i * 0.7) * (0.3 + W[2]);
    const pv = P[4] * dt;
    for (let i = 0; i < N; i++) pa[i] += pw[i] * pv;
    // ripples: inward while listening, outward while speaking, a shock wave per beat on alert
    rAcc += dt * (W[1] * (0.3 + 2 * L) + W[3] * (0.25 + 2.6 * L) + W[4] * 1.25);
    if (rAcc >= 1) { rAcc = 0; ring(st === 1 ? -1 : 1, 0.45 + 0.55 * L); }
    while (rip.length && t - rip[0][0] > 1.3) rip.shift();
  }
  function ring(dir, s) { rip.push([t, dir, s]); if (rip.length > 8) rip.shift(); }

  // ---------------------------------------------------------------- 2D: the HUD ring always, the whole core without WebGL
  function glow(c, a, w) {                // stroke the current path with a soft bloom under a crisp line
    if (tier > 2) { g.lineWidth = w * 5; g.strokeStyle = col(c, a * 0.06); g.stroke(); }
    if (tier > 0) { g.lineWidth = w * 2.4; g.strokeStyle = col(c, a * 0.16); g.stroke(); }
    g.lineWidth = w; g.strokeStyle = col(c, a); g.stroke();
  }
  function circle(r) { g.beginPath(); g.arc(0, 0, r, 0, TAU); }
  function arcs(r, a0, list, scale) {     // several arcs in one path, no joining lines
    g.beginPath();
    for (let i = 0; i < list.length; i += 2) {
      const s = a0 + list[i] * TAU, e = s + list[i + 1] * TAU * scale;
      g.moveTo(r * Math.cos(s), r * Math.sin(s)); g.arc(0, 0, r, s, e);
    }
  }
  function curved(txt, r, mid, inv, sp) { // text along an arc; inv = bottom half (reads left to right)
    let w = 0; const ws = [];
    for (let i = 0; i < txt.length; i++) { const x = lg.measureText(txt[i]).width + sp; ws.push(x); w += x; }
    let a = mid + (inv ? 1 : -1) * w / r / 2;
    for (let i = 0; i < ws.length; i++) {
      const da = ws[i] / r, ac = a + (inv ? -da : da) / 2;
      lg.save(); lg.translate(r * Math.cos(ac), r * Math.sin(ac)); lg.rotate(ac + (inv ? -1 : 1) * Math.PI / 2); lg.fillText(txt[i], 0, 0); lg.restore();
      a += inv ? -da : da;
    }
    return w / r / 2 + 0.05;
  }
  function labels(R, k) {                 // the HUD lettering, redrawn only when it changes (the clock once a second)
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const txt = ['JARVIS // CORE', p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + ' · ' + WORD[k],
      'LV ' + String(Math.round(L * 20) * 5).padStart(3, '0') + '%', 'J.A.R.V.I.S · ' + SUB[k]];
    const cc = C[1], key = txt.join('|') + (cc[0] | 0) + (cc[1] | 0) + (cc[2] | 0) + S + tier;
    if (key === labKey) return;
    labKey = key;
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, lab.width, lab.height);
    lg.setTransform(dpr, 0, 0, dpr, S * dpr / 2, S * dpr / 2);
    const fs = Math.max(7, R * 0.048);
    lg.font = '600 ' + fs.toFixed(1) + 'px "Georgia","Bahnschrift",ui-monospace,SFMono-Regular,Menlo,monospace';
    lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillStyle = col(cc, 0.85);
    const r = R * 0.885;
    gaps = [0, curved(txt[0], r, 0, false, fs * 0.2), Math.PI / 2, curved(txt[1], r, Math.PI / 2, true, fs * 0.28),
      Math.PI, curved(txt[2], r, Math.PI, false, fs * 0.2), Math.PI * 1.5, curved(txt[3], r, Math.PI * 1.5, false, fs * 0.28)];
  }
  function draw(full) {
    frames++;
    const d = dpr, R = S * 0.47, c0 = C[0], c1 = C[1], c2 = C[2], cb = C[3];
    const wL = W[1], wT = W[2], wS = W[3], wA = W[4], gb = P[5];
    const br = (0.5 + 0.5 * Math.sin(t * TAU / 4.8)) * P[2], stb = F.stb, fl = F.fl;
    const lv = L * (wL + wS), hot = gb + 0.35 * lv + 0.5 * fl + 0.25 * stb;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, cv.width, cv.height);
    if (!S) return;
    g.setTransform(d, 0, 0, d, S * d / 2, S * d / 2);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'butt';
    let gr;
    if (full) {                            // halo + anamorphic streak
      gr = g.createRadialGradient(0, 0, R * 0.08, 0, 0, R * 1.04);
      const ha = (0.14 + 0.06 * br + 0.16 * lv + 0.3 * fl + 0.1 * stb) * hot;
      gr.addColorStop(0, col(c0, ha)); gr.addColorStop(0.45, col(c0, ha * 0.32)); gr.addColorStop(1, col(c0, 0));
      g.fillStyle = gr; g.fillRect(-R * 1.04, -R * 1.04, R * 2.08, R * 2.08);
      g.save(); g.scale(1, 0.035);
      gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
      gr.addColorStop(0, col(c2, (0.35 + 0.3 * lv + 0.6 * fl) * hot)); gr.addColorStop(1, col(c0, 0));
      g.fillStyle = gr; g.fillRect(-R * 1.05, -R * 1.05, R * 2.1, R * 2.1);
      g.restore();
    }

    // outer graduations; the level lights them like a meter rising from the bottom
    const nt = NT[tier], lit = L * (wL + 0.5 * wS) + 0.08 * (1 - wL - wS) * (0.5 + 0.5 * Math.sin(t * 1.3));
    g.beginPath();
    let nl = 0;
    for (let i = 0; i < nt; i++) {
      const a = rot[0] * (full ? 1 : 0) + (i * TAU) / nt, m = i % 10 === 0 ? 0.075 : i % 5 === 0 ? 0.05 : 0.028;
      const ca = Math.cos(a), sa = Math.sin(a), r0 = R * 0.975, r1 = R * (0.975 - m);
      const u = Math.abs(((a - Math.PI / 2) % TAU + TAU) % TAU - Math.PI) / Math.PI;   // 1 at the bottom, 0 at the top
      if (1 - u < lit * 1.05 || (wA > 0.3 && i % 10 < 3)) { lit4[nl++] = ca; lit4[nl++] = sa; lit4[nl++] = r0; lit4[nl++] = r1; }
      else { g.moveTo(r0 * ca, r0 * sa); g.lineTo(r1 * ca, r1 * sa); }
    }
    g.lineWidth = 1; g.strokeStyle = col(c0, 0.42 * gb); g.stroke();
    if (nl) {
      g.beginPath();
      for (let i = 0; i < nl; i += 4) { g.moveTo(lit4[i + 2] * lit4[i], lit4[i + 2] * lit4[i + 1]); g.lineTo(lit4[i + 3] * lit4[i], lit4[i + 3] * lit4[i + 1]); }
      glow(wA > 0.5 ? c1 : c2, 0.85 * (wA > 0.3 ? 0.35 + 0.65 * stb : 1), 1.4);
    }
    g.beginPath();                          // cardinal notches
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.moveTo(R * Math.cos(a - 0.05), R * Math.sin(a - 0.05)); g.arc(0, 0, R, a - 0.05, a + 0.05); }
    glow(c1, 0.7 * gb, 2);

    // lettering ring: four gaps hold the curved labels. AGORA (2026-11-09): no HUD lettering round the core (LETTERING = false)
    let k = 0; for (let i = 1; i < 5; i++) if (W[i] > W[k]) k = i;
    if (LETTERING && tier > 0) {
      labels(R, k);
      g.beginPath();
      for (let i = 0; i < 8; i += 2) {
        const a0 = gaps[i] + gaps[i + 1], a1 = gaps[(i + 2) % 8] - gaps[(i + 3) % 8] + (i === 6 ? TAU : 0);
        g.moveTo(R * 0.885 * Math.cos(a0), R * 0.885 * Math.sin(a0)); g.arc(0, 0, R * 0.885, a0, a1);
      }
      glow(c0, 0.45 * gb, 1);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = clamp(gb, 0, 1); g.drawImage(lab, 0, 0); g.restore();
    }

    // segmented ring (the old orb's dashed r1): listening thickens it with the level, alert strobes it amber
    arcs(R * (0.835 + 0.02 * L * wL), rot[2], SEG, 1);
    glow(stb > 0.5 ? c1 : c0, (0.62 + 0.3 * lv + 0.4 * stb) * gb * (full ? 1 : 0.8), R * (0.018 + 0.016 * L * wL));
    // scanning comet (two in thinking)
    const nc = wT > 0.5 ? 2 : 1, rr = R * (full ? 0.775 : 0.8);
    for (let j = 0; j < nc; j++) {
      const h = rot[6] + j * Math.PI;
      for (let i = 0; i < 8; i++) {
        g.beginPath(); g.arc(0, 0, rr, h - (i + 1) * 0.2, h - i * 0.2);
        g.lineWidth = R * 0.01; g.strokeStyle = col(c2, (1 - i / 8) * (1 - i / 8) * 0.8 * gb); g.stroke();
      }
      g.beginPath(); g.arc(rr * Math.cos(h), rr * Math.sin(h), R * 0.011, 0, TAU); g.fillStyle = col(c2, 0.95); g.fill();
    }
    // ripples
    for (let i = 0; i < rip.length; i++) {
      const q = rip[i], kk = (t - q[0]) / 1.3;
      if (kk < 0 || kk > 1) continue;
      const e = 1 - (1 - kk) * (1 - kk) * (1 - kk);
      circle(R * (q[1] > 0 ? (full ? 0.36 : 0.62) + (full ? 0.66 : 0.4) * e : 0.96 - (full ? 0.56 : 0.3) * e));
      glow(wA > 0.5 ? c0 : c2, q[2] * (1 - kk) * (1 - kk) * 0.7, 1.5);
    }
    if (wA > 0.02) {                       // alert: warning marks on the diagonals
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), r = R * 0.93, z = R * 0.045;
        g.moveTo((r - z) * ca, (r - z) * sa); g.lineTo(r * ca - z * 0.7 * sa, r * sa + z * 0.7 * ca); g.lineTo(r * ca + z * 0.7 * sa, r * sa - z * 0.7 * ca); g.closePath();
      }
      g.fillStyle = col(c1, wA * (0.3 + 0.7 * stb)); g.fill();
    }
    if (!full) return;

    // ---- the flat core (no WebGL): dotted ring, reactor coils, waveform, electrons, particles, lens
    g.beginPath(); g.arc(0, 0, R * 0.745, rot[4], rot[4] + TAU);
    g.setLineDash([1, R * 0.03]); g.lineWidth = 1.6; g.strokeStyle = col(c1, 0.55 * gb); g.stroke(); g.setLineDash([]);
    const r0 = R * (0.62 + 0.02 * L * wL), r1 = R * (0.71 + 0.03 * L * (wL + wS));
    const coil = (i) => {
      const a = rot[3] * 1.5 + i * TAU / 10, b = a + TAU / 10 * 0.74;
      g.moveTo(r1 * Math.cos(a), r1 * Math.sin(a)); g.arc(0, 0, r1, a, b); g.arc(0, 0, r0, b, a, true); g.closePath();
    };
    for (let i = 0; i < 10; i++) {
      const on = wS * L * (0.5 + 0.5 * Math.sin(i * 1.9 + t * 7)) + wL * L * 0.5 + wA * ((i + Math.floor(t * 2.5)) % 2 ? stb : 0.1) + 0.06 + 0.04 * br;
      g.beginPath(); coil(i); g.fillStyle = col(wA > 0.5 && i % 2 ? c1 : c0, on * 0.55 * gb); g.fill();
    }
    g.beginPath();
    for (let i = 0; i < 10; i++) coil(i);
    glow(c0, 0.55 * gb, 1);
    circle(R * 0.585); g.lineWidth = 1; g.strokeStyle = col(c0, 0.3 * gb); g.stroke();
    if (wL > 0.02) {                       // listening: three thin rings breathe with the level
      for (let i = 0; i < 3; i++) {
        const e = 0.5 + 0.5 * Math.sin(t * (3.1 + i * 1.7) + i * 2);
        circle(R * (0.455 + i * 0.05 + (0.025 + 0.02 * i) * L * e));
        glow(i === 1 ? c2 : c0, wL * (0.18 + 0.6 * L * e) * gb, 1);
      }
    }
    const nb = NB[tier], rb = R * (0.4 + 0.03 * br), amp = L * P[3];
    g.beginPath();
    for (let i = 0; i < nb; i++) {
      const a = -Math.PI / 2 + (i * TAU) / nb, m = Math.min(i, nb - i), q = m / (nb / 2), h = Math.sin(m * 12.9898) * 43758.5453 % 1;
      const s = (0.55 + 0.45 * Math.sin(q * 11 + t * 9.3) * Math.cos(q * 5.3 - t * 6.1)) * (0.55 + 0.45 * Math.sin(t * 13 + h * 40));
      const len = R * (0.012 + 0.24 * amp * s * (1.15 - 0.5 * q) + 0.03 * wT * (0.5 + 0.5 * Math.sin(i * 0.8 - t * 12)));
      const ca = Math.cos(a), sa = Math.sin(a), ri = rb - Math.min(len * 0.35, R * 0.05);
      g.moveTo(ri * ca, ri * sa); g.lineTo((rb + len) * ca, (rb + len) * sa);
      tips[i * 2] = (rb + len) * ca; tips[i * 2 + 1] = (rb + len) * sa;
    }
    g.lineCap = 'round';
    glow(wS > 0.5 ? c2 : c0, (0.55 + 0.4 * lv) * gb, Math.max(1, (TAU * rb / nb) * 0.38));
    g.lineCap = 'butt';
    if (tier > 1 && amp > 0.05) {
      g.beginPath(); g.moveTo(tips[0], tips[1]);
      for (let i = 2; i < nb * 2; i += 2) g.lineTo(tips[i], tips[i + 1]);
      g.closePath(); g.lineWidth = 1; g.strokeStyle = col(c0, clamp(amp * 2, 0, 0.7) * gb); g.stroke();
    }
    if (wT > 0.02) {                       // thinking: electrons on three orbits
      for (let i = 0; i < 3; i++) {
        const tilt = rot[5] * 0.3 + i * TAU / 3, rx = R * 0.56, ry = R * 0.17, ph = orb[i];
        g.beginPath(); g.ellipse(0, 0, rx, ry, tilt, 0, TAU); g.lineWidth = 1; g.strokeStyle = col(c1, 0.22 * wT); g.stroke();
        for (let j = 0; j < 4; j++) {
          g.beginPath(); g.ellipse(0, 0, rx, ry, tilt, ph - (j + 1) * 0.28, ph - j * 0.28);
          g.lineWidth = 2.2 - j * 0.4; g.strokeStyle = col(c2, (1 - j / 4) * 0.8 * wT); g.stroke();
        }
        const x = rx * Math.cos(ph), y = ry * Math.sin(ph), ct = Math.cos(tilt), sn = Math.sin(tilt);
        g.beginPath(); g.arc(x * ct - y * sn, x * sn + y * ct, R * 0.018, 0, TAU); g.fillStyle = col(c2, wT); g.fill();
      }
    }
    const np = NP[tier], pull = 1 - 0.18 * L * wL, push = 0.14 * L * wS, trail = Math.min(0.5, P[4] * 0.05);
    for (let b = 0; b < 3; b++) {
      g.beginPath();
      for (let i = b; i < np; i += 3) {
        const r = R * pr[i] * (pull + push * (0.5 + 0.5 * Math.sin(pa[i] * 3 + t * 6)) + wA * 0.03 * Math.sin(t * 40 + i));
        if (trail > 0.12) {
          const a = pa[i], len = trail * Math.abs(pw[i]) * 3, a0 = pw[i] > 0 ? a - len : a;
          g.moveTo(r * Math.cos(a0), r * Math.sin(a0)); g.arc(0, 0, r, a0, a0 + len);
        } else { const z = ps[i] * (0.7 + 0.3 * gb); g.rect(r * Math.cos(pa[i]) - z / 2, r * Math.sin(pa[i]) - z / 2, z, z); }
      }
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.2 + b * 0.7) + b * 2.1));
      if (trail > 0.12) { g.lineWidth = 1.2; g.strokeStyle = col(b ? c0 : c2, tw * 0.75 * gb); g.stroke(); }
      else { g.fillStyle = col(b ? c0 : c2, tw * 0.8 * gb); g.fill(); }
    }
    const cr = R * (0.33 + 0.025 * pulse * P[2] + 0.05 * L * (wS + 0.6 * wL) + 0.05 * fl);
    circle(cr); glow(c0, (0.85 + 0.15 * lv) * gb, R * 0.016);
    if (wT > 0.02) {
      g.beginPath();
      for (let j = 0; j < 2; j++) { const a = rot[6] * 1.7 + j * Math.PI; g.moveTo(cr * Math.cos(a), cr * Math.sin(a)); g.arc(0, 0, cr, a, a + 1.1); }
      glow(c2, wT, R * 0.022);
    }
    arcs(R * 0.22, -rot[4] * 1.4, [0, 0.13, 0.166, 0.13, 0.333, 0.13, 0.5, 0.13, 0.666, 0.13, 0.833, 0.13], 1);
    glow(c1, 0.6 * gb, R * 0.01);
    gr = g.createRadialGradient(0, 0, 0, 0, 0, cr * 1.15);
    const ci = clamp((0.75 + 0.25 * br + 0.45 * lv + 0.8 * fl + 0.4 * stb) * gb, 0, 1.4);
    gr.addColorStop(0, col(c2, ci)); gr.addColorStop(0.18, col(c2, ci * 0.85)); gr.addColorStop(0.45, col(cb, ci * 0.45)); gr.addColorStop(1, col(c0, 0));
    g.fillStyle = gr; g.fillRect(-cr * 1.15, -cr * 1.15, cr * 2.3, cr * 2.3);
  }

  // ---------------------------------------------------------------- API
  fit(); blend();
  if (still) snap(); else kick();
  return {
    setState(s) {
      const i = STATES.indexOf(s);
      if (dead || i < 0 || i === st) return;
      st = i;
      if (i === 4) flareAt = t;
      ring(1, i === 4 ? 1 : 0.5);
      if (r3) r3.burst(i);
      if (still) snap(); else kick();
    },
    setLevel(v) {
      if (dead) return;
      v = +v; lvIn = v > 0 ? (v > 1 ? 1 : v) : 0; lvAt = performance.now();
    },
    setTheme(th) {
      if (dead || !th || (typeof th === 'string' && !NAMED[th])) return;
      theme = themeOf(th); PAL = palette(theme); blend(); labKey = '';
      if (r3) { r3.theme(theme); rewarm(); }
      if (still) snap();
    },
    setDesign(name) {
      if (dead || DESIGNS.indexOf(name) < 0 || name === design) return;
      design = name;
      if (r3) { r3.design(name); rewarm(); }
      if (still) snap();
    },
    destroy() {
      if (dead) return;
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('scroll', onScroll, true); clearTimeout(scrollT);
      if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); }
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      clearTimeout(retry);
      drop3D();
      box.remove();
    },
    stats: () => ({ state: STATES[st], level: +L.toFixed(3), design, effects: EFFECTS[tier ? Math.min(tier, 3) : 1], tier, three, fps, ms: +ms0.toFixed(2),
      frames, frames3, running: !!raf, reduced: still, dpr, post: r3 ? r3.post() : null }),
  };
}

// ==================================================================== the 3D scene (Three.js)
const NOISE = `vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){ const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }
float fbm(vec3 p){ float f=0., a=.5; for(int i=0;i<OCT;i++){ f+=a*snoise(p); p*=2.03; a*=.5; } return f; }`;
const VN = 'varying vec3 vN, vP, vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }';
const VUV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const TAIL = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';

function makeReactor(T, RC, canvas, context, attrs, design0, tier0, theme0) {
  const ren = new T.WebGLRenderer(Object.assign({ canvas, context }, attrs));
  ren.setClearColor(0x000000, 0);
  ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 0.95; ren.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, 0.1, 200);
  cam.position.set(0, 2.1, 17.8); cam.lookAt(0, -0.35, 0);
  // the OLYMPUS render core on this renderer: the reactor keeps its own studio environment (tinted per theme), its own
  // effects tiers (the core's adapt() steps them) and its look (display space: its glows were tuned on screen colours);
  // a transparent canvas, so the bloom lights the page behind the core
  const rc = RC ? RC.createRenderer({ renderer: ren, scene, camera: cam, alpha: true, env: 'none', exposure: 0.95, space: 'display',
    quality: EFFECTS[tier0], adapt: false, autoSize: false, fitCamera: false, bloom: { strength: 0.25, radius: 0.5, threshold: 0.9 },
    grade: { vignette: 0, grain: 0.02, saturation: 1.1 } }) : null;
  const bloomTint = { tint: new T.Color() }, WHITE3 = new T.Color(1, 1, 1);
  // additive that keeps the canvas transparent (alpha untouched), so glows light the page behind instead of covering it
  const ADD = { transparent: true, depthWrite: false, blending: T.CustomBlending, blendSrc: T.SrcAlphaFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor };
  const K = { main: new T.Color(), acc: new T.Color(), hot: new T.Color(), core: new T.Color(), deep: new T.Color(), bad: new T.Color(1, 0.08, 0.15) };
  const KEYS = ['main', 'acc', 'hot', 'core', 'deep'];
  const U = { uT: { value: 0 }, uPix: { value: 500 }, uSw: { value: 0 }, uB: { value: 1 } };
  const OCT = tier0 > 2 ? 5 : tier0 > 1 ? 4 : 3;
  const tiny = tier0 < 2;
  let seed = 11, root = null, env = null, tier = tier0, bAcc = 0, shAcc = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, R = (a, b) => a + rnd() * (b - a);
  let glows, rings, bolts, shocks, sats, spin, parts, X;        // per design
  const dummy = new T.Object3D(), V = (x, y, z) => new T.Vector3(x, y, z);
  const gm = (key, k, boost, add) => { const m = new T.MeshBasicMaterial(add ? Object.assign({}, ADD, add) : {}); glows.push([m, key, k, boost || 0]); return m; };
  const sh = (fs, uniforms, x) => new T.ShaderMaterial(Object.assign({}, ADD, { uniforms, vertexShader: VN, fragmentShader: fs + TAIL }, x));
  // glow falloff for halo tubes / shells: bright where the surface faces you, fading to the silhouette
  const halo = (key, k, boost, p) => { const u = { c: { value: new T.Color() }, p: { value: p || 2 } }; glows.push([u.c, key, k, boost || 0, 1]);
    return sh('uniform vec3 c; uniform float p; varying vec3 vN, vP, vV; void main(){ gl_FragColor = vec4(c * pow(abs(dot(vN, vV)), p), 1.);', u); };
  const texs = [];
  function tex(n, paint) { const c = document.createElement('canvas'); c.width = c.height = n; paint(c.getContext('2d'), n); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; texs.push(t); return t; }
  const dot = tex(128, (g, n) => { const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); r.addColorStop(0, '#fff'); r.addColorStop(0.25, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, n, n); });
  const streak = tex(256, (g, n) => {
    const l = g.createLinearGradient(0, 0, n, 0); l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(0.5, '#fff'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; for (let k = 0; k < 6; k++) { g.globalAlpha = 0.18; g.fillRect(0, n / 2 - k, n, k * 2 + 1); }
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 4); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.globalAlpha = 0.6; g.fillStyle = r; g.fillRect(0, 0, n, n);
  });
  const sprite = (map, key, k, sx, sy, boost, dt) => { const m = new T.SpriteMaterial(Object.assign({}, ADD, { map, depthTest: !!dt })); glows.push([m, key, k, boost || 0]); const s = new T.Sprite(m); s.scale.set(sx, sy || sx, 1); s.renderOrder = 10; return s; };
  function inst(geo, mat, list) {
    const m = new T.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(p[3], 0, p[4], 'ZYX'); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    return m;
  }
  function envMap() {                      // studio reflections for the chrome: black room, strip lights, tinted panels
    const e = new T.Scene(), main = K.main.clone(), acc = K.acc.clone();
    const box = (w, h, c, i, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c.clone().multiplyScalar(i), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); e.add(m); };
    const w = new T.Color(1, 1, 1);
    box(14, 0.5, w, 9, 0, 7, 1); box(0.5, 12, w, 7, -7, 0, 4); box(0.6, 12, w, 6, 7, 1, 3); box(10, 0.4, w, 5, 0, -3, 8);
    box(9, 6, new T.Color(0.68, 0.64, 0.8), 1, 0, 3, 10); box(4, 3, main, 1.8, -5, -3, 9); box(6, 10, main, 3.2, -8, 0, -5); box(6, 10, acc, 2.4, 8, 0, -5); box(16, 4, main, 1.6, 0, -8, 0);
    const pm = new T.PMREMGenerator(ren), t = pm.fromScene(e, 0.015).texture;
    pm.dispose(); e.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    if (env) env.dispose();
    env = t; scene.environment = t;
  }
  function colours(th) {                   // the theme's idle colours, for building (per-frame colours come from the page state)
    const p = palette(th)[0];
    KEYS.forEach((k, i) => K[k].setRGB(p[i][0] / 255, p[i][1] / 255, p[i][2] / 255, T.SRGBColorSpace));
  }
  scene.add(new T.AmbientLight(0xffffff, 0.12));
  const key = new T.DirectionalLight(0xffffff, 1.4); key.position.set(3, 6, 8); scene.add(key);
  const rimA = new T.PointLight(0xffffff, 70, 30); rimA.position.set(-5, 2, -3); scene.add(rimA);
  const rimB = new T.PointLight(0xffffff, 45, 30); rimB.position.set(5, -1, -2); scene.add(rimB);
  const metal = new T.Color();

  // ---------------------------------------------------------------- shared pieces
  function particles(n, place, sz) {      // swirling points: aP = (radius, angle, height) when swirl, else xyz
    const p = new Float32Array(n * 3), s = new Float32Array(n), c = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { p.set(place(i), i * 3); s[i] = R(sz[0], sz[1]) * (rnd() < 0.03 ? 3 : 1); c[i * 2] = (rnd() * 4) | 0; c[i * 2 + 1] = R(0.6, 1.6); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aP', new T.BufferAttribute(p, 3));
    g.setAttribute('aS', new T.BufferAttribute(s, 1)); g.setAttribute('aC', new T.BufferAttribute(c, 2));
    g.boundingSphere = new T.Sphere(V(0, 0, 0), 12);
    const u = { uPix: U.uPix, uSw: U.uSw, uB: U.uB, uK: { value: 1 }, c0: { value: K.main }, c1: { value: K.hot }, c2: { value: K.acc } };
    const m = new T.ShaderMaterial(Object.assign({}, ADD, { uniforms: u,
      vertexShader: `attribute vec3 aP; attribute float aS; attribute vec2 aC; uniform float uPix, uSw, uK; uniform vec3 c0, c1, c2; varying vec3 vC;
        void main(){ float a = aP.y + uSw / pow(max(aP.x, .5), 1.5); vec3 p = uK > .5 ? vec3(cos(a) * aP.x, aP.z, sin(a) * aP.x) : aP;
          vC = (aC.x < .5 || aC.x > 2.5 ? c0 : aC.x < 1.5 ? c1 : c2) * aC.y;
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = aS * uPix / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform float uB; varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vC * a * a * .9 * uB, 1.);' + TAIL }));
    const pts = new T.Points(g, m); pts.frustumCulled = false; parts.push([g, n]); return [pts, u];
  }
  function bolt() {                        // a jagged lightning arc: a hot core tube inside a glow tube, regrown on each strike
    const b = new T.Group(); b.add(new T.Mesh(new T.BufferGeometry(), X.boltHot), new T.Mesh(new T.BufferGeometry(), X.boltGlow)); b.visible = false; b.life = 0; return b;
  }
  function strike(b, r0, r1) {
    const u = V(R(-1, 1), R(-1, 1), R(-0.2, 1)).normalize(), a = u.clone().multiplyScalar(r0), e = u.clone().multiplyScalar(R(r1[0], r1[1]));
    const d = e.clone().sub(a), p1 = V(0, 0, 0).crossVectors(d, V(0, 1, 0.3)).normalize(), p2 = V(0, 0, 0).crossVectors(d, p1).normalize(), pts = [], jit = R(0.12, 0.25);
    for (let i = 0; i <= 12; i++) { const k = i / 12, en = Math.sin(k * Math.PI); pts.push(a.clone().lerp(e, k).addScaledVector(p1, R(-1, 1) * jit * en).addScaledVector(p2, R(-1, 1) * jit * en)); }
    const cu = new T.CatmullRomCurve3(pts);
    b.children[0].geometry.dispose(); b.children[0].geometry = new T.TubeGeometry(cu, 28, 0.014, 4);
    b.children[1].geometry.dispose(); b.children[1].geometry = new T.TubeGeometry(cu, 28, 0.065, 5);
    b.life = R(0.12, 0.34);
  }
  function techRing(R0, tube, tilt, ns, gb) {     // chrome torus, energy strips, machined blocks and bolt heads (instanced)
    const piv = new T.Group(), tg = new T.Group(), sp = new T.Group();
    piv.add(tg); tg.add(sp); tg.rotation.set(tilt[0], tilt[1], tilt[2]);
    sp.add(new T.Mesh(new T.TorusGeometry(R0, tube, tiny ? 12 : 20, tiny ? 120 : 200), X.chrome));
    for (let i = 0; i < ns; i++) {
      const s = new T.Mesh(new T.TorusGeometry(R0 + tube * 0.84, tube * 0.24, 6, 60, TAU / ns * R(0.35, 0.8)), X.strip);
      s.rotation.z = i * TAU / ns + rnd(); sp.add(s);
    }
    sp.add(new T.Mesh(new T.TorusGeometry(R0, tube * 2.6, 8, 120), X.ringGlow));
    const Lz = [[], [], [], []], bl = new T.BoxGeometry(tube * 1.5, tube * 2.6, tube * 2.6), bo = new T.CylinderGeometry(tube * 0.35, tube * 0.35, tube * 2.9, 10);
    for (let i = 0; i < gb; i++) {
      const a = (i / gb) * TAU + 0.13, c = Math.cos(a), s = Math.sin(a), r1 = R0 + tube * 0.2;
      Lz[i % 4 ? 1 : 0].push([R0 * c, R0 * s, 0, 0, a]);
      if (i % 2 === 0) Lz[i % 4 ? 3 : 2].push([r1 * c, r1 * s, 0, Math.PI / 2, a]);
    }
    [[bl, X.chrome2], [bl, X.gun], [bo, X.boltH], [bo, X.boltM]].forEach((q, i) => { if (Lz[i].length) sp.add(inst(q[0], q[1], Lz[i])); });
    const a = rnd() * TAU, nd = new T.Mesh(new T.SphereGeometry(tube * 1.4, 16, 12), X.node); nd.position.set(Math.cos(a) * R0, Math.sin(a) * R0, 0); sp.add(nd);
    return { piv, tg, sp, tilt };
  }
  function floor(r, y, dialR) {           // grid floor, holographic projector dial, light pool and beam
    {
      const gu = { c: { value: new T.Color() } }; glows.push([gu.c, 'main', 0.2, 0, 1]);
      const grid = new T.Mesh(new T.PlaneGeometry(40, 40), new T.ShaderMaterial(Object.assign({}, ADD, { uniforms: gu, vertexShader: VUV, extensions: { derivatives: true },
        fragmentShader: `uniform vec3 c; varying vec2 vUv; void main(){ vec2 p = vUv * 40.; vec2 g = abs(fract(p - .5) - .5) / fwidth(p); float l = 1. - min(min(g.x, g.y), 1.);
          float d = length(vUv - .5) * 40.; gl_FragColor = vec4(c * l * smoothstep(10., 2.5, d), 1.);` + TAIL })));
      grid.rotation.x = -Math.PI / 2; grid.position.y = y + 0.01; r.add(grid); X.grid = grid;
    }
    const dt = tex(512, (g) => {
      const C = 256; g.strokeStyle = g.fillStyle = '#fff';
      const ring = (rr, w, a0, a1, al) => { g.globalAlpha = al; g.lineWidth = w; g.beginPath(); g.arc(C, C, rr, a0, a1); g.stroke(); };
      ring(250, 1.5, 0, 7, 0.9); ring(235, 0.8, 0, 7, 0.5); ring(165, 1, 0, 7, 0.6); ring(150, 5, 0.3, 1.9, 0.5); ring(150, 5, 2.4, 3.3, 0.5); ring(150, 5, 3.9, 5.6, 0.5);
      for (let i = 0; i < 180; i++) { const a = i * Math.PI / 90, l = i % 15 ? 7 : 17; g.globalAlpha = i % 15 ? 0.55 : 1; g.lineWidth = i % 15 ? 1 : 2; g.beginPath(); g.moveTo(C + Math.cos(a) * 234, C + Math.sin(a) * 234); g.lineTo(C + Math.cos(a) * (234 - l), C + Math.sin(a) * (234 - l)); g.stroke(); }
      for (let i = 0; i < 48; i++) { const a = i * Math.PI / 24; g.globalAlpha = 0.7; g.beginPath(); g.arc(C + Math.cos(a) * 197, C + Math.sin(a) * 197, i % 4 ? 1.5 : 3.5, 0, 7); g.fill(); }
    });
    const du = { t: { value: dt }, c: { value: new T.Color() } }; glows.push([du.c, 'dial', 1.25, 0, 1]);
    const dial = new T.Mesh(new T.PlaneGeometry(dialR * 2, dialR * 2), new T.ShaderMaterial(Object.assign({}, ADD, { uniforms: du, vertexShader: VUV,
      fragmentShader: 'uniform sampler2D t; uniform vec3 c; varying vec2 vUv; void main(){ gl_FragColor = vec4(c * texture2D(t, vUv).r, 1.);' + TAIL })));
    dial.rotation.x = -Math.PI / 2; dial.position.y = y + 0.02; r.add(dial);
    const pu = { c: { value: new T.Color() } }; glows.push([pu.c, 'dial', 0.8, 0, 1]);
    const pool = new T.Mesh(new T.PlaneGeometry(10, 10), new T.ShaderMaterial(Object.assign({}, ADD, { uniforms: pu, vertexShader: VUV,
      fragmentShader: 'uniform vec3 c; varying vec2 vUv; void main(){ float d = length(vUv - .5) * 2.; gl_FragColor = vec4(c * pow(max(0., 1. - d), 2.4), 1.);' + TAIL })));
    pool.rotation.x = -Math.PI / 2; pool.position.y = y + 0.03; r.add(pool);
    const bu = { c: { value: new T.Color() } }; glows.push([bu.c, 'dial', 0.07, 0, 1]);
    const h = -1.2 - y, beam = new T.Mesh(new T.CylinderGeometry(1.1, dialR * 0.95, h, 48, 1, true), new T.ShaderMaterial(Object.assign({}, ADD, { uniforms: bu, vertexShader: VUV, side: T.DoubleSide,
      fragmentShader: 'uniform vec3 c; varying vec2 vUv; void main(){ float v = vUv.y; gl_FragColor = vec4(c * (1. - v) * (1. - v) * (.85 + .15 * sin(vUv.x * 150.8)), 1.);' + TAIL })));
    beam.position.y = y + h / 2; r.add(beam);
    return dial;
  }
  function eq(d, rad, n) {
    const m = new T.InstancedMesh(new T.BoxGeometry(0.045, 1, 0.045), gm('hot', 1.3, 1, { opacity: 0.9 }), n);
    m.frustumCulled = false; d.add(m); X.eq = [m, rad, n];
  }
  function globe(r, rad) {                 // the hologram globe of the old scene: meridians and parallels
    const p = [], s = (a, b) => [rad * Math.sin(a) * Math.cos(b), rad * Math.cos(a), rad * Math.sin(a) * Math.sin(b)];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 48; j++) p.push(...s(j / 48 * TAU, i / 12 * Math.PI), ...s((j + 1) / 48 * TAU, i / 12 * Math.PI));
    for (let i = 1; i < 8; i++) for (let j = 0; j < 48; j++) p.push(...s(i / 8 * Math.PI, j / 48 * TAU), ...s(i / 8 * Math.PI, (j + 1) / 48 * TAU));
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    const m = new T.LineBasicMaterial(Object.assign({}, ADD, { opacity: 0.16 })); glows.push([m, 'main', 1, 0]);
    const l = new T.LineSegments(g, m); r.add(l); return l;
  }

  // ---------------------------------------------------------------- designs
  const BUILD = {
    reactor(r) {
      X.dial = floor(r, -3.95, 3.0);
      X.globe = globe(r, 5.4); X.globe.position.y = 0.3;
      const g = new T.Group(); g.position.y = 0.3; g.scale.setScalar(1.17); g.rotation.set(0.05, -0.2, 0); r.add(g);
      const cu = { cA: { value: K.deep }, cB: { value: K.core }, cH: { value: K.hot }, uT: U.uT, uB: U.uB };
      X.core = new T.Mesh(new T.IcosahedronGeometry(0.92, tiny ? 4 : 6), new T.ShaderMaterial({ uniforms: cu, vertexShader: VN,
        fragmentShader: '#define OCT ' + OCT + '\n' + NOISE + `uniform vec3 cA, cB, cH; uniform float uT, uB; varying vec3 vN, vP, vV;
        void main(){ vec3 p = normalize(vP); float n = fbm(p * 2.1 + vec3(3.7, 3.7 - uT * .16, 3.7)); float n2 = fbm(p * 5.3 - 1.9 + uT * .11);
          float veins = pow(1. - abs(snoise(p * 3.2 + n + uT * .23)), 6.); float fres = pow(1. - max(dot(vN, vV), 0.), 2.2);
          vec3 c = mix(cA, cB, smoothstep(-.35, .55, n)) * (.4 + .8 * smoothstep(.1, .8, n2));
          c += mix(cB, cH, .45) * veins * 1.05 * uB + cB * fres * .8 * uB; gl_FragColor = vec4(c, 1.);` + TAIL }));
      g.add(X.core);
      X.tori = [];
      for (let i = 0; i < 5; i++) { const m = new T.Mesh(new T.TorusGeometry(1.0 + i * 0.035, 0.012, 6, 140), X.hotLine); m.rotation.set(R(0, 3), R(0, 3), 0); g.add(m); X.tori.push(m); }
      const gu = { c: { value: K.core }, h: { value: K.hot }, a: { value: 0.85 } };
      g.add(new T.Mesh(new T.SphereGeometry(1.3, 48, 32), sh(`uniform vec3 c, h; uniform float a; varying vec3 vN, vP, vV;
        void main(){ float f = 1. - abs(dot(vN, vV)); float rim = pow(f, 2.6); vec3 ir = .5 + .5 * cos(6.2832 * (f * 1.3 + vec3(0., .33, .67)));
          gl_FragColor = vec4((c * rim * 1.1 + h * pow(f, 7.) * 1.3 + ir * rim * .2) * a, 1.);`, gu)));
      X.hex = new T.Mesh(new T.IcosahedronGeometry(1.48, 3), gm('main', 0.9, 0, { wireframe: true, opacity: 0.22 })); g.add(X.hex);
      rings = [techRing(2.05, 0.11, [1.15, 0.25, 0], 4, 14), techRing(2.62, 0.125, [0.35, 1.05, 0.4], 5, 18), techRing(3.2, 0.14, [1.6, 0, 0.75], 6, 22)];
      rings.forEach((q) => g.add(q.piv));
      bolts = []; for (let i = 0; i < (tiny ? 4 : 8); i++) { const b = bolt(); g.add(b); bolts.push(b); }
      X.bolt = [0.95, [1.9, 2.5]];
      const d = new T.Group(); d.rotation.set(0.28, 0, -0.22); g.add(d); X.disk = d;
      const n = tier > 2 ? 3200 : tier > 1 ? 1800 : 700;
      d.add(particles(n, () => [Math.pow(rnd(), 0.7) * 3.4 + 1.45, rnd() * TAU, 0], [0.03, 0.1])[0]);
      parts[parts.length - 1][0].attributes.aP.array.forEach((v, i, a) => { if (i % 3 === 2) a[i] = R(-0.06, 0.06) * a[i - 2] * 0.4; });
      const [dust, du] = particles(tier > 2 ? 700 : tier > 1 ? 400 : 160, () => [R(-6, 6), R(-3, 4.5), R(-6, 3)], [0.02, 0.07]); du.uK.value = 0; g.add(dust);
      shocks = []; for (let i = 0; i < 4; i++) { const m = new T.Mesh(new T.TorusGeometry(1, 0.02, 4, 96), gm('acc', 1, 0, { opacity: 0 })); m.rotation.x = Math.PI / 2; m.visible = false; m.t0 = -9; d.add(m); shocks.push(m); }
      eq(d, 1.72, tier > 1 ? 72 : 48);
      sats = [];
      for (let i = 0; i < 6; i++) {
        const o = new T.Group(), s = new T.Group(), rr = R(3.5, 4.0), dir = i % 2 ? -1 : 1; o.rotation.set(R(-1.1, 1.1), R(0, TAU), R(-0.5, 0.5)); o.add(s); s.rotation.z = rnd() * TAU;
        const c = new T.Mesh(i % 2 ? new T.OctahedronGeometry(0.12) : new T.BoxGeometry(0.15, 0.15, 0.15), X.chrome); c.position.x = rr;
        const tr = new T.Mesh(new T.TorusGeometry(rr, 0.012, 3, 40, 0.9), X.trail); tr.rotation.z = dir > 0 ? -0.9 : 0;
        s.add(c, tr); g.add(o); sats.push([s, c, R(0.25, 0.45) * dir]);
      }
      g.add(sprite(dot, 'core', 0.3, 9, 9, 2));
      g.add(sprite(dot, 'hot', 0.16, 3.4, 3.4, 2));
      X.flare = sprite(streak, 'hot', 0.5, 9, 2.2, 2); X.flare.position.set(0, 0.3, 1.8); r.add(X.flare);
      X.g = g;
    },
    singularity(r) {
      X.dial = floor(r, -3.7, 3.4);
      X.globe = globe(r, 5.4); X.globe.position.y = 0.2;
      const g = new T.Group(); g.position.y = 0.2; g.rotation.set(0.12, 0, 0); r.add(g);
      // event horizon: a black ball (opaque, hides what is behind) ringed by a thin photon ring and a lensing glow
      g.add(new T.Mesh(new T.SphereGeometry(1.15, 48, 32), new T.MeshBasicMaterial({ color: 0x000000 })));
      const pu = { c: { value: K.hot }, m: { value: K.main }, uT: U.uT, uB: U.uB };
      X.core = new T.Mesh(new T.PlaneGeometry(6.4, 6.4), new T.ShaderMaterial(Object.assign({}, ADD, { uniforms: pu, vertexShader: VUV, depthTest: false,
        fragmentShader: `uniform vec3 c, m; uniform float uT, uB; varying vec2 vUv;
        void main(){ vec2 p = (vUv - .5) * 6.4; float r = length(p), a = atan(p.y, p.x);
          float ring = exp(-pow((r - 1.22) * 9., 2.)) * (1.3 + .5 * sin(a * 3. - uT * 2.) * .3) * uB;
          float lens = exp(-pow((r - 1.25) * 2.2, 2.)) * .55 * (1. + .25 * sin(a * 5. + uT));
          float dop = .65 + .55 * cos(a - .35);
          vec3 col = (c * ring * 1.7 + m * lens) * dop * step(1.13, r);
          gl_FragColor = vec4(col, 1.);` + TAIL })));
      X.core.renderOrder = 3; X.core.position.set(0, 0.2, 0); X.core.quaternion.copy(cam.quaternion); r.add(X.core); X.bill = X.core;
      const d = new T.Group(); d.rotation.set(0.32, 0, -0.12); g.add(d); X.disk = d;
      const n = tier > 2 ? 4200 : tier > 1 ? 2400 : 900;
      d.add(particles(n, () => [Math.pow(rnd(), 1.6) * 3.6 + 1.35, rnd() * TAU, 0], [0.025, 0.09])[0]);
      parts[parts.length - 1][0].attributes.aP.array.forEach((v, i, a) => { if (i % 3 === 2) a[i] = R(-0.03, 0.03) * a[i - 2] * 0.3; });
      const disc = new T.Mesh(new T.RingGeometry(1.3, 4.6, 128, 1), new T.ShaderMaterial(Object.assign({}, ADD, { uniforms: { c: { value: K.main }, h: { value: K.hot }, uT: U.uT, uB: U.uB }, vertexShader: VUV, side: T.DoubleSide,
        fragmentShader: `uniform vec3 c, h; uniform float uT, uB; varying vec2 vUv;
        void main(){ vec2 p = vUv - .5; float r = length(p) * 2.; float a = atan(p.y, p.x);
          float sw = .5 + .5 * sin(a * 6. + r * 18. - uT * 1.6); float f = smoothstep(1., .3, r) * smoothstep(.27, .34, r);
          gl_FragColor = vec4(mix(c, h, smoothstep(.6, .3, r)) * f * (.35 + .65 * sw) * .55 * uB, 1.);` + TAIL })));
      disc.rotation.x = -Math.PI / 2; d.add(disc);
      const [dust, du] = particles(tier > 2 ? 700 : tier > 1 ? 400 : 160, () => [R(-6, 6), R(-3, 4.5), R(-6, 3)], [0.02, 0.07]); du.uK.value = 0; g.add(dust);
      rings = [techRing(2.5, 0.06, [1.35, 0.2, 0], 3, 0), techRing(3.1, 0.05, [0.5, 1.1, 0.3], 4, 0)];
      rings.forEach((q) => { q.piv.scale.setScalar(1); g.add(q.piv); });
      bolts = []; for (let i = 0; i < (tiny ? 3 : 6); i++) { const b = bolt(); g.add(b); bolts.push(b); }
      X.bolt = [1.3, [2.1, 2.9]];
      shocks = []; for (let i = 0; i < 4; i++) { const m = new T.Mesh(new T.TorusGeometry(1, 0.02, 4, 96), gm('hot', 1.2, 0, { opacity: 0 })); m.rotation.x = Math.PI / 2; m.visible = false; m.t0 = -9; d.add(m); shocks.push(m); }
      sats = [];
      const hs = sprite(dot, 'core', 0.7, 10, 10, 2, true); hs.position.z = -1.6; g.add(hs);
      X.flare = sprite(streak, 'hot', 0.45, 10, 2.4, 2, true); X.flare.position.set(0, 0.2, -1.5); r.add(X.flare);
      X.g = g;
    },
  };
  function free() {
    if (!root) return;
    scene.remove(root);
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    glows.forEach((q) => { if (q[0].dispose) q[0].dispose(); });
    ['chrome', 'chrome2', 'gun'].forEach((k) => X[k].dispose());
    texs.splice(2).forEach((x) => x.dispose());
  }
  function build(name) {
    free();
    glows = []; parts = []; rings = []; bolts = []; shocks = []; sats = []; spin = 0;
    X = { chrome: new T.MeshStandardMaterial({ metalness: 1, roughness: 0.08, envMapIntensity: 1.25 }), chrome2: new T.MeshStandardMaterial({ metalness: 1, roughness: 0.15, envMapIntensity: 1.25 }),
      gun: new T.MeshStandardMaterial({ color: 0x1c1a23, metalness: 0.9, roughness: 0.34, envMapIntensity: 0.55 }) };
    X.strip = gm('acc', 1.7, 1); X.boltH = gm('hot', 2.5, 1); X.boltM = gm('main', 0.85, 1); X.node = gm('hot', 3, 1);
    X.hotLine = gm('hot', 2.1, 2); X.trail = gm('acc', 1.4, 0, { opacity: 0.8 }); X.ringGlow = halo('acc', 0.14, 1, 2.5);
    X.boltHot = gm('hot', 3.8, 3); X.boltGlow = gm('main', 0.6, 3, { opacity: 1 });
    root = new T.Group(); scene.add(root);
    seed = 11; BUILD[name](root);
    quality(tier);
  }
  function quality(q) {
    tier = q;
    if (rc) rc.setQuality(EFFECTS[q]);
    parts.forEach(([g, n]) => g.setDrawRange(0, q > 1 ? n : Math.ceil(n * 0.45)));
    if (X.globe) X.globe.visible = false;
    if (X.grid) X.grid.visible = false;               // AGORA: no grid floor, no hologram globe
    if (X.dial) X.dial.visible = false;
  }
  colours(theme0); envMap(); build(design0);

  const tc = new T.Color(), tv = new T.Vector2(), PREC = [0.05, -0.04, 0.03], SPD = [0.26, -0.39, 0.157];
  let sz = [0, 0];
  return {
    render(F) {
      const W = F.W, L = F.L, dt = F.dt, t = F.t, wL = W[1], wT = W[2], wS = W[3], wA = W[4], C = F.C;
      KEYS.forEach((k, i) => K[k].setRGB(C[i][0] / 255, C[i][1] / 255, C[i][2] / 255, T.SRGBColorSpace));
      const B = [1, 1 + 1.6 * L * wL + 0.7 * wT + 2.2 * F.stb + 0.9 * L * wS, 1 + 0.6 * F.pulse + 0.8 * L * (wS + wL) + F.fl, 1 + wT + F.stb];
      K.dial = tc.copy(K.main).lerp(K.bad, wL * 0.85);
      for (let i = 0; i < glows.length; i++) { const q = glows[i]; (q[4] ? q[0].value : q[0].color).copy(K[q[1]]).multiplyScalar(q[2] * B[q[3]]); }
      metal.copy(K.hot).lerp(K.main, 0.15).lerp(K.bad, wA * 0.55);
      X.chrome.color.copy(metal); X.chrome2.color.copy(metal);
      rimA.color.copy(K.main); rimB.color.copy(K.acc);
      U.uT.value = t; U.uB.value = 0.75 + 0.3 * F.pulse + 0.7 * L * (wS + 0.6 * wL) + 0.35 * wT + 1.1 * F.fl + 0.6 * F.stb;
      U.uSw.value += dt * 0.35 * F.P[4];
      U.uPix.value = 900 * ren.getDrawingBufferSize(tv).y / 1024;
      // motion: gimbal spin (old orb: 24 s / 16 s reversed / 40 s; thinking ~8x), the core breathes with the pulse and the voice
      const s = F.P[0];
      rings.forEach((q, i) => {
        q.piv.rotation.y += dt * PREC[i] * s; q.sp.rotation.z += dt * SPD[i] * s;
        q.tg.rotation.x = q.tilt[0] + wT * 0.22 * Math.sin(t * 2.1 + i * 2);
        q.piv.scale.setScalar(1 + 0.07 * L * wL * (1 + 0.4 * Math.sin(t * 9 + i * 2)) + 0.05 * F.fl);
      });
      if (X.core && !X.bill) { X.core.scale.setScalar(1 + 0.07 * F.pulse * (1 - wS) + 0.17 * L * (wS + 0.5 * wL) + 0.1 * F.fl); X.core.rotation.y += dt * 0.1 * (1 + 2 * wT); }
      if (X.tori) X.tori.forEach((m, i) => { m.rotation.x += dt * (0.2 + 0.05 * i) * (1 + 3 * wT); m.rotation.y += dt * 0.13 * (1 + 3 * wT); });
      if (X.hex) X.hex.rotation.y -= dt * 0.05 * (1 + 4 * wT);
      if (X.globe) X.globe.rotation.y += dt * 0.03 * (1 + 2 * wT);
      X.dial.rotation.z += dt * (0.12 + 1.6 * wL + 0.6 * wT);
      sats.forEach((q) => { q[0].rotation.z += dt * q[2] * (1 + 6 * wT + wA); q[1].rotation.x += dt * 1.3; q[1].rotation.y += dt * 0.9; });
      X.flare.scale.set(9 * (1 + 0.35 * L * wS + 0.6 * F.fl + 0.2 * F.stb), 2.2 * (1 + 0.5 * F.fl), 1);
      if (X.eq) {                         // the voice crown: a mirrored spectrum, tiny at rest, tall while speaking
        const [m, rad, n] = X.eq, amp = L * F.P[3];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU, q = Math.min(i, n - i) / (n / 2), h = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
          const v = (0.55 + 0.45 * Math.sin(q * 11 + t * 9.3) * Math.cos(q * 5.3 - t * 6.1)) * (0.55 + 0.45 * Math.sin(t * 13 + h * 40));
          dummy.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad); dummy.rotation.set(0, -a, 0); dummy.scale.set(1, 0.04 + 1.5 * amp * v + 0.05 * wT, 1);
          dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
      }
      // lightning: a few strikes a second at rest, a storm while thinking or on alert
      bAcc += dt * F.P[7] * (tier > 1 ? 1 : 0.5);
      for (const b of bolts) {
        if (bAcc >= 1 && b.life <= 0) { bAcc -= 1; strike(b, X.bolt[0], X.bolt[1]); }
        b.life -= dt; b.visible = b.life > 0 && rnd() > 0.2;
      }
      if (bAcc > 1) bAcc = 1;
      // shock rings: outward while speaking (with the voice) and on alert, inward while listening
      shAcc += dt * (wS * (0.25 + 2.4 * L) + wA * 1.25 + wL * (0.2 + 1.6 * L));
      if (shAcc >= 1) { shAcc = 0; const m = shocks.find((x) => !x.visible) || shocks[0]; m.t0 = t; m.dir = wL > 0.5 ? -1 : 1; m.visible = true; }
      shocks.forEach((m) => {
        const k = (t - m.t0) / 1.2;
        if (k < 0 || k > 1) { m.visible = false; return; }
        const e = 1 - (1 - k) * (1 - k);
        m.scale.setScalar(m.dir > 0 ? 1.4 + 3.2 * e : 4 - 2.5 * e); m.material.opacity = Math.pow(Math.sin(k * Math.PI), 1.5) * 0.75;
      });
      if (rc) { bloomTint.tint.copy(WHITE3).lerp(K.core, 0.7); rc.setBloom(bloomTint); rc.render(); }   // the glow takes the state's colour
      else ren.render(scene, cam);
    },
    size(w, d) {
      if (w === sz[0] && d === sz[1]) return;
      sz = [w, d];
      if (rc) rc.resize(w, w); else { ren.setPixelRatio(d); ren.setSize(w, w, false); }
    },
    quality,
    /** the render core's stats (passes, bloom, MSAA / FXAA), or null when it is missing */
    post: () => (rc ? rc.stats() : null),
    sleep: () => { if (rc) rc.suspend(); },
    wake: () => { if (rc) rc.resume(); },
    asleep: () => !!(rc && rc.asleep()),
    burst(i) { if (i === 4) bAcc = 3; },
    theme(th) { colours(th); envMap(); },
    design(name) { build(name); },
    dispose() {
      free(); texs.forEach((x) => x.dispose()); if (env) env.dispose();
      if (rc) rc.dispose();
      ren.dispose(); if (!context.isContextLost()) ren.forceContextLoss();
    },
  };
}
