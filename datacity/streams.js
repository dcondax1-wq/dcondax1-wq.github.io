// Data streams: glowing arcs between the districts, the plaza (LIT), the harbor and the temple, with pulses of light running
// along them. Research flows district -> gate -> LIT's tower; LIT's trades flow tower -> harbor; the temple's oracle feeds the
// tower; neighbouring districts trade confluences. The pulses are computed on the GPU (a quadratic Bezier per pulse): two draw
// calls for the whole web. The market drives the pulse speed (uFlow: the VIX, and slower while the futures market is closed).
import * as THREE from '../jarvis/three.module.min.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const SEG = 44;
const PULSES = { hq: 34, lq: 11 };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const VS = `
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec3 aColor;
uniform float uTime; uniform float uPR; uniform float uFlow;
varying vec3 vColor; varying float vA;
void main(){
  float t = fract(aA.w + uTime * aB.w * 0.05 * uFlow);
  vec3 p = mix(mix(aA.xyz, aB.xyz, t), mix(aB.xyz, aC.xyz, t), t);
  float head = sin(3.14159 * t);
  vColor = aColor; vA = 0.35 + 0.65 * head;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aC.w * uPR * (0.6 + 0.8 * head) * (140.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec3 vColor; varying float vA; uniform float uDay;
void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d, d) * 14.0) * vA;
  gl_FragColor = vec4(vColor * a * mix(1.9, 0.9, uDay), 1.0); }`;
const LVS = `attribute vec3 aColor; varying vec3 vColor; void main(){ vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LFS = `varying vec3 vColor; uniform float uDay; void main(){ gl_FragColor = vec4(vColor * mix(0.5, 0.2, uDay), 1.0); }`;

export class Streams {
  /** L: layout(); lm: Landmarks (gate / temple positions); U: the scene uniforms (uTime, uPR, uDay, uFlow); quality */
  constructor(L, lm, U, quality) {
    const rnd = mulberry(11), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const ds = L.districts.filter((d) => d.kind !== 'harbor').slice().sort((a, b) => Math.atan2(a.cz, a.cx) - Math.atan2(b.cz, b.cx));
    const tower = V(0, 47, 0), arcs = [];
    ds.forEach((d, i) => {
      const g = lm.spots['gate:' + d.key], from = g ? V(g.x, 13, g.z) : V(d.cx, 16, d.cz);
      arcs.push({ a: from, c: V(from.x * 0.45, 62 + (i % 3) * 14, from.z * 0.45), b: tower, col: d.color, speed: 1, dir: 1 });
      const n = ds[(i + 1) % ds.length], g2 = lm.spots['gate:' + n.key];
      if (g && g2) arcs.push({ a: V(g.x, 13, g.z), c: V((g.x + g2.x) / 2, 44 + rnd() * 16, (g.z + g2.z) / 2), b: V(g2.x, 13, g2.z), col: d.color, speed: 0.7, dir: 1 });
    });
    const hb = L.districts.find((d) => d.kind === 'harbor');
    if (hb) arcs.push({ a: tower, c: V(hb.cx * 0.5, 80, hb.cz * 0.5), b: V(hb.cx, 6, hb.cz), col: (NEON ? 0x39e59a : 0x9bab62), speed: 1.2, dir: 1, big: 1 });
    // A few bright trunk lines bring the satellite-town ring back to the central capital.
    // These are scenery-only routes; all research connections above stay data-derived.
    for (const town of (L.satellites?.towns || []).filter((_, i) => i % 6 === 0)) {
      const col = town.accent ? (NEON ? 0x39e59a : 0x9bab62) : (NEON ? 0x3fd8ff : 0xd39556);
      arcs.push({ a: V(town.x, 7, town.z), c: V(town.x * 0.46, 84 + (town.id % 3) * 7, town.z * 0.46), b: tower, col, speed: 0.72 + (town.id % 4) * 0.12, dir: 1, big: 1 });
    }
    const tp = lm.spots.temple;
    if (tp) arcs.push({ a: V(tp.x, tp.h, tp.z), c: V(tp.x * 0.5, 120, tp.z * 0.5), b: tower, col: (NEON ? 0xffc94a : 0xd39556), speed: 0.9, dir: 1, big: 1 });
    this.arcs = arcs;
    // the arc lines: static, one LineSegments draw
    const lp = [], lc = [], col = new THREE.Color(), q = new THREE.Vector3();
    for (const r of arcs) {
      col.setHex(r.col);
      for (let s = 0; s < SEG; s++) {
        for (const t of [s / SEG, (s + 1) / SEG]) {
          q.copy(r.a).multiplyScalar((1 - t) * (1 - t)).addScaledVector(r.c, 2 * (1 - t) * t).addScaledVector(r.b, t * t);
          lp.push(q.x, q.y, q.z); lc.push(col.r, col.g, col.b);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute('aColor', new THREE.Float32BufferAttribute(lc, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ vertexShader: LVS, fragmentShader: LFS, uniforms: { uDay: U.uDay },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 3;
    // the pulses
    const per = PULSES.hq, n = arcs.length * per;
    const A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 4), K = new Float32Array(n * 3);
    arcs.forEach((r, i) => {
      col.setHex(r.col);
      for (let k = 0; k < per; k++) {
        const j = i * per + k, sd = (k + rnd() * 0.6) / per;
        A.set([r.a.x, r.a.y, r.a.z, sd], j * 4); B.set([r.c.x, r.c.y, r.c.z, r.speed * (0.8 + rnd() * 0.5)], j * 4);
        C.set([r.b.x, r.b.y, r.b.z, r.big ? 5.5 : 3.6], j * 4); K.set([col.r, col.g, col.b], j * 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aA', new THREE.BufferAttribute(A, 4)); g.setAttribute('aB', new THREE.BufferAttribute(B, 4));
    g.setAttribute('aC', new THREE.BufferAttribute(C, 4)); g.setAttribute('aColor', new THREE.BufferAttribute(K, 3));
    this.per = per;
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS,
      uniforms: { uTime: U.uTime, uPR: U.uPR, uDay: U.uDay, uFlow: U.uFlow }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; this.points.renderOrder = 4;
    this.group = new THREE.Group(); this.group.add(this.lines, this.points);
    this.setQuality(quality);
  }

  /** lq: fewer pulses per arc (laid out arc by arc, so a draw range cannot thin each arc: the dropped ones get size 0) */
  setQuality(q, caps) {
    const keep = caps?.pulses ?? PULSES[q] ?? PULSES.hq, per = this.per, a = this.points.geometry.getAttribute('aC');
    for (let i = 0; i < this.arcs.length; i++) for (let k = 0; k < per; k++) a.array[(i * per + k) * 4 + 3] = k < keep ? (this.arcs[i].big ? 5.5 : 3.6) : 0;
    a.needsUpdate = true;
    this.pulses = keep * this.arcs.length;
  }
}
