/* THE BRAIN, the 3D scene (brain/brain-scene.js, ES module, loaded after the first paint by brain.js; day-brain-app 2026-11-24).
 * One huge living brain at night: two folded hemispheres + a cerebellum and stem of glowing neurons (additive point sprites, OLYMPUS NIGHT),
 * cut into six regions (each a brain of its own: LIT, ATLAS, BLITZ, ORDER FLOW, MARKET LEARN, RISK). Synapses link nearby neurons; signals
 * run along them (more when a region is busier), a region FIRES (a wave from its centre) on every new thinking line, and the camera flies
 * into a region on a tap.
 * three.js r160 from cdnjs (pinned 0.160.0), else the site's own copy (../jarvis/three.module.min.js), as pillars/pillars-scene.js does.
 *   create(canvas, regions, cfg) -> Promise<api | null>
 *     regions = [{ id, color }]   cfg = { onPick(id), reduce, low, localFirst, onFrame() }
 *     api = { fly(id | null), fire(id, n), setPulse({id: 0..1}), project(id) -> {x, y, z, vis}, stats(), dispose(), THREE }
 * day-pillars4 (the Pillars temple's quality bar): HDR bloom (bright pass + 4-level blur, ACES, vignette, grain), a soft volumetric glow per
 * region (brighter with its pulse / a fire / the focus), tracts between the regions with signals travelling both ways, bright cell bodies
 * among the neurons, GPU-driven dust, a fly-in that eases out and settles (a small orbit + push-in), and depth of field on the region in
 * focus (points away from its depth grow into soft discs; hq only). ~8 draws in the scene pass.
 * Quality steps: 0 hq (bloom, DPR <= 2, ~8,000 neurons, depth of field) -> 1 DPR 1.25 -> 2 no bloom -> 3 low (DPR 1, ~2,600 neurons, fewer
 * tracts / dust, 30 fps). Starts low on Save-Data, ?lite=1, <= 2 cores / 2 GB or a software GL renderer (SwiftShader / llvmpipe); steps down
 * by itself on slow frames (a terrible frame time jumps straight to low). ?fx=hq pins hq. Shaders compile with compileAsync before the first
 * frame. Reduced motion: no drift, no signals, a still frame redrawn on touch. Paused on a hidden tab or when the canvas is off screen.
 * Read only: draws, sends nothing. */
export const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
const THREE_LOCAL = '../jarvis/three.module.min.js';
async function loadThree(localFirst) {
  for (const u of localFirst ? [THREE_LOCAL, THREE_CDN] : [THREE_CDN, THREE_LOCAL]) { try { const m = await import(u); if (m && m.WebGLRenderer) return m; } catch (_) { /* the next */ } }
  return null;
}
export function isLowPower(w) {
  const n = (w && w.navigator) || {}, q = String((w && w.location && w.location.search) || '');
  if (/[?&]fx=(hq|3d)/.test(q)) return false;
  if (/[?&]lite=1/.test(q)) return true;
  return (+n.hardwareConcurrency > 0 && +n.hardwareConcurrency <= 2) || (+n.deviceMemory > 0 && +n.deviceMemory <= 2) || !!(n.connection && n.connection.saveData);
}

