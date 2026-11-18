// MINT CITY core (ES module, no DOM, no network): the five money streams -> a deterministic city plan (districts, buildings, the golden pillar), the camera tours and the words.
// Heights follow each stream's ESTIMATE (dollars a month); the central pillar follows the combined estimate. Pure, so the tests call it in node. Everything money is an estimate, never income.
export const IDS = ['chrysos', 'mercury', 'sibyl', 'oikos', 'arbiter'];
export const DISTRICTS = {
  chrysos: { name: 'Chrysos', place: 'The treasury tower', role: 'Prop-firm eval and payout planner', accent: '#c8a24a', href: '../chrysos/' },
  mercury: { name: 'Mercury', place: 'The market stalls', role: 'Prop-firm and tool deals', accent: '#e0b060', href: '../mercury/' },
  sibyl: { name: 'Sibyl', place: 'The oracle temple', role: 'Kalshi study: paper-worthy bets (paper)', accent: '#4b7a99', href: '../sibyl/' },
  oikos: { name: 'Oikos', place: 'The household quarter', role: 'Household money leaks from your Ledger', accent: '#7f8a52', href: '../oikos/' },
  arbiter: { name: 'Arbiter', place: 'The harbour with scales', role: 'Spread and funding ideas (paper)', accent: '#c96a4a', href: '../arbiter/' },
};
export const STATUS = { ok: 'Live', stale: 'Old data', sample: 'Example', none: 'No data' };
export const RANGE = { ok: [0.3, 1.5], stale: [0, 1.2], sample: [0, 2], none: [0, 0] };
export const RING = 24;              // distance of a district centre from the golden pillar (metres in the scene)
export const MAX_H = 15;             // the tallest district feature (a stream with the biggest estimate)
export const MIN_H = 1.6;
export const LOD_NEAR = { high: 74, mid: 52, low: 34 };   // camera distance under which a district shows its detail, over which it shows its single block
export const TIER_KEEP = { high: 1, mid: 0.6, low: 0.35 };  // share of the decorative buildings kept per tier

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);
export function money(v) { if (!isNum(v)) return '-'; const r = Math.round(Math.abs(v)); return (v < 0 ? '-$' : '$') + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function rangeText(lo, hi) {
  if (!(isNum(lo) && isNum(hi))) return 'no range yet';
  return lo < 0 ? `a loss of ${money(-lo)} a month to ${money(hi)} a month` : `${money(lo)} to ${money(hi)} a month`;       // a negative low end is a LOSS in words, never "-$42 to ..."
}
/** the worst case in plain words: a negative low end is said as a loss */
export function worstText(lo) { return !isNum(lo) ? 'no worst case yet' : lo < 0 ? `Worst case: you could lose about ${money(-lo)} a month.` : `Worst case: about ${money(lo)} a month.`; }
/** the range bar in percent of the bar's width. The bar spans the smaller of the low end and 0 up to the larger of the high end and the estimate; zero is marked when the low end is a loss. */
export function rangeBar(lo, base, hi) {
  if (!isNum(lo) || !isNum(hi)) return { left: 0, width: 0, mark: 0, zero: null, neg: false };
  const b = isNum(base) ? base : (lo + hi) / 2, min = Math.min(lo, 0), max = Math.max(hi, b, 0.01), span = max - min || 1, pc = (v) => Math.max(0, Math.min(100, Math.round(((v - min) / span) * 100)));
  return { left: pc(lo), width: Math.max(1, pc(hi) - pc(lo)), mark: pc(b), zero: lo < 0 ? pc(0) : null, neg: lo < 0 };
}
export function ageText(min) { if (!isNum(min) || min < 0) return 'no date'; if (min < 2) return 'just now'; if (min < 90) return `${Math.round(min)} min ago`; if (min < 2880) return `${Math.round(min / 60)} h ago`; return `${Math.round(min / 1440)} days ago`; }

/** seeded random (mulberry32) so the city is the same every visit */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** one stream (index row) -> a safe district record; unknown or missing -> "No data" (never throws) */
export function normStream(id, raw) {
  const r = raw && typeof raw === 'object' ? raw : {}, D = DISTRICTS[id] || { name: txt(id), place: '', role: '', accent: '#c8a24a', href: '#' };
  const head = typeof r.headline === 'string' ? r.headline : txt(r.headline && r.headline.text);
  const status = ['ok', 'stale', 'sample'].includes(r.status) ? r.status : head ? 'stale' : 'none';
  const um = r.usd_month && typeof r.usd_month === 'object' ? r.usd_month : { base: r.headline && r.headline.usd_month };
  const base = isNum(um.base) ? um.base : null, rg = RANGE[status];
  return { id, name: D.name, place: D.place, role: txt(r.role, 80) || D.role, accent: D.accent, href: D.href, status, statusText: STATUS[status], age: isNum(r.age_min) ? r.age_min : null,
    headline: head || 'No data yet for this stream.', base, low: isNum(um.low) ? um.low : base == null ? null : base * rg[0], high: isNum(um.high) ? um.high : base == null ? null : base * rg[1] };
}
export function streamsFrom(idx) { const rows = idx && Array.isArray(idx.streams) ? idx.streams : []; return IDS.map((id) => normStream(id, rows.find((s) => s && s.id === id))); }
export function combine(streams) {
  let lo = 0, base = 0, hi = 0, n = 0, sample = 0;
  for (const s of streams) { if (s.status === 'sample') sample++; if (s.base == null) continue; n++; lo += s.low; base += s.base; hi += s.high; }
  const allSample = streams.length > 0 && sample === streams.length;
  return { low: lo, base, high: hi, n, sample, allSample, text: n ? (lo < 0 ? `About ${money(base)} a month (an estimate). Worst case: you could lose about ${money(-lo)} a month; at best about ${money(hi)}.` : `About ${money(base)} a month (an estimate), anywhere from ${money(lo)} to ${money(hi)}.`) : 'No estimate yet: no stream has reported a number.',
    why: allSample ? 'Example numbers, not real finds.' : sample ? `${sample} of 5 districts still show examples.` : 'Every district reports live numbers.' };
}

/** heights: a district's feature height from its estimate (linear in the dollars; no number = the lowest) */
export function heights(streams) {
  const top = Math.max(1, ...streams.map((s) => (s.base == null ? 0 : s.base)));
  return streams.map((s) => (s.base == null ? MIN_H : MIN_H + (MAX_H - MIN_H) * Math.max(0, Math.min(1, s.base / top))));
}
/** the golden pillar: from the combined estimate (a pillar of 30 m at $3,000 a month or more, never under 6 m) */
export function pillarHeight(base) { return isNum(base) && base > 0 ? 6 + 24 * Math.min(1, base / 3000) : 6; }
export function districtCenter(i, n) { const a = (i / (n || 5)) * Math.PI * 2 - Math.PI / 2; return { x: Math.cos(a) * RING, z: Math.sin(a) * RING, a }; }

// ------------------------------------------------------------------------------------------------ the buildings (kinds: box, cyl, roof; colours: marble, gold, bronze, terra, olive, aegean)
const B = (k, x, y, z, sx, sy, sz, c, ry) => ({ k, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), sx: +sx.toFixed(2), sy: +sy.toFixed(2), sz: +sz.toFixed(2), c, ry: ry || 0 });
const box = (x, z, sx, sy, sz, c, ry) => B('box', x, sy / 2, z, sx, sy, sz, c, ry);
const cyl = (x, z, r, h, c, y0) => B('cyl', x, (y0 || 0) + h / 2, z, r * 2, h, r * 2, c, 0);
const roof = (x, y, z, sx, sy, sz, c, ry) => B('roof', x, y + sy / 2, z, sx, sy, sz, c, ry);

