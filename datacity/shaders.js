// GLSL of the Data City (three.js ShaderMaterial: three adds the attribute / uniform preamble and maps gl_FragColor).
//   BUILD_*   one tile of buildings (InstancedMesh): 12 building types by idea family (tiered towers shaped in the vertex shader),
//             a physically based facade (Fresnel, roughness, sky + neon reflections, sun highlight, glass curtain walls), windows that
//             tell the data (lit = holds in 2021-25 AND 2026, unstable ones flicker, gold ones breathe), neon edges and
//             a roof crown on real towers, a ticker band, a pulse for rising ones, the Today layer, the watch crown, search
//             dimming, height fog; uMirror = 1 draws the wet-street reflection
//   IMP_*     the far LOD: one impostor per block, a 3 x 3 cluster of towers whose heights come from the block's buildings
//   GLOW_*    additive point sprites (bloom-like) on gold / green / rising roofs, monuments, strategy towers, beacons
//   FLOW_*    trades flowing along the streets;  CARS_*  flying traffic along splines baked into a float texture
//   GROUND_*  the wet ground (puddles, rain ripples, the plaza ring);  ROAD_*  wet asphalt with lane lines
//   SKY_*     the market-clock sky (sun / moon, dusk, overcast, lightning);  FOGL_*  drifting fog layers
//   RAY_*     god-ray cones (searchlights, sky beams, the search beam);  HOLO_*  holographic billboards
//   RAIN_*    rain streaks round the camera;  WATER_*  the harbor;  TOWER_*  LIT's tower
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble
export const FOG = `
uniform vec3 uFog; uniform float uFogD; uniform float uHaze;
float fogAmount(float d, float y){                            // distance fog + a height fog that lies on the ground (the skyline in depth layers)
  float f = 1.0 - exp(-uFogD*uFogD*d*d);
  float hf = (0.25 + uHaze*0.8) * exp(-max(y, 0.0)*0.06) * (1.0 - exp(-d*0.0030));
  return clamp(f + hf*0.45 + smoothstep(650.0, 1350.0, d), 0.0, 1.0);        // all fog before the ground's edge (no seam at the horizon)
}`;
export const HASH = `float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }`;

