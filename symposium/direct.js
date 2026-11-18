// SYMPOSIUM scene direction (2026-11-11): the hall's camera as a film. Entering = an establishing shot from high over the colonnade that glides down to your
// place at the table; then the person across the table turns, waves and greets you by name with one real fact from their files, and one button says what to do.
// Talking = a conversation camera (olympus/camera-rig.js 'talk'): a two-shot from your place, then a close-up of the speaker with a slow dolly in and the
// fx-cine focus on their face; closing the chat glides back to your place. The camera never goes inside the table, a couch or a column (sphere cast).
//   createDirector(hall, { box, people: () => [{ id, name }], kit: () => OLYMPUS_PEOPLE, onTalk(id) }) -> { start(), talk(i), back(), state(), dispose() }
import * as THREE from '../jarvis/three.module.min.js';
import { createRig, makeWorld } from '../olympus/camera-rig.js';
import { createHud } from '../olympus/controls.js';

/** the hall's colliders: the table, the krater, the ring of couches (as a band of short boxes), the columns. r = the seat ring radius, tr = the table radius */
export function worldOf(r, tr, nCol) {
  const circles = [{ x: 0, z: 0, r: tr + 0.05, y1: 0.5, tag: 'table' }, { x: 0, z: 0, r: 0.25, y1: 0.85, tag: 'krater' }], boxes = [];
  const n = Math.max(10, Math.min(22, nCol || Math.round((r + 3.4) * 1.9))), R2 = r + 3.3;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / n; circles.push({ x: Math.sin(a) * R2, z: Math.cos(a) * R2, r: 0.45, y1: 4.8, tag: 'column' }); }
  const m = Math.max(12, Math.round(r * 5));
  for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r; boxes.push({ x0: x - 0.42, x1: x + 0.42, z0: z - 0.42, z1: z + 0.42, y0: 0, y1: 0.62, tag: 'couch' }); }
  return makeWorld({ circles, boxes, ground: 0 });
}

