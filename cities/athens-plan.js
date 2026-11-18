// ATHENS: the plan of the giant Greek metropolis. Pure data and maths (no three.js, no DOM), so a test can run it in Node.
// x grows east, z grows south (the sea), y is up. One unit is about one metre. Everything is scenery: no trade, no money value.
// The same plan feeds the 3D scene (athens.js), the minimap and the jump list (athens-ui.js).
import { rng, hash32 } from './util.js';

export const GROUPS = [
  { key: 'trading', name: 'Trading', tint: '#d8b25a', blurb: 'The Agora: where the bots trade' },
  { key: 'money', name: 'Money', tint: '#cf9150', blurb: 'The Harbour: ships carry the payouts' },
  { key: 'research', name: 'Research', tint: '#6fa0c0', blurb: 'The Acropolis and the Library' },
  { key: 'life', name: 'Life', tint: '#9ba85f', blurb: 'Gymnasium, stadium and theatre' },
  { key: 'civic', name: 'City works', tint: '#b9a98e', blurb: 'Walls, aqueduct, bridges, lighthouse' },
];

// The 40 Olympus apps, in their district: [id, name, colour, one plain line].
export const APPS = {
  trading: [['zenith', 'Zenith', '#9c6b3c', 'NQ bots, Zlarior, ATLAS, BLITZ'], ['oracle', 'Oracle', '#7fb0a3', 'The market radar, live'], ['odeon', 'Odeon', '#d77a7a', 'Every trade, replayed in 3D'],
    ['fates', 'Fates', '#ffcf5a', 'Pass odds for each eval'], ['ares', 'Ares', '#c8402e', 'The war room: GO, WAIT or HALT'], ['forum', 'Forum', '#8f9f3c', 'Morning briefing at the NY hour'],
    ['nemesis', 'Nemesis', '#b55c66', 'The fallen trades: what went wrong'], ['chronos', 'Chronos', '#d4a574', 'Time and the session clock'], ['journal', 'Mnemosyne', '#e08a6b', 'A 10-second trade journal'],
    ['hestia', 'Hestia', '#c8a24a', 'Today at home: what to do now'], ['demeter', 'Demeter', '#9aa564', 'Account health and payout rules'], ['apollo', 'Apollo', '#e0b060', 'Your weekly review, one rule'],
    ['delphi', 'Delphi', '#e0b060', 'The briefing: plan, target, go / no-go'], ['hephaestus', 'Hephaestus', '#c7773f', 'The forge: tune the dials']],
  research: [['observatory', 'Observatory', '#a9bfd0', 'Data health and research evidence'], ['tree', 'Daphne', '#6b9068', 'The strategy tree search'], ['prometheus', 'Prometheus', '#ff7a1a', 'The Forge: strategies tested'],
    ['pantheon', 'Pantheon', '#f2d68a', 'The data gods: rates, liquidity, fear'], ['labyrinth', 'Labyrinth', '#a8765a', 'The risk maze: size your eval'], ['argus', 'Argus', '#3f8a8a', 'The hundred eyes: what to fix'],
    ['clio', 'Clio', '#d8c9a8', 'The research library in plain words'], ['athena', 'Athena', '#7f8a52', 'The library: strategy, rules, quiz'], ['datacity', 'Data City', '#5f8ea6', 'Every combo tested, as a city'],
    ['mind', 'Mind', '#d9b8a8', 'Your vault as a living 3D brain'], ['cities', 'Cities', '#b88a50', 'A world of city islands']],
  money: [['kalshicity', 'Kalshi City', '#b5a642', 'The Kalshi bot as a night city'], ['ledger', 'Ledger', '#c2b280', 'Real money: fees, payouts, net'], ['hera', 'Hera', '#c96a4a', 'The 12-month money plan'],
    ['dionysus', 'Dionysus', '#b77a8a', 'The Kalshi desk. Suggestions only'], ['pnyx', 'Pnyx', '#c8a24a', 'Prop-firm rules and risk calculator'], ['kalshi', 'Kalshi', '#8fa07a', 'Kalshi bot, from your PC'],
    ['tyche', 'Tyche', '#cf8f7a', 'The Kalshi bets as a fortune wheel'], ['hermes', 'Hermes', '#f7c948', 'OLYMPUS Wrapped: your money'], ['plutus', 'Plutus', '#a9b84f', 'The money plan: accounts, payouts']],
  life: [['inbox', 'Inbox', '#9aa3a8', 'Everything that needs a look'], ['settings', 'Settings', '#a39883', 'Look, voice, storage, the tour'], ['bridge', 'Bridge', '#8c7a5a', 'Link ChatGPT: 3 steps'],
    ['planner', 'Planner', '#7fa7c2', 'Day and week plan'], ['arena', 'Arena', '#ffb547', 'Olympian ranks: XP for discipline'], ['atlas', 'Atlas', '#efc979', 'A fast map of every dashboard']],
};