/** the buildings of one district in LOCAL coordinates (x, z around 0, radius ~9). H = the district's feature height. `keep` thins the decorative ones (not the landmark). */
export function districtPlan(id, H, keep) {
  const r = rng(seedOf(id)), out = [], k = isNum(keep) ? keep : 1, thin = () => r() < k;
  if (id === 'chrysos') {                                  // the treasury tower: stepped base, the tower, a ring of columns, vault blocks
    out.push(box(0, 0, 8, 0.5, 8, 'marble'), box(0, 0, 6, 0.9, 6, 'marble'));
    out.push(box(0, 0, 2.6, H, 2.6, 'gold'), roof(0, H, 0, 3.4, 1.6, 3.4, 'bronze'));
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (thin()) out.push(cyl(Math.cos(a) * 5.4, Math.sin(a) * 5.4, 0.28, 1.6 + H * 0.18, 'marble')); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3, d = 7.6 + r() * 1.2; if (thin()) out.push(box(Math.cos(a) * d, Math.sin(a) * d, 1.6 + r(), 0.8 + H * (0.08 + r() * 0.12), 1.6 + r(), r() < 0.5 ? 'bronze' : 'marble', a));
    }
  } else if (id === 'mercury') {                           // market stalls in rows, a market hall
    out.push(box(0, 0, 5.2, 0.5 + H * 0.2, 3.2, 'marble'), roof(0, 0.5 + H * 0.2, 0, 5.8, 0.9 + H * 0.05, 3.8, 'terra'));
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      if ((Math.abs(i) < 2 && Math.abs(j) < 2) || !thin()) continue;
      const x = i * 2.3 + (r() - 0.5) * 0.3, z = j * 2.3 + (r() - 0.5) * 0.3, h = 0.7 + r() * 0.4 + H * 0.05;
      out.push(box(x, z, 1.5, h, 1.3, 'marble'), roof(x, h, z, 1.9, 0.35 + r() * 0.2, 1.7, r() < 0.5 ? 'terra' : 'gold'));
    }
  } else if (id === 'sibyl') {                             // the oracle temple: steps, a ring of columns, the cella, the pediment
    out.push(box(0, 0, 10, 0.35, 7, 'marble'), box(0, 0, 9, 0.7, 6, 'marble'));
    const ch = 2.2 + H * 0.45;
    for (let i = 0; i < 7; i++) for (const z of [-2.5, 2.5]) out.push(cyl(-3.6 + i * 1.2, z, 0.32, ch, 'marble', 0.7));
    out.push(B('box', 0, 0.7 + ch / 2, 0, 6.2, ch, 3.2, 'aegean'), B('box', 0, 0.7 + ch + 0.15, 0, 8.4, 0.3, 5.8, 'marble'));
    out.push(roof(0, 0.7 + ch + 0.3, 0, 8.6, 1.6 + H * 0.06, 6.2, 'terra'));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (thin()) out.push(cyl(Math.cos(a) * 8, Math.sin(a) * 8, 0.18, 1.2 + r(), 'gold')); }
  } else if (id === 'oikos') {                             // the household quarter: courtyards of houses, small trees
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if (i === 0 && j === 0) { out.push(cyl(0, 0, 0.5, 2.4 + H * 0.1, 'olive'), B('cyl', 0, 2.4 + H * 0.1 + 0.6, 0, 1.8, 1.2, 1.8, 'olive', 0)); continue; }
      if (!thin()) continue;
      const x = i * 3.4 + (r() - 0.5) * 0.4, z = j * 3.4 + (r() - 0.5) * 0.4, h = 1.2 + r() * 1.0 + H * 0.12, s = 2 + r() * 0.6;
      out.push(box(x, z, s, h, s, r() < 0.5 ? 'marble' : 'terra'), roof(x, h, z, s + 0.4, 0.8 + r() * 0.4, s + 0.4, 'bronze'));
    }
  } else if (id === 'arbiter') {                           // the harbour: a quay, warehouses, masts and the great scales
    out.push(box(0, 3.6, 14, 0.5, 3.4, 'marble'), box(0, 5.8, 17, 0.2, 3, 'aegean'));
    for (let i = 0; i < 5; i++) if (thin() || i === 2) out.push(box(-5 + i * 2.6, 2, 2, 1.2 + r() * 0.8, 2.6, 'terra'), roof(-5 + i * 2.6, 1.8, 2, 2.3, 0.6, 2.9, 'bronze'));
    for (let i = 0; i < 4; i++) if (thin()) { const x = -6 + i * 4 + r(), h = 3 + r() * 2 + H * 0.2; out.push(cyl(x, 6.4, 0.1, h, 'bronze')); }
    const sh = 2.4 + H * 0.55;                              // the scales: a post, a beam and two pans, as tall as the estimate
    out.push(cyl(0, -1.5, 0.35, sh, 'gold'), B('box', 0, sh + 0.14, -1.5, 7, 0.28, 0.4, 'gold'));
    out.push(B('cyl', -3.2, sh - 1.4, -1.5, 2.4, 0.18, 2.4, 'bronze', 0), B('cyl', 3.2, sh - 1.8, -1.5, 2.4, 0.18, 2.4, 'bronze', 0), box(0, -1.5, 2.2, 0.5, 2.2, 'marble'));
  }
  return out;
}
/** the whole city's decorative filler: low marble blocks in rings outside the districts, so the city feels giant (n blocks, seeded) */
export function fillerPlan(n, keep) {
  const r = rng(7), out = [], total = Math.round((n || 260) * (isNum(keep) ? keep : 1));
  for (let i = 0; i < total; i++) {
    const ring = 42 + r() * 38, a = r() * Math.PI * 2, h = 1.2 + r() * r() * 7, w = 1.6 + r() * 2.4;
    out.push(box(Math.cos(a) * ring, Math.sin(a) * ring, w, h, w * (0.8 + r() * 0.5), r() < 0.15 ? 'terra' : 'marble', a));
  }
  return out;
}
/** the full plan: world coordinates, ready to instance. -> { districts: [{id, cx, cz, H, parts: [..]}], filler, pillar: { h } } */
export function cityPlan(streams, tier) {
  const keep = TIER_KEEP[tier] || 1, Hs = heights(streams), c = combine(streams);
  const districts = streams.map((s, i) => {
    const ctr = districtCenter(i, streams.length), rot = ctr.a + Math.PI / 2, co = Math.cos(rot), si = Math.sin(rot);
    const parts = districtPlan(s.id, Hs[i], keep).map((b) => ({ ...b, x: +(ctr.x + b.x * co - b.z * si).toFixed(2), z: +(ctr.z + b.x * si + b.z * co).toFixed(2), ry: +(b.ry - rot).toFixed(3) }));
    return { id: s.id, cx: +ctr.x.toFixed(2), cz: +ctr.z.toFixed(2), H: +Hs[i].toFixed(2), base: s.base == null ? null : s.base, parts };   // base: the 3D tablet's dollars
  });
  return { districts, filler: fillerPlan(260, keep), pillar: { h: +pillarHeight(c.base).toFixed(2), base: c.base } };
}
export const count = (plan) => plan.districts.reduce((n, d) => n + d.parts.length, 0) + plan.filler.length;

