// The water of the Data City (v3):
//   River     a ribbon of water that winds round the outside of the districts and flows into the Harbor at both ends. Its shader
//             reflects the sky, the sun's / moon's glitter and the glow of the city (the reflection of the lit side of the skyline),
//             flows along its length, and has neon quay lines on both banks (one draw)
//   Ships     sailing cargo ships crossing the Harbor (hull, deckhouse, funnel, lights; one instanced draw)
//   Cranes    gantry cranes on the north quay with blinking red lights (one instanced draw, one for the lights)
// Decor only (the data ships of LIT's trades are moored in layout.js's pier rows).
import * as THREE from '../jarvis/three.module.min.js';
import { FOG, HASH } from './shaders.js?v=dcgfx12';
import { pick } from './skyline.js?v=dcgfx16';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const SHIPS = { hq: 9, lq: 4 };

const RIVER_VS = `varying vec3 vW; varying vec2 vUv; varying float vFD;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mv = viewMatrix * wp; vFD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const RIVER_FS = `
uniform float uTime; uniform float uDay; uniform float uDusk; uniform float uCloud; uniform float uRain; uniform vec3 uSun; uniform vec3 uAccent; uniform float uFlash;
varying vec3 vW; varying vec2 vUv; varying float vFD;
${FOG}
${HASH}
void main(){
  float across = abs(vUv.x - 0.5) * 2.0;
  vec2 flow = vec2(vUv.y * 0.9 - uTime * 0.35, vUv.x * 6.0);
  float n1 = noise(flow * 2.1), n2 = noise(flow * 5.3 + vec2(uTime * 0.2, 3.0));
  vec3 N = normalize(vec3((n1 - 0.5) * 0.7 + (n2 - 0.5) * 0.35, 1.0, (n2 - 0.5) * 0.7));
  vec3 V = normalize(cameraPosition - vW);
  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NoV, 4.0);
  vec3 R = reflect(-V, N);
  vec3 top = mix(vec3(${NEON ? '0.03,0.05,0.10' : '0.16,0.13,0.26'}), vec3(${NEON ? '0.30,0.45,0.75' : '0.42,0.56,0.68'}), uDay), hor = mix(uFog + vec3(0.10,0.055,0.025), vec3(${NEON ? '0.80,0.84,0.90' : '0.88,0.86,0.76'}), uDay);   // revamp: the sky dome's blue hour
  vec3 sky = mix(hor, top, smoothstep(0.0, 0.5, R.y));
  sky += vec3(1.0,0.42,0.22) * uDusk * 0.5 * exp(-abs(R.y)*5.0);
  vec3 sd = normalize(uSun);
  float sunSpec = pow(max(dot(R, vec3(sd.x, abs(sd.y) + 0.05, sd.z)), 0.0), 120.0) * (0.35 + 0.65 * smoothstep(-0.1, 0.2, sd.y + 0.1));
  float glitter = step(0.93, noise(flow * 14.0 + uTime * 0.6)) * (0.4 + 0.6 * sunSpec * 4.0);
  // the city's glow: the water towards the plaza reflects the lit skyline (neon streaks, warmer near the middle)
  vec2 toCity = normalize(-vW.xz + vec2(0.0001));
  float facing = max(dot(normalize(R.xz + vec2(0.0001)), toCity), 0.0);
  float glow = pow(facing, 3.0) * (0.45 + 0.55 * smoothstep(0.0, 0.5, 1.0 - R.y)) * mix(1.0, 0.25, uDay);
  float streak = pow(noise(vec2(vW.x * 0.35 + vW.z * 0.2, vW.z * 0.04 - uTime * 0.25)), 5.0);
  vec3 city = uAccent * glow * (0.35 + 2.2 * streak) + vec3(1.0, 0.4, 0.6) * glow * pow(noise(vec2(vW.z * 0.3, vW.x * 0.05 + uTime * 0.2)), 6.0) * 1.2;
  vec3 deep = mix(vec3(${NEON ? '0.004' : '0.03,0.025'},0.02${NEON ? ',0.05' : ''}), vec3(${NEON ? '0.1' : '0.30'},${NEON ? '0.28' : '0.30'},${NEON ? '0.42' : '0.22'}), uDay) + vec3(${NEON ? '0.02' : '0.06'},${NEON ? '0.07' : '0.05'},${NEON ? '0.12' : '0.03'}) * n1;
  vec3 col = mix(deep, sky * mix(0.8, 1.0, uDay), fres) + city * (0.4 + 0.6 * fres) + vec3(1.0, 0.9, 0.7) * (sunSpec * 1.4 + glitter * 0.5) * mix(0.6, 1.0, uDay);
  float rip = pow(noise(vW.xz * 0.9 + uTime * 0.4), 8.0) * uRain;                              // rain rings
  col += vec3(0.6, 0.75, 1.0) * rip * 0.7;
  col += vec3(0.6,0.7,1.0) * uFlash * 0.3;
  float quay = smoothstep(0.86, 0.97, across) * (1.0 - smoothstep(0.97, 1.0, across));       // neon quay lines on both banks
  col += mix(uAccent, vec3(1.0, 0.7, 0.35), step(0.5, fract(vUv.y * 40.0))) * quay * mix(1.1, 0.5, uDay);
  float bank = smoothstep(0.93, 1.0, across);
  col = mix(col, vec3(${NEON ? '0.02' : '0.06'}, ${NEON ? '0.03' : '0.05'}, ${NEON ? '0.06' : '0.04'}), bank * 0.6);
  float a = 1.0 - smoothstep(0.98, 1.0, across);
  gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, 0.0)), a);
}`;

export class River {
  /** R: routes(); U: the scene uniforms */
  constructor(R, U) {
    this.points = R.river;
    const pts = R.river.map(([x, z]) => new THREE.Vector3(x, 0.08, z));
    this.mesh = null;
    if (pts.length < 4) return;
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.length = this.curve.getLength();
    const N = 220, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u), r = new THREE.Vector3(-t.z, 0, t.x).normalize();
      const w = (R.riverW / 2) * (1 + 0.18 * Math.sin(u * 17.0) + 0.08 * Math.sin(u * 41.0));
      pos.push(p.x - r.x * w, 0.08, p.z - r.z * w, p.x + r.x * w, 0.08, p.z + r.z * w);
      uv.push(0, (u * this.length) / 40, 1, (u * this.length) / 40);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: RIVER_VS, fragmentShader: RIVER_FS, transparent: true, depthWrite: false,
      uniforms: pick(U, 'uTime', 'uFog', 'uFogD', 'uHaze', 'uDay', 'uDusk', 'uCloud', 'uRain', 'uSun', 'uAccent', 'uFlash') }));
    this.mesh.renderOrder = 1; this.mesh.frustumCulled = false;
  }
}

// ------------------------------------------------------------------------------------------------ ships and cranes
const SHIP_VS = `
attribute vec4 aShip; attribute vec3 aColor;
uniform float uTime; uniform vec4 uLane;      // x0, x1, z, speed scale
varying vec3 vC; varying vec3 vL; varying float vFD; varying vec3 vN; varying float vFade;
void main(){
  float u = fract(aShip.y + uTime * aShip.z * 0.004 * uLane.w);
  float dir = sign(aShip.z);
  float x = mix(uLane.x, uLane.y, dir > 0.0 ? u : 1.0 - u);
  vFade = smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.94, u);
  vec3 lp = position * aShip.w * vFade;
  lp.x *= dir;
  float bob = sin(uTime * 1.1 + aShip.y * 30.0) * 0.08;
  vec3 wp = vec3(x + lp.x, 0.1 + bob + lp.y, uLane.z + aShip.x * 6.0 + lp.z);
  vC = aColor; vL = position; vN = normal;
  vec4 mv = viewMatrix * vec4(wp, 1.0); vFD = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const SHIP_FS = `
uniform float uDay; uniform float uTime;
varying vec3 vC; varying vec3 vL; varying float vFD; varying vec3 vN; varying float vFade;
${FOG}
void main(){
  vec3 hull = vec3(${NEON ? '0.07' : '0.12'}, 0.09, ${NEON ? '0.14' : '0.07'}) * mix(1.0, 3.5, uDay);
  vec3 col = mix(hull, vC * 0.7, smoothstep(0.55, 0.65, vL.y));                       // red-oxide hull, coloured containers above the waterline
  col *= 0.5 + 0.5 * max(vN.y, 0.0) + 0.2 * abs(vN.z);
  col += vec3(1.0, 0.85, 0.5) * step(0.5, vL.y) * step(abs(fract(vL.x * 3.0) - 0.5), 0.2) * step(vL.y, 0.8) * 0.9;     // lit windows
  col += vec3(1.0, 0.1, 0.1) * step(0.95, vL.x * -1.0) * 1.5 + vec3(0.1, 1.0, 0.3) * step(0.95, vL.x) * 1.5;   // navigation lights
  gl_FragColor = vec4(mix(col, uFog, fogAmount(vFD, 0.0)), 1.0);
}`;

