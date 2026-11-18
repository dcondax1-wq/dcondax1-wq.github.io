// THE FORGE (PROMETHEUS): every LIT variant of a generation is a flame in a 3D arena; fitter = bigger and brighter, the
// weak gutter into embers, children spark out of their parents (crossover) with a cold flare when a gene mutated. The
// champion's lineage is a gold trail; the live LIT params burn as a fixed ice-blue reference flame. Tap a flame for its
// parameter card (diff vs live) and its H1 / H2 / 2021-25 numbers. Data: forge.json (tools/prometheus/forge.py) or a demo.
// Performance: one Points buffer for every ember, ONE draw call for every flame (flames.js: a noise fire shader), no
// lights; auto LITE when frames run slow (or ?lite=1); prefers-reduced-motion = no flicker, no drift, no autoplay.
// Layout: one top bar (title, stats, the verdict banner), one bottom bar (play, generations, Verdict / Lineage / Hall), one
// bottom sheet (a creature's card, or the Verdict / Lineage / Hall of Champions panel).
import * as THREE from '../jarvis/three.module.min.js';
import { loadForge, FMT } from './forgecore.js';
import { FlameField } from './flames.js';
import { lineageSvg, pickAt, heatRgb } from './lineage.js';
import { createRenderer } from '../olympus/render.js';     // the OLYMPUS render core: ACES, PMREM sky, bloom, MSAA, film finish
import { metal } from '../olympus/materials.js';
import { buildForgeSet } from './forgeset.js';
import { buildWorks } from './forgeworks.js';           // the smithy: bronze anvil, hammer, molten ingot, soot-stone hearth, sparks and smoke
import { createPlus, overfit } from './forgeplus.js';     // the tools panel: overfitting meter, breeding, verdicts, survivors, compare, search, share card             // the set: obsidian floor, lava cracks, molten gold ring, braziers

const O = window.OLYMPUS || null;   // the OLYMPUS kit (../olympus/olympus.js): one 3D quality for every app, the veil
const Q = new URLSearchParams(location.search);
const RM = O ? O.reduced() : window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ARENA_R = 7;
const STEP_MS = RM ? 1300 : 1750;
const ORIGIN = { L: 'the live strategy', S: 'a spark of live (mutant)', R: 'random', E: 'elite (survived as is)', C: 'child' };
const STATE = { filter: 'all', forge: null, arena: null, gen: 0, playing: false, lastStep: 0, errors: [], panel: null, sel: null, theme: null };

// ------------------------------------------------------------------------------------------------ textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = () => canvasTex(64, 64, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,.8)');
  g.addColorStop(0.5, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
});
const floorTex = () => canvasTex(512, 512, (x, w) => {
  const c = w / 2;
  const g = x.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, '#4a3626'); g.addColorStop(0.55, '#2a1d14'); g.addColorStop(1, '#14110e');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
  x.strokeStyle = 'rgba(200,162,74,.2)'; x.lineWidth = 1.5;
  for (let r = 0.2; r < 1; r += 0.2) { x.beginPath(); x.arc(c, c, c * r * 0.86, 0, Math.PI * 2); x.stroke(); }
  x.strokeStyle = 'rgba(200,162,74,.1)';
  for (let a = 0; a < 20; a++) {
    const t = a / 20 * Math.PI * 2;
    x.beginPath(); x.moveTo(c + Math.cos(t) * c * 0.17, c + Math.sin(t) * c * 0.17); x.lineTo(c + Math.cos(t) * c * 0.86, c + Math.sin(t) * c * 0.86); x.stroke();
  }
});
const textTex = (txt, color) => canvasTex(256, 64, (x, w, h) => {
  x.font = "600 30px 'Iowan Old Style', Georgia, serif"; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = color; x.fillText(txt, w / 2, h / 2);
});

// ------------------------------------------------------------------------------------------------ colours
const C_EMBER = new THREE.Color('#7a1206'), C_RED = new THREE.Color('#ff3d2e'), C_FIRE = new THREE.Color('#ff7a1a');
const C_GOLD = new THREE.Color('#ffc24a'), C_WHITE = new THREE.Color('#fff4d6'), C_ICE = new THREE.Color('#efe3cc');
function heatColor(h, out = new THREE.Color()) {
  if (h < 0.3) return out.copy(C_EMBER).lerp(C_RED, h / 0.3);
  if (h < 0.6) return out.copy(C_RED).lerp(C_FIRE, (h - 0.3) / 0.3);
  if (h < 0.85) return out.copy(C_FIRE).lerp(C_GOLD, (h - 0.6) / 0.25);
  return out.copy(C_GOLD).lerp(C_WHITE, (h - 0.85) / 0.15);
}

// ------------------------------------------------------------------------------------------------ embers (one Points buffer)
const GAIN = 2.6;
class Embers {
  constructor(scene, tex, n) {
    this.n = n; this.cap = n; this.next = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.base = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n);
    this.pos.fill(-999);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.2, map: tex, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setCap(c) { this.cap = Math.max(1, Math.min(this.n, c)); this.next %= this.cap; }

  spawn(x, y, z, vx, vy, vz, life, color, grav = 0.6) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.base[j] = color.r; this.base[j + 1] = color.g; this.base[j + 2] = color.b;
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav;
  }

  burst(p, n, color, speed, life, grav, rand) {
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2, u = rand() * 2 - 1, s = speed * (0.4 + 0.6 * rand()), r = Math.sqrt(1 - u * u);
      this.spawn(p.x, p.y, p.z, Math.cos(a) * r * s, Math.abs(u) * s * 0.9 + 0.3, Math.sin(a) * r * s, life * (0.6 + 0.4 * rand()), color, grav);
    }
  }

  update(dt) {
    const { pos, vel, col, base, life, max, grav } = this;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      if (life[i] <= 0) { if (col[j] || col[j + 1] || col[j + 2]) { col[j] = col[j + 1] = col[j + 2] = 0; pos[j + 1] = -999; } continue; }
      life[i] -= dt;
      vel[j + 1] += grav[i] * dt;
      vel[j] *= 0.985; vel[j + 2] *= 0.985;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < 0.02) { pos[j + 1] = 0.02; vel[j + 1] = 0; }
      const f = Math.max(0, life[i] / max[i]);
      const k = f * f * (3 - 2 * f);
      const hk = k * GAIN;                           // HDR: a hot ember is brighter than 1, so the bloom takes it
      col[j] = base[j] * hk; col[j + 1] = base[j + 1] * hk; col[j + 2] = base[j + 2] * hk;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------------------------ one flame (a slot in the field)
