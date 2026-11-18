// What kind of building an idea is, and what its windows say (pure: no three.js, no DOM). Used by layout.js, skyline.js and the UI.
//   FAMILIES        the ten idea families (the trigger of the combination) and the building type each one gets
//   familyOf(b, D)  'sweep' | 'break' | 'fvg' | ... | 'plugin'
//   holdOf(b)       'both' | 'one' | 'none': does it make money in 2021-25 AND in 2026 (the two halves)? gold = also every year
//   litOf(b)        the share of lit windows: it tells the data (lit = holds in both periods; sample size adds a little)
//   ARCH            the building types as numbers the shader reads (height steps, crown, roundness, glass share)
//   parseQuery()    plain-words search: 'NY afternoon', 'london short', 'sweep rising' -> a matcher over an idea
//   council()       the Council of ideas: each family votes from the city's own numbers
//   standing()      how the city grew: the idea as it stood at the end of a year (from its per-year numbers)
//   MILESTONES      what the timeline says in plain words

// (the same two formulas as layout.js, kept here so this file has no import cycle)
const heightOf = (e) => (e > 0 ? 1.1 + Math.pow(e, 0.85) * 0.42 : 0.9 + Math.max(-0.45, e * 0.01));
const litShare = (n) => Math.min(1, Math.log10(Math.max(1, n || 1)) / 3);

/** one family = one kind of building. tier arrays: [y1, y2, crown, round] [s0b, s0t, s1b, s1t] [s2b, s2t, glass, rough] */
export const FAMILIES = [
  { key: 'slot', name: 'Time slots', look: 'slab', blurb: 'Plain slabs: a trade at a set clock time', arch: [0.70, 0.92, 0.00, 0.0, 1.00, 1.00, 0.90, 0.90, 0.78, 0.78, 0.30, 0.55] },
  { key: 'sweep', name: 'Sweeps', look: 'spire', blurb: 'Spires: price took out a high or low, then turned', arch: [0.55, 0.84, 0.30, 0.0, 1.00, 0.92, 0.92, 0.70, 0.55, 0.03, 0.75, 0.22] },
  { key: 'break', name: 'Breaks', look: 'ziggurat', blurb: 'Stepped towers: price broke through a level', arch: [0.40, 0.70, 0.06, 0.0, 1.00, 1.00, 0.78, 0.78, 0.55, 0.55, 0.30, 0.45] },
  { key: 'fvg', name: 'Fair value gaps', look: 'waist', blurb: 'Waisted towers: a gap left in the chart', arch: [0.38, 0.72, 0.10, 0.0, 1.00, 0.94, 0.58, 0.58, 1.00, 1.00, 0.60, 0.25] },
  { key: 'ifvg', name: 'Inverted gaps', look: 'flare', blurb: 'Flared towers: a gap that was filled and flipped', arch: [0.30, 0.78, 0.00, 0.0, 0.58, 0.58, 0.72, 1.00, 1.00, 0.86, 0.65, 0.25] },
  { key: 'cisd', name: 'CISD', look: 'cylinder', blurb: 'Round glass towers: the change in the delivery of price', arch: [0.78, 0.93, 0.10, 1.0, 1.00, 1.00, 0.88, 0.88, 0.52, 0.52, 0.95, 0.10] },
  { key: 'disp', name: 'Displacement', look: 'obelisk', blurb: 'Tapering obelisks: a fast, strong move', arch: [0.34, 0.67, 0.12, 0.0, 1.00, 0.82, 0.82, 0.64, 0.64, 0.30, 0.55, 0.30] },
  { key: 'vwap', name: 'VWAP', look: 'drum', blurb: 'Drums: price against the day\'s average', arch: [0.70, 0.92, 0.00, 1.0, 1.00, 1.00, 0.82, 0.82, 0.58, 0.40, 0.45, 0.35] },
  { key: 'gapfill', name: 'Gap fills', look: 'terraces', blurb: 'Wide terraces: an opening gap that closes', arch: [0.50, 0.80, 0.00, 0.0, 1.00, 1.00, 0.72, 0.72, 0.42, 0.42, 0.20, 0.60] },
  { key: 'news', name: 'News', look: 'mast', blurb: 'Masts: big-news days', arch: [0.55, 0.80, 0.42, 0.0, 1.00, 0.70, 0.62, 0.62, 0.28, 0.18, 0.40, 0.40] },
  { key: 'plugin', name: 'Plug-ins', look: 'block', blurb: 'Blocks: other data sources plugged into the city', arch: [0.80, 0.94, 0.00, 0.0, 1.00, 1.00, 0.94, 0.94, 0.80, 0.80, 0.30, 0.50] },
  { key: 'other', name: 'Landmarks and strategies', look: 'block', blurb: 'Plain blocks', arch: [0.80, 0.94, 0.00, 0.0, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 0.35, 0.50] },
  { key: 'ship', name: 'Ships', look: 'hull', blurb: 'Hull, deckhouse and funnel: one LIT trade', arch: [0.50, 0.80, 0.10, 0.0, 0.60, 1.00, 0.50, 0.50, 0.22, 0.20, 0.20, 0.50] },
];
export const ARCH = FAMILIES.map((f) => f.arch);          // at most 16 (the shader's tables)
const FAM_IX = new Map(FAMILIES.map((f, i) => [f.key, i]));
/** the families a viewer can filter by (the ten idea families) */
export const IDEA_FAMILIES = FAMILIES.filter((f) => !['plugin', 'other', 'ship'].includes(f.key));
export const archIndex = (key) => FAM_IX.get(key) ?? FAM_IX.get('other');

