// ORACLE arena (2026-11-03, docs/OLYMPUS_RENDER.md): the temple at Delphi under the price column, on the OLYMPUS render core.
//   - a polished marble floor that reflects the environment, the omphalos (the navel stone) with a gold ring where the column stands
//   - the MARKET RADAR set into the floor: range rings, spokes, a sweeping arm, and one blip per open LIT level (distance from the
//     centre = how far the level is from price, hot levels glow bigger; levels above price lie to the north, below to the south)
//   - a colonnade of marble columns with gold capitals and a gold entablature ring far behind the column, fading into the fog
// Draw calls: 9 (floor, radar, blips, columns, capitals, ring, omphalos 3). setWorld(w) when the data changes; frame(t) each frame.
import { heatRows } from './heat.js';
import { kindOf } from './glow.js';
import * as M from '../olympus/materials.js';
import { isPhone } from './polis.js?v=oracle-phone-budget-3';

const FLOOR_Y = -11.7;                              // under the column's foot (the column spans +/- 10.5)
const R_RADAR = 26, R_COL = 58, N_COL = 14;
const WIDE = { on: typeof window !== 'undefined' && window.innerWidth > 600 };
if (typeof window !== 'undefined') window.addEventListener('resize', () => { WIDE.on = window.innerWidth > 600; }, { passive: true });
const MAX_BLIPS = 24;

const RADAR_VS = 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RADAR_FS = `uniform vec3 uC; uniform float uSweep; uniform float uR; uniform float uOn; varying vec2 vP;
  void main(){
    float r = length(vP) / uR, a = atan(vP.y, vP.x);
    float ring = 0.0; for (int i = 1; i <= 5; i++) { float k = float(i) / 5.0; ring += smoothstep(0.012, 0.0, abs(r - k)) * (i == 5 ? 1.0 : 0.55); }
    float spoke = smoothstep(0.004, 0.0, abs(sin(a * 6.0)) * r) * 0.35 * step(0.04, r);
    float tick = smoothstep(0.008, 0.0, abs(r - 1.0)) * step(0.5, fract(a * 36.0 / 6.2832 + 0.5)) * 0.9;
    float d = mod(uSweep - a + 6.2832, 6.2832);                         // angle behind the arm
    float wedge = exp(-d * 3.2) * step(d, 2.4) * (0.35 + 0.65 * smoothstep(0.0, 1.0, r));
    float arm = smoothstep(0.02, 0.0, d) * 0.9 * step(r, 1.0);
    float edge = smoothstep(1.0, 0.8, r), core = exp(-r * r * 14.0) * 0.5;
    vec3 c = uC * ((ring + spoke + tick) * 0.5 + wedge * 0.55 + arm * 1.4 + core) * edge * uOn;
    gl_FragColor = vec4(c, 1.0);
  }`;
const BLIP_VS = `attribute float aHeat; attribute vec3 aCol; uniform float uSweep; uniform float uPx; varying vec3 vC; varying float vH;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
    float a = atan(-position.z, position.x), d = mod(uSweep - a + 6.2832, 6.2832);          // ping when the arm has just passed
    float ping = exp(-d * 2.2) * step(d, 3.0);
    vH = aHeat; vC = aCol * (0.5 + 1.8 * aHeat + 1.4 * ping);
    gl_PointSize = uPx * (7.0 + 20.0 * aHeat + 8.0 * ping) * 22.0 / max(8.0, -mv.z);
  }`;
const BLIP_FS = 'varying vec3 vC; varying float vH; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * (0.5 + 0.8 * smoothstep(0.2, 0.0, d)), 1.0); }';

