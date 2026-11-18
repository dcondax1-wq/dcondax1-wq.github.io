// The outskirts: a ring of decorative towers round the data districts so the city has no edge (about 2,600 towers, ONE instanced
// draw, the same neon-window shader as the data buildings). They are scenery, not data: no tap, no card, no result behind them.
// Tall spires stand nearer the districts, a few gold-lit megatowers mark the ring, everything fades into the fog.
import * as THREE from '../jarvis/three.module.min.js';
import * as SH from './shaders.js';
import { towerGeo, archUniforms } from './skyline.js';
import { PROFILES } from './caps.js';
import { boulevardPlan, skylineForm } from './districtform.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const COUNT = { hq: 2600, lq: 900 };
const PALETTE = [(NEON ? 0x3a5fb5 : 0x7d6a52), (NEON ? 0x4f8cff : 0x78a1c1), (NEON ? 0x7fe9ff : 0xdaa56f), (NEON ? 0xa68bff : 0xcdbf9f), (NEON ? 0x6a7bd8 : 0x9a8a72), (NEON ? 0xc9b8ff : 0xdba875), (NEON ? 0xffc94a : 0xd39556)];
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export class Outskirts {
  /** L: layout(); U: the scene uniforms; avoid: [{ x, z, r }] places to keep clear (the acropolis); quality */
  constructor(L, U, quality, avoid = [], caps = PROFILES.full) {   // avoid: circles { x, z, r } to keep clear (the acropolis, the river)
    const rnd = mulberry(23), ds = L.districts.filter((d) => d.kind !== 'harbor');
    const R0 = Math.max(120, ...ds.map((d) => Math.hypot(Math.abs(d.cx) + d.half, Math.abs(d.cz) + d.half))) + 26, R1 = R0 + 210;
    const hb = L.harbor, cell = 3.6, seen = new Set(), list = [];
    const blocked = (x, z, pad = 0) => (hb && x > hb.x0 - 24 - pad && x < hb.x1 + 24 + pad && z > hb.z0 - 24 - pad && z < hb.z1 + 30 + pad)
      || avoid.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad);
    const want = Math.min(COUNT.hq, caps.outskirts);
    for (let tries = 0; tries < want * 4 && list.length < want; tries++) {
      const a = rnd() * Math.PI * 2, r = R0 + (R1 - R0) * Math.pow(rnd(), 0.8);
      const x = Math.round((Math.cos(a) * r) / cell) * cell, z = Math.round((Math.sin(a) * r) / cell) * cell, key = x + ',' + z;
      if (seen.has(key)) continue;
      if (blocked(x, z)) continue;
      if (ds.some((d) => Math.abs(x - d.cx) < d.half + 14 && Math.abs(z - d.cz) < d.half + 14)) continue;
      seen.add(key);
      const t = (Math.hypot(x, z) - R0) / (R1 - R0), seed = rnd(), form = skylineForm(a, t, seed);
      const h = form.height, w = form.width;
      list.push({ x, z, h, w, color: form.crown && rnd() < 0.62 ? (NEON ? 0xffc94a : 0xd39556) : PALETTE[Math.floor(rnd() * 6)],
        lit: 0.5 + rnd() * 0.46, seed, crown: form.crown });
    }
    const n = list.length;
    const aColor = new Float32Array(n * 3), aData = new Float32Array(n * 4), aState = new Float32Array(n * 4), aSeed = new Float32Array(n), aLook = new Float32Array(n * 4);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const g = towerGeo(4);                                    // the same tiered towers as the data districts (30 triangles each)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R1 + 80);
    this.mesh = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ vertexShader: SH.BUILD_VS, fragmentShader: SH.BUILD_FS,
      uniforms: { uTime: U.uTime, uFog: U.uFog, uFogD: U.uFogD, uHaze: U.uHaze, uDay: U.uDay, uToday: { value: 0 }, uWet: U.uWet, uGrow: U.uGrow, uMirror: { value: 0 },
                  uDusk: U.uDusk, uCloud: U.uCloud, uSun: U.uSun, uAccent: U.uAccent, uFlash: U.uFlash, ...archUniforms() } }), n);
    list.forEach((b, i) => {
      m4.makeScale(b.w, b.h, b.w).setPosition(b.x, 0, b.z);
      this.mesh.setMatrixAt(i, m4);
      c.setHex(b.color); aColor.set([c.r, c.g, c.b], i * 3);
      aData.set([b.h, b.lit, b.crown ? 1 : 0, 0], i * 4);
      aState[i * 4 + 2] = 1;
      aLook.set([b.crown ? 1 : Math.floor(b.seed * 9.99) % 10, 0.45 + b.seed * 0.3, 0, 0], i * 4);       // scenery: all the building types, mid-steady windows
      aSeed[i] = b.seed;
    });
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
    g.setAttribute('aData', new THREE.InstancedBufferAttribute(aData, 4));
    g.setAttribute('aState', new THREE.InstancedBufferAttribute(aState, 4));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
    g.setAttribute('aLook', new THREE.InstancedBufferAttribute(aLook, 4));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.userData.decor = true;
    this.total = n;
    this.radius = [R0, R1];
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    // Two elevated, glowing orbital boulevards visually connect the outer clusters.
    // They are scenery only and deliberately skip harbor / landmark clearance zones.
    this.boulevards = [R0 + 48, R0 + 124].map((radius, ring) => {
      const plan = boulevardPlan(radius, (x, z) => blocked(x, z, 5));
      const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, ring ? 0.52 : 0.68), new THREE.MeshBasicMaterial({
        color: ring ? (NEON ? 0xff8b45 : 0xd5995d) : (NEON ? 0x54dcff : 0x84aac7), transparent: true, opacity: ring ? 0.42 : 0.58,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }), plan.length);
      plan.forEach((s, i) => {
        m4.makeRotationY(s.angle);
        m4.scale(new THREE.Vector3(s.length, 1, 1));
        m4.setPosition(s.x, 0.22 + ring * 0.05, s.z);
        deck.setMatrixAt(i, m4);
      });
      deck.instanceMatrix.needsUpdate = true;
      deck.renderOrder = 3;
      deck.frustumCulled = false;
      deck.userData.decor = true;
      this.group.add(deck);
      return deck;
    });
    this.setQuality(quality);
  }

  setQuality(q, caps) {
    this.mesh.count = Math.min(this.total, caps?.outskirts ?? COUNT[q] ?? COUNT.hq);
    if (this.boulevards) this.boulevards[1].visible = q === 'hq';
  }
}
