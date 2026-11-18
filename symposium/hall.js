// SYMPOSIUM hall (ES module): a round marble hall at golden hour. Couches (klinai) in a ring around a low table with a krater; everyone sits there as a v2 person
// (../olympus/people3d.js). You stand at the table and look across it, so the people you see face you (nobody shows you their back). The few people in view are full
// close-up figures (blinking, glancing, a real face); everyone else is one GPU crowd. When someone talks they turn to you, gesture and move their mouth; the
// others look at them. Built on the OLYMPUS render core (three.js r160 from ../jarvis/). Warm light, bloom <= .2.
// Draw calls: floor, rug, table (2), krater, cups, columns (2), ring beam, couches (3), braziers (2) = 14, the crowd 2, each close-up 2 (at most 5) = at most 26.
//   createHall(canvas, { people: [spec], reduced, onPick(i) }) -> { ok, yaw(), setYaw(a), spin(dx), focus(i), active(i|-1), talking(i, on), mouth(i, viseme, amount),
//                                                                  project(i) -> {x, y, front}, pick(clientX, clientY), drawCalls(), triangles(), dispose() }
// The chat sheet's 'olympus:people:open' / 'close' make that person turn, wave and talk. Voice (optional): window events 'olympus:people:speak' {id, on} and 'olympus:people:viseme' {id, viseme, amount} move that person's mouth.
// For the people kit's say() (speech bubbles, work cards, walk with me): stageFor(i) -> { project() } (that person becomes the active close-up), release(), walk(i) -> Promise,
// speaking() -> seat | -1, focus(i, off) (off: the speaker a little to one side, room for a work card), and 'olympus:people:expression' {id, expr} sets their face.
// If WebGL, the render core or the tier (LITE / off) says no, ok is false and the page keeps its portrait grid.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { figureInstanced, figure, play, lookAt, setTalking, setMouth, setExpression, animate, POSE_NAMES } from '../olympus/people3d.js?v=p2';
import { seats, couchAt, turn, yawFor, front } from './symposiumcore.js';
import { buildRoom } from './hall-room.js';

