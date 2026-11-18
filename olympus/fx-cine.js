// OLYMPUS cinema (tools/web_public/olympus/fx-cine.js, 2026-11-11, the effects pass; docs/OLYMPUS_FX.md "Cinema"). ES module, three r160
// from ../jarvis/three.module.min.js, nothing else (a scene on a plain WebGLRenderer can use it too). AGORA only: golden hour, marble,
// bronze, fire, dust and sea; no neon, no HUD, bloom stays the render core's (<= .25, only fire / gold / the sun disc are hot).
//
//   const cine = cinema(rc, { scene?, camera?, time: 'clock' | 'dawn' | 'golden' | 'day' | 'dusk' | 'night' | minutes,
//     sky, sea: { y, size, center }, sun: true (drive the scene's own sun / sky light by the clock), shadows: { casters, receivers, box },
//     fires: [[x, y, z], ...], dust: { box, center }, sand, spray, fireflies, birds: { center, radius, height }, blobs: [[x, z, r], ...],
//     rays: { to, spread }, grade: true (the time-of-day LUT), focus: true (a speaker focus blur is allowed) });
//   cine.burst('sparks' | 'coins' | 'laurel' | 'confetti' | 'embers', [x, y, z], { count })   a pooled burst (no allocation)
//   cine.focus(Vector3 | Object3D | () => Vector3 | null, { r, amount })                   blur the background, keep the speaker sharp
//   cine.setTime('dusk' | 'clock' | minutes)   cine.frame(dt, t) (only without a render core)   cine.stats()   cine.dispose()
//
// Without a render core pass { scene, camera, renderer, tier } instead of rc and call cine.frame(dt, t) in the scene's own loop.
// Tiers: ultra / high = everything (soft shadow map 2048 / 1024, 6 / 4 shafts, full particle counts, 4-octave clouds); low (LITE) =
// no shadow map (baked contact blobs instead), 2 shafts, a third of the particles, 2-octave clouds, no focus blur; off = only the
// still pieces (the sky, the sea, the light and the grade, nothing moves). prefers-reduced-motion = still too: no particle moves,
// bursts are skipped, the sea and the clouds hold. Every piece is ONE draw call; pools are fixed (POOL); nothing schedules a frame
// of its own: the render core's onFrame() hook (or the scene's frame()) drives it. The lab registers each piece as an OLYMPUS_FX
// scene effect (cineSky, cineSea, cineLight, cineFire, cineDust, cineSand, cineSpray, cineFireflies, cineBirds, cineSparks,
// cineCoins, cineLaurel) so tests/test_olympus_fx.py checks every one on every tier.
import * as THREE from '../jarvis/three.module.min.js';

