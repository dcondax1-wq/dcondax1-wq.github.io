// ORACLE temple (2026-11-04): the atmosphere of the temple at Delphi, on top of arena.js (docs/OLYMPUS_DESIGN.md).
//   - four bronze braziers (brushed bronze bowls + stems, instanced) with real flames: rising, flickering, blooming particles,
//     and one warm point light that flickers with them
//   - two bronze censers beside the omphalos with incense smoke curling up (soft grey-violet puffs that grow and fade)
//   - dust drifting in the light, light shafts (two additive cones from the high window), two layers of low ground fog scrolling
//     over the floor, a moon with its halo, and baked contact shadows (dark soft decals under every column, brazier and the stone)
// Draw calls: 14 on HD (stems, bowls, halos, flames, smoke, dust, 2 shafts, 2 fog, shadows, moon + halo), 11 on LITE (no shafts, one fog layer,
// fewer particles). Nothing here knows the market. Never throws: the arena stands without it.
import * as M from '../olympus/materials.js';
import { glowSprite } from './glow.js';

const FLOOR_Y = -11.7;                              // = arena.js
const N_TORCH = 4, R_TORCH = 38, H_TORCH = 5.4;
const R_COL = 58, N_COL = 14;

const PART_VS = `attribute vec4 aSeed; uniform float uTime, uPx; varying float vL;
  void main() {
    float life = fract(uTime * SPEED * (0.7 + aSeed.x * 0.6) + aSeed.y);
    vec3 p = position;
    RISE
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPx * SIZE * PXK / max(1.0, -mv.z);
    vL = life;
  }`;
const FLAME_VS = PART_VS.replace('SPEED', '0.7').replace('RISE', `p.y += life * 2.1;
    p.x += sin(uTime * 3.1 + aSeed.z * 6.28 + life * 5.0) * 0.2 * (1.0 - life) + (aSeed.z - 0.5) * 0.3 * (1.0 - life);
    p.z += cos(uTime * 2.7 + aSeed.w * 6.28 + life * 5.0) * 0.2 * (1.0 - life);`).replace('SIZE', '(1.5 - life * 0.9) * (0.8 + aSeed.w * 0.7)').replace('PXK', '280.0');
const FLAME_FS = `varying float vL;
  void main() {
    float d = length(gl_PointCoord - 0.5), a = smoothstep(0.5, 0.0, d);
    float fade = smoothstep(0.0, 0.1, vL) * (1.0 - vL);
    vec3 c = mix(vec3(1.0, 0.86, 0.5), vec3(1.0, 0.3, 0.06), vL) * 2.4;
    gl_FragColor = vec4(c * a * fade, 1.0);
  }`;
const SMOKE_VS = PART_VS.replace('SPEED', '0.06').replace('RISE', `p.y += life * 10.0;
    p.x += sin(life * 5.0 + aSeed.z * 6.28) * 1.3 * life + life * life * 2.4;
    p.z += cos(life * 4.0 + aSeed.w * 6.28) * 1.1 * life;`).replace('SIZE', '(0.9 + life * 4.2) * (0.6 + aSeed.w * 0.6)').replace('PXK', '380.0');
const SMOKE_FS = `uniform vec3 uCol; varying float vL;
  void main() {
    float d = length(gl_PointCoord - 0.5), a = smoothstep(0.5, 0.05, d) * smoothstep(0.0, 0.09, vL) * pow(1.0 - vL, 1.5) * 0.26;
    gl_FragColor = vec4(uCol, a);
  }`;
const DUST_VS = `attribute vec4 aSeed; uniform float uTime, uPx; varying float vT;
  void main() {
    vec3 p = position + vec3(sin(uTime * 0.17 * (0.5 + aSeed.x) + aSeed.y * 6.28), sin(uTime * 0.11 * (0.5 + aSeed.z) + aSeed.w * 6.28) * 0.8,
      cos(uTime * 0.13 * (0.5 + aSeed.w) + aSeed.x * 6.28)) * 1.4;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPx * (0.5 + aSeed.z * 0.9) * 170.0 / max(1.0, -mv.z);
    vT = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed.y * 1.4) + aSeed.x * 40.0));
  }`;