class Flame {
  constructor(field, i) {
    this.field = field; this.i = i;
    this.pos = new THREE.Vector3(); this.from = new THREE.Vector3(); this.to = new THREE.Vector3();
    this.heat = 0; this.heatFrom = 0; this.heatTo = 0; this.t0 = 0; this.dur = 0; this.ph = Math.random() * 10;
    this.id = null; this.alive = false; this.fixedColor = null; this.flare = null; this.dim = 1; this.vis = 1; this.visTo = 1;
    this.tmp = new THREE.Color();
  }

  place(p, heat) { this.pos.copy(p); this.to.copy(p); this.from.copy(p); this.heat = this.heatTo = this.heatFrom = heat; this.dur = 0; }

  moveTo(p, heat, now, dur, fromHeat = null) {
    this.from.copy(this.pos); this.to.copy(p);
    this.heatFrom = fromHeat == null ? this.heat : fromHeat; this.heatTo = heat; this.t0 = now; this.dur = dur;
  }

  update(now, t, still) {
    if (this.dur > 0) {
      const u = Math.max(0, Math.min(1, (now - this.t0) / this.dur)), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      this.pos.lerpVectors(this.from, this.to, e);
      this.heat = this.heatFrom + (this.heatTo - this.heatFrom) * e;
      if (u >= 1) this.dur = 0;
    }
    if (!this.alive) { this.field.hide(this.i); return; }
    this.vis += (this.visTo - this.vis) * (still ? 1 : 0.14);       // the half-year filter dims what does not match
    const h = Math.max(0, this.heat);
    const fl = still ? 1 : 1 + 0.05 * Math.sin(t * 9.1 + this.ph) + 0.035 * Math.sin(t * 23.7 + this.ph * 1.7);   // the noise does the rest
    const H = (0.55 + 2.7 * h) * fl, W = (0.42 + 0.95 * h) * (2 - fl) * 0.95;
    const ice = this.fixedColor ? 1 : 0;
    const col = this.fixedColor || heatColor(Math.min(1, h + 0.12), this.tmp);
    this.field.set(this.i, this.pos, W, H, col, ice ? 0.75 : h, ice ? 0.95 : (0.35 + 0.75 * h) * this.dim * this.vis, this.ph, ice);
  }

  /** the flame's centre (for taps) */
  centre(v = new THREE.Vector3()) { return v.copy(this.pos).setY(this.pos.y + (0.55 + 2.7 * this.heat) * 0.42); }
}

