// Where everything stands in the Data City (pure: no three.js, no DOM).
//   layout(model) -> { items, districts, tiles, blocks, streets, harbor, bounds }
//     items      one per building / strategy tower / discovery monument / ship: x, z, height, width, colour, lit share, pulse
//     districts  every section of the model, packed round the plaza (largest free spot on a spiral): name, centre, size
//     tiles      the LOD and culling unit: TILE x TILE blocks of one district (the scene draws a tile as one instanced mesh
//                near the camera and as impostor blocks far away)
//     blocks     BLOCK x BLOCK lots between two streets (one impostor each)
// A district is a square grid of lots with a street every BLOCK lots; its best buildings stand in the middle (gold, then
// green, amber, grey: the noise is the outskirts) so every district has a skyline.
import { COLORS, clsRank } from './util.js';
import { archIndex, familyOf, litOf, steadiness } from './kinds.js';
import { satellitePlan } from './satellites.js?v=dcgfx1';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

export const LOT = 2.2;              // one lot (world units)
export const BLOCK = 6;              // lots a block side
export const TILE = 4;               // blocks a tile side
const BW = 1.45;                     // building width
const STREET_W = 2.6;                // a street between two blocks
const PLAZA_R = 34;                  // the plaza (LIT tower, the discoveries, the billboards)
const MARGIN = 7;                    // between two districts
const MONUMENT_RING = 15;
const hex = (s, d = (NEON ? 0xe9ecf6 : 0xb2cadc)) => (/^#[0-9a-f]{6}$/i.test(s || '') ? parseInt(s.slice(1), 16) : d);

/** Height of a combination's building from its $ per trade per micro (losers are short stubs). */
export function heightOf(e) {
  return e > 0 ? 1.1 + Math.pow(e, 0.85) * 0.42 : 0.9 + Math.max(-0.45, e * 0.01);
}

/** Lit windows: the share of a building's windows that are on, from its number of trades (1,000+ = all). */
export function litShare(n) {
  return Math.min(1, Math.log10(Math.max(1, n || 1)) / 3);
}

/** The cells of a square district of n lots, nearest the middle first: [x, z, col, row] relative to its centre. */
function cellsOf(n, lot = LOT) {
  const S = Math.max(1, Math.ceil(Math.sqrt(n)));
  const off = (i) => i * lot + Math.floor(i / BLOCK) * STREET_W;
  const span = off(S - 1) + lot;
  const cells = [];
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) cells.push([off(c) - span / 2 + lot / 2, off(r) - span / 2 + lot / 2, c, r]);
  cells.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]) || a[3] - b[3] || a[2] - b[2]);
  return { S, half: span / 2, cells: cells.slice(0, n), off, span };
}

/** Greedy spiral packing of squares round the plaza, the biggest first (a dense skyline round the plaza): the first free
 *  spot on a spiral, starting at a golden-angle offset. Returns the spots in the input order. */
function pack(halves) {
  const placed = [], out = new Array(halves.length);
  const order = halves.map((h, i) => i).sort((a, b) => halves[b] - halves[a] || a - b);
  order.forEach((i, rank) => {
    const h = halves[i];
    const a0 = rank * 2.39996 + 0.6;
    for (let r = PLAZA_R + h + MARGIN; ; r += 3) {
      const steps = Math.max(12, Math.ceil((2 * Math.PI * r) / 4));
      let hit = null;
      for (let s = 0; s < steps && !hit; s++) {
        const a = a0 + (s / steps) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        const clear = Math.hypot(Math.max(0, Math.abs(x) - h), Math.max(0, Math.abs(z) - h)) >= PLAZA_R + MARGIN;   // the plaza stays free
        if (clear && placed.every((p) => Math.abs(p.x - x) >= p.h + h + MARGIN || Math.abs(p.z - z) >= p.h + h + MARGIN)) hit = { x, z, h };
      }
      if (hit) { placed.push(hit); out[i] = hit; break; }
    }
  });
  return out;
}

