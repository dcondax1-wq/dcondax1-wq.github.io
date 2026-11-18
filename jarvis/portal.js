// Jarvis portal jump (jarvis/portal.js, 2026-11-03; docs/OLYMPUS_RENDER.md): the transition every time Jarvis opens an app.
// A full-screen WebGL warp in the app's colour: tunnel streaks rushing past, a ring portal opening at the centre, a flash,
// then the app revealed through the ring. About 820 ms; a tap or a key skips it. It never waits for anything: show() opens
// the app's frame first and the warp plays over it while it loads. Reduced motion or 3D effects off: a 0.2 s fade instead.
// One fragment shader on raw WebGL (no three.js, nothing to load: the program is compiled at idle after the boot), its glow
// analytic (exp falloffs), one draw per frame. No WebGL: the fade.
// Since 2026-11-04 (job 32) every jump goes to jarvis/transitions.js when it is loaded (each app has its own signature transition;
// opts.from = the app we leave); this file's warp is the fallback when that file is missing or fails, and it keeps the state below.
//   window.jarvisPortal.jump({ id, name, color, glyph }, { at, from })   -> the mode played: 'warp' | 'fade' | 'none'
//     at = 0..1: hold that one frame of the warp until skip() (screenshots, tests)
//   window.__jarvisPortal = { runs, mode, app, ms, active }  (the tests)

const DURATION = 820, FADE = 200, STYLE_ID = 'jportal-css';
const FS = `precision highp float;
uniform vec2 uRes; uniform float uT; uniform vec3 uA;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(p), a = atan(p.y, p.x) / 6.28318 + 0.5, t = uT;
  float travel = t * t * 7.0 + t * 1.2;                         // the jump accelerates
  // tunnel streaks: 120 angular lanes, each a dash rushing outward at its own pace
  float lanes = 120.0, id = floor(a * lanes), h = hash(id), h2 = hash(id + 31.0);
  float lane = 1.0 - smoothstep(0.0, 0.08 + 0.22 * h2, abs(fract(a * lanes) - 0.5));
  float depth = 0.35 / (r + 0.03);
  float s = fract(depth * (0.6 + h) - travel * (0.7 + 0.9 * h));
  float dash = smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.04, 0.18 + 0.5 * t, s));
  float streaks = lane * dash * smoothstep(0.03, 0.3, r) * (0.25 + 2.2 * t) * step(0.35, h2 + t) * (1.0 - smoothstep(0.66, 0.92, t));
  // the ring portal: opens from the centre, its edge hot, a soft halo around it
  float R = mix(0.03, 1.5, smoothstep(0.18, 0.8, t));
  float edge = exp(-pow((r - R) * mix(70.0, 16.0, t), 2.0));
  float halo = exp(-abs(r - R) * 9.0) * 0.35;
  float flash = exp(-pow((t - 0.6) * 11.0, 2.0));
  float open = smoothstep(0.45, 0.62, t), inside = 1.0 - smoothstep(R - 0.09, R + 0.01, r);
  float cover = smoothstep(0.0, 0.16, t) * (1.0 - open * inside) * (1.0 - smoothstep(0.86, 1.0, t));
  vec3 hot = mix(uA, vec3(1.0), 0.55);
  vec3 glow = uA * streaks * 1.3 + hot * (edge * 2.4 + halo) * (1.0 - smoothstep(0.9, 1.0, t)) + vec3(1.0) * flash * 0.9 * (1.0 - r * 0.5);
  vec3 bg = mix(vec3(0.004, 0.004, 0.012), uA * 0.08, smoothstep(0.9, 0.0, r));
  gl_FragColor = vec4(bg * cover + glow * (0.35 + 0.65 * cover), cover);   // premultiplied: glow outside the cover adds light
}`;
const VS = 'attribute vec2 aP; void main() { gl_Position = vec4(aP, 0.0, 1.0); }';
const CSS = `
.jportal { position: fixed; inset: 0; z-index: 9000; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; }
.jportal canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.jportal-fade { position: fixed; inset: 0; z-index: 9000; pointer-events: none; background: radial-gradient(circle at 50% 46%, var(--jp-c) 0%, #02020a 62%);
  opacity: .55; transition: opacity .2s ease-out; }
.jportal-name { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%) scale(.82); text-align: center; pointer-events: none;
  font: 600 13px/1.4 "Georgia", "Georgia", system-ui, sans-serif; letter-spacing: .05em; color: #f3ece0; opacity: 0;
  text-shadow: none; animation: jportal-name ${DURATION}ms cubic-bezier(.3, .7, .2, 1) forwards; }
.jportal-name b { display: block; font-size: 34px; letter-spacing: .05em; margin-bottom: 6px; }
@keyframes jportal-name { 0% { opacity: 0; transform: translateY(-50%) scale(.7); } 30% { opacity: 1; } 62% { opacity: 1; transform: translateY(-50%) scale(1.02); }
  100% { opacity: 0; transform: translateY(-50%) scale(1.5); } }
`;

