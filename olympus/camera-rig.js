// OLYMPUS camera rig (shared by every 3D world, 2026-11-11 "scene direction" pass): how it FEELS to be in a world on a phone.
// Pure maths (no three.js import, node-tested in tests/test_scene_direction.py): the rig writes camera.position and calls camera.lookAt(x, y, z), so any
// three.js camera works. Shots:
//   follow    third person behind the player's own character: swipe orbits it, pinch zooms, it eases back behind them while they walk, and frames a nearby person too
//   talk      a cinematic conversation: an over-the-shoulder two-shot first, then a close-up of the speaker with a slow dolly in (fx-cine focus via opts.focus)
//   establish a wide establishing shot that glides down into the follow camera when you enter a place
//   tour      a calm orbit around a centre
//   fixed     a given position and look point
// THE RULE: the camera is never inside geometry. Every frame the damped position is checked with a sphere cast from a free pivot (the player's or the speaker's
// head) against the scene's colliders (boxes, upright circles, wall segments, the ground) and pulled in in front of the first hit. world = makeWorld({...}).
//
//   makeWorld({ boxes:[{x0,x1,y0,y1,z0,z1}], circles:[{x,z,r,y0,y1}], walls:[{ax,az,bx,bz,t,y0,y1}], ground: 0, ceiling: null }) -> world
//   hits(world, p, r) -> bool            castSphere(world, a, b, r) -> 0..1 (the free part of the segment a -> b)
//   createRig(camera, { world, reduced, focus(point|null) }) -> { shot(name, params), follow(target), orbit(dAz, dPitch), zoom(k), interest(p|null),
//                                                                update(dt) -> state, state(), inside(r), dispose() }
// target = { x, y (feet), z, h (head height, default 1.5), yaw (facing: forward = (sin yaw, cos yaw)), moving }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => { const t = clamp(k, 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const v3 = (x, y, z) => ({ x: +x || 0, y: +y || 0, z: +z || 0 });

// ------------------------------------------------------------------------------------------------ colliders
const isNum = (v) => typeof v === 'number' && isFinite(v);
/** a world of simple colliders (cheap to test a sphere against; a scene describes its walls, tables and crates with them) */
export function makeWorld(o) {
  const w = o || {};
  const boxes = (w.boxes || []).filter((b) => b && isNum(b.x0) && isNum(b.x1) && isNum(b.z0) && isNum(b.z1)).map((b) => ({ x0: Math.min(b.x0, b.x1), x1: Math.max(b.x0, b.x1), z0: Math.min(b.z0, b.z1), z1: Math.max(b.z0, b.z1), y0: isNum(b.y0) ? b.y0 : 0, y1: isNum(b.y1) ? b.y1 : 3, tag: b.tag || '' }));
  const circles = (w.circles || []).filter((c) => c && isNum(c.x) && isNum(c.z) && isNum(c.r)).map((c) => ({ x: c.x, z: c.z, r: Math.abs(c.r), y0: isNum(c.y0) ? c.y0 : 0, y1: isNum(c.y1) ? c.y1 : 2, tag: c.tag || '' }));
  const walls = (w.walls || []).filter((s) => s && isNum(s.ax) && isNum(s.az) && isNum(s.bx) && isNum(s.bz)).map((s) => ({ ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, t: isNum(s.t) ? s.t : 0.15, y0: isNum(s.y0) ? s.y0 : 0, y1: isNum(s.y1) ? s.y1 : 4, tag: s.tag || '' }));
  return { boxes, circles, walls, ground: isNum(w.ground) ? w.ground : 0, ceiling: isNum(w.ceiling) ? w.ceiling : null, groundAt: typeof w.groundAt === 'function' ? w.groundAt : null };
}
function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1) : 0, qx = ax + dx * t - px, qz = az + dz * t - pz;
  return qx * qx + qz * qz;
}
/** does a sphere of radius r at p touch anything (or go below the ground / above the ceiling)? returns the collider's tag, '' for nothing */
export function hitTag(world, p, r) {
  const W = world, R = r || 0;
  const g = W.groundAt ? W.groundAt(p.x, p.z) : W.ground;
  if (p.y - R < g) return 'ground';
  if (W.ceiling != null && p.y + R > W.ceiling) return 'ceiling';
  for (const b of W.boxes) {
    const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dy = Math.max(b.y0 - p.y, 0, p.y - b.y1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1);
    if (dx * dx + dy * dy + dz * dz < R * R) return b.tag || 'box';
  }
  for (const c of W.circles) {
    if (p.y + R < c.y0 || p.y - R > c.y1) continue;
    const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < c.r + R) return c.tag || 'circle';
  }
  for (const s of W.walls) {
    if (p.y + R < s.y0 || p.y - R > s.y1) continue;
    const rr = s.t + R; if (segDist2(p.x, p.z, s.ax, s.az, s.bx, s.bz) < rr * rr) return s.tag || 'wall';
  }
  return '';
}
export const hits = (world, p, r) => !!hitTag(world, p, r);
/** sweep a sphere of radius r from a to b: the fraction of the way it can travel before touching something (1 = free all the way; a blocked start = 0) */
export function castSphere(world, a, b, r) {
  if (hits(world, a, r)) return 0;
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.ceil(L / Math.max(0.05, (r || 0.1) * 0.75))), at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  let ok = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (hits(world, at(t), r)) { let lo = ok, hi = t; for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (hits(world, at(m), r)) hi = m; else lo = m; } return lo; }
    ok = t;
  }
  return 1;
}

