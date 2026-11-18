// ODEON scene: the 3D theater (three.js r160 from ../jarvis/). Owns every mesh; knows nothing about the DOM UI.
//   const th = new Theater(canvas, { lite, reduced });  th.load(trade);  th.update(T, dt, wall);  th.fire(event);
//   th.render(camera);  th.setLite(on);  th.resize(w, h);  th.pos(t, price) -> world point;  th.head -> { x, y, price }
// World: x = bar steps since the first bar (time), y = price (scaled per trade), z = depth (candles at z = 0). The glossy
// floor follows the lowest price printed so far; a mirrored copy of the stage under it is the reflection.
// Persistent visuals (bars, levels, planes) are a pure function of the market time T, so scrubbing is exact; one-off
// effects (lightning, flare, bursts, flashes) only run when the director crosses an event while playing forward.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { Arena } from './arena.js';
import { barsAt, formingBar, priceAt, stopAt, eventsUpTo } from './timeline.js';

const COL = {
  up: new THREE.Color('#8a9a5a'), down: new THREE.Color('#d06a48'), level: new THREE.Color('#6fa3c4'),
  spent: new THREE.Color('#b8a07c'), stop: new THREE.Color('#c96a4a'), be: new THREE.Color('#d9c9a8'),
  gold: new THREE.Color('#d4b05a'), entry: new THREE.Color('#f3ece0'), limit: new THREE.Color('#6fa3c4'),
  win: new THREE.Color('#8a9a5a'), loss: new THREE.Color('#d06a48'), bev: new THREE.Color('#d9c9a8'), bolt: new THREE.Color('#f0dcb0'),
};

const LOCAL = 2.6;    // world height of a typical 30-bar stretch of tape (the pillars' vertical scale)
const DEPTH = 5;      // depth of the light planes
const FOG = new THREE.Color('#2a1d14');

// ---------------------------------------------------------------- shaders
const PILLAR_VS = `
varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec3 vP;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vV = cameraPosition - wp.xyz;
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#else
  vC = vec3(1.0);
#endif
  vP = position;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const PILLAR_FS = `
uniform float uGlow; uniform float uFlash; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec3 vP;
#include <fog_pars_fragment>
void main() {
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float fr = pow(1.0 - abs(dot(n, v)), 2.0);
  vec2 e2 = abs(vP.xz) * 2.0; float edge = max(e2.x, e2.y);
  float side = step(abs(n.y), 0.5);
  float rim = smoothstep(0.78, 1.0, edge) * side;
  float cap = 1.0 - side;
  float grad = 0.5 + 0.5 * (vP.y + 0.5);
  float shimmer = 0.06 * sin(vP.y * 30.0 - uTime * 2.5) * fr;
  vec3 col = vC * (0.10 + 0.8 * fr + 0.6 * rim + 0.45 * cap + shimmer) * grad + vec3(1.0) * rim * 0.06;
  gl_FragColor = vec4(col * uGlow * (1.0 + uFlash), 1.0);
#include <fog_fragment>
#include <colorspace_fragment>
}`;
const PLANE_VS = `
varying vec2 vUv; varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
// a horizontal light sheet: bright core line at z = 0, fading with depth; mode 0 = level, 1 = force field (hex), 2 = gold
const PLANE_FS = `
uniform vec3 uColor; uniform float uI; uniform float uTime; uniform float uMode; uniform float uLen;
varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
float hexd(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
void main() {
  float z = (vUv.y - 0.5) * ${DEPTH.toFixed(1)};
  float zf = exp(-z * z * 0.32);
  float core = exp(-z * z * 26.0);
  float xs = vUv.x * uLen;
  float xf = smoothstep(0.0, 0.6, xs) * smoothstep(0.0, 0.4, uLen - xs);
  float a = core * 1.1 + zf * 0.10;
  if (uMode > 0.5 && uMode < 1.5) {
    vec2 p = vec2(vW.x, z) * 2.4;
    vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5;
    vec2 qa = mod(p, r) - h; vec2 qb = mod(p - h, r) - h;
    vec2 gv = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    float edge = smoothstep(0.40, 0.5, hexd(gv));
    float ripple = 0.5 + 0.5 * sin(vW.x * 2.2 - uTime * 3.5 + z * 1.5);
    a += edge * zf * (0.22 + 0.45 * ripple);
  } else if (uMode > 1.5) {
    float s = fract(sin(dot(floor(vec2(vW.x * 6.0, z * 6.0)), vec2(12.9898, 78.233))) * 43758.5453);
    float tw = step(0.965, s) * (0.5 + 0.5 * sin(uTime * 3.0 + s * 40.0));
    a += zf * (0.12 + tw * 0.9);
  } else {
    a += zf * 0.05 * (0.5 + 0.5 * sin(vW.x * 1.3 - uTime * 1.5));
  }
  gl_FragColor = vec4(uColor * a * xf * uI, 1.0);
#include <fog_fragment>
#include <colorspace_fragment>
}`;
const FLOOR_FS = `
uniform vec3 uBase; uniform vec3 uTint; uniform float uHeadX; uniform float uFlash; uniform float uAlpha;
varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
void main() {
  vec2 g = abs(fract(vW.xz * 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
  float d = length(vec2((vW.x - uHeadX) * 0.22, vW.z * 0.32));
  float pool = exp(-d * d * 1.4);
  vec3 col = uBase + vec3(0.62, 0.5, 0.34) * line * 0.10 + uTint * pool * 0.20 + uTint * uFlash * 0.25;
  gl_FragColor = vec4(col, uAlpha - pool * 0.22);
#include <fog_fragment>
#include <colorspace_fragment>
}`;
const SHAFT_FS = `
uniform vec3 uColor; uniform float uI; uniform float uTime;
varying vec2 vUv; varying vec3 vW;
void main() {
  float across = sin(vUv.x * 3.14159);
  float along = smoothstep(0.0, 0.25, vUv.y) * (1.0 - vUv.y * 0.6);
  float flick = 0.85 + 0.15 * sin(uTime * 0.7 + vUv.x * 4.0);
  gl_FragColor = vec4(uColor * across * across * along * uI * flick, 1.0);
}`;
const SKY_FS = `
uniform float uTime; varying vec2 vUv; varying vec3 vW;
void main() {
  vec2 p = vUv - vec2(0.5, 0.42);
  float r = length(p * vec2(1.0, 1.8));
  vec3 a = vec3(0.14, 0.09, 0.05) * exp(-r * r * 6.0);
  vec3 b = vec3(0.08, 0.05, 0.02) * exp(-pow(length(p - vec2(0.22, 0.05)) * 2.4, 2.0));
  float hz = exp(-pow((vUv.y - 0.36) * 9.0, 2.0)) * 0.10;
  gl_FragColor = vec4(a + b + vec3(0.45, 0.30, 0.15) * hz, 1.0);
}`;

