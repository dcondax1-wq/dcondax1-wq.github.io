// ATHENS walking, directed (QA round 6, 2026-11-11): the same feel as a Hellas polis (cities/walk-direct.js), on Athens' real terrain. You are your own
// character (OLYMPUS_PEOPLE.me(), olympus/people3d.js) seen from behind by a third-person camera (olympus/camera-rig.js) that is never inside a house, a
// temple or the ground: the rig's world has the terrain height (athens-plan.js groundY: the Acropolis rock, Lykabettos, the river bed, the coast) and the
// houses and temples around you (rebuilt as you walk: Athens has thousands of houses). Your feet follow the ground. Tap the street and you walk there
// (olympus/controls.js A* on a local grid), tap a villager and they stop and wait while you walk up and talk (the conversation camera: a two-shot, then a
// close-up), tap a house and you walk to its door and read it. Drag to look around, pinch to zoom. The thumb joystick only as an option (?joy=1);
// ?direct=0 keeps the old first-person walker. The tour guide still drives (it steers your heading).
//   worldNear(col, houses, x, z, R) / navNear(col, a, b) (pure)    createAthensDirector(scene, { container, canvas, onTalk(hit), onHouse(h), guiding(), reduced })
//   -> { tick(dt), tap(x, y), look(dx, dy), zoom(k), talkCam(i), endTalk(), talkNearest(), state(), dispose() }
// scene = the Athens scene (athens.js): walk { x, z, yaw (forward = (sin yaw, -cos yaw)), input }, col (makeCollider), houseRows, npcs / npcPos, camera,
// scene (THREE.Scene), project(x, y, z), pickNpc, pickHouse, talkNpc.
import * as THREE from '../jarvis/three.module.min.js';
import { createRig, makeWorld } from '../olympus/camera-rig.js';
import { createGrid, findPath, createWalker, approach, createHud } from '../olympus/controls.js';
import { groundY } from './athens-plan.js';

export const AV = 1.45, PH = 1.15;           // your character's height and a villager's head height (the rigged cast at Athens' street scale)
const NEAR = 70, REBUILD = 24;               // the camera's colliders: everything within 70 m, rebuilt every 24 m you walk
/** the camera's colliders around (x, z): the houses (their real height on their own ground), the temples and app halls, the terrain as the ground */
export function worldNear(col, houses, x, z, R = NEAR) {
  const boxes = [], circles = [];
  (col.boxes || []).forEach((b, i) => {
    if (Math.abs(b.x - x) > R + b.hx || Math.abs(b.z - z) > R + b.hz) return;
    const h = houses && houses[i], gy = h && h.y != null ? h.y : groundY(b.x, b.z), top = gy + ((h && h.h) || 6) * 1.45 + 0.6;
    boxes.push({ x0: b.x - b.hx, x1: b.x + b.hx, z0: b.z - b.hz, z1: b.z + b.hz, y0: gy - 3, y1: top, tag: 'house' });
  });
  for (const c of col.circles || []) { if (Math.hypot(c.x - x, c.z - z) > R + c.r) continue; const gy = groundY(c.x, c.z); circles.push({ x: c.x, z: c.z, r: c.r, y0: gy - 3, y1: gy + Math.max(14, c.r * 1.6), tag: 'temple' }); }
  return makeWorld({ boxes, circles, groundAt: groundY, ground: -50 });
}
/** where you may walk between a and b: the city's own walking collider on a local 0.75 m grid with 0.35 m of room (at most 150 m across) */
export function navNear(col, a, b) {
  const span = 75, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, hx = Math.min(span, Math.abs(b.x - a.x) / 2 + 24), hz = Math.min(span, Math.abs(b.z - a.z) / 2 + 24);
  return createGrid({ x0: mx - hx, x1: mx + hx, z0: mz - hz, z1: mz + hz, cell: 0.75 }, (x, z) => col.hits(x, z, 0.05), { pad: 0.35 });
}
const toYaw = (h) => Math.PI - h, toH = (yaw) => Math.PI - yaw;     // Athens' walker yaw (forward = (sin, -cos)) <-> a heading (forward = (sin, cos))