// The big monuments. r = footprint radius (keeps houses clear). app = the Olympus app its card opens.
export const LANDMARKS = [
  { id: 'parthenon', name: 'Parthenon', kind: 'temple', group: 'research', x: -170, z: -250, r: 52, app: 'clio', blurb: 'The great temple on the Acropolis: 46 marble columns. Clio keeps the research library.' },
  { id: 'propylaea', name: 'Propylaea', kind: 'gate', group: 'research', x: -170, z: -196, r: 18, app: 'observatory', blurb: 'The gateway up the Acropolis ramp. The Observatory checks the data before you climb.' },
  { id: 'erechtheion', name: 'Erechtheion', kind: 'porch', group: 'research', x: -218, z: -262, r: 18, app: 'prometheus', blurb: 'The temple with the maiden porch. Prometheus tests strategies in the forge.' },
  { id: 'library', name: 'Great Library', kind: 'library', group: 'research', x: 40, z: -330, r: 60, app: 'athena', blurb: 'Reading halls behind a long colonnade. Athena keeps strategy, rules and the quiz.' },
  { id: 'agora', name: 'Agora', kind: 'agora', group: 'trading', x: 60, z: -40, r: 78, app: 'zenith', blurb: 'The open market square of the city. Zenith runs the NQ bots here.' },
  { id: 'stoa', name: 'Stoa of Attalos', kind: 'stoa', group: 'trading', x: 60, z: -112, r: 30, app: 'forum', blurb: 'A long two-storey colonnade for the morning meeting. Forum is the daily briefing.' },
  { id: 'tholos', name: 'Tholos', kind: 'tholos', group: 'trading', x: 4, z: -30, r: 16, app: 'hestia', blurb: 'The round hall where the city council kept the hearth. Hestia: what to do today.' },
  { id: 'hephaisteion', name: 'Temple of Hephaestus', kind: 'temple-s', group: 'trading', x: 140, z: -118, r: 28, app: 'hephaestus', blurb: 'The forge god on his hill above the market. Hephaestus tunes the dials.' },
  { id: 'theatre', name: 'Theatre of Dionysus', kind: 'theatre', group: 'life', x: -170, z: -98, r: 56, app: 'odeon', blurb: 'Stone seats in a half circle under the hill. Odeon replays every trade.' },
  { id: 'gymnasium', name: 'Gymnasium', kind: 'gym', group: 'life', x: -330, z: -40, r: 52, app: 'arena', blurb: 'A courtyard ringed with colonnades for training. Arena gives XP for discipline.' },
  { id: 'stadium', name: 'Panathenaic Stadium', kind: 'stadium', group: 'life', x: -345, z: 112, r: 72, app: 'planner', blurb: 'The running track in a stone bowl. Planner holds the day and the week.' },
  { id: 'harbour', name: 'Harbour of Piraeus', kind: 'harbour', group: 'money', x: 0, z: 306, r: 60, app: 'ledger', blurb: 'Quays and ship sheds. Ledger counts the real money: fees, payouts, net.' },
  { id: 'lighthouse', name: 'Lighthouse', kind: 'lighthouse', group: 'civic', x: 205, z: 352, r: 14, app: 'hermes', blurb: 'A tall tower with a warm lantern at the harbour mouth. Hermes tells the story of your money.' },
  { id: 'market', name: 'Market Street', kind: 'market', group: 'money', x: 15, z: 160, r: 40, app: 'plutus', blurb: 'Stalls with striped awnings between the Agora and the harbour. Plutus plans the accounts.' },
  { id: 'aqueduct', name: 'Aqueduct', kind: 'aqueduct', group: 'civic', x: 330, z: -215, r: 12, blurb: 'Arches carry fresh water to the city from the eastern hills.' },
  { id: 'walls', name: 'City Walls', kind: 'walls', group: 'civic', x: 0, z: -400, r: 12, blurb: 'The wall ring with 4 gates and towers.' },
  { id: 'bridge-n', name: 'North Bridge', kind: 'bridge', group: 'civic', x: 408, z: -92, r: 10, blurb: 'A three-arch stone bridge over the river Ilisos.' },
  { id: 'bridge-s', name: 'South Bridge', kind: 'bridge', group: 'civic', x: 392, z: 78, r: 10, blurb: 'The southern crossing, close to the harbour road.' },
];