// the dust in the beam as bokeh: a point grows and softens with its distance from the focus plane (the director's shot
// distance), with the bright rim of a lens's out-of-focus disc. This is the depth of field: no post pass, one draw call.
const BOKEH_VS = `
uniform float uSize; uniform float uH; uniform float uFocus; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(0.5, -mv.z);
  float blur = min(3.0, abs(dist - uFocus) / max(1.0, uFocus));
  gl_PointSize = clamp(uSize * (1.0 + 7.0 * blur) * projectionMatrix[1][1] * uH * 0.5 / dist, 1.0, 96.0);
  vA = 0.6 / (1.0 + 9.0 * blur * blur);
  gl_Position = projectionMatrix * mv;
}`;
const BOKEH_FS = `
uniform vec3 uColor; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float disc = smoothstep(1.0, 0.82, d) * (0.55 + 0.45 * smoothstep(0.5, 0.92, d));
  gl_FragColor = vec4(uColor * disc * vA, 1.0);
}`;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textSprite(text, color, sub) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 34px Georgia, -apple-system, system-ui, sans-serif';
  g.font = font;
  const w = Math.ceil(Math.max(g.measureText(text).width, sub ? g.measureText(sub).width * 0.8 : 0)) + 24;
  c.width = Math.min(1024, w);
  c.height = sub ? 84 : 48;
  g.font = font;
  g.textBaseline = 'top';
  g.shadowColor = color;
  g.shadowBlur = 12;
  g.fillStyle = color;
  g.fillText(text, 12, 6);
  if (sub) {
    g.font = '500 26px Georgia, -apple-system, system-ui, sans-serif';
    g.globalAlpha = 0.8;
    g.fillText(sub, 12, 48);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
  const s = new THREE.Sprite(m);
  const k = 0.0058;
  s.scale.set(c.width * k, c.height * k, 1);
  s.center.set(0, 0);
  s.renderOrder = 6;
  return s;
}

/** a small P&L tag whose text is redrawn only when it changes: sprite.userData.set(text, color) */
function tagSprite() {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 72;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  s.scale.set(320 * 0.0075, 72 * 0.0075, 1);
  s.center.set(0, 0.5);
  s.renderOrder = 9;
  let last = '';
  s.userData.set = (text, color) => {
    if (text === last) return;
    last = text;
    s.userData.text = text;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 320, 72);
    g.fillStyle = 'rgba(6,5,12,.72)';
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 8, 312, 56, 14); else g.rect(4, 8, 312, 56);
    g.fill();
    g.strokeStyle = color; g.lineWidth = 2; g.globalAlpha = 0.8; g.stroke(); g.globalAlpha = 1;
    g.font = '700 36px Georgia, -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle'; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 10;
    g.fillText(text, 18, 37);
    tex.needsUpdate = true;
  };
  return s;
}

function planeMesh(mode, color) {
  const geo = new THREE.PlaneGeometry(1, DEPTH);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0.5, 0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: color.clone() }, uI: { value: 1 }, uTime: { value: 0 }, uMode: { value: mode }, uLen: { value: 1 } }]),
    vertexShader: PLANE_VS, fragmentShader: PLANE_FS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  m.frustumCulled = false;
  return m;
}

