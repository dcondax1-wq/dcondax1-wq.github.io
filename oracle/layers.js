// ORACLE market layers: what lives on the price column. Levels as glowing rings + light planes (their names are on the
// holographic ladder, ladder.js), the VIX-band objectives and the 18:00 open, the live price as a comet with its spiral
// trail, the open position's entry / stop / target planes with a P&L glow, lightning when a level is swept (a branching
// bolt in two draw calls, re-strikes, then an afterglow that keeps the swept ring hot for a few seconds), and ATLAS's
// members as satellites. The scene owns the price -> height mapping (map.y(price)); everything re-places itself from it.
import { heatOf } from './heat.js';
import { kindOf, COLOR, additive, glowSprite, labelSprite, setLabel, ringLine, lightDisc, hex, glowTexture } from './glow.js';

export const Y_MAX = 7.5;                           // half height of the column's scale (world units)
const TRAIL_BARS = 36;                           // 3 hours of 5m closes behind the comet
const SAT_COLOR = { off: 0x7a6f56, waiting: 0xebbf59, armed: 0xeba741, in_trade: 0xd5eb6a, done: 0xebc671, error: 0xeb7450 };
const fmtPx = (p) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A jagged path from a to b: n segments, sideways jitter `jag` that shrinks towards the strike point. */
function jagged(T, a, b, n, jag) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n), j = i && i < n ? jag * (1 - (i / n) * 0.6) : 0;
    pts.push(p.add(new T.Vector3((Math.random() - 0.5) * j, (Math.random() - 0.5) * j * 0.4, (Math.random() - 0.5) * j)));
  }
  return pts;
}

/** Soft ribbons facing the camera along every segment ([a, b, width, brightness]): bright on the centre line, black at the
    edges, so additive blending reads as a glow. One BufferGeometry for the whole bolt (one draw call). */