function dressBuilding(b, color, D) {
  const plugin = b.plugin && !['gold', 'green', 'amber', 'grey'].includes(b.cls);
  const fam = familyOf(b, D);
  // v3: the building type comes from the idea family, the lit windows tell the data (lit = holds in both periods)
  return { h: heightOf(b.e || 0), w: BW, color: plugin ? color : COLORS[b.cls] ?? COLORS.grey, lit: plugin ? 0.6 : litOf(b),
           pulse: b.tr === 'rising' ? 1 : 0, fam, arch: archIndex(fam), steady: plugin ? 0.6 : steadiness(b) };
}

export function layout(model) {
  const items = [], districts = [], tiles = [], blocks = [], streets = [];
  const secs = model.sections.map((s) => ({ s, list: [...s.items].sort((a, b) => clsRank(a.cls) - clsRank(b.cls) || (b.e || 0) - (a.e || 0)) }));
  if (model.strategies?.length) secs.push({ s: { key: 'strategies', name: 'STRATEGIES', color: (NEON ? '#c9b8ff' : '#dba875'), kind: 'towers', blurb: 'The discoveries sized like the bot, with MFFU eval odds' }, list: model.strategies, lot: LOT * 2.4 });
  const grids = secs.map((x) => cellsOf(x.list.length, x.lot || LOT));
  const spots = pack(grids.map((g) => g.half));
  secs.forEach(({ s, list, lot }, k) => {
    const g = grids[k], { x: cx, z: cz } = spots[k], color = hex(s.color);
    const nb = Math.ceil(g.S / BLOCK), nt = Math.ceil(nb / TILE);
    const d = { key: s.key, name: s.name, blurb: s.blurb || '', color, css: s.color || (NEON ? '#e9ecf6' : '#b2cadc'), cx, cz, half: g.half, n: list.length,
                kind: s.kind || 'combos', plugin: !!s.plugin, tested: s.tested, fdr: s.fdr, gold: s.gold, tried: s.tried };
    districts.push(d);
    const tileIx = new Map(), blockIx = new Map();
    list.forEach((b, i) => {
      const [x, z, col, row] = g.cells[i];
      const bx = Math.floor(col / BLOCK), bz = Math.floor(row / BLOCK), tk = Math.floor(bx / TILE) * nt + Math.floor(bz / TILE);
      if (!tileIx.has(tk)) { tileIx.set(tk, tiles.length); tiles.push({ d: districts.length - 1, items: [], blocks: [], cx: 0, cz: 0, r: 0 }); }
      const bk = bx * nb + bz;
      if (!blockIx.has(bk)) {
        const t = tileIx.get(tk);
        blockIx.set(bk, blocks.length);
        tiles[t].blocks.push(blocks.length);
        blocks.push({ tile: t, d: districts.length - 1, items: [], x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9 });
      }
      const it = s.kind === 'towers'
        ? { kind: 's', b, x: cx + x, z: cz + z, h: 3 + Math.sqrt(Math.max(0, b.spans?.['2026']?.per_month || 0)) * 0.32, w: 2.6, color: COLORS.strat, lit: 0.8, pulse: 0, fam: 'other', arch: archIndex('break'), steady: 0.8 }
        : { kind: 'b', b, x: cx + x, z: cz + z, ...dressBuilding(b, color, model.D) };
      it.tile = tileIx.get(tk);
      it.block = blockIx.get(bk);
      it.d = districts.length - 1;
      const B = blocks[it.block];
      B.items.push(items.length);
      B.x0 = Math.min(B.x0, it.x - it.w / 2); B.x1 = Math.max(B.x1, it.x + it.w / 2);
      B.z0 = Math.min(B.z0, it.z - it.w / 2); B.z1 = Math.max(B.z1, it.z + it.w / 2);
      tiles[it.tile].items.push(items.length);
      items.push(it);
    });
    // the district's streets: one between every two blocks, both ways, and the boulevard from the plaza
    for (let k2 = 1; k2 < nb; k2++) {
      const at = g.off(k2 * BLOCK) - STREET_W / 2 - g.span / 2;
      streets.push([cx + at, cz - g.half, cx + at, cz + g.half], [cx - g.half, cz + at, cx + g.half, cz + at]);
    }
    const len = Math.hypot(cx, cz) || 1;
    streets.push([(cx / len) * (PLAZA_R - 6), (cz / len) * (PLAZA_R - 6), cx - (cx / len) * g.half, cz - (cz / len) * g.half]);
  });
  for (const t of tiles) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, hm = 0;
    for (const i of t.items) { const it = items[i]; x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x); z0 = Math.min(z0, it.z); z1 = Math.max(z1, it.z); hm = Math.max(hm, it.h); }
    Object.assign(t, { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 + 2, hmax: hm });
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, b = ((i + 1) / 24) * Math.PI * 2, r = PLAZA_R - 6;
    streets.push([Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r, Math.sin(b) * r]);
  }
  // the discoveries: monuments round the plaza
  const monuments = (model.discoveries || []).filter((x) => x.id).map((x) => ({ ...(model.byId.get(x.id) || {}), ...x }));
  monuments.forEach((b, i) => {
    const a = (i / monuments.length) * Math.PI * 2 + 0.3;
    items.push({ kind: 'd', b, x: Math.cos(a) * MONUMENT_RING, z: Math.sin(a) * MONUMENT_RING, h: 7 + Math.max(0, b.e || 0) * 0.12, w: 1.9,
                 color: b.cls === 'gold' ? COLORS.gold : COLORS.monument, lit: 0.95, pulse: b.tr === 'rising' ? 1 : 0, tile: -1, block: -1, d: -1,
                 fam: 'sweep', arch: archIndex('sweep'), steady: 1 });
  });
  let x0 = -PLAZA_R, z0 = -PLAZA_R, x1 = PLAZA_R, z1 = PLAZA_R;
  for (const d of districts) { x0 = Math.min(x0, d.cx - d.half); x1 = Math.max(x1, d.cx + d.half); z0 = Math.min(z0, d.cz - d.half); z1 = Math.max(z1, d.cz + d.half); }
  const harbor = harborOf(model.harbor, x0, x1, z1);
  if (harbor) {
    for (const s of harbor.ships) { s.d = districts.length; items.push(s); }
    z1 = harbor.z1;
    districts.push({ key: 'harbor', name: 'HARBOR', blurb: model.harbor.note || '', color: (NEON ? 0x3fd8ff : 0xd39556), css: (NEON ? '#3fd8ff' : '#d39556'), cx: (x0 + x1) / 2, cz: harbor.cz,
                     half: Math.min((x1 - x0) / 2, harbor.depth / 2 + 6), n: harbor.ships.length, kind: 'harbor', wide: true, w: x1 - x0 });
  }
  const satellites = satellitePlan(districts, PLAZA_R);
  streets.push(...satellites.streets);
  return { items, districts, tiles, blocks, streets, harbor, satellites, worldRadius: satellites.worldRadius, plazaR: PLAZA_R, bounds: { x0, z0, x1, z1 } };
}

