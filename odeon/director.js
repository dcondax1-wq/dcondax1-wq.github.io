// ODEON director: the camera as a film crew. Pure maths on a three.js camera; no DOM.
//   const dir = new Director(camera, { reduced });  dir.reset();  dir.beat('sweep', at);  dir.update(dt, wall, ctx)
//   ctx = { b: theater.bounds(T), head: theater.head, phase: 'pre' | 'in' | 'post', aspect, dx }
// Shots: a crane-in when a reel starts, a tracking dolly beside the building tape before the entry, a wider two-shot of the
// stop and the target while in the trade, a slow reveal orbit after the exit. Beats (sweep, entry, exit, breakeven, CISD)
// push in and swing around the moment for a second or two. The viewer can drag to orbit and pinch / wheel to zoom; the
// director takes the camera back 3.5 s after the last touch. prefers-reduced-motion: no sway, no beats, no shake.

const BEATS = { sweep: [1.8, 0.55, 0.0, 0.34], entry: [2.4, -0.45, -0.12, 0.3], exit: [3.0, 0.5, 0.06, 0.22], be: [1.2, 0.2, 0, 0.12],
  cisd5: [1.2, -0.2, 0, 0.15], cisd1: [1.0, 0.18, 0, 0.12] }; // [seconds, yaw, pitch, push-in]
const RAMP = { sweep: [0.3, 0.7], entry: [0.12, 1.5], exit: [0.15, 1.9] }; // [speed at the bottom, seconds held]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
const bell = (u) => { const s = Math.sin(Math.PI * clamp(u, 0, 1)); return s * s; };

export class Director {
  constructor(camera, opts) {
    this.cam = camera;
    this.reduced = !!(opts && opts.reduced);
    this.beats = [];
    this.user = { yaw: 0, pitch: 0, zoom: 1, last: -1e9 };
    this.s = null; // smoothed {lx, ly, d, yaw, pitch}
    this.shake = 0;
  }

  reset() {
    this.s = null;
    this.beats = [];
    this.user = { yaw: 0, pitch: 0, zoom: 1, last: -1e9 };
  }

  beat(kind, wall) {
    if (this.reduced || !BEATS[kind]) return;
    this.beats = this.beats.filter((b) => wall - b.at < b.dur);
    this.beats.push({ kind, at: wall, dur: BEATS[kind][0] });
    if (kind === 'exit') this.shake = 0.35;
  }

  /** The time ramp of the slow-motion moments: the tape eases down to RAMP's speed in 0.3 s, holds, then eases back up in
      0.6 s (the sweep a short dip, the entry and the exit a real slow-motion shot). 1 = normal speed. */
  slowmo(wall) {
    let k = 1;
    for (const b of this.beats) {
      const r = RAMP[b.kind];
      if (!r) continue;
      const age = wall - b.at, [low, hold] = r, a = 0.3, z = 0.6;
      if (age < 0 || age > a + hold + z) continue;
      const f = age < a ? ease(age / a) : age < a + hold ? 1 : 1 - ease((age - a - hold) / z);
      k = Math.min(k, 1 - (1 - low) * f);
    }
    return k;
  }

  orbit(dYaw, dPitch, wall) {
    this.user.yaw = clamp(this.user.yaw + dYaw, -1.4, 1.4);
    this.user.pitch = clamp(this.user.pitch + dPitch, -0.25, 0.7);
    this.user.last = wall;
  }

  zoom(f, wall) {
    this.user.zoom = clamp(this.user.zoom * f, 0.45, 2.2);
    this.user.last = wall;
  }

  get userActive() { return this.user.last > -1e8; }

