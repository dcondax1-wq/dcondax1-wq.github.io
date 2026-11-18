// The Cities hub's three.js world, on the OLYMPUS render core (ACES, MSAA, bloom, the film finish, tiers from OLYMPUS.fx()).
// ONE scene, ONE camera, ONE renderer for the hub and for every city:
//   hub   the floating islands (one instanced slab draw), every island's miniature (ONE instanced draw for all of them), routes,
//         glow auras, the selection ring and beam
//   city  the buildings of a generated city (ONE instanced draw, 10 triangles each), district pads, roof glow, the landmark, the
//         selection beam; the sky, ground and weather are shared and re-tinted by look()
// Draw calls stay flat whatever the data: 40k buildings are still one draw (the tier's cap keeps the triangles in budget).
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import * as SH from './shaders.js?v=g5';
import { buildLandmark, spinLandmark, disposeGroup } from './landmarks.js';
import { rgb, clamp, rng, hash32 } from './util.js';
import { buildMetropolis } from './metropolis.js?v=m3';

/** What each render-core tier may draw: buildings per city, hub miniature instances in all, weather and roof-glow points. */
export const TIERS = {
  ultra: { cap: 40000, mini: 9000, wx: 5000, glow: 4000 },
  high: { cap: 24000, mini: 6500, wx: 2600, glow: 2500 },
  low: { cap: 6000, mini: 2400, wx: 700, glow: 700 },
  off: { cap: 1500, mini: 700, wx: 0, glow: 150 },
};
/** Draw-call and triangle budgets per tier (the tests hold the scene to them; the post passes are included). */
export const BUDGETS = {
  ultra: { calls: 70, tris: 560000, hubTris: 300000 }, high: { calls: 70, tris: 340000, hubTris: 220000 }, low: { calls: 40, tris: 100000, hubTris: 100000 }, off: { calls: 30, tris: 40000, hubTris: 60000 },
};
const SKY_KIND = { night: 0, dusk: 1, dawn: 2, day: 3, storm: 4, void: 5, aurora: 6, ember: 7 };
const DAYF = { day: 1, dawn: 0.55, dusk: 0.22 };
const SUN = { day: [0.4, 0.8, 0.3], dawn: [-0.8, 0.14, 0.5], dusk: [0.55, 0.32, -0.5], night: [-0.4, 0.55, -0.5], storm: [0, -1, 0], void: [0.3, 0.6, 0.2], aurora: [-0.4, 0.5, -0.5], ember: [0.7, 0.08, 0.3] };
const WX = {   // kind id, box, velocity (box units per second), sprite size, tint, share of the tier's count
  rain: { k: 1, box: [70, 56, 70], vel: [4, -48, 1.5], size: 0.55, tint: [0.88, 0.84, 0.78], share: 1 },
  storm: { k: 7, box: [70, 56, 70], vel: [-16, -60, 6], size: 0.7, tint: [0.88, 0.84, 0.78], share: 1 },
  snow: { k: 2, box: [80, 50, 80], vel: [2, -4, 1], size: 0.4, tint: [1, 1, 1], share: 0.8 },
  embers: { k: 3, box: [90, 60, 90], vel: [1.5, 7, 0.6], size: 0.45, tint: [1, 0.55, 0.15], share: 0.6 },
  fireflies: { k: 4, box: [90, 40, 90], vel: [0.3, 0, 0.2], size: 0.55, tint: [0.7, 1, 0.4], share: 0.45 },
  dust: { k: 5, box: [90, 40, 90], vel: [9, -0.3, 2.5], size: 0.3, tint: [0.95, 0.78, 0.5], share: 0.7 },
  fog: { k: 6, box: [160, 40, 160], vel: [1.5, 0, 0.5], size: 7, tint: [0.7, 0.75, 0.9], share: 0.06 },
};

const col3 = (hex) => new THREE.Color(hex);
/** AGORA skies (docs/DESIGN_AGORA.md): dusk indigo into amber, a bright Aegean day, a peach dawn. */
const AGORA_SKY = {
  dusk: { top: '#2a2a56', mid: '#7a6490', low: '#f4a868', ground: '#8c7660', stars: 0.4 },
  dawn: { top: '#2a2540', mid: '#8a5a62', low: '#f0b27a', ground: '#2c2118', stars: 0.2 },
  day: { top: '#4f7fa3', mid: '#9fc0cf', low: '#f3dcae', ground: '#7a6a55', stars: 0 },
};

/** A palette colour pulled toward bronze and gold, so no accent is neon. */
export const warmHex = (hex) => '#' + col3(hex).lerp(col3('#d8b25a'), 0.5).multiplyScalar(0.92).getHexString();

