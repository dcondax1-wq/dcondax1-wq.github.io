// TYCHE sparks: one pool of additive points for short bursts (the wheel's rim when it spins, a coin landing in the pools).
// burst(p, n, colour, speed, life, up) emits n sparks from p; fling() throws one along a tangent; update(dt) moves them (gravity,
// fade). HDR colours, so the render core's bloom takes them. One draw call, no allocation per frame. Pure visual: it never reads or
// changes a bet.
export class Sparks {
  constructor(THREE, glow, n = 160, size = 0.12) {
    this.n = n; this.next = 0;
    this.pts = glow.points(n, size, 1);
    this.pos = this.pts.geometry.attributes.position.array; this.col = this.pts.geometry.attributes.color.array;
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.base = new Float32Array(n * 3);
    this.pos.fill(-999);
    this.tmp = new THREE.Color();
  }

  burst(p, n, color, speed, life, up = 1) {
    this.tmp.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.next, j = i * 3; this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2, u = Math.random(), s = speed * (0.35 + 0.65 * Math.random());
      this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
      this.vel[j] = Math.cos(a) * s * (1 - u * 0.4); this.vel[j + 1] = s * (0.5 + u) * up; this.vel[j + 2] = Math.sin(a) * s * (1 - u * 0.4);
      this.life[i] = this.max[i] = life * (0.6 + 0.4 * Math.random());
      this.base[j] = this.tmp.r * 2.2; this.base[j + 1] = this.tmp.g * 2.2; this.base[j + 2] = this.tmp.b * 2.2;
    }
  }

  /** one spark thrown along the tangent (dx, dz) from p: the spinning rim */
  fling(p, dx, dz, color, speed, life) {
    this.burst(p, 1, color, speed * 0.3, life, 0.5);
    const j = ((this.next + this.n - 1) % this.n) * 3;
    this.vel[j] += dx * speed; this.vel[j + 2] += dz * speed;
  }

  update(dt) {
    const { pos, vel, col, base, life, max } = this;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      if (life[i] <= 0) { if (col[j] || col[j + 1] || col[j + 2]) { col[j] = col[j + 1] = col[j + 2] = 0; pos[j + 1] = -999; } continue; }
      life[i] -= dt; vel[j + 1] -= 6.5 * dt;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      const f = Math.max(0, life[i] / max[i]);
      col[j] = base[j] * f; col[j + 1] = base[j + 1] * f; col[j + 2] = base[j + 2] * f;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}
