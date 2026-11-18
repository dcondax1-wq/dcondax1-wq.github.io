// GLSL of the Cities hub (three.js ShaderMaterial / RawShader-free: three adds the attribute / uniform preamble).
//   BUILD_*   instanced buildings from plain attributes (no instance matrix): neon windows (lit share = the window_by value), neon
//             edges and a roof crown on tall ones, a glow pulse (glow_by), search dimming and the gold selection, height fog
//   SLAB_*    the hub's floating islands (one lathe slab, instanced): dark top with a glowing rim, rocky underside
//   SKY_*     one sky for every city and the hub: gradient, stars, sun / moon, aurora curtains, lightning, ember haze
//   GROUND_*  the city's floor: faint grid, fade, district pads are separate instanced quads (PAD_*)
//   GLOW_*    additive point sprites on the roofs of glowing buildings
//   WX_*      weather points around the camera (rain, snow, embers, fireflies, dust, fog)
const FOG = `
uniform vec3 uFog; uniform float uFogD;
float fogAmount(float d){ return clamp(1.0 - exp(-uFogD*uFogD*d*d), 0.0, 1.0); }`;
const HASH = `float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }`;

export const BUILD_VS = `
attribute vec4 aPosSize; attribute vec4 aHY; attribute vec3 aColor; attribute vec2 aState; attribute float aSeed; attribute float aBob;
uniform float uGrow; uniform float uTime; uniform float uBobAmp; uniform float uScenery;
varying vec3 vColor; varying vec4 vHY; varying vec2 vState; varying vec3 vLocal; varying vec3 vN; varying float vFD; varying float vSeed; varying float vWy; varying vec3 vW;
void main(){
  vColor = aColor; vHY = aHY; vState = aState; vLocal = position; vSeed = aSeed;
  float gr = clamp(uGrow * 1.8 - length(aPosSize.xy) / 700.0 - aSeed * 0.2, 0.0, 1.0); gr = mix(gr*gr*(3.0-2.0*gr),1.0,uScenery);
  float hh = aHY.x * max(gr, 0.001);
  float style = floor(fract(aSeed * 31.713) * 4.0);
  float taper = 1.0;
  if(style < 1.0) taper = 1.0 - position.y * 0.24;
  else if(style < 2.0) taper = 1.0 - step(0.54,position.y)*0.13 - step(0.81,position.y)*0.16;
  else if(style < 3.0) taper = 1.0 - position.y * 0.34;
  else taper = 1.0 - step(0.54,position.y)*0.08 - step(0.81,position.y)*0.24;
  float measuredTaper = 1.0 - position.y * (0.06 + fract(aSeed * 13.17) * 0.10);
  taper = mix(measuredTaper, taper, step(0.5,uScenery));
  vec3 wp = vec3(aPosSize.x + position.x * aPosSize.z * taper, aHY.y + position.y * hh, aPosSize.y + position.z * aPosSize.w * taper);
  wp.y += uBobAmp * sin(uTime * 0.5 + aBob * 40.0);
  vWy = wp.y; vW = wp;
  vN = normal;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vFD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
export const BUILD_FS = `
uniform float uTime; uniform float uDay; uniform vec3 uWinTint; uniform float uSel; uniform vec3 uCam; uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uSun; uniform float uPbr; uniform float uScenery;
varying vec3 vColor; varying vec4 vHY; varying vec2 vState; varying vec3 vLocal; varying vec3 vN; varying float vFD; varying float vSeed; varying float vWy; varying vec3 vW;
${FOG}
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)) + vSeed*17.0)*43758.5453); }
void main(){
  vec3 vC = mix(vec3(dot(vColor, vec3(0.3,0.59,0.11))), vColor, 0.6) * vec3(0.95,0.9,0.8);
  vec3 N = normalize(vN), n = abs(N);
  float side = 1.0 - step(0.5, n.y);
  vec2 uv = n.x > 0.5 ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
  float H = vHY.x;
  float cols = 2.0 + floor(h2(vec2(vSeed*19.3,1.7))*5.0);
  float rows = 0.58 + h2(vec2(vSeed*7.1,9.4))*0.54;
  vec2 g = vec2((uv.x + 0.5) * cols, uv.y * H * rows);
  vec2 cell = floor(g); vec2 f = fract(g);
  float inset = 0.14 + h2(vec2(vSeed*5.7,4.2))*0.13;
  float win = step(inset,f.x)*step(f.x,1.0-inset)*step(0.22,f.y)*step(f.y,0.78);
  float rnd = h2(cell + n.xz*3.1);
  // the windows blink with the data: a busy building (high glow_by) flickers fast, a quiet one barely
  float lit = step(rnd, vHY.w);
  vec3 V = normalize(uCam - vW), L = normalize(uSun.y > -0.5 ? uSun : vec3(0.45,0.8,0.25));
  float ndv = max(dot(N, V), 0.0), fres = pow(1.0 - ndv, 3.0);
  vec3 R = reflect(-V, N);
  vec3 env = mix(uLow, uTop, clamp(R.y * 0.7 + 0.35, 0.0, 1.0));
  float diff = 0.30 + 0.55*max(dot(N, L), 0.0);
  // facade: panel grooves + a metal / concrete sheen that picks up the sky and the sun
  float groove = 1.0 - 0.18 * (smoothstep(0.0, 0.07, f.x) * smoothstep(1.0, 0.93, f.x) < 0.5 ? 1.0 : 0.0) * side;
  vec3 marble = mix(vec3(0.80, 0.72, 0.60), vC, 0.32);
  vec3 body = mix(marble*0.78, marble*0.66 + 0.04, uDay) * diff * (0.78 + 0.4*vLocal.y) * groove + marble*0.07;
  float spec = pow(max(dot(R, L), 0.0), 38.0) * (0.25 + 0.75 * (1.0 - win));
  body += (env * (0.10 + 0.5 * fres) + vec3(1.0, 0.95, 0.85) * spec * 0.55) * uPbr * (0.4 + 0.6 * side);
  vec3 warm = mix(vec3(1.0, 0.80, 0.50), vec3(1.0, 0.62, 0.30), step(0.6, h2(cell*1.7)));
  vec3 col = body + side*win*lit*warm*mix(1.4, 0.45, uDay);
  // glass: dark panes reflect the sky at a grazing angle, sparkle in the sun
  col += side * win * (1.0 - lit) * (env * (0.18 + 0.9 * fres) + vec3(1.0) * spec * 0.9) * uPbr;
  float tall = smoothstep(2.0, 18.0, H);
  float edge = smoothstep(0.44, 0.5, abs(uv.x)) * side;
  float crown = smoothstep(0.93, 1.0, vLocal.y) * side;
  col += mix(vec3(0.95,0.75,0.40), vC, 0.45) * (edge*0.10*tall + crown*(0.16 + vHY.z*0.55));
  float mullion = (1.0-smoothstep(0.0,0.045,abs(fract((uv.x+0.5)*6.0)-0.5))) * side;
  col += vec3(1.0,.72,.40) * mullion * .05 * (1.0-uDay);
  float roofEdge = smoothstep(0.22,0.5,max(abs(vLocal.x),abs(vLocal.z)));
  col += mix(marble, vC, 0.7) * (1.0 - side) * (0.10 + roofEdge*0.22 + vHY.z * 0.42);
  col += vec3(1.0,0.88,0.45) * step(0.5, vState.y) * (crown*2.6 + edge*1.0 + 0.18 + (1.0 - side)*0.7);
  col *= mix(1.0, 0.13, vState.x);
  float fog = clamp(fogAmount(vFD) * (1.0 + uScenery*0.34),0.0,1.0);
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
}`;

export const SLAB_VS = `
attribute vec4 aPosScale; attribute vec3 aTop; attribute vec3 aRim; attribute float aSeed; attribute float aDim;
uniform float uTime;
varying vec3 vTop; varying vec3 vRim; varying float vR; varying float vY; varying float vFD; varying float vDim; varying vec3 vP;
void main(){
  vTop = aTop; vRim = aRim; vDim = aDim;
  vR = length(position.xz); vY = position.y;
  float bob = sin(uTime * 0.5 + aSeed * 40.0) * 1.2;
  vec3 wp = vec3(aPosScale.x + position.x * aPosScale.w, aPosScale.y + bob + position.y * aPosScale.w, aPosScale.z + position.z * aPosScale.w);
  vP = position;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vFD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
export const SLAB_FS = `
uniform float uTime; uniform vec3 uFog; uniform float uFogD;
varying vec3 vTop; varying vec3 vRim; varying float vR; varying float vY; varying float vFD; varying float vDim; varying vec3 vP;
${HASH}
float fogAmount(float d){ return clamp(1.0 - exp(-uFogD*uFogD*d*d), 0.0, 1.0); }
void main(){
  vec3 col;
  if (vY > -0.02) {
    float edge = smoothstep(0.82, 1.0, vR);
    col = vTop * 0.5 + vRim * edge * 1.7;
    col += vRim * 0.12 * smoothstep(0.0, 0.6, 1.0 - vR);
    float rings = smoothstep(0.02, 0.0, abs(fract(vR * 5.0 - uTime * 0.05) - 0.5) - 0.48);
    col += vRim * rings * 0.1;
  } else {
    float nz = noise(vP.xz * 7.0 + vP.y * 5.0);
    col = mix(vec3(0.05, 0.05, 0.07), vTop * 0.35, nz * 0.7) + vRim * smoothstep(-0.12, 0.0, vY) * 0.9;
  }
  col *= mix(1.0, 0.22, vDim);
  col = mix(col, uFog, fogAmount(vFD));
  gl_FragColor = vec4(col, 1.0);
}`;

export const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const SKY_FS = `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform float uStars; uniform float uKind; uniform float uTime; uniform vec3 uSun; uniform float uFlash; uniform vec3 uAccent;
varying vec3 vDir;
${HASH}
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = y > 0.0 ? mix(uMid, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uMid, uLow, pow(clamp(-y, 0.0, 1.0), 0.6));
  float hz = exp(-abs(y) * 7.0);
  c += uLow * hz * 0.55;
  // stars
  vec2 sp = vec2(atan(d.z, d.x) * 90.0, y * 160.0);
  vec2 cell = floor(sp); vec2 f = fract(sp) - 0.5;
  float s = step(0.985 - uStars * 0.012, hash(cell)) * smoothstep(0.32, 0.0, length(f));
  s *= 0.7 + 0.3 * sin(uTime * (0.2 + hash(cell + 3.0) * 0.5) + hash(cell) * 30.0);
  c += vec3(1.0, 0.93, 0.80) * s * uStars * smoothstep(0.02, 0.5, y);
  // sun / moon
  float sd = max(dot(d, normalize(uSun)), 0.0);
  c += (uKind == 3.0 ? vec3(1.0, 0.92, 0.7) : vec3(1.0, 0.86, 0.62)) * (pow(sd, 900.0) * 2.0 + pow(sd, 18.0) * 0.18);
  // aurora curtains
  if (uKind == 6.0) {
    float band = smoothstep(0.1, 0.5, y) * (1.0 - smoothstep(0.55, 0.95, y));
    float w = noise(vec2(atan(d.z, d.x) * 3.0 + uTime * 0.05, y * 6.0 + uTime * 0.03));
    float w2 = noise(vec2(atan(d.z, d.x) * 7.0 - uTime * 0.07, y * 3.0));
    c += mix(uAccent, vec3(0.3, 1.0, 0.7), w2) * band * pow(w, 1.6) * 0.9;
  }
  // ember haze near the horizon
  if (uKind == 7.0) c += vec3(1.0, 0.45, 0.12) * hz * 0.35 * (0.6 + 0.4 * noise(vec2(atan(d.z, d.x) * 6.0, uTime * 0.1)));
  // void: a slow nebula
  if (uKind == 5.0) c += uAccent * 0.14 * pow(noise(vec2(atan(d.z, d.x) * 2.0, y * 3.0 + uTime * 0.01)), 2.0);
  // storm: clouds + lightning
  if (uKind == 4.0) { c = mix(c, uMid * 1.4, 0.4 * noise(vec2(atan(d.z, d.x) * 4.0 + uTime * 0.03, y * 5.0))); }
  c += vec3(1.0, 0.9, 0.75) * uFlash * (0.4 + 0.6 * smoothstep(-0.2, 0.7, y));
  gl_FragColor = vec4(c, 1.0);
}`;

export const GROUND_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const GROUND_FS = `
uniform vec3 uGround; uniform vec3 uAccent; uniform vec3 uFog; uniform float uFogD; uniform float uTime; uniform vec3 uCam; uniform float uDay;
varying vec3 vW;
${HASH}
void main(){
  vec2 p = vW.xz;
  vec2 block = p / 20.0;
  vec2 g = abs(fract(block - 0.5) - 0.5) / fwidth(block);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  vec2 junctionDistance = min(fract(block), 1.0 - fract(block)) / fwidth(block);
  float junction = 1.0 - min(max(junctionDistance.x, junctionDistance.y), 1.0);
  float d = length(vW - uCam);
  float nearRoad = 1.0 - smoothstep(180.0, 900.0, d);
  vec3 street = vec3(1.0, 0.66, 0.30);
  vec3 col = uGround * (0.7 + 0.5 * noise(p * 0.05));
  // The glowing grid is a street surface cue; towers still come only from source records.
  col += (vec3(0.70, 0.56, 0.34) * line * 0.07 + street * junction * 0.20 * (1.0 - uDay)) * nearRoad;
  col += vec3(0.80, 0.55, 0.30) * 0.035 * smoothstep(0.0, 400.0, 400.0 - length(p));
  col = mix(col, uFog, clamp(1.0 - exp(-uFogD*uFogD*d*d), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export const PAD_VS = `
attribute vec4 aRect; attribute vec3 aColor;
varying vec3 vColor; varying vec2 vUv; varying float vFD;
void main(){
  vColor = aColor; vUv = position.xz * 2.0;
  vec3 wp = vec3(aRect.x + position.x * aRect.z * 2.0, 0.05, aRect.y + position.z * aRect.w * 2.0);
  vec4 mv = viewMatrix * vec4(wp, 1.0); vFD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
export const PAD_FS = `
uniform vec3 uFog; uniform float uFogD;
varying vec3 vColor; varying vec2 vUv; varying float vFD;
void main(){
  vec2 q = abs(vUv);
  float edge = smoothstep(0.93, 1.0, max(q.x, q.y));
  float a = 0.10 + edge * 0.34;
  vec3 col = mix(vec3(0.55,0.46,0.34), vColor, 0.4) * (0.22 + edge * 0.55);
  col = mix(col, uFog, clamp(1.0 - exp(-uFogD*uFogD*vFD*vFD), 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}`;

export const GLOW_VS = `
attribute vec3 aColor; attribute float aSize; attribute float aSeed; uniform float uPR; uniform float uTime;
varying vec3 vColor; varying float vP;
void main(){
  vColor = aColor; vP = 0.6 + 0.4 * sin(uTime * 2.4 + aSeed * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uPR * 260.0 / max(1.0, -mv.z), 2.0, 70.0 * uPR);
  gl_Position = projectionMatrix * mv;
}`;
export const GLOW_FS = `
varying vec3 vColor; varying float vP;
void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; float a = pow(max(1.0 - r, 0.0), 2.2) * vP; gl_FragColor = vec4(mix(vColor, vec3(1.0,0.78,0.42), 0.55) * a * 0.9, a); }`;

export const WX_VS = `
attribute vec3 aSeed; uniform vec3 uCam; uniform float uTime; uniform vec3 uBox; uniform vec3 uVel; uniform float uSize; uniform float uPR; uniform float uKind;
varying float vA; varying float vK; varying float vTw;
void main(){
  vec3 s = aSeed;
  vec3 p = fract(s + uVel * uTime / uBox + vec3(0.0, 0.5, 0.0)) - 0.5;
  vec3 w = uCam + p * uBox;
  float sway = (uKind == 2.0 || uKind == 4.0) ? 1.0 : 0.0;
  w.x += sin(uTime * 0.7 + s.y * 31.0) * 3.0 * sway; w.z += cos(uTime * 0.6 + s.x * 29.0) * 3.0 * sway;
  if (uKind == 4.0) { w.y = uCam.y - uBox.y * 0.45 + s.y * uBox.y * 0.5 + sin(uTime * 0.8 + s.z * 20.0) * 4.0; }
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float d = -mv.z;
  vA = smoothstep(0.0, 0.08, 0.5 - abs(p.y)) * smoothstep(5.0, 25.0, d);
  vK = uKind; vTw = 0.6 + 0.4 * sin(uTime * 3.0 + s.z * 60.0);
  gl_PointSize = clamp(uSize * uPR * 150.0 / max(1.0, d), 1.0, 28.0 * uPR);
  gl_Position = projectionMatrix * mv;
}`;
export const WX_FS = `
uniform vec3 uTint; varying float vA; varying float vK; varying float vTw;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float a;
  if (vK == 1.0 || vK == 7.0) a = smoothstep(0.07, 0.0, abs(q.x)) * smoothstep(0.5, 0.2, abs(q.y)) * 0.55;
  else if (vK == 6.0) a = smoothstep(0.5, 0.0, length(q)) * 0.07;
  else a = smoothstep(0.5, 0.05, length(q)) * (vK == 4.0 || vK == 3.0 ? vTw : 0.85);
  gl_FragColor = vec4(uTint * (vK == 4.0 || vK == 3.0 ? 2.0 : 1.0), a * vA);
}`;

export const WATER_VS = `varying vec3 vW; uniform float uTime; uniform float uBend;
void main(){ vec3 p = position; p.x += sin(p.y * 0.012 + 1.0) * uBend; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const WATER_FS = `
uniform vec3 uCam; uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uAccent; uniform vec3 uFog; uniform float uFogD; uniform float uTime; uniform vec3 uSun;
varying vec3 vW;
${HASH}
void main(){
  vec2 p = vW.xz * 0.06;
  float w = noise(p + vec2(uTime * 0.25, uTime * 0.1)) + noise(p * 2.3 - vec2(uTime * 0.2, 0.0)) * 0.5;
  vec3 N = normalize(vec3((w - 0.75) * 0.5, 1.0, (noise(p * 1.7 + 4.0) - 0.5) * 0.5));
  vec3 V = normalize(uCam - vW), R = reflect(-V, N);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  vec3 sky = mix(uLow, uTop, clamp(R.y, 0.0, 1.0));
  vec3 col = mix(vec3(0.05, 0.12, 0.16) + uLow * 0.2, sky, 0.25 + 0.75 * fres) + vec3(1.0, 0.86, 0.6) * pow(max(dot(R, normalize(uSun)), 0.0), 120.0) * 0.7 + vec3(0.1, 0.16, 0.18) * 0.1 * w;
  float d = length(vW - uCam);
  col = mix(col, uFog, clamp(1.0 - exp(-uFogD*uFogD*d*d), 0.0, 1.0));
  gl_FragColor = vec4(col, 0.93);
}`;

export const FW_VS = `
attribute vec3 aOrigin; attribute vec4 aDir; attribute vec3 aColor; attribute float aT0;
uniform float uTime; uniform float uPR;
varying vec3 vColor; varying float vA;
void main(){
  float age = uTime - aT0;
  float life = 2.4;
  vec3 p = aOrigin + aDir.xyz * aDir.w * (1.0 - exp(-age * 1.6)) * 2.2;
  p.y -= 9.0 * age * age * 0.5;
  vA = (age > 0.0 && age < life) ? (1.0 - age / life) * 0.9 : 0.0;
  vColor = aColor;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(5.0 * uPR * 220.0 / max(1.0, -mv.z), 1.0, 22.0 * uPR) * step(0.001, vA);
  gl_Position = projectionMatrix * mv;
}`;
export const FW_FS = `varying vec3 vColor; varying float vA;
void main(){ vec2 q = gl_PointCoord - 0.5; float a = pow(max(1.0 - length(q) * 2.0, 0.0), 1.8) * vA; gl_FragColor = vec4(mix(vColor, vec3(1.0,0.82,0.5), 0.5) * a * 1.4, a); }`;