// ------------------------------------------------------------------------------------------------ the arena
class Arena {
  constructor(canvas, forge) {
    this.forge = forge;
    this.canvas = canvas;
    // ?lite=1 wins (tests); else the owner's OLYMPUS choice (Jarvis ⋯ → 3D); the auto LITE below only when nobody chose
    this.lite = Q.get('lite') === '1' || !!(O && O.lite());
    this.chosen = Q.get('lite') === '1' || !!(O && O.chosen());
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x2a1d14, 0.026);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    // the render core owns the renderer, the frame passes and the quality tiers (OLYMPUS.fx(), stepped down on slow frames)
    this.rc = createRenderer({ canvas, scene: this.scene, camera: this.camera, env: 'night', tint: '#ff7a1a', theme: { sky: '#4a3626', fog: '#2a1d14', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, exposure: 1.0, maxDpr: 1.75,
      quality: Q.get('lite') === '1' ? 'low' : undefined, adapt: true, bloom: { strength: 0.25, radius: 0.55, threshold: 0.92 },
      grade: { vignette: 0.3, grain: 0.02, aberration: 0 },
      onQuality: (l) => { this.lite = l === 'low' || l === 'off'; this.field?.setLite(this.lite); this.embers?.setCap(this.lite ? 260 : 700); O?.mode(this.lite); } });
    this.renderer = this.rc.renderer;
    this.lite = this.rc.quality() === 'low' || this.rc.quality() === 'off';
    this.scene.background = new THREE.Color(0x2a1d14);
    O?.themeScene?.({ scene: this.scene, renderer: this.renderer });   // OLYMPUS theme: the fog follows it
    this.az = -0.6; this.el = 0.8; this.drag = null;
    this.tex = { glow: glowTex() };
    this.rand = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    this.set = buildForgeSet(THREE, this.scene, { metal, ARENA_R, lite: this.lite });
    this.rim = this.set.ring;
    this.works = buildWorks(THREE, this.scene, { R: ARENA_R, lite: this.lite });
    this.works.attachFx(window.OLYMPUS_FX);
    this.buildSky();
    this.embers = new Embers(this.scene, this.tex.glow, 700);
    this.embers.setCap(this.lite ? 260 : 700);
    const nPool = Math.max(...forge.d.gens.map((g) => g.length)) + 2;
    this.field = new FlameField(this.scene, nPool + 1, this.lite);
    this.pool = Array.from({ length: nPool }, (_, i) => new Flame(this.field, i));
    this.liveFlame = new Flame(this.field, nPool);
    this.liveFlame.fixedColor = C_ICE; this.liveFlame.alive = true; this.liveFlame.id = 'live';
    const lp = this.posOf(forge.d.live.k, 0, 1);
    this.liveFlame.place(lp, 0.7);
    this.liveLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex('Live LIT', '#efe3cc'), transparent: true, depthWrite: false }));
    this.liveLabel.scale.set(2.6, 0.65, 1); this.liveLabel.position.copy(lp).setY(3.2);
    this.scene.add(this.liveLabel);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 40), new THREE.MeshBasicMaterial({ color: C_ICE.clone().multiplyScalar(2.2), transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(lp).setY(0.03);
    this.scene.add(ring);
    this.buildTrail();
    this.byCreature = new Map();
    this.frames = []; this.t = 0; this.wall = 0; this.slowSince = null; this.last = performance.now(); this.emitAcc = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindPointer();
  }

  buildSky() {
    const n = this.lite ? 120 : 320, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, r = 2 + this.rand() * (ARENA_R + 6);
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.5 + this.rand() * 12; pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: this.tex.glow, color: 0xe0a060, transparent: true,
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust);
  }

  buildTrail() {
    const n = this.forge.d.champion.line.length;
    this.trailPos = new Float32Array(Math.max(2, n) * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    g.setDrawRange(0, 0);
    this.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(0xffe3a0).multiplyScalar(2.4), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    this.trail.frustumCulled = false;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    bg.setDrawRange(0, 0);
    this.beads = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.7, map: this.tex.glow, color: new THREE.Color(0xffd27a).multiplyScalar(2.2), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beads.frustumCulled = false;
    this.scene.add(this.trail, this.beads);
  }

  /** arena position of a genome: its PCA map point; copies in one generation sit on a small spiral around it */
  posOf(k, dup = 0, scale = 1) {
    const xy = this.forge.point(k);
    const a = dup * 2.39996, r = dup ? 0.62 * Math.sqrt(dup) : 0;
    return new THREE.Vector3(xy[0] * ARENA_R * scale + Math.cos(a) * r, 0, xy[1] * ARENA_R * scale + Math.sin(a) * r);
  }

  layout(g) {
    const seen = new Map(), out = new Map();
    for (const c of this.forge.gen(g)) {
      const d = seen.get(c.k) || 0; seen.set(c.k, d + 1);
      out.set(c.id, this.posOf(c.k, d));
    }
    return out;
  }

  /** show generation g; step = animate the births / deaths from the generation before */
  show(g, step) {
    const F = this.forge, now = performance.now(), gen = F.gen(g), L = this.layout(g);
    const anim = step && !RM && this.byCreature.size;
    const old = this.byCreature, next = new Map(), used = new Set();
    const crowd = (p) => { let n = 0; for (const q of L.values()) if (q !== p && q.distanceTo(p) < 1.6) n++; return n; };
    if (anim) {
      for (const c of gen) {                         // elites keep their parent's flame
        if (c.o === 'E' && old.has(c.p[0]) && !used.has(old.get(c.p[0]))) { const f = old.get(c.p[0]); used.add(f); next.set(c.id, f); }
      }
      for (const [id, f] of old) {                   // the rest gutter into embers
        if (used.has(f)) continue;
        const cc = F.creature(id);
        if (cc) this.embers.burst(f.pos.clone().setY(0.3), 6 + Math.round(10 * (1 - f.heat)), C_RED, 0.9, 1.8, -1.2, this.rand);
      }
    }
    const free = this.pool.filter((f) => !used.has(f));
    for (const c of gen) {
      const h = F.heat(c.f), p = L.get(c.id);
      let f = next.get(c.id);
      if (f) { f.moveTo(p, h, now, 700); f.id = c.id; f.dim = 1 / (1 + 0.28 * crowd(p)); continue; }
      f = free.shift();
      f.id = c.id; f.alive = true; f.dim = 1 / (1 + 0.28 * crowd(p));   // a crowded spot burns dimmer each, so the pile never whites out
      next.set(c.id, f);
      if (anim) {
        const ps = c.p.map((pid) => old.get(pid)).filter(Boolean);
        const start = ps.length ? ps.reduce((a, x) => a.add(x.pos), new THREE.Vector3()).multiplyScalar(1 / ps.length) : p.clone();
        f.place(start, 0.05);
        f.moveTo(p, h, now, 1100, 0.05);
        this.embers.burst(start.clone().setY(0.6), this.lite ? 6 : 14, ps.length > 1 ? C_GOLD : C_FIRE, 2.2, 0.9, 0.4, this.rand);
        if (c.mu && c.mu.length) {
          f.flare = { at: now + 1050, p: p.clone().setY(1.0), n: (this.lite ? 8 : 18) + 6 * c.mu.length };
        }
      } else {
        f.place(p, h);
      }
    }
    for (const f of free) if (![...next.values()].includes(f)) { f.alive = false; f.id = null; }
    this.byCreature = next;
    for (const c of gen) { const f = next.get(c.id); if (f) { f.visTo = F.matches(c, STATE.filter) ? 1 : 0.09; if (!anim) f.vis = f.visTo; } }
    // the champion's lineage up to this generation
    const line = F.lineageUpTo(g);
    line.forEach((c, i) => {
      const p = this.posOf(c.k);
      this.trailPos[i * 3] = p.x; this.trailPos[i * 3 + 1] = 0.06 + 0.07 * c.gen; this.trailPos[i * 3 + 2] = p.z;
    });
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, line.length);
    this.beads.geometry.setDrawRange(0, line.length);
  }

  /** the half-year filter changed: dim the flames that do not match (they ease, no rebuild) */
  refilter() {
    const F = this.forge;
    for (const c of F.gen(STATE.gen)) { const f = this.byCreature.get(c.id); if (f) f.visTo = F.matches(c, STATE.filter) ? 1 : 0.09; }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    O?.mode(this.lite);
    const aspect = w / h, half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    this.dist = THREE.MathUtils.clamp((ARENA_R + 1.2) / (Math.tan(half) * Math.min(1, aspect)) * 0.7, 12, 40);
    this.rc.resize();
    this.fit();
  }

  /** the open band between the top bar and the dock (px): the arena is framed inside it, so no flame sits under the HUD */
  setBand(top, bottom) {
    const b = [Math.max(0, top | 0), Math.min(innerHeight, bottom | 0)];
    if (this.band && b[0] === this.band[0] && b[1] === this.band[1]) return;
    this.band = b;
    this.fit();
  }

  // pull the camera back until the arena (rim + the back flames' tops) fits the band; on a roomy screen keep the width fit
  fit() {
    this.zoom = 1;
    for (let i = 0; i < 3; i++) {
      this.placeCamera();
      const s = this.arenaSpan(), room = this.bandH() * 0.94;
      if (!(s.h > room)) break;
      this.zoom = Math.min(1.8, this.zoom * s.h / room);
    }
    this.placeCamera();
  }

  bandH() { const b = this.band || [0, innerHeight]; return Math.max(120, b[1] - b[0]); }

  /** the arena's screen top (the far rim, flame height) and bottom (the near rim), without the band offset */
  arenaSpan() {
    const c = this.camera, h = innerHeight, fx = -Math.cos(this.az), fz = -Math.sin(this.az), R = ARENA_R + 1.2;
    c.updateMatrixWorld(); c.updateProjectionMatrix();
    const y = (x, yy, z) => (1 - new THREE.Vector3(x, yy, z).project(c).y) / 2 * h;
    const top = y(fx * R, 3.2, fz * R), bot = y(-fx * R, 0, -fz * R);
    return { top, bot, h: bot - top };
  }

  placeCamera() {
    const d = this.dist * (this.zoom || 1), el = this.el, c = this.camera, w = innerWidth, h = innerHeight;
    c.position.set(Math.cos(this.az) * Math.cos(el) * d, Math.sin(el) * d + 0.5, Math.sin(this.az) * Math.cos(el) * d);
    c.lookAt(0, -0.9, 0);
    if (!this.band) return;
    c.clearViewOffset();
    const s = this.arenaSpan(), b = this.band;
    const dy = Math.round((b[0] + b[1]) / 2 - (s.top + s.bot) / 2);     // shift the picture so the arena sits mid-band
    if (dy) c.setViewOffset(w, h, 0, -dy, w, h);
  }

  bindPointer() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, az: this.az, el: this.el, t: performance.now(), moved: 0 }; c.setPointerCapture?.(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.moved = Math.max(this.drag.moved, Math.hypot(dx, dy));
      if (this.drag.moved > 6) {
        this.az = this.drag.az + dx * 0.008;
        this.el = THREE.MathUtils.clamp(this.drag.el + dy * 0.004, 0.18, 1.2);
        this.placeCamera();
      }
    });
    const up = (e) => {
      const d = this.drag; this.drag = null;
      if (d && d.moved <= 8) {
        const id = this.pick(e.clientX, e.clientY);
        if (id != null) openCard(id);
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { this.drag = null; });
  }

  screenOf(f) {
    const v = f.centre().project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, z: v.z };
  }

  /** the flame nearest to a tap (screen space, within 40 px), front-most on a tie */
  pick(x, y) {
    let best = null, bd = 40;
    for (const f of [...this.byCreature.values(), this.liveFlame]) {
      if (!f.alive) continue;
      const s = this.screenOf(f), d = Math.hypot(s.x - x, s.y - y);
      if (d < bd - 0.5 || (best && Math.abs(d - bd) <= 0.5 && s.z < best.z)) { bd = d; best = { id: f.id, z: s.z }; }
    }
    return best ? best.id : null;
  }

  frame(now) {
    const raw = Math.max(0, (now - this.last) / 1000);  // real frame time (rAF time can trail performance.now())
    const dt = Math.min(0.05, raw);                       // simulation step (a stalled tab never jumps)
    this.last = now; this.t += dt; this.wall += raw;
    this.frames.push(raw);
    if (this.frames.length > 60) this.frames.shift();
    if (!RM && !this.drag) { this.az += dt * 0.045; this.placeCamera(); }
    const all = [...this.byCreature.values()];
    for (const f of all) {
      f.update(now, this.t, RM);
      if (f.flare && now >= f.flare.at) {          // a mutation flare once the child reached its place
        this.embers.burst(f.flare.p, f.flare.n, C_ICE, 2.8, 0.8, 0.2, this.rand); f.flare = null;
      }
    }
    this.liveFlame.update(now, this.t, RM);
    for (const f of this.pool) if (!f.alive) this.field.hide(f.i);
    this.field.uniforms.uT.value = RM ? 0 : this.t;
    this.field.commit();
    if (!RM) {                                     // ambient embers: the fitter, the more
      this.emitAcc += dt * (this.lite ? 0.45 : 1);
      while (this.emitAcc > 0.016) {
        this.emitAcc -= 0.016;
        const f = all[Math.floor(this.rand() * all.length)];
        if (f && this.rand() < f.heat * f.heat * 0.9 + 0.05) {
          const p = f.pos;
          this.embers.spawn(p.x + (this.rand() - 0.5) * 0.4, 0.4 + f.heat * 1.6 * this.rand(), p.z + (this.rand() - 0.5) * 0.4,
            (this.rand() - 0.5) * 0.3, 0.6 + this.rand() * 0.9, (this.rand() - 0.5) * 0.3, 1.4 + this.rand() * 1.4,
            f.heat > 0.3 ? heatColor(Math.min(1, f.heat + 0.15)) : C_RED, 0.15);
        }
      }
      if (this.rand() < (this.lite ? 0.25 : 0.6)) {   // molten gold spits sparks off the ring
        const a = this.rand() * Math.PI * 2, R = ARENA_R + 2.45;
        this.embers.spawn(Math.cos(a) * R, 0.2, Math.sin(a) * R, (this.rand() - 0.5) * 0.5, 0.8 + this.rand() * 1.4, (this.rand() - 0.5) * 0.5,
          0.9 + this.rand() * 1.2, this.rand() < 0.5 ? C_GOLD : C_FIRE, -0.5);
      }
      this.dust.rotation.y += dt * 0.02; this.dust.position.y = 0.4 * Math.sin(this.t * 0.3);
    }
    this.embers.update(dt);
    this.set.update(this.t, RM, this.rc.renderer.getPixelRatio());
    this.works.update(this.t, RM);
    this.rc.render();                                // tone mapping, bloom, MSAA and the film finish
  }

  fps() { const a = this.frames.reduce((x, y) => x + y, 0) / Math.max(1, this.frames.length); return a ? Math.round(1 / a) : 0; }
}

