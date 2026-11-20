// Neon signage (v3): every district gets two tall neon boards on poles at its edge (one facing the plaza, one facing out) with its name
// in tube lettering in the district's colour, a frame, a few flickering letters; the Harbor and the Strategies too. ONE texture atlas
// (a canvas, one row per district), ONE instanced draw for all boards, ONE instanced draw for the poles. Text goes in as canvas text, never HTML.
import * as THREE from '../jarvis/three.module.min.js';
import { FOG } from './shaders.js?v=dcgfx12';
import { pick } from './skyline.js?v=dcgfx16';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const ROW_W = 640, ROW_H = 100;

const VS = `
attribute vec4 aRect; attribute vec4 aTint;
varying vec2 vUv; varying vec4 vTint; varying float vFD;
void main(){
  vUv = uv * aRect.zw + aRect.xy; vTint = aTint;
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); vFD = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uMap; uniform float uTime; uniform float uDay;
varying vec2 vUv; varying vec4 vTint; varying float vFD;
${FOG}
void main(){
  vec4 t = texture2D(uMap, vUv);
  // a tube that flickers: a slow breath, and now and then a short stutter (the seed decides who)
  float breathe = 0.82 + 0.18 * sin(uTime * 2.0 + vTint.w * 40.0);
  float stutter = 1.0 - 0.75 * step(0.985, fract(sin(floor(uTime * 9.0 + vTint.w * 100.0) * 12.9898) * 43758.5453)) * step(0.55, vTint.w);
  vec3 c = t.rgb * breathe * stutter * mix(1.6, 0.8, uDay);
  float a = t.a * (0.9 + 0.1 * breathe);
  c = mix(c, uFog * a, clamp(fogAmount(vFD, 8.0) * 0.8, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0) * step(0.02, a);
  gl_FragColor.rgb *= 1.0;
}`;

function drawRow(g, y, text, color) {
  g.clearRect(0, y, ROW_W, ROW_H);
  g.save();
  g.translate(0, y);
  g.fillStyle = 'rgba(4,6,16,0.78)';
  g.beginPath(); g.roundRect ? g.roundRect(14, 14, ROW_W - 28, ROW_H - 28, 22) : g.rect(14, 14, ROW_W - 28, ROW_H - 28); g.fill();
  g.lineWidth = 5; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 18;               // the tube frame
  g.beginPath(); g.roundRect ? g.roundRect(14, 14, ROW_W - 28, ROW_H - 28, 22) : g.rect(14, 14, ROW_W - 28, ROW_H - 28); g.stroke();
  g.font = (NEON ? '800 50px Orbitron, Rajdhani, -apple-system, system-ui, sans-serif' : '800 50px Georgia, Georgia, -apple-system, system-ui, sans-serif'); g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = text.split('').join(String.fromCharCode(8202));
  let size = 50;
  while (g.measureText(label).width > ROW_W - 80 && size > 20) { size -= 3; g.font = `800 ${size}px ${NEON ? 'Orbitron, Rajdhani' : 'Georgia, Georgia'}, -apple-system, system-ui, sans-serif`; }
  g.shadowBlur = 20; g.fillStyle = color; g.fillText(label, ROW_W / 2, ROW_H / 2 + 4);          // coloured glow
  g.shadowBlur = 0; g.lineWidth = 1.6; g.strokeStyle = '#ffffff'; g.strokeText(label, ROW_W / 2, ROW_H / 2 + 4);   // the hot white core of the tube
  g.restore();
}

