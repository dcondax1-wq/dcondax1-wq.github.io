// ODEON stage fx (2026-11-04): the atmosphere of the amphitheatre, added to arena.js (it lives inside the arena group, so it follows
// the camera along the tape like the rest of the backdrop).
//   - flames on the four skene torches: rising, flickering particles that bloom (HDR), and the torches' light flickers with them
//   - two bronze censers on the orchestra with incense smoke curling up
//   - a low mist that scrolls over the stone, and baked contact shadows under every column, torch and censer (one instanced draw)
// Draw calls: halos, flames, smoke, mist, shadows, censers (bowl + foot) = 7 on HD; LITE drops the mist and halves the particles.
import * as THREE from '../jarvis/three.module.min.js';
import * as M from '../olympus/materials.js';

const TORCH_X = [-34, -17, 17, 34], TORCH_Z = -11.5, TORCH_Y = 3.0;       // = arena.js
const CENSERS = [[-9, -7], [9, -7]];
const COLS = 13, COL_GAP = 5.2, SKENE_Z = -16;

const PVS = `attribute vec4 aSeed; uniform float uTime, uPx; varying float vL;
  void main() {
    float life = fract(uTime * SPEED * (0.7 + aSeed.x * 0.6) + aSeed.y);
    vec3 p = position;
    RISE
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPx * SIZE * PXK / max(1.0, -mv.z);
    vL = life;
  }`;
const FLAME_VS = PVS.replace('SPEED', '0.75').replace('RISE', `p.y += life * 2.3;
    p.x += sin(uTime * 3.1 + aSeed.z * 6.28 + life * 5.0) * 0.22 * (1.0 - life) + (aSeed.z - 0.5) * 0.3 * (1.0 - life);
    p.z += cos(uTime * 2.7 + aSeed.w * 6.28 + life * 5.0) * 0.2 * (1.0 - life);`).replace('SIZE', '(1.5 - life * 0.9) * (0.8 + aSeed.w * 0.7)').replace('PXK', '300.0');
const FLAME_FS = `varying float vL;
  void main() {
    float d = length(gl_PointCoord - 0.5), a = smoothstep(0.5, 0.0, d), fade = smoothstep(0.0, 0.1, vL) * (1.0 - vL);
    vec3 c = mix(vec3(1.0, 0.86, 0.5), vec3(1.0, 0.3, 0.06), vL) * 2.5;
    gl_FragColor = vec4(c * a * fade, 1.0);
  }`;
const SMOKE_VS = PVS.replace('SPEED', '0.06').replace('RISE', `p.y += life * 9.0;
    p.x += sin(life * 5.0 + aSeed.z * 6.28) * 1.2 * life + life * life * 2.2;
    p.z += cos(life * 4.0 + aSeed.w * 6.28) * 1.0 * life;`).replace('SIZE', '(0.9 + life * 4.0) * (0.6 + aSeed.w * 0.6)').replace('PXK', '380.0');
const SMOKE_FS = `uniform vec3 uCol; varying float vL;
  void main() {
    float d = length(gl_PointCoord - 0.5), a = smoothstep(0.5, 0.05, d) * smoothstep(0.0, 0.09, vL) * pow(1.0 - vL, 1.5) * 0.27;
    gl_FragColor = vec4(uCol, a);
  }`;
const HALO_VS = `attribute vec4 aSeed; uniform float uTime, uPx; varying float vF;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vF = 0.8 + 0.2 * sin(uTime * 9.0 + aSeed.x * 30.0) + 0.1 * sin(uTime * 14.0 + aSeed.y * 20.0);
    gl_PointSize = uPx * vF * 700.0 / max(1.0, -mv.z);
  }`;
const HALO_FS = `varying float vF;
  void main() {
    float d = length(gl_PointCoord - 0.5), a = pow(smoothstep(0.5, 0.0, d), 2.0);
    gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a * vF * 0.9, 1.0);
  }`;
const MIST_VS = 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const MIST_FS = `uniform vec3 uCol; uniform float uI, uTime; varying vec3 vW;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    vec2 p = vW.xz * 0.05 + vec2(uTime * 0.02, uTime * 0.012);
    float v = n(p) * 0.5 + n(p * 2.1 + 4.0) * 0.3 + n(p * 4.3 + 9.0 + uTime * 0.02) * 0.2;
    float edge = smoothstep(75.0, 30.0, length(vW.xz - vec2(0.0, -10.0)));
    gl_FragColor = vec4(uCol * smoothstep(0.34, 0.88, v) * edge * uI, 1.0);
  }`;

function pts(pos, N, vs, fs, uniforms, blending) {
  const g = new THREE.BufferGeometry(), seed = new Float32Array(N * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const p = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending }));
  p.frustumCulled = false;
  return p;
}

