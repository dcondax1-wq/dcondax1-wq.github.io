// Olympus World shaders (cities/world/, night-worlds 2026-11-19). Plain GLSL strings for three r160 ShaderMaterial (three adds the
// #version / precision lines and turns attribute / varying / texture2D into GLSL 3 on WebGL2). Output is LINEAR HDR: the render core's
// finish pass tone maps (ACES) and encodes sRGB; on the 'off' tier the tonemapping / colorspace chunks do it straight to the screen.
// Everything that moves (growth, pulses, traffic, beams, warp streaks) moves on the GPU from uTime: the CPU only writes a few uniforms.

// the sky and the fog share one colour function, so far buildings melt into the horizon glow (aerial perspective)
export const COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uMoonDir;
uniform float uFogDensity;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 skyCol(vec3 d) {
  float h = d.y;
  vec3 zen = vec3(0.0035, 0.0062, 0.020);
  vec3 mid = vec3(0.012, 0.016, 0.050);
  vec3 hor = vec3(0.060, 0.040, 0.100);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h));
  c = mix(c, zen, smoothstep(0.15, 0.75, h));
  c += vec3(0.12, 0.05, 0.028) * exp(-max(h, 0.0) * 14.0);           // the city's own light on the low haze
  c += vec3(0.05, 0.09, 0.16) * pow(max(dot(d, uMoonDir), 0.0), 24.0) * 0.6;
  c = mix(c, vec3(0.010, 0.010, 0.018), 1.0 - smoothstep(-0.3, 0.0, h));
  return c;
}
vec3 fogged(vec3 col, vec3 wp) {
  vec3 dv = wp - cameraPosition;
  float d = length(dv);
  float hfade = exp(-max(wp.y, 0.0) * 0.015);
  float f = 1.0 - exp(-pow(d * uFogDensity, 1.5) * (0.5 + 0.5 * hfade));
  vec3 dir = dv / max(d, 1e-3);
  vec3 far = skyCol(vec3(dir.x, max(dir.y, 0.0) * 0.5 + 0.02, dir.z));
  vec3 fc = mix(vec3(0.007, 0.009, 0.022), far, smoothstep(0.35, 1.0, f));    // near haze is dark blue, the far one takes the horizon's glow
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
// a unit box (x, z in -0.5..0.5, y in 0..1, no floor face) per instance: iPos = base centre (y = the stack base), iSize = w, h, d,
// iInfo = place index, seed, state (0 ruin .. 5 vault), lit share; iTint = the window / light colour; iMisc = born day, part (0 body,
// 1 setback, 2 antenna, 3 app crown), tilt, filler flag. The place texture: r = grown 0..1, g = pulse, b = selected, a = light level / 2.
export const BUILD_VS = COMMON + PLACE + /* glsl */`
attribute vec3 iPos; attribute vec3 iSize; attribute vec4 iInfo; attribute vec3 iTint; attribute vec4 iMisc;
uniform float uDay;
varying vec3 vW; varying vec3 vN; varying vec2 vF; varying float vFW; varying float vTop; varying float vRoof;
varying vec4 vInfo; varying vec3 vTint; varying vec4 vPS; varying vec2 vMisc;
void main() {
  vec4 ps = placeState(iInfo.x);
  float seed = iInfo.y, st = iInfo.z;
  float born = clamp((uDay - iMisc.x) * 1.6, 0.0, 1.0);
  float g = clamp(ps.r * 1.35 - seed * 0.35, 0.0, 1.0) * born;
  g = g * g * (3.0 - 2.0 * g);
  vec3 p = position;
  float top = step(0.99, p.y);
  float h = iSize.y * max(g, 0.0005) * (1.0 + ps.g * 0.05 * sin(uTime * 9.0 + seed * 40.0));
  if (st < 0.5) p.y -= top * (0.12 + 0.55 * hash12(vec2(seed * 97.0 + sign(p.x) * 3.1, sign(p.z) * 7.3 + seed)));
  vec3 lp = vec3(p.x * iSize.x, p.y * h, p.z * iSize.z);
  if (iMisc.z > 0.0) {                         // a ruin leans
    float a = iMisc.z * (hash12(vec2(seed, 4.2)) - 0.5) * 2.0;
    lp = vec3(lp.x * cos(a) - lp.y * sin(a), lp.x * sin(a) + lp.y * cos(a), lp.z);
  }
  vec3 wp = vec3(iPos.x, iPos.y * g, iPos.z) + lp;
  vec3 n = normal;
  vF = vec2(abs(n.x) > 0.5 ? (p.z + 0.5) * iSize.z : (p.x + 0.5) * iSize.x, wp.y);
  vFW = abs(n.x) > 0.5 ? iSize.z : iSize.x;
  vRoof = step(0.5, n.y);
  vTop = iPos.y * g + h;
#ifdef MIRROR
  wp.y = -wp.y; n.y = -n.y;
  wp.x += sin(uTime * 1.3 + wp.y * 0.8 + wp.z * 0.07) * 0.035 * wp.y;
#endif
  vW = wp; vN = n; vInfo = iInfo; vTint = iTint; vPS = ps; vMisc = iMisc.yw;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const BUILD_FS = COMMON + /* glsl */`
uniform vec3 uMoonCol;
uniform vec3 uStreet;
varying vec3 vW; varying vec3 vN; varying vec2 vF; varying float vFW; varying float vTop; varying float vRoof;
varying vec4 vInfo; varying vec3 vTint; varying vec4 vPS; varying vec2 vMisc;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float seed = vInfo.y, st = vInfo.z, litF = vInfo.w, part = vMisc.x, filler = vMisc.y;
  float light = vPS.a * 2.0, pulse = vPS.g, sel = vPS.b;
  vec3 tint = vTint;
  float ruin = 1.0 - step(0.5, st), scaf = step(0.5, st) * (1.0 - step(1.5, st));
  float crown = step(3.5, st) * (1.0 - step(4.5, st)), vault = step(4.5, st), bright = step(2.5, st);
  vec3 base = mix(vec3(0.010, 0.013, 0.024), vec3(0.024, 0.019, 0.017), ruin);
  base = mix(base, vec3(0.020, 0.021, 0.027), scaf);
  float hemi = N.y * 0.5 + 0.5;
  vec3 col = base * (mix(vec3(0.05, 0.04, 0.06), vec3(0.10, 0.14, 0.28), hemi) * 1.8 + uMoonCol * max(dot(N, uMoonDir), 0.0) * 1.4);
  vec3 R = reflect(-V, N);
  float fr = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 env = skyCol(R) * 1.7 + uStreet * (1.0 - smoothstep(-0.35, 0.15, R.y)) * 0.35;
  col += env * fr * mix(1.0, 0.15, ruin) * (1.0 - vRoof * 0.5);
  col += uStreet * 0.07 * exp(-vF.y * 0.6);                                    // street light on the lowest floors
  float edge = min(vF.x, vFW - vF.x);
  if (vRoof < 0.5) {
    vec2 wf = vec2(vF.x / 0.56, vF.y / 0.64);
    vec2 id = floor(wf), fp = fract(wf);
    vec2 fw = max(fwidth(wf), vec2(1e-4));
    vec2 lo = smoothstep(vec2(0.27, 0.3) - fw, vec2(0.27, 0.3) + fw, fp);
    vec2 hi = 1.0 - smoothstep(vec2(0.73, 0.76) - fw, vec2(0.73, 0.76) + fw, fp);
    float win = lo.x * lo.y * hi.x * hi.y;
    float r1 = hash12(id + seed * 113.0);
    float lf = litF;
    if (vault > 0.5) lf = step(vF.y, vTop * litF) * 0.92 + 0.05;               // an account: lit up to its progress
    float on = step(r1, lf * 0.5);
    float flick = step(0.992, hash12(id * 1.7 + seed)) * step(0.0, sin(uTime * 0.35 + r1 * 50.0));
    on = max(on * (1.0 - flick), flick * (1.0 - on));
    float detail = 1.0 - smoothstep(0.32, 0.85, max(fw.x, fw.y));
    float w = mix(lf * 0.5 * 0.2, win * on, detail);
    float r2 = hash12(id.yx + seed * 7.0);
    vec3 wc = r2 < 0.5 ? vec3(1.0, 0.66, 0.34) : r2 < 0.78 ? vec3(0.72, 0.84, 1.0) : tint * 1.15;   // warm rooms, cool screens, the place's own colour
    float gain = (0.42 + 2.6 * pow(hash12(id + 3.1), 3.0)) * mix(1.0, 1.3, bright) * mix(1.0, 0.6, filler);
    col += wc * w * gain * light * (1.0 - ruin) * (1.0 - scaf * 0.55);
    // scaffolding: an amber frame and a blinking work light
    float sx = 1.0 - smoothstep(0.0, 0.045, (0.5 - abs(fract(vF.x / 0.9) - 0.5)) * 0.9);     // distance to the frame's bars
    float sy = 1.0 - smoothstep(0.0, 0.045, (0.5 - abs(fract(vF.y / 0.64) - 0.5)) * 0.64);
    col += vec3(1.0, 0.55, 0.16) * mix(0.2, max(sx, sy), detail) * scaf * 0.5 * light;
    // ruins: embers in the cracks near the ground
    float emb = exp(-vF.y * 1.1) * (0.55 + 0.45 * sin(uTime * 1.7 + seed * 30.0 + vF.x * 2.3)) * step(0.62, hash12(floor(vF * 3.0) + seed));
    col += vec3(1.0, 0.30, 0.08) * emb * ruin * 0.55;
    // working towers: lit corners and a crown line; app towers: LED fins and a glowing crown band
    float corner = (1.0 - smoothstep(0.0, 0.07, edge)) * mix(0.35, 1.0, detail);
    float crownLine = 1.0 - smoothstep(0.0, 0.16, vTop - vF.y);
    col += tint * (corner * 0.8 + crownLine * 1.5) * bright * (1.0 - filler) * light;
    float fin = mix(0.07, 1.0 - smoothstep(0.0, 0.045, (0.5 - abs(fract(vF.x / 0.75) - 0.5)) * 0.75), detail) * crown;
    col += tint * fin * 0.55 * light * (0.6 + 0.4 * sin(vF.y * 0.7 - uTime * 1.6 + seed * 9.0));
    float band = smoothstep(vTop - 1.4, vTop - 1.25, vF.y) * (1.0 - smoothstep(vTop - 0.55, vTop - 0.4, vF.y));
    col += tint * band * 2.4 * crown * light;
    // the vault's fill line shimmers
    float fill = 1.0 - smoothstep(0.0, 0.14, abs(vF.y - vTop * litF));
    col += vec3(1.0, 0.8, 0.4) * fill * vault * step(0.03, litF) * 3.5 * (0.7 + 0.3 * sin(uTime * 3.0 + vF.x * 4.0));
    // an antenna: a dark mast with a blinking red tip
    if (part > 1.5 && part < 2.5) col = col * 0.3 + vec3(1.0, 0.08, 0.04) * step(vTop - 0.35, vF.y) * (0.5 + 4.5 * step(0.7, fract(uTime * 0.7 + seed * 3.0)));
  } else {
    col += tint * 0.05 * light * (1.0 - ruin) * (1.0 - filler * 0.6);
  }
  // a pulse runs up the building; the selected place glows at its edges
  col += tint * pulse * 1.2 * smoothstep(0.8, 1.0, 1.0 - abs(fract(vF.y * 0.08 - uTime * 0.9) - 0.5) * 2.0);
  col += tint * sel * (0.6 + 0.4 * sin(uTime * 4.0)) * (fr * 0.25 + (1.0 - smoothstep(0.0, 0.06, edge)) * 1.8);   // selected: a lit outline, not a lit box
#ifdef MIRROR
  col *= 0.5 * exp(-max(-vW.y, 0.0) * 0.045);
  col = (col.r == col.r && col.g == col.g && col.b == col.b) ? min(col, vec3(0.3)) : vec3(0.0);   // a reflection is never a light source (no bloom spikes)
#endif
  col = fogged(col, vW);
  if (!(col.r == col.r && col.g == col.g && col.b == col.b)) col = vec3(0.0);                // never a NaN into the bloom
  gl_FragColor = vec4(min(col, vec3(24.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------------------------------------ the ground: wet streets, the plaza, the sea
export const GROUND_VS = /* glsl */`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
export const GROUND_FS = COMMON + /* glsl */`
uniform sampler2D uGlow; uniform sampler2D uLand; uniform vec4 uGlowRect;
uniform float uCell, uPlaza, uR;
uniform vec4 uArcs; uniform vec3 uBorder[4];
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
  if (land > 0.02) {
    // streets: thin lines on the cell borders; every 4th an avenue with a dashed centre line. They fade out at a distance (no shimmer).
    vec2 q = xz / uCell + 0.5;
    vec2 fq = abs(fract(q) - 0.5);
    vec2 dEdge = (0.5 - fq) * uCell;
    vec2 k = floor(q + 0.5);
    vec2 ave = vec2(1.0) - step(0.5, abs(mod(k, 4.0)));
    vec2 fw = fwidth(xz);
    float px = max(fw.x, fw.y);
    float detail = 1.0 - smoothstep(0.25, 0.9, px);
    vec2 sw = vec2(0.42) + ave * 0.38;
    vec2 street = 1.0 - smoothstep(sw - px * 0.5, sw + px * 0.8, dEdge);
    float inCity = step(uPlaza, r) * land;
    float st = max(street.x, street.y) * inCity;
    float aveOn = max(ave.x * street.x, ave.y * street.y);
    vec2 lane = 1.0 - smoothstep(vec2(0.03), vec2(0.07) + px, dEdge);
    float dash = step(0.45, fract((xz.x + xz.y) * 0.32));
    float lanes = max(lane.x * ave.x, lane.y * ave.y) * inCity * dash * detail;
    col = vec3(0.0065, 0.0072, 0.010) + glow * 0.045;
    col += (glow * 0.22 + vec3(0.016, 0.012, 0.009)) * st * mix(0.35, 1.0, detail);
    col += (glow * 0.35 + vec3(0.03, 0.022, 0.012)) * aveOn * inCity * detail * 0.6;
    col += vec3(1.0, 0.72, 0.42) * lanes * 0.22;
    // the district borders: boulevards that glow in the two districts' colours, flowing outward
    float ang = atan(xz.y, xz.x);
    float inside = step(uPlaza, r) * (1.0 - smoothstep(uR, uR + 6.0, r));
    for (int i = 0; i < 4; i++) {
      float a = uArcs[i];
      float dl = abs(sin(ang - a)) * r;
      float b = (1.0 - smoothstep(0.25, 0.9 + px, dl)) * step(0.0, cos(ang - a)) * inside;
      col += uBorder[i] * b * (0.55 + 0.45 * sin(r * 0.3 - uTime * 2.6)) * 1.1;
    }
    float ring1 = 1.0 - smoothstep(0.2, 0.7 + px, abs(r - uPlaza));
    col += vec3(1.0, 0.8, 0.5) * ring1 * 1.4;
    // the plaza: dark polished stone, gold rays and rings
    float pl = 1.0 - step(uPlaza - 0.4, r);
    float rays = smoothstep(0.965, 1.0, cos(ang * 16.0)) * smoothstep(7.0, uPlaza, r);
    float rings = smoothstep(0.93, 1.0, cos(r * 1.1));
    col = mix(col, vec3(0.012, 0.011, 0.013) + vec3(1.0, 0.78, 0.45) * (rays * 0.22 + rings * 0.08) + glow * 0.08, pl);
    alpha = mix(0.86, 0.95, pl);
    col = mix(vec3(0.004, 0.008, 0.016), col, smoothstep(0.02, 0.6, land));
    alpha = mix(0.62, alpha, smoothstep(0.02, 0.6, land));
  } else {
    // the sea: deep, the sky and the moon in it, a slow swell; the mirrored city shows through
    float sw = vnoise(xz * 0.09 + vec2(uTime * 0.05, uTime * 0.03));
    vec3 n = normalize(vec3((sw - 0.5) * 0.14, 1.0, (vnoise(xz * 0.21 + 3.0 - uTime * 0.04) - 0.5) * 0.14));
    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 rv = reflect(-V, n);
    float moon = pow(max(dot(rv, uMoonDir), 0.0), 420.0);
    col = vec3(0.002, 0.004, 0.009) + skyCol(rv) * fr * 0.8 + vec3(0.7, 0.8, 1.0) * moon * 0.4 + glow * 0.04;
    alpha = 0.62;
  }
  col = fogged(col, vW);
  if (!(col.r == col.r && col.g == col.g && col.b == col.b)) col = vec3(0.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------------------------------------ the sky: stars, the moon, a slow aurora
export const SKY_VS = /* glsl */`
varying vec3 vD;
void main() { vD = normalize(position); vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }
`;
export const SKY_FS = COMMON + /* glsl */`
uniform float uAurora;
varying vec3 vD;
void main() {
  vec3 d = normalize(vD);
  vec3 col = skyCol(d);
  float up = smoothstep(0.02, 0.25, d.y);
  vec3 sc = d * 220.0;
  vec3 cell = floor(sc);
  float s = hash13(cell);
  float star = step(0.9965, s) * (1.0 - smoothstep(0.08, 0.45, length(fract(sc) - 0.5)));
  float tw = 0.55 + 0.45 * sin(uTime * (1.0 + s * 3.0) + s * 80.0);
  col += vec3(0.85, 0.9, 1.0) * star * tw * up * (1.0 + 3.0 * step(0.9993, s));
  float bq = dot(d, normalize(vec3(0.35, 0.55, -0.75))) * 3.2;
  float band = exp(-bq * bq);                                                        // a faint Milky Way
  col += vec3(0.05, 0.05, 0.09) * band * up * (0.5 + 0.5 * hash13(floor(d * 90.0)));
  float m = dot(d, uMoonDir);
  col += vec3(0.95, 0.93, 0.85) * smoothstep(0.99955, 0.99975, m) * 3.0 + vec3(0.25, 0.3, 0.45) * pow(max(m, 0.0), 300.0) * 1.2;
  if (uAurora > 0.0) {
    float a = 0.0;
    float x = atan(d.x, d.z) * 3.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float c = sin(x * (1.4 + fi * 0.7) + uTime * (0.07 + fi * 0.03) + fi * 2.0) * 0.06 + 0.32 + fi * 0.05;
      float aq = (d.y - c) * 18.0;
      a += exp(-aq * aq) * (0.5 + 0.5 * sin(x * 7.0 + uTime * 0.3 + fi));
    }
    col += mix(vec3(0.05, 0.6, 0.45), vec3(0.35, 0.2, 0.7), smoothstep(0.25, 0.5, d.y)) * a * 0.09 * uAurora * up;
  }
  gl_FragColor = vec4(col, 1.0);
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
  vC = aCol.rgb * aCol.a * ps.r * ps.a * 2.0 * (1.0 + ps.g * 2.5 + ps.b * 0.6) * 0.4 * smoothstep(s * 1.5, s * 4.5, dcam);
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
  vec3 c;
  float lane = sign(aLine.w) * 0.35;
  if (aLine.x < 0.5) c = vec3(along, 0.12, aLine.y + lane);
  else if (aLine.x < 1.5) c = vec3(aLine.y + lane, 0.12, along);
  else { float rr = uPlaza + (along + L) * 0.5 * (uR - uPlaza) / L; c = vec3(cos(aLine.y) * rr, 0.14, sin(aLine.y) * rr); }
  float r = length(c.xz);
  float vis = (1.0 - smoothstep(uR - 2.0, uR + 7.0, r)) * step(uPlaza + 1.0, r);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float s = uSize * clamp(-mv.z * 0.004, 0.12, 1.4) * vis;
  vec3 wp = c + (right * position.x + up * position.y) * s;
  vUv = position.xy;
  vC = aCol * vis * (1.0 - uWarp * 0.6);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const TRAFFIC_FS = /* glsl */`
varying vec3 vC; varying vec2 vUv;
void main() { float d = length(vUv); gl_FragColor = vec4(vC * exp(-d * d * 7.0), 1.0); }
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
  vec3 wp = aBase.xyz + dir * y * aBeam.x + (side * position.x + fwd * position.z) * aBeam.y * (0.06 + y);
  vY = y; vC = aCol * aBase.w;
  vec3 n = normalize(side * position.x + fwd * position.z);
  vEdge = abs(dot(n, normalize(cameraPosition - wp)));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const BEAM_FS = /* glsl */`
varying float vY; varying vec3 vC; varying float vEdge;
void main() { float a = pow(clamp(1.0 - vY, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.8, vEdge) * 0.22; gl_FragColor = vec4(vC * a, 1.0); }
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
  gl_FragColor = vec4(vC.rgb * vC.a * k, 1.0);
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
