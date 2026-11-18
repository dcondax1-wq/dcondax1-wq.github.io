// TYCHE Scales of Fortune: calibration as a balance, and ROI by price bucket as a skyline behind it.
//   Left pan = what the bets said (the n-weighted predicted chance), right pan = what they won (the share won). Each pan
//   holds an orb sized by its rate; the beam tips toward the heavier side, so a right pan that sinks = the bets won more
//   than they said (good). At its feet, one tower per price bucket: height = |ROI|, mint when it made money, rose when not.

export const SCALES_X = 13;
const PIVOT_Y = 1.45, ARM = 2.3, DROP = 1.55, GROUND = -3.2, SKY_Z = 2.6, SKY_H = 2.1;
const GOLD = '#c8a24a', MINT = '#9bab63', ROSE = '#c96a4a';

export class Scales {
  constructor(THREE, glow) {
    this.T = THREE;
    this.glow = glow;
    this.group = new THREE.Group();
    this.group.position.x = SCALES_X;
    this.tilt = 0;
    this.target = 0;
    this.towers = [];
    this.build();
  }

  build() {
    const T = this.T, g = this.glow, gold = g.metal(GOLD, 0.5);
    const plinth = new T.Mesh(new T.CylinderGeometry(1.25, 1.45, 0.3, 48), gold);
    plinth.position.y = GROUND + 0.15;
    const post = new T.Mesh(new T.CylinderGeometry(0.07, 0.1, PIVOT_Y - GROUND, 16), gold);
    post.position.y = (PIVOT_Y + GROUND) / 2;
    const pivot = new T.Mesh(new T.SphereGeometry(0.17, 20, 14), g.metal('#f0dca0', 0.9));
    pivot.position.y = PIVOT_Y;
    const finial = g.sprite(GOLD, 1.8, 0.7);
    finial.position.y = PIVOT_Y + 0.05;
    this.group.add(plinth, post, pivot, finial);
    this.beam = new T.Mesh(new T.BoxGeometry(ARM * 2, 0.08, 0.1), gold);
    this.beam.position.y = PIVOT_Y;
    this.group.add(this.beam);
    // the two pans: chains (lines), a dish, an orb
    this.pans = [GOLD, MINT].map((c) => {
      const pan = new T.Group();
      const dish = new T.Mesh(new T.CylinderGeometry(0.78, 0.55, 0.12, 40, 1), g.metal(GOLD, 0.35));
      const rim = new T.Mesh(new T.TorusGeometry(0.78, 0.03, 8, 48), g.light(GOLD, 0.9));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.06;
      const orb = new T.Mesh(new T.SphereGeometry(1, 28, 18), g.metal(c, 0.8, { metalness: 0.3, roughness: 0.2 }));
      const aura = g.sprite(c, 2, 0.55);
      pan.add(dish, rim, orb, aura);
      const chain = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7 }));
      chain.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(18), 3));
      this.group.add(pan, chain);
      return { pan, orb, aura, chain, r: 0.3 };
    });
    // the skyline's terrace
    const terrace = new T.Mesh(new T.BoxGeometry(8.2, 0.12, 1.6), g.metal('#382715', 0.15, { transparent: true, opacity: 0.85 }));
    terrace.position.set(0, GROUND - 0.06, SKY_Z);
    const edge = new T.Mesh(new T.BoxGeometry(8.2, 0.02, 0.02), g.light(GOLD, 0.8));
    edge.position.set(0, GROUND, SKY_Z + 0.8);
    this.group.add(terrace, edge);
  }

  setModel(model) {
    const c = model ? model.calibration : null;
    this.said = c && c.said != null ? c.said : null;
    this.won = c && c.won != null ? c.won : null;
    this.target = this.said != null && this.won != null ? -Math.max(-0.38, Math.min(0.38, (this.won - this.said) * 3.2)) : 0;
    const size = (v) => (v == null ? 0.12 : 0.16 + Math.sqrt(v) * 0.42);
    this.pans[0].r = size(this.said);
    this.pans[1].r = size(this.won);
    this.pans[1].orb.material.color.set(this.won != null && this.said != null && this.won + 0.0001 < this.said ? ROSE : MINT);
    this.pans[1].orb.material.emissive.copy(this.pans[1].orb.material.color);
    this.pans[1].aura.material.color.copy(this.pans[1].orb.material.color);
    this.pans.forEach((p) => { p.orb.scale.setScalar(p.r); p.orb.position.y = 0.06 + p.r * 0.85; p.aura.position.y = p.orb.position.y; p.aura.scale.setScalar(p.r * 4.5); });
    this.setSkyline(model ? model.buckets.rows : []);
  }

  setSkyline(rows) {
    const T = this.T, g = this.glow;
    this.towers.forEach((t) => { this.group.remove(t.mesh, t.cap, t.glow); t.mesh.material.dispose(); t.cap.material.dispose(); t.mesh.geometry.dispose(); });
    this.towers = [];
    const live = rows.filter((r) => r.roi != null);
    const mx = Math.max(0.05, ...live.map((r) => Math.abs(r.roi)));
    const n = rows.length, gap = Math.min(0.95, 7.6 / Math.max(1, n));
    rows.forEach((r, i) => {
      const h = r.roi == null ? 0.15 : 0.2 + SKY_H * Math.abs(r.roi) / mx, up = r.roi == null || r.roi >= 0, c = r.roi == null ? '#988d81' : up ? MINT : ROSE;
      const geo = new T.BoxGeometry(gap * 0.62, h, 0.62);
      const win = g.windows.clone();
      win.needsUpdate = true;
      win.repeat.set(1, Math.max(1, Math.round(h * 2.2)));
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: new T.Color(c).multiplyScalar(0.35), emissive: new T.Color(c), emissiveMap: win, emissiveIntensity: 0.9,
        metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.92 }));
      const x = (i - (n - 1) / 2) * gap;
      mesh.position.set(x, GROUND + h / 2, SKY_Z);
      const cap = new T.Mesh(new T.BoxGeometry(gap * 0.66, 0.05, 0.66), g.light(c, 1));
      cap.position.set(x, GROUND + h + 0.03, SKY_Z);
      const glow = g.sprite(c, 1.3, 0.55);
      glow.position.set(x, GROUND + h + 0.1, SKY_Z);
      this.group.add(mesh, cap, glow);
      this.towers.push({ mesh, cap, glow, row: r, x, h });
    });
  }

  update(t, dt, motion) {
    this.tilt += (this.target - this.tilt) * (motion ? Math.min(1, dt * 1.6) : 1);
    const sway = motion ? Math.sin(t * 0.9) * 0.012 : 0, a = this.tilt + sway;
    this.beam.rotation.z = a;
    this.pans.forEach((p, i) => {
      const s = i ? 1 : -1, ex = Math.cos(a) * ARM * s, ey = PIVOT_Y + Math.sin(a) * ARM * s;
      p.pan.position.set(ex, ey - DROP, 0);
      const pos = p.chain.geometry.attributes.position.array;
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + 0.4;
        pos.set([ex, ey, 0, ex + Math.cos(ang) * 0.74, ey - DROP + 0.06, Math.sin(ang) * 0.74], k * 6);
      }
      p.chain.geometry.attributes.position.needsUpdate = true;
      if (motion) p.aura.material.opacity = 0.45 + Math.sin(t * 2 + i) * 0.1;
    });
    if (motion) this.towers.forEach((tw, i) => { tw.glow.material.opacity = 0.45 + Math.sin(t * 1.6 + i) * 0.15; });
  }

  /** World anchors for the HUD: the two pans' rates, the gap at the pivot, each tower's range and ROI. */
  anchors() {
    const T = this.T, out = [], X = SCALES_X;
    this.pans.forEach((p, i) => {
      const w = p.pan.position;
      out.push({ id: i ? 'won' : 'said', kind: 'pan', pos: new T.Vector3(X + w.x, w.y - 0.42, 0.6), side: i ? 'won' : 'said' });
    });
    // each tower: its price range and ROI at its foot, every other one a row lower (low), so neighbours never touch
    this.towers.forEach((tw, i) => out.push({ id: 'tw' + i, kind: 'tower', pos: new T.Vector3(X + tw.x, GROUND - 0.05, SKY_Z + 0.75), row: tw.row, low: i % 2 === 1 }));
    return out;
  }
}