export const LEVELS = Object.freeze(['ultra', 'high', 'low', 'off']);
/** what each tier keeps (particles are a share of the asked count; pool = the burst pool's slots per draw) */
export const TIER = Object.freeze({
  ultra: { shadow: 2048, shafts: 6, particles: 1, octaves: 4, sea: 160, birds: 24, pool: 420, lights: 3, focus: 8, shadowEvery: 2 },
  high: { shadow: 1024, shafts: 4, particles: 0.75, octaves: 3, sea: 112, birds: 16, pool: 300, lights: 2, focus: 8, shadowEvery: 3 },
  low: { shadow: 0, shafts: 2, particles: 0.33, octaves: 2, sea: 48, birds: 8, pool: 120, lights: 1, focus: 0, shadowEvery: 0 },
  off: { shadow: 0, shafts: 0, particles: 0, octaves: 2, sea: 32, birds: 0, pool: 0, lights: 0, focus: 0, shadowEvery: 0 },
});
/** the hard ceilings the tests hold: particles per piece and burst slots per draw, whatever a scene asks for */
export const POOL = Object.freeze({ particles: 2000, burst: 420 });
/** AGORA colours the pieces use (the tests check none is neon) */
export const COLORS = Object.freeze({
  gold: '#c8a24a', bronze: '#9c6b3c', olive: '#7f8a52', terracotta: '#c96a4a', aegean: '#4b7a99', sunrise: '#e0b060', ivory: '#f3ece0',
  ember: '#ff8a3a', emberCool: '#9c3a1a', smoke: '#5a4a3e', sand: '#d6bf8c', spray: '#efe9dc', firefly: '#e8cf7a', bird: '#3a2e24', dust: '#ffe2b0',
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const v3 = (a, d) => { const v = a && a.isVector3 ? [a.x, a.y, a.z] : Array.isArray(a) ? a : d; return new THREE.Vector3(v[0], v[1], v[2]); };
const C = (h) => new THREE.Color(h);

// ------------------------------------------------------------------ time of day (the real clock, or a named time)
// [minute of the local day, grade, sun elevation (deg), sun colour, sun x, sky light colour, ground colour, sky light x, zenith, horizon, stars, fires x]
const KEYS = [
  [0, 'night', 30, '#c3cbe0', 0.26, '#5a5a78', '#2a2018', 0.55, '#151826', '#3b3142', 1, 1.6],
  [300, 'night', 30, '#c3cbe0', 0.26, '#5a5a78', '#2a2018', 0.55, '#151826', '#3b3142', 1, 1.6],
  [362, 'dawn', 3, '#ffae78', 0.55, '#c7a2a0', '#4a3426', 0.72, '#4a4a6e', '#e8a27c', 0.3, 1.3],
  [425, 'golden', 11, '#ffc890', 0.92, '#f0d2b0', '#5a4630', 0.92, '#7a8fb0', '#f2c08c', 0, 1.0],
  [540, 'day', 44, '#fff0d8', 1.15, '#dfe4e8', '#7a6648', 1.05, '#6f93bd', '#dcdcd4', 0, 0.8],
  [900, 'day', 44, '#fff0d8', 1.15, '#dfe4e8', '#7a6648', 1.05, '#6f93bd', '#dcdcd4', 0, 0.8],
  [1020, 'golden', 12, '#ffc488', 1.0, '#f2d6b0', '#5a4630', 1.0, '#6f86ad', '#f6c48a', 0, 1.0],
  [1112, 'dusk', 1.5, '#ff9a5a', 0.6, '#b88a8a', '#3a2a22', 0.74, '#3b3d62', '#e08a62', 0.3, 1.3],
  [1200, 'night', 30, '#c3cbe0', 0.26, '#5a5a78', '#2a2018', 0.55, '#151826', '#3b3142', 1, 1.6],
  [1440, 'night', 30, '#c3cbe0', 0.26, '#5a5a78', '#2a2018', 0.55, '#151826', '#3b3142', 1, 1.6],
];
/** a named time -> its minute of the day */
export const TIMES = Object.freeze({ dawn: 375, golden: 1035, day: 720, dusk: 1120, night: 1290 });
export const TIME_NAMES = Object.freeze(Object.keys(TIMES));
/** the local clock as a minute of the day (0..1439) */
export function clockMinute(date) { const d = date || new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
/** 'clock' | a name | a minute -> a minute; ?time=dusk in the address beats it (screenshots, tests) */
export const urlTime = () => { try { return new URLSearchParams(location.search).get('time'); } catch (e) { return null; } };
export function resolveTime(t, url) {
  const q = url === false ? null : urlTime();
  const v = q || t;
  if (typeof v === 'number' && isFinite(v)) return ((v % 1440) + 1440) % 1440;
  if (v && TIMES[v] !== undefined) return TIMES[v];
  if (v && /^\d+$/.test(String(v))) return (+v) % 1440;
  return clockMinute();
}
/** everything a minute of the day means for the light: { name, a, b, k (the two grades and the blend), elev, sun, sunI, sky, ground,
 *  hemiI, top, horizon, stars, fire, night 0..1 } (pure: node can test it) */
export function timeAt(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= m) i++;
  const A = KEYS[i], B = KEYS[i + 1], k0 = (m - A[0]) / Math.max(1, B[0] - A[0]), k = k0 * k0 * (3 - 2 * k0);
  const col = (j) => '#' + C(A[j]).lerp(C(B[j]), k).getHexString();
  const out = { minute: m, a: A[1], b: B[1], k, name: k < 0.5 ? A[1] : B[1], elev: lerp(A[2], B[2], k), sun: col(3), sunI: lerp(A[4], B[4], k),
    sky: col(5), ground: col(6), hemiI: lerp(A[7], B[7], k), top: col(8), horizon: col(9), stars: lerp(A[10], B[10], k), fire: lerp(A[11], B[11], k) };
  out.night = clamp(out.stars, 0, 1);
  return out;
}

// ------------------------------------------------------------------ shared GLSL
const NOISE2 = `
float cnHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float cnNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cnHash(i), cnHash(i + vec2(1.0, 0.0)), f.x), mix(cnHash(i + vec2(0.0, 1.0)), cnHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float cnFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * cnNoise(p); p = p * 2.07 + 17.3; a *= 0.5; } return s; }
`;
// every shader ends with three's own tone-map / colour-space step: a no-op into the render core's linear buffer, the right encode on
// a display-space core or a plain renderer
const OUT = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

// ------------------------------------------------------------------ the host: where a piece adds its objects and its per-frame work
// The render core host (cinema()) and the FX registry host (the lab, the tests) give the same small interface.
function disposeTree(o) {
  o.traverse((x) => {
    if (x.geometry && !x.geometry.__olyKeep) x.geometry.dispose();
    const ms = x.material ? (Array.isArray(x.material) ? x.material : [x.material]) : [];
    ms.forEach((m) => { Object.keys(m.uniforms || {}).forEach((k) => { const u = m.uniforms[k].value; if (u && u.isTexture && !u.__olyKeep) u.dispose(); }); if (m.map) m.map.dispose(); m.dispose(); });
  });
}
function makeHost(scene, tierName, extra) {
  const objs = [], ticks = [], T = TIER[tierName] || TIER.high;
  let used = 0;
  const h = {
    tier: tierName, T, scene, reduced: !!(extra && extra.reduced), camera: extra && extra.camera, renderer: extra && extra.renderer,
    add(o) { scene.add(o); objs.push(o); return o; },
    tick(fn) { ticks.push(fn); },
    /** a particle count for this tier, under the per-piece and the whole-host ceilings */
    count(n) { const c = Math.max(0, Math.min(POOL.particles, Math.round(n * T.particles), POOL.particles * 2 - used)); used += c; return c; },
    run(dt, t) { for (let i = 0; i < ticks.length; i++) ticks[i](dt, t); },
    dispose() { objs.forEach((o) => { if (o.parent) o.parent.remove(o); disposeTree(o); }); objs.length = 0; ticks.length = 0; used = 0; },
    get objects() { return objs.length; },
    get particles() { return used; },
  };
  return h;
}
const halfHeight = (h) => { const r = h.renderer; return r && r.domElement ? Math.max(100, r.domElement.height / 2) : 400; };

// ------------------------------------------------------------------ the sky: gradient, sun / moon disc, drifting clouds, stars
const SKY_VS = `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `${NOISE2}
uniform vec3 uTop, uHor, uGround, uSun, uSunDir; uniform float uTime, uStars, uCloud, uNight; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir); float y = d.y;
  vec3 c = y > 0.0 ? mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.5)) : mix(uHor, uGround, pow(clamp(-y, 0.0, 1.0), 0.35));
  vec3 sd3 = normalize(uSunDir); float sd = max(dot(d, sd3), 0.0);
  c += uSun * (pow(sd, 6.0) * 0.32 + pow(sd, 48.0) * 0.5) * (1.0 - uNight * 0.6);              // the warm halo round the sun
  float cl = 0.0;
  if (y > 0.0) {
    vec2 p = d.xz / (y + 0.12) * 0.9 + vec2(uTime * 0.012, uTime * 0.004);
    float n = cnFbm(p * 1.3);
    cl = smoothstep(0.48, 0.78, n) * smoothstep(0.0, 0.22, y) * uCloud;
    vec3 lit = mix(uHor * 1.08, uSun * 1.1, pow(sd, 3.0) * 0.7 + 0.15);
    vec3 shade = mix(uTop, uHor, 0.45) * 0.85;
    c = mix(c, mix(shade, lit, smoothstep(0.5, 0.85, n)), cl * 0.82);
    vec3 cell = floor(d * 260.0); float h = fract(sin(dot(cell, vec3(12.99, 78.23, 37.71))) * 43758.55);
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    c += vec3(1.0, 0.94, 0.84) * step(0.9965, h) * tw * uStars * (1.0 - cl) * smoothstep(0.02, 0.2, y) * 0.9;
  }
  float disc = smoothstep(0.99935, 0.99975, sd) * (1.0 - cl * 0.85);
  c = mix(c, uSun * mix(2.2, 1.05, uNight), disc);                                              // HDR: the disc is one of the few hot spots
  gl_FragColor = vec4(c, 1.0);
  ${OUT}
}`;
function buildSky(h, o) {
  const R = o.radius || 900;
  const u = { uTop: { value: C('#6f86ad') }, uHor: { value: C('#f6c48a') }, uGround: { value: C(o.ground || '#5a4634') }, uSun: { value: C('#ffc488') },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.2, -0.8) }, uTime: { value: 0 }, uStars: { value: 0 }, uCloud: { value: o.clouds === undefined ? 1 : o.clouds }, uNight: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: true,
    fog: false, defines: { OCT: h.T.octaves } });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -20; mesh.name = 'cine-sky';
  h.add(mesh);
  const moving = h.tier !== 'off' && !h.reduced;
  h.tick((dt, t) => { if (moving) u.uTime.value = t; if (h.camera) mesh.position.copy(h.camera.position); });
  return {
    mesh, uniforms: u,
    setTime(L, dir) {
      u.uTop.value.set(L.top); u.uHor.value.set(L.horizon); u.uSun.value.set(L.sun); u.uStars.value = L.stars; u.uNight.value = L.night;
      if (dir) u.uSunDir.value.copy(dir);
    },
  };
}

// ------------------------------------------------------------------ the sea: rolling swell, wind ripples, sun glitter, foam on crests
const SEA_VS = `
uniform float uTime, uAmp; varying vec3 vW; varying vec3 vN; varying float vCrest;
vec3 wave(vec2 p, vec2 dir, float len, float amp, float spd, inout vec3 n) {
  float k = 6.2831 / len, f = k * dot(dir, p) - spd * uTime;
  n.x -= dir.x * k * amp * cos(f); n.z -= dir.y * k * amp * cos(f);
  return vec3(dir.x * amp * 0.6 * cos(f), amp * sin(f), dir.y * amp * 0.6 * cos(f));
}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0); vec3 n = vec3(0.0, 1.0, 0.0), d = vec3(0.0);
  d += wave(w.xz, normalize(vec2(1.0, 0.35)), 23.0, 0.42 * uAmp, 1.1, n);
  d += wave(w.xz, normalize(vec2(-0.4, 1.0)), 13.0, 0.22 * uAmp, 1.5, n);
  d += wave(w.xz, normalize(vec2(0.7, -0.6)), 7.0, 0.11 * uAmp, 2.1, n);
  d += wave(w.xz, normalize(vec2(-0.9, -0.2)), 3.6, 0.05 * uAmp, 3.0, n);
  w.xyz += d; vW = w.xyz; vN = normalize(n); vCrest = d.y / max(0.01, 0.8 * uAmp);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SEA_FS = `${NOISE2}
uniform float uTime, uGlitter, uFogD; uniform vec3 uDeep, uShallow, uSky, uSun, uSunDir, uFog; varying vec3 vW; varying vec3 vN; varying float vCrest;
void main() {
  vec2 rp = vW.xz * 0.35 + vec2(uTime * 0.25, uTime * 0.11);
  vec3 n = normalize(vN + vec3(cnNoise(rp) - 0.5, 0.0, cnNoise(rp + 31.0) - 0.5) * 0.28);
  vec3 v = normalize(cameraPosition - vW), l = normalize(uSunDir);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 water = mix(uDeep, uShallow, clamp(vCrest * 0.5 + 0.45, 0.0, 1.0));
  vec3 c = mix(water, uSky, clamp(fres, 0.0, 1.0) * 0.85);
  vec3 r = reflect(-v, n); float s = max(dot(r, l), 0.0);
  c += uSun * (pow(s, 90.0) * 1.6 + pow(s, 12.0) * 0.12);
  vec2 gp = floor(vW.xz * 3.1 + vec2(uTime * 0.9, uTime * 0.6));                     // glitter: tiny facets that catch the sun
  float g = step(0.985, cnHash(gp + floor(uTime * 3.0))) * pow(s, 6.0);
  c += uSun * g * uGlitter * 2.5;
  c = mix(c, vec3(0.96, 0.94, 0.9), smoothstep(0.62, 1.0, vCrest) * 0.35 * cnNoise(vW.xz * 1.7 + uTime * 0.4));
  float fd = 1.0 - exp(-uFogD * uFogD * dot(cameraPosition - vW, cameraPosition - vW));
  gl_FragColor = vec4(mix(c, uFog, clamp(fd, 0.0, 1.0)), 1.0);
  ${OUT}
}`;
function buildSea(h, o) {
  const size = o.size || 260, seg = h.T.sea, center = v3(o.center, [0, 0, 0]);
  const fog = h.scene.fog;
  const u = { uTime: { value: 0 }, uAmp: { value: o.amplitude || 1 }, uGlitter: { value: h.tier === 'off' ? 0.4 : 1 },
    uDeep: { value: C(o.deep || '#1f4a5e') }, uShallow: { value: C(o.shallow || '#3f7480') }, uSky: { value: C('#e6c79c') }, uSun: { value: C('#ffd9a0') },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.3, -0.7) }, uFog: { value: C(fog && fog.color ? '#' + fog.color.getHexString() : '#e8cfa4') },
    uFogD: { value: o.fogDensity || (fog && fog.density ? fog.density : 0.004) } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SEA_VS, fragmentShader: SEA_FS, fog: false, defines: { OCT: 2 } });
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(center.x, o.y === undefined ? 0 : o.y, center.z); mesh.name = 'cine-sea'; mesh.frustumCulled = false;
  h.add(mesh);
  const moving = h.tier !== 'off' && !h.reduced;
  h.tick((dt, t) => { if (moving) u.uTime.value = t; });
  return { mesh, uniforms: u, setTime(L, dir) { u.uSun.value.set(L.sun).multiplyScalar(lerp(1, 0.35, L.night)); u.uSky.value.set(L.horizon); if (dir) u.uSunDir.value.copy(dir); } };
}

