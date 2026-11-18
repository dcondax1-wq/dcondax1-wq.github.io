// ATHENS WORLD: the nested layer on top of the plan. Pure maths (no three.js, no DOM), so a test can run it in Node.
//   world (Athens) -> district (Agora, Acropolis, Harbour, Academy) -> village (one app) -> house (one item of that app).
// Every village is carved out of the city's own houses (no extra draw call): the nearest free houses around the temple become the app's
// data houses. Also here: the collision grid for walking (house footprints, temples, water), street routes, the villagers' paths.
// READ ONLY scenery: no order, no trade.
import { LANDMARKS, GROUPS, districtOf, groundY, isSea, riverDist, RIVER_W, DISTRICTS, LOT } from './athens-plan.js';
import { allApps, villageData, MIN_HOUSES, MAX_ROWS, DISTRICT_NAME } from './athens-villages.js';
import { rng, hash32 } from './util.js';

export const EYE = 1.7, WALK_R = .45;
export const TIER_NPC = { low: 0, high: 80, ultra: 120 };
export const HOUSE_TINT = { good: [.74, 1, .6], bad: [1, .55, .46], warn: [1, .86, .42], info: [.72, .86, 1], plain: [1, .97, .9], none: [.66, .64, .62] };
const heart = { trading: [70, 40], research: [-95, -285], money: [30, 214], life: [-285, -12] };

/** footprint half sizes of a plan house as the scene draws it (rotated a quarter turn when tone <= .5, a little roof overhang) */
export const footprint = (h) => { const sw = h.hall ? 1.35 : 1, w = h.w * sw, d = h.d * sw, rot = h.tone <= .5; return { hx: (rot ? d : w) / 2 * 1.08, hz: (rot ? w : d) / 2 * 1.08, rot }; };

/**
 * plan + loaded files -> the whole nested world.
 * files: { url: json|null } (see athens-villages loadFiles). Without files every village is "no data today".
 */
export function buildWorld(plan, files = {}, opts = {}) {
  const now = opts.now || Date.now(), apps = allApps();
  const templeBy = new Map(plan.apps.map((a) => [a.id, a]));
  const used = new Set(plan.apps.map((a) => `${a.x},${a.z}`));
  const centers = plan.apps.map((a) => ({ x: a.x, z: a.z }));
  const villages = [];
  // hamlet centres for the apps that have no temple: free lots around the district's heart, kept apart from the others
  const free = plan.lots.filter((l) => l.free && !used.has(`${l.x},${l.z}`));
  const place = (app) => {
    const [hx, hz] = heart[app.group] || [0, 0];
    const cand = free.filter((l) => !used.has(`${l.x},${l.z}`) && districtOf(l.x, l.z) === app.group).sort((p, q) => Math.hypot(p.x - hx, p.z - hz) - Math.hypot(q.x - hx, q.z - hz) || p.i - q.i || p.j - q.j);
    for (const sep of [64, 46, 30, 0]) { const l = cand.find((c) => centers.every((q) => Math.hypot(q.x - c.x, q.z - c.z) >= sep)); if (l) { used.add(`${l.x},${l.z}`); centers.push({ x: l.x, z: l.z }); return l; } }
    return null;
  };
  for (const app of apps) {
    const t = templeBy.get(app.id), c = t ? { x: t.x, z: t.z } : place(app);
    if (!c) continue;
    const data = villageData(app, files, now), want = Math.min(MAX_ROWS, Math.max(MIN_HOUSES, data.rows.length));
    villages.push({ idx: villages.length, id: app.id, name: app.name, group: app.group, district: DISTRICT_NAME[app.group], colour: app.colour, blurb: app.blurb, temple: !!t, x: c.x, z: c.z, entry: { x: c.x + LOT / 2, z: c.z + LOT / 2 },
      status: data.status, source: data.source, fact: data.fact, rows: data.rows, want, houses: [], real: 0 });
  }
  // claim: round robin, each village takes its nearest free house per round (so neighbouring temples share fairly)
  const H = plan.houses, owner = new Int16Array(H.length).fill(-1);
  const cand = villages.map((v) => H.map((h, i) => [Math.hypot(h.x - v.x, h.z - v.z), i]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).slice(0, 420).map((e) => e[1]));
  const ptr = villages.map(() => 0);
  for (let round = 0; round < MAX_ROWS; round++) for (const v of villages) {
    if (v.houses.length >= v.want) continue;
    const list = cand[v.idx]; while (ptr[v.idx] < list.length && owner[list[ptr[v.idx]]] >= 0) ptr[v.idx]++;
    if (ptr[v.idx] >= list.length) continue; const i = list[ptr[v.idx]++]; owner[i] = v.idx; v.houses.push(i);
  }
  const items = [];                                                    // every claimed house, village by village
  for (const v of villages) {
    v.houses = v.houses.map((i, k) => {
      const base = H[i], row = v.rows[k] || null, real = !!row;
      const hall = !v.temple && k === 0, tone = row ? row.tone : 'none', size = row ? row.size : 0;
      const it = { ...base, village: v.idx, k, row, real, hall, tintKey: tone, sy: hall ? 1.5 : real ? .85 + .75 * size : .8, order: base.order };
      it.h = base.h * it.sy; items.push(it); if (real) v.real++; return it;
    });
    v.placed = v.real; v.unplaced = Math.max(0, v.rows.length - v.real);
  }
  const scenery = H.filter((h, i) => owner[i] < 0).map((h) => ({ ...h, village: -1, k: -1, row: null, real: false, hall: false, tintKey: null, sy: 1 }));
  const withData = villages.filter((v) => v.real > 0), live = withData.filter((v) => v.status === 'live').length, example = withData.length - live;
  const none = villages.length - withData.length, houses = withData.reduce((s, v) => s + v.real, 0);
  const districts = Object.keys(DISTRICT_NAME).map((key) => { const vs = villages.filter((v) => v.group === key), g = GROUPS.find((x) => x.key === key), D = DISTRICTS.find((x) => x.key === key);
    return { key, name: DISTRICT_NAME[key] + ' district', short: DISTRICT_NAME[key], tint: g ? g.tint : '#b9a98e', blurb: g ? g.blurb : '', x: D ? D.x : 0, z: D ? D.z : 0, villages: vs.map((v) => v.idx), houses: vs.reduce((s, v) => s + v.real, 0), noData: vs.filter((v) => !v.real).length }; });
  const world = { villages, items, scenery, districts, counts: { houses, apps: withData.length, live, example, none, villages: villages.length },
    summary: `${houses} houses from ${withData.length} apps, ${none} app${none === 1 ? '' : 's'} without data today${example ? ` (${example} app${example === 1 ? '' : 's'} show example numbers)` : ''}.` };
  world.byId = new Map(villages.map((v) => [v.id, v])); world.plan = plan;
  return world;
}