export const BUILD_VS = `
attribute vec3 aColor; attribute vec4 aData; attribute vec4 aState; attribute float aSeed; attribute vec4 aLook;
attribute float aTier; attribute vec2 aRad;
uniform float uMirror; uniform float uGrow;
uniform vec4 uArchA[16]; uniform vec4 uArchB[16]; uniform vec4 uArchC[16];
varying vec3 vColor; varying vec4 vData; varying vec4 vState; varying vec3 vLocal; varying vec3 vN; varying float vFD; varying float vWy; varying float vSeed;
varying vec4 vLook; varying vec3 vW; varying float vRound; varying float vHalf;
void main(){
  vColor=aColor; vData=aData; vState=aState; vSeed=aSeed;
  int ai = int(aLook.x + 0.5);
  vec4 A = uArchA[ai]; vec4 B = uArchB[ai]; vec4 C = uArchC[ai];     // y1 y2 crown round | s0 bottom,top s1 bottom,top | s2 bottom,top glass rough
  float y0, y1, sb, st;
  if (aTier < 0.5) { y0 = 0.0; y1 = A.x; sb = B.x; st = B.y; }
  else if (aTier < 1.5) { y0 = A.x; y1 = A.y; sb = B.z; st = B.w; }
  else { y0 = A.y; y1 = 1.0 + A.z; sb = C.x; st = C.y; }
  float yf = mix(y0, y1, position.y);
  float sc = mix(sb, st, position.y);
  vec2 xz = mix(position.xz, aRad * 0.5, A.w) * sc;
  vLocal = vec3(xz.x, yf, xz.y); vRound = A.w; vHalf = max(0.02, 0.5 * sc);
  vLook = vec4(aLook.x, aLook.y, C.z, C.w);
  mat4 M = modelMatrix * instanceMatrix;
  vec3 c0 = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float gr = clamp(uGrow * 1.9 - length(c0.xz) / 480.0 - aSeed * 0.15, 0.0, 1.0); gr = gr*gr*(3.0-2.0*gr);
  vec4 wp = M * vec4(xz.x, yf * max(gr * aState.z, 0.001), xz.y, 1.0);
  if(uMirror>0.5) wp.y = -wp.y;
  vW = wp.xyz; vWy = wp.y;
  vec3 nrm = normal;
  if (abs(normal.y) < 0.5) {
    nrm = normalize(mix(normal, vec3(aRad.x, 0.0, aRad.y), A.w));
    float sy = length(M[1].xyz), sx = length(M[0].xyz);
    nrm.y += ((sb - st) * 0.5 * sx) / (sy * max(y1 - y0, 0.02) + 0.0001);        // a tapering tier leans its walls
    nrm = normalize(nrm);
  }
  vN = normalize(mat3(M) * nrm);
  vec4 mv = viewMatrix*wp; vFD = -mv.z; gl_Position = projectionMatrix*mv;
}`;
export const BUILD_FS = `
uniform float uTime; uniform float uMirror; uniform float uDay; uniform float uToday; uniform float uWet;
uniform float uDusk; uniform float uCloud; uniform vec3 uSun; uniform vec3 uAccent; uniform float uFlash;
varying vec3 vColor; varying vec4 vData; varying vec4 vState; varying vec3 vLocal; varying vec3 vN; varying float vFD; varying float vWy; varying float vSeed;
varying vec4 vLook; varying vec3 vW; varying float vRound; varying float vHalf;
${FOG}
${HASH}
float h2(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031 + vSeed * 0.731); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }   // sin-free: stable per cell on every GPU
vec3 envSky(vec3 d){                                         // the sky the glass reflects (the same blue hour as the sky dome, the city's warm glow low)
  float h = clamp(d.y, -0.4, 1.0);
  vec3 zen = mix(vec3(${NEON ? '0.022,0.032,0.072' : '0.10,0.09,0.20'}), vec3(0.20,0.42,0.80), uDay);
  vec3 mid = mix(vec3(${NEON ? '0.075,0.115,0.21' : '0.30,0.22,0.30'}), vec3(0.50,0.66,0.88), uDay);
  vec3 hor = mix(uFog + vec3(0.10,0.055,0.025), vec3(0.82,0.86,0.92), uDay);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h));
  c = mix(c, zen, smoothstep(0.16, 0.7, h));
  c = mix(c, uFog * 0.55 + vec3(0.012,0.010,0.008), smoothstep(0.0, -0.18, h));     // below the horizon: the dark street
  c += vec3(1.0,0.50,0.26) * uDusk * 0.45 * exp(-abs(h)*5.0);
  float s = max(dot(d, normalize(uSun)), 0.0);
  c += mix(vec3(1.0,0.7,0.45), vec3(1.0,0.97,0.9), uDay) * pow(s, 40.0) * 0.7 * step(-0.08, uSun.y);
  c = mix(c, vec3(dot(c, vec3(0.333)))*0.75 + 0.03, uCloud*0.7);
  return c + vec3(0.6,0.7,1.0) * uFlash * 0.4;
}
void main(){
  vec3 N = normalize(vN);
  vec3 n = abs(N);
  float side = 1.0 - step(0.7, n.y);
  float H = vData.x;
  float across = n.x > n.z ? vLocal.z : vLocal.x;
  float gx = vRound > 0.5 ? atan(vLocal.z, vLocal.x) * 1.43239 + 4.5 : across * 3.0 + 1.5;
  float hy = vLocal.y * H;                                                   // metres above the street (world units)
  vec2 g = vec2(gx, hy * 1.7);
  vec2 cell = floor(g); vec2 f = fract(g);
  vec2 fw = min(fwidth(g), vec2(1.0));
  float body0 = 1.0 - step(1.002, vLocal.y);                                // the crown above the roof has no windows (the roof itself, y = 1, is body)
  float lobby = (1.0 - step(0.85, hy)) * step(2.2, H);                     // the street floor of a real building: a lobby band, no window grid
  // the window grid, anti-aliased (fwidth), each pane soft-edged: mullions and spandrels in between
  vec2 lo = vec2(0.17, 0.26), hi = vec2(0.83, 0.80);
  vec2 wb = smoothstep(lo - fw, lo + fw, f) * (1.0 - smoothstep(hi - fw, hi + fw, f));
  float far = smoothstep(0.32, 0.85, max(fw.x, fw.y));                      // far away the grid melts into its average (no shimmer)
  float win = mix(wb.x * wb.y, 0.3, far) * side * body0 * (1.0 - lobby);
  float face = (n.x > n.z ? 1.0 : 3.0) + (N.x + N.z > 0.0 ? 0.0 : 5.0);       // which wall (a whole number: no per-pixel noise on tapered walls)
  float rnd = h2(cell + face * 17.3);
  float steady = vLook.y;                                                    // 1 gold, .8 holds in both, .4 one period, .1 none
  // the windows tell the data: lit = holds in 2021-25 and 2026; unstable ideas flicker, gold ones breathe
  float topDark = 1.0 - 0.35 * smoothstep(0.55, 1.0, vLocal.y) * (1.0 - uDay);    // the upper floors go home first
  float ft = floor(uTime * (0.7 + (1.0 - steady) * 3.5) + vSeed * 9.0);
  float flick = step(1.0 - (0.004 + (1.0 - steady) * 0.09), h2(cell + ft));
  float lit = abs(step(rnd, vData.y * topDark) - flick);
  float litAvg = vData.y * topDark;
  float breathe = steady > 0.95 ? 0.85 + 0.15*sin(uTime*1.3 + rnd*6.0) : 1.0;
  float fired = step(1.5, vState.x) * uToday;
  lit = max(lit, fired * step(rnd, 0.92));
  lit = mix(lit, max(litAvg, fired * 0.9), far);
  float dimW = mix(0.30 + 0.70 * h2(cell * 3.7 + 1.3), 0.7, far);          // some panes bright, most dim (blinds, lamps)
  // warm homes / cool offices, the idea's colour in the light (class reads as the tint)
  float office = step(0.5, fract(vSeed * 7.31 + 0.2));
  vec3 warm = vec3(1.0, 0.80, 0.54), cool = vec3(0.80, 0.89, 1.0);
  vec3 wc = mix(warm, cool, clamp(office * 0.75 + (h2(cell * 0.71) - 0.5) * 0.6, 0.0, 1.0));
  wc = mix(wc, vColor * 1.15 + 0.08, 0.30);
  wc = steady > 0.95 ? mix(wc, vec3(1.0, 0.82, 0.45), 0.45) : wc;          // gold ideas glow golden
  wc *= mix(1.0, 0.72, step(steady, 0.3));                                   // noise: a dimmer, sparser light
  // the facade: dark cool stone and glass, a physically based reflection (Fresnel, roughness, the sky, the moon / sun highlight)
  vec3 V = normalize(cameraPosition - vW);
  float NoV = clamp(dot(N, V), 0.0, 1.0);
  vec3 Ld = normalize(mix(vec3(-0.45,0.62,-0.35), uSun + vec3(0.0,0.08,0.0), uDay));
  float diff = 0.55 + 0.45*max(dot(N, Ld), 0.0);
  vec3 stone = mix(vec3(${NEON ? '0.050,0.066,0.098' : '0.11,0.095,0.085'}), vec3(${NEON ? '0.30,0.33,0.37' : '0.52,0.47,0.40'}), uDay);
  stone *= 0.86 + 0.28 * fract(vSeed * 13.7);                               // each building its own shade
  stone = mix(stone, vColor * (0.20 + 0.25*uDay), 0.10);
  float grain = 0.94 + 0.12 * h2(floor(vLocal.xz*40.0) + floor(hy*6.0));
  float ao = mix(0.42, 1.0, smoothstep(0.0, 4.5, hy)) * mix(0.8, 1.0, smoothstep(0.0, 1.0, vLocal.y));   // the base darker, near the street
  vec3 body = stone * diff * grain * ao;
  body += stone * vec3(1.0, 0.62, 0.36) * 1.6 * max(dot(N, normalize(uSun)), 0.0) * uDusk * uDay * side;   // the golden hour rakes the facades that face the low sun
  float glassK = clamp(vLook.z * 0.75 + win * 0.6, 0.0, 1.0);                // curtain walls are glass all over, a window is always glass
  float rough = mix(vLook.w, 0.06, glassK);
  float fres = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-V, N);
  vec3 env = envSky(R);
  float streak = smoothstep(0.80, 1.0, noise(vec2(R.x*7.0 + R.z*5.0, vWy*0.3)));
  env += (uAccent * 0.4 + vec3(1.0,0.7,0.45) * 0.4) * streak * 0.35 * (1.0 - uDay*0.7) * glassK;  // the street's light caught in the glass
  float shin = min(2.0 / max(rough*rough*rough*rough, 0.0006) - 2.0, 900.0);
  float spec = pow(max(dot(N, normalize(Ld + V)), 0.0), shin) * (shin + 8.0) / 60.0;
  float rim = pow(1.0 - NoV, 3.0) * side;                                    // the edges catch the moon / the sky
  vec3 col = body * (1.0 - fres*glassK*0.5) + env * fres * (0.25 + 0.75*glassK) * ao;
  col += mix(vec3(0.70,0.80,1.0)*0.5, vec3(1.0,0.95,0.85), uDay) * spec * fres * (0.3 + glassK) * mix(0.6, 1.1, uDay);
  col += env * rim * 0.10 * glassK;
  // the unlit panes are dark glass that holds the sky; the lit ones glow (emissive, a little brighter at the sill)
  vec3 pane = env * (0.22 + 0.6*fres) * mix(0.55, 0.95, uDay) + vec3(0.008,0.012,0.022);
  col = mix(col, pane, win * (0.55 + 0.35*vLook.z));
  float sill = mix(0.82 + 0.3 * (1.0 - f.y), 1.0, far);
  col += win * lit * dimW * breathe * sill * wc * mix(2.2, 0.30, uDay);
  // the lobby: a warm bright band at street level, framed by its own entry columns
  float lob = lobby * side * body0 * smoothstep(0.1, 0.18, hy) * (1.0 - smoothstep(0.62, 0.7, hy)) * (0.55 + 0.45*smoothstep(0.1, 0.2, abs(fract(gx * 1.5) - 0.5)));
  col = mix(col, vec3(1.0, 0.82, 0.58) * mix(0.75, 0.4, uDay) * (0.5 + 0.5*h2(vec2(vSeed, 3.0))), lob * 0.6);
  // the idea's colour only as accents: a thin crown light line, faint corner lines on real towers, the roof, the spire
  float tall = smoothstep(4.0, 9.0, H);
  float edge = smoothstep(0.90, 1.0, abs(across) / vHalf) * side * (1.0 - vRound);
  float crown = (1.0 - smoothstep(0.03, 0.07 + 0.012*H, (1.0 - vLocal.y) * H)) * side * body0;
  float neon = mix(1.0, 0.45, uDay);
  col += vColor * (edge*0.3*tall + crown*(0.55 + 0.7*tall)) * neon;
  col += vColor * step(0.985, fract(hy*0.3 - uTime*0.3 + vSeed)) * side * tall * 0.22 * neon;   // the ticker band, a faint thin one
  // the roof: dark gravel, a lighter parapet rim, one plant-room box (offset per building), a hint of the idea's colour
  vec2 rq = abs(vLocal.xz) / vHalf;
  float parapet = smoothstep(0.78, 0.86, max(rq.x, rq.y));
  vec2 bo = vLocal.xz / vHalf - (vec2(fract(vSeed*5.3), fract(vSeed*9.1)) - 0.5) * 0.5;
  float plant = 1.0 - smoothstep(0.26, 0.30, max(abs(bo.x), abs(bo.y)));
  vec3 roof = stone * (0.85 + 0.2*parapet + 0.3*plant) * (0.9 + 0.2*h2(vec2(vSeed, 7.0))) + vec3(0.016,0.016,0.020) * (1.0 - uDay);   // lit a little by the city's glow
  col = mix(col, roof * ao, 1.0 - side);
  float rimL = smoothstep(0.86, 0.95, max(rq.x, rq.y)) * (1.0 - side) * (1.0 - vRound);
  col += vColor * rimL * 0.32 * neon;                                         // a thin roof outline in the idea's colour (reads from the overview)
  float slim = 1.0 - smoothstep(0.12, 0.24, vHalf);                          // a real spire / mast (a wide penthouse stays dark stone)
  col += vColor * (1.0 - body0) * side * slim * (0.18 + 0.45 * step(0.6, fract(hy * 1.2 - uTime * 0.15))) * neon;   // the spire / mast: dark, lit rings in the idea's colour
  col += vColor * vData.z * (0.5 + 0.5*sin(uTime*3.2 + vSeed*6.0)) * (0.08 + crown*0.9 + edge*0.4);
  if (uToday > 0.5) {
    float armed = step(0.5, vState.x) * (1.0 - step(1.5, vState.x));
    col = col * mix(0.3, 1.0, max(fired, armed)) + vec3(${NEON ? '0.3,' : ''}0.95,${NEON ? '1.0' : '0.75,0.40'}) * fired * (0.2 + crown*1.6 + edge*0.6) + vec3(${NEON ? '0.25,' : ''}0.55,${NEON ? '1.0' : '0.45,0.30'}) * armed * 0.16;
  }
  col += vec3(1.0,0.88,0.45) * step(0.5, vState.y) * (crown*2.4 + edge*0.8 + 0.1);
  col += vec3(1.0,0.8,0.35) * vState.w * (0.5 + 1.6*crown + 0.6*edge + 0.6*win);   // a celebration flash (fireworks over a gold idea)
  col *= mix(1.0, 0.12, vData.w);
  float fa = fogAmount(vFD, abs(vWy));
  col = mix(col, uFog, fa);
  float a = 1.0;
  if(uMirror>0.5) a = (0.14 + 0.26*uWet) * (1.0 - smoothstep(0.0, 9.0, -vWy)) * (1.0 - fa);
  gl_FragColor = vec4(col, a);
}`;
export const IMP_VS = `
attribute float aSub; attribute vec4 aHa; attribute vec4 aHb; attribute float aHc; attribute vec3 aColor; attribute vec4 aMeta;
uniform float uGrow;
varying vec3 vColor; varying vec4 vMeta; varying vec3 vW; varying vec3 vN; varying float vFD; varying float vY;
void main(){
  vec4 sa = step(abs(vec4(aSub) - vec4(0.0,1.0,2.0,3.0)), vec4(0.5));
  vec4 sb = step(abs(vec4(aSub) - vec4(4.0,5.0,6.0,7.0)), vec4(0.5));
  float h = dot(aHa, sa) + dot(aHb, sb) + aHc * step(abs(aSub - 8.0), 0.5);
  vec3 c0 = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float gr = clamp(uGrow * 1.9 - length(c0.xz) / 480.0, 0.0, 1.0); gr = gr*gr*(3.0-2.0*gr);
  vec3 p = position; p.y *= h * max(gr, 0.001); p *= aMeta.w;
  vColor = aColor; vMeta = aMeta; vY = position.y;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p,1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix*instanceMatrix)*normal);
  vec4 mv = viewMatrix*wp; vFD = -mv.z; gl_Position = projectionMatrix*mv;
}`;
export const IMP_FS = `
uniform float uTime; uniform float uDay; uniform float uToday;
varying vec3 vColor; varying vec4 vMeta; varying vec3 vW; varying vec3 vN; varying float vFD; varying float vY;
${FOG}
${HASH}
void main(){
  vec3 n = abs(vN);
  float side = 1.0 - step(0.5, n.y);
  vec2 g = vec2((n.x > 0.5 ? vW.z : vW.x) * 1.1, vW.y * 1.4);
  vec2 f = fract(g), fw = min(fwidth(g), vec2(1.0));
  vec2 wb = smoothstep(vec2(0.2,0.28) - fw, vec2(0.2,0.28) + fw, f) * (1.0 - smoothstep(vec2(0.8,0.76) - fw, vec2(0.8,0.76) + fw, f));
  float far = smoothstep(0.32, 0.85, max(fw.x, fw.y));
  float win = mix(wb.x*wb.y, 0.3, far) * step(0.85, vW.y);
  float lit = mix(step(hash(floor(g)), vMeta.x), vMeta.x, far);
  float dimW = mix(0.3 + 0.7*hash(floor(g)*3.7 + 1.3), 0.7, far);
  float diff = 0.55 + 0.45*max(dot(normalize(vN), normalize(vec3(-0.45,0.62,-0.35))), 0.0);
  vec3 stone = mix(vec3(${NEON ? '0.050,0.066,0.098' : '0.11,0.095,0.085'}), vec3(${NEON ? '0.30,0.33,0.37' : '0.52,0.47,0.40'}), uDay);
  float ao = mix(0.42, 1.0, smoothstep(0.0, 4.5, vW.y));
  vec3 wc = mix(mix(vec3(1.0,0.80,0.54), vec3(0.80,0.89,1.0), step(0.5, hash(floor(g*0.25)))), vColor*1.15 + 0.08, 0.30);
  vec3 col = mix(stone, vColor*0.2, 0.1)*diff*ao;
  col = mix(col, vec3(0.03,0.04,0.07)*mix(1.0, 5.0, uDay), side*win*0.6);
  col += side*win*lit*dimW*wc*mix(2.2, 0.3, uDay);
  float hTop = vW.y / max(vY, 0.001);
  col += vColor * side * (1.0 - smoothstep(0.03, 0.12, (1.0 - vY) * hTop)) * 0.4 * (1.0 - uDay*0.55);   // the thin crown line, as the full buildings
  col = mix(col, stone * 0.95 + vec3(0.016,0.016,0.020) * (1.0 - uDay), 1.0 - side);         // dark roofs, as the full buildings
  if (uToday > 0.5) col = col * mix(0.3, 1.0, step(0.5, vMeta.y)) + vec3(${NEON ? '0.3,' : ''}0.95,${NEON ? '1.0' : '0.75,0.40'}) * step(1.5, vMeta.y) * 0.25;
  col *= mix(1.0, 0.12, vMeta.z);
  col = mix(col, uFog, fogAmount(vFD, vW.y));
  gl_FragColor = vec4(col, 1.0);
}`;
export const GLOW_VS = `
attribute vec3 aColor; attribute float aSize; attribute float aPulse; attribute float aSeed; attribute float aToday;
uniform float uTime; uniform float uPR; uniform float uToday;
varying vec3 vColor; varying float vA;
void main(){
  vColor = aColor;
  float p = aPulse > 0.5 ? 0.55 + 0.45*sin(uTime*3.2 + aSeed*6.0) : 1.0;
  float show = aToday < 0.5 ? 1.0 : uToday;                   // the Today halos only show with the layer on
  if (aToday > 1.5) vColor = vec3(${NEON ? '0.35' : '1.0'}, ${NEON ? '0.95' : '0.82'}, ${NEON ? '1.0' : '0.50'});
  vA = p * show;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = min(aSize * p * (300.0 / max(1.0, -mv.z)), 26.0) * show * uPR;
  gl_Position = projectionMatrix * mv;
}`;
export const GLOW_FS = `
uniform float uDay; varying vec3 vColor; varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5; float r = length(d);
  float a = exp(-r*r*34.0)*0.55 + 0.6*exp(-r*r*240.0);                       // a tight hot core, a small soft halo (no fat discs)
  gl_FragColor = vec4(vColor * a * vA * mix(0.85, 0.35, uDay), 1.0);
}`;
export const FLOW_VS = `
attribute vec4 aSeg; attribute vec3 aColor; attribute vec2 aMove;
uniform float uTime; uniform float uPR;
varying vec3 vColor;
void main(){
  vColor = aColor;
  float t = fract(uTime * aMove.x + aMove.y);
  vec3 p = vec3(mix(aSeg.x, aSeg.z, t), 0.22, mix(aSeg.y, aSeg.w, t));
  vec4 mv = modelViewMatrix * vec4(p,1.0);
  gl_PointSize = min(3.2 * (60.0 / max(1.0, -mv.z)), 5.0) * uPR;
  gl_Position = projectionMatrix * mv;
}`;
export const FLOW_FS = `
varying vec3 vColor; uniform float uDay;
void main(){ vec2 d = gl_PointCoord-0.5; float a = exp(-dot(d,d)*30.0); gl_FragColor = vec4(vColor*a*mix(0.75,0.4,uDay),1.0); }`;
export const CARS_VS = `
attribute vec4 aCar;
uniform sampler2D uPaths; uniform vec2 uPathSize; uniform float uTime; uniform float uPR;
varying vec3 vColor; varying float vA;
vec3 pathAt(float pi, float u){
  float x = u * uPathSize.x; float i0 = floor(x); float fr = x - i0; float i1 = mod(i0 + 1.0, uPathSize.x);
  float v = (pi + 0.5) / uPathSize.y;
  vec3 a = texture2D(uPaths, vec2((i0 + 0.5) / uPathSize.x, v)).xyz;
  vec3 b = texture2D(uPaths, vec2((i1 + 0.5) / uPathSize.x, v)).xyz;
  return mix(a, b, fr);
}
void main(){
  float dir = sign(aCar.z);
  float u = fract(aCar.y + uTime * aCar.z - aCar.w * 0.0022 * dir);
  vec3 p = pathAt(aCar.x, u);
  p.y += dir > 0.0 ? 0.0 : 1.3;
  vColor = dir > 0.0 ? vec3(1.0, 0.9, 0.72) : vec3(1.0, 0.22, 0.32);
  vA = 1.0 - aCar.w * 0.3;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (2.8 - aCar.w * 0.7) * uPR * (110.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
export const CARS_FS = `
varying vec3 vColor; varying float vA; uniform float uDay;
void main(){ vec2 d = gl_PointCoord - 0.5; float a = (exp(-dot(d,d)*40.0) + 0.5*exp(-dot(d,d)*200.0)) * vA; gl_FragColor = vec4(vColor * a * mix(1.0, 0.5, uDay), 1.0); }`;
export const GROUND_VS = `varying vec3 vW; varying float vFD;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vec4 mv = viewMatrix*wp; vFD = -mv.z; gl_Position = projectionMatrix*mv; }`;
export const GROUND_FS = `
uniform float uDay; uniform float uTime; uniform float uWet; uniform float uRain; uniform vec3 uAccent;
varying vec3 vW; varying float vFD;
${FOG}
${HASH}
void main(){
  vec2 p = vW.xz / 2.2;
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  float line = (1.0 - min(min(g.x, g.y), 1.0)) * (1.0 - smoothstep(60.0, 200.0, vFD));     // paving joints, faint, only near
  vec3 base = mix(vec3(${NEON ? '0.020,0.024,0.034' : '0.15,0.125,0.10'}), vec3(${NEON ? '0.34,0.36,0.39' : '0.58,0.51,0.42'}), uDay);
  base *= 0.88 + 0.24 * noise(vW.xz * 0.11);                                     // pavement wear: never a flat colour
  float puddle = smoothstep(0.55, 0.75, noise(vW.xz * 0.07)) * uWet;
  vec3 col = base * (1.0 - puddle*0.45) + line * mix(vec3(0.020,0.022,0.030), vec3(0.05), uDay);
  float r = length(vW.xz);
  col += mix(${NEON ? 'mix(uAccent, vec3(1.0,0.72,0.42), 0.5)*' : 'vec3('}0.5${NEON ? '' : ',0.36,0.20)'}, vec3(0.08,0.09,0.10), uDay) * 0.22 * exp(-r*0.045);   // the plaza's warm spill
  col += ${NEON ? 'uAccent' : 'vec3(0.85,0.6,0.3)'} * 0.10 * smoothstep(0.35, 0.0, abs(r - 15.0));
  col += vec3(1.0,0.66,0.38) * puddle * 0.05 * (1.0 - uDay) * (0.6 + 0.4*noise(vW.xz*0.5 + uTime*0.2));   // the street lights in the puddles
  if (uRain > 0.01) {
    vec2 c = floor(vW.xz * 0.8); vec2 f = fract(vW.xz * 0.8) - 0.5;
    float t = fract(uTime * 0.9 + hash(c));
    float ring = smoothstep(0.06, 0.0, abs(length(f) - t * 0.5)) * (1.0 - t) * step(0.6, hash(c + 7.0));
    col += vec3(0.5, 0.7, 1.0) * ring * uRain * 0.25;
  }
  gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, 0.0)), 0.9);
}`;
export const ROAD_VS = `varying vec3 vW; varying vec2 vUv; varying float vFD; varying float vLen;
void main(){ vUv = uv; vLen = length(instanceMatrix[0].xyz); vec4 wp = modelMatrix*instanceMatrix*vec4(position,1.0); vW = wp.xyz; vec4 mv = viewMatrix*wp; vFD = -mv.z; gl_Position = projectionMatrix*mv; }`;
export const ROAD_FS = `
uniform float uDay; uniform float uTime; uniform float uWet; uniform vec3 uAccent;
varying vec3 vW; varying vec2 vUv; varying float vFD; varying float vLen;
${FOG}
${HASH}
void main(){
  vec3 col = mix(vec3(${NEON ? '0.014,0.016,0.022' : '0.05,0.04,0.03'}), vec3(${NEON ? '0.20,0.21,0.23' : '0.30,0.26,0.22'}), uDay);
  float along = vUv.x * vLen, ac = vUv.y - 0.5;
  float fwA = fwidth(along);
  float lane = (1.0 - smoothstep(0.012, 0.03, abs(ac))) * step(0.5, fract(along * 0.5)) * (1.0 - smoothstep(0.25, 0.6, fwA));
  float kerb = smoothstep(0.43, 0.49, abs(ac));
  float sheen = noise(vW.xz * 0.35 + vec2(0.0, uTime*0.05)) * uWet;
  // sodium street lights: warm pools every 6 m along each avenue, alternating sides
  float k = floor(along / 6.0), d = fract(along / 6.0) - 0.5;
  float sideL = mod(k, 2.0) < 1.0 ? -0.42 : 0.42;
  float pool = exp(-(d*d*36.0*6.0/9.0 + (ac - sideL)*(ac - sideL)*9.0)) * (1.0 - uDay*0.85);
  pool = mix(pool, 0.34, smoothstep(0.4, 1.6, fwA));                         // far: the pools melt into a warm line (no crawling dots)
  col += vec3(1.0, 0.66, 0.36) * (pool * (0.55 + 0.25*uWet) + 0.05) * (1.0 - uDay*0.85);   // from above the avenues read as warm lit lines
  col += vec3(0.9, 0.86, 0.75) * lane * 0.12 + vec3(0.06) * kerb * mix(0.4, 1.0, uDay);
  col += (vec3(1.0,0.68,0.40) * 0.10 + uAccent * 0.04) * sheen * (1.0 - uDay*0.7);
  gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, 0.0)), 0.94);
}`;
export const SKY_VS = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
export const SKY_FS = `
uniform vec3 uSun; uniform float uDay; uniform float uDusk; uniform float uCloud; uniform float uFlash; uniform vec3 uAccent; uniform vec3 uFog; uniform float uTime;
varying vec3 vP;
${HASH}
void main(){
  vec3 d = normalize(vP); float h = d.y;
  // blue hour to night: zenith -> mid -> the horizon fades into the fog colour, with the city's own warm glow on it
  vec3 zen = mix(vec3(${NEON ? '0.016,0.024,0.058' : '0.08,0.07,0.16'}), vec3(0.16,0.38,0.78), uDay);
  vec3 mid = mix(vec3(${NEON ? '0.062,0.098,0.18' : '0.24,0.17,0.25'}), vec3(0.46,0.64,0.88), uDay);
  vec3 c = mix(uFog, mid, smoothstep(0.0, 0.24, h));
  c = mix(c, zen, smoothstep(0.2, 0.8, h));
  c += vec3(1.0,0.60,0.35) * ${NEON ? '0.16' : '0.2'} * exp(-max(h, 0.0)*9.0) * smoothstep(-0.005, 0.06, h) * (1.0 - uDay) * (1.0 - uCloud*0.4);   // the city's glow, rising soft from the skyline (no seam on the far ground)
  vec3 sd = normalize(uSun);
  float s = max(dot(d, sd), 0.0);
  c += vec3(1.0,0.48,0.25) * uDusk * 0.55 * exp(-abs(h)*5.0) * (0.35 + 0.65*pow(s, 3.0));
  c += vec3(0.62,0.32,0.55) * uDusk * 0.16 * exp(-abs(h - 0.15)*7.0);
  c += mix(vec3(1.0,0.7,0.45), vec3(1.0,0.97,0.9), uDay) * (pow(s, 700.0)*3.0 + pow(s, 14.0)*0.22) * step(-0.08, sd.y);
  // the moon: a soft disc and a wide faint halo
  float m = max(dot(d, -sd), 0.0);
  float disc = smoothstep(0.99988, 0.99993, m);
  c += vec3(${NEON ? '0.92,0.95,1.0' : '1.0,0.92,0.76'}) * (disc*1.1 + pow(m, 260.0)*0.10 + pow(m, 24.0)*0.035) * (1.0 - uDay) * (1.0 - uCloud*0.7);
  // thin clouds, lit from below by the city (orange underside), drifting
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.10) * 0.9 + vec2(uTime*0.006, uTime*0.002);
    float cn = noise(cp)*0.55 + noise(cp*2.3 + 7.1)*0.3 + noise(cp*5.3 + 2.7)*0.15;
    float band = smoothstep(0.015, 0.10, h) * (1.0 - smoothstep(0.32, 0.75, h));
    float cl = smoothstep(0.50 - uCloud*0.25, 0.86, cn) * band;
    vec3 under = mix(vec3(0.24,0.14,0.11) + vec3(0.20,0.10,0.04)*exp(-h*7.0), vec3(0.92,0.93,0.96), uDay);
    under = mix(under, vec3(1.0,0.58,0.36), uDusk*0.35);
    c = mix(c, under, cl * 0.42);
  }
  vec3 grey = vec3(dot(c, vec3(0.333))) * 0.75 + 0.03;
  c = mix(c, grey, uCloud * 0.6);
  c = mix(c, uFog, smoothstep(0.01, -0.03, h));                          // below the horizon: the fog itself (no seam with the far city)
  c += vec3(0.65,0.72,1.0) * uFlash * (0.5 + 0.5*smoothstep(-0.1, 0.5, h));
  gl_FragColor = vec4(c, 1.0);
}`;
export const FOGL_VS = `varying vec3 vW; varying float vFD;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vec4 mv = viewMatrix*wp; vFD = -mv.z; gl_Position = projectionMatrix*mv; }`;
export const FOGL_FS = `
uniform vec3 uFog; uniform float uTime; uniform float uAlpha; uniform float uSeed; uniform vec3 uAccent; uniform float uDay;
varying vec3 vW; varying float vFD;
${HASH}
void main(){
  vec2 p = vW.xz * 0.012 + vec2(uTime*0.006 + uSeed, uTime*0.004);
  float n = noise(p) * 0.65 + noise(p * 2.7 + 3.1) * 0.35;
  float a = smoothstep(0.35, 0.85, n) * uAlpha * smoothstep(6.0, 40.0, vFD) * (1.0 - smoothstep(380.0, 900.0, vFD));
  vec3 c = uFog * 1.08 + vec3(0.03,0.018,0.01) * (1.0 - uDay);          // the mist takes the horizon's colour (a touch of the city's warm glow)
  gl_FragColor = vec4(c, a);
}`;
export const RAY_VS = `
attribute vec3 aColor; attribute float aAlpha;
varying vec3 vColor; varying float vY; varying vec3 vN; varying vec3 vV; varying float vA;
void main(){
  vColor = aColor; vA = aAlpha; vY = position.y;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const RAY_FS = `
uniform float uTime; uniform float uDay; uniform float uHaze; uniform float uGain; uniform float uFlip;
varying vec3 vColor; varying float vY; varying vec3 vN; varying vec3 vV; varying float vA;
void main(){
  float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float y = mix(vY, 1.0 - vY, uFlip);                    // 1: brightest at the wide end (sun rays onto the city)
  float a = core * smoothstep(0.0, 0.03, y) * (1.0 - smoothstep(0.25, 1.0, y)) * vA;
  a *= (0.75 + 0.25*sin(vY*30.0 - uTime*2.0)) * mix(1.0, 0.35, uDay) * (0.8 + uHaze*0.8) * uGain;
  gl_FragColor = vec4(vColor * a, 1.0);
}`;
export const HOLO_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
export const HOLO_FS = `
uniform sampler2D uMap; uniform float uTime; uniform vec3 uTint; uniform float uFade;
varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  float gl = step(0.97, fract(sin(floor(uTime*7.0)*12.9898)*43758.5453));
  uv.x += gl * 0.015 * sin(uv.y*90.0 + uTime*40.0);
  vec4 t = texture2D(uMap, uv);
  float r = texture2D(uMap, uv + vec2(0.004, 0.0)).a, b = texture2D(uMap, uv - vec2(0.004, 0.0)).a;
  float scan = 0.72 + 0.28*sin(uv.y*260.0 - uTime*5.0);
  vec2 e = min(uv, 1.0 - uv);
  float frame = smoothstep(0.03, 0.0, min(e.x, e.y*2.0));
  float fill = 0.10;
  vec3 c = (vec3(r, t.a, b)*0.6 + t.rgb*0.8) * scan + uTint * (frame*0.9 + fill);
  float a = (max(t.a, frame) * 0.9 + fill) * (0.85 + 0.15*sin(uTime*2.3)) * uFade;
  gl_FragColor = vec4(c * a, 1.0);
}`;
export const RAIN_VS = `
attribute vec3 aDrop;
uniform vec3 uCam; uniform float uTime; uniform float uRain;
varying float vA; varying float vFD;
void main(){
  float S = 110.0, Hh = 55.0;
  float x = uCam.x + mod(aDrop.x * S - uCam.x, S) - S*0.5;
  float z = uCam.z + mod(aDrop.y * S - uCam.z, S) - S*0.5;
  float y = mod(aDrop.z * Hh - uTime * (36.0 + aDrop.z*10.0), Hh) + max(0.0, uCam.y - Hh*0.7);
  vec3 p = vec3(x + position.y*0.35, y - position.y * (1.2 + uRain*1.4), z + position.y*0.15);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vFD = -mv.z;
  vA = step(aDrop.z, uRain) * (1.0 - position.y*0.6);
  gl_Position = projectionMatrix * mv;
}`;
export const RAIN_FS = `
varying float vA; varying float vFD; uniform float uDay;
void main(){ float a = vA * 0.35 * smoothstep(2.0, 8.0, vFD) * (1.0 - smoothstep(45.0, 75.0, vFD)); gl_FragColor = vec4(mix(vec3(0.55,0.7,1.0), vec3(0.8), uDay) * a, 1.0); }`;
export const WATER_VS = `varying vec3 vW; varying float vFD;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vec4 mv = viewMatrix*wp; vFD = -mv.z; gl_Position = projectionMatrix*mv; }`;
export const WATER_FS = `
uniform float uTime; uniform float uDay; uniform vec3 uAccent;
varying vec3 vW; varying float vFD;
${FOG}
${HASH}
void main(){
  vec2 p = vW.xz;
  float w = noise(p*0.15 + vec2(uTime*0.15, uTime*0.07)) * 0.6 + noise(p*0.6 - uTime*0.25) * 0.4;
  float streak = pow(noise(vec2(p.x*0.5, p.y*0.05 + uTime*0.3)), 6.0);
  vec3 col = mix(vec3(${NEON ? '0.012,0.018,0.032' : '0.05,0.11,0.12'}), vec3(${NEON ? '0.20,0.27,0.36' : '0.18,0.44,0.48'}), uDay) + vec3(0.02,0.03,0.05) * w;
  col = mix(col, uFog * 0.9, 0.35);                                                     // the water mirrors the horizon's colour
  col += (vec3(1.0,0.68,0.40) * 0.55 + uAccent * 0.25) * streak * (1.0 - uDay*0.7) + vec3(0.75,0.85,1.0) * pow(noise(vec2(p.x*0.4 + 9.0, p.y*0.06 - uTime*0.2)), 7.0) * 0.35;
  gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, 0.0)), 1.0);
}`;
export const TOWER_VS = `attribute vec3 aL; varying vec3 vL; void main(){ vL = aL; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
export const TOWER_FS = `
uniform float uTime; uniform float uDay; uniform vec3 uAccent; varying vec3 vL;
void main(){
  float band = smoothstep(0.92, 1.0, fract(vL.y*0.55 - uTime*0.35));
  float rib = smoothstep(0.85, 1.0, abs(sin(atan(vL.z, vL.x)*4.0)));
  vec3 a = mix(vec3(${NEON ? '0.25' : '0.95'},${NEON ? '0.85' : '0.72'},${NEON ? '1.0' : '0.38'}), uAccent, 0.25);
  vec3 c = vec3(${NEON ? '0.02' : '0.30'},${NEON ? '0.07' : '0.25'},${NEON ? '0.12' : '0.20'}) + a*(band*${NEON ? '0.9' : '0.35'} + rib*${NEON ? '0.35' : '0.2'}) + a*${NEON ? '0.12' : '0.10'};
  c = mix(c, c*${NEON ? '0.6' : '0.9'} + vec3(${NEON ? '0.1' : '0.16'},${NEON ? '0.2' : '0.13'},${NEON ? '0.3' : '0.09'}), uDay);
  gl_FragColor = vec4(c, 1.0);
}`;
export const STAR_VS = `
attribute float aSize; attribute float aPh;
uniform float uTime; uniform float uPR; varying float vA;
void main(){
  vA = 0.55 + 0.45*sin(uTime*(0.6 + aPh*1.4) + aPh*40.0);                    // a slow twinkle
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPR;
  gl_Position = projectionMatrix * mv;
}`;
export const STAR_FS = `
uniform float uA; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d,d)*26.0) * vA * uA * 0.6; gl_FragColor = vec4(vec3(0.82,0.87,1.0) * a, a); }`;   // under the bloom threshold: crisp pin-points, no blobs
export const BLINK_VS = `
attribute float aPh; uniform float uTime; uniform float uPR; uniform float uGrow; varying float vA;
void main(){
  float t = fract(uTime * 0.55 + aPh);
  vA = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.10, 0.22, t)) * step(0.99, uGrow);   // the aviation blink: a short red flash every ~2 s
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPR * clamp(260.0 / max(1.0, -mv.z), 2.0, 9.0);
  gl_Position = projectionMatrix * mv;
}`;
export const BLINK_FS = `
uniform float uDay; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float a = (exp(-dot(d,d)*60.0) + 0.25*exp(-dot(d,d)*14.0)) * vA * mix(1.0, 0.35, uDay); gl_FragColor = vec4(vec3(1.0, 0.12, 0.08) * a * 1.6, 1.0); }`;