// where each region sits in the brain (x right, y up, z to the viewer: the front of the brain faces +z)
export const CENTERS = {
  lit: [-1.15, 0.55, 1.05],      // left frontal lobe
  atlas: [1.15, 0.55, 1.05],     // right frontal lobe
  blitz: [1.25, 0.35, -0.95],    // right parietal / occipital
  of: [-1.25, 0.35, -0.95],      // left parietal / occipital
  learn: [0, 1.45, 0],           // the crown (the shared learner sits over both hemispheres)
  risk: [0, -1.05, -0.85],       // cerebellum + stem (the oldest part: keeps the body alive)
};
const RS = [1.62, 1.28, 1.95];   // a hemisphere's radii

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** the neurons: on a folded surface (gyri) of two hemispheres + a cerebellum + a stem, each tagged with its nearest region */
function neurons(n, R, ids) {
  const P = [], reg = [], ph = [];
  const fold = (x, y, z) => 1 + 0.075 * Math.sin(x * 5.1 + Math.sin(z * 3.3) * 1.6) * Math.cos(y * 4.4 + z * 2.1) + 0.04 * Math.sin(z * 7.7 + y * 3.1);
  const nearest = (x, y, z) => { let b = 0, bd = 1e9; ids.forEach((id, i) => { const c = CENTERS[id]; const d = (x - c[0]) ** 2 + (y - c[1]) ** 2 * 1.2 + (z - c[2]) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  for (let i = 0; i < n; i++) {
    const kind = R();
    let x, y, z;
    if (kind < 0.86) {                                  // a hemisphere: a point on the ellipsoid, pushed in / out by the folds, a few inside
      const side = R() < 0.5 ? -1 : 1, u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      let dx = s * Math.cos(a), dy = u, dz = s * Math.sin(a);
      if (dx * side < -0.15) dx = -dx;                  // keep to its own side (the fissure between)
      const depth = R() < 0.82 ? 1 : 0.55 + R() * 0.4, f = fold(dx, dy, dz) * depth;
      x = side * 0.1 + dx * RS[0] * f * 0.62 + side * 0.58; y = dy * RS[1] * f + 0.25; z = dz * RS[2] * f;
      if (y < -0.55) y = -0.55 - (y + 0.55) * 0.25;   // a flatter base
    } else if (kind < 0.96) {                           // the cerebellum: a small folded ball under the back
      const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), f = 1 + 0.08 * Math.sin(u * 22);
      x = s * Math.cos(a) * 0.95 * f; y = u * 0.42 * f - 0.95; z = s * Math.sin(a) * 0.62 * f - 1.05;
    } else {                                            // the stem
      const a = R() * Math.PI * 2, h = R();
      x = Math.cos(a) * 0.22 * (1 - h * 0.3); y = -0.6 - h * 1.15; z = Math.sin(a) * 0.22 - 0.35 - h * 0.25;
    }
    P.push(x, y, z); reg.push(nearest(x, y, z)); ph.push(R() * Math.PI * 2);
  }
  return { P: new Float32Array(P), reg: new Float32Array(reg), ph: new Float32Array(ph) };
}

/** synapses: each neuron to 1-2 neighbours of its own region within reach (a coarse grid keeps it fast) */
function synapses(P, reg, maxE, R) {
  const n = P.length / 3, cell = 0.34, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < n; i++) { const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  const E = [];
  for (let s = 0; s < n * 3 && E.length < maxE; s++) {
    const i = Math.floor(R() * n), x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = -1, bd = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const j of grid.get(`${cx + a},${cy + b},${cz + c}`) || []) {
        if (j === i || reg[j] !== reg[i]) continue;
        const d = (P[j * 3] - x) ** 2 + (P[j * 3 + 1] - y) ** 2 + (P[j * 3 + 2] - z) ** 2;
        if (d > 0.012 && d < bd && R() < 0.7) { bd = d; best = j; }
      }
    }
    if (best >= 0 && bd < 0.11) E.push(i, best);
  }
  return E;
}

function glowTex(THREE, soft) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(soft ? 0.12 : 0.22, 'rgba(255,255,255,.75)'); r.addColorStop(soft ? 0.45 : 0.5, 'rgba(255,255,255,.16)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- shaders (day-pillars4: the Pillars temple's quality bar: HDR bloom, region glows, travelling tract pulses, GPU dust, point depth of field) ----
// depth of field on points: a neuron / mote away from the focused region's depth grows into a soft, dimmer disc (bokeh), hq only
const DOF_GLSL = `uniform float uDof; uniform float uFocusZ; uniform float uRange;
float cocOf(float vz){ float c = clamp(abs(vz - uFocusZ) / uRange - .18, 0., 1.); return c * c * (3. - 2. * c) * uDof; }`;
const NEURON_VS = `attribute float aReg; attribute float aPh; attribute float aSz; uniform float uTime; uniform float uPx; uniform float uPulse[6]; uniform vec4 uFire[6]; uniform float uFocus; uniform float uSel;
varying vec3 vCol; varying float vA; varying float vCoc; uniform vec3 uCol[6];
${DOF_GLSL}
void main(){
  int r = int(aReg + .5); float pulse = uPulse[r]; vec4 F = uFire[r];
  vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
  float flick = .55 + .45 * sin(uTime * (1.3 + pulse * 2.6) + aPh * 3.);
  float wave = 0.; if (F.w > 0.) { float d = distance(position, F.xyz); float front = (uTime - F.w) * 2.4; wave = exp(-pow((d - front) * 3.2, 2.)) * max(0., 1. - (uTime - F.w) / 1.6); }
  float dim = (uSel >= 0. && abs(float(r) - uSel) > .5) ? (1. - .62 * uFocus) : 1.;
  float soma = step(1.5, aSz);                                   // the bright cell bodies among the field
  float coc = cocOf(-mv.z); vCoc = coc;
  vA = (.2 + .45 * pulse * flick + 1.5 * wave) * dim * (1. - .12 * uFocus) * (1. + soma * (.35 + .35 * flick)) / (1. + coc * 2.2);
  vCol = mix(uCol[r], vec3(1.), clamp(wave * .7 + soma * .22, 0., .75));
  float ps = uPx * aSz * (1. + 1.6 * wave + .3 * pulse) * min(3.2 / -mv.z, .82) * (1. + coc * 1.5);
  gl_PointSize = vA < .012 ? 0. : min(ps, uPx * 1.25);   // capped (fill rate on a phone): up close a region stays a field of points
}`;
const NEURON_FS = `uniform sampler2D uTex; varying vec3 vCol; varying float vA; varying float vCoc;
void main(){ vec4 t = texture2D(uTex, gl_PointCoord); float d = length(gl_PointCoord - .5) * 2.;
  float disc = (1. - smoothstep(.6, 1., d)) * .32;                // a blurred neuron reads as a soft disc, not a dot
  float a = mix(t.a, disc, vCoc); gl_FragColor = vec4(vCol * vA * 1.35, a * min(1., vA)); }`;
