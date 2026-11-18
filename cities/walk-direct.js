// HELLAS walking, directed (2026-11-11 scene direction): walking a polis feels like a mobile game. You are your own character (OLYMPUS_PEOPLE.me(),
// olympus/people3d.js) seen from behind by a third-person camera that is never inside a house, the acropolis hill or the city wall (olympus/camera-rig.js).
// Tap the street and you walk there around the houses (olympus/controls.js A*); tap a person and you walk up to them, they turn and the talk card opens with a
// conversation camera (two-shot, then a close-up); tap a house and you walk to its door and read it. Drag to look around you, pinch to zoom.
// The old thumb joystick stays only as an option (?joy=1 or localStorage olympus.joystick = '1').
//   worldOf(plan) / navOf(plan, col) (pure)      createWalkDirector(scene, { container, onTalk(P), onHouse(h), reduced }) -> { tick(dt), tap(x, y), look(dx, dy), zoom(k), talkCam(P), endTalk(), state(), dispose() }
// scene = the Hellas scene (hellas.js): walk { x, z, yaw (forward = (sin yaw, -cos yaw)) }, col (polisCollider), plan, people, camera, scene (THREE.Scene), project(x, y, z), pickPerson, pickHouse.
import * as THREE from '../jarvis/three.module.min.js';
import { createRig, makeWorld } from '../olympus/camera-rig.js';
import { createGrid, findPath, createWalker, approach, createHud } from '../olympus/controls.js';

const AV = 1.25, PH = 1.0;                                // your character's height in metres and a townsperson's head height (the rigged cast, town-cast.js)
/** the camera's colliders in a polis: every house (its real height), the acropolis hill, the city wall as a ring of segments */
export function worldOf(plan) {
  const P = plan || {}, boxes = [], walls = [], circles = [];
  for (const h of P.houses || []) boxes.push({ x0: h.x - h.hx, x1: h.x + h.hx, z0: h.z - h.hz, z1: h.z + h.hz, y0: 0, y1: Math.max(3, (h.h || 5) + 1.2), tag: 'house' });
  if (P.hillR) circles.push({ x: 0, z: 0, r: P.hillR, y1: Math.max(10, P.hillR * 0.55), tag: 'acropolis hill' });
  for (const t of P.trees || []) circles.push({ x: t.x, z: t.z, r: t.r + 0.15, y1: t.h, tag: 'cypress' });     // QA6: the talk close-up once stood inside a cypress
  const R = P.R || 0;
  if (R) for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, b = ((i + 1) / 48) * Math.PI * 2; walls.push({ ax: Math.sin(a) * (R + 1), az: Math.cos(a) * (R + 1), bx: Math.sin(b) * (R + 1), bz: Math.cos(b) * (R + 1), t: 0.8, y1: 7, tag: 'city wall' }); }
  return makeWorld({ boxes, walls, circles, ground: 0 });
}
/** where you may walk: the polis's own walking collider (streets, not houses, not the hill, inside the wall), on a 0.6 m grid with 0.3 m of room */
export function navOf(plan, col) { const R = (plan && plan.R) || 80, T = (plan && plan.trees) || []; return createGrid({ x0: -R, x1: R, z0: -R, z1: R, cell: 0.6 }, (x, z) => col.hits(x, z, 0.05) || T.some((t) => Math.hypot(x - t.x, z - t.z) < t.r), { pad: 0.3 }); }
const toH = (yaw) => Math.PI - yaw, toYaw = (h) => Math.PI - h;     // the polis walker's yaw (forward = (sin, -cos)) <-> a heading (forward = (sin, cos))