export function familyOf(b, D) {
  if (!b) return 'other';
  if (b.plugin) return 'plugin';
  let key = '';
  if (b.code && D) key = D.trigs[b.code[0]]?.[0] || '';
  else if (typeof b.id === 'string') key = b.id.split('|')[0];
  const f = key.split('_')[0];
  return FAM_IX.has(f) ? f : 'other';
}

/** does it make money in both periods (2021-25 and 2026)? */
export function holdOf(b) {
  if (!b) return 'none';
  if (b.plugin) return b.cls === 'gold' || b.cls === 'green' ? 'both' : b.value > 0 ? 'one' : 'none';
  const a = (b.e26 ?? b.e ?? 0) > 0, c = (b.eo ?? b.e ?? 0) > 0;
  return a && c ? 'both' : a || c ? 'one' : 'none';
}
export const HOLD_SCORE = { both: 0.78, one: 0.42, none: 0.12 };

/** lit windows tell the data: holds in both periods (+ every year = all), one period = half, none = a few; sample size adds a little */
export function litOf(b) {
  const h = holdOf(b), base = HOLD_SCORE[h] + (b?.cls === 'gold' ? 0.22 : 0);
  return Math.max(0.05, Math.min(1, base * 0.82 + litShare(b?.n) * 0.18));
}

/** the one number the facade shader reads for "how stable": 1 gold, 0.8 both, 0.4 one, 0.1 none */
export function steadiness(b) {
  if (b?.cls === 'gold') return 1;
  const h = holdOf(b);
  return h === 'both' ? 0.8 : h === 'one' ? 0.4 : 0.1;
}

