// ERGASTERION floor (ES module): the marble-and-bronze agent factory you walk in first person. Four halls (Money, Trading, Research, Library) around a cross of inner walls with a
// door in each; one platform per worker with a friendly cartoon PERSON (big round head, dot eyes, coloured tunic, mitten hands) DOING ITS JOB (turning the search wheel, writing at a desk, reading the tripod, hammering at the anvil, weighing on the
// scales), a status lamp, a speech bubble with its latest finding, and a conveyor carrying its last outputs as labelled crates you can tap. The Learning board and "what changed our
// mind" hang in the Library, the research pipeline wall in the Research hall. Built on the OLYMPUS render core (../olympus/render.js, three.js r160 from ../jarvis/). Warm light, bloom <= .2.
// Outside the front door lies THE BUILDERS' CAMP: a desert caravan camp with one tent per build agent (a worker at a marble table, a banner with its name and job, a scroll that cycles
// its latest commit messages, a stack of crates = commits today, brazier smoke only while it is working).
// LIGHT BY DESIGN: every repeated part lives in one of ten instanced batches (unit box / cylinder / sphere, coloured per instance), all 15 bubbles are ONE mesh on one canvas atlas, the camp's banners and scrolls another,
// all crate tags and hall signs are ONE mesh on a second atlas, plus three wall boards: about 15 draw calls and under 40k triangles for the whole factory.
// createFloor(canvas, { reduced, stations, onPick }) -> { ok, set(workers, extra), move({fwd,side}), look(dx,dy), follow(id|null), tour(on), pulse(ids), reset(), teleport(x,z),
//   face(id), pos(), project(id), pick(x,y), stats(), dispose() }
// LIFE (life.js): a day schedule (09:30 stand-up in a ring, visits to each hall's queue board, builders carrying crates to the camp cart), reactions to real events
//   (react(events): cheer on a merge, slump on a failed run, the hall gathers and cheers for a big number), heads turn when you walk into a hall, sparks + a clank on each
//   hammer blow (optional fx / sound kits), and the people near you drawn as the full shared figures (olympus/people3d.js, LOD by measured draw calls).
//   Extra API: clock(ms|null), standup(hall|null), react(events), lead(key), posOf(key), life().
// If WebGL, the render core or the tier (LITE / off) says no, ok is false and the page keeps its flat plan. Reduced motion: everything stands still and the camera jumps instead of gliding.
import * as THREE from '../jarvis/three.module.min.js';
import { createRenderer } from '../olympus/render.js';
import { walk, followCam, tourCam, ease, hallOf, resolveCollision, EYE, START, HALLS, DOORS, CAMP, CAMP_SPOTS, personId, builderIds, lookOf } from './ergasterioncore.js';
import * as L from './life.js';
import { envKit } from '../olympus/env-kit.js';
import * as ART from './floor-art.js';

const BUILD = { working: '#8fa05a', quiet: '#4b7a99', done: '#c8a24a', job: '#b8ad98' }, BWORD = { working: 'Working', quiet: 'Quiet', done: 'Done', job: 'Job only' }, NC = CAMP_SPOTS.length, CSTACK = 6, PUFF = 5;
const HS = 9;                                                                              // head-batch parts of one person: head, hair, 2 eyes, 2 hands, shoulders, 2 feet
const LAMP = { working: '#8fa05a', idle: '#4b7a99', stale: '#e0b060', failed: '#c96a4a', sample: '#b8ad98' };
const WORD = { working: 'Working', idle: 'Idle', stale: 'Stale', failed: 'Failed', sample: 'Sample data' };
const PACE = { working: 1, idle: 0.3, stale: 0, failed: 0, sample: 0.5 };          // how briskly a figure works (and its belt runs)
const MARBLE = '#d9d2c3', BRONZE = '#9c6b3c', GOLD = '#c8a24a', Y0 = 0.24, MAXC = 5;
const RUG = { money: '#8a7a55', trading: '#84684e', research: '#74795c', library: '#64727c' };

export function createFloor(canvas, opts) {
  const o = opts || {};
  let rc = null;
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, 1.2, 0.1, 80);
    scene.background = new THREE.Color('#2a2118');
    scene.fog = new THREE.Fog('#5a4030', 26, 72);
    rc = createRenderer({ canvas, scene, camera, maxDpr: 2, tint: '#c8a24a', env: 'night',
      theme: { sky: '#5a3c22', fog: '#2a2118', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, bloom: { strength: 0.15, radius: 0.5, threshold: 1.0 } });
    const q = rc.quality();
    if (q === 'low' || q === 'off') { rc.dispose(); return { ok: false, mode: 'lite', reason: 'quality ' + q }; }
    return build(rc, scene, camera, canvas, o);
  } catch (e) {
    try { if (rc) rc.dispose(); } catch (_) { /* nothing */ }
    return { ok: false, mode: 'lite', reason: String(e && e.message ? e.message : e) };
  }
}

function atlas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return { c, t, g: c.getContext('2d') }; }
function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(' '); let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + ' ' + words[i] : words[i];
    if (g.measureText(t).width > maxW && line) {
      if (n === maxLines - 1) { let l = line + ' ' + words[i]; while (l.length > 3 && g.measureText(l + '…').width > maxW) l = l.slice(0, -1); g.fillText(l.trimEnd() + '…', x, y + n * lh); return n + 1; }
      g.fillText(line, x, y + n * lh); n++; line = words[i];
    } else line = t;
  }
  if (line && n < maxLines) { g.fillText(line, x, y + n * lh); n++; }
  return n;
}
function panel(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); g.stroke(); }