export function createWalkDirector(scene, opts) {
  const S0 = scene, o = opts || {}, reduced = !!o.reduced, plan = S0.plan;
  const world = worldOf(plan), grid = navOf(plan, S0.col), walker = createWalker({ speed: 3.0, turn: 9 });
  const rig = createRig(S0.camera, { world, reduced, radius: 0.3, dist: 4.8, pitch: 0.34, near: (a) => { if (D.av) D.av.visible = a > 0.35; } });
  const hud = createHud(o.container || document.body, { reduced, hintTop: true });
  const D = { av: null, P3: null, pose: '', mode: 'walk', talkP: null, gone: false, walks: 0, near0: S0.camera.near, waveT: 0, t: 0, stride: 0, steps: 0, feet: null };
  // QA6 footsteps: your own feet on the street (OLYMPUS_SFX.walker: stone in the agora, sand in a desert town or a ruin); the engine honours mute and LITE
  const surfaceAt = o.surface || ((x, z) => (plan && Math.hypot(x, z) < (plan.agoraR || 0) + 1 ? 'stone' : plan && (plan.desert || plan.ruin) ? 'sand' : 'stone'));
  const fwd = new THREE.Vector3();
  function footstep(x, z) {
    let X = null; try { X = window.OLYMPUS_SFX || null; } catch (_) { X = null; } if (!X || typeof X.walker !== 'function') return;
    if (!D.feet) { let sp = null; try { const k = K(); sp = k && k.me ? k.me().spec : null; } catch (_) { sp = null; } D.feet = X.walker(sp || { kind: 'owner', accessory: 'scroll' }); }
    S0.camera.getWorldDirection(fwd); if (D.feet.step({ x, y: 0, z }, { position: S0.camera.position, forward: { x: fwd.x, y: fwd.y, z: fwd.z } }, { surface: surfaceAt(x, z), k: 0.5 })) D.steps++;
  }
  const K = () => { try { return window.OLYMPUS_PEOPLE || null; } catch (_) { return null; } };
  const w0 = S0.walk;
  // the first view: toward the nearest townsperson (they will greet you), else away from the acropolis hill, down a street
  const first = S0.peopleNear ? S0.peopleNear(w0.x, w0.z, 1, 25)[0] : null, h0 = first ? Math.atan2(first.P.x - w0.x, first.P.z - w0.z) : Math.atan2(w0.x, w0.z);
  w0.yaw = toYaw(h0); walker.place(w0.x, w0.z, h0);
  rig.follow({ x: w0.x, z: w0.z, yaw: h0, h: AV * 0.92 }).setAz(h0);
  S0.camera.near = 0.3; S0.camera.updateProjectionMatrix();
  // the opening: a quick establishing glide from above the street down behind you
  { const h = h0; rig.shot('establish', { from: { x: w0.x - Math.sin(h) * 14, y: 16, z: w0.z - Math.cos(h) * 14 }, look: { x: w0.x + Math.sin(h) * 6, y: 0, z: w0.z + Math.cos(h) * 6 }, pivot: { x: w0.x, y: 22, z: w0.z }, dur: reduced ? 0 : 2.6,
    done: () => { if (first && !D.gone) { D.greeter = first.P; hud.cta('Talk to ' + (first.P.person.short || first.P.person.name), () => goTalk(first.P)); } } }); }
  hud.hint('walk', 'Tap the street to walk · tap someone to talk · drag to look', { ms: 7000 });
  import('../olympus/people3d.js').then((P) => {
    if (D.gone || !P || typeof P.figure !== 'function') return;
    D.P3 = P; let sp = null; try { const k = K(); sp = k && k.me ? k.me().spec : null; } catch (_) { sp = null; }
    try { D.av = P.figure(THREE, sp || P.spec('me'), { scale: AV }); D.av.name = 'you'; S0.scene.add(D.av); P.play(D.av, 'idle'); } catch (_) { D.av = null; }
  }).catch(() => {});
  const pose = (n) => { if (!D.av || !D.P3 || D.pose === n) return; D.pose = n; try { D.P3.play(D.av, n); } catch (_) { /* fine */ } };
  function tick(dt) {
    if (D.gone || !S0.walk) return false;
    D.t += dt;
    const w = S0.walk, inp = w.input || {};
    if (inp.fwd || inp.side) {                          // keys or the optional joystick: walk relative to the camera
      const az = rig.state().az, f = inp.fwd || 0, s = inp.side || 0, dx = Math.sin(az) * f - Math.cos(az) * s, dz = Math.cos(az) * f + Math.sin(az) * s, m = Math.hypot(dx, dz);
      if (m > 0.05) { walker.stop(); const p = walker.pos, sp = (inp.run ? 4.4 : 2.8) * Math.min(1, m) * Math.min(dt, 0.1), r = S0.col.move(p.x, p.z, (dx / m) * sp, (dz / m) * sp); walker.place(r[0], r[1], Math.atan2(dx, dz)); }
    }
    const s = walker.tick(dt), moving = s.moving || !!(inp.fwd || inp.side);
    const moved = Math.hypot(s.x - w.x, s.z - w.z); w.dist += moved; w.x = s.x; w.z = s.z; w.yaw = toYaw(s.yaw);
    if (moving && moved > 0) { D.stride += moved; if (D.stride >= 0.62) { D.stride -= 0.62; footstep(s.x, s.z); } } else D.stride = 0.45;
    if (D.av) { D.av.position.set(s.x, 0, s.z); D.av.rotation.y = s.yaw; if (D.t > D.waveT) pose(moving ? 'walk' : 'idle'); if (!reduced && D.P3) D.P3.animate(D.av, dt); }
    if (D.mode === 'talk' && D.talkP) { const P = D.talkP; D.tp.b.x = P.x; D.tp.b.z = P.z; }
    else {
      rig.follow({ x: s.x, z: s.z, yaw: s.yaw, h: AV * 0.92, moving });
      const near = !moving && S0.peopleNear ? S0.peopleNear(s.x, s.z, 1, 5)[0] : null;
      rig.interest(near ? { x: near.P.x, z: near.P.z, h: AV * 0.85 } : null);
    }
    const rs = rig.update(dt); D.frames = (D.frames || 0) + 1; if (rig.inside(0.12)) D.insideN = (D.insideN || 0) + 1;
    if (D.av && D.mode === 'talk') D.av.visible = rs.phase !== 'close-up';              // the close-up is from beside your shoulder: your own character steps out of the frame
    return true;
  }
  function ground(cx, cy) {
    const c = S0.camera, el = o.canvas || (S0.renderer && S0.renderer.domElement), r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const v = new THREE.Vector3(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize();
    if (v.y > -0.02) return null; const t = -c.position.y / v.y; return { x: c.position.x + v.x * t, z: c.position.z + v.z * t, sx: cx - r.left, sy: cy - r.top };
  }
  function walkTo(x, z, then, face) {
    if (D.mode === 'talk') endTalk(true);
    const p = walker.pos, path = findPath(grid, { x: p.x, z: p.z }, { x, z }, { reach: 6, closest: true });
    if (!path) { hud.toast('No way through there.'); return false; }
    D.walks++; walker.go(path, then, face); hud.used('walk'); return true;
  }
  /** a tap: a person (walk up and talk), a house (walk to it and read it), else the street (walk there) */
  function tap(cx, cy) {
    const P = S0.pickPerson ? S0.pickPerson(cx, cy, 40) : null;
    if (P) { goTalk(P); return P; }
    const g = ground(cx, cy);
    const h = S0.pickHouse ? S0.pickHouse(cx, cy, 26) : null;
    if (h && (!g || Math.hypot(g.x - h.x, g.z - h.z) < Math.max(h.hx, h.hz) + 4)) { const p = walker.pos, a = approach(p, { x: h.x, z: h.z }, Math.max(h.hx, h.hz) + 1.4); walkTo(a.x, a.z, () => { if (o.onHouse) o.onHouse(h); }); return h; }
    if (g && walkTo(g.x, g.z)) { hud.mark(g.sx, g.sy); return g; }
    return null;
  }
  function goTalk(P) {
    const p = walker.pos, d = Math.hypot(P.x - p.x, P.z - p.z), arrive = () => { walker.faceTo(Math.atan2(P.x - walker.pos.x, P.z - walker.pos.z)); if (o.onTalk) o.onTalk(P); talkCam(P); };
    hud.used('walk');
    if (d <= 2.6) { arrive(); return; }
    const a = approach(p, P, 1.6); walkTo(a.x, a.z, arrive, Math.atan2(P.x - p.x, P.z - p.z));
  }
  function talkCam(P) {
    if (!P) return; const p = walker.pos; walker.stop(); walker.faceTo(Math.atan2(P.x - p.x, P.z - p.z));
    D.mode = 'talk'; D.talkP = P; D.tp = { a: { x: p.x, y: 0, z: p.z, h: AV * 0.92 }, b: { x: P.x, y: 0, z: P.z, h: PH }, side: 1, two: 1.5, lookDown: 0.5, back: 2.1 };
    rig.shot('talk', D.tp);
  }
  function endTalk(quiet) { if (D.mode !== 'talk') return; D.mode = 'walk'; D.talkP = null; if (D.av) D.av.visible = true; rig.shot('follow'); if (!quiet && o.onEndTalk) o.onEndTalk(); }
  return {
    tick, tap, talkCam, endTalk, walkTo,
    look(dx, dy) { rig.orbit(-dx * 0.0062, dy * 0.0042); hud.used('walk'); },
    zoom(k) { rig.zoom(k); },
    state() { const r = rig.state(), p = walker.pos; return { greeter: D.greeter ? D.greeter.person.name : '', mode: D.mode, cam: r, me: { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }, path: walker.path, inside: rig.inside(0.12), avatar: !!D.av, walks: D.walks, frames: D.frames || 0, insideN: D.insideN || 0, steps: D.steps }; },
    rig: () => rig, world: () => world, grid: () => grid,
    dispose() { D.gone = true; hud.dispose(); if (D.av) { try { D.av.userData.dispose(); } catch (_) { /* gone */ } try { S0.scene.remove(D.av); } catch (_) { /* gone */ } } S0.camera.near = D.near0; S0.camera.updateProjectionMatrix(); },
  };
}