export const LOT = 30;            // grid pitch of the lots (lot 22, street 8)
export const AVENUE_EVERY = 5;    // every 5th grid line is a wide avenue
export const WORLD = { x0: -1300, x1: 1300, z0: -1300, z1: 1300 };
export const DISTRICTS = [
  { key: 'trading', x: 70, z: 20, r: 190 }, { key: 'research', x: -100, z: -280, r: 190 }, { key: 'money', x: 20, z: 215, r: 170 }, { key: 'life', x: -310, z: 20, r: 190 },
];

// ------------------------------------------------------------------ terrain
const smooth = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
export const ACROPOLIS = { x: -170, z: -250, top: 48, plateau: 66, base: 118 };
export const COAST = (x) => 300 + 18 * Math.sin(x / 85) + 10 * Math.sin(x / 31 + 1);
const noise = (x, z) => Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.0127 - .7) + .5 * Math.sin(x * 0.027 - z * 0.021 + 2.1) + .25 * Math.sin(x * 0.061 + z * 0.049);
/** River Ilisos, east of the city: a polyline, 24 wide. */
export const RIVER = [[640, -520], [520, -330], [440, -190], [398, -40], [392, 70], [424, 190], [480, 285], [520, 335]];
export const RIVER_W = 24;
export function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
export function groundY(x, z) {
  const hr = Math.hypot(x - ACROPOLIS.x, z - ACROPOLIS.z);
  let y = 0;
  if (hr < ACROPOLIS.base) { const t = (hr - ACROPOLIS.plateau) / (ACROPOLIS.base - ACROPOLIS.plateau); y = hr < ACROPOLIS.plateau ? ACROPOLIS.top : ACROPOLIS.top * (1 - smooth(0, 1, t)); }
  // the Lykabettos hill north-east and the far mountains
  const lh = Math.hypot(x - 310, z + 470); if (lh < 150) y = Math.max(y, 70 * (1 - smooth(0, 1, lh / 150)));
  const r = Math.hypot(x, z * 0.9 + 20);
  if (r > 760) y = Math.max(y, (smooth(760, 1150, r)) * (90 + 80 * Math.abs(noise(x, z))));
  // the coast: a shallow shelf then the sea floor
  const c = COAST(x);
  if (z > c - 6) y = Math.min(y, -Math.min(14, (z - c + 6) * 0.45) - .4);
  const rd = riverDist(x, z); if (rd < RIVER_W) y -= (1 - rd / RIVER_W) * 1.6;
  return y;
}
export const isSea = (x, z) => z > COAST(x) - 6;

