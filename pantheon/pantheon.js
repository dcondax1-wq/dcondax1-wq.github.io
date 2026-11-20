// PANTHEON: Mount Olympus at night. A marble platform above the clouds; one glowing pillar per data god in a circle, its
// emblem hovering over the capital; energy beams run from every pillar into the central Council orb, whose colour is the
// verdict (green risk-on, amber mixed, red risk-off). Tap a pillar (or its chip) for the god's card, the orb for the
// council and the honest NQ check. Data: pantheon.json (tools/pantheon/build.py) or the demo fixture.
// Performance: instanced pillars, one merged beam mesh, one Points buffer for the motes, one for the stars; auto LITE
// when frames run slow (or ?lite=1); reduced motion = no drift, no bob, a still scene redrawn only on input.
import * as THREE from '../jarvis/three.module.min.js';
import { loadPantheon, godCard, councilHtml, chipValue, esc, LEAN, VERDICT, verdictHistory } from './pantheoncore.js';
import { drawGlyph } from './glyphs.js';
import * as PLUS from './pantheonplus.js';
import * as DESK from './pantheondesk.js';

// the OLYMPUS render core (../olympus/render.js + materials.js): tone mapping, a night environment for real marble and gold
// reflections, bloom on the live-data glow, MSAA, a film finish. Without it the hall draws with the plain renderer as before.
let CORE = null;
try {
  const [r, m] = await Promise.all([import('../olympus/render.js'), import('../olympus/materials.js')]);
  CORE = { createRenderer: r.createRenderer, marble: m.marble, metal: m.metal };
} catch (_) { CORE = null; }