/** The Harbor: one ship per trade of the live bot (oldest at the far pier), along a waterfront south of the city. */
function harborOf(h, x0, x1, zEdge) {
  if (!h || !Array.isArray(h.rows) || !h.rows.length) return null;
  const ix = Object.fromEntries((h.cols || []).map((k, i) => [k, i]));
  const rows = h.rows, width = Math.max(80, x1 - x0 - 20), per = Math.max(20, Math.floor(width / 3.4));
  const piers = Math.ceil(rows.length / per), z0 = zEdge + 16, depth = piers * 7 + 14;
  const top = Math.max(1, ...rows.map((r) => Math.abs(r[ix.pnl] || 0)));
  const ships = rows.map((r, i) => {
    const pnl = r[ix.pnl] || 0, pier = Math.floor(i / per), k = i % per;
    return { kind: 'ship', b: { id: `trade:${i}`, day: r[ix.day], dir: r[ix.dir], R: r[ix.r], pnl, exit: r[ix.exit], lab: `LIT trade ${r[ix.day]}` },
             x: x0 + 14 + k * 3.4, z: z0 + 7 + pier * 7, h: 0.5, w: 0.9 + 2.4 * Math.sqrt(Math.abs(pnl) / top),
             color: pnl >= 0 ? COLORS.win : COLORS.loss, lit: 0.6, pulse: 0, tile: -1, block: -1, d: -2, fam: 'ship', arch: archIndex('ship'), steady: 0.5 };
  });
  return { ships, x0: x0 - 10, x1: x1 + 10, z0, z1: z0 + depth, cz: z0 + depth / 2, depth, piers, per };
}
