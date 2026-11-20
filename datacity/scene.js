// The Data City's three.js world: the market-clock sky, the wet ground and streets, the skyline (tiles + LOD impostors,
// skyline.js), glow sprites, street trades, the LIT tower, district signs, the harbor, and the effects (fx.js). No DOM beyond
// the canvas and the billboards' canvases; city.js drives it.
import * as THREE from '../jarvis/three.module.min.js';
import { COLORS } from './util.js';
import * as SH from './shaders.js?v=dcgfx12';
import { Skyline, pick } from './skyline.js?v=dcgfx16';
import { Rays, SunRays, FogLayers, Rain, Traffic, Beam, Billboards } from './fx.js?v=dcgfx16';
import { createRenderer } from '../olympus/render.js';          // the OLYMPUS render core: ACES, MSAA, bloom, the film finish, tiers
import { Landmarks } from './landmarks.js';
import { Outskirts } from './outskirts.js?v=dcgfx6';
import { SatelliteTowns } from './towns.js?v=dcgfx6';
import { Streams } from './streams.js?v=dcgfx4';
import { routes } from './routes.js';
import { Cars, Flyers, Airships, Monorail } from './vehicles.js?v=dcgfx16';
import { River, Ships } from './water.js?v=dcgfx16';
import { Signs } from './signs.js?v=dcgfx16';
import { Fireworks } from './fireworks.js?v=dcgfx15';
import { KitFx } from './kitfx.js?v=dcgfx15';
import { PROFILES, phoneHint, profileOf } from './caps.js?v=dcgfx3';
import { Link } from './links.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble
import { ARCH } from './kinds.js';
const ARCH_CROWN = ARCH.map((a) => a[2]);       // the crown / spire above the roof, per building type (the blinker sits on its tip)

// revamp 2026-11-20 (research/handoff/2026-11-20/revamp-cities/LOOK.md): the fog IS the horizon colour (blue hour, the city's warm glow in it)
const FOG = { night: (NEON ? 0x1b2134 : 0x3a2e46), day: (NEON ? 0x7f8fab : 0xc2cfd2), dusk: (NEON ? 0x8a6a72 : 0x7a4a52), storm: (NEON ? 0x2a303c : 0x4c4650) };
const DENSITY = { night: 0.00105, day: 0.0008 };     // revamp: a little thinner (the height fog in shaders.js FOG adds the ground layer)
const FLOW = { hq: 1600, lq: 420 };
const STARS = { hq: 1800, lq: 450 };
const PINS = 64;

const golden = (i) => (i * 0.6180339) % 1;

function points(attrs, material) {
  const g = new THREE.BufferGeometry();
  for (const [name, [arr, size]] of Object.entries(attrs)) g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  return new THREE.Points(g, material);
}

export function textSprite(text, color, size = 1) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    g.clearRect(0, 0, 512, 96);
    g.font = (NEON ? '800 44px Orbitron, Rajdhani, -apple-system, system-ui, sans-serif' : '800 44px Georgia, Georgia, -apple-system, system-ui, sans-serif'); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color;
    g.fillText(text.split('').join(String.fromCharCode(8202)), 256, 50);
    tex.needsUpdate = true;
  };
  draw();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.userData.redraw = draw;
  s.scale.set(16 * size, 3 * size, 1);
  s.renderOrder = 10;
  return s;
}

/** Several lines of text in ONE sprite (one draw call): lines = [[text, colour, size, y], ...] in world units, as textSprite would place each. */
export function textSprite2(lines) {
  const top = Math.max(...lines.map(([, , s, y]) => y + 1.5 * s)), bot = Math.min(...lines.map(([, , s, y]) => y - 1.5 * s)), H = top - bot, W = 16 * Math.max(...lines.map((l) => l[2]));
  const ppu = 32, c = document.createElement('canvas');               // 32 canvas pixels per world unit, as textSprite (512 px for 16 units)
  c.width = Math.round(W * ppu); c.height = Math.round(H * ppu);
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [text, color, size, y] of lines) {
      g.font = `800 ${Math.round(44 * size)}px ${NEON ? 'Orbitron, Rajdhani' : 'Georgia, Georgia'}, -apple-system, system-ui, sans-serif`;
      g.shadowColor = color; g.shadowBlur = 18 * size; g.fillStyle = color;
      g.fillText(text.split('').join(String.fromCharCode(8202)), c.width / 2, (top - y) * ppu + 2 * size);
    }
    tex.needsUpdate = true;
  };
  draw();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.userData.redraw = draw;
  s.scale.set(W, H, 1);
  s.position.set(0, (top + bot) / 2, 0);
  s.renderOrder = 10;
  return s;
}