// ------------------------------------------------------------------------------------------------ the camera: orbit pose and tours
const lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
/** an orbit pose { yaw, pitch, dist, tx, tz } -> a camera { pos: [x,y,z], look: [x,y,z] } */
export function poseToCam(p) {
  const cp = Math.cos(p.pitch);
  return { pos: [p.tx + Math.sin(p.yaw) * cp * p.dist, Math.sin(p.pitch) * p.dist + 2, p.tz + Math.cos(p.yaw) * cp * p.dist], look: [p.tx, 4, p.tz] };
}
export const OVERVIEW = { yaw: 0.5, pitch: 0.62, dist: 72, tx: 0, tz: 0 };
/** the pose that looks at district i from the pillar side */
export function focusPose(i, n) { const c = districtCenter(i, n || 5); return { yaw: Math.atan2(c.x, c.z) + 0.35, pitch: 0.38, dist: 26, tx: c.x, tz: c.z }; }
export function lerpPose(a, b, t) { const k = ease(Math.max(0, Math.min(1, t))); let dy = b.yaw - a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; return { yaw: a.yaw + dy * k, pitch: lerp(a.pitch, b.pitch, k), dist: lerp(a.dist, b.dist, k), tx: lerp(a.tx, b.tx, k), tz: lerp(a.tz, b.tz, k) }; }
export const TOURS = { overview: 'Overview', fly: 'Fly through', pillar: 'The golden pillar' };
export const TOUR_MS = { fly: 30000, pillar: 8000 };
/** a tour at time t (ms since it started) -> a pose. fly = overview, then each district for 5 s, back to overview. pillar = a slow turn round the golden pillar. */
export function tourPose(name, t, n) {
  n = n || 5;
  if (name === 'pillar') { return { yaw: (t / 8000) * Math.PI * 2, pitch: 0.3, dist: 20, tx: 0, tz: 0 }; }
  if (name !== 'fly') return OVERVIEW;
  const seg = 5000, total = TOUR_MS.fly, tt = ((t % total) + total) % total, stops = [OVERVIEW]; for (let i = 0; i < n; i++) stops.push(focusPose(i, n));
  const i = Math.min(stops.length - 1, Math.floor(tt / seg)), f = (tt - i * seg) / seg, next = stops[i + 1] || OVERVIEW;
  return lerpPose(stops[i], next, f < 0.5 ? 0 : (f - 0.5) * 2);   // hold, then glide to the next stop
}
/** the LOD rule: a district shows its detail under the near distance, otherwise its single block */
export function lodDetail(camDist, tier) { return camDist <= (LOD_NEAR[tier] || LOD_NEAR.high); }

export function jarvisCard(streams, nowMs) {
  const c = combine(streams);
  return { v: 1, name: 'Mint City', status: { level: c.allSample ? 'off' : 'ok', label: c.allSample ? 'Example numbers' : 'Estimate' },
    kpis: [{ label: 'Estimate / month', value: money(c.base) }, { label: 'Range', value: c.low < 0 ? `${money(c.low)} to ${money(c.high)}` : `${money(c.low)}-${money(c.high)}` }, { label: 'Districts', value: '5' }],
    lines: [c.why], t: Math.floor((isNum(nowMs) ? nowMs : 0) / 1000), open: '#', theme: '#14110e', stale_after: 21600 };
}
