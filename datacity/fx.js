// The Data City's effects, each one cheap and each one draw (or a few):
//   Rays        god-ray cones: LIT's sweeping searchlights + one sky beam per district (one instanced draw)
//   FogLayers   drifting fog planes at three heights (one on LITE)
//   Rain        streaks round the camera, as many as the VIX says (one draw); lightning in a storm (sky + fog flash)
//   Traffic     flying cars along splines baked into a float texture (one draw: headlights one way, tail lights back)
//   Beam        the search beam: a column of light onto the found / opened building, with a ring on the ground
//   Billboards  holographic boards round the plaza cycling the top discoveries (plain text drawn on a canvas)
import * as THREE from '../jarvis/three.module.min.js';
import * as SH from './shaders.js?v=dcgfx12';
import { pick } from './skyline.js?v=dcgfx15';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const CARS = { hq: 1500, lq: 420 };
const DROPS = { hq: 7000, lq: 1800 };
const PATH_SAMPLES = 128;

function rayGeo() {
  const g = new THREE.CylinderGeometry(1, 0.035, 1, 20, 1, true);
  g.translate(0, 0.5, 0);                         // narrow end at the light (y 0), wide end at y 1
  return g;
}

export class Rays {
  constructor(L, U) {
    const towerBeams = 4, n = towerBeams + L.districts.length;
    this.n = towerBeams;
    const geo = rayGeo(), color = new Float32Array(n * 3), alpha = new Float32Array(n), c = new THREE.Color();
    this.mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ vertexShader: SH.RAY_VS, fragmentShader: SH.RAY_FS,
      uniforms: { ...pick(U, 'uTime', 'uDay', 'uHaze'), uGain: { value: 0.4 }, uFlip: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide }), n);          // revamp 2026-11-20: thin, faint beams (LOOK.md), no fat searchlights
    for (let i = 0; i < towerBeams; i++) { c.setHex((NEON ? 0x3fd8ff : 0xd39556)); color.set([c.r, c.g, c.b], i * 3); alpha[i] = 0.2; }
    this.fixed = [];
    L.districts.forEach((d, k) => {
      const i = towerBeams + k;
      c.setHex(d.color); color.set([c.r, c.g, c.b], i * 3); alpha[i] = 0.22;
      this.fixed.push([i, d.cx, d.cz, 18 + d.half * 0.25, d.half * 0.2]);
    });
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const [i, x, z, len, w] of this.fixed) {        // the district sky beams lean a little outwards
      e.set(Math.sin(x) * 0.08, 0, Math.cos(z) * 0.08);
      m4.compose(new THREE.Vector3(x, 0, z), q.setFromEuler(e), new THREE.Vector3(Math.min(w, 3.5), 220 + len * 3, Math.min(w, 3.5)));
      this.mesh.setMatrixAt(i, m4);
    }
    this._m4 = m4; this._q = q; this._e = e;
    this.update(0);
  }

  update(t) {
    const { _m4: m4, _q: q, _e: e } = this;
    for (let i = 0; i < this.n; i++) {
      const a = t * 0.25 + (i / this.n) * Math.PI * 2;
      e.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55, 'XYZ');
      m4.compose(new THREE.Vector3(0, 48, 0), q.setFromEuler(e), new THREE.Vector3(5, 260, 5));
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class SunRays {
  /** Crepuscular rays at dawn and dusk: wide cones from the low sun through the haze onto the city (one instanced draw). */
  constructor(U, n = 7) {
    const geo = rayGeo(), color = new Float32Array(n * 3), alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) { color.set([1.0, 0.62 + 0.05 * (i % 3), 0.38], i * 3); alpha[i] = 0.10 + 0.05 * (i % 2); }
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    this.gain = { value: 0 };
    this.mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ vertexShader: SH.RAY_VS, fragmentShader: SH.RAY_FS,
      uniforms: { ...pick(U, 'uTime', 'uHaze'), uDay: { value: 0 }, uGain: this.gain, uFlip: { value: 1 } }, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    this.n = n;
  }

  /** sunDir: unit vector to the sun; dusk 0..1; day 0..1 */
  set(sunDir, dusk, day) {
    const g = Math.max(0, dusk) * (1 - day * 0.5);
    this.gain.value = g * 0.6;
    this.mesh.visible = g > 0.03 && sunDir.y > -0.12;
    if (!this.mesh.visible) return;
    const src = new THREE.Vector3(sunDir.x, Math.max(0.04, sunDir.y), sunDir.z).normalize().multiplyScalar(900);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.n; i++) {
      const aim = new THREE.Vector3(Math.sin(i * 2.1) * 220, 0, Math.cos(i * 1.7) * 220);
      const dir = aim.sub(src);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      m4.compose(src, q, new THREE.Vector3(26 + (i % 3) * 12, len * 1.05, 26 + (i % 3) * 12));
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class FogLayers {
  constructor(U, quality) {
    this.group = new THREE.Group();
    this.planes = [[1.6, 0.20, 0.0], [6, 0.14, 3.7], [13, 0.10, 7.1]].map(([y, a, seed], k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), new THREE.ShaderMaterial({ vertexShader: SH.FOGL_VS,
        fragmentShader: SH.FOGL_FS, transparent: true, depthWrite: false,
        uniforms: { ...pick(U, 'uFog', 'uTime', 'uAccent', 'uDay'), uAlpha: { value: a }, uSeed: { value: seed } } }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.renderOrder = 5 + k;
      this.group.add(m);
      return m;
    });
    this.setQuality(quality);
  }

  setQuality(q, caps) { const n = caps?.fog ?? (q === 'hq' ? 3 : 1); this.planes.forEach((p, k) => { p.visible = k < n; }); }

  setHaze(h) { this.planes.forEach((p, k) => { p.material.uniforms.uAlpha.value = [0.12, 0.07, 0.045][k] * (0.6 + h * 1.2); }); }
}

export class Rain {
  constructor(U, quality) {
    const n = DROPS.hq, pos = new Float32Array(n * 6), drop = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const a = [Math.random(), Math.random(), Math.random()];
      pos.set([0, 0, 0, 0, 1, 0], i * 6);
      drop.set([...a, ...a], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDrop', new THREE.BufferAttribute(drop, 3));
    this.U = { uCam: { value: new THREE.Vector3() }, uRain: { value: 0 } };
    this.lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({ vertexShader: SH.RAIN_VS, fragmentShader: SH.RAIN_FS,
      uniforms: { ...pick(U, 'uTime', 'uDay'), ...this.U }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 8;
    this.quality = quality;
    this.set(0);
  }

  set(rain) {
    this.rain = rain;
    this.U.uRain.value = rain;
    this.lines.visible = rain > 0.01 && !this.calm;
    this.lines.geometry.setDrawRange(0, (this.drops ?? DROPS[this.quality]) * 2);
  }

  setQuality(q, caps) { this.quality = q; this.drops = caps?.drops ?? DROPS[q]; this.set(this.rain); }

  update(camera) { this.U.uCam.value.copy(camera.position); }
}

export class Traffic {
  /** Flying traffic: closed splines between the districts and round the plaza, cars moving both ways in two lanes. */
  constructor(L, U, quality) {
    const ds = L.districts.filter((d) => d.kind !== 'harbor');
    const paths = [];
    const rnd = mulberry(7);
    for (let k = 0; k < 6; k++) {                              // rings round the plaza at several heights
      const r = 26 + k * 9, y = 14 + k * 4.5, pts = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, y + Math.sin(a * 3) * 2, Math.sin(a) * r)); }
      paths.push(pts);
    }
    ds.forEach((a, i) => {                                     // plaza -> each district -> its neighbour -> back
      const b = ds[(i + 1) % ds.length], y = 16 + rnd() * 20;
      paths.push([new THREE.Vector3(0, y, 0), new THREE.Vector3(a.cx * 0.5, y + 6, a.cz * 0.5), new THREE.Vector3(a.cx, y + 3, a.cz),
                  new THREE.Vector3((a.cx + b.cx) / 2, y + 10, (a.cz + b.cz) / 2), new THREE.Vector3(b.cx, y, b.cz),
                  new THREE.Vector3(b.cx * 0.5, y + 4, b.cz * 0.5)]);
      const h = a.half * 0.8, yy = 12 + rnd() * 14;           // a loop over the district itself
      paths.push([[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => new THREE.Vector3(a.cx + x, yy, a.cz + z)));
    });
    const np = paths.length, tex = new Float32Array(PATH_SAMPLES * np * 4);
    paths.forEach((pts, j) => {
      const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      for (let i = 0; i < PATH_SAMPLES; i++) { const p = c.getPointAt(i / PATH_SAMPLES); tex.set([p.x, p.y, p.z, 1], (j * PATH_SAMPLES + i) * 4); }
    });
    const dt = new THREE.DataTexture(tex, PATH_SAMPLES, np, THREE.RGBAFormat, THREE.FloatType);
    dt.minFilter = dt.magFilter = THREE.NearestFilter;
    dt.needsUpdate = true;
    const n = CARS.hq, car = new Float32Array(n * 3 * 4);
    for (let i = 0; i < n; i++) {
      const path = i % np, off = rnd(), sp = (0.004 + rnd() * 0.006) * (rnd() < 0.5 ? 1 : -1);
      for (let t = 0; t < 3; t++) car.set([path, off, sp, t], (i * 3 + t) * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 9), 3));
    g.setAttribute('aCar', new THREE.BufferAttribute(car, 4));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: SH.CARS_VS, fragmentShader: SH.CARS_FS,
      uniforms: { ...pick(U, 'uTime', 'uPR', 'uDay'), uPaths: { value: dt }, uPathSize: { value: new THREE.Vector2(PATH_SAMPLES, np) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.paths = np;
    this.setQuality(quality);
  }

  setQuality(q, caps) { this.points.geometry.setDrawRange(0, (caps?.oldCars ?? CARS[q]) * 3); }
}

export class Beam {
  constructor(U) {
    const geo = rayGeo(), col = new Float32Array([1, 0.9, 0.55]), a = new Float32Array([1]);
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(a, 1));
    this.mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ vertexShader: SH.RAY_VS, fragmentShader: SH.RAY_FS,
      uniforms: { ...pick(U, 'uTime', 'uDay', 'uHaze'), uGain: { value: 1 }, uFlip: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 1);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 48), new THREE.MeshBasicMaterial({ color: (NEON ? 0xffe08a : 0xddac7b), transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 7;
    this.hide();
    this.t = 0;
  }

  /** A column of light onto (x, z), from a building of height h; colour = its class colour. */
  show(x, z, h, color) {
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, h, z), new THREE.Quaternion(), new THREE.Vector3(2.4, 320, 2.4));
    this.mesh.setMatrixAt(0, m4);
    this.mesh.instanceMatrix.needsUpdate = true;
    const c = new THREE.Color(color), a = this.mesh.geometry.getAttribute('aColor');
    a.array.set([Math.min(1, c.r + 0.3), Math.min(1, c.g + 0.3), Math.min(1, c.b + 0.3)]);
    a.needsUpdate = true;
    this.ring.position.set(x, 0.08, z);
    this.ring.material.color.set(color);
    this.mesh.visible = this.ring.visible = true;
    this.at = { x, z, h };
  }

  hide() { this.mesh.visible = this.ring.visible = false; this.at = null; }

  update(dt) {
    if (!this.at) return;
    this.t += dt;
    const s = 1 + 0.6 * ((this.t * 0.8) % 1);
    this.ring.scale.set(s, s, s);
    this.ring.material.opacity = 0.9 * (1 - ((this.t * 0.8) % 1));
  }
}

export class Billboards {
  /** Holographic boards round the plaza; items: [{ title, lines[], big, color }], cycled every few seconds. */
  constructor(U, items, n = 4) {
    this.group = new THREE.Group();
    this.items = items.length ? items : [{ title: 'DATA CITY', lines: ['No discovery yet'], big: '', color: (NEON ? '#7fe9ff' : '#daa56f') }];
    this.boards = [];
    for (let k = 0; k < Math.min(n, this.items.length); k++) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.ShaderMaterial({ vertexShader: SH.HOLO_VS, fragmentShader: SH.HOLO_FS, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, uniforms: { ...pick(U, 'uTime'), uMap: { value: tex }, uTint: { value: new THREE.Color((NEON ? 0x3fd8ff : 0xd39556)) }, uFade: { value: 1 } } });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), mat);
      const a = (k / n) * Math.PI * 2 + Math.PI / 4;
      m.position.set(Math.cos(a) * 29, 27 + (k % 2) * 5, Math.sin(a) * 29);
      m.lookAt(Math.cos(a) * 60, m.position.y, Math.sin(a) * 60);           // facing out of the plaza
      m.renderOrder = 9;
      this.group.add(m);
      this.boards.push({ canvas: c, tex, mat, mesh: m, at: k });
      this._draw(this.boards[k]);
    }
    this.clock = 0;
  }

  _draw(b) {
    const it = this.items[b.at % this.items.length], g = b.canvas.getContext('2d');
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = it.color || (NEON ? '#7fe9ff' : '#daa56f');
    g.font = (NEON ? '700 22px Orbitron, Rajdhani, system-ui, sans-serif' : '700 22px Georgia, Georgia, system-ui, sans-serif');
    g.fillText(it.title, 22, 40);
    g.font = (NEON ? '600 25px Rajdhani, system-ui, sans-serif' : '600 25px Georgia, system-ui, sans-serif');
    g.fillStyle = (NEON ? '#e9f6ff' : '#b2cadc');
    let y = 82;
    for (const line of wrap(g, it.lines.join(' '), 468).slice(0, 4)) { g.fillText(line, 22, y); y += 30; }
    g.font = (NEON ? '800 34px Orbitron, Rajdhani, system-ui, sans-serif' : '800 34px Georgia, Georgia, system-ui, sans-serif');
    g.fillStyle = it.color || (NEON ? '#ffe08a' : '#ddac7b');
    g.fillText(it.big || '', 22, 230);
    b.tex.needsUpdate = true;
    b.mat.uniforms.uTint.value.set(it.color || (NEON ? '#3fd8ff' : '#d39556'));
  }

  redrawAll() { for (const b of this.boards) this._draw(b); }

  update(dt) {
    this.clock += dt;
    if (this.clock < 8 || this.items.length <= this.boards.length) return;
    this.clock = 0;
    for (const b of this.boards) { b.at = (b.at + this.boards.length) % this.items.length; this._draw(b); }
  }
}

function wrap(g, text, width) {
  const out = [];
  let line = '';
  for (const w of String(text).split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