const state = (window.__jarvisPortal = { runs: 0, mode: '', app: '', ms: 0, active: false });
let gl = null, prog = null, loc = null, wrap = null, canvas = null, raf = 0, endT = 0, t0 = 0, rgb = [0.66, 0.33, 0.97];

const reduced = () => {
  const fx = document.documentElement.dataset.fx;
  try { return fx === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return fx === 'off'; }
};
function css() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
const toLinear = (h) => {
  const n = parseInt(String(h || '#9c6b3c').replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0x9c6b3c;
  return [n >> 16 & 255, n >> 8 & 255, n & 255].map((c) => Math.pow(c / 255, 2.2));
};

// ------------------------------------------------------------------ the GL program (compiled once, kept for the next jump)
function setup() {
  if (gl && !gl.isContextLost()) return true;
  canvas = document.createElement('canvas');
  const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
  gl = canvas.getContext('webgl', opts);
  if (!gl) return false;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
  if (!v || !f) { gl = null; return false; }
  prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return false; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle covers the screen
  const aP = gl.getAttribLocation(prog, 'aP'); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
  loc = { res: gl.getUniformLocation(prog, 'uRes'), t: gl.getUniformLocation(prog, 'uT'), a: gl.getUniformLocation(prog, 'uA') };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); finish(); gl = null; });
  return true;
}

function draw(t) {
  const d = Math.min(1.5, window.devicePixelRatio || 1), w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.uniform2f(loc.res, w, h); gl.uniform1f(loc.t, t); gl.uniform3f(loc.a, rgb[0], rgb[1], rgb[2]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function frame(now) {
  raf = 0;
  if (!state.active) return;
  const t = Math.min(1, (now - t0) / DURATION);
  draw(t);
  if (now >= endT || t >= 1) { finish(); return; }
  raf = requestAnimationFrame(frame);
}
function finish() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (state.active) state.ms = Math.round(performance.now() - t0);
  state.active = false;
  if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
  wrap = null;
  if (canvas) { canvas.width = canvas.height = 1; }      // the full-screen backing store goes back; the program stays for the next jump
}
const skip = (e) => { if (e) e.preventDefault(); if (state.active) endT = 0; finish(); };

function fade(color) {
  css();
  const f = document.createElement('div');
  f.className = 'jportal-fade'; f.setAttribute('aria-hidden', 'true'); f.style.setProperty('--jp-c', color);
  document.body.appendChild(f);
  requestAnimationFrame(() => { f.style.opacity = '0'; });
  setTimeout(() => f.remove(), FADE + 60);
  state.ms = FADE;
}

/** play the jump into this app; returns the mode played */
export function jump(app, opts) {
  const a = app || {}, color = a.color || '#9c6b3c', at = opts && typeof opts.at === 'number' ? Math.max(0, Math.min(1, opts.at)) : null;
  state.runs++; state.app = a.id || ''; state.ms = 0;
  if (!document.body) return (state.mode = 'none');
  finish();                                         // a second jump replaces the first
  const T = window.jarvisTransitions;               // transitions.js (2026-11-04): this app's own signature transition, played over the loading app
  if (T) {
    let m = '';
    try {
      m = T.play(a, { from: opts && opts.from, at, done: (ms) => { state.active = false; state.ms = ms; } });
      const ts = window.__jarvisTransitions || {};
      state.active = m === 'warp' && !!ts.active; if (m === 'fade') state.ms = ts.ms;
    } catch (e) { m = ''; }
    if (m) return (state.mode = m);
  }
  if (reduced() || !setup()) { fade(color); return (state.mode = 'fade'); }
  css();
  rgb = toLinear(color);
  wrap = document.createElement('div');
  wrap.className = 'jportal'; wrap.setAttribute('aria-hidden', 'true'); wrap.style.setProperty('--jp-c', color);
  wrap.appendChild(canvas);
  const name = document.createElement('div');
  name.className = 'jportal-name';
  const g = document.createElement('b'); g.textContent = a.glyph || '';
  if (a.glyph) name.appendChild(g);
  name.appendChild(document.createTextNode((a.name || '').toUpperCase()));
  wrap.appendChild(name);
  wrap.addEventListener('pointerdown', skip);
  document.body.appendChild(wrap);
  state.active = true;
  t0 = performance.now(); endT = t0 + DURATION;
  if (at !== null) { name.style.animation = 'none'; name.style.opacity = at > 0.15 && at < 0.8 ? '1' : '0'; draw(at); return (state.mode = 'warp'); }
  draw(0);
  raf = requestAnimationFrame(frame);
  return (state.mode = 'warp');
}

/** compile the shader before the first jump (at idle), so the first portal starts on the next frame */
export function warm() { if (!reduced() && !window.jarvisTransitions) setup(); }   // transitions.js draws on a 2D canvas: no GL context kept for the old warp

document.addEventListener('keydown', (e) => { if (state.active && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) skip(e); });
document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
window.jarvisPortal = { jump, warm, skip: () => { skip(); try { if (window.jarvisTransitions) window.jarvisTransitions.skip(); } catch (e) { /* optional */ } } };
(window.requestIdleCallback || ((cb) => setTimeout(cb, 1200)))(() => warm());