export function createDirector(hall, opts) {
  const o = opts || {}, R = hall.refs(), camera = R.camera, reduced = !!R.reduced;
  const world = worldOf(R.r, R.tr);
  const rig = createRig(camera, { world, reduced, radius: 0.18, focus: (p) => { const c = R.cine && R.cine(); if (c && c.focus) { try { c.focus(p ? new THREE.Vector3(p.x, p.y, p.z) : null, { r: 0.2, amount: 4 }); } catch (_) { /* optional */ } } } });
  const hud = createHud(o.box || R.canvas.parentElement, { reduced });
  const S = { mode: 'stand', i: -1, started: false, gone: false, hello: '', greeter: -1, stand: { pos: { x: 0, y: 1.5, z: 0 }, look: { x: 0, y: 1, z: -2 }, pivot: { x: 0, y: 1.5, z: 0 }, smooth: 0.06 } };
  const K = () => { try { return typeof o.kit === 'function' ? o.kit() : window.OLYMPUS_PEOPLE || null; } catch (_) { return null; } };
  const H = new THREE.Vector3();
  const head = (i) => { R.head(i, H); return { x: H.x, y: H.y - 0.12, z: H.z, h: 0.12 }; };
  rig.shot('fixed', S.stand, { cut: true });
  // every frame, after the hall placed its standing camera: remember that pose; the rig decides where the camera really is
  function drive(dt) {
    const p = camera.position, L = R.look();
    S.stand.pos.x = p.x; S.stand.pos.y = p.y; S.stand.pos.z = p.z; S.stand.pivot.x = p.x; S.stand.pivot.y = p.y; S.stand.pivot.z = p.z; S.stand.look.x = L.x; S.stand.look.y = L.y; S.stand.look.z = L.z;
    if (S.mode === 'talk' && S.i >= 0) { const b = head(S.i); S.tp.b.x = b.x; S.tp.b.y = b.y; S.tp.b.z = b.z; }
    rig.update(dt); S.frames = (S.frames || 0) + 1; if (rig.inside(0.08)) S.insideN = (S.insideN || 0) + 1;
  }
  hall.drive(drive);
  function start() {
    if (S.started) return; S.started = true;
    const L = R.look(), r = R.r;
    // high over the colonnade behind you, looking across the table; down to your place in 3.2 s
    const est = { from: { x: -L.x * 0.95, y: 6.2, z: -L.z * 0.95 + 0.01 }, look: { x: 0, y: 0.4, z: 0 }, pivot: { x: 0, y: 5.4, z: 0 }, to: S.stand, next: 'fixed', nextParams: S.stand, dur: reduced ? 0 : 3.2, done: greet };
    est.from.x = est.from.x * (r + 3.3 - 0.9) / Math.max(0.01, Math.hypot(L.x, L.z)); est.from.z = est.from.z * (r + 3.3 - 0.9) / Math.max(0.01, Math.hypot(L.x, L.z));
    rig.shot('establish', est);
    hud.hint('sym', 'Drag sideways to walk around the table · tap someone to talk', { ms: 7000 });
    if (reduced) greet();
  }
  /** the greeter: the person across the table (the middle of the view) with real news, else the nearest to the middle */
  function greet() {
    if (S.greeted || S.gone) return; S.greeted = true;
    const P = o.people ? o.people() : [], k = K(); if (!P.length) return;
    const front = (hall.front ? hall.front() : null) || [0], RANK = { bot: 0, champion: 1, scanner: 2, mind: 3, keeper: 4, builder: 5 };
    const real = (i) => { try { const f = k && k.factsNow ? k.factsNow(P[i].id) : null; return !!(f && !f.missing && !f.sample); } catch (_) { return false; } };
    // the greeter: someone in view with real news, money people first (their fact has $ and R)
    const cands = front.filter((i) => P[i]).sort((a, b) => (real(b) ? 1 : 0) - (real(a) ? 1 : 0) || (RANK[P[a].kind] == null ? 9 : RANK[P[a].kind]) - (RANK[P[b].kind] == null ? 9 : RANK[P[b].kind]) || front.indexOf(a) - front.indexOf(b));
    const i = cands.length ? cands[0] : front[0]; if (!P[i]) return;
    S.greeter = i;
    hall.active(i);                                   // they wave, turn to you on their couch, and talk
    if (k && k.say && k.talk && k.get) {
      try { const p = k.get(P[i].id), op = k.talk.opener(p, k.factsNow(P[i].id) || {}, { hour: new Date().getHours() }); S.hello = [op.hello, op.intro, op.fact, op.invite].filter(Boolean).join(' '); k.say(P[i].id, S.hello, { mood: 'proud' }); } catch (_) { /* the button still says it */ }
    }
    hud.cta('Talk to ' + P[i].name, () => { if (o.onTalk) o.onTalk(P[i].id); });
    setTimeout(() => { if (!S.gone && S.mode !== 'talk' && hall.speaking && hall.speaking() === i) hall.active(-1); }, 12000);
  }
  /** the conversation: two-shot from your place, then the close-up with a slow dolly in */
  function talk(i) {
    if (i == null || i < 0) return back();
    hud.clearCta(); hud.used('sym');
    const b = head(i), a = { x: S.stand.pos.x, y: S.stand.pos.y - 1.35, z: S.stand.pos.z, h: 1.35 };
    const side = (b.x * Math.cos(Math.atan2(a.x, a.z)) - b.z * Math.sin(Math.atan2(a.x, a.z))) > 0 ? 1 : -1;
    S.mode = 'talk'; S.i = i; S.tp = { a, b, side, two: 1.6, lookDown: 0.32, back: 1.45 };
    rig.shot('talk', S.tp);
  }
  function back() { if (S.mode !== 'talk') return; S.mode = 'stand'; S.i = -1; rig.shot('fixed', S.stand); }
  const onOpen = (e) => { const id = e && e.detail && e.detail.id, P = o.people ? o.people() : [], i = P.findIndex((p) => p.id === id); if (i >= 0) setTimeout(() => talk(i), 30); };
  const onClose = () => back();
  window.addEventListener('olympus:people:open', onOpen); window.addEventListener('olympus:people:close', onClose);
  return {
    start, talk, back, rig: () => rig, world: () => world,
    state() { const r = rig.state(); return { mode: S.mode, i: S.i, cam: r, inside: rig.inside(0.08), greeter: S.greeter, hello: S.hello, frames: S.frames || 0, insideN: S.insideN || 0 }; },
    spun() { hud.used('sym'); hud.clearCta(); },
    dispose() { S.gone = true; hall.drive(null); hud.dispose(); window.removeEventListener('olympus:people:open', onOpen); window.removeEventListener('olympus:people:close', onClose); },
  };
}