/** the houses the scene draws for a tier: every village's houses (6 each in LITE) then plain scenery up to the cap. Tier cap never grows. */
export function renderList(world, cap, perVillage = MAX_ROWS) {
  const out = []; for (const v of world.villages) for (const h of v.houses) if (h.k < perVillage) out.push(h);
  for (const h of world.scenery) { if (out.length >= cap) break; out.push(h); }
  return out.slice(0, cap);
}

// ------------------------------------------------------------------ collision (walking)
const CELL = 8;
export function makeCollider(houses, plan, apps = plan.apps) {
  const grid = new Map(), circles = [];
  const add = (key, o) => { let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(o); };
  const putBox = (b) => { for (let i = Math.floor((b.x - b.hx - 1) / CELL); i <= Math.floor((b.x + b.hx + 1) / CELL); i++) for (let j = Math.floor((b.z - b.hz - 1) / CELL); j <= Math.floor((b.z + b.hz + 1) / CELL); j++) add(i + ',' + j, b); };
  const boxes = houses.map((h) => { const f = footprint(h), b = { x: h.x, z: h.z, hx: f.hx, hz: f.hz }; putBox(b); return b; });
  for (const a of apps) circles.push({ x: a.x, z: a.z, r: 10 });
  for (const L of LANDMARKS) if (['temple', 'gate', 'porch', 'tholos', 'temple-s', 'lighthouse'].includes(L.kind)) circles.push({ x: L.x, z: L.z, r: Math.min(22, L.r * .5) });
  const bridges = LANDMARKS.filter((l) => l.kind === 'bridge');
  const water = (x, z) => isSea(x, z) || (riverDist(x, z) < RIVER_W / 2 - 1 && !bridges.some((b) => Math.hypot(b.x - x, b.z - z) < 16));
  const hits = (x, z, r = WALK_R) => {
    if (Math.abs(x) > 1180 || Math.abs(z) > 1180 || water(x, z)) return true;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), seen = grid.get(ci + ',' + cj);
    if (seen) for (const b of seen) { const px = Math.max(b.x - b.hx, Math.min(x, b.x + b.hx)), pz = Math.max(b.z - b.hz, Math.min(z, b.z + b.hz)); if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true; }
    // a box that spills over a cell border is stored in every cell it touches, so the cell of the point is enough
    for (const c of circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return true;
    return false;
  };
  /** move by (dx, dz) and slide along walls: x then z */
  const move = (x, z, dx, dz, r = WALK_R) => {
    let nx = x, nz = z; const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .35)), sx = dx / n, sz = dz / n;
    for (let i = 0; i < n; i++) { if (!hits(nx + sx, nz, r)) nx += sx; if (!hits(nx, nz + sz, r)) nz += sz; }
    return [nx, nz];
  };
  return { hits, move, boxes, circles, boxCount: boxes.length };
}

