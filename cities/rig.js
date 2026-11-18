// The camera rig of the Cities hub: one orbit camera (drag to turn, pinch to zoom, two fingers to pan, wheel on a desktop),
// glides (flyTo) and path flights (the hub tour, a city's skim / drone / grand cameras). Touch first: pointer events only, taps
// are reported to the page (a tap is under 8 px of movement and 400 ms). The camera never goes under the floor.
import * as THREE from '../jarvis/three.module.min.js';
import { clamp, smooth } from './util.js';

const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

export class Rig {
  constructor(camera, dom, hooks = {}) {
    this.camera = camera; this.dom = dom; this.hooks = hooks;
    this.t = new THREE.Vector3(0, 20, 0);
    this.yaw = 0.4; this.pitch = 0.42; this.dist = 300;
    this.limits = { min: 20, max: 1500, pmin: 0.06, pmax: 1.5 };
    this.fly = null; this.path = null; this.idle = 0; this.auto = 0.04;
    this.ptr = new Map(); this.tapStart = null; this.last = null;
    this.mode = 'orbit';
    this.reduced = reducedMotion();
    // Desktop flight uses the same bounded camera target as touch panning.
    // Ignore typing in search boxes and clear keys if the tab loses focus.
    this.keys = new Set();
    const flightKeys = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
    if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
      const target = e.target;
      if (e.altKey || e.ctrlKey || e.metaKey || (target && (target.closest('input,textarea,select,[contenteditable="true"]')))) return;
      const key = e.key.toLowerCase();
      if (!flightKeys.has(key)) return;
      this.keys.add(key);
      if (key !== 'shift') { e.preventDefault(); this._touched(); }
    });
    if (typeof window !== 'undefined') window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    if (typeof window !== 'undefined') window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._move(e));
    for (const ev of ['pointerup', 'pointercancel']) dom.addEventListener(ev, (e) => this._up(e));
    dom.addEventListener('wheel', (e) => { e.preventDefault(); this._touched(); this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), this.limits.min, this.limits.max); }, { passive: false });
    this.apply();
  }

  apply() {
    const { yaw, pitch, dist, t } = this, cp = Math.cos(pitch);
    this.camera.position.set(t.x + dist * cp * Math.sin(yaw), Math.max(2.5, t.y + dist * Math.sin(pitch)), t.z + dist * cp * Math.cos(yaw));
    this.camera.lookAt(t);
  }

  _touched() { this.idle = 0; if (this.fly) { const d = this.fly.done; this.fly = null; if (d) d(); } if (this.path) { this.path = null; this.mode = 'orbit'; if (this.hooks.onFreed) this.hooks.onFreed(); } }

  _down(e) {
    this.dom.setPointerCapture && this.dom.setPointerCapture(e.pointerId);
    this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.tapStart = this.ptr.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 } : null;
    this._touched();
    this.last = this._multi();
  }

  _multi() {
    const pts = [...this.ptr.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _move(e) {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.ptr.size === 1) {
      if (this.tapStart) this.tapStart.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.0062; this.pitch = clamp(this.pitch + dy * 0.0048, this.limits.pmin, this.limits.pmax);
    } else if (this.ptr.size === 2) {
      const m = this._multi();
      if (this.last && m) {
        this.dist = clamp(this.dist * (this.last.d / Math.max(10, m.d)), this.limits.min, this.limits.max);
        const k = this.dist * 0.0017, right = new THREE.Vector3(), up = new THREE.Vector3();
        this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
        const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
        this.t.addScaledVector(right, -(m.cx - this.last.cx) * k).addScaledVector(fwd, (m.cy - this.last.cy) * k * 0.9);
        if (this.hooks.clampTarget) this.hooks.clampTarget(this.t);
      }
      this.last = m;
      if (this.tapStart) this.tapStart.moved = 99;
    }
    this._touched();
  }

  _up(e) {
    const p = this.ptr.get(e.pointerId);
    this.ptr.delete(e.pointerId);
    this.last = this._multi();
    const ts = this.tapStart;
    if (ts && p && this.ptr.size === 0 && ts.moved < 8 && performance.now() - ts.t < 400 && this.hooks.onTap) {
      const r = this.dom.getBoundingClientRect();
      this.hooks.onTap(e.clientX - r.left, e.clientY - r.top);
    }
    if (this.ptr.size === 0) this.tapStart = null;
  }

  /** glide the orbit to a pose over `dur` seconds: { x, y, z, dist, pitch, yaw } (any may be left out) */
  flyTo(p, dur = 1.1) {
    this.path = null; this.mode = 'orbit';
    const from = { x: this.t.x, y: this.t.y, z: this.t.z, dist: this.dist, pitch: this.pitch, yaw: this.yaw };
    const to = { ...from, ...p };
    let dy = to.yaw - from.yaw;                       // the short way round
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    to.yaw = from.yaw + dy;
    this.fly = { from, to, k: 0, dur: this.reduced ? 0.01 : Math.max(0.01, dur) };
    this.idle = 0;
    return new Promise((res) => { this.fly.done = res; });
  }

  /** follow a path { pos, look: CatmullRomCurve3, length } at `speed` units a second */
  follow(path, speed = 30, loop = true, mode = 'path') {
    this.fly = null; this.path = { ...path, u: 0, speed, loop }; this.mode = mode; this.idle = 0;
  }
  stopPath() { this.path = null; this.mode = 'orbit'; }

  update(dt) {
    if (this.fly) {
      const f = this.fly;
      f.k = Math.min(1, f.k + dt / f.dur);
      const s = smooth(f.k), a = f.from, b = f.to;
      this.t.set(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s, a.z + (b.z - a.z) * s);
      this.dist = a.dist + (b.dist - a.dist) * s; this.pitch = a.pitch + (b.pitch - a.pitch) * s; this.yaw = a.yaw + (b.yaw - a.yaw) * s;
      this.apply();
      if (f.k >= 1) { const d = f.done; this.fly = null; if (d) d(); }
      return;
    }
    if (this.path) {
      const P = this.path;
      P.u += (dt * P.speed) / P.length;
      if (P.u >= 1) { if (P.loop) P.u -= 1; else { this.path = null; this.mode = 'orbit'; if (this.hooks.onFreed) this.hooks.onFreed(); return; } }
      const pos = P.pos.getPointAt(P.u), look = P.look.getPointAt(P.u);
      this.camera.position.copy(pos); this.camera.position.y = Math.max(2.5, pos.y);
      this.camera.lookAt(look);
      // keep the orbit state in step so a touch takes over from where the camera is
      this.t.copy(look);
      const d = this.camera.position.clone().sub(look);
      this.dist = clamp(d.length(), this.limits.min, this.limits.max); this.pitch = clamp(Math.asin(clamp(d.y / Math.max(1e-3, d.length()), -1, 1)), this.limits.pmin, this.limits.pmax); this.yaw = Math.atan2(d.x, d.z);
      return;
    }
    // W/S move toward/away from the scene; A/D strafe; Q/E descend/ascend.
    // Arrows mirror W/A/S/D. Shift speeds up a flight. Clamp frame time so a
    // backgrounded tab cannot jump across the world when it resumes.
    const k = this.keys, axis = (pos, neg) => +(k.has(pos)) - +(k.has(neg));
    const forward = axis('w', 's') + axis('arrowup', 'arrowdown');
    const right = axis('d', 'a') + axis('arrowright', 'arrowleft');
    const rise = axis('e', 'q');
    if (forward || right || rise) {
      const speed = Math.min(280, Math.max(25, this.dist * 0.45)) * (k.has('shift') ? 2.4 : 1);
      const step = Math.min(0.05, Math.max(0, dt)) * speed / Math.max(1, Math.hypot(forward, right, rise));
      this.t.x += (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) * step;
      this.t.z += (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right) * step;
      this.t.y = Math.max(0, this.t.y + rise * step);
      if (this.hooks.clampTarget) this.hooks.clampTarget(this.t);
      this.idle = 0;
    } else this.idle += dt;
    if (!this.reduced && this.idle > 5 && this.ptr.size === 0 && this.auto) this.yaw += dt * this.auto;
    this.apply();
  }
}