// ------------------------------------------------------------------ the plan
function blockedByLandmark(x, z, pad = 0) {
  for (const L of LANDMARKS) {
    if (L.kind === 'aqueduct' || L.kind === 'walls' || L.kind === 'bridge' || L.kind === 'lighthouse') continue;
    if (Math.hypot(x - L.x, z - L.z) < L.r + pad) return true;
  }
  // the agora square is a rectangle, the stadium is long, the harbour and its market are strips
  if (x > -40 && x < 160 && z > -108 && z < 30) return true;
  if (x > -400 && x < -290 && z > 30 && z < 200) return true;
  if (z > 258) return true;
  if (x > -48 && x < 80 && z > 120 && z < 262) return true;      // the market street strip
  if (Math.hypot(x - ACROPOLIS.x, z - ACROPOLIS.z) < ACROPOLIS.base + 8) return true;
  if (z > -392 && z < -300 && x > -30 && x < 110) return true;  // the library court
  if (Math.abs(z + 215) < 22 && x > 190) return true;            // the aqueduct line
  return riverDist(x, z) < RIVER_W / 2 + 26;
}
export const WALL = { cx: 0, cz: -20, a: 536, b: 452 };
export const insideWall = (x, z, k = 1) => ((x - WALL.cx) / (WALL.a * k)) ** 2 + ((z - WALL.cz) / (WALL.b * k)) ** 2 < 1;
export function districtOf(x, z) {
  let best = 'trading', bd = 1e9;
  for (const d of DISTRICTS) { const v = Math.hypot(x - d.x, z - d.z) / d.r; if (v < bd) { bd = v; best = d.key; } }
  return best;
}
export const isAvenue = (i, j) => i % AVENUE_EVERY === 0 || j % AVENUE_EVERY === 0;

/** The deterministic plan. Tiers only take a shorter prefix of `houses` (ordered core outwards). */
export function planAthens() {
  const lots = [];
  for (let i = -17; i <= 17; i++) for (let j = -14; j <= 10; j++) {
    const x = i * LOT, z = j * LOT;
    if (!insideWall(x, z, .93) || isAvenue(i, j)) continue;
    lots.push({ i, j, x, z, free: !blockedByLandmark(x, z, 2) && !isSea(x, z + 16) });
  }
  // app temples: one lot each, the nearest free lots around the district's civic heart, in rows (organised, never scattered)
  const taken = new Set(), apps = [];
  const heart = { trading: [70, 40], research: [-95, -285], money: [30, 214], life: [-285, -12] };
  for (const g of ['trading', 'research', 'money', 'life']) {
    const list = APPS[g], [hx, hz] = heart[g];
    const order = lots.filter((l) => l.free && !taken.has(l)).sort((p, q) => Math.hypot(p.x - hx, (p.z - hz) * 1.0) - Math.hypot(q.x - hx, (q.z - hz) * 1.0) || p.i - q.i || p.j - q.j);
    let k = 0;
    for (const l of order) {
      if (k >= list.length) break;
      if (districtOf(l.x, l.z) !== g) continue;
      taken.add(l);
      const [id, name, colour, blurb] = list[k++];
      apps.push({ id, name, colour, blurb, group: g, x: l.x, z: l.z, rot: 0 });
    }
    // a district too small for its list spills into the nearest free lots of any district
    for (const l of order) { if (k >= list.length) break; if (taken.has(l)) continue; taken.add(l); const [id, name, colour, blurb] = list[k++]; apps.push({ id, name, colour, blurb, group: g, x: l.x, z: l.z, rot: 0 }); }
  }
  const random = rng(hash32('athens:houses'));
  const houses = [];
  for (const l of lots) {
    if (!l.free || taken.has(l)) continue;
    const dist = districtOf(l.x, l.z);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      if (random() < .1) continue;
      const w = 8.6 + random() * 2, d = 8.6 + random() * 2;
      houses.push({ x: l.x + (a - .5) * 11, z: l.z + (b - .5) * 11, w, d, h: 4.6 + random() * 2.6 + (random() > .9 ? 4 : 0), tone: random(), dist, order: Math.hypot(l.x - 40, l.z + 40) + random() * 40 });
    }
  }
  houses.sort((p, q) => p.order - q.order);
  houses.forEach((h) => { h.y = groundY(h.x, h.z); });
  // trees: olive and cypress groves outside the walls and along the river
  const treeR = rng(hash32('athens:trees')), trees = [];
  for (let n = 0; n < 1400 && trees.length < 520; n++) {
    const x = (treeR() - .5) * 1700, z = (treeR() - .5) * 1500;
    if (insideWall(x, z, 1.02) || isSea(x, z) || riverDist(x, z) < RIVER_W / 2 + 4 || Math.hypot(x - ACROPOLIS.x, z - ACROPOLIS.z) < ACROPOLIS.base) continue;
    if (Math.hypot(x, z) > 820) continue;
    trees.push({ x, z, y: groundY(x, z), s: .8 + treeR() * .9, cypress: treeR() > .6 });
  }
  // market stalls along the market street
  const stalls = [], sr = rng(hash32('athens:stalls'));
  for (let z = 128; z <= 250; z += 9) for (const x of [-30, -12, 40, 60]) if (sr() > .15) stalls.push({ x: x + (sr() - .5) * 2, z, hue: sr() });
  // ships in the harbour: lanes of the basin
  const ships = [];
  for (let n = 0; n < 16; n++) ships.push({ lane: n, x: -150 + (n % 8) * 46, z: 372 + Math.floor(n / 8) * 56 + (n % 3) * 6, speed: n % 5 === 0 ? 1 : 0, ph: n * 1.7, scale: .9 + (n % 4) * .12 });
  return { lots, apps, houses, trees, ships, landmarks: LANDMARKS.map((l) => ({ ...l })), tours: TOURS };
}