export class StageFx {
  constructor({ lite = false } = {}) {
    const g = (this.g = new THREE.Group());
    g.name = 'stage-fx';
    this.uTime = { value: 0 };
    this.uPx = { value: 1 };
    const at = new THREE.Object3D();
    // flames: 16 particles per torch, interleaved so a smaller draw range thins every flame evenly
    this.nF = TORCH_X.length * 16;
    const fp = new Float32Array(this.nF * 3);
    for (let i = 0; i < this.nF; i++) { fp[i * 3] = TORCH_X[i % TORCH_X.length]; fp[i * 3 + 1] = TORCH_Y + 0.3; fp[i * 3 + 2] = TORCH_Z; }
    this.flames = pts(fp, this.nF, FLAME_VS, FLAME_FS, { uTime: this.uTime, uPx: this.uPx }, THREE.AdditiveBlending);
    this.flames.renderOrder = 9;
    const hp = new Float32Array(TORCH_X.length * 3);
    TORCH_X.forEach((x, i) => { hp[i * 3] = x; hp[i * 3 + 1] = TORCH_Y + 1.0; hp[i * 3 + 2] = TORCH_Z; });
    this.halos = pts(hp, TORCH_X.length, HALO_VS, HALO_FS, { uTime: this.uTime, uPx: this.uPx }, THREE.AdditiveBlending);
    this.halos.renderOrder = 9;
    // incense: 40 puffs per censer; the censer is the arena's bronze bowl, smaller, on a short foot
    this.nS = CENSERS.length * 40;
    const sp = new Float32Array(this.nS * 3);
    for (let i = 0; i < this.nS; i++) { const [x, z] = CENSERS[i % CENSERS.length]; sp[i * 3] = x; sp[i * 3 + 1] = 1.5; sp[i * 3 + 2] = z; }
    this.smoke = pts(sp, this.nS, SMOKE_VS, SMOKE_FS, { uTime: this.uTime, uPx: this.uPx, uCol: { value: new THREE.Color('#d8cdb8') } }, THREE.NormalBlending);
    this.smoke.renderOrder = 8;
    const bronze = M.metal({ kind: 'gold', color: '#b0703a', roughness: 0.38, clearcoat: 0.35 });
    bronze.fog = false; bronze.side = THREE.DoubleSide;
    this.censers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.28, 0.6, 16, 1, true), bronze, CENSERS.length);
    CENSERS.forEach(([x, z], i) => { at.scale.set(1, 1, 1); at.position.set(x, 1.1, z); at.updateMatrix(); this.censers.setMatrixAt(i, at.matrix); });
    this.feet = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.22, 0.9, 8), bronze, CENSERS.length);
    CENSERS.forEach(([x, z], i) => { at.position.set(x, 0.45, z); at.updateMatrix(); this.feet.setMatrixAt(i, at.matrix); });
    this.censers.frustumCulled = this.feet.frustumCulled = false;
    // the mist over the stone
    this.mist = new THREE.Mesh(new THREE.PlaneGeometry(220, 120).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color('#b08a5a') }, uI: { value: 0.35 }, uTime: this.uTime }, vertexShader: MIST_VS, fragmentShader: MIST_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mist.position.set(0, 0.45, -12); this.mist.frustumCulled = false; this.mist.renderOrder = 3;
    // baked contact shadows under the colonnade, the torches and the censers
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cx = c.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#9a9a9a'); gr.addColorStop(1, '#000');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const spots = [], span = (COLS - 1) * COL_GAP;
    for (let i = 0; i < COLS; i++) spots.push([-span / 2 + i * COL_GAP, SKENE_Z, 1.9]);
    TORCH_X.forEach((x) => spots.push([x, TORCH_Z, 1.5]));
    CENSERS.forEach(([x, z]) => spots.push([x, z, 1.3]));
    this.shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: new THREE.CanvasTexture(c), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), spots.length);
    spots.forEach(([x, z, s], i) => { at.scale.set(s, 1, s); at.position.set(x, 0.03, z); at.updateMatrix(); this.shadows.setMatrixAt(i, at.matrix); });
    this.shadows.frustumCulled = false; this.shadows.renderOrder = 1;
    g.add(this.shadows, this.mist, this.censers, this.feet, this.smoke, this.halos, this.flames);
    this.setLite(lite);
  }

  setLite(on) {
    this.lite = !!on;
    this.flames.geometry.setDrawRange(0, on ? this.nF / 2 : this.nF);
    this.smoke.geometry.setDrawRange(0, on ? CENSERS.length * 16 : this.nS);
    this.mist.visible = !on;
  }

  frame(wall, reduced) {
    this.uTime.value = reduced ? 3.1 : wall;
    this.uPx.value = Math.min(1.75, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  }
}