/** A closed or open CatmullRom flight through points; look targets follow the same parameter. */
export function makePath(pos, look, closed = true) {
  const P = new THREE.CatmullRomCurve3(pos.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  const L = new THREE.CatmullRomCurve3(look.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return { pos: P, look: L, length: Math.max(1, P.getLength()) };
}

// A cached roof-height grid keeps guided flights out of measured buildings.
// The precomputed climb envelope rises before a tower, rather than jumping at it.
const flightFloors = new WeakMap();
export function safeFlight(path, city) {
  let floor = flightFloors.get(city);
  if (!floor) {
    const cell = Math.max(6, city.pitch), heights = new Map();
    for (let k = 0; k < city.n; k++) {
      const x0 = Math.floor((city.x[k] - city.w[k] / 2 - 3) / cell), x1 = Math.floor((city.x[k] + city.w[k] / 2 + 3) / cell);
      const z0 = Math.floor((city.z[k] - city.d[k] / 2 - 3) / cell), z1 = Math.floor((city.z[k] + city.d[k] / 2 + 3) / cell);
      const height = city.y0[k] + city.h[k];
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = `${x}:${z}`; heights.set(key, Math.max(heights.get(key) || 0, height)); }
    }
    floor = (x, z) => heights.get(`${Math.floor(x / cell)}:${Math.floor(z / cell)}`) || 0;
    flightFloors.set(city, floor);
  }
  const count = clamp(Math.ceil(path.length / 2), 256, 8192), step = path.length / count, profile = new Float32Array(count);
  for (let i = 0; i < count; i++) { const p = path.pos.getPointAt(i / count); profile[i] = Math.max(p.y, floor(p.x, p.z) + 8); }
  // Circular forward/backward sweeps bound the climb to ~19 degrees.
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < count * 2; j++) { const i = j % count, previous = (i + count - 1) % count; profile[i] = Math.max(profile[i], profile[previous] - step * .35); }
    for (let j = count * 2 - 1; j >= 0; j--) { const i = j % count, next = (i + 1) % count; profile[i] = Math.max(profile[i], profile[next] - step * .35); }
  }
  const source = path.pos;
  return { ...path, pos: { getPointAt(u) {
    const p = source.getPointAt(u), phase = ((u % 1) + 1) % 1 * count, i = Math.floor(phase), mix = phase - i;
    p.y = Math.max(p.y, profile[i] * (1 - mix) + profile[(i + 1) % count] * mix, floor(p.x, p.z) + 6);
    return p;
  } }, clearanceSamples: count };
}