export class Theater {
  constructor(canvas, opts) {
    const o = opts || {};
    this.reduced = !!o.reduced;
    this.lite = !!o.lite;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(FOG, 0.028);
    // the OLYMPUS render core (docs/OLYMPUS_RENDER.md): ACES + sRGB, the environment light, bloom, 4x MSAA on HD, FXAA on LITE. 'display'
    // space keeps the glass pillars' colours; the camera is the app's (it lives in app.js), the size comes from resize().
    this.rc = createRenderer({ canvas, scene: this.scene, camera: o.camera || new THREE.PerspectiveCamera(42, 1, 0.1, 1500), space: 'display', env: 'night',
      tint: '#c8a24a', theme: { sky: '#4a3626', fog: '#2a1d14', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, autoSize: false, fitCamera: false, adapt: false, maxDpr: 1.75, bloom: { strength: 0.22, radius: 0.5, threshold: 0.9 },
      grade: { vignette: 0.3, grain: 0.03 } });
    this.renderer = this.rc.renderer;
    this.renderer.setClearColor(FOG, 1);
    // night-3d look (olympus/look.js): a warm dusk grade in the finish pass, and on HD a soft depth of field: the tape's head (the director
    // frames it at the centre) stays sharp, the far colonnade and the backdrop melt. No draw call; optional.
    this.lookFx = null;
    import('../olympus/look.js').then((L) => { this.lookFx = L.polish(this.rc, { grade: 'dusk', mix: 0.35, focus: { x: 0.5, y: 0.46, r: 0.3, amount: 2.2 } }); }).catch(() => {});
    this.glow = glowTexture();
    this.flash = 0;          // global flash 0..1 (decays)
    this.flashTint = new THREE.Color('#f3ece0');
    this.fx = [];            // live one-off effects {update(dt) -> alive}
    this.mirrors = [];       // [source, reflection] pairs kept in step every frame
    this.time = 0;
    this.stage = new THREE.Group();
    this.mirror = new THREE.Group();
    this.mirror.scale.y = -1;
    this.scene.add(this.stage, this.mirror);
    this._buildRoom();
    this.arena = new Arena({ lite: this.lite, reduced: this.reduced });
    this.scene.add(this.arena.g);
    this.setLite(this.lite);
  }

  // ------------------------------------------------------------ the room (kept across trades)
  _buildRoom() {
    const fogU = THREE.UniformsLib.fog;
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([fogU, { uBase: { value: new THREE.Color('#2a1d14') }, uTint: { value: new THREE.Color('#c8924a') },
        uHeadX: { value: 0 }, uFlash: { value: 0 }, uAlpha: { value: 0.8 } }]),
      vertexShader: PLANE_VS, fragmentShader: FLOOR_FS, transparent: true, depthWrite: false, fog: true,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700).rotateX(-Math.PI / 2), this.floorMat);
    floor.renderOrder = 1;
    floor.position.z = -300;
    floor.frustumCulled = false;
    this.floor = floor;
    this.scene.add(floor);
    // the backdrop glow and the projector shafts
    this.skyMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: PLANE_VS.replace('#include <fog_pars_vertex>', '').replace('#include <fog_vertex>', ''),
      fragmentShader: SKY_FS, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(1400, 420), this.skyMat);
    this.sky.position.set(0, 60, -600);
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    this.shafts = new THREE.Group();
    const shaftMat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color('#ffd9a0') }, uI: { value: 0.08 }, uTime: { value: 0 } },
      vertexShader: PLANE_VS.replace('#include <fog_pars_vertex>', '').replace('#include <fog_vertex>', ''),
      fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.shaftMat = shaftMat;
    for (let i = 0; i < 3; i++) {
      const g = new THREE.PlaneGeometry(3.2 + i, 26);
      g.translate(0, -13, 0);
      const m = new THREE.Mesh(g, shaftMat);
      m.position.set(-6 + i * 7, 22, -6 - i * 2);
      m.rotation.z = -0.38 + i * 0.12;
      m.rotation.y = 0.3 - i * 0.2;
      m.renderOrder = 7;
      this.shafts.add(m);
    }
    this.scene.add(this.shafts);
    // dust in the beam
    const N = 260, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.6) * 14; }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.ShaderMaterial({ uniforms: { uSize: { value: 0.07 }, uH: { value: 800 }, uFocus: { value: 12 },
      uColor: { value: new THREE.Color('#ffe0b0') } }, vertexShader: BOKEH_VS, fragmentShader: BOKEH_FS, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.renderOrder = 8;
    this.dustN = N;
    this.scene.add(this.dust);
    // the "now" curtain: a vertical light sheet that scans along with the forming bar
    const cg = new THREE.PlaneGeometry(DEPTH, 1);
    cg.rotateY(Math.PI / 2);
    cg.translate(0, 0.5, 0);
    this.curtainMat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color('#e0b878') }, uI: { value: 0.16 }, uTime: { value: 0 } },
      vertexShader: PLANE_VS.replace('#include <fog_pars_vertex>', '').replace('#include <fog_vertex>', ''),
      fragmentShader: SHAFT_FS.replace('float along = smoothstep(0.0, 0.25, vUv.y) * (1.0 - vUv.y * 0.6);', 'float along = 0.35 + 0.65 * vUv.y;'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.curtain = new THREE.Mesh(cg, this.curtainMat);
    this.curtain.renderOrder = 4;
    this.curtain.frustumCulled = false;
    this.scene.add(this.curtain);
  }

  setLite(on) {
    this.lite = !!on;
    this.rc.setQuality(this.rc.forced || (window.OLYMPUS && window.OLYMPUS.fx() === 'off' ? 'off' : this.rc.software ? 'low' : this.lite ? 'low' : ['ultra', 'high'].includes(this.rc.quality()) ? this.rc.quality() : 'high'));
    if (this.arena) this.arena.setLite(this.lite);
    this.mirror.visible = !this.lite;
    this.shafts.visible = !this.lite;
    this.dust.geometry.setDrawRange(0, this.lite ? 70 : this.dustN);
    this.floorMat.uniforms.uAlpha.value = this.lite ? 0.97 : 0.8;
    if (this._w) this.resize(this._w, this._h);
  }

  /** A theme's colours (OLYMPUS themes): the liquidity planes take the accent, the room the background. */
  applyTheme(accent, bg) {
    if (accent) { COL.level.set(accent); if (this.arena) this.arena.applyTheme(accent); }
    if (bg) { this.renderer.setClearColor(bg, 1); this.scene.fog.color.set(bg); }
  }

  /** the focus plane of the bokeh dust: the camera's distance to the shot's look-at point */
  setFocus(d) { this.dustMat.uniforms.uFocus.value = d; }

  resize(w, h) {
    this._w = w; this._h = h;
    this.rc.resize(w, h);
    this.dustMat.uniforms.uH.value = h * this.renderer.getPixelRatio();
  }

  // ------------------------------------------------------------ one trade
  X(step) { return step * this.dx; }
  Y(p) { return (p - this.lo) * this.k + 0.7; }
  xAt(t) { return this.X((t - this.tr.B.t[0]) / this.tr.B.s); }
  pos(t, price) { return new THREE.Vector3(this.xAt(t), this.Y(price), 0); }

  _clearTrade() {
    for (const [, m] of this.mirrors) this.mirror.remove(m);
    this.mirrors = [];
    const kill = (o) => {
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          const ms = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach((m) => { if (m.map && m.map !== this.glow) m.map.dispose(); m.dispose(); });
        }
      });
    };
    if (this.tg) { this.stage.remove(this.tg); kill(this.tg); }
    this.fx.forEach((f) => f.dispose && f.dispose());
    this.fx = [];
  }

  _mirror(src) {
    let m;
    if (src.isInstancedMesh) {
      m = new THREE.InstancedMesh(src.geometry, src.material, src.count);
      m.instanceMatrix = src.instanceMatrix;
      if (src.instanceColor) m.instanceColor = src.instanceColor;
    } else if (src.isSprite) {
      m = new THREE.Sprite(src.material);
      m.center.copy(src.center);
    } else {
      m = new THREE.Mesh(src.geometry, src.material);
    }
    m.frustumCulled = false;
    m.renderOrder = 0;
    this.mirror.add(m);
    this.mirrors.push([src, m]);
    return m;
  }

  load(tr) {
    this._clearTrade();
    this.tr = tr;
    const B = tr.B;
    this.dx = B.s >= 300 ? 0.5 : 0.16;
    // vertical scale: a typical 30-bar stretch of tape stands LOCAL units tall (the whole day 8..48 units)
    const rng = [];
    for (let i = 0; i + 30 <= B.n; i += 15) {
      let lo = Infinity, hi = -Infinity;
      for (let j = i; j < i + 30; j++) { lo = Math.min(lo, B.l[j]); hi = Math.max(hi, B.h[j]); }
      rng.push(hi - lo);
    }
    rng.sort((a, z) => a - z);
    const med = rng.length ? rng[rng.length >> 1] : tr.hi - tr.lo;
    const full = Math.max(1, tr.hi - tr.lo);
    this.k = Math.min(48 / full, Math.max(8 / full, LOCAL / Math.max(0.5, med)));
    this.floorY = null;
    this.lo = tr.lo;
    const n = B.n, w = this.dx * 0.72;
    this.tg = new THREE.Group();
    this.stage.add(this.tg);
    // glass pillars + wicks (instanced; one draw call each)
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.pillarMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uGlow: { value: 1 }, uFlash: { value: 0 }, uTime: { value: 0 } }]),
      vertexShader: PILLAR_VS, fragmentShader: PILLAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    });
    this.bodies = new THREE.InstancedMesh(box, this.pillarMat, n);
    this.wicks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true,
      opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }), n);
    for (const m of [this.bodies, this.wicks]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.renderOrder = 2;
      for (let i = 0; i < n; i++) m.setColorAt(i, COL.up);
      this.tg.add(m);
      this._mirror(m);
    }
    this.barW = w;
    this._formingI = null;
    this.shown = -1;           // bars drawn as closed so far
    this.inTrade = (i) => B.t[i] + B.s > tr.entry.t && B.t[i] <= tr.exit.t;
    this.runLow = new Float64Array(n);
    for (let i = 0; i < n; i++) this.runLow[i] = Math.min(i ? this.runLow[i - 1] : Infinity, B.l[i]);
    // light planes: the swept levels
    this.levels = [];
    const sweeps = tr.events.filter((e) => e.k === 'sweep');
    for (const lv of tr.levels || []) {
      const m = planeMesh(0, COL.level);
      const known = lv.t == null ? B.t[0] : Math.max(B.t[0], lv.t + 300);
      const sw = sweeps.find((e) => (e.levels || []).indexOf(lv.k) >= 0);
      m.position.set(this.xAt(known), this.Y(lv.px), 0);
      const label = textSprite((lv.name || lv.label || '').toUpperCase(), '#d9c9a8', this._px(lv.px));
      label.position.set(this.xAt(known) + 0.15, this.Y(lv.px) + 0.08, 0.2);
      this.tg.add(m, label);
      this._mirror(m); this._mirror(label);
      this.levels.push({ lv, m, label, known, swept: sw ? sw.t : Infinity });
    }
    // limit line, entry line, stop force field, target plane + gold gate
    const lim = tr.events.find((e) => e.k === 'limit');
    this.limit = null;
    if (lim && lim.price != null) {
      const m = planeMesh(0, COL.limit);
      m.position.set(this.xAt(lim.t), this.Y(lim.price), 0);
      this.tg.add(m);
      this.limit = { m, t: lim.t, end: Math.min(tr.entry.t, lim.t + 1800) };
    }
    this.entryPlane = planeMesh(0, COL.entry);
    this.stopPlane = planeMesh(1, COL.stop);
    this.targetPlane = planeMesh(2, COL.gold);
    for (const m of [this.entryPlane, this.stopPlane, this.targetPlane]) { this.tg.add(m); this._mirror(m); }
    this.stopLabel = textSprite('STOP ' + this._px(tr.stop), '#d98a6e');
    this.targetLabel = textSprite('TARGET ' + this._px(tr.target), '#e0b878');
    this.entryLabel = textSprite((tr.side === 'SHORT' ? 'SHORT ' : 'LONG ') + this._px(tr.entry.px), '#f3ece0');
    this.tg.add(this.stopLabel, this.targetLabel, this.entryLabel);
    // the R ruler beside the entry: -1R (the stop) and every whole R up to the target, each with its $ for this size (risk_pts x $2 x micros)
    this.rungs = [];
    const risk = Number(tr.risk_pts) || 0, tR = risk ? Math.abs(tr.target - tr.entry.px) / risk : 0;
    if (risk > 0) {
      const ns = [-1];
      for (let n = 1; n <= Math.min(10, Math.floor(tR + 1e-6)); n++) ns.push(n);
      for (const n of ns) {
        const usd = n * risk * 2 * (tr.qty || 1);
        const s = textSprite(`${n > 0 ? '+' : '−'}${Math.abs(n)}R · ${n > 0 ? '+' : '−'}$${Math.round(Math.abs(usd)).toLocaleString('en-US')}`,
          n < 0 ? '#d98a6e' : n === Math.round(tR) && tR - n < 0.5 ? '#e0b878' : '#b5c07a');
        s.center.set(1, 0.5);
        s.position.set(this.xAt(tr.entry.t) - 0.5, this.Y(tr.entry.px + tr.d * n * risk), 0.25);
        s.visible = false;
        this.tg.add(s);
        this.rungs.push({ n, s });
      }
    }
    // the live P&L tag riding the head candle
    this.pnlTag = tagSprite();
    this.pnlTag.visible = false;
    this.tg.add(this.pnlTag);
    // the gate: two counter-rotating gold rings and a halo at the target
    this.gate = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.028, 10, 72), ringMat);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.014, 8, 64), ringMat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: COL.gold, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(2.6, 2.6, 1);
    this.gate.add(r1, r2, halo);
    this.gate.userData = { r1, r2, halo };
    this.gate.renderOrder = 5;
    this.tg.add(this.gate);
    // persistent markers: a soft glow on each sweep / CISD / entry point
    this.marks = [];
    for (const e of tr.events) {
      if (['sweep', 'idm', 'cisd5', 'cisd1', 'tap'].indexOf(e.k) < 0 || e.price == null) continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: e.k === 'sweep' ? COL.bolt : e.k === 'idm' ? COL.spent : COL.limit,
        transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.set(0.55, 0.55, 1);
      s.position.set(this.xAt(e.t - B.s), this.Y(e.price), 0.05);
      s.renderOrder = 6;
      this.tg.add(s);
      this.marks.push({ s, t: e.t });
    }
    this._lastT = null;
    this.update(B.t[0], 0, this.time);
  }

  _px(p) { return Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  _setBar(i, o, h, l, c, bright) {
    const m4 = this._m4 || (this._m4 = new THREE.Matrix4());
    const y0 = this.Y(Math.min(o, c)), y1 = this.Y(Math.max(o, c));
    const x = this.X(this.tr.B.step[i]);
    const bh = Math.max(0.025, y1 - y0);
    m4.makeScale(this.barW, bh, this.barW).setPosition(x, (y0 + y1) / 2, 0);
    this.bodies.setMatrixAt(i, m4);
    const wy0 = this.Y(l), wy1 = this.Y(h);
    m4.makeScale(this.barW * 0.16, Math.max(0.02, wy1 - wy0), this.barW * 0.16).setPosition(x, (wy0 + wy1) / 2, 0);
    this.wicks.setMatrixAt(i, m4);
    const col = (this._c || (this._c = new THREE.Color())).copy(c >= o ? COL.up : COL.down).multiplyScalar(bright);
    this.bodies.setColorAt(i, col);
    this.wicks.setColorAt(i, col);
  }

  _hideBar(i) {
    const m4 = this._z || (this._z = new THREE.Matrix4().makeScale(0, 0, 0));
    this.bodies.setMatrixAt(i, m4);
    this.wicks.setMatrixAt(i, m4);
  }

  /** persistent state at market time T (+ the wall-clock animation of the effects) */
  update(T, dt, wall) {
    const tr = this.tr;
    if (!tr) return;
    this.time = wall;
    const B = tr.B;
    const st = barsAt(tr, T);
    const n = B.n;
    const brightOf = (i) => (this.inTrade(i) ? 1.25 : B.t[i] + B.s <= tr.entry.t ? 0.72 : 0.5);
    // closed bars: (re)draw only what changed since the last frame
    if (st.done !== this.shown) {
      const a = Math.min(Math.max(this.shown, 0), st.done);
      for (let i = a; i < n; i++) {
        if (i < st.done) this._setBar(i, B.o[i], B.h[i], B.l[i], B.c[i], brightOf(i));
        else this._hideBar(i);
      }
      this.shown = st.done;
    }
    let price = st.done > 0 ? B.c[st.done - 1] : B.o[0];
    let headStep = st.done > 0 ? B.step[st.done - 1] + 1 : 0;
    if (st.forming >= 0) {
      const f = formingBar(tr, st.forming, st.frac);
      this._setBar(st.forming, f.o, f.h, f.l, f.c, brightOf(st.forming) * 1.35);
      price = f.c;
      headStep = B.step[st.forming] + st.frac;
      this._formingI = st.forming;
    } else if (this._formingI != null && this._formingI >= st.done) {
      this._hideBar(this._formingI);
      this._formingI = null;
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wicks.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.wicks.instanceColor) this.wicks.instanceColor.needsUpdate = true;
    const hx = this.X(headStep), hy = this.Y(price);
    this.head = { x: hx, y: hy, price, step: headStep };
    const ahead = hx + 1.4;
    // levels: appear when known, flare when swept, then dim ("spent")
    for (const L of this.levels) {
      const on = T >= L.known;
      L.m.visible = L.label.visible = on;
      if (!on) continue;
      const x0 = this.xAt(L.known);
      const len = Math.max(0.01, Math.min(ahead, this.X(B.step[n - 1] + 2)) - x0);
      L.m.scale.x = len;
      const u = L.m.material.uniforms;
      u.uLen.value = len;
      const since = T - L.swept;
      if (since >= 0) {
        u.uColor.value.copy(COL.spent);
        u.uI.value = 0.55 + 1.8 * Math.exp(-since / 240);
      } else {
        u.uColor.value.copy(COL.level);
        u.uI.value = 1;
      }
      u.uTime.value = wall;
    }
    if (this.limit) {
      const L = this.limit, on = T >= L.t && T < tr.exit.t_end;
      L.m.visible = on;
      if (on) {
        const len = Math.max(0.01, this.xAt(Math.min(T, L.end)) - this.xAt(L.t) + 0.2);
        L.m.scale.x = len;
        L.m.material.uniforms.uLen.value = len;
        L.m.material.uniforms.uI.value = T > L.end ? 0.35 : 0.9;
      }
    }
    // the plan: entry line, stop force field, target plane + gate (from the fill to the exit)
    const inPlay = T >= tr.entry.t;
    const xE = this.xAt(tr.entry.t);
    const xEnd = T >= tr.exit.t_end ? this.xAt(tr.exit.t_end) : ahead;
    const len = Math.max(0.01, xEnd - xE + 0.6);
    const stop = stopAt(tr, T);
    const isBe = stop !== tr.stop;
    const near = inPlay && T < tr.exit.t_end ? Math.max(0, 1 - Math.abs(price - stop) / Math.max(1e-6, tr.risk_pts * 0.35)) : 0;
    const done = T >= tr.exit.t_end;
    for (const [m, y, mode] of [[this.entryPlane, tr.entry.px, 0], [this.stopPlane, stop, 1], [this.targetPlane, tr.target, 2]]) {
      m.visible = inPlay;
      if (!inPlay) continue;
      m.position.set(xE - 0.3, this.Y(y), 0);
      m.scale.x = len;
      const u = m.material.uniforms;
      u.uLen.value = len;
      u.uTime.value = wall;
      u.uI.value = done ? 0.45 : mode === 1 ? 0.9 + near * 1.6 + 0.25 * Math.sin(wall * 9) * near : mode === 2 ? 1.0 : 0.7;
    }
    this.stopPlane.material.uniforms.uColor.value.copy(isBe ? COL.be : COL.stop);
    for (const [s, y] of [[this.stopLabel, stop], [this.targetLabel, tr.target], [this.entryLabel, tr.entry.px]]) {
      s.visible = inPlay;
      s.position.set(xEnd + 0.25, this.Y(y) + 0.06, 0.3);
    }
    const gate = this.gate;
    gate.visible = inPlay && !(done && tr.exit.kind === 'TARGET');
    gate.position.set(Math.min(ahead + 1.2, done ? xEnd : Infinity), this.Y(tr.target), 0);
    const red = this.reduced ? 0.2 : 1;
    gate.userData.r1.rotation.y = wall * 0.6 * red;
    gate.userData.r2.rotation.x = wall * 0.9 * red;
    gate.userData.halo.material.opacity = 0.35 + 0.2 * Math.sin(wall * 2);
    for (const mk of this.marks) mk.s.visible = T >= mk.t;
    // the R ruler and the live P&L tag
    for (const r of this.rungs) r.s.visible = inPlay;
    const pnl = inPlay ? tr.d * (done ? tr.exit.px - tr.entry.px : price - tr.entry.px) : 0, rr = tr.risk_pts ? pnl / tr.risk_pts : 0;
    this.pnlTag.visible = inPlay;
    if (inPlay) {
      const usd = pnl * 2 * (tr.qty || 1);
      this.pnlTag.userData.set(`${rr >= 0 ? '+' : '−'}${Math.abs(rr).toFixed(1)}R · ${usd >= 0 ? '+' : '−'}$${Math.round(Math.abs(usd)).toLocaleString('en-US')}`, rr >= 0 ? '#a3b36a' : '#ff6b7f');
      this.pnlTag.position.set(done ? xEnd + 0.25 : hx + 0.5, (done ? this.Y(tr.exit.px) : hy) + 0.55, 0.4);
    }
    // the room follows the action
    this.floorMat.uniforms.uHeadX.value = hx;
    // the floor follows the action: just under the recent lows (and the stop / entry while in the trade), so the glass
    // pillars always stand on their reflection
    // the floor sits just under the lowest price printed so far (and the stop while in the trade): no bar ever stands
    // below it, and it never hints at a low that has not happened yet
    const iLast = st.forming >= 0 ? st.forming : st.done - 1;
    let low = iLast >= 0 ? this.runLow[iLast] : B.l[0];
    if (st.forming >= 0) low = Math.min(st.forming > 0 ? this.runLow[st.forming - 1] : Infinity, price, formingBar(tr, st.forming, st.frac).l);
    if (inPlay && !done) low = Math.min(low, stop, tr.entry.px, tr.target); // the plan is known at the fill: the gate stands on the floor
    const fy = this.Y(low) - 0.55;
    const jump = this._lastT == null || Math.abs(T - this._lastT) > 900; // a scrub: no glide
    this._lastT = T;
    if (this.floorY == null || jump) this.floorY = fy;
    else this.floorY += (fy - this.floorY) * (1 - Math.exp(-Math.min(dt, 0.1) * (fy < this.floorY ? 9 : 1.2)));
    this.floor.position.y = this.floorY;
    this.mirror.position.y = 2 * this.floorY;
    this.floorMat.uniforms.uTint.value.copy(inPlay && !done ? (tr.d * (price - tr.entry.px) >= 0 ? COL.win : COL.loss) : COL.level).multiplyScalar(0.6);
    this.curtain.position.set(hx + this.barW * 0.6, this.floorY, 0);
    this.curtain.scale.set(1, Math.max(hy - this.floorY + 3, 4), 1);
    this.curtain.visible = T < tr.exit.t_end;
    this.sky.position.set(hx * 0.6, this.floorY + 60, -600);
    this.dust.position.y = this.floorY;
    this.shafts.position.set(hx * 0.85, this.floorY, 0);
    this._effects(dt, wall);
    if (this.arena) this.arena.update(this.cam ? this.cam.position.x * 0.92 : hx * 0.6, this.floorY, this.head, inPlay && !done ? (tr.d * (price - tr.entry.px) >= 0 ? COL.win : COL.loss) : COL.level, this.flash, wall);
  }

  _effects(dt, wall) {
    this.flash = Math.max(0, this.flash - dt * 2.6);
    const f = this.reduced ? Math.min(this.flash, 0.15) : this.flash;
    if (this.pillarMat) { this.pillarMat.uniforms.uFlash.value = f * 0.8; this.pillarMat.uniforms.uTime.value = wall; }
    this.floorMat.uniforms.uFlash.value = f;
    this.skyMat.uniforms.uTime.value = wall;
    this.shaftMat.uniforms.uTime.value = wall;
    this.curtainMat.uniforms.uTime.value = wall;
    // dust drifts and wraps around the head
    if (this.dust.visible && this.head) {
      const p = this.dust.geometry.attributes.position, a = p.array, hx = this.head.x;
      for (let i = 0; i < this.dustN; i++) {
        a[i * 3] += dt * 0.12; a[i * 3 + 1] += Math.sin(wall * 0.5 + i) * dt * 0.05;
        if (a[i * 3] < hx - 16) a[i * 3] += 30; else if (a[i * 3] > hx + 14) a[i * 3] -= 30;
      }
      p.needsUpdate = true;
    }
    this.fx = this.fx.filter((e) => { const alive = e.update(dt); if (!alive && e.dispose) e.dispose(); return alive; });
    for (const [src, m] of this.mirrors) {
      // a thing under the floor has no reflection (its mirror image would float above the floor)
      m.visible = src.visible && this.mirror.visible && (src.isInstancedMesh || src.position.y >= this.floorY);
      m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
      if (src.isInstancedMesh) m.count = src.count;
    }
  }

  // ------------------------------------------------------------ one-off effects (forward play only)
  fire(e) {
    if (!this.tr) return;
    const tr = this.tr;
    if (e.k === 'sweep') return this._bolt(e);
    if (e.k === 'entry') return this._flare(this.pos(tr.entry.t, tr.entry.px), COL.entry, 1);
    if (e.k === 'cisd5' || e.k === 'cisd1' || e.k === 'disp') {
      const p = this.pos(e.t - tr.B.s, e.price != null ? e.price : this.head.price);
      return this._ring(p, COL.limit, 0.9);
    }
    if (e.k === 'be') return this._ring(this.pos(e.t, stopAt(tr, e.t)), COL.be, 1.2);
    if (e.k === 'exit') {
      const c = e.outcome === 'win' ? COL.win : e.outcome === 'loss' ? COL.loss : COL.bev;
      const p = this.pos(tr.exit.t, tr.exit.px);
      this._burst(p, c);
      this._ring(p, c, 2.4);
      this.flash = this.reduced ? 0.1 : 0.9;
      if (e.outcome === 'win' && tr.exit.kind === 'TARGET') this._burst(this.gate.position.clone(), COL.gold, 0.6);
    }
  }

  _bolt(e) {
    const tr = this.tr;
    const p = this.pos(e.t - tr.B.s * 0.5, e.price != null ? e.price : this.head.price);
    const top = new THREE.Vector3(p.x + (Math.random() - 0.5) * 3, this.Y(tr.hi) + 7, -1.5);
    const mkBolt = (a, b, width, depth) => {
      const pts = [a.clone(), b.clone()];
      for (let d = 0; d < depth; d++) {
        const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const m = pts[i - 1].clone().lerp(pts[i], 0.5);
          const len = pts[i - 1].distanceTo(pts[i]);
          m.x += (Math.random() - 0.5) * len * 0.35; m.z += (Math.random() - 0.5) * len * 0.2;
          out.push(m, pts[i]);
        }
        pts.splice(0, pts.length, ...out);
      }
      const pos = [];
      for (let i = 1; i < pts.length; i++) {
        const a0 = pts[i - 1], b0 = pts[i], w0 = width * (1 - i / pts.length * 0.6);
        pos.push(a0.x - w0, a0.y, a0.z, a0.x + w0, a0.y, a0.z, b0.x + w0, b0.y, b0.z, a0.x - w0, a0.y, a0.z, b0.x + w0, b0.y, b0.z, b0.x - w0, b0.y, b0.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return { g, pts };
    };
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: COL.bolt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const main = mkBolt(top, p, 0.05, this.lite ? 4 : 5);
    group.add(new THREE.Mesh(main.g, mat));
    if (!this.lite) {
      for (let b = 0; b < 2; b++) {
        const from = main.pts[Math.floor(main.pts.length * (0.3 + b * 0.25))];
        const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, -1.5 - Math.random() * 2, (Math.random() - 0.5)));
        group.add(new THREE.Mesh(mkBolt(from, to, 0.025, 3).g, mat));
      }
    }
    group.renderOrder = 9;
    const hit = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: COL.bolt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    hit.position.copy(p);
    hit.scale.set(2.2, 2.2, 1);
    group.add(hit);
    this.stage.add(group);
    this.flash = this.reduced ? 0.12 : 0.75;
    let life = this.reduced ? 0.35 : 0.65;
    const total = life;
    this.fx.push({
      update: (dt) => {
        life -= dt;
        const k = Math.max(0, life / total);
        const flick = this.reduced ? 1 : (Math.random() > 0.25 ? 1 : 0.25);
        mat.opacity = k * flick;
        hit.material.opacity = k;
        hit.scale.setScalar(2.2 + (1 - k) * 2);
        return life > 0;
      },
      dispose: () => { this.stage.remove(group); group.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); mat.dispose(); hit.material.dispose(); },
    });
  }

  _flare(p, color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(p); streak.position.copy(p);
    s.renderOrder = streak.renderOrder = 9;
    this.stage.add(s, streak);
    let t = 0;
    const T = this.reduced ? 0.8 : 1.6;
    this.flash = Math.max(this.flash, this.reduced ? 0.08 : 0.45);
    this.fx.push({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / T);
        const pop = Math.sin(Math.min(1, t / 0.25) * Math.PI * 0.5);
        s.scale.setScalar((0.6 + 2.6 * pop) * size * (1 - k * 0.6));
        streak.scale.set((7 * pop) * size * (1 - k), 0.22 * size, 1);
        s.material.opacity = streak.material.opacity = 1 - k;
        return t < T;
      },
      dispose: () => { this.stage.remove(s, streak); s.material.dispose(); streak.material.dispose(); },
    });
  }

  _ring(p, color, size) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p);
    m.renderOrder = 9;
    this.stage.add(m);
    let t = 0;
    const T = 1.1;
    this.fx.push({
      update: (dt) => { t += dt; const k = t / T; m.scale.setScalar(0.1 + k * size); m.material.opacity = Math.max(0, 1 - k); return t < T; },
      dispose: () => { this.stage.remove(m); m.geometry.dispose(); m.material.dispose(); },
    });
  }

  _burst(p, color, scale) {
    const N = this.lite ? 140 : 460;
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const sc = scale || 1;
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = (1.5 + Math.random() * 5) * sc;
      vel[i * 3] = r * Math.cos(th) * sp; vel[i * 3 + 1] = u * sp + 1.2; vel[i * 3 + 2] = r * Math.sin(th) * sp;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.16, map: this.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, mat);
    pts.renderOrder = 9;
    pts.frustumCulled = false;
    this.stage.add(pts);
    let t = 0;
    const T = this.reduced ? 1.2 : 2.6;
    const slow = this.reduced ? 0.25 : 1;
    this.fx.push({
      update: (dt) => {
        t += dt;
        const a = g.attributes.position.array;
        const drag = Math.pow(0.12, dt);
        for (let i = 0; i < N; i++) {
          vel[i * 3] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag - 1.6 * dt; vel[i * 3 + 2] *= drag;
          a[i * 3] += vel[i * 3] * dt * slow; a[i * 3 + 1] += vel[i * 3 + 1] * dt * slow; a[i * 3 + 2] += vel[i * 3 + 2] * dt * slow;
        }
        g.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, 1 - t / T);
        return t < T;
      },
      dispose: () => { this.stage.remove(pts); g.dispose(); mat.dispose(); },
    });
  }

  render(camera) {
    this.rc.render();
  }

  /** the trade's extents in world units (for the director's framing) */
  bounds(T) {
    const tr = this.tr;
    const st = barsAt(tr, T);
    const i1 = Math.max(0, (st.forming >= 0 ? st.forming : st.done - 1));
    return {
      x0: 0, x1: this.X(tr.B.step[tr.B.n - 1] + 1), xHead: this.head ? this.head.x : 0,
      yLo: this.Y(tr.lo), yHi: this.Y(tr.hi), yEntry: this.Y(tr.entry.px), yStop: this.Y(tr.stop), yTarget: this.Y(tr.target),
      xEntry: this.xAt(tr.entry.t), xExit: this.xAt(tr.exit.t), headI: i1, events: eventsUpTo(tr, T), price: priceAt(tr, T),
      local: (nBars) => this.localRange(i1, nBars), floorY: this.floorY == null ? 0 : this.floorY,
    };
  }

  /** world y range of the last nBars bars up to bar i1 (the camera frames the action, not the whole day) */
  localRange(i1, nBars) {
    const B = this.tr.B;
    let lo = Infinity, hi = -Infinity;
    for (let i = Math.max(0, i1 - nBars); i <= i1; i++) { if (B.l[i] < lo) lo = B.l[i]; if (B.h[i] > hi) hi = B.h[i]; }
    if (this.head) { lo = Math.min(lo, this.head.price); hi = Math.max(hi, this.head.price); }
    return { yLo: this.Y(lo), yHi: this.Y(hi) };
  }
}