/** a walker: heading th (0 = north = -z, grows clockwise), forward and side in -1..1. Returns the new state. */
export function walkStep(w, inp, dt, col) {
  const sp = (inp.run ? 4.2 : 2.6) * dt, f = Math.max(-1, Math.min(1, inp.fwd || 0)), s = Math.max(-1, Math.min(1, inp.side || 0));
  const dx = (Math.sin(w.yaw) * f + Math.cos(w.yaw) * s) * sp, dz = (-Math.cos(w.yaw) * f + Math.sin(w.yaw) * s) * sp;
  const [x, z] = col.move(w.x, w.z, dx, dz); return { ...w, x, z, moved: Math.hypot(x - w.x, z - w.z) };
}
export const headingTo = (x, z, tx, tz) => Math.atan2(tx - x, -(tz - z));
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassName = (yaw) => CARD[Math.round((((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];

/** where am I: the district, the village I am in (within 62 m of its temple) and the nearest house within 30 m */
export function whereAmI(world, x, z) {
  let v = null, vd = 62; for (const q of world.villages) { const d = Math.hypot(q.x - x, q.z - z); if (d < vd) { vd = d; v = q; } }
  let h = null, hd = 30; for (const q of world.villages) { if (Math.hypot(q.x - x, q.z - z) > 110) continue; for (const it of q.houses) { const d = Math.hypot(it.x - x, it.z - z); if (d < hd) { hd = d; h = it; } } }
  return { district: DISTRICT_NAME[districtOf(x, z)] || 'Athens', village: v, house: h, houseDist: hd };
}

// ------------------------------------------------------------------ street routes and villagers
/** streets run on the lines x or z = (n + .5) * 30. Two L-shaped routes between two street points; the first one that is clear (or null). */
export function route(col, a, b) {
  const clear = (p, q) => { const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2)); for (let i = 0; i <= n; i++) if (col.hits(p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n, 1)) return false; return true; };
  for (const mid of [[b.x, a.z], [a.x, b.z]]) { const P = [[a.x, a.z], mid, [b.x, b.z]]; if (clear(P[0], P[1]) && clear(P[1], P[2])) return P; }
  return null;
}
/** a village's door step: the first of the four street corners around its lot that is free */
export function doorOf(col, v) { for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const p = { x: v.x + sx * LOT / 2, z: v.z + sz * LOT / 2 }; if (!col.hits(p.x, p.z, 1)) return p; } return { x: v.entry.x, z: v.entry.z }; }
export function makeNpcs(world, col, count, seed = 'athens:npc') {
  const r = rng(hash32(seed)), out = [], vs = world.villages.filter((v) => v.houses.length), doors = new Map(vs.map((v) => [v.idx, doorOf(col, v)]));
  for (let guard = 0; out.length < count && guard < count * 8 && vs.length > 1; guard++) {
    const a = vs[guard % vs.length], same = vs.filter((v) => v !== a && v.group === a.group), pool = same.length && r() < .8 ? same : vs.filter((v) => v !== a);
    const b = pool[Math.floor(r() * pool.length)], P = route(col, doors.get(a.idx), doors.get(b.idx)); if (!P) continue;
    const len = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) + Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
    if (len < 8 || len > 700) continue;
    out.push({ i: out.length, a: a.idx, b: b.idx, path: P, len, speed: 1.05 + r() * .6, ph: r(), colour: (GROUPS.find((g) => g.key === a.group) || GROUPS[0]).tint });
  }
  return out;
}
/** position and heading of a villager at time t seconds (back and forth along its route) */
export function npcAt(n, t) {
  let d = (t * n.speed + n.ph * n.len * 2) % (n.len * 2), back = false; if (d > n.len) { d = n.len * 2 - d; back = true; }
  const [p0, p1, p2] = n.path, l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  let x, z, tx, tz;
  if (d <= l1) { const u = l1 ? d / l1 : 0; x = p0[0] + (p1[0] - p0[0]) * u; z = p0[1] + (p1[1] - p0[1]) * u; tx = p1[0] - p0[0]; tz = p1[1] - p0[1]; }
  else { const l2 = n.len - l1, u = l2 ? (d - l1) / l2 : 0; x = p1[0] + (p2[0] - p1[0]) * u; z = p1[1] + (p2[1] - p1[1]) * u; tx = p2[0] - p1[0]; tz = p2[1] - p1[1]; }
  if (back) { tx = -tx; tz = -tz; }
  return { x, z, yaw: Math.atan2(tx, -tz), near: d < n.len / 2 ? 'a' : 'b' };
}
export const npcFact = (world, n, t) => { const v = world.villages[npcAt(n, t).near === 'a' ? n.a : n.b]; return { village: v, text: v.fact }; };
export { groundY };
