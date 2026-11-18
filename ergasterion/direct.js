// ERGASTERION scene direction (2026-11-11): how it FEELS to be on the floor on a phone. You are your own character (OLYMPUS_PEOPLE.me(), olympus/people3d.js), seen
// from behind by a third-person camera that never goes inside a wall, a crate or a tent (olympus/camera-rig.js: sphere cast against the colliders below).
// Tap the floor and you walk there around the stations (olympus/controls.js: A* on a grid); tap a person and you walk up to them, they turn to you and a small
// ring offers Talk / Show work / Follow / Wave; swipe to look, pinch to zoom; a joystick only when asked (?joy=1 or the Joystick switch).
// Talking cuts to a conversation camera: an over-the-shoulder two-shot, then a close-up of the speaker with a slow dolly in (fx-cine focus when it is there).
// The first 5 seconds: an establishing shot over the Library glides down behind you, the nearest worker turns, waves and greets you by their real name, and
// one button says what to do next. The floor (floor.js) keeps everything else: its geometry, its people, the tour. Nothing here places an order.
//   worldOf() -> the colliders (pure, node-tested)     navOf(world) -> the walking grid (pure)
//   createDirector(floor, { box, canvas, people(), kit(), onTalk(key), onShow(key), onOther(hit), reduced, joystick }) -> { start(), move(m), talkTo(key), walkTo(x, z), state(), dispose() }
import * as THREE from '../jarvis/three.module.min.js';
import { createRig, makeWorld, hits } from '../olympus/camera-rig.js';
import { gestures, createGrid, findPath, createWalker, approach, createHud, joystick as makeJoystick } from '../olympus/controls.js';
import { STATIONS, CAMP_SPOTS, CAMP, DOORS, BOUNDS, START } from './ergasterioncore.js';
import { CART } from './life.js';

