// Camera of the Data City: orbit (one finger / mouse drag), pinch zoom + two-finger pan, wheel zoom, a damped intro
// swoop, slow idle rotation, glides (tap-to-zoom district transitions: up, across, down), and a "driven" mode the
// cinematic tour (tour.js) steers. Taps (short, still presses) are handed back.
import * as THREE from '../jarvis/three.module.min.js';

const TAP_MOVE = 6;          // px
const TAP_MS = 450;
const IDLE_MS = 9000;        // idle rotation starts after this long without input
const LIMITS = { phi: [0.18, 1.45], radius: [8, 900] };
const GLIDE_S = 1.7;          // a district transition

export class Orbit {
  /** camera: THREE camera; dom: the canvas; opts: { calm (reduced motion), onTap(x, y), onFlyEnd() } */
  constructor(camera, dom, opts) {
    this.camera = camera;
    this.opts = opts;
    this.goal = { theta: -0.75, phi: 1.04, radius: opts.radius || 360, target: new THREE.Vector3(0, 0, 8) };
    this.view = opts.calm ? { ...this.goal, target: this.goal.target.clone() }
                          : { theta: this.goal.theta - 0.9, phi: 0.55, radius: this.goal.radius * 2.2, target: this.goal.target.clone() };  // intro swoop
    this.focusTo = null;
    this.fly = null;
    this.lastInput = performance.now();
    this.ptrs = new Map();
    this.gesture = null;
    dom.addEventListener('pointerdown', (e) => this._down(e, dom));
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    dom.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
  }

  get flying() { return !!this.driver; }

  _clamp() {
    const g = this.goal;
    g.phi = Math.max(LIMITS.phi[0], Math.min(LIMITS.phi[1], g.phi));
    g.radius = Math.max(LIMITS.radius[0], Math.min(LIMITS.radius[1], g.radius));
  }

  _touched() { this.lastInput = performance.now(); this.focusTo = null; }

  _down(e, dom) {
    dom.setPointerCapture?.(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._touched();
    this.gesture = this.ptrs.size === 1 ? { t0: performance.now(), moved: 0 } : (this.gesture && { ...this.gesture, moved: Infinity });
  }

  _move(e) {
    const prev = this.ptrs.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY }, g = this.goal;
    this._touched();
    if (this.ptrs.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (this.gesture) this.gesture.moved += Math.abs(dx) + Math.abs(dy);
      if (this.gesture && this.gesture.moved > TAP_MOVE && this.steer && this.driver) {
        this.steer(dx, dy);                                  // the street walk: one finger turns and tilts the head, the walk goes on
      } else if (this.gesture && this.gesture.moved > TAP_MOVE) {
        this.stopFly();
        g.theta += dx * 0.006;
        g.phi -= dy * 0.005;
      }
    } else if (this.ptrs.size === 2) {
      this.stopFly();
      const other = [...this.ptrs.entries()].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      if (d0 > 0 && d1 > 0) g.radius *= d0 / d1;
      const mx = (cur.x - prev.x) / 2, my = (cur.y - prev.y) / 2, s = g.radius * 0.0022;
      const st = Math.sin(g.theta), ct = Math.cos(g.theta);      // right = (sin, 0, -cos), forward = (-cos, 0, -sin)
      g.target.x += (-st * mx - ct * my) * s;
      g.target.z += (ct * mx - st * my) * s;
    }
    this._clamp();
    this.ptrs.set(e.pointerId, cur);
  }

  _up(e) {
    if (!this.ptrs.delete(e.pointerId)) return;
    const g = this.gesture;
    if (g && this.ptrs.size === 0 && g.moved <= TAP_MOVE && performance.now() - g.t0 < TAP_MS) this.opts.onTap(e.clientX, e.clientY);
    if (this.ptrs.size === 0) this.gesture = null;
  }

  _wheel(e) {
    e.preventDefault();
    this.stopFly();
    this._touched();
    this.goal.radius *= Math.exp(e.deltaY * 0.0012);
    this._clamp();
  }

  /** Glide to a point (a building's middle) from a given distance: a short hop up and over when it is far. */
  focus(x, y, z, radius, phi) {
    this.stopFly();
    const from = this.view.target.clone(), to = new THREE.Vector3(x, y, z), d = from.distanceTo(to);
    this.focusTo = { from, target: to, r0: this.view.radius, radius, t: 0, hop: Math.min(260, d * 0.45), phi };
    if (phi === undefined) this.goal.phi = Math.min(this.goal.phi, 0.95);
  }

  /** The tour drives the camera: fn(dt) -> { pos: Vector3, look: Vector3 } | null (null ends it). */
  drive(fn) { this.stopFly(); this.driver = fn; this.at = this.view.target.clone(); }

  stopFly() {
    if (!this.driver) return;
    this.driver = null; this.steer = null;
    this.syncFromCamera();
    this.opts.onFlyEnd?.();
  }

  /** Orbit on from wherever the camera is now (after the tour). */
  syncFromCamera() {
    const p = this.camera.position, t = this.at || this.goal.target;
    const off = p.clone().sub(t), r = Math.max(LIMITS.radius[0], Math.min(LIMITS.radius[1], off.length()));
    const phi = Math.max(LIMITS.phi[0], Math.min(LIMITS.phi[1], Math.acos(Math.max(-1, Math.min(1, off.y / (r || 1))))));
    const theta = Math.atan2(off.z, off.x);
    Object.assign(this.goal, { theta, phi, radius: r }); this.goal.target.copy(t);
    Object.assign(this.view, { theta, phi, radius: r }); this.view.target.copy(t);
  }

  update(dt) {
    const k = 1 - Math.pow(0.0015, dt), cam = this.camera;
    if (this.driver) {
      const s = this.driver(dt);
      if (!s) { this.stopFly(); return; }
      cam.position.copy(s.pos);
      this.at.copy(s.look);
      cam.lookAt(this.at);
      return;
    }
    const g = this.goal, v = this.view;
    if (this.focusTo) {
      const f = this.focusTo;
      f.t = Math.min(1, f.t + dt / (this.opts.calm ? 0.01 : GLIDE_S));
      const e = f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2;      // ease in-out
      g.target.lerpVectors(f.from, f.target, e);
      g.radius = f.r0 + (f.radius - f.r0) * e + Math.sin(Math.PI * e) * f.hop;
      if (f.phi !== undefined) g.phi = g.phi + (f.phi - g.phi) * Math.min(1, k * 2);
      v.target.copy(g.target); v.radius = g.radius;
      if (f.t >= 1) this.focusTo = null;
    }
    if (!this.opts.calm && !this.focusTo && performance.now() - this.lastInput > IDLE_MS) g.theta += dt * 0.035;
    v.theta += (g.theta - v.theta) * k;
    v.phi += (g.phi - v.phi) * k;
    v.radius += (g.radius - v.radius) * k;
    v.target.lerp(g.target, k);
    const sp = Math.sin(v.phi);
    cam.position.set(v.target.x + v.radius * sp * Math.cos(v.theta), v.target.y + v.radius * Math.cos(v.phi),
                     v.target.z + v.radius * sp * Math.sin(v.theta));
    cam.lookAt(v.target);
  }
}