// ------------------------------------------------------------------------------------------------ search in plain words
/** word -> the text a label must contain (any of them), and/or a predicate on the idea */
const SYN = [
  [/^(afternoon|pm|aft|late)$/, { any: ['ny pm'] }],
  [/^(morning|am|open|opening)$/, { any: ['ny am'] }],
  [/^(lunch|midday|noon)$/, { any: ['ny lunch'] }],
  [/^(pre|premarket|pre-market|preopen|pre-open|before)$/, { any: ['pre-open'] }],
  [/^(london|europe|european|eu)$/, { any: ['london'] }],
  [/^(asia|asian|overnight|tokyo)$/, { any: ['asia'] }],
  [/^(ny|newyork|new york|us)$/, { any: ['ny '] }],
  [/^(long|longs|buy|up|bull|bullish|rally)$/, { any: [' long'] }],
  [/^(short|shorts|sell|down|bear|bearish|drop)$/, { any: [' short'] }],
  [/^(sweep|sweeps|swept|stop-run|stoprun|raid)$/, { any: ['sweep'] }],
  [/^(break|breaks|breakout|breakouts)$/, { any: [' break'] }],
  [/^(gap|gaps)$/, { any: ['gap'] }],
  [/^(fvg|fvgs|imbalance)$/, { any: ['fvg'] }],
  [/^(ifvg|inverted)$/, { any: ['ifvg'] }],
  [/^(cisd|delivery)$/, { any: ['cisd'] }],
  [/^(displacement|disp|impulse)$/, { any: ['displacement'] }],
  [/^(wild|volatile|violent)$/, { any: ['wild'] }],
  [/^(calm|quiet|slow)$/, { any: ['quiet'] }],
  [/^(news|event|events|fomc|cpi)$/, { any: ['news', 'big-news'] }],
  [/^(rising|improving|hot)$/, { pred: (b) => b.tr === 'rising' }],
  [/^(decaying|fading|cooling)$/, { pred: (b) => b.tr === 'decaying' }],
  [/^(gold|golden|best)$/, { pred: (b) => b.cls === 'gold' }],
  [/^(green|solid)$/, { pred: (b) => b.cls === 'green' || b.cls === 'gold' }],
  [/^(noise|grey|gray|junk)$/, { pred: (b) => b.cls === 'grey' }],
  [/^(fdr|survivor|survivors|survives|proven)$/, { pred: (b) => !!b.fdr }],
  [/^(holds|stable|both)$/, { pred: (b) => holdOf(b) === 'both' }],
  [/^(today|fired|live)$/, { pred: (b) => (b.td || 0) >= 2 }],
  [/^(armed)$/, { pred: (b) => (b.td || 0) >= 1 }],
  [/^(winner|winners|profit|profitable|money)$/, { pred: (b) => (b.e || 0) > 0 }],
  [/^(loser|losers|losing)$/, { pred: (b) => (b.e || 0) < 0 }],
];

/** 'NY afternoon long' -> { words, test(label, b) }: every word must match (a synonym or the plain text) */
export function parseQuery(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9$<>=+\-\s]/g, ' ').split(/\s+/).filter(Boolean);
  const terms = words.map((w) => {
    const syn = SYN.find(([re]) => re.test(w));
    return { w, any: syn?.[1].any || null, pred: syn?.[1].pred || null };
  });
  return {
    words, terms, empty: !words.length,
    test(label, b) {
      const s = ' ' + label.toLowerCase() + ' ' + String(b.id || '').toLowerCase();
      return terms.every((t) => {
        if (t.pred) return !!t.pred(b);                                 // a word about the result (rising, gold, fdr ...) asks the numbers, not the label
        if (t.any && t.any.some((p) => s.includes(p))) return true;
        return s.includes(t.w);
      });
    },
  };
}

/** filters of the Find view: { family, hold: 'any' | 'both' | 'gold', minE: $/trade, minTpw: trades a week } -> predicate on an idea */
export function filterTest(f, D) {
  if (!f) return () => true;
  return (b) => {
    if (f.family && f.family !== 'all' && familyOf(b, D) !== f.family) return false;
    if (f.hold === 'gold' && b.cls !== 'gold') return false;
    if (f.hold === 'both' && holdOf(b) !== 'both') return false;
    if (f.minE > 0 && (b.e ?? -1e9) < f.minE) return false;
    if (f.minTpw > 0 && (b.tpw ?? 0) < f.minTpw) return false;
    return true;
  };
}