// ------------------------------------------------------------------ GPU particles: dust, sand, spray, fireflies, embers, smoke
// one buffer per piece, every motion in the vertex shader (no per-frame JS but four uniform writes), MODE picks the behaviour
const P_VS = `
attribute vec4 aSeed; uniform float uTime, uHalf, uSize; uniform vec3 uBox, uCenter, uVel; uniform vec3 uOrig[8]; uniform float uNOrig, uRise;
varying vec4 vS; varying float vLife, vA;
void main() {
  vec3 w; float life = 0.0, a = 1.0, sz = uSize * (0.55 + 0.9 * aSeed.w);
#if MODE == 5 || MODE == 6
  // fire: born at one of the fires, rising and curling, cooling (embers) / spreading and fading (smoke)
  float rate = MODE == 5 ? (0.55 + 0.6 * aSeed.x) : (0.16 + 0.12 * aSeed.x);
  life = fract(uTime * rate + aSeed.y);
  int k = int(floor(aSeed.z * uNOrig)); vec3 o = uOrig[0];
  for (int j = 1; j < 8; j++) if (j == k) o = uOrig[j];
  float ang = aSeed.w * 6.2831 + life * (MODE == 5 ? 5.0 : 2.0);
  float sp = MODE == 5 ? 0.18 + life * 0.5 : 0.12 + life * 1.1;
  w = o + vec3(cos(ang) * sp, life * uRise * (MODE == 5 ? 1.0 : 1.6) + (MODE == 6 ? 0.25 : 0.05), sin(ang) * sp);
  w.x += sin(uTime * 0.7 + aSeed.x * 9.0) * life * (MODE == 6 ? 0.6 : 0.25);
  a = smoothstep(0.0, 0.08, life) * (1.0 - life);
  sz *= MODE == 5 ? (1.0 - life * 0.6) : (0.6 + life * 2.4);
#elif MODE == 3
  // sea spray: thrown up along the shore line, falling back
  float L = 1.6 + aSeed.x; life = fract(uTime / L + aSeed.y);
  float tt = life * L, up = 2.2 + 2.0 * aSeed.z;
  w = uCenter + vec3((aSeed.x - 0.5) * uBox.x, max(0.0, up * tt - 2.6 * tt * tt), (aSeed.w - 0.5) * uBox.z);
  w.x += uVel.x * tt;
  a = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.55, 1.0, life));
  sz *= 0.7 + life;
#else
  // a box that wraps: dust motes (slow), sand (low and fast on the wind), fireflies (wander and pulse)
  vec3 pp = fract(position + uVel * (0.6 + 0.8 * aSeed.x) * uTime / uBox);
  #if MODE == 2
    pp.y = pp.y * pp.y * 0.6;
  #endif
  w = (pp - 0.5) * uBox + uCenter;
  float ph = aSeed.y * 6.2831 + uTime * (0.3 + aSeed.z * 0.5);
  #if MODE == 4
    w += vec3(sin(uTime * 0.5 + aSeed.y * 20.0), sin(uTime * 0.4 + aSeed.z * 17.0) * 0.5, cos(uTime * 0.45 + aSeed.w * 23.0)) * 1.4;
  #else
    w += vec3(sin(ph), sin(ph * 1.3) * 0.5, cos(ph * 0.8)) * 0.35;
  #endif
  a = smoothstep(0.0, 0.06, pp.x) * smoothstep(1.0, 0.94, pp.x) * smoothstep(0.0, 0.06, pp.z) * smoothstep(1.0, 0.94, pp.z) * smoothstep(1.0, 0.9, pp.y);
  life = pp.y;
#endif
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  vS = aSeed; vLife = life; vA = a;
  gl_PointSize = clamp(sz * projectionMatrix[1][1] * uHalf / max(0.3, -mv.z), 1.0, 64.0);
}`;
const P_FS = `
uniform float uTime, uK; uniform vec3 uColor, uColor2; varying vec4 vS; varying float vLife, vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c), a = 0.0; vec3 col = uColor;
#if MODE == 1
  a = smoothstep(0.5, 0.0, d); a *= a * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.8 + vS.x) + vS.y * 30.0), 2.0));
#elif MODE == 2
  a = smoothstep(0.5, 0.1, length(vec2(c.x * 0.45, c.y * 2.2))) * 0.55;
  col = mix(uColor, uColor2, vS.z);
#elif MODE == 3
  a = smoothstep(0.5, 0.15, d) * 0.6;
#elif MODE == 4
  a = exp(-d * d * 26.0) * pow(0.5 + 0.5 * sin(uTime * (1.1 + vS.x * 1.8) + vS.y * 20.0), 3.0);
  col = mix(uColor, uColor2, vS.z) * 2.0;
#elif MODE == 5
  a = exp(-d * d * 22.0);
  col = mix(uColor2, uColor, pow(1.0 - vLife, 1.5)) * (1.4 + 1.6 * (1.0 - vLife));
#else
  a = smoothstep(0.5, 0.05, d) * 0.22;
  col = mix(uColor, uColor2, vLife);
#endif
  a *= vA * uK;
  if (a < 0.004) discard;
#ifdef ADDITIVE
  gl_FragColor = vec4(col * a, 1.0);
#else
  gl_FragColor = vec4(col, a);
#endif
  ${OUT}
}`;
const P_MODES = { dust: 1, sand: 2, spray: 3, fireflies: 4, embers: 5, smoke: 6 };
function buildParticles(h, kind, o) {
  const want = { dust: 420, sand: 600, spray: 360, fireflies: 70, embers: 260, smoke: 70 }[kind] || 200;
  const n = h.count(o.count || want);
  if (!n) return null;
  const r = rng(o.seed || { dust: 5, sand: 9, spray: 13, fireflies: 17, embers: 23, smoke: 29 }[kind]);
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r(); for (let j = 0; j < 4; j++) seed[i * 4 + j] = r(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const add = kind === 'dust' || kind === 'fireflies' || kind === 'embers';
  const D = {
    dust: { box: [16, 7, 12], center: [0, 3, 0], vel: [0.06, 0.05, 0.03], size: 0.06, c1: COLORS.dust, c2: COLORS.dust },
    sand: { box: [120, 6, 80], center: [0, 2, 0], vel: [9, 0.4, 2.5], size: 0.22, c1: COLORS.sand, c2: '#b89a68' },
    spray: { box: [60, 1, 6], center: [0, 0, 0], vel: [0.6, 0, 0], size: 0.2, c1: COLORS.spray, c2: COLORS.spray },
    fireflies: { box: [22, 4, 16], center: [0, 1.6, 0], vel: [0, 0, 0], size: 0.12, c1: COLORS.firefly, c2: COLORS.sunrise },
    embers: { box: [1, 1, 1], center: [0, 0, 0], vel: [0, 0, 0], size: 0.07, c1: COLORS.ember, c2: COLORS.emberCool },
    smoke: { box: [1, 1, 1], center: [0, 0, 0], vel: [0, 0, 0], size: 0.9, c1: COLORS.smoke, c2: '#8a7a6a' },
  }[kind];
  const orig = [];
  for (let i = 0; i < 8; i++) orig.push(v3((o.fires || [])[i] || (o.fires || [])[0], [0, 0, 0]));
  const u = { uTime: { value: 0 }, uHalf: { value: 400 }, uSize: { value: o.size || D.size }, uBox: { value: v3(o.box, D.box) }, uCenter: { value: v3(o.center, D.center) },
    uVel: { value: v3(o.vel, D.vel) }, uOrig: { value: orig }, uNOrig: { value: Math.max(1, Math.min(8, (o.fires || []).length || 1)) }, uRise: { value: o.rise || (kind === 'smoke' ? 3.2 : 2.4) },
    uColor: { value: C(o.color || D.c1) }, uColor2: { value: C(o.color2 || D.c2) }, uK: { value: o.strength === undefined ? 1 : o.strength } };
  const defines = { MODE: P_MODES[kind] }; if (add) defines.ADDITIVE = '';
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: P_VS, fragmentShader: P_FS, defines, transparent: true, depthWrite: false,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = 'cine-' + kind; pts.renderOrder = kind === 'smoke' ? 4 : 5;
  h.add(pts);
  const moving = !h.reduced;
  h.tick((dt, t) => { if (moving) u.uTime.value = t; u.uHalf.value = halfHeight(h); });
  return { points: pts, uniforms: u, count: n, setStrength(k) { u.uK.value = k; } };
}

// ------------------------------------------------------------------ birds: a flock wheeling overhead (one instanced draw, flaps in the shader)
const BIRD_VS = `
attribute vec4 aBird; attribute float aWing; uniform float uTime; uniform vec3 uCenter; varying float vShade;
void main() {
  float r = aBird.x, hgt = aBird.y, sp = aBird.z, ph = aBird.w;
  float a = uTime * sp + ph;
  vec3 p = uCenter + vec3(cos(a) * r, hgt + sin(a * 2.3 + ph) * 1.5, sin(a) * r * 0.7);
  vec3 fwd = normalize(vec3(-sin(a) * r, cos(a * 2.3 + ph) * 3.4, cos(a) * r * 0.7) * sign(sp));
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd)), up = cross(fwd, side);
  float flap = sin(uTime * (7.0 + ph) + ph * 3.0);
  vec3 lp = position; lp.y += abs(aWing) * flap * 0.55;
  vec3 w = p + side * lp.x + up * lp.y + fwd * lp.z;
  vShade = 0.8 + 0.2 * flap;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const BIRD_FS = `uniform vec3 uColor; varying float vShade; void main() { gl_FragColor = vec4(uColor * vShade, 1.0); ${OUT} }`;
function buildBirds(h, o) {
  const n = Math.min(h.T.birds, o.count || h.T.birds);
  if (!n) return null;
  const s = o.size || 0.7;
  const base = new THREE.BufferGeometry();
  // a body point and two swept wings: 2 triangles a bird
  base.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35 * s, -1.1 * s, 0.05 * s, -0.25 * s, 0, 0, -0.3 * s, 0, 0, 0.35 * s, 0, 0, -0.3 * s, 1.1 * s, 0.05 * s, -0.25 * s], 3));
  base.setAttribute('aWing', new THREE.Float32BufferAttribute([0, -1, 0, 0, 0, 1], 1));
  const geo = new THREE.InstancedBufferGeometry(); geo.index = null;
  geo.setAttribute('position', base.getAttribute('position')); geo.setAttribute('aWing', base.getAttribute('aWing'));
  const r = rng(o.seed || 61), b = new Float32Array(n * 4), R = o.radius || 30;
  for (let i = 0; i < n; i++) { b[i * 4] = R * (0.55 + 0.5 * r()); b[i * 4 + 1] = (o.height || 18) + r() * 6; b[i * 4 + 2] = (0.08 + 0.06 * r()) * (i % 5 === 4 ? -1 : 1); b[i * 4 + 3] = r() * 6.28; }
  geo.setAttribute('aBird', new THREE.InstancedBufferAttribute(b, 4)); geo.instanceCount = n;
  base.dispose();
  const u = { uTime: { value: 0 }, uCenter: { value: v3(o.center, [0, 0, 0]) }, uColor: { value: C(o.color || COLORS.bird) } };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: BIRD_VS, fragmentShader: BIRD_FS, side: THREE.DoubleSide, fog: false }));
  mesh.frustumCulled = false; mesh.name = 'cine-birds';
  h.add(mesh);
  const moving = h.tier !== 'off' && !h.reduced;
  h.tick((dt, t) => { if (moving) u.uTime.value = t; });
  return { mesh, count: n, setTime(L) { u.uColor.value.set(COLORS.bird).lerp(C('#1c1a22'), L.night * 0.6); mesh.visible = L.night < 0.85; } };
}

// ------------------------------------------------------------------ light shafts through the columns (crossed additive quads)
const RAY_FS = `uniform float uT, uK; uniform vec3 uColor; varying vec2 vUv; varying vec2 vEx;
void main() {
  float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
  float along = pow(1.0 - vUv.y, 1.4) * smoothstep(0.0, 0.1, vUv.y);
  float drift = 0.72 + 0.28 * sin(uT * 0.35 * vEx.y + vEx.x + vUv.y * 4.0);
  gl_FragColor = vec4(uColor * edge * along * drift * uK, 1.0);
  ${OUT}
}`;
function buildRays(h, o, sunDir) {
  const n = Math.min(h.T.shafts, o.count || h.T.shafts);
  if (!n) return null;
  const to = v3(o.to, [0, 0, 0]), spread = o.spread || [10, 0, 8], len = o.length || 16, width = o.width || 2.2, r = rng(o.seed || 3);
  const pos = [], uv = [], ex = [], idx = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    const tx = to.x + (r() - 0.5) * spread[0], tz = to.z + (r() - 0.5) * spread[2];
    const fx = tx + sunDir.x * len, fy = to.y + Math.max(0.35, sunDir.y) * len, fz = tz + sunDir.z * len;
    const w0 = width * (0.2 + r() * 0.2), w1 = width * (0.7 + r() * 0.7), ph = r() * 6.28, st = 0.5 + r() * 0.7;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      [[fx - dx * w0, fy, fz - dz * w0], [fx + dx * w0, fy, fz + dz * w0], [tx + dx * w1, to.y, tz + dz * w1], [tx - dx * w1, to.y, tz - dz * w1]].forEach((p, k) => {
        pos.push(p[0], p[1], p[2]); uv.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 1); ex.push(ph, st);
      });
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aEx', new THREE.Float32BufferAttribute(ex, 2)); g.setIndex(idx);
  const u = { uT: { value: 0 }, uK: { value: o.strength === undefined ? 0.13 : o.strength }, uColor: { value: C(o.color || '#ffd9a0') } };
  const m = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'attribute vec2 aEx; varying vec2 vUv; varying vec2 vEx; void main() { vUv = uv; vEx = aEx; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: RAY_FS });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'cine-rays';
  h.add(mesh);
  const moving = !h.reduced && h.tier !== 'off';
  const k0 = u.uK.value;
  h.tick((dt, t) => { if (moving) u.uT.value = t; });
  // shafts are strongest when the sun is low (dawn, golden hour, dusk), faint at noon, gone at night
  return { mesh, setTime(L) { u.uColor.value.set(L.sun); const low = 1 - clamp((L.elev - 8) / 40, 0, 1); u.uK.value = k0 * (0.35 + 0.65 * low) * (1 - L.night); mesh.visible = L.night < 0.9; } };
}

// ------------------------------------------------------------------ contact shadows (baked soft blobs: the LITE answer to a shadow map)
const BLOB_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }';
const BLOB_FS = `uniform float uK; varying vec2 vUv; void main() { float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.15, 1.0, d)) * uK; gl_FragColor = vec4(0.06, 0.04, 0.02, a); }`;
function buildBlobs(h, o) {
  const list = o.blobs || [];
  if (!list.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ uniforms: { uK: { value: o.blobStrength || (h.T.shadow ? 0.32 : 0.5) } }, vertexShader: BLOB_VS, fragmentShader: BLOB_FS,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const im = new THREE.InstancedMesh(geo, mat, list.length), m = new THREE.Matrix4();
  list.forEach((b, i) => { m.makeScale(b[2] * 2, 1, (b[3] || b[2]) * 2); m.setPosition(b[0], (o.blobY || 0) + 0.012, b[1]); im.setMatrixAt(i, m); });
  im.frustumCulled = false; im.renderOrder = 1; im.name = 'cine-blobs';
  h.add(im);
  return { mesh: im };
}

// ------------------------------------------------------------------ the burst pool: sparks (additive, hot) and coins / laurel / confetti (solid)
const B_VS = `attribute vec3 aCol; attribute vec3 aInfo; uniform float uHalf; varying vec3 vCol; varying vec3 vInfo;
void main() { vCol = aCol; vInfo = aInfo; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = aInfo.x <= 0.0 ? 0.0 : clamp(aInfo.x * projectionMatrix[1][1] * uHalf / max(0.3, -mv.z), 1.0, 72.0); }`;
// aInfo = (size, alpha, shape + 0.098 x the turn 0..1): shape 0 spark, 1 coin, 2 leaf, 3 confetti
const B_FS = `varying vec3 vCol; varying vec3 vInfo;
void main() {
  vec2 c = gl_PointCoord - 0.5; float shape = floor(vInfo.z), rot = fract(vInfo.z) / 0.098 * 6.2832, a = 0.0; vec3 col = vCol;
  float cs = cos(rot), sn = sin(rot); vec2 r = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
  if (shape < 0.5) { a = exp(-dot(c, c) * 40.0); col *= 2.6; }
  else if (shape < 1.5) { float w = max(0.12, abs(cos(rot * 0.7))); float e = length(vec2(c.x / w, c.y)); a = smoothstep(0.5, 0.42, e);
    col *= 0.75 + 0.5 * smoothstep(0.42, 0.2, e) + 0.35 * smoothstep(0.12, 0.0, abs(c.x / w + c.y * 0.6 - 0.12)); }
  else if (shape < 2.5) { float e = length(vec2(r.x * 2.4, r.y)); a = smoothstep(0.5, 0.4, e); col *= 0.8 + 0.4 * smoothstep(-0.2, 0.2, r.x); }
  else { a = step(abs(r.x), 0.34) * step(abs(r.y), 0.18 + 0.14 * abs(cos(rot * 1.3))); col *= 0.75 + 0.35 * abs(cos(rot * 1.3)); }
  a *= vInfo.y;
  if (a < 0.01) discard;
#ifdef ADDITIVE
  gl_FragColor = vec4(col * a, 1.0);
#else
  gl_FragColor = vec4(col, a);
#endif
  ${OUT}
}`;
const KINDS = {
  sparks: { add: true, n: 46, shape: 0, life: [0.35, 0.8], speed: [3.5, 7.5], up: 2.2, grav: 9.8, drag: 1.6, size: [0.04, 0.08], cols: ['#ffd9a0', '#ffb060', COLORS.ember] },
  embers: { add: true, n: 26, shape: 0, life: [0.8, 1.6], speed: [0.6, 1.6], up: 2.2, grav: -1.2, drag: 0.8, size: [0.05, 0.09], cols: [COLORS.ember, '#ffb060'] },
  coins: { add: false, n: 22, shape: 1, life: [1.1, 1.7], speed: [2.2, 4.2], up: 4.6, grav: 9.8, drag: 0.4, size: [0.16, 0.22], cols: [COLORS.gold, '#e0b860', '#b8903a'] },
  laurel: { add: false, n: 34, shape: 2, life: [2.2, 3.2], speed: [1.2, 2.6], up: 2.6, grav: 1.4, drag: 1.8, size: [0.16, 0.24], cols: [COLORS.olive, '#9aa060', COLORS.gold] },
  confetti: { add: false, n: 48, shape: 3, life: [1.8, 2.8], speed: [2.4, 4.6], up: 4.0, grav: 3.2, drag: 1.5, size: [0.1, 0.16],
    cols: [COLORS.gold, COLORS.terracotta, COLORS.olive, COLORS.aegean, COLORS.ivory, COLORS.sunrise] },
};
export const BURST_KINDS = Object.freeze(Object.keys(KINDS));
function buildPool(h, add) {
  const N = Math.min(POOL.burst, h.T.pool);
  if (!N) return null;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), info = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3), life = new Float32Array(N * 2), kind = new Uint8Array(N), spin = new Float32Array(N), turn = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  const aP = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), aC = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  const aI = new THREE.BufferAttribute(info, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aP); geo.setAttribute('aCol', aC); geo.setAttribute('aInfo', aI); geo.setDrawRange(0, 0);
  const u = { uHalf: { value: 400 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: B_VS, fragmentShader: B_FS, transparent: true, depthWrite: false, fog: false,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, defines: add ? { ADDITIVE: '' } : {} });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 6; pts.name = add ? 'cine-burst-hot' : 'cine-burst';
  h.add(pts);
  let live = 0, head = 0, hi = 0;
  const r = rng(add ? 71 : 73), tmp = new THREE.Color(), KL = Object.keys(KINDS);
  function spawn(k, at, n) {
    const K = KINDS[k];
    for (let j = 0; j < n; j++) {
      let i = -1;
      for (let s = 0; s < N; s++) { const c = (head + s) % N; if (life[c * 2] <= 0) { i = c; break; } }
      if (i < 0) i = head;                                         // full: the oldest slot gives way (the pool never grows)
      head = (i + 1) % N;
      if (life[i * 2] <= 0) live++;
      const th = r() * 6.2831, ph = Math.acos(1 - r() * 1.2), sp = lerp(K.speed[0], K.speed[1], r());
      pos[i * 3] = at.x + (r() - 0.5) * 0.2; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z + (r() - 0.5) * 0.2;
      vel[i * 3] = Math.cos(th) * Math.sin(ph) * sp; vel[i * 3 + 1] = Math.cos(ph) * sp * 0.6 + K.up * (0.6 + 0.6 * r()); vel[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * sp;
      life[i * 2] = life[i * 2 + 1] = lerp(K.life[0], K.life[1], r());
      kind[i] = KL.indexOf(k); spin[i] = (r() - 0.5) * 2.2; turn[i] = r();
      tmp.set(K.cols[Math.floor(r() * K.cols.length)]); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      info[i * 3] = lerp(K.size[0], K.size[1], r()); info[i * 3 + 1] = 1; info[i * 3 + 2] = K.shape + turn[i] * 0.098;
      if (i + 1 > hi) hi = i + 1;
    }
    pts.visible = live > 0; geo.setDrawRange(0, hi);
  }
  h.tick((dt) => {
    u.uHalf.value = halfHeight(h);
    if (!live) return;
    let maxI = 0;
    for (let i = 0; i < hi; i++) {
      if (life[i * 2] <= 0) continue;
      const K = KINDS[KL[kind[i]]];
      life[i * 2] -= dt;
      if (life[i * 2] <= 0) { live--; info[i * 3] = 0; info[i * 3 + 1] = 0; continue; }
      const dg = Math.exp(-K.drag * dt);
      vel[i * 3] *= dg; vel[i * 3 + 2] *= dg; vel[i * 3 + 1] = vel[i * 3 + 1] * dg - K.grav * dt;
      if (K.shape >= 2) { vel[i * 3] += Math.sin(life[i * 2] * 3 + i) * dt * 1.4; }      // leaves and confetti flutter
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const k = life[i * 2] / life[i * 2 + 1];
      info[i * 3 + 1] = Math.min(1, k * 4) * (K.shape === 0 ? k : 1);
      turn[i] = (turn[i] + spin[i] * dt + 1) % 1; info[i * 3 + 2] = K.shape + turn[i] * 0.098;               // turns per second
      maxI = i + 1;
    }
    hi = maxI; geo.setDrawRange(0, hi);
    aP.needsUpdate = aI.needsUpdate = aC.needsUpdate = true;
    if (!live) { pts.visible = false; hi = 0; }
  });
  return { points: pts, spawn, slots: N, get live() { return live; } };
}

// ------------------------------------------------------------------ fire lights (flickering warm point lights, a few per tier)
function buildFireLights(h, fires, o) {
  const n = Math.min(h.T.lights, fires.length);
  const lights = [];
  for (let i = 0; i < n; i++) {
    const p = v3(fires[i], [0, 0, 0]), l = new THREE.PointLight(o.fireColor || '#ff9a48', 0, o.fireRange || 9, 2);
    l.position.set(p.x, p.y + 0.35, p.z); l.name = 'cine-firelight'; h.add(l); lights.push(l);
  }
  let boost = 1;
  const base = o.fireLight === undefined ? 4 : o.fireLight, moving = !h.reduced && h.tier !== 'off';
  h.tick((dt, t) => {
    for (let i = 0; i < lights.length; i++) {
      const f = moving ? 0.84 + 0.1 * Math.sin(t * 9.3 + i * 2.1) * Math.sin(t * 5.7 + i) + 0.06 * Math.sin(t * 17.1 + i * 4.0) : 1;
      lights[i].intensity = base * boost * f;
    }
  });
  return { lights, setTime(L) { boost = L.fire; } };
}

// ------------------------------------------------------------------ the sun rig: drive the scene's sun and sky light by the clock, shadows
function findLights(scene) {
  let sun = null, hemi = null;
  scene.traverse((x) => { if (!sun && x.isDirectionalLight) sun = x; if (!hemi && x.isHemisphereLight) hemi = x; });
  return { sun, hemi };
}
function buildSun(h, o) {
  const found = findLights(h.scene);
  let sun = o.sunLight || found.sun, hemi = o.hemiLight || found.hemi;
  if (!sun) { sun = new THREE.DirectionalLight('#ffc488', 2.2); sun.position.set(-8, 6, -6); h.add(sun); if (sun.target) h.add(sun.target); }
  if (!hemi) { hemi = new THREE.HemisphereLight('#f2d6b0', '#5a4630', 0.9); h.add(hemi); }
  // the scene's own tuning is the golden-hour reference: the clock scales it, never replaces it
  const ref = { sunI: sun.intensity, sunC: sun.color.clone(), hemiI: hemi.intensity, sky: hemi.color.clone(), ground: hemi.groundColor.clone(),
    pos: sun.position.clone(), castShadow: sun.castShadow };
  const tgt = sun.target ? sun.target.position.clone() : new THREE.Vector3();
  const off = ref.pos.clone().sub(tgt), dist = off.length() || 10, az = Math.atan2(off.x, off.z);
  const dir = new THREE.Vector3();
  const sh = o.shadows, r = h.renderer, size = h.T.shadow;
  let shadowOn = false, frame = 0;
  if (sh && size && r && r.shadowMap) {
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true;
    sun.castShadow = true; sun.shadow.mapSize.set(size, size); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    const b = sh.box || 14, cam = sun.shadow.camera;
    cam.left = -b; cam.right = b; cam.top = b; cam.bottom = -b; cam.near = 0.5; cam.far = dist + b * 3; cam.updateProjectionMatrix();
    (sh.casters || []).forEach((x) => { if (x && x.traverse) x.traverse((m) => { if (m.isMesh) m.castShadow = true; }); });       // a group: every mesh in it
    (sh.receivers || []).forEach((x) => { if (x && x.traverse) x.traverse((m) => { if (m.isMesh) m.receiveShadow = true; }); });
    shadowOn = true;
  }
  const every = h.T.shadowEvery || 3;
  h.tick(() => { if (shadowOn && r && (++frame % every === 0)) r.shadowMap.needsUpdate = true; });
  return {
    sun, hemi, dir, shadows: () => shadowOn, mapSize: shadowOn ? size : 0,
    setTime(L) {
      const el = (L.elev * Math.PI) / 180;
      dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
      if (o.sun !== 'fixed') {
        sun.position.copy(tgt).addScaledVector(dir, dist);
        sun.intensity = ref.sunI * L.sunI;
        sun.color.copy(ref.sunC).lerp(C(L.sun), 0.65);
        hemi.intensity = ref.hemiI * L.hemiI;
        hemi.color.copy(ref.sky).lerp(C(L.sky), 0.6); hemi.groundColor.copy(ref.ground).lerp(C(L.ground), 0.5);
        if (o.neutral) { hemi.color.lerp(C('#f2efe8'), o.neutral); sun.color.lerp(C('#fff2e0'), o.neutral * 0.6); }   // neutral: calm a too-orange room (faces)
      }
      if (shadowOn && r) r.shadowMap.needsUpdate = true;
    },
    restore() {
      sun.intensity = ref.sunI; sun.color.copy(ref.sunC); sun.position.copy(ref.pos); sun.castShadow = ref.castShadow;
      hemi.intensity = ref.hemiI; hemi.color.copy(ref.sky); hemi.groundColor.copy(ref.ground);
      if (shadowOn && sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      if (shadowOn && r) { r.shadowMap.autoUpdate = true; }
    },
  };
}

// ------------------------------------------------------------------ the whole stack on a render core (or a plain renderer)
const ACTIVE = [];
if (typeof window !== 'undefined') window.__olyCine = { list: () => ACTIVE.map((c) => c.stats()) };     // tests and the perf probe read it
/**
 * cinema(rc | { scene, camera, renderer, tier }, opts) -> { burst(kind, at, o), focus(target, o), setTime(t), time(), frame(dt, t),
 *   stats(), dispose(), pieces }   Every option is optional; a scene works the same without the hook (or when it throws).
 */
export function cinema(rcOrParts, opts) {
  const o = opts || {}, rc = rcOrParts && rcOrParts.renderer && rcOrParts.onFrame ? rcOrParts : null;
  const scene = o.scene || (rc ? rc.scene : rcOrParts.scene), camera = o.camera || (rc ? rc.camera : rcOrParts.camera);
  const renderer = rc ? rc.renderer : rcOrParts.renderer;
  const reduced = o.reduced === undefined ? reducedMotion() : !!o.reduced;
  let level = rc ? rc.quality() : (LEVELS.indexOf(rcOrParts.tier) >= 0 ? rcOrParts.tier : 'high');
  let H = null, P = {}, timeMode = o.time === undefined ? 'golden' : o.time, minute = resolveTime(timeMode), L = timeAt(minute), lastClock = 0;
  let fade = null, focusT = null, focusO = {}, focusK = 0, dead = false, offFrame = null, offTier = null;
  const tmp = new THREE.Vector3(), info = { bursts: 0, skipped: 0 };
  // fog: k (0..1) leans the scene's fog (and a plain colour background) toward the time of day's horizon, so the sky and the ground meet
  const refFog = scene.fog && scene.fog.color ? scene.fog.color.clone() : null, refBg = scene.background && scene.background.isColor ? scene.background.clone() : null;

  function build() {
    if (H) teardown();
    H = makeHost(scene, level, { reduced, camera, renderer });
    P = {};
    try {
      if (o.sun !== false) P.sun = buildSun(H, o);
      if (o.sky) P.sky = buildSky(H, o.sky === true ? {} : o.sky);
      if (o.sea) P.sea = buildSea(H, o.sea === true ? {} : o.sea);
      const dir = P.sun ? P.sun.dir : new THREE.Vector3(-0.6, 0.3, -0.7);
      if (P.sun) P.sun.setTime(L);
      if (o.rays) P.rays = buildRays(H, o.rays === true ? {} : o.rays, dir);
      if (o.blobs && (!P.sun || !P.sun.shadows() || o.blobsAlways)) P.blobs = buildBlobs(H, o);
      if (level !== 'off') {
        const fires = o.fires || [];
        if (fires.length) {
          P.embers = buildParticles(H, 'embers', { fires, count: o.emberCount || 70 * Math.min(4, fires.length) });
          if (o.smokeCount !== 0) P.smoke = buildParticles(H, 'smoke', { fires, count: o.smokeCount || 22 * Math.min(4, fires.length) });
          P.fireLights = buildFireLights(H, fires, o);
        }
        if (o.dust) P.dust = buildParticles(H, 'dust', o.dust === true ? {} : o.dust);
        if (o.sand) P.sand = buildParticles(H, 'sand', o.sand === true ? {} : o.sand);
        if (o.spray) P.spray = buildParticles(H, 'spray', o.spray === true ? {} : o.spray);
        if (o.fireflies) P.fireflies = buildParticles(H, 'fireflies', o.fireflies === true ? {} : o.fireflies);
        if (o.birds) P.birds = buildBirds(H, o.birds === true ? {} : o.birds);
        if (o.bursts !== false && !reduced) { P.hot = buildPool(H, true); P.solid = buildPool(H, false); }
      }
    } catch (e) { info.error = String(e && e.message ? e.message : e); }
    applyTime(true);
  }
  function teardown() {
    if (P.sun) P.sun.restore();
    if (H) H.dispose();
    if (dead && refFog && scene.fog) scene.fog.color.copy(refFog);
    if (dead && refBg && scene.background && scene.background.isColor) scene.background.copy(refBg);
    H = null; P = {};
  }
  function applyTime(now) {
    L = timeAt(minute);
    const dir = P.sun ? P.sun.dir : null;
    if (P.sun) P.sun.setTime(L);
    ['sky', 'sea', 'rays', 'birds', 'fireLights'].forEach((k) => { if (P[k] && P[k].setTime) P[k].setTime(L, dir); });
    if (P.fireflies) P.fireflies.setStrength(L.night);
    if (o.fog) {
      const k = o.fog === true ? 0.5 : o.fog, hz = C(L.horizon).lerp(C(L.top), 0.25).multiplyScalar(0.75);
      if (refFog) scene.fog.color.copy(refFog).lerp(hz, k);
      if (refBg && scene.background && scene.background.isColor) scene.background.copy(refBg).lerp(hz, k);
    }
    if (rc && o.grade !== false && rc.setGrade) rc.setGrade({ lut: L.a, to: L.b, k: L.k });
    if (now) fade = null;
  }
  function frame(dt, t) {
    if (dead || !H) return;
    if (timeMode === 'clock' && !urlTime() && t - lastClock > 20) { lastClock = t; const m = resolveTime('clock'); if (Math.abs(m - minute) > 0.5) { minute = m; applyTime(); } }
    if (fade) { fade.k = Math.min(1, fade.k + dt / fade.dur); const e = fade.k * fade.k * (3 - 2 * fade.k); let d = fade.to - fade.from; if (d > 720) d -= 1440; if (d < -720) d += 1440; minute = (fade.from + d * e + 1440) % 1440; applyTime(); if (fade && fade.k >= 1) fade = null; }
    H.run(dt, t);
    if (rc && rc.setFocus && (focusT || focusK > 0)) {
      const want = focusT ? 1 : 0;
      focusK = reduced ? want : clamp(focusK + (want - focusK) * Math.min(1, dt * 6) + (want ? 0.002 : -0.002), 0, 1);
      if (focusT) {
        const p = typeof focusT === 'function' ? focusT() : focusT.isObject3D ? focusT.getWorldPosition(tmp) : focusT;
        if (p) { tmp.copy(p).project(camera); focusO.x = tmp.x * 0.5 + 0.5; focusO.y = 0.5 - tmp.y * 0.5; }
      }
      if (focusK <= 0.001 && !focusT) { rc.setFocus(null); focusK = 0; }
      else rc.setFocus({ x: focusO.x, y: focusO.y, r: focusO.r || 0.17, amount: (focusO.amount || 5) * focusK });
    }
  }

  build();
  if (rc) {
    if (rc.stats) { const st0 = rc.stats; info.calls = () => st0().calls; }
    offFrame = rc.onFrame(frame);
    offTier = rc.onTier ? rc.onTier((l) => { if (!dead && l !== level) { level = l; build(); } }) : null;
  }

  const api = {
    pieces: P,
    frame,
    /** sparks | embers | coins | laurel | confetti at a point; { count } overrides the kind's number (held under the pool) */
    burst(kind, at, bo) {
      const K = KINDS[kind];
      if (!K || dead || !H) return 0;
      const pool = K.add ? P.hot : P.solid;
      if (!pool) { info.skipped++; return 0; }                       // off / reduced motion: no burst, nothing moves
      const n = Math.max(1, Math.min(pool.slots, Math.round(((bo && bo.count) || K.n) * (level === 'low' ? 0.5 : level === 'ultra' ? 1.25 : 1))));
      pool.spawn(kind, v3(at, [0, 1, 0]), n); info.bursts++;
      return n;
    },
    /** keep the speaker sharp and blur the rest (high / ultra only): a Vector3, an Object3D, a function -> Vector3, or null to clear */
    focus(target, fo) {
      if (!rc || !rc.setFocus || !TIER[level].focus) return false;
      focusT = target || null; focusO = Object.assign({ x: 0.5, y: 0.45 }, fo || {});
      return !!focusT;
    },
    /** 'clock' | 'dawn' | 'golden' | 'day' | 'dusk' | 'night' | a minute; fades over 1.6 s (at once with reduced motion) */
    setTime(t, ms) {
      timeMode = t; const to = resolveTime(t, false);                // an explicit call beats ?time= (which only sets the start)
      if (reduced || ms === 0) { minute = to; applyTime(true); } else fade = { from: minute, to, k: 0, dur: (ms || 1600) / 1000 };
      return L.name;
    },
    time: () => Object.assign({}, L, { mode: timeMode }),
    tier: () => level,
    stats() {
      let pools = 0, live = 0;
      ['hot', 'solid'].forEach((k) => { if (P[k]) { pools += P[k].slots; live += P[k].live; } });
      return { tier: level, time: L.name, minute: Math.round(minute), objects: H ? H.objects : 0, particles: H ? H.particles : 0, poolSlots: pools, live,
        shadows: !!(P.sun && P.sun.shadows()), shadowMap: P.sun ? P.sun.mapSize : 0, pieces: Object.keys(P).filter((k) => P[k]), bursts: info.bursts, skipped: info.skipped,
        focus: !!focusT, error: info.error || null, reduced, calls: info.calls ? info.calls() : null };
    },
    dispose() {
      if (dead) return;
      dead = true;
      const ai = ACTIVE.indexOf(api); if (ai >= 0) ACTIVE.splice(ai, 1);
      if (offFrame) offFrame(); if (offTier) offTier();
      if (rc && rc.setFocus) rc.setFocus(null);
      teardown();
    },
  };
  ACTIVE.push(api);
  return api;
}

// ------------------------------------------------------------------ the pieces as OLYMPUS_FX scene effects (the lab and the tests)
const FX = typeof window !== 'undefined' ? window.OLYMPUS_FX : null;
if (FX && !FX.has('cineSky')) {
  const host = (t, ctx) => {
    const scene = t.isScene ? t : t.scene, rc = t.rc || null;
    return { tier: ctx.tier, T: TIER[ctx.tier] || TIER.high, scene, reduced: ctx.tier === 'off', camera: t.camera || (rc && rc.camera) || scene.userData.camera || null,
      renderer: t.renderer || (rc && rc.renderer) || null,
      add: (obj) => ctx.scene(scene, obj), tick: (fn) => ctx.tick(fn),
      count: (n) => ctx.count(Math.round(n), Math.round(n * 0.75), Math.round(n * 0.33)) };
  };
  const time = (o) => timeAt(resolveTime(o && o.time ? o.time : 'golden'));
  const def = (name, desc, make, still) => FX.define(name, { kind: 'scene', group: 'cinema', desc, make, still });
  def('cineSky', 'a golden-hour sky dome: sun disc and halo, drifting clouds, stars at night; opts.time follows the clock or a name', (t, o, ctx) => {
    const s = buildSky(host(t, ctx), o); s.setTime(time(o)); return { setTime: (n) => s.setTime(timeAt(resolveTime(n))) };
  });
  def('cineSea', 'a calm sea: rolling swell, wind ripples, sun glitter and foam on the crests (one draw)', (t, o, ctx) => {
    const s = buildSea(host(t, ctx), Object.assign({ size: 60, y: -0.35 }, o)); s.setTime(time(o)); return {};
  });
  def('cineLight', 'the time-of-day light: the sun and sky light set by the clock (dawn, golden hour, day, dusk, night) with soft light shafts', (t, o, ctx) => {
    const h = host(t, ctx), L = time(o), sun = new THREE.DirectionalLight('#ffc488', 1.6), dir = new THREE.Vector3();
    const el = (L.elev * Math.PI) / 180; dir.set(-0.62 * Math.cos(el), Math.sin(el), -0.78 * Math.cos(el)).normalize();
    sun.position.copy(dir).multiplyScalar(20); sun.intensity = 1.6 * L.sunI; sun.color.set(L.sun); h.add(sun);
    const hemi = new THREE.HemisphereLight(L.sky, L.ground, 0.6 * L.hemiI); h.add(hemi);
    const rays = buildRays(h, Object.assign({ to: [0, -0.4, 0], spread: [10, 0, 6], strength: 0.16 }, o), dir); if (rays) rays.setTime(L);
    return {};
  });
  def('cineFire', 'a brazier: hot embers rising, soft smoke above, a warm light that breathes (two draws and a light)', (t, o, ctx) => {
    const h = host(t, ctx), fires = o.fires || [o.position || [-3.4, 0.2, 2.4]];
    buildParticles(h, 'embers', { fires, count: 160 }); buildParticles(h, 'smoke', { fires, count: 40 }); buildFireLights(h, fires, o).setTime({ fire: 1 }); return {};
  });
  def('cineDust', 'dust motes drifting slowly through the sunlight (warm, twinkling, one draw)', (t, o, ctx) => { buildParticles(host(t, ctx), 'dust', Object.assign({ box: [18, 7, 12], center: [0, 3, 0] }, o)); return {}; });
  def('cineSand', 'sand blowing low across the desert on the wind (one draw)', (t, o, ctx) => { buildParticles(host(t, ctx), 'sand', Object.assign({ box: [30, 3, 20], center: [0, 0.6, 0], vel: [5, 0.2, 1] }, o)); return {}; });
  def('cineSpray', 'sea spray thrown up along a shore line and falling back (one draw)', (t, o, ctx) => { buildParticles(host(t, ctx), 'spray', Object.assign({ box: [22, 1, 3], center: [0, -0.3, 3] }, o)); return {}; });
  def('cineFireflies', 'warm fireflies drifting and pulsing at night (gold, never neon; one draw)', (t, o, ctx) => { buildParticles(host(t, ctx), 'fireflies', Object.assign({ box: [18, 4, 12], center: [0, 1.8, 0] }, o)); return {}; });
  def('cineBirds', 'a flock of birds wheeling overhead, wings flapping (one instanced draw)', (t, o, ctx) => { buildBirds(host(t, ctx), Object.assign({ radius: 14, height: 7, size: 0.35 }, o)); return {}; });
  const burstFx = (kind) => (t, o, ctx) => {
    const h = host(t, ctx), pool = buildPool(h, KINDS[kind].add), at = v3(o.position, [0, 1.6, 0]);
    let next = 0;
    const fire = () => { if (pool) pool.spawn(kind, at, Math.round(KINDS[kind].n * (ctx.tier === 'low' ? 0.5 : 1))); };
    fire();
    ctx.tick((dt, tm) => { if (!next) next = tm + (o.every || 1.4); if (tm >= next) { next = tm + (o.every || 1.4); fire(); } });
    return { burst: fire };
  };
  def('cineSparks', 'sparks from a hammer hit: hot, fast, falling (pooled; cinema().burst("sparks", pos) in a scene)', burstFx('sparks'));
  def('cineCoins', 'gold coins bursting up and spinning down on a money event (pooled)', burstFx('coins'));
  def('cineLaurel', 'laurel leaves and gold confetti for a success: a merge, an eval passed (pooled)', burstFx('laurel'));
}