// a soft volumetric glow per region: billboard quads (one draw), brighter with its pulse / a fire / the focus
const GLOW_VS = `attribute vec2 aCorner; attribute vec2 aRK; uniform vec3 uCol[6]; uniform float uPulse[6]; uniform float uBoost[6]; uniform float uTime; uniform float uSel; uniform float uFocus;
varying vec2 vQ; varying vec3 vC; varying float vA;
void main(){ int r = int(aRK.x + .5); float p = uPulse[r]; float big = aRK.y;
  float sel = (uSel >= 0. && abs(float(r) - uSel) < .5) ? 1. : 0.;
  float breathe = .86 + .14 * sin(uTime * (.55 + p) + float(r) * 1.7);
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  float size = mix(.9, 2.15, big) * (.85 + .35 * p + .25 * uBoost[r]) * (1. + .15 * sel * uFocus);
  mv.xy += aCorner * size; gl_Position = projectionMatrix * mv;
  vQ = aCorner; vC = mix(uCol[r], vec3(1.), .08 * (1. - big));
  vA = mix(.09, .045, big) * (.45 + .9 * p + .9 * uBoost[r] + .55 * sel * uFocus) * breathe * ((uSel >= 0. && sel < .5) ? 1. - .55 * uFocus : 1.); }`;
const GLOW_FS = `varying vec2 vQ; varying vec3 vC; varying float vA; void main(){ float d = length(vQ); if (d > 1.) discard; float a = exp(-d * d * 3.6) * (1. - d * d); gl_FragColor = vec4(vC * vA * a, 0.); }`;
// tracts: arcs between the regions, signals travelling both ways (faster and brighter when the regions are busy / just fired)
const TRACT_VS = `attribute float aT; attribute vec3 aSD; uniform vec3 uCol[6]; uniform float uPulse[6]; uniform float uBoost[6]; uniform float uTime; uniform float uSel; uniform float uFocus;
varying vec3 vC; varying float vA;
void main(){ int s = int(aSD.x + .5); int d = int(aSD.y + .5); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  float act = .5 * (uPulse[s] + uPulse[d]) + uBoost[s] + .5 * uBoost[d];
  float sp = .16 + .3 * act; float h1 = fract(uTime * sp + aSD.z); float h2 = fract(-uTime * sp * .8 + aSD.z * 1.7);
  float g = exp(-pow((aT - h1) * 15., 2.)) + .7 * exp(-pow((aT - h2) * 15., 2.));
  float onSel = (uSel >= 0. && (abs(float(s) - uSel) < .5 || abs(float(d) - uSel) < .5)) ? 1. : 0.;
  vC = mix(mix(uCol[s], uCol[d], aT), vec3(1.), g * .35);
  vA = (.03 + g * (.3 + .9 * act)) * sin(3.14159 * aT) * (1. + onSel * uFocus * .9) * ((uSel >= 0. && onSel < .5) ? 1. - .65 * uFocus : 1.); }`;
const TRACT_FS = `varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC * vA * 1.6, vA); }`;
// dust drifting through the night around the brain (moved on the GPU: no CPU per frame)
const DUST_VS = `attribute vec4 aD; uniform float uTime; uniform float uPx; varying float vA; varying vec3 vC; varying float vCoc;
${DOF_GLSL}
void main(){ vec3 p = (aD.xyz - .5) * vec3(13., 7.5, 13.);
  p.y = mod(p.y + 3.75 + uTime * (.035 + aD.w * .05), 7.5) - 3.75; p.x += sin(uTime * .2 + aD.w * 20.) * .3; p.z += cos(uTime * .17 + aD.w * 13.) * .3;
  vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
  float coc = cocOf(-mv.z); vCoc = coc;
  vA = (.3 + .25 * sin(uTime * (.7 + aD.w) + aD.x * 40.)) * smoothstep(3.75, 2.6, abs(p.y)) / (1. + coc * 1.6);
  vC = aD.w > .78 ? vec3(.95, .76, .29) : aD.w > .55 ? vec3(.79, .65, 1.) : vec3(.62, .35, .93);
  gl_PointSize = clamp((.03 + aD.w * .035) * uPx / max(.1, -mv.z) * (1. + coc * 2.), 1., 20.); }`;
