// LIFE on the Ergasterion floor (pure, no three.js, no DOM): where everyone is and what they do at a given clock, and what the floor reacts to.
// Owner 2026-11-11: "characters I can see, talk to, they talk and show work". The floor (floor.js) asks scheduleAt() every frame; the page (ergasterion.js)
// diffs two data snapshots with diffEvents() and hands the events to floor.react(). Everything is deterministic for a fixed clock (tests freeze it).
//   the day:  09:30 local, 6 minutes: STAND-UP. Everyone in a hall walks to its gathering spot, stands in a ring and takes turns to speak.
//             all day: every worker walks to its hall's QUEUE BOARD once in a while (staggered), reads it and walks back.
//             the camp: a working builder carries a crate (a commit) to the cart and walks back; the cart holds today's real commits.
//   events:   merge (a builder's work landed in the release)  -> everyone cheers, confetti
//             fail  (a worker's run failed)                     -> its hall slumps for a moment, it stays slumped
//             commit / adopted / eval (a new adopted run, an eval passed) -> a crowd gathers and cheers. Only from real fields: nothing is invented.
// Reduced motion: no walking (everyone stays at work), reactions are poses only.

export const STANDUP = { at: 9 * 60 + 30, mins: 6 };               // local clock, minutes after midnight
export const BOARD = { cycle: 30 * 60, walk: 9, stay: 60 };         // seconds: each worker visits its hall's queue board once every 30 minutes
export const CARRY = { cycle: 80, quiet: 300, walk: 7, drop: 2 };   // seconds: a working builder carries a crate every 80 s, a quiet one every 5 min
export const SPEAK = 14;                                             // seconds each person speaks at the stand-up
export const SPEED = 0.9;                                            // metres a second, a calm walk
export const REACT = { merge: 5, fail: 5, big: 9 };                  // how long a reaction lasts, seconds
/** where each hall gathers (an open spot on its rug) and where its queue board stands (a small marble stele next to it, facing the room) */
export const GATHER = { money: { x: -6.5, z: -3.4 }, trading: { x: 5.0, z: -3.4 }, research: { x: -4.4, z: 8.0 }, library: { x: 6.5, z: 2.2 }, camp: { x: 6.5, z: 13.3, r: 1.8 } };
export const QBOARD = { money: { x: -8.5, z: -9.55, ry: 0, via: [{ x: -8.5, z: -4.6 }] }, trading: { x: 5.0, z: -9.55, ry: 0, via: [] }, research: { x: -0.95, z: 9.55, ry: Math.PI, via: [] }, library: { x: 12.55, z: 7.4, ry: -Math.PI / 2, via: [] } };
/** the camp's cart: today's commits pile up on it */
export const CART = { x: 6.5, z: 17.2, cap: 24 };

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const TAU = Math.PI * 2;
export const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);         // the floor's figures face +z at yaw 0
export function smooth(u) { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); }
/** a moment when everyone is at work at its station (10:05:20; repeats every 30 minutes until the evening): the page's ?clock=quiet, tests and screenshots */
export const QUIET = 10 * 3600 + 5 * 60 + 20;
/** the clock time (ms) of second-of-day sod on the local day of baseMs; '?clock=' words: 'quiet', 'standup' or 'HH:MM' -> seconds of day (null when unreadable) */
export function atClock(sod, baseMs) { const d = new Date(num(baseMs) != null ? baseMs : Date.now()); d.setHours(0, 0, 0, 0); return d.getTime() + Math.round(sod * 1000); }
export function clockWord(w) { const s = String(w || '').trim().toLowerCase(); if (s === 'quiet') return QUIET; if (s === 'standup') return STANDUP.at * 60 + 150; const m = /^(\d{1,2}):(\d{2})$/.exec(s); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 3600 + +m[2] * 60 : null; }
/** seconds after local midnight; tzMin = minutes WEST of UTC (Date#getTimezoneOffset), defaults to the clock's own zone */
export function secOfDay(ms, tzMin) {
  const t = num(ms); if (t == null) return 0;
  const off = num(tzMin) != null ? tzMin : new Date(t).getTimezoneOffset();
  return ((((t / 1000 - off * 60) % 86400) + 86400) % 86400);
}
/** a spot in a ring of n around a centre, k = 0..n-1 (the first one stands at the north, facing the others) */
export function ringSpot(c, k, n, r) { const m = Math.max(1, n), rad = r || (m <= 3 ? 1.0 : 1.0 + (m - 3) * 0.18), a = Math.PI + (k / m) * TAU; return { x: c.x + Math.sin(a) * rad, z: c.z + Math.cos(a) * rad }; }
/** a trip there and back: d = distance, u = seconds into the trip, stay = seconds at the far end. -> { u01 along the line, leg: 'go' | 'stay' | 'back' | 'done' } */
export function trip(d, u, stay) { const w = Math.max(1.5, Math.min(14, d / SPEED)); if (u < 0) return { f: 0, leg: 'done', w }; if (u < w) return { f: smooth(u / w), leg: 'go', w }; if (u < w + stay) return { f: 1, leg: 'stay', w }; if (u < 2 * w + stay) return { f: 1 - smooth((u - w - stay) / w), leg: 'back', w }; return { f: 0, leg: 'done', w }; }
const lerpP = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
/** a point a fraction f along a polyline, and the heading of that leg */
export function along(path, f) {
  const P = path, L = []; let tot = 0;
  for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); L.push(d); tot += d; }
  if (!tot) return { x: P[0].x, z: P[0].z, yaw: 0, len: 0 };
  let s = Math.max(0, Math.min(1, f)) * tot;
  for (let i = 0; i < L.length; i++) { if (s <= L[i] || i === L.length - 1) { const u = L[i] ? Math.min(1, s / L[i]) : 1, p = lerpP(P[i], P[i + 1], u); return { x: p.x, z: p.z, yaw: yawTo(P[i], P[i + 1]), len: tot }; } s -= L[i]; }
  return { x: P[P.length - 1].x, z: P[P.length - 1].z, yaw: 0, len: tot };
}
const plen = (path) => along(path, 1).len;
/** a trip along a path, there and back. -> { act-ready position, leg } */
function goStayBack(path, u, stay) {
  const tr = trip(plen(path), u, stay), p = along(path, tr.f);
  if (tr.leg === 'back') { const q = along(path.slice().reverse(), 1 - tr.f); return { leg: 'back', x: q.x, z: q.z, yaw: q.yaw, w: tr.w }; }
  return { leg: tr.leg, x: p.x, z: p.z, yaw: p.yaw, w: tr.w };
}
/** the spot in front of a board (it faces its ry), k-th reader to one side */
export function readSpot(B, k) { const fx = Math.sin(B.ry), fz = Math.cos(B.ry), side = (k % 3) - 1; return { x: B.x + fx * 0.95 + fz * side * 0.42, z: B.z + fz * 0.95 - fx * side * 0.42 }; }