// ------------------------------------------------------------------------------------------------ the Council of ideas
/** Each idea family votes with what its buildings did: BACKS (survivors of the noise guard), LEANS (holds in both periods but no
 *  survivor), SILENT (little tested), NOISE (nothing holds). Returns { rows, text, backs, total } */
export function council(model) {
  const D = model.D, rows = IDEA_FAMILIES.map((f) => ({ ...f, n: 0, both: 0, gold: 0, fdr: 0, best: null }));
  const by = new Map(rows.map((r) => [r.key, r]));
  for (const b of model.buildings) {
    if (b.plugin || b.synthetic) continue;
    const r = by.get(familyOf(b, D));
    if (!r) continue;
    r.n++;
    if (holdOf(b) === 'both') r.both++;
    if (b.cls === 'gold') r.gold++;
    if (b.fdr) r.fdr++;
    if (!r.best || (b.e || -1e9) > (r.best.e || -1e9)) if (holdOf(b) === 'both') r.best = b;
  }
  for (const r of rows) {
    r.share = r.n ? r.both / r.n : 0;
    r.vote = r.n < 20 ? 'SILENT' : r.gold > 0 || r.fdr >= 3 ? 'BACKS' : r.share >= 0.08 ? 'LEANS' : 'NOISE';
  }
  rows.sort((a, c) => ({ BACKS: 0, LEANS: 1, NOISE: 2, SILENT: 3 }[a.vote] - { BACKS: 0, LEANS: 1, NOISE: 2, SILENT: 3 }[c.vote]) || c.gold - a.gold || c.fdr - a.fdr);
  const backs = rows.filter((r) => r.vote === 'BACKS'), leans = rows.filter((r) => r.vote === 'LEANS');
  const g = model.guard || {}, ho = g.holdout || {};
  const text = backs.length
    ? `The council: ${backs.length} of ${rows.length} idea families back at least one idea (${backs.map((r) => r.name).slice(0, 4).join(', ')}); ${leans.length} lean; the rest are noise. ` +
      `${ho.pct_positive ?? '?'}% of the ideas picked on 2021-24 stayed positive in 2025-26, so treat every backing as a lead, not a promise.`
    : `The council finds no family it can back. ${leans.length} lean, the rest are noise.`;
  return { rows, text, backs: backs.length, total: rows.length };
}

// ------------------------------------------------------------------------------------------------ how the city grew
export const MIN_TRADES = 30;

/** the idea as it stood at the end of `year` (from its per-year numbers [trades, $ per trade]); null when it had no data yet */
export function standing(b, year) {
  if (!b || !b.yrs) return null;
  let n = 0, sum = 0;
  for (const [y, v] of Object.entries(b.yrs)) {
    if (+y > year) continue;
    n += v[0] || 0;
    sum += (v[0] || 0) * (v[1] || 0);
  }
  if (n < MIN_TRADES) return { n, e: 0, h: 0, up: false, tested: false };
  const e = sum / n;
  return { n, e, h: heightOf(e), up: e > 0, tested: true };
}

/** per year: how many of the ideas with year detail stood tested, how many paid; years = first..last */
export function growth(model, years) {
  const rich = model.buildings.filter((b) => b.yrs);
  return years.map((y) => {
    let tested = 0, paid = 0, gold = 0;
    for (const b of rich) {
      const s = standing(b, y);
      if (s?.tested) { tested++; if (s.up) paid++; if (b.cls === 'gold' && s.up) gold++; }
    }
    return { year: y, tested, paid, gold };
  });
}

export function yearsOf(model) {
  const a = +(model.city?.summary?.data?.first_day || '2021').slice(0, 4), z = +(model.last_day || model.city?.summary?.data?.last_day || '2026').slice(0, 4);
  const out = [];
  for (let y = a; y <= z; y++) out.push(y);
  return out.length ? out : [2026];
}
