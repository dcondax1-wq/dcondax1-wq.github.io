// The link between two compared ideas (v3): an arc from one roof to the other, gold at A and terracotta at B.
// One LineSegments (48 segments) + one point sprite pair, 2 draw calls, hidden until set(a, b).
import * as THREE from '../jarvis/three.module.min.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const SEG = 48;
const VS = `attribute float aT; uniform float uTime; varying float vT; varying float vA;
void main(){ vT = aT; vA = 0.55 + 0.45 * step(0.5, fract(aT * 14.0 - uTime * 1.2)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `varying float vT; varying float vA; void main(){ vec3 c = mix(vec3(${NEON ? '0.25' : '0.78'}, ${NEON ? '0.9' : '0.64'}, ${NEON ? '1.0' : '0.29'}), vec3(${NEON ? '0.72' : '0.79'}, ${NEON ? '0.55' : '0.42'}, ${NEON ? '1.0' : '0.29'}), vT); gl_FragColor = vec4(c * vA * ${NEON ? '1.6' : '1.0'}, 1.0); }`;

export class Link {
  constructor() {
    const t = new Float32Array(SEG * 2);
    for (let s = 0; s < SEG; s++) { t[s * 2] = s / SEG; t[s * 2 + 1] = (s + 1) / SEG; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 6), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    this.u = { uTime: { value: 0 } };
    this.line = new THREE.LineSegments(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.u, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending }));
    this.line.frustumCulled = false; this.line.renderOrder = 8; this.line.visible = false;
    this.on = false;
  }

  /** a, b: { x, z, h } of the two buildings */
  set(a, b) {
    const A = new THREE.Vector3(a.x, a.h + 1.5, a.z), B = new THREE.Vector3(b.x, b.h + 1.5, b.z), d = A.distanceTo(B);
    const C = A.clone().add(B).multiplyScalar(0.5);
    C.y += Math.max(14, d * 0.35);
    const p = this.line.geometry.getAttribute('position'), q = new THREE.Vector3();
    const at = (t) => q.copy(A).multiplyScalar((1 - t) * (1 - t)).addScaledVector(C, 2 * (1 - t) * t).addScaledVector(B, t * t).clone();
    for (let s = 0; s < SEG; s++) { const u = at(s / SEG), v = at((s + 1) / SEG); p.array.set([u.x, u.y, u.z, v.x, v.y, v.z], s * 6); }
    p.needsUpdate = true;
    this.line.visible = this.on = true;
  }

  hide() { this.line.visible = this.on = false; }
  update(t) { this.u.uTime.value = t; }
}