export function createAthensDirector(scene, opts) {
  const S0 = scene, o = opts || {}, reduced = !!o.reduced, col = S0.col, walker = createWalker({ speed: 3.2, turn: 9 });
  const D = { av: null, P3: null, pose: '', mode: 'walk', talkI: -1, gone: false, walks: 0, near0: S0.camera.near, t: 0, stride: 0, steps: 0, feet: null, wx: 1e9, wz: 1e9, frames: 0, insideN: 0, greeter: -1 };
  let world = worldNear(col, S0.houseRows, S0.walk.x, S0.walk.z);
  const rig = createRig(S0.camera, { world, reduced, radius: 0.3, dist: 5.4, pitch: 0.3, near: (a) => { if (D.av) D.av.visible = a > 0.35; } });
  const hud = createHud(o.container || document.body, { reduced, hintTop: true });
  const K = () => { try { return window.OLYMPUS_PEOPLE || null; } catch (_) { return null; } };
  const gy = (x, z) => groundY(x, z);
  const w0 = S0.walk, h0 = toH(w0.yaw);
  walker.place(w0.x, w0.z, h0);
  rig.follow({ x: w0.x, y: gy(w0.x, w0.z), z: w0.z, yaw: h0, h: AV * 0.92 }).setAz(h0);
  S0.camera.near = 0.3; S0.camera.updateProjectionMatrix();
  // the opening: a glide from over the rooftops down behind you; then the nearest villager is one tap away
  { const y0 = gy(w0.x, w0.z); rig.shot('establish', { from: { x: w0.x - Math.sin(h0) * 22, y: y0 + 26, z: w0.z - Math.cos(h0) * 22 }, look: { x: w0.x + Math.sin(h0) * 8, y: y0, z: w0.z + Math.cos(h0) * 8 }, pivot: { x: w0.x, y: y0 + 34, z: w0.z }, dur: reduced ? 0 : 2.6,
    done: () => { const i = nearestNpc(30); if (i >= 0 && !D.gone && D.mode === 'walk') { D.greeter = i; hud.cta('Talk to ' + nameOf(i), () => goTalk(i)); } } }); }
  hud.hint('athwalk', 'Tap the street to walk · tap someone to talk · drag to look', { ms: 7000 });
  import('../olympus/people3d.js').then((P) => {
    if (D.gone || !P || typeof P.figure !== 'function') return;
    D.P3 = P; let sp = null; try { const k = K(); sp = k && k.me ? k.me().spec : null; } catch (_) { sp = null; }
    try { D.av = P.figure(THREE, sp || P.spec('me'), { scale: AV }); D.av.name = 'you'; S0.scene.add(D.av); P.play(D.av, 'idle'); } catch (_) { D.av = null; }
  }).catch(() => {});
  const pose = (n) => { if (!D.av || !D.P3 || D.pose === n) return; D.pose = n; try { D.P3.play(D.av, n); } catch (_) { /* fine */ } };
  function nameOf(i) { try { return o.nameOf ? o.nameOf(i) : 'the villager'; } catch (_) { return 'the villager'; } }
  function nearestNpc(within) { const p = walker.pos; let best = -1, bd = within; (S0.npcPos || []).forEach((q, i) => { if (!q) return; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = i; } }); return best; }
  // footsteps: stone on the Acropolis, the agora and the avenues near the temples, packed earth (sand) in the streets; the engine honours mute and LITE
  const fwd = new THREE.Vector3();
  const surfaceAt = o.surface || ((x, z) => (gy(x, z) > 20 || (x > -40 && x < 160 && z > -108 && z < 30) ? 'stone' : 'sand'));
  function footstep(x, z) {
    let X = null; try { X = window.OLYMPUS_SFX || null; } catch (_) { X = null; } if (!X || typeof X.walker !== 'function') return;
    if (!D.feet) { let sp = null; try { const k = K(); sp = k && k.me ? k.me().spec : null; } catch (_) { sp = null; } D.feet = X.walker(sp || { kind: 'owner', accessory: 'scroll' }); }
    S0.camera.getWorldDirection(fwd); if (D.feet.step({ x, y: gy(x, z), z }, { position: S0.camera.position, forward: { x: fwd.x, y: fwd.y, z: fwd.z } }, { surface: surfaceAt(x, z), k: 0.5 })) D.steps++;
  }
  function tick(dt) {
    if (D.gone || !S0.walk) return false;
    D.t += dt;
    const w = S0.walk, inp = w.input || {};
    if (inp.fwd || inp.side) {
      walker.stop(); const p = walker.pos, f = inp.fwd || 0, s = inp.side || 0;
      // the tour guide steers your heading (w.yaw); keys and the optional joystick walk relative to the camera
      const az = o.guiding && o.guiding() ? toH(w.yaw) : rig.state().az, dx = Math.sin(az) * f - Math.cos(az) * s, dz = Math.cos(az) * f + Math.sin(az) * s, m = Math.hypot(dx, dz);
      if (m > 0.05) { const sp = (inp.run ? 4.4 : 2.8) * Math.min(1, m) * Math.min(dt, 0.1), r = col.move(p.x, p.z, (dx / m) * sp, (dz / m) * sp); walker.place(r[0], r[1], o.guiding && o.guiding() ? az : Math.atan2(dx, dz)); }
    }
    const s = walker.tick(dt), moving = s.moving || !!(inp.fwd || inp.side), y = gy(s.x, s.z);
    const moved = Math.hypot(s.x - w.x, s.z - w.z); w.dist += moved; w.x = s.x; w.z = s.z; if (!(o.guiding && o.guiding())) w.yaw = toYaw(s.yaw); w.y = y + 1.7;
    if (moving && moved > 0) { D.stride += moved; if (D.stride >= 0.7) { D.stride -= 0.7; footstep(s.x, s.z); } } else D.stride = 0.5;
    if (D.av) { D.av.position.set(s.x, y, s.z); D.av.rotation.y = s.yaw; pose(moving ? 'walk' : 'idle'); if (!reduced && D.P3) D.P3.animate(D.av, dt); }
    if (Math.hypot(s.x - D.wx, s.z - D.wz) > REBUILD) { world = worldNear(col, S0.houseRows, s.x, s.z); rig.world(world); D.wx = s.x; D.wz = s.z; }
    if (D.mode === 'talk' && D.talkI >= 0) { const q = S0.npcPos && S0.npcPos[D.talkI]; if (q) { D.tp.b.x = q.x; D.tp.b.z = q.z; D.tp.b.y = gy(q.x, q.z); } }
    else {
      rig.follow({ x: s.x, y, z: s.z, yaw: s.yaw, h: AV * 0.92, moving });
      const i = !moving ? nearestNpc(5) : -1, q = i >= 0 ? S0.npcPos[i] : null;
      rig.interest(q ? { x: q.x, y: gy(q.x, q.z), z: q.z, h: PH } : null);
    }
    const rs = rig.update(dt); D.frames++; if (rig.inside(0.12)) D.insideN++;
    if (D.av && D.mode === 'talk') D.av.visible = rs.phase !== 'close-up';
    return true;
  }
  function ground(cx, cy) {
    const c = S0.camera, el = o.canvas || (S0.renderer && S0.renderer.domElement), r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const v = new THREE.Vector3(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize();
    // march the ray over the terrain (hills): the first point under the ground, refined
    let t0 = 0, hit = null; for (let t = 0.5; t < 220; t *= 1.08) { const x = c.position.x + v.x * t, y = c.position.y + v.y * t, z = c.position.z + v.z * t; if (y < gy(x, z)) { hit = t; break; } t0 = t; }
    if (hit == null) return null; let a = t0, b = hit; for (let k = 0; k < 12; k++) { const m = (a + b) / 2, x = c.position.x + v.x * m, z = c.position.z + v.z * m; if (c.position.y + v.y * m < gy(x, z)) b = m; else a = m; }
    return { x: c.position.x + v.x * b, z: c.position.z + v.z * b, sx: cx - r.left, sy: cy - r.top };
  }
  function walkTo(x, z, then, face) {
    if (D.mode === 'talk') endTalk(true);
    if (S0.talkHold && !then) { S0.talkHold = false; S0.talkNpc = null; }        // you walked off somewhere else: the villager who waited walks on
    const p = walker.pos, grid = navNear(col, p, { x, z }), path = findPath(grid, { x: p.x, z: p.z }, { x, z }, { reach: 8, closest: true });
    if (!path) { hud.toast('No way through there.'); return false; }
    D.walks++; walker.go(path, then, face); hud.used('athwalk'); return true;
  }
  function tap(cx, cy) {
    const r = (o.canvas || S0.canvas).getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    const n = S0.pickNpc ? S0.pickNpc(px, py, 46) : null;
    if (n) { goTalk(n.npc.i); return n; }
    const g = ground(cx, cy), h = S0.pickHouse ? S0.pickHouse(px, py, 30) : null;
    if (h && (!g || Math.hypot(g.x - h.x, g.z - h.z) < Math.max(h.w || 6, h.d || 6) * 0.7 + 4)) { const p = walker.pos, a = approach(p, { x: h.x, z: h.z }, Math.max(h.w || 6, h.d || 6) * 0.75 + 1.4); walkTo(a.x, a.z, () => { if (o.onHouse) o.onHouse(h); }, Math.atan2(h.x - a.x, h.z - a.z)); return h; }
    if (g && Math.hypot(g.x - walker.pos.x, g.z - walker.pos.z) < 140 && walkTo(g.x, g.z)) { hud.mark(g.sx, g.sy); return g; }
    return null;
  }
  /** a villager: they stop and wait (athens.js talkNpc), you walk up, then the talk card and the conversation camera */
  function goTalk(i) {
    const q = S0.npcPos && S0.npcPos[i]; if (!q) return false; hud.clearCta && hud.clearCta(); hud.used('athwalk');
    S0.talkNpc = i; S0.talkHold = true;
    const p = walker.pos, d = Math.hypot(q.x - p.x, q.z - p.z), arrive = () => { walker.faceTo(Math.atan2(q.x - walker.pos.x, q.z - walker.pos.z)); if (o.onTalk) o.onTalk(i); talkCam(i); };
    if (d <= 2.8) { arrive(); return true; }
    const a = approach(p, q, 1.7); return walkTo(a.x, a.z, arrive, Math.atan2(q.x - p.x, q.z - p.z));
  }
  function talkCam(i) {
    const q = S0.npcPos && S0.npcPos[i]; if (!q) return; const p = walker.pos; walker.stop(); walker.faceTo(Math.atan2(q.x - p.x, q.z - p.z));
    D.mode = 'talk'; D.talkI = i; D.tp = { a: { x: p.x, y: gy(p.x, p.z), z: p.z, h: AV * 0.92 }, b: { x: q.x, y: gy(q.x, q.z), z: q.z, h: PH }, side: 1, two: 1.5, lookDown: 0.5, back: 2.4 };
    rig.shot('talk', D.tp);
  }
  function endTalk(quiet) { if (D.mode !== 'talk') return; D.mode = 'walk'; D.talkI = -1; if (D.av) D.av.visible = true; rig.shot('follow'); if (!quiet && o.onEndTalk) o.onEndTalk(); }
  return {
    tick, tap, talkCam, endTalk, walkTo, goTalk,
    talkNearest() { const i = nearestNpc(60); return i >= 0 ? goTalk(i) : false; },
    look(dx, dy) { rig.orbit(-dx * 0.0062, dy * 0.0042); hud.used('athwalk'); },
    zoom(k) { rig.zoom(k); },
    state() { const r = rig.state(), p = walker.pos; return { mode: D.mode, talk: D.talkI, cam: r, me: { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +gy(p.x, p.z).toFixed(2) }, feetY: D.av ? +D.av.position.y.toFixed(2) : null, path: walker.path, inside: rig.inside(0.12), avatar: !!D.av, walks: D.walks, frames: D.frames, insideN: D.insideN, steps: D.steps, greeter: D.greeter, colliders: world.boxes.length + world.circles.length }; },
    rig: () => rig, world: () => world,
    dispose() { D.gone = true; hud.dispose(); if (D.av) { try { D.av.userData.dispose(); } catch (_) { /* gone */ } try { S0.scene.remove(D.av); } catch (_) { /* gone */ } } S0.camera.near = D.near0; S0.camera.updateProjectionMatrix(); },
  };
}