// ------------------------------------------------------------------------------------------------ HUD, cards, verdict
function setText(id, txt, cls) { const e = $(id); e.textContent = txt; if (cls !== undefined) e.className = cls; }
const better = (a, b, hi = true) => (a == null || b == null || a === b ? '' : (a > b) === hi ? 'up' : 'down');

function renderHud(g) {
  const F = STATE.forge, h = F.hud(g);
  setText('s-gen', `${g + 1}/${h.of}`); setText('s-gen2', `fit ${FMT.num(h.fit)}`);
  setText('s-h1', FMT.usd(h.h1pm), better(h.h1pm, h.live.h1pm)); setText('s-h1l', 'live ' + FMT.usd(h.live.h1pm));
  setText('s-h2', FMT.usd(h.h2pm), better(h.h2pm, h.live.h2pm)); setText('s-h2l', 'live ' + FMT.usd(h.live.h2pm));
  setText('s-pf', `${FMT.num(h.p10, 1)}/${FMT.num(h.f10, 1)}`, better(h.p10 - h.f10, h.live.p10 - h.live.f10));
  setText('s-pfl', `live ${FMT.num(h.live.p10, 1)}/${FMT.num(h.live.f10, 1)}`);
  setText('s-tpw', FMT.num(h.tpw), h.tpw < 2 ? 'down' : ''); setText('s-tpwl', 'live ' + FMT.num(h.live.tpw));
  const sl = $('gen'); sl.value = String(g); sl.setAttribute('aria-valuetext', `generation ${g + 1} of ${h.of}`);
}

