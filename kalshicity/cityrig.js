// KALSHI CITY camera rig (ES module): a damped orbit (one finger turns, two fingers pinch and pan, wheel zooms) with an intro swoop, a slow idle
// turn, a glide to a building, and three fly-through modes the camera rides on closed Catmull-Rom paths:
//   fly     a drone loop high over every district and back across Downtown
//   street  low, in the lanes of the avenues: out in the outbound lane, round the district, back in the inbound lane
//   map     straight down, the whole city (drag pans, pinch zooms)
// A drag, a pinch or a tap on a building hands the camera back to the orbit.
import * as THREE from '../jarvis/three.module.min.js';

export const MODES = [
  { key: 'orbit', label: 'Orbit', hint: 'Orbit: drag to turn, pinch to zoom' },
  { key: 'fly', label: 'Fly', hint: 'Fly: a drone loop over every district' },
  { key: 'street', label: 'Street', hint: 'Street: down in the traffic lanes' },
  { key: 'map', label: 'Map', hint: 'Map: the whole city from above' },
];
const TAP_MOVE = 8, TAP_MS = 450, IDLE_MS = 12000;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Rig {
  /** opts: { calm, extent, onTap(x, y), onChange(), onMode(key) } */
  constructor(camera, dom, opts) {
    this.camera = camera; this.opts = opts; this.mode = 'orbit';
    const R = Math.max(150, Math.min(520, opts.extent * 1.1));
    // A lower opening angle keeps the skyline layered against the horizon instead of
    // flattening thousands of roofs into a speckled overhead map.
    this.home = { theta: -0.8, phi: 1.04, radius: R * 0.72, target: V(0, 10, 0) };
    this.goal = { ...this.home, target: this.home.target.clone() };
    this.view = opts.calm ? { ...this.goal, target: this.goal.target.clone() } : { theta: this.goal.theta - 1.1, phi: 0.5, radius: this.goal.radius * 2.1, target: this.goal.target.clone() };
    this.lastInput = performance.now(); this.ptrs = new Map(); this.gesture = null; this.focusTo = null; this.driver = null; this.curve = null;
    this.limits = { phi: [0.12, 1.5], radius: [14, opts.extent * 3.4] };
    dom.addEventListener('pointerdown', (e) => this._down(e, dom));
    addEventListener('pointermove', (e) => this._move(e));
    addEventListener('pointerup', (e) => this._up(e));
    addEventListener('pointercancel', (e) => this._up(e));
    dom.addEventListener('wheel', (e) => { e.preventDefault(); this._input(); this.goal.radius *= Math.exp(e.deltaY * 0.0012); this._clamp(); }, { passive: false });
  }

  _clamp() { const g = this.goal, l = this.limits; g.phi = Math.max(l.phi[0], Math.min(l.phi[1], g.phi)); g.radius = Math.max(l.radius[0], Math.min(l.radius[1], g.radius)); }
  _input() { this.lastInput = performance.now(); this.focusTo = null; if (this.mode !== 'orbit' && this.mode !== 'map') this.setMode('orbit'); this.opts.onChange && this.opts.onChange(); }
  _down(e, dom) {
    try { dom.setPointerCapture && dom.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer: no capture, the window listeners still see the drag */ }
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.gesture = this.ptrs.size === 1 ? { t0: performance.now(), moved: 0 } : (this.gesture && { ...this.gesture, moved: Infinity });
  }
  _move(e) {
    const prev = this.ptrs.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY }, g = this.goal;
    if (this.ptrs.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (this.gesture) this.gesture.moved += Math.abs(dx) + Math.abs(dy);
      if (this.gesture && this.gesture.moved > TAP_MOVE) {
        this._input();
        if (this.mode === 'map') { const s = g.radius * 0.0021, st = Math.sin(g.theta), ct = Math.cos(g.theta); g.target.x += (st * dx + ct * dy) * s; g.target.z += (-ct * dx + st * dy) * s; } else { g.theta += dx * 0.006; g.phi -= dy * 0.005; }
      }
    } else if (this.ptrs.size === 2) {
      this._input();
      const other = [...this.ptrs.entries()].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      if (d0 > 0 && d1 > 0) g.radius *= d0 / d1;
      const mx = (cur.x - prev.x) / 2, my = (cur.y - prev.y) / 2, s = g.radius * 0.0022, st = Math.sin(g.theta), ct = Math.cos(g.theta);
      g.target.x += (-st * mx - ct * my) * s; g.target.z += (ct * mx - st * my) * s;
    }
    this._clamp(); this.ptrs.set(e.pointerId, cur);
  }
  _up(e) {
    if (!this.ptrs.delete(e.pointerId)) return;
    const g = this.gesture;
    if (g && this.ptrs.size === 0 && g.moved <= TAP_MOVE && performance.now() - g.t0 < TAP_MS) this.opts.onTap(e.clientX, e.clientY);
    if (this.ptrs.size === 0) this.gesture = null;
  }

  /** Glide to a point: a short hop up and over when it is far. */
  focus(x, y, z, radius, phi) {
    if (this.mode !== 'orbit') this.setMode('orbit', null, true);
    const from = this.view.target.clone(), to = V(x, y, z);
    this.focusTo = { from, to, r0: this.view.radius, radius, t: 0, hop: Math.min(120, from.distanceTo(to) * 0.4), phi };
    this.opts.onChange && this.opts.onChange();
  }

  /** Switch mode. L = the layout (needed for fly and street). */
  setMode(key, L, quiet) {
    if (L) this.L = L;
    this.mode = key; this.driver = null; this.focusTo = null;
    const g = this.goal;
    if (key === 'orbit') { this._sync(); } else if (key === 'map') {
      g.phi = 0.2; g.radius = Math.max(200, this.opts.extent * 1.55); g.target.set(0, 0, 0); g.theta = -Math.PI / 2;
      this.limits.phi = [0.1, 0.9];
    } else if (key === 'fly' || key === 'street') this._ride(key);
    if (key !== 'map') this.limits.phi = [0.12, 1.5];
    if (!quiet) this.opts.onMode && this.opts.onMode(this.mode);
    this.opts.onChange && this.opts.onChange();
  }

  _sync() {
    const p = this.camera.position, t = this.at || this.goal.target, off = p.clone().sub(t), r = Math.max(this.limits.radius[0], Math.min(this.limits.radius[1], off.length()));
    const phi = Math.max(0.12, Math.min(1.5, Math.acos(Math.max(-1, Math.min(1, off.y / (r || 1))))));
    Object.assign(this.goal, { theta: Math.atan2(off.z, off.x), phi, radius: r }); this.goal.target.copy(t);
    Object.assign(this.view, { theta: this.goal.theta, phi, radius: r }); this.view.target.copy(t);
  }

  _ride(key) {
    const L = this.L;
    if (!L || L.districts.length < 2) { this.mode = 'orbit'; this._sync(); return; }
    const ds = L.districts.slice(1), pts = [];
    if (key === 'fly') {
      ds.forEach((d, i) => {
        const a = d.ang, R = L.ring;
        pts.push(V(Math.cos(a - 0.2) * R * 0.62, 58 + (i % 2) * 14, Math.sin(a - 0.2) * R * 0.62), V(d.cx + d.ex[0] * d.half * 0.5, 46, d.cz + d.ex[1] * d.half * 0.5), V(Math.cos(a + 0.2) * R * 1.12, 62, Math.sin(a + 0.2) * R * 1.12));
      });
    } else {
      ds.forEach((d) => {
        const along = (k, lat) => V(d.cx * k + (d.ex[0] * lat), 3.4, d.cz * k + (d.ex[1] * lat));
        pts.push(along(0.28, 1.7), along(0.7, 1.7), V(d.cx + d.ex[0] * d.half * 0.55 - d.ez[0] * 4, 3.6, d.cz + d.ex[1] * d.half * 0.55 - d.ez[1] * 4),
          V(d.cx - d.ex[0] * d.half * 0.4 + d.ez[0] * 3, 3.6, d.cz - d.ex[1] * d.half * 0.4 + d.ez[1] * 3), along(0.7, -1.7), along(0.28, -1.7));
      });
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal'), len = curve.getLength(), speed = key === 'fly' ? 26 : 13;
    let u = 0;
    this.at = this.view.target.clone(); this.curve = curve;
    const tmp = new THREE.Vector3();
    this.driver = (dt) => {
      u = (u + (dt * speed) / len) % 1;
      const pos = curve.getPointAt(u), ahead = curve.getPointAt((u + (key === 'fly' ? 0.035 : 0.012)) % 1);
      if (key === 'fly') tmp.copy(ahead).multiplyScalar(0.55).setY(6); else tmp.copy(ahead).setY(5.2);
      return { pos, look: tmp.clone() };
    };
  }

  update(dt) {
    const k = 1 - Math.pow(0.0015, dt), cam = this.camera, g = this.goal, v = this.view;
    if (this.driver) {
      const s = this.driver(dt);
      cam.position.lerp(s.pos, 1 - Math.exp(-dt * 5)); this.at.lerp(s.look, 1 - Math.exp(-dt * 4)); cam.lookAt(this.at);   // frame-rate independent glide (same feel at 30 and 120 fps)
      return true;
    }
    let moving = false;
    if (this.focusTo) {
      const f = this.focusTo;
      f.t = Math.min(1, f.t + dt / (this.opts.calm ? 0.01 : 1.5));
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      g.target.lerpVectors(f.from, f.to, e);
      g.radius = f.r0 + (f.radius - f.r0) * e + Math.sin(Math.PI * e) * f.hop;
      if (f.phi !== undefined) g.phi += (f.phi - g.phi) * Math.min(1, k * 2);
      if (f.t >= 1) this.focusTo = null;
      moving = true;
    }
    const idle = performance.now() - this.lastInput - IDLE_MS;
    if (!this.opts.calm && this.mode === 'orbit' && !this.focusTo && idle > 0) { const r = Math.min(1, idle / 2500); g.theta += dt * 0.03 * r * r * (3 - 2 * r); moving = true; }   // the idle turn eases in
    const dth = g.theta - v.theta, dph = g.phi - v.phi, dr = g.radius - v.radius;
    v.theta += dth * k; v.phi += dph * k; v.radius += dr * k; v.target.lerp(g.target, k);
    if (Math.abs(dth) + Math.abs(dph) > 1e-4 || Math.abs(dr) > 0.01 || v.target.distanceToSquared(g.target) > 1e-4) moving = true;
    const sp = Math.sin(v.phi);
    cam.position.set(v.target.x + v.radius * sp * Math.cos(v.theta), v.target.y + v.radius * Math.cos(v.phi), v.target.z + v.radius * sp * Math.sin(v.theta));
    cam.lookAt(v.target);
    return moving;
  }
}
