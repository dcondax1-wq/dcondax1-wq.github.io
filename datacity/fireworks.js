// Fireworks (v3): when a gold idea appears (it holds in 2026, in 2021-25 and in every year, and passes the noise guard) the city celebrates:
// shells climb from the ground, burst over the building, and the sparks fall. ONE draw call (GPU points, up to 8 shells at once, every motion
// in the vertex shader). launch(x, y, z, colour) is the only verb; the burst height is where the sparks open (a gold tower's roof + 30).
// A rocket is one point climbing; a burst is 96 points on a sphere (some in a ring), colour fading from white-hot to the shell's colour to ember.
import * as THREE from '../jarvis/three.module.min.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const SHELLS = 8, PER = 112, LIFE = 4.4, RISE = 1.25;

const VS = `
attribute vec4 aDir; attribute vec2 aSeed;
uniform float uTime; uniform float uPR; uniform float uKeep; uniform vec4 uShell[${SHELLS}]; uniform vec4 uCol[${SHELLS}];
varying vec3 vC; varying float vA;
void main(){
  int si = int(aDir.w + 0.5);
  vec4 S = uShell[si]; vec4 C = uCol[si];
  float age = uTime - S.w;
  vec3 p = S.xyz; float size = 0.0; vA = 0.0;
  bool rocket = aSeed.x < 0.0;
  if (C.w > 0.5 && age > 0.0 && age < ${LIFE.toFixed(1)}) {
    if (rocket) {
      float k = clamp(age / ${RISE.toFixed(2)}, 0.0, 1.0);
      p = vec3(S.x, mix(0.0, S.y, 1.0 - (1.0 - k) * (1.0 - k)), S.z);
      if (age < ${RISE.toFixed(2)}) { size = 12.0; vA = 1.0; vC = vec3(1.0, 0.85, 0.5); }
    } else if (age > ${RISE.toFixed(2)}) {
      float a = age - ${RISE.toFixed(2)};
      float sp = 34.0 + 34.0 * aSeed.x;
      float burst = 1.0 - exp(-a * 2.4);
      p = S.xyz + aDir.xyz * sp * burst / 2.4 * 1.0;
      p.y -= 2.4 * a * a;                                       // the sparks fall
      float life = a / ${(LIFE - RISE).toFixed(2)};
      vA = (1.0 - life) * (1.0 - life) * (0.7 + 0.3 * sin(a * 40.0 + aSeed.y * 30.0));
      vC = mix(vec3(1.0, 0.95, 0.8), C.rgb, smoothstep(0.0, 0.18, life));
      vC = mix(vC, vec3(1.0, 0.35, 0.1), smoothstep(0.55, 1.0, life));
      size = (10.0 + 7.0 * aSeed.y) * (1.0 - 0.45 * life) * step(aSeed.y, uKeep);        // a phone keeps only part of the sparks
    }
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = size * uPR * (260.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec3 vC; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = (exp(-r * r * 18.0) + 0.4 * exp(-r * r * 70.0)) * vA;
  if (a < 0.004) discard; gl_FragColor = vec4(vC * a * 2.2, 1.0); }`;

export class Fireworks {
  constructor() {
    const n = SHELLS * PER, dir = new Float32Array(n * 4), seed = new Float32Array(n * 2), rnd = (() => { let s = 91; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let sh = 0; sh < SHELLS; sh++) {
      for (let k = 0; k < PER; k++) {
        const i = sh * PER + k;
        if (k === 0) { dir.set([0, 1, 0, sh], i * 4); seed.set([-1, 0], i * 2); continue; }                    // the rocket
        const ring = k % 5 === 0, u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const v = ring ? [Math.cos(a), 0.25 * u, Math.sin(a)] : [r * Math.cos(a), u, r * Math.sin(a)];
        dir.set([...v, sh], i * 4); seed.set([rnd(), rnd()], i * 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 4));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    this.uShell = Array.from({ length: SHELLS }, () => new THREE.Vector4(0, 0, 0, -99));
    this.uCol = Array.from({ length: SHELLS }, () => new THREE.Vector4(1, 0.8, 0.3, 0));
    this.cap = SHELLS;
    this.U = { uTime: { value: 0 }, uPR: { value: 1 }, uKeep: { value: 1 }, uShell: { value: this.uShell }, uCol: { value: this.uCol } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.U, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; this.points.renderOrder = 9;
    this.t = 0; this.next = 0; this.launched = 0; this.pending = [];
  }

  /** a shell bursting at (x, y, z) in a colour (a hex number); delay seconds from now */
  launch(x, y, z, color = (NEON ? 0xffc94a : 0xd39556), delay = 0) {
    this.pending.push({ at: this.t + delay, x, y, z, color });
    this.launched++;
    this.pump();
  }

  /** caps.shells shells at once, caps.spark of the sparks (a phone: 3 and half) */
  setQuality(q, caps) { this.cap = Math.max(1, Math.min(SHELLS, caps?.shells ?? SHELLS)); this.U.uKeep.value = caps?.spark ?? 1; }

  pump() {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.at > this.t) continue;
      this.pending.splice(i, 1);
      const k = this.next++ % this.cap, c = new THREE.Color(p.color);
      this.uShell[k].set(p.x, p.y, p.z, this.t);
      this.uCol[k].set(c.r, c.g, c.b, 1);
    }
  }

  /** shells in the air or waiting (for the HUD and the tests) */
  get active() { return this.uShell.filter((s, i) => this.uCol[i].w > 0.5 && this.t - s.w < LIFE).length + this.pending.length; }

  update(dt, pr) {
    this.t += dt;
    this.U.uTime.value = this.t;
    this.U.uPR.value = pr;
    this.pump();
    this.points.visible = this.active > 0;
  }
}