// ------------------------------------------------------------------------------------------------ damping (critically damped spring: no overshoot, frame-rate independent)
export function damp(cur, target, vel, smoothTime, dt) {
  const st = Math.max(0.0001, smoothTime), om = 2 / st, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (vel.v + om * ch) * dt;
  vel.v = (vel.v - om * tmp) * e;
  let out = target + (ch + tmp) * e;
  if ((target - cur > 0) === (out > target)) { out = target; vel.v = 0; }
  return out;
}

// ------------------------------------------------------------------------------------------------ the rig
const FOLLOW = { dist: 4.2, min: 1.6, max: 9, pitch: 0.32, pitchMin: -0.05, pitchMax: 1.05, lead: 0.6, recenter: 1.4 };
/** the rig. opts: { world, reduced, radius (camera sphere, 0.22), focus(point | null) (the fx-cine focus hook), near(alpha) (the player fades when the camera is very close) } */
export function createRig(camera, opts) {
  const o = opts || {}, R = o.radius || 0.22, reduced = !!o.reduced;
  const S = {
    world: o.world || makeWorld({}), mode: 'follow', t: 0, shotT: 0, params: {},
    target: { x: 0, y: 0, z: 0, h: 1.5, yaw: 0, moving: false },
    az: 0, pitch: o.pitch || FOLLOW.pitch, dist: o.dist || FOLLOW.dist, userT: -99, interest: null,
    pos: v3(0, 3, 6), look: v3(0, 1.4, 0), vel: { x: { v: 0 }, y: { v: 0 }, z: { v: 0 }, lx: { v: 0 }, ly: { v: 0 }, lz: { v: 0 } }, pulled: 0, cut: true, pivot: v3(0, 1.4, 0), last: null,
  };
  const head = (p) => v3(p.x, (p.y || 0) + (p.h || 1.5), p.z);
  /** the pose a shot wants right now: { pos, look, pivot (a free point the camera must see), smooth (seconds) } */
  function want(dt) {
    const P = S.params, T = S.target;
    if (S.mode === 'fixed') return { pos: v3(P.pos.x, P.pos.y, P.pos.z), look: v3(P.look.x, P.look.y, P.look.z), pivot: P.pivot ? v3(P.pivot.x, P.pivot.y, P.pivot.z) : v3(P.look.x, P.look.y, P.look.z), smooth: P.smooth || 0.5 };
    if (S.mode === 'tour') {
      const c = P.center || v3(0, 0, 0), a = (P.a0 || 0) + S.shotT * (P.speed || 0.08) * (reduced ? 0 : 1), r = P.r || 10, h = P.h || 6;
      const look = v3(c.x, (c.y || 0) + (P.lookY || 0.8), c.z);
      return { pos: v3(c.x + Math.sin(a) * r, (c.y || 0) + h, c.z + Math.cos(a) * r), look, pivot: v3(c.x, (c.y || 0) + Math.max(1.5, h * 0.5), c.z), smooth: 1.2 };
    }
    if (S.mode === 'talk') {
      // A = the player (or the listener), B = the speaker. Two-shot over A's shoulder, then a close-up of B with a slow dolly in.
      const A = P.a, B = P.b, hA = head(A), hB = head(B), dx = hB.x - hA.x, dz = hB.z - hA.z, d = Math.hypot(dx, dz) || 1, fx = dx / d, fz = dz / d, rx = fz, rz = -fx;
      const side = P.side || 1, close = S.shotT > (P.two == null ? 1.8 : P.two) || P.closeOnly;
      if (!close) {
        const pos = v3(hA.x - fx * 1.05 + rx * 0.55 * side, hA.y + 0.18, hA.z - fz * 1.05 + rz * 0.55 * side);
        return { pos, look: v3(lerp(hA.x, hB.x, 0.72), hB.y - 0.12 - (P.lookDown || 0) * 0.6, lerp(hA.z, hB.z, 0.72)), pivot: hA, smooth: 0.45, phase: 'two-shot' };
      }
      const k = reduced ? 0 : smooth((S.shotT - (P.two == null ? 1.8 : P.two)) / 7), back = (P.back || 1.6) - 0.28 * k;
      const pos = v3(hB.x - fx * back + rx * 0.42 * side, hB.y + 0.05, hB.z - fz * back + rz * 0.42 * side);
      return { pos, look: v3(hB.x, hB.y - 0.06 - (P.lookDown || 0), hB.z), pivot: hB, smooth: 0.65, phase: 'close-up' };      // lookDown: the face sits higher in the frame (a chat sheet covers the bottom)
    }
    // follow (and the end of an establishing shot)
    const hp = head(T);
    if (T.moving && dt > 0 && S.t - S.userT > FOLLOW.recenter && !reduced) S.az += angDiff(S.az, T.yaw) * Math.min(1, dt * 1.1);
    let look = v3(hp.x + (T.moving ? Math.sin(T.yaw) * FOLLOW.lead : 0), hp.y - 0.15, hp.z + (T.moving ? Math.cos(T.yaw) * FOLLOW.lead : 0)), dist = S.dist;
    if (S.interest && !T.moving) {                                  // auto-framing: a person near you is in the shot with you
      const I = S.interest, dd = Math.hypot(I.x - hp.x, I.z - hp.z);
      if (dd < 6) { look = v3(lerp(look.x, I.x, 0.35), lerp(look.y, (I.y || 0) + (I.h || 1.4) - 0.1, 0.35), lerp(look.z, I.z, 0.35)); dist = Math.max(dist, Math.min(FOLLOW.max, 2.4 + dd * 0.55)); }
    }
    const cp = Math.cos(S.pitch), pos = v3(look.x - Math.sin(S.az) * cp * dist, look.y + Math.sin(S.pitch) * dist, look.z - Math.cos(S.az) * cp * dist);
    let out = { pos, look, pivot: hp, smooth: 0.28 };
    if (S.mode === 'establish') {
      // from a wide pose (E.from, E.look) down into the follow camera, or into E.to = { pos, look, pivot } (a scene with no player: Symposium's place at the table)
      const E = P, k = reduced ? 1 : smooth(S.shotT / (E.dur || 3)), a = E.from || pos, la = E.look || look, ep = E.to ? E.to.pos : pos, el = E.to ? E.to.look : look, epv = E.to ? (E.to.pivot || E.to.pos) : hp;
      out = { pos: v3(lerp(a.x, ep.x, k), lerp(a.y, ep.y, k), lerp(a.z, ep.z, k)), look: v3(lerp(la.x, el.x, k), lerp(la.y, el.y, k), lerp(la.z, el.z, k)), pivot: E.pivot && k < 0.6 ? v3(E.pivot.x, E.pivot.y, E.pivot.z) : v3(epv.x, epv.y, epv.z), smooth: 0.08, phase: k >= 1 ? 'landed' : 'gliding' };
      if (k >= 1 && S.shotT > (E.dur || 3)) { if (E.to && E.next) { S.mode = E.next; S.params = E.nextParams || E.to; S.shotT = 0; } else S.mode = 'follow'; if (typeof E.done === 'function') { const d = E.done; E.done = null; try { d(); } catch (_) { /* fine */ } } }
    }
    return out;
  }
  /** the free spot nearest to `pos` on the line pivot -> pos (never inside a collider) */
  function constrain(pivot, pos) {
    if (!hits(S.world, pivot, R * 0.6)) {
      const f = castSphere(S.world, pivot, pos, R);
      if (f < 1) { const L = Math.hypot(pos.x - pivot.x, pos.y - pivot.y, pos.z - pivot.z) || 1, back = Math.max(0, f - 0.04 / L); S.pulled = 1 - back; return v3(pivot.x + (pos.x - pivot.x) * back, pivot.y + (pos.y - pivot.y) * back, pivot.z + (pos.z - pivot.z) * back); }
    }
    S.pulled = 0;
    if (hits(S.world, pos, R)) {                                    // the pivot itself is inside (a crowd, a doorway): lift the camera until it is free
      for (let k = 1; k <= 30; k++) { const q = v3(pos.x, pos.y + k * 0.15, pos.z); if (!hits(S.world, q, R)) return q; }
    }
    return pos;
  }
  function update(dt0) {
    const dt = clamp(+dt0 || 0, 0, 0.1); S.t += dt; S.shotT += dt;
    const w = want(dt); S.pivot = w.pivot;
    const goal = constrain(w.pivot, w.pos);
    if (S.cut || reduced) { S.pos = goal; S.look = w.look; for (const k in S.vel) S.vel[k].v = 0; S.cut = false; }
    else {
      const st = w.smooth;
      S.pos = v3(damp(S.pos.x, goal.x, S.vel.x, st, dt), damp(S.pos.y, goal.y, S.vel.y, st, dt), damp(S.pos.z, goal.z, S.vel.z, st, dt));
      S.look = v3(damp(S.look.x, w.look.x, S.vel.lx, st * 0.8, dt), damp(S.look.y, w.look.y, S.vel.ly, st * 0.8, dt), damp(S.look.z, w.look.z, S.vel.lz, st * 0.8, dt));
      S.pos = constrain(w.pivot, S.pos);                             // the damped path may cut a corner: constrain it again
    }
    if (camera) { camera.position.set(S.pos.x, S.pos.y, S.pos.z); camera.lookAt(S.look.x, S.look.y, S.look.z); }
    if (typeof o.near === 'function') { const d = Math.hypot(S.pos.x - S.target.x, S.pos.y - (S.target.y + 1), S.pos.z - S.target.z); o.near(S.mode === 'follow' || S.mode === 'establish' ? clamp((d - 0.7) / 0.9, 0, 1) : 1); }
    S.last = w.phase || S.mode;
    return api.state();
  }
  const api = {
    /** change the shot. name: follow | talk | establish | tour | fixed. params: talk { a, b, side, two (s), closeOnly }, establish { from, look, pivot, dur, done }, tour { center, r, h, speed }, fixed { pos, look, pivot } */
    shot(name, params, opt) {
      const p = params || {}, prev = S.mode;
      S.mode = ['follow', 'talk', 'establish', 'tour', 'fixed'].indexOf(name) >= 0 ? name : 'follow'; S.params = p; S.shotT = 0;
      if (opt && opt.cut) S.cut = true;
      if (S.mode === 'establish' && p.from) { S.pos = v3(p.from.x, p.from.y, p.from.z); S.look = p.look ? v3(p.look.x, p.look.y, p.look.z) : S.look; S.cut = false; for (const k in S.vel) S.vel[k].v = 0; }
      if (typeof o.focus === 'function') { try { o.focus(S.mode === 'talk' && p.b ? head(p.b) : null); } catch (_) { /* no cinema kit */ } }
      if (prev === 'talk' && S.mode === 'follow' && S.target) S.az = Math.atan2(S.pos.x - S.target.x, S.pos.z - S.target.z) + Math.PI;     // leaving a talk: orbit from where the camera is
      return api;
    },
    follow(t) { const T = t || {}; S.target = { x: +T.x || 0, y: +T.y || 0, z: +T.z || 0, h: T.h || 1.5, yaw: isNum(T.yaw) ? T.yaw : S.target.yaw, moving: !!T.moving }; return api; },
    /** swipe: orbit around the player (dAz radians, dPitch radians) */
    orbit(dAz, dPitch) { S.az += dAz || 0; S.pitch = clamp(S.pitch + (dPitch || 0), FOLLOW.pitchMin, FOLLOW.pitchMax); S.userT = S.t; return api; },
    /** pinch: k > 1 zooms in */
    zoom(k) { if (isNum(k) && k > 0) S.dist = clamp(S.dist / k, FOLLOW.min, FOLLOW.max); S.userT = S.t; return api; },
    setAz(a) { S.az = a; S.userT = S.t; return api; },
    interest(p) { S.interest = p ? { x: p.x, y: p.y || 0, z: p.z, h: p.h || 1.4 } : null; return api; },
    world(wd) { if (wd) S.world = wd; return S.world; },
    update,
    state: () => ({ mode: S.mode, phase: S.last, pos: { ...S.pos }, look: { ...S.look }, az: S.az, pitch: S.pitch, dist: S.dist, pulled: S.pulled, shotT: S.shotT, pivot: { ...S.pivot } }),
    /** is the camera inside a collider right now? (the tests walk a script and ask every frame) */
    inside(r) { return hitTag(S.world, S.pos, r == null ? 0.08 : r); },
    snap() { S.cut = true; return api; },
    dispose() { S.world = makeWorld({}); },
  };
  return api;
}
/** a wide establishing pose for a place: high, back and to one side of `focus`, looking at it */
export function establishFrom(focus, az, opt) {
  const q = opt || {}, d = q.dist || 14, h = q.h || 7.5, a = az || 0;
  return { from: v3(focus.x - Math.sin(a) * d, (focus.y || 0) + h, focus.z - Math.cos(a) * d), look: v3(focus.x, (focus.y || 0) + 1, focus.z), pivot: v3(focus.x, (focus.y || 0) + h * 0.8, focus.z) };
}