function numRows(G, L) {
  const span = (k) => [G[k], L[k]];
  const sp = [['H1', 'h1'], ['H2', 'h2'], ['2021-25', 'y']];
  const row = (lab, f, hi = true) => `<tr><td>${lab}</td>${sp.map(([, k]) => {
    const [a, b] = span(k), v = f(a), lv = f(b);
    const cls = v.n == null || lv.n == null ? '' : better(v.n, lv.n, hi);
    return `<td><b class="${cls}">${esc(v.s)}</b><br><small style="color:var(--ice)">${esc(lv.s)}</small></td>`;
  }).join('')}</tr>`;
  const pm = (x) => ({ n: x.pm, s: FMT.usd(x.pm) });
  const pf = (x) => ({ n: x.pf, s: FMT.num(x.pf) });
  const tpw = (x) => ({ n: x.tpw, s: FMT.num(x.tpw) });
  const ev = (x) => { const p = x.p10 ?? x.lit_p10, f = x.f10 ?? x.lit_f10; return { n: p == null ? null : p - f, s: p == null ? '—' : `${FMT.num(p, 1)}/${FMT.num(f, 1)}` }; };
  const dd = (x) => ({ n: x.dd, s: FMT.usd(x.dd) });
  return `<table aria-label="Numbers: this creature (top) and live (bottom, blue)"><thead><tr><th></th><th>2026 H1<br>pick</th><th>2026 H2<br>check</th><th>2021-25<br>ref</th></tr></thead><tbody>
    ${row('$ / month', pm)}${row('PF', pf)}${row('trades / wk', tpw)}${row('eval p10/f10', ev)}${row('max DD', dd)}</tbody></table>`;
}

function openCard(id) {
  const F = STATE.forge;
  closeTruth();
  const isLive = id === 'live';
  const c = isLive ? null : F.creature(id);
  if (!isLive && !c) return;
  const k = isLive ? F.d.live.k : c.k, G = F.genome(k);
  STATE.sel = id;
  const champ = !isLive && id === F.d.champion.id;
  $('card-h').textContent = isLive ? 'LIVE LIT · reference flame' : `${champ ? 'Champion · ' : ''}Creature #${id}`;
  const parents = !isLive && c.p.length ? ` · from #${c.p.join(' × #')}` : '';
  const mut = !isLive && c.mu.length ? ` · mutated: ${c.mu.map((i) => F.knobs[i].key).join(', ')}` : '';
  $('card-m').textContent = isLive ? 'live_model_lit.json today · fitness 1.00 by definition'
    : `gen ${c.gen + 1} · ${ORIGIN[c.o] || c.o}${parents}${mut} · fitness ${FMT.num(c.f, 3)} (live 1.00)`;
  const rows = F.diffRows(k);
  const nchg = rows.filter((r) => r.changed).length;
  $('card-b').innerHTML = `${isLive ? '' : changeBlock(id)}${numRows(G, F.live)}
    <p class="note">Top: this variant · <span style="color:var(--ice)">bottom: live</span>. H1 is all the forge saw; H2 and 2021-25 are checks it never saw. 2021-25 has no 1m bars (eval = LIT size rule).</p>
    <table aria-label="Parameters against live"><thead><tr><th>Knob</th><th>Live</th><th>This</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="${r.changed ? 'chg' : ''}"><td>${esc(r.knob.label)}</td><td>${esc(FMT.knob(r.knob, r.live))}</td><td>${esc(FMT.knob(r.knob, r.val))}</td></tr>`).join('')}
    </tbody></table><p class="note">${nchg ? `${nchg} knob${nchg > 1 ? 's' : ''} differ from live (◆).` : 'Same knobs as live.'} Research only: nothing here changes the bot.</p>`;
  $('card-b').insertAdjacentHTML('afterbegin', `<div class="ofit" id="ofit"></div>`);
  const m = overfit(F, k);
  $('ofit').innerHTML = `<span class="ol">Overfitting</span><span class="om" role="img" aria-label="Overfitting meter ${m.meter} of 100, ${m.label}"><i style="width:${100 - Math.max(2, m.meter)}%"></i></span><b style="color:${m.colour}">${esc(m.label)}</b>`
    + `<button type="button" class="mini" id="cardShare">Share</button><button type="button" class="mini" id="cardCmp">Compare</button>`;
  $('cardShare').addEventListener('click', () => plus && plus.share(id));
  $('cardCmp').addEventListener('click', () => { plus.select(id); plus.open('meter', id); closeCard(); showPlus(true); });
  plus && plus.select(id);
  $('card').hidden = false;
  $('card').scrollTop = 0;
}
function closeCard() { $('card').hidden = true; }

// "would this change live?": the one answer the owner wants per creature, with the reasons and the half-year pass / fail marks
const pill = (ok, t) => `<span class="pill ${ok ? 'ok' : 'no'}">${t} ${ok ? '✓' : '✗'}</span>`;
function changeBlock(id) {
  const F = STATE.forge, c = F.creature(id), w = F.wouldChange(id), p = F.halfPass(c.k);
  return `<div class="chg-box ${w.level}" id="chg"><b class="chg-t">Would this change live? ${esc(w.title)}</b>
    <div class="pills">${pill(p.h1, 'H1')}${pill(p.h2, 'H2')}</div>
    <ul>${w.why.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <small>Pass = more $/month than live in that half, eval speed not worse, 2+ trades a week. Only the owner changes live.</small></div>`;
}

// the half-year filter (dock chips): which creatures keep burning bright
const FILTERS = { all: 'All', h1: 'Pass H1', h2: 'Pass H2', both: 'Both', fail2: 'Fail H2' };
function renderChips() {
  const F = STATE.forge, gen = F.gen(STATE.gen), n = (f) => gen.filter((c) => F.matches(c, f)).length;
  document.querySelectorAll('#chips button').forEach((b) => {
    const f = b.dataset.f; b.setAttribute('aria-pressed', String(STATE.filter === f));
    b.querySelector('small').textContent = String(n(f));
  });
  $('chipn').textContent = STATE.filter === 'all' ? `${n('h2')} of ${gen.length} pass H2 · ${n('h1')} pass H1 in this generation`
    : `${n(STATE.filter)} of ${gen.length} creatures match "${FILTERS[STATE.filter]}"`;
}
function setFilter(f) {
  STATE.filter = FILTERS[f] ? f : 'all';
  renderChips();
  STATE.arena?.refilter();
  if (STATE.panel === 'hall' && !$('truth').hidden) openHall();
}

// the verdict banner (top bar): one honest line, always on screen
function renderBanner() {
  const v = STATE.forge.verdict(), el = $('banner');
  el.className = 'banner ' + (v.liveBest ? 'ok' : 'cand');
  $('bn-t').textContent = v.title;
  const yr = typeof v.h2 === 'number' ? v.h2 * 12 : null;
  $('bn-s').innerHTML = `New data (H2): best variant <b class="${v.h2 > 0 ? 'up' : 'down'}">${esc(FMT.dUsd(v.h2))}</b>/mo vs live's <b>${esc(FMT.usd(v.liveH2))}</b>` +
    (yr != null ? ` (<b class="${yr > 0 ? 'up' : 'down'}">${esc(FMT.dUsd(yr))}</b>/yr)` : '') + `. Trained on (H1): <b>${esc(FMT.dUsd(v.h1))}</b>/mo. ${v.real} of ${v.seeds} runs hold up.`;
}