function hullGeo() {
  // a hull (a prism that narrows to a bow), a deckhouse aft, a funnel and a row of containers: about 50 triangles
  const parts = [], boxes = [[2.4, 0.5, 0.7, 0, 0.25, 0], [0.55, 0.45, 0.62, -0.95, 0.72, 0], [0.18, 0.4, 0.18, -0.95, 1.15, 0], [1.1, 0.34, 0.56, 0.2, 0.67, 0], [0.5, 0.5, 0.3, 1.25, 0.25, 0]];
  const pos = [], nor = [], idx = [];
  for (const [sx, sy, sz, ox, oy, oz] of boxes) {
    const b = new THREE.BoxGeometry(sx, sy, sz), base = pos.length / 3;
    b.translate(ox, oy, oz);
    pos.push(...b.attributes.position.array); nor.push(...b.attributes.normal.array);
    for (const i of b.index.array) idx.push(base + i);
  }
  for (let i = 0; i < pos.length; i += 3) pos[i] /= 1.2;                                  // x in about -1..1
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  void parts;
  return g;
}

export class Ships {
  /** L: layout() (the harbor), U: the scene uniforms */
  constructor(L, U, quality) {
    const h = L.harbor;
    this.group = new THREE.Group();
    this.total = 0;
    if (!h) return;
    const n = SHIPS.hq, att = new Float32Array(n * 4), col = new Float32Array(n * 3), c = new THREE.Color();
    const pal = [(NEON ? 0xff4d6d : 0xce8841), (NEON ? 0x3fd8ff : 0xd39556), (NEON ? 0xffc94a : 0xd39556), (NEON ? 0xa68bff : 0xcdbf9f), (NEON ? 0x39e59a : 0x9bab62), (NEON ? 0xff9f43 : 0xd1904e)];
    for (let i = 0; i < n; i++) {
      att.set([(i % 3) - 1, (i * 0.37) % 1, (6 + (i % 4) * 2.2) * (i % 2 ? 1 : -1), 2.6 + (i % 3) * 0.9], i * 4);
      c.setHex(pal[i % pal.length]); col.set([c.r, c.g, c.b], i * 3);
    }
    const g = hullGeo(), inst = new THREE.InstancedBufferGeometry();
    inst.index = g.index;
    for (const k of ['position', 'normal']) inst.setAttribute(k, g.getAttribute(k));
    inst.setAttribute('aShip', new THREE.InstancedBufferAttribute(att, 4));
    inst.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
    inst.instanceCount = n;
    this.lane = new THREE.Vector4(h.x0 + 4, h.x1 - 4, h.z1 - 3.5, 1);
    this.mesh = new THREE.Mesh(inst, new THREE.ShaderMaterial({ vertexShader: SHIP_VS, fragmentShader: SHIP_FS,
      uniforms: { ...pick(U, 'uTime', 'uFog', 'uFogD', 'uHaze', 'uDay'), uLane: { value: this.lane } } }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    this.geo = inst; this.total = n;
    this.group.add(this.mesh);
    // the cranes on the north quay: a tall gantry, a boom, a blinking light
    const nc = 8, crane = new THREE.InstancedMesh(craneGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }), nc);      // the red lights are vertex colours: one draw
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nc; i++) {
      const x = h.x0 + 20 + (i / (nc - 1)) * (h.x1 - h.x0 - 40);
      m4.makeScale(1, 1, 1).setPosition(x, 0, h.z0 + 2.5); crane.setMatrixAt(i, m4);
    }
    crane.frustumCulled = false; crane.renderOrder = 2;
    this.cranes = crane;
    this.group.add(crane);
    this.setQuality(quality);
  }

  setQuality(q, caps) {
    if (this.geo) { this.geo.instanceCount = Math.min(this.total, caps?.ships ?? SHIPS[q] ?? SHIPS.hq); this.count = this.geo.instanceCount; }
    if (this.cranes) this.cranes.count = caps?.cranes ?? 8;
  }
  update(flow) { if (this.lane) this.lane.w = flow; }
}

