// Things that move through the Data City (v3), all GPU-animated and instanced, a draw call or two each:
//   Cars       ground traffic on the district streets: boxes with headlights and tail lights, both lanes, driving by the clock in the vertex shader
//   Flyers     flying vehicles (air taxis) on splines baked into a float texture, turned along their path, blinking red / green lights
//   Airships   three slow blimps on a wide loop with a glowing gondola
//   Monorail   an elevated loop just outside the districts: ribbon track, pylons, a station at every district and three trains of six cars
// Decor only: nothing here is data. The market's mood (uFlow: the VIX, slower when the futures market is closed) sets the traffic speed.
import * as THREE from '../jarvis/three.module.min.js';
import { FOG } from './shaders.js?v=dcgfx12';
import { pick } from './skyline.js?v=dcgfx16';
import { PROFILES } from './caps.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const CARS = { hq: 520, lq: 160 };
const FLYERS = { hq: 90, lq: 28 };
const PATH_SAMPLES = 160;
const RAIL_Y = 11;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ------------------------------------------------------------------------------------------------ ground cars
const CAR_VS = `
attribute vec4 aSeg; attribute vec3 aCar; attribute vec3 aColor; attribute float aPart;
uniform float uTime; uniform float uFlow;
varying vec3 vC; varying vec3 vL; varying float vFD; varying vec3 vN; varying float vPart;
void main(){
  vec2 d = aSeg.zw - aSeg.xy; float len = max(length(d), 0.001); vec2 dir = d / len;
  float t = fract(uTime * aCar.x * uFlow / len + aCar.y);
  vec2 p = mix(aSeg.xy, aSeg.zw, t);
  vec3 lp = position * vec3(aPart > 0.5 ? 1.0 : aCar.z, 1.0, 1.0);
  vec2 w = vec2(lp.x * dir.x - lp.z * dir.y, lp.x * dir.y + lp.z * dir.x);
  vec3 wp = vec3(p.x + w.x, 0.05 + lp.y, p.y + w.y);
  vC = aColor; vL = position; vPart = aPart; vN = normalize(vec3(normal.x * dir.x - normal.z * dir.y, normal.y, normal.x * dir.y + normal.z * dir.x));
  vec4 mv = viewMatrix * vec4(wp, 1.0); vFD = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const CAR_FS = `