/** out to a ring spot round centre G, `act` there for len seconds, and back (null when the gathering is not on at sod) */
export function gatherTrip(home, G, k, n, sod, at, len, act) {
  if (!G || num(at) == null) return null;
  const spot = ringSpot(G, k, n, G.r), path = [home, spot], w = Math.max(1.5, Math.min(14, plen(path) / SPEED)), stay = num(len) != null ? len : REACT.big, u = sod - at;
  if (u < 0 || u >= 2 * w + stay) return null;
  const g = goStayBack(path, u, stay);
  if (g.leg === 'go' || g.leg === 'back') return { act: 'walk', x: g.x, z: g.z, yaw: g.yaw, away: true, crate: false };
  return { act, x: g.x, z: g.z, yaw: yawTo(spot, G), away: true, crate: false };
}
/** a station worker at second-of-day sod. who = { i, hall, home:{x,z}, k (its index in its hall), n (how many in its hall) }; o = { reduced, standup:true|false (forced), failed }
 *  -> { act: 'work' | 'walk' | 'board' | 'standup' | 'speak', x, z, yaw (null = its work direction), away (not at its station) } */
export function scheduleAt(who, sod, o) {
  const opt = o || {}, home = who.home, atHome = { act: 'work', x: home.x, z: home.z, yaw: null, away: false };
  if (opt.reduced || opt.failed || opt.hold) return atHome;
  const G = GATHER[who.hall];
  // a big number (a new adopted run, an eval passed): the hall gathers in a ring at its middle and cheers
  const ga = gatherTrip(home, G, who.k, who.n, sod, opt.gatherAt, opt.gatherLen, 'cheer'); if (ga) return ga;
  // the stand-up (09:30, or whenever the page calls one: opt.standupAt = the second it started)
  const forced = num(opt.standupAt) != null, s0 = forced ? opt.standupAt : STANDUP.at * 60, len = forced ? 3 * 60 : STANDUP.mins * 60, su = sod - s0;
  if (G && su >= 0 && su < len) {
    const spot = ringSpot(G, who.k, who.n, G.r), path = [home, spot], w = Math.max(1.5, Math.min(14, plen(path) / SPEED)), g = goStayBack(path, su, len - 2 * w);
    if (g.leg === 'go' || g.leg === 'back') return { act: 'walk', x: g.x, z: g.z, yaw: g.yaw, away: true };
    if (g.leg === 'stay') { const turn = Math.floor((su - g.w) / SPEAK) % Math.max(1, who.n); return { act: turn === who.k ? 'speak' : 'standup', x: g.x, z: g.z, yaw: yawTo(spot, G), away: true, speaking: turn === who.k }; }
  }
  // the queue board, once every BOARD.cycle seconds, staggered so the hall is never empty: out to the hall's open middle, along its aisle, to the board, and back
  const B = QBOARD[who.hall];
  if (B && !opt.noBoard) {
    const off = ((who.i * 337) % BOARD.cycle), u = (sod + off) % BOARD.cycle, spot = readSpot(B, who.k), path = [home, G].concat(B.via || [], [spot]);
    const g = goStayBack(path, u, BOARD.stay);
    if (g.leg === 'go' || g.leg === 'back') return { act: 'walk', x: g.x, z: g.z, yaw: g.yaw, away: true };
    if (g.leg === 'stay') return { act: 'board', x: g.x, z: g.z, yaw: yawTo(spot, B), away: true };
  }
  return atHome;
}
/** a camp builder at second-of-day sod: j = tent index, home = where it works, status = working | quiet | done | job.
 *  -> { act: 'work' | 'carry' | 'walk' | 'drop' | 'cheer', x, z, yaw, crate (carrying one), away } */