function openTruth() {
  const F = STATE.forge, d = F.d, V = d.verdict, ch = F.genome(d.champion.k), lv = F.live, H = d.honesty || {};
  closeCard();
  const seeds = (d.seeds || []).map((s) => `<tr><td>${s.seed}${s.seed === d.seed ? ' ★' : ''}</td><td>${FMT.num(s.fit)}</td><td>${esc(FMT.usd(s.h1_pm))}</td>
    <td class="${s.h2_pm > lv.h2.pm ? 'up' : 'down'}">${esc(FMT.usd(s.h2_pm))}</td><td>${FMT.num(s.h2_p10, 1)}/${FMT.num(s.h2_f10, 1)}</td><td>${s.real ? '<span class="pill ok">yes</span>' : '<span class="pill no">no</span>'}</td></tr>`).join('');
  $('truth-b').innerHTML = `
    <p class="big">${d.proposal ? 'A variant beat live on H2 by a real margin: see the write-up for the exact switch.' : 'No variant beats live LIT on H2 by a real margin. Nothing to switch.'}</p>
    ${numRows(ch, lv)}
    <p class="note">Champion (top) vs live (blue). H1 gain ${esc(FMT.dUsd(V.h1_gain_pm))}/mo; on H2 ${esc(FMT.dUsd(V.h2_gain_pm))}/mo
      (${V.survive_pct == null ? 'no H1 gain to keep' : esc(FMT.num(V.survive_pct, 0)) + '% of the H1 gain kept'}); weekly-block bootstrap 5–95%:
      ${esc(FMT.dUsd(V.boot.lo5))} to ${esc(FMT.dUsd(V.boot.hi95))}/mo. H2 eval speed (p10 − f10) ${FMT.num(V.h2_speed_champ, 1)} vs live ${FMT.num(V.h2_speed_live, 1)}.</p>
    <table aria-label="Every seed's champion"><thead><tr><th>Seed</th><th>Fit H1</th><th>H1 $/mo</th><th>H2 $/mo</th><th>H2 p10/f10</th><th>Real</th></tr></thead><tbody>${seeds}</tbody></table>
    <p class="note">Five independent forges (seeds). Live H2: ${esc(FMT.usd(lv.h2.pm))}/mo, ${FMT.num(lv.h2.p10, 1)}/${FMT.num(lv.h2.f10, 1)}.
      "Real" = H2 at least +10% $/mo, bootstrap 5th percentile above $0, eval speed not worse, 2+ trades a week.</p>
    <p class="note">Does H1 predict H2? Rank correlation over ${H.genomes_checked ?? '—'} variants: fitness <b>${H.spearman_h1_h2_fit ?? '—'}</b>,
      $/mo <b>${H.spearman_h1_h2_pm ?? '—'}</b>. More $/mo than live on H1: <b>${H.beat_live_h1_pm ?? '—'}</b> · on H2: <b>${H.beat_live_h2_pm ?? '—'}</b> ·
      on both: <b>${H.beat_live_both_pm ?? '—'}</b> (fitness: ${H.beat_live_h1 ?? '—'} · ${H.beat_live_h2 ?? '—'} · ${H.beat_live_both ?? '—'}).</p>
    <p class="note">Fitness (H1 only): ${esc(d.fitness)}.</p>`;
  showPanel('verdict');
}
const PANELS = { verdict: ['truthBtn', 'truth-b', 'Does the fire survive H2?'], lineage: ['linBtn', 'lin-b', 'Lineage · the champion\'s ancestry'],
  hall: ['hallBtn', 'hall-b', 'Hall of Champions'] };
function showPanel(kind) {
  closeCard(); showPlus(false);
  STATE.panel = kind;
  for (const [k, [btn, body]] of Object.entries(PANELS)) { $(body).hidden = k !== kind; $(btn).setAttribute('aria-expanded', String(k === kind)); }
  $('truth-h').textContent = PANELS[kind][2];
  $('truth').dataset.kind = kind;
  $('truth').hidden = false;
}
function closeTruth() {
  $('truth').hidden = true; STATE.panel = null; showPlus(false);
  for (const [btn] of Object.values(PANELS)) $(btn).setAttribute('aria-expanded', 'false');
}
function togglePanel(kind, open) { if (STATE.panel === kind && !$('truth').hidden) closeTruth(); else open(); }

function openLineage() {
  const F = STATE.forge, box = $('lin-b');
  showPanel('lineage');
  const w = Math.max(240, Math.round(box.clientWidth || 300));   // measured once on open, never per frame
  box.innerHTML = lineageSvg(F, { gen: STATE.gen, sel: STATE.sel, w, h: Math.round(w * 0.78) }) +
    `<p class="note"><span class="sw gold"></span>champion #${F.d.champion.id}'s ancestry (both parents, back to generation 1) ·
      <span class="sw ice"></span>the creature you opened · dots: every creature, fittest at the top, hotter = fitter · the lit column is
      the slider's generation. Tap a dot for its card.</p>`;
}

function openHall() {
  const F = STATE.forge, L = F.live, rows = F.hall(80).filter((r) => F.matches({ k: r.k }, STATE.filter)).slice(0, 8);
  showPanel('hall');
  const tr = (r) => `<tr data-id="${r.id}" class="${r.champ ? 'champ' : ''}"><td><b>${r.rank}</b> #${r.id}<small> gen ${r.gen + 1} · ${r.changed} knob${r.changed === 1 ? '' : 's'}</small></td>
    <td>${FMT.num(r.fit)}</td><td class="${F.halfPass(r.k).h1 ? 'up' : ''}">${esc(FMT.usd(r.h1))}</td><td class="${r.h2Beats ? 'up' : 'down'}">${esc(FMT.usd(r.h2))}</td><td>${esc(FMT.usd(r.y))}</td></tr>`;
  const beat = rows.filter((r) => r.h2Beats).length;
  const fnote = STATE.filter === 'all' ? '' : ` Filter: ${FILTERS[STATE.filter]}.`;
  $('hall-b').innerHTML = `<p class="big">${!rows.length ? 'No variant matches this filter.' : beat ? `${beat} of the ${rows.length} fittest beat live on H2.` : `None of the ${rows.length} fittest beats live on H2.`}
      H1 is all the forge saw.${fnote}</p>
    <table class="hall" aria-label="Hall of Champions"><thead><tr><th>Creature</th><th>Fit H1</th><th>H1 $/mo</th><th>H2 $/mo</th><th>21-25</th></tr></thead><tbody>
    <tr class="live" data-id="live"><td><b>◆</b> LIVE LIT<small> the reference</small></td><td>1.00</td><td>${esc(FMT.usd(L.h1.pm))}</td><td>${esc(FMT.usd(L.h2.pm))}</td><td>${esc(FMT.usd(L.y.pm))}</td></tr>
    ${rows.map(tr).join('')}</tbody></table>
    <p class="note">The fittest distinct variants of the whole run (fitness on 2026 H1 only), each against live on the H2 check and the
      2021-25 reference. Tap a row for its card.</p>`;
}