uniform float uDay; uniform float uTime;
varying vec3 vC; varying vec3 vL; varying float vFD; varying vec3 vN; varying float vPart;
${FOG}
void main(){
  float fa = fogAmount(vFD, 0.0);
  if (vPart > 0.5) {                                   // revamp 2026-11-20: the light on the road (head-light wash ahead, a red tail streak behind)
    float head = step(0.0, vL.x);
    float u = head > 0.5 ? (vL.x - 0.45) / 2.4 : (-0.45 - vL.x) / 1.7;
    float a = pow(clamp(1.0 - u, 0.0, 1.0), 2.2) * exp(-vL.z * vL.z * (head > 0.5 ? 9.0 : 22.0)) * (1.0 - uDay * 0.8) * (1.0 - fa);
    vec3 c = head > 0.5 ? vec3(1.0, 0.93, 0.78) * 0.55 : vec3(1.0, 0.08, 0.06) * 0.8;
    gl_FragColor = vec4(c, a * (head > 0.5 ? 0.45 : 0.75));
    return;
  }
  vec3 paint = mix(vec3(0.05, 0.055, 0.07), vC, 0.3);                                 // dark paint (the colour a hint), not toy neon
  vec3 col = paint * mix(0.6, 1.0, uDay) * (0.45 + 0.55 * max(vN.y, 0.0) + 0.2 * abs(vN.x));
  col += vec3(0.45, 0.5, 0.6) * pow(max(vN.y, 0.0), 4.0) * 0.08;                        // the roof catches the sky
  float front = step(0.36, vL.x) * step(abs(abs(vL.z) - 0.17), 0.07) * step(0.08, vL.y) * step(vL.y, 0.2);
  float back = step(vL.x, -0.36) * step(abs(vL.z), 0.22) * step(0.12, vL.y) * step(vL.y, 0.2);
  col += vec3(1.0, 0.96, 0.85) * front * 3.0 + vec3(1.0, 0.06, 0.05) * back * 2.4;
  gl_FragColor = vec4(mix(col, uFog, fa), 1.0);
}`;

/** a car (a box without its bottom) + one flat quad on the road (aPart 1): the head-light wash ahead, the red tail streak behind; 12 triangles as before */
function carGeo() {
  const b = new THREE.BoxGeometry(0.9, 0.32, 0.46);
  b.translate(0, 0.16, 0);
  const pos = [...b.attributes.position.array], nor = [...b.attributes.normal.array], part = new Array(pos.length / 3).fill(0);
  const idx = [...b.index.array.slice(0, 18), ...b.index.array.slice(24)];            // no bottom face (never seen): the light quad costs no triangle
  const quad = (x0, x1, hw, k) => {
    const base = pos.length / 3;
    pos.push(x0, 0.012, -hw, x1, 0.012, -hw, x1, 0.012, hw, x0, 0.012, hw);
    for (let i = 0; i < 4; i++) { nor.push(0, 1, 0); part.push(k); }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  quad(-2.15, 2.85, 0.42, 1);                                                          // one quad: the head-light wash ahead, the tail streak behind
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  b.dispose();
  return g;
}

export class Cars {
  constructor(L, U, quality) {
    const rnd = mulberry(5), segs = L.streets.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 14);
    const n = CARS.hq, seg = new Float32Array(n * 4), car = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    const pal = [(NEON ? 0xff4d6d : 0xce8841), (NEON ? 0x3fd8ff : 0xd39556), (NEON ? 0xffc94a : 0xd39556), (NEON ? 0xe9ecf6 : 0xb2cadc), (NEON ? 0xa68bff : 0xcdbf9f), (NEON ? 0x39e59a : 0x9bab62), (NEON ? 0xff9f43 : 0xd1904e)];
    for (let i = 0; i < n; i++) {
      let s = segs[Math.floor(rnd() * segs.length)];
      if (rnd() < 0.5) s = [s[2], s[3], s[0], s[1]];
      const dx = s[2] - s[0], dz = s[3] - s[1], len = Math.hypot(dx, dz) || 1, lane = 0.45 * (rnd() < 0.5 ? 1 : -1) + (rnd() - 0.5) * 0.1;
      const nx = (-dz / len) * lane, nz = (dx / len) * lane;
      seg.set([s[0] + nx, s[1] + nz, s[2] + nx, s[3] + nz], i * 4);
      car.set([2.2 + rnd() * 2.6, rnd(), 0.8 + rnd() * 0.7], i * 3);
      c.setHex(pal[Math.floor(rnd() * pal.length)]); col.set([c.r, c.g, c.b], i * 3);
    }
    const g = carGeo();
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = g.index;
    for (const k of ['position', 'normal', 'aPart']) inst.setAttribute(k, g.getAttribute(k));
    inst.setAttribute('aSeg', new THREE.InstancedBufferAttribute(seg, 4));
    inst.setAttribute('aCar', new THREE.InstancedBufferAttribute(car, 3));
    inst.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
    inst.instanceCount = n;
    this.mesh = new THREE.Mesh(inst, new THREE.ShaderMaterial({ vertexShader: CAR_VS, fragmentShader: CAR_FS, uniforms: pick(U, 'uTime', 'uFlow', 'uFog', 'uFogD', 'uHaze', 'uDay'),
      transparent: true }));                         // the light quads blend over the road; the bodies write alpha 1
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    this.geo = inst; this.total = n;
    this.setQuality(quality);
  }

  setQuality(q, caps) { this.geo.instanceCount = Math.min(this.total, caps?.cars ?? CARS[q] ?? CARS.hq); this.count = this.geo.instanceCount; }
}

// ------------------------------------------------------------------------------------------------ flying vehicles
const FLY_VS = `
attribute vec4 aFly; attribute vec3 aColor;
uniform sampler2D uPaths; uniform vec2 uPathSize; uniform float uTime; uniform float uFlow;
varying vec3 vC; varying vec3 vL; varying float vFD; varying vec3 vN;
vec3 pathAt(float pi, float u){
  float x = fract(u) * uPathSize.x; float i0 = floor(x); float fr = x - i0; float i1 = mod(i0 + 1.0, uPathSize.x);
  float v = (pi + 0.5) / uPathSize.y;
  return mix(texture2D(uPaths, vec2((i0 + 0.5) / uPathSize.x, v)).xyz, texture2D(uPaths, vec2((i1 + 0.5) / uPathSize.x, v)).xyz, fr);
}
void main(){
  float dir = sign(aFly.z);
  float u = fract(aFly.y + uTime * aFly.z * uFlow);
  vec3 p = pathAt(aFly.x, u), q = pathAt(aFly.x, u + 0.003 * dir);
  vec3 f = normalize(q - p + vec3(0.0001));
  vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0))); vec3 up = cross(r, f);
  p.y += dir > 0.0 ? 0.0 : 1.6;
  vec3 lp = position * aFly.w;
  vec3 wp = p + f * lp.x + up * lp.y + r * lp.z;
  vC = aColor; vL = position;
  vN = normalize(f * normal.x + up * normal.y + r * normal.z);
  vec4 mv = viewMatrix * vec4(wp, 1.0); vFD = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const FLY_FS = `
uniform float uDay; uniform float uTime;
varying vec3 vC; varying vec3 vL; varying float vFD; varying vec3 vN;
${FOG}
void main(){
  vec3 col = mix(vec3(0.05, 0.06, 0.1), vC * 0.6, 0.35 + 0.65 * max(vN.y, 0.0)) * mix(0.8, 1.2, uDay);
  col += vC * (1.0 - smoothstep(-0.05, 0.02, vL.y)) * 0.35;                         // a soft glow under it (revamp: no big coloured blobs)
  float tip = step(0.28, abs(vL.z));
  float blink = step(0.5, fract(uTime * 1.3 + vC.r * 3.0));
  col += tip * (vL.z > 0.0 ? vec3(0.1, 1.0, 0.35) : vec3(1.0, 0.1, 0.1)) * (0.4 + blink * 1.4) * step(0.0, vL.y);
  col += vec3(1.0, 0.95, 0.8) * step(0.46, vL.x) * 1.4;
  gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, 20.0)), 1.0);
}`;

