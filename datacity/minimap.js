// The minimap: every district as a square in its sign colour, the plaza, the harbor, the river, the monorail loop with its stations,
// the gold ideas (gold dots), the search matches (cyan dots), the watched buildings, and the camera with its view wedge. Redrawn a few times a second (never in the frame loop's hot path); a tap reports the world
// point and the district under it.
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble
const SIZE = 112;            // CSS px

export class Minimap {
  /** canvas: the <canvas>; L: layout(); onPick(x, z, district|null) */
  constructor(canvas, L, onPick) {
    this.c = canvas; this.L = L; this.onPick = onPick;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(SIZE * dpr);
    canvas.style.width = canvas.style.height = SIZE + 'px';
    this.g = canvas.getContext('2d');
    this.g.scale(dpr, dpr);
    const b = L.bounds, pad = 12;
    this.span = Math.max(b.x1 - b.x0, b.z1 - b.z0, (L.worldRadius || 0) * 2) + pad * 2;
    // The LIT tower is the capital and the center of the city network.
    this.cx = 0; this.cz = 0;
    this.pins = [];
    this.gold = [];          // [x, z] of the gold ideas
    this.hits = [];          // [x, z] of the search matches
    this.R = null;           // routes(): the river and the monorail
    this.t = 0;
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const [x, z] = this.toWorld(e.clientX - r.left, e.clientY - r.top);
      const d = L.districts.find((q) => Math.abs(q.cx - x) <= (q.wide ? q.w / 2 : q.half) && Math.abs(q.cz - z) <= q.half) || null;
      onPick(x, z, d);
    });
  }

  /** the river and the monorail: draw them and widen the map to hold the river */
  fit(R) {
    this.R = R;
    let r = 0;
    for (const [x, z] of R.river.concat(R.rail)) r = Math.max(r, Math.abs(x - this.cx), Math.abs(z - this.cz));
    this.span = Math.max(this.span, r * 2 + 14);
  }

  toMap(x, z) { return [((x - this.cx) / this.span + 0.5) * SIZE, ((z - this.cz) / this.span + 0.5) * SIZE]; }
  toWorld(px, py) { return [(px / SIZE - 0.5) * this.span + this.cx, (py / SIZE - 0.5) * this.span + this.cz]; }

  /** camera: THREE camera; target: what it looks at */
  draw(camera, target, dt = 1) {
    this.t += dt;
    if (this.t < 0.2) return;
    this.t = 0;
    const g = this.g, s = SIZE / this.span;
    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = (NEON ? 'rgba(6,8,20,.72)' : 'rgba(24,19,14,.86)');
    g.fillRect(0, 0, SIZE, SIZE);
    for (const d of this.L.districts) {
      const [x, y] = this.toMap(d.cx, d.cz), hw = (d.wide ? d.w / 2 : d.half) * s, hh = d.half * s;
      g.fillStyle = d.css + (d.kind === 'harbor' ? '33' : '55');
      g.strokeStyle = d.css;
      g.lineWidth = 1;
      g.fillRect(x - hw, y - hh, hw * 2, hh * 2);
      g.strokeRect(x - hw, y - hh, hw * 2, hh * 2);
    }
    if (this.L.satellites) {
      g.lineWidth = 0.7;
      g.strokeStyle = (NEON ? 'rgba(62,216,255,.30)' : 'rgba(216,178,90,.30)');
      for (const link of this.L.satellites.links) {
        if (link.kind !== 'district') continue;
        const [x0, y0] = this.toMap(...link.from), [x1, y1] = this.toMap(...link.to);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      g.strokeStyle = (NEON ? 'rgba(62,216,255,.62)' : 'rgba(216,178,90,.62)'); g.lineWidth = 1;
      for (const link of this.L.satellites.links) {
        if (link.kind !== 'ring') continue;
        const [x0, y0] = this.toMap(...link.from), [x1, y1] = this.toMap(...link.to);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      for (const town of this.L.satellites.towns) {
        const [x, y] = this.toMap(town.x, town.z);
        g.fillStyle = town.accent ? (NEON ? '#45e9a3' : '#a2b16d') : (NEON ? '#ffad4d' : '#d69b60');
        g.beginPath(); g.arc(x, y, town.accent ? 1.7 : 1.15, 0, Math.PI * 2); g.fill();
      }
    }
    if (this.R) {
      g.strokeStyle = (NEON ? 'rgba(63,170,255,.75)' : 'rgba(111,160,192,.8)'); g.lineWidth = 2.2; g.lineJoin = 'round';
      g.beginPath();
      this.R.river.forEach(([x, z], i) => { const [a, b] = this.toMap(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.setLineDash([2, 2]);
      g.beginPath();
      this.R.rail.forEach(([x, z], i) => { const [a, b] = this.toMap(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
      g.closePath(); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffffff';
      for (const st of this.R.stations) { const [a, b] = this.toMap(st.x, st.z); g.fillRect(a - 1.2, b - 1.2, 2.4, 2.4); }
    }
    const [px, py] = this.toMap(0, 0);
    g.strokeStyle = (NEON ? 'rgba(63,216,255,.75)' : 'rgba(216,178,90,.8)'); g.lineWidth = 1;
    g.beginPath(); g.arc(px, py, Math.max(2, this.L.plazaR * s * 0.5), 0, Math.PI * 2); g.stroke();
    g.fillStyle = (NEON ? '#fff0b2' : '#e4ca8d');
    g.beginPath(); g.arc(px, py, 2.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = (NEON ? '#3fd8ff' : '#d39556');
    for (const [x, z] of this.gold) { const [a, b] = this.toMap(x, z); g.beginPath(); g.arc(a, b, 2.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = (NEON ? '#3fd8ff' : '#d39556');
    for (const [x, z] of this.hits) { const [a, b] = this.toMap(x, z); g.fillRect(a - 1, b - 1, 2, 2); }
    g.fillStyle = (NEON ? '#ffd36b' : '#d79e64');
    for (const [x, z] of this.pins) { const [a, b] = this.toMap(x, z); g.fillRect(a - 1.5, b - 1.5, 3, 3); }
    const [cx, cy] = this.toMap(camera.position.x, camera.position.z), [tx, ty] = this.toMap(target.x, target.z);
    const a = Math.atan2(ty - cy, tx - cx), fov = 0.55;
    g.fillStyle = 'rgba(255,255,255,.16)';
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 34, a - fov, a + fov); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(Math.max(3, Math.min(SIZE - 3, cx)), Math.max(3, Math.min(SIZE - 3, cy)), 3, 0, Math.PI * 2); g.fill();
  }
}