export function campAt(j, home, status, sod, o) {
  const opt = o || {}, atHome = { act: status === 'done' && Math.floor(sod / 6 + j) % 5 === 0 ? 'cheer' : 'work', x: home.x, z: home.z, yaw: null, crate: false, away: false };
  if (opt.reduced) return atHome;
  const ga = gatherTrip(home, GATHER.camp, j, opt.n || 10, sod, opt.gatherAt, opt.gatherLen, 'cheer'); if (ga) return ga;
  if (status !== 'working' && status !== 'quiet') return atHome;
  const cyc = status === 'working' ? CARRY.cycle : CARRY.quiet, u = (sod + j * 13) % cyc, north = home.z < CART.z, side = ((j % 3) - 1) * 0.3;
  const spot = { x: CART.x + side, z: CART.z + (north ? -0.8 : 0.8) }, path = [home, { x: CART.x + side, z: home.z }, spot];          // along its row to the camp's middle aisle, then to the cart
  const g = goStayBack(path, u, CARRY.drop);
  if (g.leg === 'go') return { act: 'carry', x: g.x, z: g.z, yaw: g.yaw, crate: true, away: true };
  if (g.leg === 'stay') return { act: 'drop', x: g.x, z: g.z, yaw: yawTo(spot, CART), crate: false, away: true };
  if (g.leg === 'back') return { act: 'walk', x: g.x, z: g.z, yaw: g.yaw, crate: false, away: true };
  return atHome;
}
/** how many crates sit on the cart: today's real commits of every builder, capped */
export function cartCount(rows) { let n = 0; for (const b of Array.isArray(rows) ? rows : []) if (b && num(b.today) != null) n += Math.max(0, Math.round(b.today)); return { n, shown: Math.min(CART.cap, n) }; }

/** the smith's blow: how many hammer hits between two values of its work angle a (the floor swings the hammer with cos(4a); a hit is the bottom of the swing) */
export function hits(a0, a1) { const f = (a) => Math.floor((4 * a - Math.PI) / TAU); return Math.max(0, f(a1) - f(a0)); }

/** the near figures: up to max people within radius get the full figure (LOD); keep the ones already shown a little longer (hysteresis) so nobody flickers.
 *  cands = [{ key, d }] -> [key] nearest first */
