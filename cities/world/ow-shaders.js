// Olympus World shaders (cities/world/; night-worlds 2026-11-19, rebuilt for revamp-cities 2026-11-20). Plain GLSL strings for three
// r160 ShaderMaterial (three adds the #version / precision lines and turns attribute / varying / texture2D into GLSL 3 on WebGL2).
// Output is LINEAR HDR: the render core's finish pass tone maps (ACES) and encodes sRGB; on the 'off' tier the tonemapping /
// colorspace chunks do it straight to the screen. Everything that moves (growth, pulses, traffic, beams, warp streaks) moves on the
// GPU from uTime: the CPU only writes a few uniforms.
// The look (research/handoff/2026-11-20/revamp-cities/LOOK.md): a blue-hour / night sky with the city's own glow on the horizon and
// clouds lit from below, height fog the skyline melts into, dark glass and stone towers with lit window grids (warm homes, cool
// offices) that fall back to whole lit floors when a window is smaller than a pixel (no shimmer, no mush), base shadow, sodium
// street lamps, head and tail light streaks, a far shore of other cities. uDusk follows the market clock: 0 night .. 1 golden hour.

// the sky and the fog share one colour function, so far buildings melt into the horizon glow (aerial perspective)
export const COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uMoonDir;
uniform float uFogDensity;
uniform float uDusk;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 sunDir() { return normalize(vec3(0.42, 0.075, -1.0)); }
vec3 lightDir() { return normalize(mix(uMoonDir, sunDir(), uDusk)); }
vec3 lightCol() { return mix(vec3(0.12, 0.15, 0.26), vec3(1.25, 0.66, 0.34), uDusk); }
vec3 skyCol(vec3 d) {
  float h = d.y;
  vec3 zen = mix(vec3(0.0030, 0.0055, 0.018), vec3(0.016, 0.042, 0.13), uDusk);
  vec3 mid = mix(vec3(0.010, 0.016, 0.044), vec3(0.07, 0.10, 0.24), uDusk);
  vec3 hor = mix(vec3(0.040, 0.036, 0.075), vec3(0.42, 0.20, 0.12), uDusk);
  vec3 c = mix(hor, mid, smoothstep(0.0, mix(0.2, 0.12, uDusk), h));
  c = mix(c, zen, smoothstep(0.16, 0.8, h));
  c += mix(vec3(0.16, 0.075, 0.036), vec3(0.42, 0.17, 0.06), uDusk) * exp(-max(h, 0.0) * 11.0);   // the city's own light (dusk: the sun) low in the haze
  float s = max(dot(d, sunDir()), 0.0);
  c += vec3(1.0, 0.5, 0.2) * (pow(s, 14.0) * 0.3 + pow(s, 120.0) * 1.0) * uDusk * smoothstep(-0.05, 0.12, 0.35 - h);
  c += vec3(0.05, 0.08, 0.15) * pow(max(dot(d, uMoonDir), 0.0), 20.0) * 0.6 * (1.0 - uDusk);
  c = mix(c, mix(vec3(0.008, 0.009, 0.016), vec3(0.05, 0.05, 0.07), uDusk), 1.0 - smoothstep(-0.3, 0.0, h));
  return c;
}
vec3 fogged(vec3 col, vec3 wp) {
  vec3 dv = wp - cameraPosition;
  float d = length(dv);
  float hfade = exp(-max(wp.y, 0.0) * 0.022);
  float f = 1.0 - exp(-pow(d * uFogDensity * mix(1.0, 0.72, uDusk), 1.35) * (0.35 + 0.9 * hfade));
  vec3 dir = dv / max(d, 1e-3);
  vec3 far = skyCol(vec3(dir.x, max(dir.y, 0.0) * 0.4 + 0.015, dir.z));
  vec3 fc = mix(mix(vec3(0.006, 0.009, 0.020), vec3(0.05, 0.05, 0.085), uDusk), far, smoothstep(0.25, 0.95, f));
  return mix(col, fc, clamp(f, 0.0, 1.0));
}
`;

const PLACE = /* glsl */`
uniform sampler2D uPlaces;
uniform vec2 uPlacesSize;
vec4 placeState(float i) {
  float x = mod(i, uPlacesSize.x), y = floor(i / uPlacesSize.x);
  return texture2D(uPlaces, (vec2(x, y) + 0.5) / uPlacesSize);
}
`;

// ------------------------------------------------------------------------------------------------ buildings (and their mirror)
// one prism (ow-scene prism(): 8 walls + a roof fan) per instance. aCorner = which corner (sx, sz) and which side of its chamfer;
// aFace = wall kind (0 an x wall, 1 a z wall, 2 a chamfer, 3 the roof) and the share along the wall. iShape = chamfer (0 a box ..
// 0.3 an octagon), taper (0 straight .. 1 a point). iPos = base centre (y = the stack base), iSize = w, h, d, iInfo = place index,
// seed, state (0 ruin .. 5 vault), lit share; iTint = the place's colour; iMisc = born day, part (0 body, 1 setback, 2 mast,
// 4 cap), tilt, filler flag. The place texture: r = grown 0..1, g = pulse, b = selected, a = light level / 2.
export const BUILD_VS = COMMON + PLACE + /* glsl */`
attribute vec3 aCorner; attribute vec2 aFace;
attribute vec3 iPos; attribute vec3 iSize; attribute vec4 iInfo; attribute vec3 iTint; attribute vec4 iMisc; attribute vec2 iShape;
uniform float uDay;
varying vec3 vW; varying vec3 vN; varying vec2 vF; varying float vFW; varying float vTop; varying float vRoof; varying float vY0;
varying vec4 vInfo; varying vec3 vTint; varying vec4 vPS; varying vec2 vMisc;
void main() {
  vec4 ps = placeState(iInfo.x);
  float seed = iInfo.y, st = iInfo.z;
  float born = clamp((uDay - iMisc.x) * 1.6, 0.0, 1.0);
  float g = clamp(ps.r * 1.35 - seed * 0.35, 0.0, 1.0) * born;
  g = g * g * (3.0 - 2.0 * g);
  float c = iShape.x, tp = iShape.y;
  float y = position.y;
  float h = iSize.y * max(g, 0.0005) * (1.0 + ps.g * 0.05 * sin(uTime * 9.0 + seed * 40.0));
  vec2 q = aCorner.z < 0.5 ? vec2(aCorner.x * 0.5, aCorner.y * (0.5 - c)) : aCorner.z < 1.5 ? vec2(aCorner.x * (0.5 - c), aCorner.y * 0.5) : vec2(0.0);
  float yy = y;
  if (st < 0.5) yy -= y * (0.12 + 0.55 * hash12(vec2(seed * 97.0 + aCorner.x * 3.1, aCorner.y * 7.3 + seed)));   // a ruin's broken top
  float shrink = 1.0 - tp * yy;
  vec3 lp = vec3(q.x * iSize.x * shrink, yy * h, q.y * iSize.z * shrink);
  // the wall's outward normal (tilted by the taper) and its width
  vec2 nh = aFace.x < 0.5 ? vec2(aCorner.x, 0.0) : aFace.x < 1.5 ? vec2(0.0, aCorner.y) : normalize(vec2(aCorner.x * iSize.z, aCorner.y * iSize.x));
  float reach = abs(dot(vec2(q.x * iSize.x, q.y * iSize.z), nh));
  vec3 n = aFace.x > 2.5 ? vec3(0.0, 1.0, 0.0) : normalize(vec3(nh.x, tp * reach / max(h, 0.05), nh.y));
  float wlen = aFace.x < 0.5 ? (1.0 - 2.0 * c) * iSize.z : aFace.x < 1.5 ? (1.0 - 2.0 * c) * iSize.x : c * length(iSize.xz);
  if (iMisc.z > 0.0) {                         // a ruin leans
    float a = iMisc.z * (hash12(vec2(seed, 4.2)) - 0.5) * 2.0;
    lp = vec3(lp.x * cos(a) - lp.y * sin(a), lp.x * sin(a) + lp.y * cos(a), lp.z);
  }
  vec3 wp = vec3(iPos.x, iPos.y * g, iPos.z) + lp;
  vF = vec2(aFace.y * wlen * shrink, wp.y);
  vFW = wlen * shrink;
  vRoof = step(2.5, aFace.x);
  vTop = iPos.y * g + h;
  vY0 = iPos.y * g;
#ifdef MIRROR
  wp.y = -wp.y; n.y = -n.y;
  wp.x += sin(uTime * 1.3 + wp.y * 0.8 + wp.z * 0.07) * 0.035 * wp.y;
#endif
  vW = wp; vN = n; vInfo = iInfo; vTint = iTint; vPS = ps; vMisc = iMisc.yw;
  if (aFace.x > 1.5 && aFace.x < 2.5 && c < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // a box: no chamfer walls to draw
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const BUILD_FS = COMMON + /* glsl */`
uniform vec3 uStreet;
varying vec3 vW; varying vec3 vN; varying vec2 vF; varying float vFW; varying float vTop; varying float vRoof; varying float vY0;
varying vec4 vInfo; varying vec3 vTint; varying vec4 vPS; varying vec2 vMisc;
const float FH = 0.34;     // a floor (world units)
const float BW = 0.27;     // a window bay
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float seed = vInfo.y, st = vInfo.z, litF = vInfo.w, part = vMisc.x, filler = vMisc.y;
  float light = vPS.a * 2.0, pulse = vPS.g, sel = vPS.b;
  vec3 tint = vTint;
  float ruin = 1.0 - step(0.5, st), scaf = step(0.5, st) * (1.0 - step(1.5, st));
  float crown = step(3.5, st) * (1.0 - step(4.5, st)), vault = step(4.5, st), bright = step(2.5, st);
  float cap = step(3.5, part), mast = step(1.5, part) * (1.0 - cap);
  // the material: dark glass, concrete or warm stone, chosen per building (a cap is polished metal: it reflects like glass)
  float m = hash12(vec2(seed * 31.7, 2.3));
  float glass = max(step(m, 0.46) * (1.0 - ruin), cap);
  vec3 alb = glass > 0.5 ? vec3(0.020, 0.025, 0.034) : m < 0.78 ? vec3(0.060, 0.058, 0.056) : vec3(0.085, 0.068, 0.052);
  alb = mix(alb, vec3(0.05, 0.035, 0.028), ruin);
  alb = mix(alb, vec3(0.035, 0.036, 0.042), cap + mast);
  // light: the sky dome, the moon (dusk: a low sun), the city's own orange light from below, a contact shadow at the foot
  float hemi = N.y * 0.5 + 0.5;
  vec3 skyAmb = mix(vec3(0.09, 0.12, 0.24), vec3(0.22, 0.25, 0.38), uDusk);
  vec3 grdAmb = mix(vec3(0.07, 0.045, 0.03), vec3(0.22, 0.16, 0.12), uDusk);
  vec3 L = lightDir();
  float ndl = max(dot(N, L), 0.0);
  vec3 col = alb * (mix(grdAmb, skyAmb, hemi) + lightCol() * ndl * 2.2);
  float wy = abs(vW.y);                                                             // the mirror pass has y < 0: never exp() of a big positive
  col += alb * uStreet * 0.9 * exp(-wy * 0.6) * (1.0 - vRoof);                   // street light washing the lowest floors
  float ao = mix(0.35, 1.0, smoothstep(0.0, 1.6, wy)) * mix(1.0, 0.82, (1.0 - vRoof) * exp(-wy * 0.2));
  col *= ao;
  // the sky in the glass (fresnel), the moon / sun glint at the edges
  vec3 R = reflect(-V, N);
  float nv = max(dot(N, V), 0.0);
  float fr = mix(0.03, 0.06, glass) + (1.0 - mix(0.03, 0.06, glass)) * pow(1.0 - nv, 5.0);
  vec3 env = skyCol(vec3(R.x, abs(R.y) * 0.9 + 0.02, R.z)) * 1.6;
  env += uStreet * 0.45 * (1.0 - smoothstep(-0.4, 0.1, R.y));                       // the lit street in the lower windows
  float spec = pow(max(dot(R, L), 0.0), mix(24.0, 220.0, glass));
  col += (env * fr + lightCol() * spec * mix(0.15, 2.5, glass)) * mix(0.35, 1.0, glass) * (1.0 - vRoof * 0.6) * (1.0 - ruin * 0.8);
  float edge = min(vF.x, vFW - vF.x);
  if (vRoof < 0.5 && mast < 0.5 && cap < 0.5) {
    // the window grid: floors and bays in world units; near = each window, far = whole lit floors (filtered, no shimmer)
    vec2 wf = vec2(vF.x / BW, (vF.y - vY0) / FH + 0.12);
    vec2 id = floor(wf), fp = fract(wf);
    vec2 fw = max(fwidth(wf), vec2(1e-4));
    float detail = 1.0 - smoothstep(0.16, 0.48, max(fw.x, fw.y));
    vec2 lo = smoothstep(vec2(0.13, 0.22) - fw, vec2(0.13, 0.22) + fw, fp);
    vec2 hi = 1.0 - smoothstep(vec2(0.87, 0.86) - fw, vec2(0.87, 0.86) + fw, fp);
    float win = lo.x * lo.y * hi.x * hi.y;
    float lf = clamp(litF * 0.48, 0.0, 1.0) * mix(1.0, 0.62, uDusk);
    if (vault > 0.5) lf = step(vF.y, vTop * litF) * 0.92 + 0.05;                     // an account: lit up to its progress
    // floors are lit in runs (an office floor, a row of flats): the picture is lit floors with a few dark rooms, not noise
    float run = hash12(vec2(floor(id.x / 2.0), id.y) + seed * 41.0);
    float runOn = step(run, lf);
    float on = runOn * step(0.12, hash12(id + seed * 113.0)) + (1.0 - runOn) * step(0.96, hash12(id * 1.3 + seed));
    float onFar = mix(lf, runOn, mix(0.22, 0.5, detail * 2.0));
    float flick = step(0.996, hash12(id * 1.7 + seed)) * step(0.0, sin(uTime * 0.35 + run * 50.0));
    on = max(on * (1.0 - flick), flick * (1.0 - on));
    // one colour temperature per building (cool offices in glass, warm homes in stone), a little variety per floor
    float warmB = step(0.55, hash12(vec2(seed * 9.1, 5.7)) + (1.0 - glass) * 0.3 - glass * 0.25);
    float r2 = hash12(vec2(id.y, floor(id.x / 2.0)) + seed * 7.0);
    vec3 wc = mix(vec3(0.66, 0.80, 1.0), vec3(1.0, 0.62, 0.32), warmB);
    wc = mix(wc, vec3(1.0, 0.86, 0.66), step(0.8, r2) * 0.7);
    wc = mix(wc, tint, step(0.95, r2) * 0.6);
    float gain = 0.75 + 0.5 * hash12(vec2(id.y, seed)) + 1.2 * pow(hash12(id + 3.1), 6.0);
    float inside = 0.75 + 0.45 * smoothstep(0.2, 0.9, fp.y);                             // a ceiling light in each room
    float wNear = win * on * gain * inside;
    float wFar = 0.42 * onFar;
    float w = mix(wFar, wNear, detail);
    float lobby = (1.0 - step(0.5, part)) * (1.0 - smoothstep(FH * 0.8, FH * 1.0, vF.y - vY0)) * step(3.0, vTop) * (1.0 - filler * 0.6);
    float lit = (w * mix(1.0, 1.2, bright) * mix(1.0, 0.85, filler) + lobby * 0.7) * light * (1.0 - ruin) * (1.0 - scaf * 0.6);
    col = mix(col, col * 0.4, win * detail * (1.0 - on));                               // a dark window is darker than the wall
    col += wc * lit * mix(0.42, 0.4, uDusk);
    // glass towers: a slim spandrel line between floors catches the sky
    col += env * 0.08 * glass * (1.0 - smoothstep(0.0, 0.08, fp.y)) * detail;
    // scaffolding: an amber frame on what is still being tested
    float sx = 1.0 - smoothstep(0.0, 0.045, (0.5 - abs(fract(vF.x / 0.9) - 0.5)) * 0.9);
    float sy = 1.0 - smoothstep(0.0, 0.045, (0.5 - abs(fract(vF.y / 0.68) - 0.5)) * 0.68);
    col += vec3(1.0, 0.55, 0.16) * mix(0.15, max(sx, sy), detail) * scaf * 0.4 * light;
    // ruins: embers in the cracks near the ground
    float emb = exp(-vF.y * 1.1) * (0.55 + 0.45 * sin(uTime * 1.7 + seed * 30.0 + vF.x * 2.3)) * step(0.62, hash12(floor(vF * 3.0) + seed));
    col += vec3(1.0, 0.30, 0.08) * emb * ruin * 0.5;
    // the place's colour only as an accent: a thin crown line on working and app towers, lit corners on the apps
    float crownLine = (1.0 - smoothstep(0.0, 0.07, vTop - vF.y)) * step(0.5, part + crown);
    col += tint * crownLine * (bright + crown) * (1.0 - filler) * light * 1.6;
    float corner = (1.0 - smoothstep(0.0, 0.05, edge)) * mix(0.3, 1.0, detail);
    col += tint * corner * crown * light * 0.5;
    // the vault's fill line shimmers
    float fill = 1.0 - smoothstep(0.0, 0.12, abs(vF.y - vTop * litF));
    col += vec3(1.0, 0.8, 0.4) * fill * vault * step(0.03, litF) * 3.0 * (0.7 + 0.3 * sin(uTime * 3.0 + vF.x * 4.0));
  } else if (mast > 0.5) {
    // a mast: dark, with an aviation light blinking at the tip
    col += vec3(1.0, 0.06, 0.03) * step(vTop - 0.3, vF.y) * (0.4 + 5.0 * step(0.75, fract(uTime * 0.6 + seed * 3.0)));
  } else if (cap > 0.5) {
    // a pyramid cap: metal, its ridge lit in the place's colour on app towers, a warm glow on the rest
    col += mix(vec3(1.0, 0.78, 0.5), tint, crown) * (1.0 - smoothstep(0.0, 0.05, edge)) * light * mix(0.12, 1.1, crown);
    col += vec3(1.0, 0.06, 0.03) * step(vTop - 0.12, vF.y) * step(0.8, fract(uTime * 0.6 + seed * 3.0)) * 4.0;
  } else {
    // a roof: dark, a parapet lip that catches the light, a few rooftop lights
    col *= 0.7;
    col += tint * 0.02 * light * (1.0 - ruin) * (1.0 - filler * 0.6);
  }
  // a pulse runs up the building; the selected place glows at its edges
  col += tint * pulse * 1.2 * smoothstep(0.8, 1.0, 1.0 - abs(fract(vF.y * 0.08 - uTime * 0.9) - 0.5) * 2.0);
  col += tint * sel * (0.6 + 0.4 * sin(uTime * 4.0)) * (fr * 0.06 + (1.0 - smoothstep(0.0, 0.05, edge)) * 1.2);   // selected: a lit outline, not a lit box
#ifdef MIRROR
  col *= 0.5 * exp(-max(-vW.y, 0.0) * 0.05);
  col = (col.r == col.r && col.g == col.g && col.b == col.b) ? min(col, vec3(0.3)) : vec3(0.0);   // a reflection is never a light source (no bloom spikes)
#endif
  col = fogged(col, vW);
  if (!(col.r == col.r && col.g == col.g && col.b == col.b)) col = vec3(0.0);                // never a NaN into the bloom
  gl_FragColor = vec4(min(col, vec3(24.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------------------------------------ the ground: streets, lamps, the plaza, the sea
export const GROUND_VS = /* glsl */`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
export const GROUND_FS = COMMON + /* glsl */`
uniform sampler2D uGlow; uniform sampler2D uLand; uniform vec4 uGlowRect;
uniform float uCell, uPlaza, uR;
uniform vec4 uArcs; uniform vec3 uBorder[4];
uniform vec3 uStreet;
uniform vec4 uTowns[18];
varying vec3 vW;
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 xz = vW.xz;
  float r = length(xz);
  vec3 V = normalize(cameraPosition - vW);
  vec2 guv = (xz - uGlowRect.xy) / uGlowRect.zw;
  vec3 glow = texture2D(uGlow, guv).rgb;
  float land = texture2D(uLand, guv).r;
  vec3 col;
  float alpha;
  vec2 fw = fwidth(xz);
  float px = max(fw.x, fw.y);
  float detail = 1.0 - smoothstep(0.2, 0.8, px);
  if (land > 0.02) {
    // streets on the cell borders (every 4th an avenue), pavements at the kerbs, sodium lamps every lot along both kerbs
    vec2 q = xz / uCell + 0.5;
    vec2 fq = abs(fract(q) - 0.5);
    vec2 dEdge = (0.5 - fq) * uCell;                       // the distance to the street's centre line, per axis
    vec2 k = floor(q + 0.5);
    vec2 ave = vec2(1.0) - step(0.5, abs(mod(k, 4.0)));
    vec2 sw = vec2(0.86);
    vec2 street = 1.0 - smoothstep(sw - px * 0.5, sw + px * 0.6, dEdge);
    vec2 kerb = (1.0 - smoothstep(sw + 0.12, sw + 0.28 + px, dEdge)) * (1.0 - street);
    float inCity = step(uPlaza + 0.6, r) * land;
    float st = max(street.x, street.y) * inCity;
    float pave = max(kerb.x, kerb.y) * inCity * (1.0 - st);
    // lamps: on both kerbs of every street, one per lot along it
    vec2 along = vec2(xz.y, xz.x);
    vec2 la = (fract(along / 1.75) - 0.5) * 1.75;
    vec2 lc = dEdge - 0.78;
    vec2 lampD = lc * lc + la * la;
    float lamps = (exp(-lampD.x * 3.2) + exp(-lampD.y * 3.2)) * inCity;
    float lampCore = (exp(-lampD.x * 90.0) + exp(-lampD.y * 90.0)) * inCity * detail;
    vec2 lane = 1.0 - smoothstep(vec2(0.025), vec2(0.05) + px, dEdge);
    float dash = step(0.5, fract((xz.x + xz.y) * 0.45));
    float lanes = max(lane.x * ave.x, lane.y * ave.y) * inCity * dash * detail;
    float wet = vnoise(xz * 0.35) * 0.5 + vnoise(xz * 1.3) * 0.5;
    vec3 asphalt = mix(vec3(0.0045, 0.005, 0.0065), vec3(0.03, 0.03, 0.035), uDusk);
    vec3 block = mix(vec3(0.010, 0.010, 0.012), vec3(0.06, 0.055, 0.05), uDusk);
    col = mix(block, asphalt, st);
    col = mix(col, block * 1.8 + vec3(0.004), pave);
    vec3 sodium = uStreet;
    float lampAvg = mix(0.14, 1.0, detail);                // far away: the lamps' average, not a moire
    col += sodium * mix(0.06, lamps * 0.5, detail) * (st + pave * 0.8) * lampAvg * (1.0 - uDusk * 0.7) * mix(1.0, 0.5, smoothstep(60.0, 260.0, cameraPosition.y));
    col += sodium * lampCore * 2.4 * (1.0 - uDusk * 0.5);
    col += glow * (0.05 + 0.22 * st);
    col += vec3(1.0, 0.82, 0.55) * lanes * 0.12;
    // wet asphalt: the sky and the lamps in it at a grazing angle
    float fr = 0.02 + 0.98 * pow(1.0 - max(V.y, 0.0), 5.0);
    col += skyCol(reflect(-V, vec3(0.0, 1.0, 0.0))) * fr * (0.25 + 0.5 * wet) * st;
    // the district borders: thin boulevards in the two districts' colours, flowing outward
    float ang = atan(xz.y, xz.x);
    float inside = step(uPlaza, r) * (1.0 - smoothstep(uR, uR + 6.0, r));
    for (int i = 0; i < 4; i++) {
      float a = uArcs[i];
      float dl = abs(sin(ang - a)) * r;
      float b = (1.0 - smoothstep(0.12, 0.45 + px, dl)) * step(0.0, cos(ang - a)) * inside;
      col += uBorder[i] * b * (0.45 + 0.55 * smoothstep(0.6, 1.0, sin(r * 0.25 - uTime * 2.2))) * 0.7;
    }
    float ring1 = 1.0 - smoothstep(0.12, 0.45 + px, abs(r - uPlaza));
    col += vec3(1.0, 0.8, 0.5) * ring1 * 0.9;
    // the plaza: dark polished stone, a fine gold inlay of rays and rings
    float pl = 1.0 - step(uPlaza - 0.4, r);
    float rays = smoothstep(0.985, 1.0, cos(ang * 16.0)) * smoothstep(7.0, uPlaza, r);
    float rings = smoothstep(0.96, 1.0, cos(r * 1.1));
    vec3 stone = mix(vec3(0.010, 0.010, 0.012), vec3(0.07, 0.065, 0.06), uDusk) + skyCol(reflect(-V, vec3(0.0, 1.0, 0.0))) * fr * 0.6;
    col = mix(col, stone + vec3(1.0, 0.78, 0.45) * (rays * 0.16 + rings * 0.05) + glow * 0.1, pl);
    alpha = mix(0.88, 0.95, pl);
    col = mix(vec3(0.004, 0.008, 0.016), col, smoothstep(0.02, 0.6, land));
    alpha = mix(0.62, alpha, smoothstep(0.02, 0.6, land));
  } else {
    // the sea: deep, the sky, the moon / the sun's path and the far lights in it, a slow swell; the mirrored city shows through
    float sw = vnoise(xz * 0.09 + vec2(uTime * 0.05, uTime * 0.03));
    vec3 n = normalize(vec3((sw - 0.5) * 0.14 + (vnoise(xz * 0.8 + uTime * 0.2) - 0.5) * 0.05 * detail, 1.0, (vnoise(xz * 0.21 + 3.0 - uTime * 0.04) - 0.5) * 0.14));
    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 rv = reflect(-V, n);
    float glint = pow(max(dot(rv, lightDir()), 0.0), mix(300.0, 60.0, uDusk));
    col = mix(vec3(0.002, 0.004, 0.009), vec3(0.02, 0.03, 0.05), uDusk) + skyCol(rv) * fr * mix(0.9, 0.55, uDusk) + lightCol() * glint * mix(4.0, 1.6, uDusk) + glow * 0.04;
    alpha = 0.62;
    // a satellite town's island: dark blocks, a lit street grid (its average from afar), the town's glow
    float town = 0.0;
    for (int i = 0; i < 18; i++) {
      vec4 tw = uTowns[i];
      if (tw.w < 0.5) continue;
      float dt = length(xz - tw.xy) / tw.z;
      town = max(town, (1.0 - smoothstep(1.02, 1.12 + 0.06 * sin(atan(xz.y - tw.y, xz.x - tw.x) * 5.0 + tw.x), dt)) * (1.0 + 0.6 * exp(-dt * dt * 4.0)));
    }
    if (town > 0.0) {
      vec2 g = abs(fract(xz / 3.2 + 0.5) - 0.5) * 3.2;
      float stG = (1.0 - smoothstep(0.42, 0.6 + px, min(g.x, g.y)));
      vec3 tc = mix(vec3(0.008, 0.008, 0.010), vec3(0.06, 0.055, 0.05), uDusk);
      tc += uStreet * mix(0.12, stG * 0.3, detail) * (1.0 - uDusk * 0.7) * min(town, 1.6) + glow * 0.05;
      col = mix(col, tc, min(town, 1.0));
      alpha = mix(alpha, 0.92, min(town, 1.0));
    }
  }
  col = fogged(col, vW);
  if (!(col.r == col.r && col.g == col.g && col.b == col.b)) col = vec3(0.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------------------------------------ the sky: stars, the moon, clouds lit by the city
export const SKY_VS = /* glsl */`
varying vec3 vD;
void main() { vD = normalize(position); vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }
`;
export const SKY_FS = COMMON + /* glsl */`
uniform float uAurora;
varying vec3 vD;
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 d = normalize(vD);
  vec3 col = skyCol(d);
  float up = smoothstep(0.02, 0.25, d.y);
  // clouds: a thin deck high over the city, its underside lit orange by the streets (dusk: by the sun), thinning overhead
  float cover = 0.0;
  if (d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.06) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = vn(uv) * 0.55 + vn(uv * 2.3 + 7.1) * 0.3 + (uAurora > 0.0 ? vn(uv * 5.1 + 3.3) * 0.15 : 0.075);
    cover = smoothstep(0.5, 0.82, n) * smoothstep(0.02, 0.12, d.y) * (1.0 - smoothstep(0.45, 0.95, d.y) * 0.6);
    vec3 under = mix(vec3(0.07, 0.035, 0.022), vec3(0.75, 0.38, 0.2), uDusk) * exp(-d.y * 3.0) + mix(vec3(0.012, 0.014, 0.026), vec3(0.2, 0.2, 0.3), uDusk);
    float rim = pow(max(dot(d, normalize(mix(uMoonDir, sunDir(), uDusk))), 0.0), 6.0);
    col = mix(col, under + lightCol() * rim * 0.25, cover * 0.85);
  }
  // stars (a few, between the clouds) and a faint Milky Way, night only
  vec3 sc = d * 220.0;
  vec3 cell = floor(sc);
  float s = hash13(cell);
  float star = step(0.9968, s) * (1.0 - smoothstep(0.08, 0.42, length(fract(sc) - 0.5)));
  float tw = 0.55 + 0.45 * sin(uTime * (1.0 + s * 3.0) + s * 80.0);
  float night = 1.0 - uDusk;
  col += vec3(0.85, 0.9, 1.0) * star * tw * up * (1.0 + 3.0 * step(0.9994, s)) * (1.0 - cover) * night;
  float bq = dot(d, normalize(vec3(0.35, 0.55, -0.75))) * 3.2;
  col += vec3(0.04, 0.04, 0.075) * exp(-bq * bq) * up * (0.5 + 0.5 * hash13(floor(d * 90.0))) * (1.0 - cover) * night;
  // the moon and its halo (night); at dusk the sun's disc sits on the horizon
  float m = dot(d, uMoonDir);
  col += (vec3(0.95, 0.93, 0.85) * smoothstep(0.99955, 0.99975, m) * 3.0 * (1.0 - cover * 0.7) + vec3(0.2, 0.25, 0.4) * pow(max(m, 0.0), 300.0)) * night;
  col += vec3(4.0, 2.2, 1.0) * smoothstep(0.99968, 0.99985, dot(d, sunDir())) * uDusk;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------------------------------------ the far shore: other cities and hills on the horizon
// one open cylinder round the world (uv.x = the angle, uv.y = the height share): hills behind, a broken skyline of far towns with
// tiny lit windows in front, all fogged into the horizon. "Hundreds of cities": every gap of the sea has a town on its shore.
export const FAR_VS = /* glsl */`
varying vec2 vUv; varying vec3 vW;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
export const FAR_FS = COMMON + /* glsl */`
varying vec2 vUv; varying vec3 vW;
float vn1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash12(vec2(i, 1.7)), hash12(vec2(i + 1.0, 1.7)), f); }
void main() {
  float a = vUv.x * 900.0;                                   // 900 columns round the horizon
  float y = vUv.y;
  float hill = 0.18 + 0.5 * vn1(vUv.x * 18.0) * vn1(vUv.x * 5.0 + 3.0) + 0.08 * vn1(vUv.x * 70.0);
  float town = smoothstep(0.42, 0.7, vn1(vUv.x * 26.0 + 11.0));
  float col0 = floor(a);
  float bh = town * (0.08 + 0.55 * pow(hash12(vec2(col0, 3.3)), 2.2)) * step(0.18, hash12(vec2(col0, 9.1)));
  float inTown = step(y, bh);
  float inHill = step(y, hill * 0.55);
  if (inTown + inHill < 0.5) discard;
  vec3 dir = normalize(vW - cameraPosition);
  vec3 hz = skyCol(vec3(dir.x, 0.02 + y * 0.03, dir.z));
  vec3 c = mix(hz * 0.55, hz * 0.8, inHill * (1.0 - inTown));
  // a town's lit windows: tiny warm points, more of them low down; and its glow on the haze
  vec2 g = vec2(a * 3.0, y * 260.0);
  float wl = step(0.62, hash12(floor(g) + col0)) * inTown;
  float pt = (1.0 - smoothstep(0.15, 0.45, length(fract(g) - 0.5)));
  c += mix(vec3(1.0, 0.62, 0.32), vec3(0.7, 0.82, 1.0), step(0.7, hash12(floor(g) * 1.3))) * wl * pt * 1.4 * (1.0 - uDusk * 0.6);
  c += vec3(1.0, 0.55, 0.28) * town * 0.05 * (1.0 - y) * (1.0 - uDusk);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------------------------------------ halos: the light of each place in the haze
export const HALO_VS = PLACE + /* glsl */`
attribute vec4 aHalo; attribute vec4 aCol; attribute float aPlace;
uniform float uTime;
varying vec2 vUv; varying vec3 vC;
void main() {
  vec4 ps = placeState(aPlace);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = aHalo.w * (0.25 + 0.75 * ps.r) * (1.0 + ps.g * 0.5 + ps.b * 0.35);
  vec3 wp = aHalo.xyz + (right * position.x + up * position.y) * s;
  vUv = position.xy;
  float dcam = distance(cameraPosition, aHalo.xyz);
  vC = aCol.rgb * aCol.a * ps.r * ps.a * 2.0 * (1.0 + ps.g * 2.5 + ps.b * 0.6) * 0.22 * smoothstep(s * 1.5, s * 4.5, dcam);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const HALO_FS = /* glsl */`
varying vec2 vUv; varying vec3 vC;
void main() {
  float d = length(vUv);
  float a = exp(-d * d * 5.0) * (1.0 - smoothstep(0.8, 1.0, d));
  gl_FragColor = vec4(vC * a, 1.0);
}
`;

// ------------------------------------------------------------------------------------------------ traffic: lights along the streets and the boulevards
// aLine: x = kind (0 an x street, 1 a z street, 2 a boulevard), y = the street line (or the boulevard angle), z = phase, w = speed (signed)
export const TRAFFIC_VS = /* glsl */`
attribute vec4 aLine; attribute vec3 aCol;
uniform float uTime, uR, uPlaza, uSize, uWarp;
varying vec3 vC; varying vec2 vUv;
void main() {
  float L = uR + 14.0;
  float along = mod(aLine.z * 2.0 * L + uTime * aLine.w, 2.0 * L) - L;
  vec3 c, dir;
  float lane = sign(aLine.w) * 0.32;
  if (aLine.x < 0.5) { c = vec3(along, 0.1, aLine.y + lane); dir = vec3(sign(aLine.w), 0.0, 0.0); }
  else if (aLine.x < 1.5) { c = vec3(aLine.y + lane, 0.1, along); dir = vec3(0.0, 0.0, sign(aLine.w)); }
  else { float rr = uPlaza + (along + L) * 0.5 * (uR - uPlaza) / L; c = vec3(cos(aLine.y) * rr, 0.12, sin(aLine.y) * rr); dir = vec3(cos(aLine.y), 0.0, sin(aLine.y)) * sign(aLine.w); }
  float r = length(c.xz);
  float vis = (1.0 - smoothstep(uR - 2.0, uR + 7.0, r)) * step(uPlaza + 1.0, r);
  // a streak: long along the road (a long exposure's trail), thin across it, never thinner than about a pixel
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float wid = max(0.07, -mv.z * 0.0024) * uSize;
  float len = 0.5 + abs(aLine.w) * 0.16;
  vec3 across = normalize(cross(dir, normalize(cameraPosition - c)) + 1e-5);
  vec3 wp = c + dir * (position.y - 0.5) * len + across * position.x * wid;
  vUv = position.xy;
  vC = aCol * vis * (1.0 - uWarp * 0.6);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const TRAFFIC_FS = /* glsl */`
varying vec3 vC; varying vec2 vUv;
void main() { float t = clamp(vUv.y + 0.5, 0.0, 1.0); float a = exp(-vUv.x * vUv.x * 14.0) * pow(t, 2.2) * (1.0 - smoothstep(0.92, 1.0, t) * 0.4); gl_FragColor = vec4(vC * a * 2.2, 1.0); }
`;

// ------------------------------------------------------------------------------------------------ searchlight beams
export const BEAM_VS = /* glsl */`
attribute vec4 aBase; attribute vec4 aBeam; attribute vec3 aCol;
uniform float uTime;
varying float vY; varying vec3 vC; varying float vEdge;
void main() {
  float t = uTime * aBeam.z + aBeam.w;
  vec3 dir = normalize(vec3(sin(t) * 0.42, 1.0, cos(t * 0.83) * 0.42));
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
  vec3 fwd = cross(side, dir);
  float y = position.y;
  vec3 wp = aBase.xyz + dir * y * aBeam.x + (side * position.x + fwd * position.z) * aBeam.y * (0.03 + y * 0.5);
  vY = y; vC = aCol * aBase.w;
  vec3 n = normalize(side * position.x + fwd * position.z);
  vEdge = abs(dot(n, normalize(cameraPosition - wp)));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const BEAM_FS = /* glsl */`
varying float vY; varying vec3 vC; varying float vEdge;
void main() { float a = pow(clamp(1.0 - vY, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.8, vEdge) * 0.075; gl_FragColor = vec4(vC * a, 1.0); }
`;

// ------------------------------------------------------------------------------------------------ rings: crowns, progress arcs, shock waves
// aRing: x, y, z, radius; aArc: progress (0..1 bright arc), speed, width share, tilt; aCol: colour, intensity
export const RING_VS = PLACE + /* glsl */`
attribute vec4 aRing; attribute vec4 aArc; attribute vec4 aCol; attribute float aPlace;
uniform float uTime;
varying vec2 vP; varying vec4 vArc; varying vec4 vC; varying float vSel;
void main() {
  vec4 ps = placeState(aPlace);
  vec3 p = position;                      // the ring in x / y (RingGeometry), laid flat and tilted
  float ct = cos(aArc.w), st = sin(aArc.w);
  float rot = uTime * aArc.y;
  vec2 q = vec2(p.x * cos(rot) - p.y * sin(rot), p.x * sin(rot) + p.y * cos(rot));
  vec3 lp = vec3(q.x, q.y * st, q.y * ct) * aRing.w * (0.2 + 0.8 * ps.r) * (1.0 + ps.g * 0.25);
  vP = p.xy; vArc = aArc; vC = aCol * vec4(1.0, 1.0, 1.0, ps.a * 2.0 * (1.0 + ps.g * 2.0 + ps.b)); vSel = ps.b;
  gl_Position = projectionMatrix * viewMatrix * vec4(aRing.xyz + lp, 1.0);
}
`;
export const RING_FS = /* glsl */`
varying vec2 vP; varying vec4 vArc; varying vec4 vC; varying float vSel;
void main() {
  float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
  float r = length(vP);
  float arc = step(a, vArc.x);
  float ticks = step(0.75, fract(a * 72.0));
  float band = smoothstep(1.0 - vArc.z, 1.0 - vArc.z * 0.6, r) * (1.0 - smoothstep(0.985, 1.0, r));
  float k = band * (arc * 1.0 + (1.0 - arc) * 0.18 + ticks * 0.15);
  gl_FragColor = vec4(vC.rgb * vC.a * k * 0.55, 1.0);
}
`;

// the shock wave and the light pillar of a warp landing or a learning pulse (a few pooled meshes)
export const FX_VS = /* glsl */`
varying vec2 vUv; varying float vY;
void main() { vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const SHOCK_FS = /* glsl */`
uniform vec3 uCol; uniform float uK;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float q1 = (r - 0.92) * 14.0, q2 = (r - 0.75) * 30.0;
  float ring = exp(-q1 * q1) + exp(-q2 * q2) * 0.4;
  gl_FragColor = vec4(uCol * ring * (1.0 - uK) * (1.0 - uK) * 1.5, 1.0);
}
`;
export const PILLAR_FS = /* glsl */`
uniform vec3 uCol; uniform float uK;
varying vec2 vUv;
void main() {
  float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.25) * sin(min(uK * 3.0, 3.14159)) * (1.0 - uK);
  gl_FragColor = vec4(uCol * a * 0.28, 1.0);
}
`;

// warp streaks: drawn in VIEW space round the camera's path (the world to world dash)
export const WARP_VS = /* glsl */`
attribute vec4 aS; attribute vec3 aCol;
uniform float uTime, uWarp;
varying float vA; varying vec3 vC; varying float vT;
void main() {
  float z = -mod(aS.z + uTime * aS.w * (6.0 + uWarp * 90.0), 90.0) - 1.0;
  float len = 1.0 + uWarp * 22.0 * aS.w;
  float y01 = position.y + 0.5;
  vec3 p = vec3(aS.x, aS.y, z + y01 * len);
  p.xy += position.x * 0.06 * normalize(vec2(-aS.y, aS.x) + 1e-4) * (1.0 + uWarp);
  vA = uWarp * smoothstep(-90.0, -40.0, z) * (1.0 - smoothstep(-6.0, -1.0, z));
  vT = y01; vC = aCol;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}
`;
export const WARP_FS = /* glsl */`
varying float vA; varying vec3 vC; varying float vT;
void main() { gl_FragColor = vec4(vC * vA * (1.0 - abs(vT - 0.5) * 2.0) * 1.6, 1.0); }
`;

// ------------------------------------------------------------------------------------------------ LED displays: ticker bands round the tallest towers
// (revamp-cities 2026-11-20, the owner's "displays"): an open cylinder per band (instanced), its text from one small canvas (a row per
// band, redrawn only when the line changes), scrolled round the tower on the GPU and drawn as a dot-matrix LED on dark glass.
// aBand = x, y, z, radius; aBand2 = height, row, repeats round the tower, scroll speed; aCol = the LED colour.
export const BAND_VS = PLACE + /* glsl */`
attribute vec4 aBand; attribute vec4 aBand2; attribute vec3 aCol; attribute float aPlace;
varying vec2 vUv; varying vec4 vB2; varying vec3 vC; varying vec3 vW; varying float vG;
void main() {
  vec4 ps = placeState(aPlace);
  float g = smoothstep(0.75, 1.0, ps.r);
  vec3 wp = aBand.xyz + vec3(position.x * aBand.w, (position.y) * aBand2.x * g, position.z * aBand.w);
  vUv = uv; vB2 = aBand2; vC = aCol * (0.6 + 0.4 * ps.a * 2.0) * (1.0 + ps.g); vW = wp; vG = g;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const BAND_FS = COMMON + /* glsl */`
uniform sampler2D uText; uniform float uRows;
varying vec2 vUv; varying vec4 vB2; varying vec3 vC; varying vec3 vW; varying float vG;
void main() {
  if (vG < 0.02) discard;
  float u = fract(vUv.x * vB2.z + uTime * vB2.w);                              // reads left to right from outside, scrolls right to left
  vec2 cells = vec2(2048.0 * 0.25, 128.0 * 0.25);                              // one LED per 4 x 4 canvas pixels
  vec2 q = vec2(u, vUv.y) * cells;
  vec2 fw = fwidth(q);
  float detail = 1.0 - smoothstep(0.35, 0.9, max(fw.x, fw.y));
  float dotm = mix(0.55, 1.0 - smoothstep(0.32, 0.46, length(fract(q) - 0.5)), detail);
  float t = texture2D(uText, vec2((floor(q.x) + 0.5) / cells.x, (vB2.y + 1.0 - (floor(q.y) + 0.5) / cells.y) / uRows)).r;   // one sample per LED
  float edge = smoothstep(0.0, 0.06, vUv.y) * smoothstep(0.0, 0.06, 1.0 - vUv.y);
  vec3 col = vec3(0.006, 0.008, 0.014) + vC * 0.035 * dotm;                    // dark glass, faint unlit LEDs
  col += vC * mix(0.42, t * dotm, detail) * 3.2 * edge;                         // far away: the band's average glow, not a dark ring
  col += vC * (1.0 - edge) * 0.6;                                               // the bright frame lines
  col = fogged(col, vW);
  gl_FragColor = vec4(min(col, vec3(12.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------------------------------------ aircraft: nav lights crossing the sky
// aPlane = orbit radius, altitude, angular speed (signed), phase; aKind = 0 the white strobe, 1 the red (left) wing, 2 the green (right) wing
export const PLANE_VS = /* glsl */`
attribute vec4 aPlane; attribute float aKind;
uniform float uTime;
varying vec3 vC; varying vec2 vUv;
void main() {
  float a = aPlane.w + uTime * aPlane.z;
  vec3 c = vec3(cos(a) * aPlane.x, aPlane.y, sin(a) * aPlane.x * 0.7);
  vec3 dir = normalize(vec3(-sin(a), 0.0, cos(a) * 0.7) * sign(aPlane.z));
  vec3 wing = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
  c += wing * (aKind < 0.5 ? 0.0 : aKind < 1.5 ? -1.6 : 1.6);
  float blink = aKind < 0.5 ? step(0.93, fract(uTime * 0.9 + aPlane.w)) * 1.0 : 0.55 + 0.45 * step(0.5, fract(uTime * 0.5 + aPlane.w * 3.0));
  vC = (aKind < 0.5 ? vec3(3.5, 3.5, 3.8) : aKind < 1.5 ? vec3(2.4, 0.15, 0.1) : vec3(0.15, 2.2, 0.5)) * blink;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = max(0.5, distance(cameraPosition, c) * 0.0045);
  vUv = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(c + (right * position.x + up * position.y) * s, 1.0);
}
`;
export const PLANE_FS = /* glsl */`
varying vec3 vC; varying vec2 vUv;
void main() { float d = length(vUv) * 2.0; gl_FragColor = vec4(vC * exp(-d * d * 6.0), 1.0); }
`;