function ribbons(T, segs, view, widthMul, color) {
  const pos = [], col = [], side = new T.Vector3(), d = new T.Vector3();
  for (const [a, b, w, k] of segs) {
    d.subVectors(b, a).normalize();
    side.crossVectors(d, view).normalize().multiplyScalar(w * widthMul);
    const c = [color.r * k, color.g * k, color.b * k], z = [0, 0, 0];
    const aL = a.clone().sub(side), aR = a.clone().add(side), bL = b.clone().sub(side), bR = b.clone().add(side);
    for (const [p, q] of [[aL, a], [a, aR]]) {
      const pb = p === aL ? bL : b, qb = q === a ? b : bR;
      pos.push(...p.toArray(), ...q.toArray(), ...qb.toArray(), ...p.toArray(), ...qb.toArray(), ...pb.toArray());
      const cp = p === aL ? z : c, cq = q === a ? c : z;
      col.push(...cp, ...cq, ...cq, ...cp, ...cq, ...cp);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  return g;
}
const RESTRIKE = [0, 0.09, 0.21];                 // seconds: the leader, then two return strokes (how lightning flickers)

export class Market {
  constructor(THREE, root, { quality, reduced }) {
    this.T = THREE;
    this.reduced = reduced;
    this.g = new THREE.Group();
    root.add(this.g);
    this.levels = new Map();
    this.order = [];
    this.sats = new Map();
    this.bolts = [];
    this.strikes = 0;
    this.world = null;
    this._v = new THREE.Vector3();
    this.buildColumn();
    this.buildComet();
    this.buildTargets();
    this.buildPosition();
    this.setQuality(quality);
  }

  setQuality(q) {
    this.lite = q === 'low';
    this.trailN = this.lite ? 120 : 260;
    this.buildTrail();
    if (this.world) this.setWorld(this.world);
  }

  // ---------------------------------------------------------------- the column
  buildColumn() {
    const T = this.T, h = Y_MAX * 2 + 7;
    const mat = (color, a) => new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uC: { value: new T.Color(color) }, uA: { value: a }, uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uC; uniform float uA; uniform float uT; varying vec2 vUv;
        void main(){ float e = smoothstep(0.0,0.22,vUv.y) * smoothstep(1.0,0.78,vUv.y);
          float pulse = 0.75 + 0.25 * sin(vUv.y * 60.0 - uT * 2.4);
          gl_FragColor = vec4(uC * uA * e * pulse, 1.0); }`,
    });
    this.colMats = [mat(0xebc775, 0.95), mat(0xebbf59, 0.07)];
    this.g.add(new T.Mesh(new T.CylinderGeometry(0.045, 0.045, h, 8, 1, true), this.colMats[0]));
    this.g.add(new T.Mesh(new T.CylinderGeometry(0.42, 0.42, h, 24, 1, true), this.colMats[1]));
  }

  // ---------------------------------------------------------------- the comet (live price)
  buildComet() {
    const T = this.T;
    this.comet = new T.Group();
    this.comet.add(glowSprite(T, COLOR.comet, 2.4, 0.9), glowSprite(T, 0xf3ece0, 0.6, 1));
    this.pxRing = ringLine(T, 1.3, 0xebe0c7, 0.85);
    this.pxDisc = lightDisc(T, 1.6, 0xebc775, 0.35);
    this.g.add(this.comet, this.pxRing, this.pxDisc);            // the price itself is on the ladder (ladder.js)
  }

  buildTrail() {
    const T = this.T;
    if (this.trail) { this.g.remove(this.trail, this.sparks); this.trail.geometry.dispose(); this.sparks.geometry.dispose(); }
    const n = this.trailN, geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
    this.trail = new T.Line(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    this.sparks = new T.Points(geo, new T.PointsMaterial({ size: 0.32, map: glowTexture(T), vertexColors: true, transparent: true,
      blending: T.AdditiveBlending, depthWrite: false }));
    this.trail.frustumCulled = this.sparks.frustumCulled = false;
    this.g.add(this.trail, this.sparks);
    this.trailPx = [];
  }

  // ---------------------------------------------------------------- the VIX band and the 18:00 open
  buildTargets() {
    const T = this.T, mk = (color, r, text) => {
      const g = new T.Group();
      g.add(lightDisc(T, r, color, 0.22), ringLine(T, r, color, 0.7, 128));
      const l = labelSprite(T, text, hex(color), 0.52);
      l.center.set(0, 0.5);
      g.userData = { r, label: l };
      g.add(l);
      g.visible = false;
      this.g.add(g);
      return g;
    };
    this.vixUp = mk(COLOR.up, 6.8, 'VIX objective ↑');
    this.vixDn = mk(COLOR.down, 6.8, 'VIX objective ↓');
    this.open18 = mk(COLOR.open, 1.9, '18:00 open');
  }

  // ---------------------------------------------------------------- the open position
  buildPosition() {
    const T = this.T;
    this.pos = new T.Group();
    this.pos.visible = false;
    const plane = (color, name) => {
      const g = new T.Group();
      g.add(lightDisc(T, 2.6, color, 0.3), ringLine(T, 2.4, color, 0.95));
      const l = labelSprite(T, name, hex(color), 0.58, { weight: 700 });
      l.center.set(1, 0.5);
      g.userData.label = l;
      g.add(l);
      this.pos.add(g);
      return g;
    };
    this.pEntry = plane(COLOR.entry, 'ENTRY');
    this.pStop = plane(COLOR.stop, 'STOP');
    this.pTarget = plane(COLOR.target, 'TARGET');
    this.pnlGlow = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 32, 1, true), additive(T, COLOR.up, 0.2));
    this.pos.add(this.pnlGlow);
    this.g.add(this.pos);
  }

  // ---------------------------------------------------------------- data in
  setWorld(w) {
    this.world = w;
    const T = this.T, keep = new Set();
    for (const lv of w.levels) {
      keep.add(lv.id);
      let o = this.levels.get(lv.id);
      if (!o) {
        const k = kindOf(lv.kind), g = new T.Group();
        const ring = ringLine(T, k.r, k.color, 0.8), disc = lightDisc(T, k.r, k.color, 0.12);
        g.add(disc, ring);
        this.g.add(g);
        o = { g, ring, disc, k, flash: 0, glow: 0, heat: 0, base: new T.Color(k.color), phase: Math.random() * 6.28 };
        this.levels.set(lv.id, o);
      }
      o.lv = lv;
    }
    for (const [id, o] of this.levels) {
      if (keep.has(id)) continue;
      this.g.remove(o.g);
      o.g.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
      this.levels.delete(id);
    }
    this.order = [...this.levels.values()];
    // the comet's trail: the last 3 hours of closes and the live price, smoothed to trailN points along the helix
    const px = (w.bars || []).map((b) => b[1]).filter((p) => Number.isFinite(p)).slice(-TRAIL_BARS);
    if (w.price != null) px.push(w.price);
    const at = (k) => px[Math.max(0, Math.min(px.length - 1, k))];
    this.trailPx = px.length < 2 ? [] : Array.from({ length: this.trailN }, (_, i) => {   // Catmull-Rom through the closes
      const f = (i / (this.trailN - 1)) * (px.length - 1), k = Math.min(px.length - 2, Math.floor(f)), u = f - k;
      const p0 = at(k - 1), p1 = at(k), p2 = at(k + 1), p3 = at(k + 2);
      return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
    });
    if (w.vix) {
      setLabel(this.vixUp.userData.label, `VIX objective ↑ ${fmtPx(w.vix.up)}`);
      setLabel(this.vixDn.userData.label, `VIX objective ↓ ${fmtPx(w.vix.dn)}`);
      setLabel(this.open18.userData.label, `18:00 open ${fmtPx(w.vix.open18)}`);
    }
    const p = w.position;
    this.pos.visible = !!p;
    if (p) {
      setLabel(this.pEntry.userData.label, `${p.side} ${p.qty} @ ${fmtPx(p.entry)}${p.be ? ' · stop BE' : ''}`);
      setLabel(this.pStop.userData.label, p.stop == null ? 'STOP' : `${p.be ? 'STOP (BE)' : 'STOP'} ${fmtPx(p.stop)}`);
      setLabel(this.pTarget.userData.label, p.target == null ? 'TARGET' : `TARGET ${fmtPx(p.target)}`);
      this.pnlGlow.material.color.setHex((p.usd || 0) >= 0 ? COLOR.up : COLOR.down);
    }
    this.setSatellites(w.atlas);
  }

  setSatellites(atlas) {
    const T = this.T, ms = atlas ? atlas.members : [], keep = new Set(ms.map((m) => m.key));
    for (const [k, s] of this.sats) if (!keep.has(k)) { this.g.remove(s.g); this.sats.delete(k); }
    ms.forEach((m, i) => {
      let s = this.sats.get(m.key);
      if (!s) {
        const g = new T.Group(), orbit = ringLine(T, 6.3, 0x7a673a, 0.28, 128);
        const body = new T.Group(), halo = glowSprite(T, 0xf3ece0, 1.4, 0.8), core = glowSprite(T, 0xf3ece0, 0.42, 1);
        const label = labelSprite(T, m.short, '#ebddbe', 0.48);
        label.position.y = 0.55;
        body.add(halo, core, label);
        g.add(orbit, body);
        g.rotation.set(0.32 * (i % 2 ? -1 : 1) + i * 0.12, 0, 0.18 * i);
        this.g.add(g);
        s = { g, orbit, body, halo, core, label, phase: i * 2.1, speed: 0.11 + i * 0.025 };
        this.sats.set(m.key, s);
      }
      s.m = m;
      s.orbit.material.opacity = m.open ? 0.5 : 0.16;               // a member inside its entry hours lights its orbit
      const c = SAT_COLOR[m.stage] ?? SAT_COLOR.waiting;
      s.halo.material.color.setHex(c);
      s.core.material.color.setHex(m.stage === 'off' ? 0xb0a280 : 0xf3ece0);
      setLabel(s.label, `${m.short}${m.stage === 'off' ? '' : ' · ' + m.stage.replace('_', ' ')}`, hex(c));
    });
  }

  /** Lightning on a swept level: a branching bolt from the sky to the ring, re-strikes, a flash and ripples, then an
      afterglow on the ring (o.glow) that fades over ~6 s. */
  strike(lv, map, cam) {
    const T = this.T, o = this.levels.get(lv.id), r = o ? o.k.r : 3, y = map.y(lv.price);
    const color = new T.Color(o ? o.k.color : 0xebd092);
    if (o) { o.flash = 1; o.glow = 1; }
    this.strikes++;
    const a = Math.atan2(cam.right.z, cam.right.x) + (Math.random() - 0.5) * 1.6;
    const end = new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const start = new T.Vector3(end.x * 0.4 + (Math.random() - 0.5) * 5, Y_MAX + 8, end.z * 0.4 + (Math.random() - 0.5) * 5);
    const segs = [], depth = this.lite ? 1 : 2;
    const grow = (from, to, n, jag, w, k, lvl) => {
      const pts = jagged(T, from, to, n, jag);
      for (let i = 0; i < n; i++) segs.push([pts[i], pts[i + 1], w * (1 - 0.45 * i / n), k]);
      if (lvl >= depth) return;
      const forks = lvl === 0 ? (this.lite ? 2 : 3) : 1;
      for (let f = 0; f < forks; f++) {
        const i = 2 + Math.floor(Math.random() * (pts.length - 4)), p = pts[i];
        const len = from.distanceTo(to) / n * (3 + Math.random() * 3);
        const dir = to.clone().sub(from).normalize().add(new T.Vector3((Math.random() - 0.5) * 1.6, -0.2, (Math.random() - 0.5) * 1.6)).normalize();
        grow(p, p.clone().addScaledVector(dir, len), 5, jag * 0.55, w * 0.5, k * 0.55, lvl + 1);
      }
    };
    grow(start, end, this.lite ? 10 : 16, 1.6, 0.05, 1, 0);
    const view = cam.dir.clone().setY(0.25).normalize();
    const mat = () => new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      side: T.DoubleSide, opacity: 1 });
    const core = new T.Mesh(ribbons(T, segs, view, 1, new T.Color(0xf3ece0)), mat());
    const halo = new T.Mesh(ribbons(T, segs, view, 4.5, color), mat());
    core.frustumCulled = halo.frustumCulled = false;
    const g = new T.Group();
    const flash = glowSprite(T, color.getHex(), 5, 1);
    flash.position.copy(end);
    const ripple = ringLine(T, r, 0xf3ece0, 1, 96);
    ripple.position.y = y;
    g.add(halo, core, flash);
    this.g.add(g, ripple);
    this.bolts.push({ g, core, halo, flash, ripple, r, age: 0, life: this.reduced ? 0.8 : 1.6 });
  }

  /** the comet's world position (the arena's price lamp follows it) */
  cometWorld() { return this.comet.visible ? this.comet.position : null; }

  /** the open levels with their live heat, hottest first (tests, the HUD) */
  heat() { return this.order.filter((o) => !o.lv.taken).map((o) => ({ label: o.lv.label, price: o.lv.price, heat: o.heat })).sort((a, b) => b.heat - a.heat); }

  // ---------------------------------------------------------------- every frame
  frame(t, dt, map, cam) {
    const w = this.world;
    for (const m of this.colMats) m.uniforms.uT.value = t;
    // levels (their names are on the ladder); a swept ring keeps an afterglow for a few seconds
    if (w) {
      for (const o of this.order) {
        const y = map.y(o.lv.price), vis = Math.abs(y) <= Y_MAX + 0.8;
        o.g.visible = vis;
        if (!vis) continue;
        o.g.position.y = y;
        o.flash = Math.max(0, o.flash - dt * 0.7);
        o.glow = Math.max(0, o.glow - dt * 0.16);
        const edge = 1 - Math.max(0, Math.abs(y) - Y_MAX + 1.6) / 2.4;
        const shimmer = this.reduced ? 0 : 0.12 * Math.sin(t * 1.7 + o.phase);
        const ember = o.glow * (this.reduced ? 0.5 : 0.5 + 0.18 * Math.sin(t * 9 + o.phase));
        // heat: a level close to price runs hotter (HDR ring colour: it blooms) and its light plane fills in; a swept one is cold
        o.heat = o.lv.taken || this.shown == null ? 0 : heatOf(o.lv.price - this.shown, w.atr);
        o.ring.material.color.copy(o.base).multiplyScalar(1 + o.heat * 2.2 + o.flash * 1.5);
        o.ring.material.opacity = (o.lv.taken ? 0.22 : 0.72 + shimmer) * edge + o.flash + ember;
        o.disc.material.opacity = (o.lv.taken ? 0.04 : 0.11 + o.heat * 0.16) * edge + o.flash * 0.5 + ember * 0.4;
        o.ring.rotation.y = this.reduced ? 0 : t * 0.05 + o.phase;
      }
    }
    // VIX band and the 18:00 open: pinned to the edge of the scale when off it
    const place = (g, price) => {
      if (price == null || !w || !w.vix) { g.visible = false; return; }
      const y = map.y(price), off = Math.abs(y) > Y_MAX;
      g.visible = true;
      g.position.y = Math.max(-Y_MAX - 0.6, Math.min(Y_MAX + 0.6, y));
      g.children[0].material.opacity = off ? 0.07 : 0.22;
      g.children[1].material.opacity = off ? 0.25 : 0.7;
      g.userData.label.position.set(cam.dir.x * g.userData.r, 0.12, cam.dir.z * g.userData.r);
      g.userData.label.center.set(0.5, 0);
    };
    place(this.vixUp, w && w.vix && w.vix.up);
    place(this.vixDn, w && w.vix && w.vix.dn);
    place(this.open18, w && w.vix && w.vix.open18);
    if (this.open18.visible && Math.abs(map.y(w.vix.open18)) > Y_MAX) this.open18.visible = false;
    // the comet and its spiral trail
    const head = this.reduced ? 0.6 : t * 0.35, R = 1.3, dA = (Math.PI * 2 * 1.4) / this.trailN;
    const px = this.trailPx, n = px.length;
    if (w && w.price != null) {
      this.shown = this.shown == null || this.reduced ? w.price : this.shown + (w.price - this.shown) * (1 - Math.exp(-dt * 6));
      const y = map.y(this.shown);
      this.comet.position.set(Math.cos(head) * R, y, Math.sin(head) * R);
      const pulse = this.reduced ? 1 : 1 + 0.12 * Math.sin(t * 5);
      this.comet.children[0].scale.setScalar(2.4 * pulse);
      this.pxRing.position.y = this.pxDisc.position.y = y;
    }
    this.comet.visible = this.pxRing.visible = !!(w && w.price != null);
    const P = this.trail.geometry.attributes.position, C = this.trail.geometry.attributes.color;
    for (let i = 0; i < n; i++) {
      const age = n - 1 - i, a = head - age * dA, f = Math.pow(1 - age / n, 1.6);
      P.setXYZ(i, Math.cos(a) * R, map.y(age === 0 && this.shown != null ? this.shown : px[i]), Math.sin(a) * R);
      C.setXYZ(i, 0.45 * f, 0.9 * f, 1.0 * f);
    }
    P.needsUpdate = C.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, n);
    // the position planes and the P&L glow
    const p = w && w.position;
    if (p) {
      const yE = map.y(p.entry), yP = map.y(w.price ?? p.entry);
      const clampY = (v) => Math.max(-Y_MAX - 0.6, Math.min(Y_MAX + 0.6, v));
      this.pEntry.position.y = clampY(yE);
      this.pStop.visible = p.stop != null;
      this.pTarget.visible = p.target != null;
      if (p.stop != null) this.pStop.position.y = clampY(map.y(p.stop));
      if (p.target != null) this.pTarget.position.y = clampY(map.y(p.target));
      for (const g of [this.pEntry, this.pStop, this.pTarget]) g.userData.label.position.set(-cam.right.x * 2.7, 0, -cam.right.z * 2.7);
      this.pStop.userData.label.visible = Math.abs(this.pStop.position.y - this.pEntry.position.y) > 0.45;
      const h = Math.max(0.02, Math.abs(yP - yE));
      this.pnlGlow.scale.set(1, h, 1);
      this.pnlGlow.position.y = clampY((yE + yP) / 2);
      const strength = Math.min(1, Math.abs(p.r ?? 0) / 3);
      this.pnlGlow.material.opacity = 0.1 + 0.22 * strength + (this.reduced ? 0 : 0.06 * Math.sin(t * 3));
      this.pnlGlow.material.color.setHex((p.usd ?? 0) >= 0 ? COLOR.up : COLOR.down);
    }
    // ATLAS satellites
    for (const s of this.sats.values()) {
      const a = s.phase + (this.reduced ? 0 : t * s.speed);
      s.body.position.set(Math.cos(a) * 6.3, 0, Math.sin(a) * 6.3);
      const live = s.m.stage === 'armed' || s.m.stage === 'in_trade';
      s.halo.scale.setScalar((s.m.stage === 'off' ? 0.8 : 1.4) * (live && !this.reduced ? 1 + 0.35 * Math.sin(t * 6) : 1));
      s.halo.material.opacity = s.m.stage === 'off' ? 0.35 : 0.9;
    }
    // lightning: three strokes in the first quarter second, then the bolt fades to an afterimage
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.age += dt;
      const f = Math.max(0, 1 - b.age / b.life);
      const stroke = this.reduced ? 1 : RESTRIKE.reduce((m, s) => Math.max(m, Math.exp(-Math.max(0, b.age - s) * 14) * (b.age >= s ? 1 : 0)), 0);
      const after = f * f * 0.35;                                  // the afterimage the eye keeps
      b.core.material.opacity = Math.min(1, stroke + after);
      b.halo.material.opacity = Math.min(1, 0.55 * stroke + after * 0.8);
      b.flash.material.opacity = Math.min(1, 0.7 * stroke + f * 0.3);
      b.flash.scale.setScalar(5 * (0.6 + f));
      b.ripple.scale.setScalar(1 + (1 - f) * 1.3);
      b.ripple.material.opacity = f;
      if (b.age >= b.life) {
        this.g.remove(b.g, b.ripple);
        b.g.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
        b.ripple.geometry.dispose();
        b.ripple.material.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }
}