function craneGeo() {
  const boxes = [[0.5, 14, 0.5, -1.5, 7, 0.9, (NEON ? 0x232a45 : 0x3a3228)], [0.5, 14, 0.5, 1.5, 7, 0.9, (NEON ? 0x232a45 : 0x3a3228)], [0.5, 14, 0.5, -1.5, 7, -0.9, (NEON ? 0x232a45 : 0x3a3228)], [0.5, 14, 0.5, 1.5, 7, -0.9, (NEON ? 0x232a45 : 0x3a3228)],
                 [16, 0.7, 1.6, 4.5, 14.5, 0, (NEON ? 0x232a45 : 0x3a3228)], [3.4, 0.6, 2.2, 0, 12, 0, (NEON ? 0x232a45 : 0x3a3228)], [0.9, 0.9, 0.9, 6, 15.5, 0, (NEON ? 0xff3344 : 0xc67052)]];
  const pos = [], nor = [], col = [], idx = [], c = new THREE.Color();
  for (const [sx, sy, sz, ox, oy, oz, hex] of boxes) {
    const b = new THREE.BoxGeometry(sx, sy, sz), base = pos.length / 3;
    b.translate(ox, oy, oz);
    pos.push(...b.attributes.position.array); nor.push(...b.attributes.normal.array);
    c.setHex(hex);
    for (let i = 0; i < b.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    for (const i of b.index.array) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