export function createHall(canvas, opts) {
  const o = opts || {};
  let rc = null;
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
    scene.background = new THREE.Color('#3b2a1c'); scene.fog = new THREE.Fog('#3b2a1c', 14, 40);
    rc = createRenderer({ canvas, scene, camera, maxDpr: 2, tint: '#c8a24a', env: 'night', theme: { sky: '#6a4526', fog: '#3b2a1c', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, bloom: { strength: 0.16, radius: 0.5, threshold: 1.0 } });
    const q = rc.quality();
    if (q === 'low' || q === 'off') { rc.dispose(); return { ok: false, reason: 'quality ' + q }; }
    // the OLYMPUS look (2026-11-14, team T2): the hall's dusk and fog lean toward the look's (by its mix; the default AGORA: untouched)
    try { const K = window.OLYMPUS; if (K && K.themeScene) K.themeScene({ scene, renderer: rc.renderer }); } catch (e) { /* the hall's own colours */ }
    return build(rc, scene, camera, canvas, o);
  } catch (e) {
    try { if (rc) rc.dispose(); } catch (_) { /* nothing */ }
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

const CLOSE = 4;            // close-up figures for the people nearest the middle of the view (+ the one who talks)
const SEAT_Y = 0.29, BUTT = 0.226, SC = 1.5;

function build(rc, scene, camera, canvas, o) {
  const specs = o.people || [], N = specs.length, L = seats(N), r = L.r, reduced = !!o.reduced;
  // characters v3 (2026-11-11): calmer, more neutral light so skin reads as skin (no orange cast): an ivory sky, a warm-white sun, a small fire glow,
  // a soft key light from where you stand (faces always read) and a cool rim from behind the people
  scene.add(new THREE.HemisphereLight('#fbf3e6', '#5a4a3a', 0.95));
  const sun = new THREE.DirectionalLight('#ffeedd', 1.45); sun.position.set(6, 9, 5); scene.add(sun);
  const fill = new THREE.PointLight('#ffc888', 5, r * 3.2, 1.6); fill.position.set(0, 2.2, 0); scene.add(fill);
  const face = new THREE.DirectionalLight('#fff6ec', 1.05); scene.add(face); scene.add(face.target);
  const rimL = new THREE.DirectionalLight('#e4ecff', 0.55); scene.add(rimL); scene.add(rimL.target);
  const tr = Math.max(0.9, r * 0.32);      // the table's radius (the room builds it; scene direction reads it)
  const d = new THREE.Object3D(), put = (im, i, x, y, z, ry, sx, sy, sz) => { d.position.set(x, y, z); d.rotation.set(0, ry || 0, 0); d.scale.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz); d.updateMatrix(); im.setMatrixAt(i, d.matrix); };
  // THE ROOM (symposium/hall-room.js, olympus/env-kit.js): marble, mosaic, fluted columns, a painted frieze, the coffered ceiling, the wall, couches, the table, braziers, busts
  const room = buildRoom(scene, rc, L, { couchAt });
  const { floor, rug, nB, fires } = room, shafts = room.columns, frames = room.couches;
  const firePos = (i) => room.fires[i];
  // the people: one crowd for everyone, close-up figures for the few in view
  const crowd = figureInstanced(THREE, specs, { seated: true, lite: N > 24, impostorTint: '#f4e7d6' });
  const seatY = (i) => SEAT_Y - BUTT * SC * ((specs[i] && specs[i].height) || 1);
  L.seats.forEach((s, i) => crowd.userData.place(i, s.x, seatY(i), s.z, s.ry, SC));
  scene.add(crowd);
  const close = new Map();      // seat -> figure
  function closeUp(i) {
    let f = close.get(i); if (f) return f;
    const s = L.seats[i]; f = spare.get(i);
    if (f) { spare.delete(i); f.visible = true; play(f, 'idle'); }      // a figure that left the view a moment ago: no rebuild (v3 characters cost a few ms to dress)
    else { f = figure(THREE, specs[i], { seated: true }); f.scale.multiplyScalar(SC); f.userData.seat = i; scene.add(f); }
    f.position.set(s.x, seatY(i), s.z); f.rotation.y = s.ry;
    close.set(i, f); crowd.userData.setVisible(i, false);
    if (reduced) f.userData.tick(0, 1);
    return f;
  }
  const spare = new Map(), SPARE = 6;      // seat -> a hidden close-up kept for when it comes back into view (oldest dropped first)
  function dropClose(i) {
    const f = close.get(i); if (!f) return; close.delete(i); crowd.userData.setVisible(i, true);
    f.visible = false; spare.set(i, f);
    while (spare.size > SPARE) { const [k, g] = spare.entries().next().value; spare.delete(k); g.userData.dispose(); }
  }

  let driver = null;     // SCENE DIRECTION HOOK (symposium/direct.js): after the hall places its standing camera, the director may move it (establishing shot, conversation close-ups)
  const st = { yaw: 0, goal: null, vel: 0, auto: !reduced, active: -1, activeT: 0, voice: false, t: 0, idle: 0, w: 1, h: 1, walk: null };
  const ray = new THREE.Raycaster(), v = new THREE.Vector3(), ndc = new THREE.Vector2(), look = new THREE.Vector3(), camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3(), camAt = new THREE.Vector3(), headV = new THREE.Vector3();
  function placeCam() {
    // you stand just past the middle of the table and look across it: the people over there face you, big enough to see their faces.
    // When someone talks the camera dollies in on them (a cinematic close-up), and back out when they are done.
    const portrait = st.w / st.h < 0.95, off = r * (portrait ? 0.27 : 0.34), hgt = portrait ? 1.36 : 1.42;
    camera.fov = portrait ? 46 : 40;
    camAt.set(Math.sin(st.yaw) * off, hgt, Math.cos(st.yaw) * off); camLook.set(-Math.sin(st.yaw) * r, 0.92, -Math.cos(st.yaw) * r);
    const z = st.zoom || 0;
    if (z > 0.001 && st.active >= 0 && L.seats[st.active]) {
      const s = L.seats[st.active], f = close.get(st.active);
      headV.set(s.x, seatY(st.active) + 1.08 * SC * ((specs[st.active] && specs[st.active].height) || 1) * 0.66, s.z);
      if (f) { f.updateWorldMatrix(true, true); const hb = f.userData.parts && f.userData.parts.head; if (hb && hb.getWorldPosition) hb.getWorldPosition(headV); }
      const dx = -s.x, dz = -s.z, dl = Math.hypot(dx, dz) || 1, side = st.cardOff || 0;
      const D = 2.5, nearX = s.x + (dx / dl) * D + (-dz / dl) * side * 0.9, nearZ = s.z + (dz / dl) * D + (dx / dl) * side * 0.9;
      const e = z * z * (3 - 2 * z) * 0.85;
      camAt.lerp(v.set(nearX, headV.y + 0.12, nearZ), e); camLook.lerp(headV.clone().add(v.set((-dz / dl) * side * 0.35, -0.24, (dx / dl) * side * 0.35)), e);
      camera.fov += (38 - camera.fov) * e;
    }
    camera.updateProjectionMatrix();
    camera.position.copy(camAt); camera.lookAt(camLook);
    face.position.copy(camera.position).add(v.set(0.6, 1.2, 0)); face.target.position.copy(camLook);
    rimL.position.copy(camLook).add(v.set(-camLook.x * 0.6, 2.5, -camLook.z * 0.6)); rimL.target.position.copy(camLook);
  }
  // QA6 footsteps + presence (olympus/sfx.js walker / presence; the engine honours mute, LITE, reduced motion and the first tap): your own steps on the
  // marble when you walk around the table, the steps of someone who walks out with you, and a soft jingle of their things when someone turns to greet you
  const SFXo = () => { try { return window.OLYMPUS_SFX || null; } catch (_) { return null; } };
  const ear = () => { camera.getWorldDirection(v); return { position: camera.position, forward: { x: v.x, y: v.y, z: v.z } }; };
  const steps = { me: null, d: 0, last: null, n: 0, walkT: 0, them: new Map(), jingles: 0 };
  function stepSounds(dt, user) {
    const X = SFXo(); if (!X || typeof X.walker !== 'function') return;
    const p = camera.position; if (!steps.last) steps.last = p.clone();
    const moved = Math.hypot(p.x - steps.last.x, p.z - steps.last.z); steps.last.copy(p);
    if (user && moved > 0 && moved < 1) { steps.d += moved; if (steps.d > 0.7) { steps.d = 0; steps.me = steps.me || X.walker((() => { try { const k = window.OLYMPUS_PEOPLE; return k && k.me ? k.me().spec : null; } catch (_) { return null; } })() || { kind: 'owner' }); if (steps.me.step({ x: p.x, y: 0, z: p.z }, ear(), { surface: 'stone', k: 0.45 })) steps.n++; } }
    if (st.walk && close.has(st.walk.i)) { steps.walkT += dt; if (steps.walkT > 0.36) { steps.walkT = 0; const f = close.get(st.walk.i), w = steps.them.get(st.walk.i) || X.walker(specs[st.walk.i] || {}); steps.them.set(st.walk.i, w); if (w.step({ x: f.position.x, y: 0, z: f.position.z }, ear(), { surface: 'stone', k: 0.4 })) steps.n++; } }
  }
  function presenceOf(i) { const X = SFXo(), s = L.seats[i]; if (!X || typeof X.presence !== 'function' || !s) return; if (X.presence(specs[i] || {}, { x: s.x, y: 0.9, z: s.z }, ear(), { k: 0.4 })) steps.jingles++; }
  function fit() { const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; if (w === st.w && h === st.h) return; st.w = w; st.h = h; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function want() { const k = new Set(front(L, st.yaw + Math.PI, Math.min(CLOSE, N))); if (st.active >= 0) k.add(st.active); return k; }
  function syncClose() { const k = want(); for (const i of [...close.keys()]) if (!k.has(i)) dropClose(i); for (const i of k) closeUp(i); }
  function frame(dt) {
    st.t += dt; fit();
    if (st.goal != null) { const dlt = turn(st.yaw, st.goal); if (Math.abs(dlt) < 0.004 || reduced) { st.yaw = st.goal; st.goal = null; } else st.yaw += dlt * Math.min(1, dt * 4.5); }
    else if (Math.abs(st.vel) > 0.0004) { st.yaw += st.vel; st.vel *= Math.pow(0.04, dt); }
    else if (st.auto && st.active < 0) { st.idle += dt; if (st.idle > 2.5) st.yaw += dt * 0.045; }
    const zGoal = st.active >= 0 && !reduced && st.activeT > 0.6 ? 1 : 0; st.zoom = (st.zoom || 0) + (zGoal - (st.zoom || 0)) * Math.min(1, dt * 1.6); if (reduced) st.zoom = 0;
    placeCam(); if (driver) { try { driver(dt, st); } catch (_) { /* the hall's own camera stays */ } } syncClose(); camPos.copy(camera.position);
    if (!reduced) stepSounds(dt, st.goal != null || Math.abs(st.vel) > 0.0004);
    // who looks where: everyone looks at the one who talks; with nobody talking the close-ups notice you, the crowd looks around
    const talker = st.active >= 0 ? crowd.userData.headWorld(st.active, look) : null;
    crowd.userData.lookAll(talker);
    for (const [i, f] of close) {
      if (i === st.active) {
        lookAt(f, camPos);
        const s = L.seats[i], want2 = Math.atan2(camPos.x - s.x, camPos.z - s.z), dy = turn(f.rotation.y, want2);
        f.rotation.y += Math.max(-0.5, Math.min(0.5, dy)) * Math.min(1, dt * 3);       // turn on the couch towards you
        st.activeT += dt;
        if (!st.voice) { const talking = st.activeT > 1.2 && (st.activeT % 7) < 3.6; setTalking(f, talking); }
      } else { lookAt(f, talker || camPos); const s = L.seats[i]; f.rotation.y += turn(f.rotation.y, s.ry) * Math.min(1, dt * 2); }
      if (st.walk && st.walk.i === i) {                                   // walk with me: they get up and walk out between the columns
        const w = st.walk, k = Math.min(1, (st.t - w.t0) / w.dur), e = k * k * (3 - 2 * k);
        f.position.set(w.x0 + (w.x1 - w.x0) * e, w.y0 * (1 - Math.min(1, k * 4)), w.z0 + (w.z1 - w.z0) * e); f.rotation.y = w.ry;
        if (k >= 1 && w.done) { const d = w.done; w.done = null; d(true); }
      }
      if (!reduced) animate(f, dt);
    }
    if (!reduced) { crowd.userData.tick(st.t); for (let i = 0; i < nB; i++) { const p = firePos(i), k = 1 + Math.sin(st.t * 9 + i * 2) * 0.12; put(room.flames, i, p[0], p[1], p[2], st.t * 2 + i, 1, k, 1); } room.flames.instanceMatrix.needsUpdate = true; }
    if (o.onFrame) o.onFrame();
  }
  // voice: the chat sheet (or Jarvis) may say who is speaking and which mouth shape
  const bySeed = new Map(); specs.forEach((s, i) => bySeed.set(s && s.seed >>> 0, i));
  const idx = (id) => { try { const P = window.OLYMPUS_PEOPLE; const s = P && P.spec ? P.spec(id) : null; return s ? (bySeed.has(s.seed >>> 0) ? bySeed.get(s.seed >>> 0) : -1) : -1; } catch (_) { return -1; } };
  const onSpeak = (e) => { const dd = e && e.detail || {}, i = idx(dd.id); if (i >= 0) api.talking(i, dd.on !== false); };
  const onViseme = (e) => { const dd = e && e.detail || {}, i = idx(dd.id); if (i >= 0) api.mouth(i, dd.viseme, dd.amount); };
  const onExpr = (e) => { const dd = e && e.detail || {}, i = idx(dd.id), f = close.get(i); if (f && dd.expr) setExpression(f, dd.expr, 1); };
  window.addEventListener('olympus:people:expression', onExpr);
  const onOpen = (e) => { const i = idx(e && e.detail && e.detail.id); if (i >= 0) { api.focus(i); api.active(i); } }, onClose = () => api.active(-1);      // the 1:1 chat sheet
  window.addEventListener('olympus:people:speak', onSpeak); window.addEventListener('olympus:people:viseme', onViseme);
  window.addEventListener('olympus:people:open', onOpen); window.addEventListener('olympus:people:close', onClose);
  fit(); placeCam(); syncClose();
  rc.start(frame);
  // FX HOOK (olympus/fx-cine.js, optional; 2026-11-11 effects pass): the clock's light, a sky over the open ring, sun shafts, dust, brazier
  // embers + smoke + a breathing fire light, soft shadows on high (contact blobs on LITE), the speaker focus. The hall is the same without it.
  let cine = null, gone = false; const fHead = new THREE.Vector3();
  if (o.cinema !== false) import('../olympus/fx-cine.js').then((C) => { if (gone) return; cine = C.cinema(rc, { time: 'clock', sky: true, fog: 0.4, neutral: 0.45, fireLight: 2.2,
    rays: { to: [0, 0, 0], spread: [r * 1.5, 0, r * 1.5], length: 15, width: 1.8 }, dust: { box: [r * 2 + 6, 4, r * 2 + 6], center: [0, 2, 0] },
    fires: fires.map((p) => [p[0], 1.15, p[2]]), fireRange: r * 1.6,
    shadows: { casters: [shafts, frames], receivers: [floor, rug], box: r + 5 },      // the crowd: soft contact blobs (budget)
    blobs: L.seats.map((x) => [x.x, x.z, 0.42]), blobsAlways: true, blobY: 0.006 }); room.kit.follow(cine); }).catch(() => {});
  const shown = (x) => { for (let y = x; y; y = y.parent) if (!y.visible) return false; return true; };
  const api = {
    ok: true, layout: L, count: N,
    yaw: () => st.yaw,
    setYaw(a) { st.yaw = a; st.goal = null; st.vel = 0; placeCam(); },
    spin(dx) { st.goal = null; st.idle = 0; st.yaw -= dx * 0.008; st.vel = -dx * 0.008 * 0.5; },
    focus(i, off) { if (L.seats[i]) { st.goal = yawFor(L, i) + Math.PI + (off || 0); st.vel = 0; st.idle = 0; st.cardOff = off ? Math.sign(off) : 0; } },      // turn so this person sits across the table, facing you
    active(i) {
      const prev = st.active; st.active = i == null || !L.seats[i] ? -1 : i; st.activeT = 0; st.voice = false;
      if (prev >= 0 && close.has(prev)) { const f = close.get(prev); setTalking(f, false); play(f, 'idle'); }
      crowd.userData.setActive(prev, false);
      if (st.active >= 0) { const f = closeUp(st.active); play(f, 'wave', { then: 'talk' }); if (st.active !== prev) presenceOf(st.active); }
      if (reduced) { syncClose(); crowd.userData.tick(0); }
      const k = st.active; if (cine) cine.focus(k >= 0 ? () => crowd.userData.headWorld(k, fHead) : null, { r: 0.2, amount: 4 });      // FX HOOK: focus on the speaker
    },
    talking(i, on) { if (i !== st.active) api.active(i); st.voice = true; const f = close.get(i); if (f) { setTalking(f, !!on); if (on) play(f, 'talk'); } },
    mouth(i, vis, amount) { const f = close.get(i); if (f) { st.voice = true; setMouth(f, vis, amount); } },
    project(i) { crowd.userData.headWorld(i, v); const behind = v.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) <= 0; v.project(camera); return { x: (v.x * 0.5 + 0.5) * st.w, y: (-v.y * 0.5 + 0.5) * st.h, z: v.z, front: !behind }; },
    pick(cx, cy) { const b = canvas.getBoundingClientRect(); ndc.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, camera); return crowd.userData.pick(ray, true); },
    drawCalls: () => { let n = 0; scene.traverse((x) => { if (x.isMesh && shown(x)) n++; }); return n; },      // one draw per mesh: every repeated thing is instanced
    triangles: () => { let n = 0; scene.traverse((x) => { if (x.isMesh && shown(x) && x.geometry) { const g = x.geometry, c = g.index ? g.index.count : g.getAttribute('position').count; n += (c / 3) * (x.isInstancedMesh ? x.count : 1); } }); return Math.round(n); },
    closeUps: () => [...close.keys()],
    sounds: () => ({ steps: steps.n, jingles: steps.jingles }),
    rigged: () => [...close.values()].filter((f) => f.userData && f.userData.rig).length,      // characters v3: close-ups that are the rigged cast
    crowdInfo: () => ({ impostors: !!crowd.userData.impostors, calls: crowd.userData.drawCalls }),
    // ---- SCENE DIRECTION HOOKS (symposium/direct.js + olympus/camera-rig.js)
    drive(fn) { driver = typeof fn === 'function' ? fn : null; return !!driver; },
    front: () => front(L, st.yaw + Math.PI, Math.min(5, N)),
    refs() { return { THREE, scene, camera, canvas, rc, r, tr, layout: L, reduced, head: (i, out) => crowd.userData.headWorld(i, out || new THREE.Vector3()), cine: () => cine, look: () => ({ x: -Math.sin(st.yaw) * r, y: 1.02, z: -Math.cos(st.yaw) * r }) }; },
    stageFor(i) { if (!L.seats[i]) return null; if (st.active !== i) { api.focus(i); api.active(i); } closeUp(i); return { seat: i, project: () => api.project(i) }; },
    release() { if (st.walk) { const w = st.walk; st.walk = null; if (w.done) w.done(false); } api.active(-1); },
    speaking: () => st.active,
    walk(i) {
      if (!L.seats[i]) return Promise.resolve(false);
      if (st.active !== i) api.active(i);
      const f = closeUp(i), s = L.seats[i], out = Math.hypot(s.x, s.z) || 1, k = (r + 3) / out;
      play(f, POSE_NAMES.indexOf('walk') >= 0 ? 'walk' : 'wave');
      if (reduced) return Promise.resolve(true);
      return new Promise((ok) => { st.walk = { i, t0: st.t, dur: 1.6, x0: f.position.x, y0: f.position.y, z0: f.position.z, x1: s.x * k, z1: s.z * k, ry: Math.atan2(s.x, s.z), done: ok }; });
    },
    speaker: () => (st.active >= 0 && close.has(st.active) ? { seat: st.active, ...close.get(st.active).userData.state() } : null),
    cine: () => cine,
    room: () => room,
    dispose() { gone = true; for (const g of spare.values()) g.userData.dispose(); spare.clear(); if (cine) cine.dispose(); room.dispose(); window.removeEventListener('olympus:people:expression', onExpr); window.removeEventListener('olympus:people:open', onOpen); window.removeEventListener('olympus:people:close', onClose); window.removeEventListener('olympus:people:speak', onSpeak); window.removeEventListener('olympus:people:viseme', onViseme); try { rc.dispose(); } catch (_) { /* gone */ } for (const i of [...close.keys()]) dropClose(i); crowd.userData.dispose(); },
  };
  try { window.SYMPOSIUM_HALL = api; } catch (_) { /* no window */ }      // read-only hook for the page test
  return api;
}

