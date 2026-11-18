// OLYMPUS render core (tools/web_public/olympus/render.js, 2026-11-03; docs/OLYMPUS_RENDER.md): one premium, phone-safe
// three.js pipeline for every OLYMPUS app and Jarvis. ES module, three r160 (../jarvis/three.module.min.js), the post passes
// vendored at the same version in ./three-addons/ (no CDN).
//
//   const rc = createRenderer({ canvas, scene, camera });          // quality and theme follow window.OLYMPUS by default
//   rc.start((dt, t) => { /* move things */ });                   // the frame loop: paused while the tab is hidden
//
// What it does for the scene:
//   - ACES filmic tone mapping, sRGB output, physically based lights (r160's default), HDR (half-float) buffers;
//   - an image-based environment (PMREM) so every Standard / Physical material reflects: 'night' (a procedural sky with
//     soft light strips in the theme's colours, the default) or 'room' (three's RoomEnvironment studio) or 'none';
//   - bloom on what is brighter than 1 (UnrealBloomPass at half resolution): emissive / neon parts glow, matte parts do not;
//   - anti-aliasing: 4x MSAA on HD (WebGL2), FXAA folded into the finishing pass on LITE;
//   - one finishing pass: tone mapping (ACES, or AgX with tone:'agx') + sRGB + a time-of-day colour grade LUT (lut:'golden' | setGrade)
//     + a speaker focus blur (setFocus) + vignette + very low film grain (one draw, 2026-11-11 effects pass);
//   - AGORA: bloom strength is capped at .25 (BLOOM_MAX) unless the app passes bloomMax for its own non-AGORA look (<= .8); onFrame(fn) / onTier(fn) let shared effects
//     (olympus/fx-cine.js) ride the scene's own frame loop and follow its tier;
//   - quality tiers from OLYMPUS.fx() (ultra / high / low / off), followed live, stepped down on slow frames when the owner has
//     not chosen a level; pixel ratio <= 2 (<= 1.5 on low, 1 when off); no frame while the tab is hidden.
//   - the real phone (QA round 6): a tab hidden 20 s or a page put in the back-forward cache gives its GPU buffers back (suspend) and
//     rebuilds on return; a lost WebGL context draws nothing and everything is rebuilt on restore (olympus.js shows a still meanwhile).
//   - fast and crisp (perf v2, 2026-11-14, docs/OLYMPUS_PERF.md): the pixel ratio comes from the page's one render-scale governor
//     (./render-scale.js): full device pixel ratio up to 3 on Ultra 4K (and on Auto while frames keep full rate), stepped down smoothly when
//     they do not, never thrashing; above 2 pixels per CSS pixel the scene buffer is not multisampled (FXAA in the finish: the same memory as 2x
//     with MSAA). A canvas scrolled off screen (IntersectionObserver) gets no frame per vsync, only a quiet picture about once a second
//     (its app's loop keeps its clock at 10 Hz); the CSS size comes from a ResizeObserver, so a frame never forces a layout; a canvas with
//     no box (display: none) is never resized from its own backing size (that grew it every frame); shaders compile in the background.
//
// Passes per frame: ultra / high = 3 (scene, bloom, finish) · low = 2 (scene, finish + FXAA) · off = 1 (straight to screen).

import * as THREE from '../jarvis/three.module.min.js';
import { governor, range as rqRange, compileQuietly, parallelCompile } from './render-scale.js';
import { EffectComposer } from './three-addons/EffectComposer.js';
import { RenderPass } from './three-addons/RenderPass.js';
import { UnrealBloomPass } from './three-addons/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from './three-addons/Pass.js';
import { RoomEnvironment } from './three-addons/RoomEnvironment.js';

// AGORA (2026-11-11, the effects pass): bloom only on hot spots (fire, gold), never above .25 (docs/DESIGN_AGORA.md); grain very low.
export const BLOOM_MAX = 0.25;
export const TIERS = Object.freeze({
  ultra: { dpr: 3, samples: 4, fxaa: false, bloom: { strength: 0.25, radius: 0.5, threshold: 0.9 }, grade: { grain: 0.03, vignette: 0.3, aberration: 0.0015, saturation: 1.08 } },
  high: { dpr: 2, samples: 4, fxaa: false, bloom: { strength: 0.22, radius: 0.5, threshold: 0.92 }, grade: { grain: 0.025, vignette: 0.28, aberration: 0.001, saturation: 1.08 } },
  low: { dpr: 1.5, samples: 0, fxaa: true, bloom: null, grade: { grain: 0.02, vignette: 0.26, aberration: 0, saturation: 1.06 } },
  off: { dpr: 1, samples: 0, fxaa: false, bloom: null, grade: null },
});
export const LEVELS = Object.freeze(['ultra', 'high', 'low', 'off']);
const SLOW_MS = 24;            // a mean frame slower than this (~42 fps) over a window steps the quality down one tier
const WARM_FRAMES = 45, WINDOW = 60;

const kit = () => (typeof window !== 'undefined' && window.OLYMPUS) || null;
const prefersReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const pageHidden = () => { const O = kit(); return O ? O.hidden() : document.hidden === true; };
// the frame gap the kit asks for (OLYMPUS.frameGap(): 30 fps when the owner is idle on high, 15 on low, both in battery saver; 0 = every frame)
const frameGap = () => { const O = kit(); try { return O && O.frameGap ? O.frameGap() : 0; } catch (e) { return 0; } };
/** ?q=ultra|high|low|off in the page address forces a tier (tests, screenshots, perf probes); null without it */
export const forcedTier = () => { try { const q = new URLSearchParams(location.search).get('q'); return LEVELS.indexOf(q) >= 0 ? q : null; } catch (e) { return null; } };
/** true on a software GL renderer (SwiftShader, llvmpipe: no GPU): 4x MSAA + bloom would be a slideshow there */
export const softwareGL = (gl) => { try { const e = gl.getExtension('WEBGL_debug_renderer_info'); return !!e && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL))); } catch (e) { return false; } };
const levelOf = (q) => (LEVELS.indexOf(q) >= 0 ? q : null);