/** A unit box without its bottom: x, z in -0.5..0.5, y in 0..1 (10 triangles). */
export function unitBox5() {
  const P = [], N = [], I = [];
  const face = (n, a, b, c, d) => { const o = P.length / 3; for (const v of [a, b, c, d]) { P.push(...v); N.push(...n); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  face([1, 0, 0], [0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]);
  face([-1, 0, 0], [-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]);
  face([0, 0, 1], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]);
  face([0, 0, -1], [0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]);
  face([0, 1, 0], [-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

/** The island slab: a lathe of a flat top and a rocky cone underneath (radius 1, top at y 0). */
const SLAB_SEG = { ultra: 28, high: 24, low: 14, off: 10 };
function slabGeo(seg = 28) {
  const pts = [[0, 0], [0.5, 0], [1, 0], [1, -0.04], [0.93, -0.16], [0.78, -0.36], [0.55, -0.62], [0.28, -0.9], [0, -1.05]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return g;
}

function instanced(base, n) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  if (base.getAttribute('normal')) g.setAttribute('normal', base.getAttribute('normal'));
  g.instanceCount = n;
  return g;
}
const attr = (arr, size) => new THREE.InstancedBufferAttribute(arr, size);

export class Stage {
  constructor(canvas, opts = {}) {
    this.onTier = opts.onTier || (() => {});
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.5, 5000);
    this.scene.fog = new THREE.FogExp2(0x1a1420, 0.0012);
    this.rc = createRenderer({ canvas, context: opts.context, scene: this.scene, camera: this.camera, space: 'display', env: 'night', maxDpr: 1.75, adapt: true,
      bloom: { strength: 0.2, radius: 0.4, threshold: 0.88 }, grade: { grain: 0.02, vignette: 0.24, aberration: 0, saturation: 1.0 },
      onQuality: (lv) => { this.onTier(lv); } });
    this.renderer = this.rc.renderer;
    // night-3d look (olympus/look.js): a golden-hour grade in the finish pass, and on HD a gentle tilt-shift depth of field (the middle of the
    // view sharp, the far skyline and the near street soft: a city in miniature). No draw call; optional.
    this.lookFx = null;
    import('../olympus/look.js').then((L) => { this.lookFx = L.polish(this.rc, { grade: 'golden', mix: 0.3, focus: { x: 0.5, y: 0.5, r: 0.3, amount: 2.4 } }); }).catch(() => {});
    this.box5 = unitBox5();
    this.mode = 'hub';
    this.lights = [new THREE.HemisphereLight(0xffd8a8, 0x2a1c10, 0.9), new THREE.DirectionalLight(0xffcf9a, 1.4)];
    this.lights[1].position.set(0.4, 0.9, 0.3);
    this.scene.add(...this.lights);

    const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
    this.U = {
      uTime: { value: 0 }, uFog: { value: new THREE.Color(0x070a1c) }, uFogD: { value: 0.002 }, uDay: { value: 0 }, uGrow: { value: 1 }, uBobAmp: { value: 0 },
      uWinTint: { value: new THREE.Color(1, 0.84, 0.55) }, uAccent: { value: new THREE.Color(0xc8a24a) }, uPR: { value: 1 }, uSel: { value: 0 },
      uTop: { value: new THREE.Color(0x15121f) }, uMid: { value: new THREE.Color(0x3a2a3e) }, uLow: { value: new THREE.Color(0xb8704a) }, uStars: { value: 0.6 },
      uKind: { value: 0 }, uSun: { value: v3(-0.4, 0.55, -0.5) }, uFlash: { value: 0 }, uGround: { value: new THREE.Color(0x06101a) }, uCam: { value: v3(0, 0, 0) }, uPbr: { value: 1 },
    };
    const pick = (...n) => Object.fromEntries(n.map((k) => [k, this.U[k]]));
    this.pick = pick;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({ vertexShader: SH.SKY_VS, fragmentShader: SH.SKY_FS,
      uniforms: pick('uTop', 'uMid', 'uLow', 'uStars', 'uKind', 'uTime', 'uSun', 'uFlash', 'uAccent'), side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -2; this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), new THREE.ShaderMaterial({ vertexShader: SH.GROUND_VS, fragmentShader: SH.GROUND_FS,
      uniforms: pick('uGround', 'uAccent', 'uFog', 'uFogD', 'uTime', 'uCam', 'uDay'), extensions: { derivatives: true } }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.renderOrder = -1;
    this.scene.add(this.ground);

    this.hubG = new THREE.Group(); this.cityG = new THREE.Group();
    this.scene.add(this.hubG, this.cityG);
    this.cityG.visible = false;
    this._weather();
    this._fireworks();
    this.onFlash = null; this.flashPeriod = -1;
    this.sel = null; this.cityRec = null; this.hubRec = null;
    this.flashOn = false;
    this.tier = () => this.rc.quality();
    this.caps = () => TIERS[this.rc.quality()] || TIERS.high;
  }

  // ------------------------------------------------------------------ weather (one Points draw, GPU-animated around the camera)
  _weather() {
    const N = TIERS.ultra.wx, r = rng(9157), seeds = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) seeds[i] = r();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.wxU = { uCam: this.U.uCam, uTime: this.U.uTime, uPR: this.U.uPR, uBox: { value: new THREE.Vector3(70, 56, 70) }, uVel: { value: new THREE.Vector3() }, uSize: { value: 0.5 },
      uKind: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } };
    this.wx = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: SH.WX_VS, fragmentShader: SH.WX_FS, uniforms: this.wxU, transparent: true, depthWrite: false, fog: false }));
    this.wx.frustumCulled = false; this.wx.renderOrder = 6; this.wx.visible = false;
    this.scene.add(this.wx);
    this.wxKind = 'clear';
  }

  setWeather(name) {
    const w = WX[name], cap = this.caps().wx;
    this.wxKind = name;
    if (!w || !cap) { this.wx.visible = false; return; }
    this.wx.visible = true;
    this.wx.geometry.setDrawRange(0, Math.max(1, Math.floor(cap * w.share)));
    this.wxU.uBox.value.set(...w.box); this.wxU.uVel.value.set(...w.vel); this.wxU.uSize.value = w.size; this.wxU.uKind.value = w.k; this.wxU.uTint.value.setRGB(...w.tint);
  }

  // ------------------------------------------------------------------ fireworks (a record was set): ONE Points draw, all motion in the shader
  _fireworks() {
    const B = 4, M = 90, N = B * M, g = new THREE.BufferGeometry();
    this.fw = { B, M, i: 0, o: new Float32Array(N * 3), d: new Float32Array(N * 4), c: new Float32Array(N * 3), t: new Float32Array(N).fill(-99) };
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aOrigin', new THREE.BufferAttribute(this.fw.o, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(this.fw.d, 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.fw.c, 3)); g.setAttribute('aT0', new THREE.BufferAttribute(this.fw.t, 1));
    this.fwPoints = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: SH.FW_VS, fragmentShader: SH.FW_FS, uniforms: this.pick('uTime', 'uPR'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fwPoints.frustumCulled = false; this.fwPoints.renderOrder = 7;
    this.scene.add(this.fwPoints);
  }

  /** a burst of sparks at a world point (a record building): off / reduced tier draws none */
  fireworks(x, y, z, hex) {
    if (this.rc.quality() === 'off' || !this.fw) return false;
    const F = this.fw, k = F.i++ % F.B, r = rng((Date.now() & 0xffff) + k * 977), c = col3(hex || '#ffd95a'), w = col3(0xffffff).lerp(c, 0.45);
    const now = this.U.uTime.value;
    for (let j = 0; j < F.M; j++) {
      const n = k * F.M + j, a = r() * Math.PI * 2, e = Math.acos(2 * r() - 1), sp = 14 + r() * 26;
      F.o.set([x, y, z], n * 3); F.d.set([Math.sin(e) * Math.cos(a), Math.cos(e) * 0.8 + 0.25, Math.sin(e) * Math.sin(a), sp], n * 4);
      const m = r() < 0.5 ? c : w; F.c.set([m.r, m.g, m.b], n * 3); F.t[n] = now + (j % 3) * 0.04;
    }
    for (const a of ['aOrigin', 'aDir', 'aColor', 'aT0']) this.fwPoints.geometry.getAttribute(a).needsUpdate = true;
    return true;
  }

  // ------------------------------------------------------------------ scenery: a river with bridges, a harbor with piers and ships, or a railway with a train
  _scenery(spec, city, dispose) {
    const kind = spec.scenery;
    if (!kind) return null;
    const b = city.bounds, r = rng(hash32('scenery:' + spec.id)), P = spec.palette, zc = (b.minz + b.maxz) / 2, props = [], pad = city.pitch * 3 + 30;
    const add = (x, z, w, d, h, y0, color, glow = 0.3) => props.push([x, z, w, d, h, y0, rgb(color), glow]);
    let water = null, train = null;
    const wmat = () => new THREE.ShaderMaterial({ vertexShader: SH.WATER_VS, fragmentShader: SH.WATER_FS, transparent: true, depthWrite: false,
      uniforms: { ...this.pick('uCam', 'uTop', 'uLow', 'uAccent', 'uFog', 'uFogD', 'uTime', 'uSun'), uBend: { value: kind === 'river' ? 16 : 0 } } });
    if (kind === 'river') {
      const L = b.maxz - b.minz + 700, g = new THREE.PlaneGeometry(36, L, 1, 1);
      water = new THREE.Mesh(g, wmat()); water.rotation.x = -Math.PI / 2; water.position.set(b.maxx + pad + 20, 0.14, zc);
      for (let i = 0; i < 3; i++) { const z = zc + (i - 1) * (b.maxz - b.minz) * 0.32; add(b.maxx + pad + 20 + Math.sin(-(z - zc) * 0.012 + 1) * 16, z, 62, 6, 2.2, 3.4, P.districts[1], 0.5); }
    } else if (kind === 'harbor') {
      const g = new THREE.PlaneGeometry((b.maxx - b.minx) + 420, 190, 1, 1);
      water = new THREE.Mesh(g, wmat()); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.14, b.minz - pad - 95);
      for (let i = 0; i < 7; i++) add(b.minx + ((i + 0.5) / 7) * (b.maxx - b.minx), b.minz - pad - 8, 6, 44, 2.4, 0.4, P.districts[2], 0.35);
      for (let i = 0; i < 5; i++) { const x = b.minx + r() * (b.maxx - b.minx), z = b.minz - pad - 60 - r() * 110; add(x, z, 15, 38, 5, 0.5, P.districts[i % 4], 0.5); add(x, z + 4, 8, 9, 6, 5.2, '#e8ecf6', 0.2); }
    } else {
      const z = b.minz - pad - 12, len = (b.maxx - b.minx) + 520;
      add(0, z, len, 8, 0.5, 0.1, '#15161c', 0.05); add(0, z - 2.2, len, 0.7, 0.5, 0.6, P.accent, 0.9); add(0, z + 2.2, len, 0.7, 0.5, 0.6, P.accent, 0.9);
      for (let i = 0; i < 7; i++) add(0, z, 10, 4.6, 4.2, 1.2, i === 0 ? P.accent : P.districts[i % 5], 0.8);
      train = { z, len, x0: b.minx - 260, n: 7 };
    }
    const n = props.length, g = instanced(this.box5, n), ps = new Float32Array(n * 4), hy = new Float32Array(n * 4), cl = new Float32Array(n * 3), sd = new Float32Array(n), bob = new Float32Array(n);
    props.forEach((p, i) => { ps.set([p[0], p[1], p[2], p[3]], i * 4); hy.set([p[4], p[5], p[7], 0.5], i * 4); cl.set(p[6], i * 3); sd[i] = r(); });
    g.setAttribute('aPosSize', attr(ps, 4)); g.setAttribute('aHY', attr(hy, 4)); g.setAttribute('aColor', attr(cl, 3)); g.setAttribute('aState', attr(new Float32Array(n * 2), 2)); g.setAttribute('aSeed', attr(sd, 1)); g.setAttribute('aBob', attr(bob, 1));
    const m = this.buildMat(), mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2;
    this.cityG.add(mesh); dispose.push(g, m);
    if (water) { water.renderOrder = 1; water.frustumCulled = false; this.cityG.add(water); dispose.push(water.geometry, water.material); }
    if (train) { train.attr = g.getAttribute('aPosSize'); train.first = n - train.n; }
    return { kind, mesh, water, train, props: n };
  }

  // ------------------------------------------------------------------ the look of a city (or of the hub when spec is null)
  look(spec, hubPal, night = false) {
    const U = this.U;
    const kind = spec && !night ? spec.sky.kind : 'dusk', own = spec && !night ? spec.sky : null;
    const AG = AGORA_SKY[kind === 'day' ? 'day' : kind === 'dawn' ? 'dawn' : 'dusk'];
    const sk = { kind: kind === 'day' ? 'day' : kind === 'dawn' ? 'dawn' : 'dusk', top: AG.top, mid: AG.mid, low: AG.low, stars: AG.stars };
    if (own) for (const k of ['top', 'mid', 'low']) sk[k] = '#' + col3(AG[k]).lerp(col3(own[k]), 0.12).getHexString();
    const pal = spec ? spec.palette : hubPal || { accent: '#c8a24a', ground: '#1c1610', fog: '#1a1420' };
    U.uTop.value.set(sk.top); U.uMid.value.set(sk.mid); U.uLow.value.set(sk.low); U.uStars.value = sk.stars; U.uKind.value = SKY_KIND[sk.kind] ?? 1;
    U.uSun.value.set(...(SUN[sk.kind] || SUN.dusk));
    U.uDay.value = DAYF[sk.kind] ?? 0;
    const f = col3(sk.kind === 'day' ? sk.mid : '#8a7298').lerp(col3(sk.low), 0.32);
    U.uFog.value.copy(f); this.scene.fog.color.copy(f);
    U.uGround.value.set(AG.ground).lerp(col3(pal.ground), 0.1); U.uAccent.value.set('#c8a24a');
    U.uWinTint.value.setRGB(1, 0.8, 0.5);
    this.rc.setBloom({ strength: sk.kind === 'day' ? 0.1 : 0.2, tint: 0xffffff });
    this.setWeather(spec ? spec.weather : 'fog');
    U.uPbr.value = { ultra: 1, high: 0.8, low: 0.5, off: 0 }[this.rc.quality()] ?? 0.7;
    this.lights[0].color.set(sk.kind === 'day' ? 0xdfeaf2 : 0xffd8a8); this.lights[0].groundColor.set(sk.kind === 'day' ? 0x6a5a44 : 0x2a1c10);
    this.lights[0].intensity = sk.kind === 'day' ? 1.5 : 1.3;
    this.lights[1].color.set(sk.kind === 'day' ? 0xfff0d0 : 0xffcf9a);
    this.lights[1].intensity = sk.kind === 'day' ? 2.0 : 1.1;
  }

  setFogRadius(r) { const d = 1.18 / Math.max(60, r * 2.6); this.U.uFogD.value = d; this.scene.fog.density = d * 0.9; }

  // ------------------------------------------------------------------ the hub
  clearHub() {
    if (this.hubRec) { this.hubG.clear(); this.hubRec.dispose.forEach((o) => o.dispose()); this.hubRec = null; }
  }

  /** islands: [{ x, y, z, R, top: '#', rim: '#', seed }]; slots = miniature instances per island */
  buildHub(islands, slots, network) {
    this.clearHub();
    const n = islands.length, dispose = [];
    const sg = instanced(slabGeo(SLAB_SEG[this.rc.quality()] || 24), n), pos = new Float32Array(n * 4), top = new Float32Array(n * 3), rim = new Float32Array(n * 3), seed = new Float32Array(n), dim = new Float32Array(n);
    islands.forEach((is, i) => {
      pos.set([is.x, is.y, is.z, is.R], i * 4); top.set(rgb(is.top), i * 3); rim.set(rgb(is.rim), i * 3); seed[i] = is.seed;
    });
    sg.setAttribute('aPosScale', attr(pos, 4)); sg.setAttribute('aTop', attr(top, 3)); sg.setAttribute('aRim', attr(rim, 3)); sg.setAttribute('aSeed', attr(seed, 1));
    const dimA = attr(dim, 1); dimA.setUsage(THREE.DynamicDrawUsage); sg.setAttribute('aDim', dimA);
    const slab = new THREE.Mesh(sg, new THREE.ShaderMaterial({ vertexShader: SH.SLAB_VS, fragmentShader: SH.SLAB_FS, uniforms: this.pick('uTime', 'uFog', 'uFogD') }));
    slab.frustumCulled = false;
    // the miniatures: one instanced draw for every island
    const total = n * slots, mg = instanced(this.box5, total);
    const A = { ps: new Float32Array(total * 4), hy: new Float32Array(total * 4), col: new Float32Array(total * 3), st: new Float32Array(total * 2), sd: new Float32Array(total), bob: new Float32Array(total) };
    for (let i = 0; i < n; i++) A.bob.fill(islands[i].seed, i * slots, (i + 1) * slots);
    mg.setAttribute('aPosSize', attr(A.ps, 4)); mg.setAttribute('aHY', attr(A.hy, 4)); mg.setAttribute('aColor', attr(A.col, 3)); mg.setAttribute('aState', attr(A.st, 2));
    mg.setAttribute('aSeed', attr(A.sd, 1)); mg.setAttribute('aBob', attr(A.bob, 1));
    const minis = new THREE.Mesh(mg, this.buildMat());
    minis.frustumCulled = false;
    // Elevated lightways make the world connected; all arcs remain ONE draw call.
    const links = Array.isArray(network) ? network : network?.links || [];
    const bridges = new Set((network?.bridges || []).map(([a,b]) => `${a}:${b}`));
    const rp = [], rcol = [], steps = ['low','off'].includes(this.rc.quality()) ? 5 : 12;
    const point = (a,b,t) => [a.x+(b.x-a.x)*t, a.y+(b.y-a.y)*t+Math.sin(t*Math.PI)*Math.hypot(a.x-b.x,a.z-b.z)*.16, a.z+(b.z-a.z)*t];
    for (const [ai, bi] of links) {
      const a=islands[ai], b=islands[bi], ca=col3(a.rim), cb=col3(b.rim);
      const bridge = bridges.has(`${ai}:${bi}`);
      for(let j=0;j<steps;j++) for(const u of [j/steps,(j+1)/steps]) { rp.push(...point(a,b,u));const c=ca.clone().lerp(cb,u).multiplyScalar(bridge ? 1.55 : 1.2);rcol.push(c.r,c.g,c.b); }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));lg.setAttribute('color',new THREE.Float32BufferAttribute(rcol,3));
    const routes = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors:true, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    routes.frustumCulled = false;
    // Tiny aircraft lights share a single Points draw; no traffic in LITE or reduced motion.
    const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flightPaths = !still && ['high','ultra'].includes(this.rc.quality()) ? links.filter((_,i)=>i%5===0).slice(0,36).map(([a,b])=>[islands[a],islands[b]]) : [];
    const fg=new THREE.BufferGeometry(), fp=new Float32Array(flightPaths.length*9);
    fg.setAttribute('position',new THREE.BufferAttribute(fp,3));
    const flights=new THREE.Points(fg,new THREE.PointsMaterial({color:0xdaf6ff,size:5,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
    flights.visible=!!flightPaths.length;flights.frustumCulled=false;
    const ap = new Float32Array(n * 3), ac = new Float32Array(n * 3), asz = new Float32Array(n), asd = new Float32Array(n);
    islands.forEach((is, i) => { ap.set([is.x, is.y + is.R * 0.05, is.z], i * 3); ac.set(rgb(is.rim), i * 3); asz[i] = is.R * 0.55; asd[i] = is.seed; });
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(ap, 3)); gg.setAttribute('aColor', new THREE.BufferAttribute(ac, 3));
    gg.setAttribute('aSize', new THREE.BufferAttribute(asz, 1)); gg.setAttribute('aSeed', new THREE.BufferAttribute(asd, 1));
    const aura = new THREE.Points(gg, new THREE.ShaderMaterial({ vertexShader: SH.GLOW_VS, fragmentShader: SH.GLOW_FS, uniforms: this.pick('uPR', 'uTime'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.frustumCulled = false; aura.renderOrder = 4;
    // selection ring + beam
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 72), new THREE.MeshBasicMaterial({ color: 0xffd95a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    ring.rotation.x = Math.PI / 2; ring.visible = false; ring.frustumCulled = false;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.5, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd95a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beam.visible = false; beam.frustumCulled = false;
    this.hubG.add(slab, minis, routes, flights, aura, ring, beam);
    dispose.push(sg, slab.material, mg, minis.material, lg, routes.material, fg, flights.material, gg, aura.material, ring.geometry, ring.material, beam.geometry, beam.material);
    this.hubRec = { n, slots, islands, A, minis, slab, dimA, ring, beam, dispose, flights, flightPaths, point };
  }

  buildMat(scenery = false) {
    return new THREE.ShaderMaterial({ vertexShader: SH.BUILD_VS, fragmentShader: SH.BUILD_FS, uniforms: { ...this.pick('uTime', 'uFog', 'uFogD', 'uDay', 'uGrow', 'uBobAmp', 'uWinTint', 'uSel', 'uCam', 'uTop', 'uLow', 'uSun', 'uPbr'), uScenery: { value: scenery ? 1 : 0 } } });
  }

  /** write one island's miniature (a generated city) into its slots; city null clears them */
  setMini(i, city) {
    const R = this.hubRec; if (!R) return;
    const { A, slots, islands } = R, is = islands[i], o = i * slots;
    const s = city ? (is.R * 0.8) / city.bounds.r : 0, hk = s * 2.3, hcap = is.R * 1.7;
    for (let k = 0; k < slots; k++) {
      const j = o + k;
      if (!city || k >= city.n) { A.ps.fill(0, j * 4, j * 4 + 4); A.hy.fill(0, j * 4, j * 4 + 4); continue; }
      const wk = clamp(city.w[k] * s * 1.2, 0.5, is.R * 0.13);
      A.ps.set([is.x + city.x[k] * s, is.z + city.z[k] * s, wk, wk], j * 4);
      A.hy.set([Math.min(hcap, Math.max(0.5, city.h[k] * hk)), is.y + 0.35, city.glow[k], city.win[k]], j * 4);
      A.col.set(city.col.subarray(k * 3, k * 3 + 3), j * 3);
      A.sd[j] = city.seed[k];
    }
    for (const a of ['aPosSize', 'aHY', 'aColor', 'aSeed']) R.minis.geometry.getAttribute(a).needsUpdate = true;
  }

  /** dim[i] = 1 draws island i faded (a filter); null clears */
  setHubDim(dim) {
    const R = this.hubRec; if (!R) return;
    for (let i = 0; i < R.n; i++) {
      const d = dim && dim[i] ? 1 : 0;
      R.dimA.array[i] = d;
      for (let k = 0; k < R.slots; k++) R.A.st[(i * R.slots + k) * 2] = d;       // the minis' dim is aState.x
    }
    R.dimA.needsUpdate = true;
    R.minis.geometry.getAttribute('aState').needsUpdate = true;
  }

  selectIsland(i) {
    const R = this.hubRec; if (!R) return;
    if (i < 0) { R.ring.visible = R.beam.visible = false; return; }
    const is = R.islands[i];
    R.ring.visible = R.beam.visible = true;
    R.ring.position.set(is.x, is.y + 0.5, is.z); R.ring.scale.setScalar(is.R * 1.08);
    R.beam.position.set(is.x, is.y + is.R * 2.5, is.z); R.beam.scale.set(is.R * 0.9, is.R * 5, is.R * 0.9);
  }

  // ------------------------------------------------------------------ a city
  clearCity() {
    if (!this.cityRec) return;
    this.cityG.clear();
    this.cityRec.dispose.forEach((o) => o.dispose());
    this.cityRec.metropolis?.dispose();
    disposeGroup(this.cityRec.landmark);
    this.cityRec = null;
  }

  buildCity(spec, city) {
    this.clearCity();
    const n = city.n, dispose = [], tier = this.caps();
    const g = instanced(this.box5, n);
    const ps = new Float32Array(n * 4), hy = new Float32Array(n * 4), st = new Float32Array(n * 2), bob = new Float32Array(n);
    for (let k = 0; k < n; k++) { ps.set([city.x[k], city.z[k], city.w[k], city.d[k]], k * 4); hy.set([city.h[k], city.y0[k], city.glow[k], city.win[k]], k * 4); }
    g.setAttribute('aPosSize', attr(ps, 4)); g.setAttribute('aHY', attr(hy, 4)); g.setAttribute('aColor', attr(city.col, 3));
    const stA = attr(st, 2); stA.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aState', stA);
    g.setAttribute('aSeed', attr(city.seed, 1)); g.setAttribute('aBob', attr(bob, 1));
    const bm = this.buildMat(), mesh = new THREE.Mesh(g, bm);
    mesh.frustumCulled = false; mesh.renderOrder = 2;
    this.cityG.add(mesh);
    dispose.push(g, bm);
    // district pads
    if (['districts', 'clock', 'calendar'].includes(city.layout) && city.districts.length) {
      const m = city.districts.length, pg = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m), rect = new Float32Array(m * 4), pc = new Float32Array(m * 3);
      city.districts.forEach((d, i) => {
        const pad = city.pitch * 0.9;
        rect.set([(d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2, (d.x1 - d.x0) / 2 + pad, (d.z1 - d.z0) / 2 + pad], i * 4); pc.set(rgb(d.color), i * 3);
      });
      pg.setAttribute('aRect', attr(rect, 4)); pg.setAttribute('aColor', attr(pc, 3));
      const pm = new THREE.ShaderMaterial({ vertexShader: SH.PAD_VS, fragmentShader: SH.PAD_FS, uniforms: this.pick('uFog', 'uFogD'), transparent: true, depthWrite: false });
      const pads = new THREE.Mesh(pg, pm); pads.frustumCulled = false; pads.renderOrder = 1;
      this.cityG.add(pads); dispose.push(pg, pm);
    }
    // roof glow
    const order = Array.from({ length: n }, (_, k) => k).filter((k) => city.glow[k] > 0.72).sort((a, b) => city.glow[b] - city.glow[a] || a - b).slice(0, tier.glow);
    if (order.length) {
      const m = order.length, p = new Float32Array(m * 3), c = new Float32Array(m * 3), sz = new Float32Array(m), sd = new Float32Array(m);
      order.forEach((k, i) => { p.set([city.x[k], city.h[k] + 0.6, city.z[k]], i * 3); c.set(city.col.subarray(k * 3, k * 3 + 3), i * 3); sz[i] = 2.5 + city.w[k] * 0.55 + city.glow[k] * 3; sd[i] = city.seed[k]; });
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(p, 3)); gg.setAttribute('aColor', new THREE.BufferAttribute(c, 3)); gg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); gg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      const gm = new THREE.ShaderMaterial({ vertexShader: SH.GLOW_VS, fragmentShader: SH.GLOW_FS, uniforms: this.pick('uPR', 'uTime'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(gg, gm); pts.frustumCulled = false; pts.renderOrder = 4;
      this.cityG.add(pts); dispose.push(gg, gm);
    }
    // landmark
    const lm = buildLandmark(spec.landmark.kind, warmHex(spec.palette.accent), city.site.scale);
    lm.position.set(city.site.x, 0, city.site.z);
    this.cityG.add(lm);
    const scenery = this._scenery(spec, city, dispose);
    const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const metropolis = buildMetropolis(city, spec, this.box5, this.buildMat(true), this.tier(), still);
    this.cityG.add(metropolis.group);
    // selection: a beam + ring on the chosen building
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd95a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd95a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    ring.rotation.x = Math.PI / 2;
    beam.visible = ring.visible = false; beam.frustumCulled = ring.frustumCulled = false;
    this.cityG.add(beam, ring);
    dispose.push(beam.geometry, beam.material, ring.geometry, ring.material);
    this.cityRec = { spec, city, mesh, stA, landmark: lm, beam, ring, dispose, scenery, metropolis, t0: 0 };
    this.U.uGrow.value = 0;
    return this.cityRec;
  }

  /** dimmed(k) -> true to fade building k (a search); null clears */
  setDim(fn) {
    const R = this.cityRec; if (!R) return;
    const a = R.stA.array, n = R.city.n;
    for (let k = 0; k < n; k++) a[k * 2] = fn && fn(k) ? 1 : 0;
    R.stA.needsUpdate = true;
  }

  setSelected(k) {
    const R = this.cityRec; if (!R) return;
    const a = R.stA.array, n = R.city.n;
    if (R.sel !== undefined && R.sel >= 0 && R.sel < n) a[R.sel * 2 + 1] = 0;
    R.sel = k;
    if (k >= 0 && k < n) {
      a[k * 2 + 1] = 1;
      const c = R.city, top = c.y0[k] + c.h[k];
      R.beam.visible = R.ring.visible = true;
      R.beam.position.set(c.x[k], top + 60, c.z[k]); R.beam.scale.set(Math.max(1, c.w[k] * 0.4), 120, Math.max(1, c.w[k] * 0.4));
      R.ring.position.set(c.x[k], 0.4, c.z[k]); R.ring.scale.setScalar(c.w[k] * 1.2 + 2);
    } else R.beam.visible = R.ring.visible = false;
    R.stA.needsUpdate = true;
  }

  show(mode) {
    this.mode = mode;
    this.hubG.visible = mode === 'hub';
    this.cityG.visible = mode === 'city';
    this.U.uBobAmp.value = 0;
    this.ground.visible = mode === 'city';
    this.rcHubFog();
  }
  rcHubFog() { this.scene.fog.density = this.U.uFogD.value * 0.9; }

  // ------------------------------------------------------------------ per frame
  update(dt, t) {
    const U = this.U;
    U.uTime.value = t;
    U.uPR.value = this.renderer.getPixelRatio();
    U.uCam.value.copy(this.camera.position);
    this.sky.position.copy(this.camera.position);
    if (this.mode === 'city' && U.uGrow.value < 1) U.uGrow.value = Math.min(1, U.uGrow.value + dt * 0.55);
    if (this.mode === 'hub') { U.uBobAmp.value = 1.2; U.uGrow.value = 1; }
    if(this.mode==='hub' && this.hubRec?.flightPaths.length){
      const H=this.hubRec, a=H.flights.geometry.getAttribute('position');
      H.flightPaths.forEach(([p,q],i)=>{for(let j=0;j<3;j++){const u=((t*.045+i*.173-j*.014)%1+1)%1;a.array.set(H.point(p,q,u),(i*3+j)*3);}});
      a.needsUpdate=true;
    }
    if (this.cityRec) {
      this.cityRec.metropolis?.update(t);
      spinLandmark(this.cityRec.landmark, dt);
      const tr = this.cityRec.scenery && this.cityRec.scenery.train;
      if (tr) {
        const a = tr.attr.array;
        for (let i = 0; i < tr.n; i++) { const x = tr.x0 + (((t * 22 - i * 11.5) % tr.len) + tr.len) % tr.len; a[(tr.first + i) * 4] = x; }
        tr.attr.needsUpdate = true;
      }
    }
    if (this.wxKind === 'storm') {
      const p = t % 3.7, hit = hash32('storm' + Math.floor(t / 3.7)) % 100 > 55;
      U.uFlash.value = hit ? Math.max(0, 1 - p / 0.35) * (p < 0.12 || (p > 0.2 && p < 0.3) ? 1 : 0.4) : 0;
      const per = Math.floor(t / 3.7);
      if (hit && p < 0.3 && per !== this.flashPeriod) { this.flashPeriod = per; if (this.onFlash) this.onFlash(); }
    } else U.uFlash.value = 0;
  }

  /** screen -> ray (x, y in CSS pixels of the canvas) */
  ray(x, y, w, h) {
    const v = new THREE.Vector3((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5).unproject(this.camera);
    const o = this.camera.position, d = v.sub(o).normalize();
    return { o: { x: o.x, y: o.y, z: o.z }, d: { x: d.x, y: d.y, z: d.z } };
  }
  /** world point -> { x, y (CSS pixels), z (depth), on } */
  project(wx, wy, wz, w, h) {
    const v = new THREE.Vector3(wx, wy, wz).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, z: v.z, on: v.z > -1 && v.z < 1 };
  }

  stats() {
    const s = this.rc.stats();
    return { tier: s.quality, calls: s.calls, triangles: s.triangles, passes: s.passes, fps: s.fps, dpr: s.dpr, programs: s.programs, mode: this.mode };
  }
  frame() { return this.rc.draw ? this.rc.draw() : this.rc.render(); }      // a photo / the stats: a fresh frame now (render() may wait for the idle frame gap)
  start(cb) { this.rc.start(cb); }
  dispose() { this.rc.dispose(); }
}