function build(rc, scene, camera, canvas, o) {
  const reduced = !!o.reduced, S = o.stations || [], N = S.length, eye = o.eye || EYE;
  const mot = reduced ? 0 : 1;
  scene.add(new THREE.HemisphereLight(0xf0dcb8, 0x4a3a28, 1.05));
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.1); sun.position.set(6, 14, 9); scene.add(sun);
  const skyG = new THREE.SphereGeometry(70, 20, 10), skyC = new Float32Array(skyG.attributes.position.count * 3), top = new THREE.Color('#23233f'), mid = new THREE.Color('#6b4a3a'), low = new THREE.Color('#c08a4e');
  for (let i = 0; i < skyG.attributes.position.count; i++) { const hgt = Math.max(0, skyG.attributes.position.getY(i) / 70), c = hgt < 0.25 ? low.clone().lerp(mid, hgt / 0.25) : mid.clone().lerp(top, Math.min(1, (hgt - 0.25) / 0.5)); skyC[i * 3] = c.r; skyC[i * 3 + 1] = c.g; skyC[i * 3 + 2] = c.b; }
  skyG.setAttribute('color', new THREE.BufferAttribute(skyC, 3));
  const sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
  const std = (r, m) => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: r, metalness: m });
  // ENV ART (ergasterion/floor-art.js, olympus/env-kit.js): the batches wear Poly Haven scans; the HDRI lights them
  const kit = envKit({ rc, tier: rc.quality(), envI: 0.45 }), AM = ART.materials(kit);
  const stone = AM.stone, metal = AM.metal;
  const colour = new THREE.Color(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), EU = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3();
  const put = (im, i, x, y, z, sx, sy, sz, rx, ry, rz) => { EU.set(rx || 0, ry || 0, rz || 0, 'XYZ'); Q.setFromEuler(EU); M4.compose(P.set(x, y, z), Q, SC.set(sx, sy, sz)); im.setMatrixAt(i, M4); };
  // a batch = one InstancedMesh (one draw call): list the parts, then build it once; dynamic batches are rewritten every frame
  const batches = [];
  function batch(geo, mat, dynamic) {
    const L = [], b = { im: null, n: 0,
      add(x, y, z, sx, sy, sz, col, rx, ry, rz) { L.push([x, y, z, sx, sy, sz, rx || 0, ry || 0, rz || 0, col]); return L.length - 1; },
      make() {
        const im = new THREE.InstancedMesh(geo, mat, Math.max(1, L.length)); b.im = im; b.n = L.length;
        L.forEach((a, i) => { put(im, i, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]); im.setColorAt(i, colour.set(a[9] || '#ffffff')); });
        if (dynamic) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false; scene.add(im); return im;
      } };
    batches.push(b); return b;
  }
  const boxG = new THREE.BoxGeometry(1, 1, 1), cylG = new THREE.CylinderGeometry(1, 1, 1, 20), robeG = new THREE.CylinderGeometry(0.72, 1, 1, 12), ballG = new THREE.SphereGeometry(1, 16, 12);
  const sBox = batch(boxG, stone), bBox = batch(boxG, metal), sCyl = batch(cylG, stone), bCyl = batch(cylG, metal);                     // static: the building and the furniture
  const pplG = new THREE.SphereGeometry(1, 12, 8), toy = std(0.82, 0);
  const fig = batch(robeG, toy, true), head = batch(pplG, toy, true), dBox = batch(boxG, metal, true), dCyl = batch(cylG, metal, true);   // moving: the figures and their tools
  const lamp = batch(ballG, new THREE.MeshBasicMaterial({ color: '#ffffff' }), true), crate = batch(boxG, AM.wood, true);
  const tentG = new THREE.ConeGeometry(1, 1, 4); tentG.rotateY(Math.PI / 4);
  const sandB = batch(boxG, AM.sand, false), dune = batch(ballG, AM.sand, false);                    // the camp: the sand and the dunes (the tents are KayKit's, floor-art.js)
  void tentG;

  // ---- the building: floor, four rugs (one tone per hall), outer walls, the cross of inner walls with a bronze door frame in each, columns along the outer walls
  sBox.add(0, -0.1, 0, 26.8, 0.2, 20.8, '#bdb29d');
  for (const h of HALLS) sBox.add((h.x0 + h.x1) / 2, 0.012, (h.z0 + h.z1) / 2, 11.2, 0.03, 8.2, RUG[h.id]);
  const WALL = '#a99f8d', WH = 3.4, IH = 3.0;
  sBox.add(0, WH / 2, -10.2, 26.8, WH, 0.4, WALL); sBox.add(-4.075, WH / 2, 10.2, 18.65, WH, 0.4, WALL); sBox.add(10.575, WH / 2, 10.2, 5.65, WH, 0.4, WALL); sBox.add(START.x, 3.05, 10.2, 2.5, 0.7, 0.4, WALL); sBox.add(-13.2, WH / 2, 0, 0.4, WH, 20.8, WALL); sBox.add(13.2, WH / 2, 0, 0.4, WH, 20.8, WALL);
  for (const ax of ['x', 'z']) {
    const len = ax === 'x' ? 10 : 13, ds = DOORS.filter((d) => d.axis === ax).sort((a, b) => a.c - b.c); let from = -len;
    const seg = (a, b) => { if (b - a < 0.05) return; if (ax === 'x') sBox.add(0, IH / 2, (a + b) / 2, 0.3, IH, b - a, WALL); else sBox.add((a + b) / 2, IH / 2, 0, b - a, IH, 0.3, WALL); };
    for (const d of ds) {
      seg(from, d.c - d.half); from = d.c + d.half;
      if (ax === 'x') { bBox.add(0, 2.8, d.c, 0.38, 0.4, d.half * 2 + 0.3, BRONZE); bBox.add(0, 1.3, d.c - d.half, 0.4, 2.6, 0.14, BRONZE); bBox.add(0, 1.3, d.c + d.half, 0.4, 2.6, 0.14, BRONZE); }
      else { bBox.add(d.c, 2.8, 0, d.half * 2 + 0.3, 0.4, 0.38, BRONZE); bBox.add(d.c - d.half, 1.3, 0, 0.14, 2.6, 0.4, BRONZE); bBox.add(d.c + d.half, 1.3, 0, 0.14, 2.6, 0.4, BRONZE); }
    }
    seg(from, len);
  }
  bBox.add(0, 0.02, -9.95, 26.4, 0.1, 0.16, BRONZE); bBox.add(-4.0, 0.02, 9.95, 18.4, 0.1, 0.16, BRONZE); bBox.add(10.5, 0.02, 9.95, 5.4, 0.1, 0.16, BRONZE); bBox.add(-12.95, 0.02, 0, 0.16, 0.1, 20, BRONZE); bBox.add(12.95, 0.02, 0, 0.16, 0.1, 20, BRONZE);
  bBox.add(START.x - 1.25, 1.3, 9.95, 0.16, 2.6, 0.2, BRONZE); bBox.add(START.x + 1.25, 1.3, 9.95, 0.16, 2.6, 0.2, BRONZE); bBox.add(START.x, 2.7, 9.95, 2.66, 0.22, 0.2, BRONZE);   // the front door behind you
  // the columns along the walls are fluted Doric columns now (floor-art.js)

  // ---- stations: platform, bronze rim, lamp post, conveyor belt, and the furniture of the job
  const figAt = S.map((s) => ({ x: s.x, z: s.z - 0.12 }));
  const platIdx = [];
  S.forEach((s, i) => {
    platIdx.push(sCyl.add(s.x, Y0 / 2, s.z, 1.15, Y0, 1.15, MARBLE));
    bCyl.add(s.x, 0.04, s.z, 1.27, 0.08, 1.27, BRONZE);
    bCyl.add(s.x + 0.95, 0.85, s.z - 0.62, 0.045, 1.7, 0.045, BRONZE);
    bBox.add(s.x, 0.1, s.z + 1.75, 2.7, 0.12, 0.5, BRONZE); bBox.add(s.x - 1.2, 0.03, s.z + 1.75, 0.1, 0.06, 0.6, '#6f4c2b'); bBox.add(s.x + 1.2, 0.03, s.z + 1.75, 0.1, 0.06, 0.6, '#6f4c2b');
    const px = s.x, pz = s.z + 0.5;
    if (s.job === 'scribe') { sBox.add(px, Y0 + 0.5, pz, 0.95, 0.06, 0.5, MARBLE); bBox.add(px - 0.4, Y0 + 0.24, pz, 0.06, 0.48, 0.42, BRONZE); bBox.add(px + 0.4, Y0 + 0.24, pz, 0.06, 0.48, 0.42, BRONZE); sBox.add(px - 0.05, Y0 + 0.545, pz, 0.5, 0.025, 0.32, '#efe6d2'); }
    else if (s.job === 'oracle') { for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; bCyl.add(px + Math.sin(a) * 0.15, Y0 + 0.33, pz + Math.cos(a) * 0.15, 0.022, 0.7, 0.022, BRONZE, Math.cos(a) * 0.36, 0, -Math.sin(a) * 0.36); } bCyl.add(px, Y0 + 0.68, pz, 0.26, 0.1, 0.26, GOLD); }
    else if (s.job === 'smith') { /* a forged anvil on a stump (floor-art.js) */ }
    else if (s.job === 'scales') { bCyl.add(px, Y0 + 0.43, pz, 0.03, 0.86, 0.03, BRONZE); bCyl.add(px, Y0 + 0.03, pz, 0.2, 0.06, 0.2, BRONZE); }
    else { bBox.add(px + 0.62, Y0 + 0.28, pz - 0.04, 0.08, 0.56, 0.08, BRONZE); bBox.add(px + 0.62, Y0 + 0.03, pz - 0.04, 0.5, 0.06, 0.34, BRONZE); }
  });
  // ---- THE BUILDERS' CAMP outside the front door: sand, a path, dunes, the hearth, and for each build agent a tent, a banner pole, a marble work table and a small brazier
  const SAND = '#c9a66b', cz0 = (CAMP.z0 + CAMP.z1) / 2;
  sandB.add(6.5, -0.12, cz0, 30, 0.2, CAMP.z1 - CAMP.z0 + 6, SAND); sandB.add(START.x, 0.0, 11.4, 2.2, 0.04, 3.4, '#dcc391'); sandB.add(START.x, 0.0, 16.9, 1.5, 0.04, 7.6, '#d6bb85');
  [[-6, 13, 4.5], [-7.5, 20, 6], [19.5, 14, 5], [20.5, 21, 6.5], [1, 25.5, 6], [8, 26.5, 7], [15, 25.5, 5.5], [-4.5, 25, 4.5]].forEach((dn) => dune.add(dn[0], -0.25, dn[1], dn[2], dn[2] * 0.3, dn[2] * 0.8, '#bf9a5e'));
  dune.add(-2.6, 0, 12.2, 0.5, 0.32, 0.45, '#a89a80'); dune.add(15.6, 0, 12.6, 0.6, 0.36, 0.5, '#a89a80'); dune.add(15.9, 0, 17.8, 0.4, 0.26, 0.4, '#a89a80');
  bCyl.add(CAMP.fire.x, 0.5, CAMP.fire.z, 0.36, 0.14, 0.36, BRONZE); for (let k = 0; k < 3; k++) { const a = k * 2.094; bCyl.add(CAMP.fire.x + Math.sin(a) * 0.28, 0.24, CAMP.fire.z + Math.cos(a) * 0.28, 0.03, 0.52, 0.03, BRONZE, Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4); }
  const TENT = ['#e6d9bd', '#c98f6a', '#d8c9a3', '#a9b07a', '#e0cfa8'];
  CAMP_SPOTS.forEach((c, j) => {
    void TENT; bCyl.add(c.x, 2.95, c.z + 0.2, 0.025, 0.5, 0.025, GOLD);
    bCyl.add(c.x - 1.25, 1.3, c.z - 1.0, 0.035, 2.6, 0.035, BRONZE);
    sBox.add(c.x, 0.5, c.z - 2.45, 0.95, 0.06, 0.5, MARBLE); bBox.add(c.x - 0.4, 0.24, c.z - 2.45, 0.06, 0.48, 0.42, BRONZE); bBox.add(c.x + 0.4, 0.24, c.z - 2.45, 0.06, 0.48, 0.42, BRONZE);
    if (c.job !== 'smith') sBox.add(c.x - 0.05, 0.545, c.z - 2.45, 0.5, 0.025, 0.32, '#efe6d2');
    bCyl.add(c.x + 1.15, 0.5, c.z - 1.7, 0.2, 0.12, 0.2, BRONZE); bCyl.add(c.x + 1.15, 0.22, c.z - 1.7, 0.03, 0.44, 0.03, BRONZE);
  });
  // moving parts: fixed slots per station (and per camp builder) so nothing is allocated while drawing
  for (let i = 0; i < N + NC; i++) { const lk = lookOf(i); for (let q = 0; q < 3; q++) fig.add(0, -9, 0, 1, 1, 1, lk.outfit);
    [lk.skin, lk.hair, '#2a2018', '#2a2018', lk.skin, lk.skin, lk.outfit, '#5a4030', '#5a4030'].forEach((c) => head.add(0, -9, 0, 1, 1, 1, c));
    for (let k = 0; k < 3; k++) { dBox.add(0, -9, 0, 1, 1, 1, k === 2 ? GOLD : BRONZE); dCyl.add(0, -9, 0, 1, 1, 1, BRONZE); } }
  S.forEach(() => { lamp.add(0, -9, 0, 1, 1, 1, LAMP.stale); for (let k = 0; k < MAXC; k++) crate.add(0, -9, 0, 1, 1, 1, '#b08a52'); });
  const EMBER0 = N, PUFF0 = N + 1 + NC, CR0 = N * MAXC;
  lamp.add(CAMP.fire.x, 0.6, CAMP.fire.z, 0.26, 0.06, 0.26, '#c2561f');
  CAMP_SPOTS.forEach((c) => lamp.add(c.x + 1.15, 0.6, c.z - 1.7, 0.13, 0.09, 0.13, '#4a3a28'));
  CAMP_SPOTS.forEach(() => { for (let k = 0; k < PUFF; k++) lamp.add(0, -9, 0, 1, 1, 1, '#b3a58e'); });
  CAMP_SPOTS.forEach(() => { for (let k = 0; k < CSTACK; k++) crate.add(0, -9, 0, 1, 1, 1, '#b08a52'); });
  const SPOT = N + 1 + NC + NC * PUFF; lamp.add(0, -9, 0, 1, 1, 1, '#efe6d2');                              // the soft marble disc under the person you are talking to
  const CARRY0 = CR0 + NC * CSTACK, CART0 = CARRY0 + NC;                                                       // crates in builders' arms, then the crates on the cart
  for (let j = 0; j < NC; j++) crate.add(0, -9, 0, 1, 1, 1, '#c49a5c');
  for (let q = 0; q < L.CART.cap; q++) crate.add(0, -9, 0, 1, 1, 1, q % 2 ? '#b08a52' : '#c49a5c');
  // the camp cart (today's commits pile up on it) and one marble QUEUE BOARD stele per hall (what the queue holds, read from queue.json)
  { const cx = L.CART.x, cz = L.CART.z; bBox.add(cx, 0.6, cz, 1.7, 0.12, 1.05, '#7a5631'); bBox.add(cx, 0.72, cz - 0.52, 1.7, 0.18, 0.05, '#6f4c2b'); bBox.add(cx, 0.72, cz + 0.52, 1.7, 0.18, 0.05, '#6f4c2b');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bCyl.add(cx + sx * 0.55, 0.32, cz + sz * 0.6, 0.32, 0.07, 0.32, '#5a3c22', Math.PI / 2, 0, 0);
    bBox.add(cx - 1.25, 0.42, cz - 0.2, 0.9, 0.05, 0.05, '#6f4c2b'); bBox.add(cx - 1.25, 0.42, cz + 0.2, 0.9, 0.05, 0.05, '#6f4c2b'); }
  const QB = HALLS.map((h) => ({ hall: h.id, name: h.name, ...L.QBOARD[h.id] }));
  for (const B of QB) { const fx = Math.sin(B.ry), fz = Math.cos(B.ry);
    sBox.add(B.x, 0.08, B.z, 1.3, 0.16, 0.42, MARBLE, 0, B.ry, 0); sBox.add(B.x - fx * 0.02, 0.92, B.z - fz * 0.02, 1.12, 1.52, 0.14, '#cfc6b4', 0, B.ry, 0); bBox.add(B.x, 1.72, B.z, 1.24, 0.1, 0.2, BRONZE, 0, B.ry, 0); }
  // board frames (the boards themselves are three canvases)
  const BOARDS = { board: { x: 10.35, y: 1.85, z: 0.17, w: 4.5, h: 2.5, ry: 0 }, changed: { x: 2.75, y: 1.85, z: 0.17, w: 4.5, h: 2.5, ry: 0 }, pipe: { x: -6.5, y: 1.85, z: 9.98, w: 9.2, h: 2.6, ry: Math.PI } };
  for (const k in BOARDS) { const b = BOARDS[k]; bBox.add(b.x, b.y, b.z - (b.ry ? -0.04 : 0.04), b.w + 0.24, b.h + 0.24, 0.06, BRONZE); }
  batches.forEach((b) => b.make());
  const art = ART.dress(scene, kit, { S, Y0, CAMP_SPOTS, CAMP, MARBLE });
  kit.env('golden');

  // ---- one canvas atlas for the 15 speech bubbles (name, status, what it says): ONE mesh, turned to the camera on the CPU
  const BW = 512, BH = 256, A = atlas(2048, 1024), quads = (n) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 8), 2)); const idx = []; for (let i = 0; i < n; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); g.setIndex(idx); return g; };
  const flat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const setUV = (g, i, u0, v0, u1, v1) => { const a = g.attributes.uv.array, k = i * 8; a[k] = u0; a[k + 1] = v0; a[k + 2] = u1; a[k + 3] = v0; a[k + 4] = u1; a[k + 5] = v1; a[k + 6] = u0; a[k + 7] = v1; g.attributes.uv.needsUpdate = true; };
  const RT = new THREE.Vector3(), UP = new THREE.Vector3();
  const setQuad = (g, i, x, y, z, w, h) => { const a = g.attributes.position.array, k = i * 12, rx = RT.x * w / 2, ry = RT.y * w / 2, rz = RT.z * w / 2, ux = UP.x * h / 2, uy = UP.y * h / 2, uz = UP.z * h / 2;
    a[k] = x - rx - ux; a[k + 1] = y - ry - uy; a[k + 2] = z - rz - uz; a[k + 3] = x + rx - ux; a[k + 4] = y + ry - uy; a[k + 5] = z + rz - uz; a[k + 6] = x + rx + ux; a[k + 7] = y + ry + uy; a[k + 8] = z + rz + uz; a[k + 9] = x - rx + ux; a[k + 10] = y - ry + uy; a[k + 11] = z - rz + uz; };
  const bubG = quads(N), bubbles = new THREE.Mesh(bubG, flat(A.t)); bubbles.frustumCulled = false; bubbles.renderOrder = 5; scene.add(bubbles);
  S.forEach((_, i) => { const cx = (i % 4) * BW, cy = Math.floor(i / 4) * BH; setUV(bubG, i, cx / 2048, 1 - (cy + BH) / 1024, (cx + BW) / 2048, 1 - cy / 1024); });
  const bubKey = S.map(() => '');
  function drawBubble(i, w) {
    const key = w ? (S[i].who || w.name) + '|' + w.status + '|' + w.say : S[i].name;
    if (bubKey[i] === key) return; bubKey[i] = key;
    const g = A.g, x = (i % 4) * BW, y = Math.floor(i / 4) * BH, st = w ? w.status : 'stale';
    g.clearRect(x, y, BW, BH);
    g.fillStyle = 'rgba(29,25,20,0.9)'; g.strokeStyle = BRONZE; g.lineWidth = 4; panel(g, x + 6, y + 6, BW - 12, BH - 40, 22);
    g.beginPath(); g.moveTo(x + BW / 2 - 18, y + BH - 36); g.lineTo(x + BW / 2, y + BH - 8); g.lineTo(x + BW / 2 + 18, y + BH - 36); g.closePath(); g.fillStyle = 'rgba(29,25,20,0.9)'; g.fill(); g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#f3ece0'; g.font = '600 38px Georgia, serif'; g.fillText(S[i].who || S[i].name, x + 26, y + 54);
    g.fillStyle = LAMP[st] || LAMP.stale; g.font = '700 26px -apple-system, "Segoe UI", sans-serif'; g.textAlign = 'right'; g.fillText(w ? WORD[st] : '...', x + BW - 26, y + 52); g.textAlign = 'left';
    g.fillStyle = BRONZE; g.fillRect(x + 26, y + 68, BW - 52, 2);
    g.fillStyle = '#e8dfcf'; g.font = '500 30px -apple-system, "Segoe UI", sans-serif'; wrap(g, w ? w.say || w.doing || '' : 'Waiting for its file...', x + 26, y + 108, BW - 52, 38, 3);
    A.t.needsUpdate = true;
  }
  S.forEach((_, i) => drawBubble(i, null));

  // ---- a second atlas: the crate tags (15 x 5) and the four hall signs: ONE mesh
  const TW = 256, TH = 64, T = atlas(2048, 1024), NT = N * MAXC, QB0 = NT + HALLS.length, CSIGN = QB0 + QB.length, tagG = quads(CSIGN + 1), tags = new THREE.Mesh(tagG, flat(T.t)); tags.frustumCulled = false; tags.renderOrder = 4; scene.add(tags);
  for (let i = 0; i < NT; i++) { const cx = (i % 8) * TW, cy = Math.floor(i / 8) * TH; setUV(tagG, i, cx / 2048, 1 - (cy + TH) / 1024, (cx + TW) / 2048, 1 - cy / 1024); }
  HALLS.forEach((h, k) => { const cx = k * 512, cy = 1024 - 128; setUV(tagG, NT + k, cx / 2048, 0, (cx + 512) / 2048, 128 / 1024);
    const g = T.g; g.fillStyle = 'rgba(29,25,20,0.88)'; g.strokeStyle = GOLD; g.lineWidth = 4; panel(g, cx + 6, cy + 14, 500, 100, 20); g.fillStyle = '#e0b060'; g.font = '600 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(h.name, cx + 256, cy + 66); });
  // the four queue boards (384 x 256 each) and the cart's sign (512 x 256) share the free band of the tag atlas (y 640..896): still the same ONE mesh
  QB.forEach((B, k) => setUV(tagG, QB0 + k, (k * 384) / 2048, 1 - 896 / 1024, (k * 384 + 384) / 2048, 1 - 640 / 1024));
  setUV(tagG, CSIGN, 1536 / 2048, 1 - 896 / 1024, 1, 1 - 640 / 1024);
  const RTF = new THREE.Vector3(), setFixed = (g, i, x, y, z, w, h, ry) => { const a = g.attributes.position.array, k = i * 12, rx = Math.cos(ry) * w / 2, rz = -Math.sin(ry) * w / 2, uy = h / 2;
    a[k] = x - rx; a[k + 1] = y - uy; a[k + 2] = z - rz; a[k + 3] = x + rx; a[k + 4] = y - uy; a[k + 5] = z + rz; a[k + 6] = x + rx; a[k + 7] = y + uy; a[k + 8] = z + rz; a[k + 9] = x - rx; a[k + 10] = y + uy; a[k + 11] = z - rz; };
  QB.forEach((B, k) => setFixed(tagG, QB0 + k, B.x + Math.sin(B.ry) * 0.06, 0.98, B.z + Math.cos(B.ry) * 0.06, 0.99, 0.66, B.ry));
  let qKey = '', cKey = '';
  function drawQueue(qd) {
    const key = JSON.stringify(qd || null); if (key === qKey) return; qKey = key; const g = T.g;
    QB.forEach((B, k) => { const x = k * 384, y = 640; g.clearRect(x, y, 384, 256); g.fillStyle = '#efe7d6'; g.fillRect(x, y, 384, 256); g.strokeStyle = BRONZE; g.lineWidth = 6; g.strokeRect(x + 5, y + 5, 374, 246);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#5a3c22'; g.font = '600 34px Georgia, serif'; g.fillText('Queue board', x + 22, y + 46);
      g.fillStyle = '#7a5631'; g.font = '500 20px -apple-system, "Segoe UI", sans-serif'; g.textAlign = 'right'; g.fillText(B.name, x + 362, y + 44); g.textAlign = 'left'; g.fillStyle = BRONZE; g.fillRect(x + 22, y + 58, 340, 2);
      if (!qd || !qd.ok) { g.fillStyle = '#3a2c1c'; g.font = '500 22px -apple-system, sans-serif'; wrap(g, 'No queue file yet (handoff/QUEUE.md).', x + 22, y + 96, 340, 28, 3); return; }
      g.fillStyle = '#3a2c1c'; g.font = '700 26px -apple-system, "Segoe UI", sans-serif'; g.fillText(qd.open + ' open · ' + qd.done + ' done' + (qd.sample ? ' · example' : ''), x + 22, y + 94);
      g.font = '500 19px -apple-system, "Segoe UI", sans-serif'; let yy = y + 128; for (const tx of (qd.top || []).slice(0, 3)) { g.fillStyle = '#9c6b3c'; g.fillRect(x + 22, yy - 12, 7, 7); g.fillStyle = '#3a2c1c'; yy += wrap(g, tx, x + 38, yy, 324, 23, 2) * 23 + 6; if (yy > y + 240) break; } });
    T.t.needsUpdate = true;
  }
  function drawCartSign(c) {
    const key = c.n + '|' + c.sample; if (key === cKey) return; cKey = key; const g = T.g, x = 1536, y = 640;
    g.clearRect(x, y, 512, 256); g.fillStyle = 'rgba(29,25,20,0.9)'; g.strokeStyle = GOLD; g.lineWidth = 4; panel(g, x + 8, y + 40, 496, 150, 22);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#e0b060'; g.font = '600 40px Georgia, serif'; g.fillText('The cart', x + 256, y + 92);
    g.fillStyle = '#f3ece0'; g.font = '600 30px -apple-system, "Segoe UI", sans-serif'; g.fillText(c.n + ' commit' + (c.n === 1 ? '' : 's') + ' today' + (c.n > c.shown ? ' (' + c.shown + ' shown)' : '') + (c.sample ? ' · example' : ''), x + 256, y + 150);
    T.t.needsUpdate = true;
  }
  drawQueue(null);
  const tagKey = new Array(NT).fill('');
  function drawTag(i, text, st) {
    const key = text + '|' + st; if (tagKey[i] === key) return; tagKey[i] = key;
    const g = T.g, x = (i % 8) * TW, y = Math.floor(i / 8) * TH; g.clearRect(x, y, TW, TH);
    if (!text) { T.t.needsUpdate = true; return; }
    g.fillStyle = 'rgba(38,33,27,0.92)'; g.strokeStyle = st === 'failed' ? LAMP.failed : BRONZE; g.lineWidth = 3; panel(g, x + 3, y + 5, TW - 6, TH - 10, 12);
    g.fillStyle = '#f3ece0'; g.font = '600 28px -apple-system, "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let t = String(text); while (t.length > 3 && g.measureText(t).width > TW - 22) t = t.slice(0, -1); g.fillText(t, x + TW / 2, y + TH / 2 + 1);
    T.t.needsUpdate = true;
  }

  // ---- the camp's atlas: for each builder a banner (name, job, status) and a parchment scroll that cycles its latest commit messages: ONE mesh
  const CA = atlas(2048, 1024), campG = quads(NC), campM = new THREE.Mesh(campG, flat(CA.t)); campM.frustumCulled = false; campM.renderOrder = 5; scene.add(campM);
  CAMP_SPOTS.forEach((_, j) => { const cx = (j % 4) * BW, cy = Math.floor(j / 4) * BH; setUV(campG, j, cx / 2048, 1 - (cy + BH) / 1024, (cx + BW) / 2048, 1 - cy / 1024); });
  let camp = []; const campKey = CAMP_SPOTS.map(() => '');
  function drawCamp(j, line) {
    const b = camp[j], key = b ? b.name + '|' + b.status + '|' + line + '|' + b.mins : '-';
    if (campKey[j] === key) return; campKey[j] = key;
    const g = CA.g, x = (j % 4) * BW, y = Math.floor(j / 4) * BH; g.clearRect(x, y, BW, BH);
    if (!b) { CA.t.needsUpdate = true; return; }
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = '#7a4a2c'; g.strokeStyle = GOLD; g.lineWidth = 4; panel(g, x + 6, y + 6, BW - 12, 92, 14);                       // the banner
    g.fillStyle = '#f6ecd6'; g.font = '600 36px Georgia, serif'; let nm = b.name; while (nm.length > 4 && g.measureText(nm).width > BW - 190) nm = nm.slice(0, -1); g.fillText(nm, x + 24, y + 48);
    g.fillStyle = BUILD[b.status]; g.beginPath(); g.arc(x + BW - 150, y + 37, 9, 0, 6.3); g.fill(); g.fillStyle = '#f6ecd6'; g.font = '700 24px -apple-system, "Segoe UI", sans-serif'; g.fillText(BWORD[b.status], x + BW - 134, y + 46);
    g.fillStyle = '#ecd9b4'; g.font = '500 22px -apple-system, "Segoe UI", sans-serif'; let jb = b.job; while (jb.length > 4 && g.measureText(jb).width > BW - 48) jb = jb.slice(0, -2); g.fillText(jb === b.job ? jb : jb + '…', x + 24, y + 82);
    g.fillStyle = '#eadcbc'; g.strokeStyle = '#9c6b3c'; g.lineWidth = 3; panel(g, x + 18, y + 106, BW - 36, 140, 10);                 // the scroll
    g.fillStyle = '#9c6b3c'; g.fillRect(x + 10, y + 102, BW - 20, 8); g.fillRect(x + 10, y + 242, BW - 20, 8);
    g.fillStyle = '#3a2c1c'; g.font = '600 28px -apple-system, "Segoe UI", sans-serif'; wrap(g, line, x + 34, y + 148, BW - 68, 34, 2);
    g.fillStyle = '#7a5631'; g.font = '500 22px -apple-system, "Segoe UI", sans-serif'; g.fillText((b.sample ? 'example · ' : '') + (b.status === 'job' ? 'no live activity' : b.mins == null ? '' : 'last commit ' + (b.mins < 90 ? b.mins + ' min ago' : Math.round(b.mins / 60) + ' h ago')), x + 34, y + 228);
    CA.t.needsUpdate = true;
  }

  // ---- three wall boards: the Learning board and "what changed our mind" (Library), the research pipeline (Research hall)
  const mkBoard = (b, cw, ch) => { const C = atlas(cw, ch), m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: C.t, fog: false, toneMapped: false })); m.position.set(b.x, b.y, b.z); m.rotation.y = b.ry; scene.add(m); return { C, m, cw, ch }; };
  const bLearn = mkBoard(BOARDS.board, 1024, 568), bFlip = mkBoard(BOARDS.changed, 1024, 568), bPipe = mkBoard(BOARDS.pipe, 1536, 434);
  function boardHead(B, title, sub) { const g = B.C.g; g.fillStyle = '#1d1914'; g.fillRect(0, 0, B.cw, B.ch); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = GOLD; g.font = '600 46px Georgia, serif'; g.fillText(title, 34, 64); g.fillRect(34, 78, 130, 3);
    if (sub) { g.fillStyle = '#9a8f7d'; g.font = '500 24px -apple-system, "Segoe UI", sans-serif'; g.textAlign = 'right'; g.fillText(sub, B.cw - 34, 60); g.textAlign = 'left'; } return g; }
  function drawLearn(bd) {
    const L = bd ? (bd.week && bd.week.length ? bd.week : bd.top || []) : [], g = boardHead(bLearn, 'Learning board', bd && bd.week && bd.week.length ? 'top lessons of the week' : L.length ? 'strongest lessons' : ''); let y = 126;
    if (!L.length) { g.fillStyle = '#cfc4b2'; g.font = '500 28px -apple-system, sans-serif'; g.fillText('No lessons are written down yet.', 34, y); }
    for (const l of L.slice(0, 4)) {
      if (y > bLearn.ch - 70) break;
      g.fillStyle = '#e0b060'; g.font = '600 24px -apple-system, "Segoe UI", sans-serif'; g.fillText(l.cat + '  ·  ' + (l.d || 'undated') + '  ·  ' + l.strength + (l.strength === 1 ? ' file' : ' files agree') + (l.sample ? '  ·  example' : ''), 34, y);
      g.fillStyle = '#f3ece0'; g.font = '500 28px -apple-system, "Segoe UI", sans-serif'; const n = wrap(g, l.text, 34, y + 34, bLearn.cw - 68, 33, 2); y += 34 + n * 33 + 26;
    }
    bLearn.C.t.needsUpdate = true;
  }
  function drawFlip(bd) {
    const L = bd ? bd.changed || [] : [], g = boardHead(bFlip, 'What changed our mind', L.length ? 'beliefs that did not hold' : ''); let y = 126;
    if (!L.length) { g.fillStyle = '#cfc4b2'; g.font = '500 28px -apple-system, sans-serif'; g.fillText('Nothing has overturned an earlier belief yet.', 34, y); }
    for (const c of L.slice(0, 3)) {
      if (y > bFlip.ch - 70) break;
      g.fillStyle = '#c96a4a'; g.font = '600 24px -apple-system, "Segoe UI", sans-serif'; g.fillText(c.cat + '  ·  ' + (c.d || 'undated') + (c.sample ? '  ·  example' : ''), 34, y);
      g.fillStyle = '#f3ece0'; g.font = '500 28px -apple-system, "Segoe UI", sans-serif'; const n = wrap(g, c.text, 34, y + 34, bFlip.cw - 68, 33, 3); y += 34 + n * 33 + 26;
    }
    bFlip.C.t.needsUpdate = true;
  }
  function drawPipe(pp) {
    const g = boardHead(bPipe, 'Research pipeline', pp && pp.ok ? 'idea  →  testing  →  verdict' + (pp.sample ? '  ·  example' : '') : ''), W = bPipe.cw;
    if (!pp || !pp.ok) { g.fillStyle = '#cfc4b2'; g.font = '500 28px -apple-system, sans-serif'; g.fillText('No pipeline counts are published yet.', 34, 130); bPipe.C.t.needsUpdate = true; return; }
    const tone = { ideas: GOLD, testing: '#4b7a99', adopted: '#8fa05a', rejected: '#c96a4a' }, cw = (W - 68 - 3 * 28) / 4;
    pp.lanes.forEach((l, i) => { const x = 34 + i * (cw + 28); g.fillStyle = '#26211b'; g.strokeStyle = tone[l.id]; g.lineWidth = 3; panel(g, x, 104, cw, 112, 14);
      g.fillStyle = tone[l.id]; g.font = '600 28px Georgia, serif'; g.textAlign = 'left'; g.fillText(l.label, x + 18, 142); g.fillStyle = '#f3ece0'; g.font = '700 52px -apple-system, "Segoe UI", sans-serif'; g.fillText(l.n.toLocaleString('en-US'), x + 18, 198);
      if (i < 3) { g.fillStyle = '#9a8f7d'; g.font = '600 30px sans-serif'; g.fillText(i === 0 ? '→' : i === 1 ? '→' : '·', x + cw + 2, 170); } });
    let y = 258; const fams = pp.families.slice(0, 5), bw = W - 68 - 330;
    for (const f of fams) { g.fillStyle = '#cfc4b2'; g.font = '500 24px -apple-system, "Segoe UI", sans-serif'; g.textAlign = 'left'; g.fillText(f.name + '  ' + f.runs, 34, y + 20);
      let x = 34 + 330; g.fillStyle = tone.adopted; g.fillRect(x, y, Math.max(f.adopted ? 3 : 0, bw * f.pa), 22); x += bw * f.pa; g.fillStyle = tone.rejected; g.fillRect(x, y, bw * f.pr, 22); x += bw * f.pr; g.fillStyle = tone.testing; g.fillRect(x, y, bw * f.po, 22); y += 34; }
    bPipe.C.t.needsUpdate = true;
  }
  drawLearn(null); drawFlip(null); drawPipe(null);

  // ---- state
  let driver = null, driverInput = false;     // SCENE DIRECTION HOOK (direct.js): when set, the director places the camera in walk mode and owns the taps
  let workers = [], cam = { x: START.x, z: START.z, yaw: START.yaw, pitch: -0.06 }, yawT = cam.yaw, pitchT = cam.pitch, mv = { fwd: 0, side: 0 }, mvT = { fwd: 0, side: 0 }, mode = 'walk', following = null, t = 0, tourT = 0;
  const ray = new THREE.Raycaster(), ang = S.map((_, i) => i * 1.7).concat(CAMP_SPOTS.map((_, j) => j * 2.3)), COLL = S.concat(CAMP_SPOTS, CAMP_SPOTS.map((c) => ({ x: c.x, z: c.z - 2.1 })), [{ x: L.CART.x, z: L.CART.z }]), hot = {}, cratePos = new Float32Array(N * MAXC * 3);
  const pos = () => ({ x: cam.x, z: cam.z, yaw: cam.yaw, following, mode, hall: hallOf(mode === 'tour' ? { x: camera.position.x, z: camera.position.z } : cam).id });
  const nCrates = (w) => Math.max(0, Math.min(MAXC, w && w.crates ? w.crates.length : 0));
  // an arm: a cylinder from the shoulder, swung forward by `a` radians (0 = hanging down, 1.57 = straight ahead) and outward by `out`; returns the hand position
  // ---- A PERSON (the look of docs/PERSONA_API.md, our own instanced version): a friendly cartoon character with a big round head, dot eyes that blink, a cap of hair, a short rounded
  // body in a coloured tunic, mitten hands and feet. Every part is an instance of the shared batches. A person does its job, waves when you come near, turns to face you and talks
  // while you chat with it (a soft marble disc on the floor marks it: no glow), cheers when its work is merged and slumps when its run failed.
  const hand = { x: 0, y: 0, z: 0 }, AXY = new THREE.Vector3(0, 1, 0), qT = new THREE.Quaternion(), thA = new Float32Array(N + NC), nearT = new Float32Array(N + NC).fill(-99), wasNear = new Uint8Array(N + NC);
  const stepS = new Int8Array(N + NC), dropS = new Uint8Array(NC);
  const reactT = new Float32Array(N + NC).fill(-99), reactP = new Array(N + NC).fill(''), lookT = new Float32Array(N + NC).fill(-99), holdT = new Float32Array(N + NC).fill(-99);
  // where everyone is now (the schedule moves them), and what they are doing: read by posOf(), the bubbles, the follow camera and the LOD figures
  const hallK = S.map((s, i) => S.filter((x, j) => j < i && x.hall === s.hall).length), hallN = S.map((s) => S.filter((x) => x.hall === s.hall).length);
  const homeAt = S.map((s) => ({ x: s.x, z: s.z - 0.12 })).concat(CAMP_SPOTS.map((c) => ({ x: c.x, z: c.z - 1.9 })));
  const at = homeAt.map((p) => ({ x: p.x, z: p.z, act: 'work', pose: '', away: false }));
  let clockMs = null, standAt = null, standHall = null, gatherAt = null, gatherHall = null, gatherLen = L.REACT.big, lastHall = '', leadKey = '', sod = 0, sodBase = null, tBase = 0;
  const nowMs = () => (clockMs != null ? clockMs + (t - tBase) * 1000 * (clockRun ? 1 : 0) : Date.now());
  let clockRun = false;
  let oX = 0, oZ = 0, cT = 1, sT = 0, focusKey = '';
  for (let j = 0; j < NC; j++) thA[N + j] = Math.PI;
  const pl = (im, slot, lx, ly, lz, sx, sy, sz, rx, ry, rz) => { EU.set(rx || 0, ry || 0, rz || 0, 'XYZ'); Q.setFromEuler(EU).premultiply(qT); M4.compose(P.set(oX + lx * cT + lz * sT, ly, oZ - lx * sT + lz * cT), Q, SC.set(sx, sy, sz)); im.setMatrixAt(slot, M4); };
  const gone = (im, j) => put(im, j, 0, -9, 0, 0.001, 0.001, 0.001);
  // when the shared people kit's 3D module is there (olympus/people3d.js, optional), each person takes the colours of its own spec(id): the same character as in the chat. Without it the seeded look above stays.
  let specFn = null;
  function dress() {
    if (!specFn) return;
    const paint = (i, id) => { try { const sp = id && specFn(id); if (!sp) return; const ok = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
      if (ok(sp.outfit)) { for (let q = 0; q < 3; q++) fig.im.setColorAt(i * 3 + q, colour.set(sp.outfit)); head.im.setColorAt(i * HS + 6, colour.set(sp.outfit)); }
      if (ok(sp.skin)) [0, 4, 5].forEach((q) => head.im.setColorAt(i * HS + q, colour.set(sp.skin))); if (ok(sp.hair)) head.im.setColorAt(i * HS + 1, colour.set(sp.hair)); } catch (_) { /* its seeded look stays */ } };
    S.forEach((st, i) => paint(i, personId(st.id))); camp.forEach((b, j) => { if (b) paint(N + j, builderIds(b.branch)[0]); });
    fig.im.instanceColor.needsUpdate = true; head.im.instanceColor.needsUpdate = true;
  }
  import('../olympus/people3d.js').then((m) => { specFn = m && typeof m.spec === 'function' ? m.spec : null; P3 = m && typeof m.figure === 'function' && typeof m.spec === 'function' && !o.noFull ? m : null; if (P3 && typeof P3.play === 'function' && !full.size) perFig = 2; /* a v2 figure is 2 draws (measured again once one is up) */ dress(); }).catch(() => { /* optional */ });
  function hideActor(i) { for (let q = 0; q < 3; q++) { gone(fig.im, i * 3 + q); gone(dBox.im, i * 3 + q); gone(dCyl.im, i * 3 + q); } for (let q = 0; q < HS; q++) gone(head.im, i * HS + q); }
  // an arm from the shoulder (local x = sxl), swung forward by `a` (0 hangs down, 1.57 straight ahead, 3 overhead) and outward by `out`, ending in a mitten hand
  function arm(i, side, sy, a, out) {
    const AL = 0.4, sxl = side * 0.23, dx = Math.sin(out), dy = -Math.cos(a) * Math.cos(out), dz = Math.sin(a) * Math.cos(out);
    pl(fig.im, i * 3 + (side > 0 ? 1 : 2), sxl + dx * AL / 2, sy + dy * AL / 2, 0.02 + dz * AL / 2, 0.055, AL, 0.055, -a, 0, out);
    hand.x = sxl + dx * AL; hand.y = sy + dy * AL; hand.z = 0.02 + dz * AL;
    pl(head.im, i * HS + (side > 0 ? 4 : 5), hand.x, hand.y, hand.z, 0.07, 0.07, 0.07);
  }
  // what the schedule says this person is doing right now (life.js): set by the caller before actor(). AW = away from its station, HX/HZ = its station.
  let AC = 'work', AW = false, HX = 0, HZ = 0, HT = 0, CARRY = -1;
  const ACT_POSE = { walk: 'walk', carry: 'carry', drop: 'idle', board: 'idle', standup: 'idle', speak: 'speak', cheer: 'cheer' };
  function actor(i, job, fx, fz, yb, th0, pz, k, mood, key, dt, camP) {
    const a = ang[i], b3 = i * 3, h0 = i * HS, dC = Math.hypot(camP.x - fx, camP.z - fz), talking = focusKey === key && AC !== 'walk', close = mode === 'walk' && dC < 3.4;
    if (close && !wasNear[i]) { nearT[i] = t; if (mot) L.presenceAt(specFn ? specFn(key) : { kind: 'builder' }, { x: fx, y: 0.9, z: fz }, camera, { k: 0.4 }); } wasNear[i] = close ? 1 : 0;      // QA6: they notice you: their things jingle softly
    const re = reactT[i] > t ? reactP[i] : '';
    const pose = talking ? 'talk' : re || (close && t - nearT[i] < 2.6 ? 'wave' : lookT[i] > t && AC !== 'walk' && AC !== 'carry' ? 'look' : ACT_POSE[AC] || mood || (AW ? 'idle' : ''));
    // a person away from its station leaves its furniture there at rest (the wheel, the scales, the gold on the anvil); what it holds in its hand goes with it
    if (AW) { oX = HX; oZ = HZ; cT = Math.cos(HT); sT = Math.sin(HT); qT.setFromAxisAngle(AXY, HT); jobProps(i, job, yb, pz, a, 0, yb + 0.66); if (job === 'smith' || job === 'scribe') gone(dCyl.im, b3); if (job === 'smith') gone(dBox.im, b3); }
    // turn: toward you while waving, talking or looking up as you come in, toward where it walks or works otherwise (eased; reduced motion turns at once)
    let want = pose === 'talk' || pose === 'wave' || pose === 'look' ? Math.atan2(camP.x - fx, camP.z - fz) : th0, dth = want - thA[i]; while (dth > Math.PI) dth -= Math.PI * 2; while (dth < -Math.PI) dth += Math.PI * 2;
    thA[i] = reduced ? want : thA[i] + dth * Math.min(1, dt * (pose === 'walk' || pose === 'carry' ? 9 : 6));
    oX = fx; oZ = fz; cT = Math.cos(thA[i]); sT = Math.sin(thA[i]); qT.setFromAxisAngle(AXY, thA[i]);
    const moving = pose === 'walk' || pose === 'carry', stride = moving && mot ? Math.sin(t * 7.5 + i) : 0;
    if (moving && mot) { const sg = stride > 0 ? 1 : -1; if (sg !== stepS[i]) { stepS[i] = sg; if (dC < 7 && mode !== 'tour') L.stepAt(key, specFn ? specFn(key) : { kind: 'builder' }, { x: fx, y: 0, z: fz }, camera, { surface: i >= N ? 'sand' : 'stone', k: 0.45 }); } }   // footsteps near you (QA6: OLYMPUS_SFX.walker, with their things answering)
    const live = k > 0 || pose !== '' , bob = mot * (pose === 'cheer' ? Math.abs(Math.sin(t * 3 + i)) * 0.07 : moving ? Math.abs(stride) * 0.035 : live ? 0.012 * Math.sin(a * 2.1 + t * 1.3) : 0.006 * Math.sin(t * 1.1 + i));
    const sl = pose === 'slump' ? 1 : 0, y = yb + bob, shY = y + 0.66 - sl * 0.04, hy = y + 1.0 - sl * 0.07 + (pose === 'talk' || pose === 'speak' ? 0.012 * Math.sin(t * 5) * mot : 0), hz = sl * 0.07;
    pl(fig.im, b3, 0, y + 0.3, 0, 0.23, 0.5, 0.21);                                                                 // the tunic
    pl(head.im, h0 + 6, 0, y + 0.58, 0, 0.235 + 0.006 * Math.sin(t * 1.6 + i) * mot, 0.19, 0.2);                    // rounded shoulders (it breathes)
    pl(head.im, h0, 0, hy, hz, 0.25, 0.24, 0.245, sl * 0.3, 0, 0);                                                  // the big round head
    pl(head.im, h0 + 1, 0, hy + 0.055, hz - 0.05, 0.262, 0.235, 0.25, sl * 0.3, 0, 0);                              // hair
    const blink = mot && ((t * 0.31 + i * 0.37) % 1) < 0.035 ? 0.006 : 0.042, look = pose === 'talk' || pose === 'wave' || pose === 'look' ? 0 : Math.sin(t * 0.5 + i * 2.1) * 0.02 * mot;
    pl(head.im, h0 + 2, 0.085 + look, hy + 0.015 - sl * 0.02, hz + 0.228, 0.03, sl ? 0.012 : blink, 0.02); pl(head.im, h0 + 3, -0.085 + look, hy + 0.015 - sl * 0.02, hz + 0.228, 0.03, sl ? 0.012 : blink, 0.02);
    pl(head.im, h0 + 7, 0.1, yb + 0.04 + Math.max(0, stride) * 0.05, 0.05 + stride * 0.11, 0.085, 0.05, 0.13); pl(head.im, h0 + 8, -0.1, yb + 0.04 + Math.max(0, -stride) * 0.05, 0.05 - stride * 0.11, 0.085, 0.05, 0.13);   // feet (they step when it walks)
    const toolsOff = () => { if (AW) return; for (let q = 0; q < 3; q++) { gone(dBox.im, b3 + q); gone(dCyl.im, b3 + q); } };
    if (CARRY >= 0) { if (pose === 'carry') pl(crate.im, CARRY, 0, y + 0.5, 0.34, 0.27, 0.25, 0.27); else gone(crate.im, CARRY); }
    if (pose === 'talk' || pose === 'speak') { arm(i, 1, shY, 1.15 + 0.28 * Math.sin(t * 3.1) * mot, 0.25); arm(i, -1, shY, 0.5 + 0.12 * Math.sin(t * 2.3 + 1) * mot, -0.2); toolsOff(); return pose; }
    if (pose === 'wave') { arm(i, 1, shY, 2.75, 0.45 + 0.4 * Math.sin(t * 8) * mot); arm(i, -1, shY, 0.2, -0.15); toolsOff(); return pose; }
    if (pose === 'cheer') { arm(i, 1, shY, 2.8, 0.45 + 0.1 * Math.sin(t * 6) * mot); arm(i, -1, shY, 2.8, -0.45 - 0.1 * Math.sin(t * 6) * mot); toolsOff(); return pose; }
    if (pose === 'slump') { arm(i, 1, shY, 0.08, 0.1); arm(i, -1, shY, 0.08, -0.1); toolsOff(); return pose; }
    if (pose === 'walk') { arm(i, 1, shY, 0.45 * stride, 0.08); arm(i, -1, shY, -0.45 * stride, -0.08); toolsOff(); return pose; }
    if (pose === 'carry') { arm(i, 1, shY, 1.2, -0.12); arm(i, -1, shY, 1.2, 0.12); toolsOff(); return pose; }
    if (pose === 'idle' || pose === 'look') { arm(i, 1, shY, 0.12 + 0.04 * Math.sin(t * 1.3 + i) * mot, 0.12); arm(i, -1, shY, 0.12, -0.12); toolsOff(); return pose; }
    jobProps(i, job, yb, pz, a, k, shY);
    return job;
  }
  // the job itself at the station: the arms work the tool, the furniture moves (k = how briskly; 0 = at rest)
  function jobProps(i, job, ty, pz, a, k, shY) {
    const b3 = i * 3;
    if (job === 'wheel') {
      const sp = a * 2.2, wy = ty + 0.56, wx = 0.62, wz = pz + 0.06;
      pl(dCyl.im, b3, wx, wy, wz, 0.36, 0.05, 0.36, Math.PI / 2, sp, 0);
      pl(dBox.im, b3, wx, wy, wz + 0.035, 0.7, 0.05, 0.03, 0, 0, sp); pl(dBox.im, b3 + 1, wx, wy, wz + 0.035, 0.7, 0.05, 0.03, 0, 0, sp + Math.PI / 2);
      pl(dBox.im, b3 + 2, wx + Math.cos(sp) * 0.3, wy + Math.sin(sp) * 0.3, wz + 0.09, 0.07, 0.07, 0.12);
      if (!AW) { arm(i, 1, shY, 1.5 + Math.sin(sp) * 0.3, 0.75 + Math.cos(sp) * 0.2); arm(i, -1, shY, 0.35, -0.1); }
      gone(dCyl.im, b3 + 1); gone(dCyl.im, b3 + 2);
    } else if (job === 'scribe') {
      const wr = Math.sin(a * 5) * 0.16, dip = Math.sin(a * 10) * 0.03;
      if (!AW) { arm(i, 1, shY, 1.5 + dip, -0.2 + wr); pl(dCyl.im, b3, hand.x, hand.y + 0.06, hand.z + 0.04, 0.012, 0.24, 0.012, -0.5, 0, 0.3); arm(i, -1, shY, 1.45, 0.2); }
      gone(dCyl.im, b3 + 1); gone(dCyl.im, b3 + 2); gone(dBox.im, b3); gone(dBox.im, b3 + 1); gone(dBox.im, b3 + 2);
    } else if (job === 'oracle') {
      const sw = Math.sin(a * 1.4) * 0.22;
      if (!AW) { arm(i, 1, shY, 2.3 + sw, 0.45); arm(i, -1, shY, 2.3 - sw, -0.45); }
      const fl = 0.07 + 0.025 * Math.sin(a * 6) * (k ? 1 : 0);
      if (k <= 0 && !AW) gone(dBox.im, b3 + 2); else pl(dBox.im, b3 + 2, 0, ty + 0.76 + fl, pz, fl, fl * 1.6, fl, 0, a * 1.5, 0.78);
      gone(dBox.im, b3); gone(dBox.im, b3 + 1); gone(dCyl.im, b3); gone(dCyl.im, b3 + 1); gone(dCyl.im, b3 + 2);
    } else if (job === 'smith') {
      if (!AW) {
        const c = Math.cos(a * 4), up = 1.6 + 0.45 * Math.max(-1, Math.min(1, c * 1.6));        // a quick blow, a slower lift
        arm(i, 1, shY, up, 0.05);
        const ha = Math.PI - (up + 1.2), hdy = Math.cos(ha), hdz = Math.sin(ha);                    // the hammer carries on past the hand, bent forward of the forearm
        pl(dCyl.im, b3, hand.x, hand.y + hdy * 0.16, hand.z + hdz * 0.16, 0.02, 0.34, 0.02, ha, 0, 0);
        pl(dBox.im, b3, hand.x, hand.y + hdy * 0.32, hand.z + hdz * 0.32, 0.2, 0.11, 0.11, ha, 0, 0);
        arm(i, -1, shY, 1.3, 0.12);
      }
      pl(dBox.im, b3 + 2, -0.12, ty + 0.57, pz, 0.22, 0.03, 0.08);                                 // the gold piece on the anvil
      gone(dBox.im, b3 + 1); gone(dCyl.im, b3 + 1); gone(dCyl.im, b3 + 2);
    } else {
      const tilt = Math.sin(a * 1.3) * 0.2 * (k ? 1 : 0), by = ty + 0.86, c = Math.cos(tilt), sn = Math.sin(tilt);
      pl(dBox.im, b3, 0, by, pz, 0.92, 0.035, 0.045, 0, 0, tilt);
      pl(dCyl.im, b3, -0.45 * c, by - 0.45 * sn - 0.24, pz, 0.15, 0.025, 0.15); pl(dCyl.im, b3 + 1, 0.45 * c, by + 0.45 * sn - 0.24, pz, 0.15, 0.025, 0.15);
      pl(dBox.im, b3 + 1, -0.45 * c, by - 0.45 * sn - 0.12, pz, 0.012, 0.24, 0.012); pl(dBox.im, b3 + 2, 0.45 * c, by + 0.45 * sn - 0.12, pz, 0.012, 0.24, 0.012);
      if (!AW) { arm(i, 1, shY, 1.35 + sn * 0.5, 0.3); arm(i, -1, shY, 1.35 - sn * 0.5, -0.3); }
      gone(dCyl.im, b3 + 2);
    }
  }
  // RETURN / LEAD: a person away from its station walks back at a calm pace (after a chat, or "show me your work": then the camera follows behind it)
  const ret = new Array(N + NC).fill(null);
  function leadStep(i) {
    const h = homeAt[i], r = ret[i], d = Math.hypot(h.x - r.x, h.z - r.z), w = Math.max(0.6, d / L.SPEED), u = reduced ? 1 : (t - r.t0) / w;
    if (u >= 1) { ret[i] = null; holdT[i] = t + 90; if (leadKey === keyOf(i)) leadKey = ''; return { x: h.x, z: h.z, yaw: null, act: 'work', away: false }; }
    const f = L.smooth(u); return { x: r.x + (h.x - r.x) * f, z: r.z + (h.z - r.z) * f, yaw: Math.atan2(h.x - r.x, h.z - r.z), act: 'walk', away: true };
  }
  const keyOf = (i) => (i < N ? 'w:' + S[i].id : camp[i - N] ? 'b:' + camp[i - N].id : '');
  const indexOf = (key) => { for (let i = 0; i < N + NC; i++) if (keyOf(i) === key) return i; return -1; };
  /** nobody jumps: when the schedule's spot is further than a brisk step away (a chat ended, the clock moved), the person walks there first */
  function catchUp(i, sc0, dt) {
    if (reduced || t < 0.4) return; const dx = sc0.x - at[i].x, dz = sc0.z - at[i].z, dd = Math.hypot(dx, dz), mx = Math.max(0.004, dt * L.SPEED * 1.7);
    if (dd <= mx || dd > 60) return; sc0.x = at[i].x + (dx / dd) * mx; sc0.z = at[i].z + (dz / dd) * mx; sc0.yaw = Math.atan2(dx, dz); sc0.act = 'walk'; sc0.away = true;
  }
  function sendHome(i) { if (i < 0 || !at[i]) return false; if (!at[i].away) { holdT[i] = t + 90; return false; } ret[i] = { x: at[i].x, z: at[i].z, t0: t }; return true; }
  // SPARKS: each hammer blow near you throws sparks off the anvil (fx.burst, else the classic sparkleBurst) with a clank placed in the world (OLYMPUS.sound.at). Optional kits.
  const sparkT = new Float32Array(N).fill(-9), V3 = new THREE.Vector3();
  const life = { sparks: 0, bursts: 0, reacts: [], sounds: 0 };
  let cine = null;                                                                     // the cinema kit (FX HOOK below), once it has loaded
  function screenOf(x, y, z) { V3.set(x, y, z).project(camera); if (V3.z > 1 || Math.abs(V3.x) > 1.05 || Math.abs(V3.y) > 1.05) return null; const r = canvas.getBoundingClientRect(); return { x: r.left + (V3.x * 0.5 + 0.5) * r.width, y: r.top + (-V3.y * 0.5 + 0.5) * r.height }; }
  function spark(i, s, camP) {
    if (!mot || mode === 'tour' || t - sparkT[i] < 0.6) return; if (Math.hypot(camP.x - s.x, camP.z - s.z) > 8) return;
    const wx = s.x - 0.12, wy = Y0 + 0.6, wz = s.z + 0.5, sc = screenOf(wx, wy, wz); if (!sc) return; sparkT[i] = t; life.sparks++;
    if (cine) { cine.burst('sparks', [wx, wy, wz], { count: 12 }); life.bursts++; } else if (L.burst('sparks', sc, [wx, wy, wz])) life.bursts++;   // in the world when the cinema kit is there if (L.soundAt('clank', { x: wx, y: wy, z: wz }, null, camera)) life.sounds++;
  }
  // FULL FIGURES near you (LOD): the far crowd is the instanced toy above; the 1-2 people closest to you are the shared figures of olympus/people3d.js
  // (v2: play(fig, pose) with the work poses, lookAt, setExpression; v1: userData.pose / lookAt / tick). How many is MEASURED: the frame's draw calls without
  // any full figure, the budget (45 on high), and the meshes one figure costs. Without the module, or over the budget, everyone stays instanced.
  let P3 = null; const full = new Map(); let lodCap = 0, baseCalls = 0, perFig = 7, lodT = 0, lodFail = false;
  const CALLS_MAX = o.callsMax || 45, NEAR_MAX = 2, NEAR_R = 4.6;
  const V1_POSES = ['idle', 'wave', 'talk', 'cheer', 'slump', 'nod', 'shrug'];
  function figPose(F, pose, job) {
    const fg = F.fig, v2 = P3 && typeof P3.play === 'function', want = pose === 'talk' || pose === 'speak' ? 'talk' : pose === 'wave' ? 'wave' : pose === 'cheer' ? 'cheer' : pose === 'slump' ? 'slump'
      : pose === 'walk' ? 'walk' : pose === 'carry' ? 'carry' : pose === 'idle' || pose === 'look' ? 'idle' : L.WORK_POSE[job] || 'idle';
    if (F.pose === want) return; F.pose = want;
    try {
      if (v2) P3.play(fg, want);
      else if (fg.userData && fg.userData.pose) fg.userData.pose(V1_POSES.includes(want) ? want : 'idle');
      if (P3.setExpression) P3.setExpression(fg, want === 'cheer' || want === 'wave' ? 'happy' : want === 'slump' ? 'worried' : want === 'talk' ? 'happy' : L.WORK_POSE[job] === want ? 'thinking' : 'neutral', 1);
      if (P3.setTalking) P3.setTalking(fg, want === 'talk');
    } catch (_) { /* the figure keeps its last pose */ }
  }
  function lodFrame(dt, camP) {
    if (!P3 || typeof P3.figure !== 'function' || lodFail) return;
    lodT -= dt;
    if (lodT <= 0) {
      lodT = 0.3;
      if (!full.size) { const st = rc.stats(); if (st && st.calls) baseCalls = st.calls; }
      lodCap = Math.max(0, Math.min(NEAR_MAX, Math.floor((CALLS_MAX - 1 - baseCalls) / perFig)));
      const cands = [];
      const v2 = typeof P3.play === 'function';                    // without the v2 work poses a full figure only steps in for the person you talk to, or who stands right by you
      if (mode !== 'tour') for (let i = 0; i < N + NC; i++) { const key = keyOf(i); if (!key) continue; const d = key === focusKey ? 0 : Math.hypot(camP.x - at[i].x, camP.z - at[i].z); if (v2 || d <= 2.2) cands.push({ key, d }); }
      const want = L.nearSet(cands, lodCap, NEAR_R, [...full.keys()]);
      for (const [key, F] of full) if (!want.includes(key)) { try { F.fig.userData.dispose(); } catch (_) { scene.remove(F.fig); } full.delete(key); }
      for (const key of want) if (!full.has(key)) {
        const i = indexOf(key); if (i < 0) continue;
        try {
          const pid = i < N ? personId(S[i].id) : builderIds(camp[i - N].branch)[0] || 'builder:' + camp[i - N].id, fg = P3.figure(THREE, P3.spec(pid), { scale: 1.25 });
          let m = 0; fg.traverse((x) => { if (x.isMesh || x.isLineSegments) m++; }); perFig = m || 7;   // measured: v2 = 2 draws (body + ink line), v1 = 7
          scene.add(fg); full.set(key, { fig: fg, i, pose: '' });
        } catch (_) { lodFail = true; break; }
      }
    }
    for (const [key, F] of full) {
      const i = F.i, fg = F.fig, job = i < N ? S[i].job : CAMP_SPOTS[i - N].job, pose = at[i].pose;
      fg.position.set(at[i].x, i < N && !at[i].away ? Y0 : 0, at[i].z); fg.rotation.y = thA[i];
      figPose(F, pose, job);
      try {
        const lookC = pose === 'talk' || pose === 'wave' || pose === 'look';
        if (P3.lookAt) P3.lookAt(fg, lookC ? camP : null); else if (fg.userData.lookAt) fg.userData.lookAt(lookC ? camP : null);
        if (P3.animate) { if (mot) P3.animate(fg, dt); } else if (mot && fg.userData.tick) fg.userData.tick(dt, t);
      } catch (_) { /* it stands in its pose */ }
      // the instanced body of this person steps aside (its furniture and the crate it carries stay instanced)
      for (let q = 0; q < 3; q++) gone(fig.im, i * 3 + q); for (let q = 0; q < HS; q++) gone(head.im, i * HS + q);
      if (job === 'smith' || job === 'scribe') gone(dCyl.im, i * 3); if (job === 'smith') gone(dBox.im, i * 3);                       // what it holds is the figure's own
    }
  }
  // a camp builder: the same marble figure, facing north (toward the door you come from), writing or hammering at its table
  function campFrame(dt, camP) {
    const hide = (im, j) => put(im, j, 0, -9, 0, 0.001, 0.001, 0.001);
    CAMP_SPOTS.forEach((c, j) => {
      const b = camp[j], i = N + j, b3 = i * 3, st = b ? b.status : 'job', k = (st === 'working' ? 1 : st === 'quiet' ? 0.22 : 0) * mot;
      ang[i] += dt * k;
      if (!b) { hideActor(i); gone(crate.im, CARRY0 + j); for (let q = 0; q < PUFF; q++) hide(lamp.im, PUFF0 + j * PUFF + q); for (let q = 0; q < CSTACK; q++) hide(crate.im, CR0 + j * CSTACK + q); setQuad(campG, j, 0, -9, 0, 0, 0); return; }
      const keyB = 'b:' + b.id, sc0 = focusKey === keyB || holdT[i] > t ? { act: 'work', x: at[i].x, z: at[i].z, yaw: null, crate: false, away: at[i].away } : L.campAt(j, homeAt[i], st, sod, { reduced, gatherAt: gatherHall === 'camp' ? gatherAt : null, gatherLen, n: camp.filter(Boolean).length });
      if (ret[i]) { const lp = leadStep(i); sc0.x = lp.x; sc0.z = lp.z; sc0.yaw = lp.yaw; sc0.act = lp.act; sc0.away = lp.away; } else catchUp(i, sc0, dt);
      at[i].x = sc0.x; at[i].z = sc0.z; at[i].act = sc0.act; at[i].away = !!sc0.away;
      if (sc0.act === 'drop' && !dropS[j]) { dropS[j] = 1; if (Math.hypot(camP.x - sc0.x, camP.z - sc0.z) < 12 && mot) L.soundAt('crate', { x: L.CART.x, y: 0.8, z: L.CART.z }, null, camera, { k: 0.7 }); } else if (sc0.act !== 'drop') dropS[j] = 0;   // the crate lands on the cart
      AC = sc0.act; AW = !!sc0.away; HX = homeAt[i].x; HZ = homeAt[i].z; HT = Math.PI; CARRY = CARRY0 + j;
      at[i].pose = actor(i, c.job, sc0.x, sc0.z, 0, sc0.yaw == null ? Math.PI : sc0.yaw, 0.55, AW ? 0 : k, st === 'done' && sc0.act === 'cheer' ? 'cheer' : '', keyB, dt, camP);
      CARRY = -1; AC = 'work'; AW = false;
      // brazier smoke only while it is working; the ember glows then
      for (let q = 0; q < PUFF; q++) { const ph = ((t * 0.3 * (mot || 0) + q / PUFF + j * 0.37) % 1 + 1) % 1; if (st !== 'working') hide(lamp.im, PUFF0 + j * PUFF + q); else put(lamp.im, PUFF0 + j * PUFF + q, c.x + 1.15 + Math.sin(ph * 5 + j) * 0.18 * ph, 0.75 + ph * 2.0, c.z - 1.7, 0.05 + 0.11 * ph, 0.05 + 0.11 * ph, 0.05 + 0.11 * ph); }
      const eg = st === 'working' ? 1 + 0.15 * Math.sin(t * 7 + j) * mot : 0.8; put(lamp.im, EMBER0 + 1 + j, c.x + 1.15, 0.6, c.z - 1.7, 0.13 * eg, 0.09 * eg, 0.13 * eg);
      // its stack of crates = commits today
      for (let q = 0; q < CSTACK; q++) { if (q >= b.crates) hide(crate.im, CR0 + j * CSTACK + q); else put(crate.im, CR0 + j * CSTACK + q, c.x - 1.05 + (q % 3) * 0.3 + (q > 2 ? 0.15 : 0), 0.13 + (q > 2 ? 0.26 : 0), c.z - 2.5, 0.27, 0.25, 0.27, 0, (j + q) * 0.4, 0); }
      // the banner and the scroll, over the tent; the scroll moves on to the next commit message every few seconds
      const n = b.scroll.length, idx = mot ? Math.floor((t + j * 1.7) / 5.5) % n : 0; drawCamp(j, b.scroll[idx]);
      const d = Math.hypot(camP.x - c.x, camP.z - c.z), sc = (mode === 'tour' ? 1.15 : 1) * (0.62 + 0.38 * Math.min(1, d / 6.5));
      setQuad(campG, j, c.x, 2.85 + sc * 0.75 + (mot ? Math.sin(t * 0.9 + j) * 0.03 : 0), c.z - 0.9, 2.7 * sc, 1.35 * sc);
    });
    const fp = 1 + 0.1 * Math.sin(t * 6) * mot; put(lamp.im, EMBER0, CAMP.fire.x, 0.6, CAMP.fire.z, 0.26 * fp, 0.06 * fp, 0.26 * fp);      // a bed of coals, low in the bowl (the flames are fx-cine's)
    campG.attributes.position.needsUpdate = true;
  }
  function frame(dt) {
    t += dt;
    const camP = camera.position;
    sod = L.secOfDay(nowMs());
    // heads turn when you walk into a hall (or out to the camp)
    if (mode === 'walk') { const hn = hallOf(cam).id; if (hn !== lastHall) { if (lastHall) for (let i = 0; i < N + NC; i++) if ((i < N ? S[i].hall : 'camp') === hn) lookT[i] = t + 1.6 + (i % 4) * 0.15; lastHall = hn; } }
    S.forEach((s, i) => {
      const w = workers[i], st = w ? w.status : 'stale', isHot = (hot[s.id] || 0) > t, k = Math.max(PACE[st] || 0, isHot ? 1 : 0) * mot, key = 'w:' + s.id;
      const sc0 = focusKey === key || holdT[i] > t ? { act: at[i].away ? 'standup' : 'work', x: at[i].x, z: at[i].z, yaw: null, away: at[i].away }
        : L.scheduleAt({ i, hall: s.hall, home: homeAt[i], k: hallK[i], n: hallN[i] }, sod, { reduced, failed: st === 'failed', standupAt: standAt != null && (standHall == null || standHall === s.hall) ? standAt : null, gatherAt: gatherHall === s.hall ? gatherAt : null, gatherLen });
      if (ret[i]) { const lp = leadStep(i); sc0.x = lp.x; sc0.z = lp.z; sc0.yaw = lp.yaw; sc0.act = lp.act; sc0.away = lp.away; } else catchUp(i, sc0, dt);
      at[i].x = sc0.x; at[i].z = sc0.z; at[i].act = sc0.act; at[i].away = !!sc0.away; figAt[i].x = sc0.x; figAt[i].z = sc0.z;
      AC = sc0.act; AW = !!sc0.away; HX = homeAt[i].x; HZ = homeAt[i].z; HT = 0;
      const a0 = ang[i];
      ang[i] += dt * k;
      at[i].pose = actor(i, s.job, sc0.x, sc0.z, AW ? 0 : Y0, sc0.yaw == null ? 0 : sc0.yaw, 0.62, AW ? 0 : k, st === 'failed' ? 'slump' : '', key, dt, camP);
      AC = 'work'; AW = false;
      if (s.job === 'smith' && at[i].pose === 'smith' && k > 0 && L.hits(a0, ang[i])) spark(i, s, camP);
      const pulse = isHot && mot ? 1.25 + 0.2 * Math.sin(t * 6) : 1;
      put(lamp.im, i, s.x + 0.95, 1.78, s.z - 0.62, 0.15 * pulse, 0.15 * pulse, 0.15 * pulse);
      // the conveyor: crates drift left to right at the worker's pace; a stopped worker's belt stands still
      const n = nCrates(w), near = Math.hypot(camP.x - s.x, camP.z - s.z) < 10 || following === s.id;
      for (let c = 0; c < MAXC; c++) {
        const idx = i * MAXC + c;
        if (c >= n) { put(crate.im, idx, 0, -9, 0, 0.001, 0.001, 0.001); setQuad(tagG, idx, 0, -9, 0, 0, 0); cratePos[idx * 3 + 1] = -9; continue; }
        const fr = (((c / n) + ang[i] * 0.06) % 1 + 1) % 1, cx = s.x - 1.15 + fr * 2.3, cz = s.z + 1.75;
        put(crate.im, idx, cx, 0.3, cz, 0.3, 0.26, 0.3); cratePos[idx * 3] = cx; cratePos[idx * 3 + 1] = 0.3; cratePos[idx * 3 + 2] = cz;
        const td = Math.min(1, Math.hypot(camP.x - cx, camP.z - cz) / 4.5), ts = 0.45 + 0.55 * td;
        if (near) setQuad(tagG, idx, cx, 0.6 + (c % 2) * 0.17 * ts + 0.1 * ts, cz, 0.84 * ts, 0.21 * ts); else setQuad(tagG, idx, 0, -9, 0, 0, 0);
      }
    });
    [fig, head, dBox, dCyl, lamp, crate].forEach((b) => { b.im.instanceMatrix.needsUpdate = true; });
    const campLater = () => campFrame(dt, camP);
    // the camera: walking (eased joystick and look), following a worker, or the calm tour above the halls
    const rate = reduced ? 0 : 1;
    if (driver && driver(dt, mode)) { /* the scene director (direct.js) placed the camera: third person, collision-safe */ }
    else if (mode === 'tour') {
      tourT += dt * mot;
      const tc = tourCam(tourT, reduced), k = reduced ? 1 : Math.min(1, dt * 1.6);
      camP.x += (tc.x - camP.x) * k; camP.y += (tc.y - camP.y) * k; camP.z += (tc.z - camP.z) * k; camera.lookAt(tc.look.x, tc.look.y, tc.look.z);
    } else if (mode === 'follow' && following) {
      const i = following.slice(0, 2) === 'b:' ? indexOf(following) : S.findIndex((s) => s.id === following);
      if (i >= 0) { const fc = followCam({ x: at[i].x, z: at[i].z }, t, reduced), k = reduced ? 1 : Math.min(1, dt * 2.2);
        camP.x += (fc.x - camP.x) * k; camP.y += (fc.y - camP.y) * k; camP.z += (fc.z - camP.z) * k; camera.lookAt(fc.look.x, fc.look.y + 0.35, fc.look.z); }
    } else {
      mv.fwd = ease(mv.fwd, mvT.fwd, dt, rate * 9); mv.side = ease(mv.side, mvT.side, dt, rate * 9);
      if (Math.abs(mv.fwd) > 0.004 || Math.abs(mv.side) > 0.004) { const p = walk({ x: cam.x, z: cam.z }, cam.yaw, mv, dt, COLL); cam.x = p.x; cam.z = p.z; }
      cam.yaw = ease(cam.yaw, yawT, dt, rate * 18); cam.pitch = ease(cam.pitch, pitchT, dt, rate * 18);
      const k = reduced ? 1 : Math.min(1, dt * 7);
      camP.x += (cam.x - camP.x) * k; camP.y += (eye - camP.y) * k; camP.z += (cam.z - camP.z) * k;
      camera.rotation.order = 'YXZ'; camera.rotation.set(cam.pitch, cam.yaw, 0);
    }
    camera.aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // bubbles, tags and hall signs face the camera
    RT.setFromMatrixColumn(camera.matrixWorld, 0); UP.setFromMatrixColumn(camera.matrixWorld, 1);
    const big = mode === 'tour' ? 1.2 : 1;
    S.forEach((s, i) => { const d = Math.hypot(camP.x - s.x, camP.z - s.z), sc = big * (0.6 + 0.4 * Math.min(1, d / 6)); setQuad(bubG, i, figAt[i].x, Y0 + 1.95 + sc * 0.3, figAt[i].z, 2.5 * sc, 1.25 * sc); });
    const inHall = mode === 'tour' ? '' : hallOf({ x: camP.x, z: camP.z }).id;
    HALLS.forEach((h, k) => { if (h.id === inHall) setQuad(tagG, NT + k, 0, -9, 0, 0, 0); else setQuad(tagG, NT + k, (h.x0 + h.x1) / 2, mode === 'tour' ? 4.6 : 4.1, (h.z0 + h.z1) / 2, 3.4 * big, 0.85 * big); });
    campLater();
    { let fx = null, fz = 0, fy = 0; if (focusKey) { const si = S.findIndex((x) => 'w:' + x.id === focusKey), ci = camp.findIndex((b) => b && 'b:' + b.id === focusKey); if (si >= 0) { fx = at[si].x; fz = at[si].z; fy = at[si].away ? 0 : Y0; } else if (ci >= 0) { fx = at[N + ci].x; fz = at[N + ci].z; } }
      if (fx == null) gone(lamp.im, SPOT); else put(lamp.im, SPOT, fx, fy + 0.012, fz, 0.78, 0.008, 0.78); }
    lodFrame(dt, camP);
    { const dC = Math.hypot(camP.x - L.CART.x, camP.z - L.CART.z), sc = 0.6 + 0.4 * Math.min(1, dC / 6); if (camp.some(Boolean) && (dC < 16 || mode === 'tour')) setQuad(tagG, CSIGN, L.CART.x, 1.75 + sc * 0.3, L.CART.z, 2.0 * sc, 1.0 * sc); else setQuad(tagG, CSIGN, 0, -9, 0, 0, 0); }
    [fig, head, dBox, dCyl, lamp, crate].forEach((b) => { b.im.instanceMatrix.needsUpdate = true; });
    bubG.attributes.position.needsUpdate = true; tagG.attributes.position.needsUpdate = true;
    rc.render();
  }
  const snapCam = () => { camera.position.set(cam.x, eye, cam.z); };
  const moved = () => { if (typeof o.onMove === 'function') setTimeout(() => { try { o.onMove(); } catch (_) { /* the HUD catches up on its own timer */ } }, 0); };   // the page's HUD (Talk prompt, hall chip) updates at once
  const still = () => { if (reduced) frame(0.001); };
  const api = {
    ok: true, mode: '3d', rc,
    /** workers = the page's worker rows; extra = { board (week / top / changed), pipe } for the wall boards */
    set(ws, extra) {
      workers = S.map((s) => (ws || []).find((w) => w.id === s.id) || null);
      workers.forEach((w, i) => {
        drawBubble(i, w); lamp.im.setColorAt(i, colour.set(LAMP[w ? w.status : 'stale'] || LAMP.stale));
        for (let c = 0; c < MAXC; c++) { const cr = w && w.crates && w.crates[c]; drawTag(i * MAXC + c, cr ? cr.tag : '', w ? w.status : 'stale'); crate.im.setColorAt(i * MAXC + c, colour.set(w && w.status === 'failed' ? '#a8573d' : w && w.status === 'sample' ? '#a39a88' : '#b08a52')); }
      });
      if (lamp.im.instanceColor) lamp.im.instanceColor.needsUpdate = true; if (crate.im.instanceColor) crate.im.instanceColor.needsUpdate = true;
      if (extra) { drawLearn(extra.board || null); drawFlip(extra.board || null); drawPipe(extra.pipe || null); if (extra.camp) { camp = CAMP_SPOTS.map((_, j) => extra.camp[j] || null); lamp.im.setColorAt(EMBER0, colour.set('#c2561f'));
        camp.forEach((b, j) => { lamp.im.setColorAt(EMBER0 + 1 + j, colour.set(b && b.status === 'working' ? '#e8923a' : '#4a3a28')); for (let q = 0; q < CSTACK; q++) crate.im.setColorAt(CR0 + j * CSTACK + q, colour.set(q % 2 ? '#b08a52' : '#c49a5c')); }); lamp.im.instanceColor.needsUpdate = true; crate.im.instanceColor.needsUpdate = true; dress(); } }
      if (extra && extra.camp) { const cc = L.cartCount(camp.filter(Boolean)); cc.sample = camp.some((b) => b && b.sample); drawCartSign(cc); life.cart = cc;
        for (let q = 0; q < L.CART.cap; q++) { if (q >= cc.shown) put(crate.im, CART0 + q, 0, -9, 0, 0.001, 0.001, 0.001); else put(crate.im, CART0 + q, L.CART.x - 0.6 + (q % 4) * 0.4, 0.8 + Math.floor(q / 12) * 0.26, L.CART.z - 0.3 + (Math.floor(q / 4) % 3) * 0.3, 0.27, 0.25, 0.27, 0, (q * 0.7) % 0.5, 0); } }
      if (extra && 'queue' in extra) drawQueue(extra.queue);
      if (reduced) frame(0.016);
    },
    /** LIFE: freeze the clock at ms (run = let it tick on from there), or null for the real clock. Everyone's day follows it (life.js), so a fixed clock = a fixed scene. */
    clock(ms, run) { clockMs = ms == null ? null : +ms; clockRun = !!run; tBase = t; still(); return L.secOfDay(nowMs()); },
    /** call a stand-up now (hall id, or null = every hall): they walk to the middle of the hall, stand in a ring and take turns to speak, then walk back (3 minutes) */
    standup(hall) { standAt = sod; standHall = hall || null; still(); return { at: standAt, hall: standHall }; },
    /** react to real events (life.js diffEvents): merge / commit = a cheer (the camp and the hall you stand in), fail = its hall slumps, adopted / eval = your hall gathers and cheers. Confetti + sound when the kits are there. */
    react(evts) {
      const E = (Array.isArray(evts) ? evts : []).filter((e) => e && e.kind); if (!E.length) return null;
      const camH = hallOf(mode === 'tour' ? { x: camera.position.x, z: camera.position.z } : cam).id, out = { cheer: 0, slump: 0, gather: '', burst: false, sound: false };
      const hallOfI = (i) => (i < N ? S[i].hall : 'camp'), mark = (i, pose, d) => { reactT[i] = t + d; reactP[i] = pose; holdT[i] = Math.max(holdT[i], t + d); };
      let party = false, big = false;
      for (const e of E) {
        life.reacts.push(e.kind); if (life.reacts.length > 30) life.reacts.shift();
        if (e.kind === 'fail') { const si = S.findIndex((x) => x.id === e.who), hl = si >= 0 ? S[si].hall : camH; for (let i = 0; i < N; i++) if (S[i].hall === hl) { mark(i, 'slump', L.REACT.fail); out.slump++; } }
        else if (e.kind === 'merge' || e.kind === 'commit') { party = party || e.kind === 'merge'; for (let i = 0; i < N + NC; i++) if ((i >= N && camp[i - N]) || (i < N && hallOfI(i) === camH)) { mark(i, 'cheer', L.REACT.merge); out.cheer++; } }
        else if (L.isBig(e)) { big = true; gatherHall = camH; gatherAt = sod; gatherLen = L.REACT.big; out.gather = camH; for (let i = 0; i < N + NC; i++) if (hallOfI(i) === camH) { holdT[i] = -99; ret[i] = null; out.cheer++; } }
      }
      if (party || big) {
        const G = L.GATHER[camH] || L.GATHER.library, sc = screenOf(G.x, 1.2, G.z) || { x: (canvas.getBoundingClientRect().left + canvas.clientWidth / 2), y: canvas.getBoundingClientRect().top + canvas.clientHeight * 0.4 };
        // the cinema kit bursts in the world: confetti for a merge, coins for a new adopted run, laurel + confetti for a passed eval; else the page's confetti
        const kinds = E.some((e) => e.kind === 'eval') ? ['laurel', 'confetti'] : E.some((e) => e.kind === 'adopted') ? ['coins', 'confetti'] : ['confetti'];
        if (cine) { for (const k of kinds) cine.burst(k, [G.x, 1.6, G.z], { count: k === 'confetti' ? 60 : 40 }); out.burst = kinds.join('+'); } else out.burst = !!L.burst('confetti', sc, [G.x, 1.2, G.z]);
        if (out.burst) life.bursts++;
        out.sound = !!L.soundAt(big ? 'fanfare' : 'cheer', { x: G.x, y: 1.2, z: G.z }, 'success', camera); if (out.sound) life.sounds++;
      }
      still(); return out;
    },
    /** "show me your work": the person walks back to its station (if it is away) and the camera follows behind it. key = 'w:<id>' | 'b:<id>'. */
    lead(key) { const i = indexOf(key); if (i < 0) return null; const walking = sendHome(i); leadKey = key; following = i < N ? S[i].id : key; mode = 'follow'; still(); return { walking, to: { x: homeAt[i].x, z: homeAt[i].z } }; },
    /** what the people kit's say() needs to place a bubble over this person: { figure (the near full figure, if any), camera, canvas, project() -> {x, y, front} (page pixels), P3 } */
    sceneFor(key) { const i = indexOf(key); if (i < 0) return null; const F = full.get(key), V = new THREE.Vector3();
      return { name: 'ergasterion', figure: F ? F.fig : null, camera, canvas, P3: P3 || null,
        project: () => { const r = canvas.getBoundingClientRect(); V.set(at[i].x, (at[i].away ? 0 : Y0) + 1.45, at[i].z).project(camera); return { x: r.left + (V.x * 0.5 + 0.5) * r.width, y: r.top + (-V.y * 0.5 + 0.5) * r.height, front: V.z < 1 && Math.abs(V.x) < 1.05 && Math.abs(V.y) < 1.05 }; } }; },
    /** the full shared figure drawn for this person right now (near you), or null: for the kit's say(id, text, { figure }) lip sync */
    figureOf(key) { const F = full.get(key); return F ? F.fig : null; },
    /** where a person is right now (the schedule moves them): { x, z, act, pose, away } */
    posOf(key) { const i = indexOf(key); return i < 0 ? null : { x: at[i].x, z: at[i].z, act: at[i].act, pose: at[i].pose, away: at[i].away }; },
    /** for the tests and the HUD: the clock, what everyone does, the near figures and what they cost, the cart, the effects fired */
    life() { const acts = {}; for (let i = 0; i < N + NC; i++) { const k2 = keyOf(i); if (k2) acts[k2] = { act: at[i].act, pose: at[i].pose, x: +at[i].x.toFixed(3), z: +at[i].z.toFixed(3), away: at[i].away }; }
      return { sod, clock: clockMs, acts, near: [...full.keys()], lodCap, baseCalls, perFig, full: !!P3, v2: !!(P3 && P3.play), cart: life.cart || null, sparks: life.sparks, bursts: life.bursts, sounds: life.sounds, reacts: life.reacts.slice(), gather: gatherHall, standup: standAt }; },
    move(m) { mvT = { fwd: (m && m.fwd) || 0, side: (m && m.side) || 0 }; if (mode !== 'walk' && (mvT.fwd || mvT.side)) api.follow(null); },
    step(dt) { const p = walk({ x: cam.x, z: cam.z }, cam.yaw, mvT, dt || 0.1, COLL); cam.x = p.x; cam.z = p.z; snapCam(); frame(0.001); },
    look(dx, dy) { yawT -= dx; pitchT = Math.max(-0.6, Math.min(0.5, pitchT - dy)); still(); },
    follow(id) { following = id || null; mode = following ? 'follow' : 'walk'; still(); },
    tour(on) { mode = on ? 'tour' : 'walk'; following = null; if (on) tourT = 0; still(); return mode === 'tour'; },
    /** the day replay lights up who was busy at the cursor: their lamps pulse and their figures work for a moment */
    /** the person you are chatting with ('w:<station id>' | 'b:<builder id>' | null): it turns to face you, talks, and a soft marble disc marks it */
    focus(key) { const prev = focusKey; focusKey = key || ''; if (prev && prev !== focusKey) sendHome(indexOf(prev)); lodT = 0; try { lodFrame(0, camera.position); } catch (_) { /* next frame */ } still(); },
    focused() { return focusKey; },
    facing(key) { const si = S.findIndex((x) => 'w:' + x.id === key), ci = camp.findIndex((b) => b && 'b:' + b.id === key); return si >= 0 ? thA[si] : ci >= 0 ? thA[N + ci] : null; },
    pulse(ids) { for (const id of ids || []) hot[id] = t + 1.6; still(); },
    teleport(x, z, yaw) { const q = resolveCollision(x, z, []); cam.x = q.x; cam.z = q.z; if (yaw != null) { cam.yaw = yaw; yawT = yaw; } following = null; mode = 'walk'; mv = { fwd: 0, side: 0 }; snapCam(); still(); moved(); },
    reset() { cam = { x: START.x, z: START.z, yaw: START.yaw, pitch: -0.06 }; yawT = cam.yaw; pitchT = cam.pitch; following = null; mode = 'walk'; mv = { fwd: 0, side: 0 }; mvT = { fwd: 0, side: 0 }; snapCam(); still(); moved(); },
    face(id) { const s = S.find((a) => a.id === id); if (s) { let y = Math.atan2(-(s.x - cam.x), -(s.z - cam.z)); while (y - cam.yaw > Math.PI) y -= Math.PI * 2; while (y - cam.yaw < -Math.PI) y += Math.PI * 2; yawT = y; pitchT = -0.16; still(); } },
    pos,
    // ---- SCENE DIRECTION HOOKS (ergasterion/direct.js, olympus/camera-rig.js + controls.js): the director drives the camera in walk mode and moves YOU (your own character)
    drive(fn, opt) { driver = typeof fn === 'function' ? fn : null; driverInput = !!(driver && opt && opt.input === false); still(); return !!driver; },
    refs() { return { THREE, scene, camera, canvas, rc, P3: () => P3, cine: () => cine, reduced, bubbles }; },
    setPlayer(x, z, yaw) { cam.x = x; cam.z = z; if (yaw != null) { cam.yaw = yaw; yawT = yaw; } },
    modeNow: () => mode,
    stats() { const st = rc.stats(); return { calls: st.calls, triangles: st.triangles, quality: st.quality, batches: batches.length }; },
    projectCamp(j) { const c = CAMP_SPOTS[j]; if (!c) return null; const v = new THREE.Vector3(c.x, 1.3, c.z - 1.2).project(camera); if (v.z > 1) return null; return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight }; },
    project(id) { const i = S.findIndex((a) => a.id === id); if (i < 0) return null; const v = new THREE.Vector3(at[i].x, 1.0, at[i].z).project(camera); if (v.z > 1) return null; return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight }; },
    projectCrate(id, c) { const i = S.findIndex((a) => a.id === id), k = (i * MAXC + c) * 3; if (i < 0 || cratePos[k + 1] < 0) return null; const v = new THREE.Vector3(cratePos[k], cratePos[k + 1], cratePos[k + 2]).project(camera); if (v.z > 1) return null; return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight }; },
    /** what is under a tap: { id, crate } for a crate, { id } for a worker, or 'board' / 'changed' / 'pipe' for a wall board */
    pick(cx, cy) {
      const r = canvas.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), lx = cx - r.left, ly = cy - r.top;
      ray.setFromCamera(v, camera);
      let best = null, bd = 26;                    // a crate first: the nearest one on screen within 26 px
      for (let i = 0; i < N; i++) for (let c = 0; c < nCrates(workers[i]); c++) { const p = api.projectCrate(S[i].id, c); if (p) { const d = Math.hypot(p.x - lx, p.y - ly); if (d < bd) { bd = d; best = { id: S[i].id, crate: c }; } } }
      if (best) return best;
      const hp = ray.intersectObject(sCyl.im, false)[0], pi = hp ? platIdx.indexOf(hp.instanceId) : -1;
      if (pi >= 0) return { id: S[pi].id };
      bd = 56;                                      // forgiving: the nearest station on screen within 56 px (figure or lamp)
      S.forEach((s) => { const p = api.project(s.id); if (p) { const d = Math.hypot(p.x - lx, p.y - ly); if (d < bd) { bd = d; best = { id: s.id }; } } });
      if (best) return best;
      bd = 64; CAMP_SPOTS.forEach((c, j) => { if (!camp[j]) return; const v3 = new THREE.Vector3(c.x, 1.3, c.z - 1.2).project(camera); if (v3.z > 1) return; const d = Math.hypot((v3.x * 0.5 + 0.5) * canvas.clientWidth - lx, (-v3.y * 0.5 + 0.5) * canvas.clientHeight - ly); if (d < bd) { bd = d; best = { id: 'camp:' + camp[j].id }; } });
      if (best) return best;
      if (ray.intersectObject(bLearn.m, false)[0]) return { id: 'board' };
      if (ray.intersectObject(bFlip.m, false)[0]) return { id: 'changed' };
      if (ray.intersectObject(bPipe.m, false)[0]) return { id: 'pipe' };
      return null;
    },
    art: () => art,
    dispose() { try { kit.dispose(); rc.stop(); rc.dispose(); A.t.dispose(); T.t.dispose(); CA.t.dispose(); [bLearn, bFlip, bPipe].forEach((b) => b.C.t.dispose()); } catch (_) { /* nothing */ } },
  };
  // drag to look; a short tap with no drag picks a crate, a station or a board
  let drag = null;
  const down = (e) => { if (driverInput) return; drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } };
  const move = (e) => { if (driverInput || !drag) return; if (mode === 'walk') api.look((e.clientX - drag.x) * 0.0055, (e.clientY - drag.y) * 0.0045); drag.x = e.clientX; drag.y = e.clientY; };
  const up = (e) => {
    if (driverInput) { drag = null; return; }
    if (drag && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8 && typeof o.onPick === 'function') { const hit = api.pick(e.clientX, e.clientY); if (hit) o.onPick(hit.id, hit.crate); }
    drag = null;
  };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { drag = null; });
  // FX HOOK (olympus/fx-cine.js, optional; 2026-11-11 effects pass): the clock's light, sun shafts and dust in the halls, the camp hearth's
  // embers + smoke + firelight, sand blowing over the camp, birds over the desert, sparks off a WORKING smith's anvil. Same floor without it.
  let cineOff = false, sparkAt = 2, sparkJ = 0;   // (cine itself is declared with the floor's life state above)
  if (o.cinema !== false) import('../olympus/fx-cine.js').then((C) => { if (cineOff) return; cine = C.cinema(rc, { time: 'clock', fog: 0.3,
    rays: { to: [0, 0, 0], spread: [22, 0, 16], length: 16, width: 2 }, dust: { box: [24, 4, 18], center: [0, 2, 0] },
    fires: [[CAMP.fire.x, 0.7, CAMP.fire.z]], fireRange: 7, smokeCount: 0, sand: { box: [26, 2, 14], center: [CAMP.fire.x, 0.4, 17], vel: [3.2, 0.1, 0.8], count: 260 } });   // budget: no birds / blobs / extra smoke here
    kit.follow(cine);
    rc.onFrame((dt, t) => { if (!cine || reduced || t < sparkAt) return; sparkAt = t + 0.9 + Math.random() * 0.9;
      for (let n = 0; n < CAMP_SPOTS.length; n++) { const j = (sparkJ++) % CAMP_SPOTS.length, c = CAMP_SPOTS[j], b = camp[j];
        if (c.job === 'smith' && b && b.status === 'working') { cine.burst('sparks', [c.x, 0.85, c.z - 2.45], { count: 12 }); break; } } }); }).catch(() => {});
  api.cine = () => cine;
  const dispose0 = api.dispose; api.dispose = () => { cineOff = true; if (cine) cine.dispose(); dispose0(); };
  snapCam();
  rc.start((dt) => { frame(Math.min(dt, 0.1)); });
  if (reduced) frame(0.016);
  return api;
}