export class CityScene {
  /** canvas; L: layout(); opts: { quality, winRate (street colours), billboards: [...] } */
  constructor(canvas, L, opts) {
    this.L = L;
    this.quality = opts.quality;
    this.onTier = opts.onTier || (() => {});
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(FOG.night, DENSITY.night);        // the few built-in materials (piers, rings, landmarks)
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 3200);
    // the render core in 'display' space: this city's shaders write screen colours (windows, neon, glows), so bloom reads the
    // 0..1 screen value; the PBR landmarks tone-map themselves. Tier from OLYMPUS.fx() (followed live); the app steps down itself.
    this.phone = phoneHint();                                  // v3: a phone gets the phone-safe caps (caps.js) and a pixel ratio of at most 1.5
    this.rc = createRenderer({ canvas, scene: this.scene, camera: this.camera, space: 'display', env: 'night', adapt: false, maxDpr: this.phone ? PROFILES.phone.dpr : PROFILES.full.dpr,
      bloom: { strength: (NEON ? 0.42 : 0.2), radius: (NEON ? 0.55 : 0.4), threshold: (NEON ? 0.86 : 0.86) }, grade: { grain: (NEON ? 0.02 : 0.02), vignette: (NEON ? 0.3 : 0.24), aberration: (NEON ? 0 : 0), saturation: (NEON ? 1.02 : 0.92) },
      bloomMax: NEON ? 0.7 : undefined,                       // the neon night glows (the AGORA cap .25 holds for the marble look)
      onQuality: (lv) => this._tier(lv) });
    // the look pass (olympus/look.js): a colour grade in the ONE finish pass (0 draw calls); no depth of field (the district names stay sharp)
    import('../olympus/look.js').then((L) => { this.lookFx = L.polish(this.rc, NEON ? { grade: 'night', mix: 0.28 }
      : { grade: 'dusk', mix: 0.35 }); }).catch(() => {});
    this.renderer = this.rc.renderer;
    this.quality = this.rc.quality() === 'low' || this.rc.quality() === 'off' ? 'lq' : 'hq';
    this.profile = profileOf(this.rc.quality(), this.phone, !!window.OLYMPUS?.saver?.());
    this.caps = PROFILES[this.profile];
    const v3 = () => new THREE.Vector3();
    this.U = { uTime: { value: 0 }, uFog: { value: new THREE.Color().setHex(FOG.night, THREE.LinearSRGBColorSpace) }, uFogD: { value: DENSITY.night }, uHaze: { value: 0.2 },
               uDay: { value: 0 }, uDusk: { value: 0 }, uToday: { value: 0 }, uWet: { value: 0.6 }, uRain: { value: 0 }, uPR: { value: 1 },
               uAccent: { value: new THREE.Color((NEON ? 0x3fd8ff : 0xd39556)) }, uSun: { value: v3().set(0, -1, 0) }, uCloud: { value: 0 }, uFlash: { value: 0 },
               uGrow: { value: opts.calm ? 1 : 0 }, uFlow: { value: 1 } };  // the rise on load (0 -> 1); the data streams' speed
    this.flash = 0;
    this.storm = false;
    this.bloomK = -1;
    this._sky();
    this._ground();
    this.skyline = new Skyline(L, this.U, this.quality, this.caps);
    this.scene.add(this.skyline.group);
    this.towns = new SatelliteTowns(L, this.U, this.quality, this.caps);
    this.scene.add(this.towns.group);
    this._glow();
    this._blinkers();
    this._streets(opts.winRate);
    this._tower();
    this._names();
    this._harbor();
    this._pins();
    this.lm = new Landmarks(L, this.quality); this.scene.add(this.lm.group);
    this.R = routes(L);                                      // v3: the monorail loop and the river, clear of every district
    const clear = [{ x: this.lm.site.x, z: this.lm.site.z, r: 110 }];
    for (let i = 0; i < this.R.river.length; i += 2) clear.push({ x: this.R.river[i][0], z: this.R.river[i][1], r: this.R.riverW + 4 });
    for (let i = 0; i < this.R.rail.length; i += 3) clear.push({ x: this.R.rail[i][0], z: this.R.rail[i][1], r: 7 });
    this.outskirts = new Outskirts(L, this.U, this.quality, clear, this.caps); this.scene.add(this.outskirts.group);
    this.streams = new Streams(L, this.lm, this.U, this.quality); this.scene.add(this.streams.group);
    this.rays = new Rays(L, this.U); this.scene.add(this.rays.mesh);
    this.sunRays = new SunRays(this.U); this.scene.add(this.sunRays.mesh);
    this.fog = new FogLayers(this.U, this.quality); this.scene.add(this.fog.group);
    this.rain = new Rain(this.U, this.quality); this.scene.add(this.rain.lines);
    this.traffic = new Traffic(L, this.U, this.quality); this.scene.add(this.traffic.points);
    this.beam = new Beam(this.U); this.scene.add(this.beam.mesh, this.beam.ring);
    this.boards = new Billboards(this.U, opts.billboards || [], this.caps.boards); this.scene.add(this.boards.group);
    // v3: the river, the sailing ships and cranes, the monorail, the cars and flying taxis, the airships, the neon signs, the fireworks
    this.river = new River(this.R, this.U); if (this.river.mesh) this.scene.add(this.river.mesh);
    this.ships = new Ships(L, this.U, this.quality); this.scene.add(this.ships.group);
    this.rail = new Monorail(this.R, this.U, this.quality); this.scene.add(this.rail.group);
    this.cars = new Cars(L, this.U, this.quality); this.scene.add(this.cars.mesh);
    this.flyers = new Flyers(L, this.R, this.U, this.quality); this.scene.add(this.flyers.mesh);
    this.airships = new Airships(this.R, this.U); this.scene.add(this.airships.mesh);
    this.signs = new Signs(L, this.U, this.caps); this.scene.add(this.signs.group);
    this.fireworks = new Fireworks(); this.scene.add(this.fireworks.points);
    this.link = new Link(); this.scene.add(this.link.line);
    this.kit = new KitFx(this.scene, this.camera, this.lm.spots, L, this.R);
    this.kitReady = this.kit.load().then((ok) => { if (ok && this._sun) this.kit.set(this._sun, this._wx, this.U, this.caps); return ok; }).catch(() => false);
    this.calm = !!opts.calm;
    this._tier(this.rc.quality());
  }

  _sky() {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({ vertexShader: SH.SKY_VS,
      fragmentShader: SH.SKY_FS, uniforms: pick(this.U, 'uSun', 'uDay', 'uDusk', 'uCloud', 'uFlash', 'uAccent', 'uFog', 'uTime'), side: THREE.BackSide, depthWrite: false }));
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    const n = STARS.hq, p = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, h = 0.1 + Math.pow(Math.random(), 0.8) * 0.88, r = 1400, flat = Math.sqrt(1 - h * h);
      p.set([Math.cos(a) * r * flat, h * r, Math.sin(a) * r * flat], i * 3);
      size[i] = 1.0 + Math.pow(Math.random(), 8) * 2.0; ph[i] = Math.random();             // tiny, a few brighter; each twinkles slowly
    }
    this.stars = points({ position: [p, 3], aSize: [size, 1], aPh: [ph, 1] }, new THREE.ShaderMaterial({ vertexShader: SH.STAR_VS, fragmentShader: SH.STAR_FS,
      uniforms: { ...pick(this.U, 'uTime', 'uPR'), uA: { value: 0.85 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _ground() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShaderMaterial({ vertexShader: SH.GROUND_VS,
      fragmentShader: SH.GROUND_FS, uniforms: pick(this.U, 'uFog', 'uFogD', 'uHaze', 'uDay', 'uTime', 'uWet', 'uRain', 'uAccent'), transparent: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.renderOrder = 0;
    this.scene.add(ground);
  }

  _glow() {
    const hq = this.quality === 'hq', items = this.L.items;
    const lit = [];
    items.forEach((it, i) => {
      const b = it.b || {};
      if (it.kind === 'ship') return;
      if (it.kind !== 'b' || b.cls === 'gold' || it.pulse || b.cls === 'green' || b.td) lit.push(i);
    });
    const n = lit.length + 1, p = new Float32Array(n * 3), c = new Float32Array(n * 3), size = new Float32Array(n), pulse = new Float32Array(n),
          seed = new Float32Array(n), today = new Float32Array(n), col = new THREE.Color();
    lit.forEach((i, k) => {
      const it = items[i], b = it.b || {};
      const always = it.kind !== 'b' || b.cls === 'gold' || it.pulse || (hq && b.cls === 'green');
      p.set([it.x, it.h + 0.35, it.z], k * 3);
      col.setHex(it.color);
      c.set([col.r, col.g, col.b], k * 3);
      size[k] = it.kind === 'd' ? 5 : it.kind === 's' ? 4.5 : b.cls === 'gold' ? 3.6 : it.pulse ? 3 : always ? 1.6 : 2.2;   // small hot points, no fat halos (LOOK.md)
      pulse[k] = it.pulse;
      seed[k] = golden(i);
      today[k] = always ? 0 : b.td === 2 ? 2 : 1;               // 1 / 2: only with the Today layer on (2 = fired, cyan)
    });
    // the last point: the LIT tower's cyan beacon (it was its own Points draw)
    p.set([0, 96, 0], (n - 1) * 3); c.set([0.25, 0.85, 1.0], (n - 1) * 3); size[n - 1] = 18; pulse[n - 1] = 1; seed[n - 1] = 0.2; today[n - 1] = 0;
    this.glowMat = new THREE.ShaderMaterial({ vertexShader: SH.GLOW_VS, fragmentShader: SH.GLOW_FS, uniforms: pick(this.U, 'uTime', 'uPR', 'uDay', 'uToday'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = points({ position: [p, 3], aColor: [c, 3], aSize: [size, 1], aPulse: [pulse, 1], aSeed: [seed, 1], aToday: [today, 1] }, this.glowMat);
    glow.renderOrder = 3;
    glow.frustumCulled = false;
    this.scene.add(glow);
  }

  /** red aviation blinkers on the tallest tops (one Points draw, GPU-animated) */
  _blinkers() {
    const top = this.L.items.map((it, i) => [it.h, i]).filter(([h, i]) => h > 7 && this.L.items[i].kind !== 'ship').sort((a, b) => b[0] - a[0]).slice(0, 220);
    const n = top.length + 1, p = new Float32Array(n * 3), ph = new Float32Array(n);
    top.forEach(([h, i], k) => { const it = this.L.items[i]; p.set([it.x, h * (1 + (ARCH_CROWN[it.arch] || 0)) + 0.25, it.z], k * 3); ph[k] = golden(i * 7); });
    p.set([0, 95.5, 0], (n - 1) * 3); ph[n - 1] = 0.5;                                  // the LIT spire's tip
    this.blink = points({ position: [p, 3], aPh: [ph, 1] }, new THREE.ShaderMaterial({ vertexShader: SH.BLINK_VS, fragmentShader: SH.BLINK_FS,
      uniforms: pick(this.U, 'uTime', 'uPR', 'uDay', 'uGrow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.blink.frustumCulled = false;
    this.blink.renderOrder = 3;
    this.scene.add(this.blink);
  }

  _streets(winRate) {
    const segs = this.L.streets, m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const roadGeo = new THREE.PlaneGeometry(1, 1);
    roadGeo.rotateX(-Math.PI / 2);
    const roads = new THREE.InstancedMesh(roadGeo, new THREE.ShaderMaterial({ vertexShader: SH.ROAD_VS, fragmentShader: SH.ROAD_FS,
      uniforms: pick(this.U, 'uFog', 'uFogD', 'uHaze', 'uDay', 'uTime', 'uWet', 'uAccent'), transparent: true, depthWrite: false }), segs.length);
    const q = new THREE.Quaternion();
    segs.forEach(([x0, z0, x1, z1], i) => {
      q.setFromAxisAngle(up, -Math.atan2(z1 - z0, x1 - x0));
      m4.compose(new THREE.Vector3((x0 + x1) / 2, 0.03, (z0 + z1) / 2), q, new THREE.Vector3(Math.hypot(x1 - x0, z1 - z0), 1, 1.9));
      roads.setMatrixAt(i, m4);
    });
    roads.renderOrder = 1;
    roads.frustumCulled = false;
    this.scene.add(roads);
    const n = FLOW.hq, seg = new Float32Array(n * 4), c = new Float32Array(n * 3), move = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      let s = segs[i % segs.length];
      if (Math.random() < 0.5) s = [s[2], s[3], s[0], s[1]];
      const lane = (Math.random() - 0.5) * 1.2, dx = s[2] - s[0], dz = s[3] - s[1], len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * lane, nz = (dx / len) * lane;
      seg.set([s[0] + nx, s[1] + nz, s[2] + nx, s[3] + nz], i * 4);
      col.setHex(Math.random() < winRate ? COLORS.win : COLORS.loss);
      c.set([col.r, col.g, col.b], i * 3);
      move.set([((0.6 + Math.random() * 0.8) * 6) / len, Math.random()], i * 2);
    }
    this.flow = points({ position: [new Float32Array(n * 3), 3], aSeg: [seg, 4], aColor: [c, 3], aMove: [move, 2] },
      new THREE.ShaderMaterial({ vertexShader: SH.FLOW_VS, fragmentShader: SH.FLOW_FS, uniforms: pick(this.U, 'uTime', 'uPR', 'uDay'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flow.frustumCulled = false;
    this.flow.renderOrder = 3;
    this.scene.add(this.flow);
  }

  _tower() {
    // The LIT tower in 4 draw calls (was 8; the phone's far overview is draw-call bound): the stone base (plinth + crown deck, one mesh with
    // vertex colours), the shaft + spire + eight crown pylons baked into ONE mesh of the tower shader (aL keeps each part's own local
    // position, so the bands and ribs fall exactly as before), the glowing rings, and ONE two-line name sprite.
    this.tower = new THREE.Group();
    const tm = new THREE.ShaderMaterial({ vertexShader: SH.TOWER_VS, fragmentShader: SH.TOWER_FS, uniforms: pick(this.U, 'uTime', 'uDay', 'uAccent') });
    const M = new THREE.Matrix4(), bake = (g, m, extra) => { const local = g.attributes.position.array.slice(); g.applyMatrix4(m); extra(g, local); return g; };
    const tint = (hex) => (g) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };
    const base = mergeSimple([bake(new THREE.CylinderGeometry(15, 20, 1.7, 16), M.makeTranslation(0, 0.2, 0), tint(NEON ? 0x162d4e : 0xb8a584)),
                              bake(new THREE.CylinderGeometry(10.2, 13.5, 1.4, 12), M.makeTranslation(0, 1.6, 0), tint(NEON ? 0x244c68 : 0xcdbd9a))]);
    this.tower.add(new THREE.Mesh(base, new THREE.MeshBasicMaterial({ vertexColors: true })));
    const keep = (g, local) => g.setAttribute('aL', new THREE.BufferAttribute(local, 3));
    const parts = [bake(new THREE.CylinderGeometry(2.4, 5.4, 72, 10, 1), M.makeTranslation(0, 38, 0), keep),
                   bake(new THREE.ConeGeometry(2.2, 20, 10), M.makeTranslation(0, 84, 0), keep)];
    // eight crown pylons make the data center read as the city's civic core without inventing metrics
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      parts.push(bake(new THREE.CylinderGeometry(0.32, 0.52, 11, 5), M.makeScale(1.15, 1.5, 1.15).setPosition(Math.cos(a) * 10.8, 8.5, Math.sin(a) * 10.8), keep));
    }
    this.tower.add(new THREE.Mesh(mergeSimple(parts), tm));
    const ringGeo = [[0.9, 19], [14, 8.2], [37, 6.6], [62, 5.1], [78, 4.2], [94, 3.4]].map(([y, r]) => { const g = new THREE.TorusGeometry(r, y < 2 ? 0.18 : 0.11, 6, 64); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; });
    const merged = mergeSimple(ringGeo);
    this.tower.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: COLORS.lit, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));
    const name = textSprite2(NEON ? [['CITY CAPITAL', '#ffd36b', 0.86, 112], ['LIT · ZLARIOR', '#7fe9ff', 1.0, 103]] : [['City Capital', '#d79e64', 0.86, 112], ['LIT · Zlarior', '#ddac7b', 1.0, 103]]);
    this.towerName = name;
    this.towerTitle = null;
    this.tower.add(name);
    this.scene.add(this.tower);
    // the cyan beacon over the tower is one more point of the glow layer (_glow): no draw call of its own
  }

  _names() {
    this.nameSprites = [];
    for (const d of this.L.districts) {
      const s = textSprite(d.name, d.css || (NEON ? '#e9ecf6' : '#b2cadc'), Math.max(0.9, Math.min(2.4, d.half / 34)));
      s.position.set(d.cx, d.kind === 'harbor' ? 8 : 16 + Math.min(30, d.half * 0.3), d.cz);
      this.scene.add(s);
      this.nameSprites.push(s);
    }
    const disc = textSprite('DISCOVERIES', (NEON ? '#ffe08a' : '#ddac7b'), 0.8);
    disc.position.set(0, 6, -22);
    this.scene.add(disc);
    this.nameSprites.push(disc);                     // the phone hides it with the district names when far (one draw call less)
  }

  _harbor() {
    const h = this.L.harbor;
    if (!h) return;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(h.x1 - h.x0, h.z1 - h.z0 + 8), new THREE.ShaderMaterial({ vertexShader: SH.WATER_VS,
      fragmentShader: SH.WATER_FS, uniforms: pick(this.U, 'uFog', 'uFogD', 'uHaze', 'uTime', 'uDay', 'uAccent') }));
    w.rotation.x = -Math.PI / 2;
    w.position.set((h.x0 + h.x1) / 2, 0.05, (h.z0 + h.z1) / 2);
    w.renderOrder = 1;
    this.scene.add(w);
    const pier = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 0.5), new THREE.MeshBasicMaterial({ color: (NEON ? 0x3fd8ff : 0xd39556), transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false }), h.piers);              // neon pier lines
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < h.piers; k++) { m4.makeScale(h.x1 - h.x0 - 20, 1, 1).setPosition((h.x0 + h.x1) / 2, 0.15, h.z0 + 7 + k * 7 - 2.2); pier.setMatrixAt(k, m4); }
    pier.renderOrder = 2;
    this.pier = pier;                                  // the phone hides these thin lines from the overview height (render: farAlt)
    this.scene.add(pier);
  }

  _pins() {
    const p = new Float32Array(PINS * 3), c = new Float32Array(PINS * 3), s = new Float32Array(PINS), z = new Float32Array(PINS);
    for (let i = 0; i < PINS; i++) { c.set([1, 0.85, 0.4], i * 3); s[i] = 10; }
    this.pins = points({ position: [p, 3], aColor: [c, 3], aSize: [s, 1], aPulse: [new Float32Array(PINS).fill(1), 1], aSeed: [z, 1], aToday: [z.slice(), 1] }, this.glowMat);
    this.pins.frustumCulled = false;
    this.pins.renderOrder = 6;
    this.pins.geometry.setDrawRange(0, 0);
    this.scene.add(this.pins);
  }

  /** Gold beacons over the watched buildings (item indices). */
  setPins(list) {
    const a = this.pins.geometry.getAttribute('position'), items = this.L.items;
    const k = Math.min(PINS, list.length);
    for (let i = 0; i < k; i++) { const it = items[list[i]]; a.array.set([it.x, it.h + 2.2, it.z], i * 3); }
    a.needsUpdate = true;
    this.pins.geometry.setDrawRange(0, k);
  }

  /** The market clock: sun from sky.sunOf(); weather from sky.weatherOf(). */
  setSun(sun, weather) {
    const U = this.U, w = weather || { haze: 0.2, rain: 0, storm: false };
    const el = sun.elev, az = sun.azim;
    U.uSun.value.set(-Math.cos(az), Math.max(-1, el), -Math.sin(az) * 0.6).normalize();
    U.uDay.value = sun.day * (1 - w.haze * 0.35);
    U.uDusk.value = sun.dusk * (1 - w.haze * 0.6);
    U.uCloud.value = w.storm ? 0.85 : w.rain > 0 ? 0.6 : w.haze * 0.4;
    U.uHaze.value = 0.15 + w.haze;
    U.uWet.value = Math.min(1, 0.45 + w.rain * 0.8);
    U.uRain.value = w.rain;
    // the city's shaders write screen colours: uFog takes the palette's hex as it is (no sRGB -> linear step, which made the old
    // night fog near-black); three's own materials and the background get the same colour through the usual colour management
    const F = this._fogC || (this._fogC = { d: new THREE.Color(), t: new THREE.Color(), lin: THREE.LinearSRGBColorSpace });
    const fogD = F.d.setHex(FOG.night, F.lin).lerp(F.t.setHex(FOG.day, F.lin), sun.day).lerp(F.t.setHex(FOG.dusk, F.lin), sun.dusk * 0.6 * (1 - sun.day * 0.5));
    if (w.storm || w.rain > 0) fogD.lerp(F.t.setHex(FOG.storm, F.lin), 0.35 + w.rain * 0.2);
    U.uFog.value.copy(fogD);
    const fog = (F.out || (F.out = new THREE.Color())).setRGB(fogD.r, fogD.g, fogD.b, THREE.SRGBColorSpace);   // reused: no allocation per sky step
    U.uFogD.value = (DENSITY.night + (DENSITY.day - DENSITY.night) * sun.day) * (1 + w.haze * 0.5);
    this.scene.background = fog;
    this.scene.fog.color.copy(fog);
    this.scene.fog.density = U.uFogD.value;
    this.stars.material.opacity = 0.85 * (1 - sun.day) * (1 - U.uCloud.value * 0.8);
    this.stars.material.uniforms.uA.value = this.stars.material.opacity;
    this.stars.visible = this.stars.material.opacity > 0.02;
    this.rain.set(w.rain);
    this.sunRays.set(U.uSun.value, U.uDusk.value * (1 - U.uCloud.value * 0.7), sun.day);
    this.fog.setHaze(w.haze);
    this.storm = !!w.storm;
    this.lm.setSun(sun, w, U);
    this._sun = sun; this._wx = w;
    this.kit?.set(sun, w, U, this.caps);
    U.uFlow.value = (sun.open ? 1 : 0.4) * (0.75 + Math.min(1.2, (w.vix || 16) / 22));            // the market drives the data streams
    const bk = +((NEON ? 0.3 : 0.12) + (NEON ? 0.22 : 0.1) * (1 - sun.day) + (NEON ? 0.06 : 0.04) * U.uCloud.value).toFixed(2);                  // more glow at night, less by day
    if (bk !== this.bloomK) { this.bloomK = bk; this.rc.setBloom({ strength: bk }); }
    this.rc.renderer.toneMappingExposure = 1 + 0.12 * sun.day - 0.1 * (w.storm ? 1 : 0);
    return '#' + fog.getHexString();
  }

  setToday(on) { this.U.uToday.value = on ? 1 : 0; }

  /** Calm motion (reduced motion, or the viewer's switch): the traffic, trains, ships and fireworks stand still; the kit follows OLYMPUS itself. */
  setCalm(on) {
    this.calm = !!on;
    for (const m of [this.cars.mesh, this.flyers.mesh, this.streams.points, this.traffic.points, this.flow]) m.visible = !on;
    this.rain.calm = !!on; this.rain.set(this.rain.rain);
  }

  /** The theme's accent (olympus.theme or applyTheme): plaza glow, water and tower tint, the sky's city glow. */
  setAccent(hex) { try { this.U.uAccent.value.set(hex); } catch (e) { /* a bad token: keep the last */ } }

  /** 'hq' | 'lq': the app's two looks. The core's tier follows (hq = the OLYMPUS level, high or ultra; lq = low). */
  setQuality(q) {
    const O = window.OLYMPUS, hq = O && (O.fx() === 'ultra' || O.fx() === 'high') ? O.fx() : 'high';
    this.rc.setQuality(q === 'hq' ? hq : 'low');
    this._tier(this.rc.quality());
  }

  /** the core changed tier (the viewer's choice in OLYMPUS, or our own setQuality): follow with every sub-system */
  _tier(level) {
    const q = level === 'low' || level === 'off' ? 'lq' : 'hq', changed = q !== this.quality || !this.skyline;
    this.quality = q;
    this.profile = profileOf(level, this.phone, !!window.OLYMPUS?.saver?.());
    const C = this.caps = PROFILES[this.profile];
    if (!this.skyline) return;
    this.U.uPR.value = this.renderer.getPixelRatio();
    this.flow.geometry.setDrawRange(0, C.flow);
    this.stars.geometry.setDrawRange(0, C.stars);
    this.skyline.setQuality(q, C);
    this.towns.setQuality(q, C);
    this.fog.setQuality(q, C);
    this.rain.setQuality(q, C);
    this.traffic.setQuality(q, C);
    this.streams.setQuality(q, C);
    this.outskirts.setQuality(q, C);
    this.lm.setQuality(q);
    this.cars.setQuality(q, C); this.flyers.setQuality(q, C); this.rail.setQuality(q, C); this.ships.setQuality(q, C);
    this.airships.setQuality(q, C); this.fireworks.setQuality(q, C);
    if (this._sun) this.kit.set(this._sun, this._wx, this.U, C);
    this.bloomK = -1;
    if (changed) this.onTier(q, level);
  }

  resize() { this.rc?.resize(); }

  /** What is under a screen point: { item }, { block }, { lit: true } for the tower, or null. */
  pick(x, y) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), this.camera);
    const t = ray.intersectObject(this.tower, true)[0];
    const s = this.skyline.pick(ray), l = this.lm.pick(ray);
    if (t && (!s || t.distance < s.distance) && (!l || t.distance < l.distance)) return { lit: true };
    if (l && (!s || l.distance < s.distance)) return { landmark: l.key };
    return s;
  }

  /** The ground point (y = 0) under a screen point, or null (the sky). */
  groundAt(x, y) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), this.camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  /** Redraw every canvas text once the HUD fonts (Georgia / Georgia) are in: the first draw used a fallback. */
  refreshText() {
    for (const s of this.nameSprites) s.userData.redraw?.();
    this.towerName?.userData.redraw?.();
    this.towerTitle?.userData.redraw?.();
    this.signs.refresh();
    this.boards.redrawAll();
  }

  render(dt) {
    const U = this.U;
    U.uTime.value += dt;
    if (U.uGrow.value < 1) U.uGrow.value = Math.min(1, U.uGrow.value + dt / 2.6);
    this.tower.rotation.y += dt * 0.15;
    this.skyline.update(this.camera);
    this.rays.update(U.uTime.value);
    this.rain.update(this.camera);
    this.beam.update(dt);
    this.boards.update(dt);
    if (this.storm) {                                         // lightning: a flash now and then, decaying fast
      if (this.flash <= 0 && Math.random() < dt * 0.18) { this.flash = 1; this.kit?.strike(); }
      this.flash = Math.max(0, this.flash - dt * 3.2);
      U.uFlash.value = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(U.uTime.value * 60)) : 0;
    } else U.uFlash.value = 0;
    this.lm.update(U.uTime.value);
    this.lm.lod(this.camera.position, this.caps);
    if (this.caps.farAlt > 0) {                                  // phone: from the overview height the small details are not drawn (each is a draw call)
      const hi = this.camera.position.y > this.caps.farAlt;
      for (const o of [this.boards.group, this.rail.furn, this.signs.poles, this.ships.cranes, this.pier]) if (o) o.visible = !hi;
    } else for (const o of [this.boards.group, this.rail.furn, this.signs.poles, this.ships.cranes, this.pier]) if (o && !o.visible) o.visible = true;
    if (this.caps.lmLod > 0) { const cp = this.camera.position; for (const sp of this.nameSprites) sp.visible = Math.hypot(cp.x - sp.position.x, cp.z - sp.position.z) < this.caps.lmLod * 0.8; }       // phone: the name sprites only near (the neon boards say the names too)
    else if (this.nameSprites[0] && !this.nameSprites[0].visible) for (const sp of this.nameSprites) sp.visible = true;
    if (!this.calm) {
      this.airships.update(U.uTime.value);
      this.rail.update(U.uTime.value, U.uFlow.value);
      this.ships.update(U.uFlow.value);
    }
    this.fireworks.update(this.calm ? 0 : dt, this.renderer.getPixelRatio());
    if (this.link.on) this.link.update(U.uTime.value);
    this.U.uPR.value = this.renderer.getPixelRatio();
    this.rc.render();
  }
}

/** Indexed geometries with the same attributes merged into one (three's BufferGeometryUtils is not in the core build). */
function mergeSimple(list) {
  const out = new THREE.BufferGeometry(), names = Object.keys(list[0].attributes), idx = [];
  let base = 0;
  for (const k of names) {
    const size = list[0].attributes[k].itemSize;
    const arr = new Float32Array(list.reduce((a, g) => a + g.attributes[k].array.length, 0));
    let o = 0;
    for (const g of list) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  for (const g of list) { for (const i of g.index.array) idx.push(base + i); base += g.attributes.position.count; }
  out.setIndex(idx);
  return out;
}