// ------------------------------------------------------------------------------------------------ time-lapse
function setGen(g, step = false) {
  const F = STATE.forge;
  g = Math.max(0, Math.min(F.nGens - 1, g));
  const isStep = step && g === STATE.gen + 1;
  STATE.gen = g;
  renderHud(g);
  if (STATE.arena) STATE.arena.show(g, isStep);
  else renderNoGl(g);
  renderChips();
  measureBars();
  if (STATE.panel === 'lineage' && !$('truth').hidden) openLineage();
}

let plus = null;
function ftoast(text) { const t = $('ftoast'); t.textContent = text; t.hidden = false; clearTimeout(ftoast.timer); ftoast.timer = setTimeout(() => { t.hidden = true; }, 2200); }
function showPlus(on) {
  if (!plus) return;
  if (on) { closeCard(); STATE.panel = null; $('truth').hidden = true; for (const [btn] of Object.values(PANELS)) $(btn).setAttribute('aria-expanded', 'false'); plus.open(); }
  else plus.close();
  $('plusBtn').setAttribute('aria-expanded', String(!!on));
}

function setPlaying(on) {
  STATE.playing = on;
  $('play').textContent = on ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', on ? 'Pause the evolution' : 'Play the evolution');
  if (on && STATE.gen >= STATE.forge.nGens - 1) setGen(0);
  STATE.lastStep = performance.now();
}

let gapAt = 0;
function tick(now) {
  if (STATE.playing && now - STATE.lastStep >= STEP_MS) {
    STATE.lastStep = now;
    if (STATE.gen < STATE.forge.nGens - 1) setGen(STATE.gen + 1, true); else setPlaying(false);
  }
  const gap = O && O.frameGap ? O.frameGap() : 0;                           // idle 30 / 15 fps, battery saver, 3D Off (docs/OLYMPUS_PERF.md)
  if (STATE.arena && !(O ? O.hidden() : document.hidden) && !(gap && now - gapAt < gap - 3)) { gapAt = now; STATE.arena.frame(now); }   // hidden tab: no frame (the battery)
  requestAnimationFrame(tick);
}

function renderNoGl(g) {
  const F = STATE.forge, box = $('nogl');
  const gen = F.gen(g), best = F.best(g), hud = F.hud(g), v = F.verdict();
  const line = F.lineageUpTo(g).slice(-5), fire = heatRgb(F.heat(best.f));
  const node = (c, cls = '') => `<button type="button" class="flat-node ${cls}${c.id === F.d.champion.id ? ' champion' : ''}" data-id="${c.id}" style="--node-fire:${heatRgb(F.heat(c.f))}" aria-label="Open creature ${c.id}, fitness ${FMT.num(c.f)}">#${c.id}</button>`;
  box.style.setProperty('--flat-fire', fire);
  box.hidden = false;
  box.innerHTML = `<div class="flat-vault" aria-hidden="true"><i class="flat-core"></i></div>
    <div class="flat-anvil" aria-hidden="true"><i class="flat-ingot"></i></div>
    <div class="flat-summary"><span>Generation ${g + 1} of ${F.nGens} · read-only research</span>
      <b>${v.liveBest ? 'Keep live LIT · no proven replacement' : 'Candidate found · owner review required'}</b>
      <small>Leader #${best.id}: H1 ${FMT.usd(hud.h1pm)}/mo → H2 ${FMT.usd(hud.h2pm)}/mo · fitness ${FMT.num(best.f)}</small></div>
    <div class="flat-lineage" role="list" aria-label="Champion lineage through this generation">${line.length ? line.map((c) => node(c, 'lineage ')).join('') : '<p class="flat-empty">The champion lineage has not started yet.</p>'}</div>
    <div class="flat-pop" role="list" aria-label="Fittest creatures in this generation">${gen.slice(0, 4).map((c) => node(c)).join('')}<button type="button" class="flat-node live" data-id="live" aria-label="Open live LIT reference">LIVE</button></div>`;
  box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => openCard(b.dataset.id === 'live' ? 'live' : Number(b.dataset.id))));
}

function postJarvisCard() {
  if (window.parent === window) return;
  fetch('jarvis.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((card) => {
    if (card) window.parent.postMessage({ jarvis: 1, href: location.href, card: { ...card, t: Math.floor(Date.now() / 1000) } }, (location.origin && location.origin !== 'null' ? location.origin : 'https://demetrades2000-coder.github.io'));
  }).catch(() => {});
}

function route() {
  if (location.hash === '#verdict') openTruth();
  else if (location.hash === '#lineage') openLineage();
  else if (location.hash === '#hall') openHall();
}

// The forge vista sits between the top and bottom bars. Re-measure on resize and
// after a generation render because wrapped HUD copy can change height on phones.
function measureBars() {
  const r = document.documentElement.style;
  r.setProperty('--hud-b', Math.round($('hud').getBoundingClientRect().bottom) + 'px');
  r.setProperty('--dock-h', Math.round(innerHeight - $('dock').getBoundingClientRect().top) + 'px');
  STATE.arena?.setBand($('hud').getBoundingClientRect().bottom, $('dock').getBoundingClientRect().top);
}