const O = window.OLYMPUS || null;
// AGORA 3D mood: marble, bronze, warm sun, warm fog (docs/DESIGN_AGORA.md)
const AGORA3D = { sky: '#2b2018', fog: '#2a2018', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' };
const Q = new URLSearchParams(location.search);
const RM = O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const $ = (id) => document.getElementById(id);
const RING_R = 4.2, ORB_Y = 2.9, TOP_Y = 3.05, GLYPH_Y = 4.85, STATUE_H = 1.6, HIST_R = 6.15;
const STATE = { d: null, hall: null, sel: null, errors: [] };

// ------------------------------------------------------------------------------------------------ canvas textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const glowTex = () => canvasTex(64, 64, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
});
const marbleTex = (n) => canvasTex(n, n, (x, w) => {
  const r = rng(7);
  x.fillStyle = '#e7e1d2'; x.fillRect(0, 0, w, w);
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(${140 + r() * 40},${115 + r() * 35},${90 + r() * 30},${0.08 + r() * 0.14})`; x.lineWidth = 0.6 + r() * 2.2;
    x.beginPath(); let px = r() * w, py = 0; x.moveTo(px, py);
    while (py < w) { const nx = px + (r() - 0.5) * w * 0.25, ny = py + w * (0.08 + r() * 0.12); x.quadraticCurveTo(px + (r() - 0.5) * 30, (py + ny) / 2, nx, ny); px = nx; py = ny; }
    x.stroke();
  }
  for (let i = 0; i < 10; i++) {           // flutes: vertical soft shadows (the texture wraps around the shaft)
    const fx = (i + 0.5) / 10 * w, g = x.createLinearGradient(fx - w / 20, 0, fx + w / 20, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(70,50,32,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(fx - w / 20, 0, w / 10, w);
  }
});
const floorTex = (n) => canvasTex(n, n, (x, w) => {
  const c = w / 2, r = rng(11);
  const g = x.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, '#7d6a52'); g.addColorStop(0.35, '#5a4a3a'); g.addColorStop(0.8, '#2c231b'); g.addColorStop(1, 'rgba(20,17,14,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
  for (let i = 0; i < 40; i++) {                                                   // marble veins
    x.strokeStyle = `rgba(245,230,205,${0.03 + r() * 0.05})`; x.lineWidth = 1 + r() * 2;
    x.beginPath(); x.moveTo(r() * w, r() * w); x.quadraticCurveTo(r() * w, r() * w, r() * w, r() * w); x.stroke();
  }
  x.strokeStyle = 'rgba(200,162,74,.6)'; x.lineWidth = w / 340;
  for (const k of [0.16, 0.6, 0.64, 0.9]) { x.beginPath(); x.arc(c, c, c * k, 0, Math.PI * 2); x.stroke(); }
  x.strokeStyle = 'rgba(200,162,74,.4)'; x.lineWidth = w / 420;                // the Greek key band between 0.6 and 0.64
  const n2 = 96;
  for (let i = 0; i < n2; i++) {
    const a0 = i / n2 * Math.PI * 2, a1 = (i + 0.5) / n2 * Math.PI * 2, r0 = c * 0.6, r1 = c * 0.64;
    x.beginPath(); x.moveTo(c + Math.cos(a0) * r0, c + Math.sin(a0) * r0); x.lineTo(c + Math.cos(a0) * r1, c + Math.sin(a0) * r1);
    x.lineTo(c + Math.cos(a1) * r1, c + Math.sin(a1) * r1); x.lineTo(c + Math.cos(a1) * (r0 + (r1 - r0) * 0.5), c + Math.sin(a1) * (r0 + (r1 - r0) * 0.5)); x.stroke();
  }
  x.strokeStyle = 'rgba(156,107,60,.3)'; x.lineWidth = w / 500;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    x.beginPath(); x.moveTo(c + Math.cos(a) * c * 0.17, c + Math.sin(a) * c * 0.17); x.lineTo(c + Math.cos(a) * c * 0.58, c + Math.sin(a) * c * 0.58); x.stroke();
  }
});
function emblemTex(key, color) {
  return canvasTex(128, 128, (x, w) => {
    x.shadowColor = 'rgba(20,14,8,.7)'; x.shadowBlur = 5; x.strokeStyle = '#f3ece0'; x.fillStyle = color;
    x.translate(w * 0.12, w * 0.12); drawGlyph(x, key, w * 0.76);
  });
}
function labelTex(name, value, color) {
  return canvasTex(256, 96, (x, w) => {
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '600 28px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'; x.shadowColor = 'rgba(20,14,8,.85)'; x.shadowBlur = 5; x.fillStyle = color; x.fillText(name.charAt(0) + name.slice(1).toLowerCase(), w / 2, 30);
    x.font = '700 30px "SF Pro Rounded",-apple-system,system-ui,sans-serif'; x.fillStyle = '#f3ece0'; x.fillText(value, w / 2, 70);
  });
}

// ------------------------------------------------------------------------------------------------ beams (one merged mesh)
const BEAM_VS = `attribute vec3 aColor; attribute float aPow; varying vec2 vUv; varying vec3 vColor; varying float vPow;
  void main() { vUv = uv; vColor = aColor; vPow = aPow; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FS = `uniform float uTime; varying vec2 vUv; varying vec3 vColor; varying float vPow;
  void main() {
    float edge = 1.0 - abs(vUv.x * 2.0 - 1.0); edge = edge * edge;
    float flow = pow(fract(vUv.y * 2.5 - uTime * 0.55), 6.0);
    float a = edge * (0.12 + 0.5 * flow) * vPow;
    gl_FragColor = vec4(vColor * (0.6 + 0.4 * flow), a);
  }`;

function beamGeometry(n) {
  // per beam: two crossed ribbons (4 vertices each) from a pillar top to the orb; positions are written by setBeams()
  const g = new THREE.BufferGeometry();
  const V = n * 8;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(V * 2), 2));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  g.setAttribute('aPow', new THREE.BufferAttribute(new Float32Array(V), 1));
  const idx = [];
  for (let b = 0; b < n * 2; b++) { const o = b * 4; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------------------------------------ the hall
class Hall {
  constructor(canvas, d) {
    this.d = d;
    const quality = Q.get('q');
    this.lite = Q.get('lite') === '1' || quality === 'low' || quality === 'off' || !!(O && O.lite());
    this.chosen = Q.get('lite') === '1' || Q.get('full') === '1' || ['ultra', 'high', 'low', 'off'].includes(quality) || !!(O && O.chosen());
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x2a2018, 0.03);
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 200);
    this.rc = null;
    if (CORE) {
      try {
        this.rc = CORE.createRenderer({ canvas, scene: this.scene, camera: this.camera, alpha: true, env: 'night', quality: ['ultra', 'high', 'low', 'off'].includes(quality) ? quality : undefined, exposure: 1.0, autoSize: false, theme: AGORA3D, tint: '#c8a24a',
          maxDpr: this.lite ? 1.5 : 2, bloom: { strength: 0.22, radius: 0.5, threshold: 0.95 }, onQuality: (l) => { this.lite = l === 'low' || l === 'off'; this.resize(); } });
        this.renderer = this.rc.renderer;
        // night-3d look (olympus/look.js): a golden-hour grade in the finish pass, and on HD a soft depth of field: the council orb and
        // the ring of gods sharp, the far colonnade and sky soft. No draw call; optional.
        import('../olympus/look.js').then((L) => { if (this.rc) this.lookFx = L.polish(this.rc, { grade: 'golden', mix: 0.35, focus: { x: 0.5, y: 0.5, r: 0.34, amount: 2.2 } }); }).catch(() => {});
      } catch (_) { this.rc = null; }
    }
    if (!this.rc) {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lite, alpha: true, powerPreference: 'high-performance' });
      O?.track(this.renderer);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(O ? O.dpr(this.lite) : Math.min(devicePixelRatio || 1, this.lite ? 1.5 : 2));
    }
    this.yaw = Math.PI / 2 + 0.35; this.yawTo = this.yaw; this.pitch = 0.58; this.pitchTo = this.pitch; this.dist = 16;
    this.t = 0; this.last = performance.now(); this.frames = []; this.dirty = true; this.idleAt = 0;
    this.tex = { glow: glowTex(), marble: marbleTex(this.lite ? 128 : 256), floor: floorTex(this.lite ? 512 : 1024) };
    this.gods = d.gods;
    this.anchors = [];
    this.fx = []; this.fxNames = []; this.previewing = null;
    this.build();
    this.fxStart();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.input(canvas);
  }

  build() {
    const S = this.scene, n = this.gods.length, T = this.tex;
    S.add(new THREE.HemisphereLight(0xffe2b8, 0x4a3a2c, CORE ? 1.0 : 1.3));
    const vc = new THREE.Color(VERDICT[this.d.council.label] || VERDICT.SILENT);
    this.orbLight = new THREE.PointLight(vc, 16, 14, 1.6);
    this.orbLight.position.set(0, ORB_Y, 0);
    S.add(this.orbLight);
    this.moon = new THREE.DirectionalLight(0xffd9a0, 1.7); S.add(this.moon, this.moon.target);   // follows the camera (place())

    const floor = new THREE.Mesh(new THREE.CircleGeometry(7.4, 72), new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.55, metalness: 0.1, transparent: true }));
    floor.rotation.x = -Math.PI / 2; S.add(floor);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 6.9, 0.6, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8, side: THREE.DoubleSide }));
    rim.position.y = -0.3; S.add(rim);

    // pillars: instanced base, shaft, capital (three draw calls for all eight)
    const marble = CORE ? CORE.marble({ scale: 0.9 }) : new THREE.MeshStandardMaterial({ map: T.marble, roughness: 0.42, metalness: 0.05 });
    const gold = CORE ? CORE.metal({ kind: 'gold' }) : new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.4, metalness: 0.85 });
    const mk = (geo, count) => { const m = new THREE.InstancedMesh(geo, marble, count); S.add(m); return m; };
    const base = mk(new THREE.BoxGeometry(0.95, 0.3, 0.95), n), shaft = mk(new THREE.CylinderGeometry(0.27, 0.32, 2.5, 20, 1, true), n),
      echinus = mk(new THREE.CylinderGeometry(0.46, 0.3, 0.16, 20), n), cap = mk(new THREE.BoxGeometry(0.98, 0.16, 0.98), n);
    const bandMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    if (CORE) bandMat.color.setScalar(1.2);                // brighter than 1 in HDR: the live-data band blooms
    const bands = new THREE.InstancedMesh(new THREE.TorusGeometry(0.42, 0.045, 8, 32), bandMat, n);
    S.add(bands);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    // the statues: a draped figure turned on a lathe (robe, shoulders, neck), a head and a gold laurel, one per capital
    const robe = new THREE.LatheGeometry([[0.21, 0], [0.22, 0.05], [0.17, 0.3], [0.125, 0.5], [0.15, 0.62], [0.14, 0.69], [0.07, 0.74], [0.045, 0.78], [0.001, 0.79]]
      .map(([r, y]) => new THREE.Vector2(r, y)), this.lite ? 14 : 28);
    const headG = new THREE.SphereGeometry(0.085, this.lite ? 10 : 18, this.lite ? 8 : 14), laurel = new THREE.TorusGeometry(0.09, 0.012, 6, this.lite ? 14 : 24);
    const staffG = new THREE.CylinderGeometry(0.014, 0.014, 1.05, 6), beltG = new THREE.TorusGeometry(0.135, 0.016, 6, this.lite ? 14 : 24), orbG = new THREE.SphereGeometry(0.05, 10, 8);
    const inst = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, n); S.add(m); return m; };
    const statues = { body: inst(robe, marble), head: inst(headG, marble), crown: inst(laurel, gold), staff: inst(staffG, gold), belt: inst(beltG, gold), ember: inst(orbG, new THREE.MeshBasicMaterial()) };
    const PM = new THREE.Matrix4(), PM2 = new THREE.Matrix4(), PP = new THREE.Vector3(), PQ = new THREE.Quaternion(), PS = new THREE.Vector3(), PX = new THREE.Vector3(1, 0, 0);
    this.statues = statues;
    this.pillars = this.gods.map((g, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2, x = Math.cos(a) * RING_R, z = Math.sin(a) * RING_R;
      base.setMatrixAt(i, M.compose(p.set(x, 0.15, z), q.identity(), sc));
      shaft.setMatrixAt(i, M.compose(p.set(x, 1.55, z), q.identity(), sc));
      echinus.setMatrixAt(i, M.compose(p.set(x, 2.86, z), q.identity(), sc));
      cap.setMatrixAt(i, M.compose(p.set(x, 3.0, z), q.identity(), sc));
      bands.setMatrixAt(i, M.compose(p.set(x, 2.74, z), flat, sc));
      const col = new THREE.Color(g.ok ? g.color : '#6a6052');
      bands.setColorAt(i, col);
      shaft.setColorAt(i, new THREE.Color('#ffffff').lerp(col, 0.18));
      // the statue's six parts go into six instanced meshes (one draw call each for all gods): the god's transform times the part's own
      const st = new THREE.Object3D(); st.scale.setScalar(STATUE_H); st.position.set(x, 3.08, z); st.rotation.y = -a + Math.PI / 2; st.updateMatrix();
      const part = (mesh, px, py, pz, rx) => { PM.compose(PP.set(px, py, pz), PQ.setFromAxisAngle(PX, rx || 0), PS.set(1, 1, 1)); mesh.setMatrixAt(i, PM2.multiplyMatrices(st.matrix, PM)); };
      part(statues.body, 0, 0, 0); part(statues.head, 0, 0.87, 0); part(statues.crown, 0, 0.93, 0, Math.PI / 2); part(statues.staff, 0.2, 0.52, 0.04);
      part(statues.belt, 0, 0.42, 0, Math.PI / 2); part(statues.ember, 0.2, 1.08, 0.04);          // a staff topped with the god's own light
      statues.ember.setColorAt(i, col.clone().multiplyScalar(CORE ? 1.5 : 1));
      const glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: emblemTex(g.glyph, g.color), transparent: true, depthWrite: false, opacity: g.ok ? 1 : 0.35 }));
      glyph.scale.set(1.0, 1.0, 1); glyph.position.set(x, GLYPH_Y, z);
      if (CORE) glyph.material.color.setScalar(1.1);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: g.ok ? 0.18 : 0.06 }));
      halo.scale.set(2.3, 2.3, 1); halo.position.copy(glyph.position);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(g.name, chipValue(g), g.color), transparent: true, depthWrite: false }));
      label.scale.set(2.3, 0.86, 1); label.position.set(x, GLYPH_Y + 1.0, z);
      S.add(halo, glyph, label);
      return { g, a, x, z, glyph, halo, label, col, ph: i * 0.9 };
    });
    for (const m of [shaft, bands, statues.ember]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    for (const m of Object.values(statues)) m.instanceMatrix.needsUpdate = true;

    // the Council orb: a fresnel sphere, a glow, a core and a turning gauge ring
    this.orbMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: vc.clone() }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() { float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.2);
          float swirl = 0.5 + 0.5 * sin(vP.y * 7.0 + uTime * 1.4 + sin(vP.x * 5.0 + uTime) * 1.5);
          gl_FragColor = vec4(uColor * (0.35 + 1.4 * f + 0.25 * swirl), 0.25 + 0.75 * f); }`,
    });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.85, this.lite ? 24 : 40, this.lite ? 16 : 28), this.orbMat);
    this.orb.position.set(0, ORB_Y, 0);
    this.orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: vc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }));
    this.orbGlow.scale.set(4.6, 4.6, 1); this.orbGlow.position.copy(this.orb.position);
    this.orbCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xfff0d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 }));
    this.orbCore.scale.set(1.0, 1.0, 1); this.orbCore.position.copy(this.orb.position);
    const gauge = this.d.council.gauge == null ? 50 : this.d.council.gauge;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.03, 6, 96, Math.PI * 2 * gauge / 100),
      new THREE.MeshBasicMaterial({ color: vc, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.position.copy(this.orb.position); this.ring.rotation.x = Math.PI / 2.4;
    const c = this.d.council;
    this.orbLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(c.label, c.gauge == null ? '—' : `${c.gauge} / 100`, VERDICT[c.label] || '#fff'), transparent: true, depthWrite: false }));
    this.orbLabel.scale.set(2.4, 0.9, 1); this.orbLabel.position.set(0, ORB_Y + 1.75, 0);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 1.3, 24), CORE ? CORE.marble({ scale: 1.4, gold: '#c8a24a', color: '#b8ab98' }) : marble);
    pedestal.position.set(0, 0.65, 0);
    S.add(pedestal, this.orbGlow, this.orb, this.orbCore, this.ring, this.orbLabel);
    this.verdictRing(vc);

    // beams
    this.beamMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beams = new THREE.Mesh(beamGeometry(n), this.beamMat);
    this.beams.frustumCulled = false;
    S.add(this.beams);
    this.setBeams();

    // motes rising along the beams toward the orb, and the stars
    this.nMotes = this.lite ? 140 : 420;
    const mp = new Float32Array(this.nMotes * 3), mc = new Float32Array(this.nMotes * 3);
    this.moteT = new Float32Array(this.nMotes); this.moteB = new Uint8Array(this.nMotes); this.moteJ = new Float32Array(this.nMotes * 2);
    const r = rng(3);
    for (let i = 0; i < this.nMotes; i++) { this.moteT[i] = r(); this.moteB[i] = i % n; this.moteJ[i * 2] = (r() - 0.5) * 0.3; this.moteJ[i * 2 + 1] = (r() - 0.5) * 0.3; }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.13, map: this.tex.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    S.add(this.motes);
    this.paintMotes();
    const ns = this.lite ? 60 : 180, sp = new Float32Array(ns * 3);
    for (let i = 0; i < ns; i++) {
      const u = r() * 0.8 - 0.05, a = r() * Math.PI * 2, rr = 60 + r() * 30, y = u * rr * 0.7;
      sp[i * 3] = Math.cos(a) * rr * Math.sqrt(1 - u * u); sp[i * 3 + 1] = y; sp[i * 3 + 2] = Math.sin(a) * rr * Math.sqrt(1 - u * u);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.32, map: this.tex.glow, color: 0xf0d9a8, opacity: 0.5, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    S.add(this.stars);
    // the sky: a moon and two nebulae (sprites, no fog) fill the space above the summit
    const sky = [[-8, -1.5, -30, 4.4, 0xffe2b0, 0.8], [-8, -1.5, -30, 15, 0xe0a060, 0.22], [13, -3, -34, 24, 0xa05a3c, 0.18], [2, 2, -42, 36, 0x4b6a86, 0.16]];
    this.skyG = new THREE.Group(); S.add(this.skyG);        // turned with the camera in place(): always behind the hall
    this.sky = (this.lite ? sky.slice(0, 2) : sky).map(([x, y, z, s, c, o]) => {      // LITE: the moon only (less overdraw)
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: c, transparent: true, depthWrite: false, fog: false, opacity: o, blending: THREE.AdditiveBlending }));
      m.position.set(x, y, z); m.scale.set(s, s, 1); this.skyG.add(m); return m;
    });
    // the clouds below the summit
    this.clouds = [];
    const nc = this.lite ? 5 : 9;
    for (let i = 0; i < nc; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xd9bf9a, transparent: true, depthWrite: false, opacity: 0.16 }));
      const a = i / nc * Math.PI * 2, rr = 7.5 + r() * 3;
      s.position.set(Math.cos(a) * rr, -1.2 - r() * 1.2, Math.sin(a) * rr); s.scale.set(9 + r() * 5, 3.2 + r() * 1.5, 1);
      this.clouds.push({ s, a, rr, sp: 0.01 + r() * 0.02 }); S.add(s);
    }
  }

  /** The Council chamber: a gold-edged dais, a column of verdict light over the orb and a ring of blocks, one per past council
   *  reading (council.spark, the last year, oldest first, ending in front): colour = that day's verdict, height = how strong. */
  /** the OLYMPUS effects (olympus/fx-*.js): light shafts onto the Council orb, dust and fireflies in the night air; each one optional */
  async fxStart() {
    const FX = window.OLYMPUS_FX;
    if (!FX) return;
    try { await FX.load('3d'); } catch (_) { return; }
    this.fxAdd('godRays', this.scene, { position: [0, 13, 0], intensity: 0.32, color: '#ffd9a0' });
    this.fxAdd('dust', this.scene, { color: '#e8d2a8', size: 0.07 });
    this.fxAdd('fireflies', this.scene, { count: 28, color: '#e0b060', color2: '#ffd9a0', size: 0.22 });
    this.dirty = true;
  }

  fxAdd(name, target, opts) {
    const FX = window.OLYMPUS_FX;
    try { if (FX && typeof FX[name] === 'function') { const e = FX[name](target, opts); this.fx.push(e); this.fxNames.push(name); return e; } } catch (_) { /* an effect failing never stops the hall */ }
    return null;
  }

  /** the verdict flipped: gold laurel leaves for risk-on, embers for risk-off, for a few seconds (nothing on reduced motion) */
  celebrate(label) {
    const FX = window.OLYMPUS_FX;
    if (!FX || RM || (label !== 'RISK-ON' && label !== 'RISK-OFF')) return;
    FX.load('3d').then(() => { const e = this.fxAdd(label === 'RISK-ON' ? 'laurelFall' : 'embers', this.scene, label === 'RISK-ON' ? {} : { center: [0, 3, 0] }); if (e) setTimeout(() => { try { e.stop(); } catch (_) { /* gone */ } }, 6500); }).catch(() => {});
  }

  /** the "what if" sliders: tint the Council orb (and its light, ring and column) with a pretend verdict; null puts the real one back */
  preview(r) {
    const label = r ? r.label : this.d.council.label, col = new THREE.Color(VERDICT[label] || VERDICT.SILENT);
    this.previewing = r ? label : null;
    this.orbLight.color.copy(col); this.orbMat.uniforms.uColor.value.copy(col); this.orbGlow.material.color.copy(col);
    this.ring.material.color.copy(col); this.column.material.color.copy(col);
    this.dirty = true;
  }

  verdictRing(vc) {
    const S = this.scene, hist = verdictHistory(this.d), N = hist.cells.length;
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(HIST_R + 0.35, HIST_R + 0.5, 0.12, 72), CORE ? CORE.marble({ scale: 0.7, gold: '#c8a24a', color: '#9a8c78', clearcoat: 0.4 }) : new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.6 }));
    dais.position.y = 0.04; S.add(dais);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(HIST_R + 0.42, 0.035, 8, 96), new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.35, metalness: 0.85 }));
    edge.rotation.x = Math.PI / 2; edge.position.y = 0.11; S.add(edge);
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 6.5, 24, 1, true), new THREE.MeshBasicMaterial({ color: vc, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.column.position.set(0, ORB_Y + 2.2, 0); S.add(this.column);
    this.history = hist;
    if (!N) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    if (CORE) mat.color.setScalar(1.2);                      // HDR: the ring glows in the verdict colours
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 1, 0.2), mat, N), M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    hist.cells.forEach((c, i) => {
      const a = Math.PI / 2 + ((i + 1) / N) * Math.PI * 2, h = 0.1 + 0.55 * Math.min(1, Math.abs(c.score) / 0.6);
      q.setFromAxisAngle(up, -a + Math.PI / 2); p.set(Math.cos(a) * HIST_R, 0.1 + h / 2, Math.sin(a) * HIST_R); sc.set(1, h, 1);
      blocks.setMatrixAt(i, M.compose(p, q, sc)); blocks.setColorAt(i, new THREE.Color(VERDICT[c.label] || VERDICT.SILENT).multiplyScalar(i === N - 1 ? 1.6 : 0.8));
    });
    blocks.instanceColor.needsUpdate = true; S.add(blocks); this.blocks = blocks;
  }

  beamPow(g) {
    if (!g.ok) return 0.12;
    const v = g.vote_display == null ? 0.3 : Math.abs(g.vote_display);
    return (this.sel && this.sel !== g.key ? 0.35 : 1) * (0.45 + 0.75 * Math.min(1, v + 0.2)) * (this.sel === g.key ? 1.6 : 1);
  }

  beamColor(g) {
    return new THREE.Color(g.ok ? (LEAN[g.lean] || LEAN.neutral).hex : '#6a6052').lerp(new THREE.Color(g.color), 0.35);
  }

  setBeams() {
    const geo = this.beams.geometry, P = geo.attributes.position.array, U = geo.attributes.uv.array,
      C = geo.attributes.aColor.array, W = geo.attributes.aPow.array;
    const B = new THREE.Vector3(0, ORB_Y, 0), A = new THREE.Vector3(), dir = new THREE.Vector3(), s1 = new THREE.Vector3(), s2 = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    this.pillars.forEach((pl, i) => {
      A.set(pl.x, TOP_Y, pl.z);
      dir.subVectors(B, A).normalize();
      s1.crossVectors(dir, up).normalize(); s2.crossVectors(dir, s1).normalize();
      const pow = this.beamPow(pl.g), w = 0.09 + 0.12 * Math.min(1.6, pow), col = this.beamColor(pl.g);
      [s1, s2].forEach((side, k) => {
        const o = (i * 2 + k) * 4;
        const quad = [[A, -1, 0], [A, 1, 0], [B, -1, 1], [B, 1, 1]];
        quad.forEach(([pt, sgn, v], j) => {
          const ww = v ? w * 0.55 : w;
          P[(o + j) * 3] = pt.x + side.x * ww * sgn; P[(o + j) * 3 + 1] = pt.y + side.y * ww * sgn; P[(o + j) * 3 + 2] = pt.z + side.z * ww * sgn;
          U[(o + j) * 2] = sgn < 0 ? 0 : 1; U[(o + j) * 2 + 1] = v;
          C[(o + j) * 3] = col.r; C[(o + j) * 3 + 1] = col.g; C[(o + j) * 3 + 2] = col.b; W[o + j] = pow;
        });
      });
    });
    for (const k of ['position', 'uv', 'aColor', 'aPow']) geo.attributes[k].needsUpdate = true;
    this.dirty = true;
  }

  paintMotes() {
    const C = this.motes.geometry.attributes.color.array;
    for (let i = 0; i < this.nMotes; i++) {
      const pl = this.pillars[this.moteB[i]], col = this.beamColor(pl.g), k = pl.g.ok ? (this.sel && this.sel !== pl.g.key ? 0.25 : 0.9) : 0.1;
      C[i * 3] = col.r * k; C[i * 3 + 1] = col.g * k; C[i * 3 + 2] = col.b * k;
    }
    this.motes.geometry.attributes.color.needsUpdate = true;
  }

  select(key) {
    this.sel = key;
    const pl = this.pillars.find((p) => p.g.key === key);
    if (pl) {                                   // turn the hall so the god stands at the front
      let to = pl.a, cur = this.yaw;
      while (to - cur > Math.PI) to -= Math.PI * 2;
      while (to - cur < -Math.PI) to += Math.PI * 2;
      this.yawTo = to;
      if (RM) this.yaw = to;
    }
    this.pillars.forEach((p) => { p.halo.material.opacity = !p.g.ok ? 0.15 : key && p.g.key !== key ? 0.25 : key ? 0.95 : 0.55; });
    this.setBeams(); this.paintMotes(); this.idleAt = performance.now();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (this.rc) this.rc.resize(w, h); else this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    this.dist = Math.max(10, Math.min(22, (RING_R + 1.7) / Math.tan(hfov / 2)));
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  place() {
    const c = this.camera, d = this.dist;
    c.position.set(Math.cos(this.yaw) * Math.cos(this.pitch) * d, 1.4 + Math.sin(this.pitch) * d, Math.sin(this.yaw) * Math.cos(this.pitch) * d);
    c.lookAt(0, 2.45, 0);
    if (this.skyG) this.skyG.rotation.y = Math.PI / 2 - this.yaw;
    this.moon.position.set(c.position.x * 0.6 - c.position.z * 0.3, 14, c.position.z * 0.6 + c.position.x * 0.3);
  }

  input(el) {
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw: this.yawTo, pitch: this.pitchTo, moved: false }; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
      this.yawTo = down.yaw + dx * 0.008; this.pitchTo = Math.max(0.12, Math.min(0.85, down.pitch + dy * 0.004));
      if (RM) { this.yaw = this.yawTo; this.pitch = this.pitchTo; }
      this.idleAt = performance.now(); this.dirty = true;
    });
    el.addEventListener('pointerup', (e) => {
      const was = down; down = null;
      if (!was || was.moved) return;
      const hit = this.pick(e.clientX, e.clientY);
      if (hit === 'council') openCouncil(); else if (hit) openGod(hit); else { closeAll(); }
    });
    el.addEventListener('pointercancel', () => { down = null; });
  }

  screenOf(obj) {
    const v = obj.clone().project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, z: v.z };
  }

  anchorOf(key) {
    if (key === 'council') return this.screenOf(this.orb.position);
    const pl = this.pillars.find((p) => p.g.key === key);
    return pl ? this.screenOf(new THREE.Vector3(pl.x, 2.2, pl.z)) : null;
  }

  pick(x, y) {
    this.place(); this.camera.updateMatrixWorld();
    let best = null, bd = 1e9;
    const o = this.screenOf(this.orb.position), od = Math.hypot(o.x - x, o.y - y);
    if (od < 52) { best = 'council'; bd = od * 0.8; }
    for (const pl of this.pillars) {
      for (const yy of [1.4, 2.4, GLYPH_Y]) {
        const s = this.screenOf(new THREE.Vector3(pl.x, yy, pl.z)), dd = Math.hypot(s.x - x, s.y - y);
        if (dd < 46 && dd < bd) { bd = dd; best = pl.g.key; }
      }
    }
    return best;
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const moving = !RM;
    if (moving) {
      this.t += dt;
      if (!this.sel && now - this.idleAt > 3500) this.yawTo += dt * 0.05 * Math.min(1, (now - this.idleAt - 3500) / 2500) ** 2;   // a slow idle turn that eases in
    }
    // night-3d: the camera glides with exponential easing (the same feel at 30 and 120 fps), the tilt too (it used to jump with the finger)
    const dy = this.yawTo - this.yaw, dp = this.pitchTo - this.pitch, k = 1 - Math.exp(-dt * 6);
    if (Math.abs(dy) > 1e-4) { this.yaw += dy * k; this.dirty = true; }
    if (Math.abs(dp) > 1e-4) { this.pitch += dp * k; this.dirty = true; }
    if (!moving && !this.dirty) return;
    this.place();
    this.beamMat.uniforms.uTime.value = this.t; this.orbMat.uniforms.uTime.value = this.t;
    if (moving) {
      for (const pl of this.pillars) {
        const b = Math.sin(this.t * 1.3 + pl.ph) * 0.08;
        pl.glyph.position.y = GLYPH_Y + b; pl.halo.position.y = GLYPH_Y + b; pl.label.position.y = GLYPH_Y + 1.0 + b;
      }
      this.ring.rotation.z = this.t * 0.4;
      this.orbCore.scale.setScalar(0.95 + Math.sin(this.t * 2.1) * 0.08);
      for (const c of this.clouds) { c.a += c.sp * dt; c.s.position.x = Math.cos(c.a) * c.rr; c.s.position.z = Math.sin(c.a) * c.rr; }
      this.stars.rotation.y = this.t * 0.004;
    }
    const P = this.motes.geometry.attributes.position.array;
    for (let i = 0; i < this.nMotes; i++) {
      const pl = this.pillars[this.moteB[i]];
      if (moving) this.moteT[i] = (this.moteT[i] + dt * (pl.g.ok ? 0.22 : 0.05)) % 1;
      const f = this.moteT[i], arc = Math.sin(f * Math.PI) * 0.45;
      P[i * 3] = pl.x * (1 - f) + this.moteJ[i * 2] * (1 - f);
      P[i * 3 + 1] = TOP_Y + (ORB_Y - TOP_Y) * f + arc;
      P[i * 3 + 2] = pl.z * (1 - f) + this.moteJ[i * 2 + 1] * (1 - f);
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    if (this.rc) this.rc.render(); else this.renderer.render(this.scene, this.camera);
    this.dirty = false;
    this.frames.push(now);
    while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift();
    this.autoLite(now);
  }

  fps() { return this.frames.length; }

  autoLite(now) {
    // the OLYMPUS rule: an automatic LITE only when nobody chose a level; never stored
    if (this.chosen || RM || this.rc) return;          // on the core the render core steps itself down
    this.started = this.started || now;
    if (now - this.started < 2500 || this.frames.length < 2) return;
    if (!this.lite && this.fps() < 45) {
      this.lite = true;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
      this.motes.geometry.setDrawRange(0, Math.floor(this.nMotes / 3));
      this.resize(); O?.mode?.(true);
      this.started = now;
    } else if (this.lite && this.fps() < 30 && this.renderer.getPixelRatio() > 1) {
      this.renderer.setPixelRatio(1); this.resize(); this.started = now;
    }
  }
}

// ------------------------------------------------------------------------------------------------ the UI
function closeAll() {
  STATE.hall?.preview(null);
  $('card').hidden = true; $('council').hidden = true; $('desk').hidden = true; $('councilBtn').setAttribute('aria-expanded', 'false'); $('deskBtn').setAttribute('aria-expanded', 'false');
  STATE.sel = null; STATE.hall?.select(null); markChips();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function markChips() {
  document.querySelectorAll('.god').forEach((b) => b.classList.toggle('sel', b.dataset.key === STATE.sel));
}

function openGod(key) {
  const g = STATE.d.gods.find((x) => x.key === key);
  if (!g) return;
  $('council').hidden = true; $('councilBtn').setAttribute('aria-expanded', 'false'); $('desk').hidden = true; $('deskBtn').setAttribute('aria-expanded', 'false');
  const c = godCard(g);
  $('card').style.setProperty('--c', g.color);
  const chart = g.ok ? PLUS.godChartHtml(g) : '';
  $('card-h').textContent = c.title; $('card-m').textContent = c.meta;
  $('card-b').innerHTML = c.body.includes('<h3>Against NQ futures') ? c.body.replace('<h3>Against NQ futures', chart + '<h3>Against NQ futures') : c.body + chart;
  PLUS.wireChart($('card-b'));
  $('card').hidden = false; $('card').scrollTop = 0;
  STATE.sel = key; STATE.hall?.select(key); markChips();
  if (location.hash !== '#god/' + key) history.replaceState(null, '', '#god/' + key);
}

/** MY DESK: the gods in terms of the trading day (event risk against the 02:00-15:30 window, the gods this phone follows, whether the Council has
 *  mattered for NQ, how fresh the data is, and one line to copy). Read-only context. */
function openDesk() {
  $('card').hidden = true; $('council').hidden = true; $('councilBtn').setAttribute('aria-expanded', 'false');
  let store = null; try { store = localStorage; } catch (_) { store = null; }
  STATE.desk = DESK.renderDesk($('desk-b'), STATE.d, { storage: store });
  $('desk').hidden = false; $('desk').scrollTop = 0; $('deskBtn').setAttribute('aria-expanded', 'true');
  STATE.sel = null; STATE.hall?.select(null); markChips();
  if (location.hash !== '#desk') history.replaceState(null, '', '#desk');
}

function openCouncil() {
  $('card').hidden = true; $('desk').hidden = true; $('deskBtn').setAttribute('aria-expanded', 'false');
  $('council-b').innerHTML = councilHtml(STATE.d);
  PLUS.enhanceCouncil($('council-b'), STATE.d, { flips: STATE.flips, preview: (r) => STATE.hall?.preview(r), jarvis: postNote });
  $('council').hidden = false; $('council').scrollTop = 0; $('councilBtn').setAttribute('aria-expanded', 'true');
  STATE.sel = null; STATE.hall?.select(null); markChips();
  if (location.hash !== '#council') history.replaceState(null, '', '#council');
}

function hud(d) {
  const c = d.council, col = VERDICT[c.label] || '#fff';
  $('c-label').textContent = c.label; $('c-label').style.color = col;
  $('c-gauge').textContent = c.gauge == null ? '' : `${c.gauge} / 100 · ${c.voices} voices`;
  $('demo').hidden = !d.demo;
  try {                                                                              // money first: what a normal day costs, under the verdict
    let lv = null; try { lv = JSON.parse(localStorage.getItem('pantheon.level') || 'null'); } catch (_) { lv = null; }
    const m = DESK.dayMove(d, lv, false);
    if (m.pts != null) { $('glance').hidden = false; $('glance').innerHTML = `A normal day moves NQ about <b>${Math.round(m.pts)} points</b>: <b>±$${Math.round(m.mnq).toLocaleString('en-US')}</b> per micro.`; }
  } catch (_) { /* no estimate */ }
  $('sub').textContent = d.demo ? 'Demo data: the real file is not built yet' : `Free market data in plain words · built ${d.built}`;
  $('vline').innerHTML = `${esc(c.text)}${c.caution ? ' <b>' + esc(c.caution) + '</b>' : ''}`;
  $('strip').innerHTML = d.gods.map((g) => `<button type="button" class="god" data-key="${esc(g.key)}" style="--c:${esc(g.color)}" aria-label="${esc(g.name)}: ${esc(g.title)}, ${esc(chipValue(g))}">
    <span class="n">${esc(g.name)}</span><span class="v">${esc(chipValue(g))}</span></button>`).join('');
  document.querySelectorAll('.god').forEach((b) => b.addEventListener('click', () => (STATE.sel === b.dataset.key ? closeAll() : openGod(b.dataset.key))));
}

function renderNoGl(d) {
  const box = $('nogl');
  box.hidden = false;
  box.innerHTML = `<p>3D is not available here. The gods:</p>` + d.gods.map((g) => `<button type="button" data-key="${esc(g.key)}">${esc(g.name)} · ${esc(chipValue(g))}</button>`).join('')
    + '<button type="button" data-key="council">Council</button>';
  box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => (b.dataset.key === 'council' ? openCouncil() : openGod(b.dataset.key))));
}

function route() {
  const h = location.hash;
  if (h === '#council') openCouncil();
  else if (h === '#desk') openDesk();
  else if (h.startsWith('#god/')) openGod(h.slice(5));
}

function postJarvisCard(note) {
  if (window.parent === window) return;
  fetch('jarvis.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((card) => {
    if (!card) return;
    const n = note || PLUS.councilNote(STATE.d), lines = [...(STATE.flip && STATE.flip.flipped ? [`The Council flipped: ${STATE.flip.from} to ${STATE.flip.to}.`] : []), ...n.lines].slice(0, 4);
    window.parent.postMessage({ jarvis: 1, href: location.href, card: { ...card, lines: lines.length ? lines : card.lines, t: Math.floor(Date.now() / 1000) } }, (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io'));
  }).catch(() => {});
}
const postNote = (note) => postJarvisCard(note);

/** the banner when the Council changed its mind since this phone last looked */
function flipBanner(f) {
  if (!f.flipped) return;
  $('flip-t').textContent = `The Council changed its mind: ${f.from} to ${f.to}`;
  $('flip').style.setProperty('--c', VERDICT[f.to] || '#fff'); $('flip').hidden = false;
  $('flip-x').addEventListener('click', () => { $('flip').hidden = true; });
  STATE.hall?.celebrate(f.to);
}

function recoverHall(reason, event) {
  event?.preventDefault?.();
  if (!STATE.hall || !STATE.d) return; // a second loss must not mount the no-GPU controls twice
  STATE.errors.push(String(reason?.message || reason));
  STATE.hall = null; // stop the next frame before presenting the independent data view
  renderNoGl(STATE.d);
  O?.ready();
}

function watchHallCanvas(hall) {
  const canvas = hall?.renderer?.domElement;
  canvas?.addEventListener('webglcontextlost', (event) => recoverHall('The 3D hall stopped on this device.', event));
  return canvas || null;
}
let gapAt = 0;
function tick(now) {
  const gap = O && O.frameGap ? O.frameGap() : 0;                         // idle 30 / 15 fps, battery saver, 3D Off (docs/OLYMPUS_PERF.md)
  if (STATE.hall && !(O ? O.hidden() : document.hidden) && !(gap && now - gapAt < gap - 3)) {
    gapAt = now;
    try { STATE.hall.frame(now); }
    catch (error) { recoverHall(error); }
  }
  requestAnimationFrame(tick);
}

async function main() {
  addEventListener('error', (e) => STATE.errors.push(String(e.message || e)));
  const d = await loadPantheon('pantheon.json', Q.get('demo') === '1' ? 'demo' : undefined);
  STATE.d = d;
  const mem = PLUS.remember(d);
  STATE.flip = mem.flip; STATE.flips = mem.flips;
  hud(d);
  $('cardX').addEventListener('click', closeAll);
  $('councilX').addEventListener('click', closeAll);
  $('deskX').addEventListener('click', closeAll);
  $('deskBtn').addEventListener('click', () => ($('desk').hidden ? openDesk() : closeAll()));
  $('councilBtn').addEventListener('click', () => ($('council').hidden ? openCouncil() : closeAll()));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  addEventListener('hashchange', route);
  try {
    STATE.hall = new Hall($('hall'), d);
    watchHallCanvas(STATE.hall);
  } catch (e) {
    STATE.hall = null;
    renderNoGl(d);
    O?.ready();
  }
  window.__pantheon = {
    ready: true, get demo() { return !!d.demo; }, get lite() { return STATE.hall ? STATE.hall.lite : null; },
    get fps() { return STATE.hall ? STATE.hall.fps() : 0; }, keys: d.gods.map((g) => g.key), errors: STATE.errors,
    screenOf(key) { return STATE.hall ? STATE.hall.anchorOf(key) : null; }, open: openGod, council: openCouncil, desk: openDesk, DESK,
    get core() { return STATE.hall && STATE.hall.rc ? STATE.hall.rc.passes() : null; }, get history() { return STATE.hall ? STATE.hall.history : null; },
    get sel() { return STATE.sel; }, get yaw() { return STATE.hall ? STATE.hall.yaw : null; },
    PLUS, get flip() { return STATE.flip; }, get fx() { return STATE.hall ? STATE.hall.fxNames : []; }, get preview() { return STATE.hall ? STATE.hall.previewing : null; },
  };
  requestAnimationFrame(tick);
  route();
  flipBanner(mem.flip);
  postJarvisCard();
}

main().catch((e) => { STATE.errors.push(String(e && e.message || e)); O?.fail(e && e.message ? e.message : String(e)); });