const DUST_FS = `varying float vA; varying vec3 vC; varying float vCoc; void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = mix(exp(-d * d * 4.), (1. - smoothstep(.75, 1., d)) * .5, vCoc) * vA; gl_FragColor = vec4(vC * a, a); }`;
// post: a fullscreen triangle (the Pillars temple's HDR bloom: bright pass, 4-level blur chain, ACES + vignette + grain)
const POST_VS = `varying vec2 vU; void main(){ vU = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;
const BRIGHT_FS = `precision highp float; uniform sampler2D tIn; uniform float uThr; uniform float uKnee; uniform vec2 uTx; varying vec2 vU;
void main(){ vec3 c = .25 * (texture2D(tIn, vU + uTx * vec2(-.5, -.5)).rgb + texture2D(tIn, vU + uTx * vec2(.5, -.5)).rgb + texture2D(tIn, vU + uTx * vec2(-.5, .5)).rgb + texture2D(tIn, vU + uTx * vec2(.5, .5)).rgb);
 float l = max(c.r, max(c.g, c.b)); float w = smoothstep(uThr, uThr + uKnee, l); gl_FragColor = vec4(min(c * w, vec3(24.)), 1.); }`;
const DOWN_FS = `precision highp float; uniform sampler2D tIn; uniform vec2 uTx; varying vec2 vU;
void main(){ gl_FragColor = vec4(.25 * (texture2D(tIn, vU + uTx * vec2(-1., -1.)).rgb + texture2D(tIn, vU + uTx * vec2(1., -1.)).rgb + texture2D(tIn, vU + uTx * vec2(-1., 1.)).rgb + texture2D(tIn, vU + uTx * vec2(1., 1.)).rgb), 1.); }`;
const BLUR_FS = `precision highp float; uniform sampler2D tIn; uniform vec2 uDir; varying vec2 vU;
void main(){ vec3 c = texture2D(tIn, vU).rgb * .2270270270;
 c += (texture2D(tIn, vU + uDir * 1.3846153846).rgb + texture2D(tIn, vU - uDir * 1.3846153846).rgb) * .3162162162;
 c += (texture2D(tIn, vU + uDir * 3.2307692308).rgb + texture2D(tIn, vU - uDir * 3.2307692308).rgb) * .0702702703; gl_FragColor = vec4(c, 1.); }`;
const COMP_FS = `precision highp float; uniform sampler2D tScene; uniform sampler2D tB0; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tB3;
uniform float uBloom; uniform float uExp; uniform float uT; uniform vec2 uRes; uniform float uVig; varying vec2 vU;
vec3 oRRT(vec3 v){ vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return a / b; }
vec3 oAces(vec3 c){ const mat3 I = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
 const mat3 O = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602)); c = I * (c / .6); c = oRRT(c); return clamp(O * c, 0., 1.); }