export class Signs {
  /** L: layout(); U: the scene uniforms. Two boards per district (plaza side, outer side) at its edge. */
  constructor(L, U, caps) {
    const ds = L.districts, rows = ds.length + 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width = ROW_W; this.canvas.height = ROW_H * rows;
    this.g = this.canvas.getContext('2d');
    this.names = ds.map((d) => [d.name, d.css || (NEON ? '#e9ecf6' : '#b2cadc')]).concat([['DATA CITY', (NEON ? '#7fe9ff' : '#daa56f')]]);
    this.names.forEach(([t, c], i) => drawRow(this.g, i * ROW_H, t, c));
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const boards = [];
    ds.forEach((d, i) => {
      const len = Math.hypot(d.cx, d.cz) || 1, ux = d.cx / len, uz = d.cz / len, edge = d.half / (Math.max(Math.abs(ux), Math.abs(uz)) || 1) + 3;      // where the ray from the plaza leaves the district's square
      const w = Math.max(14, Math.min(34, (d.wide ? 30 : d.half * 0.9)));
      const h = w * (ROW_H / ROW_W) * 1.0;
      const y = d.kind === 'harbor' ? 12 : 9 + Math.min(14, d.half * 0.18);
      const base = d.kind === 'harbor' ? [d.cx, d.cz - (d.half + 3)] : [d.cx - ux * edge, d.cz - uz * edge];     // the plaza side
      const out = d.kind === 'harbor' ? [d.cx, d.cz + d.half + 3] : [d.cx + ux * edge, d.cz + uz * edge];       // the outer side
      const faceIn = Math.atan2(-uz, -ux), faceOut = Math.atan2(uz, ux);
      boards.push({ x: base[0], y, z: base[1], ry: d.kind === 'harbor' ? Math.PI / 2 : -faceIn + Math.PI / 2, w, h, row: i, seed: (i * 0.37) % 1 });
      if ((caps?.signs ?? 2) >= 2) boards.push({ x: out[0], y, z: out[1], ry: d.kind === 'harbor' ? -Math.PI / 2 : -faceOut + Math.PI / 2, w, h, row: i, seed: (i * 0.61 + 0.3) % 1 });
    });
    const n = boards.length, rect = new Float32Array(n * 4), tint = new Float32Array(n * 4);
    const geo = new THREE.PlaneGeometry(1, 1), inst = new THREE.InstancedBufferGeometry();
    inst.index = geo.index;
    for (const k of ['position', 'uv']) inst.setAttribute(k, geo.getAttribute(k));
    this.mesh = new THREE.InstancedMesh(inst, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, uniforms: { ...pick(U, 'uTime', 'uDay', 'uFog', 'uFogD', 'uHaze'), uMap: { value: this.tex } } }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1, 0.5).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ color: (NEON ? 0x1b2140 : 0x416c8e) }), n * 2);
    boards.forEach((b, i) => {
      rect.set([0, 1 - (b.row + 1) / rows, 1, 1 / rows], i * 4);
      tint.set([1, 1, 1, b.seed], i * 4);
      q.setFromAxisAngle(up, b.ry);
      m4.compose(new THREE.Vector3(b.x, b.y + b.h / 2, b.z), q, new THREE.Vector3(b.w, b.h, 1));
      this.mesh.setMatrixAt(i, m4);
      for (const s of [-0.38, 0.38]) {                                                   // two poles under each board
        const off = new THREE.Vector3(s * b.w, 0, 0).applyQuaternion(q);
        m4.compose(new THREE.Vector3(b.x + off.x, 0, b.z + off.z), new THREE.Quaternion(), new THREE.Vector3(1, b.y + b.h * 0.2, 1));
        poles.setMatrixAt(i * 2 + (s < 0 ? 0 : 1), m4);
      }
    });
    inst.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
    inst.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 4));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    poles.frustumCulled = false; poles.renderOrder = 2;
    this.group = new THREE.Group();
    this.group.add(poles, this.mesh);
    this.poles = poles;
    this.boards = boards;
  }

  /** the HUD fonts (Georgia / Georgia) arrived: draw the lettering again */
  refresh() {
    this.names.forEach(([t, c], i) => drawRow(this.g, i * ROW_H, t, c));
    this.tex.needsUpdate = true;
  }
}