export function nearSet(cands, max, radius, prev) {
  const was = new Set(prev || []), m = Math.max(0, max | 0);
  return (Array.isArray(cands) ? cands : []).filter((c) => c && num(c.d) != null && c.d <= radius * (was.has(c.key) ? 1.25 : 1)).sort((a, b) => a.d - (was.has(a.key) ? 0.6 : 0) - (b.d - (was.has(b.key) ? 0.6 : 0))).slice(0, m).map((c) => c.key);
}

// ------------------------------------------------------------------------------------------------ events from real data
/** the plain snapshot the page keeps between two loads: who failed, who merged, how many commits, adopted runs, passed evals. Only fields that exist count. */
export function snapshot(workers, builderRows, pipe, home) {
  const W = Array.isArray(workers) ? workers : [], B = Array.isArray(builderRows) ? builderRows : [];
  const adopted = isObj(pipe) && Array.isArray(pipe.lanes) ? (pipe.lanes.find((l) => l && l.id === 'adopted') || {}).n : null;
  const acc = isObj(home) && Array.isArray(home.accounts) ? home.accounts.filter(isObj) : [];
  const passed = acc.filter((a) => isObj(a.eval) && (a.eval.passed === true || /^pass/i.test(String(a.eval.state || a.eval.status || '')))).map((a) => String(a.id || a.name || '')).filter(Boolean);
  return { v: 1, failed: W.filter((w) => w && w.status === 'failed').map((w) => w.id), merged: B.filter((b) => b && b.status === 'done').map((b) => b.branch || b.id),
    commits: B.reduce((s, b) => s + (b && num(b.today) != null ? b.today : 0), 0), adopted: num(adopted), passed, sample: !!(isObj(pipe) && pipe.sample) };
}
/** what happened between two snapshots: [{ kind: 'merge' | 'fail' | 'commit' | 'adopted' | 'eval', who, n, text }]. No previous snapshot: nothing (we do not celebrate old news). */
export function diffEvents(prev, next) {
  if (!isObj(prev) || !isObj(next) || prev.v !== next.v) return [];
  const out = [], had = (arr, x) => Array.isArray(arr) && arr.includes(x);
  for (const id of next.failed || []) if (!had(prev.failed, id)) out.push({ kind: 'fail', who: id, text: 'A run failed: ' + id });
  for (const b of next.merged || []) if (!had(prev.merged, b)) out.push({ kind: 'merge', who: b, text: 'Merged into the release' });
  if (num(next.commits) != null && num(prev.commits) != null && next.commits > prev.commits) out.push({ kind: 'commit', n: next.commits - prev.commits, text: (next.commits - prev.commits) + ' new commit' + (next.commits - prev.commits === 1 ? '' : 's') });
  if (num(next.adopted) != null && num(prev.adopted) != null && next.adopted > prev.adopted && !next.sample) out.push({ kind: 'adopted', n: next.adopted - prev.adopted, text: 'A new run was adopted' });
  for (const a of next.passed || []) if (!had(prev.passed, a)) out.push({ kind: 'eval', who: a, text: 'Eval passed: ' + a });
  return out;
}
/** a big number: something the whole floor gathers for */
export const isBig = (e) => !!e && (e.kind === 'adopted' || e.kind === 'eval');
/** merges that happened in the last `mins` minutes (the first visit of the day still sees the cheer for a fresh merge): from each builder's shipped times */
export function recentMerges(builderRows, now, mins) {
  const lim = (mins == null ? 30 : mins) * 60000, out = [];
  for (const b of Array.isArray(builderRows) ? builderRows : []) { if (!b || b.status !== 'done' || b.sample) continue; const t = (b.shipped && b.shipped[0] && b.shipped[0].t) || b.last; if (num(t) != null && now - t >= 0 && now - t <= lim) out.push({ kind: 'merge', who: b.branch || b.id, text: b.name + ' merged' }); }
  return out;
}