/** an air taxi: a fuselage, a wing and a tail fin as one small merged geometry (about 36 triangles) */
function taxiGeo() {
  const parts = [[1.0, 0.22, 0.34, 0, 0, 0], [0.34, 0.05, 1.1, -0.05, 0.02, 0], [0.28, 0.2, 0.05, -0.42, 0.18, 0]];
  const pos = [], nor = [], idx = [];
  for (const [sx, sy, sz, ox, oy, oz] of parts) {
    const b = new THREE.BoxGeometry(sx, sy, sz), base = pos.length / 3;
    b.translate(ox, oy, oz);
    pos.push(...b.attributes.position.array); nor.push(...b.attributes.normal.array);
    for (const i of b.index.array) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export class Flyers {
  /** lanes over the plaza, the districts and the monorail loop; L: layout(); R: routes() */
  constructor(L, R, U, quality) {
    const rnd = mulberry(19), ds = L.districts.filter((d) => d.kind !== 'harbor'), paths = [], V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (let k = 0; k < 4; k++) {                                  // rings round the plaza
      const r = 30 + k * 11, y = 26 + k * 7, pts = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pts.push(V(Math.cos(a) * r, y + Math.sin(a * 3) * 2.5, Math.sin(a) * r)); }
      paths.push(pts);
    }
    ds.forEach((a, i) => {                                         // over each district and on to the next
      const b = ds[(i + 3) % ds.length], y = 30 + rnd() * 26;
      paths.push([V(0, y, 0), V(a.cx * 0.5, y + 6, a.cz * 0.5), V(a.cx, y + 3, a.cz), V((a.cx + b.cx) / 2, y + 12, (a.cz + b.cz) / 2), V(b.cx, y, b.cz), V(b.cx * 0.5, y + 4, b.cz * 0.5)]);
    });
    paths.push(R.rail.filter((_, i) => i % 5 === 0).map(([x, z], i) => V(x, 25 + (i % 3) * 3, z)));       // a lane above the monorail loop
    const np = paths.length, tex = new Float32Array(PATH_SAMPLES * np * 4);
    paths.forEach((pts, j) => {
      const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      for (let i = 0; i < PATH_SAMPLES; i++) { const p = c.getPointAt(i / PATH_SAMPLES); tex.set([p.x, p.y, p.z, 1], (j * PATH_SAMPLES + i) * 4); }
    });
    const dt = new THREE.DataTexture(tex, PATH_SAMPLES, np, THREE.RGBAFormat, THREE.FloatType);
    dt.minFilter = dt.magFilter = THREE.NearestFilter; dt.needsUpdate = true;
    const n = FLYERS.hq, fly = new Float32Array(n * 4), col = new Float32Array(n * 3), c = new THREE.Color();
    const pal = [(NEON ? 0x3fd8ff : 0xd39556), (NEON ? 0xffc94a : 0xd39556), (NEON ? 0xff4d9a : 0xcc8073), (NEON ? 0xa68bff : 0xcdbf9f), (NEON ? 0x39e59a : 0x9bab62)];
    for (let i = 0; i < n; i++) {
      fly.set([i % np, rnd(), (0.0022 + rnd() * 0.003) * (rnd() < 0.5 ? 1 : -1), 0.9 + rnd() * 0.5], i * 4);
      c.setHex(pal[Math.floor(rnd() * pal.length)]); col.set([c.r, c.g, c.b], i * 3);
    }
    const g = taxiGeo(), inst = new THREE.InstancedBufferGeometry();
    inst.index = g.index;
    for (const k of ['position', 'normal']) inst.setAttribute(k, g.getAttribute(k));
    inst.setAttribute('aFly', new THREE.InstancedBufferAttribute(fly, 4));
    inst.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
    inst.instanceCount = n;
    this.mesh = new THREE.Mesh(inst, new THREE.ShaderMaterial({ vertexShader: FLY_VS, fragmentShader: FLY_FS,
      uniforms: { ...pick(U, 'uTime', 'uFlow', 'uFog', 'uFogD', 'uHaze', 'uDay'), uPaths: { value: dt }, uPathSize: { value: new THREE.Vector2(PATH_SAMPLES, np) } } }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.geo = inst; this.total = n; this.paths = np;
    this.setQuality(quality);
  }

  setQuality(q, caps) { this.geo.instanceCount = Math.min(this.total, caps?.flyers ?? FLYERS[q] ?? FLYERS.hq); this.count = this.geo.instanceCount; }
}

// ------------------------------------------------------------------------------------------------ airships
export class Airships {
  constructor(R, U) {
    const geo = new THREE.SphereGeometry(1, 20, 12);
    geo.scale(5.5, 1.6, 1.8);
    const gond = new THREE.BoxGeometry(2.4, 0.5, 0.7);
    gond.translate(0, -1.8, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: `varying vec3 vN; varying vec3 vL; varying float vFD; void main(){ vL = position; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); vFD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uDay; uniform float uTime; varying vec3 vN; varying vec3 vL; varying float vFD;
      ${FOG}
      void main(){ vec3 base = mix(vec3(0.10,0.12,0.2), vec3(0.62,0.66,0.74), uDay) * (0.5 + 0.5 * max(vN.y, 0.0));
        float band = step(0.9, fract(vL.x * 0.35)) * 0.5;
        vec3 col = base + vec3(${NEON ? '0.2' : '0.90'}, ${NEON ? '0.7' : '0.65'}, ${NEON ? '1.0' : '0.35'}) * band * (1.0 - uDay * 0.6) + vec3(1.0, 0.8, 0.4) * step(vL.y, -1.5) * 1.5;
        col += vec3(1.0, 0.15, 0.15) * step(5.2, vL.x) * (0.5 + 0.5 * sin(uTime * 3.0)) * 1.2;
        gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, 30.0)), 1.0); }`,
      uniforms: pick(U, 'uTime', 'uFog', 'uFogD', 'uHaze', 'uDay') });
    const g = new THREE.BufferGeometry();
    const merged = [geo, gond], pos = [], nor = [], idx = [];
    for (const m of merged) { const base = pos.length / 3; pos.push(...m.attributes.position.array); nor.push(...m.attributes.normal.array); for (const i of m.index.array) idx.push(base + i); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    this.mesh = new THREE.InstancedMesh(g, mat, 3);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    const rr = Math.max(...R.env) + 60;
    this.R = rr; this.n = 3;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1); this.e = new THREE.Euler();
    this.update(0);
  }

  /** n airships (0 on a phone: the mesh is not drawn) */
  setQuality(q, caps) { const n = caps ? caps.airships : 3; this.n = n; this.mesh.count = n; this.mesh.visible = n > 0; }

  update(t) {
    for (let i = 0; i < this.n; i++) {
      const a = t * 0.012 * (i % 2 ? -1 : 1) + (i / 3) * Math.PI * 2, r = this.R * (0.75 + 0.18 * i);
      this.q.setFromEuler(this.e.set(0, -a + (i % 2 ? Math.PI / 2 : -Math.PI / 2), 0));
      this.m4.compose(this.v.set(Math.cos(a) * r, 78 + i * 22 + Math.sin(t * 0.2 + i) * 2, Math.sin(a) * r), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------------------------ the monorail
const TRACK_VS = `varying vec3 vL; varying float vFD; varying vec2 vUv; void main(){ vUv = uv; vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const TRACK_FS = `uniform float uDay; uniform float uTime; varying vec3 vL; varying float vFD; varying vec2 vUv;
${FOG}
void main(){
  vec3 col = mix(vec3(0.05, 0.07, 0.13), vec3(0.4, 0.44, 0.52), uDay);
  float edge = smoothstep(0.78, 0.95, abs(vUv.x - 0.5) * 2.0);
  float run = step(0.92, fract(vUv.y * 60.0 - uTime * 0.4));
  col += vec3(${NEON ? '0.2' : '0.95'}, ${NEON ? '0.85' : '0.72'}, ${NEON ? '1.0' : '0.40'}) * (edge * 1.3 + run * 0.35 * (1.0 - edge)) * mix(1.0, 0.5, uDay);
  gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, ${RAIL_Y}.0)), 1.0);
}`;
const TRAIN_FS = `uniform float uDay; uniform float uTime; varying vec3 vL; varying float vFD; varying vec3 vN;
${FOG}
void main(){
  float win = step(abs(vL.y - 0.05), 0.12) * step(abs(vN.y), 0.5) * step(abs(fract(vL.x * 2.2) - 0.5), 0.34);
  vec3 col = mix(vec3(0.7, 0.75, 0.85), vec3(0.9, 0.92, 0.96), uDay) * (0.35 + 0.5 * max(vN.y, 0.0) + 0.15 * abs(vN.z));
  col = mix(col, vec3(1.0, 0.86, 0.5) * 1.5, win);
  col += vec3(${NEON ? '0.1' : '0.95'}, ${NEON ? '0.8' : '0.70'}, ${NEON ? '1.0' : '0.35'}) * step(abs(vL.y + 0.18), 0.04) * 1.4;
  col += vec3(1.0, 0.95, 0.8) * step(0.95, vL.x * sign(vN.x + 0.001)) * step(0.5, abs(vN.x)) * 1.5;
  gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, ${RAIL_Y}.0)), 1.0);
}`;
const TRAIN_VS = `varying vec3 vL; varying float vFD; varying vec3 vN; void main(){ vL = position; vN = normal; vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); vFD = -mv.z; gl_Position = projectionMatrix * mv; }`;

export class Monorail {
  /** R: routes(); U: the scene uniforms; quality. The loop is a closed Catmull-Rom curve at RAIL_Y; trains ride it by arc length. */
  constructor(R, U, quality) {
    this.R = R;
    const pts = R.rail.filter((_, i) => i % 4 === 0).map(([x, z]) => new THREE.Vector3(x, RAIL_Y, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    const N = 360, pos = [], uv = [], idx = [], w = 1.1, hgt = 0.34;
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = this.curve.getPointAt(u % 1), t = this.curve.getTangentAt(u % 1), r = new THREE.Vector3(-t.z, 0, t.x).normalize();
      for (const [a, b] of [[-w, 0], [w, 0], [w, -hgt], [-w, -hgt]]) { pos.push(p.x + r.x * a, p.y + b, p.z + r.z * a); uv.push((a + w) / (2 * w), u * this.length / 6); }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = (i + 1) * 4 + k, d = (i + 1) * 4 + ((k + 1) % 4);
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const fogU = pick(U, 'uTime', 'uFog', 'uFogD', 'uHaze', 'uDay');
    const track = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: TRACK_VS, fragmentShader: TRACK_FS, uniforms: fogU, side: THREE.DoubleSide }));
    track.frustumCulled = false; track.renderOrder = 3;
    // pylons every ~26 units and a platform at each district: ONE static mesh with vertex colours (one draw call)
    const nPyl = Math.max(8, Math.round(this.length / 26)), st = R.stations, m4 = new THREE.Matrix4();
    const fpos = [], fnor = [], fcol = [], fidx = [], fc = new THREE.Color();
    const bake = (geom, matrix, color) => {
      const g = geom.clone();
      g.applyMatrix4(matrix);
      const base = fpos.length / 3;
      fpos.push(...g.attributes.position.array); fnor.push(...g.attributes.normal.array);
      fc.setHex(color);
      for (let i = 0; i < g.attributes.position.count; i++) fcol.push(fc.r, fc.g, fc.b);
      for (const i of g.index.array) fidx.push(base + i);
      g.dispose();
    };
    const pylG = new THREE.BoxGeometry(0.7, 1, 0.7).translate(0, 0.5, 0), platG = new THREE.BoxGeometry(9, 0.5, 3.4);
    for (let i = 0; i < nPyl; i++) { const p = this.curve.getPointAt(i / nPyl); m4.makeScale(1, RAIL_Y - 0.4, 1).setPosition(p.x, 0, p.z); bake(pylG, m4, 0x1a2038); }
    this.stationU = st.map((s) => this._nearest(s.x, s.z));
    st.forEach((s, i) => {
      const u = this.stationU[i], p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
      m4.compose(new THREE.Vector3(p.x, RAIL_Y - 0.9, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(t.z, t.x)), new THREE.Vector3(1, 1, 1));
      bake(platG, m4, (NEON ? 0x2a8fb0 : 0x5b8db3));
    });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.setAttribute('normal', new THREE.Float32BufferAttribute(fnor, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3)); fg.setIndex(fidx);
    const furn = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ vertexColors: true }));
    furn.frustumCulled = false; furn.renderOrder = 2;
    this.furn = furn;
    // trains: 3 x 6 cars, placed on the curve every frame (18 instances)
    const car = new THREE.BoxGeometry(2.6, 0.9, 1.2);
    this.trains = new THREE.InstancedMesh(car, new THREE.ShaderMaterial({ vertexShader: TRAIN_VS, fragmentShader: TRAIN_FS, uniforms: fogU }), 18);
    this.trains.frustumCulled = false; this.trains.renderOrder = 4;
    this.m4 = m4; this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1); this.up = new THREE.Vector3(0, 1, 0);
    this.group = new THREE.Group();
    this.group.add(track, furn, this.trains);
    this.pylons = nPyl; this.state = [];
    this.setQuality(quality);
    this.update(0, 1);
  }

  _nearest(x, z) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < 240; i++) { const p = this.curve.getPointAt(i / 240), d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i / 240; } }
    return best;
  }

  /** caps.trains = [trains, cars each]; the instances are laid out train by train */
  setQuality(q, caps) { const t = caps?.trains ?? (q === 'lq' ? [1, 6] : [3, 6]); this.nT = t[0]; this.nC = t[1]; this.trains.count = t[0] * t[1]; }

  /** speed: the market's flow (VIX / market closed) */
  update(t, flow = 1) {
    const L = this.length;
    this.state = [];
    for (let k = 0; k < this.nT; k++) {
      const head = ((t * (9 + k) * flow) / L + k / this.nT) % 1;
      for (let c = 0; c < this.nC; c++) {
        const i = k * this.nC + c, u = ((head - (c * 2.9) / L) % 1 + 1) % 1, p = this.curve.getPointAt(u), tn = this.curve.getTangentAt(u);
        this.q.setFromAxisAngle(this.up, -Math.atan2(tn.z, tn.x));
        this.m4.compose(this.v.set(p.x, p.y + 0.75, p.z), this.q, this.s);
        this.trains.setMatrixAt(i, this.m4);
        if (c === 0) this.state.push([p.x, p.z]);
      }
    }
    this.trains.instanceMatrix.needsUpdate = true;
  }
}