// ------------------------------------------------------------------ the finishing pass (one draw)
const FINISH_VS = `precision highp float;
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; attribute vec3 position; attribute vec2 uv; varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FINISH_FS = `precision highp float;
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uTime, uGrain, uVignette, uAberration, uSaturation;
#ifdef LUT
uniform sampler2D tLut; uniform float uLutMix;
#endif
#ifdef DOF
uniform vec3 uFocus; uniform float uDof, uAspect;
#endif
varying vec2 vUv;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
float luma(vec3 c) { c = c / (1.0 + c); return dot(c, vec3(0.299, 0.587, 0.114)); }   // on a cheap tone curve: HDR-safe
vec4 tap(vec2 uv) { return texture2D(tDiffuse, uv); }
#ifdef FXAA
vec4 fxaa(vec2 uv) {                     // FXAA 3.11 "lite" (5 + 4 taps): an edge-directed blur on contrast edges only
  vec2 p = uTexel;
  float nw = luma(tap(uv + vec2(-1.0, -1.0) * p).rgb), ne = luma(tap(uv + vec2(1.0, -1.0) * p).rgb);
  float sw = luma(tap(uv + vec2(-1.0, 1.0) * p).rgb), se = luma(tap(uv + vec2(1.0, 1.0) * p).rgb);
  vec4 m = tap(uv); float lm = luma(m.rgb);
  float lo = min(lm, min(min(nw, ne), min(sw, se))), hi = max(lm, max(max(nw, ne), max(sw, se)));
  vec2 dir = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
  float reduce = max((nw + ne + sw + se) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * p;
  vec4 a = 0.5 * (tap(uv + dir * (1.0 / 3.0 - 0.5)) + tap(uv + dir * (2.0 / 3.0 - 0.5)));
  vec4 b = a * 0.5 + 0.25 * (tap(uv - dir * 0.5) + tap(uv + dir * 0.5));
  float lb = luma(b.rgb);
  return (lb < lo || lb > hi) ? a : b;
}
#endif
#ifdef LUT
vec3 grade(vec3 c) {                     // a 16 x 16 x 16 colour LUT laid out as a 256 x 16 strip (blue = the slice): two taps
  c = clamp(c, 0.0, 1.0);
  float b = c.b * 15.0, b0 = floor(b), b1 = min(b0 + 1.0, 15.0);
  float x = c.r * 15.0 + 0.5, y = (c.g * 15.0 + 0.5) / 16.0;
  vec3 l0 = texture2D(tLut, vec2((b0 * 16.0 + x) / 256.0, y)).rgb, l1 = texture2D(tLut, vec2((b1 * 16.0 + x) / 256.0, y)).rgb;
  return mix(c, mix(l0, l1, b - b0), uLutMix);
}
#endif
#ifdef DOF
vec4 focusBlur(vec2 uv, vec4 c) {         // depth of field without a depth buffer: sharp around the speaker, a soft disc blur away from them
  vec2 dd = (uv - uFocus.xy) * vec2(uAspect, 1.0);
  float k = smoothstep(uFocus.z, uFocus.z * 2.2 + 0.08, length(dd)) * uDof;
  if (k < 0.35) return c;
  vec4 s = c;
  for (int i = 0; i < DOF; i++) {          // a golden-angle disc
    float fi = float(i) + 0.5, a = fi * 2.39996, r = sqrt(fi / float(DOF)) * k;
    s += tap(uv + vec2(cos(a), sin(a)) * r * uTexel);
  }
  return s / float(DOF + 1);
}
#endif
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  vec2 d = vUv - 0.5;
#ifdef FXAA
  vec4 c = fxaa(vUv);
#else
  vec4 c = tap(vUv);
#endif
#ifdef DOF
  c = focusBlur(vUv, c);
#endif
#ifdef ABERRATION
  vec2 o = d * uAberration * (0.5 + 2.0 * dot(d, d));     // grows toward the corners, zero in the middle
  c.r = tap(vUv - o).r; c.b = tap(vUv + o).b;
#endif
#ifdef AGX_TONE_MAPPING
  c.rgb = AgXToneMapping(c.rgb);
#elif defined(ACES_FILMIC_TONE_MAPPING)
  c.rgb = ACESFilmicToneMapping(c.rgb);
#endif
#ifdef SRGB_TRANSFER
  c = sRGBTransferOETF(c);
#endif
  c.rgb = max(mix(vec3(dot(c.rgb, vec3(0.299, 0.587, 0.114))), c.rgb, uSaturation), 0.0);   // ACES greys bright colours: give some back
#ifdef LUT
  c.rgb = grade(c.rgb);                   // the time-of-day colour grade (dawn, golden hour, day, dusk, night)
#endif
  c.rgb *= 1.0 - uVignette * smoothstep(0.12, 0.62, dot(d, d) * 1.6);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb += (hash(gl_FragCoord.xy + fract(uTime) * vec2(97.0, 57.0)) - 0.5) * uGrain * (0.35 + 0.65 * (1.0 - l));
  gl_FragColor = c;
}`;

class FinishPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;                         // it draws to the screen: the scene buffer stays the composer's read buffer
    this.uniforms = { tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, uTexel: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 }, uGrain: { value: 0 }, uVignette: { value: 0 }, uAberration: { value: 0 }, uSaturation: { value: 1 },
      tLut: { value: null }, uLutMix: { value: 0 }, uFocus: { value: new THREE.Vector3(0.5, 0.45, 0.2) }, uDof: { value: 0 }, uAspect: { value: 1 } };
    this.material = new THREE.RawShaderMaterial({ name: 'OlympusFinish', uniforms: this.uniforms, vertexShader: FINISH_VS,
      fragmentShader: FINISH_FS, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
    this.key = '';
  }
  /** post = { lut: DataTexture | null, dof: blur taps (0 = no focus blur), tone: 'aces' | 'agx' } */
  configure(renderer, grade, fxaa, display, post) {
    const u = this.uniforms, g = grade || { grain: 0, vignette: 0, aberration: 0, saturation: 1 }, x = post || {};
    u.uGrain.value = g.grain; u.uVignette.value = g.vignette; u.uAberration.value = g.aberration; u.uSaturation.value = g.saturation;
    const defines = {};
    if (fxaa) defines.FXAA = '';
    else if (g.aberration > 0 && !x.dof) defines.ABERRATION = '';
    if (x.lut) { defines.LUT = ''; u.tLut.value = x.lut; }
    if (x.dof) defines.DOF = String(x.dof | 0);
    if (!display && x.tone === 'agx') defines.AGX_TONE_MAPPING = '';
    else if (!display && renderer.toneMapping === THREE.ACESFilmicToneMapping) defines.ACES_FILMIC_TONE_MAPPING = '';
    if (!display && THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer) defines.SRGB_TRANSFER = '';
    const key = Object.keys(defines).map((k) => k + defines[k]).join();
    if (key !== this.key) { this.key = key; this.material.defines = defines; this.material.needsUpdate = true; }
  }
  setSize(w, h) { this.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h)); this.uniforms.uAspect.value = Math.max(1, w) / Math.max(1, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}

// ------------------------------------------------------------------ the colour grade (a 16^3 LUT per time of day, made in code)
// Each grade works on display colours 0..1: white balance, split toning (shadows / highlights), lift / gain, contrast, saturation.
// AGORA: warm and calm; night = indigo shadows with warm torch highlights, never black-blue, never neon.
export const GRADES = Object.freeze({
  // skin: how much the orange / amber mid-tones are calmed (faces under warm light read as people, not as oranges; 2026-11-11)
  dawn:   { wb: [1.03, 0.995, 0.98], shadow: [0.92, 0.84, 1.04], high: [1.0, 0.92, 0.84], split: 0.12, lift: 0.025, gain: 1.0, contrast: 0.04, sat: 1.0, skin: 0.3 },
  golden: { wb: [1.035, 1.0, 0.95], shadow: [0.96, 0.9, 0.92], high: [1.0, 0.93, 0.8], split: 0.12, lift: 0.018, gain: 1.02, contrast: 0.08, sat: 1.0, skin: 0.38 },
  day:    { wb: [1.01, 1.0, 0.985], shadow: [0.98, 0.96, 0.96], high: [1.0, 0.97, 0.92], split: 0.05, lift: 0.012, gain: 1.0, contrast: 0.05, sat: 1.02, skin: 0.2 },
  dusk:   { wb: [1.03, 0.98, 0.96], shadow: [0.82, 0.78, 1.06], high: [1.0, 0.86, 0.72], split: 0.15, lift: 0.02, gain: 0.99, contrast: 0.07, sat: 0.96, skin: 0.35 },
  night:  { wb: [0.98, 0.98, 1.02], shadow: [0.66, 0.68, 1.0], high: [1.0, 0.86, 0.66], split: 0.18, lift: 0.03, gain: 0.97, contrast: 0.06, sat: 0.88, skin: 0.3 },
});
export const GRADE_NAMES = Object.freeze(Object.keys(GRADES));
/** a blend of two grades (k 0..1): the slow drift from one time of day to the next */
export function mixGrade(a, b, k) {
  const A = typeof a === 'string' ? GRADES[a] : a, B = typeof b === 'string' ? GRADES[b] : b, out = {};
  if (!A || !B) return A || B || GRADES.golden;
  Object.keys(A).forEach((key) => { const x = A[key], y = B[key]; out[key] = Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * k) : x + (y - x) * k; });
  return out;
}
/** grade one display colour [r, g, b] 0..1 (the LUT's formula, also usable on a CSS colour) */
export function gradeColor(c, gr) {
  const G = (typeof gr === 'string' ? GRADES[gr] : gr) || GRADES.golden, o = [0, 0, 0];
  const l0 = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], ws = Math.max(0, 1 - l0 * 2), wh = Math.max(0, l0 * 2 - 1);
  for (let i = 0; i < 3; i++) {
    let v = c[i] * G.wb[i];
    v += (v * G.shadow[i] - v) * G.split * ws + (v * G.high[i] - v) * G.split * wh;   // split toning: shadows lean one way, highlights another
    v = G.lift + v * (G.gain - G.lift);
    v += (v - 0.5) * G.contrast * 4 * v * (1 - v);                                     // a soft S-curve around middle grey
    o[i] = v;
  }
  const l = 0.299 * o[0] + 0.587 * o[1] + 0.114 * o[2];
  // skin protection: an orange / amber mid-tone (red > green > blue, clearly coloured) loses part of its chroma and its red lead
  let sat = G.sat;
  if (G.skin && o[0] > o[1] && o[1] > o[2] && l > 0.12 && l < 0.9) {
    const chroma = o[0] - o[2], hueK = Math.min(1, (o[1] - o[2]) / Math.max(1e-4, chroma) * 2.2);           // orange-yellow, not pure red
    const w = G.skin * Math.min(1, chroma / 0.25) * hueK * Math.min(1, (l - 0.12) / 0.15) * Math.min(1, (0.9 - l) / 0.15);
    sat *= 1 - w * 0.55; o[0] -= (o[0] - o[1]) * w * 0.25;
  }
  for (let i = 0; i < 3; i++) o[i] = Math.min(1, Math.max(0, l + (o[i] - l) * sat));
  return o;
}
/** the 256 x 16 RGBA LUT texture of a grade (16 KB, ~1 ms to rebuild); pass the old texture to refill it in place */
export function gradeLut(gr, tex) {
  const data = tex ? tex.image.data : new Uint8Array(256 * 16 * 4), c = [0, 0, 0];
  for (let g = 0; g < 16; g++) for (let b = 0; b < 16; b++) for (let r = 0; r < 16; r++) {
    c[0] = r / 15; c[1] = g / 15; c[2] = b / 15;
    const o = gradeColor(c, gr), i = (g * 256 + b * 16 + r) * 4;
    data[i] = Math.round(o[0] * 255); data[i + 1] = Math.round(o[1] * 255); data[i + 2] = Math.round(o[2] * 255); data[i + 3] = 255;
  }
  const t = tex || new THREE.DataTexture(data, 256, 16, THREE.RGBAFormat);
  if (!tex) { t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace; t.name = 'olympus.lut'; }
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ environments (image-based light for reflections)
/** the theme's 3D colours, or the defaults of the OLYMPUS violet night (an app's own tint leads when the theme is default) */
export function palette(theme, tint) {
  const t = theme || {};
  return { sky: t.sky || '#0d0620', fog: t.fog || '#04050c', emissive: t.emissive || tint || '#9c6b3c', bloom: t.bloom || '#c9a06a',
    accent: t.accent || tint || '#9c6b3c' };
}

const SKY_FS = `uniform vec3 top, mid, low; varying vec3 vDir;
void main() { float y = normalize(vDir).y; vec3 c = y > 0.0 ? mix(mid, top, pow(y, 0.6)) : mix(mid, low, pow(-y, 0.5)); gl_FragColor = vec4(c, 1.0); }`;
const SKY_VS = 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

/** a procedural night studio: a deep sky gradient, a warm horizon band and soft light strips (a white key, a warm front
 *  box, two rims in the theme's colours, a floor bounce) */
function nightScene(pal) {
  const s = new THREE.Scene(), c = (h, k) => new THREE.Color(h).multiplyScalar(k);
  s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: c(pal.sky, 1.6) }, mid: { value: c(pal.emissive, 0.12).add(c(pal.fog, 0.8)) }, low: { value: c(pal.fog, 0.25) } },
    vertexShader: SKY_VS, fragmentShader: SKY_FS })));
  const strip = (w, h, col, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  const band = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 3, 48, 1, true),   // a warm horizon band: metals read as metal
    new THREE.MeshBasicMaterial({ color: c('#ffe8cc', 0.9), side: THREE.BackSide }));
  band.position.y = 2; s.add(band);
  strip(16, 1.2, c('#ffffff', 7), 0, 12, 4);             // the key: a long soft box overhead, slightly in front
  strip(8, 5, c('#fff4e6', 2.2), 6, 6, 12);             // a warm front softbox, high on the right
  strip(1.4, 14, c(pal.emissive, 5), -13, 1, -3);       // the rims, in the theme's colours: chrome edges pick them up
  strip(1.4, 14, c(pal.bloom, 4), 13, 2, -4);
  strip(10, 4, c('#ffffff', 1.4), 0, 2, 14);            // a faint fill behind the camera
  strip(20, 6, c(pal.emissive, 0.6), 0, -12, 0);        // the floor bounce
  return s;
}

/** a PMREM environment texture ('night' | 'room'); the caller owns (disposes) it */
export function makeEnvironment(renderer, kind, pal) {
  const pm = new THREE.PMREMGenerator(renderer);
  let src = null, tex = null;
  try {
    src = kind === 'room' ? new RoomEnvironment(renderer) : nightScene(pal || palette());
    const rt = pm.fromScene(src, kind === 'room' ? 0.04 : 0.02);
    tex = rt.texture;
    tex.dispose = () => rt.dispose();                 // a texture's dispose() frees no framebuffer: free the PMREM target itself
  } finally {
    pm.dispose();
    if (src) src.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  return tex;
}

// ------------------------------------------------------------------ the pipeline
/**
 * createRenderer({ canvas, scene, camera, quality?, theme?, ...options })
 *   canvas / context / renderer   draw into this canvas (and this WebGL context), or reuse a WebGLRenderer you made
 *   quality   'ultra' | 'high' | 'low' | 'off' (default: OLYMPUS.fx(), followed live via OLYMPUS.onFx)
 *   theme     OLYMPUS theme tokens (default: OLYMPUS.theme(), followed live); tint = the app's colour on the default theme
 *   env       'night' (default) | 'room' | 'none'      background  true: the environment is also the visible sky
 *   alpha     a transparent canvas (glows add light to the page behind); exposure (default 1)
 *   space     'linear' (default: light adds up in linear HDR, tone mapped once at the end) | 'display' (each material tone maps
 *             and encodes itself, additive glows add up on screen colours, as a scene tuned for a plain renderer looks; bloom
 *             thresholds are then 0..1 screen values)
 *   bloom     { strength, radius, threshold } overrides of the tier's values; grade { grain, vignette, aberration, saturation }
 *             likewise (they tune a tier, never switch bloom or the grade on for low / off)
 *   adapt     step down on slow frames: true (default: only when the owner has not chosen a level) | 'always' | false
 *   msaa      false: no multisampled buffer (a soft full-screen backdrop): FXAA does the edges, and a second composer
 *             on the same screen never holds a second MSAA buffer
 *   maxDpr    the app's pixel-ratio budget (a lower cap than the tier's). On Ultra 4K and on Auto a budget of 1.5 or more may be exceeded up
 *             to the device's full ratio (<= 3) by the render-scale governor; under 1.5 (a soft backdrop) it is a hard cap. autoSize (default
 *             true) sizes from the canvas's CSS box (a ResizeObserver: no layout read per frame)
 *   onQuality(level)   told after every tier change (the owner's choice or the automatic step down)
 * -> { renderer, composer, scene, camera, render(), draw() (now, for a photo), resize(w?, h?), setQuality(level), quality(), passes(), setTheme(t),
 *      setBloom({ strength?, radius?, threshold?, tint? }), addPass(pass), start(cb), stop(), stats(), dispose() }
 */
export function createRenderer(opts) {
  const o = Object.assign({ env: 'night', alpha: false, exposure: 1, adapt: true, autoSize: true, space: 'linear' }, opts || {});
  const display = o.space === 'display';
  const { scene, camera } = o;
  if (!scene || !camera) throw new TypeError('createRenderer: scene and camera are required');
  const O = kit();
  const owned = !o.renderer;
  const renderer = o.renderer || new THREE.WebGLRenderer({ canvas: o.canvas, context: o.context, alpha: !!o.alpha, antialias: false,
    stencil: false, powerPreference: 'high-performance', premultipliedAlpha: true });
  const canvas = renderer.domElement;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;                 // the composer draws many times a frame: count the whole frame
  if (o.alpha) renderer.setClearColor(0x000000, 0);
  const gl2 = renderer.capabilities.isWebGL2;
  const floatOK = gl2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  const bufferType = floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType;

  const forced = levelOf(o.quality) || forcedTier(), software = !forced && softwareGL(renderer.getContext()) && !/[?&]gpu=1/.test(location.search);
  const capSoft = (l) => (software && (l === 'ultra' || l === 'high') ? 'low' : l);     // software GL is held to LITE unless a tier is forced
  let level = levelOf(o.quality) || forced || capSoft(O ? O.fx() : prefersReduced() ? 'low' : 'high');
  let theme = o.theme !== undefined ? o.theme : O ? O.theme() : null;
  let composer = null, bloom = null, finish = null, envTex = null, dead = false, extra = [];
  // the cinematic post (fx-cine.js drives it; an app may set it too): a time-of-day LUT, a speaker focus blur, the tone curve
  const post = { lut: null, lutName: '', mix: 1, tone: o.tone === 'agx' ? 'agx' : 'aces', focusOn: false, fx: 0.5, fy: 0.45, fr: 0.16, amount: 0 };
  function syncPost() {                                // the post's uniforms into the (possibly rebuilt) finish pass
    if (!finish) return;
    const u = finish.uniforms;
    u.uLutMix.value = post.lut ? post.mix : 0;
    u.uFocus.value.set(post.fx, 1 - post.fy, post.fr);
    u.uDof.value = post.amount * dpr;
  }
  const hooks = [], tierSubs = [];
  let tHook = 0;
  // AGORA: bloom <= .25. An app whose owner-chosen look is not AGORA (Data City's neon night, 2026-11-18) may pass bloomMax (<= .8)
  const bloomCap = Number.isFinite(o.bloomMax) ? Math.min(0.8, Math.max(BLOOM_MAX, o.bloomMax)) : BLOOM_MAX;
  const capBloom = (b) => { if (b && b.strength > bloomCap) b.strength = bloomCap; return b; };
  let width = 0, height = 0, dpr = 1, raf = 0, loop = null, tPrev = 0, firstFrame = true, asleep = false, tDraw = 0, draws = 0;
  const bloomTint = new THREE.Color(1, 1, 1);
  const perf = { last: 0, n: 0, sum: 0, work: 0, warm: 0, fps: 0, steps: 0 };
  const reduced = prefersReduced();
  const t0 = performance.now();
  // perf v2: the page's render-scale governor sizes this canvas (its range: floor / budget / ceiling in device pixels per CSS pixel)
  const RQ = governor();
  let hiDpr = false;                                   // over 2 pixels per CSS pixel: no MSAA buffer (FXAA), the memory of 2x + MSAA
  const myRange = () => {
    const Ok = kit();
    return rqRange({ tier: level, chosen: !!forced || !!(Ok && Ok.chosen && Ok.chosen()), maxDpr: o.maxDpr || 2,
      saver: !!(Ok && Ok.saver && Ok.saver()), software: software || level === 'low' || level === 'off' });
  };
  const leaveRQ = RQ.join({ range: myRange });
  const offRQ = RQ.on(() => { if (!dead && !asleep) size(false); });
  hiDpr = level !== 'off' && RQ.dpr(myRange()) > 2.05;          // known before the first build: one composer at start, not two

  function tierOf(l) {
    const base = TIERS[l];
    const msaa = gl2 && o.msaa !== false && !hiDpr;    // msaa:false (a soft backdrop), or over 2x: no multisampled buffer, FXAA instead
    return { dpr: base.dpr, samples: msaa ? base.samples : 0, fxaa: base.fxaa || (!msaa && l !== 'off'),
      // an app's overrides tune the tier's bloom and grade, never switch them on for low / off
      bloom: base.bloom && capBloom(Object.assign({}, base.bloom, o.bloom)), grade: base.grade && Object.assign({}, base.grade, o.grade) };
  }
  let tier = tierOf(level);

  let extEnv = null;                                  // an image-based environment made elsewhere (olympus/env-kit.js HDRI): used instead, never disposed here
  function environment() {
    if (envTex) { envTex.dispose(); envTex = null; }
    if (extEnv) { scene.environment = extEnv; if (o.background) scene.background = extEnv; return; }
    if (o.env === 'none') return;
    envTex = makeEnvironment(renderer, o.env, palette(theme, o.tint));
    // the bake (PMREM: the room drawn into six cube faces) is not a frame: with autoReset off its draws stayed in renderer.info, so a
    // page that never draws a frame (the Cities map front screen) reported the bake as its frame (54 calls) in OLYMPUS.stats()
    renderer.info.reset();
    scene.environment = envTex;
    if (o.background) scene.background = envTex;
  }

  function target(samples) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: bufferType, samples });
    rt.texture.name = 'olympus.scene';
    if (display) {
      // three r160 tone maps and encodes materials into a target flagged as an XR target (as it does for the screen), and
      // keeps its storage linear: the buffer then holds screen colours, and HDR above 1 where additive glows pile up
      rt.isXRRenderTarget = true;
      rt.texture.colorSpace = THREE.SRGBColorSpace;
    }
    return rt;
  }
  function freeComposer() {
    if (!composer) return;
    composer.passes.forEach((p) => { if (extra.indexOf(p) < 0) p.dispose(); });
    composer.dispose();                              // both buffers and its copy pass
    composer = bloom = finish = null;
  }
  // the composer per tier: the scene goes into renderTarget2 (multisampled on HD), bloom adds onto it, finish reads it
  function build() {
    freeComposer();
    if (level === 'off') return;
    composer = new EffectComposer(renderer, target(0));
    composer.renderTarget2.dispose();
    composer.renderTarget2 = composer.readBuffer = target(tier.samples);
    composer.addPass(new RenderPass(scene, camera));
    if (tier.bloom) {
      const b = tier.bloom;
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold);
      // pure additive (one, one) and alpha untouched: a transparent canvas stays transparent, glows light what is behind
      Object.assign(bloom.blendMaterial, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
      bloom.bloomTintColors.forEach((v) => v.set(bloomTint.r, bloomTint.g, bloomTint.b));
      composer.addPass(bloom);
    }
    extra.forEach((p) => composer.addPass(p));
    finish = new FinishPass();
    finish.configure(renderer, tier.grade, tier.fxaa, display, { lut: post.lut, dof: post.focusOn ? (level === 'low' ? 4 : 8) : 0, tone: post.tone });
    composer.addPass(finish);
    syncPost();
  }

  // the CSS box: a ResizeObserver keeps it (a frame never reads clientWidth, which forces a layout when the page's DOM changed); a canvas with
  // no box (display: none, not in the page) keeps its last size: sizing it from its own backing store grew it by the pixel ratio every frame
  let boxW = 0, boxH = 0;
  const ro = o.autoSize && typeof ResizeObserver === 'function' ? new ResizeObserver((es) => {
    const e = es[es.length - 1], b = e.contentBoxSize && (e.contentBoxSize[0] || e.contentBoxSize);
    const w0 = boxW, h0 = boxH;
    boxW = Math.round(b && b.inlineSize !== undefined ? b.inlineSize : e.contentRect.width);
    boxH = Math.round(b && b.blockSize !== undefined ? b.blockSize : e.contentRect.height);
    // an on-demand scene (no start() loop: a still, reduced motion) draws once more at its new size; a looping one picks it up next frame
    if ((boxW !== w0 || boxH !== h0) && boxW && boxH && !loop && !firstFrame && !dead) requestAnimationFrame(() => { if (!loop && !dead && !asleep) render(); });
  }) : null;
  if (ro) { try { ro.observe(canvas); } catch (e) { /* an old browser: clientWidth below */ } }
  function cssBox(force) {
    if (!o.autoSize) return [width || Math.round(canvas.width / (dpr || 1)) || 1, height || Math.round(canvas.height / (dpr || 1)) || 1];
    if (!ro || force || !boxW) { boxW = canvas.clientWidth; boxH = canvas.clientHeight; }
    if (boxW && boxH) return [boxW, boxH];
    return [width || Math.round(canvas.width / (dpr || 1)) || 1, height || Math.round(canvas.height / (dpr || 1)) || 1];
  }
  function size(force) {
    const [w, h] = cssBox(force);
    const d = RQ.dpr(myRange());                                           // the governor's ratio (the tier's cap, the app's budget, saver inside)
    const hi = d > 2.05;
    if (hi !== hiDpr && level !== 'off') { hiDpr = hi; tier = tierOf(level); build(); force = true; }   // crossing 2x: MSAA off / on (rare)
    if (!force && w === width && h === height && d === dpr) return;
    width = w; height = h; dpr = d;
    // one resize of the drawing buffer: setPixelRatio() + setSize() reset the canvas twice (each reset waits for the GPU: ~0.35 s on a
    // software GPU at 4K, a governor step paid it twice); an unchanged backing size is not reset at all
    const bw = Math.floor(w * d), bh = Math.floor(h * d);
    if (typeof renderer.setDrawingBufferSize !== 'function') { renderer.setPixelRatio(d); renderer.setSize(w, h, false); }
    else if (canvas.width !== bw || canvas.height !== bh || renderer.getPixelRatio() !== d) renderer.setDrawingBufferSize(w, h, d);
    else renderer.setViewport(0, 0, w, h);
    if (camera.isPerspectiveCamera && o.fitCamera !== false) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (composer) { composer.setPixelRatio(d); composer.setSize(w, h); }   // every pass gets the buffer size (finish: its texel)
    syncPost();                                                            // the focus blur is in device pixels
  }

  // slow frames step the quality down one tier (never below low, never stored: the owner's choice stays theirs)
  function adapt(now) {
    const ms = perf.last ? now - perf.last : 0;
    perf.last = now;
    if (!ms || ms > 1000) return;                   // the first frame, or back from a hidden tab
    const gap = frameGap();                         // a deliberate frame cap (idle / saver) is judged against the cap, not against 60 fps
    if (gap !== perf.gap) { perf.gap = gap; perf.sum = perf.n = perf.work = 0; return; }       // the cap changed: a new window
    if (perf.warm < WARM_FRAMES) { perf.warm++; perf.work = 0; return; }
    perf.sum += ms; perf.n++;
    if (perf.n < WINDOW) return;
    const avg = perf.sum / perf.n, cpu = perf.work / perf.n;
    perf.fps = Math.round(1000 / avg); perf.sum = perf.n = perf.work = 0;
    const may = o.adapt === 'always' || (o.adapt && !(O && O.chosen()));
    // perf v2: resolution first. The tier (bloom, MSAA, the apps' particles) steps down only once the governor cannot lower the pixel ratio
    // any more, or when the frames are slow for the page's own JavaScript (cpu: this window's own measure; a smaller buffer would not help,
    // fewer effects might)
    const rg = myRange(), floored = RQ.dpr(rg) <= rg.floor + 0.01 || cpu > avg * 0.7 || /cpu/.test(RQ.state().why || '');
    if (may && floored && avg > (gap ? gap + 9 : SLOW_MS) && (level === 'ultra' || level === 'high')) {
      perf.steps++;
      apply(level === 'ultra' ? 'high' : 'low');
      if (O) O.mode(level === 'low');
    }
  }

  function apply(l) {
    level = l; tier = tierOf(l); perf.warm = 0; perf.sum = perf.n = 0;
    build(); size(true);
    if (typeof o.onQuality === 'function') o.onQuality(l);
    tierSubs.slice().forEach((fn) => { try { fn(l); } catch (e) { /* one listener never stops the rest */ } });
  }

  // off screen (perf v2): a connected canvas scrolled out of view, or inside a hidden box, gets no frame per vsync; it draws a quiet picture
  // about once a second (OFF_DRAW_MS: what the hero stage always did off screen, so a frame counter still moves) until it comes back. Its
  // first frame is always drawn (the veil lifts, the WebGL guard has a still); a canvas outside the page is never held back. An app's loop
  // (start(cb)) keeps its clock meanwhile at 10 Hz with real time steps: a walk, a timer or a reply that runs in the loop is where it should
  // be when the canvas comes back (and a joystick held below the fold still walks). Off-screen pictures never feed the governor.
  let onScreen = true, offT = 0;
  const OFF_MS = 100, OFF_DRAW_MS = 1000;
  const offScreen = () => !onScreen && !firstFrame && canvas.isConnected;
  function offTick() {
    offT = 0;
    if (dead || asleep || lost || !loop || pageHidden()) return;
    if (!offScreen()) { onVisible(); return; }
    const now = performance.now(), dt = tPrev ? Math.min(0.1, (now - tPrev) / 1000) : OFF_MS / 1000;
    tPrev = now;
    loop(dt, (now - t0) / 1000);                                  // its own render() calls draw at most the once-a-second picture
    if (compiled && !dead && (!tDraw || performance.now() - tDraw >= OFF_DRAW_MS)) drawNow(true);
    offT = setTimeout(offTick, OFF_MS);
  }
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => {
    const was = onScreen;
    onScreen = es[es.length - 1].isIntersecting;
    if (onScreen && !was && !dead && !asleep) { RQ.reset(); if (loop) onVisible(); else render(); }
  }, { rootMargin: '96px' }) : null;
  if (io) { try { io.observe(canvas); } catch (e) { /* an old browser: always on */ } }

  // shaders compiled in the background (perf v2): the first draw would compile every material synchronously, holding the page for
  // seconds on a phone (Jarvis' home: 7 s of getShaderInfoLog / getProgramParameter on this machine). compileAsync (KHR_parallel_shader_compile)
  // compiles them for the buffer the scene really draws into (the composer's target: its own tone mapping and colour space) while the page
  // stays live; the first frame comes when they are ready. Materials added later compile on their first draw, as before. compile: false = off.
  // only where the browser compiles in parallel (a real GPU): on a software GL the first status query would hold the page for the whole compile
  const canCompile = o.compile !== false && typeof renderer.compile === 'function' && !!renderer.properties && parallelCompile(renderer);
  let compiled = !canCompile, compiling = false, wantDraw = false, gen = 0;
  function warm() {
    if (compiled || compiling || dead) return;
    compiling = true;
    const my = gen;
    let p, over = false;
    try {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(composer ? composer.renderTarget2 : null);
      p = compileQuietly(renderer, scene, camera, 8000);              // three's compileAsync could poll for ever (a deleted program)
      renderer.setRenderTarget(prev);
    } catch (e) { p = Promise.resolve(); }
    const done = () => {
      if (over) return; over = true; compiling = false;
      if (my !== gen) { warm(); return; }                               // more objects arrived meanwhile (rc.warm()): compile those too
      compiled = true;
      if (dead || asleep) return;
      if (loop) onVisible(); else if (wantDraw) { wantDraw = false; render(); }
    };
    Promise.resolve(p).then(done, done);
    setTimeout(done, 8000);                                             // never wait for ever
  }

  /** draw one frame (nothing while the tab is hidden or covered or sooner than the kit's frame gap; off screen about once a second); true when it drew */
  function render() {
    if (dead || asleep || lost || pageHidden()) return false;
    const off = offScreen();
    if (off && tDraw && performance.now() - tDraw < OFF_DRAW_MS) return false;   // off screen: a picture about once a second
    if (!compiled) { wantDraw = true; warm(); return false; }
    const g = frameGap();
    if (!off && g && tDraw && performance.now() - tDraw < g - 3) return false;
    return drawNow(off);
  }
  // the frame's time: the rAF time of the frame being drawn (document.timeline), so the canvases of one frame are one sample for the governor
  const frameTime = () => { try { const t = document.timeline && document.timeline.currentTime; return typeof t === 'number' && t > 0 ? t : performance.now(); } catch (e) { return performance.now(); } };
  function drawNow(quiet) {                         // quiet: an off-screen picture (no tier step, no governor sample)
    const now = performance.now();
    tDraw = now; draws++;
    if (!quiet) adapt(now);
    if (o.autoSize) size(false);
    if (hooks.length) {                                // shared effects (fx-cine.js): one update per drawn frame, before the draw
      const dt = tHook ? Math.min(0.1, (now - tHook) / 1000) : 1 / 60, ts = (now - t0) / 1000;
      tHook = now;
      for (let i = 0; i < hooks.length; i++) { try { hooks[i](dt, ts); } catch (e) { hooks.splice(i--, 1); } }
    }
    renderer.info.reset();
    if (composer) {
      composer.readBuffer = composer.renderTarget2; composer.writeBuffer = composer.renderTarget1;   // an app pass may swap
      finish.uniforms.uTime.value = reduced ? 0 : (now - t0) / 1000;
      composer.render();
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
    if (firstFrame) { firstFrame = false; if (O && !renderer.__oly) O.ready(); }
    // one sample for the governor: the frame's time and its CPU work (the JavaScript of this frame up to the end of this draw)
    const ft = frameTime(), end = performance.now(), work = Math.max(0, Math.min(end - ft, 1000));
    if (!quiet) { perf.work += work; RQ.frame(ft, { gap: frameGap(), work }); }
    return true;
  }

  function tick(now) {
    raf = 0;
    if (dead || asleep || lost || !loop || pageHidden()) return;  // hidden (or a lost context): no new frame is asked for until the tab is back
    if (offScreen()) { if (!offT) offT = setTimeout(offTick, OFF_MS); return; }   // scrolled away: no frame per vsync (offTick: the app's clock, a picture a second)
    if (!compiled) { warm(); return; }                            // shaders compiling in the background: the loop starts when they are ready
    const g = frameGap();
    if (g && tPrev && now - tPrev < g - 3) { raf = requestAnimationFrame(tick); return; }      // idle / saver: skip the frame (no JS, no draw)
    const dt = tPrev ? Math.min(0.1, (now - tPrev) / 1000) : 1 / 60;
    tPrev = now;
    loop(dt, (now - t0) / 1000);
    if (!pageHidden()) drawNow();
    raf = requestAnimationFrame(tick);
  }
  const onVisible = () => { if (offT) { clearTimeout(offT); offT = 0; } if (!pageHidden() && loop && !raf && !dead && !asleep) { tPrev = 0; perf.last = 0; raf = requestAnimationFrame(tick); } };
  document.addEventListener('visibilitychange', onVisible);

  // ---- the real-phone pass (QA round 6, 2026-11-11): GPU memory and context loss
  // A tab hidden for 20 s, or a page going into the back-forward cache, gives its GPU buffers back (suspend: the composer's targets and
  // the environment; the canvas keeps its last picture); it rebuilds on the way back. A lost context draws nothing (no errors, no
  // black flash: olympus.js shows the still); once restored every buffer, the environment and the grade are rebuilt and a frame drawn.
  const HIDE_MS = 20000;
  let hideTimer = 0, sleptHidden = false, lost = false, restores = 0;
  const onHide = () => {
    if (dead) return;
    if (document.hidden) {
      if (!hideTimer && !asleep) hideTimer = setTimeout(() => { hideTimer = 0; if (document.hidden && !asleep && !dead) { api.suspend(); sleptHidden = true; } }, HIDE_MS);
    } else {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
      if (sleptHidden) { sleptHidden = false; api.resume(); }
    }
  };
  const onPageHide = () => { if (!dead && !asleep) { api.suspend(); sleptHidden = true; } };
  const onPageShow = (e) => { if (!dead && sleptHidden && !document.hidden) { sleptHidden = false; api.resume(); } };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  const onLost = () => { lost = true; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const onRestored = () => {
    if (dead) return;
    lost = false; restores++;
    if (post.lut) post.lut.needsUpdate = true;
    if (!asleep) {
      // the PMREM environment and the composer's targets were GPU memory: make them again (an external HDRI is its owner's to remake)
      if (extEnv) { try { window.dispatchEvent(new CustomEvent('olympus:gl-restored', { detail: { renderer } })); } catch (e) { /* old browsers */ } }
      environment(); build(); size(true);
      perf.warm = 0; perf.last = 0;
      if (loop) onVisible(); else drawNow();
    }
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  if (O && O.onPower) O.onPower(() => { if (!dead) size(true); });
  const followFx = (l) => { if (!forced && !dead && levelOf(l) && capSoft(l) !== level) { RQ.reset(true); apply(capSoft(l)); } };   // the owner's new level: a fresh scale
  const followTheme = (t) => { if (!dead) api.setTheme(t); };
  const backToDefault = () => followTheme(null);
  if (O && !levelOf(o.quality)) O.onFx(followFx);
  if (O && o.theme === undefined) { O.onTheme(followTheme); window.addEventListener('olympus:theme-default', backToDefault); }

  const api = {
    renderer, scene, camera, forced, software,
    get composer() { return composer; },
    render,
    /** draw one frame NOW, whatever the kit's frame gap, the canvas's place on the page or the background compile (a photo, a share picture:
     *  read the canvas right after); false when it cannot (lost, asleep, disposed). render() is the one for loops. */
    draw() { if (dead || asleep || lost) return false; return drawNow(offScreen()); },
    /** re-measure (or set a fixed size when autoSize is false) */
    resize(w, h) { if (w && h) { width = w; height = h; } size(true); },
    /** 'ultra' | 'high' | 'low' | 'off': the pipeline is rebuilt for that tier */
    setQuality(l) { if (levelOf(l) && l !== level) apply(l); return level; },
    quality: () => level,
    /** the pass names this frame runs, e.g. ['scene', 'bloom', 'finish'] */
    passes: () => (composer ? composer.passes.map((p) => (p === bloom ? 'bloom' : p === finish ? 'finish' : p instanceof RenderPass ? 'scene' : 'app'))
      : ['direct']),
    setTheme(t) { theme = t || null; environment(); },
    /** use this PMREM texture as the scene's environment (env-kit's HDRI; the caller owns it), or null to go back to the core's own */
    setEnvironment(tex) { extEnv = tex || null; if (!dead && !asleep) { if (!extEnv && scene.environment && scene.environment !== envTex) scene.environment = null; environment(); } },
    /** release every GPU buffer (the composer's targets and the environment) while the view is not on screen; render() draws
     *  nothing until resume(). iPhone memory: a covered scene must not keep its multisampled buffer. */
    suspend() {
      if (dead || asleep) return;
      asleep = true; if (raf) cancelAnimationFrame(raf); raf = 0;     // the loop callback stays for resume()
      freeComposer();
      if (envTex) { if (scene.environment === envTex) scene.environment = null; if (scene.background === envTex) scene.background = null; envTex.dispose(); envTex = null; }
    },
    /** rebuild what suspend() released (the start() loop, if there was one, runs again) */
    resume() {
      if (dead || !asleep) return;
      asleep = false; perf.warm = 0; perf.last = 0;
      environment(); build(); size(true); onVisible();
      if (!loop && !lost && !pageHidden()) drawNow();          // an on-demand scene: its picture again
    },
    asleep: () => asleep,
    /** live bloom changes, kept across tier changes: { strength, radius, threshold, tint (a THREE.Color, '#hex' or 0xhex) } */
    setBloom(b) {
      if (!b) return;
      const { tint, ...rest } = b, changed = Object.keys(rest).length > 0;
      capBloom(rest);
      if (changed) { o.bloom = Object.assign({}, o.bloom, rest); tier = tierOf(level); }
      if (tint !== undefined) bloomTint.set(tint);           // a per-frame tint is cheap: five vector writes
      if (!bloom) return;
      if (changed) Object.assign(bloom, rest);
      bloom.bloomTintColors.forEach((v) => v.set(bloomTint.r, bloomTint.g, bloomTint.b));
    },
    /** an app's own pass, run after bloom and before the finish */
    addPass(p) { if (p && extra.indexOf(p) < 0) { extra.push(p); build(); size(true); } return p; },
    start(cb) { loop = typeof cb === 'function' ? cb : () => {}; onVisible(); return api; },
    /** many new materials added after the first frame (a lazy module's objects): compile them in the background before the next frame */
    warm() { if (!canCompile || dead) return false; gen++; compiled = false; return true; },
    stop() { loop = null; if (raf) cancelAnimationFrame(raf); raf = 0; if (offT) { clearTimeout(offT); offT = 0; } },
    /** the colour grade: { lut: 'dawn' | 'golden' | 'day' | 'dusk' | 'night' | a grade object | null, mix (0..1, default 1), tone: 'aces' | 'agx' }.
     *  A new grade refills the same 16 KB LUT (no shader rebuild); switching the LUT on / off or the tone curve rebuilds the finish once. */
    setGrade(gr) {
      const g = gr || {}, before = (post.lut ? 'L' : '') + post.tone;
      if (g.tone === 'agx' || g.tone === 'aces') post.tone = g.tone;
      if (g.lut === null) { if (post.lut) post.lut.dispose(); post.lut = null; post.lutName = ''; post.sig = ''; }
      else if (g.lut) {
        // { lut: 'dusk', to: 'night', k: .3 } blends two grades (the slow drift of the clock)
        const blend = typeof g.lut === 'string' && GRADES[g.to] && typeof g.k === 'number' && g.to !== g.lut;
        const src = blend ? mixGrade(g.lut, g.to, Math.max(0, Math.min(1, g.k))) : typeof g.lut === 'string' ? GRADES[g.lut] : g.lut;
        const name = blend ? (g.k < 0.5 ? g.lut : g.to) : typeof g.lut === 'string' ? g.lut : 'mix';
        const sig = blend ? g.lut + g.to + Math.round(g.k * 200) : typeof g.lut === 'string' ? name : null;   // a grade object always refills
        if (src && (sig === null || sig !== post.sig)) { post.lut = gradeLut(src, post.lut || undefined); post.sig = sig; }
        if (src) post.lutName = name;
      }
      if (typeof g.mix === 'number') post.mix = Math.max(0, Math.min(1, g.mix));
      if ((post.lut ? 'L' : '') + post.tone !== before && composer) { build(); size(true); }
      syncPost();
      return post.lutName;
    },
    /** depth-of-field focus without a depth buffer: { x, y (0..1 of the screen, y down), r (sharp radius, 0..1 of the height),
     *  amount (blur radius in CSS pixels, 0 = sharp) }, or null to stop. The first call compiles the blur into the finish (one rebuild). */
    setFocus(f) {
      if (!f) { post.amount = 0; syncPost(); return false; }
      if (!post.focusOn) { post.focusOn = true; if (composer) { build(); size(true); } }
      post.fx = f.x === undefined ? 0.5 : f.x; post.fy = f.y === undefined ? 0.45 : f.y; post.fr = f.r === undefined ? 0.16 : f.r;
      post.amount = Math.max(0, Math.min(12, f.amount === undefined ? 5 : f.amount));
      syncPost();
      return true;
    },
    post: () => ({ lut: post.lutName || null, mix: post.lut ? post.mix : 0, dof: post.focusOn ? post.amount : 0, tone: post.tone, focus: post.focusOn ? [post.fx, post.fy, post.fr] : null }),
    /** fn(dt, t) runs once per drawn frame, before the draw (shared effects ride the scene's own loop: no second rAF); -> off() */
    onFrame(fn) { if (typeof fn === 'function') hooks.push(fn); return () => { const i = hooks.indexOf(fn); if (i >= 0) hooks.splice(i, 1); }; },
    /** fn(level) after every tier change; -> off() */
    onTier(fn) { if (typeof fn === 'function') tierSubs.push(fn); return () => { const i = tierSubs.indexOf(fn); if (i >= 0) tierSubs.splice(i, 1); }; },
    stats() {
      const i = renderer.info;
      return { quality: level, passes: api.passes().length, names: api.passes(), dpr, samples: composer ? tier.samples : 0,
        bloom: !!bloom, fxaa: !!(composer && tier.fxaa), hdr: bufferType === THREE.HalfFloatType, fps: perf.fps, steps: perf.steps,
        targets: composer ? 2 : 0, calls: i.render.calls, triangles: i.render.triangles, programs: (i.programs || []).length, env: extEnv ? 'external' : envTex ? o.env : 'none',
        bloomStrength: bloom ? bloom.strength : 0, grade: post.lutName || null, focus: post.focusOn, tone: post.tone, hooks: hooks.length,
        lost, restores, asleep, onScreen: !offScreen(), compiled, draws, range: myRange(), rq: RQ.state(), box: [width, height], backing: [canvas.width, canvas.height] };
    },
    dispose() {
      if (dead) return;
      dead = true; api.stop();
      try { if (io) io.disconnect(); if (ro) ro.disconnect(); } catch (e) { /* nothing */ }
      leaveRQ(); offRQ();
      document.removeEventListener('visibilitychange', onVisible); document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', onPageShow); if (hideTimer) clearTimeout(hideTimer);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
      window.removeEventListener('olympus:theme-default', backToDefault);
      freeComposer(); extra.forEach((p) => p.dispose && p.dispose());
      if (post.lut) { post.lut.dispose(); post.lut = null; } hooks.length = 0; tierSubs.length = 0;
      if (envTex) { if (scene.environment === envTex) scene.environment = null; if (scene.background === envTex) scene.background = null; envTex.dispose(); }
      if (owned) renderer.dispose();
    },
  };

  environment();
  if (o.lut && GRADES[o.lut]) { post.lut = gradeLut(GRADES[o.lut]); post.lutName = o.lut; }   // lut: 'golden' etc. from the start
  build();
  size(true);
  if (O && O.track && owned) O.track(renderer);
  return api;
}