  /** the shot the director wants now: look-at point, distance, yaw, pitch */
  _shot(ctx, wall) {
    const { b, head, phase, aspect, dx } = ctx;
    const tanH = Math.tan((this.cam.fov * Math.PI) / 360);
    const fit = (spanV, spanX) => Math.max(spanV / 2 / tanH, spanX / 2 / (tanH * aspect));
    const portrait = aspect < 1;
    let lx, ly, d, yaw = -0.34, pitch = 0.17;
    const fill = ctx.fill || 1; // the share of the screen height free of the HUD and the captions
    const bars = portrait ? 34 : 64;
    if (phase === 'pre') {
      const spanX = bars * dx;
      const L = b.local(bars);
      lx = head.x - spanX * 0.2;
      ly = (L.yLo + L.yHi) / 2;
      d = fit(Math.max(2.2, (L.yHi - L.yLo) * 1.5) / fill, spanX);
    } else if (phase === 'in') {
      // frame the action, the entry and the stop; the gate joins the shot when price heads for it (and on the entry beat)
      const L = b.local(bars);
      const toward = b.yTarget > b.yEntry ? 1 : -1;
      const risk = Math.abs(b.yEntry - b.yStop);
      const reveal = this.beats.some((bt) => bt.kind === 'entry' && wall - bt.at < bt.dur) ? 1 : 0;
      const tgt = reveal ? b.yTarget : b.yEntry + toward * Math.min(Math.abs(b.yTarget - b.yEntry), risk * 1.2);
      let y0 = Math.min(L.yLo, b.yStop, b.yEntry, tgt) - 0.4;
      const y1 = Math.max(L.yHi, b.yStop, b.yEntry, tgt) + 0.4;
      if (!reveal && b.floorY != null) y0 = Math.max(y0, Math.min(L.yLo, b.yStop) - 1.4); // no shot of the empty floor
      const spanX = Math.min(Math.max((head.x - b.xEntry) * 1.25 + 10 * dx, bars * dx), (portrait ? 54 : 120) * dx);
      lx = Math.max(head.x - spanX * 0.32, b.xEntry + spanX * 0.08);
      ly = (y0 + y1) / 2;
      d = fit((y1 - y0) * 1.1 / fill, spanX);
      yaw = -0.24;
    } else {
      const x0 = Math.max(0, b.xEntry - 30 * dx), x1 = b.xExit + 6 * dx;
      const L = b.local(Math.round((x1 - x0) / dx));
      const y0 = Math.min(b.yStop, b.yTarget, L.yLo), y1 = Math.max(b.yStop, b.yTarget, L.yHi);
      lx = (x0 + x1) / 2;
      ly = (y0 + y1) / 2;
      d = fit((y1 - y0) * 1.15 / fill, (x1 - x0) * 1.1);
      yaw = this.reduced ? -0.2 : -0.2 + 0.32 * Math.sin(wall * 0.12);
      pitch = 0.22;
    }
    if (!this.reduced) {
      yaw += 0.07 * Math.sin(wall * 0.21);
      pitch += 0.025 * Math.sin(wall * 0.17 + 1.3);
    }
    let push = 0;
    for (const bt of this.beats) {
      const u = (wall - bt.at) / bt.dur;
      if (u < 0 || u >= 1) continue;
      const [, by, bp, bz] = BEATS[bt.kind];
      const w = bell(u);
      yaw += by * w; pitch += bp * w; push = Math.max(push, bz * w);
    }
    d *= 1 - push;
    // the exit beat looks at the exit itself before the reveal of the whole trade
    for (const bt of this.beats) {
      const u = (wall - bt.at) / bt.dur;
      if (bt.kind !== 'exit' || u < 0 || u >= 1) continue;
      const w = u < 0.5 ? 1 : bell(u);
      lx += (head.x - lx) * w; ly += (head.y - ly) * w;
    }
    // the viewer's own orbit, handed back to the director after 3.5 s
    const idle = wall - this.user.last;
    const back = idle > 3.5 ? Math.exp(-(idle - 3.5) * 1.2) : 1;
    yaw += this.user.yaw * back; pitch += this.user.pitch * back;
    d *= 1 + (this.user.zoom - 1) * back;
    if (back < 0.01 && this.userActive) this.user = { yaw: 0, pitch: 0, zoom: 1, last: -1e9 };
    return { lx, ly, d: clamp(d, 3.5, 90), yaw, pitch: clamp(pitch, -0.2, 0.95) };
  }

  update(dt, wall, ctx) {
    const want = this._shot(ctx, wall);
    if (!this.s) {
      // the opening crane: start high and wide, glide down into the first shot
      this.s = { lx: want.lx - 4, ly: want.ly + 3, d: want.d * (this.reduced ? 1.2 : 2.3), yaw: want.yaw - (this.reduced ? 0 : 0.9),
        pitch: this.reduced ? want.pitch : 0.62 };
    }
    const k = 1 - Math.exp(-dt * (this.reduced ? 2.2 : 3.2));
    const kd = 1 - Math.exp(-dt * (this.reduced ? 1.6 : 2.2));
    const s = this.s;
    s.lx += (want.lx - s.lx) * k; s.ly += (want.ly - s.ly) * k; s.d += (want.d - s.d) * kd;
    s.yaw += (want.yaw - s.yaw) * kd; s.pitch += (want.pitch - s.pitch) * kd;
    const cp = Math.cos(s.pitch);
    let px = s.lx + s.d * Math.sin(s.yaw) * cp, py = s.ly + s.d * Math.sin(s.pitch), pz = s.d * Math.cos(s.yaw) * cp;
    py = Math.max(py, (ctx.b.floorY || 0) + 0.35);
    if (this.shake > 0 && !this.reduced) {
      this.shake = Math.max(0, this.shake - dt);
      const a = this.shake * 0.25;
      px += (Math.random() - 0.5) * a; py += (Math.random() - 0.5) * a;
    }
    this.cam.position.set(px, py, pz);
    this.cam.lookAt(s.lx, s.ly, 0);
  }
}