// ------------------------------------------------------------------------------------------------ the optional kits (feature checks only: fx.burst / OLYMPUS.sound.at / OLYMPUS_PEOPLE.say + show)
const W0 = () => (typeof window !== 'undefined' ? window : {});
/** a burst at a screen point (and its world point, for a 3D-aware fx kit). kind = 'sparks' | 'coins' | 'confetti'. Falls back to the classic confetti / sparkleBurst, then to nothing. */
export function burst(kind, screen, world) {
  try {
    const FX = W0().OLYMPUS_FX; if (!FX) return false;
    const at = { x: screen ? screen.x : 0, y: screen ? screen.y : 0, world: world || null };
    if (typeof FX.burst === 'function') { FX.burst(kind, at); return 'burst'; }
    if (kind === 'confetti' && typeof FX.confetti === 'function') { FX.confetti(null, { count: 90, x: at.x, y: at.y }); return 'confetti'; }
    if (typeof FX.sparkleBurst === 'function') { FX.sparkleBurst(null, { x: at.x, y: at.y }); return 'sparkleBurst'; }
  } catch (_) { /* effects are never needed */ }
  return false;
}
/** the world-sound names of docs/SOUND_API.md for what happens on the floor */
export const SOUND = { clank: 'hammer', fanfare: 'cheer', cheer: 'cheer', crate: 'crate', step: 'step', groan: 'groan' };
/** a sound placed in the world: OLYMPUS_SFX.at(name, pos, listener, opts) (docs/SOUND_API.md), else OLYMPUS.sound.at, else a plain UI cue for the big moments only,
 *  else silence. Nothing sounds before the first tap: the engine decides. */
export function soundAt(name, pos, cue, listener, opts) {
  const nm = SOUND[name] || name;
  try {
    const W = W0(), X = W.OLYMPUS_SFX, O = W.OLYMPUS;
    if (X && typeof X.at === 'function') { X.at(nm, pos, listener || undefined, opts || {}); return 'at'; }
    if (O && O.sound && typeof O.sound.at === 'function') { O.sound.at(nm, pos, listener || undefined, opts || {}); return 'at'; }
    if (cue && O && typeof O.cue === 'function') { O.cue(cue); return 'cue'; }
  } catch (_) { /* sound is never needed */ }
  return false;
}
/** QA6: a person's footstep on a surface (OLYMPUS_SFX.walker(person).step: the step and, now and then, their things answering softly); one walker per key.
 *  person = a people3d spec (accessory / kind) or { kind }. The engine honours mute, LITE, reduced motion and the first tap. */
const WALKERS = new Map();
export function stepAt(key, person, pos, listener, opts) {
  try { const X = W0().OLYMPUS_SFX; if (!X || typeof X.walker !== 'function') return soundAt('step', pos, null, listener, opts);
    let w = WALKERS.get(key); if (!w) { w = X.walker(person || {}); WALKERS.set(key, w); if (WALKERS.size > 64) WALKERS.delete(WALKERS.keys().next().value); }
    return w.step(pos, listener || undefined, opts || {}) ? 'walker' : false; } catch (_) { return false; }
}
/** QA6: a person's presence (their keys, coins, bronze or beads) placed in the world, when they notice you */
export function presenceAt(person, pos, listener, opts) { try { const X = W0().OLYMPUS_SFX; return X && typeof X.presence === 'function' && X.presence(person || {}, pos, listener || undefined, opts || { k: 0.4 }) ? 'presence' : false; } catch (_) { return false; } }
/** say a line with a speech bubble + voice when the people kit has say(); returns false so the caller keeps its own bubble */
export function sayLine(id, text, opts) { try { const K = W0().OLYMPUS_PEOPLE; if (K && typeof K.say === 'function' && id && text) { K.say(id, String(text).slice(0, 240), opts || {}); return true; } } catch (_) { /* our own bubble */ } return false; }
/** show a work card (what this person made) when the kit has show() */
export function showWork(id, what) { try { const K = W0().OLYMPUS_PEOPLE; if (K && typeof K.show === 'function' && id) { K.show(id, what); return true; } } catch (_) { /* our own card */ } return false; }
/** the work pose of a job for the v2 figure (docs/PERSONA_API.md "Figure API v2"): play(fig, pose) when present */
export const WORK_POSE = { smith: 'hammer', scribe: 'write', oracle: 'telescope', scales: 'weigh', wheel: 'think' };
export const ACT_POSE = { work: null, walk: 'walk', carry: 'carry', drop: 'idle', board: 'read', standup: 'idle', speak: 'talk', cheer: 'cheer', slump: 'slump', wave: 'wave', talk: 'talk', look: 'idle' };