// Flying routes: camera points [x, y, z] and look points [x, y, z]; the scene turns them into smooth curves.
export const TOURS = [
  { id: 'grand', name: 'Grand flight', blurb: 'Sea, harbour, agora, Acropolis', secs: 46,
    cam: [[60, 150, 700], [210, 70, 470], [140, 60, 330], [40, 70, 200], [90, 85, 60], [40, 100, -90], [-90, 130, -120], [-250, 140, -320], [-120, 120, -450]],
    look: [[0, 10, 330], [205, 40, 352], [20, 20, 300], [60, 10, 40], [60, 5, -40], [20, 10, -200], [-170, 55, -250], [-170, 45, -250], [-170, 45, -250]] },
  { id: 'harbour', name: 'Harbour run', blurb: 'Ships, ship sheds, the lighthouse', secs: 32,
    cam: [[-260, 60, 520], [-90, 34, 430], [60, 28, 420], [190, 40, 470], [250, 60, 390], [150, 52, 300], [10, 55, 250]],
    look: [[-60, 6, 340], [30, 8, 340], [150, 8, 340], [205, 30, 352], [205, 30, 352], [60, 8, 310], [10, 8, 300]] },
  { id: 'acropolis', name: 'Acropolis climb', blurb: 'Theatre, ramp, the temple', secs: 34,
    cam: [[-160, 24, -30], [-250, 40, -120], [-260, 60, -190], [-210, 90, -300], [-120, 100, -330], [-120, 78, -200], [-170, 120, -150]],
    look: [[-170, 15, -138], [-170, 20, -138], [-170, 50, -178], [-170, 55, -250], [-170, 55, -250], [-170, 50, -250], [-170, 40, -250]] },
  { id: 'aqueduct', name: 'Aqueduct and walls', blurb: 'Arches, bridges, the river', secs: 36,
    cam: [[560, 80, -380], [470, 40, -260], [380, 30, -160], [300, 36, -170], [220, 40, -190], [300, 70, -60], [430, 50, 40]],
    look: [[440, 12, -220], [400, 14, -215], [300, 10, -215], [220, 10, -215], [330, 8, -215], [400, 6, 0], [392, 4, 78]] },
  { id: 'night', name: 'Dusk over the city', blurb: 'A high slow orbit', secs: 40,
    cam: [[0, 330, 420], [380, 300, 180], [330, 280, -260], [0, 300, -520], [-380, 300, -200], [-330, 280, 200], [0, 330, 420]],
    look: [[0, 0, 0], [0, 0, 0], [0, 0, -20], [0, 0, -20], [0, 0, 0], [0, 0, 0], [0, 0, 0]] },
];