// ------------------------------------------------------------------------------------------------ OLYMPUS themes
// applyTheme(tokens): the OLYMPUS theme tokens ({bg, glass, line, text, dim, accent, mix, harmony, ...}) or CSS variable
// names ('--x': value). bg blends into the forge's own ember dark by `mix`, the accent into its fire by `harmony` (0 in the
// default theme: nothing changes; missing: as given); the arena's fog follows the background. With the kit's themes
// (olympus.js theme / onTheme / themeScene) the kit paints the CSS tokens and themeScene keeps the fog in step.
const OWN = { bg: '#14110e', accent: '#c8a24a' };
const THEME_VARS = { text: '--text', dim: '--dim', glass: '--panel', panel: '--panel', line: '--line' };
// '#rrggbb' a -> b by t (0 = a untouched); anything else: b when t > 0 (the OLYMPUS themes' own mix rule, kept local)
function mixHex(a, b, t) {
  const p = (h) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)) : null);
  const A = p(a), B = p(b);
  if (!(t > 0)) return a;
  if (!A || !B) return b;
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * Math.min(1, t)).toString(16).padStart(2, '0')).join('');
}
export function applyTheme(tok) {
  if (!tok || typeof tok !== 'object') return;
  const root = document.documentElement.style, mix = typeof tok.mix === 'number' ? tok.mix : 1, har = typeof tok.harmony === 'number' ? tok.harmony : 1;
  const bg = tok.bg ? mixHex(OWN.bg, tok.bg, mix) : null, acc = tok.accent ? mixHex(OWN.accent, tok.accent, har) : null;
  if (bg && mix > 0) root.setProperty('--bg', bg);
  if (acc && har > 0) root.setProperty('--fire', acc);
  for (const [k, v] of Object.entries(tok)) {
    if (typeof v !== 'string') continue;
    if (k.startsWith('--')) root.setProperty(k, v); else if (THEME_VARS[k] && mix > 0) root.setProperty(THEME_VARS[k], v);
  }
  try { if (bg && mix > 0 && STATE.arena) STATE.arena.scene.fog.color.set(bg); } catch (e) { /* not a colour */ }
  STATE.theme = tok;
}
window.applyTheme = applyTheme;
function hookTheme() {
  if (!O) return;
  try {
    if (typeof O.themeScene === 'function' && STATE.arena) { O.themeScene({ scene: STATE.arena.scene, renderer: STATE.arena.renderer }); STATE.themeHook = 'themeScene'; return; }
    if (typeof O.theme === 'function') { applyTheme(O.theme()); STATE.themeHook = 'theme'; }
    if (typeof O.onTheme === 'function') O.onTheme(applyTheme);
  } catch (e) { /* a kit without themes */ }
}

async function main() {
  addEventListener('error', (e) => STATE.errors.push(String(e.message || e)));
  const F = await loadForge('forge.json', Q.get('demo') === '1' ? 'demo' : undefined);
  STATE.forge = F;
  $('demo').hidden = !F.demo;
  if (F.demo) $('sub').textContent = 'Prometheus: demo data (forge.json not found)';
  else $('sub').textContent = `Breeds new LIT versions: ${F.nGens} rounds, picked on Jan-Jun 2026`;
  const sl = $('gen');
  sl.max = String(F.nGens - 1);
  sl.addEventListener('input', () => { setPlaying(false); setGen(Number(sl.value)); });
  $('play').addEventListener('click', () => setPlaying(!STATE.playing));
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (b) setFilter(b.dataset.f); });
  $('cardX').addEventListener('click', closeCard);
  $('truthX').addEventListener('click', closeTruth);
  $('truthBtn').addEventListener('click', () => togglePanel('verdict', openTruth));
  $('linBtn').addEventListener('click', () => togglePanel('lineage', openLineage));
  $('hallBtn').addEventListener('click', () => togglePanel('hall', openHall));
  plus = createPlus({ F, open: (id) => { showPlus(false); openCard(id); }, setGen: (g) => { setPlaying(false); setGen(g); }, toast: ftoast, getGen: () => STATE.gen });
  $('plusBtn').addEventListener('click', () => showPlus($('plus').hidden));
  $('plusX').addEventListener('click', () => showPlus(false));
  $('banner').addEventListener('click', openTruth);
  $('lin-b').addEventListener('click', (e) => { const svg = $('lin-b').querySelector('svg'); const id = svg && pickAt(svg, F, e.clientX, e.clientY); if (id != null) openCard(id); });
  $('hall-b').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openCard(tr.dataset.id === 'live' ? 'live' : Number(tr.dataset.id)); });
  addEventListener('resize', measureBars);
  measureBars();
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeCard(); closeTruth(); showPlus(false); }
    if (e.target === sl) return;
    if (e.key === 'ArrowRight') { setPlaying(false); setGen(STATE.gen + 1, true); }
    if (e.key === 'ArrowLeft') { setPlaying(false); setGen(STATE.gen - 1); }
  });
  addEventListener('hashchange', route);
  try {
    STATE.arena = new Arena($('arena'), F);
  } catch (e) {
    STATE.arena = null;
    O?.ready();                                     // no 3D here: the list below is the page
  }
  hookTheme();                                      // after the arena: themeScene needs its scene
  renderBanner();
  setGen(0);
  window.__forge = {
    get gen() { return STATE.gen; }, get scene() { return STATE.arena && STATE.arena.scene; }, setGen, setFilter, setQuality(l) { STATE.arena?.rc.setQuality(l); }, get filter() { return STATE.filter; }, flameVis(id) { const f = STATE.arena && STATE.arena.byCreature.get(id); return f ? f.visTo : null; }, openCard, get lite() { return STATE.arena ? STATE.arena.lite : null; }, get clock() { const a = STATE.arena; return a ? { t: a.t, frames: a.frames.length } : null; },
    get fps() { return STATE.arena ? STATE.arena.fps() : 0; }, get demo() { return F.demo; }, errors: STATE.errors,
    screenOf(id) { const a = STATE.arena; if (!a) return null; const f = id === 'live' ? a.liveFlame : a.byCreature.get(id); return f ? a.screenOf(f) : null; },
    ids() { return F.gen(STATE.gen).map((c) => c.id); }, champion: F.d.champion.id, ready: true,
    get plus() { return plus; }, setAz(v, e) { const a = STATE.arena; if (a) { a.az = v; if (e != null) a.el = e; a.placeCamera(); } }, get works() { const w = STATE.arena && STATE.arena.works; return w ? { strikes: w.strikes, fx: w.fxNames, pos: w.pos } : null; },
    get calls() { return STATE.arena ? STATE.arena.rc.stats().calls : 0; }, get passes() { return STATE.arena ? STATE.arena.rc.passes() : []; }, get quality() { return STATE.arena ? STATE.arena.rc.quality() : ''; }, get panel() { return STATE.panel; }, heatRgb,
    lineageDot(id) { const c = document.querySelector(`#lin-b circle[data-id="${id}"]`); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  };
  requestAnimationFrame(tick);
  if (!RM && Q.get('autoplay') !== '0') setPlaying(true);
  route();
  postJarvisCard();
}

main().catch((e) => { STATE.errors.push(String(e && e.message || e)); O?.fail(e && e.message ? e.message : String(e)); });