const Y0 = 0.24, AV = 1.2;
const DOT = { working: '#8fa05a', idle: '#4b7a99', stale: '#e0b060', failed: '#c96a4a', sample: '#b8ad98', quiet: '#4b7a99', done: '#c8a24a', job: '#b8ad98' };                         // the station platform height; your character's scale (about 1.2 m tall)
// ------------------------------------------------------------------------------------------------ the colliders (what the camera and you may not go through)
export function worldOf() {
  const walls = [], boxes = [], circles = [], WH = 3.4, IH = 3.0, D0 = START.x - 1.25, D1 = START.x + 1.25;
  walls.push({ ax: -13.4, az: -10.2, bx: 13.4, bz: -10.2, t: 0.2, y1: WH, tag: 'north wall' }, { ax: -13.2, az: -10.2, bx: -13.2, bz: 10.2, t: 0.2, y1: WH, tag: 'west wall' }, { ax: 13.2, az: -10.2, bx: 13.2, bz: 10.2, t: 0.2, y1: WH, tag: 'east wall' });
  walls.push({ ax: -13.4, az: 10.2, bx: D0, bz: 10.2, t: 0.2, y1: WH, tag: 'front wall' }, { ax: D1, az: 10.2, bx: 13.4, bz: 10.2, t: 0.2, y1: WH, tag: 'front wall' });
  boxes.push({ x0: D0, x1: D1, z0: 10.0, z1: 10.4, y0: 2.6, y1: WH, tag: 'front lintel' });
  for (const ax of ['x', 'z']) {                     // the cross of inner walls, a door in each arm
    const ds = DOORS.filter((d) => d.axis === ax).sort((a, b) => a.c - b.c), lo = ax === 'x' ? -10 : -13, hi = ax === 'x' ? 10 : 13;
    let a = lo;
    for (const d of ds) { const b = d.c - d.half; if (b > a) walls.push(ax === 'x' ? { ax: 0, az: a, bx: 0, bz: b, t: 0.15, y1: IH, tag: 'inner wall' } : { ax: a, az: 0, bx: b, bz: 0, t: 0.15, y1: IH, tag: 'inner wall' });
      boxes.push(ax === 'x' ? { x0: -0.2, x1: 0.2, z0: d.c - d.half, z1: d.c + d.half, y0: 2.6, y1: IH, tag: 'lintel' } : { x0: d.c - d.half, x1: d.c + d.half, z0: -0.2, z1: 0.2, y0: 2.6, y1: IH, tag: 'lintel' }); a = d.c + d.half; }
    walls.push(ax === 'x' ? { ax: 0, az: a, bx: 0, bz: hi, t: 0.15, y1: IH, tag: 'inner wall' } : { ax: a, az: 0, bx: hi, bz: 0, t: 0.15, y1: IH, tag: 'inner wall' });
  }
  for (const x of [-11, -6.5, -2, 2, 11]) { circles.push({ x, z: -9.7, r: 0.42, y1: 3.7, tag: 'column' }, { x, z: 9.7, r: 0.42, y1: 3.7, tag: 'column' }); }
  circles.push({ x: 6.5, z: -9.7, r: 0.42, y1: 3.7, tag: 'column' });
  for (const z of [-5, 5]) circles.push({ x: -12.7, z, r: 0.42, y1: 3.7, tag: 'column' }, { x: 12.7, z, r: 0.42, y1: 3.7, tag: 'column' });
  for (const s of STATIONS) {                        // a station: the platform, the worker, the desk or wheel, the lamp; the belt of crates in front
    circles.push({ x: s.x, z: s.z, r: 1.3, y1: 2.0, tag: 'station ' + s.id });
    boxes.push({ x0: s.x - 1.45, x1: s.x + 1.45, z0: s.z + 1.45, z1: s.z + 2.05, y0: 0, y1: 0.75, tag: 'crates of ' + s.id });
  }
  for (const c of CAMP_SPOTS) {                      // a tent, its table, its crate stack, its banner pole and brazier
    circles.push({ x: c.x, z: c.z, r: 1.2, y1: 2.5, tag: 'tent' }, { x: c.x - 1.25, z: c.z - 1.0, r: 0.12, y1: 2.6, tag: 'banner pole' }, { x: c.x + 1.15, z: c.z - 1.7, r: 0.28, y1: 0.65, tag: 'brazier' });
    boxes.push({ x0: c.x - 0.55, x1: c.x + 0.55, z0: c.z - 2.75, z1: c.z - 2.15, y0: 0, y1: 0.62, tag: 'table' }, { x0: c.x - 1.25, x1: c.x - 0.25, z0: c.z - 2.68, z1: c.z - 2.32, y0: 0, y1: 0.6, tag: 'crate stack' });
  }
  circles.push({ x: CAMP.fire.x, z: CAMP.fire.z, r: 0.55, y1: 0.9, tag: 'hearth' });
  boxes.push({ x0: CART.x - 1.0, x1: CART.x + 1.0, z0: CART.z - 0.7, z1: CART.z + 0.7, y0: 0, y1: 1.5, tag: 'cart' });
  return makeWorld({ walls, boxes, circles, ground: 0 });
}
/** where you may walk: inside the factory or the camp, out of every collider (with a little room) */
export function walkable(x, z) {
  const inF = Math.abs(x) <= BOUNDS.x + 0.5 && z >= -BOUNDS.z - 0.5 && z <= 10.0, inC = x >= CAMP.x0 + 0.5 && x <= CAMP.x1 - 0.5 && z >= 9.9 && z <= CAMP.z1 - 0.5;
  return inF || inC;
}
export function navOf(world) { return createGrid({ x0: -13.4, x1: 17, z0: -10.4, z1: 23.2, cell: 0.4 }, (x, z) => !walkable(x, z) || hits(world, { x, y: 0.45, z }, 0.02), { pad: 0.34 }); }