export class Arena {
  constructor(T, scene, { quality = 'high', reduced = false } = {}) {
    this.T = T; this.reduced = reduced; this.world = null; this.blips = 0;
    const g = (this.g = new T.Group());
    g.name = 'arena';
    scene.add(g);
    const lite = quality === 'low';

    // the floor: polished dark marble, reflecting the night environment
    this.floor = new T.Mesh(new T.CircleGeometry(R_COL + 8, lite ? 48 : 96), M.marble({ color: '#262115', vein: '#907a46', gold: true, scale: 0.09, roughness: 0.2, clearcoat: 1, envMapIntensity: 0.9 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = FLOOR_Y;
    g.add(this.floor);

    // the market radar: additive disc + the level blips
    this.radarU = { uC: { value: new T.Color(0.35, 0.85, 1.0) }, uSweep: { value: 0 }, uR: { value: R_RADAR }, uOn: { value: 1 } };
    this.radar = new T.Mesh(new T.CircleGeometry(R_RADAR, 96), new T.ShaderMaterial({ uniforms: this.radarU, vertexShader: RADAR_VS, fragmentShader: RADAR_FS,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    this.radar.rotation.x = -Math.PI / 2; this.radar.position.y = FLOOR_Y + 0.03;
    g.add(this.radar);
    const bg = new T.BufferGeometry();
    bg.setAttribute('position', new T.BufferAttribute(new Float32Array(MAX_BLIPS * 3), 3));
    bg.setAttribute('aHeat', new T.BufferAttribute(new Float32Array(MAX_BLIPS), 1));
    bg.setAttribute('aCol', new T.BufferAttribute(new Float32Array(MAX_BLIPS * 3), 3));
    bg.setDrawRange(0, 0);
    this.blipU = { uSweep: this.radarU.uSweep, uPx: { value: 1 } };
    this.blipPts = new T.Points(bg, new T.ShaderMaterial({ uniforms: this.blipU, vertexShader: BLIP_VS, fragmentShader: BLIP_FS, transparent: true,
      depthWrite: false, blending: T.AdditiveBlending }));
    this.blipPts.frustumCulled = false; this.blipPts.position.y = FLOOR_Y + 0.06;
    g.add(this.blipPts);

    // the omphalos: the navel stone the column stands on, with a gold ring
    const stone = M.marble({ color: '#e4ded4', vein: '#706854', gold: true, scale: 0.9, roughness: 0.25 });
    const dome = new T.Mesh(new T.SphereGeometry(2.6, 32, isPhone() ? 8 : 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1), stone);
    dome.position.y = FLOOR_Y;
    const step = new T.Mesh(new T.CylinderGeometry(3.6, 3.9, 0.5, 48), stone);
    step.position.y = FLOOR_Y + 0.25;
    this.ring = new T.Mesh(new T.TorusGeometry(3.3, 0.07, 6, 96), M.neon({ color: '#ebb653', intensity: 3.2, fog: true }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = FLOOR_Y + 0.58;
    g.add(step, dome, this.ring);

    // the colonnade: marble shafts with gold capitals and bases, and a gold entablature ring
    const H = 24, shaftMat = M.marble({ color: '#eee7dd', vein: '#78663d', gold: true, scale: 0.18, roughness: 0.26 });
    this.shafts = new T.InstancedMesh(new T.CylinderGeometry(1.35, 1.6, H, lite ? 12 : 24, 1), shaftMat, N_COL);
    this.caps = new T.InstancedMesh(new T.BoxGeometry(4.2, 0.9, 4.2), M.metal({ kind: 'gold', roughness: 0.3 }), N_COL * 2);
    const at = new T.Object3D();
    for (let i = 0; i < N_COL; i++) {
      const a = (i / N_COL) * Math.PI * 2, x = Math.cos(a) * R_COL, z = Math.sin(a) * R_COL;
      at.position.set(x, FLOOR_Y + H / 2, z); at.rotation.set(0, 0, 0); at.updateMatrix(); this.shafts.setMatrixAt(i, at.matrix);
      at.position.set(x, FLOOR_Y + H + 0.45, z); at.updateMatrix(); this.caps.setMatrixAt(i * 2, at.matrix);
      at.position.set(x, FLOOR_Y + 0.45, z); at.updateMatrix(); this.caps.setMatrixAt(i * 2 + 1, at.matrix);
    }
    this.entab = new T.Mesh(new T.TorusGeometry(R_COL, 0.22, 8, 160), M.neon({ color: '#ebb653', intensity: 2.0, fog: true }));
    this.entab.rotation.x = Math.PI / 2; this.entab.position.y = FLOOR_Y + H + 1.1;
    g.add(this.shafts, this.caps, this.entab);

    // lights for the physical materials: a warm key (the temple's), and the price lamp (a point light on the comet)
    this.key = new T.DirectionalLight(0xebd4b1, 2.6); this.key.position.set(-18, 30, 22);
    this.lamp = new T.PointLight(0xebc775, 90, 70, 2); this.lamp.position.set(0, 0, 0);
    g.add(this.key, this.lamp);
  }

  setQuality(q) { this.lite = q === 'low'; this.radarU.uOn.value = 1; }

  /** the radar's blips: the open levels, hot first (the radius is how far from price, in ATR; above -> north, below -> south) */
  setWorld(w) {
    this.world = w;
    const rows = heatRows(w).slice(0, MAX_BLIPS), P = this.blipPts.geometry, pos = P.attributes.position, H = P.attributes.aHeat, C = P.attributes.aCol;
    const atr = Math.max(2, (w && w.atr) || 12);
    rows.forEach((r, i) => {
      const u = Math.min(1, Math.abs(r.dist) / (atr * 9)), rad = R_RADAR * (0.1 + 0.88 * Math.sqrt(u));
      const hash = (Math.sin(Math.abs(r.price) * 12.9898) * 43758.5453) % 1, spread = (Math.abs(hash) - 0.5) * 2.1;     // stable per level
      const a = (r.dist > 0 ? -Math.PI / 2 : Math.PI / 2) + spread;                                                       // north = -z
      pos.setXYZ(i, Math.cos(a) * rad, 0, Math.sin(a) * rad);
      H.setX(i, r.heat);
      const col = new this.T.Color(kindOf(r.kind).color);
      C.setXYZ(i, col.r, col.g, col.b);
    });
    P.setDrawRange(0, rows.length); this.blips = rows.length;
    pos.needsUpdate = H.needsUpdate = C.needsUpdate = true;
  }

  /** the lamp follows the comet; the radar arm sweeps once every 6 seconds */
  frame(t, cometPos, px) {
    // On narrow screens the distant crown projects as a bright stripe over price levels.
    // Keep the columns, and reveal the crown again on wider viewports.
    // (the width is read on a resize only: innerWidth read in the frame forced a layout every frame, 2 layouts a frame in the demo)
    this.entab.visible = WIDE.on;
    this.radarU.uSweep.value = this.reduced ? 1.2 : (t * (Math.PI * 2) / 6) % (Math.PI * 2);
    this.blipU.uPx.value = px || 1;
    if (cometPos) this.lamp.position.set(cometPos.x * 1.6, cometPos.y, cometPos.z * 1.6);
    this.ring.rotation.z = this.reduced ? 0 : t * 0.1;
  }

  /** a theme's accent: the radar, the lamp */
  applyTheme(accent) {
    if (!accent) return;
    this.radarU.uC.value.set(accent).multiplyScalar(1.1);
    this.lamp.color.set(accent);
  }
}