/** a small turntable for "Make my character": one v2 figure on a marble disc, its own tiny renderer (no post passes). It waves, then shows a few faces. */
export function createTurntable(canvas, sp, opts) {
  const o = opts || {};
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    scene.add(new THREE.HemisphereLight('#ffe9c4', '#5a4630', 1.5)); const sun = new THREE.DirectionalLight('#ffd9a0', 2.3); sun.position.set(2, 4, 4); scene.add(sun);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.08, 28), new THREE.MeshStandardMaterial({ color: '#d9cfbb', roughness: 0.85 })); disc.position.y = -0.04; scene.add(disc);
    const holder = new THREE.Group(); scene.add(holder);
    let fig = null, raf = 0, t0 = performance.now(), last = t0, dead = false, angle = 0.5;
    function set(s) { if (fig) fig.userData.dispose(); fig = figure(THREE, s, {}); play(fig, 'wave', { then: 'idle' }); holder.add(fig); if (o.reduced) draw(0); }
    function fit() { const w = canvas.clientWidth || 200, h = canvas.clientHeight || 220; renderer.setSize(w, h, false); cam.aspect = w / h; cam.position.set(0, 0.8, 3.5); cam.lookAt(0, 0.52, 0); cam.updateProjectionMatrix(); }
    function draw(dt) { holder.rotation.y = angle; if (fig) { lookAt(fig, cam.position); if (dt) fig.userData.tick(dt, (performance.now() - t0) / 1000); } renderer.render(scene, cam); }
    function loop(now) { if (dead) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!document.hidden) { angle = 0.5 * Math.sin((now - t0) / 2600); draw(dt); } raf = requestAnimationFrame(loop); }
    fit(); set(sp);
    if (o.reduced) draw(0); else raf = requestAnimationFrame(loop);
    return { ok: true, set, fit, triangles: () => (fig ? fig.userData.triangles : 0), dispose() { dead = true; cancelAnimationFrame(raf); if (fig) fig.userData.dispose(); disc.geometry.dispose(); disc.material.dispose(); renderer.dispose(); } };
  } catch (e) { return { ok: false, reason: String(e && e.message ? e.message : e) }; }
}