// ------------------------------------------------------------------------------------------------ the director
export function createDirector(floor, opts) {
  const o = opts || {}, R = floor.refs(), camera = R.camera, canvas = R.canvas, reduced = !!(o.reduced || R.reduced);
  const world = worldOf(), grid = navOf(world);
  const walker = createWalker({ speed: 2.7, turn: 10 });
  const rig = createRig(camera, { world, reduced, dist: 3.5, pitch: 0.36, focus: (p) => { const c = R.cine && R.cine(); if (c && c.focus) { try { c.focus(p ? new THREE.Vector3(p.x, p.y, p.z) : null, { r: 0.25, amount: 4 }); } catch (_) { /* optional */ } } }, near: (a) => { if (S.av) S.av.visible = a > 0.35; } });
  const hud = createHud(o.box || canvas.parentElement, { reduced, maxPlates: 3, plateD: 7.5 });
  const S = { av: null, P3: null, pose: '', mode: 'walk', talkKey: '', last: { x: START.x, z: 6.4 }, input: { fwd: 0, side: 0 }, t: 0, plateT: 0, started: false, greeter: '', gone: false, joy: null, arrive: null, walks: 0, taps: 0 };
  const V = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const K = () => { try { return typeof o.kit === 'function' ? o.kit() : window.OLYMPUS_PEOPLE || null; } catch (_) { return null; } };
  const people = () => { try { return (o.people ? o.people() : []) || []; } catch (_) { return []; } };
  const where = (key) => { const q = floor.posOf ? floor.posOf(key) : null; return q ? { x: q.x, z: q.z, y: q.away ? 0 : Y0 } : null; };
  // you: start inside the Library, facing the two people there (Kalamos and Epistates)
  walker.place(START.x, 6.4, Math.PI); floor.setPlayer(START.x, 6.4, 0);
  rig.follow({ x: START.x, z: 6.4, yaw: Math.PI, h: 1.35 }).setAz(Math.PI);
  // your own character (the one you made in Symposium; 'You' with a seeded look until then)
  Promise.resolve(R.P3 && R.P3()).then((P) => P || import('../olympus/people3d.js')).then((P) => {
    if (S.gone || !P || typeof P.figure !== 'function') return;
    S.P3 = P; let sp = null;
    try { const k = K(); sp = k && k.me ? k.me().spec : null; } catch (_) { sp = null; }
    try { S.av = P.figure(THREE, sp || P.spec('me'), { scale: AV }); S.av.name = 'you'; R.scene.add(S.av); P.play(S.av, 'idle'); } catch (_) { S.av = null; }
  }).catch(() => {});
  // QA6 footsteps: your own steps (OLYMPUS_SFX.walker: stone in the halls, sand in the builders' camp); the engine honours mute, LITE and the first tap
  const FWD = new THREE.Vector3(); let feet = null, strideD = 0.4; S.steps = 0;
  function footstep(x, z) {
    let X = null; try { X = window.OLYMPUS_SFX || null; } catch (_) { X = null; } if (!X || typeof X.walker !== 'function') return;
    if (!feet) { let sp = null; try { const k = K(); sp = k && k.me ? k.me().spec : null; } catch (_) { sp = null; } feet = X.walker(sp || { kind: 'owner' }); }
    camera.getWorldDirection(FWD); if (feet.step({ x, y: 0, z }, { position: camera.position, forward: { x: FWD.x, y: FWD.y, z: FWD.z } }, { surface: z > 10.6 ? 'sand' : 'stone', k: 0.5 })) S.steps++;
  }
  function pose(name) { if (!S.av || !S.P3 || S.pose === name) return; S.pose = name; try { S.P3.play(S.av, name); } catch (_) { /* fine */ } }
  // ---- the frame (floor.js calls it in walk and follow mode; the tour keeps its own camera)
  function drive(dt, mode) {
    if (mode === 'tour') return false;
    S.t += dt;
    const fp = floor.pos();
    if (!walker.path && !S.input.fwd && !S.input.side && Math.hypot(fp.x - S.last.x, fp.z - S.last.z) > 0.05) { walker.place(fp.x, fp.z, fp.yaw + Math.PI); rig.snap(); }   // teleport / reset from the page
    if (S.input.fwd || S.input.side) {                // joystick or keys: walk relative to the camera
      const az = rig.state().az, f = S.input.fwd, s = S.input.side, dx = Math.sin(az) * f - Math.cos(az) * s, dz = Math.cos(az) * f + Math.sin(az) * s, m = Math.hypot(dx, dz);
      if (m > 0.05) { const p = walker.pos, sp = 2.6 * Math.min(1, m) * Math.min(dt, 0.1), nx = p.x + (dx / m) * sp, nz = p.z + (dz / m) * sp, ok = grid.freeAt(nx, nz) ? [nx, nz] : grid.freeAt(nx, p.z) ? [nx, p.z] : grid.freeAt(p.x, nz) ? [p.x, nz] : null;
        if (ok) walker.place(ok[0], ok[1], Math.atan2(dx, dz)); }
    }
    const s = walker.tick(dt), moving = s.moving || !!(S.input.fwd || S.input.side);
    { const mv = Math.hypot(s.x - S.last.x, s.z - S.last.z); if (moving && mv > 0 && mv < 1 && !reduced) { strideD += mv; if (strideD >= 0.6) { strideD = 0; footstep(s.x, s.z); } } else if (!moving) strideD = 0.4; }
    floor.setPlayer(s.x, s.z, s.yaw - Math.PI); S.last = { x: s.x, z: s.z };
    if (S.av) { S.av.position.set(s.x, 0, s.z); S.av.rotation.y = s.yaw; if (!S.waveT || S.t > S.waveT) pose(moving ? 'walk' : 'idle'); if (!reduced && S.P3) S.P3.animate(S.av, dt); }
    if (S.mode !== 'talk') {
      const fk = mode === 'follow' && fp.following ? (String(fp.following).slice(0, 2) === 'b:' ? fp.following : 'w:' + fp.following) : '', fq = fk ? where(fk) : null;
      if (fq) rig.follow({ x: fq.x, z: fq.z, y: fq.y, h: 1.4, yaw: Math.atan2(fq.x - s.x, fq.z - s.z), moving: true });
      else rig.follow({ x: s.x, z: s.z, yaw: s.yaw, h: 1.35, moving });
      let best = null, bd = 4.2;                    // auto-framing: the person in front of you shares the shot
      if (!moving) for (const pn of people()) { const q = where(pn.key); if (!q) continue; const d = Math.hypot(q.x - s.x, q.z - s.z); if (d < bd) { bd = d; best = q; } }
      rig.interest(best ? { x: best.x, y: best.y, z: best.z, h: 1.35 } : null);
    }
    rig.update(dt); S.frames = (S.frames || 0) + 1; if (rig.inside(0.1)) S.insideN = (S.insideN || 0) + 1;      // the tests read both: never inside
    if ((S.plateT += dt) > 0.05) { S.plateT = 0; plates(); }
    return true;
  }
  // ---- name plates: only the people near you (at most three), never over the middle of the view
  function plates() {
    const W = canvas.clientWidth || 1, H = canvas.clientHeight || 1, me = walker.pos, list = [], k = K();
    if (S.mode === 'talk') { hud.plates([]); return; }
    for (const pn of people()) {
      const q = where(pn.key); if (!q) continue;
      const d = Math.hypot(q.x - me.x, q.z - me.z); if (d > 9) continue;
      V.set(q.x, q.y + 1.62, q.z).project(camera); if (V.z > 1) continue;
      let role = pn.title || ''; try { const p = k && k.get ? k.get(pn.pid) : null; if (p && k.talk && k.talk.roleShort) role = k.talk.roleShort(p); } catch (_) { /* the page's title */ }
      list.push({ id: pn.key, name: pn.name, role, colour: DOT[pn.status] || '', x: (V.x * 0.5 + 0.5) * W, y: (-V.y * 0.5 + 0.5) * H, dist: d, front: true, important: pn.key === S.greeter && S.t < 9 });
    }
    hud.plates(list);
  }
  // ---- taps: a person (walk up, the ring), a crate or a board (the page's card), the floor (walk there)
  function screenOf(key) { const q = where(key); if (!q) return null; V.set(q.x, q.y + 1.0, q.z).project(camera); return { x: (V.x * 0.5 + 0.5) * (canvas.clientWidth || 1), y: (-V.y * 0.5 + 0.5) * (canvas.clientHeight || 1) }; }
  function ground(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); const d = ray.ray.direction, p = ray.ray.origin; if (d.y > -0.02) return null; const t = -p.y / d.y; return { x: p.x + d.x * t, z: p.z + d.z * t }; }
  function tap(cx, cy) {
    S.taps++;
    if (hud.ringOpen()) { hud.closeRing(); return; }
    hud.clearCta();
    const hit = floor.pick ? floor.pick(cx, cy) : null;
    if (hit && typeof hit.id === 'string' && hit.crate == null && !/^(board|changed|pipe)$/.test(hit.id)) { const key = hit.id.indexOf('camp:') === 0 ? 'b:' + hit.id.slice(5) : 'w:' + hit.id; if (where(key)) { goTo(key); return; } }
    if (hit && o.onOther) { o.onOther(hit); return; }
    const g = ground(cx, cy); if (!g) return;
    const r = canvas.getBoundingClientRect();
    if (walkTo(g.x, g.z)) { hud.mark(cx - r.left, cy - r.top); hud.used('walk'); }
  }
  function walkTo(x, z, then, face) {
    if (S.mode === 'talk') endTalk();
    const me = walker.pos, path = findPath(grid, { x: me.x, z: me.z }, { x, z }, { reach: 5, closest: true });
    if (!path) { hud.toast('No way through there.'); return false; }
    S.walks++; walker.go(path, then, face); return true;
  }
  /** walk up to a person, then they turn to you and the ring opens */
  function goTo(key) {
    const q = where(key); if (!q) return false;
    const me = walker.pos, d = Math.hypot(q.x - me.x, q.z - me.z), face = Math.atan2(q.x - me.x, q.z - me.z);
    hud.used('person');
    const arrive = () => { walker.faceTo(Math.atan2(q.x - walker.pos.x, q.z - walker.pos.z)); if (floor.focus) floor.focus(key); setTimeout(() => ring(key), reduced ? 0 : 260); };
    if (d <= 2.4) { arrive(); return true; }
    const spot = approach(me, q, 1.6);
    return walkTo(spot.x, spot.z, arrive, face);
  }
  const ACTS = [{ id: 'talk', label: 'Talk', icon: 'talk' }, { id: 'work', label: 'Show work', icon: 'work' }, { id: 'follow', label: 'Follow', icon: 'follow' }, { id: 'wave', label: 'Wave', icon: 'wave' }];
  function ring(key) {
    const pn = people().find((x) => x.key === key), sp = screenOf(key); if (!pn || !sp) return;
    hud.ring(sp.x, sp.y, pn.name, ACTS, (a) => act(a, key));
  }
  function act(a, key) {
    const pn = people().find((x) => x.key === key); if (!pn) return;
    if (a === 'talk') talkTo(key);
    else if (a === 'work') { talkCam(key); if (o.onShow) o.onShow(key); else if (o.onTalk) o.onTalk(key); }
    else if (a === 'follow') { if (floor.lead) floor.lead(key); hud.toast('Following ' + pn.name + '. Tap the floor to walk on your own.'); }
    else if (a === 'wave') wave(key, pn);
  }
  function wave(key, pn) {
    S.waveT = S.t + 1.4; if (S.av && S.P3) { S.pose = 'wave'; try { S.P3.play(S.av, 'wave'); } catch (_) { /* fine */ } }
    const f = floor.figureOf ? floor.figureOf(key) : null; if (f && S.P3) { try { S.P3.play(f, 'wave'); } catch (_) { /* fine */ } }
    const k = K(); if (k && k.say && k.talk && k.get) { try { const p = k.get(pn.pid), op = k.talk.opener(p, k.factsNow(pn.pid) || {}, { hour: new Date().getHours() }); k.say(pn.pid, op.hello + ' ' + op.intro, { scene: floor.sceneFor ? floor.sceneFor(key) : null, mood: 'proud' }); } catch (_) { /* fine */ } }
  }
  /** the conversation: the page opens the chat (the kit's sheet); the camera cuts to the two-shot, then the close-up */
  function talkTo(key) { if (!talkCam(key)) return false; if (o.onTalk) o.onTalk(key); return true; }
  function talkCam(key) {
    const q = where(key); if (!q) return false;
    if (S.mode === 'talk' && S.talkKey === key) return true;
    hud.closeRing(); hud.clearCta(); S.mode = 'talk'; S.talkKey = key; walker.stop();
    const me = walker.pos; walker.faceTo(Math.atan2(q.x - me.x, q.z - me.z));
    const side = ((q.x - me.x) * Math.cos(rig.state().az) - (q.z - me.z) * Math.sin(rig.state().az)) > 0 ? -1 : 1;
    rig.shot('talk', { a: { x: me.x, y: 0, z: me.z, h: 1.3 }, b: { x: q.x, y: q.y, z: q.z, h: 1.4 }, side, two: 1.9, lookDown: 0.3 });
    return true;
  }
  function endTalk() { if (S.mode !== 'talk') return; S.mode = 'walk'; S.talkKey = ''; rig.shot('follow'); }
  const onClose = () => endTalk();
  window.addEventListener('olympus:people:close', onClose);
  const G = gestures(canvas, { tap, drag: (dx, dy) => { rig.orbit(-dx * 0.0062, dy * 0.0042); hud.used('look'); }, pinch: (k) => { rig.zoom(k); hud.used('zoom'); } });
  floor.drive(drive, { input: false });
  if (R.bubbles) R.bubbles.visible = false;          // the name plates and the speech bubbles of the kit replace the floor's own signs over every station
  if (o.joystick) S.joy = makeJoystick(o.box || canvas.parentElement, (m) => api.move(m));
  // ---- the first 5 seconds: establishing shot, a greeting by name, one call to action
  function start() {
    if (S.started) return; S.started = true;
    const me = walker.pos, est = { from: { x: me.x + 4.6, y: 7.2, z: me.z + 3.0 }, look: { x: me.x - 1.2, y: 0.6, z: me.z - 4.5 }, pivot: { x: me.x + 3.4, y: 6.4, z: me.z + 2.2 }, dur: reduced ? 0 : 3.4 };
    // high over the Library, inside its walls (the pivot is above every wall), then down behind you
    est.done = () => greet();
    rig.shot('establish', est);
    hud.hint('look', 'Tap the floor to walk · tap someone to talk · swipe to look', { ms: 7000 });
    if (reduced) greet();
  }
  function greet() {
    if (S.greeted) return; S.greeted = true;
    const me = walker.pos, near = [];
    for (const pn of people()) { const q = where(pn.key); if (!q || pn.key.slice(0, 2) !== 'w:') continue; const d = Math.hypot(q.x - me.x, q.z - me.z); if (d < 9) near.push({ pn, d }); }
    near.sort((a, b) => a.d - b.d);
    if (!near.length) { hud.cta('Walk the floor', () => hud.hint('look', 'Tap the floor to walk there.', { always: true })); return; }
    const k = K();
    // the greeter: the nearest person who has real news (their files loaded and not missing); the nearest one otherwise
    const pick = (fs) => { const i = fs.findIndex((f) => f && !f.missing && !f.sample); return near[i >= 0 ? i : 0]; };
    const fsP = k && k.facts ? Promise.all(near.slice(0, 3).map((x) => Promise.resolve(k.facts(x.pn.pid)).catch(() => null))) : Promise.resolve([]);
    Promise.race([fsP, new Promise((ok) => setTimeout(() => ok(null), 1500))]).then((fs) => {
      if (S.gone) return;
      const best = (fs ? pick(fs) : near[0]).pn, f0 = fs ? fs[near.indexOf(near.find((x) => x.pn === best))] : null;
      S.greeter = best.key;
      if (floor.focus) floor.focus(best.key);
      const fig = floor.figureOf ? floor.figureOf(best.key) : null; if (fig && S.P3) { try { S.P3.play(fig, 'wave', { then: 'idle' }); } catch (_) { /* fine */ } }
      if (k && k.say && k.talk && k.get) {
        try { const p = k.get(best.pid), op = k.talk.opener(p, f0 || k.factsNow(best.pid) || {}, { hour: new Date().getHours() });
          S.hello = [op.hello, op.intro, op.fact, op.invite].filter(Boolean).join(' ');
          k.say(best.pid, S.hello, { scene: floor.sceneFor ? floor.sceneFor(best.key) : null }); } catch (_) { /* the button still says it */ }
      }
      hud.cta('Talk to ' + best.name, () => goTo(best.key));
      setTimeout(() => { if (floor.focus && floor.focused && floor.focused() === best.key && S.mode !== 'talk') floor.focus(null); }, 9000);
    });
  }
  const api = {
    start, walkTo, talkTo, talkCam, goTo, endTalk,
    move(m) { S.input = { fwd: (m && m.fwd) || 0, side: (m && m.side) || 0 }; if (S.input.fwd || S.input.side) { walker.stop(); if (S.mode === 'talk') endTalk(); hud.used('walk'); } },
    tap, rig: () => rig, world: () => world, grid: () => grid, hud: () => hud,
    state() { const r = rig.state(), p = walker.pos; return { mode: S.mode, talk: S.talkKey, cam: r, me: { x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: +p.yaw.toFixed(3) }, path: walker.path, inside: rig.inside(0.1), avatar: !!S.av, greeter: S.greeter, hello: S.hello || '', walks: S.walks, taps: S.taps, hint: hud.hinting(), ring: hud.ringOpen(), frames: S.frames || 0, insideN: S.insideN || 0 }; },
    dispose() { S.gone = true; floor.drive(null); if (R.bubbles) R.bubbles.visible = true; G.off(); hud.dispose(); window.removeEventListener('olympus:people:close', onClose); if (S.joy) S.joy.remove(); if (S.av) { try { S.av.userData.dispose(); } catch (_) { R.scene.remove(S.av); } } },
  };
  return api;
}
