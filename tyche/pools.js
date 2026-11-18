// TYCHE pools: where settled bets go, and the bankroll.
//   Settled bets fall from the wheel as coins: a win lands in the gold fountain (it bursts), a loss lands on the dark sand
//   and dissolves into it. The fountain's gold rises with the wins' share, the sand heap with the losses'.
//   The bankroll is a column of light under the wheel (its axle); the equity curve winds up around it (one point per equity sample, oldest at the
//   foot), mint where it rose and rose-red where it fell; the column's top is the balance now.

export const FLOOR_Y = -6;
const FOUNTAIN = [-3.4, FLOOR_Y, 1.2], SAND = [3.4, FLOOR_Y, 1.2], COLUMN = [0, FLOOR_Y, 0];     // the column is the wheel's axle
const GOLD = '#c8a24a', MINT = '#9bab63', ROSE = '#c96a4a';
const BASIN_R = 1.7, COL_MAX = 5.2, TURNS = 2.2, HELIX_PTS = 72;
const FALL_S = 1.55, GAP_S = 1.1, PAUSE_S = 3.5, REPLAY = 14;

import { Sparks } from './sparks.js';
export class Pools {
  constructor(THREE, glow, opts = {}) {
    this.T = THREE;
    this.glow = glow;
    this.lite = !!opts.lite;
    this.group = new THREE.Group();
    this.queue = [];
    this.falling = [];
    this.pops = [];                           // landed coins' P&L labels, for the HUD: {id, pos, text, win, age}
    this.seen = new Set();
    this.wait = 0.8;
    this.burst = 0;
    this.fill = 0.5;
    this.heap = 0.5;
    this.colH = 4;
    this.buildBasins();
    this.buildFountain();
    this.buildSand();
    this.buildColumn();
    this.coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24);
  }

  buildBasins() {
    const T = this.T, g = this.glow;
    [[FOUNTAIN, GOLD, 0.6], [SAND, '#b0763c', 0.25]].forEach(([p, c, e]) => {
      const rim = new T.Mesh(new T.TorusGeometry(BASIN_R, 0.08, 12, 72), g.metal(c, e));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(p[0], p[1] + 0.05, p[2]);
      this.group.add(rim);
      const wall = new T.Mesh(new T.CylinderGeometry(BASIN_R, BASIN_R * 0.86, 0.5, 48, 1, true), g.metal(c, e * 0.4, { side: T.DoubleSide, transparent: true, opacity: 0.55 }));
      wall.position.set(p[0], p[1] - 0.2, p[2]);
      this.group.add(wall);
    });
    // the gold surface: rises with the wins' share
    this.liquid = new T.Mesh(new T.CircleGeometry(BASIN_R - 0.06, 48), g.light(GOLD, 0.55));
    this.liquid.rotation.x = -Math.PI / 2;
    this.group.add(this.liquid);
    this.liquidGlow = g.sprite(GOLD, 5.5, 0.35);
    this.group.add(this.liquidGlow);
  }

  buildFountain() {
    const n = this.lite ? 260 : 720;
    this.jet = this.glow.points(n, this.lite ? 0.16 : 0.12, 0.95);
    this.jetV = new Float32Array(n * 3);
    const c = this.jet.geometry.attributes.color.array, gold = new this.T.Color(GOLD), white = new this.T.Color('#f3ece0'), mint = new this.T.Color(MINT), amber = new this.T.Color('#e0a060');
    for (let i = 0; i < n; i++) { const k = i % 13 === 0 ? mint : i % 4 === 0 ? white : i % 7 === 0 ? amber : gold; c.set([k.r, k.g, k.b], i * 3); this.spawnDrop(i, Math.random()); }
    this.group.add(this.jet);
    this.sparks = new Sparks(this.T, this.glow, this.lite ? 60 : 140, 0.11);      // coin-drop sparks
    this.group.add(this.sparks.pts);
    // the mist: fewer, bigger, softer drops thrown wider and lower round the jet (the fountain's glow)
    const m = this.lite ? 50 : 150;
    this.mist = this.glow.points(m, this.lite ? 0.36 : 0.3, 0.32);
    this.mistV = new Float32Array(m * 3);
    const mc = this.mist.geometry.attributes.color.array, pale = new this.T.Color('#f0dca0');
    for (let i = 0; i < m; i++) { mc.set([pale.r, pale.g, pale.b], i * 3); this.spawnMist(i, Math.random()); }
    this.group.add(this.mist);
  }

  spawnMist(i, life) {
    const p = this.mist.geometry.attributes.position.array, v = this.mistV, a = Math.random() * Math.PI * 2, y = this.surfaceY();
    v[i * 3] = Math.cos(a) * (0.6 + Math.random() * 0.8);
    v[i * 3 + 1] = (1.3 + Math.random() * 1.1) * (1 + this.burst * 0.6);
    v[i * 3 + 2] = Math.sin(a) * (0.6 + Math.random() * 0.8);
    p.set([FOUNTAIN[0], y, FOUNTAIN[2]], i * 3);
    if (life) { for (let k = 0; k < 3; k++) p[i * 3 + k] += v[i * 3 + k] * life * 0.6; p[i * 3 + 1] = Math.max(y, p[i * 3 + 1] - 4.9 * life * life * 0.3); }
  }

  spawnDrop(i, life) {
    const p = this.jet.geometry.attributes.position.array, v = this.jetV, a = Math.random() * Math.PI * 2, r = Math.random() * 0.12;
    const power = 1 + this.burst * 0.9;
    v[i * 3] = Math.cos(a) * (0.25 + Math.random() * 0.55);
    v[i * 3 + 1] = (2.6 + Math.random() * 1.6) * power * (0.55 + this.fill * 0.6);
    v[i * 3 + 2] = Math.sin(a) * (0.25 + Math.random() * 0.55);
    const y = this.surfaceY();
    p.set([FOUNTAIN[0] + Math.cos(a) * r, y, FOUNTAIN[2] + Math.sin(a) * r], i * 3);
    // spread the first frame so the jet is already full
    if (life) for (let k = 0; k < 3; k++) { p[i * 3 + k] += v[i * 3 + k] * life * 0.9; }
    if (life) { p[i * 3 + 1] -= 4.9 * life * life * 0.8; if (p[i * 3 + 1] < y) p[i * 3 + 1] = y; }
  }

  buildSand() {
    const T = this.T, n = this.lite ? 320 : 950;
    this.sand = this.glow.points(n, this.lite ? 0.09 : 0.07, 1);
    this.sand.material.blending = T.NormalBlending;
    this.sandSeed = new Float32Array(n * 3);
    const c = this.sand.geometry.attributes.color.array;
    const tones = ['#b0763c', '#6a4928', '#e0a060', '#4c341d', '#e0a060'].map((x) => new T.Color(x));
    for (let i = 0; i < n; i++) {
      const k = tones[i % 17 === 0 ? 4 : i % tones.length === 4 ? 0 : i % 4];
      c.set([k.r, k.g, k.b], i * 3);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (BASIN_R - 0.12);
      this.sandSeed.set([a, r, Math.random()], i * 3);
    }
    this.dune = new T.Mesh(new T.ConeGeometry(BASIN_R - 0.1, 1, 48, 1), new T.MeshStandardMaterial({ color: '#5a3e22', roughness: 0.95, metalness: 0.05,
      emissive: '#1f1811', emissiveIntensity: 1 }));
    this.dune.position.set(SAND[0], FLOOR_Y - 0.1, SAND[2]);
    this.group.add(this.dune, this.sand);
    // grains loose in the air: a lost coin dissolving
    this.puff = this.glow.points(this.lite ? 60 : 140, 0.09, 1);
    this.puff.material.blending = T.NormalBlending;
    this.puffV = new Float32Array(this.puff.geometry.attributes.position.count * 4);       // vx, vy, vz, life
    const pc = this.puff.geometry.attributes.color.array, dark = new T.Color('#4d351d');
    for (let i = 0; i < this.puff.geometry.attributes.position.count; i++) { pc.set([dark.r, dark.g, dark.b], i * 3); this.puff.geometry.attributes.position.array[i * 3 + 1] = -99; }
    this.group.add(this.puff);
    this.shapeSand();
  }

  /** The heap: a cone whose height is the losses' share. */
  shapeSand() {
    const p = this.sand.geometry.attributes.position.array, s = this.sandSeed, h = 0.12 + this.heap * 1.1;
    this.dune.scale.y = h * 0.92;
    this.dune.position.y = FLOOR_Y - 0.1 + (h * 0.92) / 2;
    for (let i = 0; i < p.length / 3; i++) {
      const a = s[i * 3], r = s[i * 3 + 1], j = s[i * 3 + 2];
      const y = FLOOR_Y - 0.1 + h * Math.max(0, 1 - r / (BASIN_R - 0.1)) * (0.93 + j * 0.07);
      p.set([SAND[0] + Math.cos(a) * r, y, SAND[2] + Math.sin(a) * r], i * 3);
    }
    this.sand.geometry.attributes.position.needsUpdate = true;
  }

  buildColumn() {
    const T = this.T, g = this.glow;
    this.column = new T.Group();
    this.column.position.set(COLUMN[0], COLUMN[1], COLUMN[2]);
    this.group.add(this.column);
    this.shaft = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 1, 32, 1, true), g.light(GOLD, 0.55, { map: g.fade, side: T.DoubleSide }));
    this.core = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 1, 12, 1, true), g.light('#f3ece0', 0.9, { map: g.fade }));
    this.column.add(this.shaft, this.core);
    const base = new T.Mesh(new T.TorusGeometry(0.62, 0.05, 10, 48), g.metal(GOLD, 0.6));
    base.rotation.x = Math.PI / 2;
    this.column.add(base);
    this.head = g.sprite('#f3ece0', 1.6, 0.9);
    this.column.add(this.head);
    this.foot = g.sprite(GOLD, 3.2, 0.4);
    this.column.add(this.foot);
    this.motes = g.points(this.lite ? 40 : 110, 0.09, 0.9);
    const c = this.motes.geometry.attributes.color.array, k = new T.Color('#f0dca0');
    for (let i = 0; i < c.length / 3; i++) { c.set([k.r, k.g, k.b], i * 3); this.motes.geometry.attributes.position.array.set([(Math.random() - 0.5) * 0.5, Math.random() * 4, (Math.random() - 0.5) * 0.5], i * 3); }
    this.column.add(this.motes);
    this.helix = null;
  }

  /** The equity path -> the column's height and the helix around it. */
  setEquity(pts) {
    const T = this.T;
    if (this.helix) { this.column.remove(this.helix); this.helix.geometry.dispose(); this.helix.material.dispose(); this.helix = null; }
    // the helix is drawn from at most HELIX_PTS samples (evenly picked, first and last kept): a curve, not noise
    const step = Math.max(1, (pts.length - 1) / (HELIX_PTS - 1));
    const vals = pts.length <= HELIX_PTS ? pts.map((p) => p[1]) : Array.from({ length: HELIX_PTS }, (_, i) => pts[Math.min(pts.length - 1, Math.round(i * step))][1]);
    if (!vals.length) { this.colH = 3; return this.sizeColumn(); }
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const H = (v) => 0.6 + (COL_MAX - 0.6) * (v - lo) / (hi - lo);
    this.colH = H(vals[vals.length - 1]);
    this.sizeColumn();
    if (vals.length < 2) return;
    const n = vals.length, curve = new T.CatmullRomCurve3(vals.map((v, i) => {
      const a = (i / (n - 1)) * Math.PI * 2 * TURNS;
      return new T.Vector3(Math.cos(a) * 0.95, H(v), Math.sin(a) * 0.95);
    }));
    const segs = Math.min(this.lite ? 220 : 480, n * 4), radial = this.lite ? 4 : 6;
    const geo = new T.TubeGeometry(curve, segs, this.lite ? 0.05 : 0.042, radial, false);
    const col = new Float32Array(geo.attributes.position.count * 3), up = new T.Color(MINT), down = new T.Color(ROSE);
    for (let s = 0; s <= segs; s++) {
      const u = (s / segs) * (n - 1), i = Math.min(n - 2, Math.floor(u)), k = vals[i + 1] >= vals[i] ? up : down;
      for (let r = 0; r <= radial; r++) col.set([k.r, k.g, k.b], (s * (radial + 1) + r) * 3);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    this.helix = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.column.add(this.helix);
    // drawn in from the foot (update() grows its draw range), and a comet with a short tail runs up the curve, foot to now
    this.curve = curve;
    this.helixN = geo.index ? geo.index.count : geo.attributes.position.count;
    this.helixStep = radial * 6;
    this.grow = this.grown ? 1 : 0;                     // drawn in once per visit; a minute's new point just appears
    this.grown = true;
    if (this.grow < 1) geo.setDrawRange(0, 0);
    if (!this.comet) this.comet = [1, 0.62, 0.38].map((s, i) => this.glow.sprite(i ? GOLD : '#f3ece0', 0.62 * s, 0.95 - i * 0.25));
    this.comet.forEach((c) => this.helix.add(c));
  }

  sizeColumn() {
    this.shaft.scale.y = this.colH; this.shaft.position.y = this.colH / 2;
    this.core.scale.y = this.colH; this.core.position.y = this.colH / 2;
    this.head.position.y = this.colH;
  }

  /** New settled bets fall; the pools' levels follow the wins / losses. A first load replays the last few. */
  setModel(model, colors) {
    this.colors = colors;
    const st = model ? model.stats : null, w = st && st.wins != null ? st.wins : 0, l = st && st.losses != null ? st.losses : 0;
    this.fill = w + l > 0 ? w / (w + l) : 0.5;
    this.heap = w + l > 0 ? l / (w + l) : 0.3;
    this.shapeSand();
    this.setEquity(model ? model.equity.pts : []);
    const settled = model ? model.settled : [];
    const fresh = settled.filter((s) => !this.seen.has(s.key));
    settled.forEach((s) => this.seen.add(s.key));
    this.replay = settled.slice(-REPLAY);
    this.queue.push(...(this.queue.length || this.falling.length ? fresh : fresh.slice(-REPLAY)));
  }

  surfaceY() { return FLOOR_Y - 0.15 + 0.12 + this.fill * 0.32; }

  drop(bet) {
    const T = this.T, color = (this.colors && this.colors.get(bet.category)) || GOLD;
    const mesh = new T.Mesh(this.coinGeo, this.glow.metal(color, 0.6, { transparent: true }));
    const a = Math.random() * Math.PI * 2, from = new T.Vector3(Math.cos(a) * 3.1, 0.1, Math.sin(a) * 3.1);
    const at = bet.win ? FOUNTAIN : SAND;
    const to = new T.Vector3(at[0] + (Math.random() - 0.5) * 0.5, bet.win ? this.surfaceY() : FLOOR_Y + 0.15 + this.heap * 0.8, at[2] + (Math.random() - 0.5) * 0.5);
    mesh.position.copy(from);
    this.group.add(mesh);
    this.falling.push({ bet, mesh, from, to, t: 0, fade: 0, spin: (Math.random() - 0.5) * 14 });
  }

  land(f) {
    const b = f.bet, txt = (b.pnl >= 0 ? '+$' : '−$') + Math.abs(b.pnl).toFixed(2);
    this.pops.push({ id: 'p:' + b.key + ':' + Math.random().toString(36).slice(2, 6), pos: f.to.clone(), text: txt, win: b.win, age: 0 });
    if (this.pops.length > 4) this.pops.shift();
    if (b.win) { this.burst = 1; this.sparks.burst(f.to, this.lite ? 12 : 26, '#c8a24a', 3.4, 1.0); this.sparks.burst(f.to, 6, '#f3ece0', 2.2, 0.7); }
    else { this.puffAt(f.to); this.sparks.burst(f.to, 8, '#c96a4a', 1.6, 0.6, 0.6); }
  }

  puffAt(p) {
    const pos = this.puff.geometry.attributes.position.array, v = this.puffV, n = pos.length / 3;
    for (let i = 0, k = 0; i < n && k < 40; i++) {
      if (v[i * 4 + 3] > 0) continue;
      pos.set([p.x, p.y, p.z], i * 3);
      const a = Math.random() * Math.PI * 2, s = 0.3 + Math.random() * 0.9;
      v.set([Math.cos(a) * s, 0.4 + Math.random() * 1.2, Math.sin(a) * s, 1 + Math.random() * 0.8], i * 4);
      k++;
    }
  }

  update(t, dt, motion) {
    const sy = this.surfaceY();
    this.liquid.position.set(FOUNTAIN[0], sy, FOUNTAIN[2]);
    this.liquidGlow.position.set(FOUNTAIN[0], sy + 0.2, FOUNTAIN[2]);
    if (!motion) {                            // reduced motion: everything at rest, only the levels speak
      this.jet.visible = false;
      this.mist.visible = false;
      if (this.helix) { this.helix.geometry.setDrawRange(0, Infinity); this.comet.forEach((c) => { c.visible = false; }); }
      this.falling.forEach((f) => this.group.remove(f.mesh));
      this.falling = [];
      this.queue = [];
      return;
    }
    this.jet.visible = true;
    this.mist.visible = true;
    this.burst = Math.max(0, this.burst - dt * 0.8);
    this.liquidGlow.material.opacity = 0.3 + this.burst * 0.5 + Math.sin(t * 2) * 0.04;
    // the jet
    const p = this.jet.geometry.attributes.position.array, v = this.jetV;
    for (let i = 0; i < p.length / 3; i++) {
      v[i * 3 + 1] -= 4.9 * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < sy && v[i * 3 + 1] < 0) this.spawnDrop(i, 0);
    }
    this.jet.geometry.attributes.position.needsUpdate = true;
    const mp = this.mist.geometry.attributes.position.array, mv = this.mistV;
    for (let i = 0; i < mp.length / 3; i++) {
      mv[i * 3 + 1] -= 3.2 * dt;
      mp[i * 3] += mv[i * 3] * dt; mp[i * 3 + 1] += mv[i * 3 + 1] * dt; mp[i * 3 + 2] += mv[i * 3 + 2] * dt;
      if (mp[i * 3 + 1] < sy && mv[i * 3 + 1] < 0) this.spawnMist(i, 0);
    }
    this.mist.geometry.attributes.position.needsUpdate = true;
    // the sand's loose grains
    const q = this.puff.geometry.attributes.position.array, w = this.puffV;
    for (let i = 0; i < q.length / 3; i++) {
      if (w[i * 4 + 3] <= 0) continue;
      w[i * 4 + 3] -= dt;
      w[i * 4 + 1] -= 3 * dt;
      q[i * 3] += w[i * 4] * dt; q[i * 3 + 1] += w[i * 4 + 1] * dt; q[i * 3 + 2] += w[i * 4 + 2] * dt;
      if (q[i * 3 + 1] < FLOOR_Y) { q[i * 3 + 1] = FLOOR_Y; w[i * 4] *= 0.5; w[i * 4 + 2] *= 0.5; }
      if (w[i * 4 + 3] <= 0) q[i * 3 + 1] = -99;
    }
    this.puff.geometry.attributes.position.needsUpdate = true;
    // the column's motes rise
    const m = this.motes.geometry.attributes.position.array;
    for (let i = 0; i < m.length / 3; i++) { m[i * 3 + 1] += dt * (0.6 + (i % 5) * 0.15); if (m[i * 3 + 1] > this.colH) m[i * 3 + 1] = 0; }
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.head.material.opacity = 0.75 + Math.sin(t * 3) * 0.15;
    if (this.helix) {
      this.helix.rotation.y += dt * 0.12;
      // the equity curve draws itself in (2.4 s, eased), whole segments only; then the comet runs foot to top every 6 s
      this.grow = Math.min(1, this.grow + dt / 2.4);
      const e = 1 - Math.pow(1 - this.grow, 3), segs = Math.round((e * this.helixN) / this.helixStep);
      this.helix.geometry.setDrawRange(0, segs * this.helixStep);
      const head = this.grow < 1 ? e : (t / 6) % 1;
      this.comet.forEach((c, i) => {
        const u = Math.max(0, Math.min(1, head - i * 0.012));
        c.position.copy(this.curve.getPointAt(u));
        c.visible = head > 0.002;
      });
    }
    // the falling coins: one every GAP_S; when all fell, the last few fall again after a pause
    this.wait -= dt;
    if (this.wait <= 0) {
      if (this.queue.length) { this.drop(this.queue.shift()); this.wait = GAP_S; } else if (!this.falling.length && this.replay && this.replay.length) { this.queue = this.replay.slice(); this.wait = PAUSE_S; }
    }
    this.falling = this.falling.filter((f) => {
      f.t += dt / FALL_S;
      if (f.t < 1) {
        const k = f.t, arc = Math.sin(Math.PI * k) * 1.4;
        f.mesh.position.lerpVectors(f.from, f.to, k * k * (3 - 2 * k)).y += arc;
        f.mesh.rotation.x += f.spin * dt; f.mesh.rotation.z += f.spin * 0.6 * dt;
        return true;
      }
      if (!f.fade) this.land(f);
      f.fade += dt * (f.bet.win ? 2.5 : 1.2);
      f.mesh.material.opacity = Math.max(0, 1 - f.fade);
      if (!f.bet.win) { f.mesh.position.y -= dt * 0.2; f.mesh.material.color.lerp(new this.T.Color('#29231d'), Math.min(1, dt * 3)); }
      if (f.fade < 1) return true;
      this.group.remove(f.mesh);
      f.mesh.material.dispose();
      return false;
    });
    this.pops.forEach((x) => { x.age += dt; x.pos.y += dt * 0.5; });
    if (motion) this.sparks.update(dt);
    this.pops = this.pops.filter((x) => x.age < 2.4);
  }

  anchors(model) {
    const st = model ? model.stats : null, out = [];
    out.push({ id: 'pw', kind: 'pool', pos: new this.T.Vector3(FOUNTAIN[0], FLOOR_Y + 0.75, FOUNTAIN[2] + BASIN_R + 0.2), win: true,
      text: st && st.wins != null ? `${st.wins.toLocaleString('en-US')} wins` : 'Wins' });
    out.push({ id: 'pl', kind: 'pool', pos: new this.T.Vector3(SAND[0], FLOOR_Y + 0.75, SAND[2] + BASIN_R + 0.2), win: false,
      text: st && st.losses != null ? `${st.losses.toLocaleString('en-US')} losses` : 'Losses' });
    out.push({ id: 'col', kind: 'balance', pos: new this.T.Vector3(COLUMN[0], COLUMN[1] + this.colH + 0.55, COLUMN[2]) });
    this.pops.forEach((x) => out.push({ id: x.id, kind: 'pop', pos: x.pos.clone().setY(x.pos.y + 0.45), text: x.text, win: x.win, age: x.age }));
    return out;
  }
}