vec3 oSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
float oH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){ vec3 s = texture2D(tScene, vU).rgb;
 vec3 b = texture2D(tB0, vU).rgb * .5 + texture2D(tB1, vU).rgb * .7 + texture2D(tB2, vU).rgb * .9 + texture2D(tB3, vU).rgb * 1.15;
 vec3 c = (s + b * uBloom) * uExp;
 vec2 q = (vU - .5) * vec2(uRes.x / uRes.y, 1.); float vig = smoothstep(1.25, .25, length(q * vec2(.85, 1.))); c *= mix(1., vig, uVig);
 c = oSrgb(oAces(c));
 c += (oH(vU * uRes + fract(uT) * 91.) - .5) * .018 * (1. - c.g * .6);
 gl_FragColor = vec4(c, 1.); }`;

function softGPU(renderer) {   // no real GPU (a software rasteriser): start in the low tier
  try { const g = renderer.getContext(), ext = g.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '')); } catch (_) { return false; }
}
// the region pairs a tract runs between (neighbours + every lobe to the learner on the crown + the risk stem)
const TRACTS = [['lit', 'atlas'], ['lit', 'of'], ['atlas', 'blitz'], ['of', 'blitz'], ['lit', 'learn'], ['atlas', 'learn'], ['blitz', 'learn'], ['of', 'learn'], ['lit', 'risk'], ['atlas', 'risk'], ['blitz', 'risk'], ['of', 'risk'], ['lit', 'blitz'], ['atlas', 'of']];

export async function create(canvas, regions, cfg) {
  const C = cfg || {}, THREE = await loadThree(!!C.localFirst);
  if (!THREE || !canvas) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }); } catch (_) { return null; }
  if (!renderer.getContext()) return null;
  const pinned = /[?&]fx=hq/.test(location.search), soft = softGPU(renderer), gl2 = renderer.capabilities.isWebGL2;
  // quality steps: 0 hq (bloom, DPR <= 2, point depth of field), 1 hq at DPR 1.25, 2 no bloom (DPR 1), 3 low (fewer neurons / tracts / dust, 30 fps)
  let q = C.low || (soft && !pinned) ? 3 : 0;
  const tierOf = () => (q < 3 ? 'hq' : 'low');
  const ids = regions.map((r) => r.id);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
  const cam = new THREE.PerspectiveCamera(46, 1, 0.05, 80);
  const brain = new THREE.Group(); scene.add(brain);
  const tex = glowTex(THREE, false), softT = glowTex(THREE, true);
  const cols = regions.map((r) => new THREE.Color(r.color));
  const pulse = Object.fromEntries(ids.map((id) => [id, 0.35]));
  const fire = ids.map(() => new THREE.Vector4(0, 0, 0, -1));
  const boost = ids.map(() => 0);
  const shared = { uTime: { value: 0 }, uCol: { value: cols }, uPulse: { value: ids.map((id) => pulse[id]) }, uBoost: { value: boost.slice() }, uFocus: { value: 0 }, uSel: { value: -1 },
    uDof: { value: 0 }, uFocusZ: { value: 7 }, uRange: { value: 1.5 } };
  let layers = null, nLayers = 0, sceneCalls = 0;

  function buildLayers() {
    if (layers) { for (const o of layers.objs) { (o.parent || brain).remove(o); o.geometry.dispose(); o.material.dispose(); } }
    const lo = q >= 3, R = rng(20261124);
    const N = lo ? 2600 : 8000, NE = lo ? 900 : 3000, NS = lo ? 24 : 80;
    const { P, reg, ph } = neurons(N, R, ids);
    const sz = new Float32Array(N); for (let i = 0; i < N; i++) sz[i] = R() < (lo ? 0.04 : 0.055) ? 2 + R() * 0.6 : 0.75 + R() * 0.45;
    // neurons
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aReg', new THREE.BufferAttribute(reg, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aSz', new THREE.BufferAttribute(sz, 1));
    const um = { ...shared, uPx: { value: 1 }, uTex: { value: tex }, uFire: { value: fire } };
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: um, vertexShader: NEURON_VS, fragmentShader: NEURON_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; pts.renderOrder = 4;
    // synapses: faint lines in the region's colour
    const E = synapses(P, reg, NE, R), lp = new Float32Array(E.length * 3), lc = new Float32Array(E.length * 3);
    E.forEach((i, k) => { lp.set(P.subarray(i * 3, i * 3 + 3), k * 3); const c = cols[reg[i]]; lc.set([c.r * 0.32, c.g * 0.32, c.b * 0.32], k * 3); });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    lines.renderOrder = 3;
    // signals running along the synapses
    const sg = new THREE.BufferGeometry(), sp = new Float32Array(NS * 3).fill(-99), sc = new Float32Array(NS * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const sigs = new THREE.Points(sg, new THREE.PointsMaterial({ size: lo ? 0.2 : 0.17, map: softT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    sigs.frustumCulled = false; sigs.renderOrder = 5;
    const S = Array.from({ length: NS }, () => ({ e: -1, t: 0, v: 1 }));
    // tracts: arcs between regions, a travelling pulse each way
    const strands = lo ? 2 : 4, segs = lo ? 24 : 40, tp = [], tt = [], tsd = [];
    TRACTS.forEach(([a, b], ti) => {
      const A = new THREE.Vector3(...CENTERS[a]), B = new THREE.Vector3(...CENTERS[b]);
      for (let s = 0; s < strands; s++) {
        const mid = A.clone().add(B).multiplyScalar(0.5), out = mid.clone().setY(mid.y * 0.4);
        if (out.lengthSq() < 0.01) out.set(0, 1, 0); out.normalize();
        const jit = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.5);
        const ctrl = mid.clone().multiplyScalar(0.55).addScaledVector(out, 0.35 + R() * 0.35).add(jit);   // bow through the brain's body, a little outward
        const seed = R(), pt = (t) => A.clone().multiplyScalar((1 - t) ** 2).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(B, t * t);
        for (let k = 0; k < segs; k++) {
          const t0 = k / segs, t1 = (k + 1) / segs, p0 = pt(t0), p1 = pt(t1);
          tp.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); tt.push(t0, t1);
          const si = ids.indexOf(a), di = ids.indexOf(b); tsd.push(si, di, seed, si, di, seed);
        }
      }
      void ti;
    });
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1)); tg.setAttribute('aSD', new THREE.Float32BufferAttribute(tsd, 3));
    const tracts = new THREE.LineSegments(tg, new THREE.ShaderMaterial({ uniforms: shared, vertexShader: TRACT_VS, fragmentShader: TRACT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    tracts.frustumCulled = false; tracts.renderOrder = 2;
    // region glows: 2 billboards per region (a wide halo + a brighter heart), one draw
    const gp = [], gc = [], grk = [], gi = [];
    ids.forEach((id, r) => {
      const c = new THREE.Vector3(...CENTERS[id]), o = c.clone().setY(0).multiplyScalar(0.12);
      for (const big of [1, 0]) {
        const base = gp.length / 3;
        for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { gp.push(c.x + o.x, c.y, c.z + o.z); gc.push(x, y); grk.push(r, big); }
        gi.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    });
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('aCorner', new THREE.Float32BufferAttribute(gc, 2)); gg.setAttribute('aRK', new THREE.Float32BufferAttribute(grk, 2)); gg.setIndex(gi);
    const glows = new THREE.Mesh(gg, new THREE.ShaderMaterial({ uniforms: shared, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    glows.frustumCulled = false; glows.renderOrder = 1;
    // the halo under the brain
    const halo = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ map: softT, color: 0x3e255e, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -2.05; halo.renderOrder = 0;
    // dust (in the world, not the brain: it does not turn with it)
    const nd = lo ? 160 : 520, dd = new Float32Array(nd * 4), dpos = new Float32Array(nd * 3);
    for (let i = 0; i < nd * 4; i++) dd[i] = R();
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dg.setAttribute('aD', new THREE.BufferAttribute(dd, 4));
    const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: { ...shared, uPx: um.uPx }, vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    dust.frustumCulled = false; dust.renderOrder = 6;
    // the gold ring that marks the region in focus
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: 0xf1c14b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.renderOrder = 7;
    const objs = [halo, glows, tracts, lines, pts, sigs, ring, dust];
    for (const o of objs) (o === dust ? scene : brain).add(o);
    layers = { objs, um, E, P, reg, S, sigs, sp, sc, ring, R, nd, tracts: TRACTS.length * strands };
    nLayers = objs.length;
  }
  buildLayers();

  // ---- post: HDR target + bloom chain (q 0-1) ----
  const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), null);
  quad.frustumCulled = false; const qScene = new THREE.Scene(); qScene.add(quad); const qCam = new THREE.Camera();
  const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: POST_VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  const brightM = mk(BRIGHT_FS, { tIn: { value: null }, uThr: { value: 0.95 }, uKnee: { value: 0.8 }, uTx: { value: new THREE.Vector2() } });
  const downM = mk(DOWN_FS, { tIn: { value: null }, uTx: { value: new THREE.Vector2() } });
  const blurM = mk(BLUR_FS, { tIn: { value: null }, uDir: { value: new THREE.Vector2() } });
  const compM = mk(COMP_FS, { tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, uBloom: { value: 0.7 }, uExp: { value: 0.42 },
    uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVig: { value: 0.55 } });
  let rtScene = null, BL = [], BT = [];
  const rtOpt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  function buildTargets(w, h) {
    for (const r of [rtScene, ...BL, ...BT]) r && r.dispose();
    rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: gl2 ? 2 : 0, depthBuffer: true });
    BL = []; BT = []; let bw = w, bh = h;
    for (let i = 0; i < 4; i++) { bw = Math.max(2, Math.round(bw / 2)); bh = Math.max(2, Math.round(bh / 2)); BL.push(new THREE.WebGLRenderTarget(bw, bh, rtOpt)); BT.push(new THREE.WebGLRenderTarget(bw, bh, rtOpt)); }
  }
  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
  function draw(time) {
    if (q >= 2 || !rtScene) { renderer.setRenderTarget(null); renderer.render(scene, cam); sceneCalls = renderer.info.render.calls; return; }
    renderer.setRenderTarget(rtScene); renderer.render(scene, cam); sceneCalls = renderer.info.render.calls;
    brightM.uniforms.tIn.value = rtScene.texture; brightM.uniforms.uTx.value.set(1 / rtScene.width, 1 / rtScene.height); pass(brightM, BL[0]);
    for (let i = 0; i < BL.length; i++) {
      if (i) { downM.uniforms.tIn.value = BL[i - 1].texture; downM.uniforms.uTx.value.set(0.5 / BL[i - 1].width, 0.5 / BL[i - 1].height); pass(downM, BL[i]); }
      blurM.uniforms.tIn.value = BL[i].texture; blurM.uniforms.uDir.value.set(1 / BL[i].width, 0); pass(blurM, BT[i]);
      blurM.uniforms.tIn.value = BT[i].texture; blurM.uniforms.uDir.value.set(0, 1 / BL[i].height); pass(blurM, BL[i]);
    }
    compM.uniforms.tScene.value = rtScene.texture; ['tB0', 'tB1', 'tB2', 'tB3'].forEach((k, i) => { compM.uniforms[k].value = BL[i].texture; });
    compM.uniforms.uT.value = time; pass(compM, null);
  }

  // camera: an orbit around the whole brain, or a fly-in to a region that eases out and settles (a small orbit + push-in)
  const home = { pos: new THREE.Vector3(0, 3.5, 6.7), at: new THREE.Vector3(0, -0.05, 0) };   // from above the brow: the back lobes sit higher on screen than the front ones
  const camPos = home.pos.clone(), camAt = home.at.clone(), toPos = home.pos.clone(), toAt = home.at.clone(), toDir = new THREE.Vector3(), want = new THREE.Vector3();
  let sel = null, yaw = 0.0, drag = null, lastTouch = 0, focus = 0, settle = 0, toDist = 0, dofK = 0;
  function aim(id) {
    sel = ids.includes(id) ? id : null;
    if (!sel) { toPos.copy(home.pos); toAt.copy(home.at); toDist = 0; settle = 0; return; }
    const c = new THREE.Vector3(...CENTERS[sel]), out = c.clone().setY(c.y * 0.6).normalize();
    if (sel === 'learn') out.set(0, 0.75, 0.66).normalize(); if (sel === 'risk') out.set(0, -0.15, -1).normalize();
    toAt.copy(c); toDir.copy(out); toDist = 3.4; toPos.copy(c).addScaledVector(out, toDist).add(new THREE.Vector3(0, 0.35, 0));
    yaw = 0; settle = C.reduce ? 0 : 1;
  }
  const size = () => {
    const w = canvas.clientWidth || 390, h = canvas.clientHeight || 420;
    const dpr = q === 0 ? Math.min(2, window.devicePixelRatio || 1) : q === 1 ? Math.min(1.25, window.devicePixelRatio || 1) : 1;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.fov = w / h < 0.8 ? 54 : 46; cam.updateProjectionMatrix();
    if (layers) layers.um.uPx.value = (q < 3 ? 0.11 : 0.16) * h * renderer.getPixelRatio() / 2;
    if (q < 2) { const v = renderer.getDrawingBufferSize(new THREE.Vector2()); buildTargets(v.x, v.y); compM.uniforms.uRes.value.copy(v); }
  };
  size();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null; if (ro) ro.observe(canvas); else window.addEventListener('resize', size);
  function setQ(n) { const was = q; q = n; if ((was >= 3) !== (q >= 3)) buildLayers(); size(); }

  // pointer: drag turns, a tap picks the nearest region centre on screen
  const proj = (id) => { const v = new THREE.Vector3(...CENTERS[id]).applyMatrix4(brain.matrixWorld).project(cam); const r = canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, z: v.z, vis: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 }; };
  const down = (e) => { drag = { x: e.clientX, y: e.clientY, yaw, moved: 0 }; lastTouch = performance.now(); kick(); };
  const move = (e) => { if (!drag) return; const dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(e.clientY - drag.y)); yaw = drag.yaw + dx * 0.008; lastTouch = performance.now(); kick(); };
  const up = (e) => {
    if (drag && drag.moved < 8 && C.onPick) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 1e9; for (const id of ids) { const p = proj(id); if (!p.vis) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = id; } }
      if (best && bd < Math.max(70, r.width * 0.2)) C.onPick(best);
    }
    drag = null;
  };
  canvas.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);

  // the frame loop
  let raf = 0, last = performance.now(), t0 = last, slow = 0, frames = 0, visible = true, onScreen = true, need = true, ema = 16;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es.some((x) => x.isIntersecting); kick(); }) : null; if (io) io.observe(canvas);
  const vis = () => { visible = document.visibilityState !== 'hidden'; kick(); }; document.addEventListener('visibilitychange', vis);
  function kick() { need = true; if (!raf && visible && onScreen) raf = requestAnimationFrame(frame); }
  function stepSignals(dt) {
    const L = layers; if (C.reduce || !L.E.length) { L.sigs.visible = false; return; }
    const nE = L.E.length / 2, R = L.R;
    L.S.forEach((s, k) => {
      if (s.e < 0 || s.t >= 1) {                       // a new signal: busier regions get more of them
        const r = ids[Math.floor(R() * ids.length)];
        if (R() > 0.25 + pulse[r] * 0.75 && !(sel && r === sel)) { s.e = -1; L.sp.set([0, -99, 0], k * 3); return; }
        for (let tries = 0; tries < 12; tries++) { const e = Math.floor(R() * nE); if (ids[L.reg[L.E[e * 2]]] === r) { s.e = e; break; } }
        s.t = 0; s.v = 0.9 + R() * 1.6;
      }
      if (s.e < 0) return;
      s.t += dt * s.v;
      const a = L.E[s.e * 2] * 3, b = L.E[s.e * 2 + 1] * 3, P = L.P, f = Math.min(1, s.t);
      L.sp.set([P[a] + (P[b] - P[a]) * f, P[a + 1] + (P[b + 1] - P[a + 1]) * f, P[a + 2] + (P[b + 2] - P[a + 2]) * f], k * 3);
      const c = cols[L.reg[L.E[s.e * 2]]], w = Math.sin(Math.PI * f); L.sc.set([0.4 + c.r * w * 1.4, 0.4 + c.g * w * 1.4, 0.4 + c.b * w * 1.4], k * 3);
    });
    L.sigs.visible = true; L.sigs.geometry.attributes.position.needsUpdate = true; L.sigs.geometry.attributes.color.needsUpdate = true;
  }
  const tmp = new THREE.Vector3();
  function frame(now) {
    raf = 0;
    if (!visible || !onScreen) return;
    const dt = Math.min(0.1, (now - last) / 1000), time = (now - t0) / 1000;
    if (q >= 3 && now - last < 30 && !need) { raf = requestAnimationFrame(frame); return; }
    // steps down by itself on slow frames: DPR -> no bloom -> low (a terrible frame time jumps straight to low)
    if (frames > 20) ema += ((now - last) - ema) * 0.08;
    if (!pinned && frames > 30) {
      if (ema > 120 && q < 3) { setQ(3); ema = 33; slow = 0; }
      else if (ema > 40) { if (++slow > 40) { slow = 0; if (q < 3) setQ(q + 1); ema = 30; } } else slow = Math.max(0, slow - 1);
    }
    last = now; frames++;
    const k = C.reduce ? 1 : 1 - Math.pow(0.0025, dt);          // exponential approach: an ease-out by nature
    settle *= Math.exp(-dt * 1.4);
    if (sel) { want.copy(toAt).addScaledVector(toDir, toDist * (1 + 0.14 * settle)).add(tmp.set(0, 0.35, 0)); toPos.copy(want); }
    camPos.lerp(toPos, k); camAt.lerp(toAt, k);
    if (!C.reduce && !drag && now - lastTouch > 4000) yaw += dt * (sel ? 0.02 : 0.09);
    brain.rotation.y = sel ? yaw * 0.35 + 0.24 * settle : yaw;
    brain.position.y = C.reduce ? 0 : Math.sin(time * 0.6) * 0.05;
    cam.position.copy(camPos); cam.lookAt(camAt); cam.updateMatrixWorld(); brain.updateMatrixWorld();
    focus += ((sel ? 1 : 0) - focus) * Math.min(1, dt * 3);
    // depth of field on the region in focus: hq only (q 0-1), off for the whole brain
    dofK += ((sel && q < 2 ? 1 : 0) - dofK) * Math.min(1, dt * 2.5);
    if (sel) { tmp.set(...CENTERS[sel]).applyMatrix4(brain.matrixWorld).applyMatrix4(cam.matrixWorldInverse); shared.uFocusZ.value = -tmp.z; }
    shared.uDof.value = dofK; shared.uTime.value = time; shared.uFocus.value = focus; shared.uSel.value = sel ? ids.indexOf(sel) : -1;
    shared.uPulse.value = ids.map((id) => pulse[id]);
    shared.uBoost.value = fire.map((f) => (f.w > 0 ? Math.max(0, 1 - (time - f.w) / 2.2) : 0));
    stepSignals(dt);
    const L = layers;
    if (sel) { L.ring.position.set(...CENTERS[sel]); L.ring.lookAt(cam.position.clone().applyMatrix4(brain.matrixWorld.clone().invert())); L.ring.material.opacity = 0.75 * focus * (0.75 + 0.25 * Math.sin(time * 3)); L.ring.scale.setScalar(1 + 0.06 * Math.sin(time * 2)); }
    else L.ring.material.opacity = Math.max(0, L.ring.material.opacity - dt);
    draw(time);
    if (C.onFrame) C.onFrame();
    need = false;
    const moving = camPos.distanceTo(toPos) > 0.01 || settle > 0.01 || Math.abs(dofK - (sel && q < 2 ? 1 : 0)) > 0.01 || fire.some((f) => f.w > 0 && time - f.w < 2.2);
    if (!C.reduce || moving || drag) raf = requestAnimationFrame(frame);
  }
  // compile every shader before the first frame (no frozen page on a slow phone)
  try { if (renderer.compileAsync) { cam.position.copy(camPos); cam.lookAt(camAt); renderer.setRenderTarget(q < 2 ? rtScene : null); await Promise.race([renderer.compileAsync(scene, cam), new Promise((r) => setTimeout(r, 4000))]); renderer.setRenderTarget(null); } } catch (_) { /* compiled on the first frame */ }
  kick();
  document.documentElement.dataset.three = THREE.REVISION;
  return {
    THREE,
    fly(id) { aim(id); kick(); },
    fire(id, n) { const i = ids.indexOf(id); if (i < 0) return; const c = CENTERS[id]; fire[i].set(c[0], c[1], c[2], (performance.now() - t0) / 1000); pulse[id] = Math.min(1, pulse[id] + 0.15 * (n || 1)); kick(); },
    setPulse(map) { for (const [k, v] of Object.entries(map || {})) if (k in pulse && Number.isFinite(+v)) pulse[k] = Math.max(0, Math.min(1, +v)); kick(); },
    project(id) { brain.updateMatrixWorld(); return CENTERS[id] ? proj(id) : null; },
    stats() { return { three: THREE.REVISION, tier: tierOf(), quality: ['hq', 'hq-dpr', 'nobloom', 'low'][q], bloom: q < 2, soft, neurons: layers.P.length / 3, synapses: layers.E.length / 2,
      tracts: layers.tracts, dust: layers.nd, calls: sceneCalls, layers: nLayers, dpr: renderer.getPixelRatio(), dof: Math.round(dofK * 100) / 100, ema: Math.round(ema * 10) / 10, frames, sel }; },
    dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', vis); canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      for (const r of [rtScene, ...BL, ...BT]) r && r.dispose(); renderer.dispose(); },
  };
}
