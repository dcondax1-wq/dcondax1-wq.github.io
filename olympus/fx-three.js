// OLYMPUS FX, the three.js helpers the scene effects share (tools/web_public/olympus/fx-three.js; docs/OLYMPUS_FX.md).
// ES module, three r160 from ../jarvis/three.module.min.js, the palette from ./materials.js (theme-aware). Needs fx-core.js first.
//   particles(ctx, scene, opts)  a GPU particle system: ONE fixed buffer, every motion in the vertex shader (no per-frame JS work, no
//                                allocation while it runs); the modes snow / dust / firefly / ember / petal / laurel / fire.
import * as THREE from '../jarvis/three.module.min.js';
import { colors } from './materials.js';

export { THREE };
export const FX = window.OLYMPUS_FX;
if (!FX) throw new Error('fx-core.js must be loaded before the OLYMPUS scene effects');
export const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

/** a three.js Scene, or { scene, camera?, renderer?, rc? } -> the pieces an effect may use */
export function parts(t, o) {
  o = o || {};
  const scene = t.isScene ? t : t.scene, rc = o.rc || t.rc || null;
  return { scene, camera: o.camera || t.camera || (rc && rc.camera) || scene.userData.camera || null,
    renderer: o.renderer || t.renderer || (rc && rc.renderer) || null };
}
export const pal = () => { const p = colors(); return { sky: new THREE.Color(p.sky), fog: new THREE.Color(p.fog), emissive: new THREE.Color(p.emissive), bloom: new THREE.Color(p.bloom), accent: new THREE.Color(p.accent) }; };
export const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
export const vec = (a, d) => { const v = Array.isArray(a) ? a : d; return new THREE.Vector3(v[0], v[1], v[2]); };
export function rng(seed) { let s = seed || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
/** the pixel ratio the scene draws at (the effect's point sizes follow it), under the tier's cap */
export const pixelRatio = (ctx, p) => () => (p.renderer && p.renderer.getPixelRatio ? p.renderer.getPixelRatio() : Math.min(window.devicePixelRatio || 1, ctx.caps.dpr));

/** a soft radial sprite texture (white centre -> transparent), 64 px; freed with the effect */
export function glowTexture(kind) {
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), r = n / 2;
  if (kind === 'ring') {
    const gr = g.createRadialGradient(r, r, r * 0.55, r, r, r * 0.98);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  } else if (kind === 'streak') {
    const gr = g.createLinearGradient(0, 0, n, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, r - 2, n, 4);
  } else {
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** shared GLSL: value noise + fbm on 3D / 2D points (the number of octaves comes from the NOCT define) */
export const NOISE = `
float fxHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fxNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxHash(i), fxHash(i + vec3(1, 0, 0)), f.x), mix(fxHash(i + vec3(0, 1, 0)), fxHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fxHash(i + vec3(0, 0, 1)), fxHash(i + vec3(1, 0, 1)), f.x), mix(fxHash(i + vec3(0, 1, 1)), fxHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
#ifndef NOCT
#define NOCT 4
#endif
float fxFbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < NOCT; i++) { s += a * fxNoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

// ------------------------------------------------------------------ the particle system
const PVS = `
attribute vec4 aSeed;
uniform float uTime, uPix, uSize, uHalf; uniform vec3 uBox, uCenter, uVel, uSway;
varying vec4 vS; varying float vLife, vFade, vRot;
void main() {
  float sp = 0.6 + 0.8 * aSeed.x;
  vec3 pp = fract(position + uVel * sp * uTime / uBox);
  vLife = uVel.y >= 0.0 ? pp.y : 1.0 - pp.y;
  vec3 w = (pp - 0.5) * uBox + uCenter;
  float ph = aSeed.y * 6.2831 + uTime * (0.4 + aSeed.z);
  #if MODE == 7
    w.xz = uCenter.xz + (w.xz - uCenter.xz) * (1.0 - vLife * 0.75);
    w.x += sin(ph * 2.0 + vLife * 6.0) * uSway.x * vLife;
    w.z += cos(ph * 1.7 + vLife * 5.0) * uSway.z * vLife;
  #elif MODE == 3
    w += vec3(sin(uTime * 0.6 + aSeed.y * 20.0), sin(uTime * 0.45 + aSeed.z * 17.0) * 0.6, cos(uTime * 0.5 + aSeed.w * 23.0)) * uSway;
  #else
    w.x += sin(ph) * uSway.x; w.z += cos(ph * 0.8) * uSway.z; w.y += sin(ph * 1.3) * uSway.y;
  #endif
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  float edge = smoothstep(0.0, 0.08, pp.y) * smoothstep(1.0, 0.92, pp.y);
  #if MODE != 7
    edge *= smoothstep(0.0, 0.05, pp.x) * smoothstep(1.0, 0.95, pp.x) * smoothstep(0.0, 0.05, pp.z) * smoothstep(1.0, 0.95, pp.z);
  #endif
  vFade = edge; vS = aSeed; vRot = ph;
  float s = uSize * uPix * (0.55 + 0.9 * aSeed.w) * projectionMatrix[1][1] * uHalf / max(0.5, -mv.z);   // uSize = the particle's width in world units
  #if MODE == 7
    s *= 0.5 + 1.1 * sin(min(vLife * 3.1416, 3.1416) * 0.9 + 0.2);
  #endif
  #if MODE == 4
    s *= 1.0 - vLife * 0.55;
  #endif
  gl_PointSize = clamp(s, 1.0, 40.0 * uPix);
}`;
const PFS = `
uniform float uTime; uniform vec3 uColor, uColor2; varying vec4 vS; varying float vLife, vFade, vRot;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c), a = 0.0; vec3 col = uColor;
  #if MODE == 1
    a = smoothstep(0.5, 0.0, d); a *= a;
  #elif MODE == 2
    a = smoothstep(0.5, 0.05, d) * 0.55 * (0.45 + 0.55 * sin(uTime * (0.6 + vS.x) + vS.y * 30.0));
  #elif MODE == 3
    a = exp(-d * d * 30.0) * (0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (1.2 + vS.x * 2.0) + vS.y * 20.0), 3.0));
    col = mix(uColor, uColor2, vS.z) * 2.4;
  #elif MODE == 4
    a = exp(-d * d * 24.0) * (1.0 - vLife) * (0.65 + 0.35 * sin(uTime * 15.0 + vS.y * 30.0));
    col = mix(uColor2, uColor, vLife) * 2.2;
  #elif MODE == 5 || MODE == 6
    float cs = cos(vRot * 1.7), sn = sin(vRot * 1.7);
    vec2 r = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
    #if MODE == 5
      float e = length(vec2(r.x, r.y * 2.2)); a = smoothstep(0.5, 0.36, e) * 0.92;
      col = mix(uColor, uColor2, smoothstep(-0.3, 0.3, r.x));
    #else
      float u = r.y * 2.0, wd = 0.2 * (1.0 - u * u);
      a = (u > -1.0 && u < 1.0) ? smoothstep(wd, wd - 0.05, abs(r.x)) : 0.0;
      float rib = smoothstep(0.03, 0.0, abs(r.x)); col = mix(uColor, uColor2, 0.35 + 0.65 * rib) * (0.8 + 0.5 * smoothstep(-1.0, 1.0, r.x * 8.0));
    #endif
  #else
    a = exp(-d * d * 11.0) * pow(1.0 - vLife, 1.3) * 0.3;
    col = mix(uColor2, uColor, smoothstep(0.0, 0.5, vLife)); col = mix(col, vec3(0.32, 0.02, 0.0), smoothstep(0.5, 1.0, vLife)) * 1.5;
  #endif
  a *= vFade;
  if (a < 0.003) discard;
  #ifdef ADDITIVE
    gl_FragColor = vec4(col * a, 1.0);
  #else
    gl_FragColor = vec4(col, a);
  #endif
}`;
export const MODES = { snow: 1, dust: 2, firefly: 3, ember: 4, petal: 5, laurel: 6, fire: 7 };

/** o: { mode, n, box, center, vel, size (world units), sway, color, color2, additive, seed } -> { points, uniforms } (added to the scene, freed on stop) */
export function particles(ctx, p, o) {
  const n = Math.max(1, o.n | 0), r = rng(o.seed || 3), pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r(); seed[i * 4] = r(); seed[i * 4 + 1] = r(); seed[i * 4 + 2] = r(); seed[i * 4 + 3] = r(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = {
    uTime: { value: 0 }, uPix: { value: 1 }, uSize: { value: o.size || 0.15 }, uHalf: { value: 200 },
    uBox: { value: vec(o.box, [24, 12, 18]) }, uCenter: { value: vec(o.center, [0, 5, -2]) }, uVel: { value: vec(o.vel, [0, -1, 0]) },
    uSway: { value: vec(o.sway, [0.3, 0.1, 0.3]) }, uColor: { value: new THREE.Color(o.color || '#ffffff') }, uColor2: { value: new THREE.Color(o.color2 || '#ffffff') },
  };
  const defines = { MODE: MODES[o.mode] || 1 };
  if (o.additive !== false) defines.ADDITIVE = '';
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: PVS, fragmentShader: PFS, defines, transparent: true, depthWrite: false,
    blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.name = 'fx-' + o.mode;
  ctx.scene(p.scene, pts);
  const px = pixelRatio(ctx, p);
  const half = () => (p.renderer && p.renderer.domElement ? p.renderer.domElement.clientHeight : window.innerHeight) / 2;
  ctx.tick((dt, t) => { u.uTime.value = t; u.uPix.value = px(); u.uHalf.value = half() || 200; });
  return { points: pts, uniforms: u };
}