const DUST_FS = `varying float vT;
  void main() {
    float d = length(gl_PointCoord - 0.5), a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a * vT * 0.85, 1.0);
  }`;
const HALO_VS = `attribute vec4 aSeed; uniform float uTime, uPx; varying float vF;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vF = 0.8 + 0.2 * sin(uTime * 9.0 + aSeed.x * 30.0) + 0.1 * sin(uTime * 14.0 + aSeed.y * 20.0);
    gl_PointSize = uPx * vF * 900.0 / max(1.0, -mv.z);
  }`;
const HALO_FS = `varying float vF;
  void main() {
    float d = length(gl_PointCoord - 0.5), a = pow(smoothstep(0.5, 0.0, d), 2.0);
    gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a * vF * 0.9, 1.0);
  }`;
const SHAFT_VS = `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
  void main() {
    vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const SHAFT_FS = `uniform vec3 uCol; uniform float uI, uTime; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
  void main() {
    float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.7);
    float along = 0.18 + 0.82 * vUv.y;
    float streak = 0.72 + 0.28 * sin(vUv.x * 62.8 + uTime * 0.25);
    gl_FragColor = vec4(uCol * f * along * streak * uI, 1.0);
  }`;
const FOG_VS = 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const FOG_FS = `uniform vec3 uCol; uniform float uI, uTime; varying vec3 vW;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    vec2 p = vW.xz * 0.055 + vec2(uTime * 0.018, uTime * 0.01);
    float v = n(p) * 0.5 + n(p * 2.1 + 4.0) * 0.3 + n(p * 4.3 + 9.0 + uTime * 0.02) * 0.2;
    float r = length(vW.xz), edge = smoothstep(64.0, 22.0, r);
    gl_FragColor = vec4(uCol * smoothstep(0.32, 0.86, v) * edge * uI, 1.0);
  }`;

function seeds(N, T) {
  const a = new Float32Array(N * 4);
  for (let i = 0; i < a.length; i++) a[i] = Math.random();
  return new T.BufferAttribute(a, 4);
}

function points(T, pos, N, vs, fs, uniforms, blending) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', seeds(N, T));
  const mat = new T.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending });
  const p = new T.Points(g, mat);
  p.frustumCulled = false;
  return p;
}

export class Temple {
  constructor(T, scene, { quality = 'high', reduced = false } = {}) {
    this.T = T; this.reduced = reduced; this.t = 0;
    const g = (this.g = new T.Group());
    g.name = 'temple';
    scene.add(g);
    const at = new T.Object3D();
    const bronze = M.metal({ kind: 'gold', color: '#b0703a', roughness: 0.38, clearcoat: 0.35 });
    this.uTime = { value: 0 };
    this.uPx = { value: 1 };
    this.torches = [];
    for (let i = 0; i < N_TORCH; i++) { const a = 0.62 + (i * Math.PI * 2) / N_TORCH; this.torches.push([Math.cos(a) * R_TORCH, Math.sin(a) * R_TORCH]); }
    this.censers = [[-13, 6], [13, 7]];

    // bronze braziers: a tapered stem and a flared bowl each; the censers are the same bowl, smaller, on a short foot
    this.stems = new T.InstancedMesh(new T.CylinderGeometry(0.16, 0.3, H_TORCH, 8), bronze, N_TORCH + 2);
    this.bowls = new T.InstancedMesh(new T.CylinderGeometry(0.95, 0.35, 0.8, 12, 1, true), bronze, N_TORCH + 2);
    bronze.side = T.DoubleSide;
    this.torches.forEach(([x, z], i) => {
      at.scale.set(1, 1, 1); at.position.set(x, FLOOR_Y + H_TORCH / 2, z); at.updateMatrix(); this.stems.setMatrixAt(i, at.matrix);
      at.position.set(x, FLOOR_Y + H_TORCH + 0.1, z); at.updateMatrix(); this.bowls.setMatrixAt(i, at.matrix);
    });
    this.censers.forEach(([x, z], k) => {
      const i = N_TORCH + k;
      at.scale.set(1, 0.3, 1); at.position.set(x, FLOOR_Y + 0.7, z); at.updateMatrix(); this.stems.setMatrixAt(i, at.matrix);
      at.scale.set(0.75, 0.75, 0.75); at.position.set(x, FLOOR_Y + 1.5, z); at.updateMatrix(); this.bowls.setMatrixAt(i, at.matrix);
    });
    this.stems.frustumCulled = this.bowls.frustumCulled = false;
    g.add(this.stems, this.bowls);

    // flames: 14 particles per brazier, interleaved so a smaller draw range thins every flame evenly
    const nF = N_TORCH * 14, fp = new Float32Array(nF * 3);
    for (let i = 0; i < nF; i++) { const [x, z] = this.torches[i % N_TORCH]; fp[i * 3] = x; fp[i * 3 + 1] = FLOOR_Y + H_TORCH + 0.35; fp[i * 3 + 2] = z; }
    this.flames = points(T, fp, nF, FLAME_VS, FLAME_FS, { uTime: this.uTime, uPx: this.uPx }, T.AdditiveBlending);
    this.flames.renderOrder = 6;
    // a soft warm halo around each flame (one draw for the four): the light the fire throws on the air
    const hp = new Float32Array(N_TORCH * 3);
    this.torches.forEach(([x, z], i) => { hp[i * 3] = x; hp[i * 3 + 1] = FLOOR_Y + H_TORCH + 0.9; hp[i * 3 + 2] = z; });
    this.halos = points(T, hp, N_TORCH, HALO_VS, HALO_FS, { uTime: this.uTime, uPx: this.uPx }, T.AdditiveBlending);
    this.halos.renderOrder = 6;
    // incense: 36 puffs per censer
    const nS = this.censers.length * 36, sp = new Float32Array(nS * 3);
    for (let i = 0; i < nS; i++) { const [x, z] = this.censers[i % this.censers.length]; sp[i * 3] = x; sp[i * 3 + 1] = FLOOR_Y + 2; sp[i * 3 + 2] = z; }
    this.smoke = points(T, sp, nS, SMOKE_VS, SMOKE_FS, { uTime: this.uTime, uPx: this.uPx, uCol: { value: new T.Color('#e6dcc4') } }, T.NormalBlending);
    this.smoke.renderOrder = 5;
    // dust in the light: a volume over the floor
    this.nDust = 240;
    const dp = new Float32Array(this.nDust * 3);
    for (let i = 0; i < this.nDust; i++) { dp[i * 3] = (Math.random() - 0.5) * 64; dp[i * 3 + 1] = FLOOR_Y + 1 + Math.random() * 30; dp[i * 3 + 2] = (Math.random() - 0.5) * 64; }
    this.dust = points(T, dp, this.nDust, DUST_VS, DUST_FS, { uTime: this.uTime, uPx: this.uPx }, T.AdditiveBlending);
    this.dust.renderOrder = 6;
    g.add(this.halos, this.flames, this.smoke, this.dust);

    // light shafts from the high window: two open cones, bright at the top, soft at the edge
    this.shafts = [];
    [[-16, 36, 18, -3, 0, 2, 6.5, '#ebd0a2', 0.5], [-24, 34, -6, -6, 0, -4, 4.2, '#ebd8ad', 0.4]].forEach(([tx, ty, tz, bx, by, bz, rad, col, I]) => {
      const top = new T.Vector3(tx, FLOOR_Y + ty, tz), bot = new T.Vector3(bx, FLOOR_Y + by, bz), len = top.distanceTo(bot);
      const m = new T.Mesh(new T.CylinderGeometry(0.4, rad, len, 20, 1, true),
        new T.ShaderMaterial({ uniforms: { uCol: { value: new T.Color(col) }, uI: { value: I }, uTime: this.uTime }, vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS,
          transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      m.position.copy(top).add(bot).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
      m.frustumCulled = false; m.renderOrder = 7;
      this.shafts.push(m); g.add(m);
    });
    // ground fog: two scrolling layers over the floor
    this.fog = [[0.7, 0.55, '#cfb26f'], [2.6, 0.32, '#e0c88f']].map(([h, I, col]) => {
      const m = new T.Mesh(new T.PlaneGeometry(140, 140).rotateX(-Math.PI / 2), new T.ShaderMaterial({
        uniforms: { uCol: { value: new T.Color(col) }, uI: { value: I }, uTime: this.uTime }, vertexShader: FOG_VS, fragmentShader: FOG_FS,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      m.position.y = FLOOR_Y + h; m.frustumCulled = false; m.renderOrder = 4;
      g.add(m);
      return m;
    });
    // contact shadows: one instanced draw of soft black discs (an alpha-map gradient), under the colonnade, the stone, the braziers
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cx = c.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#9a968f'); gr.addColorStop(1, '#000');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const tex = new T.CanvasTexture(c);
    const spots = [[0, 0, 7.2]];
    for (let i = 0; i < N_COL; i++) { const a = (i / N_COL) * Math.PI * 2; spots.push([Math.cos(a) * R_COL, Math.sin(a) * R_COL, 4.4]); }
    this.torches.forEach(([x, z]) => spots.push([x, z, 2.4]));
    this.censers.forEach(([x, z]) => spots.push([x, z, 1.9]));
    this.shadows = new T.InstancedMesh(new T.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), spots.length);
    spots.forEach(([x, z, s], i) => { at.scale.set(s, 1, s); at.position.set(x, FLOOR_Y + 0.02, z); at.updateMatrix(); this.shadows.setMatrixAt(i, at.matrix); });
    this.shadows.frustumCulled = false; this.shadows.renderOrder = 1;
    g.add(this.shadows);
    // the moon: a soft halo and a bright disc, far behind the default view
    this.halo = glowSprite(T, 0xebd4a0, 70, 0.22); this.halo.position.set(48, 40, -88);
    this.moon = glowSprite(T, 0xf3ece0, 9, 0.95); this.moon.position.copy(this.halo.position);
    this.halo.material.fog = this.moon.material.fog = false;
    g.add(this.halo, this.moon);
    // the braziers' light
    this.light = new T.PointLight(0xeb8842, 40, 85, 2);
    this.light.position.set(this.torches[1][0] * 0.55, FLOOR_Y + 7, this.torches[1][1] * 0.55);
    g.add(this.light);
    this.setQuality(quality);
  }

  setQuality(q) {
    const lite = q === 'low';
    this.lite = lite;
    this.flames.geometry.setDrawRange(0, lite ? N_TORCH * 7 : N_TORCH * 14);
    this.smoke.geometry.setDrawRange(0, lite ? this.censers.length * 14 : this.censers.length * 36);
    this.dust.geometry.setDrawRange(0, lite ? 90 : this.nDust);
    this.shafts.forEach((m) => { m.visible = !lite; });
    this.fog[1].visible = !lite;
  }

  /** a theme's accent: the cold shaft and the fog take a hint of it */
  applyTheme(accent) {
    if (!accent) return;
    this.shafts[1].material.uniforms.uCol.value.set(accent).lerp(new this.T.Color('#ebd8ad'), 0.5);
    this.fog[0].material.uniforms.uCol.value.set(accent).lerp(new this.T.Color('#cfb26f'), 0.6);
  }

  frame(t, dt, px) {
    this.t = this.reduced ? 3.1 : t;
    this.uTime.value = this.t;
    this.uPx.value = px || 1;
    const k = this.reduced ? 0 : 1;
    this.light.intensity = 40 + k * (Math.sin(t * 9.1) * 6 + Math.sin(t * 13.7 + 1) * 4);
  }
}
